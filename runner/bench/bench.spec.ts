/**
 * Runs the mutation benchmark in ONE mode (AGENTQA_BENCH_MODE), writing structured results to
 * AGENTQA_BENCH_OUT. Driven by scripts/run_benchmark.py; can also be run directly:
 *
 *   AGENTQA_BENCH_MODE=deterministic AGENTQA_BENCH_OUT=out.json npx playwright test -c bench/playwright.config.ts
 *
 * Modes:
 *   standard       plain Playwright semantics (same API, no healing) - the baseline
 *   deterministic  AgentQA Levels 1, 3, 4 only: offline, $0
 *   strict         deterministic + Level 4 requires lexical evidence (fewer wrong-element attempts, lower recall)
 *   full           deterministic + LLM Levels 2 and 5 through the AgentQA backend (needs a configured provider)
 *
 * For every scenario: (1) RECORD  run the steps on the original page so fingerprints are remembered;
 *                     (2) RUN     serve the mutated page and run the same steps with the original selectors;
 *                     (3) VERIFY  the test's own business-outcome assertions decide pass / fail.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect as baseExpect, test } from '@playwright/test';
import { BackendClient } from '../src/healing/backend-client';
import { AgentQA, configFromEnv } from '../src/healing/session';
import { render } from './pages';
import { buildScenarios, selectorFor, Scenario } from './scenarios';

const MODE = (process.env.AGENTQA_BENCH_MODE || 'deterministic') as 'standard' | 'deterministic' | 'strict' | 'full';
const OUT = process.env.AGENTQA_BENCH_OUT || path.join('..', 'artifacts', 'bench', `${MODE}.json`);
const ORIGIN = 'http://bench.agentqa.test';

export interface ScenarioResult {
  id: string;
  pattern: string;
  category: string;
  kind: 'positive' | 'negative';
  description: string;
  mode: string;
  /** final result of the test: pass (no heal), healed (valid heal), fail */
  outcome: 'pass' | 'healed' | 'fail';
  passed: boolean;
  failure?: string;
  healsApplied: number;
  healsValidated: number;
  healsRejected: number;
  healsUnverified: number;
  refusals: number;
  /** levels of the validated heals */
  levels: number[];
  ladderMs: number[];
  llmCostUsd: number;
  durationMs: number;
  /** a replacement was applied to the scenario's PRIMARY control although the right element no longer exists */
  wrongElementAttempt: boolean;
  /** selector the primary control was healed to (if any) */
  primaryHealedTo: string | null;
  selectors: string[];
  healed: Array<{ original: string; healed: string; level: number; confidence: number; verdict: string }>;
  refused: Array<{ original: string; code: string; reason: string }>;
}

const results: ScenarioResult[] = [];
let skipped: string | null = null;

async function load(page: import('@playwright/test').Page, html: string, route: string) {
  await page.route(`${ORIGIN}${route}`, (r) => r.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(`${ORIGIN}${route}`);
}

async function runSteps(aq: AgentQA, page: import('@playwright/test').Page, sc: Scenario, selectors: string[]) {
  for (const [i, step] of sc.steps.entries()) {
    if (step.action === 'fill') await aq.fill(selectors[i], step.value ?? '');
    else await aq.click(selectors[i]);
  }
}

test.describe.configure({ mode: 'serial' });

const scenarios = buildScenarios();

test.beforeAll(async () => {
  if (MODE === 'full') {
    const backend = BackendClient.fromEnv();
    const caps = backend ? await backend.capabilities() : null;
    if (!backend || !caps?.llmConfigured) {
      skipped = backend ? (caps ? 'backend has no LLM provider configured' : 'backend unreachable') : 'AGENTQA_BACKEND_URL / AGENTQA_API_KEY not set';
    }
  }
});

for (const sc of scenarios) {
  test(`${MODE} :: ${sc.id} (${sc.kind})`, async ({ page }) => {
    test.skip(!!skipped, skipped ?? '');
    const started = Date.now();
    const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentqa-bench-'));
    const route = `/${sc.pattern}`;
    const cfgBase = { storeDir, actionTimeoutMs: 400, ladder: { retryMs: 800, minConfidence: 0.7 } };

    // 1. RECORD on the original page (fingerprints only; a standard run needs the selectors, not the memory)
    await load(page, render(sc.pattern, sc.before), route);
    const selectors: string[] = [];
    for (const step of sc.steps) selectors.push(await selectorFor(page, sc, step.key));
    const recorder = new AgentQA(page, { title: sc.id, file: 'bench', errors: [], annotations: [] }, configFromEnv({ ...cfgBase, healing: false, record: true, backend: null }));
    await runSteps(recorder, page, sc, selectors);

    // 2. RUN against the mutated page with the ORIGINAL selectors
    await load(page, render(sc.pattern, sc.after), route);
    const info = { title: sc.id, file: 'bench', errors: [] as unknown[], annotations: [] as Array<{ type: string; description?: string }> };
    const aq = new AgentQA(page, info, configFromEnv({
      ...cfgBase,
      healing: MODE !== 'standard',
      record: MODE !== 'standard',
      ladder: { ...cfgBase.ladder, strict: MODE === 'strict' },
      backend: MODE === 'full' ? BackendClient.fromEnv() : null,
    }));

    let failure: string | undefined;
    try {
      await runSteps(aq, page, sc, selectors);
      // 3. VERIFY: the test's own assertions, counted so an unverified heal cannot pass
      const check = async (assertion: Promise<unknown>) => {
        aq.noteAssertion();
        await assertion;
      };
      await sc.verify(page, check, baseExpect);
    } catch (e: any) {
      failure = String(e.message).split('\n')[0].slice(0, 220);
      info.errors.push(e);
    }
    try {
      await aq.finalize();
    } catch (e: any) {
      failure = failure ?? String(e.message).split('\n')[0].slice(0, 220);
    }

    const primarySelector = selectors[sc.steps.findIndex((st) => st.key === sc.primary)];
    const primaryHeal = aq.heals.find((h) => h.original === primarySelector);
    const validated = aq.heals.filter((h) => h.verdict === 'validated');
    const passed = !failure;
    results.push({
      id: sc.id, pattern: sc.pattern, category: sc.category, kind: sc.kind, description: sc.description, mode: MODE,
      outcome: !passed ? 'fail' : validated.length ? 'healed' : 'pass',
      passed,
      failure,
      healsApplied: aq.heals.length,
      healsValidated: validated.length,
      healsRejected: aq.heals.filter((h) => h.verdict === 'rejected').length,
      healsUnverified: aq.heals.filter((h) => h.verdict === 'unverified').length,
      refusals: aq.blockedRecords.length,
      levels: validated.map((h) => h.level),
      ladderMs: aq.heals.map((h) => h.elapsedMs),
      llmCostUsd: aq.heals.reduce((n, h) => n + h.llmCostUsd, 0),
      durationMs: Date.now() - started,
      wrongElementAttempt: sc.kind === 'negative' && (sc.category === 'negative-removed' || sc.category === 'negative-decoy') && !!primaryHeal,
      primaryHealedTo: primaryHeal?.healed ?? null,
      selectors,
      healed: aq.heals.map((h) => ({ original: h.original, healed: h.healed, level: h.level, confidence: Math.round(h.confidence * 100) / 100, verdict: h.verdict })),
      refused: aq.blockedRecords.map((b) => ({ original: b.original, code: b.blocked.code, reason: b.blocked.reason })),
    });
  });
}

test.afterAll(async () => {
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  fs.writeFileSync(path.resolve(OUT), JSON.stringify({ mode: MODE, skipped, generatedAt: new Date().toISOString(), results }, null, 2));
});
