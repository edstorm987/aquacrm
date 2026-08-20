# `src/built-ins/modules/website-editor/src/lib/editorDeepLink.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Deep-link contract between T1's agency-shell "Edit website" CTA and the website-editor plugin. Pure helpers — kept framework-agnostic so the smoke harness (Node + tsx) can exercise every branch without React.  URL shape: /portal/clients/[clientId]/edit-website?page=<pageId>&variant=<variantKey> - clientId: required (path) - page    : optional (query) → resolves to first page in pageOrder; else create - variant : optional (query) → defaults to "default"  "variant" maps to EditorPage.variantId; pages without a variantId are treated as the default variant. Most clients only have "default", so the variant switcher is hidden when only one variant is present.

## Exports (13)

- `DEFAULT_VARIANT`
- `interface PageLike (6 members)`
- `interface DeepLinkInput (3 members)`
- `interface ParsedDeepLink (4 members)`
- `parseEditorDeepLink(search: URLSearchParams | Record<string, string | null | undefined> | null | undefined): ParsedDeepLink`
- `buildEditorDeepLink(input: DeepLinkInput): string`
- `pagesForVariant<T extends PageLike>(pages: T[], variant: string): T[]`
- `availableVariants<T extends PageLike>(pages: T[]): string[]`
- `shouldShowVariantSwitcher(variants: string[]): boolean`
- `resolveStartPage<T extends PageLike>(pages: T[], requestedPageId: string | null): string | null`
- `slugify(title: string): string`
- `uniqueSlug<T extends PageLike>(pages: T[], desired: string): string`
- `toPageLike(p: EditorPage): PageLike`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/editorPage.ts`](../types/editorPage.md)

## Used by (3)

- [`src/built-ins/modules/website-editor/src/__smoke__/deep-link.test.ts`](../__smoke__/deep-link.test.md)
- [`src/built-ins/modules/website-editor/src/components/editor/PagePickerToolbar.tsx`](../components/editor/PagePickerToolbar.md)
- [`src/built-ins/modules/website-editor/src/pages/EditorPage.tsx`](../pages/EditorPage.md)

