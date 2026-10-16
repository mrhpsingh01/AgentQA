import { expect, test } from '@playwright/test';
import { checkoutPage, makeAgent, ORIGINAL, serve } from './helpers';

test.describe('Level 3 - Multi-Selector Fallback (deterministic, $0, offline)', () => {
  test('a recorded alternate selector survives a harmless refactor', async ({ page }) => {
    // 1. record while the original selector works
    await serve(page, checkoutPage(ORIGINAL));
    const first = makeAgent(page);
    await first.aq.click('#place-order');

    // 2. refactor: id, class and wrapper change; data-testid survives
    await serve(page, checkoutPage({ id: 'buy-9f3', testid: 'place-order', cls: 'css-1x2y3z', label: 'Place order', wrapper: true }));
    const { aq } = makeAgent(page, { storeDir: first.storeDir });
    await aq.click('#place-order');
    await expect(page.locator('#out')).toHaveText('Order confirmed');
    aq.noteAssertion();
    await aq.finalize();

    const h = aq.heals[0];
    expect(h.level).toBe(3);
    expect(h.healed).toBe('[data-testid="place-order"]');
    expect(h.llmCostUsd).toBe(0);
    expect(h.verdict).toBe('validated');
    // levels attempted in cost order: 1 (miss) then 3
    expect(h.steps.map((s) => `${s.level}:${s.status}`)).toEqual(['1:miss', '3:selected']);
  });

  test('author-supplied fallbacks work without any recorded history', async ({ page }) => {
    await serve(page, checkoutPage({ id: 'x1', testid: 'buy-now', cls: 'c', label: 'Place order' }));
    const { aq } = makeAgent(page);
    await aq.click('#place-order', { fallbacks: ['[data-testid="buy-now"]'] });
    await expect(page.locator('#out')).toBeVisible();
    aq.noteAssertion();
    await aq.finalize();
    expect(aq.heals[0]).toMatchObject({ level: 3, healed: '[data-testid="buy-now"]' });
  });

  test('alternates that point at different elements are ambiguous and refused', async ({ page }) => {
    await serve(page, checkoutPage({ id: 'x1', testid: 'buy-now', cls: 'c', label: 'Place order' }));
    const { aq } = makeAgent(page);
    await expect(
      aq.click('#place-order', { fallbacks: ['[data-testid="buy-now"]', '[data-testid="cancel"]'] }),
    ).rejects.toThrow(/ambiguous/);
  });
});
