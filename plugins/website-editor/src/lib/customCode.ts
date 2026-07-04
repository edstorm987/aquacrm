// R029 — Custom code validation + storefront render helper.
//
// Operators paste CSS into a variant-level `customCss?` and HTML
// fragments into `customHead?`. Both are size-capped + scanned for
// `<script>` content per prompt's "JavaScript injection rejected"
// gate. The render helper interleaves brand-kit vars + customCss
// inside a `<style>` block between brand vars and block styles.

export const CUSTOM_CSS_MAX_BYTES = 8 * 1024;       // 8 KiB
export const CUSTOM_HEAD_MAX_BYTES = 4 * 1024;      // 4 KiB

export type CustomCodeKind = "css" | "head";

export interface ValidationResult {
  ok: boolean;
  reason?: "too-large" | "script-detected" | "iframe-detected" | "javascript-uri";
  detail?: string;
  sizeBytes: number;
}

const SCRIPT_RE = /<\s*script\b/i;
const IFRAME_RE = /<\s*iframe\b/i;
// `javascript:` URI in href/src
const JS_URI_RE = /\b(?:href|src|action|formaction|onload|onerror|onclick|onfocus)\s*=\s*["']?\s*javascript\s*:/i;

function byteLength(s: string): number {
  // TextEncoder gives accurate UTF-8 byte length (caps measured in
  // bytes not characters so multibyte runes count correctly).
  return new TextEncoder().encode(s).byteLength;
}

export function validateCustomCode(value: string, kind: CustomCodeKind): ValidationResult {
  const cap = kind === "css" ? CUSTOM_CSS_MAX_BYTES : CUSTOM_HEAD_MAX_BYTES;
  const sizeBytes = byteLength(value);
  if (sizeBytes > cap) {
    return { ok: false, reason: "too-large", detail: `${sizeBytes} > ${cap}`, sizeBytes };
  }
  // Both kinds reject `<script>` — CSS shouldn't have it; head
  // fragment is for `<link>` / `<meta>` / `<style>` only.
  if (SCRIPT_RE.test(value)) {
    return { ok: false, reason: "script-detected", sizeBytes };
  }
  if (kind === "head") {
    // The head fragment also rejects iframes + javascript: URIs;
    // CSS allows iframe selectors so we don't gate that there.
    if (IFRAME_RE.test(value)) {
      return { ok: false, reason: "iframe-detected", sizeBytes };
    }
    if (JS_URI_RE.test(value)) {
      return { ok: false, reason: "javascript-uri", sizeBytes };
    }
  }
  return { ok: true, sizeBytes };
}

// ─── Storefront render helpers ────────────────────────────────────────────

export interface RenderHeadInput {
  brandCss?: string;     // brand-kit `:root { --brand-* }` style body (R011)
  customCss?: string;    // operator-supplied CSS
  customHead?: string;   // operator-supplied head fragment
}

// Builds the full `<head>` injection: a single `<style>` tag with
// brand-kit vars first, custom CSS second (so operator overrides
// take precedence), plus the custom head fragment as a separate
// trailing block. Foundation per-tenant layout calls this and
// stamps the result into the rendered HTML head.
export function buildCustomCodeHead(input: RenderHeadInput): string {
  const out: string[] = [];
  const brand = (input.brandCss ?? "").trim();
  const css = (input.customCss ?? "").trim();
  if (brand || css) {
    const styleBody = [brand, css].filter(Boolean).join("\n\n");
    out.push(`<style data-aqua="custom-code">\n${styleBody}\n</style>`);
  }
  if ((input.customHead ?? "").trim()) {
    out.push(`<!-- aqua: custom head -->\n${input.customHead!.trim()}`);
  }
  return out.join("\n");
}
