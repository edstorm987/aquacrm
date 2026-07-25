// R007 handlers — Payments / Plans / P&L. Kept in a sibling file so
// the original handlers.ts stays small and reviewable.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type {
  CreatePaymentInput,
  CreatePlanInput,
  PaymentFilter,
  UpdatePlanPatch,
} from "../lib/domain";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const badRequest = (m: string): Response => json({ ok: false, error: m }, 400);
const notFound = (m: string): Response => json({ ok: false, error: m }, 404);
const methodNotAllowed = (): Response => json({ ok: false, error: "method_not_allowed" }, 405);

async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}

function build(ctx: PluginCtx) {
  return containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install });
}

// ─── Payments ─────────────────────────────────────────────────────

export async function listPaymentsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const filter: PaymentFilter = {
    invoiceId: url.searchParams.get("invoiceId") ?? undefined,
    clientId: url.searchParams.get("clientId") ?? undefined,
    fromPaidAt: url.searchParams.get("from") ? Number(url.searchParams.get("from")) : undefined,
    toPaidAt: url.searchParams.get("to") ? Number(url.searchParams.get("to")) : undefined,
  };
  const payments = await build(ctx).payments.list(filter);
  return json({ ok: true, payments });
}

export async function createPaymentHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreatePaymentInput>(req);
  if (!body || !body.invoiceId || !body.amountCents || !body.currency || !body.method) return badRequest("invalid_body");
  try {
    const result = await build(ctx).payments.record(ctx.actor, body);
    return json({ ok: true, ...result }, 201);
  } catch (e) {
    if (e instanceof Error && e.message === "agency-finance: invoice not found") return notFound("invoice_not_found");
    return badRequest(e instanceof Error ? e.message : "record_failed");
  }
}

// ─── Plans ────────────────────────────────────────────────────────

export async function listPlansHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("inactive") === "1";
  const plans = await build(ctx).plans.list(includeInactive);
  return json({ ok: true, plans });
}

export async function createPlanHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreatePlanInput>(req);
  if (!body || !body.tier || !body.label || body.monthlyAmountCents === undefined) return badRequest("invalid_body");
  try {
    const plan = await build(ctx).plans.create(ctx.actor, body);
    return json({ ok: true, plan }, 201);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "create_failed");
  }
}

export async function updatePlanHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return methodNotAllowed();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id_required");
  const body = (await safeJson<UpdatePlanPatch>(req)) ?? {};
  try {
    const plan = await build(ctx).plans.update(ctx.actor, id, body);
    return json({ ok: true, plan });
  } catch (e) {
    if (e instanceof Error && e.message === "agency-finance: plan not found") return notFound("not_found");
    return badRequest(e instanceof Error ? e.message : "update_failed");
  }
}

export async function assignPlanHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<{ clientId: string; planId: string | null }>(req);
  if (!body || !body.clientId) return badRequest("invalid_body");
  try {
    await build(ctx).plans.assignClient(ctx.actor, body.clientId, body.planId ?? null);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "agency-finance: plan not found") return notFound("not_found");
    return badRequest(e instanceof Error ? e.message : "assign_failed");
  }
}

// ─── P&L ──────────────────────────────────────────────────────────

export async function pnlSummaryHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const refNow = url.searchParams.get("now") ? Number(url.searchParams.get("now")) : Date.now();
  const snapshot = await build(ctx).pnl.founderSnapshot(refNow);
  return json({ ok: true, snapshot });
}
