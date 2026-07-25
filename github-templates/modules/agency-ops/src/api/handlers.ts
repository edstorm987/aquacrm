import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type {
  CreateIncidentInput,
  CreateRecurringTaskInput,
  CreateStatusItemInput,
  MarkStatusInput,
  UpdateIncidentPatch,
  UpdateRecurringTaskPatch,
} from "../lib/domain";

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
  return containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install });
}

// ─── Recurring tasks ──────────────────────────────────────────────

export async function listTasksHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const tasks = await build(ctx).tasks.list();
  return json({ ok: true, tasks });
}

export async function createTaskHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateRecurringTaskInput>(req);
  if (!body || !body.title || !body.cadence) return badRequest("invalid_body");
  try {
    const task = await build(ctx).tasks.create(ctx.actor, body);
    return json({ ok: true, task }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "create_failed");
  }
}

export async function updateTaskHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = (await safeJson<UpdateRecurringTaskPatch>(req)) ?? {};
  try {
    const task = await build(ctx).tasks.update(ctx.actor, id, body);
    return json({ ok: true, task });
  } catch (e) {
    if (e instanceof Error && e.message === "agency-ops: task not found") return notFound("not_found");
    return badRequest(e instanceof Error ? e.message : "update_failed");
  }
}

export async function completeTaskHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    const task = await build(ctx).tasks.complete(ctx.actor, id);
    return json({ ok: true, task });
  } catch (e) {
    if (e instanceof Error && e.message === "agency-ops: task not found") return notFound("not_found");
    return badRequest("complete_failed");
  }
}

export async function archiveTaskHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "DELETE") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    await build(ctx).tasks.archive(ctx.actor, id);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "agency-ops: task not found") return notFound("not_found");
    return badRequest("archive_failed");
  }
}

export async function seedTasksHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const result = await build(ctx).tasks.seedDefaults(ctx.actor);
  return json({ ok: true, ...result });
}

// ─── Status items ─────────────────────────────────────────────────

export async function listStatusHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const items = await build(ctx).status.list();
  return json({ ok: true, items });
}

export async function createStatusHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateStatusItemInput>(req);
  if (!body || !body.system) return badRequest("invalid_body");
  try {
    const item = await build(ctx).status.create(ctx.actor, body);
    return json({ ok: true, item }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "create_failed");
  }
}

export async function markStatusHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = await safeJson<MarkStatusInput>(req);
  if (!body || !body.status) return badRequest("invalid_body");
  try {
    const item = await build(ctx).status.markChecked(ctx.actor, id, body);
    return json({ ok: true, item });
  } catch (e) {
    if (e instanceof Error && e.message === "agency-ops: status item not found") return notFound("not_found");
    return badRequest("mark_failed");
  }
}

// ─── Incidents ────────────────────────────────────────────────────

export async function listIncidentsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const resolved = url.searchParams.get("resolved");
  const incidents = await build(ctx).incidents.list({
    resolved: resolved === null ? undefined : resolved === "1",
  });
  return json({ ok: true, incidents });
}

export async function openIncidentHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateIncidentInput>(req);
  if (!body || !body.title || !body.severity) return badRequest("invalid_body");
  try {
    const inc = await build(ctx).incidents.open(ctx.actor, body);
    return json({ ok: true, incident: inc }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "open_failed");
  }
}

export async function updateIncidentHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = (await safeJson<UpdateIncidentPatch>(req)) ?? {};
  try {
    const inc = await build(ctx).incidents.update(ctx.actor, id, body);
    return json({ ok: true, incident: inc });
  } catch (e) {
    if (e instanceof Error && e.message === "agency-ops: incident not found") return notFound("not_found");
    return badRequest("update_failed");
  }
}

export async function resolveIncidentHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    const inc = await build(ctx).incidents.resolve(ctx.actor, id);
    return json({ ok: true, incident: inc });
  } catch (e) {
    if (e instanceof Error && e.message === "agency-ops: incident not found") return notFound("not_found");
    return badRequest("resolve_failed");
  }
}

// ─── Health ───────────────────────────────────────────────────────

export async function healthOverviewHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const overview = await build(ctx).health.overview();
  return json({ ok: true, overview });
}
