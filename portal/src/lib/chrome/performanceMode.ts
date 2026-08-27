// Performance mode — the REAL one. A server-readable cookie so server
// components can actually SKIP heavy work (portfolio sweeps, Supabase fetches,
// disk scans) rather than merely hiding an animation.
//
// This file used to hold the localStorage flag that gated cutscenes. That
// concern moved to `cinematicMode.ts` (user-facing "Cinematic mode"), and this
// module was re-pointed to the genuine performance switch:
//
//   • The client sets/clears a cookie (`aqua_perf_mode`, path=/, NOT httpOnly
//     so this toggle can write it) and reloads.
//   • The next server render reads it via `performanceModePreference()` in
//     `@/lib/server/performanceMode` and gates its expensive work.
//
// Default ON. An explicit `0` cookie opts into eager full scans; `1` (or no
// cookie) keeps the fast command shell and its visible Run scan action.

/** Cookie name. Read on the server by `performanceModePreference()`. */
export const PERFORMANCE_MODE_COOKIE = "aqua_perf_mode";

/** Read the current preference from the browser's cookies. Client-only. */
export function performanceModeCookieEnabled(): boolean {
  if (typeof document === "undefined") return true;
  return !document.cookie.split("; ").some(entry => entry === `${PERFORMANCE_MODE_COOKIE}=0`);
}

/**
 * Persist the preference and reload so the next SERVER render reflects it.
 * A cookie (not localStorage) is the whole point — only cookies reach the
 * server on the navigation that follows.
 */
export function setPerformanceModeCookie(enabled: boolean): void {
  if (typeof document === "undefined") return;
  if (enabled) {
    // ~1 year; path=/ so every portal route sees it. SameSite=Lax is enough —
    // this is a rendering preference, never a security boundary.
    document.cookie = `${PERFORMANCE_MODE_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
  } else {
    document.cookie = `${PERFORMANCE_MODE_COOKIE}=0; path=/; max-age=31536000; samesite=lax`;
  }
  if (typeof window !== "undefined") window.location.reload();
}
