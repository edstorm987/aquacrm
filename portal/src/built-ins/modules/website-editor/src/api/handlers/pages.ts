// Page CRUD + portal-variant handlers. Adapted from
// `02/src/app/api/portal/pages/[siteId]/...` Next.js route files into
// declarative `PluginApiRoute.handler` functions.

import type { PluginCtx } from "../../lib/aquaPluginTypes";
import { defaultPortalStarterId } from "../../lib/editorSettings";
import { isPortalRole } from "../../lib/portalRole";
import {
  createPage,
  deletePage,
  getPage,
  getPageBySlug,
  listPages,
  PagePatchValidationError,
  publishPage,
  revertPage,
  updatePage,
  listVariantsForPortal,
  setActivePortalVariant,
} from "../../server/pages";
import { listAllPortalVariants } from "../../server/portalVariants";
import { loadStarterTree } from "../../server/starterLoader";
import { fail, json, ok, readJsonBody, readQuery, requireClientScope } from "../helpers";

const PUBLIC_MEDIA_LIFECYCLE_ERROR_CODE = "public_upload_atomic_lifecycle_required";
const PUBLIC_MEDIA_LIFECYCLE_ERROR_MESSAGE =
  "Public media publishing is temporarily unavailable while protected publication and recall are being completed.";

const PUBLIC_MEDIA_AVAILABILITY_CODES = new Set([
  "durable_public_uploads_required",
  "public_media_provider_unavailable",
  "public_upload_provider_failed",
]);
const PUBLIC_MEDIA_AVAILABILITY_ERROR_CODE = "public_media_temporarily_unavailable";
const PUBLIC_MEDIA_AVAILABILITY_ERROR_MESSAGE =
  "Public media publishing is temporarily unavailable. No page changes were published.";

const PUBLIC_MEDIA_VALIDATION_CODES = new Set([
  "content_trust_blocked",
  "public_media_data_url_invalid",
  "public_media_identity_invalid",
  "public_media_promotion_policy_refused",
  "public_media_promotion_traversal_refused",
  "public_upload_content_not_cleared",
  "public_upload_content_type_not_allowed",
  "public_upload_path_escape",
  "public_upload_size_not_allowed",
  "public_upload_tenant_scope_mismatch",
]);
const PUBLIC_MEDIA_VALIDATION_ERROR_CODE = "public_media_security_validation_failed";
const PUBLIC_MEDIA_VALIDATION_ERROR_MESSAGE =
  "Public media did not pass security validation. No page changes were published.";

const SECURITY_LOCKDOWN_INTERNAL_CODE = "writes_frozen";
const SECURITY_LOCKDOWN_ERROR_CODE = "publishing_temporarily_locked";
const SECURITY_LOCKDOWN_ERROR_MESSAGE =
  "Publishing is temporarily disabled by a security control. The page was not published.";

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Map expected public-media refusals to stable, secret-free API contracts.
 * Internal reason codes and raw provider/scanner messages are never reflected.
 * Unknown failures keep flowing to the platform's generic 500 boundary.
 */
export function pagePublishSecurityFailure(error: unknown): Response | null {
  const internalCode = errorCode(error);
  let code: string;
  let message: string;
  let status: number;
  if (internalCode === PUBLIC_MEDIA_LIFECYCLE_ERROR_CODE) {
    code = PUBLIC_MEDIA_LIFECYCLE_ERROR_CODE;
    message = PUBLIC_MEDIA_LIFECYCLE_ERROR_MESSAGE;
    status = 503;
  } else if (internalCode && PUBLIC_MEDIA_AVAILABILITY_CODES.has(internalCode)) {
    code = PUBLIC_MEDIA_AVAILABILITY_ERROR_CODE;
    message = PUBLIC_MEDIA_AVAILABILITY_ERROR_MESSAGE;
    status = 503;
  } else if (internalCode && PUBLIC_MEDIA_VALIDATION_CODES.has(internalCode)) {
    code = PUBLIC_MEDIA_VALIDATION_ERROR_CODE;
    message = PUBLIC_MEDIA_VALIDATION_ERROR_MESSAGE;
    status = 422;
  } else if (internalCode === SECURITY_LOCKDOWN_INTERNAL_CODE) {
    code = SECURITY_LOCKDOWN_ERROR_CODE;
    message = SECURITY_LOCKDOWN_ERROR_MESSAGE;
    status = 503;
  } else {
    return null;
  }
  return json(
    {
      ok: false,
      code,
      error: message,
    },
    {
      status,
      headers: { "cache-control": "no-store" },
    },
  );
}

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

  const portalRole = body.portalRole && isPortalRole(body.portalRole) ? body.portalRole : undefined;
  let blocks = (body.blocks ?? []) as never;
  let variantId = body.variantId;
  if (body.blocks === undefined && portalRole) {
    const starterId = body.variantId?.trim() || defaultPortalStarterId(ctx.install.config, portalRole);
    if (starterId) {
      const starter = await loadStarterTree(starterId);
      if (!starter) return fail(`unknown variantId: ${starterId}`, 400);
      if (starter.role !== portalRole) {
        return fail(`variantId ${starterId} is for role ${starter.role}, called with ${portalRole}`, 400);
      }
      blocks = starter.blocks as never;
      variantId = starterId;
    }
  }

  const page = await createPage(ctx.storage, {
    siteId: body.siteId,
    agencyId: scope.agencyId,
    clientId: scope.clientId,
    slug: body.slug,
    title: body.title,
    description: body.description,
    portalRole,
    variantId,
    blocks,
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
  let page: Awaited<ReturnType<typeof updatePage>>;
  try {
    page = await updatePage(
      ctx.storage,
      scope.agencyId,
      scope.clientId,
      body.siteId,
      body.pageId,
      body.patch as never,
    );
  } catch (error) {
    if (error instanceof PagePatchValidationError) {
      return fail(`patch.${error.field} rejected: ${error.reason}`, 400);
    }
    throw error;
  }
  if (!page) return fail("page not found", 404);
  return ok({ page });
}

export async function handlePublishPage(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ siteId?: string; pageId?: string }>(req);
  if (!body?.siteId || !body?.pageId) return fail("siteId, pageId required", 400);
  try {
    const page = await publishPage(ctx.storage, scope.agencyId, scope.clientId, body.siteId, body.pageId, {
      publicMedia: ctx.services.publicMedia,
      actor: ctx.actor,
    });
    if (!page) return fail("page not found", 404);
    return ok({ page });
  } catch (error) {
    const safeFailure = pagePublishSecurityFailure(error);
    if (safeFailure) return safeFailure;
    throw error;
  }
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
