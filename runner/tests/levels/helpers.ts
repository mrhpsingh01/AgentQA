import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { AgentQA, AgentQAConfig, configFromEnv, TestInfoLike } from '../../src/healing/session';

export const ORIGIN = 'http://agentqa.test';

/** Serve `html` at ORIGIN + route (no network, stable URL path so fingerprints key consistently). */
export async function serve(page: Page, html: string, route = '/shop') {
  await page.route(`${ORIGIN}${route}`, (r) => r.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(`${ORIGIN}${route}`);
}

export function fakeInfo(title = 'level test'): TestInfoLike & { errors: unknown[] } {
  return { title, file: __filename, errors: [], annotations: [] };
}

export function makeAgent(page: Page, over: Partial<AgentQAConfig> = {}, info = fakeInfo()) {
  const storeDir = over.storeDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'agentqa-store-'));
  const aq = new AgentQA(page, info, configFromEnv({
    record: true, healing: true, actionTimeoutMs: 400, backend: null,
    ladder: { retryMs: 300, minConfidence: 0.7 }, ...over, storeDir,
  }));
  return { aq, info, storeDir };
}

/** A checkout-style page. Layout is identical between variants; only the markup identity changes. */
export function checkoutPage(v: { id: string; testid: string; cls: string; label: string; wrapper?: boolean }) {
  const button = `<button id="${v.id}" data-testid="${v.testid}" class="${v.cls}" type="button">${v.label}</button>`;
  return `<!doctype html><html><body style="margin:0;font:16px sans-serif">
    <main style="padding:40px"><h1>Checkout</h1>
      <form id="f" onsubmit="return false">
        <label>Email <input name="email" type="email" placeholder="you@example.com" style="width:240px"></label>
        <div style="margin-top:24px;display:flex;gap:12px">
          ${v.wrapper ? `<div class="wrap"><span>${button}</span></div>` : button}
          <button id="cancel-btn" data-testid="cancel" type="button">Cancel</button>
        </div>
      </form>
      <div id="out" style="display:none">Order confirmed</div>
    </main>
    <script>document.querySelector('[data-testid="${v.testid}"]').addEventListener('click',()=>{document.getElementById('out').style.display='block'});
    document.querySelector('#cancel-btn').addEventListener('click',()=>{document.getElementById('out').textContent='Order cancelled';document.getElementById('out').style.display='block'});</script>
  </body></html>`;
}

export const ORIGINAL = { id: 'place-order', testid: 'place-order', cls: 'btn btn-primary', label: 'Place order' };
