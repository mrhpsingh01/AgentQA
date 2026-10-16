/**
 * The mutation benchmark dataset: 50 scenarios = 6 UI patterns x realistic mutation categories, plus
 * negative cases that MUST NOT be healed into a pass.
 *
 * Each scenario is a test written against the ORIGINAL page (selectors chosen by one `strategy`, the way a
 * recorder or an author would) and run against a MUTATED page. The scenario's `verify` is the test's own
 * assertion of the business outcome; it never depends on the mutated markup.
 *
 *   positive  - a harmless refactor: the right outcome is reachable, so a correct healer should make it PASS
 *   negative  - a real regression: the outcome is NOT reachable, so the only correct result is a FAILED test
 */

import type { Page } from '@playwright/test';
import { mutate, Mutations, ORIGINAL_VARIANT, Pattern, PATTERNS, Variant } from './pages';

export type Category =
  | 'rename-id' | 'rename-testid' | 'restructure' | 'class-scramble' | 'text-variation' | 'combined-hard' | 'delayed-render'
  | 'negative-removed' | 'negative-decoy' | 'negative-broken';

export type Strategy = 'id' | 'testid' | 'class' | 'structural' | 'text';

export interface Step {
  action: 'click' | 'fill';
  key: string;
  value?: string;
}

export interface Scenario {
  id: string;
  pattern: Pattern;
  category: Category;
  kind: 'positive' | 'negative';
  description: string;
  before: Variant;
  after: Variant;
  strategy: Strategy;
  steps: Step[];
  /** the control the scenario is really about (the one a decoy / removal threatens) */
  primary: string;
  verify: (page: Page, check: (assertion: Promise<unknown>) => Promise<void>, expect: (typeof import('@playwright/test'))['expect']) => Promise<void>;
}

const FLOWS: Record<Pattern, { steps: Step[]; primary: string; tags: Record<string, 'input' | 'button' | 'a'> }> = {
  login: { steps: [{ action: 'fill', key: 'user', value: 'alice' }, { action: 'fill', key: 'pass', value: 's3cret' }, { action: 'click', key: 'submit' }], primary: 'submit', tags: { user: 'input', pass: 'input' } },
  checkout: { steps: [{ action: 'fill', key: 'email', value: 'jane@example.com' }, { action: 'click', key: 'place' }], primary: 'place', tags: { email: 'input' } },
  table: { steps: [{ action: 'click', key: 'archive2' }], primary: 'archive2', tags: {} },
  modal: { steps: [{ action: 'click', key: 'open' }, { action: 'fill', key: 'name', value: 'Casey' }, { action: 'click', key: 'save' }], primary: 'save', tags: { name: 'input' } },
  navbar: { steps: [{ action: 'click', key: 'pricing' }], primary: 'pricing', tags: { products: 'a', pricing: 'a', docs: 'a', account: 'a' } },
  list: { steps: [{ action: 'fill', key: 'item', value: 'Buy milk' }, { action: 'click', key: 'add' }], primary: 'add', tags: { item: 'input' } },
};

/** What the author's test originally read on screen (used by the text strategy). */
export const ORIGINAL_LABELS: Record<string, string> = {
  submit: 'Sign in', place: 'Place order', archive2: 'Archive', open: 'Open settings', save: 'Save', pricing: 'Pricing', add: 'Add',
};

const SOFT_LABELS: Record<Pattern, Record<string, string>> = {
  login: { submit: 'Log in' }, checkout: { place: 'Complete purchase' }, table: { archive2: 'Move to history' },
  modal: { save: 'Update profile' }, navbar: { pricing: 'Plans' }, list: { add: 'Create' },
};
const HARD_LABELS: Record<Pattern, Record<string, string>> = {
  login: { submit: 'Continue' }, checkout: { place: 'Pay now' }, table: { archive2: 'Move to history' },
  modal: { save: 'Update profile' }, navbar: { pricing: 'Plans' }, list: { add: 'Create' },
};

export function tagOf(pattern: Pattern, key: string): 'input' | 'button' | 'a' {
  return FLOWS[pattern].tags[key] ?? (pattern === 'navbar' ? 'a' : 'button');
}

export async function selectorFor(page: Page, sc: Scenario, key: string): Promise<string> {
  const v = sc.before;
  const tag = tagOf(sc.pattern, key);
  switch (sc.strategy) {
    case 'id': return `#${v.id(key)}`;
    case 'testid': return `[data-testid="${v.tid(key)}"]`;
    case 'class': return `.${v.cls(key)}`;
    case 'text':
      // inputs have no label text to select by: authors use their id
      if (tag === 'input') return `#${v.id(key)}`;
      // rows share the label "Archive": the author scopes it to the row (a row attribute no refactor touches)
      return key === 'archive2' ? `[data-row="2"] ${tag}:has-text("${ORIGINAL_LABELS[key]}")` : `${tag}:has-text("${ORIGINAL_LABELS[key] ?? key}")`;
    case 'structural':
      return page.evaluate((k) => {
        const parts: string[] = [];
        let el = document.querySelector(`[data-k="${k}"]`) as HTMLElement | null;
        while (el && el !== document.body) {
          const parent: HTMLElement | null = el.parentElement;
          if (!parent) break;
          const same = Array.from(parent.children).filter((c) => c.tagName === el!.tagName);
          parts.unshift(same.length > 1 ? `${el.tagName.toLowerCase()}:nth-of-type(${same.indexOf(el) + 1})` : el.tagName.toLowerCase());
          el = parent;
        }
        return `body > ${parts.join(' > ')}`;
      }, key);
  }
}

const VERIFY: Record<Pattern, Scenario['verify']> = {
  login: async (page, check, expect) => check(expect(page.locator('[data-out]')).toHaveText('Welcome back, alice', { timeout: 1500 })),
  checkout: async (page, check, expect) => check(expect(page.locator('[data-out]')).toHaveText('Order confirmed for jane@example.com', { timeout: 1500 })),
  table: async (page, check, expect) => {
    await check(expect(page.locator('[data-row="2"] [data-status]')).toHaveText('Archived', { timeout: 1500 }));
    await check(expect(page.locator('[data-row="1"] [data-status]')).toHaveText('Open'));
  },
  modal: async (page, check, expect) => check(expect(page.locator('[data-out]')).toHaveText('Saved Casey', { timeout: 1500 })),
  navbar: async (page, check, expect) => check(expect(page.locator('[data-out]')).toHaveText('Pricing plans', { timeout: 1500 })),
  list: async (page, check, expect) => {
    await check(expect(page.locator('#items li')).toHaveCount(1, { timeout: 1500 }));
    await check(expect(page.locator('#items li')).toHaveText('Buy milk'));
  },
};

function scenario(
  pattern: Pattern, category: Category, kind: Scenario['kind'], strategy: Strategy, description: string, after: Mutations,
  before: Mutations = {},
): Scenario {
  return {
    id: `${pattern}/${category}`,
    pattern, category, kind, description, strategy,
    before: Object.keys(before).length ? mutate(before) : ORIGINAL_VARIANT,
    after: mutate(after),
    steps: FLOWS[pattern].steps,
    primary: FLOWS[pattern].primary,
    verify: VERIFY[pattern],
  };
}

export function buildScenarios(): Scenario[] {
  const out: Scenario[] = [];

  // ---- positives: harmless refactors (6 patterns x 6 categories = 36) ------------------------------------
  for (const p of PATTERNS) {
    out.push(scenario(p, 'rename-id', 'positive', 'id', 'every id renamed', { ids: true }));
    out.push(scenario(p, 'rename-testid', 'positive', 'testid', 'every data-testid renamed', { testids: true }));
    out.push(scenario(p, 'restructure', 'positive', 'structural', 'controls moved into new wrapper elements', { wrap: true }));
    out.push(scenario(p, 'class-scramble', 'positive', 'class', 'CSS classes regenerated (utility-class / CSS-in-JS refresh)', { classes: true }));
    out.push(scenario(p, 'text-variation', 'positive', 'text', 'button / link wording changed', { labels: SOFT_LABELS[p] }));
    out.push(scenario(p, 'combined-hard', 'positive', 'id', 'ids, test ids, classes, wording and nesting ALL changed', { ids: true, testids: true, classes: true, wrap: true, labels: HARD_LABELS[p] }));
  }
  // ---- late rendering: Level 1 (2) --------------------------------------------------------------------------
  out.push(scenario('checkout', 'delayed-render', 'positive', 'id', 'the primary button renders 700ms late', { delayMs: 700, lateKey: 'place' }));
  out.push(scenario('list', 'delayed-render', 'positive', 'id', 'the Add button renders 700ms late', { delayMs: 700, lateKey: 'add' }));

  // ---- negatives: real regressions that must NOT turn green (12) -------------------------------------------
  const refactor = { ids: true, testids: true };
  out.push(scenario('checkout', 'negative-removed', 'negative', 'id', 'Place order was removed (Cancel remains)', { ...refactor, removed: ['place'] }));
  out.push(scenario('login', 'negative-removed', 'negative', 'id', 'Sign in was removed', { ...refactor, removed: ['submit'] }));
  out.push(scenario('modal', 'negative-removed', 'negative', 'id', 'Save was removed (Close remains)', { ...refactor, removed: ['save'] }));
  out.push(scenario('table', 'negative-removed', 'negative', 'id', 'Archive was removed (Delete remains)', { ...refactor, removed: ['archive2'] }));

  out.push(scenario('checkout', 'negative-decoy', 'negative', 'id', 'Place order replaced by a look-alike "Save for later"', { ...refactor, removed: ['place'], decoys: { later: 'Save for later' } }));
  out.push(scenario('login', 'negative-decoy', 'negative', 'id', 'Sign in replaced by "Sign up" (different action)', { ...refactor, removed: ['submit'], decoys: { later: 'Sign up' } }));
  out.push(scenario('modal', 'negative-decoy', 'negative', 'id', 'Save replaced by "Apply preview" (does not persist)', { ...refactor, removed: ['save'], decoys: { apply: 'Apply preview' } }));
  out.push(scenario('table', 'negative-decoy', 'negative', 'id', 'Archive replaced by a second Delete-looking control', { ...refactor, removed: ['archive2'], decoys: { delete2b: 'Remove row' } }));

  out.push(scenario('checkout', 'negative-broken', 'negative', 'id', 'refactored UI, but placing an order silently does nothing', { ...refactor, brokenAction: true }));
  out.push(scenario('login', 'negative-broken', 'negative', 'id', 'refactored UI, but signing in silently does nothing', { ...refactor, brokenAction: true }));
  out.push(scenario('list', 'negative-broken', 'negative', 'id', 'refactored UI, but Add silently does nothing', { ...refactor, brokenAction: true }));
  out.push(scenario('modal', 'negative-broken', 'negative', 'id', 'refactored UI, but Save silently does nothing', { ...refactor, brokenAction: true }));

  return out;
}
