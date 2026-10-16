"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  GitCompare,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { DEMO_MODE } from "@/lib/demo";

interface NavItem {
  name: string;
  href: string;
  icon: typeof BarChart3;
  /** shown in the read-only demo (everything else needs the live backend) */
  demo: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { name: "Overview", href: "/", icon: BarChart3, demo: true },
  { name: "Repair Evidence", href: "/evidence", icon: GitCompare, demo: true },
  { name: "Benchmark", href: "/benchmark", icon: FlaskConical, demo: true },
  { name: "Test Runs", href: "/runs", icon: PlayCircle, demo: true },
  { name: "Healed Selectors", href: "/healing", icon: ShieldCheck, demo: true },
  { name: "Visual Regression", href: "/visual", icon: Eye, demo: false },
  { name: "Flaky Quarantine", href: "/flaky", icon: AlertTriangle, demo: false },
  { name: "Coverage Gaps", href: "/coverage", icon: Layers, demo: false },
  { name: "Data-Driven Studio", href: "/data-driven", icon: FileSpreadsheet, demo: false },
  { name: "Settings & Webhooks", href: "/settings", icon: Settings, demo: false },
];

export function Sidebar() {
  const pathname = usePathname();
  const [online, setOnline] = useState<boolean | null>(DEMO_MODE ? true : null);

  useEffect(() => {
    if (DEMO_MODE) return;
    api.ping().then(setOnline);
  }, []);

  const items = NAV_ITEMS.filter((i) => !DEMO_MODE || i.demo);

  return (
    <aside className="w-64 border-r border-border bg-[#060911] flex flex-col justify-between shrink-0 min-h-screen">
      <div>
        <div className="p-6 flex items-center gap-3 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary to-purple flex items-center justify-center text-white font-bold shadow-lg shadow-primary/20">
            <Zap className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="font-bold text-base tracking-tight text-white">AgentQA</div>
            <div className="text-xs text-slate-400">Self-healing that checks itself</div>
          </div>
        </div>

        <nav className="p-3 space-y-1">
          {items.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive ? "bg-card text-white shadow-sm border border-border" : "text-slate-400 hover:text-white hover:bg-card/50",
                )}
              >
                <Icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-slate-400")} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-border bg-[#04060c]">
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex rounded-full h-2 w-2", online === null ? "bg-amber-400" : online ? "bg-emerald-500" : "bg-rose-500")} />
          <span className="text-xs font-medium text-slate-300">
            {DEMO_MODE ? "Read-only demo: real recorded runs" : online === null ? "Checking backend..." : online ? "Backend connected" : "Backend unreachable"}
          </span>
        </div>
      </div>
    </aside>
  );
}
