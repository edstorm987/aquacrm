import "server-only";

import { effectiveRole } from "@/lib/server/auth/effectiveRole";
import { founderEmail } from "@/lib/server/auth/founderAgency";
import { canUseDevMode } from "@/lib/server/dev/devModeAccess";
import type { SessionPayload } from "@/server/types";
import { getUserById } from "@/server/users";

function canonicalEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * The real internal founder account, resolved from live state rather than an
 * old role claim in a session cookie.
 *
 * Dev Team is part of the production control plane, but it is not a tenant
 * feature: another agency owner must never inherit it merely because the
 * agency role vocabulary calls every owner "Founder". The configured
 * FOUNDER_EMAIL identifies the one operator this deployment belongs to and
 * the live user lookup makes a downgrade or agency move take effect at once.
 */
export function productionDevTeamFounder(session: SessionPayload | null | undefined): boolean {
  if (!session || session.publicShowcase || session.role !== "agency-owner") return false;

  const expectedEmail = founderEmail();
  const liveUser = getUserById(session.userId);
  if (!liveUser || liveUser.role !== "agency-owner") return false;

  return canonicalEmail(session.email) === expectedEmail
    && canonicalEmail(liveUser.email) === expectedEmail
    && liveUser.agencyId === session.agencyId;
}

/**
 * One access decision for every Dev Team page, API and navigation entry.
 *
 * Local sandbox fixtures keep their existing founder + Dev Mode path. Outside
 * that sandbox, only the deployment's live founder account passes. This
 * deliberately separates the internal workspace from the demo-persona switch:
 * production Dev Team access no longer requires PORTAL_DEV_MODE, and turning
 * Dev Mode on never grants the workspace to a non-founder.
 */
export function devTeamAccessible(session: SessionPayload | null | undefined): boolean {
  if (!effectiveRole(session).isFounder) return false;
  return canUseDevMode() || productionDevTeamFounder(session);
}
