"""Intent-preserving repair: the guardrails refuse destructive / ambiguous / low-confidence repairs."""

import pytest

from src.modules.healing.guardrails import evaluate_repair, intent_polarity, polarity


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Place order", "affirm"),
        ("Complete purchase", "affirm"),
        ("Checkout", "affirm"),
        ("Sign in", "affirm"),
        ("Cancel", "cancel"),
        ("Cancel order", "cancel"),  # cancel beats the word "order"
        ("Delete account", "cancel"),
        ("Back to cart", "cancel"),
        ("Remove item", "cancel"),
        ("Subscribe to newsletter", "affirm"),
        ("Nobody", "neutral"),  # 'no' must match as a word, not a substring
        ("Details", "neutral"),
        ("", "neutral"),
        (None, "neutral"),
    ],
)
def test_polarity(text, expected):
    assert polarity(text) == expected


def test_selector_tokens_carry_intent_too():
    assert intent_polarity("#place-order-btn") == "affirm"
    assert intent_polarity("[data-testid='cancelOrder']") == "cancel"
    assert intent_polarity(None, "", "#checkout") == "affirm"  # first texts without polarity are skipped


def test_submit_to_cancel_is_refused():
    verdict = evaluate_repair(["Place order", "#place-order"], ["Cancel", None], confidence=0.95, min_confidence=0.7)
    assert not verdict.allowed and verdict.code == "intent_conflict"


def test_cancel_to_submit_is_refused_symmetrically():
    verdict = evaluate_repair(["Cancel"], ["Place order"], confidence=0.95, min_confidence=0.7)
    assert not verdict.allowed and verdict.code == "intent_conflict"


def test_same_polarity_is_allowed_even_when_the_label_changed():
    verdict = evaluate_repair(["Place order"], ["Complete purchase"], confidence=0.9, min_confidence=0.7)
    assert verdict.allowed and verdict.code == "ok"


def test_neutral_original_is_not_blocked_on_text_alone():
    assert evaluate_repair(["#thing-7"], ["Anything"], confidence=0.9, min_confidence=0.7).allowed


def test_low_confidence_is_refused_before_anything_else():
    verdict = evaluate_repair(["Place order"], ["Place order"], confidence=0.69, min_confidence=0.7)
    assert not verdict.allowed and verdict.code == "low_confidence"
