// Metadata contracts — the catalogue that turns the generic `metadata`
// escape hatches into a governed, namespaced surface.
//
// ── Why this exists ───────────────────────────────────────────────────────
//
// `Client.metadata`, `ActivityEntry.metadata`, the enquiry rows'
// `metadata` jsonb and the Supabase auth user's metadata are all typed
// `Record<string, unknown>`. That was the right call for schema stability —
// "anything that doesn't need a typed field of its own goes here" — but by
// 2026-08-30 the bags carry **123 distinct keys**, several of which are whole
// subsystems (payment plans, telemetry event logs, portal provisioning state,
// invoice fields). An uncatalogued key has no owner, no type, no sensitivity
// class and no deletion behaviour, which is exactly what a data-erasure or
// tenancy audit cannot tolerate.
//
// This module is the **single registry of every known metadata key**. It does
// not change how any key is stored — reads and writes keep working exactly as
// they do today. What it adds:
//
//   1. Every key is assigned a NAMESPACE (its owning concern), an owner
//      module, a type description, a sensitivity class and a lifecycle note.
//   2. `scripts/smoke-metadata-contracts.test.ts` scans the source tree for
//      `metadata.<key>` accesses and fails when a key is used that is not
//      catalogued here — so the escape hatch is closed *going forward*
//      without a migration.
//   3. Later strangler phases migrate one namespace at a time into typed
//      collections (see docs/data/MIGRATION-PLAN.md); the catalogue is the
//      checklist of what has to move and what it would break.
//
// Client-safe and pure: no imports from server modules.

/** Which record type carries the key today. */
export type MetadataCarrier =
  | "client" // Client.metadata (src/server/types.ts:264)
  | "enquiry" // brand_enquiries.metadata jsonb (Supabase)
  | "activity" // ActivityEntry.metadata (src/server/types.ts:782)
  | "auth-user" // Supabase auth user app metadata (aqua_* keys)
  | "consent"; // website_consent_events.metadata jsonb

/**
 * The governed namespaces. A namespace is the unit later migrations move —
 * one coherent concern, one owning module, one target store.
 */
export type MetadataNamespace =
  | "contact" // who to reach and how — PII
  | "crm-lineage" // links back to the lead/contact/enquiry a record came from
  | "identity" // identity-resolution outcomes stamped on records
  | "portal-provisioning" // client-portal build/invite/access lifecycle
  | "portal-config" // portal appearance/product wiring
  | "product" // product/service assignment + per-product process state
  | "finance" // invoices, payment plans, billing — money facts
  | "telemetry" // Aqua Tag telemetry event logs + freshness stamps
  | "inbox" // reply/call logs and inbox routing state kept on the client
  | "journey" // buying-journey / lifecycle stamps
  | "routing" // which agency/client/company an enquiry was routed to
  | "consent" // consent versions and purposes
  | "delivery" // fulfilment-facing operational state
  | "files" // file attachments recorded in metadata
  | "bespoke" // named one-off business fields (therapistName, niche, …)
  | "system"; // provisioning operations, ingestion state, misc plumbing

export type MetadataSensitivity =
  | "none" // operational, no personal data
  | "personal" // identifies or contacts a person (PII)
  | "commercial" // money/contract terms — internal-confidential
  | "credential"; // must never appear in derived datasets or logs

export interface MetadataKeyContract {
  key: string;
  carrier: MetadataCarrier;
  namespace: MetadataNamespace;
  /** What the value is — the human contract for the untyped slot. */
  type: string;
  sensitivity: MetadataSensitivity;
  /** Module that owns reads/writes of this key. */
  owner: string;
}

const contact = (key: string, type: string, owner: string, carrier: MetadataCarrier = "client"): MetadataKeyContract =>
  ({ key, carrier, namespace: "contact", type, sensitivity: "personal", owner });
const plain = (
  key: string,
  namespace: MetadataNamespace,
  type: string,
  owner: string,
  carrier: MetadataCarrier = "client",
  sensitivity: MetadataSensitivity = "none",
): MetadataKeyContract => ({ key, carrier, namespace, type, sensitivity, owner });

/**
 * Every metadata key the source tree reads or writes, catalogued.
 *
 * Sourced from a whole-tree scan on 2026-08-30 (123 keys) and classified by
 * owning concern. The smoke test keeps this list honest in BOTH directions:
 * an uncatalogued key used in source fails, and a catalogued key that no
 * source touches any more is reported so the entry can be retired.
 */
export const METADATA_KEY_CONTRACTS: readonly MetadataKeyContract[] = [
  // ── contact (PII) — who the client/lead is and how to reach them ────────
  contact("clientEmail", "string — the client's primary email", "server/tenants"),
  contact("portalLoginEmail", "string — the email their portal login uses", "server/clientPortalSetup"),
  contact("contactEmail", "string — secondary contact email", "server/tenants"),
  contact("contactName", "string — named contact person", "server/tenants"),
  contact("contactPhone", "string — contact phone", "server/tenants"),
  contact("clientPhone", "string — client phone", "server/tenants"),
  contact("phone", "string — primary phone", "server/tenants"),
  contact("businessName", "string — trading name where it differs from Client.name", "server/tenants"),
  contact("linkedContacts", "ClientLinkedContact[] — named people on this client", "lib/clients/clientContacts"),
  contact("therapistName", "string — bespoke: practitioner name (legacy seeded client)", "server/tenants"),
  // `practiceName` appears in stored data (named in the types.ts:261 comment)
  // even though no source path reads it today — retained until erasure review.
  contact("practiceName", "string — bespoke: practice name (legacy seeded client)", "server/tenants"),
  contact("niche", "string — the client's market niche", "server/tenants"),

  // ── crm-lineage — how this record traces back to its origin ─────────────
  plain("leadId", "crm-lineage", "string — the pipeline card this client was promoted from", "server/leadConversionCoordinator"),
  plain("promotedFromLeadId", "crm-lineage", "string — same lineage, earlier writer", "server/leadConversionCoordinator"),
  plain("contactId", "crm-lineage", "string — originating CRM contact id", "server/tenants"),
  plain("submissionId", "crm-lineage", "string — originating enquiry submission id", "lib/enquiries", "enquiry"),
  plain("leadSource", "crm-lineage", "string — free-text acquisition source", "server/tenants"),
  plain("source", "crm-lineage", "string — enquiry source label", "lib/enquiries", "enquiry"),
  plain("referralCodeId", "crm-lineage", "string — referral code that attributed this record", "server/agencyProducts"),
  plain("identityResolution", "identity", "IdentityResolutionResult — stamped resolution outcome", "lib/server/identityResolution", "enquiry"),
  plain("enquiryClassification", "identity", "object — classifier verdict for the enquiry", "lib/enquiries", "enquiry"),
  plain("enquiryRouteNote", "routing", "string — operator note on why the enquiry routed where it did", "lib/enquiries", "enquiry"),

  // ── routing — tenant/company/client addressing on enquiry rows ──────────
  plain("agencyId", "routing", "string — owning agency (backfilled into the agency_id column)", "lib/supabase/enquiryAgencyColumn", "enquiry"),
  plain("clientId", "routing", "string — client the enquiry routed to", "lib/enquiries", "enquiry"),
  plain("routedCompanyId", "routing", "string — trading company the enquiry routed to", "lib/enquiries", "enquiry"),
  plain("captureOnly", "routing", "boolean — site captures without routing to a client", "server/websiteSources", "enquiry"),
  plain("siteKey", "routing", "string — Aqua Tag site key that captured it", "server/websiteSources", "enquiry"),
  plain("siteName", "routing", "string — human label of the capturing site", "server/websiteSources", "enquiry"),
  plain("propertyId", "routing", "string — monitored web property id", "server/websiteSources", "enquiry"),
  plain("pagePath", "routing", "string — page the enquiry came from", "lib/enquiries", "enquiry"),
  plain("formCapture", "routing", "object — raw capture details for the submitting form", "lib/enquiries/formCapture", "enquiry"),
  plain("channel", "routing", "string — capture channel", "lib/enquiries", "enquiry"),
  plain("requestType", "routing", "string — what the visitor asked for", "lib/enquiries", "enquiry"),
  plain("notification", "routing", "object — notification routing outcome for the enquiry", "lib/enquiries", "enquiry"),

  // ── journey / lifecycle stamps ──────────────────────────────────────────
  plain("buyingJourney", "journey", "object — staged buying-journey state", "server/pipelines"),
  plain("lifecycleStartReason", "journey", "string — why the lifecycle started (converted, imported…)", "server/tenants"),
  plain("toStage", "journey", "string — stage a transition moved to", "server/activity", "activity"),
  plain("onboardingStartedAt", "journey", "number epoch ms", "server/tenants"),
  plain("churnedAt", "journey", "number epoch ms", "server/tenants"),
  plain("reactivatedAt", "journey", "number epoch ms", "server/tenants"),
  plain("suspendedAt", "journey", "number epoch ms", "server/tenants"),
  plain("archivedAt", "journey", "number epoch ms", "server/tenants"),
  plain("lastContactedAt", "journey", "number epoch ms — last outbound touch", "server/tenants"),
  plain("firstRespondedAt", "journey", "number epoch ms — first response to the enquiry", "lib/enquiries", "enquiry"),
  plain("clientLinkedAt", "journey", "number epoch ms — when identity linked enquiry→client", "lib/server/identityResolution", "enquiry"),
  plain("clientEntityType", "journey", "string — person vs organisation classification", "server/tenants"),
  plain("partyKind", "identity", "string — canonical party kind (person|organisation)", "server/persons"),
  plain("partyId", "identity", "string — canonical Person/Organisation id", "server/persons"),

  // ── portal-provisioning — the client portal's build/invite lifecycle ────
  plain("portalBuiltAt", "portal-provisioning", "number epoch ms", "server/clientPortalSetup"),
  plain("portalMode", "portal-provisioning", "string — template|custom portal mode", "server/clientPortalSetup"),
  plain("portalRequired", "portal-provisioning", "boolean", "server/clientPortalSetup"),
  plain("portalInvitedAt", "portal-provisioning", "number epoch ms", "server/clientPortalSetup"),
  plain("portalAccessPreparedAt", "portal-provisioning", "number epoch ms", "server/clientPortalSetup"),
  plain("portalAccessSentAt", "portal-provisioning", "number epoch ms", "server/clientPortalSetup"),
  plain("portalAccessUpdatedAt", "portal-provisioning", "number epoch ms", "server/clientPortalSetup"),
  plain("portalLastLoginAt", "portal-provisioning", "number epoch ms", "server/clientPortalSetup"),
  plain("portalProvisioningSource", "portal-provisioning", "string — which flow provisioned the portal", "server/clientPortalSetup"),
  plain("portalContactName", "contact", "string — portal invite recipient", "server/clientPortalSetup", "client", "personal"),
  plain("endCustomerUserId", "portal-provisioning", "string — the User backing the client's portal login", "server/clientPortalSetup"),

  // ── portal-config — appearance + product wiring of the portal ───────────
  plain("portalTemplateId", "portal-config", "string — ClientPortalTemplate id", "server/clientPortalDesigns"),
  plain("portalTemplateVersionId", "portal-config", "string — template version applied", "server/clientPortalTemplateUpdate"),
  plain("portalDesignVersionId", "portal-config", "string — design version applied", "server/clientPortalDesigns"),
  plain("portalShellVersion", "portal-config", "string — portal shell version", "server/clientPortalDesigns"),
  plain("portalAccentColor", "portal-config", "string — accent colour override", "server/clientPortalDesigns"),
  plain("portalServicePlan", "portal-config", "string — plan the portal presents", "server/clientPortalSetup"),
  plain("portalProducts", "portal-config", "array — products surfaced in the portal", "server/agencyProducts"),
  plain("portalProductIds", "portal-config", "string[] — product ids surfaced", "server/agencyProducts"),
  plain("portalSelectedProductIds", "portal-config", "string[] — operator-selected product ids", "server/agencyProducts"),
  plain("portalProductWorkspaces", "portal-config", "object — per-product workspace config", "server/agencyProducts"),
  plain("portalProductAssignmentHistory", "portal-config", "array — assignment audit trail", "server/agencyProducts"),
  plain("portalApprovals", "portal-config", "array — portal approval requests", "server/clientPortalSetup"),

  // ── product — service assignment + per-product operational state ────────
  plain("products", "product", "array — assigned products (legacy shape)", "server/agencyProducts"),
  plain("agencyProductId", "product", "string — AgencyProduct id", "server/agencyProducts"),
  plain("planTier", "product", "string — plan tier", "server/tenants"),
  plain("planId", "product", "string — plan id", "server/agencyProducts"),
  plain("clientProductProcess", "product", "object — per-product delivery process state", "server/agencyProducts"),
  plain("clientProductVariations", "product", "object — per-product variations", "server/agencyProducts"),
  plain("productPipelineStages", "product", "object — per-product stage overrides", "server/agencyProducts"),
  plain("clientMarketingService", "product", "object — marketing service state", "server/agencyProducts"),
  plain("clientOperations", "delivery", "object — client operations state", "server/tenants"),
  plain("commercialPack", "product", "string — commercial pack applied", "server/agencyProducts"),

  // ── finance — money facts currently living in metadata ──────────────────
  plain("clientPaymentPlans", "finance", "array — payment plans", "server/tenants", "client", "commercial"),
  plain("contracts", "finance", "array — contract records", "server/contractTemplates", "client", "commercial"),
  plain("stripeLink", "finance", "string — Stripe payment link", "server/tenants", "client", "commercial"),
  plain("lockInPaid", "finance", "boolean — lock-in fee paid", "server/tenants", "client", "commercial"),
  plain("billing", "finance", "object — billing config", "server/tenants", "client", "commercial"),
  plain("invoiceId", "finance", "string — invoice id an activity/enquiry refers to", "server/activity", "activity", "commercial"),
  plain("expenseId", "finance", "string — expense id", "server/activity", "activity", "commercial"),
  plain("number", "finance", "string — invoice number", "server/activity", "activity", "commercial"),
  plain("totalCents", "finance", "number — invoice total in minor units", "server/activity", "activity", "commercial"),
  plain("currency", "finance", "string — ISO currency code", "server/activity", "activity"),
  plain("issuedAt", "finance", "number epoch ms", "server/activity", "activity"),
  plain("dueAt", "finance", "number epoch ms", "server/activity", "activity"),
  plain("paidAt", "finance", "number epoch ms", "server/activity", "activity"),
  plain("lineItemDescription", "finance", "string", "server/activity", "activity", "commercial"),
  plain("expectedAmountTotal", "finance", "number — checkout expectation", "server/agencyProducts", "activity", "commercial"),
  plain("expectedCurrency", "finance", "string", "server/agencyProducts", "activity"),
  plain("expectedItemCount", "finance", "number", "server/agencyProducts", "activity"),
  plain("checkoutOperationId", "finance", "string — idempotency key for a checkout", "server/agencyProducts", "activity"),

  // ── telemetry — Aqua Tag readings kept on the client record ─────────────
  plain("telemetryEvents", "telemetry", "array — Aqua Tag telemetry event log", "server/websiteSources"),
  plain("telemetryLastSeenAt", "telemetry", "number epoch ms — freshness stamp", "server/websiteSources"),
  plain("telemetrySiteKey", "telemetry", "string — site key the telemetry belongs to", "server/websiteSources"),
  plain("searchConsoleEvents", "telemetry", "array — Search Console readings", "server/websiteSources"),
  plain("properties", "telemetry", "array — monitored web properties", "server/websiteSources"),
  plain("monthlyPerformanceReports", "telemetry", "array — generated performance reports", "server/websiteSources"),

  // ── inbox — communication logs kept on the client record ────────────────
  plain("inboxCalls", "inbox", "array — call log entries", "lib/telephony", "client", "personal"),
  plain("inboxReplies", "inbox", "array — reply log entries", "lib/inbox", "client", "personal"),
  plain("inboxStatus", "inbox", "string — inbox workflow status", "lib/inbox", "enquiry"),
  plain("calls", "inbox", "array — legacy call log", "lib/telephony", "client", "personal"),
  plain("replies", "inbox", "array — legacy reply log", "lib/inbox", "client", "personal"),
  plain("activeCallRecordingConsent", "consent", "object — live call recording consent", "lib/telephony", "client", "personal"),

  // ── consent — versions and purposes ─────────────────────────────────────
  plain("consentVersion", "consent", "number — consent text version agreed", "lib/enquiries", "enquiry"),
  plain("consentPurpose", "consent", "string — purpose the consent covers", "lib/enquiries", "enquiry"),

  // ── client requests / records / files ───────────────────────────────────
  plain("clientRequests", "delivery", "array — requests raised by the client", "server/clientRelationships", "client", "personal"),
  plain("clientRecordEntries", "delivery", "array — ledger entries kept on the record", "server/clientRelationships", "client", "personal"),
  plain("files", "files", "array — file attachments", "server/clientRelationships", "client", "personal"),
  plain("customFields", "bespoke", "object — operator-defined fields", "server/tenants", "client", "personal"),
  plain("whatsappLink", "contact", "string — WhatsApp deep link", "server/tenants", "client", "personal"),

  // ── system — provisioning plumbing ──────────────────────────────────────
  plain("aqua_agency_id", "system", "string — agency stamped on the Supabase auth user", "lib/server/auth", "auth-user"),
  plain("aqua_profile_role", "system", "string — role stamped on the Supabase auth user", "lib/server/auth", "auth-user"),
  plain("aqua_provisioning_operation_id", "system", "string — idempotency key for staff provisioning", "server/staffProvisioning", "auth-user"),
  plain("ingestionState", "system", "string — import ingestion state", "server/tenants"),
  plain("ingestionCompletedAt", "system", "number epoch ms", "server/tenants"),
  plain("status", "system", "string — generic status slot on activity metadata", "server/activity", "activity"),
] as const;

const CONTRACTS_BY_KEY: ReadonlyMap<string, MetadataKeyContract> = new Map(
  METADATA_KEY_CONTRACTS.map(contract => [contract.key, contract]),
);

/** Is this key catalogued anywhere? The smoke test's primary question. */
export function isCataloguedMetadataKey(key: string): boolean {
  return CONTRACTS_BY_KEY.has(key);
}

/** Look up one key's contract. */
export function metadataKeyContract(key: string): MetadataKeyContract | undefined {
  return CONTRACTS_BY_KEY.get(key);
}

/** Every catalogued key carrying personal data — the erasure sweep's checklist. */
export function personalMetadataKeys(): readonly string[] {
  return METADATA_KEY_CONTRACTS.filter(contract => contract.sensitivity === "personal").map(contract => contract.key);
}

/** Keys grouped by namespace — the unit a strangler migration moves. */
export function metadataKeysByNamespace(): ReadonlyMap<MetadataNamespace, readonly MetadataKeyContract[]> {
  const grouped = new Map<MetadataNamespace, MetadataKeyContract[]>();
  for (const contract of METADATA_KEY_CONTRACTS) {
    const bucket = grouped.get(contract.namespace);
    if (bucket) bucket.push(contract);
    else grouped.set(contract.namespace, [contract]);
  }
  return grouped;
}
