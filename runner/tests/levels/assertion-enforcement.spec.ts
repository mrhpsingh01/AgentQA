import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test as pwTest, expect as pwExpect } from '@playwright/test';
import { test, expect } from '../../src/fixtures';
import { checkoutPage, fakeInfo, makeAgent, ORIGINAL, serve } from './helpers';

process.env.AGENTQA_STORE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agentqa-fixture-'));

const REFACTORED = { id: 'k7', testid: 'place-order', cls: 'zz9', label: 'Place order', wrapper: true };

pwTest.describe('A heal only counts if the original assertions pass afterwards', () => {
  pwTest('assertions pass after the heal -> validated', async ({ page }) => {
    await serve(page, checkoutPage(ORIGINAL));
    const first = makeAgent(page);
    await first.aq.click('#place-order');
    await serve(page, checkoutPage(REFACTORED));
    const { aq } = makeAgent(page, { storeDir: first.storeDir });
    await aq.click('#place-order');
    await pwExpect(page.locator('#out')).toHaveText('Order confirmed');
    aq.noteAssertion();
    await aq.finalize();
    pwExpect(aq.heals[0]).toMatchObject({ verdict: 'validated', assertionsAfter: 1 });
  });

  pwTest('the test fails after the heal -> rejected (never reported as a successful heal)', async ({ page }) => {
    await serve(page, checkoutPage(ORIGINAL));
    const first = makeAgent(page);
    await first.aq.click('#place-order');
    // app is broken: the repaired control exists but the order is never confirmed
    await serve(page, checkoutPage(REFACTORED).replace("document.getElementById('out').style.display='block'", 'void 0'));
    const info = fakeInfo();
    const { aq } = makeAgent(page, { storeDir: first.storeDir }, info);
    await aq.click('#place-order');
    await pwExpect(page.locator('#out')).toBeHidden(); // the real assertion would fail here...
    info.errors.push(new Error('expected "Order confirmed"')); // ...which Playwright records on the test
    await aq.finalize(); // does not throw: the original failure stands
    pwExpect(aq.heals[0].verdict).toBe('rejected');
    pwExpect(aq.heals[0].verdictReason).toMatch(/did not confirm/);
  });

  pwTest('no assertion after the heal -> unverified, and the test is failed', async ({ page }) => {
    await serve(page, checkoutPage(ORIGINAL));
    const first = makeAgent(page);
    await first.aq.click('#place-order');
    await serve(page, checkoutPage(REFACTORED));
    const { aq } = makeAgent(page, { storeDir: first.storeDir });
    await aq.click('#place-order');
    await pwExpect(aq.finalize()).rejects.toThrow(/not verified by any assertion/);
    pwExpect(aq.heals[0].verdict).toBe('unverified');
  });

  pwTest('a rejected or unverified heal never rewrites the remembered fingerprint', async ({ page }) => {
    await serve(page, checkoutPage(ORIGINAL));
    const first = makeAgent(page);
    await first.aq.click('#place-order');
    await serve(page, checkoutPage(REFACTORED));
    const { aq } = makeAgent(page, { storeDir: first.storeDir });
    await aq.click('#place-order');
    await pwExpect(aq.finalize()).rejects.toThrow();
    const before = JSON.parse((await import('node:fs')).readFileSync(`${first.storeDir}/fingerprints.json`, 'utf-8'));
    pwExpect(Object.values<any>(before)[0].id).toBe('place-order'); // still the ORIGINAL element
  });
});

// The real fixture: an unproven heal must make the Playwright test itself fail.
test.describe('fixture integration', () => {
  test.fail('bare expect without a matcher cannot validate a heal', async ({ page, agentqa }) => {
    await serve(page, checkoutPage(ORIGINAL));
    await agentqa.click('#place-order');
    await serve(page, checkoutPage(REFACTORED));
    await agentqa.click('#place-order');
    expect(page.locator('#out'));
  });

  test('heal followed by a real assertion passes', async ({ page, agentqa }) => {
    await serve(page, checkoutPage(ORIGINAL));
    await agentqa.click('#place-order');
    await serve(page, checkoutPage(REFACTORED));
    await agentqa.click('#place-order');
    await expect(page.locator('#out')).toHaveText('Order confirmed');
  });

  test('poll, soft, configured and negated matchers verify repairs', async ({ page, agentqa }) => {
    await serve(page, checkoutPage(ORIGINAL));
    await agentqa.click('#place-order');
    await serve(page, checkoutPage(REFACTORED));
    await agentqa.click('#place-order');
    await expect.poll(() => page.locator('#out').textContent()).toBe('Order confirmed');
    await expect.soft(page.locator('#out')).toBeVisible();
    await expect.configure({ timeout: 1000 })(page.locator('#out')).not.toHaveText('Order cancelled');
    await expect(Promise.resolve('Order confirmed')).resolves.toBe('Order confirmed');
  });

  test.fail('heal with no assertion after it fails the test', async ({ page, agentqa }) => {
    await serve(page, checkoutPage(ORIGINAL));
    await agentqa.click('#place-order');
    await serve(page, checkoutPage(REFACTORED));
    await agentqa.click('#place-order'); // healed, but nothing asserts the outcome
  });
});
