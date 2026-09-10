const SECTIONS = new Set(["mobile", "computer"]);

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
  const seen = new Map();

  for (const { fileSlug: slug, data } of guides) {
    if (!SECTIONS.has(data.section)) {
      errors.push(`${slug}: section "${data.section}" is not mobile or computer`);
    }

    const key = `${data.section}/${data.order}`;
    if (seen.has(key)) {
      errors.push(`${slug} and ${seen.get(key)} both claim ${data.section} order ${data.order}`);
    } else {
      seen.set(key, slug);
    }

    for (const target of data.next || []) {
      if (target === slug) {
        errors.push(`${slug}: "next" points at itself`);
      } else if (!slugs.has(target)) {
        errors.push(`${slug}: "next" names ${target}, which is not a guide`);
      }
    }

    if (data.jobaid && !pdfNames.has(data.jobaid)) {
      errors.push(`${slug}: job aid ${data.jobaid} is not in assets/pdfs/`);
    }

    if (data.video && !data.video.id) {
      errors.push(`${slug}: video has no id`);
    }
    if (data.video && data.video.id && !data.video.minutes) {
      warnings.push(`${slug}: video has no duration; the page will omit it`);
    }
  }

  return { errors, warnings };
}
