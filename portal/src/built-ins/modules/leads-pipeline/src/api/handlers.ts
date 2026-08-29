// HTTP handlers for the leads-pipeline plugin.
//
// Mirrors the agency-hr convention: 200 on success with `{ ok: true,
// ...payload }`, 400 on validation, 404 on missing, 422 on business
// rule violation.

import type { PluginCtx } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { addCard, getPipelineBySlug, listCardsByAgency, moveCard } from "@/server/pipelines";
import { createClient, getClientForAgency, listClients, updateClient } from "@/server/tenants";
import { setupClientStarterPortal } from "@/server/clientPortalSetup";
import {
  clientDeliveryPackageMetadata,
  customerPortalProvisioningMetadata,
} from "@/lib/server/clients/customerPortalProvisioning";
import { cleanPortalProducts, type PortalProductKey, type PortalProductSelection } from "@/lib/portal/portalProducts";
import { resolveAgencyProductAssignment } from "@/lib/products/productAssignments";
import { listAgencyProducts } from "@/server/agencyProducts";
import { clientMatchesContact, clientMatchesLead } from "../lib/clientMatch";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { parseXlsxToDelimitedText } from "../server/csv";
import { isoDateTimeValue } from "../lib/safeDate";
import { businessCalendarDate } from "@/lib/shared/formatDateTime";
import { parseCsv } from "../server/csv";
import type { PortalFormFieldDefinition } from "@/server/types";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { resolveIntegrationValues } from "@/lib/server/integrations/integrationConnections";
import { stripeHttpRequest } from "@/lib/server/integrations/stripeHttp";
import { recordWebsiteEnquiryResponse } from "@/lib/server/websiteEnquiries";
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
  LeadRelationshipCategory,
  MeetingAttemptChannel,
  MeetingAttemptOutcome,
  MeetingMode,
  MeetingStatus,
  ProspectInspectionCheck,
  ProspectOutreachChannel,
  ProspectOutreachOutcome,
  RecordProspectOutreachInput,
  ResolveProspectFollowUpInput,
  SalesPresentation,
  ScheduleProspectFollowUpInput,
  SaveCommercialPackInput,
  UpdateContactPatch,
  UpdateCampaignPatch,
  UpdateLeadPatch,
  UpdateProspectPatch,
} from "../lib/domain";
import { LeadIdentityConflictError } from "../server/leads";
import { CommercialPaymentConflictError } from "../server/commercial";
import { isLeadRelationshipCategory } from "../lib/domain";
import { REQUIRED_PROSPECT_INSPECTION_CHECKS } from "../server/prospects";
import { getPortalFormFields, validatePortalEntityFields } from "@/server/portalEditor";
import { validatePortalFormValues } from "@/lib/forms/portalFormValues";
import {
  acquireLeadConversion,
  leadConversionClaimKey,
  leadConversionCoordinator,
  leadConversionHolderId,
  leadConversionRequestHash,
  type LeadConversionClaimInput,
  type LeadConversionCoordinator,
} from "@/server/leadConversionCoordinator";
import { ensureClientLifecycleOperation } from "@/lib/server/clients/clientLifecycle";

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
const PROSPECT_OUTREACH_CHANNELS = new Set<ProspectOutreachChannel>(["call", "email", "sms", "whatsapp", "dm", "in-person"]);
const PROSPECT_OUTREACH_OUTCOMES = new Set<ProspectOutreachOutcome>(["attempted", "no-answer", "left-message", "sent", "replied", "interested", "not-now", "not-fit", "wrong-contact", "meeting-booked"]);

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

export async function importProspectsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const uploaded = await readUploadedSheet(req);
  if (uploaded instanceof Response) return uploaded;
  const parsed = parseCsv(uploaded.text);
  if (!parsed.rows.length) return badRequest("The scouting sheet contains no data rows.");
  if (parsed.rows.length > 500) return badRequest("Import up to 500 scouting prospects at a time.");
  const defaultSourceValue = uploaded.form?.get("defaultSource");
  const defaultSource = typeof defaultSourceValue === "string" && defaultSourceValue.trim()
    ? defaultSourceValue.trim()
    : "google-maps";
  const service = buildContainer(ctx).prospects;
  const existing = await service.list();
  const fingerprints = new Set(existing.flatMap(prospectFingerprints));
  const imported: string[] = [];
  const skipped: Array<{ rowNumber: number; reason: string }> = [];

  for (const row of parsed.rows) {
    const input: CreateProspectInput = {
      company: row.company,
      name: row.name,
      email: row.email,
      phone: row.phone,
      website: row.website,
      address: row.address,
      googleMapsUrl: row.googleMapsUrl,
      niche: row.niche,
      tags: row.tags,
      source: row.source || defaultSource,
      researchNotes: row.notes,
      qualificationState: row.notes ? "researching" : "unreviewed",
    };
    if (!input.company && !input.name && !input.website) {
      skipped.push({ rowNumber: row.rowNumber, reason: "Missing business name, person, or website." });
      continue;
    }
    const rowFingerprints = prospectFingerprints(input);
    if (rowFingerprints.some(key => fingerprints.has(key))) {
      skipped.push({ rowNumber: row.rowNumber, reason: "Duplicate of an existing scouting dossier." });
      continue;
    }
    try {
      const prospect = await service.create(input, ctx.actor);
      imported.push(prospect.id);
      rowFingerprints.forEach(key => fingerprints.add(key));
    } catch (error) {
      skipped.push({ rowNumber: row.rowNumber, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return json({
    ok: true,
    filename: uploaded.filename,
    imported: imported.length,
    skipped,
    unrecognisedHeaders: parsed.unrecognisedHeaders,
  });
}

function prospectFingerprints(prospect: Pick<CreateProspectInput, "company" | "name" | "email" | "phone" | "website" | "address" | "googleMapsUrl">): string[] {
  const normalized = (value?: string) => value?.trim().toLowerCase().replace(/\/$/, "");
  return [
    prospect.email ? `email:${normalized(prospect.email)}` : "",
    prospect.phone ? `phone:${prospect.phone.replace(/[^0-9+]/g, "")}` : "",
    prospect.website ? `website:${normalized(prospect.website)}` : "",
    prospect.googleMapsUrl ? `maps:${normalized(prospect.googleMapsUrl)}` : "",
    prospect.company && prospect.address ? `place:${normalized(prospect.company)}:${normalized(prospect.address)}` : "",
    !prospect.company && prospect.name && prospect.address ? `person:${normalized(prospect.name)}:${normalized(prospect.address)}` : "",
  ].filter(Boolean);
}

export async function qualifyProspectHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  const c = buildContainer(ctx);
  const prospect = await c.prospects.get(body.id);
  if (!prospect || prospect.status !== "scouting") return notFound("active_prospect_not_found");
  if (!prospect.email && !prospect.phone) {
    return unprocessable("Add an email address or phone number before qualifying this prospect as a lead.");
  }
  if (prospect.doNotContact) return unprocessable("Remove the do-not-contact hold before qualifying this prospect.");
  const missingInspection = REQUIRED_PROSPECT_INSPECTION_CHECKS.filter(check => !prospect.inspectionChecks.includes(check));
  if (!prospect.inspectedAt || missingInspection.length) {
    return unprocessable("Complete the business, contact-route, and opportunity inspection before qualifying this prospect.");
  }
  const outreachHistory = prospect.outreachAttempts.map(attempt => {
    const followUp = attempt.followUpAt ? ` · follow-up ${isoDateTimeValue(attempt.followUpAt) ?? "date needs review"}` : "";
    return `${isoDateTimeValue(attempt.at) ?? "date needs review"} · ${attempt.channel} · ${attempt.outcome}${followUp}${attempt.note ? ` · ${attempt.note}` : ""}`;
  }).join("\n");
  const fieldNotes = prospect.notes.map(note => `${isoDateTimeValue(note.at) ?? "date needs review"} · ${note.body}`).join("\n");
  const followUpHistory = prospect.followUps.map(item => `${isoDateTimeValue(item.dueAt) ?? "date needs review"} · ${item.status} · ${item.channel ?? "any channel"} · ${item.reason}${item.resolutionNote ? ` · ${item.resolutionNote}` : ""}`).join("\n");
  const scoutingNotes = [
    prospect.opportunity ? `Why we could help: ${prospect.opportunity}` : "",
    prospect.researchNotes ? `Scouting research: ${prospect.researchNotes}` : "",
    prospect.nextStep ? `Suggested next step: ${prospect.nextStep}` : "",
    prospect.foundAt ? `Found at: ${prospect.foundAt}` : "",
    prospect.address ? `Address: ${prospect.address}` : "",
    prospect.website ? `Website: ${prospect.website}` : "",
    outreachHistory ? `Cold outreach history:\n${outreachHistory}` : "",
    followUpHistory ? `Follow-up history:\n${followUpHistory}` : "",
    fieldNotes ? `Scouting notes:\n${fieldNotes}` : "",
  ].filter(Boolean).join("\n\n");
  try {
    const result = await c.leads.upsert({
      email: prospect.email ?? "",
      name: prospect.name,
      phone: prospect.phone,
      company: prospect.company,
      source: `scouting:${prospect.source}`,
      relationshipCategory: "cold-outreach",
      tags: [
        "scouted",
        ...prospect.tags,
        ...(prospect.preferredChannel ? [`preferred:${prospect.preferredChannel}`] : []),
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
        ...(prospect.address ? { "scouting-address": prospect.address } : {}),
        ...(prospect.googleMapsUrl ? { "scouting-google-maps": prospect.googleMapsUrl } : {}),
        ...(prospect.instagramUrl ? { "scouting-instagram": prospect.instagramUrl } : {}),
        ...(prospect.facebookUrl ? { "scouting-facebook": prospect.facebookUrl } : {}),
        ...(prospect.linkedinUrl ? { "scouting-linkedin": prospect.linkedinUrl } : {}),
        ...(prospect.fitScore !== undefined ? { "scouting-fit-score": String(prospect.fitScore) } : {}),
        "scouting-qualification-state": prospect.qualificationState,
        "scouting-inspection-checks": prospect.inspectionChecks.join(","),
        ...(isoDateTimeValue(prospect.inspectedAt) ? { "scouting-inspected-at": isoDateTimeValue(prospect.inspectedAt)! } : {}),
        ...(prospect.preferredChannel ? { "scouting-preferred-channel": prospect.preferredChannel } : {}),
        ...(isoDateTimeValue(prospect.lastContactedAt) ? { "scouting-last-contacted-at": isoDateTimeValue(prospect.lastContactedAt)! } : {}),
        ...(isoDateTimeValue(prospect.nextContactAt) ? { "scouting-next-contact-at": isoDateTimeValue(prospect.nextContactAt)! } : {}),
        ...(prospect.nextContactReason ? { "scouting-next-contact-reason": prospect.nextContactReason } : {}),
        "scouting-outreach-attempts": String(prospect.outreachAttempts.length),
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

export async function prospectOutreachHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<RecordProspectOutreachInput & { id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  if (!PROSPECT_OUTREACH_CHANNELS.has(body.channel)) return badRequest("valid channel required.");
  if (!PROSPECT_OUTREACH_OUTCOMES.has(body.outcome)) return badRequest("valid outcome required.");
  try {
    const prospect = await buildContainer(ctx).prospects.recordOutreach(body.id, body, ctx.actor);
    return prospect ? json({ ok: true, prospect }) : notFound("prospect_not_found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function prospectNotesHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id: string; body: string }>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    const prospect = await buildContainer(ctx).prospects.addNote(body.id, body.body, ctx.actor);
    return prospect ? json({ ok: true, prospect }) : notFound("prospect_not_found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function prospectInspectionHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id: string; checks: ProspectInspectionCheck[] }>(req);
  if (!body?.id || !Array.isArray(body.checks)) return badRequest("id and checks required.");
  try {
    const prospect = await buildContainer(ctx).prospects.saveInspection(body.id, body.checks, ctx.actor);
    return prospect ? json({ ok: true, prospect }) : notFound("prospect_not_found");
  } catch (err) {
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function prospectFollowUpsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const body = await safeJson<({ id: string } & ScheduleProspectFollowUpInput) | ({ id: string } & ResolveProspectFollowUpInput)>(req);
  if (!body?.id) return badRequest("id required.");
  try {
    if (req.method === "POST") {
      const schedule = body as { id: string } & ScheduleProspectFollowUpInput;
      if (!PROSPECT_OUTREACH_CHANNELS.has(schedule.channel as ProspectOutreachChannel)) return badRequest("valid channel required.");
      const prospect = await buildContainer(ctx).prospects.scheduleFollowUp(schedule.id, schedule, ctx.actor);
      return prospect ? json({ ok: true, prospect }) : notFound("prospect_not_found");
    }
    if (req.method === "PATCH") {
      const resolution = body as { id: string } & ResolveProspectFollowUpInput;
      if (!resolution.followUpId || !["completed", "skipped"].includes(resolution.status)) return badRequest("valid follow-up resolution required.");
      const prospect = await buildContainer(ctx).prospects.resolveFollowUp(resolution.id, resolution, ctx.actor);
      return prospect ? json({ ok: true, prospect }) : notFound("prospect_not_found");
    }
    return json({ ok: false, error: "method_not_allowed" }, 405);
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
    if (err instanceof CommercialPaymentConflictError) {
      return json({ ok: false, error: "payment_reference_conflict", message: err.message }, 409);
    }
    return unprocessable(err instanceof Error ? err.message : String(err));
  }
}

export async function createCommercialStripeCheckoutHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  const body = await safeJson<{ partyKind: CommercialPartyKind; partyId: string }>(req);
  if (!body?.partyId || !body.partyKind) return badRequest("partyKind + partyId required.");
  const stripe = resolveIntegrationValues(ctx.agencyId, "stripe");
  const secret = stripe.secretKey;
  if (!secret) return unprocessable("Stripe is not connected. Open Company → Connections and connect it there.");
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
    const idempotencyKey = `commercial-checkout:${createHash("sha256")
      .update(`${ctx.agencyId}\u0000${pack.id}\u0000${params.toString()}`)
      .digest("hex")}`;
    const response = await stripeHttpRequest<{ id?: string; url?: string; error?: { message?: string } }>({
      secretKey: secret,
      path: "/v1/checkout/sessions",
      method: "POST",
      form: params,
      idempotencyKey,
      outcome: "idempotent-write",
      signal: req.signal,
    });
    const checkout = response.body;
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
    try {
      const response = await stripeHttpRequest<{ metadata?: Record<string, string> }>({
        secretKey: stripe.secretKey,
        path: `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
        outcome: "read",
        signal: req.signal,
      });
      if (response.ok) metadata = response.body.metadata ?? metadata;
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : "Stripe subscription lookup failed." }, 503);
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
    try {
      const cancellation = await stripeHttpRequest<{ error?: { message?: string } }>({
        secretKey: stripe.secretKey,
        path: `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
        method: "POST",
        form: new URLSearchParams({ cancel_at_period_end: "true" }),
        idempotencyKey: `commercial-installments-complete:${ctx.agencyId}:${pack.id}:${subscriptionId}`,
        outcome: "idempotent-write",
        signal: req.signal,
      });
      if (!cancellation.ok) {
        return json({ ok: false, error: cancellation.body.error?.message ?? `Stripe returned ${cancellation.status}.` }, 502);
      }
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : "Stripe subscription update failed." }, 503);
    }
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
  conversionKey: string,
): Promise<CommercialPack | null> {
  if (!pack) return null;
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
    let invoice = pack.financeInvoiceId
      ? await container.invoices.get(pack.financeInvoiceId)
      : null;
    if (!invoice) {
      invoice = await container.invoices.create({
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
        idempotencyKey: `lead-conversion:${conversionKey}:invoice:${pack.id}`,
      }, ctx.actor, pack.currency);
    }
    if (pack.financeInvoiceId !== invoice.id) {
      await buildContainer(ctx).commercial.setFinanceInvoiceId(pack.partyKind, pack.partyId, invoice.id);
    }
    // Imported payments cannot be attached to a draft finance invoice. A
    // commercial pack carrying real payment evidence is collectible even when
    // its older opportunity-side status was never advanced from draft.
    if ((pack.invoiceStatus !== "draft" || pack.payments.length > 0) && invoice.status === "draft") {
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
        idempotencyKey: `lead-conversion:${conversionKey}:payment:${payment.id}`,
      });
    }
    return await buildContainer(ctx).commercial.get(pack.partyKind, pack.partyId);
  } catch (error) {
    throw new Error(
      `finance sync failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
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
  const selectedProducts = resolveAgencyProductAssignment(allProducts, [selected.id]).effectiveProducts;
  const products: PortalProductSelection[] = selectedProducts.map(product => ({
    id: product.id,
    catalogKey: product.portalTemplateKey,
    name: product.name,
    description: product.description ?? "",
    deliverables: product.deliverables,
    buyerHeadline: product.buyerHeadline,
    coverImageUrl: product.coverImageUrl,
    accentColor: product.accentColor,
    portalHeadline: product.portalHeadline,
    portalWelcomeNote: product.portalWelcomeNote,
    stageFocusOverrides: product.portalStageFocus,
    supportCta: product.portalSupportCta,
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
      portalSelectedProductIds: [selected.id],
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
  const leadCapturedAt = "capturedAt" in source ? source.capturedAt : source.leadCapturedAt;
  const journeyEvents = "capturedAt" in source ? source.journeyEvents : source.leadJourneyEvents;
  const firstContactedAt = source.firstContactedAt;
  const convertedAt = source.convertedAt;
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
        createdAt: leadCapturedAt ?? ("createdAt" in source ? source.createdAt : source.capturedAt),
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
    leadCapturedAt,
    leadFirstContactedAt: firstContactedAt,
    leadConvertedAt: convertedAt,
    leadJourneyEvents: journeyEvents,
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
      capturedAt: leadCapturedAt,
      firstContactedAt,
      convertedAt,
      journeyEvents,
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
  const definition = {
    id,
    label,
    type,
    options: Array.from(new Set(options)),
    formName: typeof raw.formName === "string" && raw.formName.trim() ? raw.formName.trim().slice(0, 80) : "Extra details",
    required: raw.required === true,
  };
  if ((type === "select" || type === "multi-select") && definition.options.length === 0) return null;
  return definition;
}

function contactFieldDefinitions(fields: CustomFieldDefinition[]): PortalFormFieldDefinition[] {
  return fields.map((field, index) => ({
    id: field.id,
    label: field.label,
    type: field.type,
    options: field.options,
    section: field.formName,
    required: field.required === true,
    active: true,
    createdAt: index,
    updatedAt: index,
  }));
}

function validateContactCustomFields(
  definitions: CustomFieldDefinition[],
  values: unknown,
  existing?: Record<string, unknown>,
) {
  return validatePortalFormValues({
    fields: contactFieldDefinitions(definitions),
    values,
    existing,
  });
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
    relationshipCategory: isLeadRelationshipCategory(url.searchParams.get("relationshipCategory"))
      ? url.searchParams.get("relationshipCategory") as LeadRelationshipCategory
      : undefined,
    // Anything other than the two explicit opt-ins means "the active leads".
    // An unrecognised value must not widen the answer — that is how an archived
    // lead ends up in a campaign audience.
    archived: url.searchParams.get("archived") === "only" ? "only"
      : url.searchParams.get("archived") === "include" ? "include"
      : "exclude",
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
    const container = buildContainer(ctx);
    const existing = body.email
      ? await container.leads.getByEmail(body.email)
      : body.phone
        ? await container.leads.getByPhone(body.phone)
        : null;
    const customFields = validatePortalEntityFields(
      ctx.agencyId,
      "leads",
      body.customFields,
      existing?.customFields,
      ["niche"],
    );
    const result = await container.leads.upsert({ ...body, customFields }, ctx.actor);
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
  try {
    const container = buildContainer(ctx);
    const existing = await container.leads.get(id);
    if (!existing) return notFound("lead_not_found");
    const customFields = validatePortalEntityFields(
      ctx.agencyId,
      "leads",
      body.customFields,
      existing.customFields,
      ["niche"],
    );
    const updated = await container.leads.update(id, { ...body, customFields }, ctx.actor);
    if (!updated) return notFound("lead_not_found");
    return json({ ok: true, lead: updated });
  } catch (error) {
    if (error instanceof LeadIdentityConflictError) {
      return json({
        ok: false,
        error: "lead_identity_conflict",
        field: error.field,
        message: error.message,
      }, 409);
    }
    return unprocessable(error instanceof Error ? error.message : String(error));
  }
}

async function recoverLeadCardId(
  ctx: PluginCtx,
  container: ReturnType<typeof buildContainer>,
  pipelineId: string,
  lead: Lead,
): Promise<string | undefined> {
  const cards = listCardsByAgency(ctx.agencyId).filter(card =>
    card.kind === "lead" && card.pipelineId === pipelineId);
  const exact = cards.find(card => {
    if (card.kind !== "lead") return false;
    const snapshot = card.lead as unknown as { leadId?: string };
    return snapshot.leadId === lead.id;
  });
  if (exact) return exact.id;

  // Legacy cards can lack leadId. Email fallback is allowed only while the
  // canonical identity pointer still belongs to this lead and exactly one card
  // carries the address. Ambiguity creates a new correctly-linked card instead
  // of moving somebody else's work.
  if (!lead.email || (await container.leads.getByEmail(lead.email))?.id !== lead.id) return undefined;
  const emailMatches = cards.filter(card => {
    if (card.kind !== "lead") return false;
    const snapshot = card.lead as unknown as { email?: string };
    return snapshot.email?.trim().toLowerCase() === lead.email.trim().toLowerCase();
  });
  return emailMatches.length === 1 ? emailMatches[0]?.id : undefined;
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
    cardId = await recoverLeadCardId(ctx, c, pipeline.id, lead);
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
    const linked = await c.leads.update(lead.id, { pipelineCardId: card.id }, ctx.actor) ?? lead;
    const updated = await c.leads.recordStageChange(linked.id, {
      fromStage: lead.currentStageId,
      toStage: column.id,
      at: card.updatedAt,
    }, ctx.actor) ?? linked;
    if (column.label.toLowerCase() === "won") await c.contacts.promoteLead(updated, ctx.actor);
    return json({ ok: true, lead: updated, card, columnId: column.id });
  }

  const moved = moveCard(ctx.agencyId, cardId, column.id);
  if (!moved) return unprocessable("could_not_move_card");
  const linked = lead.pipelineCardId === cardId
    ? lead
    : await c.leads.update(lead.id, { pipelineCardId: cardId }, ctx.actor) ?? lead;
  const updated = await c.leads.recordStageChange(linked.id, {
    fromStage: moved.fromColumn,
    toStage: moved.toColumn,
    at: moved.card.updatedAt,
  }, ctx.actor) ?? linked;
  if (column.label.toLowerCase() === "won") await c.contacts.promoteLead(updated, ctx.actor);
  return json({ ok: true, lead: updated, card: moved.card, columnId: column.id });
}

async function ensureLeadBoardCard(ctx: PluginCtx, lead: Lead): Promise<{ lead: Lead; card?: unknown; columnId?: string }> {
  const c = buildContainer(ctx);
  const pipeline = getPipelineBySlug(ctx.agencyId, LEADS_PIPELINE_SLUG);
  if (!pipeline) throw new Error("leads_pipeline_missing");
  const firstColumn = pipeline.columns[0];
  if (!firstColumn) throw new Error("leads_pipeline_has_no_columns");

  let cardId = lead.pipelineCardId;
  if (!cardId) {
    cardId = await recoverLeadCardId(ctx, c, pipeline.id, lead);
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
  let updated = await service.update(body.id, patch, ctx.actor);
  if (!updated) return notFound("lead_not_found");
  if (typeof body.nextMeetingAt === "number" && body.nextMeetingAt !== existing.nextMeetingAt) {
    updated = await service.recordMeeting(body.id, body.nextMeetingAt, ctx.actor) ?? updated;
  }
  if (body.attempt?.outcome) {
    const contactAt = typeof body.attempt.at === "number" ? body.attempt.at : Date.now();
    updated = await service.recordContact(body.id, {
      at: contactAt,
      channel: body.attempt.channel,
      outcome: body.attempt.outcome,
      note: body.attempt.notes,
    }, ctx.actor) ?? updated;
    const enquiryId = typeof updated.customFields?.enquiryId === "string" ? updated.customFields.enquiryId : undefined;
    if (enquiryId) await recordWebsiteEnquiryResponse(enquiryId, contactAt, ctx.actor).catch(() => false);
  } else if (typeof body.nextMeetingAt === "number" && !existing.firstContactedAt) {
    const contactAt = Date.now();
    updated = await service.recordContact(body.id, {
      at: contactAt,
      channel: body.meetingMode ?? "other",
      outcome: "meeting-scheduled",
      note: "First contact inferred from the scheduled meeting.",
    }, ctx.actor) ?? updated;
    const enquiryId = typeof updated.customFields?.enquiryId === "string" ? updated.customFields.enquiryId : undefined;
    if (enquiryId) await recordWebsiteEnquiryResponse(enquiryId, contactAt, ctx.actor).catch(() => false);
  }
  return json({ ok: true, lead: updated });
}

export async function markLeadContactedHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id: string; contactedAt?: number }>(req);
  if (!body?.id) return badRequest("id required.");
  const contactedAt = typeof body.contactedAt === "number" ? body.contactedAt : Date.now();
  const c = buildContainer(ctx);
  const updated = await c.leads.recordContact(body.id, {
    at: contactedAt,
    channel: "other",
    outcome: "reached",
    note: "Manually marked as contacted.",
  }, ctx.actor);
  if (!updated) return notFound("lead_not_found");
  const enquiryId = typeof updated.customFields?.enquiryId === "string" ? updated.customFields.enquiryId : undefined;
  if (enquiryId) await recordWebsiteEnquiryResponse(enquiryId, contactedAt, ctx.actor).catch(() => false);
  return json({ ok: true, lead: updated });
}

function replayLeadConversionResponse(value: unknown): Response {
  if (!value || typeof value !== "object") {
    return json({ ok: false, error: "lead_conversion_result_unavailable" }, 503);
  }
  const result = value as Record<string, unknown>;
  if (result.ok !== true || !result.client || typeof result.client !== "object") {
    return json({ ok: false, error: "lead_conversion_result_unavailable" }, 503);
  }
  return json({ ...result, clientCreated: false, replayed: true }, 200);
}

async function failLeadConversion(
  coordinator: LeadConversionCoordinator,
  operation: LeadConversionClaimInput,
  error: string,
): Promise<void> {
  try {
    // Keep a failed operation resumable only after every partial side effect is
    // durable. If persistence itself is unavailable, retain the active lease so
    // another worker cannot race a stale snapshot immediately.
    await flushPendingWrites();
  } catch {
    return;
  }
  try {
    await coordinator.fail({ ...operation, error });
  } catch {
    // The HTTP request still reports the business failure. An expired/lost
    // claim is safely fenced, and a later request can recover it by lease.
  }
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
  const initialLead = await c.leads.get(body.id);
  if (!initialLead) return notFound("lead_not_found");

  const initialConversion = resolvedProductConversion(ctx.agencyId, {
    ...body,
    servicePlan: body.servicePlan ?? body.planTier,
  });
  if (!initialConversion) return badRequest("product_not_found");

  const coordinator = leadConversionCoordinator();
  const operation: LeadConversionClaimInput = {
    claimKey: leadConversionClaimKey({
      agencyId: ctx.agencyId,
      leadId: initialLead.id,
      email: initialLead.email,
    }),
    requestHash: leadConversionRequestHash({
      stage: body.stage ?? "aqua-epic-intro",
      servicePlan: body.servicePlan ?? body.planTier ?? null,
      productId: body.productId ?? null,
      productKeys: body.productKeys ? [...body.productKeys].sort() : null,
      projectValue: body.projectValue ?? null,
      billingCadence: body.billingCadence ?? null,
      createPortal: body.createPortal ?? null,
    }),
    holderId: leadConversionHolderId(),
  };
  let claim: Awaited<ReturnType<typeof acquireLeadConversion>>;
  try {
    claim = await acquireLeadConversion(coordinator, operation);
  } catch (error) {
    return json({
      ok: false,
      error: "lead_conversion_coordinator_unavailable",
      message: error instanceof Error ? error.message : String(error),
    }, 503);
  }
  if (claim.state === "conflict") {
    return json({
      ok: false,
      error: "lead_conversion_request_conflict",
      message: "This lead already has a conversion operation with different options.",
    }, 409);
  }
  if (claim.state === "held") {
    return json({
      ok: false,
      error: "lead_conversion_in_progress",
      retryAfterMs: Math.max(250, claim.leaseExpiresAt - Date.now()),
    }, 409);
  }
  if (claim.state === "complete") return replayLeadConversionResponse(claim.result);

  try {
    // A failed owner may have persisted part of the operation before releasing
    // its lease. Refresh after claiming so a retry resumes those exact records.
    await ensureHydrated({ fresh: true });
    const lead = await c.leads.get(body.id);
    if (!lead) {
      await failLeadConversion(coordinator, operation, "lead_not_found_after_claim");
      return notFound("lead_not_found");
    }
    const conversion = resolvedProductConversion(ctx.agencyId, {
      ...body,
      servicePlan: body.servicePlan ?? body.planTier,
    });
    if (!conversion) {
      await failLeadConversion(coordinator, operation, "product_not_found_after_claim");
      return badRequest("product_not_found");
    }

    const existingClient = findExistingClientForLead(ctx.agencyId, lead);
    const commercialPack = await c.commercial.get("lead", lead.id);
    const metadata = {
      ...clientJourneyMetadata(lead, conversion, (existingClient?.metadata ?? {}) as Record<string, unknown>),
      commercialPack: commercialPack ?? undefined,
    };
    const lifecycleStage = (body.stage ?? "aqua-epic-intro") as never;
    const client = existingClient
      ? updateClient(ctx.agencyId, existingClient.id, { metadata, stage: lifecycleStage }) ?? existingClient
      : createClient(ctx.agencyId, {
        companyId: lead.companyId ?? lead.companyIds?.[0],
        name: lead.company || lead.name || lead.email,
        ownerEmail: lead.email,
        stage: lifecycleStage,
        metadata,
      });
    const clientCreated = !existingClient;
    const lifecycle = await ensureClientLifecycleOperation({
      agencyId: ctx.agencyId,
      actor: ctx.actor,
      operationId: `lead-lifecycle:${operation.claimKey}`,
      clientId: client.id,
      stage: lifecycleStage,
      metadata,
      requestFingerprint: { conversionRequestHash: operation.requestHash, clientId: client.id },
    });
    if (!lifecycle.ok) {
      await failLeadConversion(coordinator, operation, lifecycle.error ?? "client lifecycle incomplete");
      return json({
        ok: false,
        error: "client_lifecycle_incomplete",
        message: lifecycle.error,
        clientId: client.id,
        lifecycle: lifecycle.lifecycle,
        retryable: true,
      }, 503);
    }
    const syncedCommercialPack = await syncCommercialPackToClientFinance(
      ctx,
      commercialPack,
      client.id,
      operation.claimKey,
    );
    if (syncedCommercialPack) {
      updateClient(ctx.agencyId, client.id, {
        metadata: { ...(client.metadata as Record<string, unknown>), commercialPack: syncedCommercialPack },
      });
    }

    if (!lead.tags.includes("converted")) {
      await c.leads.update(
        lead.id,
        { tags: [...lead.tags, "converted"], notes: lead.notes },
        ctx.actor,
      );
    }

    const pipeline = getPipelineBySlug(ctx.agencyId, LEADS_PIPELINE_SLUG);
    const won = pipeline?.columns.find(col => col.id === "won" || col.label.toLowerCase() === "won");
    if (pipeline && won) {
      let cardId = lead.pipelineCardId ?? await recoverLeadCardId(ctx, c, pipeline.id, lead);
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
          onboardingStartedAt: businessCalendarDate(),
        },
      });
    if (!portalSetup.ok) {
      await failLeadConversion(coordinator, operation, `client portal setup failed: ${portalSetup.error}`);
      return json({
        ok: false,
        error: "client_portal_setup_incomplete",
        message: `Client created, but customer portal setup is incomplete: ${portalSetup.error}`,
        clientId: client.id,
        portalSetup,
        retryable: true,
      }, 503);
    }

    let trackedLead = await c.leads.get(lead.id) ?? lead;
    if (!trackedLead.firstContactedAt) {
      trackedLead = await c.leads.recordContact(lead.id, {
        at: Date.now(),
        channel: "other",
        outcome: "converted",
        note: "Contact confirmed during client conversion.",
      }, ctx.actor) ?? trackedLead;
    }
    trackedLead = await c.leads.recordConversion(lead.id, client.id, ctx.actor) ?? trackedLead;
    const promotedContact = await c.contacts.getByEmail(trackedLead.email);
    if (
      !promotedContact
      || promotedContact.type !== "customer"
      || promotedContact.promotedFromLeadId !== trackedLead.id
      || promotedContact.convertedAt !== trackedLead.convertedAt
    ) {
      await c.contacts.promoteLead(trackedLead, ctx.actor);
    }
    const latestClient = getClientForAgency(ctx.agencyId, client.id) ?? client;
    const savedClient = updateClient(ctx.agencyId, client.id, {
      metadata: {
        leadCapturedAt: trackedLead.capturedAt,
        leadFirstContactedAt: trackedLead.firstContactedAt,
        leadConvertedAt: trackedLead.convertedAt,
        leadJourneyEvents: trackedLead.journeyEvents,
        buyingJourney: {
          ...((latestClient.metadata?.buyingJourney && typeof latestClient.metadata.buyingJourney === "object")
            ? latestClient.metadata.buyingJourney as Record<string, unknown>
            : {}),
          capturedAt: trackedLead.capturedAt,
          firstContactedAt: trackedLead.firstContactedAt,
          convertedAt: trackedLead.convertedAt,
          journeyEvents: trackedLead.journeyEvents,
        },
      },
    }) ?? latestClient;

    const result = {
      ok: true,
      client: savedClient,
      clientCreated,
      portalSetup,
      portalLogin,
    };
    // The replay marker must never outrun the CRM write it represents.
    await flushPendingWrites();
    await coordinator.complete({ ...operation, result });
    return json(result, clientCreated ? 201 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failLeadConversion(coordinator, operation, message);
    return json({ ok: false, error: "lead_conversion_failed", message }, 500);
  }
}

// Archive is REVERSIBLE (issue #62 — it used to be a hard delete wearing the
// word "archive"). The permanent one is `purgeLeadHandler`, and it is a
// separate route so nothing reaches it by accident.
export async function archiveLeadHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  const lead = await buildContainer(ctx).leads.archive(body.id, ctx.actor);
  if (!lead) return notFound("lead_not_found");
  return json({ ok: true, lead });
}

export async function restoreLeadHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  const lead = await buildContainer(ctx).leads.restore(body.id, ctx.actor);
  if (!lead) return notFound("lead_not_found");
  return json({ ok: true, lead });
}

// Permanent, and named so. Requires the lead to be archived FIRST: a purge is
// the second of two deliberate acts, never a faster route to the same button.
export async function purgeLeadHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const body = await safeJson<{ id: string }>(req);
  if (!body?.id) return badRequest("id required.");
  const container = buildContainer(ctx);
  const existing = await container.leads.get(body.id);
  if (!existing) return notFound("lead_not_found");
  if (!existing.archivedAt) return badRequest("Archive this lead before deleting it permanently.");
  const ok = await container.leads.purge(body.id, ctx.actor);
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
  const customFields = getPortalFormFields(ctx.agencyId, "leads").filter(field => field.active);
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
  let defaultRelationshipCategory: LeadRelationshipCategory | undefined;
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
      const category = form.get("defaultRelationshipCategory");
      if (isLeadRelationshipCategory(category)) defaultRelationshipCategory = category;
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
    const body = await safeJson<{ text: string; filename?: string; defaultSource?: string; defaultTags?: string[]; defaultRelationshipCategory?: LeadRelationshipCategory; mapping?: Record<string, string> }>(req);
    if (!body?.text) return badRequest("text or multipart file required.");
    text = body.text;
    filename = body.filename;
    defaultSource = body.defaultSource;
    defaultTags = body.defaultTags;
    defaultRelationshipCategory = isLeadRelationshipCategory(body.defaultRelationshipCategory) ? body.defaultRelationshipCategory : undefined;
    mapping = body.mapping;
  }
  if (!text) return badRequest("empty CSV body.");
  if (mapping) {
    const targets = Object.values(mapping).filter(target => target && target !== "skip");
    if (new Set(targets).size !== targets.length) {
      return badRequest("Each spreadsheet column must map to a different contact field.");
    }
  }
  const customFields = getPortalFormFields(ctx.agencyId, "leads").filter(field => field.active);
  const result = await buildContainer(ctx).leads.importCsv({
    text,
    filename,
    actor: ctx.actor,
    defaultSource,
    defaultTags,
    defaultRelationshipCategory,
    mapping,
    customFieldTypes: Object.fromEntries(customFields.map(field => [field.id, field.type])),
    validateCustomFields: (values, existing) => validatePortalEntityFields(ctx.agencyId, "leads", values, existing),
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
    if (contactSelectWithoutOptions(body.field)) {
      return badRequest("Select fields need at least one option.");
    }
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

function contactSelectWithoutOptions(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const source = value as { type?: unknown; options?: unknown };
  if (source.type !== "select" && source.type !== "multi-select") return false;
  return !Array.isArray(source.options)
    || !source.options.some(option => typeof option === "string" && option.trim());
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
  try {
    const container = buildContainer(ctx);
    const existing = await container.contacts.getByEmail(body.email);
    const definitions = (await ctx.storage.get<CustomFieldDefinition[]>(CUSTOM_FIELDS_KEY)) ?? [];
    const customFields = validateContactCustomFields(definitions, body.customFields, existing?.customFields);
    const result = await container.contacts.upsert({ ...body, customFields }, ctx.actor);
    return json({ ok: true, contact: result.contact, created: result.created }, result.created ? 201 : 200);
  } catch (error) {
    return unprocessable(error instanceof Error ? error.message : String(error));
  }
}

export async function updateContactHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "PATCH") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return badRequest("id required.");
  const body = await safeJson<UpdateContactPatch>(req);
  if (!body) return badRequest("body required.");
  try {
    const container = buildContainer(ctx);
    const existing = await container.contacts.get(id);
    if (!existing) return notFound("contact_not_found");
    const definitions = (await ctx.storage.get<CustomFieldDefinition[]>(CUSTOM_FIELDS_KEY)) ?? [];
    const customFields = validateContactCustomFields(definitions, body.customFields, existing.customFields);
    const updated = await container.contacts.update(id, { ...body, customFields }, ctx.actor);
    if (!updated) return notFound("contact_not_found");
    return json({ ok: true, contact: updated });
  } catch (error) {
    return unprocessable(error instanceof Error ? error.message : String(error));
  }
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
  const lifecycleStage = (body.stage ?? "aqua-epic-intro") as never;
  const client = existingClient
    ? updateClient(ctx.agencyId, existingClient.id, { metadata, stage: lifecycleStage }) ?? existingClient
    : createClient(ctx.agencyId, {
    name: contact.company || contact.name || contact.email,
    ownerEmail: contact.email,
    stage: lifecycleStage,
    metadata,
  });
  const lifecycleFingerprint = leadConversionRequestHash({
    contactId: contact.id,
    stage: lifecycleStage,
    servicePlan: body.servicePlan ?? body.planTier ?? null,
    productId: body.productId ?? null,
    productKeys: body.productKeys ? [...body.productKeys].sort() : null,
    projectValue: body.projectValue ?? null,
    billingCadence: body.billingCadence ?? null,
    createPortal: body.createPortal ?? null,
  });
  const lifecycle = await ensureClientLifecycleOperation({
    agencyId: ctx.agencyId,
    actor: ctx.actor,
    operationId: `contact-lifecycle:${lifecycleFingerprint}`,
    clientId: client.id,
    stage: lifecycleStage,
    metadata,
    requestFingerprint: { lifecycleFingerprint, clientId: client.id },
  });
  if (!lifecycle.ok) {
    return json({
      ok: false,
      error: "client_lifecycle_incomplete",
      message: lifecycle.error,
      clientId: client.id,
      lifecycle: lifecycle.lifecycle,
      retryable: true,
    }, 503);
  }
  const syncedCommercialPack = await syncCommercialPackToClientFinance(
    ctx,
    commercialPack,
    client.id,
    `contact:${ctx.agencyId}:${contact.id}`,
  );
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
        onboardingStartedAt: businessCalendarDate(),
      },
    });
  if (!portalSetup.ok) {
    return json({
      ok: false,
      error: "client_portal_setup_incomplete",
      message: `Client created, but customer portal setup is incomplete: ${portalSetup.error}`,
      clientId: client.id,
      portalSetup,
      retryable: true,
    }, 503);
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
      relationshipCategory: isLeadRelationshipCategory(contact.customFields?.leadRelationshipCategory)
        ? contact.customFields.leadRelationshipCategory
        : undefined,
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
    attempt?: { channel?: MeetingAttemptChannel; outcome?: MeetingAttemptOutcome; notes?: string; at?: number };
  }>(req);
  if (!body?.id) return badRequest("id required.");
  const service = buildContainer(ctx).contacts;
  const existing = await service.get(body.id);
  if (!existing) return notFound("contact_not_found");
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
    if (!channel || !validChannels.includes(channel) || !validOutcomes.includes(outcome)) return badRequest("valid attempt channel and outcome required");
    attempts.push({
      id: `attempt_${randomUUID()}`,
      at: typeof body.attempt.at === "number" ? body.attempt.at : Date.now(),
      channel,
      outcome,
      notes: body.attempt.notes?.trim() || undefined,
    });
  }
  const patch: UpdateContactPatch = {
    nextMeetingAt: typeof body.nextMeetingAt === "number" ? body.nextMeetingAt : undefined,
    meetingLink: body.meetingLink?.trim() || undefined,
    meetingNotes: body.meetingNotes?.trim() || undefined,
    meetingMode: body.meetingMode,
    meetingLocation: body.meetingLocation?.trim() || undefined,
    meetingStatus: body.meetingStatus,
    meetingConfirmedAt: body.meetingConfirmed ? existing.meetingConfirmedAt ?? Date.now() : undefined,
    meetingReminderAt: typeof body.meetingReminderAt === "number" ? body.meetingReminderAt : undefined,
    meetingReminderSentAt: body.attempt?.outcome === "reminder-sent" ? Date.now() : existing.meetingReminderSentAt,
    meetingAttempts: attempts,
  };
  if (salesPresentations !== undefined) patch.salesPresentations = salesPresentations;
  if (body.nextMeetingAt === null) patch.nextMeetingAt = undefined;
  if (body.meetingReminderAt === null) patch.meetingReminderAt = undefined;
  const updated = await service.update(body.id, patch, ctx.actor);
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
