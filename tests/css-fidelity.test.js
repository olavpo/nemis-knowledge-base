// Colour-fidelity net: checks that every colour-bearing property this
// project's stylesheet ships for a given selector matches the value the
// original Google Sites source actually used, as captured in
// docs/source-embeds/*.html.
//
// This exists because four separate CSS values in this project were traced
// to the implementation plan inventing or mis-crediting a colour instead of
// copying it from the source embeds (.next-label, .card-desc, .tag-pdf,
// .tag-size). "Same look as the original" is the project's top requirement,
// so a one-off assertion per value doesn't scale — this asserts the whole
// class of mistake can't happen silently again.
//
// Deliberately out of scope: layout properties (spacing, sizing, typography
// other than colour). The source embeds are demonstrably inconsistent about
// those between pages (documented in task-4-report.md's property-by-property
// audit), so pinning them here would just encode noise.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const STYLE_PATH = new URL("../assets/style.css", import.meta.url);
const EMBEDS_DIR = new URL("../docs/source-embeds/", import.meta.url);

const readEmbed = (file) => readFileSync(new URL(file, EMBEDS_DIR), "utf8");

// selector -> the source embed file that defines the value we should match.
//
// Where a selector's colour is defined identically across every embed that
// has it, the choice of file is arbitrary (any one of them is authoritative).
// Where it genuinely differs between embeds, the file picked is the one
// whose *page* actually renders that selector in this project today; the
// comment on that entry says which embeds disagreed and why the pick.
const CSS_FIDELITY_MAP = {
  // mobile-install-login.html: base page chrome shared by every page in the
  // original site. manuals.html's own `body` rule uses a different
  // background (#fff4d6, a cream tone specific to that page) instead of the
  // #f4f6f4 every guide embed and home.html agree on — a real, page-specific
  // choice in the original, not a mistake. The guide-page value is what's
  // shipped today; whoever builds the manuals page needs #fff4d6 there, not
  // this value.
  "body": "mobile-install-login.html",

  // manuals.html: the only embed that defines these (the plan's Step 7
  // mis-credited them to mobile-install-login.html/home.html, which don't
  // have them at all).
  ".card-desc": "manuals.html",
  ".tag-pdf": "manuals.html",
  ".tag-size": "manuals.html",

  // mobile-install-login.html: guide-page chrome. Verified identical (colour
  // properties only) across all twelve guide embeds, so any one of them
  // would do; mobile-install-login.html is the one Task 4's brief already
  // treats as canonical.
  ".next-label": "mobile-install-login.html",
  ".device-badge": "mobile-install-login.html",
  ".page-title": "mobile-install-login.html",
  ".page-desc": "mobile-install-login.html",
  ".label-video": "mobile-install-login.html",
  ".label-jobaid": "mobile-install-login.html",
  ".resource-header-meta": "mobile-install-login.html",
  ".resource-header": "mobile-install-login.html",
  ".video-container": "mobile-install-login.html",
  ".card-arrow": "mobile-install-login.html",
  ".download-btn": "mobile-install-login.html",
  ".download-btn:hover": "mobile-install-login.html",
  ".download-hint": "mobile-install-login.html",

  // computer-change-password.html: a guide embed, picked (over other guide
  // embeds that define the same rule identically) simply because it's the
  // one guide with no video, so its job-aid-only .pdf-container is the
  // plainest example.
  ".pdf-container": "computer-change-password.html",

  // .divider is not in the coordinator's original list, but it has a real
  // colour conflict: every guide embed (including mobile-install-login.html)
  // uses #e0e0e0, while home.html's own .divider uses #e5e5e5 instead. The
  // only template that renders <hr class="divider"> today is guide.njk, so
  // the guide-page value (mobile-install-login.html) is what's live; revisit
  // this pick if a future task starts using .divider on the home/manuals
  // pages, where the source itself would want #e5e5e5.
  ".divider": "mobile-install-login.html",

  // home.html: shared card chrome, and the future homepage section headers.
  //
  // .section-label has a real colour conflict: home.html and index.html
  // (its duplicate) both use #2d6a4f, but manuals.html's own .section-label
  // uses #007d53 instead. This is a genuine inconsistency in the original
  // site, and the project has decided to unify on #2d6a4f (the value
  // already tokenised as --green and used everywhere else). home.html is
  // therefore the CORRECT, deliberate mapping — do not "fix" this to
  // manuals.html's #007d53 in a future task; that would undo the decision,
  // not restore fidelity.
  ".section-label": "home.html",
  ".section-title": "home.html",
  ".section-desc": "home.html",
  ".card": "home.html",
  // .card:hover also covers .card:focus-visible's shared declaration in the
  // shipped rule (`.card:hover,\n.card:focus-visible { border-color: ... }`).
  // Same conflict as .section-label: manuals.html's own .card:hover/
  // :focus-visible use #007d53, every other embed (including home.html and
  // every guide) uses #2d6a4f. Picking the guide/home value for the same
  // reason as above.
  ".card:hover": "mobile-install-login.html",
  ".card-title": "home.html",
  ".tag-video": "home.html",
  ".tag-jobaid": "home.html",
};

// Selectors deliberately left out of the map above, and why. This list is
// what tells the next person "we checked and decided", not "we forgot" —
// keep it in sync whenever a selector is added to or removed from
// assets/style.css.
//
// 1. Site chrome — new work for this rebuild, not scraped from Google
//    Sites (the live site's header/nav/hero/footer were Google Sites' own
//    chrome, never present in any of the page-content embeds this project
//    captured): .site-header, .site-brand, .site-logo, .site-title,
//    .site-nav, .site-nav a, .site-nav a:hover,
//    .site-nav a[aria-current="page"], .hero, .hero-title, .hero-subtitle,
//    .site-main, .site-footer.
// 2. .card:focus-visible — an accessibility addition this rebuild made.
//    It isn't defined at all in the two sources the rest of .card/.card:hover
//    are checked against (home.html, the guide embeds); only manuals.html
//    defines it, with the same #007d53 this project has decided not to
//    follow for cards (see the .card:hover comment above) — so there's no
//    value here worth pinning against a source this project doesn't
//    otherwise use for card colour.
// 3. .video-container iframe, .pdf-container iframe — both only declare
//    `border: none`. No concrete colour value on either side to compare.

// Only these count as "colour-bearing": color, background(-color), and any
// border* shorthand/longhand (border, border-color, border-top, ...) — the
// colour component of which is pulled out below.
const COLOR_PROP_RE = /^(color|background(-color)?|border(-[a-z]+)?)$/;
const COLOR_TOKEN_RE = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i;

function extractRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Negative lookahead stops ".card" from matching ".card-title" or
  // ".card:hover" — only a real word/selector boundary counts. The optional
  // `(?:,[^{]*)?` lets the selector be the first (or only) name in a
  // comma-separated list before the brace, e.g. shipped CSS's
  // ".card:hover,\n.card:focus-visible {" — needed so ".card:hover" can be
  // found and checked even though it isn't written as its own standalone
  // rule.
  const re = new RegExp(`${escaped}(?![\\w:-])\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "s");
  const m = css.match(re);
  return m ? m[1] : null;
}

function parseDeclarations(ruleBody) {
  const decls = {};
  for (const raw of ruleBody.split(";")) {
    const s = raw.trim();
    if (!s) continue;
    const idx = s.indexOf(":");
    if (idx === -1) continue;
    decls[s.slice(0, idx).trim().toLowerCase()] = s.slice(idx + 1).trim();
  }
  return decls;
}

function parseRootVars(css) {
  const rootMatch = css.match(/:root\s*\{([^}]*)\}/s);
  const vars = {};
  if (!rootMatch) return vars;
  for (const raw of rootMatch[1].split(";")) {
    const s = raw.trim();
    if (!s.startsWith("--")) continue;
    const idx = s.indexOf(":");
    if (idx === -1) continue;
    vars[s.slice(2, idx).trim()] = s.slice(idx + 1).trim();
  }
  return vars;
}

function normalizeHex(token) {
  const t = token.toLowerCase();
  const short = t.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : t;
}

// Resolves a declaration value down to a normalised colour token, or null
// if the value has no colour in it (e.g. "border: none") or references an
// unresolvable var().
function resolveColor(value, rootVars) {
  let v = value.trim();
  const varMatch = v.match(/var\(--([\w-]+)\)/i);
  if (varMatch) {
    const name = varMatch[1];
    if (!(name in rootVars)) return null;
    v = v.replace(varMatch[0], rootVars[name]);
  }
  const tokenMatch = v.match(COLOR_TOKEN_RE);
  return tokenMatch ? normalizeHex(tokenMatch[0]) : null;
}

// Compares only the properties the source rule actually declares. A colour
// property the shipped rule omits entirely is not flagged here — that's a
// documented, deliberate completeness gap (e.g. .page-title/.card-title
// relying on inherited body colour), not a wrong-colour bug, and is out of
// this test's remit.
function compareColours(sourceDecls, shippedDecls, rootVars) {
  const mismatches = [];
  for (const [prop, sourceValue] of Object.entries(sourceDecls)) {
    if (!COLOR_PROP_RE.test(prop)) continue;
    const sourceColor = resolveColor(sourceValue, {});
    if (!sourceColor) continue;
    const shippedValue = shippedDecls[prop];
    if (shippedValue === undefined) continue;
    const shippedColor = resolveColor(shippedValue, rootVars);
    if (shippedColor !== sourceColor) {
      mismatches.push({ property: prop, expected: sourceColor, actual: shippedColor ?? shippedValue });
    }
  }
  return mismatches;
}

const shippedCss = readFileSync(STYLE_PATH, "utf8");
const rootVars = parseRootVars(shippedCss);

for (const [selector, sourceFile] of Object.entries(CSS_FIDELITY_MAP)) {
  test(`colour fidelity: ${selector} matches ${sourceFile}`, (t) => {
    const shippedRule = extractRule(shippedCss, selector);
    if (!shippedRule) {
      t.skip(`${selector} is not implemented in assets/style.css yet`);
      return;
    }
    const sourceCss = readEmbed(sourceFile);
    const sourceRule = extractRule(sourceCss, selector);
    assert.ok(sourceRule, `${selector} not found in docs/source-embeds/${sourceFile} — fix CSS_FIDELITY_MAP`);

    const mismatches = compareColours(
      parseDeclarations(sourceRule),
      parseDeclarations(shippedRule),
      rootVars,
    );
    assert.deepEqual(
      mismatches,
      [],
      mismatches
        .map((m) => `${selector} ${m.property}: expected ${m.expected} (from ${sourceFile}), shipped ${m.actual}`)
        .join("; "),
    );
  });
}
