"use client";

import { useState } from "react";
import { Play, RefreshCw, Sparkles, Terminal } from "lucide-react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  onTriggerRun?: () => void;
}

export function Header({ title, subtitle, onRefresh, onTriggerRun }: HeaderProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      await onRefresh();
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  return (
    <header className="flex items-center justify-between pb-6 mb-8 border-b border-border">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {onRefresh && (
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-300 bg-card hover:bg-[#1a2337] border border-border rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
            Sync
          </button>
        )}

        {onTriggerRun && (
          <button
            onClick={onTriggerRun}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover shadow-md shadow-primary/20 rounded-lg transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Trigger Test Run
          </button>
        )}
      </div>
    </header>
  );
}
