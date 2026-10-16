import { expect, test } from '@playwright/test';
import { makeAgent, serve } from './helpers';

const LATE = `<!doctype html><body><h1>Late page</h1><div id="host"></div><div id="out" style="display:none">done</div>
<script>setTimeout(()=>{const b=document.createElement('button');b.id='late-btn';b.textContent='Continue';
b.onclick=()=>{document.getElementById('out').style.display='block'};document.getElementById('host').appendChild(b)},700)</script></body>`;

test.describe('Level 1 - Smart Retry (deterministic, $0, offline)', () => {
  test('a control that renders late is found by re-resolving; nothing is replaced', async ({ page }) => {
    await serve(page, LATE);
    const { aq } = makeAgent(page, { actionTimeoutMs: 150, ladder: { retryMs: 2000, minConfidence: 0.7 } });

    await aq.click('#late-btn');
    await expect(page.locator('#out')).toBeVisible();
    aq.noteAssertion();
    await aq.finalize();

    expect(aq.heals).toHaveLength(1);
    const h = aq.heals[0];
    expect(h.level).toBe(1);
    expect(h.healed).toBe(h.original); // no selector change at all
    expect(h.llmCostUsd).toBe(0);
    expect(h.verdict).toBe('validated');
    expect(h.steps[0]).toMatchObject({ level: 1, status: 'selected' });
  });

  test('a control that never appears is not invented: the ladder moves on and refuses', async ({ page }) => {
    await serve(page, '<!doctype html><body><h1>Nothing here</h1></body>');
    const { aq } = makeAgent(page, { actionTimeoutMs: 100, ladder: { retryMs: 300, minConfidence: 0.7 } });
    await expect(aq.click('#never')).rejects.toThrow(/refused to heal/);
    expect(aq.blockedRecords[0].steps[0]).toMatchObject({ level: 1, status: 'miss' });
  });
});
