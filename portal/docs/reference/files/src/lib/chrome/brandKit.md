# `src/lib/chrome/brandKit.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Brand-kit → CSS variables. Each tenant carries a `BrandKit` JSON; the (No `import "server-only"` — pure function, smoke tests import directly; behaviour is identical client-side / server-side.) per-tenant layout injects these as CSS custom properties at the page root. Every block + chrome component reads `var(--brand-primary)` etc.  The agency layout injects the agency's brand. The per-client layout overrides with the client's brand. The end-customer layout overrides with the end-customer's parent client's brand.

## Exports (3)

- `interface BrandCssVars (2 members)`
- `brandToCss(brand: BrandKit | null | undefined): BrandCssVars`
- `brandToStyleString(brand: BrandKit | null | undefined): string`

## Depends on (2)

- [`src/lib/a11y/contrastValidator.ts`](../a11y/contrastValidator.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (2)

- [`scripts/smoke-portal-role-brandkit.test.ts`](../../../scripts/smoke-portal-role-brandkit.test.md)
- [`src/components/chrome/ThemeInjector.tsx`](../../components/chrome/ThemeInjector.md)

