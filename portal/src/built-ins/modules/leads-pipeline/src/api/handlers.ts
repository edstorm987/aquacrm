// HTTP handlers for the leads-pipeline plugin.
//
// Mirrors the agency-hr convention: 200 on success with `{ ok: true,
// ...payload }`, 400 on validation, 404 on missing, 422 on business
// rule violation.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { addCard, getPipelineBySlug, listCardsByAgency, moveCard } from "@/server/pipelines";
import { createClient, listClients, updateClient } from "@/server/tenants";
import { setupClientStarterPortal } from "@/server/clientPortalSetup";
import {
  clientDeliveryPackageMetadata,
  customerPortalProvisioningMetadata,
} from "@/lib/server/customerPortalProvisioning";
import { cleanPortalProducts, type PortalProductKey, type PortalProductSelection } from "@/lib/portalProducts";
import { listAgencyProducts } from "@/server/agencyProducts";
import { clientMatchesContact, clientMatchesLead } from "../lib/clientMatch";
import { getState, mutate } from "@/server/storage";
import { parseXlsxToDelimitedText } from "../server/csv";
import { parseCsv } from "../server/csv";
import type { PortalState } from "@/server/types";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { resolveIntegrationValues } from "@/lib/server/integrationConnections";
import type {
  AudienceFilter,
  Contact,
  CommercialPack,
  CustomFieldDefinition,
  CustomFieldType,
  CreateCampaignInput,
  CreateContactInput,
  CreateLeadInput,
  CreateProspectInput,
  CommercialPartyKind,
  CommercialPaymentMethod,
  Lead,
  MeetingAttemptChannel,
  MeetingAttemptOutcome,
  MeetingMode,
  MeetingStatus,
  SalesPresentation,
  SaveCommercialPackInput,
  UpdateContactPatch,
  UpdateCampaignPatch,
  UpdateLeadPatch,
  UpdateProspectPatch,
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
const LEADS_PIPELINE_SLUG = "leads";
const EXCEL_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);
const CUSTOM_FIELDS_KEY = "contacts/custom-field-definitions";
const CUSTOM_TAGS_KEY = "contacts/custom-tags";
const CUSTOM_FIELD_TYPES = new Set<CustomFieldType>(["text", "number", "date", "url", "select", "multi-select", "checkbox"]);

const buildContainer = (ctx: PluginCtx) =>
  containerFor({ agencyId: ctx.agencyId, storage: ctx.storage });

async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; }
  catch { return null; }
}

function commercialParty(url: URL): { kind: CommercialPartyKind; id: string } | null {
  const kind = url.searchParams.get("partyKind");
  const id = url.searchParams.get("partyId");
  return (kind === "lead" || kind === "contact") && id ? { kind, id } : null;
}

function cleanSalesPresentations(value: unknown): SalesPresentation[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const cleaned: SalesPresentation[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const source = item as { id?: unknown; title?: unknown; url?: unknown };
    const title = typeof source.title === "string" ? source.title.trim().slice(0, 120) : "";
    const url = typeof source.url === "string" ? source.url.trim().slice(0, 2_000) : "";
    if (!title || !url) return null;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) return null;
    } catch {
      return null;
    }
    cleaned.push({
      id: typeof source.id === "string" && source.id.trim()
        ? source.id.trim().slice(0, 120)
        : `presentation_${randomUUID()}`,
      title,
      url,
    });
  }
  return cleaned;
}

// ─── Scouting prospects ─────────────────────────────────────────────────

export async function prospectsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const c = buildContainer(ctx);
  if (req.method === "GET") {
    return json({ ok: true, prospects: await c.prospects.list() });
  }
  if (req.method === "POST") {
    const body = await safeJson<CreateProspectInput>(req);
    if (!body?.source) return badRequest("source required.");
    try {
      const prospect = await c.prospects.create(body, ctx.actor);
      return json({ ok: true, prospect }, 201);
    } catch (err) {
      return unprocessable(err instanceof Error ? err.message : String(err));
    }
  }
  if (req.method === "PATCH") {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return badRequest("id required.");
    const body = await safeJson<UpdateProspectPatch>(req);
    if (!body) return badRequest("body required.");
    const prospect = await c.prospects.update(id, body, ctx.actor);
    return prospect ? json({ ok: true, prospect }) : notFound("prospect_not_found");
  }
  return json({ ok: false, error: "method_not_allowed" }, 405);
}

export async function qualifyProspectHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  const c = buildContainer(ctx);
  const prospect = await c.prospects.get(body.id);
  if (!prospect || prospect.status !== "scouting") return notFound("active_prospect_not_found");
  if (!prospect.email) {
    return unprocessable("Add an email before qualifying this prospect as a lead.");
  }
  const scoutingNotes = [
    prospect.opportunity ? `Why we could help: ${prospect.opportunity}` : "",
    prospect.researchNotes ? `Scouting research: ${prospect.researchNotes}` : "",
    prospect.nextStep ? `Suggested next step: ${prospect.nextStep}` : "",
    prospect.foundAt ? `Found at: ${prospect.foundAt}` : "",
    prospect.website ? `Website: ${prospect.website}` : "",
  ].filter(Boolean).join("\n\n");
  try {
    const result = await c.leads.upsert({
      email: prospect.email,
      name: prospect.name,
      phone: prospect.phone,
      company: prospect.company,
      source: `scouting:${prospect.source}`,
      tags: [
        "scouted",
        ...(prospect.niche ? [`niche:${prospect.niche.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`] : []),
      ],
      notes: scoutingNotes || undefined,
      customFields: {
        ...(prospect.niche ? { niche: prospect.niche } : {}),
        "scouting-source": prospect.source,
        ...(prospect.foundAt ? { "scouting-found-at": prospect.foundAt } : {}),
        ...(prospect.opportunity ? { "scouting-opportunity": prospect.opportunity } : {}),
        ...(prospect.researchNotes ? { "scouting-research": prospect.researchNotes } : {}),
        ...(prospect.nextStep ? { "scouting-next-step": prospect.nextStep } : {}),
        ...(prospect.website ? { website: prospect.website } : {}),
      },
    }, ctx.actor);
    const updated = await c.prospects.update(prospect.id, {
      status: "qualified",
      qualifiedLeadId: result.lead.id,
    }, ctx.actor);
    return json({ ok: true, prospect: updated, lead: result.lead, created: result.created });
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function dismissProspectHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  const prospect = await buildContainer(ctx).prospects.dismiss(body.id, ctx.actor);
  return prospect ? json({ ok: true, prospect }) : notFound("prospect_not_found");
}

// ─── Meeting commercial pack ────────────────────────────────────────────

export async function getCommercialPackHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const party = commercialParty(new URL(req.url));
  if (!party) return badRequest("partyKind + partyId required.");
  const pack = await buildContainer(ctx).commercial.get(party.kind, party.id);
  return json({ ok: true, pack, stripeConfigured: Boolean(resolveIntegrationValues(ctx.agencyId, "stripe").secretKey) });
}

export async function saveCommercialPackHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const body = await safeJson<SaveCommercialPackInput>(req);
  if (!body?.partyId || !body.partyKind || !body.recipientEmail) return badRequest("party, recipient, and invoice details required.");
  try {
    const party = body.partyKind === "lead"
      ? await buildContainer(ctx).leads.get(body.partyId)
      : await buildContainer(ctx).contacts.get(body.partyId);
    if (!party) return notFound("lead_or_contact_not_found");
    const pack = await buildContainer(ctx).commercial.save(body, ctx.actor);
    return json({ ok: true, pack }, pack.createdAt === pack.updatedAt ? 201 : 200);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function sendCommercialPackHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const body = await safeJson<{ partyKind: CommercialPartyKind; partyId: string }>(req);
  if (!body?.partyId || !body.partyKind) return badRequest("partyKind + partyId required.");
  try {
    const baseUrl = new URL(req.url).origin;
    const pack = await buildContainer(ctx).commercial.send(body.partyKind, body.partyId, baseUrl, ctx.actor);
    return json({ ok: true, pack });
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function recordCommercialPaymentHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const body = await safeJson<{
    partyKind: CommercialPartyKind;
    partyId: string;
    amountCents: number;
    method: CommercialPaymentMethod;
    reference?: string;
    paidAt?: number;
  }>(req);
  if (!body?.partyId || !body.partyKind || !body.method) return badRequest("party, amount, and method required.");
  try {
    const pack = await buildContainer(ctx).commercial.recordPayment(body.partyKind, body.partyId, body, ctx.actor);
    return pack ? json({ ok: true, pack }) : notFound("commercial_pack_not_found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function createCommercialStripeCheckoutHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const body = await safeJson<{ partyKind: CommercialPartyKind; partyId: string }>(req);
  if (!body?.partyId || !body.partyKind) return badRequest("partyKind + partyId required.");
  const stripe = resolveIntegrationValues(ctx.agencyId, "stripe");
  const secret = stripe.secretKey;
  if (!secret) return unprocessable("Stripe is not connected. Open Settings → Integrations and connect it there.");
  const c = buildContainer(ctx);
  const pack = await c.commercial.get(body.partyKind, body.partyId);
  if (!pack) return notFound("commercial_pack_not_found");
  const recurring = pack.billingCadence === "monthly"
    || pack.billingCadence === "quarterly"
    || pack.billingCadence === "annual"
    || pack.billingCadence === "installments";
  const interval = pack.billingCadence === "annual" ? "year" : "month";
  const intervalCount = pack.billingCadence === "quarterly" ? "3" : "1";
  const checkoutAmount = pack.billingCadence === "installments"
    ? Math.ceil(pack.totalCents / (pack.installmentCount ?? 2))
    : pack.totalCents;
  const origin = new URL(req.url).origin;
  const params = new URLSearchParams({
    mode: recurring ? "subscription" : "payment",
    customer_email: pack.recipientEmail,
    client_reference_id: pack.id,
    success_url: `${origin}/proposal/${pack.publicToken}?payment=success`,
    cancel_url: `${origin}/proposal/${pack.publicToken}?payment=cancelled`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": pack.currency,
    "line_items[0][price_data][unit_amount]": String(checkoutAmount),
    "line_items[0][price_data][product_data][name]": pack.serviceLevel,
    "metadata[agencyId]": ctx.agencyId,
    "metadata[partyKind]": pack.partyKind,
    "metadata[partyId]": pack.partyId,
    "metadata[commercialPackId]": pack.id,
  });
  if (recurring) {
    params.set("line_items[0][price_data][recurring][interval]", interval);
    params.set("line_items[0][price_data][recurring][interval_count]", intervalCount);
    params.set("subscription_data[metadata][agencyId]", ctx.agencyId);
    params.set("subscription_data[metadata][partyKind]", pack.partyKind);
    params.set("subscription_data[metadata][partyId]", pack.partyId);
    params.set("subscription_data[metadata][billingCadence]", pack.billingCadence);
    if (pack.installmentCount) {
      params.set("subscription_data[metadata][installmentCount]", String(pack.installmentCount));
    }
  } else {
    params.set("customer_creation", "always");
    params.set("payment_intent_data[metadata][agencyId]", ctx.agencyId);
    params.set("payment_intent_data[metadata][partyKind]", pack.partyKind);
    params.set("payment_intent_data[metadata][partyId]", pack.partyId);
  }
  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const checkout = await response.json() as { id?: string; url?: string; error?: { message?: string } };
    if (!response.ok || !checkout.id || !checkout.url) {
      return unprocessable(checkout.error?.message ?? "Stripe could not create the payment page.");
    }
    const updated = await c.commercial.attachStripe(pack.partyKind, pack.partyId, { id: checkout.id, url: checkout.url });
    return json({ ok: true, pack: updated, checkoutUrl: checkout.url });
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function commercialStripeWebhookHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const stripe = resolveIntegrationValues(ctx.agencyId, "stripe");
  const webhookSecret = stripe.webhookSecret;
  if (!webhookSecret) return unprocessable("Stripe webhook secret is not configured.");
  const signature = req.headers.get("stripe-signature");
  if (!signature) return badRequest("Missing Stripe signature.");
  const raw = await req.text();
  if (!validStripeSignature(raw, signature, webhookSecret)) return badRequest("Invalid Stripe signature.");
  const event = JSON.parse(raw) as {
    id?: string;
    type?: string;
    data?: { object?: {
      id?: string;
      amount_total?: number;
      amount_paid?: number;
      payment_status?: string;
      status?: string;
      metadata?: Record<string, string>;
      subscription?: string;
      mode?: "payment" | "subscription";
      parent?: {
        subscription_details?: {
          subscription?: string;
          metadata?: Record<string, string>;
        };
      };
    } };
  };
  const object = event.data?.object;
  if (!object || (event.type !== "checkout.session.completed" && event.type !== "invoice.paid")) {
    return json({ ok: true, ignored: true });
  }
  let metadata = object.metadata ?? object.parent?.subscription_details?.metadata ?? {};
  const subscriptionId = object.subscription ?? object.parent?.subscription_details?.subscription;
  if ((!metadata.partyKind || !metadata.partyId) && subscriptionId && stripe.secretKey) {
    const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: { authorization: `Bearer ${stripe.secretKey}` },
    });
    if (response.ok) {
      const subscription = await response.json() as { metadata?: Record<string, string> };
      metadata = subscription.metadata ?? metadata;
    }
  }
  const partyKind = metadata.partyKind;
  const partyId = metadata.partyId;
  if ((partyKind !== "lead" && partyKind !== "contact") || !partyId) return json({ ok: true, ignored: true });
  if (subscriptionId) {
    await buildContainer(ctx).commercial.attachStripeSubscription(partyKind, partyId, subscriptionId);
  }
  if (event.type === "checkout.session.completed" && (object.mode === "subscription" || subscriptionId)) {
    return json({ ok: true, subscriptionAttached: true });
  }
  const amountCents = object.amount_total ?? object.amount_paid ?? 0;
  if (amountCents <= 0) return json({ ok: true, ignored: true });
  const pack = await buildContainer(ctx).commercial.recordPayment(partyKind, partyId, {
    amountCents,
    method: "stripe",
    reference: object.id ?? event.id,
  }, ctx.actor);
  if (
    pack?.billingCadence === "installments"
    && pack.installmentCount
    && subscriptionId
    && pack.payments.filter(payment => payment.method === "stripe").length >= pack.installmentCount
    && stripe.secretKey
  ) {
    await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${stripe.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ cancel_at_period_end: "true" }),
    });
  }
  return json({ ok: true, commercialPackId: pack?.id });
}

function validStripeSignature(payload: string, header: string, secret: string): boolean {
  const values = Object.fromEntries(header.split(",").map(part => {
    const [key, value] = part.split("=", 2);
    return [key, value];
  }));
  const timestamp = Number(values.t);
  const signature = values.v1;
  if (!timestamp || !signature || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function restorePortalState(snapshot: PortalState): void {
  mutate(state => {
    state.agencies = snapshot.agencies;
    state.clients = snapshot.clients;
    state.endCustomers = snapshot.endCustomers;
    state.users = snapshot.users;
    state.pluginInstalls = snapshot.pluginInstalls;
    state.pluginData = snapshot.pluginData;
    state.phases = snapshot.phases;
    state.activity = snapshot.activity;
    state.pipelines = snapshot.pipelines;
    state.pipelineCards = snapshot.pipelineCards;
  });
}

function isExcelWorkbook(filename: string, mimeType: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls") || EXCEL_MIME_TYPES.has(mimeType);
}

function isXlsxWorkbook(filename: string, mimeType: string): boolean {
  return filename.toLowerCase().endsWith(".xlsx")
    || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function findExistingClientForLead(agencyId: string, lead: Lead) {
  return listClients(agencyId).find(client => clientMatchesLead(client, lead)) ?? null;
}

async function syncCommercialPackToClientFinance(
  ctx: PluginCtx,
  pack: CommercialPack | null,
  clientId: string,
): Promise<CommercialPack | null> {
  if (!pack) return null;
  if (pack.financeInvoiceId) return pack;
  try {
    const [{ getInstall }, { makePluginStorage }, finance, foundation] = await Promise.all([
      import("@/server/pluginInstalls"),
      import("@/lib/server/pluginStorage"),
      import("@aqua/plugin-agency-finance/server"),
      import("@/built-ins/runtime/foundation-adapters/agencyFinanceFoundation"),
    ]);
    foundation.ensureAgencyFinanceFoundationRegistered();
    const install = getInstall({ agencyId: ctx.agencyId }, "agency-finance");
    if (!install) return pack;
    const container = finance.containerFor({
      agencyId: ctx.agencyId,
      storage: makePluginStorage(install.id) as never,
      install: install as never,
    });
    let invoice = await container.invoices.create({
      clientId,
      companyId: pack.companyId,
      dueAt: pack.dueAt,
      lineItems: pack.lineItems,
      taxCents: pack.taxCents,
      currency: pack.currency,
      notes: [
        `Created from opportunity invoice ${pack.invoiceNumber}.`,
        pack.notes,
        `Billing cadence: ${pack.billingCadence}.`,
      ].filter(Boolean).join("\n"),
    }, ctx.actor, pack.currency);
    await buildContainer(ctx).commercial.setFinanceInvoiceId(pack.partyKind, pack.partyId, invoice.id);
    if (pack.invoiceStatus !== "draft") {
      invoice = await container.invoices.update(invoice.id, { status: "sent" }, ctx.actor) ?? invoice;
    }
    for (const payment of pack.payments) {
      await container.payments.record(ctx.actor, {
        invoiceId: invoice.id,
        amountCents: payment.amountCents,
        currency: invoice.currency,
        method: payment.method === "other" ? "manual" : payment.method,
        paidAt: payment.paidAt,
        externalRef: payment.reference,
        notes: `Imported from opportunity payment ${payment.id}.`,
      });
    }
    return await buildContainer(ctx).commercial.get(pack.partyKind, pack.partyId);
  } catch {
    // Conversion remains available if finance is not installed or temporarily unavailable.
    return pack;
  }
}

function findExistingClientForContact(agencyId: string, contact: Contact) {
  return listClients(agencyId).find(client => clientMatchesContact(client, contact)) ?? null;
}

interface ClientConversionPackage {
  productId?: string;
  products?: PortalProductSelection[];
  servicePlan?: string;
  productKeys?: PortalProductKey[];
  projectValue?: string;
  billingCadence?: string;
  createPortal?: boolean;
  productConfiguration?: Record<string, unknown>;
}

function resolvedProductConversion(
  agencyId: string,
  conversion: ClientConversionPackage,
): ClientConversionPackage | null {
  if (!conversion.productId) return conversion;
  const allProducts = listAgencyProducts(agencyId);
  const selected = allProducts.find(product => product.id === conversion.productId);
  if (!selected) return null;
  const includedIds = new Set([selected.id, ...(selected.includedProductIds ?? [])]);
  const selectedProducts = allProducts.filter(product => includedIds.has(product.id));
  const products: PortalProductSelection[] = selectedProducts.map(product => ({
    id: product.id,
    name: product.name,
    description: product.description ?? "",
    deliverables: product.deliverables,
    buyerHeadline: product.buyerHeadline,
    coverImageUrl: product.coverImageUrl,
    accentColor: product.accentColor,
    portalHeadline: product.portalHeadline,
    portalWelcomeNote: product.portalWelcomeNote,
  }));
  const createPortal = selected.portalRequirement === "required"
    ? true
    : selected.portalRequirement === "none"
      ? false
      : conversion.createPortal !== false;
  const defaultCadence = selected.pricing === "recurring"
    ? selected.billingInterval === "quarter"
      ? "Quarterly"
      : selected.billingInterval === "year"
        ? "Yearly"
        : "Monthly"
    : selected.pricing === "fixed" || selected.pricing === "from"
      ? "Project"
      : "As agreed";

  return {
    ...conversion,
    servicePlan: selected.name,
    products,
    billingCadence: conversion.billingCadence?.trim() || defaultCadence,
    createPortal,
    productConfiguration: {
      agencyProductId: selected.id,
      productKind: selected.kind,
      productCategory: selected.category,
      productPricing: selected.pricing,
      productPriceCents: selected.priceCents,
      productBillingInterval: selected.billingInterval,
      productDepositPercent: selected.depositPercent,
      productTaxRatePercent: selected.taxRatePercent,
      productPaymentTermsDays: selected.paymentTermsDays,
      productBillingNotes: selected.billingNotes,
      productInternalInfo: selected.internalInfo,
      productContractTitle: selected.contractTitle,
      productContractBody: selected.contractBody,
      productSopIds: selected.sopIds,
      productSopCategories: selected.sopCategories,
      welcomePackItems: selected.welcomePackItems,
      welcomePackNotes: selected.welcomePackNotes,
      portalExperienceHeadline: selected.portalHeadline || selected.buyerHeadline,
      portalWelcomeNote: selected.portalWelcomeNote,
      portalAccentColor: selected.accentColor,
    },
  };
}

function clientJourneyMetadata(
  source: Lead | Contact,
  conversion: ClientConversionPackage = {},
  existingMetadata: Record<string, unknown> = {},
) {
  const clientName = source.company || source.name || source.email;
  const existingLinkedContacts = Array.isArray(existingMetadata.linkedContacts)
    ? existingMetadata.linkedContacts
    : [];
  const linkedContacts = existingLinkedContacts.length || (!source.name && !source.email)
    ? existingLinkedContacts
    : [{
        id: `contact_${source.id}`,
        name: source.name || source.email,
        email: source.email,
        phone: source.phone,
        role: source.company ? "Primary contact" : "Client",
        primary: true,
        createdAt: "capturedAt" in source ? source.capturedAt : source.createdAt,
        updatedAt: Date.now(),
      }];
  const existingProducts = cleanPortalProducts(existingMetadata.portalProducts);
  const existingProductKeys = existingProducts.flatMap(product =>
    product.catalogKey ? [product.catalogKey] : [],
  );
  const resolvedPlanTier = conversion.servicePlan?.trim()
    || (typeof existingMetadata.portalServicePlan === "string" ? existingMetadata.portalServicePlan.trim() : "")
    || "Milesymedia custom plan";
  const productKeys = conversion.productKeys?.length ? conversion.productKeys : existingProductKeys;
  const projectValue = conversion.projectValue?.trim()
    || (typeof existingMetadata.agreedProjectValue === "string" ? existingMetadata.agreedProjectValue.trim() : "");
  const billingCadence = conversion.billingCadence?.trim()
    || (typeof existingMetadata.portalBillingCadence === "string" ? existingMetadata.portalBillingCadence.trim() : "")
    || "As agreed";
  const initialPortalMetadata = existingMetadata.portalBuiltAt || conversion.createPortal === false
    ? {}
    : customerPortalProvisioningMetadata({
      clientName,
      contactName: source.name,
      email: source.email,
      servicePlan: resolvedPlanTier,
    });
  return {
    ...existingMetadata,
    leadId: "capturedAt" in source ? source.id : undefined,
    contactId: "createdAt" in source ? source.id : undefined,
    promotedFromLeadId: "promotedFromLeadId" in source ? source.promotedFromLeadId : undefined,
    leadSource: source.source,
    leadCapturedAt: "capturedAt" in source ? source.capturedAt : undefined,
    phone: source.phone,
    notes: source.notes,
    nextMeetingAt: source.nextMeetingAt,
    meetingLink: source.meetingLink,
    meetingNotes: source.meetingNotes,
    salesPresentations: source.salesPresentations,
    callRecordingUrl: source.callRecordingUrl,
    sessionNotes: source.sessionNotes,
    inspirationLinks: source.inspirationLinks,
    potentialProblems: source.potentialProblems,
    potentialSolutions: source.potentialSolutions,
    pricePoints: source.pricePoints,
    budgetRange: source.budgetRange,
    designFeedback: source.designFeedback,
    supportNotes: source.supportNotes,
    tags: source.tags,
    customFields: source.customFields,
    niche: typeof source.customFields?.niche === "string" ? source.customFields.niche : existingMetadata.niche,
    clientEntityType: source.company ? "company" : "person",
    linkedContacts,
    ...(conversion.productConfiguration ?? {}),
    ...initialPortalMetadata,
    ...clientDeliveryPackageMetadata({
      clientName,
      servicePlan: resolvedPlanTier,
      products: conversion.products,
      productKeys,
      projectValue,
      billingCadence,
      existingProperties: existingMetadata.properties,
    }),
    buyingJourney: {
      source: source.source,
      capturedAt: "capturedAt" in source ? source.capturedAt : undefined,
      meetingAt: source.nextMeetingAt,
      meetingLink: source.meetingLink,
      salesPresentations: source.salesPresentations,
      callRecordingUrl: source.callRecordingUrl,
      sessionNotes: source.sessionNotes,
      inspirationLinks: source.inspirationLinks ?? [],
      potentialProblems: source.potentialProblems,
      potentialSolutions: source.potentialSolutions,
      pricePoints: source.pricePoints,
      budgetRange: source.budgetRange,
      notes: source.notes,
    },
  };
}

async function readUploadedSheet(req: Request): Promise<{
  text: string;
  filename?: string;
  form?: FormData;
} | Response> {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("Choose a spreadsheet file.");
    let text: string;
    if (isExcelWorkbook(file.name, file.type)) {
      if (!isXlsxWorkbook(file.name, file.type)) {
        return badRequest("Old .xls workbooks are not supported yet. Save the sheet as .xlsx, CSV, or TSV and upload that file.");
      }
      text = parseXlsxToDelimitedText(await file.arrayBuffer());
    } else {
      text = await file.text();
    }
    return { text, filename: file.name, form };
  } catch (err) {
    return badRequest(`Could not read spreadsheet: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function cleanFieldDefinition(value: unknown): CustomFieldDefinition | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 80) : "";
  const type = typeof raw.type === "string" && CUSTOM_FIELD_TYPES.has(raw.type as CustomFieldType)
    ? raw.type as CustomFieldType
    : "text";
  if (!label) return null;
  const suppliedId = typeof raw.id === "string" ? raw.id : `field-${Date.now().toString(36)}`;
  const id = suppliedId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 80) || `field-${Date.now().toString(36)}`;
  const options = Array.isArray(raw.options)
    ? raw.options.filter((item): item is string => typeof item === "string").map(item => item.trim().slice(0, 80)).filter(Boolean).slice(0, 30)
    : [];
  return {
    id,
    label,
    type,
    options: Array.from(new Set(options)),
    formName: typeof raw.formName === "string" && raw.formName.trim() ? raw.formName.trim().slice(0, 80) : "Extra details",
    required: raw.required === true,
  };
}

function prepareCustomerPortalAccess(input: {
  email: string;
}) {
  return {
    email: input.email,
    created: false,
    linked: false,
    temporaryPassword: null,
    mustChangePassword: false,
    invitationRequired: true,
  };
}

// ─── Leads ───────────────────────────────────────────────────────────────

export async function listLeadsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const leads = await buildContainer(ctx).leads.list({
    query: url.searchParams.get("q") ?? undefined,
    tag: url.searchParams.get("tag") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
  });
  return json({ ok: true, leads });
}

export async function createLeadHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<CreateLeadInput>(req);
  if (!body || !body.email || !body.source) {
    return badRequest("email + source required.");
  }
  try {
    const result = await buildContainer(ctx).leads.upsert(body, ctx.actor);
    return json({ ok: true, lead: result.lead, created: result.created }, result.created ? 201 : 200);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateLeadHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id required.");
  const body = await safeJson<UpdateLeadPatch>(req);
  if (!body) return badRequest("body required.");
  const updated = await buildContainer(ctx).leads.update(id, body, ctx.actor);
  if (!updated) return notFound("lead_not_found");
  return json({ ok: true, lead: updated });
}

export async function updateLeadStatusHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id: string; columnId: string }>(req);
  if (!body?.id || !body.columnId) return badRequest("id + columnId required.");

  const c = buildContainer(ctx);
  const lead = await c.leads.get(body.id);
  if (!lead) return notFound("lead_not_found");

  const pipeline = getPipelineBySlug(ctx.agencyId, LEADS_PIPELINE_SLUG);
  if (!pipeline) return unprocessable("leads_pipeline_missing");
  const column = pipeline.columns.find(col => col.id === body.columnId || col.label === body.columnId);
  if (!column) return badRequest("unknown_column");

  let cardId = lead.pipelineCardId;
  if (!cardId) {
    const existing = listCardsByAgency(ctx.agencyId).find(card => {
      if (card.kind !== "lead" || card.pipelineId !== pipeline.id) return false;
      const snapshot = card.lead as unknown as { leadId?: string; email?: string };
      return snapshot.leadId === lead.id || snapshot.email === lead.email;
    });
    cardId = existing?.id;
  }

  if (!cardId) {
    const card = addCard(ctx.agencyId, pipeline.id, {
      kind: "lead",
      columnId: column.id,
      lead: {
        leadId: lead.id,
        email: lead.email,
        name: lead.name,
        company: lead.company,
        source: lead.source,
        capturedAt: lead.capturedAt,
      } as never,
    });
    if (!card) return unprocessable("could_not_create_pipeline_card");
    const updated = await c.leads.update(lead.id, { pipelineCardId: card.id }, ctx.actor);
    if (column.label.toLowerCase() === "won") await c.contacts.promoteLead(updated ?? lead, ctx.actor);
    return json({ ok: true, lead: updated ?? lead, card, columnId: column.id });
  }

  const moved = moveCard(ctx.agencyId, cardId, column.id);
  if (!moved) return unprocessable("could_not_move_card");
  const updated = lead.pipelineCardId === cardId
    ? lead
    : await c.leads.update(lead.id, { pipelineCardId: cardId }, ctx.actor);
  if (column.label.toLowerCase() === "won") await c.contacts.promoteLead(updated ?? lead, ctx.actor);
  return json({ ok: true, lead: updated ?? lead, card: moved.card, columnId: column.id });
}

async function ensureLeadBoardCard(ctx: PluginCtx, lead: Lead): Promise<{ lead: Lead; card?: unknown; columnId?: string }> {
  const c = buildContainer(ctx);
  const pipeline = getPipelineBySlug(ctx.agencyId, LEADS_PIPELINE_SLUG);
  if (!pipeline) throw new Error("leads_pipeline_missing");
  const firstColumn = pipeline.columns[0];
  if (!firstColumn) throw new Error("leads_pipeline_has_no_columns");

  let cardId = lead.pipelineCardId;
  if (!cardId) {
    const existing = listCardsByAgency(ctx.agencyId).find(card => {
      if (card.kind !== "lead" || card.pipelineId !== pipeline.id) return false;
      const snapshot = card.lead as unknown as { leadId?: string; email?: string };
      return snapshot.leadId === lead.id || snapshot.email === lead.email;
    });
    cardId = existing?.id;
  }

  if (cardId) {
    const updated = lead.pipelineCardId === cardId
      ? lead
      : await c.leads.update(lead.id, { pipelineCardId: cardId }, ctx.actor);
    return { lead: updated ?? lead, columnId: firstColumn.id };
  }

  const card = addCard(ctx.agencyId, pipeline.id, {
    kind: "lead",
    columnId: firstColumn.id,
    lead: {
      leadId: lead.id,
      email: lead.email,
      name: lead.name,
      company: lead.company,
      source: lead.source,
      capturedAt: lead.capturedAt,
    } as never,
  });
  if (!card) throw new Error("could_not_create_pipeline_card");
  const updated = await c.leads.update(lead.id, { pipelineCardId: card.id }, ctx.actor);
  return { lead: updated ?? lead, card, columnId: firstColumn.id };
}

export async function updateLeadMeetingHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{
    id: string;
    nextMeetingAt?: number | null;
    meetingLink?: string;
    meetingNotes?: string;
    meetingMode?: MeetingMode;
    meetingLocation?: string;
    meetingStatus?: MeetingStatus;
    meetingConfirmed?: boolean;
    meetingReminderAt?: number | null;
    salesPresentations?: Array<{ id?: string; title?: string; url?: string }>;
    attempt?: {
      channel?: MeetingAttemptChannel;
      outcome?: MeetingAttemptOutcome;
      notes?: string;
      at?: number;
    };
  }>(req);
  if (!body?.id) return badRequest("id required.");
  const service = buildContainer(ctx).leads;
  const existing = await service.get(body.id);
  if (!existing) return notFound("lead_not_found");
  const validModes: MeetingMode[] = ["google-meet", "phone", "in-person", "other"];
  const validStatuses: MeetingStatus[] = ["scheduled", "confirmed", "completed", "no-show", "cancelled", "rescheduled"];
  const validChannels: MeetingAttemptChannel[] = ["call", "email", "sms", "whatsapp", "in-person"];
  const validOutcomes: MeetingAttemptOutcome[] = ["attempted", "reached", "reminder-sent", "no-show", "rescheduled", "completed"];
  if (body.meetingMode && !validModes.includes(body.meetingMode)) return badRequest("invalid meeting mode");
  if (body.meetingStatus && !validStatuses.includes(body.meetingStatus)) return badRequest("invalid meeting status");
  const salesPresentations = body.salesPresentations === undefined
    ? undefined
    : cleanSalesPresentations(body.salesPresentations);
  if (salesPresentations === null) {
    return badRequest("Sales presentations need a title and a valid http or https link.");
  }

  const attempts = [...(existing.meetingAttempts ?? [])];
  if (body.attempt?.outcome) {
    const channel = body.attempt.channel;
    const outcome = body.attempt.outcome;
    if (!channel || !validChannels.includes(channel) || !validOutcomes.includes(outcome)) {
      return badRequest("valid attempt channel and outcome required");
    }
    attempts.push({
      id: `attempt_${randomUUID()}`,
      at: typeof body.attempt.at === "number" ? body.attempt.at : Date.now(),
      channel,
      outcome,
      notes: body.attempt.notes?.trim() || undefined,
    });
  }
  const patch: UpdateLeadPatch = {
    nextMeetingAt: typeof body.nextMeetingAt === "number" ? body.nextMeetingAt : undefined,
    meetingLink: body.meetingLink?.trim() || undefined,
    meetingNotes: body.meetingNotes?.trim() || undefined,
    meetingMode: body.meetingMode,
    meetingLocation: body.meetingLocation?.trim() || undefined,
    meetingStatus: body.meetingStatus,
    meetingConfirmedAt: body.meetingConfirmed ? existing.meetingConfirmedAt ?? Date.now() : undefined,
    meetingReminderAt: typeof body.meetingReminderAt === "number" ? body.meetingReminderAt : undefined,
    meetingReminderSentAt: body.attempt?.outcome === "reminder-sent"
      ? Date.now()
      : existing.meetingReminderSentAt,
    meetingAttempts: attempts,
  };
  if (salesPresentations !== undefined) patch.salesPresentations = salesPresentations;
  if (body.nextMeetingAt === null) patch.nextMeetingAt = undefined;
  if (body.meetingReminderAt === null) patch.meetingReminderAt = undefined;
  const updated = await service.update(body.id, patch, ctx.actor);
  if (!updated) return notFound("lead_not_found");
  return json({ ok: true, lead: updated });
}

export async function markLeadContactedHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id: string; contactedAt?: number }>(req);
  if (!body?.id) return badRequest("id required.");
  const contactedAt = typeof body.contactedAt === "number" ? body.contactedAt : Date.now();
  const updated = await buildContainer(ctx).leads.update(body.id, { lastContactedAt: contactedAt }, ctx.actor);
  if (!updated) return notFound("lead_not_found");
  return json({ ok: true, lead: updated });
}

export async function convertLeadToClientHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{
    id: string;
    stage?: string;
    planTier?: string;
    servicePlan?: string;
    productId?: string;
    productKeys?: PortalProductKey[];
    projectValue?: string;
    billingCadence?: string;
    createPortal?: boolean;
  }>(req);
  if (!body?.id) return badRequest("id required.");

  const c = buildContainer(ctx);
  const lead = await c.leads.get(body.id);
  if (!lead) return notFound("lead_not_found");

  const beforeConvert = structuredClone(getState());
  const existingClient = findExistingClientForLead(ctx.agencyId, lead);
  const conversion = resolvedProductConversion(ctx.agencyId, {
    ...body,
    servicePlan: body.servicePlan ?? body.planTier,
  });
  if (!conversion) return badRequest("product_not_found");
  const commercialPack = await c.commercial.get("lead", lead.id);
  const metadata = {
    ...clientJourneyMetadata(lead, conversion, (existingClient?.metadata ?? {}) as Record<string, unknown>),
    commercialPack: commercialPack ?? undefined,
  };
  const client = existingClient
    ? updateClient(ctx.agencyId, existingClient.id, { metadata }) ?? existingClient
    : createClient(ctx.agencyId, {
    companyId: lead.companyId ?? lead.companyIds?.[0],
    name: lead.company || lead.name || lead.email,
    ownerEmail: lead.email,
    stage: (body.stage ?? "aqua-epic-intro") as never,
    metadata,
  });
  const syncedCommercialPack = await syncCommercialPackToClientFinance(ctx, commercialPack, client.id);
  if (syncedCommercialPack) {
    updateClient(ctx.agencyId, client.id, {
      metadata: { ...(client.metadata as Record<string, unknown>), commercialPack: syncedCommercialPack },
    });
  }

  await c.contacts.promoteLead(lead, ctx.actor);
  await c.leads.update(
    lead.id,
    { tags: Array.from(new Set([...lead.tags, "converted"])), notes: lead.notes },
    ctx.actor,
  );

  const pipeline = getPipelineBySlug(ctx.agencyId, LEADS_PIPELINE_SLUG);
  const won = pipeline?.columns.find(col => col.id === "won" || col.label.toLowerCase() === "won");
  if (pipeline && won) {
    let cardId = lead.pipelineCardId;
    if (!cardId) {
      const card = addCard(ctx.agencyId, pipeline.id, {
        kind: "lead",
        columnId: won.id,
        lead: {
          leadId: lead.id,
          email: lead.email,
          name: lead.name,
          company: lead.company,
          source: lead.source,
          capturedAt: lead.capturedAt,
        } as never,
      });
      cardId = card?.id;
    }
    if (cardId) moveCard(ctx.agencyId, cardId, won.id);
  }

  const portalLogin = conversion.createPortal === false ? undefined : prepareCustomerPortalAccess({
    email: lead.email,
  });

  const portalSetup = conversion.createPortal === false
    ? { ok: true as const, skipped: true as const }
    : await setupClientStarterPortal({
      agencyId: ctx.agencyId,
      clientId: client.id,
      actor: ctx.actor,
      metadata: {
        phase: "Epic Intro",
        planTier: String(conversion.servicePlan ?? "Milesymedia product"),
        therapistName: lead.name,
        practiceName: lead.company,
        onboardingStartedAt: new Date().toISOString().slice(0, 10),
      },
    });
  if (!portalSetup.ok) {
    restorePortalState(beforeConvert);
    return json({ ok: false, error: `client portal setup failed: ${portalSetup.error}`, portalSetup }, 500);
  }

  return json({
    ok: true,
    client,
    clientCreated: !existingClient,
    portalSetup,
    portalLogin,
  }, existingClient ? 200 : 201);
}

export async function archiveLeadHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  const ok = await buildContainer(ctx).leads.delete(body.id, ctx.actor);
  if (!ok) return notFound("lead_not_found");
  return json({ ok: true });
}

// ─── CSV import ──────────────────────────────────────────────────────────
//
// Accepts multipart `file` field OR a JSON `{text, filename?}` body.
// Multipart is the documented v1 path; JSON exists so smoke + e2e
// don't need to construct multipart bodies in tests.

export async function previewCsvHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const uploaded = await readUploadedSheet(req);
  if (uploaded instanceof Response) return uploaded;
  const parsed = parseCsv(uploaded.text);
  const customFields = (await ctx.storage.get<CustomFieldDefinition[]>(CUSTOM_FIELDS_KEY)) ?? [];
  const guessedMapping = Object.fromEntries(Object.entries(parsed.headerVariants).map(([target, index]) => [String(index), target]));
  return json({
    ok: true,
    filename: uploaded.filename,
    headers: parsed.headers,
    rowCount: parsed.rows.length,
    samples: parsed.rows.slice(0, 4).map(row => row.raw),
    guessedMapping,
    customFields,
  });
}

export async function importCsvHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const contentType = req.headers.get("content-type") ?? "";
  let text: string | null = null;
  let filename: string | undefined;
  let defaultSource: string | undefined;
  let defaultTags: string[] | undefined;
  let mapping: Record<string, string> | undefined;

  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await req.formData();
      const file = form.get("file");
      if (file instanceof File) {
        if (isExcelWorkbook(file.name, file.type)) {
          if (!isXlsxWorkbook(file.name, file.type)) {
            return badRequest("Old .xls workbooks are not supported yet. Save the sheet as .xlsx, CSV, or TSV and upload that file.");
          }
          text = parseXlsxToDelimitedText(await file.arrayBuffer());
        } else {
          text = await file.text();
        }
        filename = file.name;
      } else if (typeof file === "string") {
        text = file;
      }
      const ds = form.get("defaultSource");
      if (typeof ds === "string") defaultSource = ds;
      const dt = form.get("defaultTags");
      if (typeof dt === "string") defaultTags = dt.split(",").map(t => t.trim()).filter(Boolean);
      const rawMapping = form.get("mapping");
      if (typeof rawMapping === "string" && rawMapping.trim()) {
        try {
          mapping = JSON.parse(rawMapping) as Record<string, string>;
        } catch {
          return badRequest("Column mapping is not valid.");
        }
      }
    } catch (err) {
      return badRequest(`multipart parse failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    const body = await safeJson<{ text: string; filename?: string; defaultSource?: string; defaultTags?: string[]; mapping?: Record<string, string> }>(req);
    if (!body?.text) return badRequest("text or multipart file required.");
    text = body.text;
    filename = body.filename;
    defaultSource = body.defaultSource;
    defaultTags = body.defaultTags;
    mapping = body.mapping;
  }
  if (!text) return badRequest("empty CSV body.");
  if (mapping) {
    const targets = Object.values(mapping).filter(target => target && target !== "skip");
    if (new Set(targets).size !== targets.length) {
      return badRequest("Each spreadsheet column must map to a different contact field.");
    }
  }
  const customFields = (await ctx.storage.get<CustomFieldDefinition[]>(CUSTOM_FIELDS_KEY)) ?? [];
  const result = await buildContainer(ctx).leads.importCsv({
    text,
    filename,
    actor: ctx.actor,
    defaultSource,
    defaultTags,
    mapping,
    customFieldTypes: Object.fromEntries(customFields.map(field => [field.id, field.type])),
  });
  return json({ ok: true, ...result });
}

export async function contactConfigurationHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method === "GET") {
    const [customFields, customTags] = await Promise.all([
      ctx.storage.get<CustomFieldDefinition[]>(CUSTOM_FIELDS_KEY),
      ctx.storage.get<string[]>(CUSTOM_TAGS_KEY),
    ]);
    return json({ ok: true, customFields: customFields ?? [], customTags: customTags ?? [] });
  }
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{
    action?: string;
    field?: unknown;
    fieldId?: string;
    tag?: string;
    tagName?: string;
  }>(req);
  if (!body?.action) return badRequest("action required.");
  const fields = (await ctx.storage.get<CustomFieldDefinition[]>(CUSTOM_FIELDS_KEY)) ?? [];
  const tags = (await ctx.storage.get<string[]>(CUSTOM_TAGS_KEY)) ?? [];

  if (body.action === "save-field") {
    const field = cleanFieldDefinition(body.field);
    if (!field) return badRequest("Field name required.");
    const next = [...fields.filter(item => item.id !== field.id), field].sort((a, b) =>
      a.formName.localeCompare(b.formName) || a.label.localeCompare(b.label)
    );
    await ctx.storage.set(CUSTOM_FIELDS_KEY, next);
    return json({ ok: true, customFields: next, customTags: tags });
  }
  if (body.action === "delete-field") {
    const fieldId = body.fieldId?.trim();
    if (!fieldId) return badRequest("fieldId required.");
    const next = fields.filter(item => item.id !== fieldId);
    await ctx.storage.set(CUSTOM_FIELDS_KEY, next);
    return json({ ok: true, customFields: next, customTags: tags });
  }
  if (body.action === "add-tag") {
    const tag = body.tag?.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 60);
    if (!tag) return badRequest("Tag name required.");
    const next = Array.from(new Set([...tags, tag])).sort((a, b) => a.localeCompare(b));
    await ctx.storage.set(CUSTOM_TAGS_KEY, next);
    return json({ ok: true, customFields: fields, customTags: next });
  }
  if (body.action === "delete-tag") {
    const tagName = body.tagName?.trim();
    const next = tags.filter(tag => tag !== tagName);
    await ctx.storage.set(CUSTOM_TAGS_KEY, next);
    return json({ ok: true, customFields: fields, customTags: next });
  }
  return badRequest("Unknown configuration action.");
}

// ─── Contacts ────────────────────────────────────────────────────────────

export async function listContactsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const contacts = await buildContainer(ctx).contacts.list({
    query: url.searchParams.get("q") ?? undefined,
    type: (url.searchParams.get("type") ?? undefined) as Contact["type"] | undefined,
    tag: url.searchParams.get("tag") ?? undefined,
  });
  return json({ ok: true, contacts });
}

export async function createContactHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<CreateContactInput>(req);
  if (!body || !body.email || !body.type || !body.source) {
    return badRequest("email + type + source required.");
  }
  const result = await buildContainer(ctx).contacts.upsert(body, ctx.actor);
  return json({ ok: true, contact: result.contact, created: result.created }, result.created ? 201 : 200);
}

export async function updateContactHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id required.");
  const body = await safeJson<UpdateContactPatch>(req);
  if (!body) return badRequest("body required.");
  const updated = await buildContainer(ctx).contacts.update(id, body, ctx.actor);
  if (!updated) return notFound("contact_not_found");
  return json({ ok: true, contact: updated });
}

export async function convertContactToClientHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{
    id: string;
    stage?: string;
    planTier?: string;
    servicePlan?: string;
    productId?: string;
    productKeys?: PortalProductKey[];
    projectValue?: string;
    billingCadence?: string;
    createPortal?: boolean;
  }>(req);
  if (!body?.id) return badRequest("id required.");

  const c = buildContainer(ctx);
  const contact = await c.contacts.get(body.id);
  if (!contact) return notFound("contact_not_found");

  const beforeConvert = structuredClone(getState());
  const existingClient = findExistingClientForContact(ctx.agencyId, contact);
  const conversion = resolvedProductConversion(ctx.agencyId, {
    ...body,
    servicePlan: body.servicePlan ?? body.planTier,
  });
  if (!conversion) return badRequest("product_not_found");
  const commercialPack = await c.commercial.get("contact", contact.id);
  const metadata = {
    ...clientJourneyMetadata(contact, conversion, (existingClient?.metadata ?? {}) as Record<string, unknown>),
    commercialPack: commercialPack ?? undefined,
  };
  const client = existingClient
    ? updateClient(ctx.agencyId, existingClient.id, { metadata }) ?? existingClient
    : createClient(ctx.agencyId, {
    name: contact.company || contact.name || contact.email,
    ownerEmail: contact.email,
    stage: (body.stage ?? "aqua-epic-intro") as never,
    metadata,
  });
  const syncedCommercialPack = await syncCommercialPackToClientFinance(ctx, commercialPack, client.id);
  if (syncedCommercialPack) {
    updateClient(ctx.agencyId, client.id, {
      metadata: { ...(client.metadata as Record<string, unknown>), commercialPack: syncedCommercialPack },
    });
  }

  const convertedContact = await c.contacts.update(contact.id, {
    type: "customer",
    tags: Array.from(new Set([...contact.tags, "converted"])),
    lastContactedAt: contact.lastContactedAt ?? Date.now(),
  }, ctx.actor);

  const portalLogin = conversion.createPortal === false ? undefined : prepareCustomerPortalAccess({
    email: contact.email,
  });

  const portalSetup = conversion.createPortal === false
    ? { ok: true as const, skipped: true as const }
    : await setupClientStarterPortal({
      agencyId: ctx.agencyId,
      clientId: client.id,
      actor: ctx.actor,
      metadata: {
        phase: "Epic Intro",
        planTier: String(conversion.servicePlan ?? "Milesymedia product"),
        therapistName: contact.name,
        practiceName: contact.company,
        onboardingStartedAt: new Date().toISOString().slice(0, 10),
      },
    });
  if (!portalSetup.ok) {
    restorePortalState(beforeConvert);
    return json({ ok: false, error: `client portal setup failed: ${portalSetup.error}`, portalSetup }, 500);
  }

  return json({
    ok: true,
    client,
    clientCreated: !existingClient,
    contact: convertedContact ?? contact,
    portalSetup,
    portalLogin,
  }, existingClient ? 200 : 201);
}

export async function addContactToBoardHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");

  try {
    const c = buildContainer(ctx);
    const contact = await c.contacts.get(body.id);
    if (!contact) return notFound("contact_not_found");
    if (contact.type === "customer") return unprocessable("customer_already_converted");

    const result = await c.leads.upsert({
      email: contact.email,
      name: contact.name,
      phone: contact.phone,
      company: contact.company,
      tags: Array.from(new Set([...contact.tags, "manual-contact"])),
      source: contact.source || "manual-contact",
      notes: contact.notes,
      customFields: contact.customFields,
    }, ctx.actor);
    const leadWithMeeting = contact.nextMeetingAt || contact.meetingNotes || contact.salesPresentations?.length
      ? await c.leads.update(result.lead.id, {
          nextMeetingAt: contact.nextMeetingAt,
          meetingLink: contact.meetingLink,
          meetingNotes: contact.meetingNotes,
          salesPresentations: contact.salesPresentations,
        }, ctx.actor)
      : result.lead;
    const board = await ensureLeadBoardCard(ctx, leadWithMeeting ?? result.lead);
    return json({ ok: true, lead: board.lead, created: result.created, columnId: board.columnId });
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateContactMeetingHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id: string; nextMeetingAt?: number | null; meetingLink?: string; meetingNotes?: string; salesPresentations?: Array<{ id?: string; title?: string; url?: string }> }>(req);
  if (!body?.id) return badRequest("id required.");
  const salesPresentations = body.salesPresentations === undefined
    ? undefined
    : cleanSalesPresentations(body.salesPresentations);
  if (salesPresentations === null) {
    return badRequest("Sales presentations need a title and a valid http or https link.");
  }
  const patch: UpdateContactPatch = {
    nextMeetingAt: typeof body.nextMeetingAt === "number" ? body.nextMeetingAt : undefined,
    meetingLink: body.meetingLink?.trim() || undefined,
    meetingNotes: body.meetingNotes?.trim() || undefined,
  };
  if (salesPresentations !== undefined) patch.salesPresentations = salesPresentations;
  const updated = await buildContainer(ctx).contacts.update(body.id, patch, ctx.actor);
  if (!updated) return notFound("contact_not_found");
  return json({ ok: true, contact: updated });
}

export async function markContactContactedHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id: string; contactedAt?: number }>(req);
  if (!body?.id) return badRequest("id required.");
  const contactedAt = typeof body.contactedAt === "number" ? body.contactedAt : Date.now();
  const updated = await buildContainer(ctx).contacts.update(body.id, { lastContactedAt: contactedAt }, ctx.actor);
  if (!updated) return notFound("contact_not_found");
  return json({ ok: true, contact: updated });
}

// ─── Campaigns ───────────────────────────────────────────────────────────

export async function listCampaignsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const campaigns = await buildContainer(ctx).campaigns.list();
  return json({ ok: true, campaigns });
}

export async function createCampaignHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<CreateCampaignInput>(req);
  if (!body || !body.name) {
    return badRequest("name required.");
  }
  if ((body.channel ?? "email") === "email" && (!body.subject || !body.bodyHtml)) {
    return badRequest("Email campaigns require subject + bodyHtml.");
  }
  if (!body.audienceFilter) {
    return badRequest("audienceFilter required (at minimum {}).");
  }
  try {
    const c = await buildContainer(ctx).campaigns.create(body, ctx.actor);
    return json({ ok: true, campaign: c }, 201);
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function updateCampaignHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id required.");
  const body = await safeJson<UpdateCampaignPatch>(req);
  if (!body) return badRequest("body required.");
  try {
    const c = await buildContainer(ctx).campaigns.update(id, body, ctx.actor);
    if (!c) return notFound("campaign_not_found");
    return json({ ok: true, campaign: c });
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function sendCampaignHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const c = await buildContainer(ctx).campaigns.send(body.id, ctx.actor);
    return json({ ok: true, campaign: c });
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function previewAudienceHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<AudienceFilter>(req);
  if (!body) return badRequest("audienceFilter body required.");
  const audience = await buildContainer(ctx).leads.resolveAudience(body);
  return json({ ok: true, count: audience.length, leads: audience });
}
