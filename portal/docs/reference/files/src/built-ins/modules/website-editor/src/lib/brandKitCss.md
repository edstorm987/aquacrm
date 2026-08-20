# `src/built-ins/modules/website-editor/src/lib/brandKitCss.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R011 — Extended brand-kit → CSS variables.  Foundation's `portal/src/lib/chrome/brandKit.ts::brandToCss` emits the original 6 vars (--brand-primary / --brand-secondary / --brand-accent / --brand-font-heading / --brand-font-body / --brand-radius / --brand-logo). Per requirements §5 the editor's blocks need a richer surface: background tones, text tones, border, radius scale, dark-mode hint.  This helper layers additively on top of foundation: it emits the original vars when callers need a single source AND emits the extended vars when the BrandKit instance carries them. Foundation CSS won't break — it only ever reads the original vars; new blocks can opt into the extended ones.

## Exports (4)

- `interface BrandCssVars (2 members)`
- `extendedBrandToCss(brand: BrandKit): BrandCssVars`
- `extendedBrandToStyleString(brand: BrandKit, scope = ":root"): string`
- `looksLikeHardcodedBrandColour(s: string): boolean`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](./tenancy.md)

## Used by (1)

- [`src/built-ins/modules/website-editor/src/__smoke__/r011-brand-kit-css-vars.test.ts`](../__smoke__/r011-brand-kit-css-vars.test.md)

