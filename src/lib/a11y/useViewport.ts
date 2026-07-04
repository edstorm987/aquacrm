"use client";

// useViewport — SSR-safe viewport buckets. Returns `{ isMobile,
// isTablet, isDesktop }` based on `window.matchMedia` breakpoints
// matching Tailwind's defaults (md: 768, lg: 1024).
//
// On the server (no `window`), defaults to desktop so the initial
// render matches the dominant case; the first effect tick corrects
// on the client. Components that *must* paint correctly on first
// paint for mobile (e.g., the sidebar collapse) should use a CSS
// breakpoint instead — this hook is for behavioural decisions, not
// styling.

import { useEffect, useState } from "react";

export interface Viewport {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

const DEFAULT_VIEWPORT: Viewport = {
  isMobile: false,
  isTablet: false,
  isDesktop: true,
};

function compute(): Viewport {
  if (typeof window === "undefined") return DEFAULT_VIEWPORT;
  const w = window.innerWidth;
  return {
    isMobile: w < 768,
    isTablet: w >= 768 && w < 1024,
    isDesktop: w >= 1024,
  };
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(DEFAULT_VIEWPORT);

  useEffect(() => {
    setVp(compute());
    function onResize() { setVp(compute()); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return vp;
}
