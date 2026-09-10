// Browser-driven header tests.
//
// This project has been bitten three times by CSS/markup that reads
// correctly but renders wrong (cheerio parses leniently and never lays
// anything out). Both defects these tests guard — the search drawer
// pushing the page down instead of floating over it, and the header
// wrapping to extra rows on narrow screens — are exactly that class of
// bug, and neither would be caught by the DOM-only tests in build.test.js
// or css-fidelity.test.js. So these drive real Chromium against the built
// _site over an actual HTTP server (not file://, which breaks Pagefind's
// own fetches) and assert on layout measurements, not markup.
//
// Chromium must be installed (`npx playwright install chromium`, already
// done in this environment) — if it's genuinely unavailable, this suite
// should fail loudly (the browser.launch() rejection surfaces as a failed
// `before` hook), not skip.
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

async function newPage(width, height = 900) {
  const page = await browser.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  return page;
}

// A page in its own JS-disabled browser context, for the <noscript>
// fallback (see _includes/base.njk's <head>). Returns both the context and
// the page so the test can close the context (which closes the page with
// it) rather than the page alone.
async function newNoScriptPage(width, height = 900) {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(baseUrl, { waitUntil: "load" });
  return { context, page };
}

// Distinct top offsets of the header-bar's direct children, ignoring ones
// hidden by display:none (width/height 0). Items of different intrinsic
// height can legitimately land at slightly different tops within a single
// centered flex row, so this only fails the way a real second/third row
// would: a jump far larger than that centering slack.
async function headerRowInfo(page) {
  return page.evaluate(() => {
    const bar = document.querySelector(".site-header-bar");
    const rect = bar.getBoundingClientRect();
    const tops = [];
    bar.querySelectorAll(":scope > *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) tops.push(r.top);
    });
    return {
      barHeight: rect.height,
      headerHeight: document.querySelector(".site-header").getBoundingClientRect().height,
      spread: tops.length ? Math.max(...tops) - Math.min(...tops) : 0,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
}

const ONE_ROW_WIDTHS = [1200, 840, 839, 700, 600, 599, 480, 400, 320];

for (const width of ONE_ROW_WIDTHS) {
  test(`header is exactly one row at ${width}px`, async () => {
    const page = await newPage(width);
    try {
      const info = await headerRowInfo(page);
      // A real second/third row (the pre-fix bug) added 40-90px per row;
      // a single centered row's items never spread more than ~35px apart.
      assert.ok(info.spread < 36, `expected one row, got a ${info.spread}px vertical spread at ${width}px`);
      assert.ok(info.headerHeight < 72, `header is ${info.headerHeight}px tall at ${width}px, expected a single-row height`);
      assert.ok(info.scrollWidth <= width, `page scrolls horizontally at ${width}px (scrollWidth ${info.scrollWidth})`);
    } finally {
      await page.close();
    }
  });
}

test("at >=840px the search input is visible and the toggles are not", async () => {
  const page = await newPage(900);
  try {
    const state = await page.evaluate(() => ({
      search: getComputedStyle(document.getElementById("search")).display,
      navToggle: getComputedStyle(document.getElementById("nav-toggle")).display,
      searchToggle: getComputedStyle(document.getElementById("search-toggle")).display,
    }));
    assert.notEqual(state.search, "none");
    assert.equal(state.navToggle, "none");
    assert.equal(state.searchToggle, "none");
  } finally {
    await page.close();
  }
});

test("at 700px the search icon is present, nav links are visible, and activating it reveals the input with focus", async () => {
  const page = await newPage(700);
  try {
    const before = await page.evaluate(() => ({
      searchToggleDisplay: getComputedStyle(document.getElementById("search-toggle")).display,
      navLinksVisible: Array.from(document.querySelectorAll(".site-nav a"))
        .every((a) => a.getBoundingClientRect().width > 0),
      searchDisplay: getComputedStyle(document.getElementById("search")).display,
    }));
    assert.notEqual(before.searchToggleDisplay, "none");
    assert.ok(before.navLinksVisible, "nav links should stay visible at 700px");
    assert.equal(before.searchDisplay, "none");

    await page.click("#search-toggle");
    const after = await page.evaluate(() => ({
      searchDisplay: getComputedStyle(document.getElementById("search")).display,
      expanded: document.getElementById("search-toggle").getAttribute("aria-expanded"),
      focusedIsInput: document.activeElement?.classList.contains("pagefind-ui__search-input"),
    }));
    assert.notEqual(after.searchDisplay, "none");
    assert.equal(after.expanded, "true");
    assert.ok(after.focusedIsInput, "focus should move into the search input when it opens");
  } finally {
    await page.close();
  }
});

test("at 400px the hamburger is present and nav links are hidden until it opens, then Escape closes it and restores focus", async () => {
  const page = await newPage(400);
  try {
    const before = await page.evaluate(() => ({
      hamburgerDisplay: getComputedStyle(document.getElementById("nav-toggle")).display,
      navDisplay: getComputedStyle(document.getElementById("site-nav")).display,
    }));
    assert.notEqual(before.hamburgerDisplay, "none");
    assert.equal(before.navDisplay, "none");

    await page.click("#nav-toggle");
    const opened = await page.evaluate(() => {
      const nav = document.getElementById("site-nav");
      return {
        display: getComputedStyle(nav).display,
        linksVisible: Array.from(nav.querySelectorAll("a")).map((a) => a.getBoundingClientRect().width > 0),
        expanded: document.getElementById("nav-toggle").getAttribute("aria-expanded"),
      };
    });
    assert.notEqual(opened.display, "none");
    assert.deepEqual(opened.linksVisible, [true, true, true]);
    assert.equal(opened.expanded, "true");

    await page.keyboard.press("Escape");
    const closed = await page.evaluate(() => ({
      display: getComputedStyle(document.getElementById("site-nav")).display,
      expanded: document.getElementById("nav-toggle").getAttribute("aria-expanded"),
      focusedId: document.activeElement?.id,
    }));
    assert.equal(closed.display, "none");
    assert.equal(closed.expanded, "false");
    assert.equal(closed.focusedId, "nav-toggle");
  } finally {
    await page.close();
  }
});

test("at 400px with JavaScript disabled, nav links and the search input are still reachable and neither toggle renders", async () => {
  // The <noscript> fallback in base.njk's <head> is the only thing standing
  // between "script fails to load on a phone" and "no way to navigate or
  // search" — this is the one test that actually exercises it, by disabling
  // scripting in a fresh browser context rather than just reading the CSS.
  const { context, page } = await newNoScriptPage(400);
  try {
    const info = await page.evaluate(() => {
      const nav = document.getElementById("site-nav");
      const search = document.getElementById("search");
      return {
        navDisplay: getComputedStyle(nav).display,
        linksVisible: Array.from(nav.querySelectorAll("a")).map((a) => a.getBoundingClientRect().width > 0),
        searchDisplay: getComputedStyle(search).display,
        navToggleDisplay: getComputedStyle(document.getElementById("nav-toggle")).display,
        searchToggleDisplay: getComputedStyle(document.getElementById("search-toggle")).display,
      };
    });
    assert.notEqual(info.navDisplay, "none", "nav should be visible with no JS");
    assert.deepEqual(info.linksVisible, [true, true, true], "all three nav links should be visible with no JS");
    assert.notEqual(info.searchDisplay, "none", "the search field should be visible with no JS");
    assert.equal(info.navToggleDisplay, "none", "the hamburger can't do anything with no JS, so it must not render");
    assert.equal(info.searchToggleDisplay, "none", "the search icon can't do anything with no JS, so it must not render");

    // "Reachable" means focusable, not just visually present.
    const firstLink = page.locator(".site-nav a").first();
    await firstLink.focus();
    const focusedHref = await page.evaluate(() => document.activeElement?.getAttribute("href"));
    const firstHref = await firstLink.getAttribute("href");
    assert.equal(focusedHref, firstHref, "the first nav link should be focusable with no JS");
  } finally {
    await context.close();
  }
});

test("typing a search query does not grow the header or move the hero", async () => {
  const page = await newPage(1200);
  try {
    const heroTopBefore = await page.evaluate(() => document.querySelector(".hero").getBoundingClientRect().top);
    const headerHeightBefore = await page.evaluate(() => document.querySelector(".site-header").getBoundingClientRect().height);

    await page.click(".pagefind-ui__search-input");
    await page.type(".pagefind-ui__search-input", "guide");
    await page.waitForSelector(".pagefind-ui__drawer", { timeout: 10000 });
    await page.waitForTimeout(300);

    const heroTopAfter = await page.evaluate(() => document.querySelector(".hero").getBoundingClientRect().top);
    const headerHeightAfter = await page.evaluate(() => document.querySelector(".site-header").getBoundingClientRect().height);

    assert.equal(heroTopAfter, heroTopBefore, "hero moved when it should be pinned in place");
    assert.equal(headerHeightAfter, headerHeightBefore, "header grew when the drawer opened");
  } finally {
    await page.close();
  }
});

test("the results drawer floats over the page and never causes horizontal scroll, even full-bleed at 400px", async () => {
  const page = await newPage(400);
  try {
    await page.click("#search-toggle");
    await page.click(".pagefind-ui__search-input");
    await page.type(".pagefind-ui__search-input", "guide");
    await page.waitForSelector(".pagefind-ui__drawer", { timeout: 10000 });
    await page.waitForTimeout(300);

    const result = await page.evaluate(() => {
      const drawer = document.querySelector(".pagefind-ui__drawer");
      const cs = getComputedStyle(drawer);
      const rect = drawer.getBoundingClientRect();
      return {
        position: cs.position,
        visible: rect.width > 0 && rect.height > 0,
        withinViewport: rect.left >= 0 && rect.right <= window.innerWidth + 1,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    assert.equal(result.position, "absolute", "drawer should float over the page, not sit in normal flow");
    assert.ok(result.visible, "drawer should be visible with results");
    assert.ok(result.withinViewport, "drawer should not overflow the viewport horizontally");
    assert.ok(result.scrollWidth <= 400, `page scrolls horizontally at 400px (scrollWidth ${result.scrollWidth})`);
  } finally {
    await page.close();
  }
});
