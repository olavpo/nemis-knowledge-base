import { join } from "node:path";
import yaml from "js-yaml";
import { pdfMeta, warmPdfMeta } from "./lib/pdf-meta.js";

export default function (eleventyConfig) {
  eleventyConfig.addDataExtension("yaml", (contents) => yaml.load(contents));
  eleventyConfig.addPassthroughCopy({ assets: "assets" });

  const PDF_DIR = join(import.meta.dirname, "assets", "pdfs");
  eleventyConfig.on("eleventy.before", async () => { await warmPdfMeta(PDF_DIR); });
  eleventyConfig.addFilter("pdfMeta", (file) => pdfMeta(join(PDF_DIR, file)));

  const SECTION_ORDER = { mobile: 0, computer: 1 };

  eleventyConfig.addCollection("guides", (api) =>
    api.getFilteredByGlob("content/guides/*.md").sort((a, b) =>
      (SECTION_ORDER[a.data.section] - SECTION_ORDER[b.data.section]) ||
      (a.data.order - b.data.order)));

  eleventyConfig.addFilter("guideBySlug", function (slug) {
    const guides = this.ctx?.collections?.guides || [];
    return guides.find((g) => g.fileSlug === slug);
  });

  return {
    dir: {
      input: "content",
      includes: "../_includes",
      data: "../_data",
      output: "_site",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    pathPrefix: process.env.PATH_PREFIX || "/",
  };
}
