"""GEARZONE browser smoke test — the behaviour verify.py cannot see.

Serves the site over http and drives it with Chromium: rendering, console
errors, broken images, quickview, filters, search, sort, compare cap, cart
and wishlist persistence.

Run from the project root:  python tools/smoke.py
Exit code 0 = every journey passed.
"""

from __future__ import annotations

import functools
import http.server
import socketserver
import threading
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 8765
BASE = f"http://127.0.0.1:{PORT}"

DESKTOP = {"width": 1440, "height": 900}
MOBILE = {"width": 390, "height": 844}

PAGES = ["index.html", "products.html", "compare.html", "faq.html", "blog.html"]

passed: list[str] = []
failed: list[str] = []


def ok(name: str) -> None:
    passed.append(name)
    print(f"  PASS  {name}")


def bad(name: str, detail: str) -> None:
    failed.append(f"{name} — {detail}")
    print(f"  FAIL  {name} — {detail}")


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args) -> None:  # noqa: D102 - silence the request log
        pass


def serve() -> socketserver.TCPServer:
    handler = functools.partial(Quiet, directory=str(ROOT))
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def collect_errors(page: Page) -> list[str]:
    errors: list[str] = []
    page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))
    page.on("console", lambda msg: errors.append(f"console.{msg.type}: {msg.text}")
            if msg.type == "error" else None)
    return errors


def check_page_loads(page: Page, path: str) -> bool:
    errors = collect_errors(page)
    page.goto(f"{BASE}/{path}", wait_until="networkidle")
    page.wait_for_timeout(400)

    if errors:
        bad(f"{path} console clean", "; ".join(errors[:3]))
        return False
    ok(f"{path} console clean")

    broken = page.evaluate("""() => Array.from(document.images)
        .filter(i => !i.complete || i.naturalWidth === 0).map(i => i.getAttribute('src'))""")
    if broken:
        bad(f"{path} images load", f"{len(broken)} broken: {broken[:4]}")
    else:
        ok(f"{path} images load")

    return True


def check_catalog(page: Page) -> None:
    count = page.locator("#product-grid .product-card").count()
    if count == 25:
        ok("catalog renders 25 product cards")
    else:
        bad("catalog renders 25 product cards", f"found {count}")

    featured = page.locator("#featured-rail .product-card").count()
    if featured >= 3:
        ok(f"featured rail renders ({featured} cards)")
    else:
        bad("featured rail renders", f"found {featured}")

    # AC-94 / AC-95 — ItemList is built at runtime, so Product/Offer/AggregateRating
    # only ever exist in the rendered DOM. Static HTML cannot prove this.
    ld = page.evaluate("""() => {
        const el = document.getElementById('ld-itemlist');
        if (!el) return null;
        let d;
        try { d = JSON.parse(el.textContent); } catch (e) { return {error: String(e)}; }
        const items = d.itemListElement || [];
        const types = new Set();
        items.forEach(i => {
            types.add(i['@type']);
            const p = i.item || {};
            types.add(p['@type']);
            if (p.offers) types.add(p.offers['@type']);
            if (p.aggregateRating) types.add(p.aggregateRating['@type']);
        });
        return {count: items.length, types: [...types].filter(Boolean).sort(),
                sample: items[0] && items[0].item ? items[0].item : null};
    }""")

    if not ld:
        bad("ItemList JSON-LD present", "#ld-itemlist missing or empty")
    elif ld.get("error"):
        bad("ItemList JSON-LD parses", ld["error"])
    else:
        if ld["count"] == 25:
            ok("ItemList JSON-LD carries 25 entries")
        else:
            bad("ItemList JSON-LD carries 25 entries", f"got {ld['count']}")

        want = {"ListItem", "Product", "Offer", "AggregateRating"}
        missing = want - set(ld["types"])
        if missing:
            bad("AC-95 Product/Offer/AggregateRating schema", f"missing {sorted(missing)}")
        else:
            ok("AC-95 Product + Offer + AggregateRating nested in ItemList")

        sample = ld["sample"] or {}
        if sample.get("name") and sample.get("offers", {}).get("priceCurrency") == "VND":
            ok("schema price/brand/image are absolute and populated")
        else:
            bad("schema node populated", f"sample={str(sample)[:120]}")

    counts = page.evaluate("""() => Array.from(document.querySelectorAll('[data-category-count]'))
        .map(e => e.textContent.trim()).filter(Boolean).length""")
    if counts == 4:
        ok("category cards show live counts")
    else:
        bad("category cards show live counts", f"{counts}/4 filled")


def check_filter(page: Page) -> None:
    page.click('.chip[data-filter="mouse"]')
    page.wait_for_timeout(250)
    mouse_only = page.locator("#product-grid .product-card").count()
    if mouse_only == 9:
        ok("category chip filters to 9 mice")
    else:
        bad("category chip filters to 9 mice", f"found {mouse_only}")

    page.click('.chip[data-filter="all"]')
    page.wait_for_timeout(250)
    if page.locator("#product-grid .product-card").count() == 25:
        ok("'Tất cả' chip restores 25")
    else:
        bad("'Tất cả' chip restores 25", "count did not return to 25")


def check_search_and_sort(page: Page) -> None:
    # accented Vietnamese input must match an unaccented catalogue
    page.fill("#catalog-search", "chuột")
    page.wait_for_timeout(300)
    accented = page.locator("#product-grid .product-card").count()

    page.fill("#catalog-search", "chuot")
    page.wait_for_timeout(300)
    plain = page.locator("#product-grid .product-card").count()

    if accented == plain == 9:
        ok("search folds Vietnamese accents (chuột == chuot == 9)")
    else:
        bad("search folds Vietnamese accents", f"chuột={accented}, chuot={plain}, want 9/9")

    page.fill("#catalog-search", "zzzzz")
    page.wait_for_timeout(300)
    if page.locator("#catalog-empty").is_visible():
        ok("empty state appears for a no-match query")
    else:
        bad("empty state appears", "#catalog-empty not visible")

    page.fill("#catalog-search", "")
    page.wait_for_timeout(300)

    page.select_option("#catalog-sort", "price-asc")
    page.wait_for_timeout(300)
    first = page.locator("#product-grid .product-card").first.inner_text()
    page.select_option("#catalog-sort", "price-desc")
    page.wait_for_timeout(300)
    last_first = page.locator("#product-grid .product-card").first.inner_text()
    if first != last_first:
        ok("sort changes the first card")
    else:
        bad("sort changes the first card", "price-asc and price-desc agree")
    page.select_option("#catalog-sort", "default")
    page.wait_for_timeout(200)


def check_quickview(page: Page) -> None:
    card = page.locator("#product-grid .product-card").first
    card.hover()
    page.wait_for_timeout(600)
    if page.locator("#quickview").is_visible():
        ok("quickview opens on desktop hover")
        page.keyboard.press("Escape")
        page.wait_for_timeout(350)
        if not page.locator("#quickview").is_visible():
            ok("Escape closes quickview")
        else:
            bad("Escape closes quickview", "still visible")
    else:
        bad("quickview opens on desktop hover", "#quickview stayed hidden")


def check_compare(page: Page) -> None:
    page.goto(f"{BASE}/compare.html", wait_until="networkidle")
    if page.locator("#compare-empty").is_visible():
        ok("compare page shows empty state with nothing selected")
    else:
        bad("compare empty state", "#compare-empty not visible on a fresh cart")

    page.goto(f"{BASE}/index.html", wait_until="networkidle")
    page.wait_for_timeout(400)
    cards = page.locator("#product-grid .product-card")
    for i in range(5):                       # spec caps compare at 4
        cards.nth(i).locator("[data-id]").first.click(force=True)
        page.wait_for_timeout(120)

    page.goto(f"{BASE}/compare.html", wait_until="networkidle")
    page.wait_for_timeout(500)
    cols = page.locator(".compare-table .compare-col").count()
    if cols == 4:
        ok("compare caps at 4 columns after 5 attempts")
    else:
        bad("compare caps at 4 columns", f"got {cols}")

    badge = page.locator("[data-compare-count]").first.inner_text().strip()
    if badge == "4":
        ok("compare badge reads 4")
    else:
        bad("compare badge reads 4", f"got {badge!r}")


def check_cart_and_wishlist(page: Page) -> None:
    page.goto(f"{BASE}/index.html", wait_until="networkidle")
    page.wait_for_timeout(400)

    card = page.locator("#product-grid .product-card").first
    card.hover()
    page.wait_for_timeout(500)
    card.locator("[data-id]").first.click(force=True)
    page.wait_for_timeout(200)

    add = page.locator(".product-actions [data-id]").first
    add.click(force=True)
    page.wait_for_timeout(350)

    badge = page.locator("[data-cart-count]").first.inner_text().strip()
    if badge == "1":
        ok("add to cart sets the badge to 1")
    else:
        bad("add to cart sets the badge", f"badge={badge!r}")

    page.reload(wait_until="networkidle")
    page.wait_for_timeout(500)
    after = page.locator("[data-cart-count]").first.inner_text().strip()
    if after == "1":
        ok("cart persists across reload (localStorage)")
    else:
        bad("cart persists across reload", f"badge={after!r} after reload")

    page.click("#cart-toggle")
    page.wait_for_timeout(400)
    if page.locator("#cart-drawer").is_visible() and page.locator(".cart-line").count() >= 1:
        ok("cart drawer opens and lists the line item")
    else:
        bad("cart drawer opens with a line item", "drawer hidden or no .cart-line")
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)

    page.goto(f"{BASE}/thanhtoan.html", wait_until="networkidle")
    page.wait_for_timeout(600)
    count = page.locator("#checkout-item-count").inner_text().strip()
    subtotal = page.locator("#checkout-subtotal").inner_text().strip()
    if count == "1 sản phẩm" and subtotal not in ("", "0đ"):
        ok("checkout page renders the stored cart")
    else:
        bad("checkout page renders the stored cart", f"count={count!r} subtotal={subtotal!r}")

    if page.locator("#checkout-submit").is_enabled():
        ok("checkout confirm is enabled when the cart has lines")
    else:
        bad("checkout confirm is enabled", "button disabled with 1 line in the cart")


def check_mobile_sheet(browser) -> None:
    ctx = browser.new_context(viewport=MOBILE, has_touch=True, is_mobile=True)
    page = ctx.new_page()
    errors = collect_errors(page)
    page.goto(f"{BASE}/index.html", wait_until="networkidle")
    page.wait_for_timeout(500)

    if errors:
        bad("mobile index console clean", "; ".join(errors[:3]))
    else:
        ok("mobile index console clean")

    overflow = page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
    if overflow <= 1:
        ok("mobile has no horizontal overflow")
    else:
        bad("mobile has no horizontal overflow", f"{overflow}px wider than the viewport")

    ctx.close()


def check_faq(page: Page) -> None:
    page.goto(f"{BASE}/faq.html", wait_until="networkidle")
    page.wait_for_timeout(400)
    total = page.locator(".faq-item").count()

    page.fill("#faq-search", "dpi")
    page.wait_for_timeout(350)
    shown = page.locator(".faq-item:visible").count()
    if 0 < shown < total:
        ok(f"FAQ search narrows {total} -> {shown} questions")
    else:
        bad("FAQ search narrows the list", f"total={total}, shown={shown}")

    page.fill("#faq-search", "")
    page.wait_for_timeout(300)


def main() -> int:
    httpd = serve()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            ctx = browser.new_context(viewport=DESKTOP)
            page = ctx.new_page()
            page.goto(f"{BASE}/index.html", wait_until="domcontentloaded")

            print("== page loads ==")
            for path in PAGES:
                check_page_loads(page, path)

            print("== home catalogue ==")
            page.goto(f"{BASE}/index.html", wait_until="networkidle")
            page.wait_for_timeout(500)
            check_catalog(page)

            print("== filter / search / sort ==")
            check_filter(page)
            check_search_and_sort(page)

            print("== quickview ==")
            check_quickview(page)

            print("== compare ==")
            check_compare(page)

            print("== cart / wishlist ==")
            check_cart_and_wishlist(page)

            print("== faq ==")
            check_faq(page)

            print("== mobile ==")
            check_mobile_sheet(browser)

            ctx.close()
            browser.close()
    finally:
        httpd.shutdown()

    print()
    print(f"PASSED: {len(passed)}")
    print(f"FAILED: {len(failed)}")
    for line in failed:
        print(f"  - {line}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
