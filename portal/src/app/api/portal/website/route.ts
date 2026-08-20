import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import {
  clearAgencyWebsiteTelemetry,
  ensureAgencyWebsite,
  recordAgencyWebsiteTelemetry,
  resetAgencyWebsiteTelemetryKey,
  updateAgencyWebsite,
  updateAgencyWebsitePage,
} from "@/server/agencyWebsite";
import { ensureHydrated } from "@/server/storage";
import type { AgencyWebsitePageStatus, AgencyWebsiteReleaseStatus } from "@/server/types";
import { isLocalDevelopmentUrl, normalizeWebsiteUrl } from "@/lib/public/publicUrl";

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    return NextResponse.json({ ok: true, website: ensureAgencyWebsite(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const body = await request.json().catch(() => null) as {
      action?: "update" | "page-status" | "test-tag" | "reset-tag" | "clear-events";
      status?: AgencyWebsiteReleaseStatus;
      gateHeadline?: string;
      gateMessage?: string;
      maintenanceMessage?: string;
      productionUrl?: string;
      previewUrl?: string;
      repositoryUrl?: string;
      localPath?: string;
      route?: string;
      pageStatus?: AgencyWebsitePageStatus;
      message?: string;
    } | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "Action required." }, { status: 400 });

    if (body.action === "update") {
      const submittedProductionUrl = body.productionUrl?.trim();
      const submittedPreviewUrl = body.previewUrl?.trim();
      const productionUrl = submittedProductionUrl ? normalizeWebsiteUrl(submittedProductionUrl) : undefined;
      const previewUrl = submittedPreviewUrl ? normalizeWebsiteUrl(submittedPreviewUrl) : undefined;
      if (submittedProductionUrl && (!productionUrl || isLocalDevelopmentUrl(productionUrl))) {
        return NextResponse.json({ ok: false, error: "Production URL must be a valid official domain, not localhost." }, { status: 400 });
      }
      if (submittedPreviewUrl && !previewUrl) {
        return NextResponse.json({ ok: false, error: "Preview URL is not valid." }, { status: 400 });
      }
      const website = updateAgencyWebsite(session.agencyId, { ...body, productionUrl, previewUrl }, session.userId);
      return NextResponse.json({ ok: true, website });
    }
    if (body.action === "page-status") {
      if (!body.route || !body.pageStatus) {
        return NextResponse.json({ ok: false, error: "Route and page status required." }, { status: 400 });
      }
      const website = updateAgencyWebsitePage(
        session.agencyId,
        body.route,
        { status: body.pageStatus, message: body.message },
        session.userId,
      );
      return website
        ? NextResponse.json({ ok: true, website })
        : NextResponse.json({ ok: false, error: "Website page not found." }, { status: 404 });
    }
    if (body.action === "reset-tag") {
      return NextResponse.json({ ok: true, website: resetAgencyWebsiteTelemetryKey(session.agencyId, session.userId) });
    }
    if (body.action === "clear-events") {
      return NextResponse.json({ ok: true, website: clearAgencyWebsiteTelemetry(session.agencyId, session.userId) });
    }
    if (body.action === "test-tag") {
      const website = ensureAgencyWebsite(session.agencyId);
      const recorded = recordAgencyWebsiteTelemetry(website.telemetrySiteKey, {
        propertyId: "milesymedia-website",
        type: "heartbeat",
        occurredAt: Date.now(),
        url: website.productionUrl,
        path: "/",
        title: "Aqua tag test",
        environment: "portal-test",
      }, "Aqua website tag test");
      return NextResponse.json({ ok: recorded?.status === "recorded", website: ensureAgencyWebsite(session.agencyId) });
    }
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
