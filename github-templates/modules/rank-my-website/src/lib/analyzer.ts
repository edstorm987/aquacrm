// Pure HTML check functions. No fetch, no IO — given an HTML string
// (and optional companion fetches like robots.txt), return CheckResults.
// Analyzer composition lives in services.ts; this file is the
// inspection grammar so the tests can exercise each check in isolation.

import type { Band, CheckResult } from "./domain";

// Tiny tag/attribute extractors. We deliberately avoid a real DOM
// parser dep — the heuristics below are forgiving and good enough for
// this tier of diagnostic. False positives are preferable to false
// precision (chapter #68).

function extractFirstTag(html: string, tag: string): { open: string; inner: string } | null {
  const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(html);
  if (!m) return null;
  return { open: m[1] ?? "", inner: m[2] ?? "" };
}

function extractMetaContent(html: string, name: string, attr: "name" | "property" = "name"): string | null {
  // Match either order of attribute / content, tolerating whitespace + quote style.
  const re = new RegExp(
    `<meta\\b[^>]*\\b${attr}=["']${name}["'][^>]*\\bcontent=["']([^"']*)["']`,
    "i",
  );
  const reSwap = new RegExp(
    `<meta\\b[^>]*\\bcontent=["']([^"']*)["'][^>]*\\b${attr}=["']${name}["']`,
    "i",
  );
  return (re.exec(html)?.[1] ?? reSwap.exec(html)?.[1]) ?? null;
}

function countTags(html: string, tag: string): number {
  const re = new RegExp(`<${tag}\\b`, "gi");
  return (html.match(re) ?? []).length;
}

function findAllTags(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  return html.match(re) ?? [];
}

function attrValue(openTag: string, attr: string): string | null {
  const re = new RegExp(`\\b${attr}=["']([^"']*)["']`, "i");
  return re.exec(openTag)?.[1] ?? null;
}

// ── Checks ──────────────────────────────────────────────────────

export function checkTitle(html: string): CheckResult {
  const t = extractFirstTag(html, "title");
  const text = (t?.inner ?? "").replace(/\s+/g, " ").trim();
  if (!text) return { id: "title", label: "Title tag", band: "F", finding: "No title tag." };
  const len = text.length;
  let band: Band;
  if (len >= 50 && len <= 60) band = "A";
  else if (len >= 40 && len <= 70) band = "B";
  else if (len >= 30 && len <= 80) band = "C";
  else if (len >= 10) band = "D";
  else band = "F";
  return {
    id: "title", label: "Title tag", band,
    finding: `${len} chars (sweet spot 50-60).`,
    data: { length: len, text },
  };
}

export function checkMetaDescription(html: string): CheckResult {
  const desc = extractMetaContent(html, "description");
  if (!desc) return { id: "meta-description", label: "Meta description", band: "F", finding: "No meta description." };
  const len = desc.length;
  let band: Band;
  if (len >= 120 && len <= 160) band = "A";
  else if (len >= 100 && len <= 180) band = "B";
  else if (len >= 80 && len <= 200) band = "C";
  else if (len >= 30) band = "D";
  else band = "F";
  return {
    id: "meta-description", label: "Meta description", band,
    finding: `${len} chars (sweet spot 120-160).`,
    data: { length: len },
  };
}

export function checkH1(html: string): CheckResult {
  const n = countTags(html, "h1");
  let band: Band;
  let finding: string;
  if (n === 1) { band = "A"; finding = "One H1 — ideal."; }
  else if (n === 0) { band = "F"; finding = "No H1 tag found."; }
  else if (n === 2) { band = "C"; finding = `${n} H1 tags — collapse to one for clarity.`; }
  else { band = "D"; finding = `${n} H1 tags — only one should be on a page.`; }
  return { id: "h1", label: "H1 heading", band, finding, data: { count: n } };
}

export function checkImageAlts(html: string): CheckResult {
  const imgs = findAllTags(html, "img");
  if (imgs.length === 0) {
    return { id: "image-alts", label: "Image alt tags", band: "A", finding: "No images on page (nothing to alt-tag).", data: { total: 0 } };
  }
  const missing = imgs.filter(i => attrValue(i, "alt") === null).length;
  const coverage = (imgs.length - missing) / imgs.length;
  let band: Band;
  if (coverage === 1) band = "A";
  else if (coverage >= 0.9) band = "B";
  else if (coverage >= 0.75) band = "C";
  else if (coverage >= 0.5) band = "D";
  else band = "F";
  return {
    id: "image-alts", label: "Image alt tags", band,
    finding: `${missing} of ${imgs.length} images missing alt.`,
    data: { total: imgs.length, missing, coverage },
  };
}

export function checkOgTags(html: string): CheckResult {
  const required: Array<"og:title" | "og:description" | "og:image" | "og:url"> =
    ["og:title", "og:description", "og:image", "og:url"];
  const present = required.filter(p => extractMetaContent(html, p, "property") !== null);
  const missing = required.filter(p => !present.includes(p));
  let band: Band;
  if (missing.length === 0) band = "A";
  else if (missing.length === 1) band = "B";
  else if (missing.length === 2) band = "C";
  else if (missing.length === 3) band = "D";
  else band = "F";
  return {
    id: "og-tags", label: "Open Graph tags", band,
    finding: missing.length === 0 ? "All four OG tags present." : `Missing: ${missing.join(", ")}.`,
    data: { present, missing },
  };
}

export function checkCanonical(html: string): CheckResult {
  const re = /<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["']/i;
  const reSwap = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']canonical["']/i;
  const href = re.exec(html)?.[1] ?? reSwap.exec(html)?.[1];
  if (!href) return { id: "canonical", label: "Canonical link", band: "D", finding: "No <link rel=\"canonical\"> found." };
  return { id: "canonical", label: "Canonical link", band: "A", finding: `Canonical: ${href}`, data: { href } };
}

// HTTPS / HSTS aren't in HTML — they come from the response context.
export interface ResponseContext {
  isHttps: boolean;
  hsts: string | null;
  robotsTxtOk: boolean;
  sitemapXmlOk: boolean;
}

export function checkHttps(ctx: ResponseContext): CheckResult {
  return ctx.isHttps
    ? { id: "https", label: "HTTPS", band: "A", finding: "Served over HTTPS." }
    : { id: "https", label: "HTTPS", band: "F", finding: "Served over plain HTTP — set up TLS." };
}

export function checkHsts(ctx: ResponseContext): CheckResult {
  if (!ctx.isHttps) {
    return { id: "hsts", label: "HSTS", band: "F", finding: "No HTTPS, so no HSTS." };
  }
  if (!ctx.hsts) {
    return { id: "hsts", label: "HSTS", band: "C", finding: "HTTPS works, but no Strict-Transport-Security header." };
  }
  // Honour max-age presence; we don't enforce a minimum.
  return { id: "hsts", label: "HSTS", band: "A", finding: `HSTS set: ${ctx.hsts}`, data: { value: ctx.hsts } };
}

export function checkRobotsTxt(ctx: ResponseContext): CheckResult {
  return ctx.robotsTxtOk
    ? { id: "robots-txt", label: "robots.txt", band: "A", finding: "robots.txt reachable." }
    : { id: "robots-txt", label: "robots.txt", band: "C", finding: "robots.txt not reachable at the root." };
}

export function checkSitemapXml(ctx: ResponseContext): CheckResult {
  return ctx.sitemapXmlOk
    ? { id: "sitemap-xml", label: "sitemap.xml", band: "A", finding: "sitemap.xml reachable." }
    : { id: "sitemap-xml", label: "sitemap.xml", band: "C", finding: "sitemap.xml not reachable at the root." };
}

// Compose all checks given the HTML + response context. Order matters
// for stability of the UI (and the smoke).
export function runAllChecks(html: string, ctx: ResponseContext): CheckResult[] {
  return [
    checkTitle(html),
    checkMetaDescription(html),
    checkH1(html),
    checkImageAlts(html),
    checkOgTags(html),
    checkCanonical(html),
    checkRobotsTxt(ctx),
    checkSitemapXml(ctx),
    checkHttps(ctx),
    checkHsts(ctx),
  ];
}

// Worst-band overall (chapter #68 — an A site with one F is not a B
// site).
export function worstBand(checks: CheckResult[]): Band {
  if (checks.length === 0) return "F";
  let worst: Band = "A";
  const order: Band[] = ["A", "B", "C", "D", "F"];
  for (const c of checks) {
    if (order.indexOf(c.band) > order.indexOf(worst)) worst = c.band;
  }
  return worst;
}
