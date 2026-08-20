import "server-only";
// The single switch point for whether Dev Mode — the demo-persona POV
// switcher — is available at all.
//
// Today Dev Mode is LOCAL/DEV ONLY, so this simply delegates to
// `isDevModeEnabled()` (the four-guard gate in devMode.ts). Ed wants a
// *production* "demo portals" variant later — a safe, read-only-ish way to
// showcase products/services as the business expands. When that lands, this
// ONE function flips (e.g. `return isDevModeEnabled() || isDemoPortalsEnabled();`)
// and nothing else in the feature changes.
//
// The contract: every "is Dev Mode allowed here?" decision — the mint route,
// the account-menu toggle, the POV switcher — asks THIS function. Never
// scatter `NODE_ENV` / `VERCEL_ENV` checks across the feature; they live
// behind this single seam so the future prod path is a one-line change, not a
// rewrite.

import { isDevModeEnabled } from "@/lib/server/devMode";

export function canUseDevMode(): boolean {
  // Dev-only for now. This is the one line that changes to open a prod path.
  return isDevModeEnabled();
}
