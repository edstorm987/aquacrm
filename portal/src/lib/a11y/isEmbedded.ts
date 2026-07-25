"use client";

// isEmbedded — true when the page is rendered inside an iframe whose
// parent is a different document (the canonical embed case: customer
// loads luvandker.com which iframes /embed/login from milesymedia.com).
//
// Used by chrome components to decide whether to render fixed overlays
// (which would cover the parent frame's surrounding chrome) or
// constrain themselves to the iframe's viewport. SSR-safe — returns
// false on the server because there's no window.

import { useEffect, useState } from "react";

export function isEmbeddedNow(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin frame access throws — that's the embed case.
    return true;
  }
}

export function useIsEmbedded(): boolean {
  // Default false on first render (matches SSR) so React doesn't
  // hydration-mismatch. Reconciles on first effect tick.
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => { setEmbedded(isEmbeddedNow()); }, []);
  return embedded;
}
