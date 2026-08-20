# `src/built-ins/modules/website-editor/src/lib/themeVariants.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (15)

- `interface ThemeVariant (7 members)`
- `type ThemeAppearance`
- `BUILT_IN_VARIANTS: ThemeVariant[]`
- `listVariants(): ThemeVariant[]`
- `getVariant(id: string): ThemeVariant | null`
- `createVariant(name: string, sourceId?: string): ThemeVariant`
- `updateVariant(id: string, patch: Partial<ThemeVariant>): void`
- `deleteVariant(id: string): void`
- `getActiveVariantId(): string`
- `setActiveVariantId(id: string): void`
- `getSiteDefaultVariantId(siteId?: string): string`
- `setSiteDefaultVariantId(siteId: string, id: string): void`
- `onVariantsChange(handler: () => void): () => void`
- `getThemeVariant(): ThemeAppearance`
- `setThemeVariant(v: ThemeAppearance): void`

## Used by (1)

- [`src/built-ins/modules/website-editor/src/pages/SitesPage.tsx`](../pages/SitesPage.md)

