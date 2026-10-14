# AgentQA — Autonomous AI QA Agent for Web Applications

AgentQA is an end-to-end autonomous QA engineering platform for web applications. It automates recording, self-healing Playwright/Cypress test execution, Page Object Model generation, and visual regression testing.

---

## 🌟 Key Features

1. **Chrome Extension Recorder (MV3)**: Captures user flows in real time with Shadow DOM piercing, capture-phase event interceptors, input debouncing, and prioritized multi-strategy selectors (`data-testid` → ARIA → Clean ID → CSS → XPath).
2. **Self-Healing Selectors**: Automatic 5-level escalation when selectors break (Smart Retry → DOM Compression to ~8KB + LLM Repair → Multi-Selector Fallback → Visual Screenshot Matching → Decompose & Rebuild).
3. **AI Test Generation**: Transforms raw recorded action sequences into clean, maintainable Page Object Model (POM) test suites with assertions and human-readable step annotations.
4. **Shared Selector Cache**: Redis + PostgreSQL cache keyed by `(url_pattern, selector_hash)` and DOM component fingerprinting, allowing cross-repo shared healing intelligence.
5. **Multi-Format Export**: Playwright (TypeScript/Python), Cypress, Selenium, and Puppeteer Replay JSON format.
6. **Visual Regression**: Pixel-diff and semantic-diff screenshot comparisons with per-branch baseline management.

---

## 📁 Repository Structure

```text
AgentQA/
├── extension/                  # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── content/                # Content scripts (DOM capture, selector engine)
│   ├── background/             # Service worker session coordinator
│   └── popup/                  # Extension UI & code exporters
│
├── backend/                    # FastAPI Backend Service (Python 3.12+)
│   ├── pyproject.toml
│   ├── alembic/                # Async database migrations
│   └── src/
│       ├── core/               # Database, Redis, Auth & Config
│       ├── api/                # API routes & WebSockets
│       ├── modules/            # Domain modules (Auth, Projects, Recordings, Healing, etc.)
│       └── tasks/              # Taskiq distributed async workers
│
├── runner/                     # Playwright Test Runner (TypeScript / Node.js)
│   ├── src/
│   │   ├── executor.ts         # Test execution orchestrator
│   │   ├── dom-compressor.ts   # HTML compaction engine (~8KB target)
│   │   ├── healing/            # Self-healing proxy & visual locator
│   │   └── reporters/          # Custom reporter streaming to AgentQA Backend
│   └── tests/
│
├── docker-compose.yml          # Local infra (Postgres 16, Redis 7, Backend, Worker)
└── README.md
```

---

## 🚀 Quick Start

### 1. Chrome Extension
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in upper right).
3. Click **Load unpacked** and select the `extension/` directory.
4. Pin the extension to your toolbar, click **Start Recording**, and interact with your web application.

### 2. Backend API
```bash
cd backend
# With uv (recommended)
uv sync
uv run uvicorn src.main:app --reload --port 8000

# Or with Docker
docker compose up -d
```
API Documentation will be available at `http://localhost:8000/docs`.

### 3. Playwright Runner
```bash
cd runner
npm install
npx playwright install --with-deps
npm test
```
