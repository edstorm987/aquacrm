// R007 handlers — Payments / Plans / P&L. Kept in a sibling file so
// the original handlers.ts stays small and reviewable.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type {
  Currency,
  CreateIncomeEntryInput,
  CreatePaymentInput,
  CreatePlanInput,
  PaymentFilter,
  UpdatePlanPatch,
} from "../lib/domain";
import { resolveFinanceDefaultCurrency } from "@/lib/server/finance/financeCurrency";
import { normaliseCurrency } from "../lib/currencies";
import { assertKnownFields, assertNonEmptyText, assertTimestamp } from "../lib/runtimeValidation";
import { AuthError, authErrorResponse } from "@/lib/server/auth/auth";
import { requireCurrentClientWorkspaceElementAccess, type ClientWorkspaceElementLevel } from "@/lib/server/access/clientWorkspaceElementAccess";

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

async function clientCommercialGate(
  clientId: string | null | undefined,
  required: Exclude<ClientWorkspaceElementLevel, "hidden">,
): Promise<Response | null> {
  if (!clientId) return null;
  try {
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.commercial", required);
    return null;
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    // An access check that fails for a reason OTHER than "denied" is an
    // internal fault, not a malformed request. Several handlers below run this
    // gate inside their own try/catch whose tail is `badRequest(e.message)`, so
    // rethrowing here answered 400 with an internal message in the body — the
    // wrong status class, and an internal string echoed back to the caller.
    // Answer at the gate instead, where the distinction is still known.
    console.error("[agency-finance] client.commercial gate failed:", error);
    return json({ ok: false, error: "access_check_failed" }, 500);
  }
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
  const container = build(ctx);
  const invoiceClientId = filter.invoiceId
    ? (await container.invoices.get(filter.invoiceId))?.clientId
    : undefined;
  const denied = await clientCommercialGate(filter.clientId ?? invoiceClientId, "view");
  if (denied) return denied;
  const payments = await container.payments.list(filter);
  return json({ ok: true, payments });
}

export async function createPaymentHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreatePaymentInput>(req);
  if (!body || !body.invoiceId || !body.amountCents || !body.currency || !body.method) return badRequest("invalid_body");
  try {
    const container = build(ctx);
    const invoice = await container.invoices.get(body.invoiceId);
    if (!invoice) return notFound("invoice_not_found");
    const denied = await clientCommercialGate(invoice.clientId, "manage");
    if (denied) return denied;
    const result = await container.payments.record(ctx.actor, body);
    return json({ ok: true, ...result }, 201);
  } catch (e) {
    if (e instanceof Error && e.message === "agency-finance: invoice not found") return notFound("invoice_not_found");
    return badRequest(e instanceof Error ? e.message : "record_failed");
  }
}

export async function listIncomeHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const clientId = new URL(req.url).searchParams.get("clientId") ?? undefined;
  const denied = await clientCommercialGate(clientId, "view");
  if (denied) return denied;
  return json({ ok: true, income: await build(ctx).income.list({ clientId }) });
}

export async function createIncomeHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return methodNotAllowed();
  const body = await safeJson<CreateIncomeEntryInput>(req);
  if (!body?.title?.trim() || !body.amountCents || !body.method) return badRequest("title, amount and method are required");
  const denied = await clientCommercialGate(body.clientId, "use");
  if (denied) return denied;
  try {
    const defaultCurrency = resolveFinanceDefaultCurrency(ctx.agencyId, ctx.install.config.defaultCurrency) as Currency;
    const income = await build(ctx).income.create(ctx.actor, body, defaultCurrency);
    return json({ ok: true, income }, 201);
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "income could not be recorded");
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
  const body = await safeJson<Record<string, unknown>>(req);
  if (!body) return badRequest("invalid_body");
  try {
    assertKnownFields(body, ["clientId", "planId"]);
    assertNonEmptyText(body.clientId, "clientId");
    if (!Object.prototype.hasOwnProperty.call(body, "planId")) {
      return badRequest("planId_required");
    }
    if (body.planId !== null) assertNonEmptyText(body.planId, "planId");
    const denied = await clientCommercialGate(body.clientId as string, "manage");
    if (denied) return denied;
    await build(ctx).plans.assignClient(ctx.actor, body.clientId, body.planId);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === "agency-finance: plan not found") return notFound("not_found");
    if (e instanceof Error && e.message === "agency-finance: client not found") return notFound("client_not_found");
    return badRequest(e instanceof Error ? e.message : "assign_failed");
  }
}

// ─── P&L ──────────────────────────────────────────────────────────

export async function pnlSummaryHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return methodNotAllowed();
  const url = new URL(req.url);
  const refNow = url.searchParams.get("now") ? Number(url.searchParams.get("now")) : Date.now();
  try {
    assertTimestamp(refNow, "now");
    const configured = resolveFinanceDefaultCurrency(ctx.agencyId, ctx.install.config.defaultCurrency) as Currency;
    const currency = normaliseCurrency(url.searchParams.get("currency"), configured);
    const snapshot = await build(ctx).pnl.founderSnapshot(refNow, 30, currency);
    return json({ ok: true, snapshot });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "invalid_report_request");
  }
}
