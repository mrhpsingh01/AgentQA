/**
 * AgentQA Playwright Reporter
 *
 * Writes `agentqa-report.json` (path: AGENTQA_REPORT) with, per test: outcome, every applied heal with its
 * ladder trace and verdict, every refused heal, and a summary. A test is reported as:
 *   passed  - passed with no heal
 *   healed  - passed AND every heal in it was validated by assertions
 *   failed  - anything else (including a heal that was applied but not proven)
 * Optionally publishes validated results to the AgentQA backend (AGENTQA_RUN_ID + AGENTQA_BACKEND_URL).
 */

import fs from 'node:fs';
import path from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import type { BlockedRecord, HealRecord } from '../healing/types';

export interface ReportStep {
  title: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}

export interface ReportTest {
  title: string;
  file: string;
  status: 'passed' | 'healed' | 'failed' | 'skipped';
  durationMs: number;
  errors: string[];
  heals: HealRecord[];
  blocked: BlockedRecord[];
  /** named `test.step`s, e.g. the assertions that verify a heal */
  steps: ReportStep[];
  tags: string[];
}

export interface AgentQAReport {
  generatedAt: string;
  tests: ReportTest[];
  summary: {
    total: number;
    passed: number;
    healed: number;
    failed: number;
    healsValidated: number;
    healsRejected: number;
    healsUnverified: number;
    healsBlocked: number;
  };
}

const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');
const stripAnsi = (text: string) => text.replace(ANSI, '');

function flattenSteps(steps: TestStep[], out: ReportStep[] = []): ReportStep[] {
  for (const st of steps) {
    if (st.category === 'test.step') {
      const firstLine = stripAnsi(st.error?.message ?? '').split(String.fromCharCode(10))[0] || undefined;
      out.push({ title: st.title, ok: !st.error, durationMs: st.duration, error: firstLine });
    }
    flattenSteps(st.steps, out);
  }
  return out;
}

function parseAll<T>(test: TestCase, type: string): T[] {
  const out: T[] = [];
  for (const a of test.annotations) {
    if (a.type === type && a.description) {
      try {
        out.push(JSON.parse(a.description));
      } catch {
        /* ignore malformed annotation */
      }
    }
  }
  return out;
}

export default class AgentQAReporter implements Reporter {
  private started = Date.now();
  private tests: ReportTest[] = [];

  onBegin(_config: FullConfig, suite: Suite): void {
    this.started = Date.now();
    console.log(`[AgentQA] ${suite.allTests().length} test(s)`);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const heals = parseAll<HealRecord>(test, 'agentqa-heal');
    const blocked = parseAll<BlockedRecord>(test, 'agentqa-blocked');
    let status: ReportTest['status'];
    if (result.status === 'skipped') status = 'skipped';
    else if (test.expectedStatus === 'failed' && result.status === 'failed') status = 'passed'; // test.fail(): the failure was the point
    else if (result.status !== 'passed') status = 'failed';
    else if (heals.length > 0 && heals.every((h) => h.verdict === 'validated')) status = 'healed';
    else if (heals.length > 0) status = 'failed';
    else status = 'passed';

    this.tests.push({
      title: test.title,
      file: path.relative(process.cwd(), test.location.file),
      status,
      durationMs: result.duration,
      errors: result.errors.map((e) => (e.message || '').replace(/\u001b\[[0-9;]*m/g, '')),
      heals,
      blocked,
      steps: flattenSteps(result.steps),
      tags: test.tags ?? [],
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    const heals = this.tests.flatMap((t) => t.heals);
    const report: AgentQAReport = {
      generatedAt: new Date().toISOString(),
      tests: this.tests,
      summary: {
        total: this.tests.length,
        passed: this.tests.filter((t) => t.status === 'passed').length,
        healed: this.tests.filter((t) => t.status === 'healed').length,
        failed: this.tests.filter((t) => t.status === 'failed').length,
        healsValidated: heals.filter((h) => h.verdict === 'validated').length,
        healsRejected: heals.filter((h) => h.verdict === 'rejected').length,
        healsUnverified: heals.filter((h) => h.verdict === 'unverified').length,
        healsBlocked: this.tests.reduce((n, t) => n + t.blocked.length, 0),
      },
    };

    const out = process.env.AGENTQA_REPORT || 'agentqa-report.json';
    try {
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      fs.writeFileSync(out, JSON.stringify(report, null, 2));
    } catch (e: any) {
      console.error(`[AgentQA] could not write ${out}: ${e.message}`);
    }

    const s = report.summary;
    console.log(
      `\n[AgentQA] ${s.passed} passed, ${s.healed} healed, ${s.failed} failed | ` +
        `heals: ${s.healsValidated} validated, ${s.healsRejected} rejected, ${s.healsUnverified} unverified, ${s.healsBlocked} refused | ` +
        `${Date.now() - this.started}ms (${result.status})`,
    );

    await this.publish(report);
  }

  /** Best-effort upload of validated results to the AgentQA backend. */
  private async publish(report: AgentQAReport): Promise<void> {
    const runId = process.env.AGENTQA_RUN_ID;
    const backend = (process.env.AGENTQA_BACKEND_URL || '').replace(/\/$/, '');
    if (!runId || !backend) return;
    const validated = report.tests.flatMap((t) => t.heals).filter((h) => h.verdict === 'validated');
    try {
      await fetch(`${backend}/api/v1/runs/${runId}/results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(process.env.AGENTQA_API_KEY ? { 'X-API-Key': process.env.AGENTQA_API_KEY } : {}) },
        body: JSON.stringify({
          status: report.summary.failed > 0 ? 'failed' : report.summary.healed > 0 ? 'healed' : 'passed',
          duration_ms: report.tests.reduce((n, t) => n + t.durationMs, 0),
          results: { total_tests: report.summary.total, passed: report.summary.passed + report.summary.healed, failed: report.summary.failed, tests: report.tests.map((t) => ({ title: t.title, status: t.status, duration: t.durationMs, errors: t.errors })) },
          healing_events: validated.map((h) => ({ originalSelector: h.original, healedSelector: h.healed, strategyLevel: h.level, confidence: h.confidence, reasoning: h.reasoning, url: h.url, timestamp: h.timestamp })),
          screenshots: [],
          error_message: report.tests.find((t) => t.errors.length)?.errors[0] ?? null,
        }),
      });
    } catch (e: any) {
      console.error(`[AgentQA] could not report run ${runId}: ${e.message}`);
    }
  }

  printsToStdio(): boolean {
    return false;
  }
}
