import { test, expect } from '@playwright/test';
import { healedClick, healedFill } from '../src/healing/healing-proxy';

test.describe('AgentQA Self-Healing Demonstration Suite', () => {

  test('verifies standard navigation and interaction', async ({ page }) => {
    // Navigate to local mock page
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>AgentQA Mock Web App</title></head>
        <body style="font-family: sans-serif; padding: 40px;">
          <h1>Welcome to SaaS Platform</h1>
          <form id="checkout-form">
            <div>
              <label for="username">Username</label>
              <input id="username" name="user_login" data-testid="username-input" type="text" />
            </div>
            <div style="margin-top: 15px;">
              <button id="submit-btn" data-testid="submit-btn" type="button">Log In</button>
            </div>
            <div id="status-message" style="display: none; margin-top: 20px; color: green;">Login Successful!</div>
          </form>

          <script>
            document.getElementById('submit-btn').addEventListener('click', () => {
              document.getElementById('status-message').style.display = 'block';
            });
          </script>
        </body>
      </html>
    `);

    // Standard Playwright interaction
    await page.getByTestId('username-input').fill('alice_saas');
    await page.getByTestId('submit-btn').click();

    // Verify success
    await expect(page.locator('#status-message')).toBeVisible();
    await expect(page.locator('#status-message')).toHaveText('Login Successful!');
  });

  test('demonstrates autonomous self-healing when selector breaks', async ({ page }) => {
    // Page with updated UI where previous ID `#old-login-btn` was renamed to `#submit-btn`
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>AgentQA Redesigned App</title></head>
        <body style="font-family: sans-serif; padding: 40px;">
          <h1>Checkout Redesign v2</h1>
          <form>
            <input name="email" data-testid="email-field" type="email" placeholder="user@example.com" />
            <button id="submit-btn" data-testid="submit-btn" type="button">Complete Purchase</button>
            <div id="confirmation" style="display: none; color: blue;">Order Placed!</div>
          </form>

          <script>
            document.getElementById('submit-btn').addEventListener('click', () => {
              document.getElementById('confirmation').style.display = 'block';
            });
          </script>
        </body>
      </html>
    `);

    // Step 1: Fill email
    await healedFill(page, '[data-testid="email-field"]', 'alice@company.com');

    // Step 2: Click using a BROKEN selector from old design: '#old-broken-checkout-button'
    // The self-healing engine intercepts the TimeoutError, captures the compressed DOM,
    // requests healing from AgentQA API, receives updated selector, and completes the click!
    await healedClick(page, '#old-broken-checkout-button', {
      elementInfo: {
        tagName: 'button',
        textPreview: 'Complete Purchase'
      },
      fallbackSelectors: [
        ['[data-testid="submit-btn"]'],
        ['aria/Complete Purchase'],
        ['#submit-btn']
      ]
    });

    // Verification: Click succeeded despite broken initial selector!
    await expect(page.locator('#confirmation')).toBeVisible();
  });
});
