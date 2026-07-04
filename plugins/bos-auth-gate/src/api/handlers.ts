import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);

// `me` reads the BOS personalisation payload for the signed-in user.
// Foundation already gates this route on session presence (visibleToRoles
// limits which roles get past the route check); the handler trusts
// ctx.actor.
export async function meHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const c = containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install });
  // Foundation may pass the role through ctx in a richer build;
  // until then we read the URL `?role=` query param as a fallback so
  // BOS clients can hint the role explicitly.
  const url = new URL(req.url);
  const role = url.searchParams.get("role") ?? undefined;
  const me = await c.gate.me(ctx.actor, role);
  if (!me) return json({ ok: true, me: null }, 200);
  return json({ ok: true, me });
}
