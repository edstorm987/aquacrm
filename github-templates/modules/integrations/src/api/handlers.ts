import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { IntegrationNotFoundError } from "../server/service";
import type {
  CreateIntegrationInput,
  IntegrationFilter,
  IntegrationKind,
  IntegrationStatus,
  UpdateIntegrationPatch,
  VerifyResult,
} from "../lib/domain";
import { INTEGRATION_KINDS, INTEGRATION_STATUSES } from "../lib/domain";

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
  return containerFor({ agencyId: ctx.agencyId, clientId: ctx.clientId, storage: ctx.storage, install: ctx.install });
}

export async function listHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const kindRaw = url.searchParams.get("kind");
  const statusRaw = url.searchParams.get("status");
  const kind = kindRaw && (INTEGRATION_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as IntegrationKind) : undefined;
  const status = statusRaw && (INTEGRATION_STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as IntegrationStatus) : undefined;
  const filter: IntegrationFilter = { kind, status };
  const items = await build(ctx).integrations.list(filter);
  return json({ ok: true, items });
}

export async function getHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const r = await build(ctx).integrations.get(id);
  if (!r) return notFound("not_found");
  return json({ ok: true, integration: r });
}

export async function createHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateIntegrationInput>(req);
  if (!body || !body.kind || !body.label) return badRequest("invalid_body");
  if (!(INTEGRATION_KINDS as readonly string[]).includes(body.kind)) return badRequest("invalid_kind");
  try {
    const r = await build(ctx).integrations.create(ctx.actor, body);
    return json({ ok: true, integration: r }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "create_failed");
  }
}

export async function updateHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = (await safeJson<UpdateIntegrationPatch>(req)) ?? {};
  try {
    const r = await build(ctx).integrations.update(ctx.actor, id, body);
    return json({ ok: true, integration: r });
  } catch (e) {
    if (e instanceof IntegrationNotFoundError) return notFound("not_found");
    return badRequest("update_failed");
  }
}

export async function deleteHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "DELETE") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    await build(ctx).integrations.delete(ctx.actor, id);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof IntegrationNotFoundError) return notFound("not_found");
    return badRequest("delete_failed");
  }
}

export async function verifyHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = (await safeJson<VerifyResult>(req)) ?? { ok: true };
  try {
    const r = await build(ctx).integrations.verify(ctx.actor, id, body);
    return json({ ok: true, integration: r });
  } catch (e) {
    if (e instanceof IntegrationNotFoundError) return notFound("not_found");
    return badRequest("verify_failed");
  }
}

export async function pingHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = (await safeJson<{ url?: string }>(req)) ?? {};
  const row = await build(ctx).webhooks.ping(ctx.actor, id, body);
  return json({ ok: true, entry: row });
}

export async function logHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const integrationId = url.searchParams.get("integrationId") ?? undefined;
  const dirRaw = url.searchParams.get("direction");
  const direction = (dirRaw === "incoming" || dirRaw === "outgoing") ? dirRaw : undefined;
  const items = await build(ctx).webhooks.list({ integrationId, direction });
  return json({ ok: true, items });
}
