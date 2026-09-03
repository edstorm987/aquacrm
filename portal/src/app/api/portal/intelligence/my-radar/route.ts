import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { readPersonalRadar } from "@/lib/server/intelligence/myRadar";
import { readPersonalRadarActions } from "@/lib/server/intelligence/personalRadarActions";
import { resolvePersonalRadarAccessForActor } from "@/lib/server/intelligence/personalRadarAccess";
import { personalRadarHeadline } from "@/lib/intelligence/personalRadar";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";
import { AGENCY_ROLES } from "@/server/types";
import { AccessControlError, accessErrorResponse, requireCurrentAccessActor } from "@/server/accessControl";

// The topbar My Radar's fresh read: this person's own actions, goals,
// wellbeing and work rhythm. Company health remains in Business Radar.
//
// The server wrapper renders an INITIAL reading; this route is what the panel
// asks on open, so the snapshot is current rather than as-of-last-navigation.
// The existing staff.overview boundary remains the envelope around personal
// planning and wellbeing. The Actions slice applies workspace.actions as well,
// so neither element can be reached through a chrome side door.
//
// Read-only: no writes, no `flushPendingWrites`. Tenant and user come from the
// SESSION and nothing else — the request carries no ids at all.

export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
    const actor = session.role !== "agency-owner"
      ? (await requireCurrentWorkspaceElementAccess("staff", "staff.overview", "view")).actor
      : await requireCurrentAccessActor();
    const now = Date.now();
    const { goalsAvailable, goalsWritable } = await resolvePersonalRadarAccessForActor(actor);
    const reading = await readPersonalRadar({
      agencyId: actor.resourceAgencyId,
      userId: session.userId,
      now,
      includeGoals: goalsAvailable,
      goalsWritable,
    });
    const { actions, actionSummary, available: actionsAvailable } = await readPersonalRadarActions(session, now, actor);
    return NextResponse.json({
      ok: true,
      generatedAt: now,
      reading,
      actions,
      actionSummary,
      actionsAvailable,
      headline: personalRadarHeadline(reading, actions, now, actionSummary),
    });
  } catch (error) {
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    return authErrorResponse(error);
  }
}
