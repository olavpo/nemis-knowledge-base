# NEMIS Knowledge Base — self-hosted copy

Tooling to take the published Google Site at
<https://sites.google.com/view/nemisknowledgebase> and turn it into plain
static HTML you can host anywhere.

`mirror_google_site.py` crawls every page it can reach from the home page,
downloads the images, stylesheets, scripts and web fonts those pages use,
rewrites every URL to a relative local path, and writes the result as ordinary
HTML files. Nothing in the output calls back to Google except the embeds that
have to (see below), so the copy keeps working if the original site goes away.

The output uses relative links throughout. That means the same folder works at
a domain root, in a subdirectory, or opened straight off disk.

## Copy the site

Install the two dependencies first.

```sh
python3 -m pip install -r requirements.txt
```

Run the copy.

```sh
python3 mirror_google_site.py https://sites.google.com/view/nemisknowledgebase
```

The pages land in `site/`. Preview them before you deploy.

```sh
python3 -m http.server --directory site 8000
```

Open <http://localhost:8000/> and click through every page.

Read `site/MIRROR-REPORT.md`. It lists the pages copied, the embeds still
loaded from Google, the Drive files that were not copied, and anything that
failed.

## Put it on a server

Copy the folder to the web root.

```sh
rsync -az --delete site/ user@server:/var/www/nemis/
```

Apache needs no configuration: it serves `index.html` from each directory by
default.

For nginx, point the server block at the folder and add:

```nginx
root /var/www/nemis;
index index.html;
error_page 404 /404.html;
location / { try_files $uri $uri/ $uri/index.html =404; }
```

For Caddy, `root * /var/www/nemis` plus `file_server` is enough.

## What is copied, and what is not

Text, images, layout, fonts, page structure and navigation are copied and
served locally.

Three things cannot be:

- Embedded Google items — Docs, Sheets, Forms, Maps, YouTube, Calendar — stay
  as iframes pointing at Google. They keep working, but only while each item
  stays shared. Check the sharing setting on every one listed in the report.
- Files linked from Google Drive are not downloaded. Download each one, put it
  in the output folder, and edit the link if you want the copy to stand alone.
- The Google Sites search box talks to Google's servers, so it cannot work on a
  copy. The script replaces it with a search over the copied pages, built at
  copy time into `search-index.json`. Pass `--search hide` to remove the box
  instead, or `--search keep` to leave the broken original.

Google's own "Report abuse / Page details" footer is removed, and the
`canonical` link back to `sites.google.com` is dropped so search engines index
the copy rather than the original. Use `--keep-google-footer` or
`--keep-canonical` to keep either.

Pages that are published but not in the site menu are only found if something
links to them. Add each one by hand:

```sh
python3 mirror_google_site.py <site-url> --extra-url <page-url> --extra-url <page-url>
```

Run `python3 mirror_google_site.py --help` for the rest of the options.

## Keeping the content up to date

Worth being blunt about a tension in the original brief: an exact copy of a
Google Site and easy editing by non-technical people pull in opposite
directions. Google Sites emits machine-generated HTML. Nobody can sensibly
hand-edit it, and there is no way around that while the requirement is a
100% copy.

There are two workable answers.

Keep Google Sites as the editor. Editors carry on working in the tool they
already know, and `refresh.sh` re-copies the site and pushes it to the server.
Run it by hand after an edit, or from cron. This costs nothing to learn and
nothing to maintain, and it is the right answer if self-hosting is about
availability, control of the domain, or keeping a copy that survives the
Google account.

```sh
SITE_URL=https://sites.google.com/view/nemisknowledgebase \
DEPLOY_TARGET=user@server:/var/www/nemis \
./refresh.sh
```

The script copies into a temporary folder and only replaces the live files
after a successful run, so a failed download cannot take the site down.

Or cut the tie to Google. Then the content has to move into a format people
can edit — Markdown files with a small build step, or a wiki. That is a
different job from mirroring: the layout gets rebuilt rather than copied, so
the result looks close to the original but not identical. Say the word and
that can be built on top of the mirror output.

## Tests

`tests/test_mirror.py` serves a fixture site shaped like a Google Site over
HTTP, mirrors it, and checks the output: pages written, links made relative,
`srcset` and CSS `url()` rewritten, fonts downloaded, footer stripped, embeds
left alone, search index built.

```sh
python3 tests/test_mirror.py
```

No network access is needed. Run it after changing the script.
