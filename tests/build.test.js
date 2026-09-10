import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as cheerio from "cheerio";
import yaml from "js-yaml";
import { SECTIONS } from "../lib/validate.js";

const read = (p) => readFileSync(new URL(`../_site/${p}`, import.meta.url), "utf8");
const load = (p) => cheerio.load(read(p));

test("home page is built", () => {
  assert.ok(existsSync(new URL("../_site/index.html", import.meta.url)));
});

test("the chrome is on the page", () => {
  const $ = load("index.html");
  assert.equal($(".site-title").text().trim(), "DNEMIS Knowledge Base");
  assert.equal($(".site-logo").attr("src"), "/assets/logo.png");
  assert.ok(existsSync(new URL("../_site/assets/logo.png", import.meta.url)));
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

test("a subdirectory build prefixes every internal URL", () => {
  const out = mkdtempSync(join(tmpdir(), "prefix-build-"));
  execFileSync("npx", ["eleventy", "--output", out], {
    env: { ...process.env, PATH_PREFIX: "/kb/" },
    cwd: new URL("..", import.meta.url).pathname,
  });
  const $ = cheerio.load(readFileSync(join(out, "index.html"), "utf8"));
  assert.equal($('link[rel="stylesheet"]').attr("href"), "/kb/assets/style.css");
  assert.equal($(".site-logo").attr("src"), "/kb/assets/logo.png");
  assert.deepEqual($(".site-nav a").map((_, a) => $(a).attr("href")).get(),
    ["/kb/", "/kb/manuals/", "/kb/watch-all-videos/"]);
});

const SLUGS = [
  "mobile-install-login", "mobile-enrol-individually", "mobile-enrol-staff",
  "mobile-classroom-data", "computer-login-navigate", "computer-census-data",
  "computer-enrol-individually", "computer-enrol-bulk", "computer-enrol-staff",
  "computer-enrol-existing-staff", "computer-classroom-data",
  "computer-change-password",
];

// Expected page counts and sizes, verified against the PDFs committed at
// assets/pdfs/. These are literal values, not formats: a bug that reports
// the same page count for every job aid would still satisfy a format regex,
// which is exactly the failure this task exists to prevent. Replacing a PDF
// means updating this table — if the build test fails because of a value
// here, that's the test doing its job, not a bug in the test.
const JOB_AID_META = {
  "mobile-install-login": { pages: 2, size: "1.3 MB" },
  "mobile-enrol-individually": { pages: 2, size: "1.8 MB" },
  "mobile-enrol-staff": { pages: 2, size: "989 KB" },
  "mobile-classroom-data": { pages: 2, size: "1.8 MB" },
  "computer-login-navigate": { pages: 1, size: "1.5 MB" },
  "computer-census-data": { pages: 1, size: "1.3 MB" },
  "computer-enrol-individually": { pages: 1, size: "1.1 MB" },
  "computer-enrol-bulk": { pages: 3, size: "1.6 MB" },
  "computer-enrol-staff": { pages: 3, size: "1.3 MB" },
  "computer-enrol-existing-staff": { pages: 2, size: "1.2 MB" },
  "computer-classroom-data": { pages: 1, size: "1.1 MB" },
  "computer-change-password": { pages: 1, size: "966 KB" },
};

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

test("a guide with a video but no minutes omits the duration", () => {
  const $ = load("mobile-enrol-individually/index.html");
  assert.equal($(".video-container iframe").attr("src"),
    "https://player.vimeo.com/video/1183840330");
  const videoHeader = $(".resource-block").first().find(".resource-header");
  assert.equal(videoHeader.find(".resource-header-meta").length, 0);
  assert.ok(!videoHeader.text().includes("min"));
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

test("a subdirectory build prefixes a guide page's PDF and card URLs", () => {
  const out = mkdtempSync(join(tmpdir(), "prefix-build-guide-"));
  execFileSync("npx", ["eleventy", "--output", out], {
    env: { ...process.env, PATH_PREFIX: "/kb/" },
    cwd: new URL("..", import.meta.url).pathname,
  });
  const $ = cheerio.load(
    readFileSync(join(out, "mobile-install-login", "index.html"), "utf8"));
  assert.equal($(".pdf-container iframe").attr("src"), "/kb/assets/pdfs/mobile-install-login.pdf");
  assert.equal($(".download-btn").attr("href"), "/kb/assets/pdfs/mobile-install-login.pdf");
  assert.deepEqual($(".next-list a.card").map((_, a) => $(a).attr("href")).get(),
    ["/kb/mobile-enrol-individually/", "/kb/mobile-enrol-staff/"]);
});

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

test("each job aid's page count and size match the committed PDF exactly", () => {
  for (const slug of SLUGS) {
    const { pages, size } = JOB_AID_META[slug];
    const $ = load(`${slug}/index.html`);
    const expectedMeta = `PDF · ${pages} page${pages !== 1 ? "s" : ""}`;
    assert.equal($(".resource-header-meta").last().text().trim(), expectedMeta,
      `${slug} header meta`);
    assert.ok($(".download-hint").text().trim().endsWith(`· ${size}`),
      `${slug} download hint expected to end with "· ${size}", got "${$(".download-hint").text().trim()}"`);
  }
});

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

// Pagefind crawls _site/**/*.html on its own and does not consult Eleventy's
// collections, so eleventyExcludeFromCollections alone does not keep the
// redirect stubs out of the search index. A visitor searching the site must
// never land on a result titled "Moved" whose body just says the page moved.
// Fragment files are gzip-compressed, one per indexed page, each holding a
// small JSON payload behind a "pagefind_dcd" marker — decompressing and
// reading the url out of each is the direct way to prove a URL either is or
// isn't in the index, so that's what this asserts on, rather than falling
// back to just the page count.
test("the redirect stubs are not in the search index", () => {
  const fragmentDir = new URL("../_site/pagefind/fragment/", import.meta.url);
  const files = readdirSync(fragmentDir).filter((f) => f.endsWith(".pf_fragment"));
  const urls = files.map((f) => {
    const json = gunzipSync(readFileSync(new URL(f, fragmentDir))).toString("utf8");
    return JSON.parse(json.slice(json.indexOf("{"))).url;
  });
  for (const stub of ["/Enrol-learners-individually/", "/Enrol-an-existing-staff-member/"]) {
    assert.ok(!urls.includes(stub), `search index contains the redirect stub ${stub}`);
  }
  // 12 guides + the home page + manuals + watch-all-videos; the 2 redirect
  // stubs must not add to this.
  assert.equal(urls.length, SLUGS.length + 3);
});

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

// Every one of the twelve guides, not just a sample — computer-enrol-bulk,
// computer-enrol-existing-staff and computer-change-password have no video
// and must show "Job aid" only; the rest show both. This list was checked
// against each guide's own front matter, not copied from card.njk's output.
const EXPECTED_HOME_TAGS = {
  "mobile-install-login": ["Video", "Job aid"],
  "mobile-enrol-individually": ["Video", "Job aid"],
  "mobile-enrol-staff": ["Video", "Job aid"],
  "mobile-classroom-data": ["Video", "Job aid"],
  "computer-login-navigate": ["Video", "Job aid"],
  "computer-census-data": ["Video", "Job aid"],
  "computer-enrol-individually": ["Video", "Job aid"],
  "computer-enrol-bulk": ["Job aid"],
  "computer-enrol-staff": ["Video", "Job aid"],
  "computer-enrol-existing-staff": ["Job aid"],
  "computer-classroom-data": ["Video", "Job aid"],
  "computer-change-password": ["Job aid"],
};

test("home page tags follow each guide's own fields", () => {
  const $ = load("index.html");
  const tagsFor = (slug) => $(`.section a.card[href="/${slug}/"] .tag`)
    .map((_, t) => $(t).text().trim()).get();
  for (const slug of SLUGS) {
    assert.deepEqual(tagsFor(slug), EXPECTED_HOME_TAGS[slug], `${slug} tags`);
  }
});

// cheerio's parser recovers from broken HTML no matter how mangled the tree
// is, so a cheerio-based assertion cannot tell malformed markup from valid
// markup here — it silently found ".tag" either way. This has to check the
// raw bytes markdown-it actually emitted. It exists because a no-video
// guide's card collapses one of card.njk's two {% if %} guards to a
// whitespace-only line; on the home page (which is Markdown, unlike guide
// pages) that blank line broke CommonMark's raw-HTML-block parsing and
// markdown-it wrapped the surviving <span> in a stray <p>, which then closed
// in the wrong place (`</div></p>`) instead of after the </div>.
test("no-video cards on the home page render as valid HTML, not through markdown-it's paragraph fallback", () => {
  const html = read("index.html");
  const noVideoSlugs = SLUGS.filter((s) => EXPECTED_HOME_TAGS[s].length === 1);
  assert.deepEqual(noVideoSlugs,
    ["computer-enrol-bulk", "computer-enrol-existing-staff", "computer-change-password"]);
  for (const slug of noVideoSlugs) {
    const cardStart = html.indexOf(`href="/${slug}/"`);
    assert.ok(cardStart !== -1, `${slug} card not found`);
    const tagsOpen = html.indexOf('<div class="card-tags">', cardStart);
    const tagsClose = html.indexOf("</div>", tagsOpen);
    const between = html.slice(tagsOpen, tagsClose);
    assert.ok(!between.includes("<p>"), `${slug} .card-tags contains a stray <p>: ${between}`);
  }
  assert.ok(!html.includes("</div></p>"),
    "home page contains a </div></p> sequence — markdown-it broke out of a raw HTML block");
});

// lib/validate.js's SECTIONS and content/index.md's sections[].key are two
// independently maintained lists that only work together because they
// happen to agree. If a section were ever added to one without the other,
// guides in it would either fail validation for no reason or validate fine
// and silently vanish from the home page.
test("every section the validator accepts has a home page group, and vice versa", () => {
  const raw = readFileSync(new URL("../content/index.md", import.meta.url), "utf8");
  const frontMatter = raw.match(/^---\n([\s\S]*?)\n---/)[1];
  const { sections } = yaml.load(frontMatter);
  const homeKeys = new Set(sections.map((s) => s.key));
  assert.deepEqual(homeKeys, SECTIONS);
});

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

// The mobile and Web guides for "enrol learners individually", "enrol a
// staff member", and "enter classroom data" would otherwise render
// identical titles on the one page whose purpose is telling them apart.
// The original site disambiguated exactly these six (and only these six —
// "Install the app and log in" etc. had no collision and got no suffix), so
// this checks literal strings copied from docs/source-embeds/
// watch-all-videos.html, in the order the page actually renders them, not a
// derived/formatted comparison.
test("video card titles match the original's disambiguated wording, in order", () => {
  const $ = load("watch-all-videos/index.html");
  const titles = $(".video-card .video-title a").map((_, a) => $(a).text().trim()).get();
  assert.deepEqual(titles, [
    "Install the app and log in",
    "Enrol learners individually on Android",
    "Enrol a staff member on Android",
    "Enter classroom data on Android",
    "Log in and navigate DNEMIS",
    "Enter school census data",
    "Enrol learners individually (Web)",
    "Enrol a staff member (Web)",
    "Enter classroom data (Web)",
  ]);
});

// The videos page must not carry the original's per-video "↓ Download"
// links — those pointed at Google Drive, and the Drive ids are deliberately
// not in the guide front matter. The per-guide download button (on the
// guide page itself) is the decided download path for a video's material.
test("the videos page has no per-video download link and no Drive URL", () => {
  const html = read("watch-all-videos/index.html");
  assert.ok(!html.includes("drive.google.com"), "found a Drive URL on the videos page");
  assert.ok(!html.includes("download-link"), "found the original's download-link class");
});

test("manuals lists the handbook with a size read from the PDF", () => {
  const $ = load("manuals/index.html");
  assert.equal($(".card-title").text().trim(), "Handbook for States");
  assert.equal($(".card-desc").text().trim(), "ASC & Learner Registry data entry");
  assert.equal($("a.card").attr("href"), "/assets/pdfs/handbook-for-states.pdf");
  assert.deepEqual($(".tag").map((_, t) => $(t).text().trim()).get()[0], "PDF");
  assert.match($(".tag-size").text(), /^\d+(\.\d)? (KB|MB)$/);
  // 12 pages, 864 KB — verified against the committed PDF, same discipline as
  // JOB_AID_META above: this is a literal value, not a format check.
  assert.equal($(".tag-size").text().trim(), "864 KB");
});

// cheerio recovers elements by selector no matter how broken the underlying
// tree is, so — exactly as with the home page's no-video cards — a
// cheerio-based assertion here cannot tell a stray <p> apart from valid
// markup. Both new pages are Markdown files whose loops wrap Nunjucks
// output that markdown-it re-parses, so this checks the raw bytes directly.
test("video and manual cards on the new pages render as valid HTML, not through markdown-it's paragraph fallback", () => {
  const videosHtml = read("watch-all-videos/index.html");
  const manualsHtml = read("manuals/index.html");

  for (const [label, html] of [["watch-all-videos", videosHtml], ["manuals", manualsHtml]]) {
    assert.ok(!html.includes("</div></p>"),
      `${label} contains a </div></p> sequence — markdown-it broke out of a raw HTML block`);
  }

  // No <p> anywhere inside a video card, a video-info block, a manual card,
  // or a card-tags block.
  const videoCardStarts = [...videosHtml.matchAll(/<div class="video-card">/g)].map((m) => m.index);
  assert.equal(videoCardStarts.length, 9);
  for (const start of videoCardStarts) {
    const infoOpen = videosHtml.indexOf('<div class="video-info">', start);
    const infoClose = videosHtml.indexOf("</div>", infoOpen);
    const between = videosHtml.slice(infoOpen, infoClose);
    assert.ok(!between.includes("<p>"), `video-info contains a stray <p>: ${between}`);
  }

  const cardOpen = manualsHtml.indexOf('<a class="card"');
  assert.ok(cardOpen !== -1, "manual card not found");
  const tagsOpen = manualsHtml.indexOf('<div class="card-tags">', cardOpen);
  const tagsClose = manualsHtml.indexOf("</div>", tagsOpen);
  const tagsBetween = manualsHtml.slice(tagsOpen, tagsClose);
  assert.ok(!tagsBetween.includes("<p>"), `manuals .card-tags contains a stray <p>: ${tagsBetween}`);
});

// Deferred from Task 6 (see that task's report, ruling 2): the home page's
// nav links to /manuals/ and /watch-all-videos/, which did not exist until
// this task built them, so this could only be written once both pages were
// in place.
test("no page links to a URL that was not built", () => {
  const pages = [...SLUGS.map((s) => `${s}/index.html`),
                 "index.html", "manuals/index.html", "watch-all-videos/index.html"];
  for (const page of pages) {
    const $ = load(page);
    for (const href of $("a[href^='/']").map((_, a) => $(a).attr("href")).get()) {
      const target = href.endsWith("/") ? `${href}index.html`
        : href.endsWith(".pdf") ? href
        : `${href}/index.html`;
      assert.ok(existsSync(new URL(`../_site${target}`, import.meta.url)),
        `${page} links to ${href}, which was not built`);
    }
  }
});
