import { AlertCircle } from "lucide-react";

/** Honest empty state: shown instead of invented data when the backend (or a feature) is unavailable. */
export function BackendRequired({ message }: { message: string }) {
  return (
    <div className="p-6 rounded-xl border border-amber-500/30 bg-amber-500/5 flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
      <div className="text-sm">
        <div className="font-semibold text-white">No data to show</div>
        <p className="text-slate-300 mt-1">{message}</p>
        <p className="text-slate-500 text-xs mt-2">
          Start the backend (<code className="font-mono">cd backend &amp;&amp; uv run uvicorn src.main:app</code>) or open the read-only demo
          (<code className="font-mono">NEXT_PUBLIC_DEMO_MODE=true</code>), which shows real recorded runs.
        </p>
      </div>
    </div>
  );
}
