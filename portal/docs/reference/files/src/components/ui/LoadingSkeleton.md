# `src/components/ui/LoadingSkeleton.tsx`

← [File index](../../../../files-index.md) · Area: Components — src/components/

**What it is:** Shared loading-skeleton primitive. Three variants: - "line" — single short bar (heading / value / caption). - "box" — full-width block (image / card placeholder). - "card" — composite (line-line-box) for list rows.  Each variant accepts a `tone` prop — "light" (default) renders against white surfaces with `bg-black/5`; "dark" renders against the editor canvas / storefront-block surfaces with `bg-white/5`. The animation uses Tailwind's `animate-pulse` to match the Felicia-portal vocabulary.

## Exports (5)

- `type SkeletonVariant`
- `type SkeletonTone`
- `interface LoadingSkeletonProps (4 members)`
- `LoadingSkeleton(props: LoadingSkeletonProps)`
- `InlineSkeleton({ tone = "dark", style }: { tone?: SkeletonTone; style?: CSSProperties })`

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

