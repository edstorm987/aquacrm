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
  InvoiceTemplate,
  UpdateInvoiceTemplateInput,
  UpdateCategoryPatch,
  UpdateExpensePatch,
  UpdateInvoicePatch,
} from "../lib/domain";
import { normaliseCurrency } from "../lib/currencies";
import { assertKnownFields, assertNonEmptyText, assertTimestamp } from "../lib/runtimeValidation";
import { resolveFinanceDefaultCurrency } from "@/lib/server/finance/financeCurrency";
import { AuthError, authErrorResponse } from "@/lib/server/auth/auth";
import { requireCurrentClientWorkspaceElementAccess, type ClientWorkspaceElementLevel } from "@/lib/server/access/clientWorkspaceElementAccess";
import { claimStagedPrivateUploadsForOwnership, commitStagedPrivateUploadOwnership } from "@/lib/server/privateObjectLifecycle";

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
  resolveFinanceDefaultCurrency(ctx.agencyId, ctx.install.config.defaultCurrency);

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

// ─── Invoices ────────────────────────────────────────────────────────────

export async function listInvoicesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const filter: InvoiceFilter = {
    status: (url.searchParams.get("status") ?? undefined) as InvoiceFilter["status"],
    clientId: url.searchParams.get("clientId") ?? undefined,
    query: url.searchParams.get("q") ?? undefined,
  };
  const denied = await clientCommercialGate(filter.clientId, "view");
  if (denied) return denied;
  return json({ ok: true, invoices: await buildContainer(ctx).invoices.list(filter) });
}

export async function createInvoiceHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateInvoiceInput>(req);
  if (!body || !body.clientId || !body.lineItems) {
    return badRequest("clientId + lineItems required.");
  }
  const denied = await clientCommercialGate(body.clientId, "use");
  if (denied) return denied;
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
    const invoices = buildContainer(ctx).invoices;
    const existing = await invoices.get(body.id);
    if (!existing) return notFound("invoice not found");
    const denied = await clientCommercialGate(existing.clientId, "use");
    if (denied) return denied;
    const inv = await invoices.update(body.id, body.patch ?? {}, ctx.actor);
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
    const invoices = buildContainer(ctx).invoices;
    const existing = await invoices.get(id);
    if (!existing) return notFound("invoice not found");
    const denied = await clientCommercialGate(existing.clientId, "manage");
    if (denied) return denied;
    const ok = await invoices.delete(id, ctx.actor);
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
    const container = buildContainer(ctx);
    const inv = await container.invoices.get(body.id);
    if (!inv) return notFound("invoice not found");
    const denied = await clientCommercialGate(inv.clientId, "manage");
    if (denied) return denied;
    if (!["sent", "overdue", "paid"].includes(inv.status)) {
      return unprocessable(`Cannot mark ${inv.status} invoice as paid.`);
    }

    const existingPayments = await container.payments.listForInvoice(inv.id);
    const paidCents = existingPayments.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (paidCents >= inv.totalCents) {
      return json({ ok: true, invoice: inv });
    }

    // Idempotent on a SERVER-derived key, not a client-supplied one: "settle
    // this invoice" is a single intent per invoice, so `settle:<invoiceId>` is
    // its stable reference. The balance check above is a check-then-write race —
    // two concurrent double-clicks (or two admins at once) can both read
    // paidCents < total and both record the balance. Deriving the payment id
    // from the key collapses them onto one row. Server-derived also means the
    // guard holds no matter which UI calls it — nothing to forget to pass.
    // The nuance it preserves: genuine partial payments come in through
    // `payments/create` with their own per-submit key, so they still record
    // normally; and once the balance is covered this handler returns early
    // anyway, so there is never a legitimate second `settle:` payment.
    const result = await container.payments.record(ctx.actor, {
      invoiceId: inv.id,
      amountCents: inv.totalCents - paidCents,
      currency: inv.currency,
      method: body.paidVia ?? "manual",
      notes: "Invoice marked paid in Milesymedia.",
      externalRef: body.externalRef,
      idempotencyKey: `settle:${inv.id}`,
    });
    return json({ ok: true, invoice: result.invoice, payment: result.payment });
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function downloadInvoiceHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "GET");
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  const print = new URL(req.url).searchParams.get("print") === "1";
  if (!id) return badRequest("id required.");
  const container = buildContainer(ctx);
  const invoice = await container.invoices.get(id);
  if (!invoice) return notFound("invoice not found");
  const denied = await clientCommercialGate(invoice.clientId, "view");
  if (denied) return denied;
  const body = await container.invoices.renderInvoiceHtml(id);
  const template = await container.invoices.getTemplate();
  if (!body) return notFound("invoice not found");
  const document = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${invoice.number}</title>
<style>
:root{--accent:${template.accentColor}}
*{box-sizing:border-box}body{margin:0;background:#f3f3f1;color:#171717;font:14px/1.5 Arial,sans-serif}
.invoice{position:relative;max-width:800px;min-height:1120px;margin:24px auto;background:#fff;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.08)}
.letterhead{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}
.invoice-content{position:relative;z-index:1;padding:72px 64px}
.invoice header{display:flex;justify-content:space-between;gap:32px;align-items:flex-start;border-bottom:3px solid var(--accent);padding-bottom:24px}
.eyebrow,.meta span,.notes span,.payment span{display:block;color:#666;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.invoice h1{margin:5px 0 0;font-size:30px}.from{max-width:280px;text-align:right}.from p{margin:7px 0 0;color:#666;white-space:normal}
.meta{display:grid;grid-template-columns:2fr 1fr 1fr;gap:24px;margin:30px 0;color:#555}.meta strong{display:block;margin-top:6px;color:#222}
.invoice table{width:100%;border-collapse:collapse}.invoice th,.invoice td{padding:13px 8px;border-bottom:1px solid #ddd;text-align:left}.invoice th{color:#666;font-size:10px;letter-spacing:.08em;text-transform:uppercase}.invoice th:nth-child(n+2),.invoice td:nth-child(n+2){text-align:right}
.summary{margin:30px 0 0 auto;max-width:320px}.summary p{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #eee;padding:9px 0;margin:0}.summary .grand-total{border-bottom:3px solid var(--accent);font-size:16px}
.notes,.payment{margin-top:32px;max-width:560px}.notes p,.payment p{color:#555;line-height:1.7}.invoice footer{position:absolute;right:64px;bottom:42px;left:64px;border-top:1px solid #ddd;padding-top:14px;color:#777;font-size:11px;text-align:center}
@media print{@page{size:A4;margin:0}body{background:#fff}.invoice{max-width:none;min-height:297mm;margin:0;box-shadow:none}.invoice-content{padding:18mm 16mm}.invoice footer{right:16mm;bottom:12mm;left:16mm}}
</style></head><body>${body}${print ? '<script>window.addEventListener("load",function(){window.print()})</script>' : ""}</body></html>`;
  return new Response(document, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `${print ? "inline" : "attachment"}; filename="${invoice.number}.html"`,
      "cache-control": "private, no-store",
    },
  });
}

export async function invoiceTemplateHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const invoices = buildContainer(ctx).invoices;
  if (req.method === "GET") {
    return json({ ok: true, template: await invoices.getTemplate() });
  }
  if (req.method !== "PUT") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }
  const body = await safeJson<UpdateInvoiceTemplateInput>(req);
  if (!body) return badRequest("template required.");
  if (body.letterheadDataUrl) {
    const validType = /^data:image\/(?:png|jpeg|webp);base64,/i.test(body.letterheadDataUrl);
    if (!validType) return badRequest("Upload a PNG, JPEG, or WebP template.");
    if (body.letterheadDataUrl.length > 2_000_000) return badRequest("Template image must be under 1.5 MB.");
  }
  try {
    const template: InvoiceTemplate = await invoices.saveTemplate(body);
    return json({ ok: true, template });
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
    clientId: url.searchParams.get("clientId") ?? undefined,
    categoryId: url.searchParams.get("categoryId") ?? undefined,
    staffId: url.searchParams.get("staffId") ?? undefined,
  };
  const denied = await clientCommercialGate(filter.clientId, "view");
  if (denied) return denied;
  return json({ ok: true, expenses: await buildContainer(ctx).expenses.list(filter) });
}

export async function createExpenseHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<CreateExpenseInput>(req);
  if (!body || !body.categoryId || typeof body.amountCents !== "number") {
    return badRequest("categoryId + amountCents required.");
  }
  const denied = await clientCommercialGate(body.clientId, "use");
  if (denied) return denied;
  try {
    const expenses = buildContainer(ctx).expenses;
    if (body.attachments?.length) await claimStagedPrivateUploadsForOwnership({
      agencyId: ctx.agencyId,
      purpose: "expense-attachment",
      objectIds: body.attachments.map(attachment => attachment.id),
    });
    // `body.idempotencyKey` (typed on CreateExpenseInput) forwards straight
    // through: a double-clicked "Add expense" resubmits the same key and gets
    // the first expense back rather than a second row. See lib/idempotency.ts.
    const create = () => expenses.createDetailed({ ...body, customFields: body.customFields ?? {} }, ctx.actor, defaultCurrency(ctx));
    const { expense, deduped } = body.attachments?.length
      ? await commitStagedPrivateUploadOwnership({
        agencyId: ctx.agencyId,
        purpose: "expense-attachment",
        objectIds: body.attachments.map(attachment => attachment.id),
        commit: async () => {
          const value = await create();
          return { ownerId: value.expense.id, value };
        },
      })
      : await create();
    return json({ ok: true, expense, deduped }, 201);
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
    const expenses = buildContainer(ctx).expenses;
    const existing = await expenses.get(body.id);
    if (!existing) return notFound("expense not found");
    const denied = await clientCommercialGate(existing.clientId, "use")
      ?? await clientCommercialGate(body.patch?.clientId, "use");
    if (denied) return denied;
    const existingAttachmentIds = new Set(existing.attachments?.map(attachment => attachment.id) ?? []);
    const newAttachments = (body.patch?.attachments ?? []).filter(attachment => !existingAttachmentIds.has(attachment.id));
    if (newAttachments.length) await claimStagedPrivateUploadsForOwnership({
      agencyId: ctx.agencyId,
      purpose: "expense-attachment",
      objectIds: newAttachments.map(attachment => attachment.id),
    });
    const update = () => expenses.update(body.id, { ...(body.patch ?? {}), customFields: body.patch?.customFields ?? existing.customFields ?? {} }, ctx.actor);
    const exp = newAttachments.length
      ? await commitStagedPrivateUploadOwnership({
        agencyId: ctx.agencyId,
        purpose: "expense-attachment",
        objectIds: newAttachments.map(attachment => attachment.id),
        commit: async () => {
          const value = await update();
          if (!value) throw new Error("expense not found");
          return { ownerId: value.id, value };
        },
      })
      : await update();
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
  try {
    const expenses = buildContainer(ctx).expenses;
    const existing = await expenses.get(body.id);
    if (!existing) return notFound("expense not found");
    const denied = await clientCommercialGate(existing.clientId, "manage");
    if (denied) return denied;
    const exp = await expenses.approve(body.id, ctx.actor, body.decisionNote);
    return exp ? json({ ok: true, expense: exp }) : notFound("expense not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function rejectExpenseHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ id: string; decisionNote?: string }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const expenses = buildContainer(ctx).expenses;
    const existing = await expenses.get(body.id);
    if (!existing) return notFound("expense not found");
    const denied = await clientCommercialGate(existing.clientId, "manage");
    if (denied) return denied;
    const exp = await expenses.reject(body.id, ctx.actor, body.decisionNote);
    return exp ? json({ ok: true, expense: exp }) : notFound("expense not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function reimburseExpenseHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const expenses = buildContainer(ctx).expenses;
    const existing = await expenses.get(body.id);
    if (!existing) return notFound("expense not found");
    const denied = await clientCommercialGate(existing.clientId, "manage");
    if (denied) return denied;
    const exp = await expenses.reimburse(body.id, ctx.actor);
    return exp ? json({ ok: true, expense: exp }) : notFound("expense not found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function postRecurringExpenseHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const guard = methodGuard(req, "POST");
  if (guard) return guard;
  const body = await safeJson<Record<string, unknown>>(req);
  if (!body) return badRequest("id + occurrenceAt required.");
  try {
    assertKnownFields(body, ["id", "occurrenceAt"]);
    assertNonEmptyText(body.id, "id");
    assertTimestamp(body.occurrenceAt, "occurrenceAt");
    const expenses = buildContainer(ctx).expenses;
    const existing = await expenses.get(body.id as string);
    if (!existing) return notFound("expense not found");
    const denied = await clientCommercialGate(existing.clientId, "use");
    if (denied) return denied;
    const result = await expenses.postNextOccurrence(body.id, ctx.actor, body.occurrenceAt);
    return result ? json({ ok: true, ...result }, 201) : notFound("expense not found");
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
  const now = Date.now();
  const from = Number(url.searchParams.get("from") ?? Date.UTC(new Date(now).getUTCFullYear(), 0, 1));
  const to = Number(url.searchParams.get("to") ?? now);
  const currency = normaliseCurrency(url.searchParams.get("currency"), defaultCurrency(ctx));
  try {
    assertTimestamp(from, "from");
    assertTimestamp(to, "to");
    if (from > to) return badRequest("from must not be after to");
    const snapshot = await buildContainer(ctx).reports.revenueSnapshot({ from, to, currency });
    return json({ ok: true, snapshot });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "invalid_report_request");
  }
}
