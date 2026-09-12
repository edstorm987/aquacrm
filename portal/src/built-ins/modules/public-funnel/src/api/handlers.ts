import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json", ...headers },
  });
}
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);
function build(ctx: PluginCtx) {
  return containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install });
}

export async function meContextHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  // ctx.actor is the authenticated user — for a lead this is their id.
  // Foundation gates this route to lead role + signed-in users.
  const meCtx = await build(ctx).funnel.meContext(ctx.actor);
  if (!meCtx) return json({ ok: true, context: null });
  return json({ ok: true, context: meCtx });
}
