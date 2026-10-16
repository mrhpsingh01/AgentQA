"""A failed or incomplete browser run must never become a published benchmark."""
import pytest
import json
from types import SimpleNamespace
import run_benchmark as bench


def payload():
    return {"mode": "deterministic", "results": [
        {"id": str(i), "kind": "positive" if i < 38 else "negative"} for i in range(50)
    ]}


def test_complete_payload_required():
    data = payload()
    bench.validate_payload("deterministic", data)
    data["results"].pop()
    with pytest.raises(ValueError, match="50 unique"):
        bench.validate_payload("deterministic", data)


def test_duplicate_scenario_rejected():
    data = payload()
    data["results"][-1] = data["results"][0]
    with pytest.raises(ValueError, match="50 unique"):
        bench.validate_payload("deterministic", data)


def test_wrong_mode_rejected():
    with pytest.raises(ValueError, match="mode mismatch"):
        bench.validate_payload("standard", payload())


def test_failed_playwright_process_rejected_even_with_output(tmp_path, monkeypatch):
    monkeypatch.setattr(bench, "ARTIFACTS", tmp_path)

    def failed_run(*args):
        (tmp_path / "deterministic.json").write_text(json.dumps(payload()))
        return SimpleNamespace(returncode=1, stdout="browser failed", stderr="")

    monkeypatch.setattr(bench, "run_playwright", failed_run)
    with pytest.raises(SystemExit, match="browser failed"):
        bench.run_mode("deterministic", None)
