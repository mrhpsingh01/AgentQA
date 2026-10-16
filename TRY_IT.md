# Try AgentQA in 60 seconds

Pick one. None of them needs an LLM API key.

## Option 1: the seeded dashboard (nothing to run but a web page)

The dashboard ships with the **real** results of `python demo.py` and the benchmark (`dashboard/lib/seed.json`, copied from artifacts, not hand-written). The *Repair Evidence* page toggles between **Original**, **Refactored UI (healed)**, **Broken app (heal rejected)** and **Broken: button removed (refused)**, side by side, with screenshots, the markup diff, the escalation ladder and the assertions.

Open it locally:

```bash
cd dashboard
npm ci
NEXT_PUBLIC_DEMO_MODE=true npm run dev        # http://localhost:3000/evidence
```

(On Windows PowerShell: `$env:NEXT_PUBLIC_DEMO_MODE="true"; npm run dev`.)

Deploy it standalone to Vercel so a reviewer can click a link (the demo is fully static: no backend, no database):

1. Import the repository in Vercel and set **Root Directory** to `dashboard`.
2. Add the environment variable `NEXT_PUBLIC_DEMO_MODE` = `true`.
3. Deploy. The home page opens on the 4-state summary and the benchmark; `/evidence` is the side-by-side view.

This repository does not publish a hosted URL; deploying is one of the three steps above.

## Option 2: run the live demo (about 30 seconds, offline)

```bash
git clone <this repository> && cd AgentQA
cd backend && uv sync && cd ..            # Python 3.11+, installs `rich`
cd runner && npm ci && cd ..              # Node 20+
cd runner && npx playwright install chromium && cd ..   # once; or: set AGENTQA_BROWSER_CHANNEL=chrome
cd backend && uv run python ../demo.py
```

`demo.py` starts the demo shop, then runs one Playwright test, **written once against the original markup**, against four states of the shop, twice each (plain Playwright, then AgentQA), headless. You will see:

* **original**: PASS, 0 heals needed
* **refactored UI**: plain Playwright FAILS; AgentQA escalates the ladder, repairs the selectors, and the original assertions pass (**valid heal**)
* **broken app**: the selector is repaired too, but the order is never created, so the assertions FAIL and the heal is **rejected** (no false pass)
* **button removed**: AgentQA **refuses** to heal onto *Cancel*

For each heal it prints the failed selector, the escalation steps, the DOM compression ratio, the proposed selector and confidence, the verification of the original assertions, and the latency and cost ($0, offline). Evidence (reports, DOM snapshots, screenshots) lands in `artifacts/demo/`.

Turn a run into the pull-request comment CI would post:

```bash
python scripts/pr_comment.py artifacts/demo/refactored/report.json artifacts/demo/broken/report.json --base-dir runner
```

## Option 3: reproduce the benchmark numbers

```bash
cd backend && uv run python ../scripts/run_benchmark.py       # ~8 minutes, headless
```

Runs the 50-scenario mutation suite for plain Playwright, AgentQA deterministic (Levels 1, 3, 4) and AgentQA strict, and rewrites `BENCHMARK_RESULTS.md` and `BENCHMARK_RESULTS.json`. The LLM mode is skipped (and reported as skipped) unless a backend with a provider is configured:

```bash
export AGENTQA_BACKEND_URL=http://localhost:8000 AGENTQA_API_KEY=<key> GEMINI_API_KEY=<provider key on the backend>
python scripts/run_benchmark.py --modes full
```

## Run the test suites

```bash
cd backend && uv run pytest -q                                      # guardrails, LLM-skip behaviour, verified cache, PR comment
cd runner && npx playwright test                                    # Levels 1, 3, 4, 2/5 protocol, guardrails, assertion enforcement
```
