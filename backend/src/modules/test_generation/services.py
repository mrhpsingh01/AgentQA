"""
AgentQA Test Generation Service
Transforms raw recorded user flows into production-ready Page Object Model tests.
"""

import json
import re
from typing import Any
import structlog
from src.core.llm_gateway import llm_gateway
from src.modules.recordings.models import Recording
from src.modules.recordings.services import recording_service
from src.modules.test_generation.prompts import (
    POM_GENERATION_SYSTEM_PROMPT,
    POM_GENERATION_USER_PROMPT
)

logger = structlog.get_logger()


class TestGenerationService:
    async def generate_playwright_test(self, recording: Recording) -> dict[str, Any]:
        """
        Orchestrates LLM prompt pipeline to generate Page Object Model test code.
        """
        # 1. Group steps by page boundaries
        pages = recording_service.group_steps_by_page(recording.steps)
        pages_json = json.dumps(pages, indent=2)

        prompt = POM_GENERATION_USER_PROMPT \
            .replace("{{title}}", recording.title) \
            .replace("{{source_url}}", recording.source_url) \
            .replace("{{pages_json}}", pages_json)

        try:
            raw_response = await llm_gateway.generate_completion(
                prompt=prompt,
                system_instruction=POM_GENERATION_SYSTEM_PROMPT,
                temperature=0.2
            )
            code = self._clean_code_fence(raw_response)
            if "class " not in code:
                code = self._synthesize_pom_code(recording, pages)
        except Exception as e:
            logger.warning("LLM generation encountered issue, using algorithmic synthesizer", error=str(e))
            code = self._synthesize_pom_code(recording, pages)

        # Extract assertions and page object metadata
        assertions = self._extract_assertions(code)
        page_objects_meta = {p["page_name"]: p["url"] for p in pages}

        return {
            "title": recording.title,
            "framework": "playwright",
            "code": code,
            "page_objects": page_objects_meta,
            "assertions": assertions
        }

    def _clean_code_fence(self, text: str) -> str:
        """Strips markdown ```typescript and ``` wrappers from generated output."""
        text = text.strip()
        match = re.search(r"```(?:typescript|ts)?\s*([\s\S]*?)\s*```", text)
        if match:
            return match.group(1).strip()
        return text

    def _extract_assertions(self, code: str) -> list[dict[str, Any]]:
        """Parses expect(...) statements from generated code."""
        assertions = []
        matches = re.findall(r"await\s+expect\(([^)]+)\)\.([a-zA-Z0-9_]+)\(([^)]*)\);", code)
        for target, matcher, args in matches:
            assertions.append({
                "target": target.strip(),
                "matcher": matcher.strip(),
                "args": args.strip()
            })
        return assertions

    def _synthesize_pom_code(self, recording: Recording, pages: list[dict[str, Any]]) -> str:
        """
        Deterministic Page Object Model code synthesizer for offline mode or fallback.
        """
        code = "import { test, expect, Page, Locator } from '@playwright/test';\n\n"

        # Generate Page Object Classes
        for page in pages:
            class_name = page["page_name"]
            code += f"/** Page Object representing {class_name} */\n"
            code += f"export class {class_name} {{\n"
            code += f"  readonly page: Page;\n\n"
            code += f"  constructor(page: Page) {{\n"
            code += f"    this.page = page;\n"
            code += f"  }}\n\n"

            code += f"  async goto() {{\n"
            code += f"    await this.page.goto('{page['url']}');\n"
            code += f"  }}\n\n"

            # Generate helper methods for actions
            for idx, step in enumerate(page["steps"]):
                if step["type"] == "click":
                    loc = self._get_locator_str(step.get("selectors", []))
                    code += f"  async clickAction{idx}() {{\n"
                    code += f"    await {loc}.click();\n"
                    code += f"  }}\n\n"
                elif step["type"] == "change":
                    loc = self._get_locator_str(step.get("selectors", []))
                    val = step.get("value", "")
                    code += f"  async fillInput{idx}(value: string = '{val}') {{\n"
                    code += f"    await {loc}.fill(value);\n"
                    code += f"  }}\n\n"

            code += "}\n\n"

        # Generate Test Execution Spec
        code += f"test.describe('{recording.title}', () => {{\n"
        code += f"  test('runs polished automated flow', async ({{ page }}) => {{\n"

        for page in pages:
            class_name = page["page_name"]
            inst = class_name[0].lower() + class_name[1:]
            code += f"    const {inst} = new {class_name}(page);\n"
            code += f"    await test.step('Navigate to {class_name}', async () => {{\n"
            code += f"      await {inst}.goto();\n"
            code += f"      await expect(page).toHaveURL(/{re.escape(page['url'].split('?')[0])}/);\n"
            code += f"    }});\n\n"

            for idx, step in enumerate(page["steps"]):
                if step["type"] == "click":
                    code += f"    await test.step('Click action on {class_name}', async () => {{\n"
                    code += f"      await {inst}.clickAction{idx}();\n"
                    code += f"    }});\n"
                elif step["type"] == "change":
                    code += f"    await test.step('Fill input on {class_name}', async () => {{\n"
                    code += f"      await {inst}.fillInput{idx}('{step.get('value', '')}');\n"
                    code += f"    }});\n"

        code += "  });\n"
        code += "});\n"
        return code

    def _get_locator_str(self, selectors: list[list[str]]) -> str:
        if not selectors:
            return "this.page.locator('body')"
        
        # Check testid
        for group in selectors:
            s = group[0]
            if s.startswith("[data-testid="):
                match = re.search(r'\[data-testid="?([^"\]]+)"?\]', s)
                if match:
                    return f"this.page.getByTestId('{match.group(1)}')"

        # Check aria
        for group in selectors:
            s = group[0]
            if s.startswith("aria/"):
                aria_name = s.replace("aria/", "")
                return f"this.page.getByRole('button', {{ name: '{aria_name}' }})"

        # Fallback
        first = selectors[0][0]
        return f"this.page.locator('{first}')"


test_generation_service = TestGenerationService()
