// Page CRUD + portal-variant handlers. Adapted from
// `02/src/app/api/portal/pages/[siteId]/...` Next.js route files into
// declarative `PluginApiRoute.handler` functions.

import type { PluginCtx } from "../../lib/aquaPluginTypes";
import { isPortalRole } from "../../lib/portalRole";
import {
  createPage,
  deletePage,
  getPage,
  getPageBySlug,
  listPages,
  publishPage,
  revertPage,
  updatePage,
  listVariantsForPortal,
  setActivePortalVariant,
} from "../../server/pages";
import { listAllPortalVariants } from "../../server/portalVariants";
import { fail, ok, readJsonBody, readQuery, requireClientScope } from "../helpers";

function siteIdOrFail(query: Record<string, string>): string | Response {
  const siteId = query.siteId;
  if (!siteId) return fail("siteId query parameter required", 400);
  return siteId;
}

export async function handleListPages(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const sid = siteIdOrFail(readQuery(req));
  if (sid instanceof Response) return sid;
  const pages = await listPages(ctx.storage, scope.agencyId, scope.clientId, sid);
  return ok({ pages });
}

export async function handleCreatePage(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{
    siteId?: string;
    slug?: string;
    title?: string;
    description?: string;
    portalRole?: string;
    variantId?: string;
    blocks?: unknown[];
    isHomepage?: boolean;
    themeId?: string;
  }>(req);
  if (!body) return fail("invalid JSON body", 400);
  if (!body.siteId) return fail("siteId required", 400);
  if (!body.title) return fail("title required", 400);
  if (body.portalRole && !isPortalRole(body.portalRole)) {
    return fail(`unknown portalRole: ${body.portalRole}`, 400);
  }

  const page = await createPage(ctx.storage, {
    siteId: body.siteId,
    agencyId: scope.agencyId,
    clientId: scope.clientId,
    slug: body.slug,
    title: body.title,
    description: body.description,
    portalRole: body.portalRole && isPortalRole(body.portalRole) ? body.portalRole : undefined,
    variantId: body.variantId,
    blocks: (body.blocks ?? []) as never,
    themeId: body.themeId,
    isHomepage: body.isHomepage,
  });
  return ok({ page }, { status: 201 });
}

export async function handleGetPage(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  const sid = siteIdOrFail(q);
  if (sid instanceof Response) return sid;
  const id = q.pageId;
  if (!id) return fail("pageId query parameter required", 400);
  const page = await getPage(ctx.storage, scope.agencyId, scope.clientId, sid, id);
  if (!page) return fail("page not found", 404);
  return ok({ page });
}

export async function handleGetPageBySlug(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  const sid = siteIdOrFail(q);
  if (sid instanceof Response) return sid;
  const slug = q.slug;
  if (!slug) return fail("slug query parameter required", 400);
  const page = await getPageBySlug(ctx.storage, scope.agencyId, scope.clientId, sid, slug);
  if (!page) return fail("page not found", 404);
  return ok({ page });
}

export async function handleUpdatePage(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{
    siteId?: string;
    pageId?: string;
    patch?: Record<string, unknown>;
  }>(req);
  if (!body?.siteId || !body?.pageId || !body?.patch) {
    return fail("siteId, pageId, patch required", 400);
  }
  const page = await updatePage(
    ctx.storage,
    scope.agencyId,
    scope.clientId,
    body.siteId,
    body.pageId,
    body.patch as never,
  );
  if (!page) return fail("page not found", 404);
  return ok({ page });
}

export async function handlePublishPage(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ siteId?: string; pageId?: string }>(req);
  if (!body?.siteId || !body?.pageId) return fail("siteId, pageId required", 400);
  const page = await publishPage(ctx.storage, scope.agencyId, scope.clientId, body.siteId, body.pageId);
  if (!page) return fail("page not found", 404);
  return ok({ page });
}

export async function handleRevertPage(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ siteId?: string; pageId?: string }>(req);
  if (!body?.siteId || !body?.pageId) return fail("siteId, pageId required", 400);
  const page = await revertPage(ctx.storage, scope.agencyId, scope.clientId, body.siteId, body.pageId);
  if (!page) return fail("page not found", 404);
  return ok({ page });
}

export async function handleDeletePage(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ siteId?: string; pageId?: string }>(req);
  if (!body?.siteId || !body?.pageId) return fail("siteId, pageId required", 400);
  const removed = await deletePage(ctx.storage, scope.agencyId, scope.clientId, body.siteId, body.pageId);
  if (!removed) return fail("page not found", 404);
  return ok({ deleted: true });
}

export async function handleListPortalVariants(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  const sid = siteIdOrFail(q);
  if (sid instanceof Response) return sid;
  if (!q.role || !isPortalRole(q.role)) return fail("valid role required", 400);
  const variants = await listVariantsForPortal(ctx.storage, scope.agencyId, scope.clientId, sid, q.role);
  return ok({ variants });
}

// R012 — flat all-roles gallery feed. `GET /portal-variants/all?siteId=…`
export async function handleListAllPortalVariants(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  const sid = siteIdOrFail(q);
  if (sid instanceof Response) return sid;
  const variants = await listAllPortalVariants(ctx.storage, scope.agencyId, scope.clientId, sid);
  return ok({ variants });
}

export async function handleSetActivePortalVariant(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ siteId?: string; role?: string; pageId?: string | null }>(req);
  if (!body?.siteId || !body?.role || !isPortalRole(body.role)) {
    return fail("siteId, role required (role must be a PortalRole)", 400);
  }
  const flipped = await setActivePortalVariant(
    ctx.storage,
    scope.agencyId,
    scope.clientId,
    body.siteId,
    body.role,
    body.pageId ?? null,
  );
  if (!flipped) return fail("could not set active variant", 400);
  return ok({ ok: true });
}
