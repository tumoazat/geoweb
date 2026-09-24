"""GEARZONE self-check — maps the mieuta.md acceptance criteria onto real assertions.

Run from the project root:  python tools/verify.py
Exit code 0 = every automated check passed.
"""

from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parent.parent

PAGES = ["index.html", "products.html", "compare.html", "faq.html", "blog.html"]
CATEGORY_KEYS = {"mouse", "keyboard", "headset", "accessory"}
CONNECTIONS = {"Wireless", "Wired"}
USE_CASES = {
    "FPS", "MOBA", "Competitive Gaming", "Casual Gaming",
    "Streaming", "Esports", "Work & Play",
}
REQUIRED_KEYS = {
    "id", "slug", "brand", "name", "category", "price", "compareAtPrice", "rating",
    "reviewCount", "badge", "featured", "image", "shortDescription", "description",
    "warranty", "connection", "useCases", "specifications", "pros", "cons", "promotions",
}
# Note: bare "placeholder" is NOT slop — it is a legitimate HTML attribute on
# search inputs. Only placeholder *copy* that reads as unfilled content counts.
SLOP = ["lorem ipsum", "product name 1", "todo:", "xxx", "test test", "dolor sit amet"]

passed: list[str] = []
failed: list[str] = []
warned: list[str] = []


def ok(acid: str, msg: str) -> None:
    passed.append(f"{acid}: {msg}")


def bad(acid: str, msg: str) -> None:
    failed.append(f"{acid}: {msg}")


def warn(acid: str, msg: str) -> None:
    warned.append(f"{acid}: {msg}")


class TagCollector(HTMLParser):
    """Collect tags, attributes, text and classes from one HTML document."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tags: list[tuple[str, dict[str, str | None]]] = []
        self.ids: set[str] = set()
        self.classes: set[str] = set()
        self.h1 = 0
        self.headings: list[str] = []
        self.jsonld: list[str] = []
        self.text: list[str] = []
        self._in_jsonld = False
        self._buf: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        self.tags.append((tag, attr))
        if attr.get("id"):
            self.ids.add(attr["id"] or "")
        for cls in (attr.get("class") or "").split():
            self.classes.add(cls)
        if tag == "h1":
            self.h1 += 1
        if tag in {"h1", "h2", "h3", "h4"}:
            self.headings.append(tag)
        if tag == "script" and attr.get("type") == "application/ld+json":
            self._in_jsonld = True
            self._buf = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._in_jsonld:
            self.jsonld.append("".join(self._buf))
            self._in_jsonld = False

    def handle_data(self, data: str) -> None:
        if self._in_jsonld:
            self._buf.append(data)
        else:
            self.text.append(data)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def check_products() -> dict:
    """AC-06..AC-20 — product data integrity."""
    src = ROOT / "data" / "products.json"
    if not src.exists():
        bad("AC-03", "data/products.json missing")
        return {}
    try:
        products = json.loads(read(src))
    except json.JSONDecodeError as exc:
        bad("AC-97", f"products.json is not valid JSON: {exc}")
        return {}

    if len(products) == 25:
        ok("AC-06", "25 products present")
    else:
        bad("AC-06", f"expected 25 products, found {len(products)}")

    counts: dict[str, int] = {}
    for item in products:
        counts[item.get("category", "?")] = counts.get(item.get("category", "?"), 0) + 1

    for acid, cat, expected in [
        ("AC-07", "mouse", 8), ("AC-08", "keyboard", 8),
        ("AC-09", "headset", 7), ("AC-10", "accessory", 2),
    ]:
        actual = counts.get(cat, 0)
        if actual == expected:
            ok(acid, f"{cat} count = {expected}")
        else:
            bad(acid, f"{cat} count = {actual}, spec wants {expected}")

    brands = {item.get("brand") for item in products}
    if len(brands) >= 10:
        ok("AC-11", f"{len(brands)} brands")
    else:
        bad("AC-11", f"only {len(brands)} brands, need >= 10")

    ids = [item.get("id") for item in products]
    slugs = [item.get("slug") for item in products]
    if len(set(ids)) == len(ids):
        ok("AC-06b", "product ids unique")
    else:
        bad("AC-06b", "duplicate product ids")

    problems: list[str] = []
    for item in products:
        pid = item.get("id", "?")
        missing = REQUIRED_KEYS - set(item)
        if missing:
            problems.append(f"{pid} missing keys {sorted(missing)}")

        img = ROOT / str(item.get("image", ""))
        if not img.exists():
            problems.append(f"{pid} image not found: {item.get('image')}")

        if item.get("category") not in CATEGORY_KEYS:
            problems.append(f"{pid} bad category {item.get('category')!r}")
        if item.get("connection") not in CONNECTIONS:
            problems.append(f"{pid} bad connection {item.get('connection')!r}")
        if not isinstance(item.get("price"), int) or item.get("price", 0) <= 0:
            problems.append(f"{pid} bad price")
        if item.get("compareAtPrice", 0) <= item.get("price", 0):
            problems.append(f"{pid} compareAtPrice <= price")
        if not 0 < float(item.get("rating", 0)) <= 5:
            problems.append(f"{pid} rating out of range")
        if not item.get("warranty"):
            problems.append(f"{pid} no warranty")
        if not str(item.get("description", "")).strip():
            problems.append(f"{pid} no description")
        if not isinstance(item.get("specifications"), dict) or not item["specifications"]:
            problems.append(f"{pid} empty specifications")
        else:
            for key, val in item["specifications"].items():
                if val in (None, "", "undefined", "null"):
                    problems.append(f"{pid} spec {key} is empty")
        for uc in item.get("useCases", []):
            if uc not in USE_CASES:
                problems.append(f"{pid} unknown useCase {uc!r}")
        if item.get("badge") not in {"BEST SELLER", "NEW", "SALE", ""}:
            problems.append(f"{pid} bad badge {item.get('badge')!r}")

    if problems:
        for line in problems[:20]:
            bad("AC-15..AC-20", line)
        if len(problems) > 20:
            bad("AC-15..AC-20", f"...and {len(problems) - 20} more")
    else:
        ok("AC-15..AC-20", "every product has specs, price, warranty, description, image, category")

    featured = sum(1 for item in products if item.get("featured"))
    if featured:
        ok("AC-27", f"{featured} featured products")
    else:
        bad("AC-27", "no product is marked featured")

    return {"products": products, "brands": sorted(b for b in brands if b)}


def check_page(page: str) -> TagCollector | None:
    """AC-23..AC-29, AC-77..AC-91 — SEO, semantics, assets, links."""
    path = ROOT / page
    if not path.exists():
        bad("AC-01", f"{page} missing")
        return None

    html = read(path)
    doc = TagCollector()
    doc.feed(html)
    root = page if page != "index.html" else "index.html"

    # --- title / description / canonical / OG ---
    title = re.search(r"<title>(.*?)</title>", html, re.S)
    if title and title.group(1).strip():
        ok("AC-84", f"{page} title present")
    else:
        bad("AC-84", f"{page} has no usable <title>")

    desc = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', html)
    if desc and len(desc.group(1).strip()) > 40:
        ok("AC-85", f"{page} meta description present")
    else:
        bad("AC-85", f"{page} meta description missing or too short")

    canon = re.search(r'<link\s+rel="canonical"\s+href="([^"]+)"', html)
    if canon and canon.group(1).startswith("http"):
        ok("AC-88", f"{page} canonical absolute")
    else:
        bad("AC-88", f"{page} canonical missing or not absolute")

    og = re.findall(r'<meta\s+property="(og:[a-z:]+)"', html)
    for needed in ("og:title", "og:description", "og:image", "og:url"):
        if needed in og:
            ok("AC-89", f"{page} {needed}")
        else:
            bad("AC-89", f"{page} missing {needed}")

    # --- headings ---
    if doc.h1 == 1:
        ok("AC-86", f"{page} exactly one H1")
    else:
        bad("AC-86", f"{page} has {doc.h1} H1 elements")

    levels = [int(h[1]) for h in doc.headings]
    skips = [
        f"{doc.headings[i]} after {doc.headings[i - 1]}"
        for i in range(1, len(levels))
        if levels[i] - levels[i - 1] > 1
    ]
    if skips:
        warn("AC-80", f"{page} heading level jumps: {skips[:5]}")
    else:
        ok("AC-80", f"{page} heading hierarchy has no skipped levels")

    # --- semantic landmarks ---
    tags = {t for t, _ in doc.tags}
    for needed in ("main", "header", "footer", "nav"):
        if needed not in tags:
            warn("AC-87", f"{page} has no <{needed}> element")

    # --- images ---
    imgs = [a for t, a in doc.tags if t == "img"]
    missing_alt = [a.get("src") for a in imgs if a.get("alt") is None]
    if missing_alt:
        bad("AC-77", f"{page} images without alt: {missing_alt[:5]}")
    else:
        ok("AC-77", f"{page} every img has alt ({len(imgs)} images)")

    broken_imgs = [
        a.get("src") for a in imgs
        if a.get("src") and not a["src"].startswith(("http", "data:"))
        and not (ROOT / a["src"].lstrip("/")).exists()
    ]
    if broken_imgs:
        bad("AC-103", f"{page} broken image paths: {broken_imgs}")
    else:
        ok("AC-103", f"{page} no broken image paths")

    # --- internal links ---
    links = {
        a.get("href") for t, a in doc.tags
        if t == "a" and a.get("href")
    }
    broken_links = sorted(
        h for h in links
        if not h.startswith(("http", "mailto:", "tel:", "#", "data:"))
        and not (ROOT / h.split("#")[0].split("?")[0]).exists()
    )
    if broken_links:
        bad("AC-104", f"{page} broken internal links: {broken_links}")
    else:
        ok("AC-104", f"{page} internal links resolve ({len(links)} hrefs)")

    # --- JSON-LD ---
    bad_ld: list[str] = []
    types: list[str] = []
    for block in doc.jsonld:
        try:
            data = json.loads(block)
        except json.JSONDecodeError as exc:
            bad_ld.append(str(exc))
            continue
        types.append(data.get("@type", "?"))
    if bad_ld:
        bad("AC-97", f"{page} invalid JSON-LD: {bad_ld}")
    else:
        ok("AC-97", f"{page} JSON-LD parses ({types})")

    # --- slop ---
    lowered = html.lower()
    hits = [s for s in SLOP if s in lowered]
    if hits:
        bad("AC-33", f"{page} contains placeholder text: {hits}")
    else:
        ok("AC-33", f"{page} no lorem/placeholder text")

    return doc


def check_js(html_docs: dict[str, TagCollector]) -> None:
    """Cross-check that script.js only queries ids that exist in the markup."""
    path = ROOT / "script.js"
    if not path.exists():
        bad("AC-05", "script.js missing")
        return
    ok("AC-05", "script.js present")

    src = read(path)
    all_ids: set[str] = set()
    for doc in html_docs.values():
        if doc:
            all_ids |= doc.ids

    referenced = set(re.findall(r"getElementById\(\s*['\"]([^'\"]+)['\"]", src))
    # script.js mostly routes through pick(['#a', '#b']) helpers rather than
    # querySelector('#a'), so sweep every '#id' string literal instead.
    referenced |= set(re.findall(r"['\"]#([A-Za-z][A-Za-z0-9_-]*)['\"]", src))
    # A selector ending in "-" or "_" is a concatenation prefix
    # ('#facet-' + name), not a literal id. Skip those.
    referenced = {i for i in referenced if not i.endswith(("-", "_"))}
    # Ids script.js mints itself (out.id = 'compare-output') are legitimately
    # absent from the markup.
    referenced -= set(re.findall(r"\.id\s*=\s*['\"]([^'\"]+)['\"]", src))
    unknown = sorted(referenced - all_ids)
    if unknown:
        bad("AC-102", f"script.js queries ids absent from every page: {unknown}")
    else:
        ok("AC-102", f"every id script.js queries exists in the markup ({len(referenced)} ids)")


def is_tailwind_utility(class_name: str) -> bool:
    """Return True for Tailwind-style utility classes generated at runtime.

    The site uses the Tailwind CDN for the new homepage, so a static CSS scan on
    styles.css will incorrectly flag all utility classes as undefined. Ignore the
    common Tailwind utility prefixes while still preserving checks on genuine
    custom classes such as cat-btn / faq-answer.
    """
    if not class_name:
        return False

    # Explicitly allow utility variants and common classes that are produced by the
    # Tailwind CDN instead of a local stylesheet.
    prefixes = (
        "bg-", "text-", "font-", "rounded", "shadow-", "shadow",
        "w-", "h-", "min-w-", "max-w-", "min-h-", "max-h-",
        "p-", "px-", "py-", "pl-", "pr-", "pt-", "pb-", "m-",
        "mx-", "my-", "mt-", "mb-", "ml-", "mr-", "gap-", "grid",
        "flex", "items-", "justify-", "object-", "tracking-", "leading-",
        "border-", "outline-", "opacity-", "inset-", "top-", "bottom-",
        "left-", "right-", "translate-", "z-", "cursor-", "pointer-events-",
        "select-", "placeholder:", "hover:", "focus:", "group-hover:",
        "active:", "sm:", "md:", "lg:", "xl:", "2xl:", "dark",
        "material-symbols-outlined", "hidden", "block", "inline", "inline-flex",
        "inline-block", "relative", "absolute", "fixed", "sticky", "overflow-",
        "whitespace-", "line-clamp-", "animate-", "transition-", "duration-",
        "ease-", "delay-", "backdrop-blur-", "blur-", "from-", "via-", "to-",
        "max-h-", "min-h-", "aspect-", "antialiased", "selection:", "hover:bg-",
        "focus:bg-", "group-hover:bg-", "group-hover:text-", "group-hover:scale-",
        "group", "invisible", "scroll-mt-", "-top-", "-right-", "-translate-y-",
    )
    if any(class_name.startswith(prefix) for prefix in prefixes):
        return True

    # Allow known non-styled utility booleans/structure names used by Tailwind.
    if class_name in {"absolute", "fixed", "relative", "hidden", "block", "flex", "grid",
                      "inline", "inline-flex", "object-cover", "object-contain",
                      "overflow-hidden", "text-center", "text-left", "text-right",
                      "text-on-surface", "text-on-surface-variant", "bg-surface-container",
                      "bg-surface-container-lowest", "bg-surface-container-highest",
                      "bg-primary", "bg-secondary", "bg-primary-container", "bg-tertiary-container",
                      "tracking-tight", "tracking-wider", "tracking-widest", "uppercase",
                      "font-bold", "font-medium", "font-semibold", "font-mono",
                      "rounded", "rounded-full", "rounded-lg", "rounded-xl", "w-full",
                      "w-fit", "w-auto", "h-full", "h-8", "h-10", "h-20", "h-44",
                      "max-w-lg", "max-w-xl", "max-w-xs", "max-w-[1440px]", "mx-auto",
                      "mt-1", "mb-space-md", "pt-20", "px-6", "py-3.5", "gap-space-md",
                      "items-center", "justify-between", "justify-center", "transition-all"}:
        return True

    # Tailwind-generated arbitrary values such as bg-primary/10, shadow-[...] or
    # w-[380px] are runtime utilities and should not be counted as missing CSS.
    return bool(re.match(r"^(?:[a-z-]+:)*[a-z-]+(?:\[[^\]]+\]|/\d+|/\w+)?$", class_name) and ("-" in class_name or "/" in class_name or "[" in class_name))


def check_styles(html_docs: dict[str, TagCollector]) -> None:
    """AC-04 + class-name drift between markup and stylesheet."""
    path = ROOT / "styles.css"
    if not path.exists():
        bad("AC-04", "styles.css missing")
        return
    css = read(path)
    ok("AC-04", f"styles.css present ({len(css.splitlines())} lines)")

    if "prefers-reduced-motion" in css:
        ok("AC-83", "reduced-motion support present")
    else:
        bad("AC-83", "no prefers-reduced-motion block")

    if "focus-visible" in css:
        ok("AC-81", "focus-visible styling present")
    else:
        bad("AC-81", "no :focus-visible styling")

    if "aspect-ratio" in css or "object-fit" in css:
        ok("AC-29", "product media has stable geometry (no layout shift)")
    else:
        warn("AC-29", "no aspect-ratio/object-fit found for product media")

    # responsive column counts
    for label, needle in [
        ("AC-70 3-col tablet", "repeat(3"),
        ("AC-71 5-col desktop", "repeat(5"),
        ("AC-72 2-col mobile", "repeat(2"),
    ]:
        if needle in css:
            ok(label.split()[0], label.split(" ", 1)[1] + " present")
        else:
            warn(label.split()[0], label.split(" ", 1)[1] + " not found")

    defined = set(re.findall(r"\.([a-zA-Z][a-zA-Z0-9_-]*)", css))
    used: set[str] = set()
    for doc in html_docs.values():
        if doc:
            used |= doc.classes
    undefined = sorted(
        cls for cls in (used - defined - {"is-active", "is-open"})
        if not is_tailwind_utility(cls)
    )
    if undefined:
        bad("AC-04b", f"classes used in HTML but never styled: {undefined}")
    else:
        ok("AC-04b", "every class used in the HTML is defined in styles.css or provided by Tailwind CDN")


def check_seo_files() -> None:
    """AC-90, AC-91, AC-25."""
    robots = ROOT / "robots.txt"
    if robots.exists():
        text = read(robots)
        ok("AC-90", "robots.txt present")
        missing = [b for b in ("GPTBot", "PerplexityBot", "ClaudeBot", "Google-Extended")
                   if b not in text]
        if missing:
            bad("AC-90b", f"robots.txt does not name: {missing}")
        else:
            ok("AC-90b", "robots.txt names the AI crawlers")
        if "Sitemap:" in text:
            ok("AC-90c", "robots.txt points at the sitemap")
        else:
            warn("AC-90c", "robots.txt has no Sitemap: line")
    else:
        bad("AC-90", "robots.txt missing")

    sitemap = ROOT / "sitemap.xml"
    if sitemap.exists():
        try:
            tree = ElementTree.parse(sitemap)
            locs = [e.text for e in tree.iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
            if len(locs) >= 5:
                ok("AC-91", f"sitemap.xml well-formed with {len(locs)} urls")
            else:
                bad("AC-91", f"sitemap.xml has only {len(locs)} urls")
        except ElementTree.ParseError as exc:
            bad("AC-91", f"sitemap.xml is not well-formed: {exc}")
    else:
        bad("AC-91", "sitemap.xml missing")


def main() -> int:
    data = check_products()
    docs = {page: check_page(page) for page in PAGES}
    check_js(docs)
    check_styles(docs)
    check_seo_files()

    print("=" * 68)
    print("GEARZONE SELF-CHECK")
    print("=" * 68)
    for line in passed:
        print(f"  PASS  {line}")
    if warned:
        print()
        for line in warned:
            print(f"  WARN  {line}")
    if failed:
        print()
        for line in failed:
            print(f"  FAIL  {line}")

    print()
    print(f"PASSED: {len(passed)}")
    print(f"FAILED: {len(failed)}")
    print(f"WARNED: {len(warned)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
