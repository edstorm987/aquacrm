import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { FunnelInputError } from "../server/services";
import type { CaptureHcInput, CaptureToolInput } from "../lib/domain";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json", ...headers },
  });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const serviceUnavailable = (m: string): Response => json({
  ok: false,
  error: "capture_unavailable",
  message: m,
  retryable: true,
}, 503);
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);
async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}
function build(ctx: PluginCtx) {
  return containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install });
}

export async function hcCompleteHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CaptureHcInput>(req);
  if (!body || !body.email || !body.slot) return badRequest("invalid_body");
  try {
    const r = await build(ctx).funnel.captureHcCompletion(body);
    return json({
      ok: true,
      redirect: "/business-os",
      created: r.created,
      authentication: "email_verification_required",
    });
  } catch (e) {
    if (e instanceof FunnelInputError) return badRequest("invalid_completion");
    return serviceUnavailable(e instanceof Error ? e.message : "hc_complete_failed");
  }
}

export async function toolCompleteHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CaptureToolInput>(req);
  if (!body || !body.email || !body.toolId) return badRequest("invalid_body");
  try {
    const r = await build(ctx).funnel.captureToolCompletion(body);
    return json({
      ok: true,
      redirect: "/business-os",
      created: r.created,
      authentication: "email_verification_required",
    });
  } catch (e) {
    if (e instanceof FunnelInputError) return badRequest("invalid_completion");
    return serviceUnavailable(e instanceof Error ? e.message : "tool_complete_failed");
  }
}

export async function meContextHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  // ctx.actor is the authenticated user — for a lead this is their id.
  // Foundation gates this route to lead role + signed-in users.
  const meCtx = await build(ctx).funnel.meContext(ctx.actor);
  if (!meCtx) return json({ ok: true, context: null });
  return json({ ok: true, context: meCtx });
}
