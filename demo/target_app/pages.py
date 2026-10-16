"""
A tiny e-commerce checkout used as the controlled target for `python demo.py`.

One page, three hash views (#/ catalog, #/checkout, #/confirmation) and four *states* of the same app:

  original        the checkout the test was written against
  refactored      a harmless UI refactor: every id / class / data-testid is renamed, wrappers are added and
                  some labels are reworded ("Place order" -> "Complete purchase"); layout and behaviour are
                  identical, so a good healer should find the same controls and the test should pass
  broken          the refactor PLUS a real bug: POST /api/orders fails and the UI swallows the error silently,
                  so no order is created. A healer that clicks the right button must still FAIL the test
  broken-removed  the refactor PLUS a real bug: the Place-order button was removed; "Cancel" remains. A healer
                  must refuse (healing onto Cancel would hide the regression)
"""

from __future__ import annotations

import hashlib
import json

STATES = ("original", "refactored", "broken", "broken-removed")

_CATALOG = [
    ("Trail Running Shoes", 89), ("Merino Base Layer", 64), ("Insulated Bottle 750ml", 29), ("Packable Rain Shell", 129),
    ("Carbon Trekking Poles", 79), ("Headlamp 400 lumens", 39), ("Ultralight Tent 2P", 349), ("Down Sleeping Bag", 279),
    ("Camp Stove", 59), ("Titanium Spork", 12), ("Dry Bag 20L", 24), ("Wool Socks 3-pack", 36),
    ("Navigation Compass", 22), ("First Aid Kit", 31), ("Solar Charger", 49), ("Hydration Vest", 99),
    ("Trail Gaiters", 34), ("Sun Hoodie", 58), ("Camp Chair", 45), ("Water Filter", 42),
    ("Bear Canister", 74), ("Stuff Sack Set", 18), ("Fleece Beanie", 21), ("Climbing Chalk Bag", 17),
]
# 72 cards (numbered 1..72): a catalog page of realistic weight
PRODUCTS = [(n, name, price) for n, (name, price) in enumerate(_CATALOG * 3, start=1)]


class Theme:
    """Maps semantic names to ids / classes / test ids for one state. `refactored` scrambles all of them."""

    def __init__(self, scrambled: bool) -> None:
        self.scrambled = scrambled

    def _s(self, kind: str, name: str) -> str:
        if not self.scrambled:
            return name
        return f"{kind}{hashlib.sha1((kind + name).encode()).hexdigest()[:6]}"

    def id(self, name: str) -> str:
        return self._s("e", name)

    def cls(self, name: str) -> str:
        return self._s("c", name)

    def testid(self, name: str) -> str:
        return self._s("t", name) if self.scrambled else name

    # labels: the refactor rewords some of them, as a real redesign would
    def label(self, name: str) -> str:
        table = {
            "add": ("Add to cart", "Add to bag"),
            "checkout": ("Checkout", "Go to checkout"),
            "place": ("Place order", "Complete purchase"),
            "back": ("Back to cart", "Back to cart"),
            "cancel": ("Cancel", "Cancel"),
        }
        return table[name][1 if self.scrambled else 0]


def css(t: Theme) -> str:
    c = t.cls
    return f"""
*{{box-sizing:border-box}} body{{margin:0;font:15px/1.45 system-ui,sans-serif;color:#1d2433;background:#f6f7f9}}
.{c('top')}{{display:flex;align-items:center;justify-content:space-between;padding:14px 32px;background:#fff;border-bottom:1px solid #dde1e8;position:sticky;top:0}}
.{c('brand')}{{font-weight:700;font-size:18px}}
.{c('grid')}{{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:24px 32px}}
.{c('card')}{{background:#fff;border:1px solid #dde1e8;border-radius:10px;padding:14px}}
.{c('card')} h3{{margin:0 0 6px;font-size:15px}} .{c('desc')}{{color:#5a6478;font-size:13px;min-height:54px}}
.{c('price')}{{font-weight:700;margin:8px 0}}
.{c('btn')}{{border:0;border-radius:8px;padding:9px 14px;font:inherit;cursor:pointer;background:#e7eaf0;color:#1d2433}}
.{c('primary')}{{background:#1f6feb;color:#fff}} .{c('danger')}{{background:#fbe9e9;color:#a11}}
.{c('panel')}{{max-width:560px;margin:40px auto;background:#fff;border:1px solid #dde1e8;border-radius:12px;padding:28px}}
.{c('row')}{{display:flex;gap:12px;margin-top:22px}} .{c('field')}{{display:block;margin-top:14px}}
.{c('field')} input{{display:block;width:100%;padding:10px;border:1px solid #c5ccd8;border-radius:8px;font:inherit}}
.{c('badge')}{{background:#1f6feb;color:#fff;border-radius:99px;padding:1px 8px;font-size:12px;margin-left:6px}}
.{c('view')}{{display:none}} .{c('view')}.{c('on')}{{display:block}}
.{c('foot')}{{padding:40px 32px;color:#6b7488;font-size:13px}}
""".strip()


def card(t: Theme, pid: int, name: str, price: int) -> str:
    add_id = f"add-to-cart-{pid}" if not t.scrambled else t.id(f"add-{pid}")
    desc = f"{name}: field-tested for multi-day trips, rated for wet and cold conditions, with a two-year warranty and free returns."
    icon = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1f6feb" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>'
    return (
        f'<article class="{t.cls("card")}" data-sku="SKU-{pid:04d}" data-track="impression:{pid}">{icon}'
        f'<h3>{name}</h3><p class="{t.cls("desc")}">{desc}</p><div class="{t.cls("price")}">${price}</div>'
        f'<button id="{add_id}" data-testid="{t.testid(f"add-{pid}")}" class="{t.cls("btn")} {t.cls("primary")}" type="button" data-pid="{pid}">{t.label("add")}</button></article>'
    )


def build_page(state: str) -> str:
    if state not in STATES:
        raise ValueError(state)
    scrambled = state != "original"
    t = Theme(scrambled)
    removed = state == "broken-removed"

    cards = "".join(card(t, pid, name, price) for pid, name, price in PRODUCTS)

    place = (
        ""
        if removed
        else (
            f'<div class="{t.cls("wrap")}"><span class="{t.cls("inner")}">' if scrambled else ""
        )
        + f'<button id="{t.id("place-order")}" data-testid="{t.testid("place-order")}" class="{t.cls("btn")} {t.cls("primary")}" type="button">{t.label("place")}</button>'
        + ("</span></div>" if scrambled else "")
    )

    # PLACE order sits right-most; the decoys (Back to cart, Cancel) sit to its left in both versions.
    checkout_btn_id = t.id("checkout-btn") if scrambled else "checkout-btn"
    checkout = (
        f'<button id="{checkout_btn_id}" data-testid="{t.testid("checkout-btn")}" class="{t.cls("btn")} {t.cls("primary")}" type="button">'
        f'{t.label("checkout")} <span class="{t.cls("badge")}" id="{t.id("cart-count")}">0</span></button>'
    )

    # `broken`: the server rejects the order and the page swallows the error (a silent failure).
    swallow = "true" if state == "broken" else "false"
    config = json.dumps({"state": state, "swallowErrors": swallow == "true"})

    script = f"""
const CFG={config};
const $=(s)=>document.querySelector(s);
let cart=[];
function route(){{const h=location.hash||'#/';document.querySelectorAll('[data-view]').forEach(v=>v.classList.toggle('{t.cls("on")}',v.dataset.view===h));}}
addEventListener('hashchange',route);route();
document.querySelectorAll('[data-pid]').forEach(b=>b.addEventListener('click',()=>{{cart.push(+b.dataset.pid);$('#{t.id("cart-count")}').textContent=cart.length;}}));
$('#{checkout_btn_id}').addEventListener('click',()=>{{location.hash='#/checkout';}});
const place=$('[data-testid="{t.testid("place-order")}"]');
if(place)place.addEventListener('click',async()=>{{
  const email=$('#{t.id("email")}').value;
  try{{
    const r=await fetch('/api/orders?state='+CFG.state,{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{email,items:cart}})}});
    if(!r.ok)throw new Error('order failed: '+r.status);
    const o=await r.json();
    $('#{t.id("order-no")}').textContent='#'+o.id;
    location.hash='#/confirmation';
  }}catch(e){{ if(!CFG.swallowErrors)console.error(e); /* silent failure: nothing visible happens */ }}
}});
$('[data-testid="{t.testid("cancel")}"]').addEventListener('click',()=>{{cart=[];$('#{t.id("cart-count")}').textContent='0';location.hash='#/';}});
$('[data-testid="{t.testid("back")}"]').addEventListener('click',()=>{{location.hash='#/';}});
""".strip()

    email_id = t.id("email")
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Trailhead Outfitters</title>
<style>{css(t)}</style>
<script>window.dataLayer=window.dataLayer||[];window.dataLayer.push({{event:'page_view',state:'{state}',catalog:{len(PRODUCTS)}}});</script>
</head><body>
<header class="{t.cls('top')}"><span class="{t.cls('brand')}">Trailhead Outfitters</span>
<nav><a href="#/">Shop</a> &nbsp; <a href="#/help">Help</a> &nbsp; {checkout}</nav></header>

<main>
<section data-view="#/" class="{t.cls('view')}"><div class="{t.cls('grid')}">{cards}</div></section>

<section data-view="#/checkout" class="{t.cls('view')}"><div class="{t.cls('panel')}">
  <h2>Checkout</h2>
  <label class="{t.cls('field')}">Email
    <input id="{email_id}" name="email" type="email" placeholder="you@example.com" data-testid="{t.testid('email')}"></label>
  <div class="{t.cls('row')}">
    <button data-testid="{t.testid('back')}" class="{t.cls('btn')}" type="button">{t.label('back')}</button>
    <button data-testid="{t.testid('cancel')}" class="{t.cls('btn')} {t.cls('danger')}" type="button">{t.label('cancel')}</button>
    {place}
  </div>
</div></section>

<section data-view="#/confirmation" class="{t.cls('view')}"><div class="{t.cls('panel')}">
  <h2>Order confirmed <span id="{t.id('order-no')}"></span></h2><p>Thanks! A receipt is on its way.</p>
</div></section>
</main>
<footer class="{t.cls('foot')}">&copy; Trailhead Outfitters. Prices in USD. Free returns within 30 days on unused items. Terms, privacy and accessibility statement available on request.</footer>
<script>{script}</script>
</body></html>"""
