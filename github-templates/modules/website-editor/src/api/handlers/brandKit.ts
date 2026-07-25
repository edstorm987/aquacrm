// R011 — Brand-kit settings handlers (per-install extended fields).
//
// Foundation owns the agency's source-of-truth `BrandKit` (primary /
// secondary / accent / fonts / radius / customCSS). This endpoint
// surfaces the website-editor's extended fields so an operator can
// tune bg / bgElevated / text / textMuted / border / radius scale /
// darkMode without touching the foundation tenant record.
//
// Storage: `t/<agencyId>/<clientId>/website-editor/brand-kit-extended`.
// Cross-pollinates with the Sidebar/Editor preview via the
// `extendedBrandToCss` helper.

import type { PluginCtx } from "../../lib/aquaPluginTypes";
import type { BrandKit } from "../../lib/tenancy";
import { fail, ok, readJsonBody, requireClientScope } from "../helpers";

type ExtendedFields = Pick<BrandKit,
  "bg" | "bgElevated" | "text" | "textMuted" | "border" |
  "radiusSm" | "radiusMd" | "radiusLg" | "darkMode"
>;

const KEY = (agencyId: string, clientId: string) =>
  `t/${agencyId}/${clientId}/website-editor/brand-kit-extended`;

export async function handleGetBrandKitExtended(_req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const cur = await ctx.storage.get<ExtendedFields>(KEY(scope.agencyId, scope.clientId));
  return ok({ extended: cur ?? {} });
}

export async function handleSaveBrandKitExtended(req: Request, ctx: PluginCtx): Promise<Response> {
  const scope = requireClientScope(ctx);
  if (!scope.ok) return scope.res;
  const body = await readJsonBody<ExtendedFields>(req);
  if (!body || typeof body !== "object") return fail("body required", 400);
  const ALLOWED: (keyof ExtendedFields)[] = [
    "bg", "bgElevated", "text", "textMuted", "border",
    "radiusSm", "radiusMd", "radiusLg", "darkMode",
  ];
  const cur = (await ctx.storage.get<ExtendedFields>(KEY(scope.agencyId, scope.clientId))) ?? {};
  const next: ExtendedFields = { ...cur };
  for (const k of ALLOWED) {
    if (k in body) {
      const v = body[k];
      if (v === undefined || v === null || v === "") {
        delete next[k];
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (next as any)[k] = v;
      }
    }
  }
  await ctx.storage.set(KEY(scope.agencyId, scope.clientId), next);
  return ok({ extended: next });
}
