"""
AgentQA 5-Level Escalation Self-Healing Engine
Orchestrates selector repair across Smart Cache, LLM DOM Analysis, Fallback Tiers, Visual Matching, and Decomposition.
"""

import json
import re
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
import structlog
from src.core.config import settings
from src.core.llm_gateway import llm_gateway
from src.modules.healing.cache import selector_cache_service
from src.modules.healing.schemas import HealingRequest, HealingResponse

logger = structlog.get_logger()

HEALING_PROMPT_TEMPLATE = """You are a specialized Web UI Test Selector Healing Agent.

A Playwright test failed because an element selector timed out or broke after a UI update.
Your goal is to inspect the compressed DOM snapshot and return the updated, working Playwright selector.

Context:
- Page URL: {url}
- Original Broken Selector: {original_selector}
- Failure Error: {error_message}
- User Action: {action_type}
- Original Element Metadata: {element_info}

Compressed DOM Snapshot:
```html
{compressed_dom}
```

Instructions:
1. Locate the element that serves the exact same user-facing purpose as the original element.
2. Selectors MUST adhere to Playwright best practices:
   - Prefer semantic test IDs: [data-testid="..."]
   - Prefer ARIA role/name: getByRole(...) or [aria-label="..."]
   - Prefer stable IDs or semantic tags with text: button:has-text("...")
   - AVOID fragile generated CSS hashes or deep index paths.
3. Return ONLY a valid JSON object in this exact schema:
{{
  "healed_selector": "the updated locator string",
  "selector_type": "testid | role | label | css | text | xpath",
  "confidence": 0.85,
  "reasoning": "brief explanation of why this element is the correct match"
}}
"""


class HealingEngineService:
    async def heal_selector(self, req: HealingRequest, db: AsyncSession) -> HealingResponse:
        """
        Executes the 5-level escalation healing pipeline.
        """
        # =========================================================
        # LEVEL 1: Smart Retry & Cache Lookup
        # =========================================================
        cached = await selector_cache_service.get_cached_selector(
            url=req.url,
            original_selector=req.original_selector,
            component_fingerprint=req.component_fingerprint,
            db=db
        )
        if cached and self._validate_selector_in_dom(cached["healed_selector"], req.dom_snapshot):
            logger.info("Level 1 Cache Hit", selector=cached["healed_selector"], confidence=cached["confidence"])
            import uuid
            c_id = uuid.UUID(cached["id"]) if "id" in cached else None
            return HealingResponse(
                healed_selector=cached["healed_selector"],
                selector_type=cached["selector_type"],
                confidence=cached["confidence"],
                strategy_level=1,
                reasoning=cached["reasoning"],
                is_cached=True,
                cached_id=c_id
            )

        # =========================================================
        # LEVEL 2: AI Selector Regeneration (DOM + LLM)
        # =========================================================
        ai_result = await self._level2_llm_healing(req)
        if ai_result and ai_result.confidence >= settings.HEALING_CONFIDENCE_THRESHOLD and self._validate_selector_in_dom(ai_result.healed_selector, req.dom_snapshot):
            logger.info("Level 2 AI Healing Succeeded", selector=ai_result.healed_selector, confidence=ai_result.confidence)
            # Save to persistent cache
            rec = await selector_cache_service.save_healed_selector(
                url=req.url,
                original_selector=req.original_selector,
                healed_selector=ai_result.healed_selector,
                selector_type=ai_result.selector_type,
                confidence=ai_result.confidence,
                llm_provider=settings.DEFAULT_LLM_PROVIDER,
                component_fingerprint=req.component_fingerprint,
                db=db,
                project_id=str(req.project_id) if req.project_id else None
            )
            ai_result.cached_id = rec.id
            return ai_result

        # =========================================================
        # LEVEL 3: Multi-Selector Fallback Escalation
        # =========================================================
        if req.fallback_selectors:
            fallback_result = self._level3_fallback_match(req.fallback_selectors, req.dom_snapshot)
            if fallback_result:
                logger.info("Level 3 Multi-Selector Fallback Succeeded", selector=fallback_result.healed_selector)
                rec = await selector_cache_service.save_healed_selector(
                    url=req.url,
                    original_selector=req.original_selector,
                    healed_selector=fallback_result.healed_selector,
                    selector_type=fallback_result.selector_type,
                    confidence=fallback_result.confidence,
                    llm_provider="fallback_tier",
                    component_fingerprint=req.component_fingerprint,
                    db=db,
                    project_id=str(req.project_id) if req.project_id else None
                )
                fallback_result.cached_id = rec.id
                return fallback_result

        # =========================================================
        # LEVEL 4 & 5: Decompose, Rebuild & Spatial Match
        # =========================================================
        decomposed = self._level5_decompose_rebuild(req.original_selector, req.element_info, req.dom_snapshot)
        if decomposed:
            logger.info("Level 5 Decompose & Rebuild Succeeded", selector=decomposed.healed_selector)
            rec = await selector_cache_service.save_healed_selector(
                url=req.url,
                original_selector=req.original_selector,
                healed_selector=decomposed.healed_selector,
                selector_type=decomposed.selector_type,
                confidence=decomposed.confidence,
                llm_provider="heuristic_rebuild",
                component_fingerprint=req.component_fingerprint,
                db=db,
                project_id=str(req.project_id) if req.project_id else None
            )
            decomposed.cached_id = rec.id
            return decomposed

        # If all levels fail, return best-effort fallback
        return HealingResponse(
            healed_selector=req.original_selector,
            selector_type="css",
            confidence=0.1,
            strategy_level=5,
            reasoning="Could not confidently locate replacement element in current DOM snapshot.",
            is_cached=False
        )

    async def _level2_llm_healing(self, req: HealingRequest) -> Optional[HealingResponse]:
        """Invokes LLM with compressed DOM snapshot."""
        prompt = HEALING_PROMPT_TEMPLATE.format(
            url=req.url,
            original_selector=req.original_selector,
            error_message=req.error_message or "Element timed out after 5000ms",
            action_type=req.action_type,
            element_info=json.dumps(req.element_info or {}),
            compressed_dom=req.dom_snapshot[:settings.HEALING_DOM_MAX_BYTES]
        )

        try:
            raw_output = await llm_gateway.generate_completion(
                prompt=prompt,
                response_json=True,
                temperature=0.1
            )
            
            # Clean possible markdown fence
            cleaned = re.sub(r"^```(?:json)?\s*", "", raw_output.strip())
            cleaned = re.sub(r"\s*```$", "", cleaned)
            parsed = json.loads(cleaned)

            return HealingResponse(
                healed_selector=parsed.get("healed_selector", req.original_selector),
                selector_type=parsed.get("selector_type", "css"),
                confidence=float(parsed.get("confidence", 0.7)),
                strategy_level=2,
                reasoning=parsed.get("reasoning", "LLM identified updated element in DOM"),
                is_cached=False
            )
        except Exception as e:
            logger.warning("Level 2 LLM healing invocation failed", error=str(e))
            return None

    def _validate_selector_in_dom(self, selector: str, dom: str) -> bool:
        """Validates whether a selector matches elements in the compressed DOM."""
        if not selector or not dom:
            return False
        clean = selector.replace("aria/", "").replace("xpath//", "").replace("xpath/", "").strip()

        # Check ID: #my-id
        if clean.startswith("#"):
            raw_id = clean[1:]
            return f'id="{raw_id}"' in dom or f"id='{raw_id}'" in dom

        # Check data-testid: [data-testid="xyz"]
        if "data-testid" in clean:
            match = re.search(r'data-testid=["\']?([^"\'\]]+)', clean)
            if match and (f'data-testid="{match.group(1)}"' in dom or f"data-testid='{match.group(1)}'" in dom):
                return True

        # Check text matcher: button:has-text('Submit') or text=Submit
        if ":has-text(" in clean:
            match = re.search(r":has-text\(['\"]?([^'\")]+)", clean)
            if match and match.group(1) in dom:
                return True

        # Check attribute matchers: [name="xyz"], [aria-label="xyz"], a#get-started
        attr_match = re.search(r'\[([a-zA-Z0-9_-]+)=["\']?([^"\'\]]+)', clean)
        if attr_match:
            attr_name = attr_match.group(1)
            attr_val = attr_match.group(2)
            return (f'{attr_name}="{attr_val}"' in dom or f"{attr_name}='{attr_val}'" in dom)

        # Check tag + id (e.g., a#get-started)
        if "#" in clean:
            raw_id = clean.split("#")[-1]
            return f'id="{raw_id}"' in dom or f"id='{raw_id}'" in dom

        return clean in dom

    def _level3_fallback_match(self, fallbacks: list[list[str]], dom: str) -> Optional[HealingResponse]:
        """Checks if any recorded alternative selector exists in the DOM snapshot."""
        for group in fallbacks:
            for candidate in group:
                if not candidate:
                    continue
                if self._validate_selector_in_dom(candidate, dom):
                    sel_type = "testid" if "testid" in candidate else "css"
                    return HealingResponse(
                        healed_selector=candidate,
                        selector_type=sel_type,
                        confidence=0.85,
                        strategy_level=3,
                        reasoning=f"Alternative recorded selector '{candidate}' verified in DOM",
                        is_cached=False
                    )
        return None

    def _level5_decompose_rebuild(self, selector: str, element_info: Optional[dict[str, Any]], dom: str) -> Optional[HealingResponse]:
        """Decomposes selector and attempts heuristic reconstruction."""
        info = element_info or {}
        tag = info.get("tagName", "button")
        text = info.get("textPreview", "").strip()

        if text and len(text) < 40 and text in dom:
            return HealingResponse(
                healed_selector=f"{tag}:has-text('{text}')",
                selector_type="text",
                confidence=0.78,
                strategy_level=5,
                reasoning=f"Reconstructed locator using semantic tag '{tag}' and verified text content '{text}'",
                is_cached=False
            )

        name = info.get("name")
        if name and f'name="{name}"' in dom:
            return HealingResponse(
                healed_selector=f'{tag}[name="{name}"]',
                selector_type="css",
                confidence=0.82,
                strategy_level=5,
                reasoning=f"Reconstructed locator using functional attribute name='{name}'",
                is_cached=False
            )

        return None


healing_service = HealingEngineService()
