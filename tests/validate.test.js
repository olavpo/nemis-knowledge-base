import { test } from "node:test";
import assert from "node:assert/strict";
import { validateGuides } from "../lib/validate.js";

const guide = (slug, data = {}) => ({
  fileSlug: slug,
  data: { title: slug, section: "mobile", order: 1, next: [], ...data },
});

test("a clean set of guides has nothing to report", () => {
  // "b" needs a distinct order from "a" (both default to mobile/1), or it
  // would trip the very same-section-and-order rule this suite tests below.
  const result = validateGuides(
    [guide("a", { next: ["b"], jobaid: "a.pdf" }), guide("b", { order: 2 })],
    new Set(["a.pdf"]));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("a next slug that names no guide is an error", () => {
  const { errors } = validateGuides([guide("a", { next: ["ghost"] })], new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /a\b.*ghost/);
});

test("a job aid with no PDF on disk is an error", () => {
  const { errors } = validateGuides([guide("a", { jobaid: "a.pdf" })], new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /a\.pdf/);
});

test("an unknown section is an error", () => {
  const { errors } = validateGuides([guide("a", { section: "tablet" })], new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /tablet/);
});

test("two guides sharing a section and order is an error", () => {
  const { errors } = validateGuides(
    [guide("a", { order: 2 }), guide("b", { order: 2 })], new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /order 2/);
});

test("a video with no duration is a warning, not an error", () => {
  const { errors, warnings } = validateGuides(
    [guide("a", { video: { id: "1", minutes: null } })], new Set());
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /duration/);
});

test("a guide pointing at itself is an error", () => {
  const { errors } = validateGuides([guide("a", { next: ["a"] })], new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /itself/);
});
