import { expect, test } from '@playwright/test';
import { evaluateRepair, intentPolarity, polarity } from '../../src/healing/guardrails';
import { checkoutPage, makeAgent, ORIGINAL, serve } from './helpers';

test.describe('Guardrails - intent-preserving repair', () => {
  test('polarity matches the Python implementation (same shared vocabulary)', () => {
    const cases: Array<[string, string]> = [
      ['Place order', 'affirm'], ['Complete purchase', 'affirm'], ['Sign in', 'affirm'],
      ['Cancel', 'cancel'], ['Cancel order', 'cancel'], ['Delete account', 'cancel'], ['Back to cart', 'cancel'],
      ['Nobody', 'neutral'], ['Details', 'neutral'], ['', 'neutral'],
    ];
    for (const [text, expected] of cases) expect(polarity(text), text).toBe(expected);
    expect(intentPolarity('#place-order-btn')).toBe('affirm');
    expect(intentPolarity("[data-testid='cancelOrder']")).toBe('cancel');
  });

  test('a submit -> cancel repair is refused, and so is the reverse', () => {
    expect(evaluateRepair(['Place order'], ['Cancel'], 0.99, 0.7).code).toBe('intent_conflict');
    expect(evaluateRepair(['Cancel'], ['Place order'], 0.99, 0.7).code).toBe('intent_conflict');
    expect(evaluateRepair(['Place order'], ['Complete purchase'], 0.9, 0.7).allowed).toBe(true);
    expect(evaluateRepair(['Place order'], ['Place order'], 0.69, 0.7).code).toBe('low_confidence');
  });

  test('checkout button removed, Cancel remains: the ladder refuses and never clicks Cancel', async ({ page }) => {
    await serve(page, checkoutPage(ORIGINAL));
    const first = makeAgent(page);
    await first.aq.click('#place-order');

    // the control is gone; only Cancel is left in its neighbourhood
    await serve(page, checkoutPage(ORIGINAL).replace(/<button id="place-order"[^>]*>Place order<\/button>/, '').replace(
      "document.querySelector('[data-testid=\"place-order\"]').addEventListener('click',()=>{document.getElementById('out').style.display='block'});", ''));
    const { aq } = makeAgent(page, { storeDir: first.storeDir });
    await expect(aq.click('#place-order')).rejects.toThrow(/refused to heal/);

    expect(aq.heals).toHaveLength(0);
    expect(['intent_conflict', 'low_confidence']).toContain(aq.blockedRecords[0].blocked.code);
    await expect(page.locator('#out')).toBeHidden(); // Cancel was never clicked
  });

  test('two identical candidates are ambiguous: refuse instead of picking one', async ({ page }) => {
    await serve(page, checkoutPage(ORIGINAL));
    const first = makeAgent(page);
    await first.aq.click('#place-order');

    const twin = '<button id="twin-a" class="x" type="button">Place order</button><button id="twin-b" class="x" type="button">Place order</button>';
    await serve(page, checkoutPage(ORIGINAL).replace(/<button id="place-order"[^>]*>Place order<\/button>/, twin));
    const { aq } = makeAgent(page, { storeDir: first.storeDir });
    await expect(aq.click('#place-order')).rejects.toThrow(/ambiguous/);
    expect(aq.heals).toHaveLength(0);
  });

  test('a hint that says "Place order" will not be healed onto a lone Cancel button', async ({ page }) => {
    await serve(page, '<!doctype html><body><button id="c1" type="button">Cancel</button></body>');
    const { aq } = makeAgent(page);
    await expect(aq.click('#place-order', { hint: { tagName: 'button', textPreview: 'Place order' } })).rejects.toThrow(/refused to heal/);
    expect(['intent_conflict', 'low_confidence']).toContain(aq.blockedRecords[0].blocked.code);
  });
});
