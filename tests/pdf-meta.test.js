import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPdfMeta, formatBytes } from "../lib/pdf-meta.js";

test("formats bytes the way the source site did", () => {
  assert.equal(formatBytes(0), "0 KB");
  assert.equal(formatBytes(235_520), "230 KB");
  assert.equal(formatBytes(989_000), "966 KB");
  assert.equal(formatBytes(1_363_148), "1.3 MB");
  assert.equal(formatBytes(1_887_437), "1.8 MB");
});

test("a size that rounds up to 1024 KB promotes to MB instead of reading '1024 KB'", () => {
  // 1048575 bytes is just under 1 MiB; 1048064 is the low end of the window
  // that rounds to 1024 KB before the fix. Both must render as MB.
  assert.equal(formatBytes(1_048_575), "1.0 MB");
  assert.equal(formatBytes(1_048_064), "1.0 MB");
});

test("reads the page count and size of a real job aid", async () => {
  const meta = await loadPdfMeta(new URL("../assets/pdfs/mobile-install-login.pdf",
    import.meta.url).pathname);
  assert.equal(meta.pages, 2);
  assert.ok(meta.bytes > 1000, "a real file has a real size");
  assert.match(meta.size, /^\d+(\.\d)? (KB|MB)$/);
});

test("a missing PDF is an error, not a silent zero", async () => {
  await assert.rejects(() => loadPdfMeta("/nope/missing.pdf"), /missing\.pdf/);
});

test("reads the page count and size of the manuals handbook", async () => {
  // handbook-for-states.pdf is not a job aid (Task 8 uses it), but it's a
  // committed PDF warmPdfMeta loads, so it should get the same treatment.
  const meta = await loadPdfMeta(new URL("../assets/pdfs/handbook-for-states.pdf",
    import.meta.url).pathname);
  assert.equal(meta.pages, 12);
  assert.equal(meta.size, "864 KB");
});
