import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { ChecklistNotFoundError } from "../server/services";
import type {
  BulkTickEntry,
  CreateChecklistItemInput,
  ChecklistStatus,
  UpdateChecklistItemPatch,
} from "../lib/domain";
import { CHECKLIST_STATUSES, OWNER_KINDS } from "../lib/domain";

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
  if (!ctx.clientId) throw new Error("onboarding-checklist: clientId required");
  return containerFor({ agencyId: ctx.agencyId, clientId: ctx.clientId, storage: ctx.storage, install: ctx.install });
}

export async function listItemsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const ownerRaw = url.searchParams.get("ownerKind");
  const statusRaw = url.searchParams.get("status");
  const owner = ownerRaw && (OWNER_KINDS as readonly string[]).includes(ownerRaw)
    ? (ownerRaw as "agency" | "customer") : undefined;
  const status = statusRaw && (CHECKLIST_STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as ChecklistStatus) : undefined;
  const items = await build(ctx).checklist.list({
    ...(owner ? { ownerKind: owner } : {}),
    ...(status ? { status } : {}),
  });
  const completion = await build(ctx).checklist.completionPct();
  return json({ ok: true, items, completion });
}

export async function createItemHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateChecklistItemInput>(req);
  if (!body || !body.title || !body.ownerKind) return badRequest("invalid_body");
  if (!(OWNER_KINDS as readonly string[]).includes(body.ownerKind)) return badRequest("invalid_owner_kind");
  try {
    const item = await build(ctx).checklist.create(ctx.actor, body);
    return json({ ok: true, item }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "create_failed");
  }
}

export async function updateItemHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = (await safeJson<UpdateChecklistItemPatch>(req)) ?? {};
  try {
    const item = await build(ctx).checklist.update(ctx.actor, id, body);
    return json({ ok: true, item });
  } catch (e) {
    if (e instanceof ChecklistNotFoundError) return notFound("not_found");
    return badRequest("update_failed");
  }
}

export async function tickItemHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const status = url.searchParams.get("status") as ChecklistStatus | null;
  if (!id || !status) return badRequest("id_status_required");
  if (!(CHECKLIST_STATUSES as readonly string[]).includes(status)) return badRequest("invalid_status");
  try {
    const item = await build(ctx).checklist.tick(ctx.actor, id, status);
    return json({ ok: true, item });
  } catch (e) {
    if (e instanceof ChecklistNotFoundError) return notFound("not_found");
    return badRequest("tick_failed");
  }
}

export async function bulkTickHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<{ entries: BulkTickEntry[] }>(req);
  if (!body || !Array.isArray(body.entries)) return badRequest("invalid_body");
  const items = await build(ctx).checklist.bulkTick(ctx.actor, body.entries);
  return json({ ok: true, items });
}

export async function reorderHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<{ ids: string[] }>(req);
  if (!body || !Array.isArray(body.ids)) return badRequest("invalid_body");
  const items = await build(ctx).checklist.reorder(body.ids);
  return json({ ok: true, items });
}

export async function deleteItemHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "DELETE") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    await build(ctx).checklist.delete(ctx.actor, id);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof ChecklistNotFoundError) return notFound("not_found");
    return badRequest("delete_failed");
  }
}
