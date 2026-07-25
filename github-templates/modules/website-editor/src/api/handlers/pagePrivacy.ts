// R026 — Page privacy + password gate handlers.

import type { PluginCtx } from "../../lib/aquaPluginTypes";
import type { EditorPagePrivacy } from "../../types/editorPage";
import { getPage, updatePage } from "../../server/pages";
import {
  hashPagePassword,
  verifyPagePassword,
  makeUnlockToken,
} from "../../lib/pagePrivacy";
import { fail, ok, readJsonBody, requireClientScope } from "../helpers";

// POST /pages/privacy?siteId=…&id=…  body { privacy, password? }
//   - When privacy = "password" + password set → hashes server-side and stores.
//   - When privacy = "password" + password absent → preserves existing hash.
//   - When privacy ∈ {"public","unlisted","members-only"} → drops the hash.
export async function handleSetPagePrivacy(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const url = new URL(req.url);
  const siteId = url.searchParams.get("siteId");
  const pageId = url.searchParams.get("id");
  if (!siteId) return fail("siteId required", 400);
  if (!pageId) return fail("id required", 400);
  const body = await readJsonBody<{ privacy?: EditorPagePrivacy; password?: string }>(req);
  if (!body?.privacy) return fail("privacy required", 400);
  const allowed: EditorPagePrivacy[] = ["public", "unlisted", "password", "members-only"];
  if (!allowed.includes(body.privacy)) return fail("invalid privacy value", 400);

  const cur = await getPage(ctx.storage, scope.agencyId, scope.clientId, siteId, pageId);
  if (!cur) return fail("page not found", 404);

  const patch: Record<string, unknown> = { privacy: body.privacy };
  if (body.privacy === "password") {
    if (body.password && body.password.length > 0) {
      patch.passwordHash = await hashPagePassword(pageId, body.password);
    } else if (!cur.passwordHash) {
      // Operator switched to password mode but didn't supply a password
      // and no prior hash exists.
      return fail("password required to enable password privacy", 400);
    }
    // Else: keep existing hash.
  } else {
    // Drop the hash on every non-password mode so it doesn't linger.
    patch.passwordHash = undefined;
  }
  const next = await updatePage(ctx.storage, scope.agencyId, scope.clientId, siteId, pageId, patch);
  if (!next) return fail("page not found", 404);
  // Mask passwordHash in response — never echo back.
  const { passwordHash: _omit, ...visible } = next;
  return ok({ page: visible });
}

// POST /pages/privacy/unlock?siteId=…&id=…  body { password }
//   On success returns `{ token }` so the host page sets a cookie
//   and the storefront grants access on subsequent requests.
export async function handleUnlockPage(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const url = new URL(req.url);
  const siteId = url.searchParams.get("siteId");
  const pageId = url.searchParams.get("id");
  if (!siteId) return fail("siteId required", 400);
  if (!pageId) return fail("id required", 400);
  const body = await readJsonBody<{ password?: string }>(req);
  if (!body?.password) return fail("password required", 400);

  const page = await getPage(ctx.storage, scope.agencyId, scope.clientId, siteId, pageId);
  if (!page) return fail("page not found", 404);
  if (page.privacy !== "password" || !page.passwordHash) {
    return fail("page not password-gated", 400);
  }
  const valid = await verifyPagePassword(pageId, body.password, page.passwordHash);
  if (!valid) return fail("invalid password", 401);
  const token = await makeUnlockToken(pageId, page.passwordHash);
  return ok({ token });
}
