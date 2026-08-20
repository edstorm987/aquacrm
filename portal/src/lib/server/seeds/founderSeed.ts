import "server-only";
// Founder seed (T1 R024 — chapter `04-founder-password-rotation.md`).
//
// Earlier (chapter #122 unify-3) this module hardcoded a 3-char dev
// password and bypassed `validatePassword` via a direct `mutate`. R024 ships
// the ship-gate fix: founder credentials live in env, the seed honours
// `validatePassword`, and production refuses to start with weak or
// default values.
//
// Behaviour:
//
//   - `FOUNDER_EMAIL` — defaults to the real AquaCRM owner account.
//   - `FOUNDER_PASSWORD` — no default. Missing → log a warning + skip
//     the seed (rather than create an unauthenticated founder).
//   - `FOUNDER_AGENCY_NAME` — defaults to the AquaOasis-Web workspace.
//   - Production guard: when `NODE_ENV === "production"`, refuse to
//     seed when password length < 12.
//     Throws — fail-closed startup error rather than silent insecure
//     seed.

import { ensureHydrated } from "@/server/storage";
import { bootstrapAgency } from "@/server/agencyBootstrap";
import { installCorePluginsForScope } from "@/built-ins/runtime/_runtime";
import { getAgencyBySlug, updateAgency } from "@/server/tenants";
import { createUser, getUser, updateUser } from "@/server/users";
import { INTERNAL_WORKSPACE_NAME } from "@/lib/shared/internalWorkspace";

export const FOUNDER_AGENCY_SLUG = "milesymedia";
export const DEFAULT_FOUNDER_EMAIL = "edwardhallam07@gmail.com";
export const DEFAULT_FOUNDER_AGENCY_NAME = INTERNAL_WORKSPACE_NAME;
export const FOUNDER_NAME = "Ed Hallam";
export const FOUNDER_USERNAME = "Ed";

export const FOUNDER_EMAIL = (process.env.FOUNDER_EMAIL ?? DEFAULT_FOUNDER_EMAIL).trim();

function readFounderAgencyName(): string {
  const v = process.env.FOUNDER_AGENCY_NAME;
  return v && v.trim() ? v.trim() : DEFAULT_FOUNDER_AGENCY_NAME;
}

interface PolicyCheck {
  ok: boolean;
  reason?: string;
}

// Exported for the smoke. Pure — takes explicit inputs so the test
// can drive every branch without process.env mutation.
export function checkFounderPolicy(input: {
  email: string;
  password: string | undefined;
  nodeEnv: string | undefined;
}): PolicyCheck {
  if (!input.password) {
    return { ok: false, reason: "FOUNDER_PASSWORD not set — skipping founder seed." };
  }
  if (input.nodeEnv === "production") {
    if (input.password.length < 12) {
      return { ok: false, reason: "FOUNDER_PASSWORD must be ≥12 chars in production." };
    }
  }
  return { ok: true };
}

let seedPromise: Promise<void> | null = null;

export function seedFounder(): Promise<void> {
  if (!seedPromise) seedPromise = run();
  return seedPromise;
}

async function run(): Promise<void> {
  await ensureHydrated();

  const existing = getUser(FOUNDER_EMAIL);
  if (existing) {
    if (existing.username !== FOUNDER_USERNAME) {
      updateUser(existing.email, { username: FOUNDER_USERNAME }, { role: existing.role, clientId: existing.clientId });
    }
    const agency = getAgencyBySlug(FOUNDER_AGENCY_SLUG);
    const agencyName = readFounderAgencyName();
    if (agency && agency.name !== agencyName) {
      updateAgency(agency.id, { name: agencyName });
    }
    if (agency) {
      await installCorePluginsForScope({ agencyId: agency.id }, existing.id);
      const { ensureZimanteTradingCompanies } = await import("@/server/zimanteTradingCompanies");
      ensureZimanteTradingCompanies(agency.id, existing.id);
    }
    return;
  }

  const password = process.env.FOUNDER_PASSWORD;
  const policy = checkFounderPolicy({
    email: FOUNDER_EMAIL,
    password,
    nodeEnv: process.env.NODE_ENV,
  });
  if (!policy.ok) {
    if (process.env.NODE_ENV === "production") {
      // Fail-closed in production — never silent-skip when the operator
      // intended to seed and got it wrong.
      throw new Error(`[founderSeed] ${policy.reason}`);
    }
    // Dev / test: warn + skip. Operators sign in with their own
    // signed-up agency instead.
    // eslint-disable-next-line no-console
    console.warn(`[founderSeed] ${policy.reason}`);
    return;
  }

  const agencyName = readFounderAgencyName();

  let agency = getAgencyBySlug(FOUNDER_AGENCY_SLUG);
  if (!agency) {
    const result = await bootstrapAgency({
      name: agencyName,
      slug: FOUNDER_AGENCY_SLUG,
      ownerEmail: FOUNDER_EMAIL,
    });
    agency = result.agency;
  }

  // No more direct-mutate bypass. createUser runs validatePassword,
  // hashes, and emits user.signed_up — same path signup uses.
  const founder = createUser({
    email: FOUNDER_EMAIL,
    username: FOUNDER_USERNAME,
    password: password!,
    role: "agency-owner",
    agencyId: agency.id,
    name: FOUNDER_NAME,
  });

  const { ensureZimanteTradingCompanies } = await import("@/server/zimanteTradingCompanies");
  ensureZimanteTradingCompanies(agency.id, founder.id);

}

// Test helper — purely for the smoke to reset the module-level cache
// between invocations. Not for prod use.
export function _resetFounderSeedForTests(): void {
  seedPromise = null;
}
