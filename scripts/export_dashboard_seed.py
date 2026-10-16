#!/usr/bin/env python3
"""
Export the REAL results of `python demo.py` and `python scripts/run_benchmark.py` as the dashboard's demo seed.

    python demo.py && python scripts/run_benchmark.py && python scripts/export_dashboard_seed.py

Writes dashboard/lib/seed.json (data) and dashboard/public/demo/*.png (screenshots of each demo state). With
NEXT_PUBLIC_DEMO_MODE=true the dashboard renders exactly this data, so a reviewer who opens the deployed site sees
real execution traces without running anything. Nothing here is generated or invented: it is copied from artifacts.
"""

from __future__ import annotations

import json
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "artifacts" / "demo"
STATES = ["original", "refactored", "broken", "broken-removed"]
OUT_JSON = ROOT / "dashboard" / "lib" / "seed.json"
OUT_IMG = ROOT / "dashboard" / "public" / "demo"


def pretty_dom(html: str) -> list[str]:
    """One tag per line, so two snapshots can be diffed line by line in the browser."""
    return html.replace("><", ">\n<").split("\n")


def main() -> int:
    summary_file = DEMO / "summary.json"
    bench_file = ROOT / "BENCHMARK_RESULTS.json"
    missing = [p for p in (summary_file, bench_file) if not p.exists()]
    if missing:
        print("missing inputs (run `python demo.py` and `python scripts/run_benchmark.py` first): " + ", ".join(str(m) for m in missing), file=sys.stderr)
        return 2

    summary = json.loads(summary_file.read_text(encoding="utf-8"))
    bench = json.loads(bench_file.read_text(encoding="utf-8"))
    OUT_IMG.mkdir(parents=True, exist_ok=True)

    states = {}
    for s in STATES:
        info = summary["states"][s]
        dom_html = (DEMO / s / f"{s}.dom.html").read_text(encoding="utf-8")
        shot = DEMO / s / f"{s}.png"
        if shot.exists():
            shutil.copyfile(shot, OUT_IMG / f"{s}.png")
        states[s] = {
            "status": info["status"],
            "verdict": info["verdict"],
            "note": info["note"],
            "valid": info["valid"],
            "plain": info.get("plain", {}),
            "screenshot": f"/demo/{s}.png" if shot.exists() else None,
            "dom": summary["dom"].get(s, {}),
            "domLines": pretty_dom(dom_html),
            "test": info["report"],
        }

    seed = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "provenance": "Copied from `python demo.py` (artifacts/demo) and `python scripts/run_benchmark.py` (BENCHMARK_RESULTS.json). Not hand-written.",
        "demo": {"expectations": summary["expectations"], "seconds": summary["seconds"], "states": states},
        "benchmark": {
            "summaries": bench["summaries"],
            "scenarios": {m: bench["scenarios"].get(m, []) for m in ("standard", "deterministic", "strict")},
        },
    }
    OUT_JSON.write_text(json.dumps(seed, indent=1), encoding="utf-8")
    print(f"wrote {OUT_JSON.relative_to(ROOT)} ({OUT_JSON.stat().st_size // 1024} KB) and {len(list(OUT_IMG.glob('*.png')))} screenshot(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
