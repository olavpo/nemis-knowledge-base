// Exported so the home page's own list of section groups
// (content/index.md's `sections[].key`) can be tested against this one —
// see tests/build.test.js "every validator section has a home page group".
export const SECTIONS = new Set(["mobile", "computer"]);
const VIMEO_ID = /^\d+$/;
// A Drive file id, not a pasted share/download URL: letters, digits, - and _
// only. Google's own ids use exactly this alphabet, so a full URL (which
// always contains a "/" and usually "http") is rejected the same way a
// pasted Vimeo URL already is for video.id.
const DRIVE_ID = /^[A-Za-z0-9_-]+$/;

/**
 * Check the guide collection for the mistakes an editor can actually make.
 * Errors fail the build; warnings are printed and let it through.
 *
 * @param {{fileSlug: string, data: object}[]} guides
 * @param {Set<string>} pdfNames filenames present in assets/pdfs/
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateGuides(guides, pdfNames) {
  const errors = [];
  const warnings = [];
  const slugs = new Set(guides.map((g) => g.fileSlug));
  // section/order pairs are collected here and checked for collisions after
  // the main loop, so that three (or more) guides sharing a slot all get
  // named in one error instead of only the first two.
  const bySectionOrder = new Map();
  // The videos page renders one grid per guide that has a video, using
  // video.title when set or the guide's own title otherwise. Two guides
  // rendering the same grid title would be indistinguishable on the one
  // page whose purpose is choosing between them, so that's collected here
  // and checked after the main loop for the same all-in-one-error reason.
  const byGridTitle = new Map();

  for (const { fileSlug: slug, data } of guides) {
    if (!data.title || !String(data.title).trim()) {
      errors.push(`${slug}: title is missing`);
    }

    if (!data.layout) {
      // Eleventy applies no layout at all when this is missing, so the page
      // builds successfully (exit 0) as a bare, unstyled fragment — no
      // <html>, <head>, header, nav or CSS. That's a silently broken page,
      // not a build failure, unless we catch it here.
      errors.push(`${slug}: layout is missing`);
    }

    if (!SECTIONS.has(data.section)) {
      errors.push(`${slug}: section "${data.section}" is not mobile or computer`);
    }

    if (data.order === undefined) {
      errors.push(`${slug}: order is missing`);
    } else if (!Number.isInteger(data.order)) {
      errors.push(`${slug}: order "${data.order}" is not a whole number`);
    } else {
      const key = `${data.section}/${data.order}`;
      if (!bySectionOrder.has(key)) bySectionOrder.set(key, []);
      bySectionOrder.get(key).push(slug);
    }

    const seenNext = new Set();
    for (const target of data.next || []) {
      if (target === slug) {
        errors.push(`${slug}: "next" points at itself`);
      } else if (!slugs.has(target)) {
        errors.push(`${slug}: "next" names ${target}, which is not a guide`);
      } else if (seenNext.has(target)) {
        errors.push(`${slug}: "next" lists ${target} more than once`);
      } else {
        seenNext.add(target);
      }
    }

    // "jobaid" in data catches an explicit `jobaid:` line left blank (YAML
    // parses that as null) as distinct from the field being absent
    // altogether (a guide with no job aid at all, which is valid) — the old
    // `data.jobaid && ...` guard treated both the same way, so a blank line
    // silently dropped the entire job-aid block from the page instead of
    // failing the build.
    if ("jobaid" in data) {
      if (!data.jobaid) {
        errors.push(`${slug}: jobaid is blank`);
      } else if (!pdfNames.has(data.jobaid)) {
        errors.push(`${slug}: job aid ${data.jobaid} is not in assets/pdfs/`);
      }
    }

    if (data.video) {
      if (!data.video.id) {
        errors.push(`${slug}: video has no id`);
      } else if (!VIMEO_ID.test(String(data.video.id))) {
        errors.push(`${slug}: video id "${data.video.id}" is not a Vimeo id (expected digits only)`);
      }

      if (!data.video.minutes) {
        warnings.push(`${slug}: video has no duration; the page will omit it`);
      } else if (!Number.isFinite(data.video.minutes)) {
        // A pasted "4 min" (or any other non-numeric value) is truthy, so it
        // slipped past the warning above unnoticed and rendered literally as
        // "4 min min" on the page.
        errors.push(`${slug}: video minutes "${data.video.minutes}" is not a number`);
      }

      // Same blank-vs-absent distinction as jobaid above: an explicit
      // `download:` (or `gridDownload:`) left blank used to pass the
      // `!== undefined` guard and silently drop the "Save for offline use?"
      // row (or the video grid's per-card download link) instead of failing.
      if ("download" in data.video) {
        if (!data.video.download) {
          errors.push(`${slug}: video download is blank`);
        } else if (!DRIVE_ID.test(String(data.video.download))) {
          errors.push(`${slug}: video download id "${data.video.download}" is not a Drive file id (expected letters, digits, - and _ only)`);
        }
      }

      if ("gridDownload" in data.video) {
        if (!data.video.gridDownload) {
          errors.push(`${slug}: video gridDownload is blank`);
        } else if (!DRIVE_ID.test(String(data.video.gridDownload))) {
          errors.push(`${slug}: video gridDownload id "${data.video.gridDownload}" is not a Drive file id (expected letters, digits, - and _ only)`);
        }
      }

      const gridTitle = data.video.title || data.title;
      if (gridTitle) {
        if (!byGridTitle.has(gridTitle)) byGridTitle.set(gridTitle, []);
        byGridTitle.get(gridTitle).push(slug);
      }
    }
  }

  for (const [key, collidingSlugs] of bySectionOrder) {
    if (collidingSlugs.length > 1) {
      const [section, order] = key.split("/");
      errors.push(`${collidingSlugs.join(", ")} all claim ${section} order ${order}`);
    }
  }

  for (const [gridTitle, collidingSlugs] of byGridTitle) {
    if (collidingSlugs.length > 1) {
      errors.push(`${collidingSlugs.join(", ")} all render the same video grid title "${gridTitle}"`);
    }
  }

  return { errors, warnings };
}
