import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import {
  DomainAttachConflictError,
  DomainAttachNotFoundError,
  InvalidStatusTransitionError,
} from "../server/service";
import type { CreateDomainAttachInput, DomainStatus } from "../lib/domain";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const conflict = (m: string): Response => json({ ok: false, error: m }, 409);
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);
async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}
function build(ctx: PluginCtx) {
  if (!ctx.clientId) throw new Error("agency-domains: client-scoped");
  return containerFor({
    agencyId: ctx.agencyId, clientId: ctx.clientId,
    storage: ctx.storage, install: ctx.install,
  });
}

export async function listAttachesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const attaches = await build(ctx).domains.list();
  return json({ ok: true, attaches });
}

export async function createAttachHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateDomainAttachInput>(req);
  if (!body || !body.hostname) return badRequest("invalid_body");
  try {
    const attach = await build(ctx).domains.create(ctx.actor, body);
    return json({ ok: true, attach }, 201);
  } catch (e) {
    if (e instanceof DomainAttachConflictError) return conflict(e.message);
    return badRequest(e instanceof Error ? e.message : "create_failed");
  }
}

export async function deleteAttachHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "DELETE") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    await build(ctx).domains.delete(ctx.actor, id);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof DomainAttachNotFoundError) return notFound("not_found");
    return badRequest("delete_failed");
  }
}

export async function transitionAttachHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const status = url.searchParams.get("status") as DomainStatus | null;
  if (!id || !status) return badRequest("id_status_required");
  const body = (await safeJson<{ lastError?: string }>(req)) ?? {};
  try {
    const attach = await build(ctx).domains.transition(ctx.actor, id, status, body.lastError);
    return json({ ok: true, attach });
  } catch (e) {
    if (e instanceof DomainAttachNotFoundError) return notFound("not_found");
    if (e instanceof InvalidStatusTransitionError) return badRequest(e.message);
    return badRequest("transition_failed");
  }
}

export async function statusHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const attach = await build(ctx).domains.get(id);
  if (!attach) return notFound("not_found");
  return json({ ok: true, status: attach.status, hostname: attach.hostname,
    verifiedAt: attach.verifiedAt, lastError: attach.lastError });
}

// Stub — flagged TODO for T6. Returns the attach unchanged.
export async function verifyAttachHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const c = build(ctx);
  const attach = await c.domains.get(id);
  if (!attach) return notFound("not_found");
  const result = await c.domains.verify(id);
  return json({ ok: true, ...result, status: attach.status });
}
