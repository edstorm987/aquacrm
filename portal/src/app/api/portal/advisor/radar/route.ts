import { NextResponse } from "next/server";

import { AuthError, authErrorResponse } from "@/lib/server/auth/auth";
import { buildBusinessIssueRadar, invalidateBusinessIssueRadarCache } from "@/engines/data/server/radar/businessIssueRadar";
import { runRadarFullSweep } from "@/engines/data/server/radar/radarSweeps";
import { getAgencyWorkspaceSettings, updateAgencyWorkspaceSettings } from "@/server/agencySettings";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import type { RadarPolicyConfiguration } from "@/server/types";
import { AccessControlError, accessErrorResponse, requireCurrentAccessActor } from "@/server/accessControl";
import { resolveBusinessRadarCapabilityForActor } from "@/lib/server/intelligence/personalRadarAccess";
import { assertWorkspaceElementAccess, resolveActorWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";

async function requireBusinessRadar(action: "view" | "use") {
  const actor = await requireCurrentAccessActor();
  if (!await resolveBusinessRadarCapabilityForActor(actor, action)) {
    throw new AccessControlError(403, `workspace_overview_${action}_required`);
  }
  return actor;
}

async function runFullRadarScan() {
  try {
    await ensureHydrated();
    // Running a full sweep WRITES evidence, so it needs `use` rather than a
    // role. Issue #182: a role check passes a manager whose element access has
    // been narrowed, and the Advisor then answers from what the UI hides.
    const actor = await requireBusinessRadar("use");
    const { radar, memory } = await runRadarFullSweep(actor.resourceAgencyId);
    await flushPendingWrites();
    return NextResponse.json({ ok: true, radar: { ...radar, memory } });
  } catch (error) {
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    if (error instanceof AuthError) return authErrorResponse(error);
    console.error("[radar] full scan failed:", error);
    return NextResponse.json({ ok: false, error: "The Radar scan ran, but fresh evidence could not be saved. Retry in a moment." }, { status: 503 });
  }
}

export async function GET() {
  try {
    await ensureHydrated();
    const actor = await requireBusinessRadar("view");
    invalidateBusinessIssueRadarCache(actor.resourceAgencyId);
    const radar = await buildBusinessIssueRadar(actor.resourceAgencyId);
    return NextResponse.json({ ok: true, radar });
  } catch (error) {
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    if (error instanceof AuthError) return authErrorResponse(error);
    console.error("[radar] snapshot refresh failed:", error);
    return NextResponse.json({ ok: false, error: "The live Radar picture could not refresh." }, { status: 500 });
  }
}

export async function POST() {
  return runFullRadarScan();
}

export async function PATCH(request: Request) {
  try {
    await ensureHydrated();
    // Changing the Radar policy is configuration, not a read.
    const actor = await requireBusinessRadar("view");
    assertWorkspaceElementAccess(resolveActorWorkspaceElementAccess(actor, "staff"), "workspace.settings", "manage");
    const body = await request.json().catch(() => null) as { policy?: Partial<RadarPolicyConfiguration> } | null;
    if (!body?.policy) return NextResponse.json({ ok: false, error: "Radar policy required." }, { status: 400 });
    const current = getAgencyWorkspaceSettings(actor.resourceAgencyId);
    const policy: RadarPolicyConfiguration = {
      ...current.advisor.radarPolicy,
      ...body.policy,
      defaultPolicy: { ...current.advisor.radarPolicy.defaultPolicy, ...(body.policy.defaultPolicy ?? {}) },
      domainPolicies: { ...current.advisor.radarPolicy.domainPolicies, ...(body.policy.domainPolicies ?? {}) },
      metricPolicies: { ...current.advisor.radarPolicy.metricPolicies, ...(body.policy.metricPolicies ?? {}) },
      exceptions: body.policy.exceptions?.map(exception => {
        const existing = current.advisor.radarPolicy.exceptions.find(item => item.id === exception.id);
        return {
          ...exception,
          createdAt: existing?.createdAt ?? Date.now(),
          createdBy: existing?.createdBy ?? actor.user.id,
        };
      }) ?? current.advisor.radarPolicy.exceptions,
      updatedAt: Date.now(),
    };
    updateAgencyWorkspaceSettings(actor.resourceAgencyId, {
      advisor: { ...current.advisor, radarPolicy: policy },
    }, actor.user.id);
    invalidateBusinessIssueRadarCache(actor.resourceAgencyId);
    const radar = await buildBusinessIssueRadar(actor.resourceAgencyId);
    await flushPendingWrites();
    return NextResponse.json({ ok: true, radar });
  } catch (error) {
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    if (error instanceof AuthError) return authErrorResponse(error);
    console.error("[radar] policy update failed:", error);
    return NextResponse.json({ ok: false, error: "The Radar policy could not save." }, { status: 500 });
  }
}
