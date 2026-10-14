/**
 * AgentQA Programmatic Test Executor
 * Spawns Playwright test execution, manages environment variables,
 * and handles run orchestration from CLI or backend trigger.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

export interface ExecuteOptions {
  runId?: string;
  backendUrl?: string;
  testFile?: string;
  headed?: boolean;
}

export async function executePlaywrightSuite(options: ExecuteOptions = {}): Promise<number> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AGENTQA_RUN_ID: options.runId || '',
    AGENTQA_BACKEND_URL: options.backendUrl || 'http://localhost:8000',
  };

  const args: string[] = ['playwright', 'test'];
  if (options.testFile) {
    args.push(options.testFile);
  }
  if (options.headed) {
    args.push('--headed');
  }

  console.log(`[AgentQA Executor] Executing Playwright suite... (Run ID: ${options.runId || 'local'})`);

  return new Promise((resolve, reject) => {
    const child = spawn('npx', args, {
      shell: process.platform === 'win32',
      env,
      stdio: 'inherit'
    });

    child.on('close', (code) => {
      resolve(code || 0);
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

// If run directly from terminal
if (require.main === module) {
  const runId = process.argv[2] || `run_${Date.now()}`;
  executePlaywrightSuite({ runId })
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
