# `src/built-ins/modules/website-editor/src/types/theme.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** ThemeRecord — flat token-based theme.  Faithful port of `02/src/portal/server/types.ts` ThemeTokens + ThemeRecord definitions. Tokens are emitted as `--theme-*` CSS variables by the EditorThemeInjector; both editor canvas and host PortalPageRenderer consume the same variable names so what you see in the canvas matches what visitors see live.

## Exports (4)

- `interface ThemeTokens (13 members)`
- `interface ThemeRecord (11 members)`
- `interface CreateThemeInput (7 members)`
- `interface UpdateThemePatch (4 members)`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/lib/tenancy.ts`](../lib/tenancy.md)

## Used by (10)

- [`src/built-ins/modules/website-editor/src/components/storefront/EditorThemeInjector.tsx`](../components/storefront/EditorThemeInjector.md)
- [`src/built-ins/modules/website-editor/src/components/storefront/PortalPageRenderer.tsx`](../components/storefront/PortalPageRenderer.md)
- [`src/built-ins/modules/website-editor/src/components/storefront/SiteUX.tsx`](../components/storefront/SiteUX.md)
- [`src/built-ins/modules/website-editor/src/components/themeCss.ts`](../components/themeCss.md)
- [`src/built-ins/modules/website-editor/src/lib/savePipeline.ts`](../lib/savePipeline.md)
- [`src/built-ins/modules/website-editor/src/lib/theme.ts`](../lib/theme.md)
- [`src/built-ins/modules/website-editor/src/pages/ThemeDetailPage.tsx`](../pages/ThemeDetailPage.md)
- [`src/built-ins/modules/website-editor/src/pages/ThemesPage.tsx`](../pages/ThemesPage.md)
- [`src/built-ins/modules/website-editor/src/server/extensionPorts.ts`](../server/extensionPorts.md)
- [`src/built-ins/modules/website-editor/src/server/themes.ts`](../server/themes.md)

