/**
 * AgentQA DOM Compressor
 * Compresses raw browser DOM trees down to ~8KB for cost-efficient LLM selector healing.
 * Strips non-semantic tags, styles, scripts, and collapses whitespace.
 */

import { Page } from '@playwright/test';

/**
 * Extracts and compresses the DOM directly from an active Playwright Page instance.
 */
export async function captureCompressedDOM(page: Page, maxBytes: number = 10240): Promise<string> {
  const compressed = await page.evaluate(() => {
    // Clone body to prevent modifying page DOM
    const clone = document.body.cloneNode(true) as HTMLElement;

    // 1. Remove non-semantic / heavy elements
    const tagsToRemove = ['script', 'style', 'svg', 'noscript', 'canvas', 'iframe', 'template', 'link'];
    tagsToRemove.forEach(tag => {
      clone.querySelectorAll(tag).forEach(el => el.remove());
    });

    // 2. Allowed attributes to keep for selector reasoning
    const allowedAttrs = new Set([
      'id', 'class', 'name', 'type', 'role', 'aria-label', 'aria-labelledby',
      'aria-expanded', 'aria-selected', 'data-testid', 'data-test', 'data-cy',
      'placeholder', 'href', 'title', 'alt', 'value', 'for'
    ]);

    // 3. Clean attributes recursively
    const allElements = clone.querySelectorAll('*');
    allElements.forEach(el => {
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        if (!allowedAttrs.has(name) && !name.startsWith('aria-') && !name.startsWith('data-test')) {
          el.removeAttribute(attr.name);
        }
      }

      // Filter noisy dynamic classes
      if (el.classList.length > 0) {
        const validClasses = Array.from(el.classList).filter(c => {
          if (/\d{4,}/.test(c)) return false;
          if (/^(css-|jsx-|styled-)/i.test(c)) return false;
          return true;
        });
        if (validClasses.length > 0) {
          el.className = validClasses.slice(0, 3).join(' ');
        } else {
          el.removeAttribute('class');
        }
      }
    });

    // 4. Return serialized HTML
    return clone.outerHTML;
  });

  // Post-process string: collapse whitespace
  let compacted = compressed
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // If still too large, truncate cleanly
  if (compacted.length > maxBytes) {
    compacted = compacted.substring(0, maxBytes) + '...<!-- DOM TRUNCATED -->';
  }

  return compacted;
}
