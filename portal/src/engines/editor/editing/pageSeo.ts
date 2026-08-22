/**
 * Per-page SEO — the specialist work the Website surface adds.
 *
 * Ed: *"website mode im going to need a specialied thing to do the seo and
 * tags and everything like that per page"*. PER PAGE is the load-bearing part:
 * a site-wide title is not SEO, it is a brand. Which page this is talking
 * about comes from the navigator (phase 8), and the navigator now carries the
 * FILE each repository route was derived from so this module has something to
 * write into.
 *
 * ─── WHERE THE VALUES LIVE, and the rule that decides ───────────────────────
 *
 * A repository-backed page keeps them IN SOURCE — the page's own head — and
 * they reach the repository down the SAME path as every other write the editor
 * makes: preview → confirm → a commit on `aqua-editor/<projectId>` → the pull
 * request. There is no second write mechanism and no SEO store. If the editor
 * kept a page's title in a database beside a repository that also declares one,
 * the two would disagree within a week and the deployed site would win.
 *
 * A portal page keeps them in the portal document, which is that target's
 * equivalent of source, and rides its existing draft → publish path.
 *
 * ─── WHAT THIS MODULE IS AND IS NOT ─────────────────────────────────────────
 *
 * Pure. It decides WHAT the head should say and WHERE in a file it goes; it
 * never reads a network, a token or a repository. `planPageSeoEdit` is to SEO
 * what `server/sourceInsert.ts`'s `planSourceInsert` is to elements — the
 * safety check, testable exhaustively without GitHub. It is a separate planner
 * because it is a genuinely different edit (a head, not a JSX sibling), not a
 * second write mechanism: both hand their new contents to the same
 * `saveRepoFile`.
 *
 * ─── THE RULE IT LIVES BY: OWN A BLOCK, REFUSE EVERYTHING ELSE ──────────────
 *
 * The editor writes into a MARKED region and touches nothing outside it. A
 * page that already declares its own metadata in code is refused, by name,
 * with the reason — because rewriting somebody's hand-written `<head>` or
 * `export const metadata` is how an editor earns the reputation of eating your
 * work. Refuse rather than guess is the same rule `sourceMatch.ts` and
 * `sourceInsert.ts` already hold.
 *
 * Client-safe: no server imports, no Node built-ins, no `next/*`.
 */

// The escape authority for a `<script type="application/ld+json">` body —
// `</script`, `<!--`, `-->`, U+2028/U+2029. REUSED rather than reimplemented:
// this is exactly the escaping the website-editor module's storefront already
// does, and two copies of an escape list is how one of them ends up missing a
// case. (Its sibling `validateJsonLd` is deliberately NOT reused — it only
// accepts the five @types that module's own builders emit and would reject a
// perfectly valid `LocalBusiness` an operator pasted. Validating somebody
// else's JSON-LD against our generator's whitelist would be a refusal we
// cannot justify.)
import { serializeJsonLd, type JsonLdObject } from "@built-ins/modules/website-editor/src/lib/structuredData";

// ── The fields ──────────────────────────────────────────────────────────────

export type TwitterCard = "summary" | "summary_large_image";

/**
 * One page's SEO, as the operator fills it in.
 *
 * Same vocabulary as the website-editor module's `EditorPageSeo`, on purpose —
 * an agency should not have to learn two names for the meta description. It is
 * a separate type because that one describes a row in that plugin's own page
 * store, and this one describes what gets written into somebody's source.
 */
export interface PageSeo {
  /** `<title>`. What a search result is headed and what the tab says. */
  title: string;
  /** `<meta name="description">`. The grey line under the result. */
  description: string;
  /** `<link rel="canonical">`. Absolute, or the field is refused. */
  canonical: string;
  /** `robots: index` — false writes `noindex`. */
  index: boolean;
  /** `robots: follow` — false writes `nofollow`. */
  follow: boolean;
  ogTitle: string;
  ogDescription: string;
  /** Absolute — a crawler has no page to resolve a relative image against. */
  ogImage: string;
  twitterCard: TwitterCard;
  /** Raw JSON-LD, exactly as pasted. Parsed before it is ever emitted. */
  structuredData: string;
}

export const EMPTY_PAGE_SEO: PageSeo = {
  title: "",
  description: "",
  canonical: "",
  index: true,
  follow: true,
  ogTitle: "",
  ogDescription: "",
  ogImage: "",
  twitterCard: "summary_large_image",
  structuredData: "",
};

export type PageSeoField = keyof PageSeo;

/** Every field, in the order the panel shows them. */
export const PAGE_SEO_FIELDS: PageSeoField[] = [
  "title",
  "description",
  "canonical",
  "index",
  "follow",
  "ogTitle",
  "ogDescription",
  "ogImage",
  "twitterCard",
  "structuredData",
];

/** Whitespace collapsed: every one of these lands in a one-line tag. */
function oneLine(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** Anything at all → a valid `PageSeo`. Never throws; unknown keys dropped. */
export function normalisePageSeo(value: unknown): PageSeo {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const card = input.twitterCard === "summary" ? "summary" : "summary_large_image";
  return {
    title: oneLine(input.title),
    description: oneLine(input.description),
    canonical: oneLine(input.canonical),
    // Absent means the default, and the default is that a page IS indexed —
    // an editor that quietly de-indexed a page because a field was missing
    // would take a client's site off Google.
    index: input.index === false ? false : true,
    follow: input.follow === false ? false : true,
    ogTitle: oneLine(input.ogTitle),
    ogDescription: oneLine(input.ogDescription),
    ogImage: oneLine(input.ogImage),
    twitterCard: card,
    // NOT `oneLine` — JSON-LD is a document and its newlines are its shape.
    structuredData: typeof input.structuredData === "string" ? input.structuredData.trim() : "",
  };
}

/** Nothing to write. A block is removed rather than emitted empty. */
export function pageSeoIsEmpty(seo: PageSeo): boolean {
  return !seo.title
    && !seo.description
    && !seo.canonical
    && seo.index
    && seo.follow
    && !seo.ogTitle
    && !seo.ogDescription
    && !seo.ogImage
    && !seo.structuredData;
}

/**
 * For a STORED document: the values, or `undefined` when there is nothing.
 *
 * The portal design document's normalisers use this so a page nobody has
 * given SEO to carries no `seo` key at all. That is not tidiness — it is what
 * keeps a document that predates phase 9 normalising to exactly the bytes it
 * had before, which every fixture in the portal suite is asserting against.
 */
export function storedPageSeo(value: unknown): PageSeo | undefined {
  const seo = normalisePageSeo(value);
  return pageSeoIsEmpty(seo) ? undefined : seo;
}

export function pageSeoEquals(left: PageSeo, right: PageSeo): boolean {
  return PAGE_SEO_FIELDS.every(field => left[field] === right[field]);
}

// ── Fields that cannot be written on their own ──────────────────────────────
//
// The card size is the only one, and it was SILENTLY unwritable: both emitters
// only put a `twitter:card` out when there is something to put ON the card
// (`og:title` / `og:description` / `og:image`), which is right — a card
// declaration with no card is a tag that says nothing. But the panel offered
// the select anyway, so changing it on a page with no social fields enabled
// the Preview button, sent a request, and came back "already says exactly
// this". A control that does nothing has to SAY it does nothing.
//
// Stated here rather than in the panel so the rule the emitters follow and the
// rule the panel shows are the same rule, in the same file, and cannot drift.

/**
 * Why a filled-in field will not reach the page — or null when it will.
 *
 * Distinct from `mechanismRefusesField`, which is about the FILE FORMAT
 * ("Next's metadata export has nowhere to put JSON-LD"). This one is about the
 * OTHER VALUES: the field is supported, it is simply inert on its own.
 */
export function pageSeoFieldInert(seo: PageSeo, field: PageSeoField): string | null {
  if (field === "twitterCard" && !seo.ogTitle && !seo.ogDescription && !seo.ogImage) {
    return "The card size is only written when there is a card to size — fill in a social title, description or image and it goes out with them.";
  }
  return null;
}

/**
 * The values as they would actually be WRITTEN: every inert field back at its
 * default.
 *
 * What the panel compares to decide whether there is anything to preview. The
 * raw draft is not the right comparison — it says "changed" for a card size
 * that no emitter is going to emit, which is how the operator got sent to a
 * refusal instead of being told the truth up front.
 */
export function effectivePageSeo(seo: PageSeo): PageSeo {
  const effective = { ...seo };
  for (const field of PAGE_SEO_FIELDS) {
    if (pageSeoFieldInert(seo, field)) {
      (effective as Record<PageSeoField, PageSeo[PageSeoField]>)[field] = EMPTY_PAGE_SEO[field];
    }
  }
  return effective;
}

/** `pageSeoEquals` on what would be written, not on what was typed. */
export function pageSeoWriteEquals(left: PageSeo, right: PageSeo): boolean {
  return pageSeoEquals(effectivePageSeo(left), effectivePageSeo(right));
}

// ── What is wrong with it, before anything is written ───────────────────────

export interface PageSeoProblem {
  field: PageSeoField;
  /** `error` blocks the write. `warning` is advice and never blocks. */
  level: "error" | "warning";
  message: string;
}

/** Lengths Google actually truncates at. Advice, never a refusal. */
export const SEO_TITLE_ADVISORY_LIMIT = 60;
export const SEO_DESCRIPTION_ADVISORY_LIMIT = 160;

function absoluteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Everything wrong with these values — blocking first, then advice.
 *
 * The split matters. A canonical that is not a URL is a tag that actively
 * misdirects a crawler, so it is refused. A title of 74 characters is merely
 * going to be truncated in a result, which is the operator's call to make and
 * not the editor's to veto.
 */
export function pageSeoProblems(seo: PageSeo): PageSeoProblem[] {
  const problems: PageSeoProblem[] = [];

  if (seo.canonical && !absoluteUrl(seo.canonical)) {
    problems.push({
      field: "canonical",
      level: "error",
      message: "A canonical must be the page's full address, starting http:// or https:// — a relative one tells a crawler to canonicalise to nothing.",
    });
  }
  if (seo.ogImage && !absoluteUrl(seo.ogImage)) {
    problems.push({
      field: "ogImage",
      level: "error",
      message: "A social image must be a full address. The crawler that fetches it has no page to resolve a relative path against, so a relative one shows no image at all.",
    });
  }
  if (seo.structuredData) {
    const parsed = parseStructuredData(seo.structuredData);
    if (!parsed.ok) {
      problems.push({ field: "structuredData", level: "error", message: parsed.error });
    }
  }

  if (!seo.title) {
    problems.push({
      field: "title",
      level: "warning",
      message: "No title. A page with no title is listed by whatever a search engine can scrape, usually its URL.",
    });
  } else if (seo.title.length > SEO_TITLE_ADVISORY_LIMIT) {
    problems.push({
      field: "title",
      level: "warning",
      message: `${seo.title.length} characters — results usually cut off around ${SEO_TITLE_ADVISORY_LIMIT}.`,
    });
  }
  if (!seo.description) {
    problems.push({
      field: "description",
      level: "warning",
      message: "No description. The search engine will write one from the page, and it will not be the sentence you would have chosen.",
    });
  } else if (seo.description.length > SEO_DESCRIPTION_ADVISORY_LIMIT) {
    problems.push({
      field: "description",
      level: "warning",
      message: `${seo.description.length} characters — results usually cut off around ${SEO_DESCRIPTION_ADVISORY_LIMIT}.`,
    });
  }
  if (!seo.index) {
    problems.push({
      field: "index",
      level: "warning",
      message: "This page is set to noindex, so it will be removed from search results. That is a real consequence, not a setting.",
    });
  }
  return problems;
}

export function pageSeoBlocked(seo: PageSeo): PageSeoProblem[] {
  return pageSeoProblems(seo).filter(problem => problem.level === "error");
}

// ── Structured data ─────────────────────────────────────────────────────────

export type StructuredDataParse =
  | { ok: true; value: unknown; nodes: number }
  | { ok: false; error: string };

/**
 * The operator's JSON-LD, parsed — and refused with a reason it can act on.
 *
 * Deliberately NOT validated against a schema whitelist: schema.org has
 * hundreds of types and an agency pasting `LocalBusiness` is doing the right
 * thing. What IS checked is that it is JSON, and that it is a thing a
 * `<script type="application/ld+json">` may legally contain — an object, or an
 * array of objects. A bare string or number in that tag is not structured
 * data, it is noise a crawler will ignore.
 */
export function parseStructuredData(raw: string): StructuredDataParse {
  const text = (raw ?? "").trim();
  if (!text) return { ok: true, value: null, nodes: 0 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "it is not valid JSON";
    return { ok: false, error: `That structured data is not valid JSON — ${detail}. Paste the JSON-LD object itself, without the surrounding <script> tag.` };
  }
  const isNode = (value: unknown) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  if (Array.isArray(parsed)) {
    if (!parsed.length) return { ok: false, error: "That structured data is an empty list, so there is nothing to put on the page." };
    if (!parsed.every(isNode)) {
      return { ok: false, error: "Every entry in a structured-data list must be an object — a list of strings or numbers is not structured data." };
    }
    return { ok: true, value: parsed, nodes: parsed.length };
  }
  if (!isNode(parsed)) {
    return { ok: false, error: "Structured data must be a JSON object, or a list of them. A bare value in a JSON-LD script is ignored by every crawler." };
  }
  return { ok: true, value: parsed, nodes: 1 };
}

/**
 * The escaped body of the `<script type="application/ld+json">`.
 *
 * The wrap-and-slice is exactly what the module's own
 * `buildJsonLdScriptBodies` does, and for the same reason: emit the VALUE the
 * operator pasted — one object stays one object, a list stays a list — rather
 * than a one-element array wrapped around it. Escaping is `serializeJsonLd`'s,
 * never a second copy of the rules.
 */
export function structuredDataScriptBody(value: unknown): string {
  return serializeJsonLd([value as JsonLdObject]).slice(1, -1);
}

// ── Which mechanism a file's head uses ──────────────────────────────────────

export type SeoMechanism = "html" | "next-metadata" | "portal-document" | "unsupported";

export interface SeoMechanismAnswer {
  mechanism: SeoMechanism;
  /** What the editor is about to write into, or why it will not. One sentence. */
  sentence: string;
}

/**
 * App Router page and layout files, ANCHORED AT THE REPOSITORY ROOT.
 *
 * The anchoring is the navigator's lesson, paid for once already: unanchored,
 * this repository's own `built-ins/modules/agency-finance/src/pages/*.tsx`
 * read as routes. A folder called `app` six levels down is somebody's
 * component directory, not a router. `smoke-editor-surface-modes` cross-pins
 * this against `repositoryRoutes` so the two anchored rules cannot drift.
 *
 * The extension list is `repositoryRoutes`'s, minus `.mdx`, and that is the
 * second half of the same lesson. It used to be `tsx|jsx` alone while the
 * navigator derived routes from `js` and `mjs` too — so a repository written
 * in plain JavaScript got routes the SEO panel then refused BY NAME. A
 * `page.js` is an ordinary App Router page and its `metadata` export is
 * ordinary JavaScript; that was drift, not a decision. `.mdx` stays out on
 * purpose: an MDX page's head is built by whatever renders it, which is
 * exactly what the Markdown branch below says.
 */
const APP_ROUTER_HEAD = /^(?:src\/)?app\/(?:[^\n]*\/)?(?:page|layout)\.(?:tsx|jsx|js|mjs)$/;
/** The same rule, pages only — what `governingLayout` will answer for. */
const APP_ROUTER_PAGE = /^(?:src\/)?app\/(?:[^\n]*\/)?page\.(?:tsx|jsx|js|mjs)$/;
const PAGES_ROUTER_FILE = /^(?:src\/)?pages\//;
const HTML_FILE = /\.html?$/i;
const MARKDOWN_FILE = /\.(?:md|markdown|mdx)$/i;

export function seoMechanismFor(path: string): SeoMechanismAnswer {
  const file = (path ?? "").trim().replace(/^\.\//, "");
  if (!file) {
    return { mechanism: "unsupported", sentence: "No page file is selected, so there is nothing to write a head into." };
  }
  if (HTML_FILE.test(file)) {
    return { mechanism: "html", sentence: `Written as meta tags in ${file}'s <head>.` };
  }
  if (APP_ROUTER_HEAD.test(file)) {
    return { mechanism: "next-metadata", sentence: `Written as ${file}'s \`metadata\` export, which is how the App Router builds a head.` };
  }
  if (PAGES_ROUTER_FILE.test(file)) {
    return {
      mechanism: "unsupported",
      sentence: `${file} is a Pages Router page. Its head is \`<Head>\` JSX inside the component, and the editor will not guess a place inside somebody's JSX to put it — add the <Head> yourself and edit it in Dev mode.`,
    };
  }
  if (MARKDOWN_FILE.test(file)) {
    return {
      mechanism: "unsupported",
      sentence: `${file} is Markdown. Its head is built by whatever renders it — a layout, a generator, a CMS — so there is no head in this file to write into.`,
    };
  }
  return {
    mechanism: "unsupported",
    sentence: `${file} is not a page whose head the editor knows how to write. It handles .html files and App Router page / layout files (.tsx, .jsx, .js, .mjs).`,
  };
}

/**
 * The App Router layout that governs a page — the nearest one above it.
 *
 * This exists because the engine could always write `app/layout.tsx` and the
 * UI could never point at one: the navigator lists ROUTES, a layout is not a
 * route, and so a capability the panel advertised in its own refusal sentence
 * was unreachable from the screen. The answer is to mount it, not to delete
 * it — a site's default title genuinely does live in the root layout, and
 * "built and never mounted" is the disease this whole pass exists to treat.
 *
 * Nearest wins, exactly as Next resolves it: `app/(marketing)/blog/layout.tsx`
 * before `app/(marketing)/layout.tsx` before `app/layout.tsx`. Route-group
 * folders need no special case — walking the directory chain is already what
 * Next does. Null when the file is not an App Router page, or when the
 * repository has no layout above it.
 *
 * @param pageFile the page whose layout is wanted, repository-relative.
 * @param files the repository's file list, as the navigator was given it.
 */
export function governingLayout(pageFile: string, files: readonly string[]): string | null {
  const file = (pageFile ?? "").trim().replace(/^\.\//, "");
  if (!APP_ROUTER_PAGE.test(file)) return null;
  const known = new Set(
    files.map(entry => (typeof entry === "string" ? entry.trim().replace(/^\.\//, "") : "")).filter(Boolean),
  );
  const segments = file.split("/");
  segments.pop();
  // Never walk above the router root — `src/app` or `app`. A `layout.tsx` in
  // the repository root is not a layout, it is somebody's component.
  const floor = segments[0] === "src" ? 2 : 1;
  while (segments.length >= floor) {
    for (const extension of ["tsx", "jsx", "js", "mjs"]) {
      const candidate = [...segments, `layout.${extension}`].join("/");
      if (known.has(candidate)) return candidate;
    }
    segments.pop();
  }
  return null;
}

/** Which fields a mechanism can actually carry, and why not when it cannot. */
export function mechanismRefusesField(mechanism: SeoMechanism, field: PageSeoField): string | null {
  if (mechanism === "next-metadata" && field === "structuredData") {
    return "Next's metadata export has nowhere to put JSON-LD — structured data is a <script> the page itself renders. Put it in the page's JSX in Dev mode, or set it on an .html page.";
  }
  return null;
}

/** The fields this mechanism will write, in panel order. */
export function mechanismFields(mechanism: SeoMechanism): PageSeoField[] {
  return PAGE_SEO_FIELDS.filter(field => !mechanismRefusesField(mechanism, field));
}

// ── Emitting ────────────────────────────────────────────────────────────────

/**
 * The marker pair. Everything between them belongs to the editor; everything
 * outside them is somebody's own work and is never touched.
 */
export const HTML_SEO_OPEN = "<!-- aqua:seo -->";
export const HTML_SEO_CLOSE = "<!-- /aqua:seo -->";
export const TS_SEO_OPEN = "// aqua:seo";
export const TS_SEO_CLOSE = "// /aqua:seo";

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unescapeAttribute(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    // Ampersand LAST, so `&amp;lt;` comes back as `&lt;` rather than `<`.
    .replace(/&amp;/g, "&");
}

function robotsContent(seo: PageSeo): string {
  return `${seo.index ? "index" : "noindex"}, ${seo.follow ? "follow" : "nofollow"}`;
}

/**
 * The `<head>` lines for an HTML page — the block, markers included.
 *
 * A field with no value emits no tag. An empty `<meta name="description"
 * content="">` is worse than none: it tells a crawler the page has decided it
 * has no description.
 */
export function emitHtmlSeoBlock(seo: PageSeo, indent = "  "): string[] {
  const lines: string[] = [];
  const push = (line: string) => lines.push(`${indent}${line}`);
  push(HTML_SEO_OPEN);
  if (seo.title) push(`<title>${escapeAttribute(seo.title)}</title>`);
  if (seo.description) push(`<meta name="description" content="${escapeAttribute(seo.description)}" />`);
  if (seo.canonical) push(`<link rel="canonical" href="${escapeAttribute(seo.canonical)}" />`);
  // Emitted only when it says something. "index, follow" is what a page does
  // anyway, so writing it is a tag that carries no information.
  if (!seo.index || !seo.follow) push(`<meta name="robots" content="${robotsContent(seo)}" />`);
  if (seo.ogTitle) push(`<meta property="og:title" content="${escapeAttribute(seo.ogTitle)}" />`);
  if (seo.ogDescription) push(`<meta property="og:description" content="${escapeAttribute(seo.ogDescription)}" />`);
  if (seo.ogImage) push(`<meta property="og:image" content="${escapeAttribute(seo.ogImage)}" />`);
  if (seo.ogTitle || seo.ogDescription || seo.ogImage) push(`<meta name="twitter:card" content="${seo.twitterCard}" />`);
  const parsed = parseStructuredData(seo.structuredData);
  if (parsed.ok && parsed.value !== null) {
    push(`<script type="application/ld+json">${structuredDataScriptBody(parsed.value)}</script>`);
  }
  push(HTML_SEO_CLOSE);
  return lines;
}

/**
 * The Next metadata object — as JSON, deliberately.
 *
 * JSON is a subset of a TypeScript object literal, so this is valid source AND
 * something the editor can read back with `JSON.parse` instead of parsing
 * TypeScript. The alternative — writing a hand-shaped literal and later
 * regexing values out of it — is how a round trip starts losing quotes.
 *
 * No `: Metadata` annotation and no import added: the annotation buys nothing
 * at runtime and would mean this module quietly editing somebody's import
 * block, which is exactly the kind of reach it refuses everywhere else.
 */
export function nextMetadataObject(seo: PageSeo): Record<string, unknown> {
  const object: Record<string, unknown> = {};
  if (seo.title) object.title = seo.title;
  if (seo.description) object.description = seo.description;
  if (seo.canonical) object.alternates = { canonical: seo.canonical };
  if (!seo.index || !seo.follow) object.robots = { index: seo.index, follow: seo.follow };
  const openGraph: Record<string, unknown> = {};
  if (seo.ogTitle) openGraph.title = seo.ogTitle;
  if (seo.ogDescription) openGraph.description = seo.ogDescription;
  if (seo.ogImage) openGraph.images = [seo.ogImage];
  if (Object.keys(openGraph).length) {
    object.openGraph = openGraph;
    object.twitter = { card: seo.twitterCard };
  }
  return object;
}

export function emitNextMetadataBlock(seo: PageSeo): string[] {
  const json = JSON.stringify(nextMetadataObject(seo), null, 2);
  return [
    TS_SEO_OPEN,
    "// Managed by the Aqua Editor's Website surface. Plain JSON on purpose, so",
    "// the editor reads back exactly what it wrote. Edit it here or there.",
    `export const metadata = ${json};`,
    TS_SEO_CLOSE,
  ];
}

// ── The file's own line endings ─────────────────────────────────────────────
//
// A CRLF file must come back out a CRLF file.
//
// `contents.split(/\r?\n/)` … `.join("\n")` looks harmless and is not: it reads
// a Windows-authored page, changes a block in the middle, and rewrites EVERY
// line in the file. Found by the flow verifier on an 8-line CRLF `.html` — 170
// bytes went in, 233 came out, with not one CRLF left in it. That makes
// "nothing outside the two markers is touched" a false claim, and turns a
// one-tag change into a whole-file diff in somebody's pull request.
//
// So the terminators travel WITH the text and go back exactly where they were.
// Only the lines the editor itself writes get a new one, and it is whichever
// the rest of the file already uses.

interface SourceLines {
  /** Each line's text, terminator stripped — what every rule below reads. */
  text: string[];
  /** The terminator that FOLLOWED that line. "" on the last one. */
  eol: string[];
  /** What a line the editor ADDS ends with: whatever the file mostly uses. */
  dominant: string;
}

function splitSourceLines(source: string): SourceLines {
  const text: string[] = [];
  const eol: string[] = [];
  let start = 0;
  let crlf = 0;
  let lf = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "\n") continue;
    const carriage = index > start && source[index - 1] === "\r";
    text.push(source.slice(start, carriage ? index - 1 : index));
    eol.push(carriage ? "\r\n" : "\n");
    if (carriage) crlf += 1;
    else lf += 1;
    start = index + 1;
  }
  // Whatever follows the last terminator — "" when the file ends with one.
  text.push(source.slice(start));
  eol.push("");
  // A tie goes to "\n": a file with no newline at all has neither, and "\n" is
  // what every other writer in this codebase emits.
  return { text, eol, dominant: crlf > lf ? "\r\n" : "\n" };
}

/** Text and terminators back into one string, byte for byte. */
function joinSourceLines(lines: SourceLines): string {
  let out = "";
  for (let index = 0; index < lines.text.length; index += 1) out += lines.text[index] + lines.eol[index];
  return out;
}

/**
 * Replace `count` lines at `start` with `insert`, keeping every OTHER line's
 * terminator exactly the bytes it already was.
 */
function spliceSourceLines(lines: SourceLines, start: number, count: number, insert: string[]): SourceLines {
  // FLATTENED first. An emitted "line" is not always one line: the Next
  // metadata block hands over `JSON.stringify(…, null, 2)` as a single array
  // entry with newlines inside it. Left whole, those newlines would be the
  // module's own "\n" sitting inside a CRLF file — which is the bug this
  // whole section exists to stop, just one level down.
  const added = insert.flatMap(line => line.split("\n"));
  const next: SourceLines = {
    text: [...lines.text.slice(0, start), ...added, ...lines.text.slice(start + count)],
    eol: [...lines.eol.slice(0, start), ...added.map(() => lines.dominant), ...lines.eol.slice(start + count)],
    dominant: lines.dominant,
  };
  // Only the LAST line may end without a terminator. Inserting after a file's
  // final line would otherwise weld two lines into one.
  for (let index = 0; index < next.eol.length - 1; index += 1) {
    if (!next.eol[index]) next.eol[index] = lines.dominant;
  }
  // A file that did not end in a newline still does not — but only when we
  // ADDED lines at the end. Removing a block that ran to EOF leaves the
  // preceding line's own terminator alone, because that byte was never ours.
  if (added.length && start + count >= lines.text.length && next.eol.length) {
    next.eol[next.eol.length - 1] = lines.eol[lines.eol.length - 1];
  }
  return next;
}

// ── Reading it back ─────────────────────────────────────────────────────────

export interface PageSeoRead {
  seo: PageSeo;
  /** True when the editor's own block is in the file. */
  found: boolean;
  /**
   * A head this editor did not write — a hand-written `<title>`, an existing
   * `export const metadata`. Named so the panel can say so instead of
   * silently competing with it.
   */
  conflict: string | null;
}

function blockRange(lines: string[], open: string, close: string): { start: number; end: number } | null {
  const start = lines.findIndex(line => line.trim() === open);
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && line.trim() === close);
  if (end < 0) return null;
  return { start, end };
}

const HTML_TITLE = /<title>([\s\S]*?)<\/title>/i;
const HTML_META_NAME = /<meta\s+name="([^"]+)"\s+content="([^"]*)"/i;
const HTML_META_PROPERTY = /<meta\s+property="([^"]+)"\s+content="([^"]*)"/i;
const HTML_CANONICAL = /<link\s+rel="canonical"\s+href="([^"]*)"/i;
const HTML_JSONLD = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/i;

function readHtmlBlock(lines: string[]): PageSeo {
  const seo: PageSeo = { ...EMPTY_PAGE_SEO };
  for (const line of lines) {
    const title = HTML_TITLE.exec(line);
    if (title) { seo.title = unescapeAttribute(title[1].trim()); continue; }
    const canonical = HTML_CANONICAL.exec(line);
    if (canonical) { seo.canonical = unescapeAttribute(canonical[1]); continue; }
    const jsonLd = HTML_JSONLD.exec(line);
    if (jsonLd) { seo.structuredData = jsonLd[1].trim(); continue; }
    const named = HTML_META_NAME.exec(line);
    if (named) {
      const value = unescapeAttribute(named[2]);
      if (named[1].toLowerCase() === "description") seo.description = value;
      if (named[1].toLowerCase() === "twitter:card") seo.twitterCard = value === "summary" ? "summary" : "summary_large_image";
      if (named[1].toLowerCase() === "robots") {
        seo.index = !/\bnoindex\b/i.test(value);
        seo.follow = !/\bnofollow\b/i.test(value);
      }
      continue;
    }
    const property = HTML_META_PROPERTY.exec(line);
    if (property) {
      const value = unescapeAttribute(property[2]);
      if (property[1].toLowerCase() === "og:title") seo.ogTitle = value;
      if (property[1].toLowerCase() === "og:description") seo.ogDescription = value;
      if (property[1].toLowerCase() === "og:image") seo.ogImage = value;
    }
  }
  return seo;
}

function readNextMetadataBlock(lines: string[]): PageSeo {
  const source = lines.join("\n");
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return { ...EMPTY_PAGE_SEO };
  let object: Record<string, unknown>;
  try {
    object = JSON.parse(source.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    // The block is ours but somebody has hand-edited it into something JSON
    // cannot read. Empty is the honest answer; `conflict` says the rest.
    return { ...EMPTY_PAGE_SEO };
  }
  const seo: PageSeo = { ...EMPTY_PAGE_SEO };
  const alternates = (object.alternates ?? {}) as Record<string, unknown>;
  const robots = (object.robots ?? {}) as Record<string, unknown>;
  const openGraph = (object.openGraph ?? {}) as Record<string, unknown>;
  const twitter = (object.twitter ?? {}) as Record<string, unknown>;
  const images = Array.isArray(openGraph.images) ? openGraph.images : [];
  seo.title = oneLine(object.title);
  seo.description = oneLine(object.description);
  seo.canonical = oneLine(alternates.canonical);
  seo.index = robots.index === false ? false : true;
  seo.follow = robots.follow === false ? false : true;
  seo.ogTitle = oneLine(openGraph.title);
  seo.ogDescription = oneLine(openGraph.description);
  seo.ogImage = oneLine(images[0]);
  seo.twitterCard = twitter.card === "summary" ? "summary" : "summary_large_image";
  return seo;
}

/** A head somebody else wrote, in this file, outside the editor's block. */
function conflictOutsideBlock(
  contents: string,
  mechanism: SeoMechanism,
  block: { start: number; end: number } | null,
  lines: string[],
): string | null {
  const outside = lines
    .filter((_, index) => !block || index < block.start || index > block.end)
    .join("\n");
  if (mechanism === "html") {
    if (/<title>/i.test(outside)) {
      return "This page already has its own <title> outside the editor's block. Two titles in one head is a coin toss — remove one.";
    }
    if (/<meta\s+name="description"/i.test(outside)) {
      return "This page already has its own description meta tag outside the editor's block, so the page would ship two.";
    }
    return null;
  }
  if (mechanism === "next-metadata") {
    if (/^\s*export\s+(?:async\s+)?function\s+generateMetadata\b/m.test(outside)) {
      return "This page builds its metadata in code with `generateMetadata`, which wins over a static export. The editor will not write a `metadata` export that Next would ignore.";
    }
    if (/^\s*export\s+const\s+metadata\b/m.test(outside)) {
      return "This page already exports its own `metadata`. Two exports of the same name will not compile, and the editor will not delete somebody's.";
    }
    if (/^\s*["']use client["']\s*;?\s*$/m.test(contents)) {
      return "This is a Client Component (\"use client\"), and Next refuses a `metadata` export from one. Its head belongs in the layout above it, or in a server wrapper.";
    }
    return null;
  }
  return null;
}

/** What the file currently says — the editor's block, and whatever else. */
export function readPageSeo(input: { contents: string; file: string }): PageSeoRead {
  const mechanism = seoMechanismFor(input.file).mechanism;
  // The SAME splitter the planner uses, so the block a read finds and the block
  // a write replaces can never be two different sets of lines.
  const lines = splitSourceLines(input.contents ?? "").text;
  if (mechanism === "html") {
    const block = blockRange(lines, HTML_SEO_OPEN, HTML_SEO_CLOSE);
    const seo = block ? readHtmlBlock(lines.slice(block.start + 1, block.end)) : { ...EMPTY_PAGE_SEO };
    return { seo, found: Boolean(block), conflict: conflictOutsideBlock(input.contents, mechanism, block, lines) };
  }
  if (mechanism === "next-metadata") {
    const block = blockRange(lines, TS_SEO_OPEN, TS_SEO_CLOSE);
    const seo = block ? readNextMetadataBlock(lines.slice(block.start + 1, block.end)) : { ...EMPTY_PAGE_SEO };
    return { seo, found: Boolean(block), conflict: conflictOutsideBlock(input.contents, mechanism, block, lines) };
  }
  return { seo: { ...EMPTY_PAGE_SEO }, found: false, conflict: null };
}

// ── Planning the edit ───────────────────────────────────────────────────────

export type PageSeoRefusalReason = "unsupported" | "no-head" | "conflict" | "invalid" | "no-change";

export type PageSeoPlan =
  | {
      ok: true;
      newContents: string;
      /** What goes in — the diff the operator confirms before anything is written. */
      lines: string[];
      /** 1-based line the block starts on in the NEW contents. */
      line: number;
      /** `replace` when the editor's block was already there. */
      action: "insert" | "replace" | "remove";
      mechanism: SeoMechanism;
      summary: string;
    }
  | {
      ok: false;
      reason: "unsupported" | "no-head" | "conflict" | "invalid" | "no-change";
      detail: string;
    };

/** Where a metadata export may be inserted: after the prologue, nowhere else. */
function nextMetadataAnchor(lines: string[]): number {
  let index = 0;
  let inImport = false;
  let inBlockComment = false;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (inBlockComment) {
      index += 1;
      if (trimmed.includes("*/")) inBlockComment = false;
      continue;
    }
    if (inImport) {
      index += 1;
      // A multi-line import ends on the line that names the module.
      if (/from\s+["'][^"']+["']\s*;?\s*$/.test(trimmed) || /^["'][^"']+["']\s*;?\s*$/.test(trimmed)) inImport = false;
      continue;
    }
    if (!trimmed) { index += 1; continue; }
    if (trimmed.startsWith("//")) { index += 1; continue; }
    if (trimmed.startsWith("/*")) {
      inBlockComment = !trimmed.includes("*/");
      index += 1;
      continue;
    }
    // `"use client"` / `"use server"` — a directive, and it must stay first.
    if (/^["']use [a-z-]+["']\s*;?$/.test(trimmed)) { index += 1; continue; }
    if (/^import\b/.test(trimmed)) {
      const single = /from\s+["'][^"']+["']\s*;?\s*$/.test(trimmed) || /^import\s+["'][^"']+["']\s*;?\s*$/.test(trimmed);
      inImport = !single;
      index += 1;
      continue;
    }
    break;
  }
  return index;
}

/**
 * The whole edit, as new file contents — or a typed refusal saying why not.
 *
 * Nothing here writes anything. The caller previews these exact lines, a human
 * confirms them, and only then do they go to `saveRepoFile` — the same two-step
 * the element insert uses, for the same reason: a commit nobody read is how an
 * editor loses trust in one afternoon.
 */
export function planPageSeoEdit(input: { contents: string; file: string; seo: PageSeo }): PageSeoPlan {
  const answer = seoMechanismFor(input.file);
  if (answer.mechanism === "unsupported" || answer.mechanism === "portal-document") {
    return { ok: false, reason: "unsupported", detail: answer.sentence };
  }
  const seo = normalisePageSeo(input.seo);
  const blocking = pageSeoBlocked(seo);
  if (blocking.length) {
    return { ok: false, reason: "invalid", detail: blocking.map(problem => problem.message).join(" ") };
  }

  const source = input.contents ?? "";
  // Text for every rule below; terminators kept beside it so the bytes outside
  // the markers come back out unchanged — see `splitSourceLines`.
  const split = splitSourceLines(source);
  const lines = split.text;
  const current = readPageSeo({ contents: source, file: input.file });
  if (current.conflict) {
    return { ok: false, reason: "conflict", detail: current.conflict };
  }

  const open = answer.mechanism === "html" ? HTML_SEO_OPEN : TS_SEO_OPEN;
  const close = answer.mechanism === "html" ? HTML_SEO_CLOSE : TS_SEO_CLOSE;
  const block = blockRange(lines, open, close);
  const empty = pageSeoIsEmpty(seo);

  if (block && empty) {
    const next = spliceSourceLines(split, block.start, block.end - block.start + 1, []);
    return {
      ok: true,
      newContents: joinSourceLines(next),
      lines: [],
      line: block.start + 1,
      action: "remove",
      mechanism: answer.mechanism,
      summary: `Every field is empty, so the editor's block comes OUT of ${input.file} rather than being left there saying nothing.`,
    };
  }
  if (!block && empty) {
    return { ok: false, reason: "no-change", detail: "There is nothing filled in, and this page has no editor block to remove." };
  }

  // WHERE an HTML block lands, worked out before it is emitted — the answer
  // also decides its indentation, and a head block indented differently from
  // the tags beside it looks like somebody's mistake.
  const headIndex = answer.mechanism === "html" ? lines.findIndex(line => /<head[\s>]/i.test(line)) : -1;
  let htmlAnchor = headIndex;
  if (answer.mechanism === "html" && headIndex >= 0) {
    // AFTER the charset declaration when there is one, not simply after
    // `<head>`. The character encoding has to be declared inside the first
    // 1024 bytes of the document, and a title with a long name in it can push
    // it out — so the one tag that must stay near the top keeps its place.
    for (let index = headIndex + 1; index < lines.length; index += 1) {
      if (/<\/head>/i.test(lines[index])) break;
      if (/<meta\s[^>]*charset/i.test(lines[index])) { htmlAnchor = index; break; }
    }
  }
  const indentOf = (line: string | undefined) => line?.match(/^[ \t]*/)?.[0] ?? "";
  let indent = "  ";
  if (block) {
    // Replacing: keep exactly the indentation the existing block had.
    indent = indentOf(lines[block.start]);
  } else if (answer.mechanism === "html" && headIndex >= 0) {
    // Inserting: match the tag it lands beside, or step in one level from
    // `<head>` when the head is empty.
    indent = htmlAnchor === headIndex ? `${indentOf(lines[headIndex])}  ` : indentOf(lines[htmlAnchor]);
  }
  const emitted = answer.mechanism === "html" ? emitHtmlSeoBlock(seo, indent) : emitNextMetadataBlock(seo);

  if (block) {
    const unchanged = lines.slice(block.start, block.end + 1).join("\n") === emitted.join("\n");
    if (unchanged) {
      return { ok: false, reason: "no-change", detail: `${input.file} already says exactly this.` };
    }
    const next = spliceSourceLines(split, block.start, block.end - block.start + 1, emitted);
    return {
      ok: true,
      newContents: joinSourceLines(next),
      lines: emitted,
      line: block.start + 1,
      action: "replace",
      mechanism: answer.mechanism,
      summary: `Replaces the editor's existing SEO block in ${input.file}. Nothing outside the two markers is touched.`,
    };
  }

  if (answer.mechanism === "html") {
    // Into the `<head>`, and nowhere else. A page with no head is refused
    // rather than given one: deciding where a head belongs in somebody's
    // document is precisely the guess this module does not make.
    if (headIndex < 0) {
      return {
        ok: false,
        reason: "no-head",
        detail: `${input.file} has no <head> for these tags to go in. Add one and the editor will fill it.`,
      };
    }
    const next = spliceSourceLines(split, htmlAnchor + 1, 0, emitted);
    return {
      ok: true,
      newContents: joinSourceLines(next),
      lines: emitted,
      line: htmlAnchor + 2,
      action: "insert",
      mechanism: "html",
      summary: `Adds an SEO block near the top of ${input.file}'s <head>${htmlAnchor === headIndex ? "" : ", just after its charset"}. Nothing already in the head is changed.`,
    };
  }

  const anchor = nextMetadataAnchor(lines);
  // One blank line either side, so the export does not weld itself to the last
  // import or the first component line.
  const blankBefore = anchor > 0 && lines[anchor - 1].trim() !== "";
  const blankAfter = anchor < lines.length && lines[anchor].trim() !== "";
  const inserted = [...(blankBefore ? [""] : []), ...emitted, ...(blankAfter ? [""] : [])];
  const next = spliceSourceLines(split, anchor, 0, inserted);
  return {
    ok: true,
    newContents: joinSourceLines(next),
    lines: emitted,
    line: anchor + (blankBefore ? 1 : 0) + 1,
    action: "insert",
    mechanism: "next-metadata",
    summary: `Adds a \`metadata\` export to ${input.file}, after its imports. Nothing else in the file is changed.`,
  };
}
