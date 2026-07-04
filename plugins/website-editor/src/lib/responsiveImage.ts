// R038 — Responsive image attrs helper.
//
// Pure builder: given a source URL + intent (hero / card / thumb /
// full-width), emits the `srcset`, `sizes`, `loading`, `decoding`,
// and (when relevant) `fetchpriority` attributes the renderer should
// stamp on the `<img>` element.
//
// Honesty contract — we do NOT promise the URL endpoints actually
// resolve. The helper appends a `?w=<W>` query param assuming a
// generic CDN resize layer; the host wires the real resize service
// in T6. Calling on a static URL with no resize backend just yields
// a srcset of identical-content URLs differing only by query string,
// which is harmless (browser still picks one).

import type { Block } from "../types/block";

// ─── Intent presets ───────────────────────────────────────────────────

export type ImageIntent = "hero" | "card" | "thumb" | "full-width";

export interface ImageAttrs {
  src: string;
  srcset: string;
  sizes: string;
  loading: "eager" | "lazy";
  decoding: "async" | "sync" | "auto";
  fetchpriority?: "high" | "low" | "auto";
}

interface IntentPreset {
  widths: number[];
  sizes: string;
  loading: "eager" | "lazy";
  fetchpriority?: "high" | "low" | "auto";
}

const PRESETS: Record<ImageIntent, IntentPreset> = {
  hero: {
    widths: [640, 960, 1280, 1600, 2400],
    sizes: "100vw",
    loading: "eager",
    fetchpriority: "high",
  },
  card: {
    widths: [320, 480, 640],
    sizes: "(max-width: 640px) 100vw, 33vw",
    loading: "lazy",
  },
  thumb: {
    widths: [160, 240],
    sizes: "120px",
    loading: "lazy",
  },
  "full-width": {
    widths: [960, 1280, 1600, 2000],
    sizes: "100vw",
    loading: "lazy",
  },
};

export function intentPresets(): Readonly<Record<ImageIntent, IntentPreset>> {
  return PRESETS;
}

// ─── CDN resize helper ────────────────────────────────────────────────

export interface ResizeOpts {
  resizeParam?: string;   // default "w"
}

// Append (or replace) a width query param on the URL. Idempotent —
// `withCdnResize(withCdnResize(s, 320), 640)` returns the URL with a
// single `?w=640` rather than `?w=320&w=640`.
export function withCdnResize(src: string, w: number, opts: ResizeOpts = {}): string {
  const param = opts.resizeParam ?? "w";
  // Split off any fragment so we don't trample on `#anchor`.
  const hashAt = src.indexOf("#");
  const hash = hashAt >= 0 ? src.slice(hashAt) : "";
  const base = hashAt >= 0 ? src.slice(0, hashAt) : src;
  const qAt = base.indexOf("?");
  const path = qAt >= 0 ? base.slice(0, qAt) : base;
  const query = qAt >= 0 ? base.slice(qAt + 1) : "";
  const parts = query.length === 0 ? [] : query.split("&");
  const filtered = parts.filter((p) => {
    const eqAt = p.indexOf("=");
    const k = eqAt >= 0 ? p.slice(0, eqAt) : p;
    return k !== param;
  });
  filtered.push(`${param}=${w}`);
  return `${path}?${filtered.join("&")}${hash}`;
}

// ─── buildImageAttrs ──────────────────────────────────────────────────

export interface BuildImageOpts extends ResizeOpts {
  // Override the loading attribute (e.g. force eager for above-the-
  // fold cards). Optional — preset wins by default.
  loading?: "eager" | "lazy";
  // Override fetchpriority. Optional.
  fetchpriority?: "high" | "low" | "auto";
}

export function buildImageAttrs(
  src: string,
  intent: ImageIntent,
  opts: BuildImageOpts = {},
): ImageAttrs {
  const preset = PRESETS[intent];
  const srcset = preset.widths
    .map((w) => `${withCdnResize(src, w, opts)} ${w}w`)
    .join(", ");
  // The `src` attribute holds the largest variant — UAs without
  // srcset support fall back to this.
  const fallbackWidth = preset.widths[preset.widths.length - 1]!;
  const out: ImageAttrs = {
    src: withCdnResize(src, fallbackWidth, opts),
    srcset,
    sizes: preset.sizes,
    loading: opts.loading ?? preset.loading,
    decoding: "async",
  };
  const fp = opts.fetchpriority ?? preset.fetchpriority;
  if (fp) out.fetchpriority = fp;
  return out;
}

// ─── auditImage ───────────────────────────────────────────────────────

export type ImageAuditCode =
  | "missing-alt"
  | "missing-width"
  | "missing-height"
  | "absolute-url-not-allowed"
  | "missing-src";

export interface ImageAuditIssue {
  code: ImageAuditCode;
  message: string;
}

export interface AuditOpts {
  // Hostnames the host has whitelisted for absolute URLs. Absolute
  // URLs whose host is not in this list flag `absolute-url-not-allowed`.
  // Empty / undefined → absolute URLs always flag.
  domainAllowlist?: string[];
}

function isAbsoluteUrl(s: string): boolean {
  return /^[a-z]+:\/\//i.test(s);
}

function hostOf(url: string): string | null {
  try { return new URL(url).host.toLowerCase(); } catch { return null; }
}

export function auditImage(block: Block, opts: AuditOpts = {}): ImageAuditIssue[] {
  const issues: ImageAuditIssue[] = [];
  const props = block.props ?? {};
  const src = typeof props.src === "string" ? props.src : "";
  if (src.length === 0) {
    issues.push({ code: "missing-src", message: "image block has no src" });
  }
  const altFromA11y = block.a11y?.alt;
  const altFromProps = typeof props.alt === "string" ? props.alt : undefined;
  if (!altFromA11y && !altFromProps) {
    issues.push({ code: "missing-alt", message: "image has no alt text (a11y + SEO)" });
  }
  if (typeof props.width !== "number" && typeof props.width !== "string") {
    issues.push({ code: "missing-width", message: "missing width — CLS risk" });
  }
  if (typeof props.height !== "number" && typeof props.height !== "string") {
    issues.push({ code: "missing-height", message: "missing height — CLS risk" });
  }
  if (src && isAbsoluteUrl(src)) {
    const host = hostOf(src);
    const allow = opts.domainAllowlist?.map((h) => h.toLowerCase()) ?? [];
    if (!host || !allow.includes(host)) {
      issues.push({
        code: "absolute-url-not-allowed",
        message: `absolute URL ${src} not in domain allowlist`,
      });
    }
  }
  return issues;
}
