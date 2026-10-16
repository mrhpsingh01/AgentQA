"""Test environment: an isolated SQLite file and no Redis / LLM credentials, set before `src` is imported.

The backend reads `.env` from the current directory. Developers keep real API keys there, and those must never
reach the tests (they would turn "no provider configured" cases into live LLM calls). So the settings are built
once, from a temporary directory that has no `.env`, and only from the variables set below.
"""

import os
import tempfile
from pathlib import Path

import httpx
import pytest

_TMP = Path(tempfile.mkdtemp(prefix="agentqa-tests-"))
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["REDIS_URL"] = "redis://127.0.0.1:1/0"  # refused immediately -> in-memory fallback cache

# Deterministic runs must not depend on whatever the developer has exported.
for var in (
    "LLM_API_KEY", "LLM_ESCALATION_API_KEY", "LLM_BASE_URL", "LLM_MODEL", "LLM_ESCALATION_MODEL",
    "LLM_REASONING_EFFORT", "LLM_JSON_MODE", "LLM_STRICT_PROVIDER", "LLM_RPM", "DEFAULT_LLM_PROVIDER",
    "NVIDIA_API_KEY", "NVIDIA_ESCALATION_API_KEY", "NVIDIA_MODEL", "NVIDIA_ESCALATION_MODEL", "NVIDIA_BASE_URL",
    "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OLLAMA_HOST", "OLLAMA_BASE_URL",
):
    os.environ.pop(var, None)
os.environ["LLM_COST_PER_MTOK_INPUT"] = "0.30"  # pin pricing so cost assertions are stable
os.environ["LLM_COST_PER_MTOK_OUTPUT"] = "2.50"

# Import the settings from a directory without a `.env` file, then come back.
_cwd = os.getcwd()
os.chdir(_TMP)
try:
    import src.core.config  # noqa: F401,E402  (instantiates `settings` once)
finally:
    os.chdir(_cwd)


@pytest.fixture(autouse=True)
def forbid_external_http(monkeypatch):
    """Fail the suite even if application fallback code catches a forbidden HTTP call."""
    attempted = []
    original_send = httpx.AsyncClient.send

    async def offline_send(client, request, *args, **kwargs):
        if not isinstance(client._transport, httpx.ASGITransport) and request.url.host not in {"localhost", "127.0.0.1", "::1"}:
            attempted.append(request.url.host)
            raise RuntimeError("External HTTP is forbidden in offline tests")
        return await original_send(client, request, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "send", offline_send)
    yield
    assert not attempted, f"External HTTP attempted during offline test: {attempted}"
