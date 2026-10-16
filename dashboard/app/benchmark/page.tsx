"use client";

import { Header } from "@/components/Header";
import { MetricCard } from "@/components/MetricCard";
import { CheckCircle2, ShieldCheck, Target, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScenarioResult, seed } from "@/lib/demo";

const CATEGORIES = [
  "rename-id", "rename-testid", "restructure", "class-scramble", "text-variation", "combined-hard", "delayed-render",
  "negative-removed", "negative-decoy", "negative-broken",
];
const MODES: Array<{ key: string; label: string }> = [
  { key: "standard", label: "Standard Playwright" },
  { key: "deterministic", label: "AgentQA deterministic (L1·3·4)" },
  { key: "strict", label: "AgentQA strict" },
  { key: "full", label: "AgentQA + LLM (L2·5)" },
];
const LEVEL_NAMES: Record<string, string> = {
  "1": "Smart Retry", "3": "Multi-Selector Fallback", "4": "DOM Geometry & Layout Matcher", "2": "LLM DOM Repair", "5": "LLM Decompose & Rebuild",
};

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");

export default function BenchmarkPage() {
  const { summaries, scenarios } = seed.benchmark;
  const det = summaries.deterministic;
  const std = summaries.standard;
  const full = summaries.full;
  const byMode = (m: string): ScenarioResult[] => scenarios[m] ?? [];

  return (
    <div className="space-y-8">
      <Header
        title="Mutation Benchmark"
        subtitle={`${det.scenarios} scenarios · 6 UI patterns · realistic refactors plus real regressions that must NOT turn green`}
      />

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Correct repair rate" value={pct(det.positives_passed ?? 0, det.positives ?? 0)} trend={`${det.positives_passed}/${det.positives} harmless refactors · Playwright alone: ${std.positives_passed}/${std.positives}`} icon={CheckCircle2} />
        <MetricCard title="False-pass rate" value={pct(det.false_passes ?? 0, det.negatives ?? 0)} trend={`${det.false_passes}/${det.negatives} real bugs reported as passing`} highlight icon={ShieldCheck} />
        <MetricCard title="Fixed free, offline" value={`${det.heals_free_offline}`} trend="Levels 1·3·4 · $0.00 · no API key" icon={Zap} />
        <MetricCard title="Wrong-element attempts" value={`${det.wrong_element_attempts}/${det.wrong_element_denominator}`} trend="look-alike clicked when the right control was gone (assertion still failed the test)" isPositive={det.wrong_element_attempts === 0} icon={Target} />
      </section>

      {full && !full.skipped && (
        <section className="rounded-xl border border-border bg-card p-4 text-sm text-slate-300">
          <h2 className="text-sm font-bold text-white mb-2">AgentQA + LLM (Levels 2, 5): measured, not estimated</h2>
          <p className="text-xs text-slate-400 mb-3">Groq free tier, openai/gpt-oss-120b for both LLM levels. Single run, no fallback to other providers.</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 font-mono text-xs">
            <div><div className="text-slate-500">Repair rate</div><div className="text-emerald-300 text-lg">{pct(full.positives_passed ?? 0, full.positives ?? 0)}</div><div className="text-slate-500">{full.positives_passed}/{full.positives}</div></div>
            <div><div className="text-slate-500">False passes</div><div className="text-emerald-300 text-lg">{full.false_passes}/{full.negatives}</div></div>
            <div><div className="text-slate-500">Wrong element clicked</div><div className="text-amber-300 text-lg">{full.wrong_element_attempts}/{full.wrong_element_denominator}</div><div className="text-slate-500">vs {det.wrong_element_attempts}/{det.wrong_element_denominator} deterministic</div></div>
            <div><div className="text-slate-500">Heals needing an LLM</div><div className="text-lg">{full.heals_llm}</div><div className="text-slate-500">of {full.validated_heals}</div></div>
            <div><div className="text-slate-500">Mean latency / heal</div><div className="text-lg">{full.latency_ms_mean ? `${full.latency_ms_mean.toFixed(0)} ms` : "n/a"}</div><div className="text-slate-500">cost $0.00 (free tier)</div></div>
          </div>
          <p className="text-[11px] text-slate-500 mt-3">The LLM raised the repair rate but also clicked more look-alike controls; the assertions still failed those runs, so no false pass occurred. Not a precision upgrade.</p>
        </section>
      )}

      {full?.skipped && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 text-sm text-slate-300">
          <b className="text-white">LLM mode (C) was not run:</b> {full.skipped}. No LLM figure here is estimated or invented. Run{" "}
          <code className="font-mono text-xs">python scripts/run_benchmark.py --modes full</code> with a configured backend to produce it.
        </div>
      )}

      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border"><h2 className="text-sm font-bold text-white">Results by mutation category</h2>
          <p className="text-xs text-slate-400">Positive rows: scenarios passing. Negative rows: scenarios wrongly passing (must be 0).</p></div>
        <table className="w-full text-xs">
          <thead className="text-slate-400 text-left"><tr>
            <th className="p-3">Category</th><th className="p-3">n</th>
            {MODES.map((m) => <th key={m.key} className="p-3">{m.label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-border/60">
            {CATEGORIES.map((cat) => {
              const n = byMode("deterministic").filter((r) => r.category === cat).length;
              const neg = cat.startsWith("negative");
              return (
                <tr key={cat}>
                  <td className="p-3 font-mono text-slate-200">{cat}</td>
                  <td className="p-3 text-slate-400">{n}</td>
                  {MODES.map((m) => {
                    const passed = byMode(m.key).filter((r) => r.category === cat && r.passed).length;
                    const bad = neg && passed > 0;
                    return (
                      <td key={m.key} className={cn("p-3 font-mono", bad ? "text-rose-300" : neg ? "text-emerald-300" : passed === n ? "text-emerald-300" : passed === 0 ? "text-slate-500" : "text-amber-300")}>
                        {passed}/{n}{bad ? " false pass" : ""}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border"><h2 className="text-sm font-bold text-white">Which level fixed what</h2></div>
        <table className="w-full text-xs">
          <thead className="text-slate-400 text-left"><tr><th className="p-3">Level</th><th className="p-3">Name</th><th className="p-3">Validated heals</th><th className="p-3">Cost</th></tr></thead>
          <tbody className="divide-y divide-border/60">
            {["1", "3", "4", "2", "5"].map((lvl) => (
              <tr key={lvl}>
                <td className="p-3 font-mono">{lvl}</td>
                <td className="p-3 text-slate-200">{LEVEL_NAMES[lvl]}</td>
                <td className="p-3 font-mono">{det.heals_by_level?.[lvl] ?? 0}</td>
                <td className="p-3 text-slate-400">{["1", "3", "4"].includes(lvl) ? "$0.00, offline" : full?.skipped ? "not run (no LLM provider)" : `${full?.heals_by_level?.[lvl] ?? 0} heals in the LLM run (free tier, $0.00)`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-[11px] text-slate-500">
          Mean ladder latency per heal: {det.latency_ms_mean ? `${det.latency_ms_mean.toFixed(0)} ms` : "n/a"} (median {det.latency_ms_median?.toFixed(0)} ms), including Level 1&apos;s wait for late renders.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border"><h2 className="text-sm font-bold text-white">Real bugs: what AgentQA did</h2></div>
        <table className="w-full text-xs">
          <thead className="text-slate-400 text-left"><tr><th className="p-3">Scenario</th><th className="p-3">Result</th><th className="p-3">What happened</th></tr></thead>
          <tbody className="divide-y divide-border/60">
            {byMode("deterministic").filter((r) => r.kind === "negative").map((r) => (
              <tr key={r.id}>
                <td className="p-3"><div className="font-mono text-slate-200">{r.id}</div><div className="text-slate-500">{r.description}</div></td>
                <td className={cn("p-3 font-semibold", r.passed ? "text-rose-300" : "text-emerald-300")}>{r.passed ? "FALSE PASS" : "failed (correct)"}</td>
                <td className="p-3 text-slate-400">
                  {r.refused[0] ? <>refused <code className="font-mono">{r.refused[0].original}</code> ({r.refused[0].code})</>
                    : r.wrongElementAttempt ? <>clicked a look-alike <code className="font-mono">{r.primaryHealedTo}</code>; the assertion failed and the heal was rejected</>
                    : "healed the right control; the app is broken, so the assertion failed and the heal was rejected"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-[11px] text-slate-500">{seed.provenance} Generated {new Date(seed.generatedAt).toLocaleString()}. See BENCHMARK_RESULTS.md for the methodology and limits.</p>
    </div>
  );
}
