"use client";

// useHydrated — the accessible hydration-ready boundary for SSR-rendered
// primary controls.
//
// The defect this closes (UI Wave 9, 2026-09-08, confirmed on a PRODUCTION
// build): a client component's button is painted by the server HTML
// immediately, but its React onClick only attaches when the owning component
// hydrates. In that window the control LOOKS active yet a click is silently
// swallowed — measured at ~251ms on a fast machine (no throttle) and ~510ms at
// 4× CPU throttle on the "New client" CTA, whose handler waits for the whole
// PeopleHub to hydrate. React does not replay the early click.
//
// Contract: returns false during SSR and the hydration pass (so server and
// client markup match), then true the moment this component's hydration
// commits — which is exactly when its handlers are live. Gate the control with
//
//   const hydrated = useHydrated();
//   <button disabled={!hydrated} aria-busy={!hydrated || undefined} ...>
//
// so the not-ready state is VISIBLE (disabled styling) and ANNOUNCED
// (aria-busy) instead of a live-looking dead button. `useSyncExternalStore`
// with a constant server snapshot is the React-sanctioned way to express
// "am I hydrated" without an effect round-trip or a hydration mismatch.
import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(emptySubscribe, clientSnapshot, serverSnapshot);
}
