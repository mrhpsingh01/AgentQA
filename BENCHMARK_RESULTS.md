# AgentQA mutation benchmark

_Generated 2026-10-16 12:28 by `python scripts/run_benchmark.py`. Every figure below was produced by running the Playwright runner against real pages in a real browser; nothing is simulated._

50 scenarios: 6 UI patterns (login form, checkout form, data table, modal dialog, navbar, dynamic list) x realistic UI mutations, plus negative cases that are real regressions. A scenario is a test written against the original page (selectors chosen the way a recorder or author would) and run against a mutated page; its assertion checks the **business outcome** (order confirmed, row archived, ...), never the markup.

* **Positive (38)**: a harmless refactor. The outcome is reachable, so a correct healer should make the test pass.
* **Negative (12)**: a real bug - the control was removed (4), replaced by a look-alike decoy (4), or the UI was refactored but the action silently does nothing (4). The only correct result is a **failed** test.

## Headline

| Metric | A. Standard Playwright | B. AgentQA deterministic (Levels 1, 3, 4) | B'. AgentQA deterministic, strict | C. AgentQA full (LLM Levels 2, 5) |
|---|---|---|---|---|
| **Correct repair rate** on harmless UI refactors | **0.0%** (0/38) | **89.5%** (34/38) | **84.2%** (32/38) | **97.4%** (37/38) |
| **False-pass rate** on real bugs (target 0%) | **0.0%** (0/12) | **0.0%** (0/12) | **0.0%** (0/12) | **0.0%** (0/12) |
| Wrong-element rate when the right control is gone | 0.0% (0/8) | 37.5% (3/8) | 12.5% (1/8) | 62.5% (5/8) |
| Validated heals fixed at $0.00, offline (Levels 1, 3, 4) | 0 | 61 | 56 | 64 |
| Validated heals that needed an LLM (Levels 2, 5) | 0 | 0 | 0 | 3 |
| Mean / median ladder latency per heal | - | 901 / 921 ms | 900 / 919 ms | 3032 / 2945 ms |
| Estimated LLM cost per heal | $0.0000 | $0.0000 | $0.0000 | $0.0000 |

Standard Playwright passed **0/38** of the refactored scenarios (every scenario breaks at least one original selector, as designed) and failed 12/12 negatives. Default AgentQA recovered **34/38** and reported **0** false passes.

## Results by mutation category

Positive categories show passes / scenarios; negative categories show the number of scenarios wrongly reported as passing (must be 0).

| Category | Scenarios | A. Standard Playwright | B. AgentQA deterministic (Levels 1, 3, 4) | B'. AgentQA deterministic, strict | C. AgentQA full (LLM Levels 2, 5) |
|---|---|---|---|---|---|
| `rename-id` | 6 | 0/6 | 6/6 | 6/6 | 6/6 |
| `rename-testid` | 6 | 0/6 | 6/6 | 6/6 | 6/6 |
| `restructure` | 6 | 0/6 | 6/6 | 6/6 | 6/6 |
| `class-scramble` | 6 | 0/6 | 6/6 | 6/6 | 6/6 |
| `text-variation` | 6 | 0/6 | 6/6 | 6/6 | 6/6 |
| `combined-hard` | 6 | 0/6 | 2/6 | 0/6 | 5/6 |
| `delayed-render` | 2 | 0/2 | 2/2 | 2/2 | 2/2 |
| `negative-removed` | 4 | 0/4 | 0/4 | 0/4 | 0/4 |
| `negative-decoy` | 4 | 0/4 | 0/4 | 0/4 | 0/4 |
| `negative-broken` | 4 | 0/4 | 0/4 | 0/4 | 0/4 |

## Which level fixed what (default AgentQA, positive scenarios)

| Level | Name | Validated heals | Scenarios whose deepest level this was | Cost |
|---|---|---|---|---|
| 1 | Smart Retry | 2 | 2 | $0.00 (offline) |
| 3 | Multi-Selector Fallback | 57 | 30 | $0.00 (offline) |
| 4 | DOM Geometry & Layout Matcher | 2 | 2 | $0.00 (offline) |
| 2 | LLM DOM Repair | 0 | 0 | LLM |
| 5 | LLM Decompose & Rebuild | 0 | 0 | LLM |

0 positive scenarios passed without any heal.

## Negative cases (real bugs): what AgentQA did

| Scenario | Default | Strict | What happened (default) |
|---|---|---|---|
| `checkout/negative-removed` - Place order was removed (Cancel remains) | failed (correct) | failed (correct) | refused `#place` (low_confidence) |
| `login/negative-removed` - Sign in was removed | failed (correct) | failed (correct) | refused `#submit` (low_confidence) |
| `modal/negative-removed` - Save was removed (Close remains) | failed (correct) | failed (correct) | refused `#save` (ambiguous) |
| `table/negative-removed` - Archive was removed (Delete remains) | failed (correct) | failed (correct) | refused `#archive2` (ambiguous) |
| `checkout/negative-decoy` - Place order replaced by a look-alike "Save for later" | failed (correct) | failed (correct) | **clicked a look-alike**: `[data-testid="t6514c4"]` - assertion failed, heal rejected |
| `login/negative-decoy` - Sign in replaced by "Sign up" (different action) | failed (correct) | failed (correct) | **clicked a look-alike**: `[data-testid="t6514c4"]` - assertion failed, heal rejected |
| `modal/negative-decoy` - Save replaced by "Apply preview" (does not persist) | failed (correct) | failed (correct) | **clicked a look-alike**: `[data-testid="t7a8589"]` - assertion failed, heal rejected |
| `table/negative-decoy` - Archive replaced by a second Delete-looking control | failed (correct) | failed (correct) | refused `#archive2` (ambiguous) |
| `checkout/negative-broken` - refactored UI, but placing an order silently does nothing | failed (correct) | failed (correct) | healed the right control, the app is broken: assertion failed, heal rejected |
| `login/negative-broken` - refactored UI, but signing in silently does nothing | failed (correct) | failed (correct) | healed the right control, the app is broken: assertion failed, heal rejected |
| `list/negative-broken` - refactored UI, but Add silently does nothing | failed (correct) | failed (correct) | healed the right control, the app is broken: assertion failed, heal rejected |
| `modal/negative-broken` - refactored UI, but Save silently does nothing | failed (correct) | failed (correct) | healed the right control, the app is broken: assertion failed, heal rejected |

## Harmless refactors the deterministic levels could not recover

These fail **safely** (the ladder refused rather than guessing). They are the cases the LLM levels exist for:

* `table/combined-hard` - ids, test ids, classes, wording and nesting ALL changed: refused `#archive2` (ambiguous): top two matches are within 0.08 (0.90 "Archive" vs 0.90 "Archive")
* `modal/combined-hard` - ids, test ids, classes, wording and nesting ALL changed: refused `#save` (low_confidence): confidence 0.68 is below the 0.70 threshold
* `navbar/combined-hard` - ids, test ids, classes, wording and nesting ALL changed: refused `#pricing` (ambiguous): top two matches are within 0.08 (0.58 "Products" vs 0.56 "Plans")
* `list/combined-hard` - ids, test ids, classes, wording and nesting ALL changed: refused `#add` (ambiguous): top two matches are within 0.08 (0.63 "Create" vs 0.60 "Clear all")

## Reading these numbers honestly

* **A scenario's healed result only counts if the test's own assertions pass afterwards.** A selector that lets a click succeed is a proposal; heals in a test that then fails are recorded as `rejected`.
* **False pass** = a real regression reported as pass or healed. The negative scenarios are designed so that the only way to pass is to produce the checked outcome, so a false pass would mean the assertions were fooled. Observed counts are reported above; zero on this suite is not a universal guarantee.
* **Wrong-element attempt** is stricter than a false pass: the ladder *applied* a replacement to the primary control although the right element no longer exists. Level 4 can be fooled by a look-alike that sits in the same place with the same intent ("Sign up" where "Sign in" was). The assertion still fails the test, but the wrong control was clicked. Strict mode reduces this at the cost of recall; the LLM levels or a human are needed to close the gap.
* The scenario set is synthetic and was fixed before the first run, with one exception disclosed in the changelog below. Recorded fingerprints exist because each scenario is first run on the original page, which is how AgentQA works in practice (the test passes once, then the UI changes).
* Latency is the time spent inside the ladder per heal (includes Level 1's 800 ms wait for late renders, which every heal pays before escalating). Deterministic levels cost $0.00 by construction.

### Changelog of the benchmark itself

* The first full run (before this report existed) used the same scenarios and matcher as the published run. One matcher change was tried after seeing results (position tolerance relative to element size instead of viewport); it did not improve recovery (33 vs 34 of 38) and was reverted, so the published configuration is the original a-priori design. Strict mode was added after observing look-alike decoys being clicked, and is reported separately from the default.

## Reproduce

```bash
cd backend && uv sync && cd ../runner && npm ci
cd .. && python scripts/run_benchmark.py          # ~8 minutes, headless
```

Set `AGENTQA_BROWSER_CHANNEL=chrome` to reuse an installed Chrome instead of `npx playwright install chromium`.
