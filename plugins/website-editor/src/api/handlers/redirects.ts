// R025 — Redirect registry handlers.

import type { PluginCtx } from "../../lib/aquaPluginTypes";
import {
  listRedirects, addRedirect, removeRedirect, resolveRedirect,
  RedirectLoopError,
} from "../../server/redirects";
import { fail, ok, readJsonBody, readQuery, requireClientScope } from "../helpers";

// GET /redirects?siteId=…
export async function handleListRedirects(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.siteId) return fail("siteId required", 400);
  const entries = await listRedirects(ctx.storage, scope.agencyId, scope.clientId, q.siteId);
  return ok({ redirects: entries });
}

// POST /redirects — body { siteId, from, to, reason? }
export async function handleAddRedirect(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{
    siteId?: string; from?: string; to?: string; reason?: "rename" | "delete" | "manual";
  }>(req);
  if (!body?.siteId) return fail("siteId required", 400);
  if (!body.from || !body.to) return fail("from + to required", 400);
  try {
    const result = await addRedirect(ctx.storage, {
      agencyId: scope.agencyId,
      clientId: scope.clientId,
      siteId: body.siteId,
      from: body.from,
      to: body.to,
      reason: body.reason ?? "manual",
    });
    return ok(result, { status: 201 });
  } catch (e) {
    if (e instanceof RedirectLoopError) {
      return fail(`redirect loop: ${e.from} → ${e.to}`, 409);
    }
    throw e;
  }
}

// DELETE /redirects?siteId=…&from=…
export async function handleRemoveRedirect(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.siteId) return fail("siteId required", 400);
  if (!q.from) return fail("from required", 400);
  const removed = await removeRedirect(ctx.storage, scope.agencyId, scope.clientId, q.siteId, q.from);
  if (!removed) return fail("redirect not found", 404);
  return ok({ from: q.from });
}

// GET /redirects/resolve?siteId=…&slug=… — storefront helper.
// Returns `{ target: <slug> | null }`. The host runtime receiving
// a 404 lookup uses this to decide whether to 301-redirect.
export async function handleResolveRedirect(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.siteId) return fail("siteId required", 400);
  if (!q.slug) return fail("slug required", 400);
  const entries = await listRedirects(ctx.storage, scope.agencyId, scope.clientId, q.siteId);
  const target = resolveRedirect(entries, q.slug);
  return ok({ target });
}
