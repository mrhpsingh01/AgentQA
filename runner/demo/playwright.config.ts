import { defineConfig, devices } from '@playwright/test';
import { sharedUse } from '../playwright.config';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  reporter: [['../src/reporters/agent-reporter.ts']],
  outputDir: '../test-results/demo',
  use: { ...sharedUse, ...devices['Desktop Chrome'], channel: sharedUse.channel, viewport: { width: 1280, height: 800 } },
});
