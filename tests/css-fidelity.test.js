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
  ".download-btn": "mobile-install-login.html",
  ".download-hint": "mobile-install-login.html",

  // .divider is not in the coordinator's original list, but it has a real
  // colour conflict: every guide embed (including mobile-install-login.html)
  // uses #e0e0e0, while home.html's own .divider uses #e5e5e5 instead. The
  // only template that renders <hr class="divider"> today is guide.njk, so
  // the guide-page value (mobile-install-login.html) is what's live; revisit
  // this pick if a future task starts using .divider on the home/manuals
  // pages, where the source itself would want #e5e5e5.
  ".divider": "mobile-install-login.html",

  // home.html: shared card chrome, and the future homepage section headers.
  // .section-label has a real colour conflict: home.html and index.html
  // (its duplicate) both use #2d6a4f, but manuals.html's own .section-label
  // uses #007d53 instead — a different, manuals-page-only green that isn't
  // tokenised anywhere in this project yet. No template renders
  // .section-label today; home.html is picked because it's the page whose
  // sections ("Mobile phone" / "Computer or laptop") this class was written
  // for. Whoever builds the manuals page should re-check this against
  // manuals.html's #007d53 before shipping it.
  ".section-label": "home.html",
  ".section-title": "home.html",
  ".section-desc": "home.html",
  ".card": "home.html",
  ".card-title": "home.html",
  ".tag-video": "home.html",
  ".tag-jobaid": "home.html",
};

// Only these count as "colour-bearing": color, background(-color), and any
// border* shorthand/longhand (border, border-color, border-top, ...) — the
// colour component of which is pulled out below.
const COLOR_PROP_RE = /^(color|background(-color)?|border(-[a-z]+)?)$/;
const COLOR_TOKEN_RE = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i;

function extractRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Negative lookahead stops ".card" from matching ".card-title" or
  // ".card:hover" — only a real word/selector boundary counts.
  const re = new RegExp(`${escaped}(?![\\w:-])\\s*\\{([^}]*)\\}`, "s");
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
