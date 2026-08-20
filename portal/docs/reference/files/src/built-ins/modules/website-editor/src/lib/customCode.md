# `src/built-ins/modules/website-editor/src/lib/customCode.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R029 — Custom code validation + storefront render helper.  Operators paste CSS into a variant-level `customCss?` and HTML fragments into `customHead?`. Both are size-capped + scanned for `<script>` content per prompt's "JavaScript injection rejected" gate. The render helper interleaves brand-kit vars + customCss inside a `<style>` block between brand vars and block styles.

## Exports (7)

- `CUSTOM_CSS_MAX_BYTES`
- `CUSTOM_HEAD_MAX_BYTES`
- `type CustomCodeKind`
- `interface ValidationResult (4 members)`
- `validateCustomCode(value: string, kind: CustomCodeKind): ValidationResult`
- `interface RenderHeadInput (3 members)`
- `buildCustomCodeHead(input: RenderHeadInput): string`

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r029-custom-css.test.ts`](../__smoke__/r029-custom-css.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/customCode.ts`](../api/handlers/customCode.md)

