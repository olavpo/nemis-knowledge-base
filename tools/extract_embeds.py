#!/usr/bin/env python3
"""Pull the hand-written HTML blocks out of a mirrored Google Site.

Google Sites stores an embedded HTML gadget as an escaped document in a
data-code attribute and renders it in an iframe. On this site that block is
the entire content of every page, so it is the real source: the text, the
layout and the stylesheet all live there rather than in the surrounding
machine-generated markup.

    python3 tools/extract_embeds.py            # site/ -> docs/source-embeds/
    python3 tools/extract_embeds.py --src site --out docs/source-embeds
"""

import argparse
import html
import re
import sys
from pathlib import Path

DATA_CODE_RE = re.compile(r'data-code="(.*?)"(?=[\s>])', re.S)


def extract_all(src: Path, out: Path) -> list[str]:
    """Write one file per page that has an embed. Returns the slugs written."""
    out.mkdir(parents=True, exist_ok=True)
    written = []

    for page in sorted(src.rglob("index.html")):
        blocks = DATA_CODE_RE.findall(page.read_text(encoding="utf-8", errors="replace"))
        if not blocks:
            continue
        relative = page.parent.relative_to(src).as_posix()
        slug = "index" if relative == "." else relative.replace("/", "-")
        markup = "\n\n<!-- next embed -->\n\n".join(html.unescape(b) for b in blocks)
        (out / f"{slug}.html").write_text(markup, encoding="utf-8")
        written.append(slug)

    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--src", default="site", type=Path)
    parser.add_argument("--out", default="docs/source-embeds", type=Path)
    options = parser.parse_args(argv)

    if not options.src.is_dir():
        return print(f"No mirror at {options.src}/. Run mirror_google_site.py first.") or 2

    written = extract_all(options.src, options.out)
    print(f"Extracted {len(written)} embed(s) into {options.out}/")
    for slug in written:
        print(f"  {slug}.html")
    return 0 if written else 1


if __name__ == "__main__":
    sys.exit(main())
