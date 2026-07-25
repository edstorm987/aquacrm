// R014 — Favicon URL derivation.
//
// Per requirements §5 (brand-kit drives everything), the favicon
// stack defaults to the brand-kit logo. Real apps emit multiple
// resolutions; this helper builds the standard set:
//   /favicon.ico        — 16/32 fallback (operator-supplied or generated)
//   /favicon-32.png     — modern browser tab
//   /favicon-192.png    — Android home screen
//   /apple-touch-icon.png — 180×180 iOS
//
// When the brand-kit's logoUrl is set, those URLs simply point to
// the operator's logo. When unset (or per-variant override absent),
// callers fall back to a built-in placeholder route that emits a
// 1×1 SVG sized at the requested resolution — wired in foundation
// at `/favicon-default.svg` so the editor preview always shows
// *something*.

import type { BrandKit } from "./tenancy";

export interface FaviconUrls {
  ico: string;
  favicon32: string;
  favicon192: string;
  appleTouch: string;
  manifestThemeColor: string;
}

const FALLBACK_BASE = "/favicon-default";

export function deriveFaviconUrls(
  brand: BrandKit,
  override?: { logoUrl?: string },
): FaviconUrls {
  const logo = override?.logoUrl ?? brand.logoUrl;
  if (logo && logo.length > 0) {
    return {
      ico: logo,
      favicon32: logo,
      favicon192: logo,
      appleTouch: logo,
      manifestThemeColor: brand.primaryColor,
    };
  }
  return {
    ico: `${FALLBACK_BASE}.ico`,
    favicon32: `${FALLBACK_BASE}-32.png`,
    favicon192: `${FALLBACK_BASE}-192.png`,
    appleTouch: `${FALLBACK_BASE}-180.png`,
    manifestThemeColor: brand.primaryColor,
  };
}

// Renders the `<link rel="…">` head fragments. Foundation per-tenant
// layout calls this and stamps the output into <head>.
export function faviconHeadLinks(urls: FaviconUrls): string[] {
  return [
    `<link rel="icon" href="${urls.ico}">`,
    `<link rel="icon" type="image/png" sizes="32x32" href="${urls.favicon32}">`,
    `<link rel="icon" type="image/png" sizes="192x192" href="${urls.favicon192}">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="${urls.appleTouch}">`,
    `<meta name="theme-color" content="${urls.manifestThemeColor}">`,
  ];
}
