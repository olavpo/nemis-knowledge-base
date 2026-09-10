import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";

/** "230 KB" / "1.3 MB" — one decimal from a megabyte up, as on the source site. */
export function formatBytes(bytes) {
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

const cache = new Map();

/** Loads page count and size of a PDF and caches it. Throws if the file is missing or unreadable. */
export async function loadPdfMeta(absolutePath) {
  if (cache.has(absolutePath)) return cache.get(absolutePath);

  let bytes;
  try {
    bytes = statSync(absolutePath).size;
  } catch {
    throw new Error(`Cannot read PDF: ${absolutePath}`);
  }

  // updateMetadata:false keeps pdf-lib from touching the file's own metadata,
  // which it otherwise does on load.
  const pdf = await PDFDocument.load(readFileSync(absolutePath), { updateMetadata: false });
  const meta = { bytes, size: formatBytes(bytes), pages: pdf.getPageCount() };
  cache.set(absolutePath, meta);
  return meta;
}

/** Synchronous cache read, for use as an Eleventy filter. Requires loadPdfMeta/warmPdfMeta first. */
export function pdfMeta(absolutePath) {
  const meta = cache.get(absolutePath);
  if (!meta) throw new Error(`PDF metadata not loaded: ${absolutePath}`);
  return meta;
}

/** Loads every PDF in a directory into the cache. */
export async function warmPdfMeta(dir) {
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".pdf"))) {
    await loadPdfMeta(join(dir, name));
  }
}
