#!/usr/bin/env python3
"""Import the extracted Google Sites embeds into guide Markdown files.

Run once. After this the Markdown files are the source of truth and the
embeds in docs/source-embeds/ are only kept as provenance.

    python3 tools/import_from_mirror.py

Reads docs/source-embeds/, writes content/guides/*.md and _data/manuals.yaml.
"""

import argparse
import json
import re
import sys
from pathlib import Path

try:
    from bs4 import BeautifulSoup
except ImportError:  # pragma: no cover
    sys.exit("Missing dependency. Run:\n\n    python3 -m pip install beautifulsoup4\n")

# The two source URLs that break the <device>-<task> convention the other ten
# follow. Both keep working through redirect stubs.
RENAMES = {
    "Enrol-learners-individually": "mobile-enrol-individually",
    "Enrol-an-existing-staff-member": "computer-enrol-existing-staff",
}
SECTIONS = {"Mobile phone": "mobile", "Computer or laptop": "computer"}
INDEX_PAGES = {"index", "home", "manuals", "watch-all-videos"}
MINUTES_RE = re.compile(r"(\d+)\s*min")


def slug_of(url: str) -> str:
    raw = url.rstrip("/").rsplit("/", 1)[-1]
    return RENAMES.get(raw, raw)


def text_of(soup, selector: str) -> str | None:
    node = soup.select_one(selector)
    return node.get_text(" ", strip=True) if node else None


def read_order(embeds: Path) -> dict[str, int]:
    """Card order per section, taken from the home page — the authoritative list."""
    soup = BeautifulSoup((embeds / "home.html").read_text(encoding="utf-8"), "html.parser")
    order: dict[str, int] = {}
    for section in soup.select(".section"):
        for position, anchor in enumerate(section.select("a.card"), start=1):
            order[slug_of(anchor["href"])] = position
    return order


def read_guide(path: Path, order: dict[str, int]) -> dict:
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    slug = RENAMES.get(path.stem, path.stem)

    badge = text_of(soup, ".device-badge")
    if badge not in SECTIONS:
        raise ValueError(f"{path.name}: unknown device badge {badge!r}")

    title = text_of(soup, ".page-title")
    if not title:
        raise ValueError(f"{path.name}: no .page-title")

    body = text_of(soup, ".page-desc")
    if not body:
        raise ValueError(f"{path.name}: no .page-desc")

    if slug not in order:
        raise ValueError(
            f"{slug}: not linked from the home page (missing from home.html's order)")

    guide = {
        "slug": slug,
        "title": title,
        "section": SECTIONS[badge],
        "order": order[slug],
        "body": body,
        "next": [slug_of(a["href"]) for a in soup.select("a.card")],
        "video": None,
        "jobaid": None,
    }

    frame = soup.select_one('iframe[src*="vimeo"]')
    if frame:
        found = re.search(r"video/(\d+)", frame["src"])
        label = soup.select_one(".label-video")
        block = label.find_parent(class_="resource-header") if label else None
        meta = block.select_one(".resource-header-meta") if block else None
        minutes = MINUTES_RE.search(meta.get_text(strip=True)) if meta else None
        guide["video"] = {
            "id": found.group(1) if found else None,
            # The source site has one guide with a blank duration. Import it as
            # None rather than inventing a number; the template omits it and the
            # build warns until someone fills it in.
            "minutes": int(minutes.group(1)) if minutes else None,
        }

    if soup.select_one('iframe[src*="drive.google.com/file"]'):
        # Name the PDF after the guide. The Drive ids live in
        # tools/pdf-sources.json, which is what downloads them.
        guide["jobaid"] = f"{slug}.pdf"

    return guide


def read_guides(embeds: Path) -> list[dict]:
    order = read_order(embeds)
    return [read_guide(p, order) for p in sorted(embeds.glob("*.html"))
            if p.stem not in INDEX_PAGES]


def as_markdown(guide: dict) -> str:
    lines = ["---", "layout: guide.njk", f'title: "{guide["title"]}"',
             f"section: {guide['section']}", f"order: {guide['order']}"]
    if guide["video"]:
        minutes = guide["video"]["minutes"]
        lines.append("video:")
        lines.append(f"  id: \"{guide['video']['id']}\"")
        lines.append(f"  minutes: {minutes if minutes is not None else ''}".rstrip())
    if guide["jobaid"]:
        lines.append(f"jobaid: {guide['jobaid']}")
    lines.append("next:")
    for slug in guide["next"]:
        lines.append(f"  - {slug}")
    lines += ["---", "", guide["body"], ""]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--embeds", default="docs/source-embeds", type=Path)
    parser.add_argument("--out", default="content/guides", type=Path)
    options = parser.parse_args(argv)

    guides = read_guides(options.embeds)
    options.out.mkdir(parents=True, exist_ok=True)
    for guide in guides:
        (options.out / f"{guide['slug']}.md").write_text(
            as_markdown(guide), encoding="utf-8")
        note = "" if not guide["video"] or guide["video"]["minutes"] else "  (no duration)"
        print(f"  {guide['slug']}.md{note}")

    print(f"\nImported {len(guides)} guide(s) into {options.out}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
