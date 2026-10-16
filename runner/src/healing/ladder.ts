/**
 * The self-healing escalation ladder.
 *
 * Runs only after a selector failed to resolve to a single usable element. Levels are attempted
 * cheapest-first (1 -> 3 -> 4 -> 2 -> 5), so every deterministic, offline, $0 level runs before any LLM
 * call, and the LLM levels are *skipped* (not simulated) when no provider is available.
 *
 * Every candidate is proven on the live page (exactly one visible, enabled element) and vetted by the
 * intent guardrails before it can be selected. A selected candidate is still only a proposal: the test's
 * own assertions decide whether the heal counts (see session.ts).
 */

import type { Locator, Page } from '@playwright/test';
import { BackendClient } from './backend-client';
import { captureDomSnapshot } from '../dom-compressor';
import { describeLocator } from './fingerprint';
import { DomGeometryMatcher } from './geometry-matcher';
import { evaluateRepair } from './guardrails';
import {
  ActionKind,
  Blocked,
  Candidate,
  ElementFingerprint,
  ElementHint,
  ESCALATION_ORDER,
  LadderResult,
  LadderStep,
  LEVEL_NAMES,
  LevelId,
} from './types';

export interface LadderOptions {
  /** how long Level 1 keeps re-resolving the original selector (ms) */
  retryMs?: number;
  /** repairs below this confidence are refused */
  minConfidence?: number;
  /** if the best two Level 4 matches are closer than this the repair is ambiguous and refused */
  ambiguityMargin?: number;
  /**
   * Strict mode: Level 4 additionally requires lexical evidence (the replacement's label must share words with the
   * original's). A control that merely sits in the same place with the same polarity - e.g. a look-alike decoy
   * ("Sign up" where "Sign in" was) - is refused. Trades recall on fully re-worded UIs for precision.
   */
  strict?: boolean;
  backend?: BackendClient | null;
}

export interface LadderContext {
  url: string;
  fingerprint?: ElementFingerprint;
  hint?: ElementHint;
  fallbacks?: string[];
  errorMessage?: string;
}

export const DEFAULTS = { retryMs: 800, minConfidence: 0.7, ambiguityMargin: 0.08 } as const;

interface Proof {
  ok: boolean;
  reason: string;
  text: string;
  aria: string;
  box?: { x: number; y: number; w: number; h: number };
}

/** The selector resolves to exactly one visible element that can take the action. */
async function prove(page: Page, selector: string, action: ActionKind): Promise<Proof> {
  let locator: Locator;
  try {
    locator = page.locator(selector);
    const n = await locator.count();
    if (n === 0) return { ok: false, reason: 'matches no element', text: '', aria: '' };
    if (n > 1) return { ok: false, reason: `matches ${n} elements (ambiguous)`, text: '', aria: '' };
  } catch (e: any) {
    return { ok: false, reason: `invalid selector (${String(e.message).split('\n')[0]})`, text: '', aria: '' };
  }
  const info = await describeLocator(locator);
  if (!info) return { ok: false, reason: 'element detached', text: '', aria: '' };
  const base = { text: info.text, aria: info.ariaLabel, box: info.box };
  if (!(await locator.isVisible())) return { ok: false, reason: 'element is not visible', ...base };
  if (action === 'fill' ? !(await locator.isEditable()) : !(await locator.isEnabled())) {
    return { ok: false, reason: action === 'fill' ? 'element is not editable' : 'element is disabled', ...base };
  }
  return { ok: true, reason: 'ok', ...base };
}

const sameBox = (a?: Proof['box'], b?: Proof['box']) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

export async function runLadder(
  page: Page,
  selector: string,
  action: ActionKind,
  ctx: LadderContext,
  options: LadderOptions = {},
): Promise<LadderResult> {
  const opts = { ...DEFAULTS, ...options };
  const started = Date.now();
  const steps: LadderStep[] = [];
  const snapshot = await captureDomSnapshot(page);

  const result: LadderResult = {
    original: selector,
    action,
    steps,
    domBytesRaw: snapshot.rawBytes,
    domBytesCompressed: snapshot.compressedBytes,
    elapsedMs: 0,
    llmCostUsd: 0,
    llmTokens: 0,
  };

  const originalTexts = [ctx.hint?.textPreview, ctx.hint?.ariaLabel, ctx.fingerprint?.text, ctx.fingerprint?.ariaLabel, selector];

  const note = (level: LevelId, status: LadderStep['status'], reason: string, t0: number) =>
    steps.push({ level, name: LEVEL_NAMES[level], status, reason, ms: Date.now() - t0 });

  /** Prove + vet a candidate. Returns it when usable; records why not otherwise. */
  const vet = async (level: LevelId, c: Candidate, t0: number): Promise<'selected' | 'miss' | 'stop'> => {
    const proof = await prove(page, c.selector, action);
    if (!proof.ok) {
      note(level, 'miss', `${c.selector}: ${proof.reason}`, t0);
      return 'miss';
    }
    c.elementText = proof.text;
    c.elementAria = proof.aria;
    const verdict = evaluateRepair(originalTexts, [proof.text, proof.aria], c.confidence, opts.minConfidence);
    if (!verdict.allowed) {
      const blocked: Blocked = { code: verdict.code === 'ok' ? 'low_confidence' : verdict.code, reason: verdict.reason, selector: c.selector, elementText: proof.text };
      result.blocked = blocked;
      note(level, 'blocked', `${c.selector}: ${verdict.reason}`, t0);
      // a polarity flip means the right control is probably gone: stop instead of escalating
      return verdict.code === 'intent_conflict' ? 'stop' : 'miss';
    }
    note(level, 'selected', c.reasoning, t0);
    result.selected = c;
    result.blocked = undefined;
    return 'selected';
  };

  const finish = (): LadderResult => {
    result.elapsedMs = Date.now() - started;
    if (!result.selected && !result.blocked) {
      result.blocked = { code: 'no_candidate', reason: 'no level found a trustworthy replacement' };
    }
    return result;
  };

  for (const level of ESCALATION_ORDER) {
    const t0 = Date.now();

    // ---------------------------------------------------------------- Level 1: smart retry (+ verified cache)
    if (level === 1) {
      const deadline = Date.now() + opts.retryMs;
      let last = 'matches no element';
      let ok = false;
      do {
        const proof = await prove(page, selector, action);
        if (proof.ok) {
          ok = true;
          break;
        }
        last = proof.reason;
        if (proof.reason.startsWith('invalid selector')) break;
        await page.waitForTimeout(100);
      } while (Date.now() < deadline);
      if (ok) {
        const cand: Candidate = {
          selector, level: 1, confidence: 1,
          reasoning: `original selector resolved after waiting ${Date.now() - t0}ms (late render / animation); nothing was replaced`,
          elementText: '', elementAria: '', evidence: { waitedMs: Date.now() - t0 },
        };
        if ((await vet(1, cand, t0)) === 'selected') return finish();
      } else {
        note(1, 'miss', `still failing after ${opts.retryMs}ms: ${last}`, t0);
      }
      // verified cache (server): proven repairs from earlier runs, $0
      const backend = opts.backend;
      if (backend && (await backend.capabilities())) {
        const t1 = Date.now();
        try {
          const res = await backend.heal({
            url: ctx.url, original_selector: selector, dom_snapshot: snapshot.html, action_type: action,
            error_message: ctx.errorMessage, element_info: ctx.hint, levels: [],
          });
          if (res.status === 'healed' && res.healed_selector) {
            const cand: Candidate = {
              selector: res.healed_selector, level: 1, confidence: res.confidence, reasoning: res.reasoning,
              elementText: '', elementAria: '', evidence: { source: 'verified-cache' }, cacheId: res.cached_id ?? undefined,
            };
            if ((await vet(1, cand, t1)) === 'selected') return finish();
            if (result.blocked?.code === 'intent_conflict') return finish();
          }
        } catch {
          /* cache is optional */
        }
      }
      continue;
    }

    // ---------------------------------------------------------------- Level 3: multi-selector fallback
    if (level === 3) {
      const alternates = Array.from(new Set([...(ctx.fingerprint?.alternates ?? []), ...(ctx.fallbacks ?? [])])).filter((s) => s !== selector);
      if (!alternates.length) {
        note(3, 'skipped', 'no recorded alternate selectors for this element (run the test once while it passes)', t0);
        continue;
      }
      const proofs: Array<{ alt: string; proof: Proof }> = [];
      for (const alt of alternates) {
        const proof = await prove(page, alt, action);
        if (proof.ok) proofs.push({ alt, proof });
      }
      if (!proofs.length) {
        note(3, 'miss', `${alternates.length} alternates tried, none resolves to a single visible element`, t0);
        continue;
      }
      // alternates that disagree about *which* element they identify are ambiguous
      const distinct = proofs.filter((p, i) => proofs.findIndex((q) => sameBox(q.proof.box, p.proof.box)) === i);
      if (distinct.length > 1) {
        result.blocked = { code: 'ambiguous', reason: `recorded alternates point at ${distinct.length} different elements`, selector: distinct[0].alt };
        note(3, 'blocked', result.blocked.reason, t0);
        continue;
      }
      const best = proofs[0];
      const sim = ctx.fingerprint ? similarity(ctx.fingerprint, best.proof) : 0.5;
      const cand: Candidate = {
        selector: best.alt, level: 3, confidence: Math.min(0.97, 0.7 + 0.27 * sim),
        reasoning: `recorded alternate selector still identifies one element (${proofs.length}/${alternates.length} alternates agree)`,
        elementText: best.proof.text, elementAria: best.proof.aria,
        evidence: { alternatesTried: alternates.length, alternatesMatching: proofs.length, similarity: Math.round(sim * 100) / 100 },
      };
      const verdict = await vet(3, cand, t0);
      if (verdict === 'selected' || verdict === 'stop') return finish();
      continue;
    }

    // ---------------------------------------------------------------- Level 4: DOM geometry & layout matcher
    if (level === 4) {
      if (!ctx.fingerprint && !ctx.hint) {
        note(4, 'skipped', 'no fingerprint or hint to match against', t0);
        continue;
      }
      const ranked = await DomGeometryMatcher.rank(page, { action, fingerprint: ctx.fingerprint, hint: ctx.hint });
      if (!ranked.length) {
        note(4, 'miss', 'no eligible visible control on the page', t0);
        continue;
      }
      const [best, second] = ranked;
      if (second && best.confidence - second.confidence < opts.ambiguityMargin) {
        // two near-equal candidates (even identical-looking ones): refuse rather than guess
        result.blocked = {
          code: 'ambiguous',
          reason: `top two matches are within ${opts.ambiguityMargin} (${best.confidence.toFixed(2)} "${best.text}" vs ${second.confidence.toFixed(2)} "${second.text}")`,
          selector: best.selector,
          elementText: best.text,
        };
        note(4, 'blocked', result.blocked.reason, t0);
        continue;
      }
      if (opts.strict && (ctx.fingerprint?.text || ctx.hint?.textPreview) && best.lexical < 0.2) {
        result.blocked = {
          code: 'low_confidence',
          reason: `strict mode: "${best.text}" shares no words with the original control's label (word overlap ${best.lexical.toFixed(2)})`,
          selector: best.selector,
          elementText: best.text,
        };
        note(4, 'blocked', result.blocked.reason, t0);
        continue;
      }
      const cand: Candidate = {
        selector: best.selector, level: 4, confidence: best.confidence,
        reasoning: `best layout match: text, role, position and structure agree (${Object.entries(best.components).map(([k, v]) => `${k} ${v}`).join(', ')})`,
        elementText: best.text, elementAria: best.ariaLabel,
        evidence: { ...best.components, score: Math.round(best.score * 1000) / 1000, coverage: Math.round(best.coverage * 100) / 100, selectorKind: best.selectorKind },
      };
      const verdict = await vet(4, cand, t0);
      if (verdict === 'selected' || verdict === 'stop') return finish();
      continue;
    }

    // ---------------------------------------------------------------- Levels 2 and 5: LLM (server)
    if (level === 2 || level === 5) {
      const backend = opts.backend;
      const caps = backend ? await backend.capabilities() : null;
      if (!backend) {
        note(level, 'skipped', 'no backend configured (set AGENTQA_BACKEND_URL and AGENTQA_API_KEY)', t0);
        continue;
      }
      if (!caps) {
        note(level, 'skipped', 'backend unreachable', t0);
        continue;
      }
      if (!caps.llmConfigured) {
        note(level, 'skipped', 'no LLM provider configured on the backend', t0);
        continue;
      }
      try {
        const res = await backend.heal({
          url: ctx.url, original_selector: selector, dom_snapshot: snapshot.html, action_type: action,
          error_message: ctx.errorMessage, element_info: { ...ctx.hint, textPreview: ctx.hint?.textPreview ?? ctx.fingerprint?.text, tagName: ctx.hint?.tagName ?? ctx.fingerprint?.tag },
          levels: [level],
        });
        result.llmCostUsd += res.cost_usd_estimate;
        result.llmTokens += res.tokens_estimate;
        if (res.status === 'healed' && res.healed_selector) {
          const cand: Candidate = {
            selector: res.healed_selector, level, confidence: res.confidence, reasoning: res.reasoning,
            elementText: '', elementAria: '', evidence: { provider: res.llm_provider ?? '', tokens: res.tokens_estimate }, cacheId: res.cached_id ?? undefined,
          };
          const verdict = await vet(level, cand, t0);
          if (verdict === 'selected' || verdict === 'stop') return finish();
        } else {
          note(level, res.status === 'blocked' ? 'blocked' : 'miss', res.steps.map((s) => s.reason).join('; ') || res.reasoning, t0);
          if (res.status === 'blocked' && res.guardrail?.code === 'intent_conflict') {
            result.blocked = { code: 'intent_conflict', reason: res.guardrail.reason };
            return finish();
          }
        }
      } catch (e: any) {
        note(level, 'skipped', `LLM call failed: ${e.message}`, t0);
      }
    }
  }
  return finish();
}

/** Text / role / attribute agreement between a recorded fingerprint and a live element (position excluded). */
function similarity(fp: ElementFingerprint, live: Proof): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const a = norm(fp.text || fp.ariaLabel);
  const b = norm(live.text || live.aria);
  if (!a && !b) return 0.6;
  if (a === b) return 1;
  const ta = new Set(a.split(' ')), tb = new Set(b.split(' '));
  let inter = 0;
  ta.forEach((t) => tb.has(t) && inter++);
  return inter / (ta.size + tb.size - inter || 1);
}
