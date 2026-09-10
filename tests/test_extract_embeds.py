#!/usr/bin/env python3
"""Check tools/extract_embeds.py against a page shaped like a Google Site."""

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import extract_embeds  # noqa: E402

failures = []

PAGE = """<!doctype html><html><body>
<div class="w536ob" data-code="&lt;!DOCTYPE html&gt;&lt;html&gt;&lt;head&gt;
&lt;style&gt;.card { color: #2d6a4f; }&lt;/style&gt;&lt;/head&gt;&lt;body&gt;
&lt;a class=&quot;card&quot; href=&quot;/view/x/page-a&quot;&gt;Card&lt;/a&gt;
&lt;/body&gt;&lt;/html&gt;"></div>
</body></html>"""


def check(condition, label):
    print(("  ok   " if condition else "  FAIL ") + label)
    if not condition:
        failures.append(label)


def main():
    src = Path(tempfile.mkdtemp(prefix="extract-test-")) / "site"
    (src / "guide-one").mkdir(parents=True)
    (src / "index.html").write_text(PAGE, encoding="utf-8")
    (src / "guide-one" / "index.html").write_text(PAGE, encoding="utf-8")
    (src / "no-embed").mkdir()
    (src / "no-embed" / "index.html").write_text(
        "<html><body><p>nothing here</p></body></html>", encoding="utf-8")

    out = src.parent / "source-embeds"
    written = extract_embeds.extract_all(src, out)

    print("Checks:")
    check(sorted(written) == ["guide-one", "index"],
          f"one file per page with an embed (got {sorted(written)})")
    check((out / "index.html").is_file(), "root page written as index.html")
    check((out / "guide-one.html").is_file(), "subpage written under its slug")
    check(not (out / "no-embed.html").exists(),
          "a page with no embed is skipped rather than written empty")

    body = (out / "guide-one.html").read_text(encoding="utf-8")
    check("&lt;" not in body, "markup is unescaped")
    check('href="/view/x/page-a"' in body, "quotes are unescaped")
    check(".card { color: #2d6a4f; }" in body, "style block is preserved")

    if failures:
        print(f"\n{len(failures)} check(s) failed:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
