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
import { customerPortalProvisioningMetadata } from "@/lib/server/customerPortalProvisioning";
import { clientMatchesContact, clientMatchesLead } from "../lib/clientMatch";
import { getState, mutate } from "@/server/storage";
import { parseXlsxToDelimitedText } from "../server/csv";
import type { PortalState } from "@/server/types";
import type {
  AudienceFilter,
  Contact,
  CreateCampaignInput,
  CreateContactInput,
  CreateLeadInput,
  Lead,
  UpdateContactPatch,
  UpdateCampaignPatch,
  UpdateLeadPatch,
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

const buildContainer = (ctx: PluginCtx) =>
  containerFor({ agencyId: ctx.agencyId, storage: ctx.storage });

async function safeJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; }
  catch { return null; }
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

function findExistingClientForContact(agencyId: string, contact: Contact) {
  return listClients(agencyId).find(client => clientMatchesContact(client, contact)) ?? null;
}

function clientJourneyMetadata(source: Lead | Contact, planTier?: string) {
  const clientName = source.company || source.name || source.email;
  const resolvedPlanTier = planTier?.trim() || "foundational";
  return {
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
    planTier: resolvedPlanTier,
    ...customerPortalProvisioningMetadata({
      clientName,
      contactName: source.name,
      email: source.email,
      servicePlan: resolvedPlanTier,
    }),
    buyingJourney: {
      source: source.source,
      capturedAt: "capturedAt" in source ? source.capturedAt : undefined,
      meetingAt: source.nextMeetingAt,
      meetingLink: source.meetingLink,
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
  const body = await safeJson<{ id: string; nextMeetingAt?: number | null; meetingLink?: string; meetingNotes?: string }>(req);
  if (!body?.id) return badRequest("id required.");
  const patch: UpdateLeadPatch = {
    nextMeetingAt: typeof body.nextMeetingAt === "number" ? body.nextMeetingAt : undefined,
    meetingLink: body.meetingLink?.trim() || undefined,
    meetingNotes: body.meetingNotes?.trim() || undefined,
  };
  if (body.nextMeetingAt === null) patch.nextMeetingAt = undefined;
  const updated = await buildContainer(ctx).leads.update(body.id, patch, ctx.actor);
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
  const body = await safeJson<{ id: string; stage?: string; planTier?: string }>(req);
  if (!body?.id) return badRequest("id required.");

  const c = buildContainer(ctx);
  const lead = await c.leads.get(body.id);
  if (!lead) return notFound("lead_not_found");

  const beforeConvert = structuredClone(getState());
  const existingClient = findExistingClientForLead(ctx.agencyId, lead);
  const metadata = clientJourneyMetadata(lead, body.planTier);
  const client = existingClient
    ? updateClient(ctx.agencyId, existingClient.id, { metadata }) ?? existingClient
    : createClient(ctx.agencyId, {
    name: lead.company || lead.name || lead.email,
    ownerEmail: lead.email,
    stage: (body.stage ?? "aqua-epic-intro") as never,
    metadata,
  });

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

  const portalLogin = prepareCustomerPortalAccess({
    email: lead.email,
  });

  const portalSetup = await setupClientStarterPortal({
    agencyId: ctx.agencyId,
    clientId: client.id,
    actor: ctx.actor,
    metadata: {
      phase: "Epic Intro",
      planTier: String(body.planTier ?? "Foundational Flow"),
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

export async function importCsvHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const contentType = req.headers.get("content-type") ?? "";
  let text: string | null = null;
  let filename: string | undefined;
  let defaultSource: string | undefined;
  let defaultTags: string[] | undefined;

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
    } catch (err) {
      return badRequest(`multipart parse failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    const body = await safeJson<{ text: string; filename?: string; defaultSource?: string; defaultTags?: string[] }>(req);
    if (!body?.text) return badRequest("text or multipart file required.");
    text = body.text;
    filename = body.filename;
    defaultSource = body.defaultSource;
    defaultTags = body.defaultTags;
  }
  if (!text) return badRequest("empty CSV body.");
  const result = await buildContainer(ctx).leads.importCsv({
    text,
    filename,
    actor: ctx.actor,
    defaultSource,
    defaultTags,
  });
  return json({ ok: true, ...result });
}

// ─── Contacts ────────────────────────────────────────────────────────────

export async function listContactsHandler(req: Request, ctx: PluginCtx): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const url = new URL(req.url);
  const contacts = await buildContainer(ctx).contacts.list({
    query: url.searchParams.get("q") ?? undefined,
    type: (url.searchParams.get("type") ?? undefined) as "lead" | "customer" | "vendor" | undefined,
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
  const body = await safeJson<{ id: string; stage?: string; planTier?: string }>(req);
  if (!body?.id) return badRequest("id required.");

  const c = buildContainer(ctx);
  const contact = await c.contacts.get(body.id);
  if (!contact) return notFound("contact_not_found");

  const beforeConvert = structuredClone(getState());
  const existingClient = findExistingClientForContact(ctx.agencyId, contact);
  const metadata = clientJourneyMetadata(contact, body.planTier);
  const client = existingClient
    ? updateClient(ctx.agencyId, existingClient.id, { metadata }) ?? existingClient
    : createClient(ctx.agencyId, {
    name: contact.company || contact.name || contact.email,
    ownerEmail: contact.email,
    stage: (body.stage ?? "aqua-epic-intro") as never,
    metadata,
  });

  const convertedContact = await c.contacts.update(contact.id, {
    type: "customer",
    tags: Array.from(new Set([...contact.tags, "converted"])),
    lastContactedAt: contact.lastContactedAt ?? Date.now(),
  }, ctx.actor);

  const portalLogin = prepareCustomerPortalAccess({
    email: contact.email,
  });

  const portalSetup = await setupClientStarterPortal({
    agencyId: ctx.agencyId,
    clientId: client.id,
    actor: ctx.actor,
    metadata: {
      phase: "Epic Intro",
      planTier: String(body.planTier ?? "Foundational Flow"),
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
    }, ctx.actor);
    const leadWithMeeting = contact.nextMeetingAt || contact.meetingNotes
      ? await c.leads.update(result.lead.id, {
          nextMeetingAt: contact.nextMeetingAt,
          meetingNotes: contact.meetingNotes,
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
  const body = await safeJson<{ id: string; nextMeetingAt?: number | null; meetingLink?: string; meetingNotes?: string }>(req);
  if (!body?.id) return badRequest("id required.");
  const updated = await buildContainer(ctx).contacts.update(body.id, {
    nextMeetingAt: typeof body.nextMeetingAt === "number" ? body.nextMeetingAt : undefined,
    meetingLink: body.meetingLink?.trim() || undefined,
    meetingNotes: body.meetingNotes?.trim() || undefined,
  }, ctx.actor);
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
  if (!body || !body.name || !body.subject || !body.bodyHtml) {
    return badRequest("name + subject + bodyHtml required.");
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
