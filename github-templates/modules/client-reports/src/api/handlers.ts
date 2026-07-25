import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import {
  InvalidReportTransitionError,
  ReportNotFoundError,
} from "../server/services";
import type {
  CreateReportInput,
  ReportStatus,
  UpdateReportPatch,
} from "../lib/domain";
import { REPORT_STATUSES } from "../lib/domain";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);
async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}
function build(ctx: PluginCtx) {
  if (!ctx.clientId) throw new Error("client-reports: clientId required");
  return containerFor({ agencyId: ctx.agencyId, clientId: ctx.clientId, storage: ctx.storage, install: ctx.install });
}

export async function listReportsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const statusRaw = url.searchParams.get("status");
  const status = statusRaw && (REPORT_STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as ReportStatus) : undefined;
  const reports = await build(ctx).reports.list({
    ...(status ? { status } : {}),
    ...(url.searchParams.get("phaseId") ? { phaseId: url.searchParams.get("phaseId")! } : {}),
    ...(url.searchParams.get("sharedOnly") === "1" ? { sharedOnly: true } : {}),
  });
  return json({ ok: true, reports });
}

export async function getReportHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const report = await build(ctx).reports.get(id);
  if (!report) return notFound("not_found");
  return json({ ok: true, report });
}

export async function createReportHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateReportInput>(req);
  if (!body || !body.phaseId || !body.title) return badRequest("invalid_body");
  try {
    const report = await build(ctx).reports.create(ctx.actor, body);
    return json({ ok: true, report }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "create_failed");
  }
}

export async function patchReportHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = (await safeJson<UpdateReportPatch>(req)) ?? {};
  try {
    const report = await build(ctx).reports.update(ctx.actor, id, body);
    return json({ ok: true, report });
  } catch (e) {
    if (e instanceof ReportNotFoundError) return notFound("not_found");
    return badRequest("update_failed");
  }
}

export async function publishReportHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    const report = await build(ctx).reports.publish(ctx.actor, id);
    return json({ ok: true, report });
  } catch (e) {
    if (e instanceof ReportNotFoundError) return notFound("not_found");
    if (e instanceof InvalidReportTransitionError) return badRequest(e.message);
    return badRequest("publish_failed");
  }
}

export async function markSentHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    const report = await build(ctx).reports.markSent(ctx.actor, id);
    return json({ ok: true, report });
  } catch (e) {
    if (e instanceof ReportNotFoundError) return notFound("not_found");
    if (e instanceof InvalidReportTransitionError) return badRequest(e.message);
    return badRequest("mark_sent_failed");
  }
}

export async function deleteReportHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "DELETE") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    await build(ctx).reports.delete(ctx.actor, id);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof ReportNotFoundError) return notFound("not_found");
    return badRequest("delete_failed");
  }
}
