# `src/lib/a11y/contrastValidator.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** contrastValidator — pure WCAG AA contrast-ratio check for tenant brand kits. Used by `<ThemeInjector>` (dev-time console warning) and by the brand-kit form (UI warning when a paste fails contrast).  AA thresholds: 4.5 for normal text, 3.0 for large text + UI components. We default to 4.5 for the strictest check.

## Exports (5)

- `interface PaletteInput (6 members)`
- `interface ContrastWarning (4 members)`
- `interface ContrastResult (2 members)`
- `contrastRatio(fg: string, bg: string): number | null`
- `validatePalette(palette: PaletteInput): ContrastResult`

## Used by (3)

- [`src/app/portal/customer/_CustomerPortalChrome.tsx`](../../app/portal/customer/_CustomerPortalChrome.md)
- [`src/components/chrome/ThemeInjector.tsx`](../../components/chrome/ThemeInjector.md)
- [`src/lib/chrome/brandKit.ts`](../chrome/brandKit.md)

