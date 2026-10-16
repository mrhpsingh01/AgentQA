#!/usr/bin/env python3
"""
AgentQA live demo: one Playwright test, three states of the same app, real healing, no API key needed.

    python demo.py                # runs everything headless and prints the summary
    python demo.py --keep-server  # leave the demo shop running on :8765 afterwards

States (see demo/target_app/pages.py):
  original        the checkout the test was written against            -> passes, 0 heals needed
  refactored      every id / class / test id renamed, labels reworded   -> selectors break, AgentQA heals, assertions pass
  broken          refactor + a REAL bug (orders silently not created)   -> AgentQA finds the button, the assertions FAIL, no heal claimed
  broken-removed  refactor + the Place-order button deleted             -> AgentQA refuses (it will not click "Cancel")

Everything printed comes from the Playwright run: nothing is simulated. Levels 1, 3 and 4 run offline at $0;
the LLM levels (2 and 5) are skipped because no provider is configured.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "artifacts" / "demo"
STATES = ["original", "refactored", "broken", "broken-removed"]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))
from agentqa_tools import RUNNER, pick_channel, run_playwright, runner_ready  # noqa: E402

try:
    from rich import box
    from rich.console import Console
    from rich.markup import escape
    from rich.panel import Panel
    from rich.table import Table

    console: Console | None = Console(highlight=False)
except ImportError:  # `rich` is a declared dependency, but the demo still works without it
    console = None

    def escape(text: str) -> str:  # type: ignore[misc]
        return text


def out(text: str = "") -> None:
    if console:
        console.print(text)
    else:
        print(text)


def fmt_step(x: dict) -> str:
    timing = "" if x["status"] == "skipped" else f" {x['ms']}ms"
    return f"L{x['level']} {x['name']} [{x['status']}{timing}]"


def kb(n: float) -> str:
    return f"{n / 1024:.1f}KB"


# ------------------------------------------------------------------------------------------------ running
def run_state(state: str, base_url: str, channel: str | None, healing: bool = True) -> tuple[dict, str]:
    state_dir = OUT / (state if healing else f"{state}-plain")
    shutil.rmtree(state_dir, ignore_errors=True)
    state_dir.mkdir(parents=True, exist_ok=True)
    env = {
        **os.environ,
        "DEMO_URL": base_url,
        "DEMO_STATE": state,
        "AGENTQA_STORE_DIR": str(OUT / ("store" if healing else "store-plain")),
        "AGENTQA_HEALING": "on" if healing else "off",
        "AGENTQA_REPORT": str(state_dir / "report.json"),
        "AGENTQA_ARTIFACT_DIR": str(state_dir),
        "AGENTQA_RETRY_MS": "500",
        "AGENTQA_LLM": "auto",
    }
    # the demo shows the OFFLINE ladder: never let a stray backend / key turn on the LLM levels
    for k in ("AGENTQA_BACKEND_URL", "AGENTQA_API_KEY"):
        env.pop(k, None)
    if channel:
        env["AGENTQA_BROWSER_CHANNEL"] = channel
    proc = run_playwright("demo/playwright.config.ts", env, channel)
    report_path = state_dir / "report.json"
    if not report_path.exists():
        raise RuntimeError(f"Playwright produced no report for state {state!r}:\n{proc.stdout[-1500:]}\n{proc.stderr[-1500:]}")
    return json.loads(report_path.read_text(encoding="utf-8")), proc.stdout + proc.stderr


# ------------------------------------------------------------------------------------------------ summary
def describe(state: str, report: dict) -> dict:
    test = report["tests"][0]
    heals = test["heals"]
    valid = [h for h in heals if h["verdict"] == "validated"]
    blocked = test["blocked"]
    if test["status"] == "passed":
        verdict = "PASS"
        note = "0 heals needed"
    elif test["status"] == "healed":
        verdict = "PASS (valid heal)"
        note = f"{len(valid)} selector(s) healed, all assertions passed"
    elif blocked:
        verdict = "FAIL (refused to heal)"
        note = f"{blocked[0]['original']} blocked: {blocked[0]['blocked']['code']}"
    else:
        verdict = "FAIL (heal rejected)"
        note = f"{len(heals)} repair(s) applied but the assertions failed -> not counted"
    return {"state": state, "status": test["status"], "verdict": verdict, "note": note, "test": test, "valid": len(valid)}


def expectations(rows: dict[str, dict]) -> list[tuple[str, bool]]:
    return [
        ("plain Playwright fails on every changed state (the selectors really broke)", all(rows[x]["plain"]["status"] == "failed" for x in STATES if x != "original") and rows["original"]["plain"]["status"] == "passed"),
        ("original: passes with 0 heals", rows["original"]["status"] == "passed" and not rows["original"]["test"]["heals"]),
        ("refactored: heals and passes (every heal validated)", rows["refactored"]["status"] == "healed" and rows["refactored"]["valid"] >= 1),
        ("broken: FAILS, no heal claimed as valid", rows["broken"]["status"] == "failed" and rows["broken"]["valid"] == 0),
        ("broken-removed: FAILS and refuses to heal onto Cancel", rows["broken-removed"]["status"] == "failed" and bool(rows["broken-removed"]["test"]["blocked"]) and rows["broken-removed"]["valid"] == 0),
    ]


def print_summary(rows: dict[str, dict], dom: dict[str, dict]) -> None:
    out()
    if console:
        t = Table(title="AgentQA - one test, four states of the same checkout", box=box.SIMPLE_HEAVY)
        for col in ("State", "Plain Playwright", "AgentQA", "What happened"):
            t.add_column(col)
        styles = {"original": "green", "refactored": "green", "broken": "red", "broken-removed": "red"}
        for s in STATES:
            r = rows[s]
            plain = "PASS" if r["plain"]["status"] == "passed" else "FAIL"
            t.add_row(s, f"[{'green' if plain == 'PASS' else 'red'}]{plain}[/]", f"[{styles[s]}]{r['verdict']}[/{styles[s]}]", r["note"])
        console.print(t)
    else:
        for s in STATES:
            print(f"{s:15} plain={rows[s]['plain']['status']:7} {rows[s]['verdict']:26} {rows[s]['note']}")

    for s in ("refactored", "broken"):
        test = rows[s]["test"]
        for h in test["heals"]:
            steps = " -> ".join(fmt_step(x) for x in h["steps"])
            ratio = f"{kb(h['domBytesRaw'])} -> {kb(h['domBytesCompressed'])} ({h['domBytesRaw'] / max(h['domBytesCompressed'], 1):.1f}x smaller)"
            checks = [f"{'OK ' if st['ok'] else 'FAIL'} {st['title']}" for st in test["steps"]] or ["(no named assertion steps)"]
            body = "\n".join(
                [
                    f"failed selector   {h['original']}",
                    f"escalation        {steps}",
                    f"DOM compression   {ratio}",
                    f"proposed          {h['healed']}   confidence {h['confidence']:.0%}   level {h['level']} ({h['levelName']})",
                    f"assertions        " + "\n                  ".join(checks),
                    f"verdict           {h['verdict'].upper()} - {h['verdictReason']}",
                    f"latency / cost    {h['elapsedMs']}ms ladder time / ${h['llmCostUsd']:.4f} (offline, no LLM)",
                ]
            )
            title = f"{s} - heal of {h['original']}"
            (console.print(Panel(escape(body), title=escape(title), border_style="green" if h["verdict"] == "validated" else "red", expand=False)) if console else print(f"--- {title}\n{body}"))

    for s in ("broken-removed",):
        for b in rows[s]["test"]["blocked"]:
            steps = " -> ".join(f"L{x['level']} {x['status']}" for x in b["steps"])
            body = "\n".join(
                [
                    f"failed selector   {b['original']}",
                    f"escalation        {steps}",
                    f"refused because   {b['blocked']['code']}: {b['blocked']['reason']}",
                    "result            test FAILED. AgentQA did not click Cancel, so the removed button is reported as the regression it is.",
                ]
            )
            (console.print(Panel(escape(body), title=f"{s} - refusal", border_style="red", expand=False)) if console else print(f"--- {s} - refusal\n{body}"))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--keep-server", action="store_true", help="leave the demo shop running afterwards")
    ap.add_argument("--port", type=int, default=0, help="demo shop port (default: a free port)")
    args = ap.parse_args()

    if not runner_ready():
        print("Runner dependencies are missing. Run once:  cd runner && npm ci", file=sys.stderr)
        return 2

    from demo.target_app.server import serve_in_thread

    server, base_url = serve_in_thread(args.port)
    out(f"[bold]AgentQA demo[/bold] - demo shop at {base_url}  (8 headless Playwright runs, no API key)" if console else f"AgentQA demo - shop at {base_url}")
    shutil.rmtree(OUT / "store", ignore_errors=True)
    channel = pick_channel()

    started = time.time()
    rows: dict[str, dict] = {}
    try:
        for state in STATES:
            out(f"  running state: {state} ...")
            report, _log = run_state(state, base_url, channel)
            rows[state] = describe(state, report)
            plain, _ = run_state(state, base_url, channel, healing=False)
            ptest = plain["tests"][0]
            first = ptest["errors"][0].splitlines()[0] if ptest["errors"] else ""
            rows[state]["plain"] = {"status": ptest["status"], "error": first}
    finally:
        if not args.keep_server:
            server.shutdown()

    dom = {}
    for s in STATES:
        meta = OUT / s / f"{s}.dom.json"
        if meta.exists():
            dom[s] = json.loads(meta.read_text(encoding="utf-8"))

    print_summary(rows, dom)

    results = expectations(rows)
    (OUT / "summary.json").write_text(
        json.dumps(
            {
                "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "seconds": round(time.time() - started, 1),
                "states": {s: {k: v for k, v in rows[s].items() if k != "test"} | {"report": rows[s]["test"]} for s in STATES},
                "dom": dom,
                "expectations": [{"claim": c, "met": ok} for c, ok in results],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    out()
    for claim, ok in results:
        out(f"  [{'green' if ok else 'red'}]{'PASS' if ok else 'FAIL'}[/] {claim}" if console else f"  {'PASS' if ok else 'FAIL'} {claim}")
    out(f"\nEvidence written to {OUT.relative_to(ROOT)}  (reports, DOM snapshots, screenshots)")
    return 0 if all(ok for _, ok in results) else 1


if __name__ == "__main__":
    sys.exit(main())
