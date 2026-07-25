// HTTP handlers for the domains plugin. Each handler unpacks a
// `PluginCtx`, calls into the per-request container, returns JSON.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type { AttachDomainInput } from "../lib/domain";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);

const buildContainer = (ctx: PluginCtx) =>
  containerFor({
    agencyId: ctx.agencyId,
    ...(ctx.clientId !== undefined ? { clientId: ctx.clientId } : {}),
    storage: ctx.storage,
  });

async function safeJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

// ─── GET /status — non-secret check that env is configured ───────────────

export async function statusHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const c = buildContainer(ctx);
  return json({ ok: true, configured: c.domains.isConfigured() });
}

// ─── GET /list — domains for current agency / client scope ───────────────

export async function listHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const c = buildContainer(ctx);
  const domains = await c.domains.list();
  return json({ ok: true, domains });
}

// ─── POST /attach { hostname, vercelProjectId, vercelTeamId? } ───────────

export async function attachHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<AttachDomainInput>(req);
  if (!body || !body.hostname || !body.vercelProjectId) {
    return badRequest("hostname + vercelProjectId required.");
  }
  const c = buildContainer(ctx);
  const result = await c.domains.attach(body, ctx.actor);
  // 200 on configured success / configured failure; 409 on
  // not-configured (different shape). Caller can dispatch on `ok` +
  // `configured` flags.
  return json(result, result.ok ? 200 : (result.configured ? 502 : 409));
}

// ─── POST /verify { id } ─────────────────────────────────────────────────

export async function verifyHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id?: string }>(req);
  if (!body?.id) return badRequest("id required.");
  const c = buildContainer(ctx);
  const result = await c.domains.verify(body.id, ctx.actor);
  if (result.error === "not-found") return notFound(result.error);
  return json(result, result.ok ? 200 : (result.configured ? 502 : 409));
}

// ─── DELETE ?id= ─────────────────────────────────────────────────────────

export async function removeHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "DELETE") return json({ ok: false, error: "method_not_allowed" }, 405);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const c = buildContainer(ctx);
  const result = await c.domains.remove(id, ctx.actor);
  if (!result.ok && result.error === "not-found") return notFound(result.error);
  return json(result, result.ok ? 200 : 502);
}
