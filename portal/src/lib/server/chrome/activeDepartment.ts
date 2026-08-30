import "server-only";

// Which department the person is currently working as.
//
// Ed, 2026-08-29: *"the owner needs to margin their time out in Command Centre
// — what's going to do today, we need to allocate time, log into the set
// profiles, become a worker in your own company."*
//
// ── A cookie, and why that is safe here ───────────────────────────────────
//
// Normally "the client tells the server who it is" is the shape of a security
// bug. It is safe in this one case because of the property the lens guarantees:
// `applyDepartmentLens` can only REMOVE rows from panels that were already
// assembled and role-filtered. So the worst a forged cookie achieves is hiding
// some of your own navigation from yourself.
//
// That is the entire reason the lens was built as an intersection. Had it been
// able to add rows, this value would need to be server-authoritative, signed,
// and checked against a grant — and this file would be a permission system
// wearing a cookie.
//
// It is deliberately NOT stored on `UserChromeLayout`: the hat you are wearing
// this morning is not part of how you arranged your sidebar, and writing it
// there would mean a state write on a path that runs on every navigation
// (issue #21).

import { cookies } from "next/headers";

import { departmentProfile } from "@/lib/access/departmentProfiles";

export const ACTIVE_DEPARTMENT_COOKIE = "aqua-department";

/**
 * The active department id, or undefined for "no hat on".
 *
 * Validated against the known profiles rather than trusted: an unrecognised
 * value resolves to undefined, which is the unlensed sidebar — the same
 * fail-open rule `withPersonalChrome` follows, and for the same reason. Losing
 * a lens is an annoyance; losing the nav is being locked out of the app.
 */
export async function getActiveDepartmentId(): Promise<string | undefined> {
  try {
    const jar = await cookies();
    const raw = jar.get(ACTIVE_DEPARTMENT_COOKIE)?.value?.trim();
    return departmentProfile(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}
