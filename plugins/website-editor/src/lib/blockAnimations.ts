// R030 — Block animation library.
//
// Scroll-triggered reveal effects keyed by an `animation` value
// from `BlockStyles.animate` (R002+ schema). The runtime sets
// `data-animate-in="true"` on every `[data-animate]` element when
// it enters the viewport via IntersectionObserver; CSS keyframes
// + transition handle the visual transition. `prefers-reduced-
// motion: reduce` short-circuits the runtime so no animation
// fires.
//
// Pure module — no DOM imports at module scope; safe in SSR /
// smoke contexts.

export type AnimationKind =
  | "none" | "fade-in" | "slide-up" | "slide-left" | "slide-right"
  | "zoom-in" | "rotate-in" | "blur-in";

export const ANIMATION_KINDS: readonly AnimationKind[] = [
  "none", "fade-in", "slide-up", "slide-left", "slide-right",
  "zoom-in", "rotate-in", "blur-in",
];

// Default animation duration / easing — operators override per block
// via `animateDuration` / `animateEasing` style props.
export const DEFAULT_DURATION = "600ms";
export const DEFAULT_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

// CSS keyframes + base styles for every kind. The storefront
// stamps this once at the page level (operator's customCss never
// needs to repeat it).
export function buildAnimationStylesheet(): string {
  return `
[data-animate]{will-change:transform,opacity;opacity:0;transition:opacity var(--aqua-anim-duration,${DEFAULT_DURATION}) var(--aqua-anim-easing,${DEFAULT_EASING}),transform var(--aqua-anim-duration,${DEFAULT_DURATION}) var(--aqua-anim-easing,${DEFAULT_EASING}),filter var(--aqua-anim-duration,${DEFAULT_DURATION}) var(--aqua-anim-easing,${DEFAULT_EASING})}
[data-animate="fade-in"]{opacity:0}
[data-animate="slide-up"]{opacity:0;transform:translateY(20px)}
[data-animate="slide-left"]{opacity:0;transform:translateX(20px)}
[data-animate="slide-right"]{opacity:0;transform:translateX(-20px)}
[data-animate="zoom-in"]{opacity:0;transform:scale(0.96)}
[data-animate="rotate-in"]{opacity:0;transform:rotate(-3deg) scale(0.97)}
[data-animate="blur-in"]{opacity:0;filter:blur(8px)}
[data-animate-in="true"]{opacity:1!important;transform:none!important;filter:none!important}
@media (prefers-reduced-motion:reduce){[data-animate]{transition:none;opacity:1;transform:none;filter:none}}
`.trim();
}

// IntersectionObserver runtime as an inline `<script>` body. The
// foundation per-tenant layout stamps this once. No external
// dependencies; ~600 bytes minified.
//
// Behaviour:
//   - Skips when `prefers-reduced-motion: reduce` matches.
//   - Observes every `[data-animate]:not([data-animate-in])`.
//   - On intersect, sets `data-animate-in="true"` and unobserves.
//   - 0.15 threshold so a block doesn't reveal until ~15% visible.
//   - rootMargin 0px so it fires exactly when the top edge enters.
export function buildAnimationRuntime(): string {
  return `(function(){
if(typeof window==="undefined")return;
if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches){
  document.querySelectorAll("[data-animate]").forEach(function(el){el.setAttribute("data-animate-in","true")});
  return;
}
var io=new IntersectionObserver(function(entries){
  entries.forEach(function(e){
    if(e.isIntersecting){
      e.target.setAttribute("data-animate-in","true");
      io.unobserve(e.target);
    }
  });
},{threshold:0.15,rootMargin:"0px"});
function scan(){document.querySelectorAll("[data-animate]:not([data-animate-in])").forEach(function(el){io.observe(el)})}
scan();
new MutationObserver(scan).observe(document.body||document.documentElement,{childList:true,subtree:true});
})();`;
}

// CSS-property bag for a block's animation. The renderer reads
// `block.styles.animate / animateDuration / animateDelay /
// animateEasing` and emits inline custom properties so per-block
// timing overrides work without inflating the stylesheet.
export interface AnimationStyleProps {
  /** Pure CSS custom properties — spread into `style={{ ... }}`. */
  cssVars: Record<string, string>;
  /** Value for `data-animate` attribute (or undefined). */
  dataAnimate?: AnimationKind;
}

export function animationStyleProps(input: {
  animate?: AnimationKind;
  animateDuration?: string;
  animateDelay?: string;
  animateEasing?: string;
}): AnimationStyleProps {
  const kind = input.animate;
  if (!kind || kind === "none") return { cssVars: {} };
  const cssVars: Record<string, string> = {};
  if (input.animateDuration) cssVars["--aqua-anim-duration"] = input.animateDuration;
  if (input.animateEasing) cssVars["--aqua-anim-easing"] = input.animateEasing;
  if (input.animateDelay) cssVars.transitionDelay = input.animateDelay;
  return { cssVars, dataAnimate: kind };
}

// Foundation `<head>` injection helper — composes stylesheet +
// runtime into the markup the layout stamps once per page.
export function buildAnimationHeadFragment(): string {
  return `<style data-aqua="animation">${buildAnimationStylesheet()}</style>\n<script data-aqua="animation">${buildAnimationRuntime()}</script>`;
}
