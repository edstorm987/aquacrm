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
import { PlanHasDependantsError } from "../server/dependencies";
import {
  PlanPriceOperationConflictError,
  PlanPriceProvisioningRetryableError,
  PlanValidationError,
} from "../server/plans";
import {
  MembershipCheckoutPendingReconciliationError,
  MembershipLegacyOperationRecoveryError,
  SubscriptionOperationConflictError,
} from "../server/subscriptions";
import type {
  CreateBenefitInput,
  CreatePlanInput,
  UpdateBenefitPatch,
  UpdatePlanPatch,
} from "../lib/domain";
import {
  applyDefaultTrialDays,
  normalizeMembershipSettings,
  resolveBillingPortalReturnUrl,
} from "../lib/settings";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const conflict = (m: string, operationId?: string): Response => json({
  ok: false,
  error: m,
  ...(operationId ? { operationId } : {}),
}, 409);
const unprocessable = (m: string): Response => json({ ok: false, error: m }, 422);
const retryableFailure = (m: string, operationId?: string): Response => json({
  ok: false,
  error: m,
  retryable: true,
  ...(operationId ? { operationId } : {}),
}, 503);

function methodGuard(req: Request, expected: string): Response | null {
  return req.method === expected ? null : json({ ok: false, error: "method_not_allowed" }, 405);
}

function operationIdFromRequest(req: Request, bodyValue: unknown): string | null {
  if (bodyValue !== undefined && typeof bodyValue !== "string") return null;
  return (typeof bodyValue === "string" ? bodyValue.trim() : "")
    || req.headers.get("idempotency-key")?.trim()
    || null;
}

function patchCanChangeProviderPrice(patch: unknown): boolean {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return false;
  return ["priceMonthly", "priceAnnual", "currency"]
    .some(field => Object.prototype.hasOwnProperty.call(patch, field));
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
  const body = await safeJson<CreatePlanInput & { operationId?: unknown }>(req);
  if (!body || !body.name || typeof body.priceMonthly !== "number" || !body.currency) {
    return badRequest("name + priceMonthly + currency required.");
  }
  const operationId = operationIdFromRequest(req, body.operationId);
  if (!operationId) return badRequest("operationId or Idempotency-Key header is required.");
  const { operationId: _operationId, ...suppliedInput } = body;
  const settings = normalizeMembershipSettings(ctx.install);
  const input = applyDefaultTrialDays(suppliedInput, settings.defaultTrialDays);
  if ((input.priceMonthly > 0 || (input.priceAnnual ?? 0) > 0)
    && !isStripeAvailable({ agencyId: ctx.agencyId, clientId: ctx.clientId! })) {
    return unprocessable("Stripe not configured for this client. Configure via the ecommerce plugin first.");
  }
  try {
    const plan = await buildContainer(ctx).plans.create(input, ctx.actor, operationId);
    return json({ ok: true, plan, operationId }, 201);
  } catch (err) {
    if (err instanceof PlanPriceOperationConflictError) return conflict(err.message, operationId);
    if (err instanceof PlanValidationError) return unprocessable(err.message);
    if (err instanceof PlanPriceProvisioningRetryableError) {
      return retryableFailure(err.message, err.operationId);
    }
    // A command may already have reached Stripe or committed its plan before
    // storage/activity failed. The same operation id is therefore the only
    // safe retry and must not be represented as a permanent 422 input error.
    return retryableFailure(err instanceof Error ? err.message : String(err), operationId);
  }
}

export async function updatePlanHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdatePlanPatch; operationId?: unknown }>(req);
  if (!body?.id) return badRequest("id required.");
  const providerPriceChange = patchCanChangeProviderPrice(body.patch);
  const suppliedOperationId = operationIdFromRequest(req, body.operationId);
  if (providerPriceChange && !suppliedOperationId) {
    return badRequest("operationId or Idempotency-Key header is required for price changes.");
  }
  // Metadata/status changes are a short storage mutation, not a durable
  // provider command. Do not claim operation-id replay semantics for them or
  // break existing archive/edit callers that never needed such an id.
  const operationId = providerPriceChange ? suppliedOperationId! : undefined;
  try {
    const plan = await buildContainer(ctx).plans.update(body.id, body.patch ?? {}, ctx.actor, operationId);
    return plan
      ? json({ ok: true, plan, ...(operationId ? { operationId } : {}) })
      : notFound("plan not found");
  } catch (err) {
    if (err instanceof PlanPriceOperationConflictError) return conflict(err.message, operationId);
    if (err instanceof PlanValidationError) return unprocessable(err.message);
    if (err instanceof PlanPriceProvisioningRetryableError) {
      return retryableFailure(err.message, err.operationId);
    }
    return retryableFailure(err instanceof Error ? err.message : String(err), operationId);
  }
}

// Deleting a plan is not deleting a row.
//
// `SubscriptionService.list()` enumerates members by walking the surviving
// PLANS, so a plan removed out from under its subscribers takes all three of
// these at once: the subscription rows survive (external billing keeps
// charging), `getBenefitsForUser` resolves through `plans.get()` and now finds
// nothing (they stop receiving what they pay for), and no admin list can reach
// them to notice. `planDependencyInventory` measures exactly that, and until
// now nothing asked it before deleting.
//
// This route therefore refuses a destructive delete while anyone is still on
// the plan, and names the path that does work: `PlanService.archive` — the
// documented ordinary retirement — keeps existing subscribers paying and
// visible while hiding the plan from new signups.
//
// It decides no purge policy. Whether an explicit purge should exist for a plan
// with live subscribers, and what it must reconcile in Stripe first, is still
// Ed's open decision (issues #177/#178). Refusing is not that decision; it is
// the absence of one, made visible instead of silent.
export async function deletePlanHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE");
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  const c = buildContainer(ctx);
  const plan = await c.plans.get(id);
  if (!plan) return notFound("plan not found");
  try {
    const ok = await c.plans.delete(id, ctx.actor);
    return ok ? json({ ok: true }) : notFound("plan not found");
  } catch (error) {
    if (!(error instanceof PlanHasDependantsError)) throw error;
    const dependencies = error.dependencies;
    const billed = dependencies.billableSubscribers > 0
      ? `${dependencies.billableSubscribers} still being billed`
      : "none currently billable";
    const pendingPlanChange = dependencies.pendingPlanChanges > 0;
    return json({
      ok: false,
      error: pendingPlanChange
        ? `Cannot delete "${error.planName}": ${dependencies.pendingPlanChanges} provider price change(s) still target it. Retry or finish that operation before retiring the plan.`
        : `Cannot delete "${error.planName}": ${dependencies.total} subscriber(s) are still on it `
          + `(${billed}). Deleting it would leave their subscriptions running and unreachable from `
          + `every admin list. Archive the plan instead (PATCH status "archived") — existing `
          + `subscribers keep their plan and their billing, and it disappears from new signups.`,
      reason: pendingPlanChange ? "plan_change_in_progress" : "plan_has_subscribers",
      dependencies,
    }, 422);
  }
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
  const body = await safeJson<{ userId: string; atPeriodEnd?: boolean; operationId?: string }>(req);
  if (!body?.userId || !body.operationId?.trim()) return badRequest("userId + operationId required.");
  try {
    const sub = await buildContainer(ctx).subscriptions.cancel({
      endCustomerUserId: body.userId,
      atPeriodEnd: body.atPeriodEnd ?? true,
      operationId: body.operationId,
    });
    return sub
      ? json({ ok: true, subscription: sub, requestOperationId: body.operationId })
      : notFound("subscription not found");
  } catch (err) {
    if (err instanceof SubscriptionOperationConflictError) return conflict(err.message, err.operationId);
    if (
      err instanceof MembershipCheckoutPendingReconciliationError
      || err instanceof MembershipLegacyOperationRecoveryError
    ) return retryableFailure(err.message, err.operationId);
    return retryableFailure(err instanceof Error ? err.message : String(err), body.operationId);
  }
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
  return json(result, result.ok ? 200 : result.retryable ? 503 : 400);
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
  const body = await safeJson<{
    planId: string;
    billing: "monthly" | "annual";
    successUrl?: string;
    cancelUrl?: string;
    operationId?: string;
  }>(req);
  if (!body?.planId || !body.billing || !body.operationId?.trim()) {
    return badRequest("planId + billing + operationId required.");
  }
  if (body.billing !== "monthly" && body.billing !== "annual") {
    return badRequest("billing must be monthly or annual.");
  }
  const settings = normalizeMembershipSettings(ctx.install);
  if (body.billing === "annual" && (!settings.annualBillingEnabled || !settings.showAnnualToggle)) {
    return unprocessable("Annual billing is disabled for this memberships install.");
  }
  const successUrl = body.successUrl ?? `${appOrigin(req)}/portal/customer/memberships?subscribed=1`;
  const cancelUrl = body.cancelUrl ?? `${appOrigin(req)}/portal/customer/memberships?canceled=1`;
  try {
    const result = await buildContainer(ctx).subscriptions.subscribe({
      endCustomerUserId: ctx.actor,
      planId: body.planId,
      billing: body.billing,
      successUrl,
      cancelUrl,
      operationId: body.operationId,
    });
    if (!result.ok) return unprocessable(result.error);
    if (result.mode === "checkout") {
      return json({
        ok: true,
        mode: "checkout",
        checkoutUrl: result.checkoutUrl,
        operationId: result.operationId,
        requestOperationId: body.operationId,
        planId: result.planId,
        billing: result.billing,
      });
    }
    return json({
      ok: true,
      mode: result.mode,
      subscription: result.subscription,
      operationId: result.operationId,
      requestOperationId: body.operationId,
      planId: result.planId,
      billing: result.billing,
    });
  } catch (err) {
    if (err instanceof SubscriptionOperationConflictError) return conflict(err.message, err.operationId);
    if (
      err instanceof MembershipCheckoutPendingReconciliationError
      || err instanceof MembershipLegacyOperationRecoveryError
    ) return retryableFailure(err.message, err.operationId);
    return retryableFailure(err instanceof Error ? err.message : String(err), body.operationId);
  }
}

export async function meCancelHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const url = new URL(req.url);
  const immediate = url.searchParams.get("immediate") === "1";
  const body = await safeJson<{ operationId?: string }>(req);
  if (!body?.operationId?.trim()) return badRequest("operationId required.");
  try {
    const sub = await buildContainer(ctx).subscriptions.cancel({
      endCustomerUserId: ctx.actor,
      atPeriodEnd: !immediate,
      operationId: body?.operationId,
    });
    return sub
      ? json({ ok: true, subscription: sub, requestOperationId: body.operationId })
      : notFound("subscription not found");
  } catch (err) {
    if (err instanceof SubscriptionOperationConflictError) return conflict(err.message, err.operationId);
    if (
      err instanceof MembershipCheckoutPendingReconciliationError
      || err instanceof MembershipLegacyOperationRecoveryError
    ) return retryableFailure(err.message, err.operationId);
    return retryableFailure(err instanceof Error ? err.message : String(err), body.operationId);
  }
}

export async function mePortalHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ returnUrl?: string }>(req);
  const settings = normalizeMembershipSettings(ctx.install);
  const returnUrl = resolveBillingPortalReturnUrl({
    requestUrl: req.url,
    explicitReturnUrl: body?.returnUrl,
    configuredReturnUrl: settings.billingPortalReturnUrl,
  });
  const url = await buildContainer(ctx).subscriptions.billingPortalUrl(ctx.actor, returnUrl);
  return url ? json({ ok: true, url }) : notFound("subscription not found or no Stripe customer");
}

function appOrigin(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}
