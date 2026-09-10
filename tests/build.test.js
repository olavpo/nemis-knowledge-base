import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
