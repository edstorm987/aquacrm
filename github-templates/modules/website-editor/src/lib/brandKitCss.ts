// R011 — Extended brand-kit → CSS variables.
//
// Foundation's `portal/src/lib/chrome/brandKit.ts::brandToCss` emits
// the original 6 vars (--brand-primary / --brand-secondary /
// --brand-accent / --brand-font-heading / --brand-font-body /
// --brand-radius / --brand-logo). Per requirements §5 the editor's
// blocks need a richer surface: background tones, text tones,
// border, radius scale, dark-mode hint.
//
// This helper layers additively on top of foundation: it emits the
// original vars when callers need a single source AND emits the
// extended vars when the BrandKit instance carries them. Foundation
// CSS won't break — it only ever reads the original vars; new blocks
// can opt into the extended ones.

import type { BrandKit } from "./tenancy";

export interface BrandCssVars {
  vars: Record<string, string>;
  customCSS?: string;
}

const HEX_DEFAULTS = {
  bg: "#0b1220",
  bgElevated: "rgba(255,255,255,0.04)",
  text: "#f5f3ec",
  textMuted: "rgba(255,255,255,0.55)",
  border: "rgba(255,255,255,0.08)",
  radiusSm: "4px",
  radiusMd: "10px",
  radiusLg: "18px",
};

export function extendedBrandToCss(brand: BrandKit): BrandCssVars {
  const vars: Record<string, string> = {
    "--brand-primary": brand.primaryColor,
  };
  if (brand.secondaryColor) vars["--brand-secondary"] = brand.secondaryColor;
  if (brand.accentColor) vars["--brand-accent"] = brand.accentColor;
  if (brand.fontHeading) vars["--brand-font-heading"] = brand.fontHeading;
  if (brand.fontBody) vars["--brand-font-body"] = brand.fontBody;
  if (brand.borderRadius) vars["--brand-radius"] = brand.borderRadius;
  if (brand.logoUrl) vars["--brand-logo"] = `url(${JSON.stringify(brand.logoUrl)})`;

  // R011 — extended surface. Each falls back to a sensible default
  // so a partial brand-kit still emits a complete, dark-friendly
  // palette.
  vars["--brand-bg"] = brand.bg ?? HEX_DEFAULTS.bg;
  vars["--brand-bg-elevated"] = brand.bgElevated ?? HEX_DEFAULTS.bgElevated;
  vars["--brand-text"] = brand.text ?? HEX_DEFAULTS.text;
  vars["--brand-text-muted"] = brand.textMuted ?? HEX_DEFAULTS.textMuted;
  vars["--brand-border"] = brand.border ?? HEX_DEFAULTS.border;
  vars["--brand-radius-sm"] = brand.radiusSm ?? HEX_DEFAULTS.radiusSm;
  vars["--brand-radius-md"] = brand.radiusMd ?? brand.borderRadius ?? HEX_DEFAULTS.radiusMd;
  vars["--brand-radius-lg"] = brand.radiusLg ?? HEX_DEFAULTS.radiusLg;
  if (brand.darkMode !== undefined) {
    vars["--brand-dark-mode"] = brand.darkMode ? "1" : "0";
  }
  return { vars, ...(brand.customCSS ? { customCSS: brand.customCSS } : {}) };
}

// Render the extended brand kit as a single `<style>` tag content
// string — usable as the body of a server-rendered <style> in a
// per-install layout, or copy-pasted into a per-tenant
// `customCSS` field.
export function extendedBrandToStyleString(brand: BrandKit, scope = ":root"): string {
  const { vars, customCSS } = extendedBrandToCss(brand);
  const decls = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join("\n");
  const root = `${scope} {\n${decls}\n}`;
  return customCSS ? `${root}\n${customCSS}` : root;
}

// Audit helper — exposed for the smoke + future runtime checks. Walks
// any string and reports whether it looks like a hardcoded brand-
// adjacent colour (orange / cyan / brand-pink families). Used by the
// "no hardcoded brand colours" smoke as a heuristic gate.
const BRAND_HEX_PATTERNS: RegExp[] = [
  /#ff[6-7][0-9a-fA-F]{3}/i,   // orange family (e.g. #ff6b35, #ff7300)
  /#38bdf[0-9a-fA-F]/i,        // cyan-500 hardcode
  /#0ea5e[0-9a-fA-F]/i,        // cyan-600 hardcode
];
export function looksLikeHardcodedBrandColour(s: string): boolean {
  return BRAND_HEX_PATTERNS.some(p => p.test(s));
}
