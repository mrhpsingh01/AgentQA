"""
AgentQA Multi-Provider LLM Gateway

Unified asynchronous completion across Gemini, Anthropic, OpenAI, NVIDIA NIM and Ollama.

There is deliberately NO simulated-model fallback: when no provider is configured the gateway raises
``LLMNotConfigured`` and callers must skip their LLM-dependent step (the self-healing ladder skips
Levels 2 and 5; test generation falls back to its algorithmic synthesizer). A system that quietly
answers "as if" an LLM had run would make every benchmark number meaningless.
"""

import asyncio
import os
import time
from typing import Any, Optional

import httpx
import structlog

from src.core.config import settings

logger = structlog.get_logger()

PROVIDER_ORDER = ("openai_compat", "nvidia", "gemini", "anthropic", "openai", "ollama")


class LLMNotConfigured(RuntimeError):
    """No LLM provider has credentials / an endpoint configured."""


class LLMCallFailed(RuntimeError):
    """Every configured provider failed."""


def _key(setting_value: Optional[str], env_name: str) -> Optional[str]:
    return setting_value or os.getenv(env_name) or None


class LLMGateway:
    def __init__(self) -> None:
        self.default_provider = settings.DEFAULT_LLM_PROVIDER
        self.last_provider: Optional[str] = None

    # ------------------------------------------------------------------ configuration
    def configured_providers(self) -> list[str]:
        """Providers that can actually be called right now (explicit credentials / endpoint only)."""
        found: list[str] = []
        if _key(settings.LLM_API_KEY, "LLM_API_KEY") and settings.LLM_BASE_URL and settings.LLM_MODEL:
            found.append("openai_compat")
        if _key(settings.NVIDIA_API_KEY, "NVIDIA_API_KEY") or _key(settings.NVIDIA_ESCALATION_API_KEY, "NVIDIA_ESCALATION_API_KEY"):
            found.append("nvidia")
        if _key(settings.GEMINI_API_KEY, "GEMINI_API_KEY"):
            found.append("gemini")
        if _key(settings.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY"):
            found.append("anthropic")
        if _key(settings.OPENAI_API_KEY, "OPENAI_API_KEY"):
            found.append("openai")
        # Ollama has no secret: it only counts when the operator pointed us at a server on purpose.
        if os.getenv("OLLAMA_HOST") or os.getenv("OLLAMA_BASE_URL") or "OLLAMA_BASE_URL" in settings.model_fields_set:
            found.append("ollama")
        return found

    def is_configured(self) -> bool:
        return bool(self.configured_providers())

    # ------------------------------------------------------------------ completion
    async def generate_completion(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        provider: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 2048,
        response_json: bool = False,
        tier: str = "repair",
    ) -> str:
        """Run a completion on the first configured provider that succeeds (preferred one first)."""
        available = self.configured_providers()
        if not available:
            raise LLMNotConfigured(
                "No LLM provider configured (set NVIDIA_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY or OLLAMA_HOST)."
            )

        preferred = provider or self.default_provider
        order = [p for p in (preferred, *PROVIDER_ORDER) if p in available]
        order = list(dict.fromkeys(order))
        if settings.LLM_STRICT_PROVIDER:
            order = [preferred] if preferred in available else []
            if not order:
                raise LLMNotConfigured(f"LLM_STRICT_PROVIDER is on and provider {preferred!r} is not configured")

        last_error: Optional[Exception] = None
        for name in order:
            try:
                if name == "openai_compat":
                    text = await self._call_openai_compat(prompt, system_instruction, temperature, max_tokens, tier)
                elif name == "nvidia":
                    text = await self._call_nvidia(prompt, system_instruction, temperature, max_tokens, tier)
                elif name == "gemini":
                    text = await self._call_gemini(prompt, system_instruction, temperature, response_json)
                elif name == "anthropic":
                    text = await self._call_anthropic(prompt, system_instruction, temperature, max_tokens)
                elif name == "openai":
                    text = await self._call_openai(prompt, system_instruction, temperature, response_json)
                else:
                    text = await self._call_ollama(prompt, system_instruction, temperature)
                self.last_provider = name
                return text
            except Exception as exc:  # try the next configured provider
                detail = f"{type(exc).__name__}: {exc}"
                if isinstance(exc, httpx.HTTPStatusError):
                    detail = f"HTTP {exc.response.status_code}"
                logger.warning("LLM provider failed", provider=name, error=detail)
                last_error = RuntimeError(f"{name}: {detail}")
        raise LLMCallFailed(f"All configured LLM providers failed: {last_error}")

    async def _call_gemini(self, prompt: str, system: Optional[str], temp: float, json_mode: bool) -> str:
        api_key = _key(settings.GEMINI_API_KEY, "GEMINI_API_KEY")
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"gemini-2.5-flash:generateContent?key={api_key}"
        )
        contents = []
        if system:
            contents.append({"role": "user", "parts": [{"text": f"System Instructions:\n{system}"}]})
            contents.append({"role": "model", "parts": [{"text": "Understood. I will follow these instructions."}]})
        contents.append({"role": "user", "parts": [{"text": prompt}]})
        body: dict[str, Any] = {"contents": contents, "generationConfig": {"temperature": temp}}
        if json_mode:
            body["generationConfig"]["responseMimeType"] = "application/json"
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=body)
            resp.raise_for_status()
            return resp.json()["candidates"][0]["content"]["parts"][0]["text"]

    _last_call = 0.0
    _throttle_lock: Optional[asyncio.Lock] = None

    async def _throttle(self) -> None:
        """Space calls at least 60/LLM_RPM seconds apart (free tiers enforce requests-per-minute)."""
        if settings.LLM_RPM <= 0:
            return
        if self._throttle_lock is None:
            self._throttle_lock = asyncio.Lock()
        async with self._throttle_lock:
            wait = self._last_call + 60.0 / settings.LLM_RPM - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_call = time.monotonic()

    async def _call_openai_compat(
        self, prompt: str, system: Optional[str], temp: float, max_tokens: int, tier: str
    ) -> str:
        """Generic OpenAI-compatible endpoint. Retries once on HTTP 429 after the server's Retry-After."""
        escalation = tier == "escalation"
        api_key = (
            (_key(settings.LLM_ESCALATION_API_KEY, "LLM_ESCALATION_API_KEY") if escalation else None)
            or _key(settings.LLM_API_KEY, "LLM_API_KEY")
        )
        model = (settings.LLM_ESCALATION_MODEL if escalation else None) or settings.LLM_MODEL
        if not (api_key and settings.LLM_BASE_URL and model):
            raise LLMNotConfigured("LLM_BASE_URL, LLM_API_KEY and LLM_MODEL must all be set")
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt + "\n\nRespond with a single JSON object and nothing else."})
        body: dict[str, Any] = {"model": model, "messages": messages, "temperature": temp, "max_tokens": max(max_tokens, 4096)}
        if settings.LLM_REASONING_EFFORT:
            body["reasoning_effort"] = settings.LLM_REASONING_EFFORT
        if settings.LLM_JSON_MODE:
            body["response_format"] = {"type": "json_object"}
        url = f"{settings.LLM_BASE_URL.rstrip('/')}/chat/completions"
        async with httpx.AsyncClient(timeout=120.0) as client:
            for attempt in (1, 2):
                await self._throttle()
                resp = await client.post(url, headers={"Authorization": f"Bearer {api_key}"}, json=body)
                if resp.status_code == 429 and attempt == 1:
                    try:
                        delay = min(float(resp.headers.get("retry-after", "10")), 60.0)
                    except ValueError:
                        delay = 10.0
                    await asyncio.sleep(delay)
                    continue
                resp.raise_for_status()
                break
            content = resp.json()["choices"][0]["message"].get("content")
        if not content:
            raise LLMCallFailed(f"{model} returned no final answer (reasoning may have used the token budget)")
        return content

    async def _call_nvidia(
        self, prompt: str, system: Optional[str], temp: float, max_tokens: int, tier: str
    ) -> str:
        """NVIDIA NIM chat completions. ``tier`` picks the model and its own key: "repair" (Level 2, thinking off
        for latency) or "escalation" (Level 5, thinking on). The reasoning trace is discarded; only the final
        ``content`` is returned. No ``response_format``: some of these models do not support structured output,
        so callers parse JSON out of the text."""
        escalation = tier == "escalation"
        api_key = (
            _key(settings.NVIDIA_ESCALATION_API_KEY, "NVIDIA_ESCALATION_API_KEY")
            if escalation
            else _key(settings.NVIDIA_API_KEY, "NVIDIA_API_KEY")
        )
        if not api_key:
            raise LLMNotConfigured(f"no NVIDIA API key configured for the {tier} tier")
        model = settings.NVIDIA_ESCALATION_MODEL if escalation else settings.NVIDIA_MODEL
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt + "\n\nRespond with a single JSON object and nothing else."})
        body: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temp,
            "max_tokens": max(max_tokens, 8192) if escalation else max_tokens,
            "chat_template_kwargs": {"enable_thinking": escalation},
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=180.0 if escalation else 60.0) as client:
            resp = await client.post(
                f"{settings.NVIDIA_BASE_URL.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json=body,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"].get("content")
        if not content:
            raise LLMCallFailed(f"NVIDIA {model} returned no final answer (reasoning may have used the token budget)")
        return content

    async def _call_openai(self, prompt: str, system: Optional[str], temp: float, json_mode: bool) -> str:
        api_key = _key(settings.OPENAI_API_KEY, "OPENAI_API_KEY")
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        body: dict[str, Any] = {"model": "gpt-4o-mini", "messages": messages, "temperature": temp}
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json=body,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

    async def _call_anthropic(self, prompt: str, system: Optional[str], temp: float, max_tokens: int) -> str:
        api_key = _key(settings.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY")
        body: dict[str, Any] = {
            "model": "claude-3-5-sonnet-20241022",
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temp,
        }
        if system:
            body["system"] = system
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key or "",
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=body,
            )
            resp.raise_for_status()
            return resp.json()["content"][0]["text"]

    async def _call_ollama(self, prompt: str, system: Optional[str], temp: float) -> str:
        base = os.getenv("OLLAMA_HOST") or settings.OLLAMA_BASE_URL
        if not base.startswith("http"):
            base = f"http://{base}"
        body = {
            "model": settings.OLLAMA_MODEL,
            "prompt": prompt,
            "system": system or "",
            "stream": False,
            "options": {"temperature": temp},
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(f"{base.rstrip('/')}/api/generate", json=body)
            resp.raise_for_status()
            return resp.json().get("response", "")


llm_gateway = LLMGateway()
