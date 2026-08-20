# `src/built-ins/modules/website-editor/src/lib/blockAnimations.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R030 — Block animation library.  Scroll-triggered reveal effects keyed by an `animation` value from `BlockStyles.animate` (R002+ schema). The runtime sets `data-animate-in="true"` on every `[data-animate]` element when it enters the viewport via IntersectionObserver; CSS keyframes + transition handle the visual transition. `prefers-reduced- motion: reduce` short-circuits the runtime so no animation fires.  Pure module — no DOM imports at module scope; safe in SSR / smoke contexts.

## Exports (9)

- `type AnimationKind`
- `ANIMATION_KINDS: readonly AnimationKind[]`
- `DEFAULT_DURATION`
- `DEFAULT_EASING`
- `buildAnimationStylesheet(): string`
- `buildAnimationRuntime(): string`
- `interface AnimationStyleProps (2 members)`
- `animationStyleProps(input: { animate?: AnimationKind; animateDuration?: string; animateDelay?: string; animateEasing?: string; }): AnimationStyleProps`
- `buildAnimationHeadFragment(): string`

## Used by (1)

- [`src/built-ins/modules/website-editor/src/__smoke__/r030-animations.test.ts`](../__smoke__/r030-animations.test.md)

