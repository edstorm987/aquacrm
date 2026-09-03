import { NextResponse } from "next/server";

import { AuthError, authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { updateAgencyWorkspaceSettings } from "@/server/agencySettings";
import { AccessControlError, accessErrorResponse } from "@/server/accessControl";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import type { AgencyWorkspaceSettings } from "@/server/types";
import { DEPARTMENT_PROFILES } from "@/lib/access/departmentProfiles";
import { requireCurrentAccessActor } from "@/server/accessControl";
import { resolveBusinessRadarCapabilityForActor } from "@/lib/server/intelligence/personalRadarAccess";
import { assertWorkspaceElementAccess, resolveActorWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";

type Body = { departmentBaselines?: AgencyWorkspaceSettings["departmentBaselines"] };

function validBaselines(value: unknown): AgencyWorkspaceSettings["departmentBaselines"] | null {
  if (!Array.isArray(value)) return null;
  const known = new Set<string>(DEPARTMENT_PROFILES.map(profile => profile.id));
  const seen = new Set<string>();
  const result: NonNullable<AgencyWorkspaceSettings["departmentBaselines"]> = [];
  for (const row of value) {
    if (!row || typeof row !== "object") return null;
    const { departmentId, weeklyHours } = row as { departmentId?: unknown; weeklyHours?: unknown };
    if (typeof departmentId !== "string" || !known.has(departmentId) || seen.has(departmentId)) return null;
    if (typeof weeklyHours !== "number" || !Number.isFinite(weeklyHours) || weeklyHours <= 0 || weeklyHours > 168) return null;
    seen.add(departmentId);
    result.push({ departmentId, weeklyHours });
  }
  return result;
}

/** A deliberately narrow write boundary for Business Radar workload targets. */
export async function POST(request: Request) {
  try {
    await ensureHydrated();
    await requireRole(["agency-owner", "agency-manager"]);
    const businessActor = await requireCurrentAccessActor();
    if (!await resolveBusinessRadarCapabilityForActor(businessActor, "view")) {
      throw new AccessControlError(403, "workspace_overview_view_required");
    }
    const actor = businessActor;
    assertWorkspaceElementAccess(resolveActorWorkspaceElementAccess(actor, "staff"), "workspace.settings", "manage");
    const body = await request.json().catch(() => null) as Body | null;
    const departmentBaselines = validBaselines(body?.departmentBaselines);
    if (!departmentBaselines) {
      return NextResponse.json({ ok: false, error: "Each baseline needs one known department and weekly hours greater than 0 and no more than 168.", field: "departmentBaselines" }, { status: 400 });
    }

    const settings = updateAgencyWorkspaceSettings(actor.resourceAgencyId, {
      departmentBaselines,
    }, actor.user.id);
    await flushPendingWrites();
    return NextResponse.json({ ok: true, departmentBaselines: settings.departmentBaselines ?? [] });
  } catch (error) {
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }
}
