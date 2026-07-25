// BOS auth-gate domain.

import type { UserId } from "./tenancy";

// Path matchers — pure functions so foundation middleware can call
// them without importing the whole plugin runtime.

export const BOS_PATH_PREFIXES: readonly string[] = [
  "/business-os",
  "/api/portal/business-os",
] as const;

// "Soft" allow-list: paths that should NOT be gated even when BOS
// is otherwise locked down. The me-endpoint must always be reachable
// for signed-in users; static asset paths inside `/business-os/`
// (CSS/JS/images) shouldn't redirect anonymous browsers because the
// browser can't follow a 302 mid-asset-load.
export const BOS_SOFT_ALLOW_SUFFIXES: readonly string[] = [
  ".css", ".js", ".mjs", ".map",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
  ".woff", ".woff2", ".ttf", ".otf",
] as const;

export function matchesBosPath(pathname: string): boolean {
  for (const prefix of BOS_PATH_PREFIXES) {
    if (pathname === prefix) return true;
    if (pathname.startsWith(prefix + "/")) return true;
  }
  return false;
}

export function isBosAsset(pathname: string): boolean {
  for (const sfx of BOS_SOFT_ALLOW_SUFFIXES) {
    if (pathname.endsWith(sfx)) return true;
  }
  return false;
}

// Decision shape returned by `evaluate`. Foundation middleware
// translates this into a Response (302) or pass-through.

export type AuthGateOutcome = "allow" | "redirect" | "dev-bypass";

export interface AuthGateContext {
  pathname: string;
  signedIn: boolean;
  // The signed-in user's role from the foundation session. `lead` is
  // the funnel role; agency-* are operators inspecting BOS with the
  // user-as-customer view; everything else is treated as a
  // misrouting (redirect to login).
  role?: string;
  // Allowed-roles override. Default is everyone signed-in (any non-
  // empty role); foundation can pass a tighter set.
  allowedRoles?: string[];
}

export interface AuthGateOptions {
  loginPath?: string;            // default "/login"
  devBypass?: boolean;           // NEXT_PUBLIC_DEV_BYPASS=1 → true
  // When dev-bypass is on, we still want the response handler to
  // know it's a bypass so it can render a banner. Outcome ===
  // "dev-bypass" is the signal; the redirect path is undefined.
}

export interface AuthGateDecision {
  outcome: AuthGateOutcome;
  redirect?: string;
  reason?: string;
  banner?: string;               // operator-facing for dev-bypass
}

export const DEFAULT_LOGIN_PATH = "/login";
export const DEV_BYPASS_BANNER =
  "DEV MODE — BOS is open. Set NEXT_PUBLIC_DEV_BYPASS=0 to gate.";

// `from=bos&next=<encoded path>` so post-login redirect can land
// the user back on the BOS path they originally requested. Mirrors
// T1 R022's `?return=` param semantics.
export function buildLoginRedirect(opts: { loginPath?: string; nextPath: string }): string {
  const base = opts.loginPath ?? DEFAULT_LOGIN_PATH;
  const params = new URLSearchParams({ from: "bos", next: opts.nextPath });
  return `${base}?${params.toString()}`;
}

// ── BOS me endpoint payload ───────────────────────────────────

export interface BosMeUser {
  id: UserId;
  email: string;
  name?: string;
  role?: string;
}

export interface BosMePayload {
  user: BosMeUser;
  hcSlot?: Record<string, unknown>;
  // Most-recent capture timestamp; BOS uses this to know how stale
  // the personalisation snapshot is.
  capturedAt?: number;
  // True for `lead` role users — they're outside any agency tenant
  // and BOS should not surface agency-only features.
  agencyless: boolean;
}
