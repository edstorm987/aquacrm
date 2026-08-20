# `src/built-ins/modules/website-editor/src/components/themeCss.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Client-side mirror of the server's tokensToCssVars helper. Used by PortalPageRenderer + Canvas root to inject the active theme's tokens without re-fetching from the server module (the server module isn't importable in client bundles).  Faithful port of `02/src/components/editor/themeCss.ts`.

## Exports (2)

- `tokensToCssVarsClient(tokens: ThemeTokens | undefined): string`
- `tokensToCssVars(tokens: ThemeTokens | undefined): string`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/theme.ts`](../types/theme.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/components/index.ts`](./index.md)
- [`src/built-ins/modules/website-editor/src/components/storefront/EditorThemeInjector.tsx`](./storefront/EditorThemeInjector.md)

