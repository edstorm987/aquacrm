// Smoke — R045 JSON-LD injection helpers.

import {
  buildPageJsonLd,
  buildJsonLdScriptBodies,
  describeJsonLdEmission,
  deriveOrganization,
} from "../lib/jsonLdInjection";
import type { EditorPage } from "../types/editorPage";
import type { Site } from "../types/site";
import type { Block } from "../types/block";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function blk(type: string, props: Record<string, unknown> = {}, children?: Block[]): Block {
  return { id: type + ":" + Math.random().toString(36).slice(2,6), type, props, ...(children ? { children } : {}) };
}

function pageWith(blocks: Block[]): EditorPage {
  return {
    id: "p1", siteId: "s1", agencyId: "ag", clientId: "cl",
    slug: "/", title: "Page", status: "published",
    blocks, createdAt: 0, updatedAt: 0,
  } as unknown as EditorPage;
}

const SITE: Site = {
  id: "s1", agencyId: "ag", clientId: "cl",
  name: "Wave Co", slug: "wave-co", status: "active",
  createdAt: 0, updatedAt: 0,
  socialHandles: { instagram: "wave_co", twitter: "https://twitter.com/wavebot" },
} as unknown as Site;

(async () => {
  console.log("§ JSON-LD injection");

  // ─── A: Article emission ─────────────────────────────────────────────
  {
    const p = pageWith([
      blk("article", { headline: "Hello", datePublished: "2026-05-07", author: "Ed" }),
    ]);
    const arr = buildPageJsonLd(p, { agencyName: "Milesy" });
    const types = arr.map(o => o["@type"]).sort();
    expect("Article + Organization emitted",
      types.length === 2 && types.includes("Article") && types.includes("Organization"));
  }

  // ─── B: Product emission ─────────────────────────────────────────────
  {
    const p = pageWith([
      blk("product", { name: "Bottle", price: 24.99, currency: "USD" }),
    ]);
    const arr = buildPageJsonLd(p, { agencyName: "Milesy" });
    expect("Product emitted",
      arr.some(o => o["@type"] === "Product"));
  }

  // ─── C: FAQ aggregation ─────────────────────────────────────────────
  {
    const p = pageWith([
      blk("faq-item", { question: "Q1?", answer: "A1." }),
      blk("faq-item", { question: "Q2?", answer: "A2." }),
    ]);
    const arr = buildPageJsonLd(p, { agencyName: "Milesy" });
    const faq = arr.find(o => o["@type"] === "FAQPage");
    expect("FAQPage aggregates 2 questions",
      !!faq && Array.isArray((faq as any).mainEntity) && (faq as any).mainEntity.length === 2);
  }

  // ─── D: multi-script emission ───────────────────────────────────────
  {
    const p = pageWith([
      blk("article", { headline: "x", datePublished: "2026-05-07", author: "y" }),
      blk("breadcrumb", { items: [{ name: "Home", url: "/" }, { name: "Page" }] }),
    ]);
    const arr = buildPageJsonLd(p, { agencyName: "Milesy" });
    expect("multi-schema emission has Article + BreadcrumbList + Organization",
      arr.length === 3);
    const bodies = buildJsonLdScriptBodies(arr);
    expect("script-bodies length matches arr.length",
      bodies.length === arr.length);
    expect("each body parses as JSON object",
      bodies.every(b => {
        try { return typeof JSON.parse(b) === "object"; } catch { return false; }
      }));
  }

  // ─── E: Organization always emitted when org present ────────────────
  {
    const p = pageWith([]);
    const arr = buildPageJsonLd(p, { agencyName: "Milesy" });
    expect("empty tree + agencyName → only Organization",
      arr.length === 1 && arr[0]!["@type"] === "Organization");
  }

  // ─── F: empty tree + no org → no scripts ────────────────────────────
  {
    const p = pageWith([]);
    const arr = buildPageJsonLd(p, { agencyName: "" });
    expect("no org + empty tree → 0 objects",
      arr.length === 0);
    expect("buildJsonLdScriptBodies on [] yields []",
      buildJsonLdScriptBodies(arr).length === 0);
  }

  // ─── G: blocks present + no org → schemas emit, no Organization ─────
  {
    const p = pageWith([
      blk("article", { headline: "x", datePublished: "2026-05-07", author: "y" }),
    ]);
    const arr = buildPageJsonLd(p, { agencyName: "" });
    expect("no org + Article block → just Article",
      arr.length === 1 && arr[0]!["@type"] === "Article");
  }

  // ─── H: CSP-safe escape (closing-tag neutralised) ───────────────────
  {
    const p = pageWith([
      blk("article", {
        headline: "Hack </script><script>x</script>",
        datePublished: "2026-05-07", author: "y",
      }),
    ]);
    const arr = buildPageJsonLd(p, { agencyName: "Milesy" });
    const bodies = buildJsonLdScriptBodies(arr);
    expect("no raw </script> in any script body",
      bodies.every(b => !/<\/script/i.test(b)));
    expect("escaped <\\/script present in Article body",
      bodies.some(b => b.includes("<\\/script")));
  }

  // ─── I: deriveOrganization sources ──────────────────────────────────
  {
    const org = deriveOrganization({
      agencyName: "Milesy",
      baseUrl: "https://milesy.example",
      brandKit: { primaryColor: "#fff", logoUrl: "https://x/agency-logo.png" },
      site: { ...SITE, logoUrl: "https://x/site-logo.png" } as Site,
    });
    expect("agency name carried", org?.name === "Milesy");
    expect("site.logoUrl wins over brandKit.logoUrl",
      org?.logo === "https://x/site-logo.png");
    expect("baseUrl flows into url",
      org?.url === "https://milesy.example");
    expect("instagram handle expanded to full URL",
      Array.isArray(org?.sameAs) &&
      org!.sameAs!.includes("https://instagram.com/wave_co"));
    expect("twitter full URL preserved",
      Array.isArray(org?.sameAs) &&
      org!.sameAs!.includes("https://twitter.com/wavebot"));

    const empty = deriveOrganization({ agencyName: "  " });
    expect("blank agencyName → undefined org",
      empty === undefined);
  }

  // ─── J: diagnostics descriptor ──────────────────────────────────────
  {
    const p = pageWith([
      blk("article", { headline: "How Aqua works", datePublished: "2026-05-07", author: "Ed" }),
      blk("faq-item", { question: "Q?", answer: "A." }),
      blk("faq-item", { question: "Q2?", answer: "A2." }),
      blk("breadcrumb", { items: [{ name: "Home", url: "/" }, { name: "About" }] }),
    ]);
    const arr = buildPageJsonLd(p, { agencyName: "Milesy" });
    const desc = describeJsonLdEmission(arr);
    const summaries = desc.map(d => d.summary).sort();
    expect("Article summary includes headline",
      summaries.some(s => s.startsWith("Article — How Aqua works")));
    expect("FAQPage summary counts questions",
      summaries.some(s => s === "FAQPage — 2 questions"));
    expect("BreadcrumbList summary counts items",
      summaries.some(s => s === "BreadcrumbList — 2 items"));
    expect("Organization summary names agency",
      summaries.some(s => s === "Organization — Milesy"));
    expect("descriptor list count matches output",
      desc.length === arr.length);
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
