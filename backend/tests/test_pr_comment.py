"""The pull-request comment generator (scripts/pr_comment.py) on reports shaped exactly like the runner's output."""

import json
from pathlib import Path

import pytest

import pr_comment

FIXTURES = Path(__file__).parent / "fixtures"

SPEC = """import { test, expect } from '../src/fixtures';

test('buys shoes', async ({ page, agentqa }) => {
  await agentqa.fill('#email', 'a@b.c');
  await agentqa.click('#place-order');
  await expect(page).toHaveURL(/confirmation/);
});
"""


def heal(verdict="validated", **over):
    base = {
        "testTitle": "buys shoes", "file": "tests/shop.spec.ts", "line": 5, "url": "http://shop.test/", "original": "#place-order",
        "healed": '[data-testid="cta-7f"]', "action": "click", "level": 4, "levelName": "DOM Geometry & Layout Matcher",
        "confidence": 0.82, "reasoning": "best layout match", "domBytesRaw": 45439, "domBytesCompressed": 1700, "elapsedMs": 612,
        "llmCostUsd": 0.0, "verdict": verdict, "verdictReason": "3 assertion(s) passed after the repair" if verdict == "validated" else "the test failed after this repair",
        "assertionsAfter": 3, "evidence": {"position": 1, "text": 0.2}, "timestamp": 1,
        "steps": [
            {"level": 1, "name": "Smart Retry", "status": "miss", "reason": "still failing after 500ms", "ms": 500},
            {"level": 3, "name": "Multi-Selector Fallback", "status": "miss", "reason": "4 alternates tried", "ms": 6},
            {"level": 4, "name": "DOM Geometry & Layout Matcher", "status": "selected", "reason": "layout match", "ms": 20},
        ],
    }
    base.update(over)
    return base


def report(heals=(), blocked=(), status="healed", steps=None):
    test = {
        "title": "buys shoes", "file": "tests/shop.spec.ts", "status": status, "durationMs": 1800, "errors": [],
        "heals": list(heals), "blocked": list(blocked),
        "steps": steps if steps is not None else [{"title": "order confirmation text is shown", "ok": True, "durationMs": 12}],
        "tags": [],
    }
    return {"generatedAt": "x", "tests": [test], "summary": {"total": 1, "passed": 0, "healed": 1 if status == "healed" else 0, "failed": 1 if status == "failed" else 0}}


@pytest.fixture
def base_dir(tmp_path):
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "shop.spec.ts").write_text(SPEC, encoding="utf-8")
    return tmp_path


def test_a_validated_heal_shows_diff_level_confidence_evidence_assertions_and_a_patch(base_dir):
    md = pr_comment.build_comment(report([heal()]), base_dir)
    assert md.startswith(pr_comment.MARKER)
    assert "1 validated heal(s)" in md
    assert "Level 4 - DOM Geometry & Layout Matcher" in md and "82%" in md
    assert "- #place-order" in md and '+ [data-testid="cta-7f"]' in md
    assert "44.4KB -> 1.7KB" in md and "26.7x smaller" in md
    assert "PASS order confirmation text is shown" in md
    assert "| 4 | DOM Geometry & Layout Matcher | selected | 20 |" in md  # the ladder trace
    # a real unified diff of the spec file, keeping the author's quote style
    assert "--- a/tests/shop.spec.ts" in md and "+++ b/tests/shop.spec.ts" in md
    assert "-  await agentqa.click('#place-order');" in md
    assert "+  await agentqa.click('[data-testid=\"cta-7f\"]');" in md


def test_the_patch_targets_the_reported_line_even_if_the_selector_appears_twice(base_dir):
    spec = base_dir / "tests" / "shop.spec.ts"
    spec.write_text(SPEC + "// uses '#place-order' elsewhere\n", encoding="utf-8")
    patch = pr_comment.make_patch(base_dir, "tests/shop.spec.ts", 5, "#place-order", "[x]")
    removed = [line for line in patch.splitlines() if line.startswith("-") and not line.startswith("---")]
    assert removed == ["-  await agentqa.click('#place-order');"]  # the comment line mentioning it was left alone


def test_selectors_with_quotes_are_escaped_in_the_patch(base_dir):
    patch = pr_comment.make_patch(base_dir, "tests/shop.spec.ts", 5, "#place-order", "button:has-text('Pay')")
    assert "button:has-text(\\'Pay\\')" in patch


def test_a_rejected_heal_is_reported_as_not_applied_and_gets_no_patch(base_dir):
    md = pr_comment.build_comment(report([heal(verdict="rejected")], status="failed", steps=[{"title": "order confirmation text is shown", "ok": False, "durationMs": 9}]), base_dir)
    assert "NOT APPLIED" in md and "Repairs that were NOT accepted" in md
    assert "Treat the failure as real" in md
    assert "Copy-pasteable patch" not in md and "FAIL order confirmation text is shown" in md


def test_refusals_are_listed_with_their_reason_and_ladder(base_dir):
    blocked = {
        "testTitle": "buys shoes", "file": "tests/shop.spec.ts", "line": 5, "url": "u", "original": "#place-order", "action": "click",
        "blocked": {"code": "intent_conflict", "reason": "original control reads as 'affirm' but the replacement reads as 'cancel'"},
        "steps": [{"level": 1, "name": "Smart Retry", "status": "miss", "reason": "", "ms": 5}, {"level": 4, "name": "x", "status": "blocked", "reason": "", "ms": 2}],
        "elapsedMs": 7, "timestamp": 1,
    }
    md = pr_comment.build_comment(report(blocked=[blocked], status="failed"), base_dir)
    assert "Repairs AgentQA refused to make" in md and "intent_conflict" in md and "L1 miss -> L4 blocked" in md


def test_no_heals_produces_a_short_all_clear():
    md = pr_comment.build_comment(report(status="passed"))
    assert md.startswith(pr_comment.MARKER) and "without needing any selector repair" in md


def test_pipes_in_selectors_do_not_break_the_markdown_tables(base_dir):
    md = pr_comment.build_comment(report([heal(testTitle="a | b")]), base_dir)
    assert "a \\| b" in md


@pytest.mark.skipif(not (FIXTURES / "agentqa-report-refactored.json").exists(), reason="fixture generated by python demo.py")
def test_a_real_report_from_the_demo_renders():
    real = json.loads((FIXTURES / "agentqa-report-refactored.json").read_text(encoding="utf-8"))
    md = pr_comment.build_comment(real, Path(__file__).resolve().parents[2] / "runner")
    assert "validated heal(s)" in md and "Original assertions after the repair" in md
    assert "NOT APPLIED" not in md
    assert md.count("```diff") >= 2 * len([h for t in real["tests"] for h in t["heals"] if h["verdict"] == "validated"])
