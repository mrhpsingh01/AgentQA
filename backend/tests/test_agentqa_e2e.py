"""
AgentQA End-to-End System Verification Suite
Tests the complete flow:
1. Auth & API Keys
2. Recording Ingestion
3. AI POM Test Generation
4. Self-Healing Engine (Levels 1-5)
5. Test Run Reporting & Metrics Calculation
"""

import asyncio
import pytest
from httpx import AsyncClient, ASGITransport
from src.main import app
from src.core.database import async_session_factory, init_db


@pytest.mark.asyncio
async def test_full_agentqa_lifecycle():
    # Initialize DB schemas
    await init_db()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Healthcheck
        health_resp = await client.get("/healthz")
        assert health_resp.status_code == 200
        assert health_resp.json()["status"] == "healthy"

        # 2. Register User
        import time
        unique_email = f"qa-lead-{int(time.time())}@enterprise.com"
        reg_resp = await client.post("/api/v1/auth/register", json={
            "email": unique_email,
            "password": "SecurePassword123!"
        })
        assert reg_resp.status_code == 201
        user_data = reg_resp.json()
        assert user_data["email"] == unique_email

        # 3. Login
        login_resp = await client.post("/api/v1/auth/login", json={
            "email": unique_email,
            "password": "SecurePassword123!"
        })
        assert login_resp.status_code == 200
        token_data = login_resp.json()
        auth_headers = {"Authorization": f"Bearer {token_data['access_token']}"}

        # 4. Create API Key for CI/CD
        key_resp = await client.post("/api/v1/auth/api-keys", json={
            "name": "GitHub Actions CI Key"
        }, headers=auth_headers)
        assert key_resp.status_code == 201
        raw_key = key_resp.json()["raw_key"]
        ci_headers = {"X-API-Key": raw_key}

        # 5. Create Project
        proj_resp = await client.post("/api/v1/projects", json={
            "name": "E-Commerce Checkout",
            "repo_url": "https://github.com/org/checkout-app"
        }, headers=ci_headers)
        assert proj_resp.status_code == 201
        project_id = proj_resp.json()["id"]

        # 6. Ingest Chrome Extension Recording
        sample_steps = [
            {
                "type": "navigate",
                "url": "https://app.example.com/login",
                "timestamp": 1728929100000
            },
            {
                "type": "change",
                "url": "https://app.example.com/login",
                "selectors": [["[data-testid='username']"], ["#user-input"]],
                "value": "alice@company.com",
                "timestamp": 1728929102000
            },
            {
                "type": "click",
                "url": "https://app.example.com/login",
                "selectors": [["[data-testid='submit-btn']"], ["#submit-btn"], ["button[type='submit']"]],
                "elementInfo": {"tagName": "button", "textPreview": "Sign In"},
                "timestamp": 1728929104000
            },
            {
                "type": "navigate",
                "url": "https://app.example.com/dashboard",
                "timestamp": 1728929106000
            }
        ]

        rec_resp = await client.post("/api/v1/recordings", json={
            "project_id": project_id,
            "title": "User Login to Dashboard Flow",
            "source_url": "https://app.example.com/login",
            "steps": sample_steps
        }, headers=ci_headers)
        assert rec_resp.status_code == 201
        recording_id = rec_resp.json()["id"]

        # 7. Generate Page Object Model Test Suite with AI
        gen_resp = await client.post(f"/api/v1/recordings/{recording_id}/generate", json={
            "framework": "playwright",
            "language": "typescript",
            "add_assertions": True,
            "page_object_model": True
        }, headers=ci_headers)
        assert gen_resp.status_code == 201
        test_data = gen_resp.json()
        assert "class " in test_data["code"]  # Confirms POM class generated
        assert "test(" in test_data["code"]
        test_id = test_data["id"]

        # 8. Self-healing API without an LLM provider: the LLM tiers are SKIPPED (never simulated) and the
        #    server says so; the deterministic levels live in the runner and run against the live page.
        compressed_dom = """
        <body>
          <form id="new-auth-form">
            <input name="user_email" data-testid="username" type="text" />
            <button id="signin-button-v2" data-testid="submit-btn" type="button">Sign In</button>
          </form>
        </body>
        """
        heal_body = {
            "project_id": project_id,
            "url": "https://app.example.com/login",
            "original_selector": "#submit-btn",
            "dom_snapshot": compressed_dom,
            "error_message": "locator('#submit-btn').click: Timeout 5000ms exceeded",
            "action_type": "click",
            "element_info": {"tagName": "button", "textPreview": "Sign In"},
        }
        caps = (await client.get("/api/v1/healing/capabilities", headers=ci_headers)).json()
        assert caps["llm_configured"] is False
        assert caps["levels"]["2"].startswith("skipped") and caps["levels"]["4"] == "available"

        heal_resp = await client.post("/api/v1/healing/heal", json=heal_body, headers=ci_headers)
        assert heal_resp.status_code == 200
        healed_data = heal_resp.json()
        assert healed_data["status"] == "skipped" and healed_data["healed_selector"] is None
        assert [s["level"] for s in healed_data["steps"]] == [2, 5]

        # 9. Verified-cache protocol: a repair becomes reusable only after the runner reports that the
        #    test's own assertions passed with it.
        from src.modules.healing.cache import selector_cache_service

        async with async_session_factory() as db:
            pending = await selector_cache_service.save_pending_selector(
                url="https://app.example.com/login", original_selector="#submit-btn",
                healed_selector="#signin-button-v2", selector_type="css", confidence=0.9,
                llm_provider="runner", component_fingerprint=None, db=db, project_id=project_id,
            )
        miss = (await client.post("/api/v1/healing/heal", json=heal_body, headers=ci_headers)).json()
        assert miss["is_cached"] is False  # unverified proposals are never served

        accept = await client.post(
            f"/api/v1/healing/cache/{pending.id}/accept", json={"is_accepted": True}, headers=ci_headers
        )
        assert accept.status_code == 200 and accept.json()["is_verified"] is True
        cache_hit = (await client.post("/api/v1/healing/heal", json=heal_body, headers=ci_headers)).json()
        assert cache_hit["is_cached"] is True and cache_hit["strategy_level"] == 1
        assert cache_hit["healed_selector"] == "#signin-button-v2"
        healed_data = cache_hit

        # 10. Record Test Run Outcome & Metrics
        run_resp = await client.post("/api/v1/runs", json={
            "test_id": test_id,
            "enable_self_healing": True,
            "browser": "chromium"
        }, headers=ci_headers)
        assert run_resp.status_code == 201
        run_id = run_resp.json()["id"]

        report_resp = await client.post(f"/api/v1/runs/{run_id}/results", json={
            "status": "healed",
            "duration_ms": 1420,
            "results": {"total_tests": 1, "passed": 1, "failed": 0},
            "healing_events": [
                {
                    "originalSelector": "#submit-btn",
                    "healedSelector": healed_data["healed_selector"],
                    "strategyLevel": 2,
                    "confidence": 0.88,
                    "reasoning": "Repaired via DOM analysis"
                }
            ]
        }, headers=ci_headers)
        assert report_resp.status_code == 200
        assert report_resp.json()["status"] == "healed"

        # 11. Verify Reporting Analytics & Time Saved
        metrics_resp = await client.get("/api/v1/reporting/overview", headers=ci_headers)
        assert metrics_resp.status_code == 200
        metrics = metrics_resp.json()
        assert metrics["total_runs"] >= 1
        assert metrics["total_healing_events"] >= 1
        assert metrics["engineer_hours_saved"] > 0
        print("\nAll AgentQA Core APIs and Workflows Verified Successfully!")
