/**
 * AgentQA DOM Compressor
 * Reduces a live page to the structure an LLM needs for selector repair: interactive controls, their
 * selector-relevant attributes and short labels. Scripts, styles, SVG, media, long prose and generated
 * class noise are removed. The raw and compressed sizes are reported so the saving is measurable.
 */

import { Page } from '@playwright/test';

export interface DomSnapshot {
  html: string;
  rawBytes: number;
  compressedBytes: number;
  truncated: boolean;
}

const DEFAULT_MAX_BYTES = 10 * 1024;

export async function captureDomSnapshot(page: Page, maxBytes: number = DEFAULT_MAX_BYTES): Promise<DomSnapshot> {
  const { html, rawBytes } = await page.evaluate(() => {
    const rawBytes = new TextEncoder().encode(document.documentElement.outerHTML).length;
    const clone = document.body.cloneNode(true) as HTMLElement;

    // 1. heavy / non-semantic elements
    for (const tag of ['script', 'style', 'svg', 'noscript', 'canvas', 'iframe', 'template', 'link', 'img', 'picture', 'video', 'audio', 'br', 'hr', 'p']) {
      clone.querySelectorAll(tag).forEach((el) => el.remove());
    }
    // 2. keep only attributes useful for selectors
    const allowed = new Set([
      'id', 'class', 'name', 'type', 'role', 'aria-label', 'aria-labelledby', 'aria-expanded', 'aria-selected',
      'data-testid', 'data-test', 'data-cy', 'placeholder', 'href', 'title', 'alt', 'value', 'for',
    ]);
    clone.querySelectorAll('*').forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        const n = attr.name.toLowerCase();
        if (!allowed.has(n) && !n.startsWith('aria-') && !n.startsWith('data-test')) el.removeAttribute(attr.name);
      }
      if (el.classList.length > 0) {
        const keep = Array.from(el.classList).filter((c) => !/\d{4,}/.test(c) && !/^(css-|jsx-|styled-)/i.test(c));
        if (keep.length) el.className = keep.slice(0, 3).join(' ');
        else el.removeAttribute('class');
      }
      const href = el.getAttribute('href');
      if (href && href.length > 60) el.setAttribute('href', href.slice(0, 60));
    });
    // 3. collapse long runs of look-alike siblings (a 72-card catalog) to a representative head; the omission is
    //    stated in a comment so a model knows the list continues. Trade-off: a target deep inside such a run is
    //    not in the snapshot - the deterministic levels (which see the live page) are unaffected.
    const sig = (el: Element) => el.tagName + '.' + Array.from(el.classList).slice(0, 2).join('.');
    const HEAD = 3;
    const collapse = (parent: Element) => {
      const kids = Array.from(parent.children);
      let i = 0;
      while (i < kids.length) {
        let j = i;
        while (j + 1 < kids.length && sig(kids[j + 1]) === sig(kids[i])) j++;
        const run = j - i + 1;
        if (run > HEAD + 2) {
          for (let k = i + HEAD; k <= j; k++) kids[k].remove();
          kids[i + HEAD - 1].after(document.createComment(` ${run - HEAD} more <${kids[i].tagName.toLowerCase()}> siblings omitted `));
        }
        i = j + 1;
      }
      Array.from(parent.children).forEach(collapse);
    };
    collapse(clone);

    // 4. shorten long text nodes
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    while (walker.nextNode()) texts.push(walker.currentNode as Text);
    for (const t of texts) {
      const v = (t.nodeValue || '').replace(/\s+/g, ' ');
      t.nodeValue = v.length > 60 ? v.slice(0, 60) + '…' : v;
    }
    return { html: clone.outerHTML, rawBytes };
  });

  let compacted = html.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim();
  let truncated = false;
  if (compacted.length > maxBytes) {
    compacted = compacted.substring(0, maxBytes) + '...<!-- DOM TRUNCATED -->';
    truncated = true;
  }
  return { html: compacted, rawBytes, compressedBytes: new TextEncoder().encode(compacted).length, truncated };
}

/** Back-compat helper: just the compressed HTML. */
export async function captureCompressedDOM(page: Page, maxBytes: number = DEFAULT_MAX_BYTES): Promise<string> {
  return (await captureDomSnapshot(page, maxBytes)).html;
}
