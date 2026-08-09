import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import type { ClientTelemetryEvent } from "@/lib/clientTelemetry";
import { buildPerformanceAnalyticsForRange } from "@/lib/performanceAnalytics";
import {
  cleanMonthlyPerformanceReports,
  reportHighlights,
  reportMonthRange,
  reportNextSteps,
  type MonthlyPerformanceReport,
} from "@/lib/performanceReports";
import { getSessionFromRequest } from "@/lib/server/auth";
import { logActivity } from "@/server/activity";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";

const ROLES = new Set(["agency-owner", "agency-manager", "agency-staff"]);

interface Body {
  action?: "generate" | "publish" | "delete";
  clientId?: string;
  reportId?: string;
  propertyId?: string;
  month?: string;
}

export async function GET(request: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !ROLES.has(session.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const clientId = request.nextUrl.searchParams.get("clientId") || "";
  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });
  return NextResponse.json({ ok: true, reports: cleanMonthlyPerformanceReports(client.metadata?.monthlyPerformanceReports) });
}

export async function POST(request: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !ROLES.has(session.role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as Body | null;
  if (!body?.action || !body.clientId) return NextResponse.json({ ok: false, error: "Choose a client and report action." }, { status: 400 });
  const client = getClientForAgency(session.agencyId, body.clientId);
  if (!client) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });
  const reports = cleanMonthlyPerformanceReports(client.metadata?.monthlyPerformanceReports);

  try {
    let next = reports;
    let report: MonthlyPerformanceReport | undefined;
    if (body.action === "generate") {
      const month = body.month || previousMonth();
      const range = reportMonthRange(month);
      const events = combinedEvents(client.metadata).filter(event => !body.propertyId || event.propertyId === body.propertyId);
      const analytics = buildPerformanceAnalyticsForRange(events, range.start, range.end);
      report = {
        id: reports.find(item => item.month === month && item.propertyId === body.propertyId)?.id ?? `rpt_${crypto.randomBytes(8).toString("hex")}`,
        clientId: client.id,
        propertyId: body.propertyId || undefined,
        month,
        label: range.label,
        status: "draft",
        generatedAt: Date.now(),
        analytics,
        highlights: reportHighlights(analytics),
        nextSteps: reportNextSteps(analytics),
      };
      next = [report, ...reports.filter(item => item.id !== report?.id)];
    } else {
      const existing = reports.find(item => item.id === body.reportId);
      if (!existing) return NextResponse.json({ ok: false, error: "Report not found." }, { status: 404 });
      if (body.action === "delete") next = reports.filter(item => item.id !== existing.id);
      else {
        report = { ...existing, status: "published", publishedAt: Date.now() };
        next = reports.map(item => item.id === existing.id ? report as MonthlyPerformanceReport : item);
      }
    }
    updateClient(session.agencyId, client.id, { metadata: { monthlyPerformanceReports: next } });
    logActivity({
      agencyId: session.agencyId,
      clientId: client.id,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "marketing",
      action: `performance_report.${body.action}`,
      message: `${body.action === "publish" ? "Published" : body.action === "delete" ? "Deleted" : "Generated"} ${report?.label ?? "monthly"} performance report for ${client.name}.`,
      metadata: { reportId: report?.id || body.reportId, month: report?.month },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, report, reports: next });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Report could not be updated." }, { status: 400 });
  }
}

function combinedEvents(metadata: Record<string, unknown> | undefined): ClientTelemetryEvent[] {
  const firstParty = Array.isArray(metadata?.telemetryEvents) ? metadata.telemetryEvents as ClientTelemetryEvent[] : [];
  const search = Array.isArray(metadata?.searchConsoleEvents) ? metadata.searchConsoleEvents as ClientTelemetryEvent[] : [];
  return [...firstParty, ...search];
}

function previousMonth(): string {
  const value = new Date();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() - 1);
  return value.toISOString().slice(0, 7);
}
