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
