import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { containerFor } from "@/built-ins/modules/agency-finance/src/server";
import { normaliseCurrency } from "@/built-ins/modules/agency-finance/src/lib/currencies";
import type { Invoice } from "@/built-ins/modules/agency-finance/src/lib/domain";
import {
  buildFinancePlanSchedule,
  cancelActiveFinancePlanSchedules,
  cleanClientPaymentPlans,
  type ClientPaymentMilestone,
  type ClientPaymentPlan,
  type ClientPaymentPlanStatus,
} from "@/lib/clients/clientPaymentPlans";
import { resolvePortalProductAssignment } from "@/lib/products/productAssignments";
import {
  clientPaymentPlanLedgerEvent,
  synchroniseClientRecordLedger,
  upsertClientInvoiceLedgerEvent,
} from "@/lib/server/clients/clientRecordLedger";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { agencyProductsForRead } from "@/server/agencyProducts";
import { logActivity } from "@/server/activity";
import { getInstall } from "@/server/pluginInstalls";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { ProductWorkspaceBusyError, withClientMetadataLedgerTransaction } from "@/server/productWorkspaceCoordinator";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

type Action = "create" | "update" | "status" | "delete" | "create-invoice" | "assign-finance-plan" | "cancel-finance-plan";

interface Body {
  clientId?: unknown;
  action?: unknown;
  planId?: unknown;
  milestoneId?: unknown;
  title?: unknown;
  summary?: unknown;
  currency?: unknown;
  amountCents?: unknown;
  installmentCount?: unknown;
  firstDueAt?: unknown;
  cadenceDays?: unknown;
  productId?: unknown;
  customerVisible?: unknown;
  internalNotes?: unknown;
  status?: unknown;
  milestones?: unknown;
  issue?: unknown;
  expectedRevision?: unknown;
  financePlanId?: unknown;
  operationId?: unknown;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanInteger(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : null;
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function persistPlans(agencyId: string, clientId: string, plans: ClientPaymentPlan[]) {
  return updateClient(agencyId, clientId, { metadata: { clientPaymentPlans: plans } });
}

function savePlans(agencyId: string, clientId: string, plans: ClientPaymentPlan[]) {
  const updated = persistPlans(agencyId, clientId, plans);
  if (updated) {
    synchroniseClientRecordLedger({
      agencyId,
      clientId,
      events: plans.map(plan => clientPaymentPlanLedgerEvent(clientId, plan)),
      completeSources: ["payment-plan"],
    });
  }
  return updated;
}

export async function POST(request: Request) {
  await ensureHydrated();
  const body = await request.json().catch(() => null) as Body | null;
  const clientId = cleanText(body?.clientId, 120);
  const action = cleanText(body?.action, 40) as Action;
  if (!clientId || !["create", "update", "status", "delete", "create-invoice", "assign-finance-plan", "cancel-finance-plan"].includes(action)) {
    return NextResponse.json({ ok: false, error: "Client and valid action are required." }, { status: 400 });
  }

  let session;
  try {
    session = await requireRoleForClient([...AGENCY_ROLES], clientId);
  } catch (error) {
    return authErrorResponse(error);
  }
  try {
    await requireCurrentClientWorkspaceElementAccess(
      clientId,
      "client.commercial",
      action === "delete" || action === "assign-finance-plan" || action === "cancel-finance-plan" ? "manage" : "use",
    );
  } catch (error) {
    return authErrorResponse(error);
  }
  try {
  return await withClientMetadataLedgerTransaction({ agencyId: session.agencyId, clientId, ledger: "payment-plans" }, async () => {
  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });

  const products = resolvePortalProductAssignment(
    client.metadata ?? {},
    agencyProductsForRead(session.agencyId),
  ).products;
  const productById = new Map(products.map(product => [product.id, product]));
  const plans = cleanClientPaymentPlans(client.metadata?.clientPaymentPlans);
  const now = Date.now();

  if (action === "assign-finance-plan") {
    const financePlanId = cleanText(body?.financePlanId, 120);
    const operationId = cleanText(body?.operationId, 180);
    const firstDueAt = cleanInteger(body?.firstDueAt, 1, Number.MAX_SAFE_INTEGER);
    if (!financePlanId || !operationId || !firstDueAt) {
      return NextResponse.json({ ok: false, error: "Plan, first due date and operation identity are required." }, { status: 400 });
    }
    const prior = plans.find(plan => plan.commercialOperationId === operationId);
    if (prior) return NextResponse.json({ ok: true, plans, plan: prior, deduped: true });
    const alreadyAssigned = plans.find(plan => plan.financePlanId === financePlanId && plan.status === "active");
    if (alreadyAssigned) return NextResponse.json({ ok: true, plans, plan: alreadyAssigned, deduped: true });
    const install = getInstall({ agencyId: session.agencyId }, "agency-finance");
    if (!install?.enabled) return NextResponse.json({ ok: false, error: "Connect Finance before assigning a commercial plan." }, { status: 409 });
    const finance = containerFor({ agencyId: session.agencyId, storage: makePluginStorage(install.id), install });
    const template = await finance.plans.get(financePlanId);
    if (!template || !template.active) {
      return NextResponse.json({ ok: false, error: "Choose an active Finance plan." }, { status: 404 });
    }
    const canonical = buildFinancePlanSchedule({
      terms: template,
      clientPaymentPlanId: stableId("payplan", `${session.agencyId}:${clientId}:${operationId}`),
      operationId,
      firstDueAt,
      customerVisible: body?.customerVisible !== false,
      now,
      makeMilestoneId: (kind, index) => stableId("paym", `${session.agencyId}:${clientId}:${operationId}:${kind}:${index}`),
    });
    const next = [canonical, ...cancelActiveFinancePlanSchedules(plans, now)];
    if (!savePlans(session.agencyId, clientId, next)) {
      return NextResponse.json({ ok: false, error: "Commercial plan assignment could not be saved." }, { status: 500 });
    }
    logActivity({
      idempotencyKey: `commercial-plan-assign:${operationId}`,
      agencyId: session.agencyId,
      clientId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "finance",
      action: "client_payment_plan.finance_plan_assigned",
      message: `Assigned “${template.label}” as the canonical client payment schedule.`,
      metadata: { financePlanId: template.id, clientPaymentPlanId: canonical.id, currency: canonical.currency, monthlyAmountCents: canonical.monthlyAmountCents },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, plans: next, plan: canonical }, { status: 201 });
  }

  if (action === "cancel-finance-plan") {
    const operationId = cleanText(body?.operationId, 180);
    if (!operationId) return NextResponse.json({ ok: false, error: "Operation identity is required." }, { status: 400 });
    const priorCancellation = plans.find(plan => plan.commercialCancelledByOperationId === operationId);
    if (priorCancellation) {
      return NextResponse.json({ ok: true, plans, plan: priorCancellation, deduped: true });
    }
    const active = plans.filter(plan => plan.financePlanId && plan.status === "active");
    if (!active.length) return NextResponse.json({ ok: true, plans, deduped: true });
    const next = cancelActiveFinancePlanSchedules(plans, now, operationId);
    if (!savePlans(session.agencyId, clientId, next)) {
      return NextResponse.json({ ok: false, error: "Commercial plan cancellation could not be saved." }, { status: 500 });
    }
    logActivity({
      idempotencyKey: `commercial-plan-cancel:${operationId}`,
      agencyId: session.agencyId,
      clientId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "finance",
      action: "client_payment_plan.finance_plan_cancelled",
      message: `Cancelled ${active.length === 1 ? `“${active[0]?.title}”` : `${active.length} commercial plans`}; existing invoices were retained.`,
      metadata: { clientPaymentPlanIds: active.map(plan => plan.id), financePlanIds: active.map(plan => plan.financePlanId) },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, plans: next });
  }

  if (action === "create") {
    const title = cleanText(body?.title, 180);
    const totalCents = cleanInteger(body?.amountCents, 1, 1_000_000_000);
    const installmentCount = cleanInteger(body?.installmentCount, 1, 24);
    const firstDueAt = cleanInteger(body?.firstDueAt, 1, Number.MAX_SAFE_INTEGER);
    const cadenceDays = cleanInteger(body?.cadenceDays, 1, 365) ?? 30;
    if (!title || !totalCents || !installmentCount || !firstDueAt) {
      return NextResponse.json({ ok: false, error: "Title, total, instalment count and first due date are required." }, { status: 400 });
    }
    const requestedProductId = cleanText(body?.productId, 120);
    const product = requestedProductId ? productById.get(requestedProductId) : undefined;
    if (requestedProductId && !product) {
      return NextResponse.json({ ok: false, error: "The selected service is not assigned to this client." }, { status: 409 });
    }
    const base = Math.floor(totalCents / installmentCount);
    const remainder = totalCents - base * installmentCount;
    const milestones: ClientPaymentMilestone[] = Array.from({ length: installmentCount }, (_, index) => ({
      id: makeId("paym"),
      title: installmentCount === 1 ? title : `${title} · Instalment ${index + 1} of ${installmentCount}`,
      amountCents: base + (index === installmentCount - 1 ? remainder : 0),
      dueAt: firstDueAt + index * cadenceDays * 86_400_000,
      productId: product?.id,
      productName: product?.name,
      status: "planned",
    }));
    const plan: ClientPaymentPlan = {
      id: makeId("payplan"),
      revision: 0,
      title,
      summary: cleanText(body?.summary, 2_000) || undefined,
      currency: normaliseCurrency(body?.currency),
      status: "draft",
      customerVisible: body?.customerVisible === true,
      productIds: product ? [product.id] : [],
      milestones,
      internalNotes: cleanText(body?.internalNotes, 4_000) || undefined,
      createdAt: now,
      updatedAt: now,
    };
    const next = [plan, ...plans];
    if (!savePlans(session.agencyId, clientId, next)) {
      return NextResponse.json({ ok: false, error: "Payment plan could not be saved." }, { status: 500 });
    }
    logActivity({
      agencyId: session.agencyId,
      clientId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "finance",
      action: "client_payment_plan.created",
      message: `Created payment plan “${title}” with ${installmentCount} milestone${installmentCount === 1 ? "" : "s"}.`,
      metadata: { planId: plan.id, totalCents, currency: plan.currency, productId: product?.id },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, plans: next, plan }, { status: 201 });
  }

  const planId = cleanText(body?.planId, 120);
  const planIndex = plans.findIndex(plan => plan.id === planId);
  if (planIndex < 0) return NextResponse.json({ ok: false, error: "Payment plan not found." }, { status: 404 });
  const current = plans[planIndex];
  if (current.financePlanId && ["update", "status", "delete"].includes(action)) {
    return NextResponse.json({
      ok: false,
      error: "This schedule is linked to a Finance plan. Manage its lifecycle from Finance → Plans.",
      plans,
    }, { status: 409 });
  }
  const requestedMilestoneId = action === "create-invoice" ? cleanText(body?.milestoneId, 120) : "";
  const requestedMilestone = requestedMilestoneId
    ? current.milestones.find(milestone => milestone.id === requestedMilestoneId)
    : undefined;
  const expectedRevision = cleanInteger(body?.expectedRevision, 0, Number.MAX_SAFE_INTEGER);
  const replayingInvoiceOperation = action === "create-invoice" && Boolean(requestedMilestone?.invoiceOperationId);
  if (expectedRevision === null || (expectedRevision !== current.revision && !replayingInvoiceOperation)) {
    return NextResponse.json({
      ok: false,
      error: "This payment plan changed in another session. The latest version has been loaded; review it and try again.",
      plans,
    }, { status: 409 });
  }

  if (action === "delete") {
    if (current.milestones.some(milestone => Boolean(milestone.invoiceId || milestone.invoiceOperationId))) {
      return NextResponse.json({ ok: false, error: "A plan with linked or recovering invoices cannot be deleted. Cancel it instead." }, { status: 409 });
    }
    const next = plans.filter(plan => plan.id !== current.id);
    const files = Array.isArray(client.metadata?.files) ? client.metadata.files : [];
    const nextFiles = files.map(file => file && typeof file === "object" && "collectionId" in file && file.collectionId === current.id
      ? { ...file, collectionId: undefined }
      : file);
    if (!updateClient(session.agencyId, clientId, { metadata: { clientPaymentPlans: next, files: nextFiles } })) {
      return NextResponse.json({ ok: false, error: "Payment plan could not be deleted." }, { status: 500 });
    }
    synchroniseClientRecordLedger({
      agencyId: session.agencyId,
      clientId,
      events: next.map(plan => clientPaymentPlanLedgerEvent(clientId, plan)),
      completeSources: ["payment-plan"],
    });
    const detachedEvidence = files.filter(file => file && typeof file === "object" && "collectionId" in file && file.collectionId === current.id).length;
    logActivity({ agencyId: session.agencyId, clientId, actorUserId: session.userId, actorEmail: session.email, category: "finance", action: "client_payment_plan.deleted", message: `Deleted payment plan “${current.title}”.`, metadata: { planId, detachedEvidence } });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, plans: next, files: nextFiles });
  }

  if (action === "status") {
    const requested = cleanText(body?.status, 30) as ClientPaymentPlanStatus;
    if (!["draft", "active", "completed", "cancelled"].includes(requested)) {
      return NextResponse.json({ ok: false, error: "Valid payment plan status required." }, { status: 400 });
    }
    if (requested === "active" && (!current.milestones.length || current.milestones.some(milestone => milestone.amountCents <= 0))) {
      return NextResponse.json({ ok: false, error: "Add at least one funded milestone before activating the plan." }, { status: 409 });
    }
    const updated: ClientPaymentPlan = {
      ...current,
      revision: current.revision + 1,
      status: requested,
      customerVisible: current.customerVisible,
      activatedAt: requested === "active" ? current.activatedAt ?? now : current.activatedAt,
      completedAt: requested === "completed" ? now : undefined,
      updatedAt: now,
    };
    const next = plans.map(plan => plan.id === updated.id ? updated : plan);
    if (!savePlans(session.agencyId, clientId, next)) return NextResponse.json({ ok: false, error: "Status could not be saved." }, { status: 500 });
    logActivity({ agencyId: session.agencyId, clientId, actorUserId: session.userId, actorEmail: session.email, category: "finance", action: `client_payment_plan.${requested}`, message: `${requested === "active" ? (updated.customerVisible ? "Published" : "Activated") : "Marked"} payment plan “${current.title}” ${requested}.`, metadata: { planId, status: requested, customerVisible: updated.customerVisible } });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, plans: next, plan: updated });
  }

  if (action === "update") {
    if (!Array.isArray(body?.milestones)) {
      return NextResponse.json({ ok: false, error: "Milestones are required." }, { status: 400 });
    }
    const existingById = new Map(current.milestones.map(milestone => [milestone.id, milestone]));
    const submittedIds = new Set<string>();
    const milestones = body.milestones.flatMap((entry): ClientPaymentMilestone[] => {
      if (!entry || typeof entry !== "object") return [];
      const row = entry as Record<string, unknown>;
      const suppliedId = cleanText(row.id, 120);
      const existing = suppliedId ? existingById.get(suppliedId) : undefined;
      if (existing?.invoiceId || existing?.invoiceOperationId) {
        submittedIds.add(existing.id);
        return [existing];
      }
      const title = cleanText(row.title, 180);
      const amountCents = cleanInteger(row.amountCents, 1, 1_000_000_000);
      const dueAt = cleanInteger(row.dueAt, 1, Number.MAX_SAFE_INTEGER);
      if (!title || !amountCents || !dueAt) return [];
      const productId = cleanText(row.productId, 120);
      const product = productId ? productById.get(productId) : undefined;
      if (productId && !product) return [];
      const id = existing?.id ?? makeId("paym");
      submittedIds.add(id);
      return [{
        ...existing,
        id,
        title,
        description: cleanText(row.description, 1_000) || undefined,
        amountCents,
        dueAt,
        productId: product?.id,
        productName: product?.name,
        status: row.status === "waived" ? "waived" : "planned",
        invoiceId: undefined,
        invoiceNumber: undefined,
        invoicedAt: undefined,
        paidAt: undefined,
      }];
    }).slice(0, 48);
    for (const existing of current.milestones) {
      if (existing.invoiceId && !submittedIds.has(existing.id)) milestones.push(existing);
    }
    if (!milestones.length) return NextResponse.json({ ok: false, error: "Keep at least one valid milestone." }, { status: 400 });
    const productIds = [...new Set(milestones.flatMap(milestone => milestone.productId ? [milestone.productId] : []))];
    const updated: ClientPaymentPlan = {
      ...current,
      revision: current.revision + 1,
      title: cleanText(body?.title, 180) || current.title,
      summary: cleanText(body?.summary, 2_000) || undefined,
      currency: normaliseCurrency(body?.currency, normaliseCurrency(current.currency)),
      customerVisible: body?.customerVisible === true,
      productIds,
      milestones,
      internalNotes: cleanText(body?.internalNotes, 4_000) || undefined,
      updatedAt: now,
    };
    const next = plans.map(plan => plan.id === updated.id ? updated : plan);
    if (!savePlans(session.agencyId, clientId, next)) return NextResponse.json({ ok: false, error: "Payment plan could not be updated." }, { status: 500 });
    logActivity({ agencyId: session.agencyId, clientId, actorUserId: session.userId, actorEmail: session.email, category: "finance", action: "client_payment_plan.updated", message: `Updated payment plan “${updated.title}”.`, metadata: { planId, milestoneCount: milestones.length } });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, plans: next, plan: updated });
  }

  const milestoneId = requestedMilestoneId;
  const milestoneIndex = current.milestones.findIndex(milestone => milestone.id === milestoneId);
  if (milestoneIndex < 0) return NextResponse.json({ ok: false, error: "Payment milestone not found." }, { status: 404 });
  let operationPlan = current;
  let operationPlans = plans;
  let milestone = current.milestones[milestoneIndex];
  if (milestone.status === "waived") return NextResponse.json({ ok: false, error: "A waived milestone cannot be invoiced." }, { status: 409 });

  const install = getInstall({ agencyId: session.agencyId }, "agency-finance");
  if (!install?.enabled) return NextResponse.json({ ok: false, error: "Connect Finance before creating an invoice." }, { status: 409 });
  const operationId = milestone.invoiceOperationId ?? makeId("payinvop");
  if (!milestone.invoiceOperationId) {
    const intentMilestone: ClientPaymentMilestone = {
      ...milestone,
      invoiceOperationId: operationId,
      invoiceOperationStartedAt: Date.now(),
    };
    operationPlan = {
      ...current,
      milestones: current.milestones.map(item => item.id === intentMilestone.id ? intentMilestone : item),
    };
    operationPlans = plans.map(plan => plan.id === operationPlan.id ? operationPlan : plan);
    if (!persistPlans(session.agencyId, clientId, operationPlans)) {
      return NextResponse.json({ ok: false, error: "Invoice recovery identity could not be saved, so no invoice was created." }, { status: 500 });
    }
    try {
      await flushPendingWrites();
    } catch {
      return NextResponse.json({ ok: false, error: "Invoice recovery identity could not be confirmed, so no invoice was created. Retry safely." }, { status: 503 });
    }
    milestone = intentMilestone;
  }

  let invoice: Invoice;
  try {
    const finance = containerFor({ agencyId: session.agencyId, storage: makePluginStorage(install.id), install });
    invoice = await finance.invoices.create({
      clientId,
      companyId: client.companyId,
      dueAt: milestone.dueAt,
      lineItems: [{
        description: milestone.productName ? `${milestone.title} · ${milestone.productName}` : milestone.title,
        quantity: 1,
        unitCents: milestone.amountCents,
      }],
      currency: normaliseCurrency(current.currency),
      notes: [`Payment plan: ${current.title}`, milestone.description, `Aqua plan reference: ${current.id}/${milestone.id}`].filter(Boolean).join("\n"),
      idempotencyKey: `payment-plan:${session.agencyId}:${clientId}:${current.id}:${milestone.id}:${operationId}`,
    }, session.userId);
    if (body?.issue !== false && invoice.status === "draft") {
      const issued = await finance.invoices.update(invoice.id, { status: "sent" }, session.userId);
      if (!issued) throw new Error("The invoice was created but could not be reloaded for issue.");
      invoice = issued;
    }
    await flushPendingWrites();
  } catch (error) {
    return NextResponse.json({ ok: false, error: `${error instanceof Error ? error.message : "Invoice could not be created."} Retry will reuse the saved invoice operation.` }, { status: 422 });
  }

  if (invoice.status === "void" || invoice.status === "refunded") {
    return NextResponse.json({ ok: false, error: `Invoice ${invoice.number} is ${invoice.status}. Review it before starting a replacement invoice.` }, { status: 409 });
  }

  let updatedPlan = operationPlan;
  let next = operationPlans;
  if (milestone.invoiceId !== invoice.id
    || milestone.invoiceNumber !== invoice.number
    || milestone.status !== (invoice.status === "paid" ? "paid" : "invoiced")) {
    const updatedMilestone: ClientPaymentMilestone = {
      ...milestone,
      status: invoice.status === "paid" ? "paid" : "invoiced",
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      invoicedAt: milestone.invoicedAt ?? invoice.issuedAt,
      paidAt: invoice.paidAt,
    };
    updatedPlan = {
      ...operationPlan,
      revision: operationPlan.revision + 1,
      milestones: operationPlan.milestones.map(item => item.id === updatedMilestone.id ? updatedMilestone : item),
      updatedAt: Date.now(),
    };
    next = operationPlans.map(plan => plan.id === updatedPlan.id ? updatedPlan : plan);
    if (!persistPlans(session.agencyId, clientId, next)) {
      return NextResponse.json({ ok: false, error: `Invoice ${invoice.number} exists safely, but its payment-plan link needs review. Retry will adopt the same invoice.` }, { status: 500 });
    }
    try {
      await flushPendingWrites();
    } catch {
      return NextResponse.json({ ok: false, error: `Invoice ${invoice.number} exists safely, but its payment-plan link could not be confirmed. Retry will adopt the same invoice.` }, { status: 500 });
    }
  }

  synchroniseClientRecordLedger({
    agencyId: session.agencyId,
    clientId,
    events: next.map(plan => clientPaymentPlanLedgerEvent(clientId, plan)),
    completeSources: ["payment-plan"],
  });
  upsertClientInvoiceLedgerEvent(session.agencyId, clientId, invoice);
  logActivity({ idempotencyKey: `client-payment-plan-invoice:${operationId}`, agencyId: session.agencyId, clientId, actorUserId: session.userId, actorEmail: session.email, category: "finance", action: "client_payment_plan.invoiced", message: `Created ${invoice.number} from “${current.title}” milestone “${milestone.title}”.`, metadata: { planId, milestoneId, invoiceId: invoice.id, invoiceNumber: invoice.number, operationId } });
  try {
    await flushPendingWrites();
  } catch {
    return NextResponse.json({ ok: false, error: `Invoice ${invoice.number} and its payment-plan link are safe, but record reconciliation needs retrying.` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, plans: next, plan: updatedPlan, invoice });
  });
  } catch (error) {
    if (error instanceof ProductWorkspaceBusyError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
