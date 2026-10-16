#!/usr/bin/env python3
"""
AgentQA mutation benchmark: runs the 50-scenario suite in each mode and writes BENCHMARK_RESULTS.{md,json}.

    python scripts/run_benchmark.py                          # the three offline modes (about 6 minutes, no API key)
    python scripts/run_benchmark.py --modes full             # LLM mode only (needs a backend with a provider, see below)
    python scripts/run_benchmark.py --modes standard,deterministic
    python scripts/run_benchmark.py --aggregate-only         # rebuild the report from artifacts/bench/*.json

Modes
  standard       plain Playwright semantics (same test code, healing off)             -> the baseline
  deterministic  AgentQA Levels 1, 3, 4 (offline, $0)                                 -> default configuration
  strict         deterministic + Level 4 needs word overlap with the original label    -> precision-oriented
  full           deterministic + LLM Levels 2 and 5 through the AgentQA backend        -> needs AGENTQA_BACKEND_URL,
                                                                                         AGENTQA_API_KEY and a provider
                                                                                         (GEMINI_API_KEY / ANTHROPIC_API_KEY /
                                                                                         OLLAMA_HOST) on that backend.
                                                                                         Not run (and reported as such) otherwise.

Every number comes from executing the runner against real pages in a real browser; nothing here is estimated
except the LLM token cost, which the backend reports as an estimate.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from agentqa_tools import ROOT, pick_channel, run_playwright, runner_ready  # noqa: E402

ARTIFACTS = ROOT / "artifacts" / "bench"
MODES = ["standard", "deterministic", "strict", "full"]
MODE_LABEL = {
    "standard": "A. Standard Playwright",
    "deterministic": "B. AgentQA deterministic (Levels 1, 3, 4)",
    "strict": "B'. AgentQA deterministic, strict",
    "full": "C. AgentQA full (LLM Levels 2, 5)",
}
CATEGORY_ORDER = [
    "rename-id", "rename-testid", "restructure", "class-scramble", "text-variation", "combined-hard", "delayed-render",
    "negative-removed", "negative-decoy", "negative-broken",
]
LEVEL_NAMES = {1: "Smart Retry", 2: "LLM DOM Repair", 3: "Multi-Selector Fallback", 4: "DOM Geometry & Layout Matcher", 5: "LLM Decompose & Rebuild"}


def run_mode(mode: str, channel: str | None) -> Path:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    out = ARTIFACTS / f"{mode}.json"
    out.unlink(missing_ok=True)
    started = time.time()
    proc = run_playwright(
        "bench/playwright.config.ts",
        {"AGENTQA_BENCH_MODE": mode, "AGENTQA_BENCH_OUT": str(out)},
        channel,
    )
    if proc.returncode != 0 or not out.exists():
        raise SystemExit(f"benchmark mode {mode!r} produced no results:\n{proc.stdout[-2000:]}\n{proc.stderr[-2000:]}")
    validate_payload(mode, json.loads(out.read_text(encoding="utf-8")))
    print(f"  {mode:14} done in {time.time() - started:5.0f}s")
    return out


def pct(n: int, d: int) -> str:
    return f"{100 * n / d:.1f}%" if d else "n/a"


def validate_payload(mode: str, payload: dict) -> None:
    """Never publish partial, duplicated or mislabeled browser runs as a full benchmark."""
    if payload.get("mode") != mode:
        raise ValueError(f"benchmark mode mismatch: expected {mode}")
    if payload.get("skipped") and mode == "full":
        return
    results = payload.get("results", [])
    ids = [r["id"] for r in results]
    if len(results) != 50 or len(set(ids)) != 50:
        raise ValueError(f"{mode}: expected 50 unique scenarios, received {len(results)}")
    if sum(r["kind"] == "positive" for r in results) != 38 or sum(r["kind"] == "negative" for r in results) != 12:
        raise ValueError(f"{mode}: expected 38 positive and 12 negative scenarios")


def summarize(mode: str, payload: dict) -> dict:
    if payload.get("skipped"):
        return {"mode": mode, "skipped": payload["skipped"]}
    rs = payload["results"]
    pos = [r for r in rs if r["kind"] == "positive"]
    neg = [r for r in rs if r["kind"] == "negative"]
    threatened = [r for r in neg if r["category"] in ("negative-removed", "negative-decoy")]
    validated_levels = Counter(l for r in pos for l in r["levels"])
    deepest = Counter(max(r["levels"]) for r in pos if r["passed"] and r["levels"])
    unaided = [r for r in pos if r["passed"] and not r["levels"]]
    ladder_ms = [ms for r in rs for ms, h in zip(r["ladderMs"], r["healed"]) if h["verdict"] == "validated"]
    cost = sum(r["llmCostUsd"] for r in rs)
    heals_validated = sum(r["healsValidated"] for r in rs)
    return {
        "mode": mode,
        "scenarios": len(rs),
        "positives": len(pos),
        "positives_passed": sum(r["passed"] for r in pos),
        "repair_rate": sum(r["passed"] for r in pos) / len(pos) if pos else 0,
        "negatives": len(neg),
        "false_passes": sum(r["passed"] for r in neg),
        "false_pass_ids": [r["id"] for r in neg if r["passed"]],
        "false_pass_rate": sum(r["passed"] for r in neg) / len(neg) if neg else 0,
        "wrong_element_attempts": sum(r["wrongElementAttempt"] for r in threatened),
        "wrong_element_ids": [r["id"] for r in threatened if r["wrongElementAttempt"]],
        "wrong_element_denominator": len(threatened),
        "wrong_element_rate": sum(r["wrongElementAttempt"] for r in threatened) / len(threatened) if threatened else 0,
        "refused_scenarios": sum(1 for r in neg if r["refusals"] > 0),
        "positives_needing_no_heal": len(unaided),
        "validated_heals": heals_validated,
        "heals_by_level": {str(k): validated_levels.get(k, 0) for k in (1, 2, 3, 4, 5)},
        "scenarios_by_deepest_level": {str(k): deepest.get(k, 0) for k in (1, 2, 3, 4, 5)},
        "heals_free_offline": sum(v for k, v in validated_levels.items() if k in (1, 3, 4)),
        "heals_llm": sum(v for k, v in validated_levels.items() if k in (2, 5)),
        "latency_ms_mean": statistics.mean(ladder_ms) if ladder_ms else None,
        "latency_ms_median": statistics.median(ladder_ms) if ladder_ms else None,
        "latency_ms_p95": (sorted(ladder_ms)[max(0, int(len(ladder_ms) * 0.95) - 1)] if ladder_ms else None),
        "cost_usd_total": cost,
        "cost_usd_per_heal": (cost / heals_validated) if heals_validated else 0.0,
    }


def render_markdown(summaries: dict[str, dict], payloads: dict[str, dict]) -> str:
    L: list[str] = []
    gen = time.strftime("%Y-%m-%d %H:%M")
    base = summaries.get("standard")
    det = summaries.get("deterministic")
    L += [
        "# AgentQA mutation benchmark",
        "",
        f"_Generated {gen} by `python scripts/run_benchmark.py`. Every figure below was produced by running the "
        "Playwright runner against real pages in a real browser; nothing is simulated._",
        "",
        "50 scenarios: 6 UI patterns (login form, checkout form, data table, modal dialog, navbar, dynamic list) x realistic UI "
        "mutations, plus negative cases that are real regressions. A scenario is a test written against the original page "
        "(selectors chosen the way a recorder or author would) and run against a mutated page; its assertion checks the "
        "**business outcome** (order confirmed, row archived, ...), never the markup.",
        "",
        "* **Positive (38)**: a harmless refactor. The outcome is reachable, so a correct healer should make the test pass.",
        "* **Negative (12)**: a real bug - the control was removed (4), replaced by a look-alike decoy (4), or the UI was refactored "
        "but the action silently does nothing (4). The only correct result is a **failed** test.",
        "",
        "## Headline",
        "",
        "| Metric | " + " | ".join(MODE_LABEL[m] for m in MODES if m in summaries) + " |",
        "|---|" + "---|" * len([m for m in MODES if m in summaries]),
    ]

    def cell(m: str, fn) -> str:
        s = summaries.get(m)
        if not s:
            return "-"
        if s.get("skipped"):
            return "not run"
        return fn(s)

    rows = [
        ("**Correct repair rate** on harmless UI refactors", lambda s: f"**{pct(s['positives_passed'], s['positives'])}** ({s['positives_passed']}/{s['positives']})"),
        ("**False-pass rate** on real bugs (target 0%)", lambda s: f"**{pct(s['false_passes'], s['negatives'])}** ({s['false_passes']}/{s['negatives']})"),
        ("Wrong-element rate when the right control is gone", lambda s: f"{pct(s['wrong_element_attempts'], s['wrong_element_denominator'])} ({s['wrong_element_attempts']}/{s['wrong_element_denominator']})"),
        ("Validated heals fixed at $0.00, offline (Levels 1, 3, 4)", lambda s: str(s["heals_free_offline"])),
        ("Validated heals that needed an LLM (Levels 2, 5)", lambda s: str(s["heals_llm"])),
        ("Mean / median ladder latency per heal", lambda s: "-" if s["latency_ms_mean"] is None else f"{s['latency_ms_mean']:.0f} / {s['latency_ms_median']:.0f} ms"),
        ("Estimated LLM cost per heal", lambda s: f"${s['cost_usd_per_heal']:.4f}" if s["heals_llm"] else "$0.0000"),
    ]
    for label, fn in rows:
        L.append(f"| {label} | " + " | ".join(cell(m, fn) for m in MODES if m in summaries) + " |")

    full = summaries.get("full")
    if full and full.get("skipped"):
        L += ["", f"> **Mode C was not run**: {full['skipped']}. It needs a running AgentQA backend with an LLM provider "
              "(`AGENTQA_BACKEND_URL`, `AGENTQA_API_KEY`, and `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OLLAMA_HOST` on the backend). "
              "No LLM number in this report is estimated or invented; run `python scripts/run_benchmark.py --modes full` with credentials to produce it."]

    if base and det and not det.get("skipped"):
        L += [
            "",
            f"Standard Playwright passed **{base['positives_passed']}/{base['positives']}** of the refactored scenarios "
            f"(every scenario breaks at least one original selector, as designed) and failed {base['negatives'] - base['false_passes']}/{base['negatives']} negatives. "
            f"Default AgentQA recovered **{det['positives_passed']}/{det['positives']}** and reported **{det['false_passes']}** false passes.",
        ]

    # ---- per category ---------------------------------------------------------------------------------------
    L += ["", "## Results by mutation category", "", "Positive categories show passes / scenarios; negative categories show the number of scenarios wrongly reported as passing (must be 0).", ""]
    present = [m for m in MODES if m in payloads and not payloads[m].get("skipped")]
    L += ["| Category | Scenarios | " + " | ".join(MODE_LABEL[m] for m in present) + " |", "|---|---|" + "---|" * len(present)]
    for cat in CATEGORY_ORDER:
        n = sum(1 for r in payloads[present[0]]["results"] if r["category"] == cat)
        if not n:
            continue
        cells = []
        for m in present:
            rs = [r for r in payloads[m]["results"] if r["category"] == cat]
            passed = sum(r["passed"] for r in rs)
            cells.append(f"{passed}/{n}" + (" false pass" if cat.startswith("negative") and passed else ""))
        L.append(f"| `{cat}` | {n} | " + " | ".join(cells) + " |")

    # ---- level breakdown -------------------------------------------------------------------------------------
    if det and not det.get("skipped"):
        L += ["", "## Which level fixed what (default AgentQA, positive scenarios)", "", "| Level | Name | Validated heals | Scenarios whose deepest level this was | Cost |", "|---|---|---|---|---|"]
        for lvl in (1, 3, 4, 2, 5):
            cost = "$0.00 (offline)" if lvl in (1, 3, 4) else "LLM (not run)" if full and full.get("skipped") else "LLM"
            L.append(f"| {lvl} | {LEVEL_NAMES[lvl]} | {det['heals_by_level'][str(lvl)]} | {det['scenarios_by_deepest_level'][str(lvl)]} | {cost} |")
        L += ["", f"{det['positives_needing_no_heal']} positive scenarios passed without any heal."]

    # ---- negatives ---------------------------------------------------------------------------------------------
    if det and not det.get("skipped"):
        L += ["", "## Negative cases (real bugs): what AgentQA did", "", "| Scenario | Default | Strict | What happened (default) |", "|---|---|---|---|"]
        strict = {r["id"]: r for r in payloads.get("strict", {}).get("results", [])}
        for r in payloads["deterministic"]["results"]:
            if r["kind"] != "negative":
                continue
            s = strict.get(r["id"])
            note = ""
            if r["refused"]:
                x = r["refused"][0]
                note = f"refused `{x['original']}` ({x['code']})"
            elif r["wrongElementAttempt"]:
                note = f"**clicked a look-alike**: `{r['primaryHealedTo']}` - assertion failed, heal rejected"
            elif r["healsRejected"]:
                note = "healed the right control, the app is broken: assertion failed, heal rejected"
            res = lambda x: "PASSED (false pass)" if x["passed"] else "failed (correct)"  # noqa: E731
            L.append(f"| `{r['id']}` - {r['description']} | {res(r)} | {res(s) if s else '-'} | {note} |")

        misses = [r for r in payloads["deterministic"]["results"] if r["kind"] == "positive" and not r["passed"]]
        if misses:
            L += ["", "## Harmless refactors the deterministic levels could not recover", "",
                  "These fail **safely** (the ladder refused rather than guessing). They are the cases the LLM levels exist for:", ""]
            for r in misses:
                x = r["refused"][0] if r["refused"] else None
                L.append(f"* `{r['id']}` - {r['description']}: " + (f"refused `{x['original']}` ({x['code']}): {x['reason']}" if x else (r.get('failure') or '')))

    L += [
        "",
        "## Reading these numbers honestly",
        "",
        "* **A scenario's healed result only counts if the test's own assertions pass afterwards.** A selector that lets a click succeed "
        "is a proposal; heals in a test that then fails are recorded as `rejected`.",
        "* **False pass** = a real regression reported as pass or healed. The negative scenarios are designed so that the only way to "
        "pass is to produce the checked outcome, so a false pass would mean the assertions were fooled. Observed counts are reported above; zero on this suite is not a universal guarantee.",
        "* **Wrong-element attempt** is stricter than a false pass: the ladder *applied* a replacement to the primary control although "
        "the right element no longer exists. Level 4 can be fooled by a look-alike that sits in the same place with the same intent "
        "(\"Sign up\" where \"Sign in\" was). The assertion still fails the test, but the wrong control was clicked. Strict mode reduces this at the "
        "cost of recall; the LLM levels or a human are needed to close the gap.",
        "* The scenario set is synthetic and was fixed before the first run, with one exception disclosed in the changelog below. Recorded "
        "fingerprints exist because each scenario is first run on the original page, which is how AgentQA works in practice "
        "(the test passes once, then the UI changes).",
        "* Latency is the time spent inside the ladder per heal (includes Level 1's 800 ms wait for late renders, which every heal pays "
        "before escalating). Deterministic levels cost $0.00 by construction.",
        "",
        "### Changelog of the benchmark itself",
        "",
        "* The first full run (before this report existed) used the same scenarios and matcher as the published run. One matcher change was "
        "tried after seeing results (position tolerance relative to element size instead of viewport); it did not improve recovery "
        "(33 vs 34 of 38) and was reverted, so the published configuration is the original a-priori design. Strict mode was added "
        "after observing look-alike decoys being clicked, and is reported separately from the default.",
        "",
        "## Reproduce",
        "",
        "```bash",
        "cd backend && uv sync && cd ../runner && npm ci",
        "cd .. && python scripts/run_benchmark.py          # ~8 minutes, headless",
        "```",
        "",
        "Set `AGENTQA_BROWSER_CHANNEL=chrome` to reuse an installed Chrome instead of `npx playwright install chromium`.",
        "",
    ]
    return "\n".join(L)


def sync_readme_metrics(markdown: str) -> None:
    """Keep the hiring-manager headline table identical to the generated report."""
    path = ROOT / "README.md"
    text = path.read_text(encoding="utf-8")
    start = "<!-- benchmark-metrics:start -->"
    end = "<!-- benchmark-metrics:end -->"
    table = markdown.split("## Headline\n\n", 1)[1].split("\n\n", 1)[0]
    if start not in text or end not in text:
        raise ValueError("README is missing generated benchmark table markers")
    before, remainder = text.split(start, 1)
    _, after = remainder.split(end, 1)
    path.write_text(before + start + "\n" + table + "\n" + end + after, encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--modes", default=",".join(m for m in MODES if m != "full"),
                    help="comma-separated subset of: " + ", ".join(MODES) + " (default: all but `full`, so a keyless run never overwrites stored LLM results)")
    ap.add_argument("--aggregate-only", action="store_true", help="skip running; rebuild the report from artifacts/bench/*.json")
    args = ap.parse_args()
    modes = [m for m in args.modes.split(",") if m]
    if not modes or any(m not in MODES for m in modes):
        ap.error("--modes must contain known benchmark modes")

    if not args.aggregate_only:
        if not runner_ready():
            print("Runner dependencies are missing. Run once:  cd runner && npm ci", file=sys.stderr)
            return 2
        channel = pick_channel()
        print(f"Running {len(modes)} mode(s) x 50 scenarios (headless, channel={channel or 'bundled chromium'}) ...")
        for m in modes:
            run_mode(m, channel)

    payloads: dict[str, dict] = {}
    for m in MODES:
        f = ARTIFACTS / f"{m}.json"
        if f.exists():
            payloads[m] = json.loads(f.read_text(encoding="utf-8"))
            validate_payload(m, payloads[m])
    if not payloads:
        print("no results found; run without --aggregate-only first", file=sys.stderr)
        return 2

    summaries = {m: summarize(m, p) for m, p in payloads.items()}
    md = render_markdown(summaries, payloads)
    sync_readme_metrics(md)
    (ROOT / "BENCHMARK_RESULTS.md").write_text(md, encoding="utf-8")
    (ROOT / "BENCHMARK_RESULTS.json").write_text(
        json.dumps({"generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"), "sourceRuns": {m: p.get("generatedAt") for m, p in payloads.items()}, "summaries": summaries, "scenarios": {m: p.get("results", []) for m, p in payloads.items()}}, indent=2),
        encoding="utf-8",
    )
    print("\n" + "\n".join(md.splitlines()[8:30]))
    print("\nWrote BENCHMARK_RESULTS.md and BENCHMARK_RESULTS.json")
    bad = [m for m, s in summaries.items() if m != "standard" and not s.get("skipped") and s["false_passes"]]
    if bad:
        print(f"FALSE PASSES in mode(s): {', '.join(bad)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
