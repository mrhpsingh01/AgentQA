/**
 * Element fingerprints: what an element looked like the last time its selector worked.
 *
 * Healing needs an identity to heal *towards*. Every time an action succeeds, AgentQA records a
 * fingerprint of the target (text, role, attributes, ancestors, bounding box, plus alternate selectors
 * that also identified it). When the selector later breaks, Levels 3 and 4 use that record; no LLM and
 * no network are involved.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import type { ElementFingerprint } from './types';

/** Runs in the page: describes the element a locator resolved to. */
function describeElement(el: Element): Omit<ElementFingerprint, 'alternates' | 'recordedAt'> {
  const h = el as HTMLElement;
  const attr = (n: string) => h.getAttribute(n) ?? '';
  const tag = h.tagName.toLowerCase();

  const implicitRole = (): string | null => {
    const explicit = attr('role');
    if (explicit) return explicit;
    if (tag === 'button') return 'button';
    if (tag === 'a' && h.hasAttribute('href')) return 'link';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'nav') return 'navigation';
    if (tag === 'input') {
      const t = (attr('type') || 'text').toLowerCase();
      if (['button', 'submit', 'reset'].includes(t)) return 'button';
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      return 'textbox';
    }
    return null;
  };

  const chain: string[] = [];
  let p = h.parentElement;
  while (p && chain.length < 6) {
    chain.push(p.tagName.toLowerCase());
    p = p.parentElement;
  }

  const r = h.getBoundingClientRect();
  const text = (h.innerText || h.getAttribute('value') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return {
    tag,
    role: implicitRole(),
    text,
    ariaLabel: attr('aria-label'),
    name: attr('name'),
    type: attr('type'),
    placeholder: attr('placeholder'),
    id: h.id || '',
    testId: attr('data-testid') || attr('data-test') || attr('data-cy'),
    classes: Array.from(h.classList).slice(0, 6),
    href: attr('href'),
    path: chain,
    inForm: !!h.closest('form'),
    box: { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) },
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
}

/** Candidate alternate selectors for a fingerprint, most robust first (uniqueness is checked by the caller). */
export function alternateSelectors(fp: Omit<ElementFingerprint, 'alternates' | 'recordedAt'>): string[] {
  const out: string[] = [];
  const q = (s: string) => s.replace(/"/g, '\\"');
  if (fp.testId) out.push(`[data-testid="${q(fp.testId)}"]`);
  if (fp.id) out.push(`#${fp.id}`);
  if (fp.name && ['input', 'select', 'textarea', 'button'].includes(fp.tag)) out.push(`${fp.tag}[name="${q(fp.name)}"]`);
  if (fp.ariaLabel) out.push(`[aria-label="${q(fp.ariaLabel)}"]`);
  const accessibleName = fp.ariaLabel || fp.text;
  if (fp.role && accessibleName) out.push(`role=${fp.role}[name="${q(accessibleName)}"i]`);
  if (fp.placeholder) out.push(`${fp.tag}[placeholder="${q(fp.placeholder)}"]`);
  // label text that contains digits is usually volatile (counters, prices): do not build an alternate from it
  if (fp.text && fp.text.length <= 40 && !/\d/.test(fp.text) && ['button', 'a'].includes(fp.tag)) out.push(`${fp.tag}:has-text("${q(fp.text)}")`);
  return Array.from(new Set(out));
}

/** Describe whatever a locator currently resolves to (null unless it resolves to exactly one element). */
export async function describeLocator(locator: Locator): Promise<Omit<ElementFingerprint, 'alternates' | 'recordedAt'> | null> {
  try {
    if ((await locator.count()) !== 1) return null;
    return await locator.evaluate(describeElement);
  } catch {
    return null;
  }
}

export async function captureFingerprint(locator: Locator, page: Page): Promise<ElementFingerprint | null> {
  try {
    if ((await locator.count()) !== 1) return null;
    const base = await locator.evaluate(describeElement);
    // keep only alternates that identify exactly this one element right now
    const alternates: string[] = [];
    for (const alt of alternateSelectors(base)) {
      try {
        if ((await page.locator(alt).count()) === 1) alternates.push(alt);
      } catch {
        /* invalid selector syntax: ignore */
      }
    }
    return { ...base, alternates, recordedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

/** JSON-file store keyed by (page path, selector), shared between runs. */
export class FingerprintStore {
  private data: Record<string, ElementFingerprint> = {};
  private loaded = false;

  constructor(private readonly file: string) {}

  static forDir(dir: string): FingerprintStore {
    return new FingerprintStore(path.join(dir, 'fingerprints.json'));
  }

  private load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
    } catch {
      this.data = {};
    }
  }

  static key(url: string, selector: string): string {
    let pagePath = url;
    try {
      pagePath = new URL(url).pathname.replace(/\/$/, '') || '/';
    } catch {
      /* about:blank etc. */
    }
    return `${pagePath}::${selector}`;
  }

  get(url: string, selector: string): ElementFingerprint | undefined {
    this.load();
    return this.data[FingerprintStore.key(url, selector)];
  }

  put(url: string, selector: string, fp: ElementFingerprint) {
    this.load();
    this.data[FingerprintStore.key(url, selector)] = fp;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  clear() {
    this.data = {};
    this.loaded = true;
    try {
      fs.rmSync(this.file, { force: true });
    } catch {
      /* ignore */
    }
  }
}
