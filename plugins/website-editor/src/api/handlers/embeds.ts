import type { PluginCtx } from "../../lib/aquaPluginTypes";
import { getEmbeds, setEmbeds, getPublicEmbeds, type Embed } from "../../server/embeds";
import { getEmbedThemeCss, updateEmbedTheme } from "../../server/embedTheme";
import { fail, ok, readJsonBody, readQuery, requireClientScope } from "../helpers";

export async function handleListEmbeds(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.siteId) return fail("siteId required", 400);
  const embeds = await getEmbeds(ctx.storage, scope.agencyId, scope.clientId, q.siteId);
  return ok({ embeds });
}

export async function handleSetEmbeds(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ siteId?: string; embeds?: Embed[] }>(req);
  if (!body?.siteId || !Array.isArray(body?.embeds)) {
    return fail("siteId, embeds[] required", 400);
  }
  await setEmbeds(ctx.storage, scope.agencyId, scope.clientId, body.siteId, body.embeds);
  return ok({ ok: true });
}

export async function handleListPublicEmbeds(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.siteId) return fail("siteId required", 400);
  const embeds = await getPublicEmbeds(ctx.storage, scope.agencyId, scope.clientId, q.siteId);
  return ok({ embeds });
}

export async function handleGetEmbedTheme(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.siteId) return fail("siteId required", 400);
  const css = await getEmbedThemeCss(ctx.storage, scope.agencyId, scope.clientId, q.siteId);
  return new Response(css, {
    status: 200,
    headers: { "content-type": "text/css; charset=utf-8" },
  });
}

export async function handleUpdateEmbedTheme(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ siteId?: string; css?: string }>(req);
  if (!body?.siteId || typeof body?.css !== "string") return fail("siteId, css required", 400);
  const state = await updateEmbedTheme(ctx.storage, scope.agencyId, scope.clientId, body.siteId, body.css);
  return ok({ state });
}
