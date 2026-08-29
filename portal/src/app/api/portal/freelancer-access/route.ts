import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";
import {
  clearFreelancerJobOverride,
  getFreelancerAccessConfig,
  listFreelancerJobsForConfig,
  saveFreelancerAccessConfig,
  setFreelancerJobOverride,
} from "@/server/freelancerWorkspace";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

// Agency freelancer-access policy — what a freelancer sees + can do. GET the
// agency default + every job's override; POST to save the default, or a per-job
// override (`jobId`), or clear one (`jobId` + `clear`). Owner/manager to write.
export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    // This route CONFIGURES the freelancer's alternative authority; it is not
    // that authority. `FreelancerAccessConfig` decides what a contractor sees,
    // and is deliberately left as the contractor's own governance
    // (clientAssociationElement.ts names it) — but EDITING it is agency HR work
    // and answers to the element evaluator like the rest of People.
    await requireCurrentWorkspaceElementAccess("staff", "staff.people", "view");
    return NextResponse.json({
      ok: true,
      config: getFreelancerAccessConfig(session.agencyId),
      jobs: listFreelancerJobsForConfig(session.agencyId),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    // Writing the policy is manage: this decides what every contractor may see,
    // including whether a client is named to them at all.
    await requireCurrentWorkspaceElementAccess("staff", "staff.people", "manage");
    const body = await request.json().catch(() => null) as { config?: unknown; jobId?: string; clear?: boolean } | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "config required" }, { status: 400 });
    }

    // Per-job override — clear it, or set it (normalised field-by-field).
    if (body.jobId) {
      if (body.clear) {
        clearFreelancerJobOverride(body.jobId);
        return NextResponse.json({ ok: true, config: getFreelancerAccessConfig(session.agencyId), jobId: body.jobId, cleared: true });
      }
      return NextResponse.json({ ok: true, config: setFreelancerJobOverride(body.jobId, body.config), jobId: body.jobId });
    }

    // Agency-wide default.
    return NextResponse.json({ ok: true, config: saveFreelancerAccessConfig(session.agencyId, body.config) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
