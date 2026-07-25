// R008 handlers — content calendar + touchpoints + performance.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type {
  CreateContentItemInput,
  CreateTouchpointInput,
  TouchpointFilter,
  UpdateContentItemPatch,
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

// ─── Content ──────────────────────────────────────────────────────

export async function listContentHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const items = await build(ctx).content.list();
  return json({ ok: true, items });
}

export async function createContentHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateContentItemInput>(req);
  if (!body || !body.title || !body.channel) return badRequest("invalid_body");
  try {
    const item = await build(ctx).content.create(ctx.actor, body);
    return json({ ok: true, item }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "create_failed");
  }
}

export async function updateContentHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = (await safeJson<UpdateContentItemPatch>(req)) ?? {};
  try {
    const item = await build(ctx).content.update(ctx.actor, id, body);
    return json({ ok: true, item });
  } catch (e) {
    if (e instanceof Error && e.message === "agency-marketing: content item not found") return notFound("not_found");
    return badRequest(e instanceof Error ? e.message : "update_failed");
  }
}

export async function publishContentHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    const item = await build(ctx).content.publish(ctx.actor, id);
    return json({ ok: true, item });
  } catch (e) {
    if (e instanceof Error && e.message === "agency-marketing: content item not found") return notFound("not_found");
    return badRequest("publish_failed");
  }
}

export async function calendarWindowHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  if (!fromRaw || !toRaw) return badRequest("from_to_required");
  const from = Number(fromRaw);
  const to = Number(toRaw);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return badRequest("invalid_window");
  const window = await build(ctx).content.window(from, to);
  return json({ ok: true, window });
}

// ─── Touchpoints ──────────────────────────────────────────────────

export async function listTouchpointsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const filter: TouchpointFilter = {
    leadId: url.searchParams.get("leadId") ?? undefined,
    campaignId: url.searchParams.get("campaignId") ?? undefined,
  };
  const touchpoints = await build(ctx).touchpoints.list(filter);
  return json({ ok: true, touchpoints });
}

export async function recordTouchpointHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateTouchpointInput>(req);
  if (!body || !body.leadId || !body.type || !body.channel) return badRequest("invalid_body");
  try {
    const tp = await build(ctx).touchpoints.record(ctx.actor, body);
    return json({ ok: true, touchpoint: tp }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "record_failed");
  }
}

// ─── Performance ──────────────────────────────────────────────────

export async function performanceSummaryHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const summary = await build(ctx).performance.summary(Date.now());
  return json({ ok: true, summary });
}
