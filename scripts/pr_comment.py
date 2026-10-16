#!/usr/bin/env python3
"""
Turn an `agentqa-report.json` (written by the AgentQA Playwright reporter) into a Markdown pull-request comment.

    python scripts/pr_comment.py runner/agentqa-report.json --base-dir runner > comment.md

For every heal the comment shows the before/after selector diff, the level that fixed it, the confidence, the
ladder trace and evidence, the assertions that verified it, and a copy-pasteable patch for the spec file. A heal
whose assertions did not pass is reported as NOT applied. The comment starts with a hidden marker so CI can update
one sticky comment instead of posting a new one on every push.
"""

from __future__ import annotations

import argparse
import difflib
import json
import sys
from pathlib import Path

MARKER = "<!-- agentqa-report -->"
LEVELS_OFFLINE = {1, 3, 4}


def kb(n: float) -> str:
    return f"{n / 1024:.1f}KB"


def make_patch(base_dir: Path, file: str, line: int | None, original: str, healed: str) -> str | None:
    """A unified diff that replaces `original` with `healed` on the spec line that used it (None if it cannot be located)."""
    if not file:
        return None
    path = (base_dir / file) if not Path(file).is_absolute() else Path(file)
    if not path.is_file():
        return None
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    candidates = [line - 1] if line and 0 < line <= len(lines) else []
    candidates += [i for i, text in enumerate(lines) if original in text and i not in candidates]
    for i in candidates:
        if original not in lines[i]:
            continue
        quoted = _quoted(lines[i], original)
        q = quoted[0] if quoted != original else "'"
        literal = q + healed.replace("\\", "\\\\").replace(q, "\\" + q) + q  # keep the author's quote style, escape clashes
        new_line = lines[i].replace(quoted, literal, 1) if quoted != original else lines[i].replace(original, healed, 1)
        new_lines = lines.copy()
        new_lines[i] = new_line
        rel = Path(file).as_posix()
        return "".join(difflib.unified_diff(lines, new_lines, fromfile=f"a/{rel}", tofile=f"b/{rel}", n=2))
    return None


def _quoted(line: str, text: str) -> str:
    """The selector as it is written in the source (with the quote style the author used)."""
    for q in ("'", '"', "`"):
        if f"{q}{text}{q}" in line:
            return f"{q}{text}{q}"
    return text


def _esc_cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def heal_section(h: dict, test: dict, base_dir: Path) -> str:
    ok = h["verdict"] == "validated"
    icon = "OK" if ok else "NOT APPLIED"
    where = f"`{h['file']}:{h['line']}`" if h.get("line") else f"`{h['file']}`"
    out = [
        f"#### {icon} `{h['original']}` -> `{h['healed']}`",
        "",
        "| | |",
        "|---|---|",
        f"| Test | {_esc_cell(h['testTitle'])} ({where}) |",
        f"| Healing level | **Level {h['level']} - {h['levelName']}** ({'offline, $0.00' if h['level'] in LEVELS_OFFLINE else 'LLM'}) |",
        f"| Confidence | {h['confidence']:.0%} |",
        f"| Verdict | **{h['verdict'].upper()}**: {_esc_cell(h['verdictReason'])} |",
        f"| DOM sent to repair | {kb(h['domBytesRaw'])} -> {kb(h['domBytesCompressed'])} ({h['domBytesRaw'] / max(h['domBytesCompressed'], 1):.1f}x smaller) |",
        f"| Ladder time / LLM cost | {h['elapsedMs']} ms / ${h['llmCostUsd']:.4f} |",
        "",
        "```diff",
        f"- {h['original']}",
        f"+ {h['healed']}",
        "```",
        "",
        f"<details><summary>Evidence and ladder trace</summary>\n",
        f"**Why:** {h['reasoning']}\n",
        "| Level | Step | Result | ms | Detail |",
        "|---|---|---|---|---|",
    ]
    for s in h["steps"]:
        out.append(f"| {s['level']} | {s['name']} | {s['status']} | {s['ms']} | {_esc_cell(s['reason'])[:160]} |")
    if h.get("evidence"):
        out += ["", "Score components: " + ", ".join(f"`{k}`={v}" for k, v in h["evidence"].items())]
    steps = test.get("steps") or []
    out += ["", "**Original assertions after the repair:**", ""]
    out += [f"- {'PASS' if st['ok'] else 'FAIL'} {st['title']}" for st in steps] or [f"- {h['assertionsAfter']} assertion(s) ran after the repair"]
    out += ["", "</details>", ""]

    patch = make_patch(base_dir, h.get("file", ""), h.get("line"), h["original"], h["healed"]) if ok else None
    if ok:
        # A context line containing one space is meaningful in a unified diff.
        # Stripping whitespace would remove blank context lines without updating hunk counts.
        out += ["Copy-pasteable patch:", "", "```diff", patch.rstrip("\n") if patch else f"- {h['original']}\n+ {h['healed']}", "```", ""]
    return "\n".join(out)


def build_comment(report: dict, base_dir: Path = Path(".")) -> str:
    tests = report["tests"]
    s = report["summary"]
    heals = [(h, t) for t in tests for h in t["heals"]]
    validated = [(h, t) for h, t in heals if h["verdict"] == "validated"]
    rejected = [(h, t) for h, t in heals if h["verdict"] != "validated"]
    refused = [(b, t) for t in tests for b in t["blocked"]]

    if not heals and not refused:
        return f"{MARKER}\n### AgentQA\n\nAll {s['total']} test(s) ran without needing any selector repair.\n"

    out = [MARKER, "### AgentQA self-healing report", ""]
    parts = [f"**{len(validated)} validated heal(s)**"]
    if rejected:
        parts.append(f"{len(rejected)} repair(s) rejected")
    if refused:
        parts.append(f"{len(refused)} repair(s) refused")
    out.append(" - ".join(parts) + f" across {s['total']} test(s): {s['passed']} passed, {s['healed']} healed, {s['failed']} failed.")
    out += [
        "",
        "> A repair counts only if the test's **own assertions pass afterwards**. Anything else is reported below as not applied, "
        "and the test stays failed so a real regression is never hidden.",
        "",
    ]

    if validated:
        out += ["### Validated heals", ""]
        out += [heal_section(h, t, base_dir) for h, t in validated]
    if rejected:
        out += ["### Repairs that were NOT accepted", "",
                "These selectors were repaired, but the assertions did not confirm the repair. **Treat the failure as real.**", ""]
        out += [heal_section(h, t, base_dir) for h, t in rejected]
    if refused:
        out += ["### Repairs AgentQA refused to make", ""]
        for b, t in refused:
            where = f"`{b['file']}:{b['line']}`" if b.get("line") else f"`{b['file']}`"
            out += [
                f"- `{b['original']}` in {_esc_cell(b['testTitle'])} ({where}): **{b['blocked']['code']}** - {_esc_cell(b['blocked']['reason'])}",
                "  - ladder: " + " -> ".join(f"L{x['level']} {x['status']}" for x in b["steps"]),
            ]
        out.append("")
    out += ["---", "_Levels 1 (retry), 3 (alternate selectors) and 4 (DOM geometry & layout) run offline at $0.00; "
            "Levels 2 and 5 (LLM) run only when a provider is configured._", ""]
    return "\n".join(out)


def merge_reports(paths: list[Path]) -> dict:
    merged = {"tests": [], "summary": {"total": 0, "passed": 0, "healed": 0, "failed": 0}}
    for p in paths:
        r = json.loads(p.read_text(encoding="utf-8"))
        merged["tests"] += r["tests"]
        for k in ("total", "passed", "healed", "failed"):
            merged["summary"][k] += r["summary"].get(k, 0)
    return merged


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("reports", nargs="+", type=Path, help="agentqa-report.json file(s)")
    ap.add_argument("--base-dir", type=Path, default=Path("runner"), help="directory the report's file paths are relative to")
    ap.add_argument("-o", "--output", type=Path, help="write to a file instead of stdout")
    args = ap.parse_args()
    comment = build_comment(merge_reports(args.reports), args.base_dir)
    if args.output:
        args.output.write_text(comment, encoding="utf-8", newline="\n")
    else:
        sys.stdout.write(comment)
    return 0


if __name__ == "__main__":
    sys.exit(main())
