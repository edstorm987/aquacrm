// Smoke — R042 page templates lib.

import {
  pageTemplates,
  getPageTemplate,
  applyTemplate,
  uniqueSlug,
  type PageTemplateId,
} from "../lib/pageTemplates";
import type { Block } from "../types/block";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

const ALL_IDS: PageTemplateId[] =
  ["landing", "blog-post", "product", "about", "contact", "faq"];

(async () => {
  console.log("§ Page templates");

  // ─── A: registry shape ───────────────────────────────────────────────
  expect("registry has 6 entries", pageTemplates.length === 6);
  expect("ids are the expected set",
    pageTemplates.map(t => t.id).sort().join(",") ===
    [...ALL_IDS].sort().join(","));
  expect("getPageTemplate finds each id",
    ALL_IDS.every(id => getPageTemplate(id)?.id === id));
  expect("getPageTemplate returns undefined on unknown",
    getPageTemplate("nope" as PageTemplateId) === undefined);

  // ─── B: every template has required fields ──────────────────────────
  {
    let allOk = true;
    for (const t of pageTemplates) {
      if (!t.name || !t.description || !t.defaultSlug
        || !Array.isArray(t.blocks) || t.blocks.length === 0
        || !t.seoDefaults
        || typeof t.seoDefaults.metaTitle !== "string"
        || typeof t.seoDefaults.metaDescription !== "string") {
        allOk = false;
        console.error(`    template ${t.id} fails completeness`);
      }
    }
    expect("every template ships required fields", allOk);
  }

  // ─── C: every template has at least 2 blocks ────────────────────────
  expect("templates have ≥ 2 blocks each",
    pageTemplates.every(t => t.blocks.length >= 2));

  // ─── D: defaultSlugs unique ─────────────────────────────────────────
  {
    const slugs = pageTemplates.map(t => t.defaultSlug);
    expect("defaultSlugs are unique across templates",
      new Set(slugs).size === slugs.length);
  }

  // ─── E: applyTemplate basics ────────────────────────────────────────
  {
    const out = applyTemplate("landing");
    expect("applyTemplate uses defaultSlug + template name",
      out.slug === "/landing" && out.title === "Landing page");
    expect("applyTemplate copies blocks (length matches)",
      out.blocks.length === getPageTemplate("landing")!.blocks.length);
    expect("applyTemplate carries seo defaults",
      typeof out.seo.metaDescription === "string" && out.seo.metaDescription!.length > 0);
  }

  // ─── F: applyTemplate override ──────────────────────────────────────
  {
    const out = applyTemplate("about", { slug: "/our-story", title: "Our story" });
    expect("override slug honoured",
      out.slug === "/our-story");
    expect("override title flows into metaTitle",
      out.title === "Our story" && out.seo.metaTitle === "Our story");
  }

  // ─── G: applyTemplate restamps ids (collision protection) ───────────
  {
    const a = applyTemplate("faq");
    const b = applyTemplate("faq");
    const idsA = a.blocks.map(b => b.id);
    const idsB = b.blocks.map(b => b.id);
    const overlap = idsA.filter(id => idsB.includes(id));
    expect("two applies yield disjoint id sets",
      overlap.length === 0);
    // Recursive restamp: any nested children also get fresh ids.
    const aFlat = flatten(a.blocks);
    const bFlat = flatten(b.blocks);
    const aIds = new Set(aFlat.map(b => b.id));
    const bIds = new Set(bFlat.map(b => b.id));
    let nestedOverlap = 0;
    aIds.forEach(id => { if (bIds.has(id)) nestedOverlap++; });
    expect("nested-block ids also disjoint",
      nestedOverlap === 0);
  }

  // ─── H: applyTemplate doesn't mutate registry ───────────────────────
  {
    const before = JSON.stringify(getPageTemplate("contact"));
    const out = applyTemplate("contact");
    out.blocks[0]!.props = { mutated: true };
    const after = JSON.stringify(getPageTemplate("contact"));
    expect("registry template unaffected by caller mutation",
      before === after);
  }

  // ─── I: applyTemplate throws on unknown ─────────────────────────────
  {
    let threw = false;
    try { applyTemplate("nope" as PageTemplateId); } catch { threw = true; }
    expect("applyTemplate throws on unknown id", threw);
  }

  // ─── J: uniqueSlug ───────────────────────────────────────────────────
  {
    expect("uniqueSlug returns desired when free",
      uniqueSlug("/about", ["/contact"]) === "/about");
    expect("uniqueSlug appends -2 on collision",
      uniqueSlug("/about", ["/about"]) === "/about-2");
    expect("uniqueSlug walks past -2 on chain",
      uniqueSlug("/about", ["/about", "/about-2", "/about-3"]) === "/about-4");
  }

  // ─── K: SEO twitterCard valid ───────────────────────────────────────
  {
    const valid = ["summary", "summary_large_image"];
    const ok = pageTemplates.every(t =>
      !t.seoDefaults.twitterCard || valid.includes(t.seoDefaults.twitterCard));
    expect("all twitterCards are valid values", ok);
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
})();

function flatten(blocks: readonly Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    out.push(b);
    if (b.children && b.children.length) out.push(...flatten(b.children));
  }
  return out;
}
