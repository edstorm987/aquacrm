// API handlers for the memberships plugin. Each handler builds a
// per-request container via `containerFor({...})` and delegates to a
// service method. Response envelope:
//   200/201 with `{ ok: true, ... }` on success
//   400 validation
//   404 not-in-scope
//   422 business rule
//   500 unexpected throw

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor, isStripeAvailable } from "../server/foundationAdapter";
import type {
  CreateBenefitInput,
  CreatePlanInput,
  UpdateBenefitPatch,
  UpdatePlanPatch,
} from "../lib/domain";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const unprocessable = (m: string): Response => json({ ok: false, error: m }, 422);

function methodGuard(req: Request, expected: string): Response | null {
  return req.method === expected ? null : json({ ok: false, error: "method_not_allowed" }, 405);
}

async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; }
  catch { return null; }
}

function buildContainer(ctx: PluginCtx) {
  if (!ctx.clientId) {
    throw new Error("memberships handlers require a client scope.");
  }
  return containerFor({
    agencyId: ctx.agencyId,
    clientId: ctx.clientId,
    storage: ctx.storage,
    install: ctx.install,
  });
}

// ─── Plans ────────────────────────────────────────────────────────────────

export async function listPlansHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // "active" | "archived" | "all"
  const c = buildContainer(ctx);
  const all = await c.plans.list();
  const filtered = status && status !== "all"
    ? all.filter(p => p.status === status)
    : all;
  return json({ ok: true, plans: filtered });
}

export async function createPlanHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreatePlanInput>(req);
  if (!body || !body.name || typeof body.priceMonthly !== "number" || !body.currency) {
    return badRequest("name + priceMonthly + currency required.");
  }
  if (body.priceMonthly > 0 && !isStripeAvailable({ agencyId: ctx.agencyId, clientId: ctx.clientId! })) {
    return unprocessable("Stripe not configured for this client. Configure via the ecommerce plugin first.");
  }
  try {
    const plan = await buildContainer(ctx).plans.create(body, ctx.actor);
    return json({ ok: true, plan }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updatePlanHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdatePlanPatch }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const plan = await buildContainer(ctx).plans.update(body.id, body.patch ?? {}, ctx.actor);
    return plan ? json({ ok: true, plan }) : notFound("plan not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function deletePlanHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE");
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const ok = await buildContainer(ctx).plans.delete(id, ctx.actor);
  return ok ? json({ ok: true }) : notFound("plan not found");
}

// ─── Benefits ────────────────────────────────────────────────────────────

export async function listBenefitsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const benefits = await buildContainer(ctx).benefits.list();
  return json({ ok: true, benefits });
}

export async function createBenefitHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateBenefitInput>(req);
  if (!body?.label || !body.category) return badRequest("label + category required.");
  try {
    const benefit = await buildContainer(ctx).benefits.create(body, ctx.actor);
    return json({ ok: true, benefit }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateBenefitHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateBenefitPatch }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const benefit = await buildContainer(ctx).benefits.update(body.id, body.patch ?? {}, ctx.actor);
    return benefit ? json({ ok: true, benefit }) : notFound("benefit not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// ─── Subscribers (admin) ────────────────────────────────────────────────

export async function listSubscribersHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const planId = url.searchParams.get("planId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const subs = await buildContainer(ctx).subscriptions.list({
    planId: planId || undefined,
    status: (status as never) || undefined,
  });
  return json({ ok: true, subscribers: subs });
}

export async function getSubscriberHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return badRequest("userId required.");
  const c = buildContainer(ctx);
  const [subscription, benefits] = await Promise.all([
    c.subscriptions.getByUser(userId),
    c.benefits.getBenefitsForUser(userId),
  ]);
  if (!subscription) return notFound("subscription not found");
  return json({ ok: true, subscription, benefits });
}

export async function adminCancelSubscriberHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ userId: string; atPeriodEnd?: boolean }>(req);
  if (!body?.userId) return badRequest("userId required.");
  const sub = await buildContainer(ctx).subscriptions.cancel({
    endCustomerUserId: body.userId,
    atPeriodEnd: body.atPeriodEnd ?? true,
  });
  return sub ? json({ ok: true, subscription: sub }) : notFound("subscription not found");
}

// ─── Stripe webhook (public) ────────────────────────────────────────────
//
// Public route — no auth cookie required. Stripe signs the body, the
// handler verifies via the per-install webhook secret. The route's
// `public: true` flag tells the foundation's catch-all dispatcher to
// skip the session check.

export async function stripeWebhookHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("stripe-signature") ?? "";
  if (!signatureHeader) return badRequest("missing stripe-signature header");
  const result = await buildContainer(ctx).webhook.handle({ rawBody, signatureHeader });
  return json(result, result.ok ? 200 : 400);
}

// ─── Customer-facing routes ─────────────────────────────────────────────

export async function meHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const c = buildContainer(ctx);
  const [subscription, benefits] = await Promise.all([
    c.subscriptions.getByUser(ctx.actor),
    c.benefits.getBenefitsForUser(ctx.actor),
  ]);
  return json({ ok: true, subscription, benefits });
}

export async function meSubscribeHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ planId: string; billing: "monthly" | "annual"; successUrl?: string; cancelUrl?: string }>(req);
  if (!body?.planId || !body.billing) return badRequest("planId + billing required.");
  const successUrl = body.successUrl ?? `${appOrigin(req)}/portal/customer/memberships?subscribed=1`;
  const cancelUrl = body.cancelUrl ?? `${appOrigin(req)}/portal/customer/memberships?canceled=1`;
  try {
    const result = await buildContainer(ctx).subscriptions.subscribe({
      endCustomerUserId: ctx.actor,
      planId: body.planId,
      billing: body.billing,
      successUrl,
      cancelUrl,
    });
    if (!result.ok) return unprocessable(result.error);
    if (result.mode === "checkout") {
      return json({ ok: true, mode: "checkout", checkoutUrl: result.checkoutUrl });
    }
    return json({ ok: true, mode: "free", subscription: result.subscription });
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function meCancelHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const url = new URL(req.url);
  const immediate = url.searchParams.get("immediate") === "1";
  const sub = await buildContainer(ctx).subscriptions.cancel({
    endCustomerUserId: ctx.actor,
    atPeriodEnd: !immediate,
  });
  return sub ? json({ ok: true, subscription: sub }) : notFound("subscription not found");
}

export async function mePortalHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ returnUrl?: string }>(req);
  const returnUrl = body?.returnUrl ?? `${appOrigin(req)}/portal/customer/memberships`;
  const url = await buildContainer(ctx).subscriptions.billingPortalUrl(ctx.actor, returnUrl);
  return url ? json({ ok: true, url }) : notFound("subscription not found or no Stripe customer");
}

function appOrigin(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}
