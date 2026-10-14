/**
 * AgentQA Visual Element Matcher
 * Level 4 Healing: Uses element geometry, coordinate proximity, and visual cues.
 */

import { Page } from '@playwright/test';

export interface VisualMatchQuery {
  expectedText?: string;
  expectedTag?: string;
  approximateY?: number;
  approximateX?: number;
}

export class VisualMatcher {
  /**
   * Finds an element closest to expected visual coordinates matching semantic criteria.
   */
  static async findElementByVisualGeometry(
    page: Page,
    query: VisualMatchQuery
  ): Promise<string | null> {
    const selector = await page.evaluate((q) => {
      const candidates = Array.from(document.querySelectorAll('button, a, input, [role="button"]'));
      let bestMatch: HTMLElement | null = null;
      let minDistance = Infinity;

      for (const el of candidates) {
        const htmlEl = el as HTMLElement;
        const rect = htmlEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        // Check text match if provided
        if (q.expectedText && !htmlEl.innerText.toLowerCase().includes(q.expectedText.toLowerCase())) {
          continue;
        }

        // Calculate distance if coordinates provided
        if (q.approximateX !== undefined && q.approximateY !== undefined) {
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const dist = Math.hypot(centerX - q.approximateX, centerY - q.approximateY);
          if (dist < minDistance) {
            minDistance = dist;
            bestMatch = htmlEl;
          }
        } else if (!bestMatch) {
          bestMatch = htmlEl;
        }
      }

      if (bestMatch) {
        // Return resilient locator string
        if (bestMatch.id) return `#${bestMatch.id}`;
        if (bestMatch.getAttribute('data-testid')) return `[data-testid="${bestMatch.getAttribute('data-testid')}"]`;
        if (bestMatch.innerText.trim()) return `button:has-text("${bestMatch.innerText.trim().substring(0, 30)}")`;
      }

      return null;
    }, query);

    return selector;
  }
}
