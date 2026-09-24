#!/usr/bin/env python3
"""Tải ảnh hotlink từ Google Stitch về máy và thay bằng đường dẫn local.

index.html đang trỏ ảnh thẳng tới lh3.googleusercontent.com.
Link đó là link tạm của Google — có thể hết hạn bất cứ lúc nào, làm vỡ layout
và làm og:image trỏ ra ngoài site. Script này tải về images/home/ rồi viết lại
src trong cả hai file.

Chạy lại được nhiều lần: ảnh đã có thì bỏ qua, không tải lại.
    python tools/fetch_home_images.py
"""

from __future__ import annotations

import io
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST_DIR = os.path.join(ROOT, "images", "home")
PAGES = ["index.html"]
URL_RE = re.compile(r"https://lh3\.googleusercontent\.com/[^\"'\s>]+")
EXT_BY_TYPE = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
SITE = "https://geoweb.vercel.app"


def read(path: str) -> str:
    with io.open(path, encoding="utf-8") as fh:
        return fh.read()


def write(path: str, text: str) -> None:
    with io.open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)


def collect_urls(pages: list[str]) -> list[str]:
    """Mọi URL hotlink, theo thứ tự xuất hiện lần đầu trong các trang."""
    seen: list[str] = []
    for name in pages:
        for url in URL_RE.findall(read(os.path.join(ROOT, name))):
            if url not in seen:
                seen.append(url)
    return seen


def download(url: str, index: int) -> tuple[str, str]:
    """Tải 1 ảnh, trả về (đường dẫn tương đối, content-type). Ảnh có rồi thì thôi."""
    for ext in EXT_BY_TYPE.values():
        name = "asset-%02d.%s" % (index, ext)
        path = os.path.join(DEST_DIR, name)
        if os.path.exists(path):
            return "images/home/" + name, "image/" + ("jpeg" if ext == "jpg" else ext), os.path.getsize(path)
    with urllib.request.urlopen(url, timeout=60) as resp:
        ctype = resp.headers.get_content_type()
        body = resp.read()
    ext = EXT_BY_TYPE.get(ctype)
    if not ext:
        sys.exit("content-type lạ %r ở %s" % (ctype, url))
    name = "asset-%02d.%s" % (index, ext)
    with open(os.path.join(DEST_DIR, name), "wb") as fh:
        fh.write(body)
    return "images/home/" + name, ctype, len(body)


def main() -> int:
    # stdout trên Windows là cp1252, in tiếng Việt sẽ nổ UnicodeEncodeError.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    os.makedirs(DEST_DIR, exist_ok=True)
    urls = collect_urls(PAGES)
    if not urls:
        print("Không còn URL hotlink — không cần làm gì.")
        return 0

    mapping: dict[str, str] = {}
    rows: list[tuple[str, str, int]] = []
    for i, url in enumerate(urls, start=1):
        rel, ctype, size = download(url, i)
        mapping[url] = rel
        rows.append((rel, ctype, size))
        print("%-28s %-10s %7d bytes" % (rel, ctype, size))

    for name in PAGES:
        path = os.path.join(ROOT, name)
        text = read(path)
        out = URL_RE.sub(lambda m: mapping.get(m.group(0), m.group(0)), text)
        if out != text:
            write(path, out)
            print("đã viết lại", name)

    biggest = max(rows, key=lambda r: r[2])[0]
    write(
        os.path.join(DEST_DIR, "MANIFEST.txt"),
        "Ảnh tải từ Google Stitch (lh3.googleusercontent.com) — không sửa tay.\n"
        "Chạy lại: python tools/fetch_home_images.py\n"
        "og:image nên trỏ tới ảnh lớn nhất: %s/%s\n" % (SITE, biggest),
    )
    print("og:image đề xuất:", SITE + "/" + biggest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
