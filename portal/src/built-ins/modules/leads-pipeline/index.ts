// Manifest export — `@aqua/plugin-leads-pipeline`.
//
// Auto-binds to the foundation's leads-kind pipeline (T1 R034 default
// seed). Agency-scoped and always available as a Milesymedia built-in.
// in `_registry.ts` and at boot calls
// `registerLeadsPipelineFoundation({...})` with its real port adapters.

import type {
  AquaPlugin,
  ErasureSubject,
  PluginCtx,
  HealthStatus,
} from "./src/lib/aquaPluginTypes";
import { ROUTES } from "./src/api/routes";
import { _containerFromCtx } from "./src/server/foundationAdapter";
import { resolveValidatedClientAcquisitionLineage } from "./src/lib/clientAcquisitionLineage";

const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;
const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;

function erasureEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function erasurePhone(value: unknown): string {
  if (typeof value !== "string") return "";
  let digits = value.trim().replace(/(?:ext\.?|extension|x)\s*\d+$/i, "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("440")) digits = `44${digits.slice(3)}`;
  if (digits.startsWith("0")) digits = `44${digits.slice(1)}`;
  return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : "";
}

function erasureRecordId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  return id && id.length <= 160 ? id : undefined;
}

const manifest: AquaPlugin = {
  // The foundation registry validator regex /^[a-z][a-z0-9-]*$/ rejects
  // `@aqua/plugin-...` (chapter #157 follow-up — observed at build time).
  // Manifest id matches the folder slug; npm package name retains the
  // @aqua/plugin-... form for transpilePackages.
  id: "leads-pipeline",
  name: "Leads Pipeline",
  version: "0.1.0",
  status: "alpha",
  category: "marketing",
  tagline: "CSV-driven leads board with single-shot email campaigns.",
  description:
    "Owns the agency's leads pipeline: a CSV-importable contact rolodex, a Lead/Contact domain with promotion when a card moves to Won, and single-shot email blasts through the email-sender queue. Anonymous Public Funnel captures stay pending and do not enter this plugin; only the explicit mailbox-proven or authenticated promotion command creates exact Lead/Person/Prospect/card lineage.",

  core: true,
  scopePolicy: "agency",

  navItems: [
    {
      id: "leads-pipeline.board",
      label: "Leads board",
      href: "/portal/agency/pipelines/leads",
      panelId: "marketing",
      order: 10,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "leads-pipeline.contacts",
      label: "Contacts",
      href: "/portal/agency/leads-pipeline/contacts",
      panelId: "marketing",
      order: 20,
      visibleToRoles: [...AGENCY_VIEWERS],
    },
    {
      id: "leads-pipeline.campaigns",
      label: "Campaigns",
      href: "/portal/agency/marketing",
      panelId: "marketing",
      order: 30,
      visibleToRoles: [...AGENCY_ADMINS],
    },
  ],

  pages: [
    // Mounted under the foundation's own /portal/agency/pipelines/leads
    // route by T1's pipeline view; the path here is the *plugin's* page
    // path (T1's catch-all dispatcher prepends panelId).
    { path: "", component: () => import("./src/pages/ContactsPage"), visibleToRoles: [...AGENCY_VIEWERS] },
    { path: "contacts", component: () => import("./src/pages/ContactsPage"), visibleToRoles: [...AGENCY_VIEWERS] },
    // Admin-only in the nav ("Campaigns", `leads-pipeline.campaigns`) — and
    // invisible to the nav-vs-page guard, because that nav entry's href is an
    // APP route (`/portal/agency/marketing`), not this plugin's mount point,
    // so `pluginPageForNavHref` answers null and the page looked like it had
    // no nav claim at all. `agency-staff` could open the campaign composer at
    // /portal/agency/leads-pipeline/campaigns while the tab was hidden.
    { path: "campaigns", component: () => import("./src/pages/CampaignsPage"), visibleToRoles: [...AGENCY_ADMINS] },
    { path: "board", component: () => import("./src/pages/LeadsBoardPage"), visibleToRoles: [...AGENCY_VIEWERS] },
  ],

  api: ROUTES,

  settings: {
    groups: [
      {
        id: "general",
        label: "General",
        fields: [
          {
            id: "defaultLeadSource",
            label: "Default lead source label",
            type: "text",
            default: "",
            helpText: "Applied to CSV lead imports that give no source override. Blank keeps the import's own csv:<filename> provenance.",
          },
          {
            id: "newColumnLabel",
            label: "Column label for fresh captures",
            type: "text",
            default: "New",
            helpText: "Funnel + manual captures land in the leads-pipeline column with this label; an unknown label falls back to New.",
          },
        ],
      },
    ],
  },

  features: [
    { id: "csv-import", label: "CSV contact import", default: true },
    { id: "campaigns", label: "Email campaigns", default: true },
    { id: "funnel-subscriber", label: "Public-funnel auto-capture", default: true },
  ],

  // Idempotent. v1 has no seed data — the foundation already owns the
  // leads pipeline + columns from R034. We just confirm the foundation
  // is wired up.
  onInstall: async (ctx: PluginCtx) => {
    _containerFromCtx({
      agencyId: ctx.agencyId,
      actor: ctx.actor,
      storage: ctx.storage,
    });
  },

  // Right-to-be-forgotten. This is an agency-scoped install: ONE storage slice
  // holds every client's contacts and leads, and `clientErasure` skips the
  // whole slice when a plugin owns a hook — so everything below is on us.
  //
  // ── Resolving "this client's people" ──────────────────────────────────────
  // Contact routes are not identity keys. A reception number and even a shared
  // mailbox can legitimately appear on several people. Resolve only durable
  // client/lead/contact/prospect edges for deletion; legacy email/phone matches
  // are preserved and surfaced as review-required evidence.
  //
  // ── Disposition ──────────────────────────────────────────────────────────
  //   • Contacts → DELETE (a contact IS a contact handle). Row, the
  //     `contacts/email/<email>` pointer whose KEY holds the email, and index.
  //   • Leads → ANONYMISE (relationship/lifecycle fact): identity stripped,
  //     the de-identified funnel record kept, both PII-in-key pointers dropped.
  //   • Commercial packs → RETAINED with the recipient identity stripped
  //     (finance/contract legal hold).
  //
  // Idempotent, as the contract requires: leads are anonymised last, so a
  // re-run after a partial failure still resolves them; a second clean run
  // finds nothing and does nothing.
  onEraseClient: async (ctx: PluginCtx, clientId: string, subject?: ErasureSubject) => {
    if (typeof ctx.storage.runExclusive !== "function") {
      throw new Error("Leads-pipeline erasure requires atomic acquisition storage.");
    }
    return ctx.storage.runExclusive(`acquisition-state:${ctx.agencyId}`, async () => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      actor: ctx.actor,
      storage: ctx.storage,
    });
    // This hook owns the whole agency slice. Reporting success without the
    // container would make the generic sweep skip it, so fail the overall
    // erasure and retain the Client as the retry handle instead.
    if (!c) throw new Error("Leads-pipeline erasure foundation is unavailable.");
    // WHO is being erased — resolved once by the sweep from the client record
    // (deleted moments after the hooks run, so this is the only chance to know).
    const evidence = subject?.identityEvidence;
    const subjectEmails = new Set((evidence?.emails ?? subject?.emails ?? []).map(erasureEmail).filter(Boolean));
    const subjectPhones = new Set((evidence?.phones ?? subject?.phones ?? []).map(erasurePhone).filter(Boolean));
    const sharedEmails = new Set((evidence?.sharedEmails ?? []).map(erasureEmail).filter(Boolean));
    const sharedPhones = new Set((evidence?.sharedPhones ?? []).map(erasurePhone).filter(Boolean));
    const subjectMetadata = subject?.metadata ?? {};

    // Resolve every edge before any anonymisation removes the backlinks used
    // below. Prospect is canonical; the Lead acquisition copy is a projection.
    const [leads, contacts, prospects] = await Promise.all([
      c.leads.list(),
      c.contacts.list(),
      c.prospects.list(),
    ]);

    const lineage = resolveValidatedClientAcquisitionLineage({
      id: clientId,
      agencyId: ctx.agencyId,
      personId: subject?.personId,
      metadata: subjectMetadata,
    }, {
      persons: subject?.personId ? [{
        id: subject.personId,
        agencyId: ctx.agencyId,
        facets: {
          clientIds: [clientId],
          ...(subject.leadId ? { leadId: subject.leadId } : {}),
          ...(subject.contactId ? { contactId: subject.contactId } : {}),
        },
      }] : [],
      leads,
      contacts,
      prospects,
    });
    if (lineage.conflicts.length > 0) {
      throw new Error("Leads-pipeline erasure lineage is inconsistent; repair the exact Client/Person/acquisition links before retrying.");
    }
    const doomedLeadIds = new Set(lineage.leadIds);
    const doomedContactIds = new Set(lineage.contactIds);

    const doomedLeads = leads.filter(lead => doomedLeadIds.has(lead.id));
    const doomedContacts = contacts.filter(contact => doomedContactIds.has(contact.id));

    const explicitProspectIds = new Set<string>(lineage.prospectIds);
    for (const lead of doomedLeads) {
      const projectedIds = new Set((lead.prospectAcquisitions ?? [])
        .map(acquisition => erasureRecordId(acquisition.prospectId))
        .filter((id): id is string => Boolean(id)));
      for (const prospectId of projectedIds) {
        const prospect = prospects.find(row => row.id === prospectId);
        if (!prospect || prospect.qualifiedLeadId !== lead.id) {
          throw new Error("Leads-pipeline erasure found a one-way Prospect/Lead link; repair it before retrying.");
        }
        explicitProspectIds.add(prospect.id);
      }
      for (const prospect of prospects.filter(row => row.qualifiedLeadId === lead.id)) {
        if (!projectedIds.has(prospect.id)) {
          throw new Error("Leads-pipeline erasure found a one-way Lead/Prospect link; repair it before retrying.");
        }
        explicitProspectIds.add(prospect.id);
      }
    }

    const doomedProspects = new Map(prospects
      .filter(prospect => explicitProspectIds.has(prospect.id)
        || Boolean(prospect.qualifiedLeadId && doomedLeadIds.has(prospect.qualifiedLeadId)))
      .map(prospect => [prospect.id, prospect]));
    for (const prospectId of explicitProspectIds) {
      const prospect = await c.prospects.get(prospectId);
      if (prospect) doomedProspects.set(prospect.id, prospect);
    }

    const identityOwners = (kind: "email" | "phone", identity: string): string[] => [
      ...leads.filter(lead => (kind === "email" ? erasureEmail(lead.email) : erasurePhone(lead.phone)) === identity)
        .map(lead => `lead:${lead.id}`),
      ...contacts.filter(contact => (kind === "email" ? erasureEmail(contact.email) : erasurePhone(contact.phone)) === identity)
        .map(contact => `contact:${contact.id}`),
      ...prospects.filter(prospect => (kind === "email" ? erasureEmail(prospect.email) : erasurePhone(prospect.phone)) === identity)
        .map(prospect => `prospect:${prospect.id}`),
    ];
    const doomedProspectIds = new Set([...explicitProspectIds, ...doomedProspects.keys()]);
    const doomedOwnerIds = new Set([
      ...[...doomedLeadIds].map(id => `lead:${id}`),
      ...[...doomedContactIds].map(id => `contact:${id}`),
      ...[...doomedProspectIds].map(id => `prospect:${id}`),
    ]);

    // Identity values locate possible legacy/shared records for review, never
    // records to erase. Even a globally unique address is not a server-owned
    // Client/Person edge and can later become shared.
    let legacyReview = 0;
    let sharedReview = 0;
    const reviewCandidate = (input: {
      key: string;
      email?: string;
      phone?: string;
      personId?: string;
      clientId?: string;
    }) => {
      if (doomedOwnerIds.has(input.key)) return;
      const email = erasureEmail(input.email);
      const phone = erasurePhone(input.phone);
      const emailMatch = Boolean(email && subjectEmails.has(email));
      const phoneMatch = Boolean(phone && subjectPhones.has(phone));
      const sharedPerson = Boolean(subject?.exactOwnership?.personShared
        && subject.exactOwnership.personId
        && input.personId === subject.exactOwnership.personId);
      if (!emailMatch && !phoneMatch && !sharedPerson) return;
      const isShared = sharedPerson
        || Boolean(input.clientId && input.clientId !== clientId)
        || Boolean(emailMatch && (sharedEmails.has(email) || identityOwners("email", email).length > 1))
        || Boolean(phoneMatch && (sharedPhones.has(phone) || identityOwners("phone", phone).length > 1));
      if (isShared) sharedReview++;
      else legacyReview++;
    };
    for (const lead of leads) reviewCandidate({
      key: `lead:${lead.id}`,
      email: lead.email,
      phone: lead.phone,
      personId: lead.personId,
      clientId: lead.clientId ?? lead.convertedClientId,
    });
    for (const contact of contacts) reviewCandidate({
      key: `contact:${contact.id}`,
      email: contact.email,
      phone: contact.phone,
      personId: contact.personId,
      clientId: contact.clientId,
    });
    for (const prospect of prospects) reviewCandidate({
      key: `prospect:${prospect.id}`,
      email: prospect.email,
      phone: prospect.phone,
      clientId: prospect.qualifiedLeadId && !doomedLeadIds.has(prospect.qualifiedLeadId)
        ? "another-client-lineage"
        : undefined,
    });
    if (legacyReview > 0) subject?.reviewRequired?.push({
      system: "leads-pipeline",
      reason: "legacy-unscoped",
      records: legacyReview,
    });
    if (sharedReview > 0) subject?.reviewRequired?.push({
      system: "leads-pipeline",
      reason: "shared-identity",
      records: sharedReview,
    });

    // Prospect rows contain research, notes, social URLs and outreach prose,
    // so they are destroyed rather than anonymised. Do this first while the
    // qualified Lead edge still proves ownership.
    for (const prospectId of doomedProspectIds) {
      await c.prospects.eraseForErasure(prospectId, [...doomedLeadIds]);
    }

    for (const contact of doomedContacts) {
      await c.commercial.stripIdentityForErasure("contact", contact.id);
      await c.contacts.delete(contact.id, ctx.actor);
    }
    for (const lead of doomedLeads) {
      await c.commercial.stripIdentityForErasure("lead", lead.id);
      await c.leads.anonymiseForErasure(lead.id, ctx.actor);
    }

    // Contact deletion / Lead anonymisation write their own non-PII audit
    // rows, so scrub references last. Failing closed is intentional: silently
    // keeping an operator-entered Prospect label or outreach sentence would
    // make the overall erasure claim false.
    if (doomedProspectIds.size > 0
      || doomedLeadIds.size > 0
      || doomedContacts.length > 0
      || subjectEmails.size > 0
      || subjectPhones.size > 0) {
      const activityErasure = await ctx.services.activity.eraseSubjectReferences({
        agencyId: ctx.agencyId,
        prospectIds: [...doomedProspectIds],
        leadIds: [...doomedLeadIds],
        contactIds: doomedContacts.map(contact => contact.id),
        emails: [...subjectEmails],
        phones: [...subjectPhones],
        sharedEmails: [...sharedEmails],
        sharedPhones: [...sharedPhones],
      });
      if (typeof activityErasure !== "number") {
        if (activityErasure.reviewRequired.legacyUnscoped > 0) subject?.reviewRequired?.push({
          system: "leads-activity",
          reason: "legacy-unscoped",
          records: activityErasure.reviewRequired.legacyUnscoped,
        });
        if (activityErasure.reviewRequired.sharedIdentity > 0) subject?.reviewRequired?.push({
          system: "leads-activity",
          reason: "shared-identity",
          records: activityErasure.reviewRequired.sharedIdentity,
        });
      }
    }
    });
  },

  healthcheck: async (ctx: PluginCtx): Promise<HealthStatus> => {
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      actor: ctx.actor,
      storage: ctx.storage,
    });
    if (!c) {
      return { ok: false, message: "leads-pipeline foundation not registered" };
    }
    const [leads, contacts, campaigns] = await Promise.all([
      c.leads.list(),
      c.contacts.list(),
      c.campaigns.list(),
    ]);
    return {
      ok: true,
      message: `${leads.length} leads · ${contacts.length} contacts · ${campaigns.length} campaigns`,
      components: {
        leads: { ok: true, message: `${leads.length} rows` },
        contacts: { ok: true, message: `${contacts.length} rows` },
        campaigns: { ok: true, message: `${campaigns.length} rows` },
      },
    };
  },
};

export default manifest;
