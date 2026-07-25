// HTTP handlers for the ops plugin.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { MonitoringService } from "../server/monitoringService";
import { runHealthcheckPass } from "../server/healthcheck";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function buildService(ctx: PluginCtx): MonitoringService {
  const installConfig: { stripeSecretKey?: string; postmarkServerToken?: string } = {};
  const cfg = (ctx.install?.config ?? {}) as Record<string, unknown>;
  if (typeof cfg["stripeSecretKey"] === "string") installConfig.stripeSecretKey = cfg["stripeSecretKey"];
  if (typeof cfg["postmarkServerToken"] === "string") installConfig.postmarkServerToken = cfg["postmarkServerToken"];
  return new MonitoringService({ storage: ctx.storage, installConfig });
}

// GET /metrics — full snapshot. Used by the dashboard page (server
// component) and any external dashboard that wants a JSON dump.
export async function metricsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const service = buildService(ctx);
  const snapshot = await service.snapshot();
  return json({ ok: true, snapshot });
}

// POST /healthcheck — runs a healthcheck pass against all targets and
// appends samples. Authorized callers: the cron job + agency-owner /
// manager. Returns the per-target result.
export async function healthcheckHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const service = buildService(ctx);
  const results = await runHealthcheckPass(service);
  return json({ ok: true, results });
}
