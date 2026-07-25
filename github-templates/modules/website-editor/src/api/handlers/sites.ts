import type { PluginCtx } from "../../lib/aquaPluginTypes";
import {
  createSite,
  deleteSite,
  getSite,
  listSites,
  updateSite,
} from "../../server/sites";
import { fail, ok, readJsonBody, readQuery, requireClientScope } from "../helpers";

export async function handleListSites(_req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const sites = await listSites(ctx.storage, scope.agencyId, scope.clientId);
  return ok({ sites });
}

export async function handleGetSite(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.siteId) return fail("siteId required", 400);
  const site = await getSite(ctx.storage, scope.agencyId, scope.clientId, q.siteId);
  if (!site) return fail("site not found", 404);
  return ok({ site });
}

export async function handleCreateSite(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ name?: string; slug?: string; defaultThemeId?: string }>(req);
  if (!body?.name) return fail("name required", 400);
  const site = await createSite(ctx.storage, {
    agencyId: scope.agencyId,
    clientId: scope.clientId,
    name: body.name,
    slug: body.slug,
    defaultThemeId: body.defaultThemeId,
  });
  return ok({ site }, { status: 201 });
}

export async function handleUpdateSite(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ siteId?: string; patch?: Record<string, unknown> }>(req);
  if (!body?.siteId || !body?.patch) return fail("siteId, patch required", 400);
  const site = await updateSite(ctx.storage, scope.agencyId, scope.clientId, body.siteId, body.patch as never);
  if (!site) return fail("site not found", 404);
  return ok({ site });
}

export async function handleDeleteSite(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ siteId?: string }>(req);
  if (!body?.siteId) return fail("siteId required", 400);
  const removed = await deleteSite(ctx.storage, scope.agencyId, scope.clientId, body.siteId);
  if (!removed) return fail("site not found", 404);
  return ok({ deleted: true });
}
