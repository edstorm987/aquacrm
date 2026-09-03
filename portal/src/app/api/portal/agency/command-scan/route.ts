import { NextResponse, type NextRequest } from "next/server";

import { inspectRadarEvidence } from "@/engines/data/server/radar/radarEvidenceVault";
import {
  AuthError,
  authErrorResponse,
  getSessionFromRequest,
  isSessionFresh,
  resolveFreshSessionUser,
} from "@/lib/server/auth/auth";
import { requireCsrf } from "@/lib/server/auth/csrf";
import {
  commandScanPrincipalForSession,
  issueCommandScanResult,
} from "@/lib/server/commandScanResults";
import { requireCommandScanIssueAccess } from "@/lib/server/commandScanAccess";
import { AccessControlError, accessErrorResponse } from "@/server/accessControl";
import { ensureHydrated } from "@/server/storage";
import { getAgency } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";

function requestIsSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/**
 * The only execution door for the expensive Radar + KPI graph. GET/RSC reads
 * can continue an opaque result handle, but cannot trigger this work.
 */
export async function POST(request: NextRequest) {
  try {
    if (!requestIsSameOrigin(request)) {
      return NextResponse.json({ ok: false, error: "cross_origin_request" }, { status: 403 });
    }
    const csrf = requireCsrf(request);
    if (!csrf.ok) {
      return NextResponse.json({ ok: false, error: csrf.error }, { status: 403 });
    }

    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session) throw new AuthError(401, "unauthorized");
    // `getSessionFromRequest` already crosses the central freshness boundary;
    // keep this explicit re-check at the expensive execution door so a future
    // auth-helper refactor cannot turn a signed-but-stale cookie into compute.
    const currentUser = await resolveFreshSessionUser(session);
    if (!currentUser) throw new AuthError(401, "stale_session");
    if (!isSessionFresh(session, currentUser)) throw new AuthError(401, "stale_session");
    const currentMemberships = currentUser.agencyIds.length > 0
      ? currentUser.agencyIds
      : currentUser.agencyId ? [currentUser.agencyId] : [];
    const authorityAgencyId = session.sandbox?.returnAgencyId ?? session.agencyId;
    if (!currentMemberships.includes(authorityAgencyId)) throw new AuthError(403, "tenant_membership");
    if (!AGENCY_ROLES.includes(session.role)) throw new AuthError(403, "forbidden");
    if (session.publicShowcase) throw new AuthError(403, "showcase_read_only");
    // Roles are only presets. A manager/staff member whose Workspace overview
    // element has been narrowed must not use this route as a data back door.
    const accessActor = await requireCommandScanIssueAccess();
    if (accessActor.session.userId !== session.userId) throw new AuthError(401, "session_subject_mismatch");

    const agency = getAgency(accessActor.resourceAgencyId);
    if (!agency) return NextResponse.json({ ok: false, error: "agency_not_found" }, { status: 404 });

    // Keep one scan-as-of timestamp across the builders, but do not start the
    // continuation TTL until the expensive graph has actually completed.
    const scanAsOf = Date.now();
    const [radar, brandPortfolio] = await Promise.all([
      import("@/engines/data/server/radar/businessIssueRadar")
        .then(({ getCachedBusinessIssueRadar }) => getCachedBusinessIssueRadar(agency.id)),
      import("@/lib/server/brandPortfolioService")
        .then(({ buildBrandPortfolioSnapshot }) => buildBrandPortfolioSnapshot(agency.id, scanAsOf)),
    ]);
    const intelligence = await import("@/lib/server/commandIntelligenceService")
      .then(({ buildCommandIntelligenceSnapshot }) => buildCommandIntelligenceSnapshot({
        agencyId: agency.id,
        radar,
        evidence: inspectRadarEvidence(agency.id),
        now: scanAsOf,
        brandPortfolio,
      }));
    const result = await issueCommandScanResult({
      principal: commandScanPrincipalForSession(session, agency.id, accessActor.user),
      radar,
      intelligence,
    });

    // Deliberately return no Radar/KPI snapshot. The following RSC navigation
    // must re-read this handle from the shared provider, which proves the same
    // flow works when POST and GET land on different server instances.
    return NextResponse.json(
      { ok: true, handle: result.handle, expiresAt: result.expiresAt },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    console.error("[command-scan] scan failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "command_scan_failed" }, { status: 500 });
  }
}
