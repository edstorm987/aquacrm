// Company-portal disposition map — what happens to EVERY collection in
// `PortalState` when a trading company is given a portal of its own.
//
// ⚠ THE MODEL, settled by the founder 2026-08-20: agency is a HOLDING GROUP,
// trading companies are the businesses under it, and each company has its own
// clients. Three permanent tiers. A company does NOT become an agency — it
// stays a company and gains a workspace, backed by a tenant carrying
// `holdingAgencyId`. "Move" below therefore means "into the company's own
// portal tenant", never "out of the group".
//
// ─── WHY THIS FILE EXISTS ─────────────────────────────────────────────────
//
// This codebase has already shipped the bug this file prevents, twice. The
// only two pieces of "everything belonging to a tenant" code hand-list their
// collections: `src/lib/server/auth/showcaseMode.ts:477-519` names 25 of 78, and
// `src/lib/server/seeds/demoSeed.ts:430-463` names 7 of 78. Both silently miss the
// rest. A hand-list is invisible when it goes stale — nothing fails, the
// missed collections are simply left behind.
//
// So the map below is not a list. It is a MAPPED TYPE over
// `Required<PortalState>`: TypeScript itself demands one entry per collection,
// and `keyof` is read straight off the state type. Add another collection to
// `PortalState` and this file stops compiling until somebody classifies it.
// Delete an entry and it stops compiling. Rename a collection and it stops
// compiling. That is the whole job — see the GUARD block at the bottom.
//
// Deliberately NOT imported from `showcaseMode`. The right precedent is
// `src/server/clientErasure.ts:625-680`, which iterates `Object.entries(state)`
// generically rather than trusting a written-down list.
//
// This module is pure data + types: no `server-only`, no state access, no
// imports beyond the state type. The preview (`./companyPortal.ts`) reads it;
// so, later, will the confirmation UI.

import type { PortalState } from "../types";

/**
 * What a promotion does with a collection.
 *
 * - `move`     the records leave the origin tenant and arrive in the new one.
 *              One record, one tenant, ever — never a copy (see the erasure
 *              invariant in the plan: `clientErasure` matches on `clientId`
 *              with no agency predicate, so a clientId in two tenants means
 *              erasing it in one destroys the other).
 * - `rekey`    the record's KEY encodes the agency id, so a field rewrite
 *              cannot move it — the key has to be recomputed and the old one
 *              deleted.
 * - `seed`     the new tenant gets a fresh one, built by bootstrap/seeding.
 *              Nothing is carried across.
 * - `closure`  stays in the origin tenant AND is copied into the new one,
 *              because a moving record points at it (reference closure).
 * - `leave`    stays with the origin agency, and the new tenant gets nothing.
 *              The reversible direction, and therefore every default.
 * - `na`       not tenanted at all — there is nothing here to promote.
 */
export type PromotionDisposition = "move" | "rekey" | "seed" | "closure" | "leave" | "na";

/**
 * How a record in this collection is tied to a company — i.e. which field the
 * preview may read to decide whether a record belongs to the promoted brand.
 * This is the honest statement of what the data can answer; where it is
 * `none`, no amount of code can derive an answer and a human must decide.
 */
export type PromotionOwnership =
  /** `record.companyId` names one company. */
  | "company-single"
  /** `record.companyIds[]` — exclusive to this company, shared, or unset. */
  | "company-multi"
  /** No company field; follows a client that is moving. */
  | "client"
  /** Belongs to the tenant as a whole, with no company dimension. */
  | "agency-scoped"
  /** The storage key itself encodes the agency id. */
  | "composite-key"
  /** Opaque `Record<string, unknown>` owned by a plugin — the ninth surface. */
  | "plugin"
  /** Canonical people whose `facets.clientIds` can straddle both tenants. */
  | "person"
  /** Append-only audit. Stamped with `agencyId`, never rewritten. */
  | "history"
  /** No tenant key at all. */
  | "app-wide"
  /** Genuinely no company dimension in the data — a human decision. */
  | "none";

/**
 * How the collection is keyed, so a generic walk can tell which records belong
 * to the origin agency without a per-collection `if`.
 */
export type PromotionKeying =
  /** Keyed by the record's own id; the record carries `agencyId`. */
  | "own-id"
  /** The key IS the agency id. */
  | "agency-id"
  /** The key starts with the agency id (`${agencyId}:…` / `${agencyId}|…`). */
  | "agency-composite"
  /** Keyed by ANOTHER record's id — tenancy is resolved through `parent`. */
  | "foreign-id"
  /** Keyed by lower-cased email. */
  | "email"
  /** An array, not a record map. */
  | "array"
  /** A single object for the whole app. */
  | "singleton";

/** Where a `foreign-id` collection's tenancy actually lives. */
export interface PromotionParentLink {
  /** The collection that owns the tenancy answer. */
  collection: keyof PortalState;
  /** `"key"` → this record's key is the parent's id; otherwise a field name. */
  via: "key" | string;
}

export interface CollectionPromotionPlan {
  disposition: PromotionDisposition;
  ownership: PromotionOwnership;
  keying: PromotionKeying;
  /** Why — quoted into the preview so a human can argue with it. */
  reason: string;
  /**
   * True when the disposition is a PROPOSAL, not an answer: the data cannot
   * decide, so nothing here may be written until a human confirms. Every one
   * of these defaults to the reversible direction.
   */
  needsConfirmation?: boolean;
  /** For `foreign-id` keying — how to find the owning tenant. */
  parent?: PromotionParentLink;
}

/**
 * One entry per collection in `PortalState`. `Required<…>` matters: six of the
 * collections are optional (`assistant`, `websiteSources`,
 * `enquiryContactDetails`, `agencyMasterTagKeys`, `websiteSiteConfigs`,
 * `radarInfraHealth`) and an optional key must still be classified.
 */
export type PromotionDispositionMap = {
  readonly [K in keyof Required<PortalState>]: CollectionPromotionPlan;
};

/**
 * THE MAP. Order deliberately follows `PortalState` so the two can be read
 * side by side. Nothing calls this to move a record yet — phase 1 is the map
 * and its guard, and nothing else.
 */
export const PROMOTION_DISPOSITION = {
  // ─── Tenancy roots ──────────────────────────────────────────────────────
  agencies: {
    disposition: "seed",
    ownership: "agency-scoped",
    keying: "agency-id",
    reason:
      "`bootstrapAgency` creates the portal tenant's Agency row, stamped with `holdingAgencyId` + `companyId` so the holding group can still see what it holds. The holding group's own row is never touched — this adds a tenant, it does not edit one.",
  },
  tradingCompanies: {
    disposition: "leave",
    ownership: "company-single",
    keying: "own-id",
    reason:
      "The company record STAYS in the holding group, stamped with `portalAgencyId`/`portalCreatedAt`. It is NOT a tombstone and the company has not gone anywhere: the founder settled that a company stays a company under its holding group and merely gains a portal. The stamp is what makes a second POST idempotent, what later phases resolve the portal tenant through, and what keeps the group's portfolio complete.",
  },

  // ─── The company's own records ──────────────────────────────────────────
  clients: {
    disposition: "move",
    ownership: "company-single",
    keying: "own-id",
    reason:
      "`Client.companyId` names the brand. Clients MOVE and are never copied — `clientErasure` matches on `clientId` alone with no agency predicate, so one clientId living in two tenants means erasing it in one destroys the other.",
  },
  endCustomers: {
    disposition: "move",
    ownership: "client",
    keying: "own-id",
    reason: "An end customer belongs to a client. It follows its client across the boundary.",
  },
  users: {
    disposition: "move",
    ownership: "client",
    keying: "email",
    reason:
      "Client-tier users of a moving client move with it (their `agencyId` follows their client). Agency-tier staff do NOT: `ServerUser.companyIds` is a display label, and turning it into a retroactive tenancy grant is exactly the widening the switcher forbids — staff are PROPOSED, never auto-granted.",
    needsConfirmation: true,
  },
  accessRoleTemplates: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason:
      "Authorization templates belong to the tenant that authored them. Company promotion must never copy a role policy into a new security boundary implicitly.",
  },
  accessGrants: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason:
      "A grant is an explicit tenant authority decision. It stays in the origin tenant; access in the promoted portal must be deliberately re-approved.",
  },
  accessRequests: {
    disposition: "leave",
    ownership: "history",
    keying: "own-id",
    reason:
      "Permission requests and their decisions are governance history for the tenant in which they were made and are never re-stamped during promotion.",
  },

  // ─── Plugins — the ninth ownership surface ──────────────────────────────
  pluginInstalls: {
    disposition: "rekey",
    ownership: "composite-key",
    keying: "agency-composite",
    reason:
      "The install id is `${agencyId}|${clientId ?? \"_agency\"}|${pluginId}` (`pluginInstalls.ts:24-26`), so the key must be recomputed and the old one deleted. Client-scoped installs follow their client; agency-scoped installs are SHARED and must be split by the plugin itself.",
  },
  pluginData: {
    disposition: "rekey",
    ownership: "plugin",
    keying: "agency-composite",
    parent: { collection: "pluginInstalls", via: "key" },
    reason:
      "Opaque `Record<string, unknown>` under the install id. Company ownership lives INSIDE these values — Invoice.companyId, BudgetPot/FinanceObligation/CompensationProfile.companyIds, CommercialPack.companyId, Lead.companyId(+companyIds), Campaign.companyIds, MarketingAsset.companyIds, MarketingCustomerProfile.companyIds — so the core may report what it finds but must never split them itself. That is the plugin's `onPromoteCompany` hook.",
  },

  // ─── Delivery model ─────────────────────────────────────────────────────
  phases: {
    disposition: "seed",
    ownership: "agency-scoped",
    keying: "own-id",
    reason:
      "A moved Client's `stage` must resolve against a real `PhaseDefinition` in the new tenant, so phases are seeded there. The origin's own phases stay.",
  },

  // ─── History — stamped, never re-stamped ────────────────────────────────
  activity: {
    disposition: "leave",
    ownership: "history",
    keying: "array",
    reason:
      "Append-only, and `ActivityEntry` carries no `companyId` — of 352 `logActivity(` call sites roughly 200 pass no `clientId` either, so 'this company's history' is not a query that can be written. `agencyId` on a history row IS the access-control boundary (`activity.ts:72-77`); rewriting it would rewrite tenant isolation. The switcher supplies the continuity instead.",
  },
  clientRecordLedger: {
    disposition: "rekey",
    ownership: "client",
    keying: "own-id",
    reason:
      "Derived, so it is RE-SYNCHRONISED, never re-stamped. Event ids are `sha256(agencyId\\0clientId\\0sourceType\\0sourceId)` (`clientRecordLedger.ts:123-129`) — a naive agencyId rewrite duplicates a client's whole timeline on the next sync and makes the delete path unable to find anything. Origin rows for moved clients are deleted and rebuilt under the new agency.",
  },
  identityResolutionReviews: {
    disposition: "leave",
    ownership: "history",
    keying: "own-id",
    reason:
      "`reviewId` is `sha256(agencyId\\0sourceType\\0sourceId)` (`identityResolution.ts:327-330`) and the record carries no `companyId`. Reviews stay with the tenant that made them.",
  },
  persons: {
    disposition: "leave",
    ownership: "person",
    keying: "own-id",
    reason:
      "A canonical person's `facets.clientIds` can straddle both tenants. Persons are NEVER split automatically — a straddling person stops for a human decision, because 'changing what somebody IS must never destroy what they DID'.",
    needsConfirmation: true,
  },
  organisations: {
    disposition: "leave",
    ownership: "person",
    keying: "own-id",
    reason: "Same straddle as `persons`: an organisation's clients can sit on both sides of the new boundary.",
    needsConfirmation: true,
  },
  completedActions: {
    disposition: "leave",
    ownership: "history",
    keying: "own-id",
    reason: "A record of what was finished in the origin tenant. Moving it would move somebody else's audit trail.",
  },

  // ─── Pipelines ──────────────────────────────────────────────────────────
  pipelines: {
    disposition: "seed",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "`bootstrapAgency` already seeds fulfilment/leads/sales pipelines in the new tenant. Nothing carries across.",
  },
  pipelineCards: {
    disposition: "move",
    ownership: "client",
    keying: "foreign-id",
    parent: { collection: "pipelines", via: "pipelineId" },
    reason:
      "A `kind: \"client\"` card whose client moves must follow it, and its `pipelineId` must be re-pointed at the NEW tenant's seeded pipeline — the card carries no `agencyId` of its own. Lead/deal/custom cards stay.",
  },

  // ─── Assistant + credentials — never copied across a tenant boundary ────
  assistant: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "agency-composite",
    reason:
      "Keyed `${agencyId}|${userId}` — one person's private assistant history inside one tenant. The new tenant starts with an empty workspace.",
  },
  externalAssistantApiKeys: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "CREDENTIAL. Never copied across a tenant boundary — the new business mints its own.",
  },
  externalAssistantActionProposals: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "Proposals reference the origin tenant's records and the origin tenant's key. They stay where they were raised.",
  },
  integrationConnections: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason:
      "CREDENTIAL. Two live connections to one Meta page is not an acceptable outcome, so a transfer is revoke-and-reconnect, never copy — and whether a client-scoped connection transfers at all is a human decision.",
    needsConfirmation: true,
  },

  clientFormNotices: {
    // Follows the client, like the client's other records — but ONLY as far as
    // the pointer. A notice holds no customer data (see `ClientFormNotice`), so
    // moving one leaks nothing; what it points at lives in the client's own
    // Supabase and does not move at all.
    //
    // `leave`, not `move`, for the same reason `integrationConnections` is:
    // the notice is worthless without the connection that can read it, and that
    // connection is a CREDENTIAL whose transfer is a human decision. A notice
    // moved into a tenant that cannot resolve its row is a permanent "an
    // enquiry arrived, and you may never see it" — worse than not moving it.
    disposition: "leave",
    ownership: "client",
    keying: "own-id",
    reason:
      "Points into a client's own database via a vault connection. Pointless without that credential, and credentials are revoke-and-reconnect rather than copy — so the notice waits for the human decision that moves the connection.",
    needsConfirmation: true,
  },

  subjectRequests: {
    // The DSAR register. `leave`, and this one is not a close call.
    //
    // A data-subject request is made TO a controller. Promoting a company out
    // of an agency does not retrospectively change who the person wrote to, and
    // copying the register would put one controller's evidence of compliance
    // into another controller's hands — including the identity checks and the
    // free-text outcomes.
    //
    // The statutory clock belongs to whoever received the request. If it should
    // transfer, that is a controller-to-controller handover with its own
    // paperwork, not a side effect of a portal promotion.
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason:
      "Evidence that THIS controller received and answered a subject request. Copying it would hand one controller's compliance record — identity checks included — to another, and the Art. 12(3) clock belongs to whoever took receipt.",
    needsConfirmation: true,
  },

  websiteDemoSignups: {
    // Public AquaCRM demo-gate signups. `na` — there is nothing here to
    // promote, and that is a property of WHERE they live, not a judgement.
    //
    // These records carry no agency and no company. They are written in the
    // `website-demo` data realm (`server/websiteDemo.ts`), never the live one,
    // so a promotion working over live-realm state does not see them at all.
    // The subject is a stranger who asked Zimante Group for a demo of its own
    // product; promoting a trading company out of the group does not make that
    // stranger the company's contact.
    disposition: "na",
    ownership: "app-wide",
    keying: "singleton",
    reason:
      "Public demo-gate signups, held in the `website-demo` data realm with no agency or company key at all — a promotion over live-realm state never sees them, and the person asked Zimante Group for a demo, not the promoted company.",
  },

  breachIncidents: {
    // The breach register. `leave`, for the same reason as the DSAR register
    // above and one more that is sharper.
    //
    // Art. 33(5) documentation is evidence that THIS controller recorded,
    // assessed and notified a breach. Copying it would hand a promoted portal
    // an incident history it never had — and, worse, would hand it somebody
    // else's decision not to notify, with that other controller's reasoning
    // attached to its name.
    //
    // The 72-hour clock belongs to whoever became aware. It does not restart,
    // transfer or duplicate because a portal was promoted; if an incident
    // genuinely spans both, that is a controller-to-controller matter with its
    // own paperwork, not a copy.
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason:
      "Art. 33(5) evidence that THIS controller recorded and assessed a breach. Copying it would attribute another controller's incidents — and its decisions NOT to notify — to the promoted portal, and the 72-hour clock belongs to whoever became aware.",
    needsConfirmation: true,
  },

  devProjects: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason:
      "POINTS AT CREDENTIALS. A dev project holds no secret itself, but it binds a repository to specific github/vercel connection ids — and those connections deliberately do not transfer. Copying the project without them yields a project that resolves the WRONG tenant's token or none at all, so which repo/connections a promoted portal should own is a human decision.",
    needsConfirmation: true,
  },

  editorAiConfigs: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "agency-composite",
    parent: { collection: "devProjects", via: "key" },
    reason:
      "POINTS AT A CREDENTIAL, and follows a project that does not move. Keyed `${agencyId}|${projectId}`, holding Aqua Editor AI's model, brief and the VAULT ID of its own token — never the token. Copying it would hand the new tenant a connection id that resolves nothing (integrationConnections stay) or, worse, one that resolves in the ORIGIN tenant. Whether a promoted portal gets its own editor key is a human decision and a fresh paste.",
    needsConfirmation: true,
  },

  editorAiConversations: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "agency-composite",
    parent: { collection: "devProjects", via: "key" },
    reason:
      "Keyed `${agencyId}|${projectId}` — Aqua Editor AI's chat history for ONE project, and it follows a project that does not move. It carries whatever the agency's operators typed while editing: repository paths, unreleased copy, the wording of a client's page before it went live. Copying that into a promoted tenant hands them an internal conversation nobody reviewed, so the new tenant starts empty and the origin keeps its own.",
  },

  // ─── Work ───────────────────────────────────────────────────────────────
  devTeamWorkspaceFiles: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "Founder control-plane documents belong to the Aqua deployment, never to a company promoted out of the agency.",
  },
  tasks: {
    disposition: "move",
    ownership: "client",
    keying: "own-id",
    reason: "A task stamped with a moving client moves with it. Agency-wide tasks (no `clientId`) stay.",
  },
  taskTemplates: {
    disposition: "closure",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "Copied into the new tenant only when a moving task was built from one. The origin keeps its own copy.",
  },
  portalConnections: {
    disposition: "move",
    ownership: "client",
    keying: "own-id",
    reason: "A client's own software connected to their portal. Follows the client.",
  },

  // ─── Live web surface (phase 8 moves these atomically) ──────────────────
  websiteSources: {
    disposition: "move",
    ownership: "company-single",
    keying: "own-id",
    reason:
      "`WebsiteSource.destinationCompanyId` names the brand. Moved in ONE mutate together with its `websiteSiteConfigs` — never delete-and-re-add, because `removeWebsiteSource` cascades the injection config away (`websiteSources.ts:206-216`).",
  },
  enquiryContactDetails: {
    disposition: "leave",
    ownership: "none",
    keying: "own-id",
    reason:
      "The record itself carries `agencyId`, but it is keyed by the id of an ENQUIRY that lives in Supabase with no `agency_id` column yet (that column is the RLS lane's to add). So the row can be found and the thing it describes cannot — and consent given to ONE legal entity does not automatically travel to a NEW one. Nothing here moves without a human decision.",
    needsConfirmation: true,
  },
  agencyMasterTagKeys: {
    disposition: "rekey",
    ownership: "agency-scoped",
    keying: "agency-id",
    reason:
      "The tag already in a customer's page HTML carries the OLD master key, and both `resolveWebsiteSourceRouting` and `listEnabledInjectionsForHost` re-derive the agency from it — so there is no ordering of a naive move that keeps live GA4/GTM/PostHog delivery intact. The retired key must resolve to the new agency via an alias index.",
  },
  websiteSiteConfigs: {
    disposition: "move",
    ownership: "company-single",
    keying: "foreign-id",
    parent: { collection: "websiteSources", via: "key" },
    reason:
      "Keyed by `websiteSource` id and carrying no company field of its own — the answer lives on the parent source. Moves in the SAME mutate as that source, or live tag delivery goes dark behind an HTTP 200.",
  },

  // ─── Agency-wide tooling with no company dimension ──────────────────────
  notepadFolders: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "Agency-wide notes with no company dimension. Left behind — the reversible direction.",
  },
  notepadNotes: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "Agency-wide notes with no company dimension.",
  },
  automationFolders: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "Automations are written against the origin tenant's records and ids. They stay.",
  },
  automationWorkflows: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "An automation references origin-tenant records by id; copying it would produce a workflow pointed at another tenant.",
  },
  automationRuns: {
    disposition: "leave",
    ownership: "history",
    keying: "own-id",
    reason: "Run history for the origin tenant's automations.",
  },
  customAIs: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "Agency-wide assistant definitions with no company dimension.",
  },

  // ─── Ed's day — personal to a tenant ────────────────────────────────────
  dashboardDayPlans: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "One person's day inside one tenant — planned against the origin agency's own work. The new tenant starts with an empty day.",
  },
  dashboardWeekPlans: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "One person's week inside one tenant, built from the origin agency's workload. Nothing here describes the promoted brand.",
  },
  dashboardWorkSessions: {
    disposition: "leave",
    ownership: "history",
    keying: "own-id",
    reason: "Recorded work sessions — history, stamped with the tenant they happened in.",
  },
  commandCalendarEntries: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "Calendar entries belong to the tenant whose calendar they were made in.",
  },
  commandCalendarConnections: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "CREDENTIAL (OAuth to a real calendar account). Never copied across a tenant boundary.",
  },
  commandCalendarSources: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "A source is meaningless without the connection it hangs off, which stays.",
  },
  commandCalendarExternalEvents: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "Mirrored external events — re-synced from the connection, never migrated.",
  },
  commandCalendarEventCreateOperations: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "Provider idempotency records belong to the originating calendar connection and must never cross tenants.",
  },

  // ─── The company's operating model ──────────────────────────────────────
  sops: {
    disposition: "closure",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "Copied into the new tenant when a moving `AgencyProduct.sopIds` points at one. The origin keeps its own.",
  },
  sopGuides: {
    disposition: "closure",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "A guide is an ordered composition of the agency's own SOPs. It rides along by closure with the SOPs it references; the origin keeps its own copy.",
  },
  agencyProducts: {
    disposition: "move",
    ownership: "company-multi",
    keying: "own-id",
    reason:
      "Moves only when `companyIds` is exactly `[thisCompany]`. Shared with other brands, or unset (meaning 'all brands'), it is AMBIGUOUS and defaults to LEAVE.",
  },
  clientMilestones: {
    disposition: "move",
    ownership: "client",
    keying: "own-id",
    reason: "A milestone is stamped with a client and nothing else, so it follows that client across the boundary — and only that client's.",
  },
  performanceExperiments: {
    disposition: "move",
    ownership: "client",
    keying: "own-id",
    reason: "Experiments follow the client they were run for.",
  },
  experiencePackages: {
    disposition: "move",
    ownership: "company-multi",
    keying: "own-id",
    reason: "Moves only when `companyIds` is exactly `[thisCompany]`; otherwise ambiguous, defaulting to LEAVE.",
  },
  clientDelight: {
    disposition: "move",
    ownership: "company-single",
    keying: "own-id",
    reason: "`ClientDelightRecord.companyId` names the brand outright, and the record also follows its client.",
  },
  agencySettings: {
    disposition: "seed",
    ownership: "agency-scoped",
    keying: "agency-id",
    reason:
      "COPIED WITH RESET, not moved: structural preferences carry, but `invoicePrefix` is regenerated from the new slug and a fresh master tag key is minted. Two tenants issuing invoices under one prefix is a finance collision.",
  },
  portalEditor: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "agency-id",
    reason: "Form-editor draft state for the origin tenant's portal. The new tenant materialises its own on first use.",
  },
  clientPortalTemplates: {
    disposition: "closure",
    ownership: "agency-scoped",
    keying: "own-id",
    reason:
      "Copied in when a moving `ClientPortalInstanceRecord.templateId` points at one — otherwise the moved portal is silently rebuilt from a default template and loses its published design.",
  },
  clientPortalInstances: {
    disposition: "rekey",
    ownership: "composite-key",
    keying: "agency-composite",
    reason:
      "Keyed `${agencyId}:${clientId}` (`clientPortalDesigns.ts:37-39`) — a field rewrite cannot move it. Re-key, carrying `publishedVersionId` and the full `versions[]` across intact.",
  },
  companyProfiles: {
    disposition: "rekey",
    ownership: "composite-key",
    keying: "agency-composite",
    reason:
      "The brand's profile moves from `${oldAgencyId}:${companyId}` to the BARE `${newAgencyId}` key — it becomes the new tenant's root profile. Miss this and `getCompanyProfile` silently substitutes its £5,000 default (`company.ts:60-70`), losing the real target, shareholder register and capital ledger.",
  },
  legalDocuments: {
    disposition: "move",
    ownership: "company-multi",
    keying: "own-id",
    reason: "Moves only when `companyIds` is exactly `[thisCompany]`; shared or unset is ambiguous, defaulting to LEAVE.",
  },
  contractTemplates: {
    disposition: "closure",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "Copied in when a moving client's contract was raised from one.",
  },
  developmentResources: {
    disposition: "move",
    ownership: "company-multi",
    keying: "own-id",
    reason: "Moves only when `companyIds` is exactly `[thisCompany]`; shared or unset is ambiguous, defaulting to LEAVE.",
  },
  developmentWorkflows: {
    disposition: "closure",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "Copied in when a moving `DevelopmentResource.workflowStageIds` points at one, or the moved resource dangles.",
  },
  agencyWebsites: {
    disposition: "leave",
    ownership: "none",
    keying: "agency-id",
    reason:
      "One project per AGENCY, with no company record to move — the data has no answer to 'which brand is this'. Proposed, defaulting to LEAVE, until a human decides.",
    needsConfirmation: true,
  },

  // ─── Radar — the new business earns its own baseline ────────────────────
  radarMemory: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "agency-id",
    reason:
      "LEAVE by design. A promoted business starts with no health history rather than inheriting a rolling baseline it never earned — and the confirmation UI says so out loud.",
  },
  radarSyntheticProbes: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "agency-id",
    reason: "Probe results describe the origin tenant's properties at a moment in time. The new tenant probes for itself.",
  },
  radarEvidence: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "agency-id",
    reason: "Evidence confidence is earned per tenant. Carrying it across would make a blind new tenant claim it can see.",
  },
  customKpis: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "agency-id",
    reason: "Guided KPI definitions are written against the origin tenant's data. The new business defines its own.",
  },
  radarInfraHealth: {
    disposition: "na",
    ownership: "app-wide",
    keying: "singleton",
    reason:
      "APP-WIDE with no tenant key at all (`types.ts:3168-3169`) — one DB/storage probe for the whole deployment. Leave strictly alone: there is nothing here to promote.",
  },
  operationalAlertPreferences: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "agency-composite",
    reason: "Keyed `${agencyId}|${userId}|${alertId}` — one person's read/park/dismiss state for one tenant's alerts.",
  },
  userChromeLayouts: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "agency-composite",
    reason: "Keyed `${agencyId}|${userId}` — how one person arranged their own sidebar and where they put their own saved tabs. Personal, not organisational: promoting it would hand somebody else's shortcuts to a new company's staff, and the arrangement only means anything against the nav of the agency it was made in.",
  },

  // ─── People — sixteen collections with no company dimension at all ──────
  peopleApplications: {
    disposition: "leave",
    ownership: "none",
    keying: "own-id",
    reason: "The people model has no company dimension. Nothing here can be attributed to a brand; proposed as LEAVE for a human to confirm.",
    needsConfirmation: true,
  },
  peopleEmployees: {
    disposition: "leave",
    ownership: "none",
    keying: "own-id",
    reason: "Employment is with the agency, not a brand. Moving a person's employment record is an HR decision, not a data migration.",
    needsConfirmation: true,
  },
  peopleLeaveRequests: {
    disposition: "leave",
    ownership: "none",
    keying: "own-id",
    reason: "Follows the employment record, which does not move without a human decision.",
    needsConfirmation: true,
  },
  peopleShifts: {
    disposition: "leave",
    ownership: "none",
    keying: "own-id",
    reason: "Follows the employment record, which does not move without a human decision.",
    needsConfirmation: true,
  },
  peopleTrainingAssignments: {
    disposition: "leave",
    ownership: "none",
    keying: "own-id",
    reason: "Follows the employment record, which does not move without a human decision.",
    needsConfirmation: true,
  },
  peopleFreelancerJobs: {
    disposition: "leave",
    ownership: "none",
    keying: "own-id",
    reason: "A freelancer job has no company field. Proposed as LEAVE.",
    needsConfirmation: true,
  },
  peopleRecognitions: {
    disposition: "leave",
    ownership: "none",
    keying: "own-id",
    reason: "Recognition of work done inside the origin tenant.",
    needsConfirmation: true,
  },
  peopleFeedback: {
    disposition: "leave",
    ownership: "none",
    keying: "own-id",
    reason: "Feedback recorded inside the origin tenant.",
    needsConfirmation: true,
  },
  peopleProcessConfig: {
    disposition: "leave",
    ownership: "none",
    keying: "agency-id",
    reason: "The origin tenant's HR process configuration. The new tenant configures its own.",
    needsConfirmation: true,
  },
  freelancerAccessConfig: {
    disposition: "leave",
    ownership: "none",
    keying: "agency-id",
    reason: "An access POLICY. Copying a policy into a tenant nobody has reviewed it for is the wrong default.",
    needsConfirmation: true,
  },
  freelancerJobOverride: {
    disposition: "leave",
    ownership: "none",
    keying: "foreign-id",
    parent: { collection: "peopleFreelancerJobs", via: "key" },
    reason: "Per-job access override; follows its job, which does not move without a human decision.",
    needsConfirmation: true,
  },
  peopleContracts: {
    disposition: "leave",
    ownership: "none",
    keying: "own-id",
    reason: "A contract with a legal entity. Moving one is a legal act, not a promotion side effect.",
    needsConfirmation: true,
  },
  peopleChannels: {
    disposition: "leave",
    ownership: "none",
    keying: "own-id",
    reason: "Internal comms for the origin tenant, with no company dimension to split a channel by. Proposed as LEAVE.",
    needsConfirmation: true,
  },
  peopleMessages: {
    disposition: "leave",
    ownership: "none",
    keying: "own-id",
    reason: "Message history in the origin tenant's channels.",
    needsConfirmation: true,
  },
  peopleChannelReads: {
    disposition: "leave",
    ownership: "none",
    keying: "agency-composite",
    reason: "Keyed `${agencyId}:${channelId}:${userId}` — read state for channels that stay.",
    needsConfirmation: true,
  },
  peopleTrainingModules: {
    disposition: "leave",
    ownership: "none",
    keying: "own-id",
    reason: "Training material authored in the origin tenant; no company dimension to split it by.",
    needsConfirmation: true,
  },
  staffProvisioningOperations: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "Password-free staff account recovery checkpoints belong to the holding agency and never follow a promoted company.",
  },
  clientProjectOperations: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "Provision/publish/deploy recovery checkpoints belong to the holding agency that owns the folder, repository and Vercel deployment; they never follow a promoted company.",
  },
  outbox: {
    disposition: "leave",
    ownership: "agency-scoped",
    keying: "own-id",
    reason: "Durable domain events are the origin tenant's history of what happened under it. A promoted company's tenant starts its own event stream; rewriting past events' agencyId would falsify lineage.",
  },
} satisfies PromotionDispositionMap;

// ─── THE GUARD ────────────────────────────────────────────────────────────
//
// `satisfies PromotionDispositionMap` above already rejects a missing entry
// (the object is no longer assignable) and an unknown one (excess property).
// The two aliases below exist because a `satisfies` failure points at the
// whole object literal, whereas these NAME the offending collection in the
// error text — which is the difference between a five-second fix and a
// five-minute hunt.
//
// If you have just added a collection to `PortalState` and landed here:
// classify it above. That is the entire point of this file. Do not widen the
// types to make the error go away.

/** Compile error unless `T` is `never`. `T` is the list of what is wrong. */
type AssertNever<T extends never> = T;

/** Collections in `PortalState` that nobody has classified. */
type UnclassifiedCollections = Exclude<
  keyof Required<PortalState>,
  keyof typeof PROMOTION_DISPOSITION
>;

/** Entries in the map that are not collections of `PortalState` any more. */
type StaleCollections = Exclude<
  keyof typeof PROMOTION_DISPOSITION,
  keyof Required<PortalState>
>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _EveryCollectionIsClassified = AssertNever<UnclassifiedCollections>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _NoStaleCollections = AssertNever<StaleCollections>;

/**
 * How many collections `PortalState` had when this map was written. The map's
 * own length is checked against `PortalState` by the types above; this constant
 * is the human-readable half — a smoke test pins it, so the next collection
 * announces itself in a test name as well as in the compiler.
 */
// 94 → 95 on 2026-08-31: `websiteDemoSignups`, the public AquaCRM demo gate's
// consent records. Classified `na` before the number moved — they carry no
// tenant key and live outside the live data realm entirely.
export const PROMOTION_COLLECTION_COUNT = 95;

/** Every classified collection name, in `PortalState` order. */
export const PROMOTION_COLLECTIONS = Object.keys(PROMOTION_DISPOSITION) as Array<
  keyof Required<PortalState>
>;

/**
 * The same map, widened to the interface.
 *
 * `satisfies` above keeps every key's LITERAL type, which is what lets the
 * guard aliases name a missing collection — but it also narrows each entry to
 * exactly the properties written, so `entry.needsConfirmation` is a type error
 * on the entries that omit it. Reading through this alias restores the uniform
 * shape without giving up the guard. The assignment itself is a third check:
 * it fails if any entry stops matching `CollectionPromotionPlan`.
 */
const MAP: PromotionDispositionMap = PROMOTION_DISPOSITION;

export function dispositionFor(collection: keyof Required<PortalState>): CollectionPromotionPlan {
  return MAP[collection];
}

export function collectionsWithDisposition(
  disposition: PromotionDisposition,
): Array<keyof Required<PortalState>> {
  return PROMOTION_COLLECTIONS.filter(name => MAP[name].disposition === disposition);
}

/** Collections whose disposition is a proposal a human must confirm. */
export function collectionsNeedingConfirmation(): Array<keyof Required<PortalState>> {
  return PROMOTION_COLLECTIONS.filter(name => MAP[name].needsConfirmation === true);
}
