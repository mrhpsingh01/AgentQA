/**
 * The checkout test of the demo shop. It is written ONCE, against the original markup (ids such as
 * #add-to-cart-3 and #place-order), and run unchanged against every state of the app:
 *
 *   original        -> passes, 0 heals needed
 *   refactored      -> selectors break, AgentQA heals them, the assertions below still pass
 *   broken          -> selectors break, AgentQA finds the right button, the order is never created:
 *                      the assertions FAIL and the heal is rejected
 *   broken-removed  -> the Place-order button is gone: AgentQA refuses to click Cancel instead
 */

import fs from 'node:fs';
import path from 'node:path';
import { captureDomSnapshot } from '../src/dom-compressor';
import { expect, test } from '../src/fixtures';

const BASE = process.env.DEMO_URL || 'http://127.0.0.1:8765';
const STATE = process.env.DEMO_STATE || 'original';
const ARTIFACTS = process.env.AGENTQA_ARTIFACT_DIR;

test.use({ viewport: { width: 1280, height: 800 } });

test('customer buys an insulated bottle', async ({ page, agentqa }) => {
  await page.request.post(`${BASE}/api/reset`);
  await page.goto(`${BASE}/?state=${STATE}`);

  await agentqa.click('#add-to-cart-3'); // product 3, "Insulated Bottle 750ml"
  await agentqa.click('#checkout-btn');
  await expect(page).toHaveURL(/#\/checkout$/);

  if (ARTIFACTS) {
    // evidence for the dashboard: what the page looked like when the test reached checkout
    fs.mkdirSync(ARTIFACTS, { recursive: true });
    const snap = await captureDomSnapshot(page);
    fs.writeFileSync(path.join(ARTIFACTS, `${STATE}.dom.html`), snap.html);
    fs.writeFileSync(path.join(ARTIFACTS, `${STATE}.dom.json`), JSON.stringify({ rawBytes: snap.rawBytes, compressedBytes: snap.compressedBytes }));
    await page.screenshot({ path: path.join(ARTIFACTS, `${STATE}.png`) });
  }

  await agentqa.fill('#email', 'jane@example.com');
  await agentqa.click('#place-order');

  // The test's own assertions: these - not the click - decide whether a heal counts.
  await test.step('URL navigated to the confirmation view', async () => {
    await expect(page).toHaveURL(/#\/confirmation$/, { timeout: 2000 });
  });
  await test.step('order confirmation text is shown', async () => {
    await expect(page.getByRole('heading', { name: /Order confirmed/ })).toBeVisible({ timeout: 2000 });
  });
  await test.step('API state changed: exactly one order exists for jane@example.com', async () => {
    const orders = await (await page.request.get(`${BASE}/api/orders`)).json();
    expect(orders).toHaveLength(1);
    expect(orders[0].email).toBe('jane@example.com');
  });
});
