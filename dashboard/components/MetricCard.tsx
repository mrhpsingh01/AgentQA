import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  trend?: string;
  isPositive?: boolean;
  highlight?: boolean;
  icon?: LucideIcon;
}

export function MetricCard({ title, value, trend, isPositive = true, highlight = false, icon: Icon }: MetricCardProps) {
  return (
    <div
      className={cn(
        "p-5 rounded-xl border border-border bg-card transition-all",
        highlight 
          ? "border-purple/40 bg-gradient-to-b from-purple/10 to-card shadow-lg shadow-purple/5" 
          : "hover:border-slate-700 hover:bg-card-hover"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</span>
        {Icon && <Icon className={cn("w-4 h-4", highlight ? "text-purple" : "text-slate-500")} />}
      </div>
      <div className="text-3xl font-extrabold text-white mt-2 tracking-tight">{value}</div>
      {trend && (
        <div
          className={cn(
            "text-xs font-medium mt-2 flex items-center gap-1",
            highlight ? "text-purple font-semibold" : isPositive ? "text-emerald-400" : "text-rose-400"
          )}
        >
          {trend}
        </div>
      )}
    </div>
  );
}
