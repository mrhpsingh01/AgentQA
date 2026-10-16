"""
Repair guardrails: intent preservation for selector healing.

A healer that "fixes" a broken locator by clicking *some* button can turn a real regression into a green
test. These checks are deliberately simple, deterministic and shared (vocabulary in
``shared/intent-vocabulary.json``, also read by the runner) so a repair can be refused for stated reasons:

* ``low_confidence``  - below the configured confidence threshold
* ``intent_conflict`` - the replacement has the opposite polarity of the original control
                         (e.g. "Place order" -> "Cancel order")
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Iterable, Literal, Optional

Polarity = Literal["affirm", "cancel", "neutral"]

def _vocabulary_path() -> Path:
    candidates = [
        os.getenv("AGENTQA_INTENT_VOCAB"),
        Path(__file__).resolve().parents[4] / "shared" / "intent-vocabulary.json",  # repo checkout
        Path("/app/shared/intent-vocabulary.json"),  # docker-compose mounts ./shared here
    ]
    for c in candidates:
        if c and Path(c).is_file():
            return Path(c)
    raise FileNotFoundError("intent-vocabulary.json not found (set AGENTQA_INTENT_VOCAB)")


@lru_cache(maxsize=1)
def _vocabulary() -> dict[str, list[re.Pattern[str]]]:
    raw = json.loads(_vocabulary_path().read_text(encoding="utf-8"))

    def compile_all(words: Iterable[str]) -> list[re.Pattern[str]]:
        return [re.compile(rf"(?<![a-z0-9]){re.escape(w)}(?![a-z0-9])") for w in words]

    return {"affirm": compile_all(raw["affirm"]), "cancel": compile_all(raw["cancel"])}


def normalize(text: Optional[str]) -> str:
    """Lower-case, split camelCase / snake_case / kebab-case, collapse punctuation to single spaces."""
    if not text:
        return ""
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    return re.sub(r"[^a-z0-9]+", " ", spaced.lower()).strip()


def polarity(text: Optional[str]) -> Polarity:
    """'cancel' beats 'affirm' ("Cancel order" is a cancel control); unknown text is 'neutral'."""
    norm = normalize(text)
    if not norm:
        return "neutral"
    vocab = _vocabulary()
    if any(p.search(norm) for p in vocab["cancel"]):
        return "cancel"
    if any(p.search(norm) for p in vocab["affirm"]):
        return "affirm"
    return "neutral"


def intent_polarity(*texts: Optional[str]) -> Polarity:
    """Polarity of the first text that carries one (visible text, aria-label, then selector tokens...)."""
    for t in texts:
        p = polarity(t)
        if p != "neutral":
            return p
    return "neutral"


@dataclass(frozen=True)
class GuardrailVerdict:
    allowed: bool
    code: str  # ok | low_confidence | intent_conflict
    reason: str


def evaluate_repair(
    original_texts: Iterable[Optional[str]],
    candidate_texts: Iterable[Optional[str]],
    confidence: float,
    min_confidence: float,
) -> GuardrailVerdict:
    if confidence < min_confidence:
        return GuardrailVerdict(
            False, "low_confidence", f"confidence {confidence:.2f} is below the {min_confidence:.2f} threshold"
        )
    original = intent_polarity(*original_texts)
    candidate = intent_polarity(*candidate_texts)
    if original != "neutral" and candidate != "neutral" and original != candidate:
        return GuardrailVerdict(
            False,
            "intent_conflict",
            f"original control reads as '{original}' but the replacement reads as '{candidate}'",
        )
    return GuardrailVerdict(True, "ok", "intent preserved")
