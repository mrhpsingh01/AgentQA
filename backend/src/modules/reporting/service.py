"""
AgentQA Reporting Service
Includes Root Cause Analysis, Coverage-Gap Analysis, and Data-Driven Parameterization.
"""

from typing import Any
from urllib.parse import urlparse


class ReportingAnalysisService:
    @staticmethod
    def analyze_root_cause(
        error_message: str,
        console_logs: list[str] = [],
        failed_requests: list[dict[str, Any]] = [],
        a11y_violations: list[dict[str, Any]] = []
    ) -> dict[str, Any]:
        """
        Classifies failure root causes into:
        - Console Error
        - API / Network Failure
        - Selector Mutation / Timeout
        - Accessibility (a11y) Non-compliance
        """
        root_causes = []

        if failed_requests:
            for req in failed_requests:
                root_causes.append({
                    "category": "API_FAILURE",
                    "severity": "HIGH",
                    "detail": f"HTTP {req.get('status')} on {req.get('url')}"
                })

        for log in console_logs:
            if "Uncaught TypeError" in log or "SyntaxError" in log or "500" in log:
                root_causes.append({
                    "category": "CONSOLE_EXCEPTION",
                    "severity": "MEDIUM",
                    "detail": log[:200]
                })

        if a11y_violations:
            for v in a11y_violations:
                root_causes.append({
                    "category": "ACCESSIBILITY_VIOLATION",
                    "severity": "LOW",
                    "detail": f"{v.get('id')}: {v.get('description')}"
                })

        if "Timeout" in error_message or "waiting for locator" in error_message:
            root_causes.append({
                "category": "SELECTOR_TIMEOUT",
                "severity": "HIGH",
                "detail": error_message[:200]
            })

        return {
            "primary_category": root_causes[0]["category"] if root_causes else "UNKNOWN",
            "findings_count": len(root_causes),
            "root_causes": root_causes
        }

    @staticmethod
    def calculate_coverage_gaps(
        discovered_routes: list[str],
        tested_routes: list[str]
    ) -> dict[str, Any]:
        """
        Identifies un-tested pages or user flows based on sitemap discovery vs tested recordings.
        """
        def normalize_path(u: str) -> str:
            p = urlparse(u).path.rstrip("/")
            return p if p else "/"

        discovered_set = set(normalize_path(r) for r in discovered_routes if r)
        tested_set = set(normalize_path(r) for r in tested_routes if r)

        untested = list(discovered_set - tested_set)
        coverage_pct = round((len(tested_set & discovered_set) / len(discovered_set) * 100), 1) if discovered_set else 100.0

        return {
            "coverage_percentage": coverage_pct,
            "total_routes_discovered": len(discovered_set),
            "tested_routes_count": len(tested_set),
            "missing_coverage_routes": untested[:25]
        }

    @staticmethod
    def generate_parameterized_test(
        base_test_code: str,
        data_rows: list[dict[str, Any]]
    ) -> str:
        """
        Synthesizes a data-driven parameterized Playwright test from CSV/JSON rows.
        """
        import json
        json_matrix = json.dumps(data_rows, indent=2)

        parameterized_header = f"""// Data-Driven Parameterized Suite
const testDataSet = {json_matrix};

for (const dataRow of testDataSet) {{
  test(`Parameterized Run: ${{JSON.stringify(dataRow)}}`, async ({{ page }}) => {{
    // Parameter values available as: dataRow.username, dataRow.password, etc.
"""
        return parameterized_header + "\n" + base_test_code + "\n  });\n}\n"


reporting_analysis_service = ReportingAnalysisService()
