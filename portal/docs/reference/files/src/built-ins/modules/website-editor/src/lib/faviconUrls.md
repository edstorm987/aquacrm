# `src/built-ins/modules/website-editor/src/lib/faviconUrls.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R014 — Favicon URL derivation.  Per requirements §5 (brand-kit drives everything), the favicon stack defaults to the brand-kit logo. Real apps emit multiple resolutions; this helper builds the standard set: /favicon.ico        — 16/32 fallback (operator-supplied or generated) /favicon-32.png     — modern browser tab /favicon-192.png    — Android home screen /apple-touch-icon.png — 180×180 iOS  When the brand-kit's logoUrl is set, those URLs simply point to the operator's logo. When unset (or per-variant override absent), callers fall back to a built-in placeholder route that emits a 1×1 SVG sized at the requested resolution — wired in foundation at `/favicon-default.svg` so the editor preview always shows *something*.

## Exports (3)

- `interface FaviconUrls (5 members)`
- `deriveFaviconUrls(brand: BrandKit, override?: { logoUrl?: string }): FaviconUrls`
- `faviconHeadLinks(urls: FaviconUrls): string[]`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](./tenancy.md)

## Used by (1)

- [`src/built-ins/modules/website-editor/src/__smoke__/r014-seo-meta.test.ts`](../__smoke__/r014-seo-meta.test.md)

