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
