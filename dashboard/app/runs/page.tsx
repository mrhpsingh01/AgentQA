"use client";

import { useEffect, useState } from "react";
import { 
  PlayCircle, 
  Search, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  Zap, 
  Terminal, 
  AlertCircle 
} from "lucide-react";
import { Header } from "@/components/Header";
import { StatusBadge } from "@/components/StatusBadge";
import { api, TestRun } from "@/lib/api";
import { formatDuration, formatDate } from "@/lib/utils";

export default function TestRunsPage() {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const loadRuns = async () => {
    const data = await api.getTestRuns();
    setRuns(data);
  };

  useEffect(() => {
    loadRuns();
  }, []);

  const filteredRuns = runs.filter((run) => {
    const matchesStatus = filterStatus === "all" || run.status === filterStatus;
    const matchesSearch =
      run.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      run.test_id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <Header
        title="Test Runs & Execution Traces"
        subtitle="Complete log of Playwright test executions, real-time durations, and self-healing events"
        onRefresh={loadRuns}
      />

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search run ID or test spec..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          {["all", "passed", "healed", "failed"].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors ${
                filterStatus === status
                  ? "bg-primary text-white"
                  : "bg-background text-slate-400 hover:text-white border border-border"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Runs Table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0b101c] text-slate-400 border-b border-border uppercase font-semibold">
              <tr>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Run ID / Test Spec</th>
                <th className="py-3.5 px-4">Duration</th>
                <th className="py-3.5 px-4">Browser</th>
                <th className="py-3.5 px-4">Self-Healing</th>
                <th className="py-3.5 px-4">Timestamp</th>
                <th className="py-3.5 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredRuns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No test runs match the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredRuns.map((run) => {
                  const isExpanded = expandedRunId === run.id;
                  return (
                    <React.Fragment key={run.id}>
                      <tr
                        onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                        className="hover:bg-card-hover cursor-pointer transition-colors"
                      >
                        <td className="py-3.5 px-4">
                          <StatusBadge status={run.status} />
                        </td>
                        <td className="py-3.5 px-4 font-mono font-medium text-white">
                          #{run.id.substring(0, 8)}
                          <span className="block text-[11px] text-slate-400 font-sans mt-0.5">
                            {run.test_id}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-300">
                          {formatDuration(run.duration_ms)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {run.results?.browser || "chromium"}
                        </td>
                        <td className="py-3.5 px-4">
                          {run.healing_events.length > 0 ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-purple bg-purple/10 px-2 py-0.5 rounded border border-purple/20">
                              <Zap className="w-3 h-3 fill-current" />
                              {run.healing_events.length} healed
                            </span>
                          ) : (
                            <span className="text-slate-500">None</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">{formatDate(run.created_at)}</td>
                        <td className="py-3.5 px-4 text-right text-slate-400">
                          {isExpanded ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
                        </td>
                      </tr>

                      {/* Expandable Trace View */}
                      {isExpanded && (
                        <tr className="bg-[#0b101c]/60">
                          <td colSpan={7} className="p-6 border-y border-border space-y-4">
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                              <Terminal className="w-4 h-4 text-primary" />
                              Execution & Self-Healing Trace
                            </h4>

                            {run.healing_events.length > 0 ? (
                              <div className="space-y-3">
                                {run.healing_events.map((evt, idx) => (
                                  <div
                                    key={idx}
                                    className="p-4 rounded-lg bg-card border border-purple/30 space-y-2 text-xs"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-semibold text-purple flex items-center gap-1.5">
                                        <Zap className="w-3.5 h-3.5 fill-current" />
                                        Self-Healing Event #{idx + 1} (Level {evt.strategyLevel} Escalation)
                                      </span>
                                      <span className="font-mono text-emerald-400 font-bold">
                                        {Math.round(evt.confidence * 100)}% Confidence
                                      </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                      <div>
                                        <span className="text-slate-400 block mb-1">Original Broken Selector:</span>
                                        <code className="px-2 py-1 bg-background text-rose-400 border border-border rounded font-mono text-[11px] block overflow-x-auto">
                                          {evt.originalSelector}
                                        </code>
                                      </div>
                                      <div>
                                        <span className="text-slate-400 block mb-1">Autonomous Healed Selector:</span>
                                        <code className="px-2 py-1 bg-background text-emerald-400 border border-border rounded font-mono text-[11px] block overflow-x-auto">
                                          {evt.healedSelector}
                                        </code>
                                      </div>
                                    </div>

                                    <p className="text-slate-300 italic pt-1">
                                      Reasoning: {evt.reasoning}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-slate-400 text-xs">
                                All locators resolved normally. Zero selector breaks occurred during this run.
                              </p>
                            )}

                            {run.error_message && (
                              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-300 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-bold">Error Output:</span> {run.error_message}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// React fragment wrapper for Next.js client component
import React from "react";
