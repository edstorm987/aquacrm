import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/server/auth";
import { queryActivity, redactActivityValue } from "@/server/activity";
import { ensureHydrated } from "@/server/storage";

const ALLOWED_ROLES = new Set(["agency-owner", "agency-manager"]);

export async function GET(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session || !ALLOWED_ROLES.has(session.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const from = parseDate(params.get("from"), false);
  const to = parseDate(params.get("to"), true);
  const result = queryActivity({
    agencyId: session.agencyId,
    clientId: params.get("clientId") || undefined,
    category: params.get("category") || undefined,
    action: params.get("action") || undefined,
    actor: params.get("actor") || undefined,
    query: params.get("q") || undefined,
    from,
    to,
    offset: numberParam(params.get("offset"), 0, 0, 50_000),
    limit: numberParam(params.get("limit"), 100, 1, 500),
  });
  const entries = result.entries.map(entry => ({
    ...entry,
    metadata: redactActivityValue(entry.metadata),
  }));
  const format = params.get("format");

  if (format === "json") {
    const complete = queryActivity({
      agencyId: session.agencyId,
      clientId: params.get("clientId") || undefined,
      category: params.get("category") || undefined,
      action: params.get("action") || undefined,
      actor: params.get("actor") || undefined,
      query: params.get("q") || undefined,
      from,
      to,
      limit: 50_000,
    }).entries.map(entry => ({ ...entry, metadata: redactActivityValue(entry.metadata) }));
    return new Response(JSON.stringify(complete, null, 2), {
      headers: downloadHeaders("application/json", "milesymedia-activity-log.json"),
    });
  }

  if (format === "csv") {
    const complete = queryActivity({
      agencyId: session.agencyId,
      clientId: params.get("clientId") || undefined,
      category: params.get("category") || undefined,
      action: params.get("action") || undefined,
      actor: params.get("actor") || undefined,
      query: params.get("q") || undefined,
      from,
      to,
      limit: 50_000,
    }).entries;
    const headings = ["time", "category", "action", "message", "client_id", "actor", "metadata"];
    const rows = complete.map(entry => [
      new Date(entry.ts).toISOString(),
      entry.category,
      entry.action,
      entry.message,
      entry.clientId ?? "",
      entry.actorEmail ?? entry.actorUserId ?? "",
      JSON.stringify(redactActivityValue(entry.metadata)),
    ]);
    return new Response([headings, ...rows].map(row => row.map(csvCell).join(",")).join("\n"), {
      headers: downloadHeaders("text/csv; charset=utf-8", "milesymedia-activity-log.csv"),
    });
  }

  return NextResponse.json({
    ok: true,
    ...result,
    entries,
    hasMore: (numberParam(params.get("offset"), 0, 0, 50_000) + entries.length) < result.total,
  }, {
    headers: { "cache-control": "private, no-store" },
  });
}

function parseDate(value: string | null, endOfDay: boolean): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function numberParam(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
}

function downloadHeaders(contentType: string, filename: string): HeadersInit {
  return {
    "content-type": contentType,
    "content-disposition": `attachment; filename="${filename}"`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  };
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}
