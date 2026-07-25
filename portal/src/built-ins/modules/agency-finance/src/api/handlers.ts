// HTTP handlers for the agency-finance plugin.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import type {
  CreateCategoryInput,
  CreateExpenseInput,
  CreateInvoiceInput,
  Currency,
  ExpenseFilter,
  InvoiceFilter,
  UpdateCategoryPatch,
  UpdateExpensePatch,
  UpdateInvoicePatch,
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

const buildContainer = (ctx: PluginCtx) =>
  containerFor({ agencyId: ctx.agencyId, storage: ctx.storage, install: ctx.install });

const defaultCurrency = (ctx: PluginCtx): Currency =>
  (ctx.install.config.defaultCurrency as Currency | undefined) ?? "usd";

// ─── Invoices ────────────────────────────────────────────────────────────

export async function listInvoicesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const filter: InvoiceFilter = {
    status: (url.searchParams.get("status") ?? undefined) as InvoiceFilter["status"],
    clientId: url.searchParams.get("clientId") ?? undefined,
    query: url.searchParams.get("q") ?? undefined,
  };
  return json({ ok: true, invoices: await buildContainer(ctx).invoices.list(filter) });
}

export async function createInvoiceHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateInvoiceInput>(req);
  if (!body || !body.clientId || !body.dueAt || !body.lineItems) {
    return badRequest("clientId + dueAt + lineItems required.");
  }
  try {
    const inv = await buildContainer(ctx).invoices.create(body, ctx.actor, defaultCurrency(ctx));
    return json({ ok: true, invoice: inv }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateInvoiceHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateInvoicePatch }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const inv = await buildContainer(ctx).invoices.update(body.id, body.patch ?? {}, ctx.actor);
    return inv ? json({ ok: true, invoice: inv }) : notFound("invoice not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function deleteInvoiceHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "DELETE");
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return badRequest("id required.");
  try {
    const ok = await buildContainer(ctx).invoices.delete(id, ctx.actor);
    return ok ? json({ ok: true }) : notFound("invoice not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function markInvoicePaidHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ id: string; externalRef?: string; paidVia?: "stripe" | "bank-transfer" | "cash" | "manual" }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const inv = await buildContainer(ctx).invoices.markPaid(body.id, {
      externalRef: body.externalRef,
      paidVia: body.paidVia,
    }, ctx.actor);
    return inv ? json({ ok: true, invoice: inv }) : notFound("invoice not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// ─── Expenses ────────────────────────────────────────────────────────────

export async function listExpensesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const filter: ExpenseFilter = {
    status: (url.searchParams.get("status") ?? undefined) as ExpenseFilter["status"],
    categoryId: url.searchParams.get("categoryId") ?? undefined,
    staffId: url.searchParams.get("staffId") ?? undefined,
  };
  return json({ ok: true, expenses: await buildContainer(ctx).expenses.list(filter) });
}

export async function createExpenseHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateExpenseInput>(req);
  if (!body || !body.categoryId || typeof body.amountCents !== "number") {
    return badRequest("categoryId + amountCents required.");
  }
  try {
    const exp = await buildContainer(ctx).expenses.create(body, ctx.actor, defaultCurrency(ctx));
    return json({ ok: true, expense: exp }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateExpenseHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateExpensePatch }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const exp = await buildContainer(ctx).expenses.update(body.id, body.patch ?? {}, ctx.actor);
    return exp ? json({ ok: true, expense: exp }) : notFound("expense not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function approveExpenseHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ id: string; decisionNote?: string }>(req);
  if (!body?.id) return badRequest("id required.");
  const exp = await buildContainer(ctx).expenses.approve(body.id, ctx.actor, body.decisionNote);
  return exp ? json({ ok: true, expense: exp }) : notFound("expense not found");
}

export async function rejectExpenseHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ id: string; decisionNote?: string }>(req);
  if (!body?.id) return badRequest("id required.");
  const exp = await buildContainer(ctx).expenses.reject(body.id, ctx.actor, body.decisionNote);
  return exp ? json({ ok: true, expense: exp }) : notFound("expense not found");
}

export async function reimburseExpenseHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const exp = await buildContainer(ctx).expenses.reimburse(body.id, ctx.actor);
    return exp ? json({ ok: true, expense: exp }) : notFound("expense not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// ─── Categories ──────────────────────────────────────────────────────────

export async function listCategoriesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  return json({ ok: true, categories: await buildContainer(ctx).categories.list() });
}

export async function createCategoryHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateCategoryInput>(req);
  if (!body?.name) return badRequest("name required.");
  try {
    const cat = await buildContainer(ctx).categories.create(body, ctx.actor);
    return json({ ok: true, category: cat }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateCategoryHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "PATCH");
  if (guard) return guard;
  const body = await safeJson<{ id: string; patch: UpdateCategoryPatch }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const cat = await buildContainer(ctx).categories.update(body.id, body.patch ?? {}, ctx.actor);
    return cat ? json({ ok: true, category: cat }) : notFound("category not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

// ─── Report ──────────────────────────────────────────────────────────────

export async function reportHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const from = Number(url.searchParams.get("from") ?? 0);
  const to = Number(url.searchParams.get("to") ?? Date.now());
  const currency = (url.searchParams.get("currency") ?? defaultCurrency(ctx)) as Currency;
  const snapshot = await buildContainer(ctx).reports.revenueSnapshot({ from, to, currency });
  return json({ ok: true, snapshot });
}
