import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type { UpdateGa4ConfigInput } from "../lib/domain";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);
async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}
function build(ctx: PluginCtx) {
  return containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install });
}

export async function touchpointsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const daysRaw = url.searchParams.get("days");
  const days = daysRaw ? Number(daysRaw) : undefined;
  if (daysRaw !== null && (!Number.isFinite(days) || (days as number) < 1 || (days as number) > 365)) {
    return badRequest("days_out_of_range");
  }
  const report = await build(ctx).ga4.getTouchpoints(days);
  return json({ ok: true, report });
}

export async function configHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method === "GET") {
    const cfg = await build(ctx).ga4.getConfig();
    return json({ ok: true, config: cfg });
  }
  if (req.method === "PATCH") {
    const body = await safeJson<UpdateGa4ConfigInput>(req);
    if (!body) return badRequest("invalid_body");
    const cfg = await build(ctx).ga4.updateConfig(body, ctx.actor);
    return json({ ok: true, config: cfg });
  }
  return methodNotAllowed();
}

export async function setSaJsonHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<{ json: string }>(req);
  if (!body || typeof body.json !== "string") return badRequest("invalid_body");
  const r = await build(ctx).ga4.setServiceAccountJson(body.json, ctx.actor);
  if (!r.ok) return badRequest(r.error ?? "set_failed");
  return json({ ok: true });
}

export async function testConnectionHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const r = await build(ctx).ga4.testConnection(ctx.actor);
  return json({ ok: r.ok, result: r });
}
