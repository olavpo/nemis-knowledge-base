#!/usr/bin/env python3
"""Download the knowledge base PDFs out of Google Drive.

The job aids and handbooks the site links to live in Drive and are not copied
by mirror_google_site.py. This downloads the ones listed in pdf-sources.json so
they can be committed alongside the site and served from it, leaving the site
self-contained if a Drive share ever lapses.

    python3 tools/fetch_pdfs.py                   # into incoming-pdfs/
    python3 tools/fetch_pdfs.py --out assets/pdfs
    python3 tools/fetch_pdfs.py --only computer-enrol-bulk.pdf --force

Files already present are skipped, so a re-run after a partial failure only
fetches what is missing. Requires network access to Google Drive: run it
somewhere that has it.
"""

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import requests
except ImportError:  # pragma: no cover - message is the point
    sys.exit("Missing dependency. Run:\n\n    python3 -m pip install requests\n")

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "pdf-sources.json"
DRIVE_URL = "https://drive.usercontent.google.com/download"

PDF_MAGIC = b"%PDF-"
# Drive's "we could not scan this file" interstitial submits a form back to
# itself. Any HTML at all means we were served a page rather than the file.
HTML_START_RE = re.compile(rb"^\s*(<!doctype|<html)", re.I)
CONFIRM_FORM_RE = re.compile(rb"""name=["']confirm["']\s+value=["']([^"']+)""", re.I)


def classify(head: bytes, status: int) -> str | None:
    """Return None if this looks like a PDF, else why it does not."""
    if status == 404:
        return "not found (404) — wrong ID, or the file was deleted"
    if head.startswith(PDF_MAGIC):
        return None
    if HTML_START_RE.match(head):
        return (f"Drive returned an HTML page, not a PDF (HTTP {status}) — "
                "the file is probably not shared, or needs sign-in")
    if status >= 400:
        return f"HTTP {status}"
    return "the response does not start with %PDF-"


def download(session, drive_id: str, dest: Path, base_url: str = DRIVE_URL) -> None:
    """Write one Drive file to dest, or raise RuntimeError saying why not.

    Drive may answer with a confirmation page instead of the file. That is
    retried once with the form's own confirm value; a page returned the second
    time is a real failure, not something to write to disk.
    """
    params = {"id": drive_id, "export": "download"}

    for attempt in (1, 2):
        response = session.get(base_url, params=params, stream=True, timeout=60)
        head = response.raw.read(len(PDF_MAGIC) + 512, decode_content=True)
        problem = classify(head, response.status_code)

        if problem is None:
            # Only now is a file created, so a failure leaves no stub behind.
            dest.parent.mkdir(parents=True, exist_ok=True)
            partial = dest.with_suffix(dest.suffix + ".part")
            try:
                with partial.open("wb") as handle:
                    handle.write(head)
                    for chunk in response.iter_content(chunk_size=64 * 1024):
                        handle.write(chunk)
                partial.replace(dest)
            except BaseException:
                partial.unlink(missing_ok=True)
                raise
            return

        confirm = CONFIRM_FORM_RE.search(head)
        if attempt == 1 and confirm and response.status_code == 200:
            params["confirm"] = confirm.group(1).decode()
            continue

        raise RuntimeError(problem)


def fetch_all(sources: list[dict], out_dir: Path, base_url: str = DRIVE_URL,
              force: bool = False, session=None
              ) -> tuple[list[str], list[tuple[str, str]]]:
    """Download every source. Returns (files written, [(file, reason)] failed)."""
    session = session or requests.Session()
    written: list[str] = []
    problems: list[tuple[str, str]] = []

    for entry in sources:
        name = entry["file"]
        dest = out_dir / name
        if dest.exists() and not force:
            print(f"  skip      {name}")
            continue
        try:
            download(session, entry["drive_id"], dest, base_url=base_url)
        except (RuntimeError, requests.RequestException) as error:
            print(f"  FAILED    {name}: {error}")
            problems.append((name, str(error)))
        else:
            print(f"  {dest.stat().st_size / 1024:7.0f} KB  {name}")
            written.append(name)

    return written, problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--out", default="incoming-pdfs", type=Path,
                        help="where to write the files (default: incoming-pdfs)")
    parser.add_argument("--only", action="append", metavar="FILE",
                        help="fetch just this file; repeatable")
    parser.add_argument("--force", action="store_true",
                        help="download again even if the file is already there")
    parser.add_argument("--manifest", default=MANIFEST, type=Path,
                        help=f"source list (default: {MANIFEST.name})")
    options = parser.parse_args(argv)

    sources = json.loads(options.manifest.read_text(encoding="utf-8"))
    if options.only:
        wanted = set(options.only)
        sources = [e for e in sources if e["file"] in wanted]
        unknown = wanted - {e["file"] for e in sources}
        if unknown:
            return print(f"Not in the manifest: {', '.join(sorted(unknown))}") or 2
    if not sources:
        return print("Nothing to fetch.") or 2

    print(f"Fetching {len(sources)} file(s) into {options.out}/\n")
    written, problems = fetch_all(sources, options.out, force=options.force)

    print(f"\n{len(written)} downloaded, {len(problems)} failed.")
    if problems:
        print("\nCheck the sharing setting on each of these in Drive — it has "
              "to be readable by anyone with the link:")
        for name, reason in problems:
            print(f"  - {name}: {reason}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
