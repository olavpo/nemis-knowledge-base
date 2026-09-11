# DNEMIS Knowledge Base

The training-guide site for DNEMIS: step-by-step guides, videos and manuals
for using the system on a computer or an Android phone. It is a small static
site built from plain Markdown files in this repository, so it can be edited
on GitHub without any special tools and published automatically.

It publishes to GitHub Pages at <https://olavpo.github.io/nemis-knowledge-base/>
on every push to `main` (see "Deploying" below), and can optionally also be
pushed to a separate web server. If the site is ever put on a custom domain
instead, nothing here needs to change — the publish workflow reads the site's
real base path from GitHub at build time rather than having it hard-coded.

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
| `section` | `mobile` or `computer` — which group the guide appears under on the home page, and which badge ("Mobile phone" / "Computer or laptop") shows on the page itself. No other value is allowed. |
| `order` | A whole number that sets the guide's position within its section (lower numbers come first). Two guides in the same section can't share a number. |
| `video` | Optional. If present, embeds a Vimeo video. |
| `video.id` | The numeric Vimeo id (digits only — copy it from the Vimeo share link, not the full URL). |
| `video.minutes` | The video's length, shown as a duration badge next to the player. If left out, the build only warns and the badge is simply omitted. |
| `video.title` | Optional. Only needed if this guide's plain `title` would otherwise be shown twice, word for word, on the "Watch all videos" page (several guides share a title with their other-device counterpart). It overrides the heading shown there only — the guide's own page still uses the plain `title`. |
| `video.download` | Optional. A Google Drive file id (not a full URL) for the same video. Adds a "Save for offline use?" link below the player **on this guide's own page**. |
| `video.gridDownload` | Optional. A *different* Drive file id for the same video. Powers that video's own "↓ Download" link **on the "Watch all videos" page** — separate from, and unrelated to, `video.download` above. |
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

## Removing or renaming a guide

If you rename or delete a guide file that people already have links to (a
shared PDF, a bookmark, a link from outside this site), add an entry to
`content/redirects.njk` so the old address still resolves instead of 404ing:

```yaml
redirects:
  - from: Enrol-learners-individually
    to: /mobile-enrol-individually/
```

`from` is the old address (no leading or trailing slash); `to` is the new
one (leading and trailing slash). The old address then serves a small page
that immediately forwards a visitor to the new one. This is a less common
edit — ask a developer if you're not sure.

## What the build checks

Before the site is built, every guide file is checked against a set of rules
in `lib/validate.js`. If any of these fail, the build stops with an error
and nothing publishes — better a clear message here than a broken page on
the live site. In plain language, the checks are:

- Every guide has a `title`.
  Example: `computer-foo: title is missing`
- `layout` is set (it's what turns the body text into an actual page — a
  guide missing it would otherwise build as a bare, unstyled fragment with
  no chrome, silently).
  Example: `computer-foo: layout is missing`
- `section` is exactly `mobile` or `computer` — nothing else.
  Example: `computer-foo: section "Computer" is not mobile or computer`
- `order` is present and is a whole number.
  Example: `computer-foo: order "5.5" is not a whole number`
- No two guides in the same section share the same `order`.
  Example: `computer-foo, computer-bar all claim computer order 5`
- Every filename listed in `next` is a real guide, isn't the guide itself,
  and isn't listed twice.
  Examples: `computer-foo: "next" points at itself` /
  `computer-foo: "next" names computer-typo, which is not a guide` /
  `computer-foo: "next" lists computer-bar more than once`
- If `jobaid` is set, it can't be left blank, and that exact filename must
  exist in `assets/pdfs/`.
  Examples: `computer-foo: jobaid is blank` /
  `computer-foo: job aid computer-foo.pdf is not in assets/pdfs/`
- If `video` is set, it needs an `id`, and that `id` must be digits only (a
  Vimeo id, not a pasted URL).
  Examples: `computer-foo: video has no id` /
  `computer-foo: video id "https://vimeo.com/123" is not a Vimeo id
  (expected digits only)`
- If `video.minutes` is set, it must be an actual number, not e.g. a pasted
  "4 min".
  Example: `computer-foo: video minutes "4 min" is not a number`
- If `video.download` or `video.gridDownload` is set, it can't be left
  blank, and it must be a bare Drive file id (letters, digits, `-` and `_`
  only) rather than a full Drive URL.
  Examples: `computer-foo: video download is blank` /
  `computer-foo: video download id
  "https://drive.google.com/uc?export=download&id=abc" is not a Drive file
  id (expected letters, digits, - and _ only)`
- Two guides can't end up showing the same heading on the "Watch all
  videos" page (their `video.title`, or their plain `title` if no
  `video.title` is set).
  Example: `computer-foo, computer-bar all render the same video grid
  title "Enter data"`

A missing `video.minutes` is only a warning, printed during the build but
not a failure — the page simply omits the duration badge.

Separately, `npm test` (which both deploy workflows run — see "Deploying")
also checks that no page anywhere on the built site links to a URL that
wasn't actually built, catching a typo'd `next` target or a stale link that
the checks above don't cover.

## The Vimeo and Drive dependencies

Two external services are involved in a guide's video, and both are things a
future editor should know can go quietly wrong.

**Vimeo** hosts the video itself, keyed off the numeric `video.id` in that
guide's front matter. If access to the Vimeo account that owns these videos
is ever lost, or a video there is deleted or made private, the embedded
player will go blank with no warning — the build only checks that a
`video.id` *looks like* a Vimeo id (digits), not that the video is still
reachable.

**Google Drive** is the fallback for offline use. Nine guides each carry
`video.download` (their own page's "Save for offline use?" link) and nine
carry `video.gridDownload` (that same video's "↓ Download" link on the
"Watch all videos" page) — eighteen Drive links in total, one Drive file id
per link, not shared between the two. Each one breaks silently the moment
its Drive share lapses or the file is moved — the build only checks that
`video.download`/`video.gridDownload` *looks like* a bare Drive file id, not
a pasted URL, never that the file is still shared.

If either breaks, the fix is the same shape: get the source file, re-host it
(on Vimeo, or upload a fresh copy to Drive and share it publicly), and
update that one guide's `video.id`, `video.download`, or
`video.gridDownload` — whichever one broke.

## Search requires JavaScript

The search box is built at deploy time by Pagefind and renders itself
entirely in the browser — the input, the clear button, the results list are
all created by a script (`new PagefindUI(...)`) after the page loads. With
scripting off or blocked, there is no search input at all, not just an empty
results list.

Navigation is different: below 840px width, a `<noscript>` block in
`_includes/base.njk` reverts the header to a plain, always-visible layout
instead of leaving a collapsed nav menu or search icon inert, so every nav
link stays reachable without JavaScript. Search does not get the same
fallback and cannot — there is nothing for CSS alone to reveal.

## Running it locally

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
writing anything, so two builds in a row produce identical output.

`npm test` also includes browser-driven tests (`tests/header.browser.test.js`,
`tests/layout.browser.test.js`) that drive headless Chromium against a
locally served copy of `_site/` — if Chromium isn't installed yet, run
`npx playwright install chromium` once first. `playwright` is pinned to an
exact version (`1.62.0`, not `^1.62.0`) because that version's expected
Chromium build has to match whatever Chromium revision is actually
installed wherever the tests run; if you ever bump this version, re-run
`npx playwright install chromium` straight after.

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
  that actually gets deployed. If the site is ever put on a custom domain
  (or becomes a user/org root site instead of a project site), the base
  path GitHub reports is empty and this becomes a no-op, so nothing here
  needs to change either way.
- **`.github/workflows/deploy.yml`** — copies the built site to a separate
  web server over `rsync`/SSH. This one is manual-only for now
  (`workflow_dispatch` in the Actions tab); the push trigger is written in
  but commented out, so switching to "deploy on every push" later is a
  one-line change. It builds and syncs with no `PATH_PREFIX`, on the
  assumption that a self-hosted server puts the site at its own web root
  (`/`) rather than a subpath. It needs four repository secrets set under
  Settings → Secrets and variables → Actions:

  | Secret | What it is |
  | --- | --- |
  | `DEPLOY_KEY` | A private SSH key. Its matching public key must be in the target server user's `authorized_keys`. |
  | `DEPLOY_HOST` | The server's hostname or IP address. |
  | `DEPLOY_USER` | The SSH user to connect as. |
  | `DEPLOY_PATH` | The directory on the server to sync the site into. |

  If any of the four secrets is missing, the workflow stops with an error
  before touching the server rather than syncing to the wrong place.

## What's in the repo

| Path | Holds |
| --- | --- |
| `content/` | The site's pages: one Markdown file per guide (`content/guides/`), the home page, the manuals page, the videos page, and the redirect list (`content/redirects.njk`). |
| `_data/` | Shared data read by templates: `site.yaml` (site title, nav links, footer) and `manuals.yaml` (the manuals list). |
| `_includes/` | The Nunjucks templates that lay out every page — page chrome and nav (`base.njk`), a guide page (`guide.njk`), the video embed (`video.njk`), and card/section partials. |
| `assets/` | Static files copied into the built site as-is: `style.css`, `header.js`, `logo.png`, and the PDFs in `assets/pdfs/`. |
| `lib/` | Small JS modules used by `eleventy.config.js`: `validate.js` (the checks above) and `pdf-meta.js` (reads a PDF's page count and file size for display on the page). |
| `tests/` | The automated checks. `npm test` runs every `tests/*.test.js` file; a few standalone Python scripts also live here (see "Files the build doesn't use" below). |
| `.github/workflows/` | The two GitHub Actions workflows described above under "Deploying". |

## Files the build doesn't use

A handful of files in this repository support one-off content-import and
formatting-check tooling, not the site itself. They are not run by
`npm start`, `npm run build`, or `npm test`, except where noted:

- `mirror_google_site.py` and `refresh.sh` — save a static copy of a page at
  a given URL.
- `tools/extract_embeds.py` — pulls the visible text out of a saved page's
  HTML into its own file.
- `tools/import_from_mirror.py` — turns extracted text into
  `content/guides/*.md` front matter and body text.
- `tools/fetch_pdfs.py` and `tools/pdf-sources.json` — download PDFs into
  `incoming-pdfs/` (gitignored) so they can be committed into
  `assets/pdfs/`.
- `docs/superpowers/` — design and implementation-plan documents written
  while building this site.
- `docs/source-embeds/` — the extracted page text mentioned above, one file
  per page. **This one is load-bearing for `npm test`**: `tests/css-fidelity.test.js`
  reads these files at test time to check the site's CSS colours against
  them, so removing this directory would break the test suite.
- `tests/test_mirror.py`, `tests/test_extract_embeds.py`,
  `tests/test_import.py`, `tests/test_fetch_pdfs.py` — Python tests for the
  scripts above. `npm test` does not run these (it only picks up
  `tests/*.test.js`); running them by hand needs their own dependencies
  once, from the repo root:

  ```sh
  pip install -r requirements.txt
  python3 tests/test_mirror.py
  python3 tests/test_extract_embeds.py
  python3 tests/test_import.py
  python3 tests/test_fetch_pdfs.py
  ```

  Each prints `ok`/`FAIL` per check and exits non-zero if anything failed.
