"use client";

import { useState } from "react";
import { Layers, CheckCircle2, AlertCircle, Plus, Search } from "lucide-react";
import { Header } from "@/components/Header";
import { api, CoverageGapResult } from "@/lib/api";

export default function CoverageGapsPage() {
  const [sitemapInput, setSitemapInput] = useState(
    "/login\n/dashboard\n/checkout\n/settings/profile\n/settings/security/two-factor\n/billing/invoices/export\n/teams/invitations/bulk"
  );
  const [result, setResult] = useState<CoverageGapResult>({
    coverage_percentage: 71.4,
    total_routes_discovered: 7,
    tested_routes_count: 5,
    missing_coverage_routes: [
      "/settings/security/two-factor",
      "/billing/invoices/export"
    ]
  });

  const handleAnalyze = async () => {
    const routes = sitemapInput.split("\n").map((r) => r.trim()).filter(Boolean);
    const data = await api.getCoverageGaps(routes);
    setResult(data);
  };

  return (
    <div className="space-y-6">
      <Header
        title="Coverage-Gap Analysis"
        subtitle="Identifies uncovered pages and mission-critical user journeys across your web application"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Panel */}
        <div className="lg:col-span-1 p-6 rounded-xl border border-border bg-card space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            Discovered Application Routes
          </h3>
          <p className="text-xs text-slate-400">
            Paste application routes, sitemap endpoints, or Next.js app directory pages:
          </p>
          <textarea
            rows={8}
            value={sitemapInput}
            onChange={(e) => setSitemapInput(e.target.value)}
            className="w-full p-3 bg-background border border-border rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-primary"
          />
          <button
            onClick={handleAnalyze}
            className="w-full py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg transition-colors"
          >
            Compute Coverage Gaps
          </button>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Coverage Summary Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card">
              <span className="text-xs text-slate-400 font-semibold block">Total App Routes</span>
              <span className="text-2xl font-bold text-white mt-1 block">{result.total_routes_discovered}</span>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card">
              <span className="text-xs text-slate-400 font-semibold block">Tested Routes</span>
              <span className="text-2xl font-bold text-emerald-400 mt-1 block">{result.tested_routes_count}</span>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card">
              <span className="text-xs text-slate-400 font-semibold block">Coverage Score</span>
              <span className="text-2xl font-bold text-primary mt-1 block">{result.coverage_percentage}%</span>
            </div>
          </div>

          {/* Missing Routes List */}
          <div className="border border-border rounded-xl bg-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                Missing Test Coverage ({result.missing_coverage_routes.length} flows)
              </h3>
            </div>

            <div className="divide-y divide-border/60">
              {result.missing_coverage_routes.map((route, i) => (
                <div key={i} className="p-4 flex items-center justify-between hover:bg-card-hover transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    <span className="font-mono text-xs text-white">{route}</span>
                  </div>
                  <button
                    onClick={() => alert(`Open Chrome Extension on ${route} and click 'Start Recording'`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Record Test Flow
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
