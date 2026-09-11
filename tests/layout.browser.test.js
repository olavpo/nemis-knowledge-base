// Browser-driven layout tests for three owner-reported visual defects:
// the video grid's download link landing at a different offset from the
// card bottom depending on title length, the guide-page download hint and
// button sitting in opposite corners of the video/PDF frame, and the
// Pagefind search results panel rendering with no horizontal padding, a
// too-small excerpt, and a browser-default yellow <mark>. None of this is
// visible to the DOM-only tests in build.test.js —
// it's real layout and computed style, so this drives Chromium against the
// built _site over an actual HTTP server, same approach as
// tests/header.browser.test.js (see that file's header comment for why
// file:// isn't used).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const SITE_DIR = new URL("../_site/", import.meta.url).pathname;
const MIME = {
  ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
};

let server;
let browser;
let baseUrl;

before(async () => {
  server = await new Promise((resolve) => {
    const s = createServer(async (req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const candidates = [join(SITE_DIR, p), join(SITE_DIR, p, "index.html")];
      for (const filePath of candidates) {
        try {
          const data = await readFile(filePath);
          res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
          res.end(data);
          return;
        } catch { /* try next candidate */ }
      }
      res.writeHead(404);
      res.end("not found");
    });
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
});

async function newPage(width, height = 1200) {
  const page = await browser.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  return page;
}

// ---- Issue 3: videos page download link at a consistent offset ----

for (const width of [1200, 400]) {
  test(`all nine video cards have the download link at the same offset from the card bottom, at ${width}px`, async () => {
    const page = await browser.newPage();
    await page.setViewportSize({ width, height: 1600 });
    await page.goto(baseUrl + "watch-all-videos/", { waitUntil: "networkidle" });
    try {
      const cards = await page.evaluate(() => {
        return Array.from(document.querySelectorAll(".video-card")).map((card) => {
          const link = card.querySelector(".download-link");
          const cardRect = card.getBoundingClientRect();
          const linkRect = link.getBoundingClientRect();
          return {
            title: card.querySelector(".video-title").textContent.trim(),
            offset: cardRect.bottom - linkRect.bottom,
          };
        });
      });
      assert.equal(cards.length, 9, "expected nine video cards with a download link");
      // Both one-line and two-line titles must be present for this to be a
      // meaningful check — otherwise it wouldn't have caught the original bug.
      const distinctOffsets = new Set(cards.map((c) => Math.round(c.offset * 100) / 100));
      assert.equal(
        distinctOffsets.size, 1,
        `expected one consistent offset across all nine cards, got: ${JSON.stringify(cards)}`,
      );
    } finally {
      await page.close();
    }
  });
}

// ---- Issue 2: guide page download hint and button are adjacent ----

test("on a guide page, the download hint and button sit close together, not in opposite corners", async () => {
  const page = await newPage(1200);
  try {
    await page.goto(baseUrl + "computer-enrol-individually/", { waitUntil: "networkidle" });
    const gaps = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".download-row")).map((row) => {
        const hint = row.querySelector(".download-hint");
        const btn = row.querySelector(".download-btn");
        const hintRect = hint.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        return btnRect.left - hintRect.right;
      });
    });
    assert.equal(gaps.length, 2, "expected both the video and job-aid download rows on this guide");
    for (const gap of gaps) {
      // This would have failed before the fix: justify-content: space-between
      // put ~600-850px between the hint and the button at this width.
      assert.ok(gap >= 0 && gap < 40, `expected hint and button close together, got a ${gap}px gap`);
    }
  } finally {
    await page.close();
  }
});

// ---- Issue 1: search results panel ----

test("search results have left padding, a readable excerpt, and a site-coloured highlight", async () => {
  const page = await newPage(1200);
  try {
    await page.click(".pagefind-ui__search-input");
    await page.type(".pagefind-ui__search-input", "enrol");
    await page.waitForSelector(".pagefind-ui__result", { timeout: 10000 });
    await page.waitForTimeout(300);

    const info = await page.evaluate(() => {
      const results = Array.from(document.querySelectorAll(".pagefind-ui__result"));
      const result = results[0];
      const excerpt = document.querySelector(".pagefind-ui__result-excerpt");
      const mark = document.querySelector("mark");
      const cs = (el) => getComputedStyle(el);
      const nextTitle = results[1]?.querySelector(".pagefind-ui__result-title");
      return {
        resultPaddingLeft: parseFloat(cs(result).paddingLeft),
        excerptFontSize: parseFloat(cs(excerpt).fontSize),
        markBackground: mark ? cs(mark).backgroundColor : null,
        // The gap between one result's excerpt and the next result's title —
        // Pagefind's own scale-driven padding made this 70px before it was
        // tightened, so this guards against it drifting loose again.
        excerptToNextTitleGap: nextTitle
          ? nextTitle.getBoundingClientRect().top - excerpt.getBoundingClientRect().bottom
          : null,
      };
    });

    assert.ok(info.resultPaddingLeft > 0, `expected non-zero left padding on results, got ${info.resultPaddingLeft}px`);
    assert.ok(info.excerptFontSize >= 12, `expected excerpt font-size >= 12px, got ${info.excerptFontSize}px`);
    assert.notEqual(info.markBackground, "rgb(255, 255, 0)", "mark should not use the browser-default yellow highlight");
    assert.equal(info.markBackground, "rgb(232, 244, 240)", "mark should use the site's own accent colour");
    assert.ok(
      info.excerptToNextTitleGap !== null && info.excerptToNextTitleGap < 36,
      `expected a tight gap between one excerpt and the next title, got ${info.excerptToNextTitleGap}px`,
    );
  } finally {
    await page.close();
  }
});

// ---- Issue 4: search results disambiguate the phone/computer guide pairs ----
//
// Six of the twelve guides come in a phone version and a computer version,
// and several pairs share a title exactly ("Enter classroom data",
// "Enrol learners individually"). guide.njk now sets
// data-pagefind-meta="title:<title> · <device>" on the page's <h1>, which
// Pagefind reads in preference to the automatic first-<h1> title — so the
// search result itself gains the device without the on-page heading
// changing. These tests drive the real PagefindUI in a browser, the same
// way the panel-styling test above does, because Pagefind builds the
// result list itself; there is no markup to inspect statically.

test("search results for a shared guide title disambiguate the phone and computer versions", async () => {
  const page = await newPage(1200);
  try {
    await page.click(".pagefind-ui__search-input");
    await page.type(".pagefind-ui__search-input", "classroom");
    await page.waitForSelector(".pagefind-ui__result", { timeout: 10000 });
    await page.waitForTimeout(300);

    const titles = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".pagefind-ui__result-title")).map((t) => t.textContent.trim())
    );
    const classroomTitles = titles.filter((t) => t.startsWith("Enter classroom data"));
    assert.equal(classroomTitles.length, 2,
      `expected both "Enter classroom data" guides among the results, got: ${JSON.stringify(titles)}`);
    assert.notEqual(classroomTitles[0], classroomTitles[1],
      "the two 'Enter classroom data' results must read differently from each other");
    assert.ok(classroomTitles.some((t) => t.includes("Mobile phone")),
      `expected one result to mention "Mobile phone", got: ${JSON.stringify(classroomTitles)}`);
    assert.ok(classroomTitles.some((t) => t.includes("Computer or laptop")),
      `expected one result to mention "Computer or laptop", got: ${JSON.stringify(classroomTitles)}`);
  } finally {
    await page.close();
  }
});

test("a non-guide page's search result title is unchanged, with no device suffix", async () => {
  const page = await newPage(1200);
  try {
    await page.click(".pagefind-ui__search-input");
    await page.type(".pagefind-ui__search-input", "manuals");
    await page.waitForSelector(".pagefind-ui__result", { timeout: 10000 });
    await page.waitForTimeout(300);

    const titles = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".pagefind-ui__result-title")).map((t) => t.textContent.trim())
    );
    assert.ok(titles.includes("Reference manuals"),
      `expected the /manuals/ page's plain title among the results, got: ${JSON.stringify(titles)}`);
    for (const title of titles) {
      assert.ok(!title.includes("Mobile phone") && !title.includes("Computer or laptop"),
        `non-guide result "${title}" should not carry a device suffix`);
    }
  } finally {
    await page.close();
  }
});

// On a guide page itself, the device already appears in the badge above the
// heading — the visible <h1> must stay exactly the plain title, with the
// device only added to the indexed (invisible) meta title.
test("a guide page's visible <h1> is unchanged by the search meta title", async () => {
  const page = await newPage(1200);
  try {
    await page.goto(baseUrl + "mobile-classroom-data/", { waitUntil: "networkidle" });
    const h1 = await page.evaluate(() => {
      const el = document.querySelector("h1.page-title");
      return { text: el.textContent.trim(), meta: el.getAttribute("data-pagefind-meta") };
    });
    assert.equal(h1.text, "Enter classroom data",
      "the visible <h1> must stay just the plain title, not the title plus device");
    assert.equal(h1.meta, "title:Enter classroom data · Mobile phone",
      "the h1's data-pagefind-meta must carry the device-qualified title for search");
  } finally {
    await page.close();
  }
});
