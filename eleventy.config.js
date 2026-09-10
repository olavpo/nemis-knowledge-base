import yaml from "js-yaml";

export default function (eleventyConfig) {
  eleventyConfig.addDataExtension("yaml", (contents) => yaml.load(contents));
  eleventyConfig.addPassthroughCopy({ assets: "assets" });

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
