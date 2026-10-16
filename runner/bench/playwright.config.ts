import { defineConfig, devices } from '@playwright/test';
import { sharedUse } from '../playwright.config';

export default defineConfig({
  testDir: '.',
  testMatch: 'bench.spec.ts',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: Number(process.env.AGENTQA_BENCH_TEST_TIMEOUT_MS) || 45_000,
  reporter: [['list']],
  outputDir: '../test-results/bench',
  use: { ...sharedUse, ...devices['Desktop Chrome'], channel: sharedUse.channel, viewport: { width: 1280, height: 800 } },
});
