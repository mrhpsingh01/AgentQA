"use client";

import { useState } from "react";
import { Eye, Layers, CheckCircle2, SplitSquareVertical, ArrowRightLeft, ShieldAlert } from "lucide-react";
import { Header } from "@/components/Header";

export default function VisualRegressionPage() {
  const [selectedBranch, setSelectedBranch] = useState("main");
  const [selectedEnv, setSelectedEnv] = useState("staging");
  const [diffMode, setDiffMode] = useState<"pixel" | "semantic">("pixel");

  const MOCK_DIFFS = [
    {
      id: "diff_01",
      stepName: "Checkout Form - Payment Modal",
      pageUrl: "https://shop.saas.app/checkout",
      diffPercentage: 0.18,
      status: "changed",
      baselineTimestamp: "2 days ago",
      capturedTimestamp: "10 mins ago",
      semanticNote: "Button padding updated from px-4 to px-6; text label unchanged."
    },
    {
      id: "diff_02",
      stepName: "User Profile Header & Badges",
      pageUrl: "https://shop.saas.app/profile",
      diffPercentage: 0.0,
      status: "matched",
      baselineTimestamp: "1 day ago",
      capturedTimestamp: "10 mins ago",
      semanticNote: "Pixel-perfect match with golden baseline."
    }
  ];

  return (
    <div className="space-y-6">
      <Header
        title="Visual Regression Testing"
        subtitle="Side-by-side screenshot comparisons, pixel-diffing, and semantic-diffing across environments"
      />

      {/* Control Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Target Branch
            </label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-primary"
            >
              <option value="main">main (production baseline)</option>
              <option value="staging">staging</option>
              <option value="feature/redesign">feature/redesign</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Environment
            </label>
            <select
              value={selectedEnv}
              onChange={(e) => setSelectedEnv(e.target.value)}
              className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-primary"
            >
              <option value="staging">Staging</option>
              <option value="production">Production</option>
              <option value="local">Localhost</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block sm:hidden">
            Diff Mode
          </label>
          <div className="p-1 rounded-lg bg-background border border-border flex items-center gap-1">
            <button
              onClick={() => setDiffMode("pixel")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                diffMode === "pixel" ? "bg-primary text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Pixel Diff
            </button>
            <button
              onClick={() => setDiffMode("semantic")}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                diffMode === "semantic" ? "bg-primary text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Semantic AI Diff
            </button>
          </div>
        </div>
      </div>

      {/* Diffs List */}
      <div className="space-y-6">
        {MOCK_DIFFS.map((diff) => (
          <div key={diff.id} className="border border-border rounded-xl bg-card overflow-hidden">
            <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">{diff.stepName}</h3>
                  {diff.status === "changed" ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {diff.diffPercentage}% Variance
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Golden Match
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{diff.pageUrl}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => alert("Updated baseline screenshot saved for " + diff.stepName)}
                  className="px-3 py-1.5 text-xs font-semibold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg transition-colors"
                >
                  Accept as New Baseline
                </button>
              </div>
            </div>

            {/* Visual Comparison Stage */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#0b101c]/40">
              {/* Baseline View */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase">
                  <span>Golden Baseline ({diff.baselineTimestamp})</span>
                  <span className="text-emerald-400">Approved</span>
                </div>
                <div className="h-48 rounded-lg border border-border bg-[#050811] flex flex-col items-center justify-center p-4 text-center">
                  <div className="w-16 h-10 rounded border border-slate-700 bg-slate-800 flex items-center justify-center text-xs font-mono text-slate-400 mb-2">
                    UI
                  </div>
                  <span className="text-xs text-slate-400">Baseline Screenshot Snapshot</span>
                  <span className="text-[11px] text-slate-600 font-mono mt-1">1280x800 @ Desktop Chrome</span>
                </div>
              </div>

              {/* Latest Captured View */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase">
                  <span>Latest Run ({diff.capturedTimestamp})</span>
                  <span className={diff.status === "changed" ? "text-amber-400" : "text-emerald-400"}>
                    {diff.status === "changed" ? "Diff Highlighted" : "Matched"}
                  </span>
                </div>
                <div className="h-48 rounded-lg border border-border bg-[#050811] flex flex-col items-center justify-center p-4 text-center relative overflow-hidden">
                  <div className={`w-16 h-10 rounded border ${diff.status === "changed" ? "border-amber-500 bg-amber-500/10" : "border-slate-700 bg-slate-800"} flex items-center justify-center text-xs font-mono text-slate-400 mb-2`}>
                    UI
                  </div>
                  <span className="text-xs text-slate-400">Captured Step Screenshot</span>
                  <span className="text-[11px] text-slate-600 font-mono mt-1">
                    {diffMode === "semantic" ? diff.semanticNote : `Pixel difference: ${diff.diffPercentage}%`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
