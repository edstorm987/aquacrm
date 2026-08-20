import "server-only";
// Dev mode — a writable authenticated session against the fictional showcase
// workspace, so the real UI can be driven end to end without production
// credentials and without touching production data.
//
// This is an authentication bypass. It is gated by four independent
// conditions, ALL of which must hold, and any one of which failing makes the
// route behave as if it does not exist:
//
//   1. `PORTAL_DEV_MODE` is explicitly "true" — never on by default.
//   2. `NODE_ENV` is not "production".
//   3. No `VERCEL_ENV` — any Vercel deployment, including previews, is out.
//   4. The active storage backend is file or memory.
//
// (4) is the one that matters most. Even if the first three were somehow
// misconfigured together, dev mode still cannot reach a durable backend, so it
// physically cannot mint a session against real data.

import { getBackendInfo } from "@/server/storage";

// A dedicated dev tenant, deliberately separate from the real agency and from
// the showcase workspace. Showcase is a shared fictional tenant that
// `resetAndSeedShowcaseWorkspace()` wipes and re-seeds, so fixtures placed
// there disappear without warning. This one is ours and stays put.
export const DEV_AGENCY_SLUG = "bare-co";
export const DEV_AGENCY_NAME = "Bare Co";
export const DEV_OWNER_EMAIL = "dev-owner@bare-co.test";

/**
 * Which tenant dev mode signs into, when the clean room is not the point.
 *
 * Bare Co is empty by design, which is right for building but useless for
 * anything that needs volume — Radar has no retained evidence there, so the
 * screens that read it are untestable and look broken rather than empty.
 * Pointing dev mode at a tenant restored from a live snapshot gives the real
 * shape of the data.
 *
 * This does not weaken any of the four guards above. In particular the backend
 * must still be file or memory, so this reads a local copy and can never reach
 * production — the name is a tenant inside the sandbox, not a route to it.
 */
export function devAgencySlug(): string {
  return process.env.PORTAL_DEV_AGENCY?.trim() || DEV_AGENCY_SLUG;
}

export function usingDefaultDevAgency(): boolean {
  return devAgencySlug() === DEV_AGENCY_SLUG;
}

export interface DevModeStatus {
  enabled: boolean;
  reason?: string;
}

export function devModeStatus(): DevModeStatus {
  if (process.env.PORTAL_DEV_MODE !== "true") {
    return { enabled: false, reason: "PORTAL_DEV_MODE is not set to \"true\"." };
  }
  if (process.env.NODE_ENV === "production") {
    return { enabled: false, reason: "NODE_ENV is production." };
  }
  if (process.env.VERCEL_ENV) {
    return { enabled: false, reason: `Running on Vercel (${process.env.VERCEL_ENV}).` };
  }
  const backend = getBackendInfo().kind;
  if (backend !== "file" && backend !== "memory") {
    return {
      enabled: false,
      // The important refusal: a durable backend means real data.
      reason: `Storage backend is "${backend}". Dev mode only runs on the file or memory backend so it cannot touch real data. Start with: npm run dev:sandbox`,
    };
  }
  return { enabled: true };
}

export function isDevModeEnabled(): boolean {
  return devModeStatus().enabled;
}
