"""
Server-side healing tiers (verified cache, Level 2, Level 5) and the LLM gateway contract.

The LLM itself is *stubbed* here (`StubLLM`): these tests prove the protocol around a model - skipping when
none is configured, verifying and vetting whatever it returns, never caching unverified output. They do not
measure model quality; that is what scripts/run_benchmark.py is for.
"""

import json
import uuid

import pytest

from src.core.database import async_session_factory, init_db
from src.core.llm_gateway import LLMCallFailed, LLMNotConfigured, llm_gateway
from src.modules.auth import models as _auth  # noqa: F401  (register tables)
from src.modules.projects import models as _projects  # noqa: F401
from src.modules.recordings import models as _recordings  # noqa: F401
from src.modules.test_runner import models as _runner  # noqa: F401
from src.modules.test_generation import models as _generation  # noqa: F401
from src.modules.healing.schemas import HealingRequest
from src.modules.healing.service import healing_service

DOM = """
<body><form>
  <input name="email" type="email" data-testid="email-field">
  <button id="complete-purchase" data-testid="buy" type="button">Complete purchase</button>
  <button id="abort" data-testid="cancel-order" type="button">Cancel order</button>
</form></body>
"""


class StubLLM:
    """Replaces the gateway's network call with canned JSON answers (one per call)."""

    def __init__(self, *answers):
        self.answers = list(answers)
        self.calls = 0

    async def __call__(self, prompt, **kwargs):
        self.calls += 1
        if not self.answers:
            raise LLMCallFailed("stub has no more answers")
        answer = self.answers.pop(0)
        return json.dumps(answer)


@pytest.fixture(autouse=True)
async def _db():
    await init_db()


@pytest.fixture
def llm_on(monkeypatch):
    def install(*answers):
        stub = StubLLM(*answers)
        monkeypatch.setattr(llm_gateway, "configured_providers", lambda: ["stub"])
        monkeypatch.setattr(llm_gateway, "generate_completion", stub)
        llm_gateway.last_provider = "stub"
        return stub

    return install


def request(**over) -> HealingRequest:
    base = dict(
        url="https://shop.test/checkout",
        original_selector="#place-order",
        dom_snapshot=DOM,
        action_type="click",
        element_info={"tagName": "button", "textPreview": "Place order"},
    )
    base.update(over)
    return HealingRequest(**base)


# ------------------------------------------------------------------------------------------ gateway
async def test_gateway_without_credentials_raises_instead_of_simulating_a_model():
    assert llm_gateway.configured_providers() == []
    with pytest.raises(LLMNotConfigured):
        await llm_gateway.generate_completion("anything")


def test_ollama_only_counts_when_the_operator_pointed_at_a_server(monkeypatch):
    assert "ollama" not in llm_gateway.configured_providers()
    monkeypatch.setenv("OLLAMA_HOST", "127.0.0.1:11434")
    assert "ollama" in llm_gateway.configured_providers()


# ------------------------------------------------------------------------------------------ skipping
async def test_without_an_llm_levels_2_and_5_are_skipped_not_faked():
    async with async_session_factory() as db:
        res = await healing_service.heal_selector(request(), db)
    assert res.status == "skipped" and res.healed_selector is None
    assert [(s.level, s.status) for s in res.steps] == [(2, "skipped"), (5, "skipped")]
    assert all("no LLM provider" in s.reason for s in res.steps)


def test_capabilities_report_the_skipped_levels():
    caps = healing_service.capabilities()
    assert caps.llm_configured is False
    assert caps.levels["2"].startswith("skipped") and caps.levels["5"].startswith("skipped")
    assert caps.levels["1"] == caps.levels["3"] == caps.levels["4"] == "available"


# ------------------------------------------------------------------------------------------ level 2
async def test_level2_accepts_a_unique_intent_preserving_selector(llm_on):
    llm_on({"healed_selector": "#complete-purchase", "selector_type": "css", "confidence": 0.92, "reasoning": "same purpose"})
    async with async_session_factory() as db:
        res = await healing_service.heal_selector(request(), db)
    assert res.status == "healed" and res.strategy_level == 2
    assert res.healed_selector == "#complete-purchase" and res.cost_usd_estimate > 0 and res.tokens_estimate > 0


async def test_level2_destructive_replacement_is_blocked(llm_on):
    # The model "fixes" Place order into Cancel order; the second tier proposes nothing usable either.
    llm_on(
        {"healed_selector": "#abort", "selector_type": "css", "confidence": 0.97, "reasoning": "a button"},
        {"intent": "submit", "candidates": []},
    )
    async with async_session_factory() as db:
        res = await healing_service.heal_selector(request(), db)
    assert res.status == "blocked" and res.healed_selector is None
    assert res.guardrail and res.guardrail.code == "intent_conflict"


async def test_level2_ambiguous_or_hallucinated_selectors_are_rejected(llm_on):
    llm_on(
        {"healed_selector": "button", "confidence": 0.99},  # matches 2 elements
        {"intent": "x", "candidates": [{"selector": "#does-not-exist", "confidence": 0.99}]},
    )
    async with async_session_factory() as db:
        res = await healing_service.heal_selector(request(), db)
    assert res.status == "no_match"
    assert any("exactly 1" in s.reason for s in res.steps)


async def test_low_confidence_is_never_applied(llm_on):
    llm_on({"healed_selector": "#complete-purchase", "confidence": 0.4}, {"intent": "x", "candidates": []})
    async with async_session_factory() as db:
        res = await healing_service.heal_selector(request(), db)
    assert res.status == "blocked" and res.guardrail.code == "low_confidence"


# ------------------------------------------------------------------------------------------ level 5
async def test_level5_runs_only_after_level2_fails_and_can_rebuild(llm_on):
    stub = llm_on(
        {"healed_selector": None},
        {"intent": "submit the order", "candidates": [{"selector": 'button:has-text("Complete purchase")', "selector_type": "text", "confidence": 0.81, "reasoning": "text"}]},
    )
    async with async_session_factory() as db:
        res = await healing_service.heal_selector(request(), db)
    assert stub.calls == 2 and res.status == "healed" and res.strategy_level == 5
    assert res.healed_selector == 'button:has-text("Complete purchase")'


# ------------------------------------------------------------------------------------------ cache
async def test_a_proposal_is_not_served_from_cache_until_the_runner_verifies_it(llm_on):
    answer = {"healed_selector": "#complete-purchase", "confidence": 0.9, "reasoning": "r"}
    llm_on(answer)
    unique_url = f"https://shop.test/{uuid.uuid4().hex}"
    async with async_session_factory() as db:
        first = await healing_service.heal_selector(request(url=unique_url), db)
        assert first.status == "healed" and first.cached_id

        # pending (unverified) proposals are NOT served: with no LLM left, the next call is skipped
        llm_on()  # no more answers
        second = await healing_service.heal_selector(request(url=unique_url), db)
        assert second.status in {"no_match", "skipped", "blocked"} and not second.is_cached

        # the runner reports that the test's assertions passed with this repair -> now it is served
        from src.modules.healing.cache import selector_cache_service
        from src.modules.healing.models import HealedSelector

        record = await db.get(HealedSelector, first.cached_id)
        await selector_cache_service.mark_verified(record, True, db)
        third = await healing_service.heal_selector(request(url=unique_url), db)
    assert third.status == "healed" and third.is_cached and third.strategy_level == 1


async def test_a_rejected_proposal_is_never_served(llm_on):
    llm_on({"healed_selector": "#complete-purchase", "confidence": 0.9})
    unique_url = f"https://shop.test/{uuid.uuid4().hex}"
    async with async_session_factory() as db:
        first = await healing_service.heal_selector(request(url=unique_url), db)
        from src.modules.healing.cache import selector_cache_service
        from src.modules.healing.models import HealedSelector

        await selector_cache_service.mark_verified(await db.get(HealedSelector, first.cached_id), False, db)
        llm_on()
        again = await healing_service.heal_selector(request(url=unique_url), db)
    assert not again.is_cached


# ------------------------------------------------------------------------------------------ NVIDIA NIM provider
class _FakeResp:
    status_code = 200
    headers: dict = {}

    def __init__(self, content):
        self._content = content

    def raise_for_status(self):
        pass

    def json(self):
        return {"choices": [{"message": {"content": self._content, "reasoning_content": "ignored trace"}}]}


def _fake_client(sent, content='{"ok": true}'):
    class _Client:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None):
            sent.append({"url": url, "headers": headers, "json": json})
            return _FakeResp(content)

    return _Client


async def test_nvidia_tiers_use_their_own_model_key_and_thinking_mode(monkeypatch):
    import src.core.llm_gateway as gw

    monkeypatch.setattr(gw.settings, "NVIDIA_API_KEY", "key-repair")
    monkeypatch.setattr(gw.settings, "NVIDIA_ESCALATION_API_KEY", "key-escalation")
    sent: list = []
    monkeypatch.setattr(gw.httpx, "AsyncClient", _fake_client(sent))
    assert llm_gateway.configured_providers() == ["nvidia"]

    await llm_gateway.generate_completion("p", provider="nvidia", tier="repair")
    await llm_gateway.generate_completion("p", provider="nvidia", tier="escalation")
    repair, esc = sent
    assert repair["json"]["model"] == "nvidia/nemotron-3.5-lightning-30b-a3b"
    assert repair["headers"]["Authorization"] == "Bearer key-repair"
    assert repair["json"]["chat_template_kwargs"] == {"enable_thinking": False}
    assert esc["json"]["model"] == "nvidia/nemotron-3-ultra-550b-a55b"
    assert esc["headers"]["Authorization"] == "Bearer key-escalation"
    assert esc["json"]["chat_template_kwargs"] == {"enable_thinking": True}
    assert "response_format" not in repair["json"] and "response_format" not in esc["json"]
    assert repair["url"].endswith("/chat/completions")


async def test_nvidia_escalation_without_its_own_key_is_skipped_not_borrowed(monkeypatch):
    import src.core.llm_gateway as gw

    monkeypatch.setattr(gw.settings, "NVIDIA_API_KEY", "key-repair")
    monkeypatch.setattr(gw.settings, "NVIDIA_ESCALATION_API_KEY", "")
    sent: list = []
    monkeypatch.setattr(gw.httpx, "AsyncClient", _fake_client(sent))
    with pytest.raises(LLMCallFailed):
        await llm_gateway.generate_completion("p", provider="nvidia", tier="escalation")
    assert sent == []


async def test_nvidia_empty_final_answer_is_a_failure_not_a_heal(monkeypatch):
    import src.core.llm_gateway as gw

    monkeypatch.setattr(gw.settings, "NVIDIA_API_KEY", "key-repair")
    monkeypatch.setattr(gw.httpx, "AsyncClient", _fake_client([], content=None))
    with pytest.raises(LLMCallFailed):
        await llm_gateway.generate_completion("p", provider="nvidia", tier="repair")


# ------------------------------------------------------------------------------------------ generic OpenAI-compatible provider
def _set_compat(monkeypatch, **over):
    import src.core.llm_gateway as gw

    cfg = dict(LLM_BASE_URL="https://api.example-llm.com/v1", LLM_API_KEY="k1", LLM_MODEL="m-main", LLM_ESCALATION_MODEL=None,
               LLM_ESCALATION_API_KEY=None, LLM_REASONING_EFFORT=None, LLM_JSON_MODE=False, LLM_RPM=0)
    cfg.update(over)
    for k, v in cfg.items():
        monkeypatch.setattr(gw.settings, k, v)
    return gw


async def test_openai_compat_needs_url_key_and_model_to_count_as_configured(monkeypatch):
    gw = _set_compat(monkeypatch, LLM_MODEL=None)
    assert "openai_compat" not in llm_gateway.configured_providers()
    monkeypatch.setattr(gw.settings, "LLM_MODEL", "m-main")
    assert "openai_compat" in llm_gateway.configured_providers()


async def test_openai_compat_tiers_default_to_same_key_and_optionally_switch_model(monkeypatch):
    gw = _set_compat(monkeypatch, LLM_ESCALATION_MODEL="m-big", LLM_REASONING_EFFORT="low", LLM_JSON_MODE=True)
    sent: list = []
    monkeypatch.setattr(gw.httpx, "AsyncClient", _fake_client(sent))
    await llm_gateway.generate_completion("p", provider="openai_compat", tier="repair")
    await llm_gateway.generate_completion("p", provider="openai_compat", tier="escalation")
    repair, esc = sent
    assert repair["json"]["model"] == "m-main" and esc["json"]["model"] == "m-big"
    assert repair["headers"]["Authorization"] == esc["headers"]["Authorization"] == "Bearer k1"
    assert repair["json"]["reasoning_effort"] == "low" and repair["json"]["response_format"] == {"type": "json_object"}
    assert repair["url"] == "https://api.example-llm.com/v1/chat/completions"


async def test_openai_compat_retries_once_on_429(monkeypatch):
    gw = _set_compat(monkeypatch)
    calls: list = []

    class R429:
        status_code = 429
        headers = {"retry-after": "0"}

        def raise_for_status(self):
            raise AssertionError("must retry, not raise")

    class ROk(_FakeResp):
        status_code = 200
        headers = {}

    class _Client:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None):
            calls.append(1)
            return R429() if len(calls) == 1 else ROk('{"ok": 1}')

    monkeypatch.setattr(gw.httpx, "AsyncClient", _Client)
    assert await llm_gateway.generate_completion("p", provider="openai_compat") == '{"ok": 1}'
    assert len(calls) == 2


async def test_strict_provider_never_falls_back_to_another_provider(monkeypatch):
    import src.core.llm_gateway as gw

    _set_compat(monkeypatch)
    monkeypatch.setattr(gw.settings, "NVIDIA_API_KEY", "key-repair")
    monkeypatch.setattr(gw.settings, "LLM_STRICT_PROVIDER", True)
    sent: list = []

    class _Boom(_fake_client(sent)):
        async def post(self, url, headers=None, json=None):
            sent.append(url)
            raise RuntimeError("boom")

    monkeypatch.setattr(gw.httpx, "AsyncClient", _Boom)
    with pytest.raises(LLMCallFailed) as err:
        await llm_gateway.generate_completion("p", provider="openai_compat")
    assert len(sent) == 1 and "nvidia" not in str(err.value) and sent[0].startswith("https://api.example-llm.com")
