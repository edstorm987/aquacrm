import "server-only";

// SOPs access gate (T1 R4 — chapter `04-agency-shell-sops.md`).
//
// Foundation-side, session-role-keyed gate. Mirrors the prompt's
// `requireRole("sops.view")` / `requireRole("sops.tag.<family>")` shape
// without coupling foundation to agency-hr's CustomRole storage. The
// prompt's "Founder default" fallback is honoured: any agency role with
// no explicit Employee-HQ assignment is treated as Founder (full
// access). Fine-grained per-CustomRole permission lookup lands when a
// foundation-level "current employee role" resolver ships (R+1).

import type { SessionPayload, Role } from "@/server/types";
import { AGENCY_ROLES } from "@/server/types";

export type SopsTagFamily = "sales" | "service" | "leads" | "standards" | "mastery";

const ALL_TAG_FAMILIES: readonly SopsTagFamily[] = [
  "sales", "service", "leads", "standards", "mastery",
] as const;

export class SopsAccessError extends Error {
  status = 403;
  constructor(public readonly required: string) {
    super(`Permission denied: requires ${required}`);
    this.name = "SopsAccessError";
  }
}

function isAgency(role: Role): boolean {
  return (AGENCY_ROLES as readonly Role[]).includes(role);
}

// Throws SopsAccessError (status 403) when the session can't view SOPs
// (or the requested family). Founder fallback: any agency-* role passes
// in v1; per-family family-level gating is enforced for client roles
// only (which never read agency SOPs anyway).
export function assertSopsAccess(
  session: SessionPayload | null | undefined,
  family?: SopsTagFamily,
): void {
  if (!session) throw new SopsAccessError("sops.view");
  if (!isAgency(session.role)) {
    // Client + end-customer roles never see agency SOPs.
    throw new SopsAccessError(family ? `sops.tag.${family}` : "sops.view");
  }
  // Founder default: agency-owner / agency-manager / agency-staff all
  // pass v1. Fine-grained per-CustomRole gates land R+1 once a
  // foundation-level employee-role resolver exists.
  if (family && !ALL_TAG_FAMILIES.includes(family)) {
    throw new SopsAccessError(`sops.tag.${family}`);
  }
}

// Phase → tag-family suggestion. Drives the per-client SOPs sub-tab
// filter — show SOPs the operator typically wants while at this phase.
export function familiesForStage(stage: string): SopsTagFamily[] {
  switch (stage) {
    case "lead":
    case "discovery":
    case "aqua-epic-intro":
    case "aqua-blueprint":
      return ["sales", "leads"];
    case "design":
    case "development":
    case "onboarding":
    case "aqua-diagnostics":
    case "aqua-brand-builder":
      return ["service", "standards"];
    case "aqua-traffic":
      return ["service", "mastery"];
    case "live":
    case "aqua-mastery":
      return ["mastery", "service"];
    default:
      return ["standards"];
  }
}
