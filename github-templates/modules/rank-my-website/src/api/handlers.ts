import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { RmwInputError, isHandoff } from "../server/services";
import type { DiagnosticReport, RunDiagnosticInput } from "../lib/domain";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);
async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}
function build(ctx: PluginCtx) {
  return containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install });
}

export async function runHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<RunDiagnosticInput>(req);
  if (!body || !body.url) return badRequest("url_required");
  try {
    const report = await build(ctx).rmw.runDiagnostic(body);
    return json({ ok: true, report });
  } catch (e) {
    if (e instanceof RmwInputError) return badRequest(e.reason);
    return badRequest(e instanceof Error ? e.message : "run_failed");
  }
}

export async function captureHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<{ email: string; url: string; report: DiagnosticReport }>(req);
  if (!body || !body.email || !body.url || !body.report) return badRequest("invalid_body");
  const r = await build(ctx).rmw.capture(body);
  if (!isHandoff(r)) return json({ ok: false, error: r.reason }, 503);
  return json({
    ok: true,
    redirect: "/business-os",
    leadUserId: r.leadUserId,
    created: r.created,
  }, 200, r.session
    ? { "set-cookie": `aqua_session=${encodeURIComponent(r.session)}; Path=/; HttpOnly; SameSite=Lax` }
    : {});
}
