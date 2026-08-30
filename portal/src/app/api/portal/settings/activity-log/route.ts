import { NextResponse, type NextRequest } from "next/server";
import { authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { queryActivity, redactActivityValue } from "@/server/activity";
import { ensureHydrated } from "@/server/storage";
import { isoDateTimeValue } from "@/lib/shared/formatDateTime";
import { canUseAgencySettingsCapability } from "@/lib/agencySettingsCapabilities";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

export async function GET(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session || !canUseAgencySettingsCapability(session.role, "viewActivityLog")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const clientId = params.get("clientId") || undefined;
  if (clientId) {
    try {
      await requireCurrentClientWorkspaceElementAccess(clientId, "client.record", "view");
    } catch (error) {
      return authErrorResponse(error);
    }
  }
  const from = parseDate(params.get("from"), false);
  const to = parseDate(params.get("to"), true);
  // Parsed once and used twice (the query and the hasMore tail). It was read
  // from the params at both sites, which is the exact shape that drifts the
  // moment one site changes and the other does not.
  const offset = numberParam(params.get("offset"), 0, 0, 5_000_000);
  const result = queryActivity({
    agencyId: session.agencyId,
    clientId,
    category: params.get("category") || undefined,
    action: params.get("action") || undefined,
    actor: params.get("actor") || undefined,
    query: params.get("q") || undefined,
    from,
    to,
    offset,
    limit: numberParam(params.get("limit"), 100, 1, 50_000),
  });
  const entries = result.entries.map(entry => ({
    ...entry,
    metadata: redactActivityValue(entry.metadata),
  }));
  const format = params.get("format");

  if (format === "json") {
    const complete = queryActivity({
      agencyId: session.agencyId,
      clientId,
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
      clientId,
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
      isoDateTimeValue(entry.ts) ?? "",
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
    hasMore: (offset + entries.length) < result.total,
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
  // `Number(null)` and `Number("")` are BOTH 0, and 0 is finite — so the
  // fallback branch below was unreachable for a missing or empty param and a
  // request with no `limit` returned exactly ONE record (clamped up to min=1),
  // not 100. Latent in the UI only because the panel hardcoded &limit=100;
  // live for every other caller. Found 2026-08-30 while adding pagination.
  if (value === null || value.trim() === "") return fallback;
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
  const text = value === undefined || value === null ? "" : String(value);
  // Formula-injection guard (Ed's finding, 2026-08-30): a log message starting
  // with = + - @ executes as a formula when the export opens in Excel/Sheets,
  // and log messages carry user-influenced text (names, subjects). A leading
  // apostrophe makes the cell inert text; spreadsheet apps hide it.
  const defused = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${defused.replaceAll('"', '""')}"`;
}
