# Try AgentQA in 60 seconds

Pick one. None of them needs an LLM API key.

## Option 1: the seeded dashboard (nothing to run but a web page)

The dashboard ships with the **real** results of `python demo.py` and the benchmark (`dashboard/lib/seed.json`, copied from artifacts, not hand-written). The *Repair Evidence* page toggles between **Original**, **Refactored UI (healed)**, **Broken app (heal rejected)** and **Broken: button removed (refused)**, side by side, with screenshots, the markup diff, the escalation ladder and the assertions. These are saved execution traces; opening the dashboard does not run Playwright or call an LLM.

Open it locally:

```bash
cd dashboard
npm ci
NEXT_PUBLIC_DEMO_MODE=true npm run dev        # http://localhost:3000/evidence
```

(On Windows PowerShell: `$env:NEXT_PUBLIC_DEMO_MODE="true"; npm run dev`.)

Deploy it standalone to Vercel so a reviewer can click a link (the demo is fully static: no backend, no database):

1. Import the repository in Vercel and set **Root Directory** to `dashboard`.
2. Optional: set `NEXT_PUBLIC_DEMO_MODE` = `true` (it is also the default whenever `NEXT_PUBLIC_BACKEND_URL` is not set).
3. Deploy. The home page opens on the 4-state summary and the benchmark; `/evidence` is the side-by-side view.

This repository does not publish a hosted URL; deploying is one of the three steps above.

## Option 2: run the live demo (about a minute after setup, offline)

```bash
git clone https://github.com/mrhpsingh01/AgentQA.git && cd AgentQA
cd backend && uv sync --locked && cd ..            # Python 3.11+, installs `rich`
cd runner && npm ci && cd ..              # Node 20+
cd runner && npx playwright install chromium && cd ..   # once; or: set AGENTQA_BROWSER_CHANNEL=chrome
cd backend && uv run python ../demo.py && cd ..
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
cd backend && uv run python ../scripts/run_benchmark.py && cd ..  # ~6 minutes, headless
```

Runs the 50-scenario mutation suite for plain Playwright, AgentQA deterministic (Levels 1, 3, 4) and AgentQA strict, and rewrites `BENCHMARK_RESULTS.md` and `BENCHMARK_RESULTS.json`. The LLM column of the committed report comes from one earlier run on Groq's free tier (`openai/gpt-oss-120b`); a keyless run keeps that stored result and never overwrites it.

To reproduce the LLM column you need a running backend with a provider (the backend also reads `backend/.env`; copy `.env.example`):

```bash
# terminal 1
cd backend && DEFAULT_LLM_PROVIDER=openai_compat LLM_STRICT_PROVIDER=true   LLM_BASE_URL=https://api.groq.com/openai/v1 LLM_API_KEY=<your key> LLM_MODEL=openai/gpt-oss-120b LLM_RPM=25   uv run uvicorn src.main:app --port 8000
# create a runner key: register, log in, then POST /api/v1/auth/api-keys (see backend/tests/test_agentqa_e2e.py)
# terminal 2
export AGENTQA_BACKEND_URL=http://localhost:8000 AGENTQA_API_KEY=<runner key>
python scripts/run_benchmark.py --modes full
```

## Run the test suites

```bash
cd backend && uv run --locked pytest -q && cd ..                     # guardrails, LLM-skip behaviour, verified cache, PR comment
cd runner && npm test && cd ..                                      # Levels 1, 3, 4, 2/5 protocol, guardrails, assertion enforcement
```
