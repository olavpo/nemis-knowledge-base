#!/usr/bin/env python3
"""End-to-end check of mirror_google_site.py against a local fixture site.

Serves tests/fixtures/ over HTTP so the crawler sees URLs shaped like a real
Google Site (/view/<name>/<page>, no file extensions), mirrors it, and asserts
the output is self-contained.

    python3 tests/test_mirror.py
"""

import functools
import http.server
import json
import shutil
import socket
import socketserver
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import mirror_google_site as mgs  # noqa: E402

FIXTURES = ROOT / "tests" / "fixtures"
failures = []


def check(condition, label):
    print(("  ok   " if condition else "  FAIL ") + label)
    if not condition:
        failures.append(label)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main():
    port = free_port()
    handler = functools.partial(QuietHandler, directory=str(FIXTURES))
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    out = Path(tempfile.mkdtemp(prefix="mirror-test-")) / "site"
    root_url = f"http://127.0.0.1:{port}/view/testsite"
    print(f"Mirroring {root_url}\n")

    try:
        options = mgs.parse_args([root_url, "--out", str(out), "--delay", "0"])
        mirror = mgs.Mirror(root=root_url, out_dir=out, delay=0)
        mirror.run(options)
        mirror.write_search_assets()
        mirror.write_extras()
        mirror.write_report()

        print("\nChecks:")
        # --- pages ---------------------------------------------------------- #
        for rel in ("index.html", "page-a/index.html",
                    "page-a/child/index.html", "page-b/index.html",
                    "page-c/index.html"):
            check((out / rel).is_file(), f"page written: {rel}")
        check(len(mirror.pages) == 5, f"crawled exactly 5 pages (got {len(mirror.pages)})")

        # page-c is linked only from inside a data-code embed, where a scan for
        # <a> elements cannot see it.
        check("Reachable only from a card" in
              (out / "page-c" / "index.html").read_text(encoding="utf-8"),
              "page linked only from an embedded HTML block is crawled")
        check(f"http://127.0.0.1:{port}/view/testsite/page-c" in mirror.embedded_pages,
              "embedded-only page recorded in embedded_pages")

        home = (out / "index.html").read_text(encoding="utf-8")
        child = (out / "page-a" / "child" / "index.html").read_text(encoding="utf-8")

        # --- internal links ------------------------------------------------- #
        check('href="page-a/"' in home, "home links to page-a/ relatively")
        check('href="page-a/child/"' in home, "home links to nested page relatively")
        check('href="page-a/#h.section"' in home, "in-page anchor preserved on rewritten link")
        check('href="../../"' in child, "nested page links back up to home")
        check(f"127.0.0.1:{port}/view/testsite" not in home,
              "no absolute source-site URLs left in home page")
        check(f"127.0.0.1:{port}/view/testsite" not in child,
              "no absolute source-site URLs left in nested page")

        # --- assets --------------------------------------------------------- #
        asset_files = sorted(p.relative_to(out).as_posix()
                             for p in out.rglob("*") if p.is_file()
                             and p.relative_to(out).parts[0] == "assets")
        names = {Path(p).name for p in asset_files}
        for expected in ("hero.png", "hero-2x.png", "lazy.png", "banner.jpg",
                         "favicon.png", "logo.svg", "roboto.woff2",
                         "theme.css", "extra.css"):
            check(expected in names, f"downloaded asset: {expected}")

        check('srcset="' in home and home.count("hero-2x.png") >= 1,
              "srcset rewritten to local files")
        check("data-srcset" in home and "lazy.png" in home, "data-srcset rewritten")
        check("url(" in home and "/hero.png'" not in home,
              "inline <style> url() rewritten")

        css = next(p for p in out.rglob("theme.css")).read_text(encoding="utf-8")
        check("roboto.woff2" in css and "http" not in css.split("@font-face")[1][:200],
              "@font-face url rewritten inside CSS")
        check("banner.jpg" in css and "url(/banner.jpg)" not in css,
              "CSS background url() rewritten")
        check("extra.css" in css, "@import rewritten to local CSS")

        # --- cleanups ------------------------------------------------------- #
        check("Report abuse" not in home, "Google 'Report abuse' footer removed")
        check("sites.google.com/new" not in home, "Google Sites footer link removed")
        check("Welcome to the knowledge base" in home, "page content kept")
        check('rel="canonical"' not in home, "canonical link to Google removed")
        check('property="og:url"' not in home, "og:url pointing at Google removed")

        # --- embeds and external links --------------------------------------- #
        check("https://docs.google.com/document/d/XYZ/pub?embedded=true" in home,
              "Google Docs iframe left pointing at Google")
        check("https://drive.google.com/file/d/ABC123/view" in home,
              "Drive attachment link left unchanged")
        check("https://example.com/external" in home, "external link left unchanged")

        # --- search ---------------------------------------------------------- #
        for rel in ("search-index.json", "selfhost-search.js", "selfhost-search.css"):
            check((out / rel).is_file(), f"search asset written: {rel}")
        index = json.loads((out / "search-index.json").read_text(encoding="utf-8"))
        check(len(index) == 5, f"search index has 5 pages (got {len(index)})")
        urls = {d["url"] for d in index}
        check(urls == {"/", "/page-a/", "/page-a/child/", "/page-b/", "/page-c/"},
              f"search index URLs correct (got {sorted(urls)})")
        entry = next(d for d in index if d["url"] == "/page-b/")
        check("dashboards" in entry["text"], "search index captured page text")
        check("selfhost-search.js" in home, "search script injected into home")
        check('data-index="search-index.json"' in home, "search index path relative on home")
        check('data-index="../../search-index.json"' in child,
              "search index path relative on nested page")

        # --- report ---------------------------------------------------------- #
        report = (out / "MIRROR-REPORT.md").read_text(encoding="utf-8")
        check("drive.google.com/file/d/ABC123" in report, "report lists Drive attachment")
        check("docs.google.com/document/d/XYZ" in report, "report lists Google Docs embed")
        check("None." in report.split("## Failures")[1], "report shows no failures")
        check((out / "404.html").is_file(), "404.html written")

        print()
        if failures:
            print(f"{len(failures)} check(s) failed:")
            for label in failures:
                print(f"  - {label}")
            return 1
        print("All checks passed.")
        return 0
    finally:
        httpd.shutdown()
        shutil.rmtree(out.parent, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
