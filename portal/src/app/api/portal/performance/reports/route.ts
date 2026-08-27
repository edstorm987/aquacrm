import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import type { ClientTelemetryEvent } from "@/lib/clients/clientTelemetry";
import { buildPerformanceAnalyticsForRange } from "@/lib/performance/performanceAnalytics";
import {
  cleanMonthlyPerformanceReports,
  createMonthlyPerformanceReportDraft,
  deleteMonthlyPerformanceReportDraft,
  publishMonthlyPerformanceReport,
  reportHighlights,
  reportMonthRange,
  reportNextSteps,
  type MonthlyPerformanceReport,
  withdrawMonthlyPerformanceReport,
} from "@/lib/performance/performanceReports";
import { authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { routeTenantScope } from "@/lib/server/portal/apiTenantScope";
import { logActivity } from "@/server/activity";
import { withClientMetadataLedgerTransaction } from "@/server/productWorkspaceCoordinator";
import { ensureHydrated } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

const ROLES = new Set(["agency-owner", "agency-manager", "agency-staff"]);

interface Body {
  action?: "generate" | "publish" | "withdraw" | "delete";
  clientId?: string;
  reportId?: string;
  propertyId?: string;
  month?: string;
  withdrawalReason?: string;
}

export async function GET(request: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !ROLES.has(session.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const client = routeTenantScope(session, { clientId: request.nextUrl.searchParams.get("clientId") }).client;
    if (!client) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });
    await requireCurrentClientWorkspaceElementAccess(client.id, "client.marketing", "view");
    return NextResponse.json({ ok: true, reports: cleanMonthlyPerformanceReports(client.metadata?.monthlyPerformanceReports) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !ROLES.has(session.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as Body | null;
  if (!body?.action || !isReportAction(body.action) || !body.clientId) return NextResponse.json({ ok: false, error: "Choose a client and report action." }, { status: 400 });
  let scope;
  try {
    scope = routeTenantScope(session, { clientId: body.clientId });
  } catch (error) {
    return authErrorResponse(error);
  }
  if (!scope.client) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });
  try {
    await requireCurrentClientWorkspaceElementAccess(
      scope.client.id,
      "client.marketing",
      body.action === "generate" ? "use" : "manage",
    );
  } catch (error) {
    return authErrorResponse(error);
  }

  try {
    const result = await withClientMetadataLedgerTransaction({
      agencyId: scope.agencyId,
      clientId: body.clientId,
      ledger: "performance-reports",
    }, () => {
      const client = getClientForAgency(scope.agencyId, body.clientId!);
      if (!client) throw new Error("Client not found.");
      const reports = cleanMonthlyPerformanceReports(client.metadata?.monthlyPerformanceReports);
      let outcome: { report: MonthlyPerformanceReport; reports: MonthlyPerformanceReport[] };
      if (body.action === "generate") {
        const month = body.month || previousMonth();
        const range = reportMonthRange(month);
        const propertyId = body.propertyId?.trim() || undefined;
        if (propertyId && !metadataProperties(client.metadata).some(property => property.id === propertyId)) {
          throw new Error("Property not found.");
        }
        const events = combinedEvents(client.metadata).filter(event => !propertyId || event.propertyId === propertyId);
        const analytics = buildPerformanceAnalyticsForRange(events, range.start, range.end);
        outcome = createMonthlyPerformanceReportDraft(reports, {
          id: `rpt_${crypto.randomBytes(8).toString("hex")}`,
          clientId: client.id,
          propertyId,
          month,
          label: range.label,
          generatedAt: Date.now(),
          analytics,
          highlights: reportHighlights(analytics),
          nextSteps: reportNextSteps(analytics),
        });
      } else if (body.action === "publish") {
        outcome = publishMonthlyPerformanceReport(reports, body.reportId || "", session.userId);
      } else if (body.action === "withdraw") {
        outcome = withdrawMonthlyPerformanceReport(reports, body.reportId || "", session.userId, body.withdrawalReason || "");
      } else {
        outcome = deleteMonthlyPerformanceReportDraft(reports, body.reportId || "");
      }
      updateClient(scope.agencyId, client.id, { metadata: { monthlyPerformanceReports: outcome.reports } });
      const verb = body.action === "publish" ? "Published"
        : body.action === "withdraw" ? "Withdrew"
          : body.action === "delete" ? "Deleted draft"
            : "Generated draft";
      logActivity({
        agencyId: scope.agencyId,
        clientId: client.id,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "marketing",
        action: `performance_report.${body.action}`,
        message: `${verb} ${outcome.report.label} performance report revision ${outcome.report.revision} for ${client.name}.`,
        metadata: {
          reportId: outcome.report.id,
          month: outcome.report.month,
          revision: outcome.report.revision,
          supersedesReportId: outcome.report.supersedesReportId,
          withdrawalReason: outcome.report.withdrawalReason,
        },
      });
      return outcome;
    });
    return NextResponse.json({ ok: true, report: result.report, reports: result.reports });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Report could not be updated.";
    return NextResponse.json({ ok: false, error: message }, { status: message === "Report not found." || message === "Client not found." ? 404 : 400 });
  }
}

function combinedEvents(metadata: Record<string, unknown> | undefined): ClientTelemetryEvent[] {
  const firstParty = Array.isArray(metadata?.telemetryEvents) ? metadata.telemetryEvents as ClientTelemetryEvent[] : [];
  const search = Array.isArray(metadata?.searchConsoleEvents) ? metadata.searchConsoleEvents as ClientTelemetryEvent[] : [];
  return [...firstParty, ...search];
}

function metadataProperties(metadata: Record<string, unknown> | undefined): Array<{ id?: unknown }> {
  return Array.isArray(metadata?.properties) ? metadata.properties as Array<{ id?: unknown }> : [];
}

function isReportAction(value: unknown): value is NonNullable<Body["action"]> {
  return value === "generate" || value === "publish" || value === "withdraw" || value === "delete";
}

function previousMonth(): string {
  const value = new Date();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() - 1);
  return value.toISOString().slice(0, 7);
}
