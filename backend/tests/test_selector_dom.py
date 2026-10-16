"""Server-side selector resolution used to vet LLM output before it is believed."""

from src.modules.healing.selector_dom import resolve, resolves_uniquely

DOM = """
<body>
  <form id="f">
    <input name="email" type="email" placeholder="Email" data-testid="email-field">
    <button id="pay" data-testid="pay-btn" class="btn primary">Pay now</button>
    <button id="cancel" class="btn">Cancel</button>
    <a href="/help">Help</a>
  </form>
</body>
"""


def test_css_id_and_attribute_selectors():
    assert len(resolve("#pay", DOM)) == 1
    assert len(resolve('[data-testid="pay-btn"]', DOM)) == 1
    assert len(resolve("button.btn", DOM)) == 2  # ambiguous
    assert resolves_uniquely("button.btn", DOM) is None


def test_has_text_and_text_engine():
    el = resolves_uniquely('button:has-text("Pay now")', DOM)
    assert el is not None and el.attrs["id"] == "pay"
    assert resolves_uniquely("text=Cancel", DOM).attrs["id"] == "cancel"


def test_role_with_accessible_name():
    assert resolves_uniquely('role=button[name="Cancel"]', DOM).attrs["id"] == "cancel"
    assert resolves_uniquely('role=link[name="Help"]', DOM).tag == "a"
    assert resolve('role=button[name="Missing"]', DOM) == []


def test_unsupported_or_malformed_selectors_resolve_to_nothing():
    assert resolve("", DOM) == []
    assert resolve("button[[[", DOM) == []
    assert resolve("#nope", DOM) == []
