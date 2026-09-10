#!/usr/bin/env python3
"""Mirror a published Google Site into a self-hostable static copy.

Crawls every page of a published Google Site, downloads the assets those pages
reference (images, CSS, JavaScript, web fonts), rewrites every URL to a
relative local path, and writes the result as plain HTML files. The output
folder can be served by any web server, or opened straight from disk.

Typical use:

    python3 -m pip install -r requirements.txt
    python3 mirror_google_site.py https://sites.google.com/view/nemisknowledgebase
    python3 -m http.server --directory site 8000    # preview at localhost:8000

Read MIRROR-REPORT.md in the output folder afterwards. It lists what was
copied and, more importantly, what could not be.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import re
import shutil
import sys
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import unquote, urldefrag, urljoin, urlparse, urlsplit

try:
    import requests
    from bs4 import BeautifulSoup, Comment
except ImportError:  # pragma: no cover
    sys.exit(
        "Missing dependencies. Run:\n\n"
        "    python3 -m pip install -r requirements.txt\n"
    )

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

# Hosts whose files are downloaded and served locally.
LOCALISE_HOSTS = {
    "sites.google.com",
    "ssl.gstatic.com",
    "www.gstatic.com",
    "gstatic.com",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "lh1.googleusercontent.com",
    "lh2.googleusercontent.com",
    "lh3.googleusercontent.com",
    "lh4.googleusercontent.com",
    "lh5.googleusercontent.com",
    "lh6.googleusercontent.com",
    "lh7-rt.googleusercontent.com",
    "lh7-us.googleusercontent.com",
    "www.google.com",
}

# Hosts left pointing at the internet: embeds and live documents that only work
# as hosted services. Copying them locally would break them.
KEEP_REMOTE_HOSTS = {
    "docs.google.com",
    "drive.google.com",
    "calendar.google.com",
    "groups.google.com",
    "forms.gle",
    "goo.gl",
    "maps.google.com",
    "www.youtube.com",
    "youtube.com",
    "youtu.be",
    "player.vimeo.com",
}

CSS_URL_RE = re.compile(r"""url\(\s*(?P<q>['"]?)(?P<url>[^'")]+)(?P=q)\s*\)""")
CSS_IMPORT_RE = re.compile(r"""@import\s+(?P<q>['"])(?P<url>[^'"]+)(?P=q)""")
WS_RE = re.compile(r"\s+")
SAFE_SEGMENT_RE = re.compile(r"[^A-Za-z0-9._=@+-]+")

URL_ATTRS = [
    ("img", "src"),
    ("img", "data-src"),
    ("source", "src"),
    ("script", "src"),
    ("video", "src"),
    ("video", "poster"),
    ("audio", "src"),
    ("embed", "src"),
    ("object", "data"),
    ("input", "src"),
]
SRCSET_ATTRS = [
    ("img", "srcset"),
    ("img", "data-srcset"),
    ("source", "srcset"),
    ("link", "imagesrcset"),
]
LINK_RELS_TO_LOCALISE = {
    "stylesheet",
    "icon",
    "shortcut icon",
    "apple-touch-icon",
    "apple-touch-icon-precomposed",
    "mask-icon",
    "preload",
    "manifest",
}


def log(message: str) -> None:
    print(message, flush=True)


# --------------------------------------------------------------------------- #
# URL helpers
# --------------------------------------------------------------------------- #

def strip_tracking(url: str) -> str:
    """Drop the query parameters Google adds that do not change the response."""
    parts = urlsplit(url)
    if not parts.query:
        return url
    keep = [
        pair
        for pair in parts.query.split("&")
        if pair and pair.split("=", 1)[0] not in {"authuser", "usp", "pli", "hl", "sa"}
    ]
    query = "&".join(keep)
    return parts._replace(query=query).geturl()


def normalise_page_url(url: str) -> str:
    url, _ = urldefrag(url)
    url = strip_tracking(url)
    if url.endswith("/") and url.count("/") > 3:
        url = url[:-1]
    return url


def host_of(url: str) -> str:
    return (urlparse(url).hostname or "").lower()


def is_http(url: str) -> bool:
    return urlparse(url).scheme in ("http", "https")


def safe_segment(segment: str, limit: int = 80) -> str:
    segment = unquote(segment)
    segment = SAFE_SEGMENT_RE.sub("-", segment).strip("-") or "file"
    if len(segment) > limit:
        head, tail = segment[: limit - 9], hashlib.sha1(segment.encode()).hexdigest()[:8]
        segment = f"{head}-{tail}"
    return segment


def short_hash(value: str, length: int = 8) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()[:length]


# --------------------------------------------------------------------------- #
# Mirror state
# --------------------------------------------------------------------------- #

@dataclass
class Mirror:
    root: str
    out_dir: Path
    delay: float = 0.4
    max_pages: int = 1000
    timeout: int = 30
    verbose: bool = False

    session: requests.Session = field(default_factory=requests.Session, repr=False)
    pages: dict[str, Path] = field(default_factory=dict)      # page url -> output file
    assets: dict[str, Path] = field(default_factory=dict)     # asset url -> output file
    failures: list[tuple[str, str]] = field(default_factory=list)
    remote_links: set[str] = field(default_factory=set)
    embeds: set[str] = field(default_factory=set)
    titles: dict[str, str] = field(default_factory=dict)
    extra_hosts: set[str] = field(default_factory=set)
    extra_urls: list[str] = field(default_factory=list)
    search_docs: list[dict] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.root = normalise_page_url(self.root)
        parts = urlsplit(self.root)
        self.root_host = (parts.hostname or "").lower()
        self.root_path = parts.path.rstrip("/")
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en"})

    # -- fetching ----------------------------------------------------------- #

    def fetch(self, url: str, binary: bool = False):
        last_error = None
        for attempt in range(4):
            try:
                response = self.session.get(url, timeout=self.timeout)
                if response.status_code == 200:
                    return response
                if response.status_code in (429, 500, 502, 503, 504):
                    last_error = f"HTTP {response.status_code}"
                    time.sleep(2 ** attempt)
                    continue
                return None
            except requests.RequestException as exc:
                last_error = str(exc).split("\n")[0]
                time.sleep(2 ** attempt)
        if last_error:
            self.failures.append((url, last_error))
        return None

    # -- page / asset path mapping ------------------------------------------ #

    def is_site_page(self, url: str) -> bool:
        parts = urlsplit(url)
        if (parts.hostname or "").lower() != self.root_host:
            return False
        path = parts.path.rstrip("/")
        if path == self.root_path:
            return True
        if not path.startswith(self.root_path + "/"):
            return False
        tail = path[len(self.root_path) + 1:]
        # Google's own machinery, not site pages.
        if tail.startswith(("_/", "system/", "abuse")):
            return False
        if any(tail.endswith(ext) for ext in (".js", ".css", ".png", ".jpg", ".svg", ".ico")):
            return False
        return True

    def page_output(self, url: str) -> Path:
        path = urlsplit(url).path.rstrip("/")
        tail = path[len(self.root_path):].strip("/")
        if not tail:
            return Path("index.html")
        segments = [safe_segment(s) for s in tail.split("/")]
        return Path(*segments) / "index.html"

    def asset_output(self, url: str) -> Path:
        parts = urlsplit(url)
        host = safe_segment(parts.hostname or "unknown", limit=60)
        raw_segments = [s for s in parts.path.split("/") if s]
        segments = [safe_segment(s) for s in raw_segments] or ["file"]
        name = segments.pop()
        if parts.query:
            stem, dot, ext = name.rpartition(".")
            token = short_hash(parts.query)
            name = f"{stem}-{token}{dot}{ext}" if dot else f"{name}-{token}"
        return Path("assets") / host / Path(*segments) / name if segments else Path("assets") / host / name

    def relative(self, from_file: Path, to_file: Path) -> str:
        rel = os.path.relpath(self.out_dir / to_file, (self.out_dir / from_file).parent)
        return Path(rel).as_posix()

    # -- assets ------------------------------------------------------------- #

    def want_local(self, url: str) -> bool:
        if not is_http(url):
            return False
        host = host_of(url)
        if host in KEEP_REMOTE_HOSTS:
            return False
        if host in self.extra_hosts:
            return True
        return host in LOCALISE_HOSTS or host == self.root_host

    def ensure_asset(self, url: str) -> Path | None:
        """Download an asset once and return its path inside the output folder."""
        url = strip_tracking(urldefrag(url)[0])
        if url in self.assets:
            return self.assets[url]
        if not self.want_local(url):
            return None

        response = self.fetch(url, binary=True)
        if response is None:
            return None

        target = self.asset_output(url)
        content_type = response.headers.get("Content-Type", "").split(";")[0].strip()
        if not target.suffix:
            guessed = mimetypes.guess_extension(content_type or "") or ""
            if content_type == "text/css":
                guessed = ".css"
            elif content_type in ("text/javascript", "application/javascript"):
                guessed = ".js"
            target = target.with_name(target.name + guessed)

        full = self.out_dir / target
        full.parent.mkdir(parents=True, exist_ok=True)
        self.assets[url] = target

        if content_type == "text/css" or target.suffix == ".css":
            css = self.rewrite_css(response.text, base_url=url, css_file=target)
            full.write_text(css, encoding="utf-8")
        else:
            full.write_bytes(response.content)

        if self.verbose:
            log(f"    asset  {target}")
        return target

    def rewrite_css(self, css: str, base_url: str, css_file: Path) -> str:
        """Localise url() and @import targets inside a stylesheet."""

        def replace_url(match: re.Match) -> str:
            raw = match.group("url").strip()
            if raw.startswith(("data:", "#")):
                return match.group(0)
            absolute = urljoin(base_url, raw)
            target = self.ensure_asset(absolute)
            if target is None:
                return f"url({absolute})"
            return f"url({self.relative(css_file, target)})"

        def replace_import(match: re.Match) -> str:
            raw = match.group("url").strip()
            absolute = urljoin(base_url, raw)
            target = self.ensure_asset(absolute)
            if target is None:
                return f'@import "{absolute}"'
            return f'@import "{self.relative(css_file, target)}"'

        css = CSS_IMPORT_RE.sub(replace_import, css)
        return CSS_URL_RE.sub(replace_url, css)

    # -- HTML rewriting ----------------------------------------------------- #

    def rewrite_page(self, soup: BeautifulSoup, page_url: str, page_file: Path,
                     queue: deque, options: argparse.Namespace) -> None:
        for tag in soup.find_all("base"):
            tag.decompose()

        # Links between pages of the site.
        for anchor in soup.find_all("a", href=True):
            href = anchor["href"].strip()
            if href.startswith(("#", "mailto:", "tel:", "javascript:")):
                continue
            absolute = urljoin(page_url, href)
            if not is_http(absolute):
                continue
            target_url, fragment = urldefrag(absolute)
            target_url = normalise_page_url(target_url)
            if self.is_site_page(target_url):
                target_file = self.page_output(target_url)
                rel = self.relative(page_file, target_file)
                # Serve directory URLs so links stay clean on a real web server.
                rel = rel[: -len("index.html")] if rel.endswith("index.html") else rel
                anchor["href"] = (rel or "./") + (f"#{fragment}" if fragment else "")
                if target_url not in self.pages and target_url not in queue:
                    queue.append(target_url)
            else:
                anchor["target"] = anchor.get("target", "_blank")
                anchor["rel"] = anchor.get("rel", "noopener")
                self.remote_links.add(absolute)

        # Plain single-URL attributes.
        for tag_name, attr in URL_ATTRS:
            for tag in soup.find_all(tag_name):
                self.localise_attr(tag, attr, page_url, page_file)

        # Stylesheets, icons, preloads, manifest.
        for tag in soup.find_all("link", href=True):
            rels = {r.lower() for r in (tag.get("rel") or [])}
            if rels & LINK_RELS_TO_LOCALISE:
                self.localise_attr(tag, "href", page_url, page_file)

        # Responsive image candidates.
        for tag_name, attr in SRCSET_ATTRS:
            for tag in soup.find_all(tag_name):
                self.localise_srcset(tag, attr, page_url, page_file)

        # Social preview images.
        for tag in soup.find_all("meta", content=True):
            key = (tag.get("property") or tag.get("name") or "").lower()
            if key in ("og:image", "twitter:image", "og:image:secure_url"):
                self.localise_attr(tag, "content", page_url, page_file)

        # Inline style attributes and <style> blocks.
        for tag in soup.find_all(style=True):
            tag["style"] = self.rewrite_css(tag["style"], page_url, page_file)
        for tag in soup.find_all("style"):
            if tag.string:
                tag.string.replace_with(
                    self.rewrite_css(tag.string, page_url, page_file)
                )

        # Embeds stay on their live host; note them for the report.
        for tag in soup.find_all("iframe", src=True):
            absolute = urljoin(page_url, tag["src"].strip())
            if is_http(absolute):
                tag["src"] = absolute
                self.embeds.add(absolute)

        if not options.keep_canonical:
            for tag in soup.find_all("link", rel=lambda v: v and "canonical" in v):
                tag.decompose()
            for tag in soup.find_all("meta", property="og:url"):
                tag.decompose()

        if not options.keep_google_footer:
            self.strip_google_footer(soup)

        if options.search == "hide":
            self.hide_search(soup)
        elif options.search == "local":
            self.inject_local_search(soup, page_file)

    def localise_attr(self, tag, attr: str, page_url: str, page_file: Path) -> None:
        raw = (tag.get(attr) or "").strip()
        if not raw or raw.startswith("data:"):
            return
        absolute = urljoin(page_url, raw)
        if not is_http(absolute):
            return
        target = self.ensure_asset(absolute)
        if target is None:
            if host_of(absolute) not in KEEP_REMOTE_HOSTS:
                self.remote_links.add(absolute)
            tag[attr] = absolute
            return
        tag[attr] = self.relative(page_file, target)

    def localise_srcset(self, tag, attr: str, page_url: str, page_file: Path) -> None:
        raw = (tag.get(attr) or "").strip()
        if not raw:
            return
        rewritten = []
        for candidate in raw.split(","):
            candidate = candidate.strip()
            if not candidate or candidate.startswith("data:"):
                continue
            bits = candidate.split()
            url, descriptor = bits[0], " ".join(bits[1:])
            absolute = urljoin(page_url, url)
            target = self.ensure_asset(absolute) if is_http(absolute) else None
            local = self.relative(page_file, target) if target else absolute
            rewritten.append(f"{local} {descriptor}".strip())
        if rewritten:
            tag[attr] = ", ".join(rewritten)

    def strip_google_footer(self, soup: BeautifulSoup) -> None:
        """Remove Google's own 'Report abuse / Page details' site footer."""
        markers = re.compile(
            r"(sites\.google\.com/(new|abuse)|/abuse\?|support\.google\.com/sites"
            r"|accounts\.google\.com)",
            re.I,
        )
        labels = {"report abuse", "page details", "google sites", "made with google sites"}
        for anchor in list(soup.find_all("a", href=True)):
            if getattr(anchor, "decomposed", False) or anchor.parent is None:
                continue  # already removed with an earlier footer block
            text = anchor.get_text(" ", strip=True).lower()
            if not (markers.search(anchor.get("href") or "") or text in labels):
                continue
            # Climb to the smallest wrapper that is clearly just the footer:
            # no headings, few links, and little text of its own.
            victim = anchor
            node = anchor
            for _ in range(6):
                node = node.parent
                if node is None or node.name in ("body", "html", "[document]"):
                    break
                if node.find(["h1", "h2", "h3", "h4", "main"]):
                    break
                if len(node.find_all("a")) > 4:
                    break
                if len(node.get_text(" ", strip=True)) > 300:
                    break
                victim = node
            victim.decompose()

    def hide_search(self, soup: BeautifulSoup) -> None:
        for tag in soup.select('[aria-label*="earch"], input[type="search"]'):
            tag.decompose()

    def inject_local_search(self, soup: BeautifulSoup, page_file: Path) -> None:
        head = soup.head or soup.find("head")
        body = soup.body or soup.find("body")
        if head is None or body is None:
            return
        css = soup.new_tag("link", rel="stylesheet")
        css["href"] = self.relative(page_file, Path("selfhost-search.css"))
        head.append(css)
        script = soup.new_tag("script", defer="")
        script["src"] = self.relative(page_file, Path("selfhost-search.js"))
        script["data-index"] = self.relative(page_file, Path("search-index.json"))
        body.append(script)

    # -- crawl -------------------------------------------------------------- #

    def page_text(self, soup: BeautifulSoup) -> str:
        clone = BeautifulSoup(str(soup), "html.parser")
        for tag in clone(["script", "style", "noscript", "nav", "header", "footer"]):
            tag.decompose()
        for comment in clone.find_all(string=lambda s: isinstance(s, Comment)):
            comment.extract()
        return WS_RE.sub(" ", clone.get_text(" ", strip=True))

    def run(self, options: argparse.Namespace) -> None:
        if self.out_dir.exists():
            shutil.rmtree(self.out_dir)
        self.out_dir.mkdir(parents=True)

        queue: deque[str] = deque(
            [self.root] + [normalise_page_url(u) for u in self.extra_urls]
        )
        seen: set[str] = set()

        while queue and len(self.pages) < self.max_pages:
            url = queue.popleft()
            if url in seen:
                continue
            seen.add(url)

            response = self.fetch(url)
            if response is None:
                log(f"  !! could not fetch {url}")
                continue

            soup = BeautifulSoup(response.text, "html.parser")
            page_file = self.page_output(url)
            title = soup.title.get_text(strip=True) if soup.title else page_file.parent.name
            self.titles[url] = title
            log(f"  page   {page_file}  ({title})")

            text = self.page_text(soup)
            self.rewrite_page(soup, url, page_file, queue, options)

            full = self.out_dir / page_file
            full.parent.mkdir(parents=True, exist_ok=True)
            full.write_text(str(soup), encoding="utf-8")
            self.pages[url] = page_file

            href = "/" + page_file.parent.as_posix().strip(".").strip("/")
            self.search_docs.append(
                {
                    "title": title,
                    "url": (href.rstrip("/") + "/") if href != "/" else "/",
                    "text": text[:4000],
                }
            )

            if self.delay:
                time.sleep(self.delay)

        if len(self.pages) >= self.max_pages and queue:
            self.failures.append(
                (self.root, f"stopped at --max-pages {self.max_pages}; {len(queue)} URLs left")
            )

    # -- extra files -------------------------------------------------------- #

    def write_search_assets(self) -> None:
        (self.out_dir / "search-index.json").write_text(
            json.dumps(self.search_docs, ensure_ascii=False), encoding="utf-8"
        )
        (self.out_dir / "selfhost-search.css").write_text(SEARCH_CSS, encoding="utf-8")
        (self.out_dir / "selfhost-search.js").write_text(SEARCH_JS, encoding="utf-8")

    def write_extras(self) -> None:
        (self.out_dir / ".nojekyll").write_text("", encoding="utf-8")
        (self.out_dir / "404.html").write_text(NOT_FOUND_HTML, encoding="utf-8")

    def write_report(self) -> None:
        lines = [
            "# Mirror report",
            "",
            f"- Source: <{self.root}>",
            f"- Copied: {time.strftime('%Y-%m-%d %H:%M:%S %Z')}",
            f"- Pages: {len(self.pages)}",
            f"- Local files downloaded: {len(self.assets)}",
            "",
            "## Pages",
            "",
        ]
        for url, path in sorted(self.pages.items(), key=lambda kv: str(kv[1])):
            lines.append(f"- `{path.parent.as_posix()}/` — {self.titles.get(url, '')}")

        if self.embeds:
            lines += [
                "",
                "## Embedded content still loaded from Google",
                "",
                "These are iframes (Docs, Sheets, Forms, Maps, YouTube, Calendar).",
                "They keep working, but only while the original item stays shared.",
                "Check the sharing settings on each one.",
                "",
            ]
            lines += [f"- <{url}>" for url in sorted(self.embeds)]

        if self.remote_links:
            drive = sorted(
                u for u in self.remote_links
                if host_of(u) in ("drive.google.com", "docs.google.com")
            )
            if drive:
                lines += [
                    "",
                    "## Google Drive links and attachments",
                    "",
                    "Files hosted on Drive were not copied. Download each one, put it in",
                    "the output folder, and change the link if you want the copy to be",
                    "self-contained.",
                    "",
                ]
                lines += [f"- <{url}>" for url in drive]
            other = sorted(u for u in self.remote_links if u not in set(drive))
            if other:
                lines += ["", "## Other external links (left unchanged)", ""]
                lines += [f"- <{url}>" for url in other[:200]]
                if len(other) > 200:
                    lines.append(f"- …and {len(other) - 200} more")

        if self.failures:
            lines += ["", "## Failures", ""]
            lines += [f"- `{url}` — {reason}" for url, reason in self.failures]
        else:
            lines += ["", "## Failures", "", "None."]

        (self.out_dir / "MIRROR-REPORT.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


# --------------------------------------------------------------------------- #
# Injected client-side search
# --------------------------------------------------------------------------- #

SEARCH_CSS = """\
.shs-overlay{position:fixed;inset:0;z-index:99999;background:rgba(32,33,36,.55);
  display:none;font-family:Roboto,Arial,sans-serif}
.shs-overlay.shs-open{display:block}
.shs-panel{background:#fff;max-width:720px;margin:8vh auto 0;border-radius:8px;
  box-shadow:0 4px 24px rgba(0,0,0,.3);overflow:hidden}
.shs-bar{display:flex;align-items:center;gap:8px;padding:12px 16px;
  border-bottom:1px solid #e0e0e0}
.shs-bar input{flex:1;border:0;outline:0;font-size:18px;padding:8px 0;color:#202124}
.shs-bar button{border:0;background:transparent;cursor:pointer;font-size:20px;
  line-height:1;color:#5f6368;padding:4px 8px}
.shs-results{max-height:62vh;overflow:auto;margin:0;padding:0;list-style:none}
.shs-results li{border-bottom:1px solid #f1f3f4}
.shs-results a{display:block;padding:14px 16px;text-decoration:none;color:#202124}
.shs-results a:hover,.shs-results a:focus{background:#f1f3f4}
.shs-title{font-size:15px;font-weight:500;color:#1a73e8}
.shs-snippet{font-size:13px;color:#5f6368;margin-top:3px;line-height:1.45}
.shs-empty{padding:18px 16px;color:#5f6368;font-size:14px}
.shs-fab{position:fixed;right:18px;bottom:18px;z-index:9998;width:48px;height:48px;
  border-radius:50%;border:0;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.28);
  cursor:pointer;font-size:20px;color:#5f6368}
"""

SEARCH_JS = """\
/* Client-side search for a self-hosted copy of a Google Site.
   The original search box talks to Google's servers, so it cannot work here.
   This replaces it with a search over search-index.json. */
(function () {
  var script = document.querySelector('script[data-index]');
  if (!script) return;
  var indexUrl = new URL(script.getAttribute('data-index'), location.href);
  var siteRoot = new URL('.', indexUrl);
  var docs = null;

  var overlay = document.createElement('div');
  overlay.className = 'shs-overlay';
  overlay.innerHTML =
    '<div class="shs-panel" role="dialog" aria-label="Search this site">' +
    '<div class="shs-bar"><input type="search" placeholder="Search this site" ' +
    'aria-label="Search this site"><button type="button" aria-label="Close">&times;</button></div>' +
    '<ul class="shs-results"></ul></div>';
  document.body.appendChild(overlay);

  var input = overlay.querySelector('input');
  var list = overlay.querySelector('.shs-results');

  function close() { overlay.classList.remove('shs-open'); }
  function open() {
    overlay.classList.add('shs-open');
    input.focus();
    if (docs === null) {
      docs = [];
      fetch(indexUrl).then(function (r) { return r.json(); })
        .then(function (data) { docs = data; render(input.value); })
        .catch(function () { list.innerHTML = '<li class="shs-empty">Search index not found.</li>'; });
    }
  }

  function snippet(text, terms) {
    var lower = text.toLowerCase(), at = -1, i;
    for (i = 0; i < terms.length; i++) {
      at = lower.indexOf(terms[i]);
      if (at > -1) break;
    }
    if (at < 0) return text.slice(0, 150);
    var start = Math.max(0, at - 60);
    return (start ? '…' : '') + text.slice(start, start + 170) + '…';
  }

  function score(doc, terms) {
    var title = doc.title.toLowerCase(), body = doc.text.toLowerCase(), total = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (!t) continue;
      if (title.indexOf(t) > -1) total += 10;
      var hits = body.split(t).length - 1;
      if (!hits && title.indexOf(t) < 0) return 0;
      total += Math.min(hits, 8);
    }
    return total;
  }

  function render(query) {
    var terms = query.toLowerCase().split(/\\s+/).filter(Boolean);
    if (!terms.length) { list.innerHTML = ''; return; }
    var hits = docs.map(function (d) { return { doc: d, s: score(d, terms) }; })
      .filter(function (h) { return h.s > 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, 25);
    if (!hits.length) {
      list.innerHTML = '<li class="shs-empty">No pages match that.</li>';
      return;
    }
    list.innerHTML = hits.map(function (h) {
      var href = new URL(h.doc.url.replace(/^\\//, ''), siteRoot).href;
      return '<li><a href="' + href + '"><div class="shs-title">' +
        esc(h.doc.title) + '</div><div class="shs-snippet">' +
        esc(snippet(h.doc.text, terms)) + '</div></a></li>';
    }).join('');
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  input.addEventListener('input', function () { render(input.value); });
  overlay.querySelector('button').addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  // Take over the original search control if the theme still has one.
  var controls = document.querySelectorAll(
    '[aria-label*="earch"], [title*="earch"], input[type="search"]');
  var wired = 0;
  Array.prototype.forEach.call(controls, function (el) {
    if (overlay.contains(el)) return;
    wired++;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      open();
    }, true);
    el.addEventListener('focus', open, true);
  });

  // Nothing to take over: add our own button so search still exists.
  if (!wired) {
    var fab = document.createElement('button');
    fab.className = 'shs-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Search this site');
    fab.textContent = '\\u2315';
    fab.addEventListener('click', open);
    document.body.appendChild(fab);
  }
})();
"""

NOT_FOUND_HTML = """\
<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found</title>
<style>body{font:16px/1.6 Roboto,Arial,sans-serif;color:#202124;margin:0;
padding:15vh 24px;text-align:center}a{color:#1a73e8}</style></head>
<body><h1>Page not found</h1>
<p>That page does not exist on this site.</p>
<p><a href="/">Go to the home page</a></p></body></html>
"""


# --------------------------------------------------------------------------- #
# Command line
# --------------------------------------------------------------------------- #

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("url", help="published URL of the Google Site")
    parser.add_argument("-o", "--out", default="site", help="output folder (default: site)")
    parser.add_argument("--delay", type=float, default=0.4,
                        help="seconds to wait between pages (default: 0.4)")
    parser.add_argument("--max-pages", type=int, default=1000,
                        help="safety limit on pages (default: 1000)")
    parser.add_argument("--timeout", type=int, default=30, help="per-request timeout in seconds")
    parser.add_argument("--search", choices=("local", "keep", "hide"), default="local",
                        help="what to do about the search box: replace it with a "
                             "client-side search (local, the default), leave Google's "
                             "broken one in place (keep), or remove it (hide)")
    parser.add_argument("--keep-google-footer", action="store_true",
                        help="keep Google's 'Report abuse / Page details' footer")
    parser.add_argument("--keep-canonical", action="store_true",
                        help="keep the canonical link pointing at sites.google.com")
    parser.add_argument("--extra-url", action="append", default=[], metavar="URL",
                        help="also copy this page, even if nothing links to it "
                             "(repeat the flag for more pages)")
    parser.add_argument("--include-host", action="append", default=[], metavar="HOST",
                        help="also download files from this host instead of leaving "
                             "them remote (repeat the flag for more hosts)")
    parser.add_argument("-v", "--verbose", action="store_true", help="list every file downloaded")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    options = parse_args(argv)
    out_dir = Path(options.out).resolve()

    mirror = Mirror(
        root=options.url,
        out_dir=out_dir,
        delay=options.delay,
        max_pages=options.max_pages,
        timeout=options.timeout,
        verbose=options.verbose,
        extra_hosts={h.strip().lower() for h in options.include_host},
        extra_urls=list(options.extra_url),
    )

    log(f"Mirroring {mirror.root}")
    log(f"Output    {out_dir}")
    mirror.run(options)

    if not mirror.pages:
        log("\nNothing was copied. Check the URL is the published address and is public.")
        return 1

    if options.search == "local":
        mirror.write_search_assets()
    mirror.write_extras()
    mirror.write_report()

    log("")
    log(f"Done: {len(mirror.pages)} pages, {len(mirror.assets)} files.")
    if mirror.failures:
        log(f"{len(mirror.failures)} problem(s) — see MIRROR-REPORT.md")
    log("")
    log(f"Preview it:  python3 -m http.server --directory {options.out} 8000")
    log("Then open:   http://localhost:8000/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
