import { NextResponse } from "next/server";

import { AuthError, authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { buildBusinessIssueRadar, invalidateBusinessIssueRadarCache } from "@/engines/data/server/radar/businessIssueRadar";
import { runRadarFullSweep } from "@/engines/data/server/radar/radarSweeps";
import { getAgencyWorkspaceSettings, updateAgencyWorkspaceSettings } from "@/server/agencySettings";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import type { RadarPolicyConfiguration } from "@/server/types";

async function runFullRadarScan() {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const { radar, memory } = await runRadarFullSweep(session.agencyId);
    await flushPendingWrites();
    return NextResponse.json({ ok: true, radar: { ...radar, memory } });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    console.error("[radar] full scan failed:", error);
    return NextResponse.json({ ok: false, error: "The Radar scan ran, but fresh evidence could not be saved. Retry in a moment." }, { status: 503 });
  }
}

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    invalidateBusinessIssueRadarCache(session.agencyId);
    const radar = await buildBusinessIssueRadar(session.agencyId);
    return NextResponse.json({ ok: true, radar });
  } catch (error) {
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
    if (error instanceof AuthError) return authErrorResponse(error);
    console.error("[radar] policy update failed:", error);
    return NextResponse.json({ ok: false, error: "The Radar policy could not save." }, { status: 500 });
  }
}
