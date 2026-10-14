/**
 * AgentQA - Multi-Format Test Code Generator & Exporter
 * Generates runnable test scripts for Playwright (TS/Python), Cypress, Selenium, and Puppeteer Replay JSON.
 */

(function (global) {
  'use strict';

  function exportAsPlaywrightTS(steps, meta = {}) {
    const title = meta.title || 'Recorded User Flow';
    let code = `import { test, expect } from '@playwright/test';\n\n`;
    code += `test.describe('${escapeString(title)}', () => {\n`;
    code += `  test('executes recorded interaction flow', async ({ page }) => {\n`;

    for (const step of steps) {
      if (step.type === 'navigate') {
        code += `    // Navigate to ${step.url}\n`;
        code += `    await page.goto('${escapeString(step.url)}');\n`;
      } else if (step.type === 'click') {
        const locatorStr = getPlaywrightLocator(step.selectors);
        const preview = step.elementInfo?.textPreview ? ` [${step.elementInfo.textPreview}]` : '';
        code += `    // Click ${preview}\n`;
        code += `    await ${locatorStr}.click();\n`;
      } else if (step.type === 'change') {
        const locatorStr = getPlaywrightLocator(step.selectors);
        const val = step.isMasked ? 'your_password_here' : step.value;
        code += `    // Fill input with "${escapeString(val)}"\n`;
        code += `    await ${locatorStr}.fill('${escapeString(val)}');\n`;
      } else if (step.type === 'keyDown') {
        code += `    // Press keyboard key ${step.key}\n`;
        code += `    await page.keyboard.press('${step.key}');\n`;
      } else if (step.type === 'scroll') {
        code += `    // Scroll to (${step.scrollX}, ${step.scrollY})\n`;
        code += `    await page.evaluate(({x, y}) => window.scrollTo(x, y), { x: ${step.scrollX}, y: ${step.scrollY} });\n`;
      } else if (step.type === 'submit') {
        const locatorStr = getPlaywrightLocator(step.selectors);
        code += `    // Submit form\n`;
        code += `    await ${locatorStr}.dispatchEvent('submit');\n`;
      }
    }

    code += `  });\n`;
    code += `});\n`;

    return {
      fileName: 'agentqa-test.spec.ts',
      mimeType: 'text/typescript',
      content: code
    };
  }

  function exportAsPlaywrightPython(steps, meta = {}) {
    const title = meta.title || 'Recorded User Flow';
    let code = `import re\nfrom playwright.sync_api import Playwright, sync_playwright, expect\n\n`;
    code += `def test_recorded_flow(playwright: Playwright) -> None:\n`;
    code += `    browser = playwright.chromium.launch(headless=False)\n`;
    code += `    context = browser.new_context()\n`;
    code += `    page = context.new_page()\n\n`;

    for (const step of steps) {
      if (step.type === 'navigate') {
        code += `    # Navigate to ${step.url}\n`;
        code += `    page.goto("${escapeString(step.url)}")\n`;
      } else if (step.type === 'click') {
        const pyLocator = getPlaywrightPythonLocator(step.selectors);
        code += `    # Click element\n`;
        code += `    ${pyLocator}.click()\n`;
      } else if (step.type === 'change') {
        const pyLocator = getPlaywrightPythonLocator(step.selectors);
        const val = step.isMasked ? 'your_password_here' : step.value;
        code += `    # Fill input\n`;
        code += `    ${pyLocator}.fill("${escapeString(val)}")\n`;
      } else if (step.type === 'keyDown') {
        code += `    page.keyboard.press("${step.key}")\n`;
      }
    }

    code += `\n    # Teardown\n`;
    code += `    context.close()\n`;
    code += `    browser.close()\n`;

    return {
      fileName: 'test_recorded_flow.py',
      mimeType: 'text/x-python',
      content: code
    };
  }

  function exportAsCypress(steps, meta = {}) {
    const title = meta.title || 'Recorded User Flow';
    let code = `describe('${escapeString(title)}', () => {\n`;
    code += `  it('executes recorded interaction flow', () => {\n`;

    for (const step of steps) {
      if (step.type === 'navigate') {
        code += `    cy.visit('${escapeString(step.url)}');\n`;
      } else if (step.type === 'click') {
        const selector = getCssOrFallback(step.selectors);
        code += `    cy.get('${escapeString(selector)}').click();\n`;
      } else if (step.type === 'change') {
        const selector = getCssOrFallback(step.selectors);
        const val = step.isMasked ? 'your_password_here' : step.value;
        code += `    cy.get('${escapeString(selector)}').clear().type('${escapeString(val)}');\n`;
      } else if (step.type === 'keyDown') {
        code += `    cy.focused().type('{${step.key.toLowerCase()}}');\n`;
      }
    }

    code += `  });\n`;
    code += `});\n`;

    return {
      fileName: 'agentqa-cypress.cy.js',
      mimeType: 'application/javascript',
      content: code
    };
  }

  function exportAsSeleniumPython(steps, meta = {}) {
    let code = `from selenium import webdriver\n`;
    code += `from selenium.webdriver.common.by import By\n`;
    code += `from selenium.webdriver.support.ui import WebDriverWait\n`;
    code += `from selenium.webdriver.support import expected_conditions as EC\n`;
    code += `import time\n\n`;
    code += `driver = webdriver.Chrome()\n`;
    code += `wait = WebDriverWait(driver, 10)\n\n`;
    code += `try:\n`;

    for (const step of steps) {
      if (step.type === 'navigate') {
        code += `    driver.get("${escapeString(step.url)}")\n`;
      } else if (step.type === 'click') {
        const cssSel = getCssOrFallback(step.selectors);
        code += `    wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "${escapeString(cssSel)}"))).click()\n`;
      } else if (step.type === 'change') {
        const cssSel = getCssOrFallback(step.selectors);
        const val = step.isMasked ? 'your_password_here' : step.value;
        code += `    el = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "${escapeString(cssSel)}")))\n`;
        code += `    el.clear()\n`;
        code += `    el.send_keys("${escapeString(val)}")\n`;
      } else if (step.type === 'keyDown') {
        code += `    # Key down: ${step.key}\n`;
      }
    }

    code += `finally:\n`;
    code += `    time.sleep(2)\n`;
    code += `    driver.quit()\n`;

    return {
      fileName: 'selenium_test.py',
      mimeType: 'text/x-python',
      content: code
    };
  }

  function exportAsJSON(steps, meta = {}) {
    const payload = {
      title: meta.title || `Recorded-Flow-${new Date().toISOString()}`,
      timeout: 5000,
      createdAt: new Date().toISOString(),
      steps: steps
    };

    return {
      fileName: 'agentqa-recording.json',
      mimeType: 'application/json',
      content: JSON.stringify(payload, null, 2)
    };
  }

  // --- Helper Functions ---

  function getPlaywrightLocator(selectors) {
    if (!selectors || selectors.length === 0) return `page.locator('body')`;

    // 1. Check for data-testid
    for (const selGroup of selectors) {
      const s = selGroup[0];
      if (s && s.startsWith('[data-testid=')) {
        const match = s.match(/\[data-testid="?([^"\]]+)"?\]/);
        if (match) return `page.getByTestId('${escapeString(match[1])}')`;
      }
    }

    // 2. Check for aria/
    for (const selGroup of selectors) {
      const s = selGroup[0];
      if (s && s.startsWith('aria/')) {
        const ariaName = s.replace('aria/', '');
        return `page.getByRole('button', { name: '${escapeString(ariaName)}' })`;
      }
    }

    // 3. Fallback to first selector
    const first = selectors[0][0];
    if (first.startsWith('xpath/')) {
      return `page.locator('${escapeString(first.replace('xpath/', ''))}')`;
    }
    return `page.locator('${escapeString(first)}')`;
  }

  function getPlaywrightPythonLocator(selectors) {
    if (!selectors || selectors.length === 0) return `page.locator("body")`;

    for (const selGroup of selectors) {
      const s = selGroup[0];
      if (s && s.startsWith('[data-testid=')) {
        const match = s.match(/\[data-testid="?([^"\]]+)"?\]/);
        if (match) return `page.get_by_test_id("${escapeString(match[1])}")`;
      }
    }

    for (const selGroup of selectors) {
      const s = selGroup[0];
      if (s && s.startsWith('aria/')) {
        const ariaName = s.replace('aria/', '');
        return `page.get_by_role("button", name="${escapeString(ariaName)}")`;
      }
    }

    const first = selectors[0][0];
    if (first.startsWith('xpath/')) {
      return `page.locator("${escapeString(first.replace('xpath/', ''))}")`;
    }
    return `page.locator("${escapeString(first)}")`;
  }

  function getCssOrFallback(selectors) {
    if (!selectors || selectors.length === 0) return 'body';

    for (const selGroup of selectors) {
      const s = selGroup[0];
      if (s && !s.startsWith('aria/') && !s.startsWith('xpath/')) {
        return s;
      }
    }
    return selectors[0][0];
  }

  function escapeString(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

  function triggerDownload(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.AgentQAExporter = {
    exportAsPlaywrightTS,
    exportAsPlaywrightPython,
    exportAsCypress,
    exportAsSeleniumPython,
    exportAsJSON,
    triggerDownload
  };
})(typeof window !== 'undefined' ? window : this);
