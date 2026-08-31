// The canonical semantic layer — one authoritative, machine-readable registry
// of what every important business entity IS, where its truth lives, who owns
// it, and how it relates to its neighbours.
//
// ── What this is and is not ───────────────────────────────────────────────
//
// AquaCRM already has selective semantics scattered across `server/types.ts`
// doc comments, `docs/workspace/*.md` chapters and module headers. What it did
// not have is ONE registry a machine can check: nothing failed when a new
// PortalState collection appeared with no owner, no tenancy note and no
// sensitivity class. This module is that registry, and
// `scripts/smoke-semantic-registry.test.ts` enforces it: every PortalState
// collection must be classified here, every entity's relationships must point
// at entities that exist, and every entity carrying personal data must state
// its retention behaviour.
//
// It DESCRIBES the system as built — it does not redefine it. Where the code
// and this file disagree, the code is the bug or this file is; either way the
// smoke test turns the disagreement into a failure instead of drift.
//
// Definitions here are deliberately verbatim-compatible with the authorities
// they cite (`server/types.ts` doc comments, module headers, Ed's recorded
// decisions). Client-safe and pure: no server imports, no I/O.
//
// The docs twin is docs/data/SEMANTIC-LAYER.md (prose) and
// docs/data/DATA-DICTIONARY.md (field level); this file is the enforceable
// index both are generated against.

/** Which plane of the architecture a store belongs to. */
export type DataPlane =
  | "operational" // transactional source of truth (PortalState, Supabase tables)
  | "raw" // immutable provider payloads / capture rows kept as received
  | "derived" // rebuildable read models (KPI, Radar, forecasts)
  | "config"; // operator/system configuration, not business records

/** Who a record belongs to — the enforceable ownership boundary. */
export type TenancyScope =
  | "agency" // carries agencyId; one agency owns it
  | "client" // carries agencyId + clientId
  | "person" // carries agencyId + a person/user binding
  | "global" // deliberately cross-tenant (platform-level)
  | "realm"; // scoped by data realm rather than a tenant field

export type SensitivityClass =
  | "none" // operational, no personal data
  | "internal" // business-confidential, no personal data
  | "personal" // identifies/contacts a person — PII
  | "sensitive-personal" // health, pay, HR judgements
  | "credential"; // secrets; must never reach derived datasets or logs

export interface SemanticTimestampSemantics {
  /** Field carrying when the record was created in Aqua (ingestion/record time). */
  created?: string;
  /** Field carrying last mutation time. */
  updated?: string;
  /** Field carrying when the business fact actually happened (event time). */
  occurred?: string;
  /** Field carrying when a value takes effect (targets, grants). */
  effective?: string;
  /** Field carrying when a reading was measured (metrics, evidence). */
  measured?: string;
}

export interface SemanticLifecycle {
  /** The states this entity can be in. */
  states: readonly string[];
  /** Allowed transitions, state → reachable states. Omitted = free movement. */
  transitions?: Readonly<Record<string, readonly string[]>>;
  notes?: string;
}

export interface SemanticRelationship {
  to: string; // target entity id
  kind: "belongs-to" | "has-many" | "references" | "backed-by";
  via: string; // the field(s) carrying the link
  rule?: string; // integrity rule, if any
}

export interface SemanticEntity {
  /** Canonical machine name. Stable; never reuse for a different concept. */
  id: string;
  label: string;
  /** The one human-readable definition. */
  definition: string;
  /** How the stable identifier is formed and what guarantees it carries. */
  idRule: string;
  tenancy: TenancyScope;
  /** The field(s) that carry the tenant boundary, where tenancy != global. */
  tenantFields?: readonly string[];
  /** Where the authoritative copy lives TODAY. */
  sourceOfTruth: string;
  plane: DataPlane;
  /** How records come into being (provenance). */
  provenance: string;
  timestamps: SemanticTimestampSemantics;
  sensitivity: SensitivityClass;
  /** Retention / deletion behaviour as actually implemented. */
  retention: string;
  lifecycle?: SemanticLifecycle;
  /** For inferred/imported values: how confidence & freshness are expressed. */
  confidence?: string;
  relationships: readonly SemanticRelationship[];
}

// ─── The registry ──────────────────────────────────────────────────────────

export const SEMANTIC_ENTITIES: readonly SemanticEntity[] = [
  // ── Tenancy & identity ───────────────────────────────────────────────────
  {
    id: "tenant",
    label: "Tenant (Agency)",
    definition:
      "The isolation boundary every business record belongs to. An Agency row is a tenant: " +
      "either a holding group / standalone business, or the workspace tenant backing one " +
      "trading company's portal (then holdingAgencyId + companyId are set together). " +
      "Three permanent tiers: AGENCY (holding group) → TRADING COMPANY → CLIENTS.",
    idRule: "Agency.id — opaque string minted at creation; slug is unique but display-facing.",
    tenancy: "global",
    sourceOfTruth: "PortalState.agencies (server/tenants.ts)",
    plane: "operational",
    provenance: "Created by signup/bootstrap (server/agencyBootstrap.ts) or company-portal provisioning (server/companyPortal).",
    timestamps: { created: "createdAt", updated: "updatedAt" },
    sensitivity: "internal",
    retention: "Retained indefinitely; no tenant-deletion flow exists yet (recorded in MIGRATION-PLAN as a gap).",
    lifecycle: { states: ["active", "paused", "archived"] },
    relationships: [
      { to: "tradingCompany", kind: "has-many", via: "TradingCompany.agencyId" },
      { to: "client", kind: "has-many", via: "Client.agencyId" },
      { to: "tenant", kind: "references", via: "holdingAgencyId", rule: "Set together with companyId or not at all; must stay two-way with TradingCompany.portalAgencyId." },
    ],
  },
  {
    id: "tradingCompany",
    label: "Trading company",
    definition:
      "A business operated under a holding-group agency. Never 'becomes an agency' — it may " +
      "gain a portal workspace backed by its own tenant row while staying a company in the group.",
    idRule: "TradingCompany.id — opaque string; unique within the owning agency.",
    tenancy: "agency",
    tenantFields: ["agencyId"],
    sourceOfTruth: "PortalState.tradingCompanies (server/company.ts)",
    plane: "operational",
    provenance: "Created by operators in the holding-group workspace.",
    timestamps: { created: "createdAt", updated: "updatedAt" },
    sensitivity: "internal",
    retention: "Retained; status moves to archived rather than deletion.",
    lifecycle: { states: ["active", "paused", "archived"] },
    relationships: [
      { to: "tenant", kind: "belongs-to", via: "agencyId" },
      { to: "tenant", kind: "backed-by", via: "portalAgencyId", rule: "Two-way with Agency.holdingAgencyId/companyId; written once." },
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    definition:
      "A governed product area, NOT a persisted entity of its own. Five senses exist: " +
      "(1) an access-scope kind whose ids are the literals staff|fulfilment|growth(|development); " +
      "(2) a client workspace, which IS the Client row; (3) agency workspace settings; " +
      "(4) client product workspaces inside Client.metadata; (5) per-employee station access. " +
      "Distinct from Organisation: a workspace is Aqua-side structure, an organisation is a " +
      "real-world company the agency does business with.",
    idRule: "Scope id (string literal) for governed areas; Client.id for client workspaces.",
    tenancy: "agency",
    tenantFields: ["scope resolution via accessControl"],
    sourceOfTruth: "Not persisted as a collection — lib/server/access/workspaceElementAccess.ts defines the governed ids.",
    plane: "config",
    provenance: "Code-defined; client workspaces created with the Client record.",
    timestamps: {},
    sensitivity: "none",
    retention: "n/a — code-defined.",
    relationships: [{ to: "client", kind: "references", via: "AccessScope.clientId on workspace-kind scopes" }],
  },
  {
    id: "userAccount",
    label: "User account",
    definition:
      "A login — credentials plus role and tenant memberships. NOT the person: one human may " +
      "have several accounts, and staff/CRM records exist without any account. Multi-agency: " +
      "agencyIds[] is the real membership list; agencyId is a legacy mirror of agencyIds[0].",
    idRule: "Keyed by lower-cased email in PortalState.users; USER_SCHEMA_V = 2.",
    tenancy: "person",
    tenantFields: ["agencyIds", "agencyId (legacy mirror)", "clientId (client-* / freelancer / end-customer)"],
    sourceOfTruth: "PortalState.users (server/users.ts); passwords as scrypt hashes. Supabase auth.users is a parallel identity for MFA/admin flows, cross-checked at session read.",
    plane: "operational",
    provenance: "Signup, staff provisioning (staffProvisioningOperations, idempotent), or client-portal invite.",
    timestamps: { created: "createdAt", updated: "updatedAt" },
    sensitivity: "credential",
    retention: "Deleted via account deletion; sessionRev/accessRev bumps revoke live sessions immediately.",
    relationships: [
      { to: "tenant", kind: "belongs-to", via: "agencyIds[]" },
      { to: "staffMember", kind: "references", via: "PeopleEmployee.userId", rule: "Optional — an employee can exist with no login." },
      { to: "client", kind: "references", via: "clientId", rule: "Required for client-* and end-customer roles." },
    ],
  },
  {
    id: "staffMember",
    label: "Staff member (employment record)",
    definition:
      "Somebody who works FOR the agency — the HR record (people.ts owns EMPLOYMENT). " +
      "Deliberately does not share storage with the CRM Person (persons.ts) and must not learn to.",
    idRule: "PeopleEmployee.id — opaque string.",
    tenancy: "agency",
    tenantFields: ["agencyId"],
    sourceOfTruth: "PortalState.peopleEmployees (server/people.ts)",
    plane: "operational",
    provenance: "Hired via People workflows or provisioned with a user account (staffProvisioning).",
    timestamps: { created: "createdAt", updated: "updatedAt" },
    sensitivity: "sensitive-personal",
    retention: "Retained through employment changes; pay redacted before any RSC/API boundary (redactPeopleEmployeePay).",
    relationships: [
      { to: "tenant", kind: "belongs-to", via: "agencyId" },
      { to: "userAccount", kind: "references", via: "userId" },
    ],
  },
  {
    id: "role",
    label: "Role",
    definition:
      "One of eight coarse route-gating labels (agency-owner|manager|staff, client-owner|staff, " +
      "freelancer, end-customer, lead). A role answers 'which surfaces may this session enter'. " +
      "Distinct from a permission (a capability string answering 'may this actor do X here') and " +
      "from a resource entitlement (a grant binding capabilities to one scope + environment).",
    idRule: "Closed union in server/types.ts:283; SURFACE_ROLE_CEILING may only be narrowed by pages.",
    tenancy: "global",
    sourceOfTruth: "server/types.ts Role union; held on ServerUser.role and the session token.",
    plane: "config",
    provenance: "Code-defined.",
    timestamps: {},
    sensitivity: "none",
    retention: "n/a — code-defined.",
    relationships: [{ to: "userAccount", kind: "references", via: "ServerUser.role" }],
  },
  {
    id: "permission",
    label: "Permission (capability)",
    definition:
      "A stable capability string — 18 base capabilities plus element.<key>.<view|use|manage> over " +
      "44 element keys. manage implies use implies view. Owner baseline holds all capabilities; " +
      "everyone else's universal baseline is exactly ['access.request'].",
    idRule: "ACCESS_BASE_CAPABILITIES ∪ element.<ACCESS_ELEMENT_KEYS>.<action> — closed, code-defined sets.",
    tenancy: "global",
    sourceOfTruth: "server/types.ts:377-462 + server/accessControl.ts (evaluation).",
    plane: "config",
    provenance: "Code-defined.",
    timestamps: {},
    sensitivity: "none",
    retention: "n/a — code-defined.",
    relationships: [{ to: "resourceEntitlement", kind: "references", via: "AccessGrant.capabilities" }],
  },
  {
    id: "resourceEntitlement",
    label: "Resource entitlement (access grant / template)",
    definition:
      "The binding of capabilities to one user, one scope (agency|workspace|client|project) and one " +
      "environment (live|sandbox), optionally via a reusable role template, optionally path-narrowed " +
      "and expiring. Grants are additive; delegation requires the granter to hold everything granted.",
    idRule: "AccessGrant.id / AccessRoleTemplate.id — opaque; idempotencyKey dedupes creation.",
    tenancy: "agency",
    tenantFields: ["agencyId", "scope (resource ownership re-checked at evaluation)"],
    sourceOfTruth: "PortalState.accessGrants + accessRoleTemplates, governance pinned to the LIVE realm (accessControl.ts).",
    plane: "operational",
    provenance: "Minted directly by a manager or by approving an access request; every mutation audited.",
    timestamps: { created: "createdAt", updated: "updatedAt", effective: "expiresAt / revokedAt bound the effective window" },
    sensitivity: "internal",
    retention: "Revoked grants are retained with revokedAt/revokedBy/revokeReason — the audit trail, never deleted.",
    lifecycle: {
      states: ["active", "expired", "revoked"],
      transitions: { active: ["expired", "revoked"] },
      notes: "Expiry is passive (expiresAt in the past); revocation is an audited mutation bumping the user's accessRev.",
    },
    relationships: [
      { to: "userAccount", kind: "belongs-to", via: "userId" },
      { to: "approvalRequest", kind: "references", via: "requestId" },
      { to: "tenant", kind: "belongs-to", via: "agencyId" },
    ],
  },
  {
    id: "approvalRequest",
    label: "Approval request (access request)",
    definition:
      "A gated ask for capabilities. Request states are pending|approved|denied|cancelled; " +
      "'expired' and 'revoked' are GRANT lifecycle, not request states — approval mints a grant " +
      "whose capabilities and expiry must NARROW the request, and revocation acts on that grant.",
    idRule: "AccessRequest.id; idempotencyKey dedupes.",
    tenancy: "agency",
    tenantFields: ["agencyId"],
    sourceOfTruth: "PortalState.accessRequests (server/accessControl.ts)",
    plane: "operational",
    provenance: "Created by any member (universal 'access.request' baseline); reviewed by a non-self reviewer.",
    timestamps: { created: "createdAt", updated: "updatedAt" },
    sensitivity: "internal",
    retention: "Retained in all terminal states as audit evidence.",
    lifecycle: {
      states: ["pending", "approved", "denied", "cancelled"],
      transitions: { pending: ["approved", "denied", "cancelled"] },
      notes: "Self-approval rejected; approval must narrow requested capabilities and expiry.",
    },
    relationships: [
      { to: "resourceEntitlement", kind: "references", via: "grant minted on approval" },
      { to: "userAccount", kind: "belongs-to", via: "userId" },
    ],
  },

  // ── People & organisations (CRM) ─────────────────────────────────────────
  {
    id: "person",
    label: "Person",
    definition:
      "One real human out in the world the agency does business with — the canonical CRM record. " +
      "Lead / Contact / Client are FACETS hanging off the person, retained through reclassification, " +
      "never deleted ('changing what somebody IS must never destroy what they DID'). Distinct from " +
      "a Client (a workspace, not a human) and from a user account (a login).",
    idRule: "Person.id — opaque; deduped by normalised email/phone within the agency (person-identity-dedupe).",
    tenancy: "agency",
    tenantFields: ["agencyId"],
    sourceOfTruth: "PortalState.persons (server/persons.ts)",
    plane: "operational",
    provenance: "Created from enquiries, imports, manual entry; classification changes append to classificationHistory with from/to/at/by/source.",
    timestamps: { created: "createdAt", updated: "updatedAt" },
    sensitivity: "personal",
    retention: "Erasable via the subject-request / clientErasure sweep; classification history is append-only until erasure.",
    lifecycle: {
      states: ["enquiry", "contact", "lead", "client"],
      notes: "PersonState is DERIVED from facets (derivePersonState), never hand-set; PersonClassification is the 9-valued hand-set field with append-only history.",
    },
    confidence: "Emails/phones keep normalised value + original raw; shared phones marked to never identify a person without a compatible name.",
    relationships: [
      { to: "organisation", kind: "references", via: "organisationId + organisationLinks[] (suggested|confirmed|rejected; rejected links retained)" },
      { to: "client", kind: "references", via: "facets.clientIds / Client.personId" },
      { to: "enquiry", kind: "references", via: "facets.enquiryIds" },
    ],
  },
  {
    id: "organisation",
    label: "Organisation",
    definition:
      "A real-world company the agency does business with (the customer's company). Explicitly NOT " +
      "a TradingCompany (the agency's own business) and NOT a workspace (Aqua-side structure).",
    idRule: "Organisation.id — opaque; agency-scoped.",
    tenancy: "agency",
    tenantFields: ["agencyId"],
    sourceOfTruth: "PortalState.organisations (server/organisations.ts)",
    plane: "operational",
    provenance: "Created from enquiry company fields, domain inference, or manual entry.",
    timestamps: { created: "createdAt", updated: "updatedAt" },
    sensitivity: "personal",
    retention: "Erasable with the owning agency's subject flows; facets retained through reclassification.",
    relationships: [
      { to: "person", kind: "has-many", via: "Person.organisationLinks" },
      { to: "client", kind: "references", via: "facets.clientIds" },
    ],
  },
  {
    id: "prospect",
    label: "Prospect (lead)",
    definition:
      "A person/organisation being pursued before purchase — represented as a pipeline card plus the " +
      "Person's 'lead' facet. Not a separate table: prospect-ness is a lifecycle position, and " +
      "deleting it must never delete the person or their history.",
    idRule: "PipelineCard.id carries the pursued record; Person.facets.leadId links back.",
    tenancy: "agency",
    tenantFields: ["agencyId"],
    sourceOfTruth: "PortalState.pipelineCards + Person facets (server/pipelines.ts, server/persons.ts)",
    plane: "operational",
    provenance: "Captured from enquiries or created manually; conversion runs through leadConversionCoordinator with idempotent lease-backed operations.",
    timestamps: { created: "createdAt", updated: "updatedAt" },
    sensitivity: "personal",
    retention: "Conversion stamps lineage (Client.metadata.leadId / promotedFromLeadId); the card is retired, the person retained.",
    relationships: [
      { to: "person", kind: "references", via: "Person.facets.leadId" },
      { to: "opportunity", kind: "backed-by", via: "the same pipeline card" },
      { to: "client", kind: "references", via: "Client.metadata.leadId lineage on conversion" },
    ],
  },
  {
    id: "client",
    label: "Client (workspace)",
    definition:
      "A client WORKSPACE — the unit of delivery, products, finance and portal data. Not a human: " +
      "the human is Person (Client.personId), and one buyer relationship (relationshipId) may own " +
      "several isolated client workspaces. Client.metadata is the governed escape hatch catalogued " +
      "in lib/data/metadataContracts.ts.",
    idRule: "Client.id — opaque; slug unique within the agency.",
    tenancy: "agency",
    tenantFields: ["agencyId"],
    sourceOfTruth: "PortalState.clients (server/tenants.ts — every read filtered by agencyId, no global list helper)",
    plane: "operational",
    provenance: "Converted from a lead, imported, or created manually; lifecycleStartReason records which.",
    timestamps: { created: "createdAt", updated: "updatedAt" },
    sensitivity: "personal",
    retention: "clientErasure.ts sweeps the client's PII across state + Supabase enquiry rows (hard delete, select-verified).",
    lifecycle: {
      states: ["lead", "discovery", "design", "development", "onboarding", "live", "churned", "aqua-epic-intro", "aqua-blueprint", "aqua-diagnostics", "aqua-brand-builder", "aqua-traffic", "aqua-mastery"],
      notes: "ClientStage is a string union so agency-customised phases can extend it; the six aqua-* stages are the canonical progression. A client does NOT have one universal delivery stage — per-product service stages live in product assignments.",
    },
    relationships: [
      { to: "tenant", kind: "belongs-to", via: "agencyId" },
      { to: "person", kind: "references", via: "personId", rule: "Clients sharing relationshipId share personId." },
      { to: "tradingCompany", kind: "references", via: "companyId" },
      { to: "endCustomer", kind: "has-many", via: "EndCustomer.clientId" },
    ],
  },
  {
    id: "endCustomer",
    label: "End customer",
    definition: "A customer OF the client, using the client's customer portal. Carries denormalised agencyId for filtering.",
    idRule: "EndCustomer.id — opaque.",
    tenancy: "client",
    tenantFields: ["agencyId", "clientId"],
    sourceOfTruth: "PortalState.endCustomers",
    plane: "operational",
    provenance: "Customer-portal signup (gated by ClientEndCustomerConfig.signupsEnabled).",
    timestamps: { created: "createdAt" },
    sensitivity: "personal",
    retention: "Erased with the owning client's erasure sweep.",
    relationships: [
      { to: "client", kind: "belongs-to", via: "clientId" },
      { to: "userAccount", kind: "references", via: "role end-customer + clientId" },
    ],
  },
  {
    id: "contactPoint",
    label: "Contact point",
    definition:
      "A way to reach a person: PersonEmail/PersonPhone (normalised value + original raw + label + " +
      "isPrimary), plus the linked-contact entries kept on Client.metadata.linkedContacts. Zero vs " +
      "missing is explicit: an absent array means never captured, an empty one means known-none.",
    idRule: "Embedded in Person (value-keyed) and ClientLinkedContact.id on the client.",
    tenancy: "agency",
    tenantFields: ["owning record's agencyId"],
    sourceOfTruth: "Person.emails[]/phones[] (canonical); Client.metadata.linkedContacts (legacy, migration target).",
    plane: "operational",
    provenance: "Captured from enquiries/imports; normalisation via normaliseIdentityEmail/Phone (default country code 44).",
    timestamps: {},
    sensitivity: "personal",
    retention: "Erased with the owning person/client.",
    relationships: [{ to: "person", kind: "belongs-to", via: "embedded" }],
  },

  // ── Journey: enquiries, opportunities, lifecycle ─────────────────────────
  {
    id: "enquiry",
    label: "Enquiry",
    definition:
      "One inbound ask from a visitor — the raw capture row. Core vocabulary is name/email/phone/" +
      "message (formCapture CORE_KEYS); a client-database submission maps ONTO that vocabulary with " +
      "per-field provenance (configured|detected|absent) and keeps unrecognised answers in " +
      "additional[] rather than dropping them.",
    idRule: "brand_enquiries.id (uuid) for website capture; enquiryContactDetails augments in-state.",
    tenancy: "agency",
    tenantFields: ["agency_id column (migration written 20260820150000, applied by hand) with metadata->>'agencyId' fallback"],
    sourceOfTruth: "Supabase brand_enquiries (raw plane) + PortalState.enquiryContactDetails (operator additions).",
    plane: "raw",
    provenance: "Aqua Tag website capture (anon INSERT gated by consent policy), client-form ingestion, manual entry. Routing metadata records siteKey/pagePath/agency/client addressing.",
    timestamps: { created: "created_at (ingestion)", occurred: "core.submittedAt where a client row carries its own timestamp — deliberately distinct from Aqua's" },
    sensitivity: "personal",
    retention: "Hard delete on erasure (.delete().select-verified so an RLS-filtered no-op fails loudly).",
    confidence: "Field mapping provenance per core field; identity resolution stamps its result + confidence on the row's metadata.",
    relationships: [
      { to: "person", kind: "references", via: "identity resolution → Person.facets.enquiryIds" },
      { to: "client", kind: "references", via: "metadata.clientId when routed/linked" },
      { to: "tenant", kind: "belongs-to", via: "agency_id" },
    ],
  },
  {
    id: "journey",
    label: "Journey (pipeline)",
    definition:
      "The staged sales movement a prospect travels — a Pipeline with ordered stages. Owns people " +
      "movement, meetings, qualification and conversion (Journey owns the pre-sale world; " +
      "Fulfilment owns post-sale work).",
    idRule: "Pipeline.id; stages ordered within the pipeline.",
    tenancy: "agency",
    tenantFields: ["agencyId"],
    sourceOfTruth: "PortalState.pipelines (server/pipelines.ts)",
    plane: "operational",
    provenance: "Operator-defined; defaults seeded per agency.",
    timestamps: { created: "createdAt", updated: "updatedAt" },
    sensitivity: "internal",
    retention: "Retained; cards move rather than pipelines deleting.",
    relationships: [{ to: "opportunity", kind: "has-many", via: "PipelineCard.pipelineId" }],
  },
  {
    id: "opportunity",
    label: "Opportunity (pipeline card)",
    definition:
      "One pursued deal positioned on a journey stage. The card is the opportunity; the human is the " +
      "Person; conversion promotes to a Client workspace with lineage stamps.",
    idRule: "PipelineCard.id — opaque.",
    tenancy: "agency",
    tenantFields: ["agencyId"],
    sourceOfTruth: "PortalState.pipelineCards (server/pipelines.ts)",
    plane: "operational",
    provenance: "Captured from enquiries or created manually; stage transitions recorded with stageEnteredAt.",
    timestamps: { created: "capturedAt", occurred: "stageEnteredAt / convertedAt", updated: "updatedAt" },
    sensitivity: "personal",
    retention: "Retired on conversion; person + history retained.",
    lifecycle: {
      states: ["new", "contacted", "meeting", "proposal", "won", "lost", "client", "churned"],
      notes: "CommercialRecordState — the canonical funnel vocabulary the intelligence layer reads.",
    },
    relationships: [
      { to: "journey", kind: "belongs-to", via: "pipelineId" },
      { to: "person", kind: "references", via: "person facets" },
      { to: "client", kind: "references", via: "conversion lineage" },
    ],
  },
  {
    id: "lifecycleStage",
    label: "Lifecycle stage",
    definition:
      "A named position in a lifecycle: ClientStage on the client workspace, CommercialRecordState on " +
      "funnel records, per-product service stages on product assignments. Event time (when the move " +
      "happened) is recorded distinctly from ingestion time (when Aqua learned).",
    idRule: "String unions per lifecycle (ClientStage, CommercialRecordState).",
    tenancy: "global",
    sourceOfTruth: "server/types.ts unions; positions held on the owning records.",
    plane: "config",
    provenance: "Code-defined vocabularies; agency-customised phases may extend ClientStage.",
    timestamps: {},
    sensitivity: "none",
    retention: "n/a — code-defined.",
    relationships: [
      { to: "client", kind: "references", via: "Client.stage" },
      { to: "opportunity", kind: "references", via: "state" },
    ],
  },

  // ── Communication ────────────────────────────────────────────────────────
  {
    id: "conversation",
    label: "Conversation",
    definition:
      "A threaded exchange with one external identity over one connected channel (Master Inbox). " +
      "The only store family with a first-class agency_id column on every row.",
    idRule: "inbox_conversations.id; external_conversation_id carries the provider's id for idempotency.",
    tenancy: "agency",
    tenantFields: ["agency_id (real column)"],
    sourceOfTruth: "Supabase inbox_conversations (lib/server/inbox/inboxStore.ts); local .data/inbox-messaging.json fallback in dev.",
    plane: "operational",
    provenance: "Created by webhook ingestion from connected providers (Meta messaging) or outbound sends.",
    timestamps: { created: "created_at", updated: "updated_at", occurred: "message timing fields" },
    sensitivity: "personal",
    retention: "Erased via clientErasure's inbox sweep; webhook events pruned past retention.",
    relationships: [
      { to: "communication", kind: "has-many", via: "inbox_messages.conversation_id" },
      { to: "provider", kind: "belongs-to", via: "connection_id" },
      { to: "person", kind: "references", via: "inbox_contact_identities → lead/contact/client links" },
    ],
  },
  {
    id: "communication",
    label: "Communication (message)",
    definition:
      "One message in a conversation — direction, type, body, attachments, provider status. " +
      "sent_at is event time; created_at is ingestion time; the two are never conflated.",
    idRule: "inbox_messages.id; external_message_id dedupes provider redelivery.",
    tenancy: "agency",
    tenantFields: ["agency_id (real column)"],
    sourceOfTruth: "Supabase inbox_messages",
    plane: "operational",
    provenance: "Webhook ingestion (claim_inbox_webhook_events lease RPC → idempotent append_inbox_provider_message) or outbound send with resumable reply parts.",
    timestamps: { created: "created_at", occurred: "sent_at", updated: "updated_at" },
    sensitivity: "personal",
    retention: "Erased with the conversation.",
    relationships: [{ to: "conversation", kind: "belongs-to", via: "conversation_id" }],
  },
  {
    id: "inboxItem",
    label: "Inbox item",
    definition:
      "One actionable row in the Master Inbox — a projection uniting website enquiries, social " +
      "conversations and notices into 'Needs you / Inbox / Updates'. A read model, not a store: " +
      "each row points back at its source record.",
    idRule: "Derived from source ids; no storage of its own.",
    tenancy: "agency",
    tenantFields: ["inherited from sources"],
    sourceOfTruth: "Assembled server-side from brand_enquiries + inbox_* + clientFormNotices.",
    plane: "derived",
    provenance: "Rebuilt on read; the needs-you badge combines alerts + action queues server-side without double counting.",
    timestamps: { measured: "assembled at request time" },
    sensitivity: "personal",
    retention: "n/a — rebuilt from sources.",
    relationships: [
      { to: "enquiry", kind: "references", via: "source id" },
      { to: "conversation", kind: "references", via: "source id" },
    ],
  },
  {
    id: "action",
    label: "Action",
    definition:
      "A unit of attention the operator can clear. Every action states HOW it is dealt with " +
      "(in-app | off-system | judgement) and what clears it; never a Resolve control for work that " +
      "happens outside Aqua. Completions are recorded, not deleted.",
    idRule: "CompletedAction keyed by the action's stable id.",
    tenancy: "agency",
    tenantFields: ["agencyId"],
    sourceOfTruth: "PortalState.completedActions (server/completedActions.ts); the open set is derived.",
    plane: "operational",
    provenance: "Actions derive from operational alerts/queues; completing one writes the completion record (action.completed event).",
    timestamps: { occurred: "completedAt" },
    sensitivity: "internal",
    retention: "Completions retained as history.",
    relationships: [{ to: "auditEvent", kind: "references", via: "activity log entries" }],
  },

  // ── Delivery: projects, fulfilment, tasks ────────────────────────────────
  {
    id: "project",
    label: "Project (dev project)",
    definition:
      "A software project the Dev Workspace can open — repository, preview supervisor, editor gates. " +
      "Distinct from fulfilment work: a project is a technical artefact; fulfilment is the operating " +
      "model delivering a sold service (phases, checklists, briefs, deliverables).",
    idRule: "DevProject.id; client attachment checked loudly at grant time (clientProjectAccess.ts is the ONE provisioning place).",
    tenancy: "agency",
    tenantFields: ["agencyId", "clientId (attachment)"],
    sourceOfTruth: "PortalState.devProjects",
    plane: "operational",
    provenance: "Registered by operators; client projects provisioned from github-templates/starters.",
    timestamps: { created: "createdAt", updated: "updatedAt" },
    sensitivity: "internal",
    retention: "Retained; working trees live on the filesystem outside state.",
    relationships: [
      { to: "client", kind: "references", via: "clientId" },
      { to: "resourceEntitlement", kind: "references", via: "project-kind scopes" },
    ],
  },
  {
    id: "fulfilmentItem",
    label: "Fulfilment item (phase step)",
    definition:
      "Work delivering a sold service: phase instances with checklists, briefs and deliverables, " +
      "driven by product/service assignments — each service progresses independently (a client does " +
      "not have one universal delivery stage).",
    idRule: "Phase instance ids under PortalState.phases; steps keyed within.",
    tenancy: "client",
    tenantFields: ["agencyId", "clientId"],
    sourceOfTruth: "PortalState.phases (server/phaseApplier.ts + phase engine)",
    plane: "operational",
    provenance: "Applied from templates when a product/service is assigned; advancing emits phase.advanced.",
    timestamps: { occurred: "advancement timestamps", updated: "updatedAt" },
    sensitivity: "internal",
    retention: "Retained as the delivery history.",
    relationships: [
      { to: "client", kind: "belongs-to", via: "clientId" },
      { to: "product", kind: "references", via: "the assignment that applied the phase" },
      { to: "task", kind: "has-many", via: "checklist items" },
    ],
  },
  {
    id: "task",
    label: "Task",
    definition:
      "A generic unit of work with optional client association. A generic task belongs to no single " +
      "client, so its access element is client.overview (the 'may you see this client at all' " +
      "element) when it names one. Dependencies are ordering edges between tasks/checklist items.",
    idRule: "Task.id; TaskTemplate.id for reusable shapes.",
    tenancy: "agency",
    tenantFields: ["agencyId", "clientId (optional association)"],
    sourceOfTruth: "PortalState.tasks + taskTemplates",
    plane: "operational",
    provenance: "Created by operators, templates, or automations.",
    timestamps: { created: "createdAt", updated: "updatedAt", occurred: "completedAt" },
    sensitivity: "internal",
    retention: "Retained.",
    relationships: [
      { to: "client", kind: "references", via: "clientId (associationElement-gated)" },
      { to: "task", kind: "references", via: "dependency edges" },
    ],
  },

  // ── Commerce & finance ───────────────────────────────────────────────────
  {
    id: "product",
    label: "Product / service",
    definition:
      "A sellable offering (AgencyProduct). Assigning one to a client drives that client's modules " +
      "and its own independent service stages. 'Service' is not a separate entity: a service is a " +
      "product whose delivery is ongoing work.",
    idRule: "AgencyProduct.id.",
    tenancy: "agency",
    tenantFields: ["agencyId"],
    sourceOfTruth: "PortalState.agencyProducts (server/agencyProducts.ts)",
    plane: "operational",
    provenance: "Operator-defined; origin-template seeding may copy designs/templates minus branding.",
    timestamps: { created: "createdAt", updated: "updatedAt" },
    sensitivity: "internal",
    retention: "Retained; assignment history kept on the client (portalProductAssignmentHistory).",
    relationships: [
      { to: "client", kind: "references", via: "assignments in Client.metadata (product namespace)" },
      { to: "fulfilmentItem", kind: "references", via: "phases the assignment applies" },
    ],
  },
  {
    id: "financialEvent",
    label: "Financial event (invoice / payment)",
    definition:
      "A money fact: an invoice issued, a payment received, a payment plan instalment. TODAY these " +
      "live in the finance namespace of Client.metadata (clientPaymentPlans, contracts, invoice " +
      "fields on activity metadata) — catalogued as a migration target, not a modelled table. " +
      "A MISSING date must render as missing, never as today (issue #169).",
    idRule: "invoiceId / expenseId / checkoutOperationId (idempotency key) on the carrying records.",
    tenancy: "client",
    tenantFields: ["owning client's agencyId + clientId"],
    sourceOfTruth: "Client.metadata finance namespace + activity metadata (metadataContracts.ts 'finance'); no dedicated collection yet.",
    plane: "operational",
    provenance: "Recorded by finance flows; checkout operations idempotent by checkoutOperationId.",
    timestamps: { occurred: "issuedAt / paidAt / dueAt", created: "carrying record's ts" },
    sensitivity: "internal",
    retention: "Retained as financial record; erasure preserves obligations while removing personal identifiers.",
    relationships: [
      { to: "client", kind: "belongs-to", via: "carrying client record" },
      { to: "product", kind: "references", via: "line items" },
    ],
  },

  // ── Providers, events, audit, evidence ───────────────────────────────────
  {
    id: "provider",
    label: "Provider (integration connection)",
    definition:
      "A connected external system: inbox channel connections (encrypted access tokens, AES-256-GCM " +
      "vault), integrationConnections, command-calendar connections, portal connections. Credentials " +
      "are credential-class: never copied into derived datasets or logs.",
    idRule: "Connection id per store; external_account_id carries the provider's identity.",
    tenancy: "agency",
    tenantFields: ["agency_id (inbox tables) / agencyId (state collections)"],
    sourceOfTruth: "inbox_channel_connections (Supabase) + PortalState.integrationConnections/portalConnections/commandCalendarConnections",
    plane: "operational",
    provenance: "OAuth/manual connection flows; status + webhook_status track health.",
    timestamps: { created: "created_at", updated: "updated_at", measured: "last_sync_at" },
    sensitivity: "credential",
    retention: "Deleted on disconnect; tokens encrypted at rest (PORTAL_VAULT_ENCRYPTION_KEY).",
    relationships: [{ to: "conversation", kind: "has-many", via: "connection_id" }],
  },
  {
    id: "integrationEvent",
    label: "Integration event",
    definition:
      "One inbound provider payload, kept as received: inbox_webhook_events with provider, event_key " +
      "(idempotency), payload jsonb, status, attempts, available_at — claimed via a lease RPC so " +
      "concurrent instances never double-process. The RAW plane's canonical example.",
    idRule: "event_key — provider-derived, unique; redelivery dedupes on it.",
    tenancy: "global",
    tenantFields: ["resolved to an agency during processing"],
    sourceOfTruth: "Supabase inbox_webhook_events",
    plane: "raw",
    provenance: "Provider webhooks; processed exactly-once via claim_inbox_webhook_events.",
    timestamps: { created: "available_at", occurred: "payload's own event time", updated: "processed_at" },
    sensitivity: "personal",
    retention: "Hard-deleted past INBOX_WEBHOOK_RETENTION_DAYS.",
    relationships: [{ to: "communication", kind: "references", via: "processing appends messages" }],
  },
  {
    id: "domainEvent",
    label: "Domain event (outbox record)",
    definition:
      "One durable announcement that a business fact happened — recorded atomically inside the " +
      "same mutation as the domain change, then drained to the in-memory bus at-least-once. " +
      "Carries actor, tenant, source, correlation and causation ids, and keeps occurredAt " +
      "(event time) strictly apart from recordedAt (ingestion time). Reliability and lineage " +
      "only — state is NOT rebuildable from these records and no event-sourcing claim is made.",
    idRule: "OutboxEvent.id — caller-supplied idempotency key or minted obx_<uuid>; recording an existing id is a no-op.",
    tenancy: "agency",
    tenantFields: ["agencyId", "clientId (optional)"],
    sourceOfTruth: "PortalState.outbox (server/outbox.ts)",
    plane: "operational",
    provenance: "Written by domain modules via recordOutboxEvent inside their own mutate(); versioned past-tense names.",
    timestamps: { occurred: "occurredAt", created: "recordedAt", updated: "deliveredAt" },
    sensitivity: "internal",
    retention: "Delivered events pruned after 14 days (hard cap 5,000, oldest delivered first); pending events are never pruned.",
    lifecycle: {
      states: ["pending", "delivered"],
      transitions: { pending: ["delivered"] },
      notes: "Emit-then-mark: a crash between the two redelivers (duplicate a consumer must tolerate) rather than silently losing the event.",
    },
    relationships: [
      { to: "tenant", kind: "belongs-to", via: "agencyId" },
      { to: "domainEvent", kind: "references", via: "causationId / correlationId" },
      { to: "auditEvent", kind: "references", via: "the same operation typically writes both; the audit entry is the human trail, this is the machine one" },
    ],
  },
  {
    id: "auditEvent",
    label: "Audit event (activity entry)",
    definition:
      "The durable audit trail: actor (optional), tenant, category, past-tense action verb " +
      "('client.created'), message, redacted metadata (secret-shaped keys → '[redacted]'). " +
      "Idempotent by key; capped at 50,000 entries with oldest-first eviction. Distinct from the " +
      "in-memory event bus, which is fire-and-forget and NOT durable.",
    idRule: "ActivityEntry.id — sha256 of idempotencyKey where provided.",
    tenancy: "agency",
    tenantFields: ["agencyId"],
    sourceOfTruth: "PortalState.activity (server/activity.ts)",
    plane: "operational",
    provenance: "Written by domain mutations; access-kernel writes its own audited actions (access.grant.revoked, access.request.*).",
    timestamps: { occurred: "ts" },
    sensitivity: "internal",
    retention: "Hard cap 50,000 — eviction is silent; flagged in SOURCE-INVENTORY as a lineage risk.",
    relationships: [
      { to: "userAccount", kind: "references", via: "actorUserId/actorEmail" },
      { to: "client", kind: "references", via: "clientId" },
    ],
  },
  {
    id: "evidenceItem",
    label: "Evidence item (radar evidence point)",
    definition:
      "One retained measurement behind the Radar: series keyed by domain/family/source with points, " +
      "hourly rollups, rolling baselines. Missing evidence is a visible blind spot, never a healthy " +
      "pass; confidence and readiness are first-class alongside health.",
    idRule: "Series id = domain/family/source composite; points keyed by timestamp.",
    tenancy: "agency",
    tenantFields: ["agencyId (collection keying)"],
    sourceOfTruth: "PortalState.radarEvidence (+ radarMemory, radarSyntheticProbes, radarInfraHealth)",
    plane: "derived",
    provenance: "Written by radar sweeps (instant/probe/rollup tiers); probes cross network/DB.",
    timestamps: { measured: "point.at", created: "firstSeenAt", updated: "lastSeenAt" },
    sensitivity: "internal",
    retention: "Retention-pruned per series; evidence can be up to 24h stale under the daily probe cron (issue #170 — surfaced honestly).",
    confidence: "latestStatus per point; baselineReady/rollingBaseline under 3 points is undefined, never fabricated.",
    relationships: [{ to: "tenant", kind: "belongs-to", via: "collection keying" }],
  },
] as const;

// ─── Explicit distinctions the vocabulary depends on ───────────────────────

export interface SemanticDistinction {
  a: string;
  b: string;
  rule: string;
}

export const SEMANTIC_DISTINCTIONS: readonly SemanticDistinction[] = [
  {
    a: "person",
    b: "client",
    rule: "A Person is a human; a Client is a workspace. Client.personId names the human; one relationship may own several client workspaces sharing one personId.",
  },
  {
    a: "organisation",
    b: "workspace",
    rule: "An Organisation is a real-world company the agency does business with; a workspace is Aqua-side structure (governed area / client workspace / settings). TradingCompany is the agency's OWN business — a third thing.",
  },
  {
    a: "userAccount",
    b: "staffMember",
    rule: "A user account is a login (users.ts); a staff member is an employment record (people.ts). They link via PeopleEmployee.userId but do not share storage and must not learn to. The CRM Person is a third, separate record.",
  },
  {
    a: "role",
    b: "permission",
    rule: "A role gates which surfaces a session may enter; a permission (capability) gates one action; a resource entitlement (grant) binds capabilities to one scope + environment for one user. Roles never expand capabilities beyond the owner baseline rules.",
  },
  {
    a: "project",
    b: "fulfilmentItem",
    rule: "A project is a technical artefact (repository, preview, editor); fulfilment is the operating model delivering a sold service (phases, briefs, deliverables). A client engagement may involve both; neither implies the other.",
  },
  {
    a: "enquiry",
    b: "prospect",
    rule: "An enquiry is one inbound ask (raw capture); a prospect is a pursued relationship positioned on a journey. Many enquiries may attach to one prospect via identity resolution.",
  },
] as const;

/** Event time vs ingestion time vs update time — the timestamp doctrine. */
export const TIMESTAMP_DOCTRINE = {
  occurred: "When the business fact happened in the world (sent_at, issuedAt, ts on activity). Provider payloads carry their own.",
  created: "When Aqua first recorded it (created_at/createdAt) — ingestion time, never a substitute for occurred.",
  updated: "Last mutation of the record (updatedAt) — bookkeeping, carries no business meaning.",
  effective: "When a value starts applying (KpiTargetOverride.effectiveFrom, AccessGrant expiry window).",
  measured: "When a reading was taken (measuredAt on KPIs, point.at on evidence). A missing reading is null/undefined, never 0 and never now().",
} as const;

/** Missing vs zero vs false vs unknown vs not-applicable — the value doctrine. */
export const VALUE_DOCTRINE = {
  missing: "null/undefined — never captured or not yet measured. Renders as '—' or 'No reading'; a missing date must never render as today (issue #169).",
  zero: "A real measured zero (0 leads captured). Only valid when the instrument was live; demandFlow.pageviews is null when no Aqua Tag reading exists, never a fabricated 0.",
  false: "An explicit negative answer (consent declined, signupsEnabled: false).",
  unknown: "Instrumented but currently unanswerable — Radar 'blind' status; surfaced as a blind spot, never a healthy pass.",
  notApplicable: "The dimension does not exist for this record (denominatorId absent on a single-operand custom KPI) — modelled by field absence, not sentinel values.",
} as const;

// ─── PortalState coverage — every collection classified ────────────────────

export interface CollectionClassification {
  /** The semantic entity this collection materialises, when one exists. */
  entity?: string;
  plane: DataPlane;
  note: string;
}

/**
 * Every top-level PortalState collection, classified. The smoke test asserts
 * this map covers exactly the keys of `createEmptyPortalState()` (plus the
 * optional `radarInfraHealth`), so a NEW collection cannot ship without a
 * declared owner, plane and note — the escape hatch closes at review time.
 */
export const PORTAL_STATE_COVERAGE: Readonly<Record<string, CollectionClassification>> = {
  // Tenancy & identity
  agencies: { entity: "tenant", plane: "operational", note: "Tenant rows, including company-portal backing tenants." },
  tradingCompanies: { entity: "tradingCompany", plane: "operational", note: "Second tier of the three-tier model." },
  clients: { entity: "client", plane: "operational", note: "Client workspaces; metadata governed by metadataContracts." },
  endCustomers: { entity: "endCustomer", plane: "operational", note: "Customers of clients." },
  users: { entity: "userAccount", plane: "operational", note: "Logins keyed by lower-cased email; scrypt hashes; credential-class." },
  accessRoleTemplates: { entity: "resourceEntitlement", plane: "operational", note: "Reusable capability sets." },
  accessGrants: { entity: "resourceEntitlement", plane: "operational", note: "Grants; revoked retained as audit." },
  accessRequests: { entity: "approvalRequest", plane: "operational", note: "pending|approved|denied|cancelled." },
  staffProvisioningOperations: { entity: "staffMember", plane: "operational", note: "Idempotency ledger for staff provisioning." },
  clientProjectOperations: { entity: "client", plane: "operational", note: "Idempotency ledger for client-website provision/publish/deploy; retries adopt the recorded folder, repository or deployment." },

  // CRM people & organisations
  persons: { entity: "person", plane: "operational", note: "Canonical humans with facets + classification history." },
  organisations: { entity: "organisation", plane: "operational", note: "Customer companies." },
  identityResolutionReviews: { entity: "person", plane: "operational", note: "Frozen resolution results + human decisions (pending|linked|auto-linked|parked|dismissed)." },
  enquiryContactDetails: { entity: "enquiry", plane: "operational", note: "Operator-added contact details augmenting raw enquiry rows." },

  // Journey
  pipelines: { entity: "journey", plane: "operational", note: "Staged sales journeys." },
  pipelineCards: { entity: "opportunity", plane: "operational", note: "Deals on stages; conversion stamps lineage." },
  clientFormNotices: { entity: "enquiry", plane: "operational", note: "Notices raised from client-form ingestion." },

  // Communication & attention
  completedActions: { entity: "action", plane: "operational", note: "Cleared-attention history." },
  operationalAlertPreferences: { plane: "config", note: "Per-operator alert tuning." },

  // Delivery
  phases: { entity: "fulfilmentItem", plane: "operational", note: "Phase instances with checklists." },
  tasks: { entity: "task", plane: "operational", note: "Generic tasks, optionally client-associated." },
  taskTemplates: { entity: "task", plane: "config", note: "Reusable task shapes." },
  devProjects: { entity: "project", plane: "operational", note: "Dev Workspace projects." },
  devTeamWorkspaceFiles: { entity: "project", plane: "operational", note: "Authored-file overlay; sidecar row on Supabase; row-locking RPC writer." },
  editorAiConfigs: { entity: "project", plane: "config", note: "Editor-AI per-project config." },
  editorAiConversations: { entity: "project", plane: "operational", note: "Editor-AI threads." },
  clientMilestones: { entity: "fulfilmentItem", plane: "operational", note: "Client milestone records." },

  // Commerce & products
  agencyProducts: { entity: "product", plane: "operational", note: "Sellable offerings." },
  experiencePackages: { entity: "product", plane: "operational", note: "Packaged experiences." },
  contractTemplates: { entity: "financialEvent", plane: "config", note: "Contract shapes; agreements live on client metadata (finance namespace)." },
  legalDocuments: { plane: "operational", note: "Company legal documents." },

  // Providers & integrations
  integrationConnections: { entity: "provider", plane: "operational", note: "Connected external systems." },
  portalConnections: { entity: "provider", plane: "operational", note: "Portal-level provider connections." },
  externalAssistantApiKeys: { entity: "provider", plane: "operational", note: "External assistant API keys — credential-class." },
  externalAssistantActionProposals: { plane: "operational", note: "Assistant-proposed work awaiting human acceptance." },
  assistant: { plane: "operational", note: "Assistant state per agency." },
  customAIs: { plane: "config", note: "Operator-defined AI configurations." },
  agencyMasterTagKeys: { entity: "provider", plane: "config", note: "Aqua Tag master site keys." },
  websiteSources: { entity: "provider", plane: "config", note: "Tagged-site routing registry (host → destination)." },
  websiteSiteConfigs: { entity: "provider", plane: "config", note: "Per-site tag config: injections + imported form schemas." },
  agencyWebsites: { plane: "operational", note: "Agency website records." },

  // Audit & activity
  activity: { entity: "auditEvent", plane: "operational", note: "The durable audit trail; 50k hard cap." },
  outbox: { entity: "domainEvent", plane: "operational", note: "Transactional outbox: durable domain events, recorded atomically with their mutation, drained to the bus at-least-once (server/outbox.ts)." },
  clientRecordLedger: { entity: "auditEvent", plane: "derived", note: "Internal client history projection incl. entries a client must never see; actor lives on ActivityEntry." },
  subjectRequests: { plane: "operational", note: "GDPR subject requests driving erasure sweeps." },
  websiteDemoSignups: { plane: "operational", note: "Public AquaCRM demo-gate signups and their consent {timestamp, terms version}. Untenanted personal data, held in the `website-demo` data realm and never the live one; erasable by contact detail via server/websiteDemo.ts." },
  breachIncidents: { plane: "operational", note: "GDPR Art. 33/34 breach register: the 72-hour clock runs from discovery, and Art. 33(5) keeps the decisions NOT to notify on the record too." },

  // Derived intelligence
  radarMemory: { entity: "evidenceItem", plane: "derived", note: "Sweep-over-sweep memory digests." },
  radarSyntheticProbes: { entity: "evidenceItem", plane: "derived", note: "Synthetic probe results." },
  radarEvidence: { entity: "evidenceItem", plane: "derived", note: "The evidence vault: series, points, hourly rollups, baselines." },
  radarInfraHealth: { entity: "evidenceItem", plane: "derived", note: "Latest infra sweep snapshot (optional key)." },
  customKpis: { plane: "config", note: "Guided custom KPI definitions combining registry descriptors." },
  performanceExperiments: { plane: "operational", note: "Recorded performance experiments." },

  // Command Centre / planning
  dashboardDayPlans: { plane: "operational", note: "Operator day plans." },
  dashboardWeekPlans: { plane: "operational", note: "Operator week plans." },
  dashboardWorkSessions: { plane: "operational", note: "Recorded work sessions." },
  commandCalendarEntries: { plane: "operational", note: "Command calendar entries incl. goals/quotas." },
  commandCalendarConnections: { entity: "provider", plane: "operational", note: "Calendar provider connections." },
  commandCalendarSources: { entity: "provider", plane: "config", note: "Calendar source registry." },
  commandCalendarExternalEvents: { plane: "raw", note: "Imported external calendar events." },
  commandCalendarEventCreateOperations: { plane: "operational", note: "Idempotency ledger for event creation." },

  // Client portal & content
  clientPortalTemplates: { plane: "config", note: "Portal templates; sidecar row on Supabase (18.5% of live doc)." },
  clientPortalInstances: { plane: "operational", note: "Per-client portal instances; versioned template updates." },
  portalEditor: { plane: "operational", note: "Portal editor state." },
  companyProfiles: { plane: "operational", note: "Company profile content." },
  clientDelight: { plane: "operational", note: "Client delight records." },

  // HR / People (employment domain — distinct from CRM persons)
  peopleApplications: { entity: "staffMember", plane: "operational", note: "Job applications." },
  peopleEmployees: { entity: "staffMember", plane: "operational", note: "Employment records; pay redacted at boundaries." },
  peopleLeaveRequests: { entity: "staffMember", plane: "operational", note: "Leave requests." },
  peopleShifts: { entity: "staffMember", plane: "operational", note: "Shift records." },
  peopleTrainingAssignments: { entity: "staffMember", plane: "operational", note: "Training assignments." },
  peopleTrainingModules: { entity: "staffMember", plane: "config", note: "Training module definitions." },
  peopleFreelancerJobs: { entity: "staffMember", plane: "operational", note: "Freelancer jobs (client.fulfilment association element)." },
  peopleRecognitions: { entity: "staffMember", plane: "operational", note: "Recognitions." },
  peopleFeedback: { entity: "staffMember", plane: "operational", note: "Feedback records." },
  peopleProcessConfig: { plane: "config", note: "People process configuration." },
  peopleContracts: { entity: "staffMember", plane: "operational", note: "Employment contracts." },
  peopleChannels: { plane: "operational", note: "Internal channels." },
  peopleMessages: { plane: "operational", note: "Internal channel messages." },
  peopleChannelReads: { plane: "operational", note: "Read markers." },
  freelancerAccessConfig: { plane: "config", note: "Contractor visibility policy (per agency)." },
  freelancerJobOverride: { plane: "config", note: "Per-job contractor policy overrides." },

  // Notepad / automations / SOPs / misc operator tooling
  notepadFolders: { plane: "operational", note: "Notepad folders." },
  notepadNotes: { plane: "operational", note: "Notepad notes." },
  automationFolders: { plane: "config", note: "Automation folders." },
  automationWorkflows: { plane: "config", note: "Automation definitions triggered off the event stream." },
  automationRuns: { plane: "operational", note: "Automation run history — the durable shadow of the in-memory event bus." },
  sops: { plane: "operational", note: "Standard operating procedures." },
  sopGuides: { plane: "operational", note: "SOP guides." },
  developmentResources: { plane: "operational", note: "Development resources." },
  developmentWorkflows: { plane: "config", note: "Development workflows." },
  userChromeLayouts: { plane: "config", note: "Per-user chrome layouts incl. saved tools." },

  // Plugin platform
  pluginInstalls: { plane: "config", note: "Plugin installs per scope." },
  pluginData: { plane: "operational", note: "installId → key → value; plugin-owned, namespaced by install." },
  agencySettings: { plane: "config", note: "Agency workspace settings incl. KPI target configs." },
} as const;

/** Look up one entity. */
export function semanticEntity(id: string): SemanticEntity | undefined {
  return SEMANTIC_ENTITIES.find(entity => entity.id === id);
}

/** All entity ids — for coverage checks. */
export function semanticEntityIds(): readonly string[] {
  return SEMANTIC_ENTITIES.map(entity => entity.id);
}
