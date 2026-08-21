# `src/lib/chrome/performanceMode.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Performance mode — the REAL one. A server-readable cookie so server components can actually SKIP heavy work (portfolio sweeps, Supabase fetches, disk scans) rather than merely hiding an animation.  This file used to hold the localStorage flag that gated cutscenes. That concern moved to `cinematicMode.ts` (user-facing "Cinematic mode"), and this module was re-pointed to the genuine performance switch:  • The client sets/clears a cookie (`aqua_perf_mode`, path=/, NOT httpOnly so this toggle can write it) and reloads. • The next server render reads it via `performanceModePreference()` in `@/lib/server/performanceMode` and gates its expensive work.  Default OFF → byte-for-byte today's behaviour. Cookie name. Read on the server by `performanceModePreference()`.

## Exports (3)

- `PERFORMANCE_MODE_COOKIE`
- `performanceModeCookieEnabled(): boolean`
- `setPerformanceModeCookie(enabled: boolean): void`

## Used by (3)

- [`scripts/smoke-profile-toggles.test.ts`](../../../scripts/smoke-profile-toggles.test.md)
- [`src/components/chrome/ProfileMenu.tsx`](../../components/chrome/ProfileMenu.md)
- [`src/lib/server/performanceMode.ts`](../server/performanceMode.md)

