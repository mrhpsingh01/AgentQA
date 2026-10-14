/**
 * AgentQA Custom Playwright Reporter
 * Collects test execution outcomes, healing events, and durations,
 * and publishes results to the AgentQA Backend API.
 */

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import { sessionHealingTracker } from '../healing/healing-proxy';

export default class AgentQAReporter implements Reporter {
  private startTime: number = Date.now();
  private runId: string | null = process.env.AGENTQA_RUN_ID || null;
  private backendUrl: string = (process.env.AGENTQA_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
  private apiKey: string | null = process.env.AGENTQA_API_KEY || null;

  private healingEvents: any[] = [];
  private testResults: Array<{
    title: string;
    status: string;
    duration: number;
    errors: string[];
  }> = [];

  onBegin(config: FullConfig, suite: Suite): void {
    this.startTime = Date.now();
    this.healingEvents = [];
    console.log(`[AgentQA Reporter] Suite initiated with ${suite.allTests().length} test specs.`);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const errors = result.errors.map(e => e.message || '');
    this.testResults.push({
      title: test.title,
      status: result.status,
      duration: result.duration,
      errors
    });

    test.annotations.forEach(a => {
      if (a.type === 'agentqa-healing' && a.description) {
        try {
          this.healingEvents.push(JSON.parse(a.description));
        } catch (_) {}
      }
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    const totalDuration = Date.now() - this.startTime;
    const sessionEvents = sessionHealingTracker.getEvents();
    const healingEvents = this.healingEvents.length > 0 ? this.healingEvents : sessionEvents;

    let finalStatus = result.status;
    if (result.status === 'passed' && healingEvents.length > 0) {
      finalStatus = 'passed'; // or mark as healed
    }

    console.log(`\n========================================`);
    console.log(`AgentQA Test Execution Complete`);
    console.log(`Status: ${finalStatus.toUpperCase()}`);
    console.log(`Duration: ${totalDuration}ms`);
    console.log(`Self-Healing Events: ${healingEvents.length}`);
    console.log(`========================================\n`);

    if (this.runId) {
      try {
        const payload = {
          status: healingEvents.length > 0 && finalStatus === 'passed' ? 'healed' : finalStatus,
          duration_ms: totalDuration,
          results: {
            total_tests: this.testResults.length,
            passed: this.testResults.filter(t => t.status === 'passed').length,
            failed: this.testResults.filter(t => t.status === 'failed').length,
            tests: this.testResults
          },
          healing_events: healingEvents,
          screenshots: [],
          error_message: this.testResults.find(t => t.errors.length > 0)?.errors[0] || null
        };

        const res = await fetch(`${this.backendUrl}/api/v1/runs/${this.runId}/results`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {})
          },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          console.log(`[AgentQA Reporter] Successfully reported run ${this.runId} to backend.`);
        }
      } catch (err: any) {
        console.error(`[AgentQA Reporter] Could not send run report to backend: ${err.message}`);
      }
    }
  }

  printsToStdio(): boolean {
    return true;
  }
}
