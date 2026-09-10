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

test("a missing title is an error", () => {
  const { errors } = validateGuides([guide("a", { title: undefined })], new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /a\b.*title/);
});

test("a blank title is an error", () => {
  const { errors } = validateGuides([guide("a", { title: "   " })], new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /a\b.*title/);
});

test("a video id that is not a Vimeo id is an error", () => {
  const { errors } = validateGuides(
    [guide("a", { video: { id: "https://vimeo.com/123456", minutes: 4 } })], new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /a\b.*video id/);
});

test("a missing order is an error", () => {
  const { errors } = validateGuides([guide("a", { order: undefined })], new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /a\b.*order/);
});

test("a non-integer order is an error", () => {
  const { errors } = validateGuides([guide("a", { order: 8.5 })], new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /a\b.*order/);
});

test("the same slug twice in one next list is an error", () => {
  const { errors } = validateGuides(
    [guide("a", { next: ["b", "b"] }), guide("b", { order: 2 })], new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /a\b.*\bb\b.*more than once/);
});

test("three guides sharing a section and order are all named, not just the first two", () => {
  const { errors } = validateGuides(
    [guide("a", { order: 2 }), guide("b", { order: 2 }), guide("c", { order: 2 })], new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /\ba\b/);
  assert.match(errors[0], /\bb\b/);
  assert.match(errors[0], /\bc\b/);
});

test("two guides whose video grid title collides is an error", () => {
  const { errors } = validateGuides(
    [
      guide("a", { title: "Enrol a staff member", video: { id: "1", minutes: 5 } }),
      guide("b", { order: 2, title: "Enrol a staff member", video: { id: "2", minutes: 5 } }),
    ],
    new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /\ba\b/);
  assert.match(errors[0], /\bb\b/);
  assert.match(errors[0], /Enrol a staff member/);
});

test("an explicit video.title colliding with another guide's plain title is an error", () => {
  const { errors } = validateGuides(
    [
      guide("a", { title: "Enrol a staff member", video: { id: "1", minutes: 5 } }),
      guide("b", {
        order: 2,
        title: "Enrol a new staff member",
        video: { id: "2", minutes: 5, title: "Enrol a staff member" },
      }),
    ],
    new Set());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /\ba\b/);
  assert.match(errors[0], /\bb\b/);
});

test("an explicit video.title distinguishes two guides that would otherwise collide", () => {
  const { errors } = validateGuides(
    [
      guide("a", { title: "Enrol a staff member", video: { id: "1", minutes: 5, title: "Enrol a staff member on Android" } }),
      guide("b", {
        order: 2,
        title: "Enrol a new staff member",
        video: { id: "2", minutes: 5, title: "Enrol a staff member (Web)" },
      }),
    ],
    new Set());
  assert.deepEqual(errors, []);
});

test("guides with no video never collide on grid title even if their titles match", () => {
  const { errors } = validateGuides(
    [
      guide("a", { title: "Enrol a staff member" }),
      guide("b", { order: 2, title: "Enrol a staff member" }),
    ],
    new Set());
  assert.deepEqual(errors, []);
});
