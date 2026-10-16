/**
 * Levels 2 and 5 (LLM). These tests prove the PROTOCOL around a model, using a tiny local HTTP server that
 * speaks the backend's contract. It is a stub, not a model: it says nothing about repair quality.
 *  - no backend / no LLM provider   -> levels are skipped, deterministic behaviour is unchanged, no crash
 *  - provider configured            -> the proposal is verified on the live page, vetted by the guardrails,
 *                                      costed, and reported back so the server can verify its cache
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { BackendClient } from '../../src/healing/backend-client';
import { checkoutPage, makeAgent, serve } from './helpers';

interface Stub {
  url: string;
  calls: Array<{ path: string; body: any }>;
  close(): Promise<void>;
}

async function stubBackend(opts: { llmConfigured: boolean; proposal?: (body: any) => Record<string, unknown> | null }): Promise<Stub> {
  const calls: Stub['calls'] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      calls.push({ path: req.url || '', body });
      res.setHeader('Content-Type', 'application/json');
      if (req.url?.endsWith('/healing/capabilities')) {
        res.end(JSON.stringify({ llm_configured: opts.llmConfigured, providers: opts.llmConfigured ? ['stub'] : [] }));
      } else if (req.url?.endsWith('/healing/heal')) {
        res.end(JSON.stringify(opts.proposal?.(body) ?? { status: 'no_match', steps: [], reasoning: 'nothing', confidence: 0, healed_selector: null, selector_type: null, strategy_level: null, is_cached: false, cached_id: null, guardrail: null, llm_provider: null, tokens_estimate: 0, cost_usd_estimate: 0 }));
      } else {
        res.end('{}');
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, calls, close: () => new Promise((r) => server.close(() => r())) };
}

// Answers only LLM-level requests (levels [2] / [5]); the runner's cache-only probe (levels []) gets no_match.
const proposal = (selector: string, extra: Record<string, unknown> = {}) => (body: any) => (body?.levels?.length === 0 ? null : {
  status: 'healed', healed_selector: selector, selector_type: 'css', confidence: 0.93, strategy_level: 2,
  reasoning: 'stub model chose this element', is_cached: false, cached_id: 'cache-1', steps: [], guardrail: null,
  llm_provider: 'stub', tokens_estimate: 3000, cost_usd_estimate: 0.0012, ...extra,
});

// A page where nothing deterministic can help: no fingerprint, no hint, no alternates.
const page5 = checkoutPage({ id: 'k7', testid: 'btn-7f', cls: 'zz9', label: 'Complete purchase' });

test.describe('Levels 2 & 5 - LLM tiers', () => {
  test('without a backend they are skipped, with a reason, and nothing crashes', async ({ page }) => {
    await serve(page, page5);
    const { aq } = makeAgent(page, { backend: null });
    await expect(aq.click('#place-order')).rejects.toThrow(/refused to heal/);
    const steps = aq.blockedRecords[0].steps;
    for (const level of [2, 5]) {
      expect(steps.find((s) => s.level === level)).toMatchObject({ status: 'skipped', reason: expect.stringContaining('no backend configured') });
    }
  });

  test('a backend with no LLM provider reports the levels skipped (never simulated)', async ({ page }) => {
    const stub = await stubBackend({ llmConfigured: false });
    try {
      await serve(page, page5);
      const { aq } = makeAgent(page, { backend: new BackendClient({ backendUrl: stub.url, apiKey: 'k' }) });
      await expect(aq.click('#place-order')).rejects.toThrow(/refused to heal/);
      expect(aq.blockedRecords[0].steps.filter((s) => s.level === 2 || s.level === 5).every((s) => s.status === 'skipped' && /no LLM provider/.test(s.reason))).toBe(true);
      // the only server call is the cache-only probe (levels []): no model was asked
      const heals = stub.calls.filter((c) => c.path.endsWith('/healing/heal'));
      expect(heals.every((c) => Array.isArray(c.body.levels) && c.body.levels.length === 0)).toBe(true);
    } finally {
      await stub.close();
    }
  });

  test('with a provider, Level 2 proposes; the runner verifies it live, costs it and reports validation', async ({ page }) => {
    const stub = await stubBackend({ llmConfigured: true, proposal: proposal('[data-testid="btn-7f"]') });
    try {
      await serve(page, page5);
      const { aq } = makeAgent(page, { backend: new BackendClient({ backendUrl: stub.url, apiKey: 'k' }) });
      await aq.click('#place-order', { hint: { tagName: 'span', textPreview: '' } });
      await expect(page.locator('#out')).toHaveText('Order confirmed');
      aq.noteAssertion();
      await aq.finalize();

      expect(aq.heals[0]).toMatchObject({ level: 2, healed: '[data-testid="btn-7f"]', verdict: 'validated' });
      expect(aq.heals[0].llmCostUsd).toBeGreaterThan(0);
      const report = stub.calls.find((c) => c.path.includes('/cache/cache-1/accept'));
      expect(report?.body).toEqual({ is_accepted: true }); // server may now cache the repair
    } finally {
      await stub.close();
    }
  });

  test('the runner re-applies the guardrails even if the server proposes Cancel', async ({ page }) => {
    const stub = await stubBackend({ llmConfigured: true, proposal: proposal('[data-testid="cancel"]') });
    try {
      await serve(page, page5);
      const { aq } = makeAgent(page, { backend: new BackendClient({ backendUrl: stub.url, apiKey: 'k' }) });
      await expect(aq.click('#place-order', { hint: { textPreview: 'Place order' } })).rejects.toThrow(/intent_conflict/);
      await expect(page.locator('#out')).toBeHidden();
      expect(aq.heals).toHaveLength(0);
    } finally {
      await stub.close();
    }
  });

  test('an unreachable backend degrades to skipped levels, not an exception', async ({ page }) => {
    await serve(page, page5);
    const { aq } = makeAgent(page, { backend: new BackendClient({ backendUrl: 'http://127.0.0.1:1', apiKey: 'k', timeoutMs: 500 }) });
    await expect(aq.click('#place-order')).rejects.toThrow(/refused to heal/);
    expect(aq.blockedRecords[0].steps.find((s) => s.level === 2)).toMatchObject({ status: 'skipped', reason: 'backend unreachable' });
  });
});
