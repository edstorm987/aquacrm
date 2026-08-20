# `src/built-ins/modules/website-editor/src/lib/a11yAudit.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R031 — Accessibility audit walker.  Pure function over a `Block[]` tree returning structured issues. Foundation editor surfaces results in an "Accessibility" panel (host-page composition); renderer-side fixes (alt-required, auto-aria, semantic landmarks) are one-line additions to the existing block render path.  Target: WCAG 2.1 AA. R+1: AAA conformance + screen-reader testing flows.

## Exports (8)

- `type A11ySeverity`
- `type A11yIssueCode`
- `interface A11yIssue (8 members)`
- `interface A11yAuditResult (5 members)`
- `auditAccessibility(blocks: Block[]): A11yAuditResult`
- `contrastRatio(fgHex: string, bgHex: string): number | null`
- `type ContrastLevel`
- `classifyContrast(ratio: number): ContrastLevel`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/types/block.ts`](../types/block.md)

## Used by (1)

- [`src/built-ins/modules/website-editor/src/__smoke__/r031-a11y.test.ts`](../__smoke__/r031-a11y.test.md)

