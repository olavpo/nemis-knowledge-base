# DNEMIS Knowledge Base

The training-guide site for DNEMIS: step-by-step guides, videos and manuals
for using the system on a computer or an Android phone. It used to be a
Google Site; it is now a small static site built from plain Markdown files in
this repository, so it can be edited on GitHub without any special tools and
published automatically.

It publishes to GitHub Pages on every push to `main` (see "Deploying" below),
and can optionally also be pushed to a separate web server.

If you just need to fix a typo or update a guide, skip straight to the next
section — you do not need to install anything or know how the build works.

## Editing an existing guide

Every guide is one file under `content/guides/`, named after the page, e.g.
`content/guides/computer-enrol-staff.md`. Open it on GitHub (or in any text
editor) and you'll see two parts:

```
---
layout: guide.njk
title: "Enrol a new staff member"
section: computer
order: 5
video:
  id: "1172391288"
  minutes: 5
  title: "Enrol a staff member (Web)"
jobaid: computer-enrol-staff.pdf
next:
  - computer-classroom-data
  - computer-enrol-individually
---

After reviewing these resources, you will be able to register a new staff
member in DNEMIS through the web application...
```

The part between the two `---` lines is the **front matter** — one setting
per line. Below the second `---` is the **body text**, written in ordinary
Markdown, that appears at the top of the page.

To fix wording, just edit the body text (or the `title`). To change anything
else, here is what each front-matter field does:

| Field | What it controls |
| --- | --- |
| `layout` | Always `guide.njk`. Leave this alone. |
| `title` | The page heading, and the text shown on the guide's card. |
| `section` | `mobile` or `computer` — which group the guide appears under on the home page. No other value is allowed. |
| `order` | A whole number that sets the guide's position within its section (lower numbers come first). Two guides in the same section can't share a number. |
| `video` | Optional. If present, embeds a Vimeo video. `id` is the numeric Vimeo id (digits only — copy it from the Vimeo share link). `minutes` is the video's length, shown as a badge. `title` is optional and only needed if this guide's plain `title` would otherwise be identical to another guide's on the "Watch all videos" page — it overrides the heading shown there. `download` is optional: a Google Drive file id (not a full URL) for that same video, which adds a "Save for offline use?" download link below the player on the guide's own page — see "The Vimeo and Drive dependencies" below. `gridDownload` is also optional and is a *different* Drive file id for the same video: it powers that video's own "↓ Download" link on the "Watch all videos" page, separately from `download` above. |
| `jobaid` | Optional. The filename of a PDF already sitting in `assets/pdfs/`. It's shown embedded on the page with a download button. |
| `next` | Optional. A list of other guides' filenames (without `.md`) to show as "Do this next" cards at the bottom of the page. |

Editing the file, previewing nothing, and pushing (or merging a pull
request) straight to `main` is enough — the GitHub Pages workflow rebuilds
and republishes the whole site automatically within a couple of minutes.
There is nothing else to run and no other file to touch for a text edit.

## Adding a new guide

1. Copy an existing guide file under `content/guides/` to a new filename —
   the filename (minus `.md`) becomes the guide's web address, so use the
   same `<device>-<task>` style as the others, e.g.
   `computer-reset-a-form.md`.
2. Edit its front matter (see the table above) and replace the body text.
3. Put the guide's job-aid PDF in `assets/pdfs/`, named to match the
   `jobaid` field you set.
4. Commit and push.

The home page and the "Watch all videos" page both build their lists from
whatever guide files exist — there is no separate index to update by hand.

(If you ever rename or remove a guide file that people already have links to,
add an entry to `content/redirects.njk` so the old address still resolves.
This is a rare, more advanced edit — ask a developer if you're not sure.)

## Adding a manual

Manuals (full handbooks, as opposed to short guides) work differently: they
have no Markdown file of their own. To add one:

1. Put the PDF in `assets/pdfs/`.
2. Add an entry for it in `_data/manuals.yaml`:

   ```yaml
   - title: Handbook for States
     description: ASC & Learner Registry data entry
     file: handbook-for-states.pdf
   ```

3. Commit and push.

The `/manuals/` page lists whatever is in `_data/manuals.yaml`, in order, so
that's the only file to edit. (There is no formal check that `file` points at
a PDF that actually exists — if it's misspelled, the build fails with a raw
`PDF metadata not loaded` error rather than a friendly message. Double-check
the filename matches exactly.)

## Running it on your own computer

You only need this to preview a change before pushing it, or if you're
working on the site itself rather than its content. It needs
[Node.js](https://nodejs.org) (the version in `.nvmrc`).

```sh
npm install       # once, or whenever a dependency changes
npm start         # serves the site at http://localhost:8080 with live reload
npm test          # builds the whole site and runs the automated checks
```

`npm start` is for quick previews: it rebuilds instantly as you edit, but it
does **not** run the search indexer, so the search box on a locally-served
page won't work at all — open the browser console and you'll see
`/pagefind/*` requests 404 and the inline initialiser throw
`ReferenceError: PagefindUI is not defined`, not just an empty results list.
To try search locally, run `npm run build` (which does index it) and serve
`_site/` yourself, e.g.:

```sh
npm run build
python3 -m http.server --directory _site 8080
```

`npm run build` always deletes and rebuilds `_site/` from scratch before
writing anything, so two builds in a row produce identical output — it never
leaves old files behind from a previous build.

## What the build checks

Before the site is built, every guide file is checked against a set of rules
in `lib/validate.js`. If any of these fail, the build stops with an error
and nothing publishes — better a clear message here than a broken page on
the live site. In plain language, the checks are:

- Every guide has a `title`.
- `section` is exactly `mobile` or `computer` — nothing else.
  Example: `computer-foo: section "Computer" is not mobile or computer`
- `order` is present and is a whole number.
  Example: `computer-foo: order "5.5" is not a whole number`
- No two guides in the same section share the same `order`.
  Example: `computer-foo, computer-bar all claim computer order 5`
- Every filename listed in `next` is a real guide, isn't the guide itself,
  and isn't listed twice.
  Examples: `computer-foo: "next" names computer-typo, which is not a
  guide` / `computer-foo: "next" points at itself`
- If `jobaid` is set, that exact filename exists in `assets/pdfs/`.
  Example: `computer-foo: job aid computer-foo.pdf is not in assets/pdfs/`
- If `video` is set, it has an `id`, and that `id` is digits only (a Vimeo
  id, not a URL or anything else).
  Example: `computer-foo: video id "https://vimeo.com/123" is not a
  Vimeo id (expected digits only)`
- If `video.download` or `video.gridDownload` is set, it's a bare Drive file
  id (letters, digits, `-` and `_` only) — not a full Drive URL — and it
  isn't blank.
  Example: `computer-foo: video download id
  "https://drive.google.com/uc?export=download&id=abc" is not a Drive
  file id (expected letters, digits, - and _ only)`
- `layout` must be set (it's what turns the body text into an actual page —
  a guide missing it builds as a bare, unstyled fragment with no chrome).
  Example: `computer-foo: layout is missing`
- If `video.minutes` is set, it must be a number, not e.g. a pasted "4 min".
  Example: `computer-foo: video minutes "4 min" is not a number`
- Two guides can't end up showing the same heading on the "Watch all
  videos" page (their `video.title`, or their plain `title` if no
  `video.title` is set).
  Example: `computer-foo, computer-bar all render the same video grid
  title "Enter data"`

A missing `video.minutes` is only a warning, printed during the build but
not a failure — the page simply omits the duration badge.

Separately, `npm test` (which both deploy workflows run) also checks that
no page anywhere on the site links to a URL that wasn't actually built —
catching a typo'd `next` target or a stale link that the checks above don't
cover.

## The Vimeo and Drive dependencies

Two external services are still involved in a guide's video, and both are
things a future editor should know can go quietly wrong.

**Vimeo** hosts the video itself, keyed off the numeric `video.id` in that
guide's front matter. If access to the Vimeo account that owns these nine
videos is ever lost, or a video there is deleted or made private, the
embedded player will go blank with no warning — the build only checks that
a `video.id` *looks like* a Vimeo id (digits), not that the video is still
reachable.

**Google Drive** is the fallback for offline use, and there are eighteen
Drive links in total — nine guides each carry two separate Drive file ids
for the same video, not one shared between them:

- `video.download` renders a "Save for offline use?" link below the player
  on that guide's own page.
- `video.gridDownload` renders that same video's "↓ Download" link on the
  "Watch all videos" page.

Both exist for the same reason: school staff on an unreliable connection
who would rather download the file than stream it. This is the more
fragile of the two dependencies (Vimeo/Drive) — each of those eighteen
links breaks silently the moment its individual Drive share lapses or the
file is moved, and nothing in the build can detect that (it only checks
that `video.download`/`video.gridDownload` *looks like* a bare Drive file
id, not a pasted URL — not that the file is still shared).

If either breaks, the fix is the same shape: get the source file, re-host
it (on Vimeo, or upload a fresh copy to Drive and share it publicly), and
update that one guide's `video.id`, `video.download`, or
`video.gridDownload` — whichever one broke.

## Where this came from

This site used to be published from Google Sites at
<https://sites.google.com/view/nemisknowledgebase>. A handful of files in
this repository exist only to record that migration and are **not** part of
building or running the site today:

- `mirror_google_site.py` — the script that crawled the original Google Site
  and saved a static copy of it.
- `site/` — the output of that script: an archival copy of the original,
  kept for comparison, refreshed by the now-superseded `refresh.sh`.
- `tools/extract_embeds.py` and `docs/source-embeds/` — the actual page
  text lives inside Google Sites' machine-generated HTML as an escaped
  block; this script pulled that block out into its own file per page.
- `tools/import_from_mirror.py` — the one-off script that turned those
  extracted blocks into the `content/guides/*.md` files this site is now
  built from.

**`site/` is not a usable fallback copy of the site**, despite being a
folder of HTML files that looks like one. Google Sites renders each page's
real content only after its own JavaScript runs and injects it — in the
saved HTML, that content sits inert inside a `data-code` attribute on an
empty embed `<iframe>`, not in the visible page. Opening `site/index.html`
without Google's scripts available shows no guide content at all: checked
in a browser, the rendered page has 0 visible characters of real content and
0 populated iframes; a static check of the same file confirms the only
visible text is generic Google Sites chrome (nav labels, "Skip to main
content") and the one `<iframe>` present is an empty shell with no content
of its own. (Both checks had two Google-hosted scripts blocked by this
network's firewall, so it's possible the page renders differently with full
internet access — but the content living behind an inert `data-code`
attribute rather than in the page is a structural fact, not a network
artifact. Don't mistake `site/` for something you could host as-is.)

One more thing to know about testing: `tests/test_import.py` is a Python
script (run by hand — it is not part of `npm test`) that checks the
committed `content/guides/*.md` files still match a fresh extraction from
`docs/source-embeds/`. That check is only meaningful during the migration
itself. The day someone edits a guide's actual wording — which is the whole
point of this rebuild — that round-trip comparison will start failing, and
that is expected, not a bug. At that point, delete the "committed Markdown
matches a fresh extraction" round-trip block near the end of
`tests/test_import.py`'s `main()` function (it's clearly marked with a
comment) and keep the rest of the script, which still checks
`tools/import_from_mirror.py` itself against its fixtures.

The Python suites (`tests/test_import.py` and the migration-only
`tests/test_extract_embeds.py`, `tests/test_fetch_pdfs.py`,
`tests/test_mirror.py`) aren't part of `npm test` and need their own
dependencies once, from the repo root:

```sh
pip install -r requirements.txt
python3 tests/test_import.py
python3 tests/test_extract_embeds.py
python3 tests/test_fetch_pdfs.py
python3 tests/test_mirror.py
```

Each prints `ok`/`FAIL` per check and exits non-zero if anything failed.

## Deploying

Two GitHub Actions workflows are set up, both running `npm ci` and
`npm test` first — if a guide fails validation or any check fails, the
workflow stops there and nothing is published.

- **`.github/workflows/pages.yml`** — publishes to GitHub Pages. Runs
  automatically on every push to `main` (and can also be triggered by hand
  from the Actions tab). Needs GitHub Pages turned on once for this
  repository, under Settings → Pages → Source: GitHub Actions. No secrets
  required.

  A GitHub Pages *project* site (the normal case: `https://<user>.github.io/
  <repo>/`) serves from a subpath, not from `/`, so this workflow handles
  that automatically: it validates the site with a plain, unprefixed
  `npm test` first, then asks GitHub (`actions/configure-pages`) what the
  site's real base path is and rebuilds once more with that as
  `PATH_PREFIX` before publishing — that second, prefixed build is the one
  that actually gets deployed. If you later put the site on a custom domain
  (or it's ever a user/org root site instead of a project site), the base
  path GitHub reports is empty and this becomes a no-op, so nothing here
  needs to change either way.
- **`.github/workflows/deploy.yml`** — copies the built site to a separate
  web server over `rsync`/SSH. This one is manual-only for now
  (`workflow_dispatch` in the Actions tab) since which server to use hasn't
  been decided; the push trigger is written in but commented out, so
  switching to "deploy on every push" later is a one-line change. It builds
  and syncs with no `PATH_PREFIX`, on the assumption that a self-hosted
  server puts the site at its own web root (`/`) rather than a subpath — if
  that's ever not the case, this workflow needs the same two-build
  treatment as the Pages one, with `PATH_PREFIX` set by hand rather than
  read from `configure-pages`. It needs four repository secrets set under
  Settings → Secrets and variables → Actions:

  | Secret | What it is |
  | --- | --- |
  | `DEPLOY_KEY` | A private SSH key. Its matching public key must be in the target server user's `authorized_keys`. |
  | `DEPLOY_HOST` | The server's hostname or IP address. |
  | `DEPLOY_USER` | The SSH user to connect as. |
  | `DEPLOY_PATH` | The directory on the server to sync the site into. |

Neither workflow has been run yet in this environment (there is no GitHub
Actions runner available while developing this repository, and the token
available here is read-only), so both are written carefully and kept
minimal, but untested end-to-end. Check the first real run of each.
