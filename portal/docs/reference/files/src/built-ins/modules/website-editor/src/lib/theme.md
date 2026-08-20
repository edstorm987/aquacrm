# `src/built-ins/modules/website-editor/src/lib/theme.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

_No file-level doc-comment. Purpose inferred from its path (Plugins — src/built-ins/) and its exports below._

## Exports (9)

- `async loadThemes(siteId: string, force = false): Promise<ThemeRecord[]>`
- `listCachedThemes(siteId: string): ThemeRecord[]`
- `async createTheme(siteId: string, input: { name: string; appearance?: "light" | "dark" | "auto"; tokens?: ThemeTokens }): Promise<ThemeRecord | null>`
- `async updateTheme(siteId: string, themeId: string, patch: { name?: string; appearance?: "light" | "dark" | "auto"; tokens?: ThemeTokens; setAsDefault?: boolean } | UpdateThemePatch): Promise<ThemeRecord | null>`
- `async deleteTheme(siteId: string, themeId: string): Promise<boolean>`
- `onThemesChange(cb: (siteId: string) => void): () => void`
- `async listThemes(siteId: string): Promise<ThemeRecord[]>`
- `async getTheme(siteId: string, themeId: string): Promise<ThemeRecord | null>`
- `async setDefaultTheme(siteId: string, themeId: string): Promise<void>`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/theme.ts`](../types/theme.md)

## Used by (3)

- [`src/built-ins/modules/website-editor/src/lib/savePipeline.ts`](./savePipeline.md)
- [`src/built-ins/modules/website-editor/src/pages/ThemeDetailPage.tsx`](../pages/ThemeDetailPage.md)
- [`src/built-ins/modules/website-editor/src/pages/ThemesPage.tsx`](../pages/ThemesPage.md)

