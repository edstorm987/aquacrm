// Brand-kit → CSS variables. Each tenant carries a `BrandKit` JSON; the
// (No `import "server-only"` — pure function, smoke tests import directly;
// behaviour is identical client-side / server-side.)
// per-tenant layout injects these as CSS custom properties at the page
// root. Every block + chrome component reads `var(--brand-primary)` etc.
//
// The agency layout injects the agency's brand. The per-client layout
// overrides with the client's brand. The end-customer layout overrides
// with the end-customer's parent client's brand.

import type { BrandKit } from "@/server/types";
import { contrastRatio } from "@/lib/a11y/contrastValidator";

export interface BrandCssVars {
  // Map of CSS-variable name → value. Used by ThemeInjector to render
  // `<style>:root{--name: value; …}</style>`.
  vars: Record<string, string>;
  customCSS?: string;
}

/**
 * The colour used when a tenant has no brand kit at all.
 *
 * A brand kit is decoration. Missing decoration must not take down a client's
 * portal — and it did: a client created without one crashed `ThemeInjector`
 * on `brand.primaryColor`, which failed the whole page render rather than the
 * styling. An unbranded portal is a cosmetic problem; a portal that will not
 * load is the client ringing up.
 */
const FALLBACK_PRIMARY = "#1F2937";

export function brandToCss(brand: BrandKit | null | undefined): BrandCssVars {
  // Tolerated rather than asserted. The type says this is always present, and
  // at runtime it is not — seeded clients, partially provisioned tenants and
  // previews all reach here without one.
  const primary = brand?.primaryColor || FALLBACK_PRIMARY;
  const whiteRatio = contrastRatio("#FFFFFF", primary) ?? 0;
  const blackRatio = contrastRatio("#111111", primary) ?? 0;
  const vars: Record<string, string> = {
    "--brand-primary": primary,
    "--brand-on-primary": whiteRatio >= 4.5 || whiteRatio >= blackRatio ? "#FFFFFF" : "#111111",
  };
  if (brand?.secondaryColor) vars["--brand-secondary"] = brand?.secondaryColor;
  if (brand?.accentColor) vars["--brand-accent"] = brand?.accentColor;
  if (brand?.fontHeading) vars["--brand-font-heading"] = brand?.fontHeading;
  if (brand?.fontBody) vars["--brand-font-body"] = brand?.fontBody;
  if (brand?.borderRadius) vars["--brand-radius"] = brand?.borderRadius;
  if (brand?.logoUrl) vars["--brand-logo"] = `url(${JSON.stringify(brand?.logoUrl)})`;
  // T1 R15 — extended kit (chapter §15g + T3 R011). Each var only emits
  // when the field is set; consumers fall back to the bundled theme
  // defaults at the CSS layer (no fabricated defaults here).
  if (brand?.bgElevated) vars["--brand-bg-elevated"] = brand?.bgElevated;
  if (brand?.text)       vars["--brand-text"]        = brand?.text;
  if (brand?.textMuted)  vars["--brand-text-muted"]  = brand?.textMuted;
  if (brand?.border)     vars["--brand-border"]      = brand?.border;
  if (brand?.radiusSm)   vars["--brand-radius-sm"]   = brand?.radiusSm;
  if (brand?.radiusMd)   vars["--brand-radius-md"]   = brand?.radiusMd;
  if (brand?.radiusLg)   vars["--brand-radius-lg"]   = brand?.radiusLg;
  return { vars, customCSS: brand?.customCSS };
}

// Render the brand kit as a single `<style>` tag content string.
// The component inserts it into the DOM verbatim.
export function brandToStyleString(brand: BrandKit | null | undefined): string {
  const { vars, customCSS } = brandToCss(brand);
  const decls = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  const root = `:root {\n${decls}\n}`;
  return customCSS ? `${root}\n${customCSS}` : root;
}
