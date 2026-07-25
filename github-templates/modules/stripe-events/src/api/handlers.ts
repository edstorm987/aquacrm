import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);

function build(ctx: PluginCtx) {
  return containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install });
}

export async function webhookHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const sig = req.headers.get("stripe-signature") ?? "";
  // We need the raw body string for HMAC; foundation must NOT pre-
  // parse JSON for this route. Reading via .text() is sufficient.
  const rawBody = await req.text();
  const r = await build(ctx).stripe.ingest({ rawBody, signatureHeader: sig });
  if (r.ok) {
    return json({ ok: true, eventId: r.eventId, deduped: r.deduped, applied: r.applied }, 200);
  }
  // Stripe re-tries 4xx + 5xx — return 4xx for client-side errors
  // (signature mismatches), 5xx for our internal misconfig.
  const status = (r.reason === "missing_secret" || r.reason === "invalid_body") ? 500 : 400;
  return json({ ok: false, error: r.reason, message: r.message }, status);
}

export async function listEventsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const events = await build(ctx).stripe.listEvents({
    ...(url.searchParams.get("limit") ? { limit: Number(url.searchParams.get("limit")) } : {}),
    ...(url.searchParams.get("type") ? { type: url.searchParams.get("type")! } : {}),
  });
  return json({ ok: true, events });
}

export async function listSubscriptionsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const subs = await build(ctx).stripe.listSubscriptions();
  return json({ ok: true, subscriptions: subs });
}
