/**
 * AgentQA Self-Healing Playwright Proxy
 * Intercepts locator failures, requests AI selector repair, retries actions,
 * and records healing events.
 */

import { Page, Locator, test } from '@playwright/test';
import { captureCompressedDOM } from '../dom-compressor';

export interface HealingEvent {
  url: string;
  originalSelector: string;
  healedSelector: string;
  strategyLevel: number;
  confidence: number;
  reasoning: string;
  timestamp: number;
}

export class HealingSessionTracker {
  private events: HealingEvent[] = [];

  record(event: HealingEvent) {
    this.events.push(event);
    console.log(`[AgentQA Self-Healing] ⚡ REPAIRED '${event.originalSelector}' -> '${event.healedSelector}' (confidence: ${Math.round(event.confidence * 100)}%)`);
  }

  getEvents(): HealingEvent[] {
    return [...this.events];
  }

  clear() {
    this.events = [];
  }
}

export const sessionHealingTracker = new HealingSessionTracker();

export interface HealingOptions {
  backendUrl?: string;
  apiKey?: string;
  projectId?: string;
  timeout?: number;
  fallbackSelectors?: string[][];
  elementInfo?: Record<string, any>;
}

/**
 * Executes a click action with autonomous self-healing.
 */
export async function healedClick(
  page: Page,
  selector: string,
  options: HealingOptions = {}
): Promise<void> {
  const timeout = options.timeout || 3000;
  const backendUrl = (options.backendUrl || process.env.AGENTQA_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');

  try {
    // Attempt standard click
    await page.locator(selector).click({ timeout });
  } catch (originalError: any) {
    console.warn(`[AgentQA Self-Healing] Selector failed: "${selector}". Initiating 5-level escalation...`);

    // 1. Capture compressed DOM
    const compressedDom = await captureCompressedDOM(page);

    // 2. Request healing from backend API
    const response = await fetch(`${backendUrl}/api/v1/healing/heal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.apiKey ? { 'X-API-Key': options.apiKey } : {})
      },
      body: JSON.stringify({
        project_id: options.projectId,
        url: page.url(),
        original_selector: selector,
        dom_snapshot: compressedDom,
        action_type: 'click',
        error_message: originalError.message,
        fallback_selectors: options.fallbackSelectors,
        element_info: options.elementInfo
      })
    });

    if (!response.ok) {
      throw new Error(`Self-healing service failed (HTTP ${response.status}). Original error: ${originalError.message}`);
    }

    const healingData: any = await response.json();
    const healedSelector = healingData.healed_selector;

    // 3. Validate and execute action with repaired selector
    try {
      await page.locator(healedSelector).click({ timeout });

      // Record successful healing event
      const event: HealingEvent = {
        url: page.url(),
        originalSelector: selector,
        healedSelector: healedSelector,
        strategyLevel: healingData.strategy_level,
        confidence: healingData.confidence,
        reasoning: healingData.reasoning,
        timestamp: Date.now()
      };
      sessionHealingTracker.record(event);
      try {
        test.info().annotations.push({
          type: 'agentqa-healing',
          description: JSON.stringify(event)
        });
      } catch (_) {}
    } catch (retryError: any) {
      throw new Error(`Self-healing failed: repaired selector '${healedSelector}' also failed. Error: ${retryError.message}`);
    }
  }
}

/**
 * Executes an input fill action with autonomous self-healing.
 */
export async function healedFill(
  page: Page,
  selector: string,
  value: string,
  options: HealingOptions = {}
): Promise<void> {
  const timeout = options.timeout || 3000;
  const backendUrl = (options.backendUrl || process.env.AGENTQA_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');

  try {
    await page.locator(selector).fill(value, { timeout });
  } catch (originalError: any) {
    console.warn(`[AgentQA Self-Healing] Input selector failed: "${selector}". Initiating healing...`);

    const compressedDom = await captureCompressedDOM(page);

    const response = await fetch(`${backendUrl}/api/v1/healing/heal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.apiKey ? { 'X-API-Key': options.apiKey } : {})
      },
      body: JSON.stringify({
        project_id: options.projectId,
        url: page.url(),
        original_selector: selector,
        dom_snapshot: compressedDom,
        action_type: 'fill',
        error_message: originalError.message,
        fallback_selectors: options.fallbackSelectors,
        element_info: options.elementInfo
      })
    });

    if (!response.ok) {
      throw new Error(`Self-healing service error. Original error: ${originalError.message}`);
    }

    const healingData: any = await response.json();
    const healedSelector = healingData.healed_selector;

    try {
      await page.locator(healedSelector).fill(value, { timeout });

      const event: HealingEvent = {
        url: page.url(),
        originalSelector: selector,
        healedSelector: healedSelector,
        strategyLevel: healingData.strategy_level,
        confidence: healingData.confidence,
        reasoning: healingData.reasoning,
        timestamp: Date.now()
      };
      sessionHealingTracker.record(event);
      try {
        test.info().annotations.push({
          type: 'agentqa-healing',
          description: JSON.stringify(event)
        });
      } catch (_) {}
    } catch (retryError: any) {
      throw new Error(`Self-healing failed for fill on '${healedSelector}': ${retryError.message}`);
    }
  }
}
