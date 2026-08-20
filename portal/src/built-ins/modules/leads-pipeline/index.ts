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
import { clientMatchesContact, clientMatchesLead } from "./src/lib/clientMatch";

const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;
const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;

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
    "Owns the agency's leads pipeline: a CSV-importable contact rolodex, a Lead/Contact domain with promotion when a card moves to Won, and single-shot email blasts that enqueue through the email-sender plugin's queue. Subscribes to public-funnel.lead.captured so HC + Resources tools auto-deposit captures into the New column.",

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
    { path: "", component: () => import("./src/pages/ContactsPage") },
    { path: "contacts", component: () => import("./src/pages/ContactsPage") },
    { path: "campaigns", component: () => import("./src/pages/CampaignsPage") },
    { path: "board", component: () => import("./src/pages/LeadsBoardPage") },
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
            default: "manual",
            helpText: "Used when CSVs lack a source column and no override is given.",
          },
          {
            id: "newColumnLabel",
            label: "Column label for fresh captures",
            type: "text",
            default: "New",
            helpText: "Funnel + manual captures land in this column. Must match a column on the leads pipeline.",
          },
        ],
      },
      {
        id: "campaigns",
        label: "Campaigns",
        fields: [
          {
            id: "fromName",
            label: "Default from name",
            type: "text",
            default: "",
            helpText: "Optional. When unset, uses the email-sender plugin's default identity.",
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
  // The tricky half. `Contact.clientId` exists on the type but NOTHING writes
  // it (a converted client's contact has it `undefined`), so the old
  // `contact.clientId === clientId` filter matched nothing and this hook
  // silently erased nothing at all. We resolve through the links the app
  // actually maintains, in order of strength:
  //
  //   1. `Lead.convertedClientId` — stamped by `LeadService.recordConversion`
  //      on the lead→client conversion. The explicit, authoritative link.
  //   2. `clientMatchesLead` / `clientMatchesContact` — the SAME matchers the
  //      conversion handlers use to decide "this client IS this lead/contact"
  //      (client.metadata.leadId/contactId/promotedFromLeadId, else
  //      ownerEmail). This is what reaches a client converted straight from a
  //      contact (`convertContactToClientHandler` writes no back-link at all),
  //      and any record that predates the stamp.
  //   3. `Contact.promotedFromLeadId` pointing at a lead resolved by 1 or 2,
  //      and finally a canonical-email match against those leads.
  //   4. `Contact.clientId` / `Lead.clientId`, for anything that ever does set
  //      it. Symmetry: whatever the app calls a match when converting, erasure
  //      calls a match when erasing.
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
    const c = _containerFromCtx({
      agencyId: ctx.agencyId,
      actor: ctx.actor,
      storage: ctx.storage,
    });
    if (!c) return; // foundation not registered — nothing to erase
    // WHO is being erased — resolved once by the sweep from the client record
    // (deleted moments after the hooks run, so this is the only chance to know).
    const client = subject ? { ownerEmail: subject.emails[0], metadata: subject.metadata } : null;
    const subjectEmails = new Set(subject?.emails ?? []);

    const [leads, contacts] = await Promise.all([c.leads.list(), c.contacts.list()]);

    const doomedLeads = leads.filter(lead =>
      lead.convertedClientId === clientId
      || lead.clientId === clientId
      || subjectEmails.has(lead.email.trim().toLowerCase())
      || (client !== null && clientMatchesLead(client, lead)));
    const doomedLeadIds = new Set(doomedLeads.map(lead => lead.id));
    const doomedEmails = new Set(doomedLeads.map(lead => lead.email).filter(Boolean));

    const doomedContacts = contacts.filter(contact =>
      contact.clientId === clientId
      || (contact.promotedFromLeadId !== undefined && doomedLeadIds.has(contact.promotedFromLeadId))
      || (contact.email !== "" && doomedEmails.has(contact.email))
      || subjectEmails.has(contact.email.trim().toLowerCase())
      || (client !== null && clientMatchesContact(client, contact)));

    for (const contact of doomedContacts) {
      await c.commercial.stripIdentityForErasure("contact", contact.id);
      await c.contacts.delete(contact.id, ctx.actor);
    }
    for (const lead of doomedLeads) {
      await c.commercial.stripIdentityForErasure("lead", lead.id);
      await c.leads.anonymiseForErasure(lead.id, ctx.actor);
    }
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
