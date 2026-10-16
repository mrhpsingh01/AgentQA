/**
 * Optional client for the AgentQA backend: the verified selector cache and the LLM levels (2 and 5).
 * Everything here is best-effort. If the backend is unreachable or has no LLM provider, the ladder simply
 * reports those levels as skipped; the deterministic levels never depend on it.
 */

export interface BackendOptions {
  backendUrl?: string;
  apiKey?: string;
  projectId?: string;
  timeoutMs?: number;
}

export interface BackendHealResponse {
  status: 'healed' | 'skipped' | 'blocked' | 'no_match';
  healed_selector: string | null;
  selector_type: string | null;
  confidence: number;
  strategy_level: number | null;
  reasoning: string;
  is_cached: boolean;
  cached_id: string | null;
  steps: Array<{ level: number; name: string; status: string; reason: string }>;
  guardrail: { allowed: boolean; code: string; reason: string } | null;
  llm_provider: string | null;
  tokens_estimate: number;
  cost_usd_estimate: number;
}

export class BackendClient {
  private caps: { llmConfigured: boolean; providers: string[] } | null | undefined;

  constructor(private readonly opts: BackendOptions) {}

  /** A client only exists when a backend URL *and* credentials were provided. */
  static fromEnv(overrides: BackendOptions = {}): BackendClient | null {
    if ((process.env.AGENTQA_LLM || 'auto').toLowerCase() === 'off') return null;
    const backendUrl = (overrides.backendUrl || process.env.AGENTQA_BACKEND_URL || '').replace(/\/$/, '');
    const apiKey = overrides.apiKey || process.env.AGENTQA_API_KEY || '';
    if (!backendUrl || !apiKey) return null;
    return new BackendClient({ ...overrides, backendUrl, apiKey, projectId: overrides.projectId || process.env.AGENTQA_PROJECT_ID });
  }

  private headers() {
    return { 'Content-Type': 'application/json', 'X-API-Key': this.opts.apiKey || '' };
  }

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${this.opts.backendUrl}/api/v1${path}`, {
      ...init,
      headers: this.headers(),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? (Number(process.env.AGENTQA_BACKEND_TIMEOUT_MS) || 30000)),
    });
    if (!res.ok) throw new Error(`backend ${path} -> HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  /** null when the backend cannot be reached. */
  async capabilities(): Promise<{ llmConfigured: boolean; providers: string[] } | null> {
    if (this.caps !== undefined) return this.caps;
    try {
      const c = await this.call<{ llm_configured: boolean; providers: string[] }>('/healing/capabilities', { method: 'GET' });
      this.caps = { llmConfigured: c.llm_configured, providers: c.providers };
    } catch {
      this.caps = null;
    }
    return this.caps;
  }

  async heal(body: Record<string, unknown>): Promise<BackendHealResponse> {
    return this.call<BackendHealResponse>('/healing/heal', {
      method: 'POST',
      body: JSON.stringify({ project_id: this.opts.projectId, ...body }),
    });
  }

  /** Tell the server whether the test's own assertions passed with a repair (verifies / discards the cache entry). */
  async report(cacheId: string, accepted: boolean): Promise<void> {
    try {
      await this.call(`/healing/cache/${cacheId}/accept`, { method: 'POST', body: JSON.stringify({ is_accepted: accepted }) });
    } catch {
      /* best effort */
    }
  }
}
