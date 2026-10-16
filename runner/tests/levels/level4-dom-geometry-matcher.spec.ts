import { expect, test } from '@playwright/test';
import { checkoutPage, makeAgent, ORIGINAL, serve } from './helpers';

test.describe('Level 4 - DOM Geometry & Layout Matcher (deterministic, $0, offline)', () => {
  test('finds the control by layout when id, test id, class AND label all changed', async ({ page }) => {
    await serve(page, checkoutPage(ORIGINAL));
    const first = makeAgent(page);
    await first.aq.click('#place-order'); // records text, role, box, ancestors

    // nothing the author selected on survives; the layout does
    await serve(page, checkoutPage({ id: 'k7', testid: 'btn-7f', cls: 'zz9', label: 'Complete purchase', wrapper: true }));
    const { aq } = makeAgent(page, { storeDir: first.storeDir });
    await aq.click('#place-order');
    await expect(page.locator('#out')).toHaveText('Order confirmed'); // it was NOT the Cancel button
    aq.noteAssertion();
    await aq.finalize();

    const h = aq.heals[0];
    expect(h.level).toBe(4);
    expect(h.levelName).toBe('DOM Geometry & Layout Matcher');
    expect(h.confidence).toBeGreaterThanOrEqual(0.7);
    expect(h.evidence).toHaveProperty('position');
    expect(h.evidence).toHaveProperty('intent');
    expect(h.llmCostUsd).toBe(0);
    expect(h.verdict).toBe('validated');
  });

  test('is skipped (not guessed) when there is nothing to match against', async ({ page }) => {
    await serve(page, checkoutPage({ id: 'k7', testid: 'btn-7f', cls: 'zz9', label: 'Complete purchase' }));
    const { aq } = makeAgent(page);
    await expect(aq.click('#place-order')).rejects.toThrow(/refused to heal/);
    const l4 = aq.blockedRecords[0].steps.find((s) => s.level === 4)!;
    expect(l4.status).toBe('skipped');
  });

  test('an explicit hint (text + approximate box) is enough when no fingerprint exists', async ({ page }) => {
    await serve(page, checkoutPage({ id: 'k7', testid: 'btn-7f', cls: 'zz9', label: 'Place order' }));
    const { aq } = makeAgent(page);
    const box = await page.locator('#cancel-btn').boundingBox();
    await aq.click('#place-order', {
      hint: { tagName: 'button', textPreview: 'Place order', approximateBox: { x: box!.x - 130, y: box!.y, w: 100, h: box!.height } },
    });
    await expect(page.locator('#out')).toHaveText('Order confirmed');
    aq.noteAssertion();
    await aq.finalize();
    expect(aq.heals[0].level).toBe(4);
  });
});
