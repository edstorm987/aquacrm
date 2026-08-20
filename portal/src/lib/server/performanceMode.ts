import "server-only";

import { cookies } from "next/headers";

import { PERFORMANCE_MODE_COOKIE } from "@/lib/chrome/performanceMode";

// Server half of Performance mode. Server components call
// `performanceModePreference()` and, when it's true, skip the expensive work
// (portfolio sweeps, live Supabase fetches, disk scans) that otherwise runs on
// every agency render.
//
// Default is FALSE: with no cookie present the whole app behaves exactly as it
// does today. Only an explicit `aqua_perf_mode=1` cookie flips it on.

/** Pure parser — testable without a request context. */
export function parsePerformanceModeCookie(value: string | undefined | null): boolean {
  return value === "1";
}

/** Read the performance-mode preference for the current request. */
export async function performanceModePreference(): Promise<boolean> {
  try {
    const store = await cookies();
    return parsePerformanceModeCookie(store.get(PERFORMANCE_MODE_COOKIE)?.value);
  } catch {
    // Outside a request scope (e.g. build-time) — treat as OFF.
    return false;
  }
}
