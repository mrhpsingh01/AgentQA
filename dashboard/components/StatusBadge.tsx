import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "passed" | "healed" | "failed" | "pending" | string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const s = status.toLowerCase();

  const configs: Record<string, { label: string; style: string }> = {
    passed: {
      label: "Passed",
      style: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    },
    healed: {
      label: "⚡ Healed",
      style: "bg-purple-500/20 text-purple-300 border-purple-500/30 font-bold animate-pulse",
    },
    failed: {
      label: "Failed",
      style: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    },
    pending: {
      label: "Running",
      style: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    },
  };

  const config = configs[s] || {
    label: status,
    style: "bg-slate-800 text-slate-300 border-border",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border uppercase tracking-wider",
        config.style,
        className
      )}
    >
      {config.label}
    </span>
  );
}
