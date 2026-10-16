"""
Resolve a Playwright-style selector against a (compressed) HTML snapshot, server side.

An LLM may return any string. Before it is believed, the selector must resolve to exactly one element in
the snapshot we sent. Supported forms (everything else resolves to nothing, i.e. is rejected):

* plain CSS                      ``#id``, ``[data-testid="x"]``, ``button.primary``
* CSS + text filter              ``button:has-text("Pay")``, ``:text("Pay")``
* ``text=Pay`` / ``text="Pay"``  visible text equals / contains
* ``role=button[name="Pay"]``    ARIA role (implicit for button/a/input types) with accessible name
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from bs4 import BeautifulSoup, Tag

_HAS_TEXT = re.compile(r"^(?P<css>.*?):(?:has-text|text)\((?P<q>['\"])(?P<text>.*)(?P=q)\)\s*$", re.DOTALL)
_TEXT_ENGINE = re.compile(r"^text=(?P<q>['\"]?)(?P<text>.*)(?P=q)$", re.DOTALL)
_ROLE_ENGINE = re.compile(r"^role=(?P<role>[a-z]+)(?:\[name=(?P<q>['\"])(?P<name>.*)(?P=q)i?\])?$", re.DOTALL)

_IMPLICIT_ROLES = {
    "button": lambda t: t.name == "button" or (t.name == "input" and (t.get("type") or "").lower() in {"button", "submit", "reset"}),
    "link": lambda t: t.name == "a" and t.has_attr("href"),
    "textbox": lambda t: t.name in {"textarea"} or (t.name == "input" and (t.get("type") or "text").lower() in {"text", "email", "search", "tel", "url", "password"}),
}


@dataclass(frozen=True)
class ResolvedElement:
    tag: str
    text: str
    aria_label: str
    attrs: dict[str, str]


def _own_text(tag: Tag) -> str:
    return re.sub(r"\s+", " ", tag.get_text(" ", strip=True)).strip()


def _accessible_name(tag: Tag) -> str:
    return (tag.get("aria-label") or _own_text(tag) or tag.get("value") or tag.get("placeholder") or tag.get("title") or "").strip()


def _describe(tag: Tag) -> ResolvedElement:
    attrs = {k: (" ".join(v) if isinstance(v, list) else str(v)) for k, v in tag.attrs.items()}
    return ResolvedElement(tag=tag.name, text=_own_text(tag), aria_label=str(tag.get("aria-label") or ""), attrs=attrs)


def resolve(selector: str, dom: str) -> list[ResolvedElement]:
    """All elements in ``dom`` matched by ``selector`` (empty when unsupported or no match)."""
    if not selector or not dom:
        return []
    sel = selector.strip()
    soup = BeautifulSoup(dom, "lxml")

    try:
        m = _ROLE_ENGINE.match(sel)
        if m:
            role, name = m.group("role"), m.group("name")
            out: list[Tag] = []
            for t in soup.find_all(True):
                is_role = t.get("role") == role or (role in _IMPLICIT_ROLES and _IMPLICIT_ROLES[role](t))
                if is_role and (name is None or name.lower() in _accessible_name(t).lower()):
                    out.append(t)
            return [_describe(t) for t in out]

        m = _TEXT_ENGINE.match(sel)
        if m:
            needle = m.group("text").strip().lower()
            hits = [t for t in soup.find_all(["button", "a", "input", "label", "span", "div", "li", "td", "h1", "h2", "h3"])
                    if needle and needle in _own_text(t).lower() and not any(needle in _own_text(c).lower() for c in t.find_all(True))]
            return [_describe(t) for t in hits]

        m = _HAS_TEXT.match(sel)
        if m:
            css = m.group("css").strip() or "*"
            needle = m.group("text").strip().lower()
            return [_describe(t) for t in soup.select(css) if needle in _own_text(t).lower()]

        return [_describe(t) for t in soup.select(sel)]
    except Exception:  # unsupported selector syntax, malformed HTML...
        return []


def resolves_uniquely(selector: str, dom: str) -> Optional[ResolvedElement]:
    found = resolve(selector, dom)
    return found[0] if len(found) == 1 else None
