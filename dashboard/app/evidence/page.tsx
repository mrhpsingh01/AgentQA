"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { Header } from "@/components/Header";
import { BackendRequired } from "@/components/BackendRequired";
import { cn } from "@/lib/utils";
import { diffLines } from "@/lib/diff";
import { DEMO_MODE, HealRecord, seed, STATE_META, STATE_ORDER, StateName } from "@/lib/demo";

const STATUS_CHIP: Record<string, string> = {
  selected: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  miss: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  skipped: "bg-slate-700/30 text-slate-500 border-slate-600/30",
  blocked: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

function kb(n: number) {
  return `${(n / 1024).toFixed(1)}KB`;
}

function tone(status: string) {
  return status === "failed" ? "rose" : "emerald";
}

function HealCard({ heal, accepted }: { heal: HealRecord; accepted: boolean }) {
  return (
    <div className={cn("rounded-xl border p-4 space-y-3", accepted ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5")}>
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
        <span className="px-2 py-1 rounded bg-rose-500/10 text-rose-300 line-through decoration-rose-400/60">{heal.original}</span>
        <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
        <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 break-all">{heal.healed}</span>
        <span className={cn("ml-auto px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border", accepted ? "border-emerald-500/40 text-emerald-300" : "border-rose-500/40 text-rose-300")}>
          {heal.verdict}
        </span>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Escalation ladder (cheapest first)</div>
        <ol className="flex flex-wrap items-center gap-2">
          {heal.steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className={cn("px-2 py-1 rounded border text-[11px]", STATUS_CHIP[s.status])} title={s.reason}>
                L{s.level} {s.name} · {s.status}
                {s.status !== "skipped" && <span className="opacity-70"> · {s.ms}ms</span>}
              </span>
              {i < heal.steps.length - 1 && <span className="text-slate-600">→</span>}
            </li>
          ))}
        </ol>
      </div>

      <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div>
          <dt className="text-slate-500">Confidence</dt>
          <dd className="mt-1">
            <div className="h-1.5 rounded bg-slate-800 overflow-hidden"><div className="h-full bg-primary" style={{ width: `${Math.round(heal.confidence * 100)}%` }} /></div>
            <span className="font-mono text-slate-200">{Math.round(heal.confidence * 100)}%</span>
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">DOM sent to repair</dt>
          <dd className="font-mono text-slate-200 mt-1">{kb(heal.domBytesRaw)} → {kb(heal.domBytesCompressed)} <span className="text-slate-500">({(heal.domBytesRaw / Math.max(heal.domBytesCompressed, 1)).toFixed(1)}x)</span></dd>
        </div>
        <div>
          <dt className="text-slate-500">Ladder time</dt>
          <dd className="font-mono text-slate-200 mt-1">{heal.elapsedMs} ms</dd>
        </div>
        <div>
          <dt className="text-slate-500">LLM cost</dt>
          <dd className="font-mono text-slate-200 mt-1">${heal.llmCostUsd.toFixed(4)} <span className="text-slate-500">(offline)</span></dd>
        </div>
      </dl>

      <p className="text-xs text-slate-400"><span className="text-slate-500">Why: </span>{heal.reasoning}</p>
      <p className={cn("text-xs font-medium", accepted ? "text-emerald-300" : "text-rose-300")}>{heal.verdictReason}</p>
    </div>
  );
}

export default function EvidencePage() {
  const [selected, setSelected] = useState<StateName>("refactored");
  const state = seed.demo.states[selected];
  const original = seed.demo.states.original;

  const diff = useMemo(() => diffLines(original.domLines, state.domLines), [original, state]);
  const changed = diff.filter((d) => d.kind !== "same");

  if (!DEMO_MODE && !seed?.demo) return <BackendRequired message="Repair evidence is produced by python demo.py." />;

  return (
    <div className="space-y-8">
      <Header
        title="Inspect Repair Evidence"
        subtitle="One Playwright test, written once against the original markup, run unchanged against four states of the same checkout"
      />

      <div role="tablist" className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {STATE_ORDER.map((name) => {
          const s = seed.demo.states[name];
          const active = name === selected;
          return (
            <button
              key={name}
              role="tab"
              aria-selected={active}
              onClick={() => setSelected(name)}
              className={cn(
                "text-left p-4 rounded-xl border transition-colors",
                active ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-card-hover",
              )}
            >
              <div className="text-sm font-semibold text-white">{STATE_META[name].title}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{STATE_META[name].subtitle}</div>
              <div className={cn("mt-3 inline-flex items-center gap-1.5 text-xs font-bold", tone(s.status) === "rose" ? "text-rose-300" : "text-emerald-300")}>
                {tone(s.status) === "rose" ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {s.verdict}
              </div>
            </button>
          );
        })}
      </div>

      <section aria-label="Outcome" className={cn("p-5 rounded-xl border", state.status === "failed" ? "border-rose-500/30 bg-rose-500/5" : "border-emerald-500/30 bg-emerald-500/5")}>
        <div className="flex items-center gap-2 text-white font-semibold">
          {state.status === "failed" ? <ShieldAlert className="w-5 h-5 text-rose-400" /> : <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
          {STATE_META[selected].title}: {state.verdict}
        </div>
        <p className="text-sm text-slate-300 mt-1">{state.note}</p>
        {state.plain && (
          <p className="text-xs text-slate-400 mt-2">
            Plain Playwright, same test: <b className={state.plain.status === "passed" ? "text-emerald-300" : "text-rose-300"}>{state.plain.status === "passed" ? "PASS" : "FAIL"}</b>
            {state.plain.error && <span className="font-mono text-slate-500"> · {state.plain.error.slice(0, 110)}</span>}
          </p>
        )}
        {selected === "broken" && (
          <p className="text-xs text-slate-400 mt-2">
            AgentQA found the right button (every heal below is a correct locator) and clicked it. The order was never created, so the original
            assertions failed and <b>none of the heals is counted</b>: the real bug stays visible.
          </p>
        )}
        {selected === "broken-removed" && (
          <p className="text-xs text-slate-400 mt-2">
            With Place order gone, the nearest control is <b>Cancel</b>. A healer that clicks it would make the test fail for the wrong reason, or pass
            for the wrong reason. AgentQA refuses instead.
          </p>
        )}
      </section>

      <section aria-label="Side by side" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[["Original", original.screenshot, "original"] as const, [STATE_META[selected].title, state.screenshot, selected] as const].map(([label, src, key]) => (
          <figure key={key + label} className="rounded-xl border border-border bg-card overflow-hidden">
            <figcaption className="px-4 py-2 text-xs font-semibold text-slate-300 border-b border-border">{label} (checkout view, as the browser rendered it)</figcaption>
            {src ? <img src={src} alt={`${label} checkout screenshot`} className="w-full" /> : <div className="p-8 text-xs text-slate-500">No screenshot recorded.</div>}
          </figure>
        ))}
      </section>

      <section aria-label="Markup diff" className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">What the refactor changed in the compressed DOM</h2>
          <span className="text-xs text-slate-400">
            {selected === "original" ? "baseline" : `${changed.length} changed line(s) vs Original`} · {kb(state.dom.rawBytes ?? 0)} → {kb(state.dom.compressedBytes ?? 0)}
          </span>
        </div>
        <pre className="p-4 text-[11px] leading-relaxed font-mono overflow-x-auto max-h-80 overflow-y-auto">
          {selected === "original" ? (
            <span className="text-slate-400">{state.domLines.slice(0, 40).join("\n")}{state.domLines.length > 40 ? "\n…" : ""}</span>
          ) : (
            changed.length === 0
              ? <span className="text-slate-500">identical to Original</span>
              : changed.map((d, i) => (
                <div key={i} className={d.kind === "add" ? "text-emerald-300" : "text-rose-300"}>
                  {d.kind === "add" ? "+ " : "- "}{d.text}
                </div>
              ))
          )}
        </pre>
      </section>

      {state.test.heals.length > 0 && (
        <section aria-label="Heals" className="space-y-3">
          <h2 className="text-lg font-bold text-white">Repairs applied during the run</h2>
          {state.test.heals.map((h, i) => (
            <HealCard key={i} heal={h} accepted={h.verdict === "validated"} />
          ))}
        </section>
      )}

      {state.test.blocked.length > 0 && (
        <section aria-label="Refusals" className="space-y-3">
          <h2 className="text-lg font-bold text-white">Repairs AgentQA refused</h2>
          {state.test.blocked.map((b, i) => (
            <div key={i} className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-2 text-xs">
              <div className="font-mono text-rose-300">{b.original}</div>
              <div className="text-slate-300"><b className="text-white">{b.blocked.code}</b>: {b.blocked.reason}</div>
              <ol className="flex flex-wrap gap-2">
                {b.steps.map((s, j) => (
                  <li key={j} className={cn("px-2 py-1 rounded border text-[11px]", STATUS_CHIP[s.status])} title={s.reason}>L{s.level} {s.name} · {s.status}</li>
                ))}
              </ol>
              <div className="text-slate-400">The test failed here. Nothing was clicked, so the missing button is reported as the regression it is.</div>
            </div>
          ))}
        </section>
      )}

      <section aria-label="Assertions" className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-bold text-white mb-3">The test&apos;s own assertions (these decide whether a heal counts)</h2>
        {state.test.steps.length === 0 ? (
          <p className="text-xs text-slate-500">The test stopped before reaching its assertions.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {state.test.steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                {s.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
                <span className={s.ok ? "text-slate-200" : "text-rose-300"}>{s.title}</span>
              </li>
            ))}
          </ul>
        )}
        {state.test.errors[0] && <pre className="mt-3 text-[11px] text-rose-300/80 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">{state.test.errors[0].split("\n").slice(0, 6).join("\n")}</pre>}
      </section>

      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-300">Raw evidence (JSON from the Playwright reporter)</summary>
        <pre className="mt-3 text-[11px] font-mono text-slate-400 overflow-x-auto max-h-96">{JSON.stringify({ heals: state.test.heals, blocked: state.test.blocked }, null, 2)}</pre>
      </details>

      <p className="text-[11px] text-slate-500">{seed.provenance} Generated {new Date(seed.generatedAt).toLocaleString()}.</p>
    </div>
  );
}
