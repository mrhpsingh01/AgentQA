"""
AgentQA Notifications Service
Integrates Slack Webhooks and Jira issue creation for test runs and healing events.
"""

from typing import Any, Optional
import httpx
import structlog

logger = structlog.get_logger()


class NotificationService:
    @staticmethod
    async def send_slack_alert(
        webhook_url: str,
        test_title: str,
        status: str,
        duration_ms: int,
        healing_events: list[dict[str, Any]],
        error_message: Optional[str] = None
    ) -> bool:
        """Sends a rich Slack Block Kit notification on test completion or failure."""
        status_emoji = "✅" if status in ("passed", "healed") else "❌"
        healing_summary = f"⚡ {len(healing_events)} selector(s) autonomously repaired" if healing_events else "No healing required"

        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{status_emoji} AgentQA Run: {test_title}"
                }
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Status:*\n`{status.upper()}`"},
                    {"type": "mrkdwn", "text": f"*Duration:*\n{duration_ms}ms"},
                    {"type": "mrkdwn", "text": f"*Self-Healing:*\n{healing_summary}"},
                    {"type": "mrkdwn", "text": f"*Timestamp:*\n<!date^{int(1728929100)}^{{date_short_pretty}} {{time}}|just now>"}
                ]
            }
        ]

        if error_message:
            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Failure Reason:*\n```{error_message[:400]}```"
                }
            })

        payload = {"blocks": blocks}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(webhook_url, json=payload)
                return res.status_code == 200
        except Exception as e:
            logger.warning("Slack notification dispatch failed", error=str(e))
            return False

    @staticmethod
    async def create_jira_defect(
        jira_webhook_url: str,
        summary: str,
        description: str
    ) -> bool:
        """Dispatches defect creation to Jira webhook automation."""
        payload = {
            "summary": f"[AgentQA Defect] {summary}",
            "description": description
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(jira_webhook_url, json=payload)
                return res.status_code in (200, 201, 204)
        except Exception as e:
            logger.warning("Jira webhook dispatch failed", error=str(e))
            return False


notification_service = NotificationService()
