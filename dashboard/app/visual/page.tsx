import Link from "next/link";
import { Header } from "@/components/Header";

export default function VisualRegressionPage() {
  return (
    <div className="space-y-6">
      <Header title="Screenshot change detection" subtitle="Encoded image byte comparison is available through the backend API." />
      <div className="p-5 rounded-xl border border-border bg-card text-sm text-slate-300 space-y-3">
        <p>This page has no recorded visual-regression results. The backend stores screenshot baselines and compares encoded bytes; decoded-pixel comparison and AI semantic diffing are not implemented.</p>
        <p>Level 4 selector healing uses DOM geometry and labels. Its evidence comes from live browser execution.</p>
        <Link href="/evidence" className="inline-block text-primary underline">View real checkout screenshots and repair traces</Link>
      </div>
    </div>
  );
}
