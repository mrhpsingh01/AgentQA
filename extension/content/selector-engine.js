/**
 * AgentQA - Multi-Strategy Selector Generator
 * Generates prioritized cascading fallback selectors in Puppeteer Replay / Playwright compatible format.
 */

(function (global) {
  'use strict';

  /**
   * Generates prioritized selectors for a target DOM element.
   * Returns array of selector candidates: string[][]
   * Example: [
   *   ["[data-testid=\"submit-btn\"]"],
   *   ["aria/Submit payment"],
   *   ["#checkout-submit"],
   *   ["button[name=\"submit\"]"],
   *   ["form > div:nth-of-type(2) > button"],
   *   ["xpath///html/body/div/button"]
   * ]
   */
  function generateSelectorPriorities(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return [];

    const selectors = [];

    // 1. Priority 1: Semantic Test IDs
    const testAttrs = ['data-testid', 'data-test', 'data-cy', 'data-qa', 'data-test-id'];
    for (const attr of testAttrs) {
      const val = element.getAttribute(attr);
      if (val && val.trim()) {
        selectors.push([`[${attr}="${CSS.escape(val.trim())}"]`]);
        break;
      }
    }

    // 2. Priority 2: Accessible Name / ARIA Selector
    const ariaSelector = computeAriaSelector(element);
    if (ariaSelector) {
      selectors.push([`aria/${ariaSelector}`]);
    }

    // 3. Priority 3: Stable ID
    if (element.id && isStableId(element.id)) {
      selectors.push([`#${CSS.escape(element.id)}`]);
    }

    // 4. Priority 4: Functional Semantic Attributes (name, placeholder, type)
    const tag = element.tagName.toLowerCase();
    if (element.getAttribute('name')) {
      const nameVal = element.getAttribute('name');
      selectors.push([`${tag}[name="${CSS.escape(nameVal)}"]`]);
    }
    if (element.getAttribute('placeholder')) {
      const placeholderVal = element.getAttribute('placeholder');
      selectors.push([`${tag}[placeholder="${CSS.escape(placeholderVal)}"]`]);
    }
    if (element.getAttribute('aria-label')) {
      const ariaLabel = element.getAttribute('aria-label');
      selectors.push([`${tag}[aria-label="${CSS.escape(ariaLabel)}"]`]);
    }
    if (tag === 'input' && element.getAttribute('type')) {
      const typeVal = element.getAttribute('type');
      if (element.getAttribute('value') && ['submit', 'button', 'reset'].includes(typeVal)) {
        selectors.push([`input[type="${typeVal}"][value="${CSS.escape(element.value)}"]`]);
      }
    }

    // 5. Priority 5: Clean Hierarchical CSS Selector Path
    const cssPath = getOptimizedCssPath(element);
    if (cssPath && !selectors.some(s => s[0] === cssPath)) {
      selectors.push([cssPath]);
    }

    // 6. Priority 6: XPath Fallback
    const xpath = getXPath(element);
    if (xpath) {
      selectors.push([`xpath/${xpath}`]);
    }

    return selectors;
  }

  /**
   * Computes an accessible name for ARIA selectors.
   */
  function computeAriaSelector(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;

    // Explicit aria-label
    const explicitLabel = el.getAttribute('aria-label');
    if (explicitLabel && explicitLabel.trim()) {
      return explicitLabel.trim();
    }

    // aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl && labelEl.innerText.trim()) {
        return labelEl.innerText.trim();
      }
    }

    const tag = el.tagName.toUpperCase();

    // Buttons and links: use text content
    if (['BUTTON', 'A'].includes(tag) || el.getAttribute('role') === 'button') {
      const text = (el.innerText || el.textContent || '').trim();
      if (text && text.length > 0 && text.length <= 40 && !text.includes('\n')) {
        return text;
      }
    }

    // Inputs with associated <label>
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) {
      // Check for <label for="...">
      if (el.id) {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label && label.innerText.trim()) {
          return label.innerText.trim();
        }
      }
      // Check enclosing <label>
      const parentLabel = el.closest('label');
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true);
        // remove inner input elements from text
        clone.querySelectorAll('input, select, textarea').forEach(n => n.remove());
        const labelText = clone.innerText.trim();
        if (labelText) return labelText;
      }
    }

    // Alt text on images
    if (tag === 'IMG' && el.getAttribute('alt')) {
      return el.getAttribute('alt').trim();
    }

    return null;
  }

  /**
   * Filters out fragile, auto-generated dynamic IDs (React 18 :r0:, UUIDs, long numeric strings).
   */
  function isStableId(id) {
    if (!id || typeof id !== 'string') return false;
    const trimmed = id.trim();
    if (!trimmed) return false;

    // React 18 useId produces IDs starting with :r or :
    if (/^[:_]/.test(trimmed)) return false;

    // UUIDs: e.g. 123e4567-e89b-12d3-a456-426614174000
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) return false;

    // Numeric IDs or long hashes (e.g. id_1728929192 or 482910)
    if (/\d{5,}/.test(trimmed)) return false;

    // Framework prefixes like ember123, ext-gen, yui-
    if (/^(ember|ext-gen|yui|ng-|radix-)/i.test(trimmed)) return false;

    return true;
  }

  /**
   * Builds an optimized CSS selector path anchored to nearest stable ancestor.
   */
  function getOptimizedCssPath(el) {
    const parts = [];
    let curr = el;

    while (curr && curr.nodeType === Node.ELEMENT_NODE && curr !== document.documentElement && curr !== document.body) {
      let selector = curr.tagName.toLowerCase();

      // If stable ID is found, anchor to it and break
      if (curr.id && isStableId(curr.id)) {
        parts.unshift(`#${CSS.escape(curr.id)}`);
        break;
      }

      // Filter dynamic class names
      const validClasses = Array.from(curr.classList || []).filter(c => {
        if (!c || typeof c !== 'string') return false;
        if (/\d{4,}/.test(c)) return false; // Contains random digits
        if (/^(css-|jsx-|styled-)/i.test(c)) return false; // CSS-in-JS hashes
        if (c.startsWith('_')) return false; // CSS modules
        return true;
      });

      if (validClasses.length > 0 && validClasses.length <= 2) {
        selector += '.' + validClasses.map(c => CSS.escape(c)).join('.');
      }

      // Add nth-of-type if ambiguous among siblings
      if (curr.parentElement) {
        const siblings = Array.from(curr.parentElement.children).filter(e => e.tagName === curr.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(curr) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      parts.unshift(selector);
      curr = curr.parentElement;
      if (parts.length >= 3) break; // Keep concise to prevent brittleness
    }

    return parts.join(' > ');
  }

  /**
   * Generates a standard XPath locator fallback.
   */
  function getXPath(element) {
    if (element.id && isStableId(element.id)) {
      return `//*[@id="${element.id}"]`;
    }
    const parts = [];
    let curr = element;
    while (curr && curr.nodeType === Node.ELEMENT_NODE && curr !== document.documentElement) {
      let index = 1;
      let sib = curr.previousSibling;
      while (sib) {
        if (sib.nodeType === Node.ELEMENT_NODE && sib.tagName === curr.tagName) {
          index++;
        }
        sib = sib.previousSibling;
      }
      parts.unshift(`${curr.tagName.toLowerCase()}[${index}]`);
      curr = curr.parentNode;
    }
    return '/' + parts.join('/');
  }

  // Export to global scope for content script usage
  global.AgentQASelectorEngine = {
    generateSelectorPriorities,
    computeAriaSelector,
    isStableId,
    getOptimizedCssPath,
    getXPath
  };
})(typeof window !== 'undefined' ? window : this);
