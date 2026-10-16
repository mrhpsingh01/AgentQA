# AgentQA

## Repair broken browser tests without hiding real application bugs.

*AgentQA proposes selector fixes when the UI changes, verifies that the original test assertions still pass, and blocks false-positive heals on real regressions.*

Most "self-healing" test tools stop at "the click worked". That is exactly how a real bug turns green: the checkout button was deleted, the healer clicked *Cancel*, and the test passed. AgentQA treats a repaired selector as a **proposal** that the test's own assertions must confirm.

### One test, four states of the same checkout (`python demo.py`)

The same Playwright test, written once against the original markup, run unchanged against four states of a demo shop. Results below are copied from a real run (artifacts in `artifacts/demo`; the [dashboard](#zero-install-dashboard) shows them with screenshots and DOM diffs).

| State | What changed | Plain Playwright | AgentQA |
|---|---|---|---|
| **Original** | nothing | PASS | **PASS**, 0 heals needed |
| **Refactored UI** | every id, class and test id renamed, wrappers added, "Place order" reworded to "Complete purchase" | FAIL (selectors time out) | **PASS (valid heal)**: 4 selectors repaired, all assertions passed |
| **Broken app** | the refactor **plus a real bug**: the order is never created (silent failure) | FAIL | **FAIL (heal rejected)**: AgentQA found the right button, the assertions failed, no heal is claimed |
| **Broken: button removed** | the refactor plus the Place-order button deleted (Cancel remains) | FAIL | **FAIL (refused to heal)**: it will not click *Cancel* |

### Mutation benchmark: 50 scenarios, 6 UI patterns

38 harmless refactors (renamed ids / test ids, restructured DOM, regenerated CSS classes, reworded labels, late rendering, and a hard "everything changed" case) plus 12 real regressions (removed control, look-alike decoy, silently broken action). Full method and per-scenario results: [`BENCHMARK_RESULTS.md`](BENCHMARK_RESULTS.md). Every number comes from a real browser run.

| | Plain Playwright | **AgentQA, default** (offline, no API key) | AgentQA, strict | AgentQA + LLM (Levels 2, 5) |
|---|---|---|---|---|
| **Correct repair rate** on harmless refactors | 0.0% (0/38) | **89.5% (34/38)** | 84.2% (32/38) | **97.4% (37/38)** |
| **False-pass rate** on real bugs (target 0%) | 0.0% (0/12) | **0.0% (0/12)** | 0.0% (0/12) | **0.0% (0/12)** |
| Wrong element clicked when the right one was gone | 0/8 | 3/8 | 1/8 | 5/8 |
| Validated heals fixed at **$0.00**, offline | n/a | **61 of 61** (Levels 1, 3, 4) | 56 of 56 | 64 of 67 |
| Heals that needed an LLM | n/a | 0 | 0 | 3 |
| Mean / median ladder latency per heal | n/a | 912 / 927 ms | 900 / 918 ms | 2992 / 2943 ms |
| Estimated LLM cost per heal | n/a | $0.00 | $0.00 | $0.00 (free tier; not a price) |

LLM column: Groq free tier, `openai/gpt-oss-120b` for both LLM levels (single run, 50 scenarios, no fallback to other providers). The gain is in the hard "everything changed" category (2/6 to 5/6). The level breakdown credits Level 2 with 3 heals in 1 scenario and Level 5 with none, so the whole 3-scenario gain is not attributable to the LLM from this single run. **Caveat: the LLM column clicked the wrong element more often (5/8 vs 3/8)** in the look-alike cases. The test assertions still failed them, so 0 false passes held, but the model is not a precision upgrade. One run per mode, so treat small differences as noise.

How to read it: **a false pass never happened**, because a repair only counts if the test's own business-outcome assertions pass afterwards. The honest weak spot is the "wrong element" row: when the right control is gone and a look-alike sits in its place with the same intent ("Sign up" where "Sign in" was), Level 4 can *click* the look-alike. The assertion still fails the test and the heal is rejected, but the click happened. Strict mode cuts this at the cost of recall; closing the gap needs the LLM levels or a human. The 4 refactors that default AgentQA misses (all labels renamed *and* ids, classes and structure changed) are refused, not guessed.

### What AgentQA prints (`python demo.py`)

```text
+--------------------- refactored - heal of #place-order ---------------------+
| failed selector   #place-order                                              |
| escalation        L1 Smart Retry [miss 537ms] -> L3 Multi-Selector Fallback |
| [miss 9ms] -> L4 DOM Geometry & Layout Matcher [selected 15ms]              |
| DOM compression   44.4KB -> 1.7KB (26.8x smaller)                           |
| proposed          [data-testid="t3e4210"]   confidence 71%   level 4        |
| assertions        OK  URL navigated to the confirmation view                |
|                   OK  order confirmation text is shown                      |
|                   OK  API state changed: exactly one order exists           |
| verdict           VALIDATED - 4 assertion(s) passed after the repair        |
| latency / cost    565ms ladder time / $0.0000 (offline, no LLM)             |
+-----------------------------------------------------------------------------+
+------------------------- broken-removed - refusal --------------------------+
| failed selector   #place-order                                              |
| escalation        L1 miss -> L3 miss -> L4 blocked -> L2 skipped -> L5      |
| skipped                                                                     |
| refused because   ambiguous: top two matches are within 0.08 (0.52 "Cancel" |
| vs 0.52 "Go to checkout 1")                                                 |
| result            test FAILED. AgentQA did not click Cancel, so the removed |
| button is reported as the regression it is.                                 |
+-----------------------------------------------------------------------------+
```

### What lands on your pull request

When a test heals in CI, [`agentqa.yml`](.github/workflows/agentqa.yml) posts one sticky comment with the selector diff, the level that fixed it, the confidence, the ladder evidence, the assertions that verified it, and a patch you can paste (excerpt from a real run):

````markdown
#### OK `#add-to-cart-3` -> `[data-testid="t896bee"]`

| Healing level | **Level 4 - DOM Geometry & Layout Matcher** (offline, $0.00) |
| Confidence    | 79% |
| Verdict       | **VALIDATED**: 5 assertion(s) passed after the repair |

```diff
--- a/demo/checkout.spec.ts
+++ b/demo/checkout.spec.ts
@@ -25,5 +25,5 @@
-  await agentqa.click('#add-to-cart-3'); // product 3, "Insulated Bottle 750ml"
+  await agentqa.click('[data-testid="t896bee"]'); // product 3, "Insulated Bottle 750ml"
```
````

Repairs whose assertions failed are listed under **"Repairs that were NOT accepted"**, and refusals under **"Repairs AgentQA refused to make"**.

**Verify it yourself in 60 seconds: [`TRY_IT.md`](TRY_IT.md).**

---

## How it works

### The escalation ladder

Levels are fixed identities; they run **cheapest first** (1 → 3 → 4 → 2 → 5), so every offline, deterministic, $0.00 level runs before any LLM call. With no LLM provider configured the LLM levels are **skipped and reported as skipped**, never simulated.

| Level | Name | Runs | What it does |
|---|---|---|---|
| 1 | **Smart Retry** | offline | Re-resolves the original selector for a short window (late renders, animations), then asks the verified-selector cache. |
| 3 | **Multi-Selector Fallback** | offline | Tries alternate selectors recorded the last time the element worked (test id, role + name, `name=`, aria-label, visible text). Alternates that point at different elements are refused as ambiguous. |
| 4 | **DOM Geometry & Layout Matcher** | offline | Scores live controls against the recorded fingerprint using text, ARIA role, attributes, ancestor structure, **DOM bounding boxes** and the label's intent polarity. It reads `getBoundingClientRect()`, not screenshots or pixels. |
| 2 | **LLM DOM Repair** | needs a provider | Sends a compressed DOM (about 1.7KB for the demo's 44KB page) to the backend's LLM gateway. |
| 5 | **LLM Decompose & Rebuild** | needs a provider | Asks the model to extract the element's intent, then rebuild candidate selectors. |

Every candidate, from any level, must resolve to **exactly one visible, enabled element on the live page** before it is considered.

### Intent verification (why a heal is not a pass)

1. A selector fails to resolve. The ladder proposes a replacement and the action is performed.
2. The heal is **pending**. It becomes `validated` only if assertions ran *after* it and the test passed.
3. If the test fails afterwards the heal is `rejected` and the test stays **failed**. If no assertion ran after the heal, it is `unverified` and the test is **failed** (nothing proved the repair).
4. Only validated heals update the remembered fingerprint or the shared cache; a wrong guess can never poison later runs.

### Guardrails against ambiguous or destructive repairs

* **Intent polarity** ([`shared/intent-vocabulary.json`](shared/intent-vocabulary.json), used identically by the TypeScript runner and the Python backend): an *affirm* control (Place order, Submit, Pay...) is never healed to a *cancel* control (Cancel, Delete, Back...), or the reverse. A flip stops the ladder instead of escalating.
* **Confidence threshold** (default 0.70): anything below is refused.
* **Ambiguity margin**: if the best two layout matches are within 0.08 the repair is refused.
* **Strict mode** (`AGENTQA_STRICT=1`): Level 4 also requires word overlap with the original label.

### Use it in your own Playwright tests

```ts
import { test, expect } from '../src/fixtures';

test('checkout', async ({ page, agentqa }) => {
  await agentqa.click('#place-order');                       // heals if the selector broke
  await expect(page).toHaveURL(/confirmation/);               // ...and THIS decides whether the heal counts
});
```

`expect` is Playwright's own, wrapped only to count assertions. Without an assertion after a heal, the test fails by design. Set `AGENTQA_REPORT=agentqa-report.json` to get the machine-readable report that feeds the PR comment.

---

## Repository layout

```text
runner/                 Playwright runner: the healing ladder, guardrails, fixtures, reporter (TypeScript)
  src/healing/            ladder.ts, geometry-matcher.ts (Level 4), fingerprint.ts, guardrails.ts, session.ts
  tests/levels/           one regression suite per level + guardrails + assertion enforcement
  demo/                   the checkout test used by demo.py
  bench/                  the 50-scenario mutation benchmark
backend/                FastAPI service: verified selector cache and the LLM levels (2, 5); also test generation
shared/                 intent vocabulary shared by runner and backend
demo/target_app/        the 4-state demo shop (stdlib Python server)
scripts/                run_benchmark.py, pr_comment.py, export_dashboard_seed.py
dashboard/              Next.js dashboard with a zero-install demo mode
extension/              Chrome MV3 recorder (see Additional capabilities)
```

### Zero-install dashboard

`dashboard/` renders the real `demo.py` and benchmark results with `NEXT_PUBLIC_DEMO_MODE=true`: the **Repair Evidence** view toggles between Original, Refactored (healed), Broken (heal rejected) and Broken (refused), with screenshots, the markup diff, the ladder trace and the assertions. It is static, so it deploys to Vercel as is (set the project root to `dashboard/` and the env var). Without demo mode it talks to the backend and shows an explicit "backend unreachable" state instead of invented numbers.

## Honest limits

* The benchmark is synthetic (6 patterns, one mutation per category plus one combined case). It measures a healer against *known* ground truth; it is not a claim about your app.
* Level 4 cannot tell a renamed control from a look-alike that shares its place and intent. That is the 3/8 above.
* Fingerprints require the test to have **passed once** before the UI changed (or an explicit `hint` / `fallbacks`). A brand-new test with a broken selector has nothing to heal toward.
* **LLM levels are implemented and protocol-tested against a stub, but not benchmarked** in this repository's environment (no provider credentials). No LLM accuracy, latency or cost figure is published here.
* Heal latency includes Level 1's retry window (800 ms by default), which every heal pays before escalating.

## Additional capabilities

These exist in the repository and are not part of the healing evaluation above.

* **Chrome MV3 recorder** (`extension/`): records flows with Shadow-DOM piercing and prioritized multi-strategy selectors, and exports Playwright (TS/Python), Cypress, Selenium and Puppeteer Replay.
* **POM test generation** (`backend/`): turns a recording into a Page Object Model suite; uses an LLM when configured and an algorithmic synthesizer otherwise.
* **Visual regression** (`backend/`): pixel-diff and semantic-diff baselines per branch.
* **Shared selector cache**: verified repairs are reusable across runs and, via component fingerprints, across repositories.
* **Taskiq worker** (`backend/src/tasks`): purges stale cache entries.

See [`USER_GUIDE.md`](USER_GUIDE.md) for the extension and backend walkthrough.

## Development

```bash
cd backend && uv sync && uv run pytest -q                  # 44 tests, no API key, Redis or Postgres needed
cd runner  && npm ci && npx playwright install chromium    # once
cd runner  && npx tsc --noEmit -p . && npx playwright test # per-level, guardrail and enforcement suites
python demo.py                                              # the 4-state demo
python scripts/run_benchmark.py                             # the benchmark (~8 min)
```

CI: [`ci.yml`](.github/workflows/ci.yml) runs the backend and runner suites and builds the dashboard; [`agentqa.yml`](.github/workflows/agentqa.yml) runs the demo suite and posts the PR comment. Copy [`.env.example`](.env.example) for configuration. `AGENTQA_BROWSER_CHANNEL=chrome` reuses an installed Chrome instead of Playwright's bundled Chromium.
