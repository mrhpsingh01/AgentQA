"""Test environment: an isolated SQLite file and no Redis / LLM credentials, set before `src` is imported."""

import os
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="agentqa-tests-"))
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["REDIS_URL"] = "redis://127.0.0.1:1/0"  # refused immediately -> in-memory fallback cache

# Deterministic runs must not depend on whatever credentials the developer has exported.
for var in ("LLM_API_KEY", "LLM_ESCALATION_API_KEY", "LLM_BASE_URL", "LLM_MODEL", "NVIDIA_API_KEY", "NVIDIA_ESCALATION_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OLLAMA_HOST", "OLLAMA_BASE_URL"):
    os.environ.pop(var, None)
# backend/.env may hold real keys: an empty value in the process environment beats the dotenv file.
os.environ["NVIDIA_API_KEY"] = ""
os.environ["NVIDIA_ESCALATION_API_KEY"] = ""
os.environ["LLM_COST_PER_MTOK_INPUT"] = "0.30"  # pin pricing so a developer .env cannot change cost assertions
os.environ["LLM_COST_PER_MTOK_OUTPUT"] = "2.50"
os.environ["LLM_API_KEY"] = ""
os.environ["LLM_BASE_URL"] = ""
os.environ["LLM_MODEL"] = ""
