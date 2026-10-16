/**
 * AgentQA fixtures for Playwright tests.
 *
 *   import { test, expect } from '../src/fixtures';
 *   test('checkout', async ({ page, agentqa }) => {
 *     await agentqa.click('#place-order');                 // heals if the selector broke
 *     await expect(page).toHaveURL(/confirmation/);        // ...and this assertion decides whether the heal counts
 *   });
 *
 * `expect` is Playwright's expect, wrapped only to count assertions so an unverified heal can be refused.
 */

import { expect as baseExpect, test as base } from '@playwright/test';
import { AgentQA, configFromEnv } from './healing/session';

let current: AgentQA | null = null;

const counted = <T extends (...args: any[]) => any>(fn: T): T =>
  (function (this: unknown, ...args: any[]) {
    current?.noteAssertion();
    return fn.apply(this, args);
  }) as unknown as T;

export const expect = new Proxy(baseExpect, {
  apply(target, thisArg, args) {
    current?.noteAssertion();
    return Reflect.apply(target as any, thisArg, args);
  },
  get(target, prop, receiver) {
    const v = Reflect.get(target, prop, receiver);
    if ((prop === 'soft' || prop === 'poll') && typeof v === 'function') return counted(v.bind(target));
    return v;
  },
}) as typeof baseExpect;

export const test = base.extend<{ agentqa: AgentQA }>({
  agentqa: async ({ page }, use, testInfo) => {
    const aq = new AgentQA(page, testInfo, configFromEnv());
    current = aq;
    try {
      await use(aq);
    } finally {
      current = null;
    }
    await aq.finalize();
  },
});
