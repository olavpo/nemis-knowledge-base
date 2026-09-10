# DNEMIS Knowledge Base Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the DNEMIS Knowledge Base as an Eleventy static site whose only editable content is one Markdown file per guide, keeping the current look, content and URLs.

**Architecture:** Twelve guide Markdown files are the single source of truth. The home page, the "Watch all videos" page and every tag on them are generated from those files by Eleventy collections, so the three views cannot drift apart the way the Google Sites originals did. PDFs are committed and served locally; videos stay embedded from Vimeo.

**Tech Stack:** Eleventy 3 (ESM config), Nunjucks templates, Markdown content, `pdf-lib` for PDF metadata, `pagefind` for search, `js-yaml` for `_data/*.yaml`, `cheerio` for build assertions, `node:test` as the test runner. Node 22.

**Spec:** `docs/superpowers/specs/2026-09-10-nemis-knowledge-base-rebuild-design.md`

## Global Constraints

- **Node 22**, Eleventy **3.x**, ESM (`"type": "module"` in `package.json`, config in `eleventy.config.js`).
- **No client-side framework.** No React, no build-time CSS framework. One hand-written `assets/style.css`.
- **No webfont.** Font stack is exactly `'Google Sans', 'Segoe UI', Arial, sans-serif` — `Google Sans` is not publicly available and is left as a first preference that resolves only for users who have it.
- **Palette, copied verbatim from the source embeds:** green `#2d6a4f`; page background `#f4f6f4`; text `#1a1a1a`; secondary text `#444`; muted `#888`; card border `#e0e0e0`; card radius `8px`. Tag video `#e8f4f0` on `#1e5c3e`. Tag job aid `#f0f4ff` on `#3a5aad`. Resource label video `#c0392b`, job aid `#2c5fad`.
- **URLs are root-relative** (`/assets/style.css`). Subdirectory hosting via Eleventy `pathPrefix`. `file://` is not supported.
- **No analytics and no cookie banner.** Do not port `G-JDSWLM634F` or the Google cookie notice.
- **Do not port** the `postMessage` iframe-height scripts, or any `.rating-block` / `.rating-form` / `.rating-header` / `.rating-title` / `.rating-subtitle` CSS — the widget does not exist on any page.
- **The twelve guide slugs are exactly these**, in this order within each section:
  - `mobile-install-login`, `mobile-enrol-individually`, `mobile-enrol-staff`, `mobile-classroom-data`
  - `computer-login-navigate`, `computer-census-data`, `computer-enrol-individually`, `computer-enrol-bulk`, `computer-enrol-staff`, `computer-enrol-existing-staff`, `computer-classroom-data`, `computer-change-password`
- **Renamed from the original site** (both need redirect stubs): `Enrol-learners-individually` → `mobile-enrol-individually`; `Enrol-an-existing-staff-member` → `computer-enrol-existing-staff`.
- **`site/` stays gitignored.** It is mirror output and import input, never a build artifact.

## File Structure

| Path | Responsibility |
|---|---|
| `docs/source-embeds/*.html` | The 16 hand-written HTML blocks extracted from the mirror. Committed as provenance and as the reference for the CSS and templates. Never built. |
| `tools/extract_embeds.py` | Pulls those blocks out of `site/`. Run once; kept so the extraction is reproducible. |
| `tools/import_from_mirror.py` | One-time import of `docs/source-embeds/` into `content/guides/*.md` and `_data/manuals.yaml`. |
| `tools/fetch_pdfs.py` | Already built. Downloads the 13 Drive PDFs. |
| `content/guides/*.md` | The twelve guides. The only files an editor normally touches. |
| `content/index.md`, `manuals.md`, `watch-all-videos.md` | Page intro copy only; every list on them is generated. |
| `_data/site.yaml` | Title, nav, logo, footer. |
| `_data/manuals.yaml` | The handbook list. |
| `_includes/base.njk` | `<head>`, logo header, nav, hero, footer. Written once. |
| `_includes/guide.njk` | The guide page layout. |
| `_includes/card.njk`, `video.njk` | Card and video-embed partials, shared by the guide pages and the index pages. |
| `assets/style.css` | The whole stylesheet, consolidated from the four distinct embed styles. |
| `assets/pdfs/*.pdf` | The 13 committed PDFs. |
| `eleventy.config.js` | Collections, filters, the YAML data extension, `pathPrefix`. |
| `lib/pdf-meta.js` | Reads a PDF's byte size and page count. Isolated so it can be unit-tested without a build. |
| `lib/validate.js` | Build-time checks on the guide collection. Isolated for the same reason. |
| `tests/build.test.js` | Asserts the built `_site` is correct. |
| `tests/pdf-meta.test.js`, `tests/validate.test.js` | Unit tests for the two `lib/` modules. |

---

### Task 1: Extract the source embeds as provenance

The real content of every page is a hand-written HTML document that Google Sites stores HTML-escaped inside a `data-code` attribute. Every later task reads these files, so they get extracted and committed first.

**Files:**
- Create: `tools/extract_embeds.py`
- Create: `docs/source-embeds/` (16 `.html` files, generated)
- Test: `tests/test_extract_embeds.py`

**Interfaces:**
- Consumes: `site/**/index.html` from `mirror_google_site.py` (already present, gitignored).
- Produces: `docs/source-embeds/<slug>.html`, where `<slug>` is the page's directory (`index` for the root). Each file is a complete `<!DOCTYPE html>` document with a `<style>` block and a `<body>`.

- [ ] **Step 1: Write the failing test**

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python3 tests/test_extract_embeds.py`
Expected: `ModuleNotFoundError: No module named 'extract_embeds'`

- [ ] **Step 3: Write the implementation**

```python
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `python3 tests/test_extract_embeds.py`
Expected: `All checks passed.`

- [ ] **Step 5: Extract the real embeds**

Run: `python3 tools/extract_embeds.py`
Expected: 16 files in `docs/source-embeds/`. Confirm with `ls docs/source-embeds | wc -l` → `16`.

- [ ] **Step 6: Commit**

```bash
chmod +x tools/extract_embeds.py
git add tools/extract_embeds.py tests/test_extract_embeds.py docs/source-embeds
git commit -m "Extract the site's hand-written HTML blocks from the mirror"
```

---

### Task 2: Eleventy scaffold, base layout and site chrome

A building site with the header, nav, hero and footer, and one page. No guides yet.

**Files:**
- Create: `package.json`, `eleventy.config.js`, `.nvmrc`
- Create: `_data/site.yaml`, `_includes/base.njk`, `assets/style.css`
- Create: `content/index.md`
- Modify: `.gitignore`
- Test: `tests/build.test.js`

**Interfaces:**
- Produces: `_site/index.html`. A `site` global data object with `title`, `tagline`, `hero`, `nav[]`, `footer`. The `base.njk` layout, which every later template extends via `layout: base.njk`.

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "dnemis-knowledge-base",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "eleventy && pagefind --site _site --output-subdir pagefind",
    "start": "eleventy --serve --port 8080",
    "test": "npm run build && node --test tests/"
  },
  "devDependencies": {
    "@11ty/eleventy": "^3.0.0",
    "cheerio": "^1.0.0",
    "js-yaml": "^4.1.0",
    "pagefind": "^1.1.0",
    "pdf-lib": "^1.17.1"
  }
}
```

Run: `npm install`
Then: `echo 22 > .nvmrc`
Then append to `.gitignore`:

```
# Eleventy
_site/
node_modules/
```

- [ ] **Step 2: Write the failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import * as cheerio from "cheerio";

const read = (p) => readFileSync(new URL(`../_site/${p}`, import.meta.url), "utf8");
const load = (p) => cheerio.load(read(p));

test("home page is built", () => {
  assert.ok(existsSync(new URL("../_site/index.html", import.meta.url)));
});

test("the chrome is on the page", () => {
  const $ = load("index.html");
  assert.equal($(".site-title").text().trim(), "DNEMIS Knowledge Base");
  assert.equal($(".site-logo").attr("src"), "/assets/logo.png");
  assert.deepEqual(
    $(".site-nav a").map((_, a) => $(a).text().trim()).get(),
    ["Home", "Manuals", "Watch all videos"],
  );
  assert.deepEqual(
    $(".site-nav a").map((_, a) => $(a).attr("href")).get(),
    ["/", "/manuals/", "/watch-all-videos/"],
  );
});

test("the hero copy matches the original site", () => {
  const $ = load("index.html");
  assert.equal($(".hero-title").text().trim(), "Training guides & videos");
  assert.equal(
    $(".hero-subtitle").text().trim(),
    "Step-by-step guides and videos for every task in DNEMIS",
  );
});

test("the stylesheet is linked and copied", () => {
  const $ = load("index.html");
  assert.equal($('link[rel="stylesheet"]').attr("href"), "/assets/style.css");
  assert.ok(existsSync(new URL("../_site/assets/style.css", import.meta.url)));
});

test("nothing from Google is carried over", () => {
  const html = read("index.html");
  for (const marker of ["G-JDSWLM634F", "googletagmanager", "sites.google.com",
                        "Report abuse", "postMessage", "rating-block"]) {
    assert.ok(!html.includes(marker), `found "${marker}" in the output`);
  }
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx eleventy && node --test tests/build.test.js`
Expected: FAIL — Eleventy has no config yet, so `_site/index.html` does not exist.

- [ ] **Step 4: Write the Eleventy config**

```javascript
import yaml from "js-yaml";

export default function (eleventyConfig) {
  eleventyConfig.addDataExtension("yaml", (contents) => yaml.load(contents));
  eleventyConfig.addPassthroughCopy({ assets: "assets" });
  eleventyConfig.setLiquidOptions({ jsTruthy: true });

  return {
    dir: {
      input: "content",
      includes: "../_includes",
      data: "../_data",
      output: "_site",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    pathPrefix: process.env.PATH_PREFIX || "/",
  };
}
```

- [ ] **Step 5: Write the site data**

`_data/site.yaml`:

```yaml
title: DNEMIS Knowledge Base
logo: /assets/logo.png
logoAlt: Federal Ministry of Education
hero:
  title: Training guides & videos
  subtitle: Step-by-step guides and videos for every task in DNEMIS
nav:
  - { text: Home, url: / }
  - { text: Manuals, url: /manuals/ }
  - { text: Watch all videos, url: /watch-all-videos/ }
footer: Federal Ministry of Education · DNEMIS
```

- [ ] **Step 6: Write the base layout**

`_includes/base.njk`:

```njk
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{% if title and title != site.title %}{{ site.title }} - {{ title }}{% else %}{{ site.title }}{% endif %}</title>
<link rel="stylesheet" href="/assets/style.css">
<link rel="icon" href="/assets/favicon.png">
</head>
<body>

<header class="site-header">
  <a class="site-brand" href="/">
    <img class="site-logo" src="{{ site.logo }}" alt="{{ site.logoAlt }}">
    <span class="site-title">{{ site.title }}</span>
  </a>
  <nav class="site-nav">
    {% for item in site.nav %}
    <a href="{{ item.url }}"{% if item.url == page.url %} aria-current="page"{% endif %}>{{ item.text }}</a>
    {% endfor %}
  </nav>
</header>

{% if hero %}
<div class="hero">
  <h1 class="hero-title">{{ hero.title or site.hero.title }}</h1>
  <p class="hero-subtitle">{{ hero.subtitle or site.hero.subtitle }}</p>
</div>
{% endif %}

<main class="site-main">
{{ content | safe }}
</main>

<footer class="site-footer">{{ site.footer }}</footer>

</body>
</html>
```

- [ ] **Step 7: Write the home page stub**

`content/index.md`:

```markdown
---
layout: base.njk
title: DNEMIS Knowledge Base
hero: true
---
```

- [ ] **Step 8: Write the stylesheet — reset, tokens and chrome**

`assets/style.css`. Only the chrome for now; the card, guide, video and manual rules arrive in later tasks. Values come from `docs/source-embeds/`.

```css
:root {
  --green: #2d6a4f;
  --page: #f4f6f4;
  --ink: #1a1a1a;
  --ink-soft: #444;
  --ink-muted: #888;
  --line: #e0e0e0;
  --radius: 8px;
  --font: 'Google Sans', 'Segoe UI', Arial, sans-serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font);
  background: var(--page);
  color: var(--ink);
  line-height: 1.5;
}

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 24px;
  background: #fff;
  border-bottom: 1px solid var(--line);
  padding: 12px 24px;
}

.site-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: inherit;
}

.site-logo { height: 34px; width: auto; }

.site-title { font-size: 17px; font-weight: 700; }

.site-nav { display: flex; gap: 20px; flex-wrap: wrap; }

.site-nav a {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-soft);
  text-decoration: none;
  padding: 4px 0;
  border-bottom: 2px solid transparent;
}

.site-nav a:hover { color: var(--green); }

.site-nav a[aria-current="page"] {
  color: var(--green);
  border-bottom-color: var(--green);
}

.hero { padding: 32px 24px 8px; max-width: 900px; margin: 0 auto; }
.hero-title { font-size: 26px; font-weight: 700; line-height: 1.2; }
.hero-subtitle { font-size: 15px; color: var(--ink-soft); margin-top: 6px; }

.site-main { max-width: 900px; margin: 0 auto; padding: 24px; }

.site-footer {
  max-width: 900px;
  margin: 0 auto;
  padding: 32px 24px;
  font-size: 12px;
  color: var(--ink-muted);
}
```

- [ ] **Step 9: Add the logo and favicon**

The mirror already downloaded both. Copy them out of it:

```bash
mkdir -p assets
cp site/assets/lh3.googleusercontent.com/sitesv/*.png assets/logo.png
cp site/assets/www.gstatic.com/images/branding/productlogos/sites_2026/v3/ico/*.ico assets/favicon.png
```

If the favicon copy fails, the Google Sites default favicon is not worth keeping — instead delete the `<link rel="icon">` line from `_includes/base.njk` and drop the assertion for it. Do not ship Google's product favicon.

- [ ] **Step 10: Run the test to verify it passes**

Run: `npx eleventy && node --test tests/build.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json .nvmrc .gitignore eleventy.config.js \
        _data/site.yaml _includes/base.njk assets/style.css assets/logo.png \
        assets/favicon.png content/index.md tests/build.test.js
git commit -m "Build the site chrome with Eleventy"
```

---

### Task 3: Import the twelve guides into Markdown

Turn the extracted embeds into the guide files that become the site's source of truth.

**Files:**
- Create: `tools/import_from_mirror.py`
- Create: `content/guides/*.md` (12 files, generated then committed)
- Create: `_data/manuals.yaml`
- Test: `tests/test_import.py`

**Interfaces:**
- Consumes: `docs/source-embeds/*.html` from Task 1.
- Produces: 12 files at `content/guides/<slug>.md`, each with front matter `title` (string), `section` (`mobile` | `computer`), `order` (int, 1-based within its section), `video` (`{id: str, minutes: int}` or absent), `jobaid` (PDF filename string, or absent), `next` (list of slugs), and the description as the body.

- [ ] **Step 1: Write the failing test**

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python3 tests/test_import.py`
Expected: `ModuleNotFoundError: No module named 'import_from_mirror'`

- [ ] **Step 3: Write the importer**

```python
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

    guide = {
        "slug": slug,
        "title": text_of(soup, ".page-title"),
        "section": SECTIONS[badge],
        "order": order.get(slug, 99),
        "body": text_of(soup, ".page-desc") or "",
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
        lines.append(f"video:")
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `python3 tests/test_import.py`
Expected: `All checks passed.`

- [ ] **Step 5: Run the import**

Run: `python3 tools/import_from_mirror.py`
Expected: 12 filenames listed, `mobile-enrol-individually.md` flagged `(no duration)`.

Then read two of the generated files to confirm they look right:

Run: `cat content/guides/mobile-install-login.md content/guides/computer-change-password.md`

- [ ] **Step 6: Fill in the one missing duration**

`content/guides/mobile-enrol-individually.md` has a blank `minutes:` because the Google Site had one. Open <https://vimeo.com/1183840330>, read the running time, and put the rounded number of minutes in. If the video is not reachable, leave it blank — the template omits the duration and the build prints a warning.

- [ ] **Step 7: Write the manuals data**

`_data/manuals.yaml`. Taken from `docs/source-embeds/manuals.html`; the file size is computed at build time in Task 5, so it is not written here.

```yaml
- title: Handbook for States
  description: ASC & Learner Registry data entry
  file: handbook-for-states.pdf
```

- [ ] **Step 8: Commit**

```bash
chmod +x tools/import_from_mirror.py
git add tools/import_from_mirror.py tests/test_import.py content/guides _data/manuals.yaml
git commit -m "Import the twelve guides from the mirror into Markdown"
```

---

### Task 4: The guide page template

Render a guide from its Markdown file: badge, title, description, video block, job aid block, and the "Do this next" cards.

**Files:**
- Create: `_includes/guide.njk`, `_includes/card.njk`, `_includes/video.njk`
- Modify: `eleventy.config.js` (guide collection, `guideBySlug` filter)
- Modify: `assets/style.css` (guide and card rules)
- Modify: `tests/build.test.js`

**Interfaces:**
- Consumes: guide front matter from Task 3.
- Produces: `collections.guides` sorted by `section` then `order`. A `guideBySlug` filter taking a slug string and returning that guide's collection item, used by `card.njk` to derive a card's title and tags. `card.njk` expects a `guide` variable; `video.njk` expects `video` (the front-matter object) and `title`.

- [ ] **Step 1: Write the failing test**

Append to `tests/build.test.js`:

```javascript
const SLUGS = [
  "mobile-install-login", "mobile-enrol-individually", "mobile-enrol-staff",
  "mobile-classroom-data", "computer-login-navigate", "computer-census-data",
  "computer-enrol-individually", "computer-enrol-bulk", "computer-enrol-staff",
  "computer-enrol-existing-staff", "computer-classroom-data",
  "computer-change-password",
];

test("every guide page is built at its own URL", () => {
  for (const slug of SLUGS) {
    assert.ok(existsSync(new URL(`../_site/${slug}/index.html`, import.meta.url)),
      `missing /${slug}/`);
  }
});

test("a guide renders its badge, title and description", () => {
  const $ = load("mobile-install-login/index.html");
  assert.equal($(".device-badge").text().trim(), "Mobile phone");
  assert.equal($(".page-title").text().trim(), "Install the app and log in");
  assert.match($(".page-desc").text(), /download and install the DNEMIS app/);
});

test("a guide embeds its video from Vimeo with the duration", () => {
  const $ = load("mobile-install-login/index.html");
  assert.equal($(".video-container iframe").attr("src"),
    "https://player.vimeo.com/video/1172389199");
  assert.equal($(".label-video").text().trim(), "Video");
  assert.match($(".resource-header-meta").first().text(), /4 min/);
});

test("a guide embeds its job aid from the local PDF, not from Drive", () => {
  const $ = load("mobile-install-login/index.html");
  const src = $(".pdf-container iframe").attr("src");
  assert.equal(src, "/assets/pdfs/mobile-install-login.pdf");
  assert.ok(!read("mobile-install-login/index.html").includes("drive.google.com/file"));
});

test("a guide with no video shows only the job aid", () => {
  const $ = load("computer-change-password/index.html");
  assert.equal($(".video-container").length, 0);
  assert.equal($(".pdf-container").length, 1);
  assert.equal($(".label-video").length, 0);
});

test("the Do this next cards carry tags derived from the target guide", () => {
  const $ = load("mobile-install-login/index.html");
  const cards = $(".next-list a.card");
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((_, a) => $(a).attr("href")).get(),
    ["/mobile-enrol-individually/", "/mobile-enrol-staff/"]);
  // mobile-enrol-staff has a video, so its card must say so. The original site
  // tagged this card "Job aid" only, which was wrong.
  const staffCard = cards.filter((_, a) =>
    $(a).attr("href") === "/mobile-enrol-staff/");
  assert.deepEqual($(staffCard).find(".tag").map((_, t) => $(t).text().trim()).get(),
    ["Video", "Job aid"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run build && node --test tests/build.test.js`
Expected: FAIL — no guide pages are built.

- [ ] **Step 3: Add the collection and filter**

In `eleventy.config.js`, inside the exported function before the `return`:

```javascript
  const SECTION_ORDER = { mobile: 0, computer: 1 };

  eleventyConfig.addCollection("guides", (api) =>
    api.getFilteredByGlob("content/guides/*.md").sort((a, b) =>
      (SECTION_ORDER[a.data.section] - SECTION_ORDER[b.data.section]) ||
      (a.data.order - b.data.order)));

  eleventyConfig.addFilter("guideBySlug", function (slug) {
    const guides = this.ctx?.collections?.guides
      || this.context?.environments?.collections?.guides
      || [];
    return guides.find((g) => g.fileSlug === slug);
  });
```

- [ ] **Step 4: Write the card partial**

`_includes/card.njk`. Tags are derived from the target guide, never typed, so a card cannot disagree with the page it points at.

```njk
<a class="card" href="{{ guide.url }}">
  <div class="card-text">
    <div class="card-title">{{ guide.data.title }}</div>
    <div class="card-tags">
      {% if guide.data.video %}<span class="tag tag-video">Video</span>{% endif %}
      {% if guide.data.jobaid %}<span class="tag tag-jobaid">Job aid</span>{% endif %}
    </div>
  </div>
  <div class="card-arrow">&rsaquo;</div>
</a>
```

- [ ] **Step 5: Write the video partial**

`_includes/video.njk`:

```njk
<div class="resource-block">
  <div class="resource-header">
    <span class="resource-header-label label-video">Video</span>
    {% if video.minutes %}<span class="resource-header-meta">{{ video.minutes }} min</span>{% endif %}
  </div>
  <div class="video-container">
    <iframe src="https://player.vimeo.com/video/{{ video.id }}"
            title="{{ title }}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen></iframe>
  </div>
</div>
```

- [ ] **Step 6: Write the guide layout**

`_includes/guide.njk`:

```njk
---
layout: base.njk
---
<div class="device-badge">{% if section == "mobile" %}Mobile phone{% else %}Computer or laptop{% endif %}</div>
<h1 class="page-title">{{ title }}</h1>
<div class="page-desc">{{ content | safe }}</div>

{% if video %}
<hr class="divider">
{% include "video.njk" %}
{% endif %}

{% if jobaid %}
<hr class="divider">
<div class="resource-block">
  <div class="resource-header">
    <span class="resource-header-label label-jobaid">Job aid</span>
    <span class="resource-header-meta">PDF</span>
  </div>
  <div class="pdf-container">
    <iframe src="/assets/pdfs/{{ jobaid }}" title="{{ title }} — Job aid"></iframe>
  </div>
</div>
<div class="download-row">
  <span class="download-hint">{{ title }} · PDF</span>
  <a class="download-btn" href="/assets/pdfs/{{ jobaid }}" download>&darr; Download</a>
</div>
{% endif %}

{% if next and next.length %}
<hr class="divider">
<div class="next-label">Do this next</div>
<div class="next-list">
  {% for slug in next %}
    {% set guide = slug | guideBySlug %}
    {% if guide %}{% include "card.njk" %}{% endif %}
  {% endfor %}
</div>
{% endif %}
```

The `PDF` and `PDF · <size>` metadata is a placeholder string here and becomes real in Task 5. Do not add a size by hand.

- [ ] **Step 7: Add the guide and card CSS**

Append to `assets/style.css`. Every value is copied from `docs/source-embeds/mobile-install-login.html` and `home.html`; the `.rating-*` rules in the source are dead and are not carried over.

```css
/* ---- cards, shared by the guide pages and the index pages ---- */
.card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 10px;
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}
.card:hover,
.card:focus-visible {
  border-color: var(--green);
  box-shadow: 0 0 0 1px #2d6a4f22;
}
.card-text { flex: 1; }
.card-title { font-size: 15px; font-weight: 600; margin-bottom: 5px; }
.card-desc { font-size: 13px; color: var(--ink-soft); margin-bottom: 6px; }
.card-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.card-arrow { font-size: 20px; color: #aaa; margin-left: 12px; line-height: 1; }

.tag {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
  padding: 2px 8px;
  border-radius: 20px;
}
.tag-video { background: #e8f4f0; color: #1e5c3e; }
.tag-jobaid { background: #f0f4ff; color: #3a5aad; }
.tag-pdf { background: #fdecea; color: #b03027; }
.tag-size { background: #f1f1f1; color: #666; }

.divider { border: none; border-top: 1px solid var(--line); margin: 32px 0; }

/* ---- guide page ---- */
.device-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: var(--green);
  margin-bottom: 8px;
}
.page-title { font-size: 24px; font-weight: 700; margin-bottom: 12px; line-height: 1.2; }
.page-desc { font-size: 14px; color: var(--ink-soft); line-height: 1.6; }
.page-desc p { margin-bottom: 12px; }

.resource-block { margin-bottom: 8px; }
.resource-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border: 1px solid var(--line);
  border-bottom: none;
  border-radius: var(--radius) var(--radius) 0 0;
  padding: 10px 16px;
}
.resource-header-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.4px;
  text-transform: uppercase;
}
.label-video { color: #c0392b; }
.label-jobaid { color: #2c5fad; }
.resource-header-meta { font-size: 12px; color: var(--ink-muted); }

.video-container {
  position: relative;
  width: 100%;
  padding-bottom: 56.25%;
  background: var(--ink);
  border: 1px solid var(--line);
  border-top: none;
  border-radius: 0 0 var(--radius) var(--radius);
  overflow: hidden;
}
.video-container iframe {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  border: none;
}

.pdf-container {
  width: 100%;
  height: 560px;
  background: #fff;
  border: 1px solid var(--line);
  border-top: none;
  border-radius: 0 0 var(--radius) var(--radius);
  overflow: hidden;
}
.pdf-container iframe { width: 100%; height: 100%; border: none; }

.download-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 32px;
  padding: 0 2px;
}
.download-hint { font-size: 12px; color: var(--ink-muted); }
.download-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--green);
  background: #fff;
  border: 1px solid var(--green);
  border-radius: 6px;
  padding: 6px 14px;
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
}
.download-btn:hover { background: var(--green); color: #fff; }

.next-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--green);
  margin-bottom: 12px;
}
```

- [ ] **Step 8: Put the PDFs in place**

The 13 files were downloaded by `tools/fetch_pdfs.py` into `incoming-pdfs/`.

```bash
mkdir -p assets/pdfs
cp incoming-pdfs/*.pdf assets/pdfs/
ls assets/pdfs | wc -l   # expect 13
```

If `incoming-pdfs/` is missing or short, stop and run `python3 tools/fetch_pdfs.py` on a machine with network access to Drive. Do not carry on with Drive preview iframes as a substitute.

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm run build && node --test tests/build.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 10: Commit**

```bash
git add eleventy.config.js _includes/guide.njk _includes/card.njk \
        _includes/video.njk assets/style.css assets/pdfs tests/build.test.js
git commit -m "Render the guide pages from their Markdown"
```

---

### Task 5: Compute PDF size and page count at build time

Three job aids on the original site show no page count or size, and the other nine show hand-typed ones. Reading them from the file removes the whole category.

**Files:**
- Create: `lib/pdf-meta.js`
- Modify: `eleventy.config.js` (a `pdfMeta` filter)
- Modify: `_includes/guide.njk`
- Test: `tests/pdf-meta.test.js`, `tests/build.test.js`

**Interfaces:**
- Produces: `lib/pdf-meta.js` exporting `pdfMeta(absolutePath)` → `{ pages: number, bytes: number, size: string }` where `size` is like `"230 KB"` or `"1.3 MB"`, and `formatBytes(bytes)` → that same string. A `pdfMeta` Eleventy filter taking a PDF filename relative to `assets/pdfs/` and returning the same object.

- [ ] **Step 1: Write the failing unit test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { pdfMeta, formatBytes } from "../lib/pdf-meta.js";

test("formats bytes the way the source site did", () => {
  assert.equal(formatBytes(0), "0 KB");
  assert.equal(formatBytes(235_520), "230 KB");
  assert.equal(formatBytes(989_000), "966 KB");
  assert.equal(formatBytes(1_363_148), "1.3 MB");
  assert.equal(formatBytes(1_887_437), "1.8 MB");
});

test("reads the page count and size of a real job aid", () => {
  const meta = pdfMeta(new URL("../assets/pdfs/mobile-install-login.pdf",
    import.meta.url).pathname);
  assert.equal(meta.pages, 2);
  assert.ok(meta.bytes > 1000, "a real file has a real size");
  assert.match(meta.size, /^\d+(\.\d)? (KB|MB)$/);
});

test("a missing PDF is an error, not a silent zero", () => {
  assert.throws(() => pdfMeta("/nope/missing.pdf"), /missing\.pdf/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/pdf-meta.test.js`
Expected: FAIL — `Cannot find module '../lib/pdf-meta.js'`

- [ ] **Step 3: Write the module**

```javascript
import { readFileSync, statSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

/** "230 KB" / "1.3 MB" — one decimal from a megabyte up, as on the source site. */
export function formatBytes(bytes) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

const cache = new Map();

/** Page count and size of a PDF. Throws if the file is missing or unreadable. */
export function pdfMeta(absolutePath) {
  if (cache.has(absolutePath)) return cache.get(absolutePath);

  let bytes;
  try {
    bytes = statSync(absolutePath).size;
  } catch {
    throw new Error(`Cannot read PDF: ${absolutePath}`);
  }

  // updateMetadata:false keeps pdf-lib from touching the file's own metadata,
  // which it otherwise does on load.
  const doc = readFileSync(absolutePath);
  const meta = {
    bytes,
    size: formatBytes(bytes),
    pages: null,
  };

  const result = PDFDocument.load(doc, { updateMetadata: false })
    .then((pdf) => pdf.getPageCount());
  // pdf-lib is async; Eleventy filters are sync. Resolve it up front instead.
  meta.pages = result;
  cache.set(absolutePath, meta);
  return meta;
}
```

**Note for the implementer:** `PDFDocument.load` is async, so the sketch above returns a promise for `pages`, which is wrong — the test asserts `meta.pages === 2`. Fix it by making the whole thing async and pre-loading, which is what the next step does. Replace `pdfMeta` with:

```javascript
/** Page count and size of a PDF. Throws if the file is missing or unreadable. */
export async function loadPdfMeta(absolutePath) {
  if (cache.has(absolutePath)) return cache.get(absolutePath);
  let bytes;
  try {
    bytes = statSync(absolutePath).size;
  } catch {
    throw new Error(`Cannot read PDF: ${absolutePath}`);
  }
  const pdf = await PDFDocument.load(readFileSync(absolutePath),
    { updateMetadata: false });
  const meta = { bytes, size: formatBytes(bytes), pages: pdf.getPageCount() };
  cache.set(absolutePath, meta);
  return meta;
}

/** Synchronous read, for Eleventy filters. Requires warmPdfMeta() first. */
export function pdfMeta(absolutePath) {
  const meta = cache.get(absolutePath);
  if (!meta) throw new Error(`PDF metadata not loaded: ${absolutePath}`);
  return meta;
}

/** Load every PDF in a directory into the cache. */
export async function warmPdfMeta(dir) {
  const { readdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".pdf"))) {
    await loadPdfMeta(join(dir, name));
  }
}
```

Update the unit test's third case to call `loadPdfMeta` and assert the rejection, and its second case to `await loadPdfMeta(...)`.

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `node --test tests/pdf-meta.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire the filter into Eleventy**

In `eleventy.config.js`:

```javascript
import { join } from "node:path";
import { pdfMeta, warmPdfMeta } from "./lib/pdf-meta.js";

// ...inside the exported function:
  const PDF_DIR = join(import.meta.dirname, "assets", "pdfs");
  eleventyConfig.on("eleventy.before", async () => { await warmPdfMeta(PDF_DIR); });
  eleventyConfig.addFilter("pdfMeta", (file) => pdfMeta(join(PDF_DIR, file)));
```

- [ ] **Step 6: Use it in the guide layout**

In `_includes/guide.njk`, replace the two placeholder strings:

```njk
{% set pdf = jobaid | pdfMeta %}
```

Put that line just inside `{% if jobaid %}`, then change the header meta to:

```njk
    <span class="resource-header-meta">PDF &middot; {{ pdf.pages }} page{% if pdf.pages != 1 %}s{% endif %}</span>
```

and the download hint to:

```njk
  <span class="download-hint">{{ title }} &middot; PDF &middot; {{ pdf.size }}</span>
```

- [ ] **Step 7: Add the build assertions**

Append to `tests/build.test.js`:

```javascript
test("job aid metadata is read from the PDF, not typed", () => {
  const $ = load("mobile-install-login/index.html");
  assert.match($(".resource-header-meta").last().text(), /PDF · 2 pages/);
  assert.match($(".download-hint").text(), /PDF · \d+(\.\d)? (KB|MB)$/);
});

test("every guide that has a job aid shows a size and a page count", () => {
  for (const slug of SLUGS) {
    const $ = load(`${slug}/index.html`);
    assert.match($(".resource-header-meta").last().text(),
      /PDF · \d+ page/, `${slug} has no page count`);
    assert.match($(".download-hint").text(),
      /· \d+(\.\d)? (KB|MB)$/, `${slug} has no file size`);
  }
});
```

- [ ] **Step 8: Run everything to verify it passes**

Run: `npm test`
Expected: PASS, 13 build tests plus 3 unit tests.

- [ ] **Step 9: Commit**

```bash
git add lib/pdf-meta.js eleventy.config.js _includes/guide.njk \
        tests/pdf-meta.test.js tests/build.test.js
git commit -m "Read job aid page counts and sizes from the PDFs"
```

---

### Task 6: Build-time validation and the redirect stubs

Make a broken internal link fail the build rather than reach production, and keep the two renamed URLs working.

**Files:**
- Create: `lib/validate.js`
- Create: `content/redirects.njk`
- Modify: `eleventy.config.js`
- Test: `tests/validate.test.js`, `tests/build.test.js`

**Interfaces:**
- Produces: `lib/validate.js` exporting `validateGuides(guides, pdfNames)` → `{ errors: string[], warnings: string[] }`. `guides` is the collection (each item having `fileSlug` and `data`), `pdfNames` a `Set` of filenames present in `assets/pdfs/`.

- [ ] **Step 1: Write the failing unit test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateGuides } from "../lib/validate.js";

const guide = (slug, data = {}) => ({
  fileSlug: slug,
  data: { title: slug, section: "mobile", order: 1, next: [], ...data },
});

test("a clean set of guides has nothing to report", () => {
  const result = validateGuides(
    [guide("a", { next: ["b"], jobaid: "a.pdf" }), guide("b")],
    new Set(["a.pdf"]));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("a next slug that names no guide is an error", () => {
  const { errors } = validateGuides([guide("a", { next: ["ghost"] })], new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /a\b.*ghost/);
});

test("a job aid with no PDF on disk is an error", () => {
  const { errors } = validateGuides([guide("a", { jobaid: "a.pdf" })], new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /a\.pdf/);
});

test("an unknown section is an error", () => {
  const { errors } = validateGuides([guide("a", { section: "tablet" })], new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /tablet/);
});

test("two guides sharing a section and order is an error", () => {
  const { errors } = validateGuides(
    [guide("a", { order: 2 }), guide("b", { order: 2 })], new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /order 2/);
});

test("a video with no duration is a warning, not an error", () => {
  const { errors, warnings } = validateGuides(
    [guide("a", { video: { id: "1", minutes: null } })], new Set());
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /duration/);
});

test("a guide pointing at itself is an error", () => {
  const { errors } = validateGuides([guide("a", { next: ["a"] })], new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /itself/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/validate.test.js`
Expected: FAIL — `Cannot find module '../lib/validate.js'`

- [ ] **Step 3: Write the module**

```javascript
const SECTIONS = new Set(["mobile", "computer"]);

/**
 * Check the guide collection for the mistakes an editor can actually make.
 * Errors fail the build; warnings are printed and let it through.
 */
export function validateGuides(guides, pdfNames) {
  const errors = [];
  const warnings = [];
  const slugs = new Set(guides.map((g) => g.fileSlug));
  const seen = new Map();

  for (const { fileSlug: slug, data } of guides) {
    if (!SECTIONS.has(data.section)) {
      errors.push(`${slug}: section "${data.section}" is not mobile or computer`);
    }

    const key = `${data.section}/${data.order}`;
    if (seen.has(key)) {
      errors.push(`${slug} and ${seen.get(key)} both claim ${data.section} order ${data.order}`);
    } else {
      seen.set(key, slug);
    }

    for (const target of data.next || []) {
      if (target === slug) {
        errors.push(`${slug}: "next" points at itself`);
      } else if (!slugs.has(target)) {
        errors.push(`${slug}: "next" names ${target}, which is not a guide`);
      }
    }

    if (data.jobaid && !pdfNames.has(data.jobaid)) {
      errors.push(`${slug}: job aid ${data.jobaid} is not in assets/pdfs/`);
    }

    if (data.video && !data.video.id) {
      errors.push(`${slug}: video has no id`);
    }
    if (data.video && data.video.id && !data.video.minutes) {
      warnings.push(`${slug}: video has no duration; the page will omit it`);
    }
  }

  return { errors, warnings };
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `node --test tests/validate.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Fail the build on an error**

In `eleventy.config.js`:

```javascript
import { readdirSync } from "node:fs";
import { validateGuides } from "./lib/validate.js";

// ...inside the exported function, after the guides collection is registered:
  eleventyConfig.on("eleventy.after", ({ results }) => {
    const guides = results
      .filter((r) => r.inputPath.startsWith("./content/guides/"))
      .map((r) => ({ fileSlug: r.inputPath.split("/").pop().replace(/\.md$/, ""),
                     data: r.data }));
    if (!guides.length) return;
    const pdfNames = new Set(readdirSync(PDF_DIR));
    const { errors, warnings } = validateGuides(guides, pdfNames);
    for (const w of warnings) console.warn(`  warning: ${w}`);
    if (errors.length) {
      throw new Error(`Guide content is not valid:\n  - ${errors.join("\n  - ")}`);
    }
  });
```

**Note for the implementer:** Eleventy's `eleventy.after` event does not put page `data` on `results`. If `r.data` is undefined, register the check as a collection callback instead — call `validateGuides` from inside `addCollection("guides", ...)` on the sorted array before returning it, which has `fileSlug` and `data` directly. Do that in preference to reshaping the event payload.

- [ ] **Step 6: Write the redirect stubs**

`content/redirects.njk`. Two pages, generated from a list, so the old capitalised URLs keep working.

```njk
---
pagination:
  data: redirects
  size: 1
  alias: redirect
redirects:
  - from: Enrol-learners-individually
    to: /mobile-enrol-individually/
  - from: Enrol-an-existing-staff-member
    to: /computer-enrol-existing-staff/
permalink: "{{ redirect.from }}/index.html"
eleventyExcludeFromCollections: true
---
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Moved</title>
<link rel="canonical" href="{{ redirect.to }}">
<meta http-equiv="refresh" content="0; url={{ redirect.to }}">
<meta name="robots" content="noindex">
</head>
<body>
<p>This page has moved to <a href="{{ redirect.to }}">{{ redirect.to }}</a>.</p>
</body>
</html>
```

- [ ] **Step 7: Add the build assertions**

Append to `tests/build.test.js`:

```javascript
test("the two renamed URLs still resolve", () => {
  const moved = {
    "Enrol-learners-individually": "/mobile-enrol-individually/",
    "Enrol-an-existing-staff-member": "/computer-enrol-existing-staff/",
  };
  for (const [from, to] of Object.entries(moved)) {
    const $ = load(`${from}/index.html`);
    assert.equal($('meta[http-equiv="refresh"]').attr("content"), `0; url=${to}`);
    assert.equal($('link[rel="canonical"]').attr("href"), to);
  }
});

test("no page links to a URL that was not built", () => {
  const pages = [...SLUGS.map((s) => `${s}/index.html`),
                 "index.html", "manuals/index.html", "watch-all-videos/index.html"];
  for (const page of pages) {
    const $ = load(page);
    for (const href of $("a[href^='/']").map((_, a) => $(a).attr("href")).get()) {
      const target = href.endsWith("/") ? `${href}index.html` : href;
      assert.ok(existsSync(new URL(`../_site${target}`, import.meta.url)),
        `${page} links to ${href}, which was not built`);
    }
  }
});
```

The second test needs the pages from Tasks 7 and 8. Until those exist, run it with only the guide pages and `index.html` in the list, and add `manuals` and `watch-all-videos` in Task 8.

- [ ] **Step 8: Run everything to verify it passes**

Run: `npm test`
Expected: PASS. Then prove the validation actually bites:

```bash
sed -i.bak 's/^  - mobile-enrol-staff$/  - ghost-guide/' content/guides/mobile-install-login.md
npx eleventy   # expect: Guide content is not valid: ... names ghost-guide
mv content/guides/mobile-install-login.md.bak content/guides/mobile-install-login.md
```

- [ ] **Step 9: Commit**

```bash
git add lib/validate.js eleventy.config.js content/redirects.njk \
        tests/validate.test.js tests/build.test.js
git commit -m "Fail the build on broken guide links; redirect the renamed URLs"
```

---

### Task 7: The home page card grid

Generate the two card sections from the guide collection, replacing the hand-written list.

**Files:**
- Modify: `content/index.md`
- Create: `_includes/section.njk`
- Modify: `assets/style.css`
- Modify: `tests/build.test.js`

**Interfaces:**
- Consumes: `collections.guides`, `card.njk`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Append to `tests/build.test.js`:

```javascript
test("the home page lists both sections with the original copy", () => {
  const $ = load("index.html");
  assert.deepEqual($(".section-label").map((_, e) => $(e).text().trim()).get(),
    ["Mobile phone", "Computer or laptop"]);
  assert.deepEqual($(".section-title").map((_, e) => $(e).text().trim()).get(),
    ["Using your mobile phone", "Using your computer or laptop"]);
  assert.deepEqual($(".section-desc").map((_, e) => $(e).text().trim()).get(),
    ["Using the DNEMIS app on your Android phone",
     "Via any web browser (Chrome, Firefox or Edge)"]);
});

test("the home page lists all twelve guides in order", () => {
  const $ = load("index.html");
  assert.deepEqual($(".section a.card").map((_, a) => $(a).attr("href")).get(),
    SLUGS.map((s) => `/${s}/`));
});

test("home page tags follow each guide's own fields", () => {
  const $ = load("index.html");
  const tagsFor = (slug) => $(`.section a.card[href="/${slug}/"] .tag`)
    .map((_, t) => $(t).text().trim()).get();
  assert.deepEqual(tagsFor("mobile-install-login"), ["Video", "Job aid"]);
  assert.deepEqual(tagsFor("computer-enrol-bulk"), ["Job aid"]);
  assert.deepEqual(tagsFor("computer-change-password"), ["Job aid"]);
  assert.deepEqual(tagsFor("mobile-enrol-staff"), ["Video", "Job aid"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run build && node --test tests/build.test.js`
Expected: FAIL — the home page has no `.section-label`.

- [ ] **Step 3: Write the section partial**

`_includes/section.njk`:

```njk
<div class="section">
  <div class="section-label">{{ group.label }}</div>
  <div class="section-title">{{ group.title }}</div>
  <div class="section-desc">{{ group.description }}</div>
  {% for guide in collections.guides %}
    {% if guide.data.section == group.key %}{% include "card.njk" %}{% endif %}
  {% endfor %}
</div>
```

- [ ] **Step 4: Write the home page**

`content/index.md`. The section headings are page copy, so they live here rather than in a template.

```markdown
---
layout: base.njk
title: DNEMIS Knowledge Base
hero: true
sections:
  - key: mobile
    label: Mobile phone
    title: Using your mobile phone
    description: Using the DNEMIS app on your Android phone
  - key: computer
    label: Computer or laptop
    title: Using your computer or laptop
    description: Via any web browser (Chrome, Firefox or Edge)
---

{% for group in sections %}
{% include "section.njk" %}
{% if not loop.last %}<hr class="divider">{% endif %}
{% endfor %}
```

- [ ] **Step 5: Add the section CSS**

Append to `assets/style.css`, copied from `docs/source-embeds/home.html`:

```css
.section { margin-bottom: 40px; }
.section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--green);
  margin-bottom: 4px;
}
.section-title { font-size: 20px; font-weight: 700; margin-bottom: 2px; }
.section-desc { font-size: 14px; color: #555; margin-bottom: 16px; }
.section-icon { vertical-align: -3px; margin-right: 6px; }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add content/index.md _includes/section.njk assets/style.css tests/build.test.js
git commit -m "Generate the home page card grid from the guides"
```

---

### Task 8: The Watch all videos and Manuals pages

**Files:**
- Create: `content/watch-all-videos.md`, `content/manuals.md`
- Modify: `assets/style.css`
- Modify: `tests/build.test.js`

**Interfaces:**
- Consumes: `collections.guides`, `_data/manuals.yaml`, the `pdfMeta` filter.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Append to `tests/build.test.js`:

```javascript
test("watch-all-videos lists every guide that has a video, and only those", () => {
  const $ = load("watch-all-videos/index.html");
  const cards = $(".video-card");
  assert.equal(cards.length, 9);
  const srcs = $(".video-card iframe").map((_, f) => $(f).attr("src")).get();
  assert.ok(srcs.every((s) => s.startsWith("https://player.vimeo.com/video/")));
  assert.equal(new Set(srcs).size, 9, "no video is listed twice");
});

test("each video card links to its guide", () => {
  const $ = load("watch-all-videos/index.html");
  const hrefs = $(".video-card .video-title a").map((_, a) => $(a).attr("href")).get();
  assert.equal(hrefs.length, 9);
  assert.ok(hrefs.includes("/mobile-install-login/"));
  assert.ok(!hrefs.includes("/computer-enrol-bulk/"), "bulk enrolment has no video");
});

test("manuals lists the handbook with a size read from the PDF", () => {
  const $ = load("manuals/index.html");
  assert.equal($(".card-title").text().trim(), "Handbook for States");
  assert.equal($(".card-desc").text().trim(), "ASC & Learner Registry data entry");
  assert.equal($("a.card").attr("href"), "/assets/pdfs/handbook-for-states.pdf");
  assert.deepEqual($(".tag").map((_, t) => $(t).text().trim()).get()[0], "PDF");
  assert.match($(".tag-size").text(), /^\d+(\.\d)? (KB|MB)$/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run build && node --test tests/build.test.js`
Expected: FAIL — neither page is built.

- [ ] **Step 3: Write the videos page**

`content/watch-all-videos.md`:

```markdown
---
layout: base.njk
title: Watch all videos
permalink: /watch-all-videos/
hero:
  title: Watch all videos
  subtitle: Every training video in one place
---

<div class="grid">
{% for guide in collections.guides %}{% if guide.data.video %}
  <div class="video-card">
    <div class="video-wrapper">
      <iframe src="https://player.vimeo.com/video/{{ guide.data.video.id }}"
              title="{{ guide.data.title }}" allowfullscreen></iframe>
    </div>
    <div class="video-info">
      <div class="video-title"><a href="{{ guide.url }}">{{ guide.data.title }}</a></div>
      {% if guide.data.video.minutes %}<span class="video-meta">{{ guide.data.video.minutes }} min</span>{% endif %}
    </div>
  </div>
{% endif %}{% endfor %}
</div>
```

The original page carried a "↓ Download" link per video pointing at Google Drive. Those Drive ids are not in the guide front matter, so they are not reproduced here; the decision recorded in the spec is that the per-guide download button (Task 4) is the download path, and the Drive video links are the one remaining Google dependency. Leave them out of this grid.

- [ ] **Step 4: Write the manuals page**

`content/manuals.md`:

```markdown
---
layout: base.njk
title: Manuals
permalink: /manuals/
hero:
  title: Reference manuals
  subtitle: Full handbooks for download and offline reference
---

<div class="section">
  <div class="section-label">Manuals</div>
{% for manual in manuals %}
  {% set pdf = manual.file | pdfMeta %}
  <a class="card" href="/assets/pdfs/{{ manual.file }}">
    <div class="card-text">
      <div class="card-title">{{ manual.title }}</div>
      <div class="card-desc">{{ manual.description }}</div>
      <div class="card-tags">
        <span class="tag tag-pdf">PDF</span>
        <span class="tag tag-size">{{ pdf.size }}</span>
      </div>
    </div>
    <div class="card-arrow">&darr;</div>
  </a>
{% endfor %}
</div>
```

- [ ] **Step 5: Add the video grid CSS**

Append to `assets/style.css`, from `docs/source-embeds/watch-all-videos.html`:

```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}
.video-card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
}
.video-wrapper {
  position: relative;
  width: 100%;
  padding-bottom: 56.25%;
  background: var(--ink);
}
.video-wrapper iframe {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  border: none;
}
.video-info {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
}
.video-title { font-size: 14px; font-weight: 600; }
.video-title a { color: inherit; text-decoration: none; }
.video-title a:hover { color: var(--green); }
.video-meta { font-size: 12px; color: var(--ink-muted); white-space: nowrap; }
```

- [ ] **Step 6: Extend the link check**

In `tests/build.test.js`, the "no page links to a URL that was not built" test now covers all three index pages. Confirm its `pages` array includes `manuals/index.html` and `watch-all-videos/index.html`, and add `assets/pdfs/*` to what it accepts by treating a href ending in `.pdf` as a file rather than a directory — the existing `href.endsWith("/")` branch already does this.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Compare against the original by eye**

Run: `npm start` and open `http://localhost:8080`. Alongside it, serve the mirror: `python3 -m http.server --directory site 8081`. Click through all 16 pages in both and check the layout matches. Note any difference and fix it in `assets/style.css`.

- [ ] **Step 9: Commit**

```bash
git add content/watch-all-videos.md content/manuals.md assets/style.css tests/build.test.js
git commit -m "Generate the videos and manuals pages from the guides"
```

---

### Task 9: Search

The Google Sites search box cannot work off Google. Pagefind indexes the built output and runs in the browser.

**Files:**
- Modify: `_includes/base.njk`
- Modify: `assets/style.css`
- Modify: `tests/build.test.js`

**Interfaces:**
- Consumes: the built `_site`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Append to `tests/build.test.js`:

```javascript
test("the search index is built and covers every page", () => {
  assert.ok(existsSync(new URL("../_site/pagefind/pagefind.js", import.meta.url)),
    "pagefind did not run — check the build script");
});

test("the search UI is on every page", () => {
  for (const page of ["index.html", "manuals/index.html",
                      "mobile-install-login/index.html"]) {
    const $ = load(page);
    assert.equal($("#search").length, 1, `${page} has no search box`);
  }
});

test("the chrome is excluded from the index so results are page content", () => {
  const $ = load("index.html");
  assert.equal($("main[data-pagefind-body]").length, 1);
  assert.equal($(".site-header[data-pagefind-ignore]").length, 1);
  assert.equal($(".site-nav [data-pagefind-ignore]").length +
               $(".site-header [data-pagefind-ignore]").length >= 1, true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run build && node --test tests/build.test.js`
Expected: FAIL — no `#search` element.

- [ ] **Step 3: Add the search UI to the layout**

In `_includes/base.njk`, add to `<head>`:

```njk
<link rel="stylesheet" href="/pagefind/pagefind-ui.css">
```

Mark the chrome so results are page content, not the nav: put `data-pagefind-ignore` on `<header class="site-header">` and on `<footer class="site-footer">`, and `data-pagefind-body` on `<main class="site-main">`.

Add the search box inside the header, after the nav:

```njk
  <div id="search" class="site-search"></div>
```

And before `</body>`:

```njk
<script src="/pagefind/pagefind-ui.js"></script>
<script>
  window.addEventListener("DOMContentLoaded", () => {
    new PagefindUI({ element: "#search", showSubResults: true, showImages: false });
  });
</script>
```

- [ ] **Step 4: Style the search box to match**

Append to `assets/style.css`:

```css
.site-search { flex: 0 1 260px; }
.site-search .pagefind-ui__search-input {
  font-family: var(--font);
  font-size: 14px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 7px 12px;
  width: 100%;
  background: #fff;
}
.site-search .pagefind-ui__search-input:focus {
  outline: none;
  border-color: var(--green);
}
.site-search .pagefind-ui__search-clear { font-size: 12px; color: var(--ink-muted); }
.site-search .pagefind-ui__result-title a { color: var(--green); }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Try a real search**

Run `npm start`, open the site, type `bulk` in the search box, and confirm *Enrol learners in bulk* comes up. Then type `Manuals` and confirm the nav link is not itself a result.

- [ ] **Step 7: Commit**

```bash
git add _includes/base.njk assets/style.css tests/build.test.js
git commit -m "Add search over the built site with Pagefind"
```

---

### Task 10: Deploy workflows and the README

Ship both deploy paths, disabled-by-default where a choice is needed, and rewrite the README for the new shape of the project.

**Files:**
- Create: `.github/workflows/pages.yml`, `.github/workflows/deploy.yml`
- Rewrite: `README.md`
- Modify: `refresh.sh` (retire it)

**Interfaces:**
- Consumes: `npm run build` producing `_site/`.

- [ ] **Step 1: Write the GitHub Pages workflow**

`.github/workflows/pages.yml`:

```yaml
name: Publish to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm test
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Write the rsync workflow**

`.github/workflows/deploy.yml`. Manual-only until the server is chosen, so enabling it is one line.

```yaml
name: Deploy to the web server

# Manual only for now. To deploy on every push, uncomment the push trigger.
on:
  workflow_dispatch:
  # push:
  #   branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm test

      - name: Load the deploy key
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.DEPLOY_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan -H "${{ secrets.DEPLOY_HOST }}" >> ~/.ssh/known_hosts

      - name: Copy the site across
        run: |
          rsync -az --delete _site/ \
            "${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }}:${{ secrets.DEPLOY_PATH }}"
```

Needs four repository secrets: `DEPLOY_KEY` (a private SSH key whose public half is in the server user's `authorized_keys`), `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`.

- [ ] **Step 3: Retire refresh.sh**

`refresh.sh` re-mirrored the Google Site and pushed the copy to a server. That is no longer how the site is published. Add a notice at the top of the file, below the shebang, and leave the rest working:

```bash
# SUPERSEDED. The site is no longer a mirror of the Google Site: it is built
# from the Markdown in content/ (see README.md). This script only refreshes
# site/, which is now an archival copy of the original used for comparison.
# It must not be pointed at the live web root.
```

Also remove the `DEPLOY_TARGET` rsync block from it, since deploying a mirror over the built site would silently replace the real one.

- [ ] **Step 4: Rewrite the README**

Replace `README.md` entirely. It must cover, in this order:

1. What the site is and where it is published.
2. **How to edit content** — the first thing a non-technical editor needs. Editing text in a `content/guides/*.md` file; the front-matter fields and what each does; that a change pushed to `main` publishes itself.
3. **How to add a guide** — copy an existing file, change the front matter, add the PDF to `assets/pdfs/`, commit. Note that the home page and videos page update themselves.
4. **How to add a manual** — a PDF in `assets/pdfs/` and an entry in `_data/manuals.yaml`.
5. Running it locally: `npm install`, `npm start`, `npm test`.
6. What the build checks and what the error messages mean.
7. **The one remaining Google dependency**: the nine per-video "Download" links point at Google Drive and break silently if a share lapses; re-hosting the files on the server is the fix.
8. Where the original site came from: `mirror_google_site.py`, `tools/extract_embeds.py`, `tools/import_from_mirror.py`, `docs/source-embeds/`, and that these are historical, not part of the build.
9. Deploying: the two workflows and the secrets the rsync one needs.

- [ ] **Step 5: Verify a clean build from scratch**

```bash
rm -rf node_modules _site
npm ci
npm test
```
Expected: PASS, with no network access needed beyond the npm install.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/pages.yml .github/workflows/deploy.yml README.md refresh.sh
git commit -m "Add both deploy workflows and rewrite the README for editors"
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: content model → 3; repository layout → 2, 3, 4; build and Eleventy → 2; search → 9; look and the palette → 2, 4, 7, 8, plus dropping the dead `.rating-*` CSS and the `postMessage` scripts (Global Constraints, Task 4); URLs and the two renames → 3, 6; Google dependencies, analytics and the cookie banner → 2 (asserted absent), 4 (local PDFs), 8 (Drive video links left out); prerequisites → `tools/fetch_pdfs.py`, already built, consumed in Task 4 Step 8; deployment → 10; testing → every task, with the cross-page link check in 6 and the manual comparison against the mirror in 8.

**Two known rough edges, flagged inline rather than hidden.** Task 5 Step 3 walks the implementer through a wrong first sketch (`pdf-lib` is async, Eleventy filters are sync) to the pre-warmed cache that actually works — the note says so explicitly. Task 6 Step 5 gives an `eleventy.after` hook and warns that Eleventy may not expose page `data` on `results`, with the collection-callback fallback to use instead. Both are places where the API shape needs confirming against the installed version rather than trusted from this plan.

**Type consistency.** `pdfMeta(path)` → `{pages, bytes, size}` is used as `pdf.pages` / `pdf.size` in Tasks 4, 5 and 8. `validateGuides(guides, pdfNames)` → `{errors, warnings}` is used only in Task 6. `guideBySlug` takes a slug and returns a collection item, and `card.njk` reads `guide.url`, `guide.data.title`, `guide.data.video`, `guide.data.jobaid` — consistent in Tasks 4, 7 and 8. Guide front-matter field names (`title`, `section`, `order`, `video.id`, `video.minutes`, `jobaid`, `next`) are identical in the importer (3), the layout (4), the validator (6) and both index pages (7, 8).
