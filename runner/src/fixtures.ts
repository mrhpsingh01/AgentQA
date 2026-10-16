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

// Constructing expect(value) is not an assertion. Count only completed matchers.
function matchers(value: any): any {
  return new Proxy(value, {
    get(target, prop, receiver) {
      const member = Reflect.get(target, prop, receiver);
      if (typeof member === 'function') return (...args: any[]) => {
        const session = current;
        const result = member.apply(target, args);
        if (result && typeof result.then === 'function') {
          return result.then((answer: unknown) => { session?.noteAssertion(); return answer; });
        }
        session?.noteAssertion();
        return result;
      };
      return member && typeof member === 'object' ? matchers(member) : member;
    },
  });
}

function instrumentExpect(fn: typeof baseExpect): typeof baseExpect {
  return new Proxy(fn, {
  apply(target, thisArg, args) {
    return matchers(Reflect.apply(target as any, thisArg, args));
  },
  get(target, prop, receiver) {
    const v = Reflect.get(target, prop, receiver);
    if ((prop === 'soft' || prop === 'poll') && typeof v === 'function') {
      return (...args: any[]) => matchers(v.apply(target, args));
    }
    if ((prop === 'configure' || prop === 'extend') && typeof v === 'function') {
      return (...args: any[]) => instrumentExpect(v.apply(target, args));
    }
    return v;
  },
  }) as typeof baseExpect;
}

export const expect = instrumentExpect(baseExpect);

export const test = base.extend<{ agentqa: AgentQA }>({
  agentqa: async ({ page }, use, testInfo) => {
    const aq = new AgentQA(page, testInfo, configFromEnv());
    current = aq;
    try {
      await use(aq);
    } finally {
      current = null;
      await aq.finalize();
    }
  },
});
