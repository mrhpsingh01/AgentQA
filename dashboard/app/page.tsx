"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  PlayCircle, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  Sparkles, 
  ExternalLink, 
  Zap, 
  ChevronRight,
  Trash2,
  Check
} from "lucide-react";
import { Header } from "@/components/Header";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { api, OverviewMetrics, TestRun, HealedSelector } from "@/lib/api";
import { BackendRequired } from "@/components/BackendRequired";
import { DemoOverview } from "@/components/DemoOverview";
import { DEMO_MODE } from "@/lib/demo";
import { formatDuration, formatDate } from "@/lib/utils";

export default function OverviewPage() {
  return DEMO_MODE ? <DemoOverview /> : <LiveOverview />;
}

function LiveOverview() {
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [cachedSelectors, setCachedSelectors] = useState<HealedSelector[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [m, r, c] = await Promise.all([
        api.getOverviewMetrics(),
        api.getTestRuns(),
        api.getHealedSelectors(),
      ]);
      setMetrics(m);
      setRuns(r);
      setCachedSelectors(c);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The backend could not be reached.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAcceptSelector = async (id: string) => {
    await api.acceptHealedSelector(id, true);
    await loadData();
  };

  const handleDeleteSelector = async (id: string) => {
    if (confirm("Remove this healed selector from cache?")) {
      await api.deleteHealedSelector(id);
      await loadData();
    }
  };

  return (
    <div className="space-y-8">
      <Header
        title="QA Automation Overview"
        subtitle="Real-time test execution health, self-healing metrics, and selector intelligence"
        onRefresh={loadData}
        onTriggerRun={async () => {
          if (runs.length > 0) {
            await api.triggerTestRun(runs[0].test_id);
            await loadData();
          }
        }}
      />

      {error && <BackendRequired message={error} />}

      {/* KPI Metrics */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Test Runs"
          value={metrics ? metrics.total_runs : "..."}
          trend="runs recorded by the backend"
          icon={PlayCircle}
        />
        <MetricCard
          title="Suite Pass Rate"
          value={metrics ? `${metrics.pass_rate_pct}%` : "..."}
          trend="runs that passed or healed"
          icon={CheckCircle2}
        />
        <MetricCard
          title="Self-Healing Events"
          value={metrics ? metrics.total_healing_events : "..."}
          trend={metrics ? `${metrics.healing_success_rate_pct}% of repairs validated` : undefined}
          highlight
          icon={Zap}
        />
        <MetricCard
          title="Verified selectors in cache"
          value={metrics ? metrics.active_healed_selectors_in_cache : "..."}
          trend="repairs proven by passing assertions"
          icon={Clock}
        />
      </section>

      {/* Extension Quick Launch Banner */}
      <div className="p-5 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-card to-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Record New User Flow with Chrome Extension</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Navigate your web app, click & type. AgentQA records interactions, generates Page Object Models, and exports Playwright tests.
            </p>
          </div>
        </div>
        <Link
          href="/runs"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-lg transition-colors shrink-0"
        >
          View Test Specs <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Main Content Grid: Recent Runs & Healed Selectors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Test Runs */}
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white">Recent Test Runs</h2>
              <p className="text-xs text-slate-400">Latest CI/CD and manual executions</p>
            </div>
            <Link
              href="/runs"
              className="text-xs font-semibold text-primary hover:text-primary-hover flex items-center gap-1"
            >
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="divide-y divide-border/60">
            {runs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No test runs recorded yet.</div>
            ) : (
              runs.slice(0, 5).map((run) => (
                <div key={run.id} className="p-4 flex items-center justify-between hover:bg-card-hover/50 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={run.status} />
                      <span className="text-xs font-mono font-medium text-slate-300">
                        #{run.id.substring(0, 8)}
                      </span>
                      {run.healing_events.length > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple/20 text-purple border border-purple/30">
                          ⚡ {run.healing_events.length} Healed
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">{formatDate(run.created_at)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono text-slate-300">{formatDuration(run.duration_ms)}</div>
                    <div className="text-[11px] text-slate-500">{run.results?.browser || "chromium"}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Self-Healing Intelligence (Redis & DB) */}
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white">Healed Selector Cache</h2>
              <p className="text-xs text-slate-400">Autonomous repairs active across environments</p>
            </div>
            <Link
              href="/healing"
              className="text-xs font-semibold text-primary hover:text-primary-hover flex items-center gap-1"
            >
              Manage <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="divide-y divide-border/60">
            {cachedSelectors.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No healed selectors cached. Automatic self-healing will populate this when tests run.
              </div>
            ) : (
              cachedSelectors.slice(0, 4).map((item) => (
                <div key={item.id} className="p-4 space-y-2 hover:bg-card-hover/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-slate-400">{item.url_pattern}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {Math.round(item.confidence * 100)}% match
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        used {item.use_count}x
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <code className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono text-[11px] line-through">
                      {item.original_selector}
                    </code>
                    <span className="text-slate-500 font-bold">→</span>
                    <code className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11px]">
                      {item.healed_selector}
                    </code>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
