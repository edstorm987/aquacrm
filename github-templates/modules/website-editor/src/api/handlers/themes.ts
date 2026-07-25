import type { PluginCtx } from "../../lib/aquaPluginTypes";
import {
  createTheme,
  deleteTheme,
  getTheme,
  listThemes,
  setDefaultTheme,
  updateTheme,
} from "../../server/themes";
import { fail, ok, readJsonBody, readQuery, requireClientScope } from "../helpers";

export async function handleListThemes(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  const siteId = q.siteId;
  if (!siteId) return fail("siteId query parameter required", 400);
  const themes = await listThemes(ctx.storage, scope.agencyId, scope.clientId, siteId);
  return ok({ themes });
}

export async function handleCreateTheme(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{
    siteId?: string;
    name?: string;
    description?: string;
    tokens?: Record<string, string>;
    isDefault?: boolean;
  }>(req);
  if (!body?.siteId || !body?.name) return fail("siteId, name required", 400);
  const theme = await createTheme(ctx.storage, {
    siteId: body.siteId,
    agencyId: scope.agencyId,
    clientId: scope.clientId,
    name: body.name,
    description: body.description,
    tokens: body.tokens,
    isDefault: body.isDefault,
  });
  return ok({ theme }, { status: 201 });
}

export async function handleGetTheme(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.siteId || !q.themeId) return fail("siteId, themeId required", 400);
  const theme = await getTheme(ctx.storage, scope.agencyId, scope.clientId, q.siteId, q.themeId);
  if (!theme) return fail("theme not found", 404);
  return ok({ theme });
}

export async function handleUpdateTheme(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{
    siteId?: string;
    themeId?: string;
    patch?: Record<string, unknown>;
  }>(req);
  if (!body?.siteId || !body?.themeId || !body?.patch) {
    return fail("siteId, themeId, patch required", 400);
  }
  const theme = await updateTheme(
    ctx.storage,
    scope.agencyId,
    scope.clientId,
    body.siteId,
    body.themeId,
    body.patch as never,
  );
  if (!theme) return fail("theme not found", 404);
  return ok({ theme });
}

export async function handleSetDefaultTheme(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ siteId?: string; themeId?: string }>(req);
  if (!body?.siteId || !body?.themeId) return fail("siteId, themeId required", 400);
  const flipped = await setDefaultTheme(ctx.storage, scope.agencyId, scope.clientId, body.siteId, body.themeId);
  if (!flipped) return fail("theme not found", 404);
  return ok({ ok: true });
}

export async function handleDeleteTheme(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ siteId?: string; themeId?: string }>(req);
  if (!body?.siteId || !body?.themeId) return fail("siteId, themeId required", 400);
  const removed = await deleteTheme(ctx.storage, scope.agencyId, scope.clientId, body.siteId, body.themeId);
  if (!removed) return fail("theme not found", 404);
  return ok({ deleted: true });
}
