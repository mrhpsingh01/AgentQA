"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";
import { Header } from "@/components/Header";
import { api, FlakyTest } from "@/lib/api";

export default function FlakyQuarantinePage() {
  const [flakyTests, setFlakyTests] = useState<FlakyTest[]>([]);

  const loadFlaky = async () => {
    const data = await api.getFlakyTests();
    setFlakyTests(data);
  };

  useEffect(() => {
    loadFlaky();
  }, []);

  const toggleQuarantine = (testId: string) => {
    setFlakyTests((prev) =>
      prev.map((t) =>
        t.test_id === testId ? { ...t, is_quarantined: !t.is_quarantined } : t
      )
    );
  };

  return (
    <div className="space-y-6">
      <Header
        title="Flaky Test Detection & Quarantine"
        subtitle="Automatic detection of non-deterministic test suites to protect CI/CD build reliability"
        onRefresh={loadFlaky}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {flakyTests.map((test) => (
          <div key={test.test_id} className="p-6 rounded-xl border border-border bg-card space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white">{test.title}</h3>
                <span className="text-xs font-mono text-slate-400">{test.test_id}</span>
              </div>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-full border uppercase ${
                  test.is_quarantined
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    : "bg-slate-800 text-slate-300 border-border"
                }`}
              >
                {test.is_quarantined ? "Quarantined" : "Active in CI"}
              </span>
            </div>

            {/* Flakiness Metrics */}
            <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-[#0b101c] text-center">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Flakiness</span>
                <span className="text-base font-bold text-amber-400">
                  {Math.round(test.flakiness_score * 100)}%
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Passes</span>
                <span className="text-base font-bold text-emerald-400">{test.pass_count}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Failures</span>
                <span className="text-base font-bold text-rose-400">{test.fail_count}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-xs text-slate-400">
                {test.is_quarantined
                  ? "Test runs in shadow mode (won't block PRs)"
                  : "Failures will block PR merges"}
              </span>
              <button
                onClick={() => toggleQuarantine(test.test_id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  test.is_quarantined
                    ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30"
                }`}
              >
                {test.is_quarantined ? "Un-Quarantine" : "Quarantine Spec"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
