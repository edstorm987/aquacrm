import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { containerFor } from "@/built-ins/modules/agency-finance/src/server";
import { normaliseCurrency } from "@/built-ins/modules/agency-finance/src/lib/currencies";
import type { Invoice } from "@/built-ins/modules/agency-finance/src/lib/domain";
import {
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
import { ensureDefaultAgencyProducts } from "@/server/agencyProducts";
import { logActivity } from "@/server/activity";
import { getInstall } from "@/server/pluginInstalls";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";

type Action = "create" | "update" | "status" | "delete" | "create-invoice";

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

function savePlans(agencyId: string, clientId: string, plans: ClientPaymentPlan[]) {
  const updated = updateClient(agencyId, clientId, { metadata: { clientPaymentPlans: plans } });
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
  if (!clientId || !["create", "update", "status", "delete", "create-invoice"].includes(action)) {
    return NextResponse.json({ ok: false, error: "Client and valid action are required." }, { status: 400 });
  }

  let session;
  try {
    session = await requireRoleForClient([...AGENCY_ROLES], clientId);
  } catch (error) {
    return authErrorResponse(error);
  }
  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });

  const products = resolvePortalProductAssignment(
    client.metadata ?? {},
    ensureDefaultAgencyProducts(session.agencyId),
  ).products;
  const productById = new Map(products.map(product => [product.id, product]));
  const plans = cleanClientPaymentPlans(client.metadata?.clientPaymentPlans);
  const now = Date.now();

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

  if (action === "delete") {
    if (current.milestones.some(milestone => Boolean(milestone.invoiceId))) {
      return NextResponse.json({ ok: false, error: "A plan with linked invoices cannot be deleted. Cancel it instead." }, { status: 409 });
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
      if (existing?.invoiceId) {
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

  const milestoneId = cleanText(body?.milestoneId, 120);
  const milestoneIndex = current.milestones.findIndex(milestone => milestone.id === milestoneId);
  if (milestoneIndex < 0) return NextResponse.json({ ok: false, error: "Payment milestone not found." }, { status: 404 });
  const milestone = current.milestones[milestoneIndex];
  if (milestone.invoiceId) return NextResponse.json({ ok: false, error: "This milestone already has an invoice." }, { status: 409 });
  if (milestone.status === "waived") return NextResponse.json({ ok: false, error: "A waived milestone cannot be invoiced." }, { status: 409 });

  const install = getInstall({ agencyId: session.agencyId }, "agency-finance");
  if (!install?.enabled) return NextResponse.json({ ok: false, error: "Connect Finance before creating an invoice." }, { status: 409 });
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
    }, session.userId);
    if (body?.issue !== false) invoice = (await finance.invoices.update(invoice.id, { status: "sent" }, session.userId)) ?? invoice;
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Invoice could not be created." }, { status: 422 });
  }

  const updatedMilestone: ClientPaymentMilestone = {
    ...milestone,
    status: invoice.status === "paid" ? "paid" : "invoiced",
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    invoicedAt: now,
    paidAt: invoice.paidAt,
  };
  const updatedPlan: ClientPaymentPlan = {
    ...current,
    milestones: current.milestones.map(item => item.id === updatedMilestone.id ? updatedMilestone : item),
    updatedAt: now,
  };
  const next = plans.map(plan => plan.id === updatedPlan.id ? updatedPlan : plan);
  if (!savePlans(session.agencyId, clientId, next)) {
    return NextResponse.json({ ok: false, error: `Invoice ${invoice.number} was created, but its payment-plan link needs review.` }, { status: 500 });
  }
  upsertClientInvoiceLedgerEvent(session.agencyId, clientId, invoice);
  logActivity({ agencyId: session.agencyId, clientId, actorUserId: session.userId, actorEmail: session.email, category: "finance", action: "client_payment_plan.invoiced", message: `Created ${invoice.number} from “${current.title}” milestone “${milestone.title}”.`, metadata: { planId, milestoneId, invoiceId: invoice.id, invoiceNumber: invoice.number } });
  await flushPendingWrites();
  return NextResponse.json({ ok: true, plans: next, plan: updatedPlan, invoice });
}
