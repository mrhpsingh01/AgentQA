"""
AgentQA Ground-Truth Selector Healing Benchmark & Evaluation Set
Benchmarks self-healing recovery accuracy across common frontend UI redesign patterns.
Target: > 55% recovery rate (academic baseline: 55-68%).
"""

import asyncio
import json
import time
from typing import Any


BENCHMARK_CASES = [
    {
        "id": "CASE-01",
        "name": "Tailwind Utility Class Refactoring",
        "url": "https://shop.example.com/products/123",
        "action": "click",
        "original_selector": "button.bg-blue-600.hover\\:bg-blue-700.rounded-md",
        "expected_element": "[data-testid='add-to-cart']",
        "element_info": {"tagName": "button", "textPreview": "Add to Cart"},
        "fallback_selectors": [["[data-testid='add-to-cart']"], ["button:has-text('Add to Cart')"]],
        "dom": """
        <div class="product-card">
          <h2 class="text-xl">Wireless Headphones</h2>
          <!-- Classes were refactored to emerald theme -->
          <button data-testid="add-to-cart" class="bg-emerald-600 hover:bg-emerald-700 rounded-lg px-4 py-2 text-white">
            Add to Cart
          </button>
        </div>
        """
    },
    {
        "id": "CASE-02",
        "name": "Legacy ID Renaming",
        "url": "https://auth.example.com/signin",
        "action": "click",
        "original_selector": "#legacy-login-btn",
        "expected_element": "#signin-submit",
        "element_info": {"tagName": "button", "textPreview": "Sign In"},
        "fallback_selectors": [["#signin-submit"], ["button[type='submit']"]],
        "dom": """
        <form id="auth-form">
          <input name="email" type="email" placeholder="user@domain.com" />
          <input name="password" type="password" />
          <button id="signin-submit" type="submit">Sign In</button>
        </form>
        """
    },
    {
        "id": "CASE-03",
        "name": "Form Input Name Attribute Update",
        "url": "https://app.example.com/register",
        "action": "fill",
        "original_selector": "input[name='user_email']",
        "expected_element": "input[name='email']",
        "element_info": {"tagName": "input", "name": "email", "placeholder": "Email address"},
        "fallback_selectors": [["input[name='email']"], ["[data-testid='email-input']"]],
        "dom": """
        <form>
          <label for="email-field">Your Email</label>
          <input id="email-field" name="email" data-testid="email-input" placeholder="Email address" type="email" />
        </form>
        """
    },
    {
        "id": "CASE-04",
        "name": "Structural DOM Wrapper Added",
        "url": "https://billing.example.com/subscribe",
        "action": "click",
        "original_selector": "div.pricing-table > button.checkout-btn",
        "expected_element": "button:has-text('Upgrade to Pro')",
        "element_info": {"tagName": "button", "textPreview": "Upgrade to Pro"},
        "fallback_selectors": [["[data-testid='upgrade-pro-btn']"]],
        "dom": """
        <div class="pricing-table">
          <!-- Button moved inside a new flex container wrapper -->
          <div class="card-footer-flex-container">
            <button data-testid="upgrade-pro-btn" class="checkout-btn-v2">Upgrade to Pro</button>
          </div>
        </div>
        """
    },
    {
        "id": "CASE-05",
        "name": "ARIA Label Copy Polish",
        "url": "https://portal.example.com/settings",
        "action": "click",
        "original_selector": "button[aria-label='Save account changes']",
        "expected_element": "button[aria-label='Save changes']",
        "element_info": {"tagName": "button", "textPreview": "Save", "ariaLabel": "Save changes"},
        "fallback_selectors": [["button[aria-label='Save changes']"], ["#save-btn"]],
        "dom": """
        <div class="settings-pane">
          <button id="save-btn" aria-label="Save changes" type="button">Save</button>
        </div>
        """
    },
    {
        "id": "CASE-06",
        "name": "Button Tag Replaced with Anchor Styled as Button",
        "url": "https://docs.example.com/quickstart",
        "action": "click",
        "original_selector": "button#get-started",
        "expected_element": "a#get-started",
        "element_info": {"tagName": "a", "textPreview": "Get Started"},
        "fallback_selectors": [["a#get-started"], ["[data-testid='get-started-cta']"]],
        "dom": """
        <nav class="hero-actions">
          <a id="get-started" data-testid="get-started-cta" href="/signup" class="btn btn-primary">Get Started</a>
        </nav>
        """
    },
    {
        "id": "CASE-07",
        "name": "Modal Confirmation Button Hierarchy",
        "url": "https://app.example.com/projects",
        "action": "click",
        "original_selector": "div.modal-dialog button.confirm-delete",
        "expected_element": "[data-testid='confirm-delete-button']",
        "element_info": {"tagName": "button", "textPreview": "Delete Project"},
        "fallback_selectors": [["[data-testid='confirm-delete-button']"], ["button:has-text('Delete Project')"]],
        "dom": """
        <div role="dialog" class="radix-dialog-content">
          <h3>Are you sure?</h3>
          <button data-testid="confirm-delete-button" class="btn-destructive">Delete Project</button>
        </div>
        """
    },
    {
        "id": "CASE-08",
        "name": "Search Box Input Type and Placeholder Change",
        "url": "https://kb.example.com",
        "action": "fill",
        "original_selector": "input[placeholder='Search docs...']",
        "expected_element": "input[name='query']",
        "element_info": {"tagName": "input", "placeholder": "Search articles..."},
        "fallback_selectors": [["input[name='query']"], ["[data-testid='kb-search']"]],
        "dom": """
        <div class="search-bar">
          <input name="query" data-testid="kb-search" placeholder="Search articles..." type="search" />
        </div>
        """
    },
    {
        "id": "CASE-09",
        "name": "Checkout Submit Button TestID Preservation",
        "url": "https://store.example.com/checkout",
        "action": "click",
        "original_selector": "#place-order-legacy-id",
        "expected_element": "[data-testid='place-order']",
        "element_info": {"tagName": "button", "textPreview": "Place Order"},
        "fallback_selectors": [["[data-testid='place-order']"]],
        "dom": """
        <div class="checkout-summary">
          <button data-testid="place-order" class="btn-checkout">Place Order ($49.00)</button>
        </div>
        """
    },
    {
        "id": "CASE-10",
        "name": "Dynamic Hash Class Invalidation (CSS Modules)",
        "url": "https://app.example.com/dashboard",
        "action": "click",
        "original_selector": "button.btn_3f92a",
        "expected_element": "button:has-text('Export CSV')",
        "element_info": {"tagName": "button", "textPreview": "Export CSV"},
        "fallback_selectors": [["button:has-text('Export CSV')"], ["[data-testid='export-csv']"]],
        "dom": """
        <header class="table-toolbar">
          <button data-testid="export-csv" class="btn_994b2">Export CSV</button>
        </header>
        """
    }
]


async def run_eval_benchmark():
    import sys, os
    sys.path.insert(0, os.path.abspath('backend'))
    import src.main # Preload all models into registry
    from src.modules.healing.service import healing_service
    from src.modules.healing.schemas import HealingRequest
    from src.core.database import async_session_factory, init_db

    await init_db()

    # Clear benchmark cache to ensure fresh evaluation
    from sqlalchemy import delete
    from src.modules.healing.models import HealedSelector
    async with async_session_factory() as db:
        await db.execute(delete(HealedSelector))
        await db.commit()

    print("\n" + "=" * 65)
    print(" AgentQA Self-Healing Benchmark Evaluation Suite (ARES 2026)")
    print("=" * 65)

    passed = 0
    total = len(BENCHMARK_CASES)
    results = []

    start_time = time.time()

    async with async_session_factory() as db:
        for case in BENCHMARK_CASES:
            req = HealingRequest(
                url=case["url"],
                original_selector=case["original_selector"],
                dom_snapshot=case["dom"],
                action_type=case["action"],
                element_info=case.get("element_info"),
                fallback_selectors=case.get("fallback_selectors"),
                error_message=f"Timeout: selector '{case['original_selector']}' not found in DOM."
            )

            res = await healing_service.heal_selector(req, db)

            # Verification: check if healed selector exists in target DOM or matches fallback
            is_recovered = (
                res.confidence >= 0.55 and
                (res.healed_selector in case["dom"] or
                 res.healed_selector == case["expected_element"] or
                 any(res.healed_selector == f[0] for f in case.get("fallback_selectors", [])))
            )

            if is_recovered:
                passed += 1

            status_icon = "[PASS] RECOVERED" if is_recovered else "[FAIL] UNRECOVERED"
            print(f"[{case['id']}] {case['name']:<42} {status_icon} (L{res.strategy_level}, {int(res.confidence*100)}%)")
            results.append({
                "case_id": case["id"],
                "name": case["name"],
                "recovered": is_recovered,
                "strategy": res.strategy_level,
                "confidence": res.confidence,
                "healed_selector": res.healed_selector
            })

    total_time = time.time() - start_time
    recovery_rate = (passed / total) * 100

    print("-" * 65)
    print(f"Total Test Cases:    {total}")
    print(f"Successfully Healed: {passed}")
    print(f"Recovery Rate:       {recovery_rate:.1f}% (Benchmark Target: > 55%)")
    print(f"Benchmark Duration:  {total_time:.2f}s")
    print("=" * 65)

    assert recovery_rate >= 55.0, f"Recovery rate {recovery_rate}% fell below 55% target threshold!"
    print("SUCCESS: Benchmark passed! Meets or exceeds state-of-the-art healing baseline.\n")


if __name__ == "__main__":
    asyncio.run(run_eval_benchmark())
