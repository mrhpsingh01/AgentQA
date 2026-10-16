/**
 * AgentQA test session: actions with healing, and the rule that makes healing trustworthy:
 *
 *   A repair only counts if the test's OWN assertions pass afterwards.
 *
 * A selector replacement that lets a click succeed is just a *proposal*. When the test finishes:
 *   - assertions failed after the heal  -> verdict "rejected": the test stays FAILED (a real bug, or a wrong repair)
 *   - no assertion ran after the heal   -> verdict "unverified": the test is FAILED (nothing proved the repair)
 *   - assertions ran and passed         -> verdict "validated": the test is reported as healed
 */

import path from 'node:path';
import type { Page } from '@playwright/test';
import { BackendClient } from './backend-client';
import { captureFingerprint, FingerprintStore } from './fingerprint';
import { DEFAULTS, LadderOptions, runLadder } from './ladder';
import { ActionKind, BlockedRecord, ElementFingerprint, ElementHint, HealRecord, LEVEL_NAMES } from './types';

export interface TestInfoLike {
  title: string;
  file: string;
  errors: unknown[];
  annotations: Array<{ type: string; description?: string }>;
}

export interface AgentQAConfig {
  /** false = behave like plain Playwright (used as the benchmark baseline) */
  healing: boolean;
  /** remember fingerprints of elements whose selectors work */
  record: boolean;
  storeDir: string;
  actionTimeoutMs: number;
  ladder: LadderOptions;
  backend: BackendClient | null;
}

export function configFromEnv(overrides: Partial<AgentQAConfig> = {}): AgentQAConfig {
  const env = process.env;
  return {
    healing: (env.AGENTQA_HEALING || 'on').toLowerCase() !== 'off',
    record: env.AGENTQA_RECORD !== '0',
    storeDir: env.AGENTQA_STORE_DIR || '.agentqa',
    actionTimeoutMs: Number(env.AGENTQA_ACTION_TIMEOUT || 2000),
    ladder: { retryMs: Number(env.AGENTQA_RETRY_MS || DEFAULTS.retryMs), minConfidence: Number(env.AGENTQA_MIN_CONFIDENCE || DEFAULTS.minConfidence), strict: env.AGENTQA_STRICT === '1' },
    backend: BackendClient.fromEnv(),
    ...overrides,
  };
}

export class AgentQAHealError extends Error {
  constructor(message: string, readonly record: BlockedRecord) {
    super(message);
    this.name = 'AgentQAHealError';
  }
}

export interface ActOptions {
  hint?: ElementHint;
  /** extra alternate selectors the author knows about */
  fallbacks?: string[];
}

/** A path relative to the runner's working directory with forward slashes, so reports are portable. */
function portable(file: string): string {
  const rel = path.isAbsolute(file) ? path.relative(process.cwd(), file) : file;
  return rel.split(path.sep).join('/');
}

function callerLocation(): { file: string; line: number | null } {
  const lines = (new Error().stack || '').split('\n').slice(1);
  for (const l of lines) {
    const m = l.match(/\(?((?:[A-Za-z]:)?[^():]+):(\d+):\d+\)?$/);
    if (m && !/[\\/](healing|fixtures|session)[\\/.]/.test(m[1]) && !m[1].includes('node_modules') && !m[1].includes('ladder')) {
      return { file: portable(m[1]), line: Number(m[2]) };
    }
  }
  return { file: '', line: null };
}

export class AgentQA {
  readonly heals: Array<HealRecord & { assertionsAtHeal: number; cacheId?: string; newFingerprint?: ElementFingerprint | null }> = [];
  readonly blockedRecords: BlockedRecord[] = [];
  private assertions = 0;
  private readonly store: FingerprintStore;

  constructor(
    readonly page: Page,
    private readonly testInfo: TestInfoLike,
    readonly config: AgentQAConfig = configFromEnv(),
  ) {
    this.store = FingerprintStore.forDir(config.storeDir);
  }

  noteAssertion() {
    this.assertions++;
  }

  // ------------------------------------------------------------------------------------------- actions
  click(selector: string, o: ActOptions = {}) { return this.act(selector, 'click', o, (l) => l.click({ timeout: this.config.actionTimeoutMs })); }
  fill(selector: string, value: string, o: ActOptions = {}) { return this.act(selector, 'fill', o, (l) => l.fill(value, { timeout: this.config.actionTimeoutMs })); }
  check(selector: string, o: ActOptions = {}) { return this.act(selector, 'check', o, (l) => l.check({ timeout: this.config.actionTimeoutMs })); }
  selectOption(selector: string, value: string, o: ActOptions = {}) { return this.act(selector, 'select', o, (l) => l.selectOption(value, { timeout: this.config.actionTimeoutMs })); }
  press(selector: string, key: string, o: ActOptions = {}) { return this.act(selector, 'press', o, (l) => l.press(key, { timeout: this.config.actionTimeoutMs })); }
  hover(selector: string, o: ActOptions = {}) { return this.act(selector, 'hover', o, (l) => l.hover({ timeout: this.config.actionTimeoutMs })); }

  private async act(
    selector: string,
    action: ActionKind,
    opts: ActOptions,
    perform: (locator: ReturnType<Page['locator']>) => Promise<unknown>,
  ): Promise<void> {
    const { page, config } = this;
    const where = callerLocation();
    const url = page.url();

    // --- the normal path: the author's selector works ------------------------------------------------
    let resolveError: Error | null = null;
    const locator = page.locator(selector);
    try {
      await locator.waitFor({ state: 'visible', timeout: config.actionTimeoutMs });
    } catch (e: any) {
      resolveError = e;
    }
    if (!resolveError) {
      if (config.record) {
        const fp = await captureFingerprint(locator, page);
        if (fp) this.store.put(url, selector, fp);
      }
      await perform(locator);
      return;
    }
    if (!config.healing) throw resolveError;

    // --- the selector no longer resolves: climb the ladder -------------------------------------------
    const ladder = await runLadder(
      page,
      selector,
      action,
      { url, fingerprint: this.store.get(url, selector), hint: opts.hint, fallbacks: opts.fallbacks, errorMessage: resolveError.message.split('\n')[0] },
      { ...config.ladder, backend: config.backend },
    );

    if (!ladder.selected) {
      const record: BlockedRecord = {
        testTitle: this.testInfo.title, file: where.file || portable(this.testInfo.file), line: where.line, url, original: selector, action,
        blocked: ladder.blocked!, steps: ladder.steps, elapsedMs: ladder.elapsedMs, timestamp: Date.now(),
      };
      this.blockedRecords.push(record);
      const trail = ladder.steps.map((s) => `L${s.level} ${s.status}: ${s.reason}`).join('\n  ');
      throw new AgentQAHealError(
        `AgentQA refused to heal '${selector}' (${ladder.blocked!.code}): ${ladder.blocked!.reason}\n  ${trail}\n` +
          `Original error: ${resolveError.message.split('\n')[0]}`,
        record,
      );
    }

    const chosen = ladder.selected;
    const healedLocator = page.locator(chosen.selector);
    const newFingerprint = config.record ? await captureFingerprint(healedLocator, page) : null;
    await perform(healedLocator);

    this.heals.push({
      testTitle: this.testInfo.title, file: where.file || portable(this.testInfo.file), line: where.line, url, original: selector,
      healed: chosen.selector, action, level: chosen.level, levelName: LEVEL_NAMES[chosen.level], confidence: chosen.confidence,
      reasoning: chosen.reasoning, steps: ladder.steps, domBytesRaw: ladder.domBytesRaw, domBytesCompressed: ladder.domBytesCompressed,
      elapsedMs: ladder.elapsedMs, llmCostUsd: ladder.llmCostUsd, verdict: 'pending', verdictReason: 'waiting for the test assertions',
      assertionsAfter: 0, evidence: chosen.evidence, timestamp: Date.now(),
      assertionsAtHeal: this.assertions, cacheId: chosen.cacheId, newFingerprint,
    });
    console.log(
      `[AgentQA] healed '${selector}' -> '${chosen.selector}' (L${chosen.level} ${LEVEL_NAMES[chosen.level]}, ${Math.round(chosen.confidence * 100)}%) - pending assertion check`,
    );
  }

  // ------------------------------------------------------------------------------------------- verdicts
  /**
   * Decide every heal's verdict from the test outcome and publish the records as annotations.
   * Throws when a heal was applied but nothing verified it, so the test cannot pass on an unproven repair.
   */
  async finalize(): Promise<void> {
    const testFailed = this.testInfo.errors.length > 0;
    let unverified = 0;

    for (const h of this.heals) {
      h.assertionsAfter = this.assertions - h.assertionsAtHeal;
      if (testFailed) {
        h.verdict = 'rejected';
        h.verdictReason = 'the test failed after this repair: the original assertions did not confirm it';
      } else if (h.assertionsAfter === 0) {
        h.verdict = 'unverified';
        h.verdictReason = 'no assertion ran after this repair, so nothing proves it chose the right element';
        unverified++;
      } else {
        h.verdict = 'validated';
        h.verdictReason = `${h.assertionsAfter} assertion(s) passed after the repair`;
        if (h.newFingerprint) this.store.put(h.url, h.original, h.newFingerprint);
      }
      if (h.cacheId && this.config.backend) await this.config.backend.report(h.cacheId, h.verdict === 'validated');
    }

    for (const h of this.heals) {
      const { assertionsAtHeal, cacheId, newFingerprint, ...publishable } = h;
      void assertionsAtHeal; void cacheId; void newFingerprint;
      this.testInfo.annotations.push({ type: 'agentqa-heal', description: JSON.stringify(publishable) });
    }
    for (const b of this.blockedRecords) {
      this.testInfo.annotations.push({ type: 'agentqa-blocked', description: JSON.stringify(b) });
    }

    if (unverified > 0) {
      throw new Error(
        `AgentQA: ${unverified} healed step(s) were not verified by any assertion. ` +
          `A repair only counts when the test's own assertions (import { expect } from AgentQA's fixtures) run after it.`,
      );
    }
  }
}
