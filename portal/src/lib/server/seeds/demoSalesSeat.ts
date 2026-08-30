import "server-only";

// The demo sales caller — a login you can hand to a candidate on a trial.
//
// Ed, 2026-08-29: *"I need a sales team ASAP, so I'd rather just have a quick
// preset all built out and then I can start hiring some commission callers."*
//
// ── Why this user holds NO access grant ───────────────────────────────────
//
// The first version of this file granted the real `Sales — worker profile`
// template here, on the theory that a trialist should see exactly what a hire
// sees. That failed 24 Dev Mode tests with `actor_not_found`, and the reason is
// structural rather than fixable: `withAccessControlPlaneTransaction` writes
// every grant and template inside `runInDataRealm(LIVE_DATA_REALM_ID, …)`. The
// access authority is ONE live-realm record whatever realm you are browsing, so
// a demo-realm user cannot hold a grant at all.
//
// Ed's call, 2026-08-29: keep the demo caller a plain demo user. Which is the
// right shape anyway —
//
//   • a candidate on a trial works DEMO contacts, so somebody who does not work
//     out has never touched a real prospect;
//   • when they are actually hired they are provisioned on the live agency with
//     `ensureDepartmentTemplates` + a grant, which is where a real seat belongs
//     and means there is nothing to migrate.
//
// So: this creates a login. The SEAT — what they can reach — is the live-realm
// job, and deliberately not done here.

import { createUser, getUser } from "@/server/users";

export const DEMO_SALES_EMAIL = "sales@aqua.dev";
export const DEMO_SALES_PASSWORD = "sales-demo-2026";
export const DEMO_SALES_NAME = "Demo Caller";

export interface DemoSalesUserResult {
  created: boolean;
  userId: string;
}

/**
 * A demo caller login on the demo tenant.
 *
 * `agency-staff` is the floor, and on the demo tenant it is also the ceiling —
 * there is no grant narrowing it further, so this persona shows the SHAPE of
 * the job (a caller working a list) rather than the exact permissions a hired
 * caller will hold. That difference is worth knowing when demoing: what a real
 * hire sees is narrower than this, never wider.
 */
export function ensureDemoSalesUser(agencyId: string): DemoSalesUserResult {
  const existing = getUser(DEMO_SALES_EMAIL);
  if (existing) return { created: false, userId: existing.id };

  const user = createUser({
    email: DEMO_SALES_EMAIL,
    password: DEMO_SALES_PASSWORD,
    name: DEMO_SALES_NAME,
    role: "agency-staff",
    agencyId,
  });
  return { created: true, userId: user.id };
}
