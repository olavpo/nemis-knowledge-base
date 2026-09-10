#!/usr/bin/env python3
"""Check tools/fetch_pdfs.py against a local stand-in for Google Drive.

Drive does not always answer a download URL with the file. It can answer with
an HTML page instead: a confirmation form for a file it has not virus-scanned,
or a permission error for a file that is not shared. The first has to be
retried, the second has to be reported rather than written to disk as a .pdf
full of HTML.

    python3 tests/test_fetch_pdfs.py

No network access is needed.
"""

import functools
import http.server
import json
import socket
import socketserver
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import fetch_pdfs  # noqa: E402

failures = []

PDF_BYTES = b"%PDF-1.4\n% a very small pretend PDF\n%%EOF\n"

CONFIRM_PAGE = b"""<!doctype html><html><body>
<form id="download-form" action="/download" method="get">
<input type="hidden" name="confirm" value="t">
</form></body></html>"""

DENIED_PAGE = b"""<!doctype html><html><body>
<p>You need access. Ask for access, or switch to an account with access.</p>
</body></html>"""


def check(condition, label):
    print(("  ok   " if condition else "  FAIL ") + label)
    if not condition:
        failures.append(label)


class DriveStub(http.server.BaseHTTPRequestHandler):
    """Answers like Drive: a file, a confirmation page, a denial, or a 404."""

    def log_message(self, *args):
        pass

    def do_GET(self):
        from urllib.parse import parse_qs, urlparse

        query = parse_qs(urlparse(self.path).query)
        file_id = (query.get("id") or [""])[0]
        confirmed = "confirm" in query

        if file_id == "plain":
            body, status = PDF_BYTES, 200
        elif file_id == "gated":
            body, status = (PDF_BYTES, 200) if confirmed else (CONFIRM_PAGE, 200)
        elif file_id == "denied":
            body, status = DENIED_PAGE, 403
        elif file_id == "unshared":
            # Drive answers 200 with an HTML page, not an error status.
            body, status = DENIED_PAGE, 200
        else:
            body, status = b"not found", 404

        self.send_response(status)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main():
    port = free_port()
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", port), DriveStub)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}/download"

    out = Path(tempfile.mkdtemp(prefix="fetch-pdfs-test-")) / "incoming-pdfs"
    sources = [
        {"file": "plain.pdf", "drive_id": "plain"},
        {"file": "gated.pdf", "drive_id": "gated"},
        {"file": "denied.pdf", "drive_id": "denied"},
        {"file": "unshared.pdf", "drive_id": "unshared"},
        {"file": "missing.pdf", "drive_id": "nosuchfile"},
    ]

    print(f"Fetching from {base}\n")
    written, problems = fetch_pdfs.fetch_all(sources, out, base_url=base)

    print("Checks:")
    # --- the happy path ----------------------------------------------------- #
    check((out / "plain.pdf").is_file(), "file served directly is written")
    check((out / "plain.pdf").read_bytes() == PDF_BYTES,
          "file served directly is written byte for byte")

    # --- Drive's confirmation page ------------------------------------------ #
    check((out / "gated.pdf").is_file(),
          "file behind a confirmation page is written")
    check((out / "gated.pdf").read_bytes() == PDF_BYTES,
          "confirmation page is not mistaken for the file")

    # --- the failures ------------------------------------------------------- #
    for name in ("denied.pdf", "unshared.pdf", "missing.pdf"):
        check(not (out / name).exists(), f"nothing written for {name}")
    check({p[0] for p in problems} == {"denied.pdf", "unshared.pdf", "missing.pdf"},
          f"three failures reported (got {sorted(p[0] for p in problems)})")
    check(set(written) == {"plain.pdf", "gated.pdf"},
          f"two files reported written (got {sorted(written)})")
    check(any("access" in reason.lower() or "html" in reason.lower()
              for name, reason in problems if name == "unshared.pdf"),
          "an unshared file is reported as an access problem, not a 200 success")

    # --- re-running --------------------------------------------------------- #
    written_again, _ = fetch_pdfs.fetch_all(sources, out, base_url=base)
    check(written_again == [], "a second run skips files already downloaded")
    check((out / "plain.pdf").is_file(), "skipping leaves the file in place")

    written_forced, _ = fetch_pdfs.fetch_all(sources, out, base_url=base, force=True)
    check(set(written_forced) == {"plain.pdf", "gated.pdf"},
          "--force downloads again")

    # --- the shipped manifest ----------------------------------------------- #
    manifest = json.loads((ROOT / "tools" / "pdf-sources.json").read_text())
    check(len(manifest) == 13, f"manifest lists 13 files (got {len(manifest)})")
    check(all(e.get("file", "").endswith(".pdf") and e.get("drive_id")
              for e in manifest), "every manifest entry has a file and a drive_id")
    names = [e["file"] for e in manifest]
    check(len(set(names)) == len(names), "manifest has no duplicate file names")

    httpd.shutdown()
    print()
    if failures:
        print(f"{len(failures)} check(s) failed:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
