/**
 * Demo mode: the dashboard renders REAL results copied from `python demo.py` and `python scripts/run_benchmark.py`
 * (see scripts/export_dashboard_seed.py), so the deployed site needs no backend.
 */

import seedJson from "./seed.json";

// Demo mode (bundled real results, no backend) is on when asked for explicitly, and also by default when no backend
// URL is configured, so a plain deploy to Vercel/Netlify with zero settings shows data instead of failing to fetch.
// NEXT_PUBLIC_DEMO_MODE=false forces live mode.
export const DEMO_MODE =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
  (process.env.NEXT_PUBLIC_DEMO_MODE !== "false" && !process.env.NEXT_PUBLIC_BACKEND_URL);

export interface LadderStep {
  level: number;
  name: string;
  status: "skipped" | "miss" | "blocked" | "selected";
  reason: string;
  ms: number;
}

export interface HealRecord {
  testTitle: string;
  file: string;
  line: number | null;
  url: string;
  original: string;
  healed: string;
  action: string;
  level: number;
  levelName: string;
  confidence: number;
  reasoning: string;
  steps: LadderStep[];
  domBytesRaw: number;
  domBytesCompressed: number;
  elapsedMs: number;
  llmCostUsd: number;
  verdict: "pending" | "validated" | "rejected" | "unverified";
  verdictReason: string;
  assertionsAfter: number;
  evidence: Record<string, number | string | boolean>;
  timestamp: number;
}

export interface BlockedRecord {
  original: string;
  action: string;
  url: string;
  blocked: { code: string; reason: string; selector?: string; elementText?: string };
  steps: LadderStep[];
  elapsedMs: number;
  file: string;
  line: number | null;
}

export interface DemoTest {
  title: string;
  status: "passed" | "healed" | "failed" | "skipped";
  durationMs: number;
  errors: string[];
  heals: HealRecord[];
  blocked: BlockedRecord[];
  steps: Array<{ title: string; ok: boolean; durationMs: number; error?: string }>;
}

export interface DemoState {
  executedAt?: string;
  status: string;
  verdict: string;
  note: string;
  valid: number;
  /** the same test run with plain Playwright semantics (healing off) */
  plain?: { status: string; error: string };
  screenshot: string | null;
  dom: { rawBytes?: number; compressedBytes?: number };
  domLines: string[];
  test: DemoTest;
}

export interface ModeSummary {
  mode: string;
  skipped?: string;
  scenarios?: number;
  positives?: number;
  positives_passed?: number;
  repair_rate?: number;
  negatives?: number;
  false_passes?: number;
  false_pass_rate?: number;
  wrong_element_attempts?: number;
  wrong_element_denominator?: number;
  wrong_element_ids?: string[];
  heals_by_level?: Record<string, number>;
  scenarios_by_deepest_level?: Record<string, number>;
  heals_free_offline?: number;
  heals_llm?: number;
  validated_heals?: number;
  latency_ms_mean?: number | null;
  latency_ms_median?: number | null;
  cost_usd_total?: number;
  cost_usd_per_heal?: number;
}

export interface ScenarioResult {
  id: string;
  pattern: string;
  category: string;
  kind: "positive" | "negative";
  description: string;
  passed: boolean;
  outcome: string;
  failure?: string;
  healsValidated: number;
  healsRejected: number;
  refusals: number;
  levels: number[];
  wrongElementAttempt: boolean;
  primaryHealedTo?: string | null;
  healed: Array<{ original: string; healed: string; level: number; confidence: number; verdict: string }>;
  refused: Array<{ original: string; code: string; reason: string }>;
}

export interface Seed {
  generatedAt: string;
  provenance: string;
  demo: { expectations: Array<{ claim: string; met: boolean }>; seconds: number; states: Record<string, DemoState> };
  benchmark: {
    summaries: Record<string, ModeSummary>;
    scenarios: Record<string, ScenarioResult[]>;
  };
}

export const seed = seedJson as unknown as Seed;

export const STATE_ORDER = ["original", "refactored", "broken", "broken-removed"] as const;
export type StateName = (typeof STATE_ORDER)[number];

export const STATE_META: Record<StateName, { title: string; subtitle: string }> = {
  original: { title: "Original", subtitle: "The checkout the test was written against" },
  refactored: { title: "Refactored UI", subtitle: "Every id, class and test id renamed; labels reworded" },
  broken: { title: "Broken app", subtitle: "Refactor + a real bug: orders are silently not created" },
  "broken-removed": { title: "Broken: button removed", subtitle: "Refactor + the Place-order button was deleted" },
};
