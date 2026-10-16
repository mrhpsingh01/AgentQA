/**
 * AgentQA API Client
 *
 * Two data sources, never a made-up third one:
 *   - live:  the FastAPI backend (NEXT_PUBLIC_BACKEND_URL). If it is unreachable the call REJECTS and the page shows
 *            that, instead of inventing plausible-looking numbers.
 *   - demo:  NEXT_PUBLIC_DEMO_MODE=true renders real results copied from `python demo.py` and the benchmark
 *            (lib/seed.json); no backend needed, so the site can be deployed standalone.
 */

import { DEMO_MODE, seed, STATE_ORDER } from "./demo";

export interface OverviewMetrics {
  total_runs: number;
  pass_rate_pct: number;
  total_healing_events: number;
  healing_success_rate_pct: number;
  engineer_hours_saved: number;
  active_healed_selectors_in_cache: number;
}

export interface TestRun {
  id: string;
  test_id: string;
  status: "passed" | "healed" | "failed" | "pending";
  duration_ms: number;
  results: Record<string, any>;
  healing_events: Array<{
    url: string;
    originalSelector: string;
    healedSelector: string;
    strategyLevel: number;
    confidence: number;
    reasoning: string;
    timestamp: number;
  }>;
  screenshots: any[];
  error_message?: string | null;
  created_at: string;
}

export interface HealedSelector {
  id: string;
  project_id?: string | null;
  url_pattern: string;
  original_selector: string;
  healed_selector: string;
  selector_type: string;
  confidence: number;
  llm_provider: string;
  use_count: number;
  is_verified: boolean;
  created_at: string;
  last_used_at: string;
  component_fingerprint?: string | null;
}

export interface FlakyTest {
  test_id: string;
  title: string;
  flakiness_score: number;
  recent_runs_count: number;
  pass_count: number;
  fail_count: number;
  is_quarantined: boolean;
}

export interface CoverageGapResult {
  coverage_percentage: number;
  total_routes_discovered: number;
  tested_routes_count: number;
  missing_coverage_routes: string[];
}

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL
  ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1`
  : "http://localhost:8000/api/v1";

export class BackendUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendUnavailable";
  }
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  } catch {
    throw new BackendUnavailable(`Cannot reach the AgentQA backend at ${API_BASE}.`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new BackendUnavailable("The AgentQA backend requires authentication (JWT or X-API-Key).");
  }
  if (!res.ok) throw new BackendUnavailable(`The AgentQA backend answered HTTP ${res.status}.`);
  return (await res.json()) as T;
}

const demoOnly = (what: string) => new BackendUnavailable(`${what} needs the AgentQA backend and is not part of the read-only demo.`);

// ---- demo-mode projections of the real seed --------------------------------------------------------------
function demoRuns(): TestRun[] {
  return STATE_ORDER.map((state) => {
    const s = seed.demo.states[state];
    const validated = s.test.heals.filter((h) => h.verdict === "validated");
    return {
      id: `demo_${state}`,
      test_id: `checkout.spec.ts: ${s.test.title} [${state}]`,
      status: s.status as TestRun["status"],
      duration_ms: s.test.durationMs,
      results: { browser: "chromium", state, assertions: s.test.steps.map((x) => `${x.ok ? "PASS" : "FAIL"} ${x.title}`) },
      healing_events: validated.map((h) => ({
        url: h.url, originalSelector: h.original, healedSelector: h.healed, strategyLevel: h.level,
        confidence: h.confidence, reasoning: h.reasoning, timestamp: h.timestamp,
      })),
      screenshots: [],
      error_message: s.test.errors[0]?.split("\n")[0] ?? null,
      created_at: s.executedAt ?? seed.generatedAt,
    };
  });
}

function demoHealed(): HealedSelector[] {
  const out: HealedSelector[] = [];
  const created = seed.generatedAt;
  for (const state of STATE_ORDER) {
    for (const h of seed.demo.states[state].test.heals) {
      if (h.verdict !== "validated") continue;
      out.push({
        id: `demo_${state}_${out.length}`,
        url_pattern: new URL(h.url).host + new URL(h.url).pathname,
        original_selector: h.original,
        healed_selector: h.healed,
        selector_type: h.healed.startsWith("[data-testid") ? "testid" : h.healed.startsWith("role=") ? "role" : h.healed.includes(":has-text") ? "text" : "css",
        confidence: h.confidence,
        llm_provider: `Level ${h.level}: ${h.levelName} (offline, $0)`,
        use_count: 1,
        is_verified: true,
        created_at: new Date(h.timestamp).toISOString(),
        last_used_at: new Date(h.timestamp).toISOString(),
        component_fingerprint: null,
      });
    }
  }
  return out;
}

export const api = {
  // Metrics & Reporting (live backend only)
  getOverviewMetrics: async (): Promise<OverviewMetrics> => {
    if (DEMO_MODE) throw demoOnly("Live metrics");
    return fetchJSON<OverviewMetrics>(`${API_BASE}/reporting/overview`);
  },

  getFlakyTests: async (): Promise<FlakyTest[]> => {
    if (DEMO_MODE) throw demoOnly("Flaky-test quarantine");
    return fetchJSON<FlakyTest[]>(`${API_BASE}/reporting/flaky`);
  },

  getCoverageGaps: async (discoveredRoutes: string[]): Promise<CoverageGapResult> => {
    if (DEMO_MODE) throw demoOnly("Coverage analysis");
    return fetchJSON<CoverageGapResult>(`${API_BASE}/reporting/coverage-gaps`, { method: "POST", body: JSON.stringify(discoveredRoutes) });
  },

  // Test runs
  getTestRuns: async (): Promise<TestRun[]> => {
    if (DEMO_MODE) return demoRuns();
    return fetchJSON<TestRun[]>(`${API_BASE}/runs`);
  },

  triggerTestRun: async (testId: string, options: { browser?: string; enableSelfHealing?: boolean } = {}) => {
    if (DEMO_MODE) throw demoOnly("Triggering a run");
    return fetchJSON(`${API_BASE}/runs`, {
      method: "POST",
      body: JSON.stringify({ test_id: testId, browser: options.browser || "chromium", enable_self_healing: options.enableSelfHealing ?? true }),
    });
  },

  // Self-healing cache
  getHealedSelectors: async (): Promise<HealedSelector[]> => {
    if (DEMO_MODE) return demoHealed();
    return fetchJSON<HealedSelector[]>(`${API_BASE}/healing/cache`);
  },

  acceptHealedSelector: async (id: string, isAccepted: boolean = true) => {
    if (DEMO_MODE) throw demoOnly("Accepting a selector");
    return fetchJSON(`${API_BASE}/healing/cache/${id}/accept`, { method: "POST", body: JSON.stringify({ is_accepted: isAccepted }) });
  },

  deleteHealedSelector: async (id: string) => {
    if (DEMO_MODE) throw demoOnly("Deleting a selector");
    return fetch(`${API_BASE}/healing/cache/${id}`, { method: "DELETE" });
  },

  // Parameterization
  parameterizeTest: async (baseCode: string, dataset: any[]) => {
    if (DEMO_MODE) throw demoOnly("Test parameterization");
    return fetchJSON<{ code: string }>(`${API_BASE}/reporting/parameterize`, { method: "POST", body: JSON.stringify({ base_code: baseCode, dataset }) });
  },

  /** Backend reachability, for the sidebar pill (never assumed). */
  ping: async (): Promise<boolean> => {
    if (DEMO_MODE) return true;
    try {
      const res = await fetch(`${API_BASE.replace(/\/api\/v1$/, "")}/healthz`, { signal: AbortSignal.timeout(2500) });
      return res.ok;
    } catch {
      return false;
    }
  },
};
