#!/usr/bin/env python3
"""Check tools/import_from_mirror.py against the real extracted embeds."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import import_from_mirror as imp  # noqa: E402

EMBEDS = ROOT / "docs" / "source-embeds"
failures = []


def check(condition, label):
    print(("  ok   " if condition else "  FAIL ") + label)
    if not condition:
        failures.append(label)


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

    if failures:
        print(f"\n{len(failures)} check(s) failed:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
