// Smoke — R030 Block animations + scroll-triggered effects.

import {
  ANIMATION_KINDS,
  DEFAULT_DURATION,
  DEFAULT_EASING,
  animationStyleProps,
  buildAnimationStylesheet,
  buildAnimationRuntime,
  buildAnimationHeadFragment,
} from "../lib/blockAnimations";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

(async () => {
  // ─── A: ANIMATION_KINDS ────────────────────────────────────────────────
  expect("ANIMATION_KINDS includes 'none' first",
    ANIMATION_KINDS[0] === "none");
  for (const k of ["fade-in", "slide-up", "slide-left", "slide-right", "zoom-in", "rotate-in", "blur-in"]) {
    expect(`ANIMATION_KINDS includes ${k}`,
      (ANIMATION_KINDS as readonly string[]).includes(k));
  }
  expect("DEFAULT_DURATION + DEFAULT_EASING set",
    DEFAULT_DURATION === "600ms" && DEFAULT_EASING.includes("cubic-bezier"));

  // ─── B: animationStyleProps ────────────────────────────────────────────
  const none = animationStyleProps({ animate: "none" });
  expect("animate=none → empty cssVars + no dataAnimate",
    Object.keys(none.cssVars).length === 0 && none.dataAnimate === undefined);

  const undef = animationStyleProps({});
  expect("undefined animate → empty cssVars",
    Object.keys(undef.cssVars).length === 0);

  const fade = animationStyleProps({ animate: "fade-in" });
  expect("animate=fade-in → dataAnimate set + no overrides",
    fade.dataAnimate === "fade-in" && Object.keys(fade.cssVars).length === 0);

  const overrides = animationStyleProps({
    animate: "slide-up",
    animateDuration: "1200ms",
    animateEasing: "ease-out",
    animateDelay: "100ms",
  });
  expect("custom duration → --aqua-anim-duration var",
    overrides.cssVars["--aqua-anim-duration"] === "1200ms");
  expect("custom easing → --aqua-anim-easing var",
    overrides.cssVars["--aqua-anim-easing"] === "ease-out");
  expect("custom delay → transitionDelay",
    overrides.cssVars.transitionDelay === "100ms");

  // ─── C: buildAnimationStylesheet ───────────────────────────────────────
  const css = buildAnimationStylesheet();
  expect("stylesheet sets opacity:0 on [data-animate]",
    css.includes("[data-animate]") && css.includes("opacity:0"));
  for (const kind of ["fade-in", "slide-up", "slide-left", "slide-right", "zoom-in", "rotate-in", "blur-in"]) {
    expect(`stylesheet has rule for ${kind}`,
      css.includes(`[data-animate="${kind}"]`));
  }
  expect("data-animate-in=true reveals",
    css.includes('[data-animate-in="true"]') && css.includes("opacity:1!important"));
  expect("prefers-reduced-motion media query disables transitions",
    css.includes("prefers-reduced-motion:reduce") && css.includes("transition:none"));
  expect("stylesheet uses --aqua-anim-duration / --aqua-anim-easing custom props",
    css.includes("var(--aqua-anim-duration") && css.includes("var(--aqua-anim-easing"));

  // ─── D: buildAnimationRuntime ──────────────────────────────────────────
  const rt = buildAnimationRuntime();
  expect("runtime is IIFE",
    rt.startsWith("(function(){") && rt.endsWith("})();"));
  expect("runtime checks prefers-reduced-motion",
    rt.includes("prefers-reduced-motion: reduce"));
  expect("runtime instantiates IntersectionObserver",
    rt.includes("new IntersectionObserver"));
  expect("runtime sets data-animate-in='true' on intersect",
    rt.includes('"data-animate-in"') && rt.includes('"true"'));
  expect("runtime unobserves after intersect",
    rt.includes("io.unobserve"));
  expect("runtime threshold 0.15",
    rt.includes("threshold:0.15"));
  expect("runtime watches DOM mutations for new blocks",
    rt.includes("MutationObserver"));
  expect("runtime SSR-safe (window check)",
    rt.includes('typeof window==="undefined"'));

  // ─── E: buildAnimationHeadFragment ─────────────────────────────────────
  const head = buildAnimationHeadFragment();
  expect("head fragment opens with <style data-aqua='animation'>",
    head.includes('<style data-aqua="animation">'));
  expect("head fragment includes runtime <script data-aqua='animation'>",
    head.includes('<script data-aqua="animation">'));
  expect("head fragment carries both stylesheet body + runtime",
    head.includes("[data-animate]") && head.includes("IntersectionObserver"));

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
