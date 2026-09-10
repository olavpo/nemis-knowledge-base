// Exported so the home page's own list of section groups
// (content/index.md's `sections[].key`) can be tested against this one —
// see tests/build.test.js "every validator section has a home page group".
export const SECTIONS = new Set(["mobile", "computer"]);
const VIMEO_ID = /^\d+$/;

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

  for (const { fileSlug: slug, data } of guides) {
    if (!data.title || !String(data.title).trim()) {
      errors.push(`${slug}: title is missing`);
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

    if (data.jobaid && !pdfNames.has(data.jobaid)) {
      errors.push(`${slug}: job aid ${data.jobaid} is not in assets/pdfs/`);
    }

    if (data.video) {
      if (!data.video.id) {
        errors.push(`${slug}: video has no id`);
      } else if (!VIMEO_ID.test(String(data.video.id))) {
        errors.push(`${slug}: video id "${data.video.id}" is not a Vimeo id (expected digits only)`);
      } else if (!data.video.minutes) {
        warnings.push(`${slug}: video has no duration; the page will omit it`);
      }
    }
  }

  for (const [key, collidingSlugs] of bySectionOrder) {
    if (collidingSlugs.length > 1) {
      const [section, order] = key.split("/");
      errors.push(`${collidingSlugs.join(", ")} all claim ${section} order ${order}`);
    }
  }

  return { errors, warnings };
}
