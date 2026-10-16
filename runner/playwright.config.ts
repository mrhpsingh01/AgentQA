import { defineConfig, devices } from '@playwright/test';

/**
 * Shared Playwright settings for the runner's own suites (levels, guardrails, demo, benchmark).
 * AGENTQA_BROWSER_CHANNEL=chrome|msedge reuses an installed browser; unset uses Playwright's bundled
 * Chromium (`npx playwright install chromium`, what CI does).
 */
export const sharedUse = {
  headless: true,
  channel: process.env.AGENTQA_BROWSER_CHANNEL || undefined,
  actionTimeout: 5000,
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['./src/reporters/agent-reporter.ts'], ['list']],
  use: { ...sharedUse, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: sharedUse.channel } }],
});
