"""
AgentQA self-healing: server-side tiers.

The five-level ladder (identities are fixed; *execution order* is cheapest-first, so the $0 deterministic
tiers always run before any LLM call):

  Level 1  Smart Retry                    runner  deterministic   (+ verified selector cache, served here)
  Level 3  Multi-Selector Fallback        runner  deterministic
  Level 4  DOM Geometry & Layout Matcher  runner  deterministic   (bounding boxes + text/role/attribute similarity)
  Level 2  LLM DOM Repair                 server  needs an LLM provider
  Level 5  LLM Decompose & Rebuild        server  needs an LLM provider

This service owns the verified cache and Levels 2 and 5. With no LLM provider configured they are
*skipped* (reported as such), never simulated. Every candidate - cached or LLM-proposed - must resolve to
exactly one element in the snapshot and pass the intent guardrails before it is returned, and even then it
is only a proposal: the runner re-verifies it on the live page and the test's own assertions decide whether
the heal counts.
"""

from __future__ import annotations

import json
import math
import re
from typing import Any, Optional

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.llm_gateway import LLMCallFailed, LLMNotConfigured, llm_gateway
from src.modules.healing import selector_dom
from src.modules.healing.cache import selector_cache_service
from src.modules.healing.guardrails import evaluate_repair
from src.modules.healing.schemas import (
    GuardrailInfo,
    HealingCapabilities,
    HealingRequest,
    HealingResponse,
    LevelNote,
)

logger = structlog.get_logger()

LEVEL_NAMES = {
    1: "Smart Retry (+ verified cache)",
    2: "LLM DOM Repair",
    3: "Multi-Selector Fallback",
    4: "DOM Geometry & Layout Matcher",
    5: "LLM Decompose & Rebuild",
}
LLM_LEVELS = (2, 5)

LEVEL2_PROMPT = """You are a web UI test selector repair agent.

A Playwright test failed because a selector no longer matches after a UI change. Find the element in the
snapshot that serves the SAME user-facing purpose as the original element.

Context:
- Page URL: {url}
- Original broken selector: {original_selector}
- Failure: {error_message}
- User action: {action_type}
- Original element metadata: {element_info}

Compressed DOM snapshot:
```html
{dom}
```

Rules:
1. The replacement must preserve intent. Never choose a control that does the opposite (e.g. replace a
   "Place order" button with "Cancel"). If no element clearly matches, answer with "healed_selector": null.
2. Prefer [data-testid="..."], role=button[name="..."], stable #ids, or tag:has-text("..."). Avoid generated
   class hashes and positional paths.
3. The selector must match exactly one element in the snapshot.
Return ONLY JSON: {{"healed_selector": "...", "selector_type": "testid|role|css|text", "confidence": 0.0-1.0,
"reasoning": "..."}}
"""

LEVEL5_PROMPT = """You are a web UI test selector repair agent. Earlier repair attempts failed, so work in two steps.

1. DECOMPOSE the broken selector and metadata into the element's intent: tag, visible text, role, attributes,
   what the user is trying to do.
2. REBUILD: list up to 3 candidate selectors for the element in the snapshot that fulfils that intent.

Broken selector: {original_selector}
User action: {action_type}
Element metadata: {element_info}
Page URL: {url}

Compressed DOM snapshot:
```html
{dom}
```

Never propose a control with the opposite intent (cancel/delete for a submit/checkout action). Each selector
must match exactly one element. Return ONLY JSON:
{{"intent": "...", "candidates": [{{"selector": "...", "selector_type": "css|text|role|testid", "confidence": 0.0-1.0,
"reasoning": "..."}}]}}
"""


def _estimate_tokens(text: str) -> int:
    return math.ceil(len(text) / 4)


def _parse_json(raw: str) -> Optional[dict[str, Any]]:
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


class HealingEngineService:
    def capabilities(self) -> HealingCapabilities:
        providers = llm_gateway.configured_providers()
        return HealingCapabilities(
            llm_configured=bool(providers),
            providers=providers,
            levels={
                str(lvl): ("available" if lvl not in LLM_LEVELS or providers else "skipped: no LLM provider configured")
                for lvl in LEVEL_NAMES
            },
            confidence_threshold=settings.HEALING_CONFIDENCE_THRESHOLD,
        )

    @staticmethod
    def _original_texts(req: HealingRequest) -> list[Optional[str]]:
        info = req.element_info or {}
        return [info.get("textPreview"), info.get("ariaLabel"), info.get("text"), req.original_selector]

    def _vet(
        self, selector: Optional[str], confidence: float, req: HealingRequest
    ) -> tuple[bool, str, Optional[GuardrailInfo]]:
        """(usable, reason, guardrail) for one proposed selector."""
        if not selector:
            return False, "no selector proposed", None
        element = selector_dom.resolves_uniquely(selector, req.dom_snapshot)
        if element is None:
            n = len(selector_dom.resolve(selector, req.dom_snapshot))
            return False, f"selector resolves to {n} elements in the snapshot (need exactly 1)", None
        verdict = evaluate_repair(
            self._original_texts(req),
            [element.text, element.aria_label, element.attrs.get("value"), element.attrs.get("data-testid")],
            confidence,
            req.min_confidence if req.min_confidence is not None else settings.HEALING_CONFIDENCE_THRESHOLD,
        )
        info = GuardrailInfo(allowed=verdict.allowed, code=verdict.code, reason=verdict.reason)
        return verdict.allowed, verdict.reason, info

    async def heal_selector(self, req: HealingRequest, db: AsyncSession) -> HealingResponse:
        steps: list[LevelNote] = []

        # ---- verified cache (served as Level 1) --------------------------------------------------------
        cached = await selector_cache_service.get_cached_selector(
            url=req.url,
            original_selector=req.original_selector,
            component_fingerprint=req.component_fingerprint,
            db=db,
        )
        if cached:
            ok, why, guard = self._vet(cached["healed_selector"], cached["confidence"], req)
            if ok:
                steps.append(LevelNote(level=1, name=LEVEL_NAMES[1], status="selected", reason="verified cache hit"))
                return HealingResponse(
                    status="healed",
                    healed_selector=cached["healed_selector"],
                    selector_type=cached["selector_type"],
                    confidence=cached["confidence"],
                    strategy_level=1,
                    reasoning=cached["reasoning"],
                    is_cached=True,
                    cached_id=cached["id"],
                    steps=steps,
                    guardrail=guard,
                )
            steps.append(LevelNote(level=1, name=LEVEL_NAMES[1], status="miss", reason=f"cached repair not usable: {why}"))

        # ---- LLM tiers -----------------------------------------------------------------------------------
        wanted = [lvl for lvl in LLM_LEVELS if req.levels is None or lvl in req.levels]
        if not llm_gateway.is_configured():
            for lvl in wanted:
                steps.append(
                    LevelNote(level=lvl, name=LEVEL_NAMES[lvl], status="skipped", reason="no LLM provider configured")
                )
            return HealingResponse(
                status="skipped",
                reasoning="LLM tiers skipped: no provider configured. Deterministic levels are unaffected.",
                steps=steps,
            )

        tokens = 0
        blocked: Optional[GuardrailInfo] = None
        provider: Optional[str] = None
        for lvl in wanted:
            try:
                candidates, used = await (self._level2(req) if lvl == 2 else self._level5(req))
            except (LLMNotConfigured, LLMCallFailed) as exc:
                steps.append(LevelNote(level=lvl, name=LEVEL_NAMES[lvl], status="skipped", reason=f"LLM call failed: {exc}"))
                continue
            tokens += used
            provider = llm_gateway.last_provider

            usable = None
            for cand in candidates:
                ok, why, guard = self._vet(cand["selector"], cand["confidence"], req)
                if ok:
                    usable = cand
                    break
                if guard and not guard.allowed:
                    blocked = guard
                steps.append(LevelNote(level=lvl, name=LEVEL_NAMES[lvl], status="blocked" if guard and not guard.allowed else "miss",
                                       reason=f"{cand['selector']!r}: {why}"))
            if usable:
                record = await selector_cache_service.save_pending_selector(
                    url=req.url,
                    original_selector=req.original_selector,
                    healed_selector=usable["selector"],
                    selector_type=usable["selector_type"],
                    confidence=usable["confidence"],
                    llm_provider=provider or "llm",
                    component_fingerprint=req.component_fingerprint,
                    db=db,
                    project_id=str(req.project_id) if req.project_id else None,
                )
                steps.append(LevelNote(level=lvl, name=LEVEL_NAMES[lvl], status="selected", reason=usable["reasoning"]))
                return HealingResponse(
                    status="healed",
                    healed_selector=usable["selector"],
                    selector_type=usable["selector_type"],
                    confidence=usable["confidence"],
                    strategy_level=lvl,
                    reasoning=usable["reasoning"],
                    cached_id=record.id,
                    steps=steps,
                    guardrail=GuardrailInfo(allowed=True, code="ok", reason="intent preserved"),
                    llm_provider=provider,
                    tokens_estimate=tokens,
                    cost_usd_estimate=self._cost(tokens),
                )
            if not candidates:
                steps.append(LevelNote(level=lvl, name=LEVEL_NAMES[lvl], status="miss", reason="the model proposed no selector"))

        return HealingResponse(
            status="blocked" if blocked else "no_match",
            reasoning="A candidate was refused by the guardrails." if blocked else "No trustworthy replacement found.",
            steps=steps,
            guardrail=blocked,
            llm_provider=provider,
            tokens_estimate=tokens,
            cost_usd_estimate=self._cost(tokens),
        )

    @staticmethod
    def _cost(tokens: int) -> float:
        # Rough split (90% prompt / 10% completion); prices are configurable estimates, not billing data.
        return round(
            tokens * 0.9 / 1e6 * settings.LLM_COST_PER_MTOK_INPUT + tokens * 0.1 / 1e6 * settings.LLM_COST_PER_MTOK_OUTPUT,
            6,
        )

    # ------------------------------------------------------------------------------------------ LLM calls
    async def _level2(self, req: HealingRequest) -> tuple[list[dict[str, Any]], int]:
        prompt = LEVEL2_PROMPT.format(
            url=req.url,
            original_selector=req.original_selector,
            error_message=req.error_message or "element not found",
            action_type=req.action_type,
            element_info=json.dumps(req.element_info or {}),
            dom=req.dom_snapshot[: settings.HEALING_DOM_MAX_BYTES],
        )
        raw = await llm_gateway.generate_completion(prompt=prompt, response_json=True, temperature=0.0, tier="repair")
        tokens = _estimate_tokens(prompt) + _estimate_tokens(raw)
        parsed = _parse_json(raw) or {}
        selector = parsed.get("healed_selector")
        if not selector:
            return [], tokens
        return [
            {
                "selector": str(selector),
                "selector_type": str(parsed.get("selector_type", "css")),
                "confidence": float(parsed.get("confidence", 0.0)),
                "reasoning": str(parsed.get("reasoning", "LLM matched the element by purpose")),
            }
        ], tokens

    async def _level5(self, req: HealingRequest) -> tuple[list[dict[str, Any]], int]:
        prompt = LEVEL5_PROMPT.format(
            url=req.url,
            original_selector=req.original_selector,
            action_type=req.action_type,
            element_info=json.dumps(req.element_info or {}),
            dom=req.dom_snapshot[: settings.HEALING_DOM_MAX_BYTES],
        )
        raw = await llm_gateway.generate_completion(prompt=prompt, response_json=True, temperature=0.0, tier="escalation")
        tokens = _estimate_tokens(prompt) + _estimate_tokens(raw)
        parsed = _parse_json(raw) or {}
        out = []
        for c in parsed.get("candidates", [])[:3]:
            if isinstance(c, dict) and c.get("selector"):
                out.append(
                    {
                        "selector": str(c["selector"]),
                        "selector_type": str(c.get("selector_type", "css")),
                        "confidence": float(c.get("confidence", 0.0)),
                        "reasoning": f"Rebuilt from intent '{parsed.get('intent', '')}': {c.get('reasoning', '')}".strip(),
                    }
                )
        return out, tokens


healing_service = HealingEngineService()
