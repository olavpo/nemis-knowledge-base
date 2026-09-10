#!/usr/bin/env python3
"""Check tools/import_from_mirror.py against the real extracted embeds."""

import re
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import import_from_mirror as imp  # noqa: E402

EMBEDS = ROOT / "docs" / "source-embeds"
CONTENT_GUIDES = ROOT / "content" / "guides"
PDFS = ROOT / "incoming-pdfs"
FRONT_MATTER_FENCE = re.compile(r"(?m)^---\s*$")
failures = []


def check(condition, label):
    print(("  ok   " if condition else "  FAIL ") + label)
    if not condition:
        failures.append(label)


def expect_value_error(fn, contains, label):
    """Call fn() and check it raises ValueError naming `contains`."""
    try:
        fn()
    except ValueError as exc:
        message = str(exc)
        ok = contains in message
        check(ok, label if ok else f"{label} (got: {message!r})")
    else:
        check(False, f"{label} (no exception raised)")


def guard_fixture(tmp: Path, name: str, *, badge="Mobile phone",
                   title="A title", desc="A description.") -> Path:
    """A minimal guide page missing whichever piece the caller sets to None."""
    parts = ["<html><body>", f'<div class="device-badge">{badge}</div>']
    if title is not None:
        parts.append(f'<h1 class="page-title">{title}</h1>')
    if desc is not None:
        parts.append(f'<p class="page-desc">{desc}</p>')
    parts.append("</body></html>")
    path = tmp / f"{name}.html"
    path.write_text("\n".join(parts), encoding="utf-8")
    return path


def parse_front_matter(path: Path) -> tuple[dict, str]:
    """Split a guide Markdown file into its parsed front matter and body text."""
    text = path.read_text(encoding="utf-8")
    _, front_matter, body = FRONT_MATTER_FENCE.split(text, maxsplit=2)
    return yaml.safe_load(front_matter) or {}, body.strip("\n")


def main():
    guides = imp.read_guides(EMBEDS)
    by_slug = {g["slug"]: g for g in guides}

    print("Checks:")
    check(len(guides) == 12, f"twelve guides imported (got {len(guides)})")

    # --- the rename ------------------------------------------------------- #
    check("mobile-enrol-individually" in by_slug,
          "Enrol-learners-individually renamed to mobile-enrol-individually")
    check("computer-enrol-existing-staff" in by_slug,
          "Enrol-an-existing-staff-member renamed to computer-enrol-existing-staff")
    check(not any(s[0].isupper() for s in by_slug), "no slug has a capital letter")

    # --- ordering comes from the home page -------------------------------- #
    mobile = sorted((g for g in guides if g["section"] == "mobile"),
                    key=lambda g: g["order"])
    check([g["slug"] for g in mobile] == [
        "mobile-install-login", "mobile-enrol-individually",
        "mobile-enrol-staff", "mobile-classroom-data"],
        "mobile guides ordered as on the home page")
    computer = sorted((g for g in guides if g["section"] == "computer"),
                      key=lambda g: g["order"])
    check(len(computer) == 8, f"eight computer guides (got {len(computer)})")
    check(computer[0]["slug"] == "computer-login-navigate",
          "computer section starts with logging in")

    # --- fields ----------------------------------------------------------- #
    one = by_slug["mobile-install-login"]
    check(one["title"] == "Install the app and log in", "title read")
    check(one["video"]["id"] == "1172389199", "vimeo id read")
    check(one["video"]["minutes"] == 4, "video duration read")
    check(one["jobaid"] == "mobile-install-login.pdf",
          "job aid named after the guide, not the Drive id")
    check(one["next"] == ["mobile-enrol-individually", "mobile-enrol-staff"],
          f"next list renamed too (got {one['next']})")
    check(one["body"].startswith("After reviewing these resources"),
          "description read as the body")

    # --- guides with no video --------------------------------------------- #
    check(by_slug["computer-enrol-bulk"].get("video") is None,
          "a guide with no video has no video field")
    check(by_slug["computer-change-password"].get("video") is None,
          "change-password has no video")
    check(sum(1 for g in guides if g.get("video")) == 9,
          "nine of the twelve guides have a video")

    # --- every guide has a job aid ---------------------------------------- #
    check(all(g.get("jobaid") for g in guides), "every guide has a job aid")

    # --- next lists point at guides that exist ---------------------------- #
    unknown = {n for g in guides for n in g["next"]} - set(by_slug)
    check(not unknown, f"every next slug exists (dangling: {sorted(unknown)})")

    # --- the one missing duration ----------------------------------------- #
    check(by_slug["mobile-enrol-individually"]["video"]["minutes"] is None,
          "a blank duration on the source site imports as None, not 0")

    # --- the importer is re-runnable: missing pieces must fail loudly ----- #
    # rather than silently writing a broken guide into the site's source of
    # truth (a "None" title, an empty body, or a guide quietly sorted last).
    with tempfile.TemporaryDirectory(prefix="import-guard-test-") as tmpdir:
        tmp = Path(tmpdir)

        no_title = guard_fixture(tmp, "no-title", title=None)
        expect_value_error(
            lambda: imp.read_guide(no_title, {"no-title": 1}),
            "no-title.html", "missing .page-title raises, naming the file")

        no_desc = guard_fixture(tmp, "no-desc", desc=None)
        expect_value_error(
            lambda: imp.read_guide(no_desc, {"no-desc": 1}),
            "no-desc.html", "missing .page-desc raises, naming the file")

        unlinked = guard_fixture(tmp, "unlinked-guide")
        expect_value_error(
            lambda: imp.read_guide(unlinked, {}),
            "unlinked-guide",
            "a guide not linked from the home page raises, naming the slug")

    # --- the committed Markdown matches a fresh extraction ----------------- #
    # This is the check a reviewer did by hand: every field in content/guides/
    # must still agree with docs/source-embeds/, in both directions.
    print("\nRound-trip against committed content/guides/*.md:")
    md_files = sorted(CONTENT_GUIDES.glob("*.md"))
    check(len(md_files) == 12, f"twelve guide files committed (got {len(md_files)})")

    for md_path in md_files:
        slug = md_path.stem
        front_matter, body = parse_front_matter(md_path)
        extracted = by_slug.get(slug)

        if extracted is None:
            check(False, f"{slug}.md: has no matching guide in a fresh extraction")
            continue

        check(front_matter.get("title") == extracted["title"],
              f"{slug}.md: title matches fresh extraction")
        check(front_matter.get("section") == extracted["section"],
              f"{slug}.md: section matches fresh extraction")
        check(front_matter.get("order") == extracted["order"],
              f"{slug}.md: order matches fresh extraction")
        check(front_matter.get("jobaid") == extracted["jobaid"],
              f"{slug}.md: jobaid matches fresh extraction")
        check(front_matter.get("next") == extracted["next"],
              f"{slug}.md: next list matches fresh extraction")

        committed_video = front_matter.get("video")
        extracted_video = extracted["video"]
        if extracted_video is None:
            check(committed_video is None,
                  f"{slug}.md: has no video, matching fresh extraction")
        else:
            check(bool(committed_video)
                  and committed_video.get("id") == extracted_video["id"]
                  and committed_video.get("minutes") == extracted_video["minutes"],
                  f"{slug}.md: video id and minutes match fresh extraction "
                  f"(got {committed_video!r}, want {extracted_video!r})")

        check(body == extracted["body"],
              f"{slug}.md: body text matches the extracted description")

        jobaid = front_matter.get("jobaid")
        check(bool(jobaid) and (PDFS / jobaid).is_file(),
              f"{slug}.md: jobaid file exists in incoming-pdfs/ ({jobaid})")

    if failures:
        print(f"\n{len(failures)} check(s) failed:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
