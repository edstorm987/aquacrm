import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { ensureHydrated } from "@/server/storage";
import { readMyRadar } from "@/lib/server/intelligence/myRadar";
import { allocationHeadline } from "@/lib/intelligence/departmentAllocation";
import { listAgencyTasks } from "@/server/tasks";
import { requireCurrentAccessActor } from "@/server/accessControl";
import { canReadClientAssociation } from "@/lib/server/access/clientAssociationElement";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";
import { AGENCY_ROLES } from "@/server/types";

// The topbar My Radar's fresh read: this person's week plus their open Actions.
//
// The server wrapper renders an INITIAL reading; this route is what the panel
// asks on open, so the meters are current rather than as-of-last-navigation.
// It is the `dashboard-planning` GET shape on purpose, including that route's
// staff element gate — the reading is the same working-time data the staff
// overview shows, and an element that has been revoked must not stay readable
// through a side door in the chrome.
//
// Read-only: no writes, no `flushPendingWrites`. Tenant and user come from the
// SESSION and nothing else — the request carries no ids at all.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
    if (session.role === "agency-staff") {
      await requireCurrentWorkspaceElementAccess("staff", "staff.overview", "view");
    }
    const now = Date.now();
    // The rolling 7 days, matching the page and the dashboard mount — baselines
    // are weekly, so a reading over any other window would grade against a
    // target that does not apply to it.
    const reading = readMyRadar({ agencyId: session.agencyId, userId: session.userId, from: now - WEEK_MS, to: now, now });
    // Own open work only — and an Action naming a client stays behind the
    // client gate exactly as GET /api/portal/tasks does: same actor, resolved
    // once, same helper deciding per row.
    const actor = await requireCurrentAccessActor();
    const myOpenTasks = listAgencyTasks(session.agencyId)
      .filter(task => task.status !== "done"
        && (task.assigneeUserId === session.userId || task.createdBy === session.userId)
        && canReadClientAssociation(actor, "agency-task", task.clientId))
      .sort((left, right) => (left.dueAt ?? Number.MAX_SAFE_INTEGER) - (right.dueAt ?? Number.MAX_SAFE_INTEGER))
      .slice(0, 8)
      .map(task => ({ id: task.id, title: task.title, status: task.status, priority: task.priority, dueAt: task.dueAt }));
    return NextResponse.json({ ok: true, generatedAt: now, reading, headline: allocationHeadline(reading.allocation), myOpenTasks });
  } catch (error) {
    return authErrorResponse(error);
  }
}
