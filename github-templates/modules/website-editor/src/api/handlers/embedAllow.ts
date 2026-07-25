// R013 — Embed allow-list handlers.

import type { PluginCtx } from "../../lib/aquaPluginTypes";
import {
  getEmbedAllowList,
  setEmbedAllowList,
  isValidOrigin,
} from "../../server/embedAllow";
import { fail, ok, readJsonBody, requireClientScope } from "../helpers";

export async function handleGetEmbedAllowList(_req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const list = await getEmbedAllowList(ctx.storage, scope.agencyId, scope.clientId);
  return ok({ allowList: list ?? { origins: [], updatedBy: "", updatedAt: "" } });
}

export async function handleSetEmbedAllowList(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<{ origins?: unknown }>(req);
  if (!body || !Array.isArray(body.origins)) {
    return fail("origins (string[]) required", 400);
  }
  const submitted = body.origins.map(o => String(o ?? "").trim());
  const invalid = submitted.filter(o => o.length > 0 && !isValidOrigin(o));
  // Persist the cleaned list; surface invalid entries so the UI can
  // flag them (set-and-tell pattern: store what's safe + report the
  // rest) rather than 400-ing the whole batch.
  const saved = await setEmbedAllowList(
    ctx.storage,
    scope.agencyId,
    scope.clientId,
    submitted,
    String(ctx.actor ?? "u_unknown"),
  );
  return ok({ allowList: saved, invalid });
}
