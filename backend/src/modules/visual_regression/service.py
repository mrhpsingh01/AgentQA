"""
AgentQA Visual Regression Service
Handles screenshot change detection (encoded-byte diff), semantic summaries, and baseline storage per branch/env.
"""

import base64
import hashlib
import io
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog
from src.modules.visual_regression.models import VisualBaseline
from src.modules.visual_regression.schemas import VisualCompareRequest, VisualCompareResponse

logger = structlog.get_logger()


class VisualRegressionService:
    @staticmethod
    async def compare_screenshot(
        req: VisualCompareRequest,
        db: AsyncSession
    ) -> VisualCompareResponse:
        """
        Compares step screenshot against branch/environment baseline.
        Auto-creates baseline on first run.
        """
        img_bytes = base64.b64decode(req.screenshot_base64)
        current_hash = hashlib.sha256(img_bytes).hexdigest()

        # Query baseline
        query = select(VisualBaseline).where(
            VisualBaseline.branch == req.branch,
            VisualBaseline.environment == req.environment,
            VisualBaseline.step_key == req.step_key
        )
        if req.project_id:
            query = query.where(VisualBaseline.project_id == req.project_id)

        result = await db.execute(query)
        baseline = result.scalar_one_or_none()

        # 1. If no baseline exists, save current as baseline
        if not baseline:
            baseline = VisualBaseline(
                project_id=req.project_id,
                branch=req.branch,
                environment=req.environment,
                step_key=req.step_key,
                image_base64=req.screenshot_base64,
                image_hash=current_hash
            )
            db.add(baseline)
            await db.commit()
            return VisualCompareResponse(
                step_key=req.step_key,
                has_diff=False,
                diff_percentage=0.0,
                is_baseline_created=True,
                semantic_summary="Baseline screenshot established for branch and environment."
            )

        # 2. If hashes match exactly, 0% diff
        if current_hash == baseline.image_hash:
            return VisualCompareResponse(
                step_key=req.step_key,
                has_diff=False,
                diff_percentage=0.0,
                is_baseline_created=False,
                semantic_summary="Byte-identical to the golden baseline."
            )

        # 3. Compare encoded bytes (legacy request field names retain API compatibility).
        base_bytes = base64.b64decode(baseline.image_base64)
        diff_pct = VisualRegressionService._calculate_byte_diff_ratio(img_bytes, base_bytes)
        has_diff = diff_pct > req.pixel_threshold_pct

        summary = f"Visual difference detected: {diff_pct:.2f}% of encoded image bytes differ."
        if req.mode == "semantic":
            summary += " Semantic analysis is not implemented; this is an encoded-byte comparison only."

        return VisualCompareResponse(
            step_key=req.step_key,
            has_diff=has_diff,
            diff_percentage=diff_pct,
            is_baseline_created=False,
            semantic_summary=summary
        )

    @staticmethod
    def _calculate_byte_diff_ratio(img1: bytes, img2: bytes) -> float:
        """Share of differing bytes between two *encoded* images (PNG/JPEG bytes). This is a cheap change detector, not a
        decoded-pixel comparison: compression can make visually identical images differ."""
        if len(img1) == 0 or len(img2) == 0:
            return 100.0

        min_len = min(len(img1), len(img2))
        max_len = max(len(img1), len(img2))

        mismatches = sum(1 for i in range(min_len) if img1[i] != img2[i])
        mismatches += (max_len - min_len)

        ratio = (mismatches / max_len) * 100.0
        return round(ratio, 2)


visual_service = VisualRegressionService()
