"""
AgentQA Recording Normalization Service
Cleans, deduplicates, and structures raw action events from the Chrome Extension.
"""

from typing import Any
from urllib.parse import urlparse


class RecordingService:
    @staticmethod
    def normalize_steps(raw_steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """
        Normalizes a stream of browser actions:
        - Filters redundant clicks/inputs
        - Ensures consistent schema
        - Normalizes URLs
        """
        if not raw_steps:
            return []

        cleaned: list[dict[str, Any]] = []

        for step in raw_steps:
            step_type = step.get("type")
            if not step_type:
                continue

            # Ensure ID
            step_id = step.get("id") or f"norm_{len(cleaned)}"

            # Clean URL
            url = step.get("url", "")

            normalized_step = {
                "id": step_id,
                "type": step_type,
                "url": url,
                "timestamp": step.get("timestamp", 0)
            }

            if step_type == "navigate":
                # Avoid consecutive duplicate navigation steps
                if cleaned and cleaned[-1].get("type") == "navigate" and cleaned[-1].get("url") == url:
                    continue
                normalized_step["title"] = step.get("title", "")

            elif step_type in ("click", "change"):
                selectors = step.get("selectors", [])
                normalized_step["selectors"] = selectors
                normalized_step["elementInfo"] = step.get("elementInfo", {})

                if step_type == "click":
                    normalized_step["button"] = step.get("button", "primary")
                    if "checked" in step:
                        normalized_step["checked"] = step["checked"]
                elif step_type == "change":
                    normalized_step["value"] = step.get("value", "")
                    normalized_step["isMasked"] = step.get("isMasked", False)

            elif step_type == "keyDown":
                normalized_step["key"] = step.get("key", "")
                normalized_step["modifiers"] = step.get("modifiers", [])

            cleaned.append(normalized_step)

        return cleaned

    @staticmethod
    def group_steps_by_page(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """
        Groups action steps by page boundaries (URL transitions)
        to facilitate Page Object Model (POM) generation.
        """
        pages: list[dict[str, Any]] = []
        current_page: dict[str, Any] = {
            "page_name": "InitialPage",
            "url": steps[0].get("url", "") if steps else "",
            "steps": []
        }

        for step in steps:
            if step["type"] == "navigate":
                if current_page["steps"]:
                    pages.append(current_page)
                
                # Derive page name from URL pathname
                parsed = urlparse(step.get("url", ""))
                path_parts = [p for p in parsed.path.strip("/").split("/") if p]
                page_name = "".join(part.capitalize() for part in path_parts) or "Home"
                page_name += "Page"

                current_page = {
                    "page_name": page_name,
                    "url": step.get("url", ""),
                    "steps": [step]
                }
            else:
                current_page["steps"].append(step)

        if current_page["steps"]:
            pages.append(current_page)

        return pages


recording_service = RecordingService()
