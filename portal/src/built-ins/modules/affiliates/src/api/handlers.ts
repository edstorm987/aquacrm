// HTTP handlers for the affiliates plugin. Same response envelope as
// the other Aqua plugins.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type {
  AffiliateFilter,
  AttributionFilter,
  CreateAffiliateInput,
  CreateReferralCodeInput,
  PayoutFilter,
  ReferralCodeFilter,
  UpdateAffiliatePatch,
  UpdateReferralCodePatch,
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
  if (!ctx.clientId) throw new Error("affiliates handlers require a client scope.");
  return containerFor({ agencyId: ctx.agencyId, clientId: ctx.clientId, storage: ctx.storage, install: ctx.install });
}

function defaultCommissionFromConfig(ctx: PluginCtx): number {
  const v = ctx.install.config.defaultCommissionPercent;
  return typeof v === "number" ? v : 10;
}

// ─── Affiliates ──────────────────────────────────────────────────────────

export async function listAffiliatesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const filter: AffiliateFilter = {
    status: (url.searchParams.get("status") ?? undefined) as AffiliateFilter["status"],
    query: url.searchParams.get("q") ?? undefined,
  };
  return json({ ok: true, affiliates: await buildContainer(ctx).affiliates.list(filter) });
}

export async function createAffiliateHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateAffiliateInput>(req);
  if (!body || !body.endCustomerUserId || !body.displayName || !body.payoutEmail) {
    return badRequest("endCustomerUserId + displayName + payoutEmail required.");
  }
  try {
    const aff = await buildContainer(ctx).affiliates.enroll(body, ctx.actor);
    return json({ ok: true, affiliate: aff }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateAffiliateHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateAffiliatePatch }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const aff = await buildContainer(ctx).affiliates.update(body.id, body.patch ?? {}, ctx.actor);
    return aff ? json({ ok: true, affiliate: aff }) : notFound("affiliate not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function deleteAffiliateHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE");
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const ok = await buildContainer(ctx).affiliates.delete(id, ctx.actor);
  return ok ? json({ ok: true }) : notFound("affiliate not found");
}

// ─── Codes ───────────────────────────────────────────────────────────────

export async function listCodesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const filter: ReferralCodeFilter = {
    affiliateId: url.searchParams.get("affiliateId") ?? undefined,
    status: (url.searchParams.get("status") ?? undefined) as ReferralCodeFilter["status"],
    query: url.searchParams.get("q") ?? undefined,
  };
  return json({ ok: true, codes: await buildContainer(ctx).codes.list(filter) });
}

export async function createCodeHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateReferralCodeInput>(req);
  if (!body?.affiliateId) return badRequest("affiliateId required.");
  try {
    const code = await buildContainer(ctx).codes.create(body, ctx.actor);
    return json({ ok: true, code }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateCodeHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateReferralCodePatch }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const code = await buildContainer(ctx).codes.update(body.id, body.patch ?? {}, ctx.actor);
    return code ? json({ ok: true, code }) : notFound("code not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// ─── Attributions ────────────────────────────────────────────────────────

export async function listAttributionsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const filter: AttributionFilter = {
    affiliateId: url.searchParams.get("affiliateId") ?? undefined,
    orderId: url.searchParams.get("orderId") ?? undefined,
    status: (url.searchParams.get("status") ?? undefined) as AttributionFilter["status"],
  };
  return json({ ok: true, attributions: await buildContainer(ctx).attributions.list(filter) });
}

export async function approveAttributionHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  const out = await buildContainer(ctx).attributions.approve(body.id, ctx.actor);
  return out ? json({ ok: true, attribution: out }) : notFound("attribution not found");
}

// ─── Payouts ─────────────────────────────────────────────────────────────

export async function listPayoutsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const filter: PayoutFilter = {
    affiliateId: url.searchParams.get("affiliateId") ?? undefined,
    status: (url.searchParams.get("status") ?? undefined) as PayoutFilter["status"],
  };
  return json({ ok: true, payouts: await buildContainer(ctx).payouts.list(filter) });
}

export async function schedulePayoutHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ affiliateId: string; method?: "paypal" | "manual" | "stripe-connect"; scheduledFor?: number }>(req);
  if (!body?.affiliateId) return badRequest("affiliateId required.");
  try {
    const out = await buildContainer(ctx).payouts.schedule(
      { affiliateId: body.affiliateId, method: body.method, scheduledFor: body.scheduledFor },
      ctx.actor,
      (ctx.install.config.defaultPayoutMethod as "paypal" | "manual" | "stripe-connect" | undefined) ?? "manual",
    );
    if (!out) return unprocessable("No approved attributions outstanding for this affiliate.");
    return json({ ok: true, payout: out }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function markPayoutPaidHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ id: string; externalRef: string; method?: "paypal" | "manual" | "stripe-connect" }>(req);
  if (!body?.id || !body.externalRef) return badRequest("id + externalRef required.");
  try {
    const out = await buildContainer(ctx).payouts.markPaid(body.id, { externalRef: body.externalRef, method: body.method }, ctx.actor);
    return out ? json({ ok: true, payout: out }) : notFound("payout not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// R12 — admin "Process via Stripe" button. Calls processPayout which
// validates Connect status + creates a real Stripe Transfer with
// idempotencyKey `payout:<id>`. Webhook `transfer.paid` flips final
// status to completed; this handler only reaches in_progress.
export async function processPayoutHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ id: string; currency?: string; description?: string }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const out = await buildContainer(ctx).payouts.processPayout(body.id, ctx.actor, {
      currency: body.currency,
      description: body.description,
    });
    return out ? json({ ok: true, payout: out }) : notFound("payout not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// R12 — Stripe Connect Express webhook receiver.
// Mounted as `public: true` so the catch-all dispatcher skips role
// auth. The handler verifies the signature against the install's
// configured webhook secret before applying any state change.
//
// Two events handled in v1:
//   account.updated  → translate snapshot → flip onboardingStatus
//   transfer.paid    → confirm payout → flip in_progress → completed
//
// Other events return 200 with `{ok: true, ignored: true}` so Stripe
// stops retrying without us treating them as errors.
export async function stripeWebhookHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const f = (await import("../server/foundationAdapter")).requireFoundation();
  if (!f.stripeConnect) return unprocessable("Stripe Connect not configured for this install.");

  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!f.stripeConnect.verifyWebhookSignature({ rawBody, signature })) {
    return json({ ok: false, error: "invalid_signature" }, 400);
  }
  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return badRequest("invalid_json");
  }
  if (!ctx.clientId) return badRequest("clientId scope missing");
  const c = buildContainer(ctx);

  if (event.type === "account.updated") {
    const obj = (event.data?.object ?? {}) as {
      id?: string;
      charges_enabled?: boolean;
      payouts_enabled?: boolean;
      details_submitted?: boolean;
      requirements?: { disabled_reason?: string | null };
    };
    if (!obj.id) return badRequest("missing account id");
    const snapshot = {
      accountId: obj.id,
      onboardingStatus: "pending" as const,    // recomputed by snapshotToStatus inside the service
      chargesEnabled: !!obj.charges_enabled,
      payoutsEnabled: !!obj.payouts_enabled,
      detailsSubmitted: !!obj.details_submitted,
      disabledReason: obj.requirements?.disabled_reason ?? undefined,
    };
    if (!c.onboarding) return unprocessable("onboarding service not available");
    const out = await c.onboarding.applySnapshotForAccount(obj.id, snapshot);
    return json({ ok: true, affiliateId: out?.id ?? null });
  }

  if (event.type === "transfer.paid") {
    const obj = (event.data?.object ?? {}) as { id?: string };
    if (!obj.id) return badRequest("missing transfer id");
    const out = await c.payouts.confirmTransferPaid(obj.id);
    return json({ ok: true, payoutId: out?.id ?? null });
  }

  return json({ ok: true, ignored: true, type: event.type ?? null });
}

// ─── Customer-facing ─────────────────────────────────────────────────────

export async function meEnrollHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ payoutEmail: string; displayName?: string }>(req);
  if (!body?.payoutEmail) return badRequest("payoutEmail required.");
  try {
    const c = buildContainer(ctx);
    const aff = await c.affiliates.enroll({
      endCustomerUserId: ctx.actor,
      displayName: body.displayName ?? ctx.actor,
      payoutEmail: body.payoutEmail.trim(),
    }, ctx.actor);
    return json({ ok: true, affiliate: aff }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function meHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const c = buildContainer(ctx);
  const affiliate = await c.affiliates.getByUser(ctx.actor);
  if (!affiliate) return json({ ok: true, affiliate: null });
  const [codes, attributions, payouts] = await Promise.all([
    c.codes.list({ affiliateId: affiliate.id }),
    c.attributions.listForAffiliate(affiliate.id),
    c.payouts.listForAffiliate(affiliate.id),
  ]);
  return json({ ok: true, affiliate, codes, attributions, payouts });
}

// R12 — customer surface: "Set up payouts via Stripe" button posts
// here. Returns the Stripe-hosted onboarding URL. Idempotent — calling
// twice returns a fresh AccountLink against the same connected
// account.
export async function meStripeOnboardHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ returnUrl: string; refreshUrl?: string }>(req);
  if (!body?.returnUrl) return badRequest("returnUrl required.");
  const c = buildContainer(ctx);
  if (!c.onboarding) return unprocessable("Stripe Connect not configured for this install.");
  const aff = await c.affiliates.getByUser(ctx.actor);
  if (!aff) return notFound("not enrolled as an affiliate");
  if (aff.status !== "active") return unprocessable(`affiliate status is ${aff.status}; activate before onboarding.`);
  try {
    const out = await c.onboarding.start(
      { affiliateId: aff.id, returnUrl: body.returnUrl, refreshUrl: body.refreshUrl ?? body.returnUrl },
      ctx.actor,
    );
    return json({
      ok: true,
      affiliate: out.affiliate,
      onboardingUrl: out.onboardingUrl,
      expiresAt: out.expiresAt,
    });
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// R12 — "I'm done — refresh my status" button. Re-reads Stripe and
// persists. Useful when the affiliate completes the hosted flow but
// the webhook hasn't arrived yet.
export async function meStripeRefreshHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const c = buildContainer(ctx);
  if (!c.onboarding) return unprocessable("Stripe Connect not configured for this install.");
  const aff = await c.affiliates.getByUser(ctx.actor);
  if (!aff) return notFound("not enrolled as an affiliate");
  const out = await c.onboarding.refreshStatus(aff.id, ctx.actor);
  return json({ ok: true, affiliate: out });
}

export async function meCreateCodeHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ code?: string; destinationPath?: string }>(req);
  const c = buildContainer(ctx);
  const affiliate = await c.affiliates.getByUser(ctx.actor);
  if (!affiliate) return notFound("not enrolled as an affiliate");
  if (affiliate.status !== "active") return unprocessable(`affiliate status is ${affiliate.status}`);
  try {
    const code = await c.codes.create(
      { affiliateId: affiliate.id, code: body?.code, destinationPath: body?.destinationPath },
      ctx.actor,
    );
    return json({ ok: true, code }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// Hook called by foundation when ecommerce emits `order.created`.
// Mounted as a regular handler so foundation can dispatch via the
// catch-all + an internal "fan-out" route. Until that lands, the
// handler is also reachable via POST /attributions/record.
export async function recordOrderHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ orderId: string; code?: string; referralCodeId?: string }>(req);
  if (!body?.orderId) return badRequest("orderId required.");
  const out = await buildContainer(ctx).attributions.recordOrder({
    orderId: body.orderId,
    code: body.code,
    referralCodeId: body.referralCodeId,
    defaultCommissionPercent: defaultCommissionFromConfig(ctx),
  });
  return out ? json({ ok: true, attribution: out }) : json({ ok: true, attribution: null });
}
