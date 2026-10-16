"""Small helpers shared by demo.py and scripts/run_benchmark.py (run Playwright from Python)."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNNER = ROOT / "runner"
IS_WINDOWS = os.name == "nt"


def runner_ready() -> bool:
    return (RUNNER / "node_modules" / "@playwright").exists()


def pick_channel() -> str | None:
    """Playwright's bundled Chromium when installed, otherwise an installed Chrome (then Edge)."""
    forced = os.environ.get("AGENTQA_BROWSER_CHANNEL")
    if forced:
        return forced
    probe = subprocess.run(
        ["node", "-e", "const {chromium}=require('@playwright/test');console.log(require('fs').existsSync(chromium.executablePath()))"],
        cwd=RUNNER, capture_output=True, text=True, shell=IS_WINDOWS,
    )
    if probe.stdout.strip() == "true":
        return None
    return "chrome"  # falls back to a system browser; install the bundled one with `npx playwright install chromium`


def run_playwright(config: str, env: dict[str, str], channel: str | None, extra: list[str] | None = None) -> subprocess.CompletedProcess:
    full_env = {**os.environ, **env}
    if channel:
        full_env["AGENTQA_BROWSER_CHANNEL"] = channel
    return subprocess.run(
        ["npx", "playwright", "test", "-c", config, *(extra or [])],
        cwd=RUNNER, env=full_env, capture_output=True, text=True, shell=IS_WINDOWS,
    )
