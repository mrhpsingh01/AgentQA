"use client";

import Link from "next/link";
import { CheckCircle2, ChevronRight, ShieldCheck, XCircle } from "lucide-react";
import { Header } from "@/components/Header";
import { MetricCard } from "@/components/MetricCard";
import { cn } from "@/lib/utils";
import { seed, STATE_META, STATE_ORDER } from "@/lib/demo";

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");

export function DemoOverview() {
  const det = seed.benchmark.summaries.deterministic;
  const std = seed.benchmark.summaries.standard;
  return (
    <div className="space-y-8">
      <Header
        title="Repair broken browser tests without hiding real application bugs"
        subtitle="Real results from python demo.py and the 50-scenario benchmark. Nothing on this page is simulated."
      />

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Correct repair rate" value={pct(det.positives_passed ?? 0, det.positives ?? 0)} trend={`${det.positives_passed}/${det.positives} refactors · Playwright alone ${std.positives_passed}/${std.positives}`} icon={CheckCircle2} />
        <MetricCard title="False-pass rate" value={pct(det.false_passes ?? 0, det.negatives ?? 0)} trend={`${det.false_passes}/${det.negatives} real bugs reported as passing`} highlight icon={ShieldCheck} />
        <MetricCard title="Fixed at $0.00" value={`${det.heals_free_offline}`} trend="validated heals, offline, no API key" />
        <MetricCard title="Ladder latency" value={det.latency_ms_median ? `${det.latency_ms_median.toFixed(0)} ms` : "n/a"} trend="median per heal" />
      </section>

      <section>
        <h2 className="text-sm font-bold text-white mb-3">One test, four states of the same checkout</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {STATE_ORDER.map((name) => {
            const s = seed.demo.states[name];
            const bad = s.status === "failed";
            return (
              <Link key={name} href="/evidence" className="rounded-xl border border-border bg-card p-4 hover:bg-card-hover transition-colors block">
                <div className="text-sm font-semibold text-white">{STATE_META[name].title}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{STATE_META[name].subtitle}</div>
                <div className={cn("mt-3 flex items-center gap-1.5 text-xs font-bold", bad ? "text-rose-300" : "text-emerald-300")}>
                  {bad ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {s.verdict}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">{s.note}</div>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="p-5 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-card to-card flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Inspect the repair evidence</h3>
          <p className="text-xs text-slate-400 mt-0.5">Toggle between the original, the healed refactor and the blocked broken app: screenshots, markup diff, ladder trace, assertions.</p>
        </div>
        <Link href="/evidence" className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-lg shrink-0">
          Open evidence <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <p className="text-[11px] text-slate-500">{seed.provenance} Generated {new Date(seed.generatedAt).toLocaleString()}.</p>
    </div>
  );
}
