// R032 — i18n / multi-language per page.
//
// Pure helpers operating on a `LocalePageMap` data shape:
//
//   { defaultLocale: "en", locales: { en: { tree, meta }, fr: …, … } }
//
// Host page integrates by adding `locales?: LocalePageMap` to EditorPage
// (one-line schema extension done at host integration time). Storefront
// SSR calls `resolveLocale(req, page)` to pick which tree to render and
// `localizedTree(page, locale)` to pull the matched (or fallback) tree
// + a `wasFallback` flag the layout uses to render the "this page hasn't
// been translated" banner.

import type { Block } from "../types/block";

export interface LocalizedPage {
  tree: Block[];
  meta?: {
    title?: string;
    description?: string;
    [k: string]: unknown;
  };
  /** ISO timestamp the operator last edited this locale's tree. */
  updatedAt?: number;
  /** Optional translator note ("auto-translated", "human-reviewed"). */
  source?: "human" | "auto" | "machine-paste";
}

export interface LocalePageMap {
  defaultLocale: string;
  locales: Record<string, LocalizedPage>;
}

// ─── BCP-47 normalisation ─────────────────────────────────────────────────

/**
 * Lowercase the language subtag, uppercase the region, drop all but the
 * first two subtags. `EN-us` → `en-US`, `FR` → `fr`, garbage → null.
 */
export function normaliseLocale(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = /^([a-z]{2,3})(?:[-_]([a-z]{2,3}))?$/i.exec(input.trim());
  if (!m) return null;
  const lang = m[1]!.toLowerCase();
  const region = m[2]?.toUpperCase();
  return region ? `${lang}-${region}` : lang;
}

// ─── URL prefix routing ───────────────────────────────────────────────────

/**
 * If pathname starts with `/<locale>/...` where `<locale>` matches a
 * locale present on the page, returns `{ locale, restPath }`. If no
 * prefix matches, returns null.
 *
 * Compares locales case-insensitively (URL `/FR/` still matches the
 * canonical `fr` locale).
 */
export function parseLocalePrefix(
  pathname: string,
  available: ReadonlyArray<string>,
): { locale: string; restPath: string } | null {
  const m = /^\/([^/]+)(\/.*|$)/.exec(pathname);
  if (!m) return null;
  const candidate = normaliseLocale(m[1]!);
  if (!candidate) return null;
  const found = available.find(loc => loc.toLowerCase() === candidate.toLowerCase());
  if (!found) return null;
  return { locale: found, restPath: m[2] || "/" };
}

// ─── Accept-Language parsing ──────────────────────────────────────────────

/**
 * Parses an HTTP `Accept-Language` header into a quality-sorted list of
 * locale tags. Malformed entries are skipped silently.
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  const out: Array<{ tag: string; q: number }> = [];
  for (const part of header.split(",")) {
    const [rawTag, ...params] = part.split(";").map(s => s.trim());
    if (!rawTag || rawTag === "*") continue;
    const tag = normaliseLocale(rawTag);
    if (!tag) continue;
    let q = 1;
    for (const p of params) {
      const qm = /^q=([0-9.]+)$/i.exec(p);
      if (qm) q = parseFloat(qm[1]!);
    }
    if (Number.isFinite(q) && q > 0) out.push({ tag, q });
  }
  out.sort((a, b) => b.q - a.q);
  return out.map(o => o.tag);
}

// ─── Locale resolution ────────────────────────────────────────────────────

export interface ResolveLocaleInput {
  pathname?: string;
  acceptLanguage?: string | null;
  /** Explicit override, e.g. user cookie / query param. */
  override?: string | null;
}

export interface ResolveLocaleResult {
  locale: string;
  /** Where the choice came from — useful for logging + cache keys. */
  source: "override" | "url" | "accept-language" | "default";
  /** Pathname with the locale prefix stripped, if URL-routed. */
  restPath: string;
  /** True when the chosen locale is not present on the page. */
  wasFallback: boolean;
}

/**
 * Pick the locale to serve. Priority:
 *   1. explicit override (cookie / query)
 *   2. URL prefix
 *   3. Accept-Language header (first match — exact, then language-only)
 *   4. defaultLocale
 *
 * If the chosen tag isn't present on the page, returns the default with
 * `wasFallback=true`.
 */
export function resolveLocale(
  input: ResolveLocaleInput,
  page: LocalePageMap,
): ResolveLocaleResult {
  const available = Object.keys(page.locales);
  const { defaultLocale } = page;
  const pathname = input.pathname ?? "/";

  // 1. Override.
  const override = normaliseLocale(input.override);
  if (override) {
    const matched = matchLocale(override, available);
    if (matched) return { locale: matched, source: "override", restPath: pathname, wasFallback: false };
  }

  // 2. URL prefix.
  const prefix = parseLocalePrefix(pathname, available);
  if (prefix) {
    return { locale: prefix.locale, source: "url", restPath: prefix.restPath, wasFallback: false };
  }

  // 3. Accept-Language.
  const acceptTags = parseAcceptLanguage(input.acceptLanguage);
  for (const tag of acceptTags) {
    const matched = matchLocale(tag, available);
    if (matched) return { locale: matched, source: "accept-language", restPath: pathname, wasFallback: false };
  }

  // 4. Default.
  const def = matchLocale(defaultLocale, available) ?? defaultLocale;
  // wasFallback when caller asked for something specific via URL but it
  // wasn't present — already handled above (unmatched URL prefix simply
  // doesn't take). For pure-default this is not a fallback.
  return { locale: def, source: "default", restPath: pathname, wasFallback: false };
}

/**
 * Loose match: exact locale first, then language-only ("fr-CA" matches
 * an available "fr" if "fr-CA" isn't present).
 */
function matchLocale(tag: string, available: ReadonlyArray<string>): string | null {
  const exact = available.find(l => l.toLowerCase() === tag.toLowerCase());
  if (exact) return exact;
  const lang = tag.split("-")[0]!.toLowerCase();
  const langMatch = available.find(l => l.toLowerCase().split("-")[0] === lang);
  return langMatch ?? null;
}

// ─── Fallback-aware tree pull ─────────────────────────────────────────────

export interface LocalizedTreeResult {
  tree: Block[];
  meta?: LocalizedPage["meta"];
  locale: string;
  /** True when requested locale wasn't present and we used defaultLocale. */
  wasFallback: boolean;
}

export function localizedTree(page: LocalePageMap, locale: string): LocalizedTreeResult {
  const requested = page.locales[locale];
  if (requested) {
    return { tree: requested.tree, meta: requested.meta, locale, wasFallback: false };
  }
  const def = page.locales[page.defaultLocale];
  return {
    tree: def?.tree ?? [],
    meta: def?.meta,
    locale: page.defaultLocale,
    wasFallback: true,
  };
}

// ─── Localized URL builder ────────────────────────────────────────────────

/**
 * Produces a `/<locale>/<path>` URL — used by the editor language picker
 * and storefront `<link rel="alternate" hreflang>` emission.
 *
 * The default locale renders WITHOUT a prefix (`/about` not `/en/about`)
 * so existing public URLs stay stable.
 */
export function localizedUrl(
  pathname: string,
  locale: string,
  defaultLocale: string,
): string {
  const clean = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (locale === defaultLocale) return clean;
  if (clean === "/") return `/${locale}`;
  return `/${locale}${clean}`;
}

/**
 * Build `<link rel="alternate" hreflang="…">` tags for the page across
 * every available locale + the `x-default` reference. Storefront stamps
 * these into <head>.
 */
export function buildHreflangLinks(
  pathname: string,
  page: LocalePageMap,
  origin: string,
): string {
  const tags: string[] = [];
  for (const loc of Object.keys(page.locales)) {
    const href = origin + localizedUrl(pathname, loc, page.defaultLocale);
    tags.push(`<link rel="alternate" hreflang="${escapeAttr(loc)}" href="${escapeAttr(href)}">`);
  }
  const defHref = origin + localizedUrl(pathname, page.defaultLocale, page.defaultLocale);
  tags.push(`<link rel="alternate" hreflang="x-default" href="${escapeAttr(defHref)}">`);
  return tags.join("");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Auto-translate stub ──────────────────────────────────────────────────
//
// R032 ships only the operator-paste path. The "Auto translate" button
// in the editor sends the source tree to a host-side endpoint that
// decides whether to call a real machine-translation API (T6) or simply
// return the source unchanged.
//
// `cloneTreeForLocale(tree, opts)` walks the tree and rewrites visible
// string props (text, label, alt, ariaLabel, description, title,
// placeholder) by passing each through the supplied translator function.
// New ids are stamped so the locale tree and source tree don't share
// references.

export interface CloneTreeOpts {
  /**
   * Map source string → translated string. Async to leave room for a
   * real API in the future. The default (identity) preserves source
   * text — operator pastes their own translations on top.
   */
  translate?: (source: string, key: string) => Promise<string> | string;
  /** Optional id-suffix so cloned blocks are visibly distinct. */
  idSuffix?: string;
}

const TRANSLATABLE_PROPS = [
  "text", "label", "title", "description",
  "alt", "ariaLabel", "placeholder",
  "subtitle", "heading", "buttonText",
] as const;

export async function cloneTreeForLocale(
  tree: Block[],
  opts: CloneTreeOpts = {},
): Promise<Block[]> {
  const translate = opts.translate ?? (async (s) => s);
  const suffix = opts.idSuffix ?? "_loc";

  async function clone(b: Block): Promise<Block> {
    const props = { ...b.props };
    for (const k of TRANSLATABLE_PROPS) {
      const v = props[k];
      if (typeof v === "string" && v.length > 0) {
        props[k] = await translate(v, k);
      }
    }
    const next: Block = {
      ...b,
      id: `${b.id}${suffix}`,
      props,
    };
    if (b.children) {
      next.children = await Promise.all(b.children.map(clone));
    }
    return next;
  }

  return Promise.all(tree.map(clone));
}

// ─── Locale completeness audit ────────────────────────────────────────────
//
// Editor surfaces a per-locale status badge ("complete" / "missing N
// strings" / "untranslated"). Pure helper: walks the source tree and
// the target tree in parallel, counting blocks where any TRANSLATABLE
// prop is identical (untranslated) or missing.

export interface LocaleAuditResult {
  totalStrings: number;
  translated: number;
  untranslated: number;
  missingBlocks: number;
  complete: boolean;
}

export function auditLocale(
  sourceTree: Block[],
  targetTree: Block[],
): LocaleAuditResult {
  let totalStrings = 0;
  let translated = 0;
  let untranslated = 0;
  let missingBlocks = 0;

  function walk(src: Block[], tgt: Block[]): void {
    for (let i = 0; i < src.length; i++) {
      const sb = src[i]!;
      const tb = tgt[i];
      if (!tb) { missingBlocks += 1; continue; }
      for (const k of TRANSLATABLE_PROPS) {
        const sv = sb.props[k];
        const tv = tb.props[k];
        if (typeof sv !== "string" || sv.length === 0) continue;
        totalStrings += 1;
        if (typeof tv !== "string" || tv.length === 0) untranslated += 1;
        else if (tv === sv) untranslated += 1;
        else translated += 1;
      }
      if (sb.children && tb.children) walk(sb.children, tb.children);
      else if (sb.children && sb.children.length > 0) missingBlocks += sb.children.length;
    }
  }

  walk(sourceTree, targetTree);
  return {
    totalStrings,
    translated,
    untranslated,
    missingBlocks,
    complete: untranslated === 0 && missingBlocks === 0 && totalStrings > 0,
  };
}
