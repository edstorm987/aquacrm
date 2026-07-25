import type { PluginCtx } from "../../lib/aquaPluginTypes";
import {
  discardDraft,
  getContentState,
  getPreviewOverrides,
  getPublicOverrides,
  publishDraft,
  recordDiscovered,
  revertToSnapshot,
  setDraftOverrides,
} from "../../server/content";
import { mintPreviewToken } from "../../server/preview";
import type { ContentValue } from "../../types/content";
import { fail, ok, readJsonBody, readQuery, requireClientScope } from "../helpers";

const PREVIEW_SECRET = process.env.PORTAL_PREVIEW_SECRET ?? "round-1-default-secret";

function siteIdOrFail(query: Record<string, string>): string | Response {
  const siteId = query.siteId;
  if (!siteId) return fail("siteId query parameter required", 400);
  return siteId;
}

export async function handleGetContent(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  const sid = siteIdOrFail(q);
  if (sid instanceof Response) return sid;
  const mode = q.mode === "preview" ? "preview" : "public";
  const values =
    mode === "preview"
      ? await getPreviewOverrides(ctx.storage, scope.agencyId, scope.clientId, sid)
      : await getPublicOverrides(ctx.storage, scope.agencyId, scope.clientId, sid);
  return ok({ mode, values });
}

export async function handleSetDraftContent(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ siteId?: string; values?: Record<string, ContentValue> }>(req);
  if (!body?.siteId || !body?.values) return fail("siteId, values required", 400);
  const state = await setDraftOverrides(
    ctx.storage,
    scope.agencyId,
    scope.clientId,
    body.siteId,
    body.values,
  );
  return ok({ state });
}

export async function handlePublishContent(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ siteId?: string; reason?: string }>(req);
  if (!body?.siteId) return fail("siteId required", 400);
  const state = await publishDraft(ctx.storage, scope.agencyId, scope.clientId, body.siteId, {
    actor: ctx.actor,
    reason: body.reason,
  });
  return ok({ state });
}

export async function handleDiscardContent(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ siteId?: string }>(req);
  if (!body?.siteId) return fail("siteId required", 400);
  const state = await discardDraft(ctx.storage, scope.agencyId, scope.clientId, body.siteId);
  return ok({ state });
}

export async function handleRevertContent(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ siteId?: string; snapshotId?: string }>(req);
  if (!body?.siteId || !body?.snapshotId) return fail("siteId, snapshotId required", 400);
  const state = await revertToSnapshot(
    ctx.storage,
    scope.agencyId,
    scope.clientId,
    body.siteId,
    body.snapshotId,
    { actor: ctx.actor },
  );
  if (!state) return fail("snapshot not found", 404);
  return ok({ state });
}

export async function handleContentDiscovery(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ siteId?: string; path?: string; keys?: string[] }>(req);
  if (!body?.siteId || !body?.path || !Array.isArray(body?.keys)) {
    return fail("siteId, path, keys required", 400);
  }
  await recordDiscovered(ctx.storage, scope.agencyId, scope.clientId, body.siteId, body.path, body.keys);
  return ok({ recorded: true });
}

export async function handlePreviewToken(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ siteId?: string; ttlMs?: number }>(req);
  if (!body?.siteId) return fail("siteId required", 400);
  const token = await mintPreviewToken(
    PREVIEW_SECRET,
    scope.agencyId,
    scope.clientId,
    body.siteId,
    body.ttlMs,
  );
  return ok({ token });
}

export async function handleContentState(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  const sid = siteIdOrFail(q);
  if (sid instanceof Response) return sid;
  const state = await getContentState(ctx.storage, scope.agencyId, scope.clientId, sid);
  return ok({ state });
}
