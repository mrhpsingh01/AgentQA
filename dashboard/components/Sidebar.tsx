"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  BarChart3, 
  PlayCircle, 
  ShieldCheck, 
  Eye, 
  AlertTriangle, 
  Layers, 
  FileSpreadsheet, 
  Settings, 
  Zap,
  Radio
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { name: "Overview", href: "/", icon: BarChart3 },
  { name: "Test Runs", href: "/runs", icon: PlayCircle },
  { name: "Self-Healing Cache", href: "/healing", icon: ShieldCheck },
  { name: "Visual Regression", href: "/visual", icon: Eye },
  { name: "Flaky Quarantine", href: "/flaky", icon: AlertTriangle },
  { name: "Coverage Gaps", href: "/coverage", icon: Layers },
  { name: "Data-Driven Studio", href: "/data-driven", icon: FileSpreadsheet },
  { name: "Settings & Webhooks", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-border bg-[#060911] flex flex-col justify-between shrink-0 min-h-screen">
      <div>
        {/* Brand */}
        <div className="p-6 flex items-center gap-3 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary to-purple flex items-center justify-center text-white font-bold shadow-lg shadow-primary/20">
            <Zap className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="font-bold text-base tracking-tight text-white flex items-center gap-1.5">
              AgentQA
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                PRO
              </span>
            </div>
            <div className="text-xs text-slate-400">Autonomous QA Agent</div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-card text-white shadow-sm border border-border"
                    : "text-slate-400 hover:text-white hover:bg-card/50"
                )}
              >
                <Icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-slate-400")} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Connectivity Pill */}
      <div className="p-4 border-t border-border bg-[#04060c]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-medium text-slate-300">FastAPI & WS Connected</span>
          </div>
          <span className="text-[11px] font-mono text-slate-500">v1.0.0</span>
        </div>
      </div>
    </aside>
  );
}
