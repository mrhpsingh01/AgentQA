# AgentQA zero-trust verification audit

Audit date: October 16, 2026 (America/New_York). Audited the working tree, preserving pre-existing changes. Fixes and generated evidence remain local; no deployment or remote GitHub workflow was triggered.

1. **OVERALL VERDICT:** `[READY TO HOST & PUT ON RESUME]`

This verdict covers the standalone, read-only dashboard and the measured Playwright healing demonstration. The repository now supports defensible resume claims about the evaluated scenarios. It is not a certification of the full multi-user backend for public production service or a guarantee of universal bug detection.

2. **PHASE-BY-PHASE SCORECARD:**

| Phase | Check | Status (PASS/FAIL) | Evidence / Command Output |
|---|---|---|---|
| 0 | Explicit dependencies and reproducibility | PASS | Every direct Python and npm dependency is exact-pinned and checked against its lockfile. Includes email-validator 2.3.0, FastAPI 0.143.2, Taskiq 0.13.0, taskiq-redis 1.2.4, Playwright and Next.js 15.5.28. |
| 0 | Fresh Python environment | PASS | `UV_PROJECT_ENVIRONMENT=.../artifacts/clean-backend uv sync --locked` installed 73 packages in a fresh environment; the then-current 54-test suite passed on Python 3.13. Final expanded suite passes on Python 3.12. |
| 0 | Backend offline tests | PASS | `cd backend; uv run --locked pytest -q`: **56 passed, 6 deprecation warnings, 0 errors**. Conftest clears provider variables, isolates .env loading and database storage, and rejects external HTTP attempts even when fallback code catches their errors. |
| 0 | Runner offline tests | PASS | Clean `npm ci`, `npm run typecheck`, guarded `npm test`: **26 passed**. External TCP connections are rejected by `scripts/offline_guard.cjs`. LLM tests explicitly use a local stub and claim protocol coverage only. |
| 0 | Honest visual/LLM descriptions | PASS | Level 4 reads DOM geometry, not pixels. Remaining pixel/semantic claims were corrected; fabricated visual cards and settings-save feedback were removed. Backend API integration payloads are explicitly labeled fixtures. |
| 1 | Real browser execution | PASS | `python demo.py` launches the stdlib HTTP target and eight actual Chromium/Playwright runs. Reports, DOM snapshots and screenshots are generated under `artifacts/demo/`. |
| 1 | Original | PASS | Test passes, **0 heals**. |
| 1 | Refactored | PASS | Plain selector run fails. AgentQA validates **4 heals**; original URL, visible confirmation and persisted order/email assertions pass. |
| 1 | Broken checkout | PASS | Target returns HTTP 500 for order creation. The unchanged URL assertion fails; **4 repairs rejected, 0 validated**. Later assertions are not reached after that failure. |
| 1 | Removed button / Cancel decoy | PASS | Test fails with **1 refusal, 0 validated heals**. Earlier repairs are rejected; Cancel is not accepted as a substitute. |
| 1 | Credential isolation and cleanup | PASS | Keyless demo and a separate run with sentinel provider keys plus a hostile backend URL both pass the evaluation. External TCP guard remained active. No demo/audit listeners remain on 8931, 8932, 60210, 61255 or 62619. |
| 2 | Dataset and fresh execution | PASS | Actual builder emits **50 unique scenarios**, **38 positive / 12 negative**, across six UI patterns and ten mutation categories. Executed all four modes: **200 browser scenarios** total. |
| 2 | Programmatic metrics | PASS | Fresh offline results: standard **0/38**, default **34/38 (89.5%)**, strict **32/38 (84.2%)**. Live configured LLM: **37/38 (97.4%)**. All modes: **0/12 false passes**. Wrong-element rates: **0/8, 3/8 (37.5%), 1/8 (12.5%), 5/8 (62.5%)** respectively. |
| 2 | Published artifact integrity | PASS | Independently recomputed summaries from raw outputs. JSON, Markdown, generated README table and seed summaries/scenario arrays match. Partial, duplicate, wrong-mode and failed subprocess outputs are rejected. Per-mode execution timestamps are retained. |
| 3 | PR reporter | PASS | Generated comment from current reports includes selector diff, level, confidence, assertion status, evidence and source patches. **All four patches pass `git apply --check`**. Regression covers blank context lines. |
| 3 | GitHub Actions | PASS | Both workflow YAML files parse. PR reporter installation is pinned; same-repository comment permission guard remains. CI uses locked backend installs, guarded runner tests, lint and dashboard build. Actual remote posting was not executed. |
| 3 | Production install/build | PASS | `npm install`, final clean `npm ci`, `npm run lint`, and `npm run build` succeed. **13 static pages**, 0 TypeScript errors, 0 ESLint fatals, 0 environment crashes. `npm audit`: **0 vulnerabilities**. |
| 3 | Standalone runtime | PASS | Production `next start` with no backend URL or demo override: **10 routes**, **4 evidence tabs**, **0 external requests**, **0 browser errors**, **0 HTTP errors**. Both screenshot panes load for every state. |
| 3 | Container packaging | PASS | `docker build -f backend/Dockerfile -t agentqa-audit:local .` succeeds. Container imports FastAPI, Taskiq and bundled guardrails, and contains no `/app/.env`. `docker compose config --quiet` succeeds. Full Postgres/Redis stack was not exercised. |
| 4 | Hiring-manager scan | PASS | README starts with “Repair broken browser tests without hiding real application bugs.” Checkout and benchmark tables are near the top. Metrics now regenerate automatically. |
| 4 | TRY_IT accuracy | PASS | Corrected sequential working directories, locked install commands and approximate demo timing; documented saved-trace behavior. Vercel root is `dashboard`; default demo fallback needs no backend variables. |

3. **FAKE/MOCK DETECTOR:**

- **demo.py:** Real execution. Starts an HTTP server, runs Playwright subprocesses against a live DOM, submits checkout requests and asserts persisted order state. Printed summaries are derived from JSON reports. Evaluation expectations are intentionally specified in code; outcomes are measured.
- **run_benchmark.py:** Real browser execution over **synthetic HTML/JavaScript fixtures** delivered through Playwright route fulfillment. Actual selectors, actions, DOM geometry, assertions and model calls execute. This measures controlled UI scenarios, not a production commerce system. Full mode used the locally configured OpenAI-compatible provider with strict provider selection; three validated repairs used Level 2, none used Level 5. Unit tests of LLM tiers use labeled stubs.
- **dashboard seed:** Static saved execution data, not live execution when a visitor opens the website. Compared every saved demo trace, compressed DOM snapshot and PNG against the current artifacts. All four benchmark modes' scenario data is exported. No manually fabricated benchmark measurements remain in the served demo. The old visual-regression sample cards and settings-save action were fabricated and were removed.

4. **HOSTING READINESS (`dashboard/` & Repo):**

**Production build passed.** The current working tree can be deployed as a standalone read-only Next.js demo with repository root directory `dashboard`. No FastAPI, Postgres, Redis or LLM key is needed. The absent-backend default was tested in the production browser, not just inferred from source. Vercel/Netlify account deployment itself was not performed.

Build passes with nonfatal warnings: Tailwind TypeScript config module inference and absent Next-specific ESLint plugin. The configured ESLint syntax/hooks checks pass; TypeScript validation passes. Backend tests retain six Pydantic class-Config deprecation warnings. These are not build/test errors.

5. **CRITICAL BLOCKERS & AUTO-FIXES:**

All blockers found within this checklist were fixed and affected checks rerun:

1. Dependency manifests used ranges. Exact-pinned direct dependencies and synchronized locks. Updated vulnerable Next.js/React/PostCSS/Tailwind dependency paths; npm audit now reports zero vulnerabilities. Adapted CSS/PostCSS configuration and added an executable ESLint command/configuration.
2. Initial runner attempt failed five tests because Chromium was absent. Installed the declared Playwright Chromium runtime; full runner suite now passes.
3. Merely constructing `expect(value)` counted as a successful assertion. Count only completed matchers; preserve poll, soft, negated, configured and promise matchers. Added a bare-expect rejection regression and positive API-compatibility coverage. Finalization now executes in fixture cleanup.
4. Demo deleted backend variables from an overlay, but the helper restored them from the parent environment. Override them with empty values, including the reporting run ID. Verified isolation with sentinel credentials and a hostile URL under the external-network guard.
5. Demo cleanup omitted explicit socket closure; `--keep-server` exited with its daemon thread. Close server sockets and keep the interactive process alive until interrupted.
6. Benchmark accepted artifact existence without checking Playwright exit status/completeness. Added exit-code, mode, unique-count and positive/negative-count validation with regression tests. Added explicit wrong-element percentage and input-mode validation.
7. README metrics were manually maintained and contradicted its own LLM column. Generate the headline table from benchmark results, retain per-mode timestamps and correct the stale limitation. Claims of “none occurred” are no longer hardcoded into the generator.
8. Seed omitted full-mode scenario rows although it included the full-mode summary. Export all mode rows, show absent data as “not run,” remove hardcoded model/free-tier claims and use actual recorded timestamps instead of fabricated one-second offsets.
9. Visual page showed handwritten differences and falsely acknowledged baseline persistence. Removed the fake cards and controls. Settings also pretended to persist credentials; replaced it with an honest configuration explanation. Corrected backend schema descriptions, semantic-mode summary, guide and metadata.
10. New lint execution exposed unescaped JSX quote errors; fixed them. Original-state evidence comparison reused React keys; fixed them. Updated image rendering and verified all evidence tabs in a production browser.
11. Dockerfile used unsupported shell process substitution with an unpinned fallback and omitted shared vocabulary from standalone packaging. Install from the frozen lockfile, use repository-root build context, copy vocabulary, and exclude secrets/venvs/databases from build context. Rebuilt and smoke-tested the resulting image.
12. PR reporter stripped meaningful blank diff-context lines, corrupting some patches. Preserve context whitespace and write LF output; added a git-apply regression. All four actual repair patches now validate.
13. Corrected README/TRY_IT sequential `cd` commands, stale test-count/timing claims and the checkout test's incorrect product title. Clarified that backend API “end-to-end” tests submit fixture run reports rather than running a browser.

**Material limitations to keep on the resume/demo:** zero false passes means **0 of these 12 synthetic negative cases**, not a general safety guarantee. Default still clicks 3/8 wrong controls; strict clicks 1/8; this LLM run clicks 5/8. Assertions reject those results. LLM cost figures are configuration-based estimates, not verified billing. Actual GitHub workflow execution, cloud deployment and full multi-user backend production hardening remain outside this local verification.

Evidence: `artifacts/audit-pytest.log`, `audit-clean-pytest.log`, `audit-runner.log`, `audit-demo-final.log`, `audit-demo-sentinels.log`, `audit-live.log`, `audit-build.log`, `audit-dashboard.json`, `audit-dashboard-evidence.png`, `audit-pr-comment.md`, `audit-docker.log`, plus raw `artifacts/demo/` and `artifacts/bench/` outputs. Local artifacts are ignored by Git; published benchmark/seed data and this report are reviewable repository files.
