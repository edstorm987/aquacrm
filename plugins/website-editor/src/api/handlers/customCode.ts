// R029 — Custom code (CSS + head fragment) per variant.
//
// Mounts on the existing page record (variants are pages with
// `portalRole`). The page schema already carries `customCss` and
// `customHead` fields from earlier rounds; this round adds:
//   - server-side validation against size + script gates
//   - one POST endpoint that operates on both at once
//   - a getter that surfaces current values for editor preload

import type { PluginCtx } from "../../lib/aquaPluginTypes";
import { getPage, updatePage } from "../../server/pages";
import {
  validateCustomCode,
  CUSTOM_CSS_MAX_BYTES,
  CUSTOM_HEAD_MAX_BYTES,
} from "../../lib/customCode";
import { fail, ok, readJsonBody, readQuery, requireClientScope } from "../helpers";

// GET /pages/custom-code?siteId=…&id=…
//   Returns `{ customCss, customHead, caps }` for editor preload.
export async function handleGetCustomCode(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.siteId) return fail("siteId required", 400);
  if (!q.id) return fail("id required", 400);
  const page = await getPage(ctx.storage, scope.agencyId, scope.clientId, q.siteId, q.id);
  if (!page) return fail("page not found", 404);
  return ok({
    customCss: page.customCss ?? page.customCSS ?? "",
    customHead: page.customHead ?? "",
    caps: { css: CUSTOM_CSS_MAX_BYTES, head: CUSTOM_HEAD_MAX_BYTES },
  });
}

// POST /pages/custom-code?siteId=…&id=…
//   body { customCss?, customHead? } — accepts either / both.
//   Validates size + script gate before patching the page.
export async function handleSetCustomCode(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const q = readQuery(req);
  if (!q.siteId) return fail("siteId required", 400);
  if (!q.id) return fail("id required", 400);
  const body = await readJsonBody<{ customCss?: string; customHead?: string }>(req);
  if (!body) return fail("body required", 400);

  const cur = await getPage(ctx.storage, scope.agencyId, scope.clientId, q.siteId, q.id);
  if (!cur) return fail("page not found", 404);

  const patch: Record<string, unknown> = {};

  if (body.customCss != null) {
    const v = validateCustomCode(body.customCss, "css");
    if (!v.ok) return fail(`customCss rejected: ${v.reason}${v.detail ? ` (${v.detail})` : ""}`, 400);
    patch.customCss = body.customCss;
  }
  if (body.customHead != null) {
    const v = validateCustomCode(body.customHead, "head");
    if (!v.ok) return fail(`customHead rejected: ${v.reason}${v.detail ? ` (${v.detail})` : ""}`, 400);
    patch.customHead = body.customHead;
  }

  if (Object.keys(patch).length === 0) {
    return fail("customCss or customHead required", 400);
  }

  const next = await updatePage(ctx.storage, scope.agencyId, scope.clientId, q.siteId, q.id, patch);
  if (!next) return fail("page not found", 404);
  return ok({
    customCss: next.customCss ?? next.customCSS ?? "",
    customHead: next.customHead ?? "",
  });
}
