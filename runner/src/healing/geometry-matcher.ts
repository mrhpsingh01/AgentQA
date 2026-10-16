/**
 * Level 4: DOM Geometry & Layout Matcher.
 *
 * Finds the element that most resembles a recorded fingerprint using what the browser already knows about
 * the live DOM: text, ARIA role, attributes, ancestor structure and *DOM bounding boxes*
 * (getBoundingClientRect). It does NOT compare screenshots or pixels, so it is deterministic and free.
 *
 * Scoring components (each 0..1), combined with fixed weights re-normalised over the signals available:
 *   text 0.30  - visible label / aria-label / placeholder similarity
 *   role 0.15  - ARIA role (explicit or implicit) and input type
 *   attrs 0.10 - name / type / placeholder / aria-label agreement
 *   position 0.20 - distance between bounding-box centres, relative to the viewport
 *   size 0.10  - width/height ratio
 *   context 0.15 - same <form> membership and similar ancestor chain
 *   intent 0.15 - affirm/cancel polarity of the label (shared intent vocabulary): "Complete purchase" resembles
 *                 "Place order" even with no words in common, and never resembles "Cancel"
 * Confidence is the weighted score scaled by how much evidence was available, so a match built from a
 * one-word hint can never outrank one built from a full fingerprint.
 */

import type { Page } from '@playwright/test';
import { vocabularySources } from './guardrails';
import type { ActionKind, ElementFingerprint, ElementHint } from './types';

export interface GeometryQuery {
  action: ActionKind;
  fingerprint?: ElementFingerprint;
  hint?: ElementHint;
}

export interface GeometryMatch {
  selector: string;
  selectorKind: 'testid' | 'id' | 'name' | 'aria' | 'text' | 'css-path';
  score: number;
  confidence: number;
  coverage: number;
  text: string;
  ariaLabel: string;
  tag: string;
  components: Record<string, number>;
  /** word-level overlap between the recorded label and this control's label (used by strict mode) */
  lexical: number;
}

export const WEIGHTS = { text: 0.3, role: 0.15, attrs: 0.1, position: 0.2, size: 0.1, context: 0.15, intent: 0.15 } as const;

export class DomGeometryMatcher {
  /** Ranked candidates (best first), at most `limit`. */
  static async rank(page: Page, query: GeometryQuery, limit = 5): Promise<GeometryMatch[]> {
    return page.evaluate(
      ({ q, weights, limit, vocab }) => {
        const fp = q.fingerprint ?? null;
        const hint = q.hint ?? null;
        const action = q.action;

        const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const tokens = (s: string) => new Set(norm(s).split(' ').filter(Boolean));
        const bigrams = (s: string) => {
          const t = norm(s).replace(/ /g, '');
          const out = new Map<string, number>();
          for (let i = 0; i < t.length - 1; i++) out.set(t.slice(i, i + 2), (out.get(t.slice(i, i + 2)) ?? 0) + 1);
          return out;
        };
        const textSim = (a: string, b: string): number => {
          if (!norm(a) && !norm(b)) return 0;
          if (!norm(a) || !norm(b)) return 0;
          if (norm(a) === norm(b)) return 1;
          const ta = tokens(a), tb = tokens(b);
          let inter = 0;
          ta.forEach((t) => tb.has(t) && inter++);
          const jaccard = inter / (ta.size + tb.size - inter || 1);
          const ba = bigrams(a), bb = bigrams(b);
          let overlap = 0, total = 0;
          ba.forEach((n, k) => (overlap += Math.min(n, bb.get(k) ?? 0)));
          ba.forEach((n) => (total += n));
          bb.forEach((n) => (total += n));
          const dice = total ? (2 * overlap) / total : 0;
          return Math.max(jaccard, dice * 0.9);
        };

        const polarityOf = (text: string): 'affirm' | 'cancel' | 'neutral' => {
          const n = norm(text);
          if (!n) return 'neutral';
          const hit = (words: string[]) => words.some((w) => new RegExp('(?<![a-z0-9])' + w + '(?![a-z0-9])').test(n)); // vocabulary words are plain letters/spaces
          if (hit(vocab.cancel)) return 'cancel';
          if (hit(vocab.affirm)) return 'affirm';
          return 'neutral';
        };

        const roleOf = (el: HTMLElement): string => {
          const explicit = el.getAttribute('role');
          if (explicit) return explicit;
          const tag = el.tagName.toLowerCase();
          if (tag === 'button') return 'button';
          if (tag === 'a' && el.hasAttribute('href')) return 'link';
          if (tag === 'select') return 'combobox';
          if (tag === 'textarea') return 'textbox';
          if (tag === 'input') {
            const t = (el.getAttribute('type') || 'text').toLowerCase();
            if (['button', 'submit', 'reset'].includes(t)) return 'button';
            if (t === 'checkbox') return 'checkbox';
            if (t === 'radio') return 'radio';
            return 'textbox';
          }
          return '';
        };

        const isFillable = (el: HTMLElement) => {
          const tag = el.tagName.toLowerCase();
          if (tag === 'textarea' || tag === 'select') return true;
          if (el.isContentEditable) return true;
          if (tag === 'input') return !['button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'hidden'].includes((el.getAttribute('type') || 'text').toLowerCase());
          return false;
        };
        const isClickable = (el: HTMLElement) => {
          const tag = el.tagName.toLowerCase();
          if (['button', 'summary'].includes(tag) || (tag === 'a' && el.hasAttribute('href'))) return true;
          if (tag === 'input') return true;
          const role = el.getAttribute('role');
          return !!role && ['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio', 'switch', 'option'].includes(role);
        };
        const eligible = (el: HTMLElement) => {
          if (action === 'fill') return isFillable(el);
          if (action === 'select') return el.tagName.toLowerCase() === 'select';
          if (action === 'check') return el.tagName.toLowerCase() === 'input' && ['checkbox', 'radio'].includes((el.getAttribute('type') || '').toLowerCase());
          return isClickable(el) || (action === 'hover') || el.hasAttribute('onclick');
        };
        const visible = (el: HTMLElement) => {
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) return false;
          const st = getComputedStyle(el);
          return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
        };

        // --- target description (fingerprint wins; hint fills the gaps) -------------------------------
        const target = {
          label: fp ? fp.text || fp.ariaLabel || fp.placeholder : hint?.textPreview || hint?.ariaLabel || '',
          role: fp?.role ?? (hint?.tagName ? hint.tagName.toLowerCase() : null),
          type: fp?.type ?? hint?.type ?? '',
          name: fp?.name ?? hint?.name ?? '',
          placeholder: fp?.placeholder ?? '',
          ariaLabel: fp?.ariaLabel ?? hint?.ariaLabel ?? '',
          box: fp?.box ?? hint?.approximateBox ?? null,
          viewport: fp?.viewport ?? { w: window.innerWidth, h: window.innerHeight },
          path: fp?.path ?? [],
          inForm: fp ? fp.inForm : null,
        };

        const available = {
          text: !!norm(target.label),
          role: !!target.role,
          attrs: !!(target.name || target.type || target.placeholder || target.ariaLabel),
          position: !!target.box,
          size: !!target.box,
          context: !!fp,
          intent: polarityOf(target.label) !== 'neutral',
        };
        const totalWeight = Object.values(weights as Record<string, number>).reduce((a, b) => a + b, 0);
        const usedWeight = (Object.keys(available) as Array<keyof typeof available>)
          .filter((k) => available[k])
          .reduce((a, k) => a + (weights as Record<string, number>)[k], 0);
        const coverage = usedWeight / totalWeight;

        // --- unique selector for an element -----------------------------------------------------------
        const unique = (sel: string, el: Element) => {
          try {
            const found = document.querySelectorAll(sel);
            return found.length === 1 && found[0] === el;
          } catch {
            return false;
          }
        };
        const autoId = (id: string) => /\d{4,}|^[a-z]{1,3}[-_]?[0-9a-f]{6,}$/i.test(id);
        const cssPath = (el: Element): string => {
          const parts: string[] = [];
          let node: Element | null = el;
          while (node && node.tagName.toLowerCase() !== 'html' && parts.length < 8) {
            const tag = node.tagName.toLowerCase();
            const parent: Element | null = node.parentElement;
            if (!parent) break;
            const same = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
            parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
            node = parent;
            if (unique(parts.join(' > '), el)) break;
          }
          return parts.join(' > ');
        };
        const selectorFor = (el: HTMLElement): { selector: string; kind: GeometryMatch['selectorKind'] } => {
          const testid = el.getAttribute('data-testid');
          if (testid && unique(`[data-testid="${testid}"]`, el)) return { selector: `[data-testid="${testid}"]`, kind: 'testid' };
          if (el.id && !autoId(el.id) && unique(`#${CSS.escape(el.id)}`, el)) return { selector: `#${CSS.escape(el.id)}`, kind: 'id' };
          const tag = el.tagName.toLowerCase();
          const name = el.getAttribute('name');
          if (name && unique(`${tag}[name="${name}"]`, el)) return { selector: `${tag}[name="${name}"]`, kind: 'name' };
          const aria = el.getAttribute('aria-label');
          if (aria && unique(`[aria-label="${aria}"]`, el)) return { selector: `[aria-label="${aria}"]`, kind: 'aria' };
          const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
          if (text && text.length <= 40) {
            const same = Array.from(document.querySelectorAll(tag)).filter((n) => ((n as HTMLElement).innerText || '').toLowerCase().includes(text.toLowerCase()));
            if (same.length === 1 && same[0] === el) return { selector: `${tag}:has-text("${text.replace(/"/g, '\\"')}")`, kind: 'text' };
          }
          return { selector: cssPath(el), kind: 'css-path' };
        };

        // --- scoring -----------------------------------------------------------------------------------
        const diag = Math.hypot(target.viewport.w, target.viewport.h) || 1;
        const results: GeometryMatch[] = [];
        const all = Array.from(document.querySelectorAll<HTMLElement>('button, a, input, select, textarea, summary, [role], [onclick], [contenteditable]'));
        for (const el of all) {
          if (!eligible(el) || !visible(el)) continue;
          const r = el.getBoundingClientRect();
          const box = { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
          const candLabel = ((el.innerText || '') || el.getAttribute('value') || '').trim() || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';

          const comp: Record<string, number> = {};
          if (available.text) {
            comp.text = Math.max(
              textSim(target.label, candLabel),
              target.ariaLabel ? textSim(target.ariaLabel, el.getAttribute('aria-label') || '') : 0,
            );
          }
          if (available.role) {
            const role = roleOf(el);
            const targetRole = (target.role || '').toLowerCase();
            let s = role && role === targetRole ? 1 : el.tagName.toLowerCase() === targetRole ? 0.8 : 0.15;
            if (target.type && (el.getAttribute('type') || '').toLowerCase() === target.type.toLowerCase()) s = Math.min(1, s + 0.1);
            comp.role = s;
          }
          if (available.attrs) {
            const checks: Array<[string, string]> = [
              [target.name, el.getAttribute('name') || ''],
              [target.type, el.getAttribute('type') || ''],
              [target.placeholder, el.getAttribute('placeholder') || ''],
              [target.ariaLabel, el.getAttribute('aria-label') || ''],
            ];
            const present = checks.filter(([a]) => a);
            comp.attrs = present.length ? present.filter(([a, b]) => a.toLowerCase() === b.toLowerCase()).length / present.length : 0;
          }
          if (available.position && target.box) {
            const dx = box.x + box.w / 2 - (target.box.x + target.box.w / 2);
            const dy = box.y + box.h / 2 - (target.box.y + target.box.h / 2);
            comp.position = Math.max(0, 1 - Math.hypot(dx, dy) / (0.35 * diag));
          }
          if (available.size && target.box) {
            const wr = Math.min(box.w, target.box.w) / (Math.max(box.w, target.box.w) || 1);
            const hr = Math.min(box.h, target.box.h) / (Math.max(box.h, target.box.h) || 1);
            comp.size = (wr + hr) / 2;
          }
          if (available.context && fp) {
            const chain: string[] = [];
            let p = el.parentElement;
            while (p && chain.length < 6) {
              chain.push(p.tagName.toLowerCase());
              p = p.parentElement;
            }
            let lcs = 0;
            const a = fp.path, b = chain;
            const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
            for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
            lcs = dp[a.length][b.length];
            const chainSim = lcs / (Math.max(a.length, b.length) || 1);
            comp.context = 0.5 * (!!el.closest('form') === fp.inForm ? 1 : 0) + 0.5 * chainSim;
          }

          if (available.intent) {
            const t = polarityOf(target.label), c = polarityOf(candLabel);
            comp.intent = c === t ? 1 : c === 'neutral' ? 0.4 : 0;
          }

          let weighted = 0, used = 0;
          for (const k of Object.keys(comp)) {
            const w = (weights as Record<string, number>)[k];
            weighted += comp[k] * w;
            used += w;
          }
          if (!used) continue;
          const score = weighted / used;
          const { selector, kind } = selectorFor(el);
          results.push({
            selector,
            selectorKind: kind,
            score,
            coverage,
            confidence: Math.min(0.99, score * (0.6 + 0.4 * coverage)),
            text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
            ariaLabel: el.getAttribute('aria-label') || '',
            tag: el.tagName.toLowerCase(),
            components: Object.fromEntries(Object.entries(comp).map(([k, v]) => [k, Math.round(v * 1000) / 1000])),
            lexical: (() => {
              const a = tokens(target.label), b = tokens(candLabel);
              let inter = 0;
              a.forEach((t) => b.has(t) && inter++);
              return a.size && b.size ? inter / (a.size + b.size - inter) : 0;
            })(),
          });
        }
        results.sort((x, y) => y.confidence - x.confidence);
        return results.slice(0, limit);
      },
      { q: query, weights: WEIGHTS, limit, vocab: vocabularySources() },
    );
  }
}
