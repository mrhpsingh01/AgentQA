"use client";

import { useEffect, useState } from "react";
import { 
  ShieldCheck, 
  Search, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  Zap, 
  Layers, 
  Sparkles,
  GitFork
} from "lucide-react";
import { Header } from "@/components/Header";
import { api, HealedSelector } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export default function HealingCachePage() {
  const [selectors, setSelectors] = useState<HealedSelector[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const loadCache = async () => {
    const data = await api.getHealedSelectors();
    setSelectors(data);
  };

  useEffect(() => {
    loadCache();
  }, []);

  const handleAccept = async (id: string) => {
    await api.acceptHealedSelector(id, true);
    await loadCache();
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this healed selector from cache? Subsequent runs will re-evaluate.")) {
      await api.deleteHealedSelector(id);
      await loadCache();
    }
  };

  const filtered = selectors.filter(
    (s) =>
      s.url_pattern.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.original_selector.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.healed_selector.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Header
        title="Self-Healing Selector Intelligence"
        subtitle="Redis & PostgreSQL shared cache with cross-repo component fingerprinting"
        onRefresh={loadCache}
      />

      {/* Cross-Repo Cache Explainer Banner */}
      <div className="p-4 rounded-xl border border-purple/30 bg-purple/10 flex items-start gap-3">
        <GitFork className="w-5 h-5 text-purple shrink-0 mt-0.5" />
        <div className="text-xs">
          <span className="font-bold text-white">Cross-Repo Intelligence Moat Active:</span>
          <p className="text-slate-300 mt-0.5">
            Healed selectors tagged with a <code className="text-purple font-mono">component_fingerprint</code> are automatically propagated across all repositories sharing the same UI design system or component library.
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by URL pattern, original or healed selector..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary"
          />
        </div>
        <span className="text-xs font-semibold text-slate-400">
          {selectors.length} cached selectors active
        </span>
      </div>

      {/* Selectors Table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0b101c] text-slate-400 border-b border-border uppercase font-semibold">
              <tr>
                <th className="py-3.5 px-4">URL Pattern</th>
                <th className="py-3.5 px-4">Original (Broken) Selector</th>
                <th className="py-3.5 px-4">Healed Working Selector</th>
                <th className="py-3.5 px-4">Confidence</th>
                <th className="py-3.5 px-4">Provider</th>
                <th className="py-3.5 px-4">Hit Count</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No cached selectors found.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-card-hover transition-colors">
                    <td className="py-3.5 px-4 font-mono text-slate-300 font-medium">
                      {item.url_pattern}
                      {item.component_fingerprint && (
                        <span className="block text-[10px] text-purple font-mono mt-0.5">
                          fp: {item.component_fingerprint}
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <code className="px-2 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono text-[11px] line-through block max-w-xs truncate">
                        {item.original_selector}
                      </code>
                    </td>

                    <td className="py-3.5 px-4">
                      <code className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11px] block max-w-xs truncate">
                        {item.healed_selector}
                      </code>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        {Math.round(item.confidence * 100)}%
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-400 capitalize">
                      {item.llm_provider}
                    </td>

                    <td className="py-3.5 px-4 font-mono font-semibold text-white">
                      {item.use_count}x
                    </td>

                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleAccept(item.id)}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded transition-colors"
                        title="Accept & lock verified fix"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="px-2 py-1 text-[11px] font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded transition-colors"
                        title="Delete from cache"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
