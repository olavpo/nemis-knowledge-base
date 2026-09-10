# DNEMIS Knowledge Base — rebuild as a static site

Design, 2026-09-10.

Move <https://sites.google.com/view/nemisknowledgebase> off Google Sites and
into a Git repository of Markdown files that build to a static site. Same look,
same content, same URLs. Editors work in Markdown and publish by pushing.

## Why not mirror the site

`mirror_google_site.py` copies the published HTML faithfully, but the copy is
machine-generated markup nobody can edit, and the content stays authored in
Google Sites. That satisfies "self-hosted" and fails "easy to change". The
mirror keeps a role — it is how the content is imported, and it stays available
to re-check the copy against the original — but it is not the publishing
pipeline.

## What the site is

Sixteen pages: a home page, a manuals page, a "watch all videos" page, and
twelve guide pages. Every page's real content is a hand-written HTML+CSS block
that Google Sites stores as escaped markup in a `data-code` attribute and
renders in an iframe. That CSS is good and is the source of the site's look; it
is copied into the rebuild rather than re-derived.

The three index pages are all views of the same twelve guides. Today each view
repeats the guide list by hand, and the copies have drifted:

- `Enrol-learners-individually` shows an empty video duration.
- Three job aids show no page count or file size; the other nine do.
- `mobile-enrol-staff` is tagged *Video + Job aid* on the home page but
  *Job aid* only on the "Do this next" card of `mobile-install-login`. It has a
  video, so the card is wrong.

Deriving the views from the guides removes this class of error.

## Content model

One Markdown file per guide is the only thing an editor touches.

```yaml
---
title: Install the app and log in
section: mobile                    # mobile | computer
order: 1
video: { id: 1172389199, minutes: 4 }
jobaid: mobile-install-login.pdf
next: [mobile-enrol-individually, mobile-enrol-staff]
---
After reviewing these resources, you will be able to download and install the
DNEMIS app on your Android phone, connect it to the DNEMIS server, and log in
with your username and password.
```

Everything else is derived:

- **Home page cards** — grouped by `section`, sorted by `order`.
- **Tags** — `Video` if `video:` is present, `Job aid` if `jobaid:` is. Never
  typed, so they cannot disagree with the page.
- **Watch all videos** — every guide with a `video:`.
- **PDF size and page count** — read from the committed PDF at build time.

Adding a guide is adding one file; it appears everywhere it belongs. Deleting
one removes it everywhere.

`video.minutes` and the description stay hand-written: neither can be read from
a file. `next:` stays hand-picked because the ordering is curated — *Change
your password* points back to *Log in and navigate*, not forward.

Manuals are whole handbooks rather than per-task guides, so they live in
`_data/manuals.yaml`, not in `content/guides/`.

## Repository layout

```
content/
  index.md                 hero text; cards generated
  manuals.md               intro text; cards from _data/manuals.yaml
  watch-all-videos.md      intro text; grid generated
  guides/                  twelve guide files
_data/
  site.yaml                title, nav, logo, footer
  manuals.yaml             handbook list
_includes/
  base.njk                 header, nav, footer — written once
  card.njk, video.njk      card and video markup — written once
assets/
  style.css                consolidated from the three embed copies
  logo.png                 Federal Ministry of Education
  pdfs/                    job aids and handbooks, committed
tools/
  import_from_mirror.py    one-time import from site/ into content/
  fetch_pdfs.py            download the Drive job aids; runs on the host
mirror_google_site.py      stays at the root, with refresh.sh and tests/
.eleventy.js
.github/workflows/
  pages.yml                build and publish to GitHub Pages
  rsync.yml                build and rsync to a server
```

## Build

Eleventy. Markdown plus Nunjucks templates, no client-side framework. Output is
a plain folder of static files that works at a domain root, in a subdirectory,
or opened off disk — so the hosting decision stays open.

Search uses Pagefind, which indexes at build time and runs in the browser. It
replaces the Google Sites search box, which cannot work off Google.

The build fails if `next:` names a guide that does not exist, if `jobaid:`
names a missing PDF, or if a `section` is not `mobile` or `computer`. Broken
internal links cannot reach production.

## Look

The palette, card, tag, section-label and video-grid rules come from the
existing embeds:

| | |
|---|---|
| Green | `#2d6a4f` |
| Page background | `#f4f6f4` |
| Cards | white, 1px `#e0e0e0`, 8px radius |
| Tag — video | `#e8f4f0` on `#1e5c3e` |
| Tag — job aid | `#f0f4ff` on `#3a5aad` |

The three near-identical copies of these rules become one `style.css`. The
Google Sites chrome — logo, title, top nav (Home · Manuals · Watch all videos),
hero — is rebuilt in that stylesheet to match.

`Google Sans` is not publicly available; the existing fallback stack
(`Segoe UI`, Arial, sans-serif) is kept and no webfont is loaded.

The `postMessage` iframe-height scripts in the embeds are dropped. They exist
only because Google Sites renders the block in an iframe. Nothing here does.

## URLs

Guide URLs are preserved except for two that break the `<device>-<task>`
convention the other ten follow:

| Was | Becomes |
|---|---|
| `Enrol-learners-individually` | `mobile-enrol-individually` |
| `Enrol-an-existing-staff-member` | `computer-enrol-existing-staff` |

Both old URLs get a redirecting stub page so existing links keep working.

## Dependencies on Google after the move

Job aid PDFs and handbooks are committed to the repository and embedded from
there, so they survive a lapsed Drive share.

Videos stay on Vimeo — not Google, and self-hosting video is a separate
problem. Their "↓ Download video" links keep pointing at Google Drive, decided
deliberately: Vimeo cannot serve a download from an embedded player at all,
only from the video's own page on vimeo.com, and only on a paid plan with
download enabled per video. The API returns direct file URLs, but they are
signed and expire, so a static page cannot hold one.

So the nine Drive download links are the one remaining Google dependency. The
README records it, along with the consequence: each link breaks silently if its
Drive share lapses. Re-hosting the files on the server is the fix if that ever
happens, and is out of scope here.

Google Analytics (`G-JDSWLM634F`) and the Google cookie banner are dropped. Add
analytics back deliberately if wanted.

## Prerequisites

The sandbox cannot reach Google, so two steps run on the host:

1. `python3 mirror_google_site.py https://sites.google.com/view/nemisknowledgebase`
   — done; `site/` holds all 16 pages.
2. Download the 13 Drive files into `incoming-pdfs/`. `tools/fetch_pdfs.py`
   takes the ID list below and does this; it must run on the host.

| File | Drive ID |
|---|---|
| Handbook for States | `1oZZFto5uFWeb3N_Xsi4ZhGf6dB1T0G6K` |
| mobile-install-login | `1Un_rYP7-b2aiY6jcePfbCsWdG-dfdpSA` |
| mobile-enrol-individually | `1t85EDEo69TCb5_01JPv1Y_C4ia1qwFqq` |
| mobile-enrol-staff | `1ez5SqgjaPslncBFvpSVaacsgOSPTKxSR` |
| mobile-classroom-data | `1a_YwtgEUam1mOP8G0grthf4R15aNr66i` |
| computer-login-navigate | `16bpks1KaH_Ep97d0BucIeZF-UsJHj3Wr` |
| computer-census-data | `1upzYv-JCxJZWjEXqlPUlsHDUBBMvi_nf` |
| computer-enrol-individually | `1KN-ptq0KbKLSRaaKHUkHOsjQWGTbDL1L` |
| computer-enrol-bulk | `1qJ2wpR8lsM_6_QRqPmH_yC254AuqaopV` |
| computer-enrol-staff | `15iUn6AEDcYs4-UMZamra5wy_rPyarP_v` |
| computer-enrol-existing-staff | `1QaWdl3PkkuiIbq-Gz7zRm41c0id7ohIP` |
| computer-classroom-data | `18vqlbxTWM9VuOrfbWInm_UrE5qwYNHfL` |
| computer-change-password | `1TAra_sqZbYflWSrnPXy-Vmw2l6guzrT9` |

## Deployment

Undecided, so the build stays portable and both workflows ship, one enabled
later:

- `pages.yml` — build and publish to GitHub Pages on push to `main`.
- `rsync.yml` — build and rsync to a server over SSH, host and path in repo
  secrets.

The `site/` mirror output stays gitignored. It is import input, not a build
artifact.

## Testing

- The existing `tests/test_mirror.py` suite keeps passing.
- A build test asserts all 16 URLs are produced, both redirect stubs exist, the
  home page lists all twelve guides in the right sections and order, and tags
  match each guide's `video:`/`jobaid:` fields.
- A link check over the built output finds no broken internal links and no
  missing PDF.
- A manual pass compares each built page against the mirrored original.

## Out of scope

A CMS or web editing UI. Re-hosting video. Restructuring content. Adding
guides. Analytics.
