import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type {
  ChannelConfig,
  CreateRuleInput,
  UpdateRulePatch,
} from "../lib/domain";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);

async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; }
  catch { return null; }
}

function build(ctx: PluginCtx) {
  return containerFor({
    agencyId: ctx.agencyId,
    clientId: ctx.clientId,
    storage: ctx.storage,
    install: ctx.install,
  });
}

export async function listRulesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? undefined;
  const filter = userId ? { userId } : {};
  const rules = await build(ctx).notifications.listRules(filter);
  return json({ ok: true, rules });
}

export async function getRuleHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const rule = await build(ctx).notifications.getRule(id);
  if (!rule) return notFound("not_found");
  return json({ ok: true, rule });
}

export async function createRuleHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateRuleInput>(req);
  if (!body || !body.userId || !Array.isArray(body.channels) || body.channels.length === 0) {
    return badRequest("invalid_body");
  }
  try {
    const rule = await build(ctx).notifications.createRule(body);
    return json({ ok: true, rule }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "create_failed");
  }
}

export async function updateRuleHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = (await safeJson<UpdateRulePatch>(req)) ?? {};
  try {
    const rule = await build(ctx).notifications.updateRule(id, body);
    return json({ ok: true, rule });
  } catch (e) {
    if (e instanceof Error && e.message === "notifications: rule not found") return notFound("not_found");
    return badRequest(e instanceof Error ? e.message : "update_failed");
  }
}

export async function archiveRuleHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "DELETE") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  try {
    await build(ctx).notifications.archiveRule(id);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "notifications: rule not found") return notFound("not_found");
    return badRequest("archive_failed");
  }
}

export async function getConfigHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const config = await build(ctx).notifications.getConfig();
  return json({ ok: true, config });
}

export async function setConfigHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const body = await safeJson<ChannelConfig>(req);
  if (!body || typeof body !== "object") return badRequest("invalid_body");
  const config = await build(ctx).notifications.setConfig(body);
  return json({ ok: true, config });
}
