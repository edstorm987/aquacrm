import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { buildBusinessIssueRadar, invalidateBusinessIssueRadarCache } from "@/lib/server/businessIssueRadar";
import { recordRadarSweep } from "@/lib/server/radarMemory";
import { runAgencySyntheticProbes } from "@/lib/server/radarSyntheticProbes";
import { recordRadarEvidence } from "@/lib/server/radarEvidenceVault";
import { getAgencyWorkspaceSettings, updateAgencyWorkspaceSettings } from "@/server/agencySettings";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import type { RadarPolicyConfiguration } from "@/server/types";

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    await runAgencySyntheticProbes(session.agencyId, { force: true });
    const radar = await buildBusinessIssueRadar(session.agencyId);
    const memory = recordRadarSweep(session.agencyId, radar);
    recordRadarEvidence(session.agencyId, radar);
    invalidateBusinessIssueRadarCache(session.agencyId);
    await flushPendingWrites();
    return NextResponse.json({ ok: true, radar: { ...radar, memory } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const body = await request.json().catch(() => null) as { policy?: Partial<RadarPolicyConfiguration> } | null;
    if (!body?.policy) return NextResponse.json({ ok: false, error: "Radar policy required." }, { status: 400 });
    const current = getAgencyWorkspaceSettings(session.agencyId);
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
          createdBy: existing?.createdBy ?? session.userId,
        };
      }) ?? current.advisor.radarPolicy.exceptions,
      updatedAt: Date.now(),
    };
    updateAgencyWorkspaceSettings(session.agencyId, {
      advisor: { ...current.advisor, radarPolicy: policy },
    }, session.userId);
    invalidateBusinessIssueRadarCache(session.agencyId);
    const radar = await buildBusinessIssueRadar(session.agencyId);
    await flushPendingWrites();
    return NextResponse.json({ ok: true, radar });
  } catch (error) {
    return authErrorResponse(error);
  }
}
