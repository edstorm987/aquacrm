// Smoke — R037 schema.org structured data per page.

import {
  buildJsonLd, validateJsonLd, serializeJsonLd,
  type JsonLdObject, type OrganizationInput,
} from "../lib/structuredData";
import type { Block } from "../types/block";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

const ORG: OrganizationInput = {
  name: "Milesy Media",
  url: "https://milesymedia.example",
  logo: "https://milesymedia.example/logo.png",
  sameAs: ["https://twitter.com/milesy"],
};

function blk(type: string, props: Record<string, unknown> = {}, children?: Block[]): Block {
  return { id: type + ":" + Math.random().toString(36).slice(2, 6), type, props, children };
}

function findOne(arr: JsonLdObject[], type: string): JsonLdObject | undefined {
  return arr.find(o => o["@type"] === type);
}

(async () => {
  console.log("§ Structured data");

  // ─── A: Article happy path ────────────────────────────────────────────
  {
    const out = buildJsonLd({
      blocks: [blk("article", {
        headline: "How Aqua works",
        datePublished: "2026-05-07",
        author: "Ed",
        image: "https://x/y.png",
        description: "An overview.",
      })],
    }, { org: ORG });
    const a = findOne(out, "Article")!;
    expect("Article emitted", !!a);
    expect("Article headline mapped", a.headline === "How Aqua works");
    expect("Article author wrapped as Person",
      typeof a.author === "object" && (a.author as any)["@type"] === "Person" && (a.author as any).name === "Ed");
    expect("Article validates clean", validateJsonLd(a).length === 0);
  }

  // ─── B: Product happy path ────────────────────────────────────────────
  {
    const out = buildJsonLd({
      blocks: [blk("product", {
        name: "Wave Bottle",
        image: "https://x/p.png",
        description: "Reusable.",
        price: 24.99,
        currency: "USD",
        availability: "https://schema.org/InStock",
      })],
    }, { org: ORG });
    const p = findOne(out, "Product")!;
    expect("Product emitted", !!p);
    expect("Product offers shape",
      typeof p.offers === "object" &&
      (p.offers as any)["@type"] === "Offer" &&
      (p.offers as any).price === 24.99 &&
      (p.offers as any).priceCurrency === "USD" &&
      (p.offers as any).availability === "https://schema.org/InStock");
    expect("Product validates clean", validateJsonLd(p).length === 0);
  }

  // ─── C: FAQPage aggregation ──────────────────────────────────────────
  {
    const out = buildJsonLd({
      blocks: [
        blk("faq-item", { question: "Q1?", answer: "A1." }),
        blk("faq-item", { question: "Q2?", answer: "A2." }),
        blk("faq-item", { question: "Q3?", answer: "A3." }),
      ],
    }, { org: ORG });
    const f = findOne(out, "FAQPage")!;
    expect("FAQPage emitted once", out.filter(o => o["@type"] === "FAQPage").length === 1);
    expect("FAQPage mainEntity length 3",
      Array.isArray(f.mainEntity) && (f.mainEntity as unknown[]).length === 3);
    const q0 = (f.mainEntity as JsonLdObject[])[0]!;
    expect("Question shape",
      q0["@type"] === "Question" &&
      q0.name === "Q1?" &&
      typeof q0.acceptedAnswer === "object" &&
      (q0.acceptedAnswer as any).text === "A1.");
    expect("FAQPage validates clean", validateJsonLd(f).length === 0);
    // Multi-FAQ aggregation: items deep in tree still gather.
    const out2 = buildJsonLd({
      blocks: [
        blk("section", {}, [
          blk("faq-item", { question: "Deep?", answer: "Yes." }),
        ]),
        blk("faq-item", { question: "Top?", answer: "Also." }),
      ],
    }, { org: ORG });
    const f2 = findOne(out2, "FAQPage")!;
    expect("FAQPage gathers across tree depth",
      (f2.mainEntity as unknown[]).length === 2);
  }

  // ─── D: BreadcrumbList ───────────────────────────────────────────────
  {
    const out = buildJsonLd({
      blocks: [blk("breadcrumb", {
        items: [
          { name: "Home", url: "https://x/" },
          { name: "Shop", url: "https://x/shop" },
          { name: "Bottle" },
        ],
      })],
    }, { org: ORG });
    const b = findOne(out, "BreadcrumbList")!;
    expect("BreadcrumbList emitted", !!b);
    const items = b.itemListElement as Array<Record<string, unknown>>;
    expect("Breadcrumb positions sequential",
      items.length === 3 && items[0]!.position === 1 && items[2]!.position === 3);
    expect("Breadcrumb validates clean", validateJsonLd(b).length === 0);
  }

  // ─── E: Organization always present ──────────────────────────────────
  {
    const out = buildJsonLd({ blocks: [] }, { org: ORG });
    const o = findOne(out, "Organization")!;
    expect("Organization always emitted", !!o);
    expect("Organization name carried", o.name === "Milesy Media");
    expect("Organization validates clean", validateJsonLd(o).length === 0);
    expect("Organization sameAs is copy, not alias",
      Array.isArray(o.sameAs) && o.sameAs !== ORG.sameAs);
  }

  // ─── F: Validation — missing required fields ─────────────────────────
  {
    const bad: JsonLdObject = { "@context": "https://schema.org", "@type": "Article" };
    const issues = validateJsonLd(bad);
    const fields = issues.map(i => i.field).sort();
    expect("Article missing-fields → 3 issues",
      issues.length === 3 &&
      fields.join(",") === "author,datePublished,headline");

    const badProduct: JsonLdObject = { "@context": "https://schema.org", "@type": "Product" };
    expect("Product missing name → 1 issue",
      validateJsonLd(badProduct).length === 1);

    const wrongCtx: JsonLdObject = { "@context": "https://other" as any, "@type": "Organization", name: "X" };
    expect("Wrong @context flagged",
      validateJsonLd(wrongCtx).some(i => i.field === "@context"));

    const unknownType: JsonLdObject = { "@context": "https://schema.org", "@type": "Recipe" };
    expect("Unknown @type flagged",
      validateJsonLd(unknownType).some(i => i.field === "@type"));

    const faqWithBadQ: JsonLdObject = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        { "@context": "https://schema.org", "@type": "Question", name: "ok?", acceptedAnswer: { "@type": "Answer", text: "yes" } },
        { "@context": "https://schema.org", "@type": "Question" } as any,
      ],
    };
    const faqIssues = validateJsonLd(faqWithBadQ);
    expect("FAQ child-question issues bubble with index path",
      faqIssues.some(i => i.field.startsWith("mainEntity[1].")));
  }

  // ─── G: Script-escaping safety ───────────────────────────────────────
  {
    const arr: JsonLdObject[] = [{
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Hack </script><script>alert(1)</script>",
      datePublished: "2026-05-07",
      author: { "@type": "Person", name: "Ed" },
      description: "Has   and   inside.",
    }];
    const s = serializeJsonLd(arr);
    expect("Closing </script> neutralised",
      !/<\/script/i.test(s) && s.includes("<\\/script"));
    expect("U+2028 escaped", !s.includes(" ") && s.includes("\\u2028"));
    expect("U+2029 escaped", !s.includes(" ") && s.includes("\\u2029"));
    expect("Output is valid JSON when un-escaped",
      // Re-parse by reversing the script-tag escape; u2028/u2029
      // become standard JSON escapes that JSON.parse handles.
      Array.isArray(JSON.parse(s.replace(/<\\\/script/gi, "</script"))));
    const comment: JsonLdObject = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "X<!--y-->Z",
    };
    const s2 = serializeJsonLd([comment]);
    expect("HTML comment markers neutralised",
      !s2.includes("<!--") && !s2.includes("-->"));
  }

  // ─── H: product-card alias ───────────────────────────────────────────
  {
    const out = buildJsonLd({
      blocks: [blk("product-card", { name: "Mug", price: 5, currency: "USD" })],
    }, { org: ORG });
    expect("product-card emits Product schema",
      !!findOne(out, "Product"));
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
