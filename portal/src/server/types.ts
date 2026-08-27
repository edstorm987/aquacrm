// Shared portal types. Storage, server modules, auth, chrome and the
// plugin runtime all import from here. Keeping this module dependency-free
// means it can be safely imported from edge / middleware / client code
// when the bundler tree-shakes the unused symbols.

// Type-only import — erased by `isolatedModules`, so it introduces no runtime
// dependency and this module stays edge/client-safe. `block.ts` is itself
// dependency-free and only type-imports back from here, so the cycle is
// compile-time only.
import type { BlockTreeJSON } from "@/engines/editor/elements/block";
// Same rule, same reason: type-only, erased, no runtime dependency. The SEO
// shape is declared once — in the module that emits it into a page's head —
// so a portal page and a repository page cannot end up with two different
// ideas of what a meta description is (dev-editor-finish phase 9).
import type { PageSeo } from "@/engines/editor/editing/pageSeo";

// ─── Tenant identity ──────────────────────────────────────────────────────
//
// Three nested levels: Agency → Client → End-customer. Every row in the
// portal carries `agencyId`. Rows scoped to a specific client also carry
// `clientId`. End-customer rows additionally carry `customerId` (the
// shopper / member / affiliate). See `04-architecture.md §1`.

export type AgencyStatus = "active" | "suspended" | "archived";

export interface BrandKit {
  logoUrl?: string;
  primaryColor: string;          // hex, e.g. "#FF6B35"
  secondaryColor?: string;
  accentColor?: string;
  fontHeading?: string;          // CSS font-family stack
  fontBody?: string;
  borderRadius?: string;         // e.g. "12px"
  customCSS?: string;            // raw CSS injected at the page root
  // T1 R15 — extended kit absorbed from T3 R011 so per-tenant layouts
  // emit a full 16-var surface. All optional; vars only emit when set.
  bgElevated?: string;           // panel / card surface colour
  text?: string;                 // primary text colour
  textMuted?: string;            // secondary / hint text
  border?: string;               // hairline / divider colour
  radiusSm?: string;             // tight radii (chips, badges)
  radiusMd?: string;             // standard inputs / buttons
  radiusLg?: string;             // hero / card surfaces
}

export interface Agency {
  id: string;
  name: string;
  slug: string;
  brand: BrandKit;
  ownerEmail?: string;
  status: AgencyStatus;
  createdAt: number;
  updatedAt: number;
  /**
   * ─── THE THIRD TIER ───────────────────────────────────────────────────
   *
   * Settled by the founder 2026-08-20: *"it's both — agency as a holding
   * group, trading companies as companies, and then each company has
   * clients."* Three permanent tiers, not two:
   *
   *     AGENCY (holding group) → TRADING COMPANY (the business) → CLIENTS
   *
   * A trading company therefore NEVER "becomes an agency". It stays a company
   * under its holding group and gains a portal — a workspace of its own. That
   * workspace needs a tenant row, which is what this `Agency` record is when
   * these two fields are set.
   *
   * WITHOUT this link the tenant created for a company portal is an ordinary
   * SIBLING of the holding group, indistinguishable from a wholly separate
   * business, and the top tier evaporates — the holding group cannot list the
   * companies it holds. That is the two-tier model the founder rejected, so
   * the link is what keeps the settled model representable at all.
   *
   * Unset on an ordinary top-level agency (a holding group itself, or a
   * standalone signup). Set together or not at all.
   */
  /** The holding group this portal tenant belongs to. */
  holdingAgencyId?: string;
  /** The `TradingCompany.id` in that holding group this tenant is the portal for. */
  companyId?: string;
}

export type TradingCompanyStatus = "active" | "paused" | "archived";

export interface TradingCompany {
  id: string;
  agencyId: string;
  name: string;
  slug: string;
  description?: string;
  website?: string;
  brand: BrandKit;
  status: TradingCompanyStatus;
  createdAt: number;
  updatedAt: number;
  /**
   * Set once this company has been given a portal of its own — the id of the
   * `Agency` row that BACKS that portal. See `server/companyPortal`.
   *
   * ⚠ This is NOT "the agency this brand became". The company does not leave
   * and does not change tier: it stays a `TradingCompany` in this holding
   * group, still listed in the portfolio, still owning its clients. The tenant
   * named here is its workspace, and it carries `holdingAgencyId` pointing
   * back at `this.agencyId` — the link is deliberately two-way so neither tier
   * can be reached without the other.
   *
   * Keeping the company record here (rather than deleting it) is what makes
   * portal creation idempotent — a second POST finds this id, creates nothing
   * and returns it — and resumable, since later phases move records into the
   * tenant the first phase created and need to know which one that is.
   */
  portalAgencyId?: string;
  /** When the company's portal was created. Written once, never overwritten. */
  portalCreatedAt?: number;
}

/**
 * Where a tagged website's submissions route. A site feeds the agency inbox by
 * default, or is pointed at one specific client, or — for Ed's own brands — at
 * one of his trading companies. The Aqua Tag's routing registry
 * (`server/websiteSources`) resolves a submission's host to one of these.
 * `client` and `company` are mutually exclusive: a site has one home, never both.
 */
export type WebsiteSourceDestination =
  | { kind: "inbox" }
  | { kind: "client"; clientId: string }
  | { kind: "company"; companyId: string };

/**
 * The consent bucket an injected tool waits for. These match the Aqua Tag's own
 * client-side categories (`necessary` fires always; the rest gate on the
 * visitor's stored `aqua-cookie-preferences`). See `lib/aquaTagSource`.
 */
export type AquaConsentCategory = "necessary" | "preferences" | "analytics" | "marketing";

/**
 * The allow-listed third-party tools the Aqua Tag can inject. v1 is a curated
 * catalogue configured **by id/key only — never a raw `<script>`** (Ed's
 * resolved security decision), so there is no XSS surface. Adding a provider is
 * one entry in `server/websiteInjections`'s catalogue.
 */
export type AquaInjectionKind =
  | "ga4"               // Google Analytics 4 — measurement id
  | "gtm"               // Google Tag Manager — container id
  | "posthog"           // PostHog — project api key
  | "meta-pixel"        // Meta / Facebook Pixel — pixel id
  | "google-ads"        // Google Ads — conversion id
  | "linkedin"          // LinkedIn Insight — partner id
  | "gsc-verification"; // Google Search Console `<meta>` verification token

/**
 * One configured injection on a site. `value` is the provider's **public** id or
 * key (a GA4 "G-…", a GTM "GTM-…", a pixel id, …) — these ship in the page's
 * HTML anyway, so they are not secrets; the store validates them to a safe token
 * charset because they become part of the markup the tag injects.
 */
export interface AquaInjection {
  id: string;
  kind: AquaInjectionKind;
  value: string;
  consentCategory: AquaConsentCategory;
  enabled: boolean;
  label?: string;
  createdAt: number;
}

/** One field on an imported website form: what the visitor is asked, and how. */
export interface AquaFormFieldSchema {
  /** The input's `name` (or `id`) — what a submission arrives keyed by. */
  name: string;
  /** The visible label shown to the visitor, if one could be resolved. */
  label?: string;
  /** Input type: text, email, tel, select, textarea, checkbox, radio, … */
  type: string;
  /** The field was marked `required` in the markup. */
  required: boolean;
}

/**
 * A form's field layout, imported from a tagged site's HTML (plan Phase 2) so the
 * enquiry detail card can mirror the real form even before a submission arrives.
 */
export interface AquaFormSchema {
  /** Stable-ish identity: the form's `id` or `name` attribute, if any. */
  formId?: string;
  /** A human label for the form — its id/name, or a best-effort heading. */
  label: string;
  /** Where the form posts, if declared (its `action`). */
  action?: string;
  /** True when the tag would capture this form (enquiry-shaped, not a login). */
  capturable: boolean;
  fields: AquaFormFieldSchema[];
}

/**
 * Per-site configuration for the Aqua Tag, keyed by `websiteSource` id. v1 holds
 * the injection list; imported form schemas (plan Phase 2) join it here so a site
 * has one config record. `formSchemas` is optional and additive — a site
 * configured only for injections simply has none.
 */
export interface WebsiteSiteConfig {
  websiteSourceId: string;
  agencyId: string;
  injections: AquaInjection[];
  /** Form layouts imported from the live site, so the card mirrors the real form. */
  formSchemas?: AquaFormSchema[];
  /** When the schemas were last imported, and the URL they were read from. */
  formSchemasImportedAt?: number;
  formSchemasImportedFrom?: string;
}

// Phase-driven lifecycle. Stored as a string so future agency-customised
// phases (Decisions log #2) can extend without a code change. The seven
// defaults match the ones in `04-architecture.md §7` plus a "lead" entry
// inherited from `03/old-portal-roles-tenancy.md`.
// Pre-Aqua stages kept for back-compat with seeded data + the Live
// custom-portal flag (architecture 19b). The six "aqua-*" stages are
// the canonical progression Ed actually uses — see chapter #59 §5.
export type ClientStage =
  | "lead"
  | "discovery"
  | "design"
  | "development"
  | "onboarding"
  | "live"
  | "churned"
  | "aqua-epic-intro"
  | "aqua-blueprint"
  | "aqua-diagnostics"
  | "aqua-brand-builder"
  | "aqua-traffic"
  | "aqua-mastery";

// End-customer surface configuration. Optional — when absent the client
// uses the foundation defaults (signups enabled, no return URL).
export interface ClientEndCustomerConfig {
  signupsEnabled?: boolean;        // default true
  postLoginReturnUrl?: string;     // default `${portalBase}/portal/customer`
}

export interface Client {
  id: string;
  agencyId: string;
  // A relationship can own several isolated client workspaces. Each
  // workspace keeps its own products, delivery, finance and portal data.
  relationshipId?: string;
  // The canonical human behind this workspace. Clients sharing a
  // `relationshipId` share a `personId`. See `Person`.
  personId?: string;
  workspaceLabel?: string;
  companyId?: string;
  name: string;
  slug: string;
  brand: BrandKit;
  stage: ClientStage;
  ownerEmail?: string;
  websiteUrl?: string;
  status: AgencyStatus;
  endCustomers?: ClientEndCustomerConfig;
  // Free-form per-client metadata (planTier, whatsappLink, lockInPaid,
  // stripeLink, therapistName, practiceName, …). Anything that doesn't
  // need a typed field of its own goes here so the schema stays stable.
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface EndCustomer {
  id: string;
  clientId: string;
  agencyId: string;              // denormalised for fast filtering
  email: string;
  name?: string;
  createdAt: number;
}

// ─── Roles ────────────────────────────────────────────────────────────────
//
// Locked in `04-architecture.md §3`. URL → role gating happens in
// middleware + page layout server components via `requireRole()`.

export type Role =
  | "agency-owner"
  | "agency-manager"
  | "agency-staff"
  | "client-owner"
  | "client-staff"
  | "freelancer"
  | "end-customer"
  | "lead";

export const AGENCY_ROLES: readonly Role[] = [
  "agency-owner",
  "agency-manager",
  "agency-staff",
] as const;

export const CLIENT_ROLES: readonly Role[] = [
  "client-owner",
  "client-staff",
  "freelancer",
] as const;

export const ALL_ROLES: readonly Role[] = [
  ...AGENCY_ROLES,
  ...CLIENT_ROLES,
  "end-customer",
  "lead",
] as const;

// R023 — `lead` role is a global tenant: HC graduates / Resources tool
// users sit here pre-agency-signup. Not bound to an agency. We stamp
// the user record + session payload with a sentinel agencyId so the
// existing required-string contract survives without a 56-callsite
// refactor; `requireAgencyScope` rejects leads at the boundary so no
// real agency-scoped reads ever see this value.
export const LEAD_AGENCY_ID = "agency_lead_global";

export function isAgencyRole(role: Role): boolean {
  return (AGENCY_ROLES as readonly string[]).includes(role);
}

export function isClientRole(role: Role): boolean {
  return (CLIENT_ROLES as readonly string[]).includes(role);
}

export function isLeadRole(role: Role): boolean {
  return role === "lead";
}

// Governed access control. `Role` remains the coarse sign-in/persona label;
// these records are the resource authority at an exact tenant, resource and
// environment scope. UI visibility may derive from this result, but hiding a
// control is never the authorization boundary.
export const ACCESS_ENVIRONMENTS = ["live", "sandbox"] as const;
export type AccessEnvironment = typeof ACCESS_ENVIRONMENTS[number];

export const ACCESS_SCOPE_KINDS = ["agency", "workspace", "client", "project"] as const;
export type AccessScopeKind = typeof ACCESS_SCOPE_KINDS[number];

/** A semantic resource key: never a route, CSS selector or component path. */
export interface AccessScope {
  kind: AccessScopeKind;
  id: string;
  clientId?: string;
  projectId?: string;
}

export const ACCESS_BASE_CAPABILITIES = [
  "workspace.view",
  "workspace.manage",
  "project.view",
  "project.manage",
  "project.connection.manage",
  "project.edit",
  "project.ai",
  "project.preview",
  "project.pull-request",
  "project.publish",
  "project.deploy",
  "dev.project.run_local",
  "dev.project.logs",
  "access.request",
  "access.grant.manage",
  "access.template.manage",
  "access.request.review",
  "access.audit.view",
] as const;
export type AccessBaseCapability = typeof ACCESS_BASE_CAPABILITIES[number];

/** Stable product identifiers let a role toggle elements without DOM selectors. */
export const ACCESS_ELEMENT_KEYS = [
  "workspace.overview",
  "workspace.actions",
  "workspace.calendar",
  "workspace.inbox",
  "workspace.files",
  "workspace.settings",
  "staff.overview",
  "staff.people",
  "staff.schedule",
  "staff.training",
  "staff.pay",
  "staff.chat",
  "fulfilment.overview",
  "fulfilment.services",
  "fulfilment.projects",
  "fulfilment.portals",
  "fulfilment.tags",
  "client.overview",
  "client.relationship",
  "client.fulfilment",
  "client.marketing",
  "client.systems",
  "client.commercial",
  "client.communications",
  "client.files",
  "client.portal",
  "client.record",
  "client.settings",
  "development.overview",
  "development.preview",
  "development.explorer",
  "development.code",
  "development.ai",
  "development.publish",
  "project.overview",
  "project.tasks",
  "project.files",
  "project.messages",
  "project.editor",
] as const;
export type AccessElementKey = typeof ACCESS_ELEMENT_KEYS[number];

export const ACCESS_ELEMENT_ACTIONS = ["view", "use", "manage"] as const;
export type AccessElementAction = typeof ACCESS_ELEMENT_ACTIONS[number];
export type AccessElementCapability = `element.${AccessElementKey}.${AccessElementAction}`;
export type AccessCapability = AccessBaseCapability | AccessElementCapability;
export const ACCESS_ELEMENT_CAPABILITIES = ACCESS_ELEMENT_KEYS.flatMap(elementKey => (
  ACCESS_ELEMENT_ACTIONS.map(action => `element.${elementKey}.${action}` as AccessElementCapability)
));
export const ACCESS_CAPABILITIES: readonly AccessCapability[] = [
  ...ACCESS_BASE_CAPABILITIES,
  ...ACCESS_ELEMENT_CAPABILITIES,
];

export interface AccessRoleTemplate {
  id: string;
  agencyId: string;
  name: string;
  description?: string;
  capabilities: AccessCapability[];
  allowedScopeKinds: AccessScopeKind[];
  allowedEnvironments: AccessEnvironment[];
  archivedAt?: number;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
  idempotencyKey?: string;
}

export interface AccessGrant {
  id: string;
  agencyId: string;
  userId: string;
  scope: AccessScope;
  environment: AccessEnvironment;
  /** Direct capabilities, additive with the referenced template. */
  capabilities: AccessCapability[];
  templateId?: string;
  expiresAt?: number;
  revokedAt?: number;
  revokedBy?: string;
  revokeReason?: string;
  reason?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  idempotencyKey?: string;
  requestId?: string;
}

export type AccessRequestStatus = "pending" | "approved" | "denied" | "cancelled";

export interface AccessRequest {
  id: string;
  agencyId: string;
  requesterUserId: string;
  scope: AccessScope;
  environment: AccessEnvironment;
  requestedCapabilities: AccessCapability[];
  reason: string;
  requestedExpiresAt?: number;
  status: AccessRequestStatus;
  approvedCapabilities?: AccessCapability[];
  grantId?: string;
  decisionReason?: string;
  decidedBy?: string;
  decidedAt?: number;
  createdAt: number;
  updatedAt: number;
  idempotencyKey?: string;
}

// ─── Server-side users ────────────────────────────────────────────────────

// R025 schema version. The migration runner walks the users map and
// rewrites legacy single-agency rows into multi-agency shape (agencyIds
// derived from `agencyId`). Bumped on schema changes that the runner
// can detect + repair idempotently.
export const USER_SCHEMA_V = 2;

// ─── Two-factor recovery codes ────────────────────────────────────────────
//
// Stored ON the user record deliberately: `state.users` rides through the
// storage parser wholesale, so an optional field here survives every
// hydration without a new line in storage.ts's parseBlob allowlist (a new
// top-level collection would be silently destroyed without one — see the
// warning inside parseBlob).
export interface MfaRecoveryState {
  /** scrypt-hashed codes — same `scrypt$N$r$p$<salt>$<hash>` format as
   *  `passwordHash`. A code's entry is DELETED the moment it is spent, so
   *  single-use is enforced by absence and `codeHashes.length` is how many
   *  remain. Plaintext codes are never stored anywhere. */
  codeHashes: string[];
  /** When this set was generated (epoch ms). */
  generatedAt: number;
  /** Codes consumed from this set since `generatedAt`. */
  usedCount: number;
}

export interface ServerUser {
  id: string;
  email: string;
  username?: string;
  name: string;
  passwordHash: string;          // scrypt$N$r$p$<salt-hex>$<derived-hex>
  role: Role;
  // R025: every user can now belong to multiple agencies (master/satellite
  // pattern from chapter #123). The legacy `agencyId` field is kept as a
  // mirror so 56+ existing callsites keep working; new code reads
  // `agencyIds` and treats `agencyId` as "the user's primary / current
  // agency". Lead role carries `agencyIds: []` (global tenant).
  agencyIds: string[];
  agencyId: string;              // legacy mirror — = agencyIds[0] (or LEAD_AGENCY_ID for leads)
  companyIds?: string[];          // empty/undefined = shared Milesymedia access
  clientId?: string;             // set for client-* roles + freelancer + end-customer
  mustChangePassword?: boolean;
  /**
   * When the customer finished setting their own password and saw the welcome.
   *
   * Absent means they have never been through it — which is how the portal
   * knows to show setup rather than dropping somebody who has only ever
   * followed a link straight into a workspace they have no password for.
   */
  welcomeCompletedAt?: number;
  emailVerifiedAt?: number;       // R020: epoch ms when verification token redeemed
  sessionRev?: number;            // R021: rotation counter; bumped on role/password change
  /** Access-policy revision. Grant/template changes bump this cache epoch. */
  accessRev?: number;
  // R036: optional profile picture as a `data:image/...;base64,...` data URL.
  // v1 stores inline on the user record (256×256 cap → ~50KB after client-side
  // canvas resize). R+1 swaps to an external ref via the client-files plugin
  // once foundation has user-scoped file storage.
  avatarUrl?: string;
  // Two-factor recovery codes (hashed, single-use, shown exactly once).
  // Generated when the account's first TOTP-gated sign-in completes. See
  // `lib/server/auth/mfa.ts` — issueRecoveryCodesIfMissing / consumeRecoveryCode.
  mfaRecovery?: MfaRecoveryState;
  createdAt: number;
  updatedAt: number;
}

// ─── Session cookie payload ───────────────────────────────────────────────
//
// Carried in `lk_session_v1` (HMAC-signed). Middleware decodes; route
// handlers re-verify via `getSession()`. iat/exp in unix seconds.

export type SandboxDataset = "empty" | "demo" | "snapshot";
export type SandboxAccess = "read-only" | "writable";
export type SandboxPersona = "owner" | "staff" | "customer" | "freelancer";

export interface SandboxSessionEnvironment {
  /** Opaque, server-minted storage realm. Never accept this value from a UI. */
  realmId: string;
  dataset: SandboxDataset;
  access: SandboxAccess;
  persona?: SandboxPersona;
  /** Signed live control-plane authority to reset data or inspect personas. */
  governor?: boolean;
  /** The live identity and tenant restored when Sandbox Mode is switched off. */
  returnUserId: string;
  returnAgencyId: string;
  returnWasDemo?: boolean;
  returnAal?: "aal1" | "aal2";
  enteredAt: number;
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: Role;
  // R025: legacy field kept for back-compat (mirrors `activeAgencyId`).
  // 56+ callsites read `session.agencyId`; rather than refactor every
  // one, we mirror the active agency here.
  agencyId: string;
  // R025: full membership list. Master users (chapter #123) carry
  // multiple entries; the Topbar agency switcher (R026) flips
  // `activeAgencyId` between them.
  agencyIds?: string[];
  // R025: which agency the session is currently scoped to. Reads
  // default to this when scoping. `activeAgencyId === agencyId`
  // unless the user explicitly switched in the Topbar.
  activeAgencyId?: string;
  clientId?: string;
  /** Canonical environment selector. Legacy demo/showcase fields remain during migration. */
  sandbox?: SandboxSessionEnvironment;
  // Sandboxed demo session. Set when the cookie was issued by `/demo`
  // (not by `/api/auth/login`). Surfaces a banner + POV toggle in the
  // portal chrome and isolates the demo agency from real tenants.
  isDemo?: boolean;
  // Showcase Mode uses an isolated, hardcoded tenant during client calls.
  // The signed return id restores the live workspace without exposing it.
  showcaseReturnAgencyId?: string;
  // Dev Mode (local/dev only) mints a demo-persona session in the fenced
  // `demo-agency` tenant. The signed return id restores the founder's real
  // workspace on exit — the exact mirror of `showcaseReturnAgencyId`, kept
  // separate so the chrome + exit path can tell Dev Mode from Showcase Mode.
  devReturnAgencyId?: string;
  // Whether the session that entered Dev Mode was itself a demo/dev session
  // (e.g. the local `/dev` sign-in, which is `isDemo`). Exit restores this so a
  // local dev founder returns to a session `getSession()` accepts, instead of a
  // non-demo one that fails the Supabase identity cross-check → login.
  devReturnWasDemo?: boolean;
  // The EXACT user who started the inspection. Exit restores THIS user rather
  // than "an owner found in the agency" — the same escalation the freelancer
  // preview was fixed for (audits.md 2026-08-19), and what lets Ed inspect a
  // demo persona and come back as HIMSELF. Additive: legacy Dev Mode cookies
  // without it fall back to the old owner lookup.
  devReturnUserId?: string;
  // Freelancer preview (an owner/manager previewing a real freelancer's
  // workspace). Distinct from the Dev Mode `devReturn*` fields so the Dev Mode
  // switcher doesn't show; the freelancer layout renders an "Exit preview"
  // instead.
  previewReturnAgencyId?: string;
  previewReturnWasDemo?: boolean;
  // The EXACT user who entered the preview. Exit restores THIS user (not "an
  // owner in the agency") — without it a manager could enter → exit and be
  // re-minted as the agency owner (a privilege escalation; see audits.md
  // 2026-08-19). Additive; legacy preview cookies without it fail exit closed.
  previewReturnUserId?: string;
  // Public portfolio session for the real product demo. It is isolated to
  // fictional showcase data and middleware rejects every mutating request.
  publicShowcase?: boolean;
  // R021: session-rotation revision. When user.sessionRev > payload.sessionRev
  // the session is stale (role/password changed) and should be rejected on
  // user-aware paths (getCurrentUser / requireRole+lookup). Stateless verify
  // via HMAC stays cheap; rotation enforcement is opt-in at the lookup layer.
  sessionRev?: number;
  /** Must match the authoritative user's accessRev on capability-gated paths. */
  accessRev?: number;
  // Which assurance level this sign-in actually proved. "aal2" only when a
  // second factor (TOTP or a recovery code) was verified by the flow that
  // minted this cookie; "aal1" for password-only sign-ins. Optional and
  // additive: cookies minted before this field existed carry nothing, and an
  // absent value must be read as "not proven" — never as aal2.
  aal?: "aal1" | "aal2";
  iat: number;
  exp: number;
}

// ─── Plugin install records ───────────────────────────────────────────────
//
// Per-tenant install state. Architecture §2: per-tenant scope, with
// `clientId` set when the install is client-scoped (most common) and
// undefined when the install is agency-wide (e.g. a fulfillment plugin
// the agency uses across all clients).

export interface PluginInstall {
  id: string;                    // `${agencyId}|${clientId ?? "_agency"}|${pluginId}`
  pluginId: string;
  agencyId: string;
  clientId?: string;
  enabled: boolean;
  config: Record<string, unknown>;
  features: Record<string, boolean>;
  setupAnswers?: Record<string, string>;
  installedAt: number;
  installedBy?: string;          // user id of installer
  health?: { ok: boolean; message?: string };
  healthCheckedAt?: number;
}

// Composite scope used for plugin installs. `clientId === undefined`
// means agency-wide; otherwise client-scoped under the agency.
export interface PluginInstallScope {
  agencyId: string;
  clientId?: string;
}

// ─── Activity log ─────────────────────────────────────────────────────────

export type ActivityCategory =
  | "auth"
  | "tenant"
  | "plugin"
  | "phase"
  | "fulfillment"
  | "ecommerce"     // T2 ecommerce plugin
  // R6 plugin wire-up — extend as new plugins land. Each plugin's
  // chapter §"Foundation pending" lists the category it stamps.
  | "hr"            // T2 agency-hr
  | "memberships"   // T2 memberships
  | "affiliates"    // T2 affiliates
  | "finance"       // T2 agency-finance
  | "marketing"     // T2 agency-marketing
  | "crm"           // T2 client-crm
  | "public-funnel"  // T2 public-funnel (R032 promotion)
  | "bos-auth-gate"  // T2 bos-auth-gate (R032 promotion)
  | "payroll"        // T2 R015 (R033 batch)
  | "integrations"   // T2 R016 (R033 batch)
  | "inbox"
  | "support"        // T2 R017 (R033 batch)
  | "onboarding"     // T2 R018 (R033 batch)
  | "reports"        // T2 R019 (R033 batch)
  | "feedback"       // T2 R020 (R033 batch)
  | "team-resources" // T2 R014 (R033 batch)
  | "resources"      // T2 R013 (R033 batch)
  | "files"          // T2 R010 (R033 batch)
  | "leads"          // T2 R027 leads-pipeline (T1 R037 wire-up)
  | "settings"
  | "system";

export interface ActivityEntry {
  id: string;
  ts: number;
  agencyId: string;
  clientId?: string;
  actorUserId?: string;
  actorEmail?: string;
  category: ActivityCategory;
  action: string;                // verb, e.g. "client.created"
  message: string;
  metadata?: Record<string, unknown>;
}

export type ClientRecordLedgerGroup = "messages" | "notes" | "calls" | "commercial" | "delivery" | "files" | "activity";
export type ClientRecordLedgerVisibility = "internal" | "client" | "inherent" | "system";
export type ClientRecordLedgerAttention = "critical" | "warning";
export type ClientRecordLedgerSource = "record-entry" | "enquiry" | "message" | "call" | "file" | "activity" | "contract" | "invoice" | "payment-plan" | "delivery";

export interface ClientRecordLedgerEvent {
  id: string;
  agencyId: string;
  clientId: string;
  sourceType: ClientRecordLedgerSource;
  sourceId: string;
  group: ClientRecordLedgerGroup;
  title: string;
  body?: string;
  occurredAt: number;
  eyebrow: string;
  visibility: ClientRecordLedgerVisibility;
  href?: string;
  attention?: ClientRecordLedgerAttention;
  parentSourceId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ClientRecordLedgerPage {
  events: ClientRecordLedgerEvent[];
  nextCursor?: string;
  hasMore: boolean;
  total: number;
  retainedTotal: number;
  counts: Record<"all" | ClientRecordLedgerGroup, number>;
  summary: {
    shared: number;
    canonical: number;
    attention: number;
    dateReview: number;
  };
}

// ─── Organisation ─────────────────────────────────────────────────────────
//
// The customer company. A buyer is often an organisation rather than a
// single human: one company may put ten people in front of you — an owner,
// a finance contact, two execs, a marketing manager — and every one of them
// may email, book meetings, or appear on an enquiry.
//
// Without this, each of those people becomes an unrelated record and the
// relationship is scattered. The existing data already shows the problem:
// "Meridian Kitchens", "Cedar Dental" and "Summit Physio" are stored as
// leads, i.e. companies sitting in records meant for people.
//
// NOT `TradingCompany`, which is one of Ed's OWN brands (Milesymedia,
// AquaOasis, Zimante) and drives customer-facing portal branding.

export interface Organisation {
  id: string;
  agencyId: string;
  name: string;
  // Email domain, e.g. "commonground.example". The strongest automatic
  // grouping signal — two people sharing a domain almost always share an
  // employer. `IdentityResolutionReason` already has an `email-domain` kind.
  domain?: string;
  website?: string;
  phone?: string;
  classification: PersonClassification;
  classificationHistory: PersonClassificationEvent[];
  facets: {
    clientIds?: string[];
    enquiryIds?: string[];
  };
  relationshipId?: string;
  source?: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Person ───────────────────────────────────────────────────────────────
//
// The canonical human. One Person per real individual, regardless of how many
// records they accumulate. `Lead`, `Contact` and `Client` are facets that
// point back here via `personId`; they are never deleted when a person is
// reclassified, only detached from the active state.
//
// This exists because classification used to destroy records: reclassifying a
// sales lead as a supplier hard-deleted the lead and every meeting note, call
// recording and sales presentation on it. State belongs to the Person; the
// facets retain their own history.
//
// Distinct from `Client.relationshipId`, which groups client *workspaces* for
// one buyer and stops at clients. Person spans enquiry → contact → lead →
// client. Clients sharing a `relationshipId` share a `personId`.
//
// Named `Person`/`persons` deliberately: the `people*` aggregates
// (`peopleEmployees`, `peopleApplications`, …) are the HR domain and are a
// different concept.

// The card's face. Derived from which facets exist and how the person is
// classified — never set by hand, so it cannot drift from the underlying
// records. See `derivePersonState`.
export type PersonState = "enquiry" | "contact" | "lead" | "client";

// How the relationship is understood. Mirrors WebsiteEnquiryClassification so
// an enquiry decision maps straight onto the person, but it lives here as the
// authoritative value — the enquiry only records what was decided at the time.
export type PersonClassification =
  | "unclassified"
  | "sales"
  | "existing-client"
  | "supplier"
  | "partnership"
  | "marketer"
  | "recruitment"
  | "spam"
  | "other";

export interface PersonClassificationEvent {
  from: PersonClassification;
  to: PersonClassification;
  at: number;
  by?: string;
  note?: string;
  // Which record prompted the change, so the card can show provenance.
  sourceType?: IdentityResolutionSource;
  sourceId?: string;
}

// Pointers to the records this person owns. A person keeps every facet they
// have ever had; `PersonState` decides which one the card leads with.
export interface PersonFacets {
  leadId?: string;
  contactId?: string;
  // A buyer may hold several client workspaces (see Client.relationshipId).
  clientIds?: string[];
  enquiryIds?: string[];
}

// One person routinely has several addresses and numbers — a work email, a
// personal one, a mobile, a desk line. Matching must consider all of them, or
// the same human arrives twice under different records.
//
// `value` is the normalised form used for matching; `raw` preserves what was
// actually entered so the card can display it the way the person writes it.
export interface PersonEmail {
  value: string;
  raw?: string;
  label?: string;        // free text: "work", "personal", "accounts", …
  isPrimary?: boolean;
}

export interface PersonPhone {
  value: string;
  raw?: string;
  label?: string;        // free text: "mobile", "office", "whatsapp", …
  isPrimary?: boolean;
  /** Shared switchboards remain contactable but never identify a person without a compatible name. */
  shared?: boolean;
}

// Company membership is proposed by the system and decided by a human.
//
// A rejected link is retained deliberately: without it the same wrong guess
// resurfaces every time evidence is recalculated, and a dismissed suggestion
// that keeps coming back is worse than no suggestion at all.
export type OrganisationLinkStatus = "suggested" | "confirmed" | "rejected";

export interface PersonOrganisationLink {
  organisationId: string;
  status: OrganisationLinkStatus;
  confidence?: number;   // 0–1, suggestions only
  reason?: string;       // "Shares the domain commonground.example"
  suggestedAt?: number;
  decidedAt?: number;
  decidedBy?: string;
}

/**
 * A meeting, call or note recorded against a person before they are a client.
 *
 * Enquiries and replies come from the website store; these are the things an
 * operator adds by hand while working a relationship. Held on the Person so
 * they survive classification changes, and so they can seed the real client
 * record when the person converts.
 */
export interface PersonRecordEntry {
  id: string;
  kind: "meeting" | "call" | "note";
  at: number;
  summary: string;
  body?: string;
  /** Where a meeting happened, or how a call was made. */
  location?: string;
  outcome?: string;
  createdBy?: string;
  createdAt: number;
}

export interface Person {
  id: string;
  agencyId: string;
  // All known addresses and numbers, normalised via
  // normaliseIdentityEmail/normaliseIdentityPhone so matching stays
  // consistent with the existing identity resolution layer. Matching
  // considers every entry, not just the primary.
  emails: PersonEmail[];
  phones: PersonPhone[];
  name?: string;
  // Free-text company name as captured. Superseded by `organisationId` once
  // a human confirms the link, but retained as evidence of what was entered.
  company?: string;
  // The confirmed company. Only ever set from a `confirmed` link below — the
  // system proposes, a human decides.
  organisationId?: string;
  organisationLinks: PersonOrganisationLink[];
  // Free text on purpose. Roles vary far too widely to enumerate — cleaner,
  // CFO, CTO, site foreman, practice manager.
  jobTitle?: string;
  // The person the agency deals with by default for this organisation.
  // Only one per organisation should carry it.
  isPrimaryContact?: boolean;
  notes?: string;
  /** Meetings, calls and notes added by hand. See PersonRecordEntry. */
  record?: PersonRecordEntry[];
  // Anything else worth recording that has no typed home.
  customFields?: Record<string, string>;
  classification: PersonClassification;
  classifiedAt?: number;
  classifiedBy?: string;
  classificationHistory: PersonClassificationEvent[];
  facets: PersonFacets;
  // Mirrors Client.relationshipId for people who hold client workspaces, so
  // the two groupings agree without rewriting the 39 relationshipId sites.
  relationshipId?: string;
  source?: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Completed work ───────────────────────────────────────────────────────
//
// Resolving something used to leave no trace: the alert stopped firing and
// that was that. So "did I already deal with this?" had no answer, and there
// was no record of a day's work to look back on.
//
// Deliberately a separate log rather than a flag on the alert: alerts are
// derived from live evidence and cease to exist once the evidence is healthy,
// taking any flag with them. What was done is a fact about the past and has to
// outlive the thing that prompted it.

export type CompletedActionOutcome =
  | "resolved"      // dealt with, evidence should now be healthy
  | "accepted"      // turned into committed work
  | "dismissed"     // judged not worth acting on
  | "not-applicable";

export interface CompletedAction {
  id: string;
  agencyId: string;
  /** The alert or task this came from, so a repeat can be recognised. */
  sourceId: string;
  title: string;
  detail?: string;
  origin?: AgencyTaskOrigin;
  outcome: CompletedActionOutcome;
  completedAt: number;
  completedBy?: string;
  /** What the operator did, in their words. */
  note?: string;
}

export type IdentityResolutionSource = "website-enquiry" | "social-inbox" | "lead" | "contact";
export type IdentityResolutionStatus = "resolved" | "ambiguous" | "unmatched";
export type IdentityReviewStatus = "pending" | "linked" | "auto-linked" | "parked" | "dismissed";

export interface IdentityResolutionReason {
  kind: "explicit" | "crm-id" | "email" | "phone" | "name" | "company" | "email-domain";
  label: string;
  detail: string;
  weight: number;
}

export interface IdentityResolutionCandidate {
  clientId: string;
  clientName: string;
  clientContactId?: string;
  confidence: number;
  reasons: IdentityResolutionReason[];
}

export interface IdentityResolutionResult {
  status: IdentityResolutionStatus;
  confidence: number;
  clientId?: string;
  clientName?: string;
  clientContactId?: string;
  leadId?: string;
  contactId?: string;
  candidates: IdentityResolutionCandidate[];
  explanation: string;
  resolvedAt: number;
}

export interface IdentityResolutionReview {
  id: string;
  agencyId: string;
  sourceType: IdentityResolutionSource;
  sourceId: string;
  sourceLabel: string;
  sourceHref?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  leadId?: string;
  contactId?: string;
  status: IdentityReviewStatus;
  resolution: IdentityResolutionResult;
  selectedClientId?: string;
  decisionNote?: string;
  parkedUntil?: number;
  decidedBy?: string;
  decidedAt?: number;
  createdAt: number;
  updatedAt: number;
}

// Phases are seeded with 6 defaults but stored as data so each agency can
// customise. T2 owns the full implementation; foundation just declares the
// shape so phase-aware code can compile.
export interface PhaseDefinition {
  id: string;
  agencyId: string;
  stage: ClientStage;
  label: string;
  description?: string;
  order: number;
  pluginPreset: string[];        // pluginIds installed when this phase becomes active
  portalVariantId?: string;      // T3-owned editor page id
  checklist: PhaseChecklistItem[];
  // T1 R+ phases-preview: marks seeded defaults so the UI can refuse
  // deletion. Custom phases added through the agency UI omit the flag.
  isDefault?: boolean;
  // Operator-authored CSS / JS injected into the client portal head
  // when previewing this phase. NOT sanitised — only operators with
  // founder / agency-manager scope can author. Treat as the same
  // trust level as a code-pushed brand kit override.
  customCss?: string;
  customJs?: string;
  // Phases-as-presets (2026-05-08, chapter `04-phases-presets-architecture.md`).
  // Optional welcome screen shown on client's first landing at this phase
  // (e.g. "Welcome Felicia — let's complete your onboarding").
  welcomeHeading?: string;
  welcomeBody?: string;
  // Optional sidebar override — when set, the per-client layout renders
  // ONLY these nav items instead of the full plugin-driven sidebar.
  // Lets a phase like "Onboarding" present a stripped, focused workspace.
  sidebarOverride?: Array<{ id: string; label: string; href: string; order?: number }>;
  // Public-facing flag — when true this phase is selectable as a public
  // demo (powering /business-os, /health-check, /demo embeds). Only
  // operators can flip this; defaults false.
  isPublicPreset?: boolean;
}

export interface PhaseChecklistItem {
  id: string;
  label: string;
  visibility: "internal" | "client";
  done?: boolean;
}

// ─── Pipelines (T1 R034) ──────────────────────────────────────────────────
//
// Multi-pipeline kanban model. Each agency owns N named pipelines — the
// "Clients" tab is no longer a single grid; it's the **fulfilment**
// pipeline among many (leads / sales / custom). Foundation owns the
// domain shape + storage; T2's kanban plugin (R+1) renders cards.

export type PipelineKind = "fulfilment" | "leads" | "sales" | "custom";

export type PipelineCardKind = "client" | "lead" | "deal" | "custom";

export interface PipelineColumn {
  id: string;
  label: string;
  color?: string;     // hex, optional palette tint
  order: number;
}

export interface LeadSnapshot {
  email: string;
  phone?: string;
  name?: string;
  source?: string;
  capturedAt?: number;
}

export interface DealSnapshot {
  title: string;
  amount?: number;
  contactEmail?: string;
}

// Polymorphic card. Foundation declares the union; T2 R027 renders.
// Each pipeline declares its `allowedCardKinds` — runtime helpers
// reject inserts of disallowed kinds.
export type PipelineCard =
  | {
      id: string;
      pipelineId: string;
      columnId: string;
      order: number;
      kind: "client";
      clientId: string;
      createdAt: number;
      updatedAt: number;
    }
  | {
      id: string;
      pipelineId: string;
      columnId: string;
      order: number;
      kind: "lead";
      lead: LeadSnapshot;
      createdAt: number;
      updatedAt: number;
    }
  | {
      id: string;
      pipelineId: string;
      columnId: string;
      order: number;
      kind: "deal";
      deal: DealSnapshot;
      createdAt: number;
      updatedAt: number;
    }
  | {
      id: string;
      pipelineId: string;
      columnId: string;
      order: number;
      kind: "custom";
      payload: Record<string, unknown>;
      createdAt: number;
      updatedAt: number;
    };

export interface Pipeline {
  id: string;
  agencyId: string;
  kind: PipelineKind;
  name: string;
  slug: string;
  columns: PipelineColumn[];
  allowedCardKinds: PipelineCardKind[];
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

// ─── Milesymedia assistant ───────────────────────────────────────────────

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  skillId?: string;
  createdAt: number;
}

export interface AssistantThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AssistantMessage[];
}

export interface AssistantMemory {
  id: string;
  content: string;
  createdAt: number;
  sourceThreadId?: string;
}

export type AssistantTurnOperationStatus = "generating" | "provider-complete" | "failed" | "completed";

export interface AssistantTurnOperation {
  id: string;
  threadId: string;
  sourceThreadId?: string;
  message: string;
  skillId: string;
  memoryContent?: string;
  userMessageId: string;
  assistantMessageId: string;
  memoryId?: string;
  status: AssistantTurnOperationStatus;
  attempts: number;
  leaseExpiresAt?: number;
  answer?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface AssistantWorkspaceState {
  agencyId: string;
  userId: string;
  threads: AssistantThread[];
  memories: AssistantMemory[];
  turnOperations?: AssistantTurnOperation[];
  updatedAt: number;
}

export type AdvisorSkillRecipeId =
  | "executive-radar"
  | "lead-response-triage"
  | "client-health-review"
  | "finance-guard"
  | "delivery-blockers"
  | "reply-drafter"
  | "priority-task-proposal"
  | "single-task-create";

export interface AdvisorCustomSkill {
  id: string;
  name: string;
  description?: string;
  recipeId: AdvisorSkillRecipeId;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AdvisorSkillPolicy {
  enabled: boolean;
}

export type ExternalAssistantApiPermission =
  | "advisor:read"
  | "actions:propose"
  | "context:read"
  | "records:read"
  | "search:read"
  | "export:read";

export interface ExternalAssistantApiKey {
  id: string;
  agencyId: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  fingerprint: string;
  modules: string[];
  permissions: ExternalAssistantApiPermission[];
  createdAt: number;
  createdBy: string;
  expiresAt?: number;
  lastUsedAt?: number;
  revokedAt?: number;
  revokedBy?: string;
}

export type ExternalAssistantProposalStatus = "pending" | "parked" | "accepted" | "rejected";
export type ExternalAssistantProposalCategory =
  | "company"
  | "client"
  | "sales"
  | "finance"
  | "delivery"
  | "support"
  | "development"
  | "marketing"
  | "operations";

export interface ExternalAssistantActionProposal {
  id: string;
  agencyId: string;
  assistantKeyId?: string;
  assistantFingerprint: string;
  assistantName: string;
  title: string;
  detail: string;
  evidence: string[];
  category: ExternalAssistantProposalCategory;
  priority: AgencyTaskPriority;
  suggestedDueAt?: number;
  sourceIds: string[];
  sourceHref?: string;
  expectedOutcome?: string;
  status: ExternalAssistantProposalStatus;
  submittedAt: number;
  updatedAt: number;
  parkedUntil?: number;
  decidedAt?: number;
  decidedBy?: string;
  decisionNote?: string;
  taskId?: string;
}

// ─── Agency tasks ────────────────────────────────────────────────────────

export type AgencyTaskStatus = "todo" | "in-progress" | "done";
export type AgencyTaskPriority = "low" | "normal" | "high" | "urgent";
export type AgencyTaskRecurrence = "none" | "daily" | "weekly" | "monthly";
export type ClientTaskBoardColumnId = "backlog" | "this-week" | "doing" | "waiting-on-client" | "review" | "done";
// "inbox" is work accepted from a Needs-attention alert. Added after the
// four original origins; existing rows have no "inbox" value, so no
// migration is needed — `taskOrigin` still defaults absent values to manual.
export type AgencyTaskOrigin = "manual" | "radar" | "advisor" | "crm" | "inbox";
export type AgencyTaskReconciliationStatus = "pending" | "still-firing" | "resolved" | "unverifiable" | "reopened";

export interface AgencyTaskReconciliation {
  status: AgencyTaskReconciliationStatus;
  sourceIds: string[];
  activeSourceIds: string[];
  checkedAt?: number;
  resolvedAt?: number;
  detail: string;
}

/**
 * A sub-task on an action.
 *
 * "Onboard Cedar Dental" is not one thing — it is create the portal, send the
 * welcome pack, book the kick-off. Without sub-tasks each of those is either a
 * separate top-level action (losing the fact that they belong together) or
 * invisible (leaving the operator to remember the sequence).
 *
 * `done` is stored here, unlike derived plan steps, because a human decides
 * when "send the welcome pack" is finished — there is no record to observe.
 * The two kinds sit side by side in the UI; only the source of truth differs.
 */
export interface AgencyTaskChecklistItem {
  id: string;
  label: string;
  /** Where this sub-task is carried out, so it can have its own Resolve. */
  href?: string;
  /** What the destination should highlight when opened. */
  focus?: string;
  /** An SOP to follow for this step. */
  sopId?: string;
  done: boolean;
  doneAt?: number;
  doneBy?: string;
  createdAt: number;
}

/**
 * A saved sequence, so repeatable work is written down once.
 *
 * Stored per agency alongside the read-only built-in library in
 * `@/lib/tasks/taskTemplates`. Both share one shape because the operator does
 * not care which is which — the only difference is that a built-in cannot be
 * edited away.
 */
export interface AgencyTaskTemplateStep {
  label: string;
  href?: string;
  focus?: string;
  sopId?: string;
}

export interface AgencyTaskTemplate {
  id: string;
  agencyId: string;
  name: string;
  summary?: string;
  /** May contain `{subject}`, filled in when the template is applied. */
  taskTitle: string;
  notes?: string;
  priority?: AgencyTaskPriority;
  steps: AgencyTaskTemplateStep[];
  /**
   * Alert families this template claims, so a matching action arrives with
   * its steps already on it. Beats the built-in mapping — somebody who wrote
   * their own onboarding sequence means it to win.
   */
  appliesTo?: string[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgencyTask {
  id: string;
  agencyId: string;
  title: string;
  notes?: string;
  status: AgencyTaskStatus;
  priority: AgencyTaskPriority;
  startAt?: number;
  dueAt?: number;
  reminderAt?: number;
  recurrence?: AgencyTaskRecurrence;
  seriesId?: string;
  origin?: AgencyTaskOrigin;
  sourceId?: string;
  sourceHref?: string;
  evidence?: string[];
  evidenceSourceIds?: string[];
  expectedOutcome?: string;
  reconciliation?: AgencyTaskReconciliation;
  acceptedAt?: number;
  assigneeUserId?: string;
  clientId?: string;
  sopIds?: string[];
  customFields?: Record<string, PortalFormFieldValue>;
  /** Monotonic version used by shared client-board moves and deletes. */
  revision?: number;
  /** Optional projection of this canonical Action into the client fulfilment board. */
  clientBoardColumn?: ClientTaskBoardColumnId;
  clientBoardOrder?: number;
  /** Sub-tasks. See AgencyTaskChecklistItem. */
  checklist?: AgencyTaskChecklistItem[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

// ─── Personal notepad ────────────────────────────────────────────────────

export type NotepadNoteStatus = "active" | "archived" | "trashed";
export type NotepadNoteVisibility = "private" | "workspace";

export interface NotepadFolder {
  id: string;
  agencyId: string;
  ownerUserId: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
}

export interface NotepadNote {
  id: string;
  agencyId: string;
  ownerUserId: string;
  folderId?: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  status: NotepadNoteStatus;
  visibility: NotepadNoteVisibility;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
  trashedAt?: number;
}

// ─── Internal automations ───────────────────────────────────────────────

export type AutomationWorkflowStatus = "draft" | "active" | "paused";
export type AutomationTriggerType =
  | "manual"
  | "website-enquiry.received"
  | "client-request.received"
  | "social-message.received"
  | "client.created"
  | "client.updated"
  | "client.archived"
  | "client.stage_changed"
  | "phase.advanced"
  | "phase.checklist_item_completed"
  | "deliverable.submitted"
  | "deliverable.approved"
  | "page.published"
  | "invoice.paid"
  | "email.delivered"
  | "schedule.daily"
  | "custom.event";
export type AutomationNodeKind = "trigger" | "delay" | "condition" | "action";
export type AutomationActionType = "send-email" | "create-task" | "log-activity" | "send-webhook";
export type AutomationConditionType = "enquiry.awaiting-response" | "client-request.awaiting-response" | "event-field";
export type AutomationConditionOperator = "equals" | "not-equals" | "contains" | "starts-with" | "ends-with" | "greater-than" | "less-than" | "exists" | "not-exists";

export interface AutomationNodeConfig {
  label: string;
  description?: string;
  triggerType?: AutomationTriggerType;
  eventName?: string;
  scheduleHour?: number;
  delayMinutes?: number;
  conditionType?: AutomationConditionType;
  field?: string;
  operator?: AutomationConditionOperator;
  value?: string;
  actionType?: AutomationActionType;
  recipient?: string;
  subject?: string;
  message?: string;
  taskTitle?: string;
  taskPriority?: AgencyTaskPriority;
  dueInMinutes?: number;
  webhookUrl?: string;
  webhookMethod?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  webhookHeaders?: string;
  webhookBody?: string;
}

export interface AutomationWorkflowNode {
  id: string;
  kind: AutomationNodeKind;
  position: { x: number; y: number };
  config: AutomationNodeConfig;
}

export interface AutomationWorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: "yes" | "no";
}

export interface AutomationFolder {
  id: string;
  agencyId: string;
  name: string;
  description?: string;
  color: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface AutomationWorkflow {
  id: string;
  agencyId: string;
  name: string;
  description?: string;
  folderId?: string;
  status: AutomationWorkflowStatus;
  nodes: AutomationWorkflowNode[];
  edges: AutomationWorkflowEdge[];
  runCount: number;
  successCount: number;
  failureCount: number;
  lastRunAt?: number;
  lastOutcome?: "succeeded" | "failed" | "skipped";
  lastScheduledFor?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type AutomationRunStatus = "running" | "waiting" | "succeeded" | "failed" | "skipped";

export interface AutomationRunLog {
  at: number;
  nodeId?: string;
  level: "info" | "success" | "error";
  message: string;
}

export interface AutomationRun {
  id: string;
  agencyId: string;
  workflowId: string;
  triggerType: AutomationTriggerType;
  mode: "live" | "test";
  status: AutomationRunStatus;
  currentNodeId?: string;
  completedNodeIds: string[];
  eventData: Record<string, string | number | boolean | null>;
  waitUntil?: number;
  logs: AutomationRunLog[];
  initiatedBy?: string;
  /** Stable source operation used to suppress duplicate workflow runs. */
  idempotencyKey?: string;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
}

export type CustomAIStatus = "testing" | "active" | "paused" | "retired";

export interface CustomAIRecord {
  id: string;
  agencyId: string;
  name: string;
  purpose?: string;
  provider?: string;
  workspaceUrl: string;
  docsUrl?: string;
  status: CustomAIStatus;
  ownerUserId?: string;
  capabilities: string[];
  notes?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Founder dashboard planning ──────────────────────────────────────────

export interface DashboardDayPlan {
  id: string;
  agencyId: string;
  userId: string;
  date: string;
  focus?: string;
  planNotes?: string;
  doneNotes?: string;
  plannedHours?: number;
  targetRevenuePounds?: number;
  createdAt: number;
  updatedAt: number;
}

export type CommandCalendarEntryType = "event" | "work-block" | "note" | "reminder" | "goal" | "target";
export type CommandCalendarEntryStatus = "planned" | "completed" | "cancelled";

export interface CommandCalendarEntry {
  id: string;
  agencyId: string;
  ownerUserId: string;
  type: CommandCalendarEntryType;
  title: string;
  notes?: string;
  startsAt: number;
  endsAt?: number;
  allDay: boolean;
  reminderAt?: number;
  status: CommandCalendarEntryStatus;
  targetValue?: number;
  currentValue?: number;
  targetUnit?: string;
  createdAt: number;
  updatedAt: number;
}

export type CommandCalendarConnectionStatus = "connected" | "syncing" | "error" | "revoked";

export interface CommandCalendarConnection {
  id: string;
  agencyId: string;
  ownerUserId: string;
  provider: "google";
  providerAccountId: string;
  accountEmail: string;
  accountName?: string;
  status: CommandCalendarConnectionStatus;
  encryptedAccessToken: string;
  encryptedRefreshToken?: string;
  accessTokenExpiresAt?: number;
  scopes: string[];
  lastSyncedAt?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CommandCalendarSource {
  id: string;
  agencyId: string;
  ownerUserId: string;
  connectionId: string;
  provider: "google";
  providerCalendarId: string;
  name: string;
  description?: string;
  color: string;
  foregroundColor?: string;
  timeZone?: string;
  accessRole: "none" | "freeBusyReader" | "reader" | "writer" | "owner";
  primary: boolean;
  selected: boolean;
  writable: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CommandCalendarExternalEvent {
  id: string;
  agencyId: string;
  ownerUserId: string;
  connectionId: string;
  sourceId: string;
  provider: "google";
  providerEventId: string;
  title: string;
  notes?: string;
  location?: string;
  startsAt: number;
  endsAt?: number;
  allDay: boolean;
  status: "confirmed" | "tentative";
  htmlLink?: string;
  organizerEmail?: string;
  attendeeCount?: number;
  recurringEventId?: string;
  sourceUpdatedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CommandCalendarEventCreateOperation {
  id: string;
  operationId: string;
  requestFingerprint: string;
  agencyId: string;
  ownerUserId: string;
  connectionId: string;
  sourceId: string;
  providerEventId: string;
  status: "pending" | "adopted" | "completed";
  refreshStatus?: "fresh" | "stale";
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  adoptedAt?: number;
  completedAt?: number;
}

export interface DashboardWeekPlan {
  id: string;
  agencyId: string;
  userId: string;
  weekStart: string;
  outcome?: string;
  reviewNotes?: string;
  wins?: string;
  misses?: string;
  lessons?: string;
  decisions?: string;
  risks?: string;
  startDoing?: string;
  stopDoing?: string;
  continueDoing?: string;
  nextWeekPriorities?: string;
  executionScore?: 1 | 2 | 3 | 4 | 5;
  energyScore?: 1 | 2 | 3 | 4 | 5;
  confidenceScore?: 1 | 2 | 3 | 4 | 5;
  reviewStatus?: "draft" | "complete";
  reviewedAt?: number;
  evidenceSnapshot?: DashboardWeeklyEvidenceSnapshot;
  createdAt: number;
  updatedAt: number;
}

export interface DashboardWeeklyEvidenceSnapshot {
  plannedHours: number;
  confirmedHours: number;
  unconfirmedHours: number;
  completedTasks: number;
  openTasks: number;
  revenueTargetPounds: number;
  dayReviewsCompleted: number;
  capturedAt: number;
}

export type DashboardWorkActivityMode = "aqua" | "external" | "break" | "unconfirmed";

export interface DashboardWorkActivityBlock {
  id: string;
  mode: DashboardWorkActivityMode;
  startedAt: number;
  endedAt?: number;
  focus?: string;
  note?: string;
  source: "clock" | "activity" | "declaration" | "idle" | "legacy";
}

export interface DashboardClockOutReview {
  outcome: string;
  openWork?: string;
  nothingOpen: boolean;
  nextPriority: string;
  dayScore: 1 | 2 | 3 | 4 | 5;
  unconfirmedTimeAcknowledged: boolean;
  submittedAt: number;
}

export interface DashboardWorkSession {
  id: string;
  agencyId: string;
  userId: string;
  date: string;
  startedAt: number;
  endedAt?: number;
  focus?: string;
  notes?: string;
  currentMode?: DashboardWorkActivityMode;
  currentModeSince?: number;
  lastAccountedAt?: number;
  lastHeartbeatAt?: number;
  lastInteractionAt?: number;
  lastVisibleAt?: number;
  lastPageVisibility?: "visible" | "hidden";
  lastCheckInAt?: number;
  nextCheckInAt?: number;
  needsActivityConfirmation?: boolean;
  aquaActiveMs?: number;
  externalWorkMs?: number;
  breakMs?: number;
  unconfirmedIdleMs?: number;
  currentPath?: string;
  routeActiveMs?: Record<string, number>;
  routeSwitches?: number;
  activityBlocks?: DashboardWorkActivityBlock[];
  clockOutReview?: DashboardClockOutReview;
  createdAt: number;
  updatedAt: number;
}

export interface SopDocument {
  id: string;
  agencyId: string;
  title: string;
  category?: string;
  categories?: string[];
  tags: string[];
  kind: "written" | "file" | "interactive";
  resourceType?: "procedure" | "document" | "presentation" | "video" | "audio" | "image" | "spreadsheet";
  content?: string;
  /**
   * Interactive SOP content — an element-engine block tree (the same
   * vocabulary websites, portals and product stages render). Present only when
   * `kind === "interactive"`; `written` uses `content` (markdown) and `file`
   * uses the upload fields. Additive: existing kinds never carry it. Rendered
   * read-only in the library via the shared `BlockRenderer`.
   */
  blocks?: BlockTreeJSON;
  fileName?: string;
  contentType?: string;
  size?: number;
  storageProvider?: "supabase" | "vercel-blob" | "local";
  storageKey?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
}

// ─── SOP guides (SOP Engine, Phase 3) ─────────────────────────────────────
//
// A GUIDE is an ordered sequence of existing SOPs — it is COMPOSED in the SOP
// library, not a new content type. It references `SopDocument`s that already
// exist (written | file | interactive) by id; viewing a guide renders each
// referenced SOP inline via the existing renderers. This is additive: the
// People-training island (`PeopleTrainingModule`) is deliberately left in
// place for now — a later phase folds it in.
//
// Ed's decision 2026-08-20: audience defaults to staff + founder; the quiz is
// OPT-IN per guide (`quizEnabled`, default off). Both are optional per-guide
// flags — absent means "use the sensible default", never "misconfigured".

/** Who a guide is intended for. */
export type SopGuideAudience = "staff" | "founder" | "freelancer" | "client";

export interface SopGuide {
  id: string;
  agencyId: string;
  title: string;
  description?: string;
  /** Ordered list of `SopDocument` ids. Order is meaningful — it is the
   *  sequence the guide is read in. Every id must resolve to a SOP owned by
   *  the same agency; validated on write. */
  sopIds: string[];
  /** Opt-in quiz/completion gate (Ed's decision — off unless turned on). */
  quizEnabled?: boolean;
  /** Intended audience. Absent → staff + founder (the launch default). */
  audience?: SopGuideAudience[];
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
}

export type AgencyProductPricing = "fixed" | "from" | "recurring" | "custom";
export type AgencyProductStatus = "draft" | "live" | "archived";
export type AgencyProductPortalRequirement = "required" | "optional" | "none";
export type AgencyProductKind = "product" | "package";
export type AgencyProductPortalTemplateKey = "website" | "brand-identity" | "photography" | "google-profile" | "content" | "social-ads" | "automation" | "custom-software" | "ongoing-care" | "business-os" | "health-check";
export type AgencyProductPortalMode = "onboarding" | "designing" | "developed-launch" | "maintenance";
export type AgencyProductWorkspaceModule = "relationship" | "commercial" | "delivery" | "communications" | "files" | "portal" | "systems" | "marketing" | "sops";

export interface AgencyProductWorkspaceStage {
  id: string;
  label: string;
  description?: string;
  portalMode: AgencyProductPortalMode;
}

export interface AgencyProductWorkspaceStep {
  id: string;
  title: string;
  instruction?: string;
  stageId?: string;
  module: AgencyProductWorkspaceModule;
  sopIds: string[];
  advanced?: boolean;
}

export interface AgencyProductInternalWorkspace {
  title?: string;
  objective?: string;
  lifecycleStages: AgencyProductWorkspaceStage[];
  quickActions: AgencyProductWorkspaceModule[];
  processSteps: AgencyProductWorkspaceStep[];
  advancedModules: AgencyProductWorkspaceModule[];
}

export interface AgencyProduct {
  id: string;
  agencyId: string;
  companyIds?: string[];          // empty/undefined = shared offer
  kind: AgencyProductKind;
  name: string;
  category: string;
  description?: string;
  buyerHeadline?: string;
  coverImageUrl?: string;
  accentColor?: string;
  portalRequirement: AgencyProductPortalRequirement;
  portalTemplateKey?: AgencyProductPortalTemplateKey;
  portalHeadline?: string;
  portalWelcomeNote?: string;
  portalStageFocus?: Partial<Record<AgencyProductPortalMode, string>>;
  portalSupportCta?: string;
  includedProductIds: string[];
  welcomePackItems: string[];
  welcomePackNotes?: string;
  pricing: AgencyProductPricing;
  priceCents?: number;
  billingInterval?: "month" | "quarter" | "year";
  depositPercent?: number;
  taxRatePercent?: number;
  paymentTermsDays?: number;
  billingNotes?: string;
  internalInfo?: string;
  internalWorkspace?: AgencyProductInternalWorkspace;
  deliverables: string[];
  contractTitle?: string;
  contractBody?: string;
  sopIds: string[];
  sopCategories: string[];
  customFields?: Record<string, PortalFormFieldValue>;
  status: AgencyProductStatus;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ClientProductVariation {
  productId: string;
  name?: string;
  description?: string;
  buyerHeadline?: string;
  coverImageUrl?: string;
  accentColor?: string;
  portalRequirement?: AgencyProductPortalRequirement;
  portalHeadline?: string;
  portalWelcomeNote?: string;
  portalStageFocus?: Partial<Record<AgencyProductPortalMode, string>>;
  portalSupportCta?: string;
  welcomePackItems?: string[];
  welcomePackNotes?: string;
  pricing?: AgencyProductPricing;
  priceCents?: number;
  billingInterval?: "month" | "quarter" | "year";
  depositPercent?: number;
  taxRatePercent?: number;
  paymentTermsDays?: number;
  billingNotes?: string;
  internalInfo?: string;
  internalWorkspace?: AgencyProductInternalWorkspace;
  deliverables?: string[];
  contractTitle?: string;
  contractBody?: string;
  sopIds?: string[];
  sopCategories?: string[];
  updatedAt: number;
  updatedBy: string;
}

export type ClientMilestoneStatus = "not-started" | "in-progress" | "complete" | "blocked";

export interface ClientMilestone {
  id: string;
  agencyId: string;
  clientId: string;
  title: string;
  description?: string;
  status: ClientMilestoneStatus;
  progress: number;
  targetAt?: number;
  metric?: "pageviews" | "visitors" | "conversions" | "search-clicks";
  targetValue?: number;
  currentValue?: number;
  autoTrack?: boolean;
  completedAt?: number;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export type PerformanceExperimentStatus = "draft" | "running" | "complete" | "paused";

export interface PerformanceExperimentVariant {
  id: string;
  name: string;
  visitors: number;
  conversions: number;
}

export interface PerformanceExperiment {
  id: string;
  agencyId: string;
  clientId?: string;
  propertyId?: string;
  name: string;
  hypothesis?: string;
  primaryMetric: string;
  status: PerformanceExperimentStatus;
  variants: PerformanceExperimentVariant[];
  version: number;
  revision: number;
  amendsExperimentId?: string;
  amendedByExperimentId?: string;
  startedAt?: number;
  endedAt?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type ClientDelightOccasion = "welcome" | "birthday" | "christmas" | "milestone" | "event" | "trip" | "random" | "shock-and-awe" | "other";
export type ClientDelightStatus = "idea" | "planned" | "ordered" | "sent" | "delivered" | "cancelled";
export type ExperienceAudience = "client" | "staff" | "partner" | "personal";
export type ExperiencePackageAudience = "client" | "staff" | "either";
export type ExperienceDeliveryMethod = "delivery" | "digital" | "in-person" | "travel" | "flexible";

export interface ExperiencePackage {
  id: string;
  agencyId: string;
  companyIds: string[];
  name: string;
  category: string;
  summary?: string;
  audience: ExperiencePackageAudience;
  deliveryMethod: ExperienceDeliveryMethod;
  priceCents?: number;
  currency: string;
  leadTimeDays?: number;
  supplier?: string;
  bookingUrl?: string;
  includedItems: string[];
  fulfilmentSteps: string[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ExperienceFulfilmentStep {
  id: string;
  label: string;
  completed: boolean;
  completedAt?: number;
}

export interface ClientDelightRecord {
  id: string;
  agencyId: string;
  clientId?: string;
  recipientUserId?: string;
  companyId?: string;
  packageId?: string;
  packageName?: string;
  audience: ExperienceAudience;
  recipientName: string;
  occasion: ClientDelightOccasion;
  title: string;
  status: ClientDelightStatus;
  deliveryMethod: ExperienceDeliveryMethod;
  currency: string;
  dueAt?: number;
  budgetCents?: number;
  costCents?: number;
  supplier?: string;
  trackingUrl?: string;
  bookingReference?: string;
  location?: string;
  guestCount?: number;
  includedItems: string[];
  fulfilmentSteps: ExperienceFulfilmentStep[];
  notes?: string;
  outcomeNotes?: string;
  createdAt: number;
  updatedAt: number;
}

export type RadarOperatingStage = "setup" | "launch" | "operating" | "scaling" | "seasonal" | "paused";
export type RadarPolicyState = "inherit" | "learning" | "live" | "seasonal" | "paused" | "not-applicable" | "retired";
export type RadarActivationCondition = "immediate" | "on-first-sample" | "on-first-activity" | "manual";
export type RadarBaselineStrategy = "target-and-baseline" | "target-only" | "rolling" | "prior-period";
export type RadarEvaluationWindow = "realtime" | "daily" | "weekly" | "monthly" | "quarterly";
export type RadarNotificationCadence = "immediate" | "hourly" | "daily" | "weekly" | "off";
export type RadarPolicyExceptionEffect = "mute-notifications" | "downgrade-to-watch" | "pause-check";

export interface RadarPolicyRule {
  state?: RadarPolicyState;
  activationCondition?: RadarActivationCondition;
  baselineStrategy?: RadarBaselineStrategy;
  targetValue?: number;
  targetLabel?: string;
  expectedDirection?: "higher" | "lower" | "neutral";
  warningTolerancePercent?: number;
  criticalTolerancePercent?: number;
  minimumSampleSize?: number;
  learningPeriodDays?: number;
  evaluationWindow?: RadarEvaluationWindow;
  businessHoursOnly?: boolean;
  notificationCadence?: RadarNotificationCadence;
  owner?: string;
  escalationRoute?: string;
  activationNote?: string;
  activeMonths?: number[];
}

export interface RadarPolicyException {
  id: string;
  domain: string;
  metricId?: string;
  effect: RadarPolicyExceptionEffect;
  reason: string;
  expiresAt: number;
  createdAt: number;
  createdBy: string;
}

export interface RadarPolicyConfiguration {
  operatingStage: RadarOperatingStage;
  defaultPolicy: RadarPolicyRule;
  domainPolicies: Record<string, RadarPolicyRule>;
  metricPolicies: Record<string, RadarPolicyRule>;
  exceptions: RadarPolicyException[];
  updatedAt: number;
}

/** One KPI target/baseline override (Phase 4 — KPI intelligence). `effectiveFrom`
 *  versions the change so trend lines stay comparable; `history` keeps prior values. */
export interface KpiTargetOverride {
  baselineValue?: number | null;
  targetValue?: number | null;
  effectiveFrom?: number;
  updatedAt?: number;
  updatedBy?: string;
  history?: Array<{ baselineValue?: number | null; targetValue?: number | null; effectiveFrom: number }>;
}

export interface KpiTargetOperationReceipt {
  kpiId: string;
  companyId?: string;
  fingerprint: string;
  committedAt: number;
}

/** Per-agency, optionally per-company, KPI target overrides. Resolved
 *  system-default → agency → company (most specific wins), like the radar policy. */
export interface KpiTargetsConfig {
  byKpi: Record<string, KpiTargetOverride>;
  byCompany?: Record<string, Record<string, KpiTargetOverride>>;
  /** Bounded server-only replay ledger; API responses omit it. */
  operations?: Record<string, KpiTargetOperationReceipt>;
  updatedAt: number;
}

/** One agency-shared saved KPI comparison view. Saved views come in two halves
 *  by decision: private (browser localStorage, never leaves the machine) and
 *  shared (this — persisted in agency settings so the whole workspace can
 *  recall the same monitoring configuration). Mirrors the browser-side
 *  `SavedComparisonView` shape minus plan overrides, which are already
 *  server-persisted through `kpiTargets`. */
export interface SharedKpiComparisonView {
  id: string;
  name: string;
  kpiIds: string[];
  mode: "plan" | "indexed" | "change" | "raw";
  range: "24h" | "7d" | "30d" | "90d" | "quarter" | "ytd" | "12m" | "all" | "custom";
  /** yyyy-mm-dd bounds, used when `range` is "custom". */
  start?: string;
  end?: string;
  createdAt: number;
  createdBy?: string;
}

export interface AgencyWorkspaceSettings {
  agencyId: string;
  legalName?: string;
  supportEmail?: string;
  phone?: string;
  website?: string;
  businessAddress?: string;
  companyNumber?: string;
  taxNumber?: string;
  timezone: string;
  defaultCurrency: string;
  defaultTaxRatePercent: number;
  defaultPaymentTermsDays: number;
  invoicePrefix: string;
  defaultClientStage: ClientStage;
  createPortalByDefault: boolean;
  portalAccessDays: number;
  clientWelcomeMessage?: string;
  sopCategories?: string[];
  /** Per-agency / per-company KPI target overrides (Phase 4). Additive; optional. */
  kpiTargets?: KpiTargetsConfig;
  /** Agency-shared saved KPI comparison views (the shared half of saved views). Additive; optional. */
  kpiSavedViews?: SharedKpiComparisonView[];
  advisor: {
    speedToLeadTargetMinutes: number;
    speedToLeadWarningMinutes: number;
    speedToLeadCriticalMinutes: number;
    staleDataHours: number;
    skillPolicies: Record<string, AdvisorSkillPolicy>;
    customSkills: AdvisorCustomSkill[];
    radarPolicy: RadarPolicyConfiguration;
  };
  notifications: {
    overdueTasks: boolean;
    outages: boolean;
    supportRequests: boolean;
    meetingReminders: boolean;
    financeAlerts: boolean;
    marketingAlerts: boolean;
    clientAlerts: boolean;
    contractAlerts: boolean;
    complianceAlerts: boolean;
    developmentAlerts: boolean;
    digest: "off" | "daily" | "weekly";
  };
  updatedAt: number;
}

export type PortalFormEntity = "contacts" | "expenses" | "clients" | "leads" | "tasks" | "products";
export type PortalFormFieldType = "text" | "textarea" | "number" | "date" | "url" | "email" | "select" | "multi-select" | "checkbox";
export type PortalFormFieldValue = string | string[] | boolean;

export interface PortalFormFieldDefinition {
  id: string;
  label: string;
  type: PortalFormFieldType;
  options: string[];
  section: string;
  required: boolean;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PortalFormEditorState {
  agencyId: string;
  forms: Partial<Record<PortalFormEntity, PortalFormFieldDefinition[]>>;
  updatedAt: number;
}

export type ClientPortalMode = "onboarding" | "designing" | "developed-launch" | "maintenance";
export type ClientPortalSectionId = "home" | "project" | "results" | "files" | "billing" | "support" | "resources" | "details";

export interface ClientPortalStagePresentation {
  label: string;
  eyebrow: string;
  heading: string;
  body: string;
  progress: number;
  focus: string;
}

export interface ClientPortalPagePresentation {
  label: string;
  visible: boolean;
  eyebrow: string;
  title: string;
  body: string;
  /**
   * Per-page SEO, when the operator has set any (dev-editor-finish phase 9).
   *
   * OPTIONAL AND OMITTED WHEN EMPTY, deliberately: a document nobody has
   * touched must normalise to exactly the bytes it had before this field
   * existed, or every fixture and round-trip test in the portal suite would
   * be asserting against a shape that changed underneath it.
   *
   * An Aqua-hosted portal is behind a login and no renderer reads this yet —
   * the editor's SEO panel says so in as many words rather than implying a
   * crawler will ever see it.
   */
  seo?: PageSeo;
}

export type ClientPortalExtensionPlacement = "before-content" | "after-content";

export interface ClientPortalCustomCode {
  enabled: boolean;
  placement: ClientPortalExtensionPlacement;
  title: string;
  scopedCss: string;
  html: string;
  css: string;
  javascript: string;
  minHeight: number;
}

export type ClientPortalBlockType =
  | "system-content"
  | "hero"
  | "rich-text"
  | "callout"
  | "image"
  | "video"
  | "metrics"
  | "service-grid"
  | "product-hub"
  | "file-list"
  | "activity"
  | "request-form"
  | "approval-panel"
  | "file-upload"
  | "link-list"
  | "custom-extension"
  | "divider";

export type ClientPortalBlockWidth = "full" | "half";
export type ClientPortalBlockTone = "surface" | "dark" | "accent" | "quiet";
export type ClientPortalBlockDataSource = "portal-summary" | "delivery" | "billing" | "results";
export type ClientPortalBlockVisibilityRule = "always" | "with-products" | "without-products" | "single-product" | "multiple-products" | "specific-products";
export type ClientPortalProductMatch = "any" | "all";
export type ClientPortalBlockSpacing = "none" | "compact" | "comfortable" | "spacious";
export type ClientPortalBlockAlignment = "left" | "center";
export type ClientPortalMediaAspect = "landscape" | "square" | "portrait";
export type ClientPortalMediaFit = "cover" | "contain";
export type ClientPortalRequestType = "choose" | "suggestion" | "design-feedback" | "support-ticket" | "cancel" | "move-provider";
export type ClientPortalApprovalType = "all" | "design" | "launch";
export type ClientPortalUploadCategory = "brief" | "recording" | "inspiration" | "design-feedback" | "misc";

export interface ClientPortalBlockResponsive {
  hideOnMobile: boolean;
  hideOnDesktop: boolean;
  spacing: ClientPortalBlockSpacing;
  alignment: ClientPortalBlockAlignment;
}

export interface ClientPortalBlockMedia {
  url: string;
  alt: string;
  caption: string;
  aspect: ClientPortalMediaAspect;
  fit: ClientPortalMediaFit;
}

export interface ClientPortalBlockItem {
  id: string;
  label: string;
  detail: string;
  href?: string;
  imageUrl?: string;
}

export interface ClientPortalPageBlock {
  id: string;
  type: ClientPortalBlockType;
  visible: boolean;
  visibilityRule: ClientPortalBlockVisibilityRule;
  productIds: string[];
  productMatch: ClientPortalProductMatch;
  responsive: ClientPortalBlockResponsive;
  width: ClientPortalBlockWidth;
  tone: ClientPortalBlockTone;
  eyebrow: string;
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
  dataSource?: ClientPortalBlockDataSource;
  requestType?: ClientPortalRequestType;
  approvalType?: ClientPortalApprovalType;
  uploadCategory?: ClientPortalUploadCategory;
  items: ClientPortalBlockItem[];
  media?: ClientPortalBlockMedia;
  extension?: ClientPortalCustomCode;
}

export interface ClientPortalCustomPage {
  id: string;
  slug: string;
  label: string;
  visible: boolean;
  blocks: ClientPortalPageBlock[];
  /** Per-page SEO. Same optional-and-omitted rule as the sections above. */
  seo?: PageSeo;
}

export interface ClientPortalBuilderDocument {
  pages: Partial<Record<ClientPortalSectionId, ClientPortalPageBlock[]>>;
  customPages: ClientPortalCustomPage[];
}

export interface ClientPortalDesignDocument {
  schemaVersion: 1;
  theme: {
    accentColor: string;
    backgroundColor: string;
    surfaceColor: string;
    darkColor: string;
    heroColor: string;
  };
  chrome: {
    serviceLabel: string;
    preparedForLabel: string;
    currentStageLabel: string;
    privateHomeLabel: string;
  };
  stages: Record<ClientPortalMode, ClientPortalStagePresentation>;
  pages: Record<ClientPortalSectionId, ClientPortalPagePresentation>;
  home: {
    welcomeBody: string;
    nextMoveEyebrow: string;
    recentUpdatesEyebrow: string;
    projectLogTitle: string;
    careEyebrow: string;
    careTitle: string;
    careBody: string;
    careButtonLabel: string;
  };
  builder?: ClientPortalBuilderDocument;
  customCode?: ClientPortalCustomCode;
}

export interface ClientPortalDesignVersion {
  id: string;
  label?: string;
  source: "autosave" | "checkpoint" | "publish" | "restore";
  document: ClientPortalDesignDocument;
  createdBy: string;
  createdAt: number;
}

export interface ClientPortalTemplateRecord {
  id: string;
  agencyId: string;
  name: string;
  slug: string;
  productId?: string;
  baseTemplateId?: string;
  baseTemplateVersionId?: string;
  productLifecycleSeedVersion?: number;
  draftProductSourceUpdatedAt?: number;
  productSourceUpdatedAt?: number;
  draft: ClientPortalDesignDocument;
  published: ClientPortalDesignDocument;
  publishedVersionId: string;
  versions: ClientPortalDesignVersion[];
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
  publishedAt: number;
}

export interface ClientPortalInstanceRecord {
  id: string;
  agencyId: string;
  clientId: string;
  templateId: string;
  templateVersionId: string;
  draft: ClientPortalDesignDocument;
  published: ClientPortalDesignDocument;
  publishedVersionId: string;
  versions: ClientPortalDesignVersion[];
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
  publishedAt: number;
}

export interface CompanyObjective {
  id: string;
  title: string;
  metric: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  dueAt?: number;
  status: "on-track" | "at-risk" | "complete";
}

export interface CompanyPlan {
  id: string;
  title: string;
  horizon: "now" | "next" | "later";
  status: "idea" | "planned" | "active" | "complete" | "paused";
  owner?: string;
  notes?: string;
}

export interface CompanyQuarterlyReview {
  id: string;
  period: string;
  status?: "draft" | "complete";
  executiveSummary?: string;
  wins: string;
  misses?: string;
  lessons: string;
  marketSignals?: string;
  customerSignals?: string;
  financialDiagnosis?: string;
  operatingDiagnosis?: string;
  strategicBets?: string;
  risks?: string;
  stopDoing?: string;
  decisions: string;
  nextPriorities: string;
  successMeasures?: string;
  ownerCommitment?: string;
  implementationHandover?: string;
  scorecard?: CompanyQuarterlyScorecard;
  evidenceSnapshot?: CompanyQuarterlyEvidenceSnapshot;
  completedAt?: number;
  updatedAt: number;
}

export interface CompanyQuarterlyScorecard {
  growth: 1 | 2 | 3 | 4 | 5;
  finance: 1 | 2 | 3 | 4 | 5;
  customer: 1 | 2 | 3 | 4 | 5;
  operations: 1 | 2 | 3 | 4 | 5;
  capability: 1 | 2 | 3 | 4 | 5;
}

export interface CompanyQuarterlyEvidenceSnapshot {
  revenueCents: number;
  revenueTargetCents: number;
  revenueProgressPercent: number;
  monthlyGrowthPercent?: number;
  activeClients: number;
  clientsNeedingAttention: number;
  openLeads: number;
  openTasks: number;
  overdueTasks: number;
  healthScore: number;
  objectiveProgressPercent: number;
  objectivesAtRisk: number;
  capacityUtilisationPercent: number;
  connectedSources: number;
  totalSources: number;
  capturedAt: number;
}

export interface CompanyCapacityPlan {
  weeklyAvailableHours: number;
  deliveryHoursPerActiveClient: number;
  salesHoursPerCall: number;
  adminBufferPercent: number;
  hiringTriggerPercent: number;
  areas: CompanyCapacityAreaPlan[];
  notes?: string;
}

export type CompanyCapacityAreaId = "growth" | "sales" | "client-success" | "delivery" | "operations" | "finance" | "systems";

export interface CompanyCapacityAreaPlan {
  id: CompanyCapacityAreaId;
  allocationPercent: number;
  demandAdjustmentHours: number;
  targetUtilisationPercent: number;
  roleTitle: string;
  preferredEngagement: "full-time" | "part-time" | "contractor" | "freelancer" | "automation";
  hourlyCostCents: number;
  hiringStatus: "monitoring" | "approved" | "recruiting" | "filled" | "paused";
  notes?: string;
}

export interface CompanyProjectionPlan {
  horizonMonths: number;
  baseMonthlyGrowthPercent: number;
  targetMonthlyGrowthPercent: number;
  grossMarginTargetPercent: number;
  monthlyOperatingCostCents: number;
  cashReserveTargetCents: number;
}

export interface CompanyShareClass {
  id: string;
  name: string;
  authorisedShares: number;
  nominalValueCents: number;
  votingRightsPerShare: number;
  dividendEligible: boolean;
  notes?: string;
}

export interface CompanyShareholder {
  id: string;
  name: string;
  kind: "founder" | "individual" | "employee" | "investor" | "company" | "trust" | "other";
  shareClassId: string;
  shares: number;
  investedCents: number;
  status: "active" | "former";
  director: boolean;
  boardSeat: boolean;
  joinedAt?: number;
  notes?: string;
}

export interface CompanyCapitalTransaction {
  id: string;
  kind: "share-issue" | "capital-contribution" | "director-loan-in" | "director-loan-repayment" | "share-transfer" | "buyback" | "grant" | "other";
  title: string;
  shareholderId?: string;
  shareClassId?: string;
  counterparty?: string;
  amountCents: number;
  currency: string;
  shares: number;
  occurredAt: number;
  status: "planned" | "approved" | "completed" | "cancelled";
  approvalId?: string;
  reference?: string;
  notes?: string;
}

export interface CompanyInvestmentHolding {
  id: string;
  name: string;
  kind: "cash-equivalent" | "fund" | "equity" | "bond" | "crypto" | "property" | "equipment" | "subsidiary" | "other";
  platform?: string;
  currency: string;
  costBasisCents: number;
  currentValueCents: number;
  incomeReceivedCents: number;
  acquiredAt?: number;
  valuedAt?: number;
  status: "planned" | "active" | "sold" | "written-off";
  risk: "low" | "medium" | "high";
  owner?: string;
  reference?: string;
  notes?: string;
}

export interface CompanyDividendAllocation {
  shareholderId: string;
  amountCents: number;
}

export interface CompanyDividendDistribution {
  id: string;
  title: string;
  period: string;
  currency: string;
  declaredCents: number;
  paidCents: number;
  declaredAt?: number;
  paymentDueAt?: number;
  paidAt?: number;
  status: "draft" | "approved" | "part-paid" | "paid" | "cancelled";
  allocations: CompanyDividendAllocation[];
  approvalId?: string;
  reference?: string;
  notes?: string;
}

export interface CompanyGovernanceDecision {
  id: string;
  title: string;
  kind: "board" | "shareholder" | "written" | "ordinary" | "special";
  status: "draft" | "approved" | "rejected" | "superseded";
  summary: string;
  proposedBy?: string;
  meetingAt?: number;
  effectiveAt?: number;
  approvedAt?: number;
  votesForPercent?: number;
  votesAgainstPercent?: number;
  documentId?: string;
  relatedRecordIds: string[];
  notes?: string;
}

export interface CompanyCapitalPlan {
  currency: string;
  shareClasses: CompanyShareClass[];
  shareholders: CompanyShareholder[];
  transactions: CompanyCapitalTransaction[];
  investments: CompanyInvestmentHolding[];
  dividends: CompanyDividendDistribution[];
  decisions: CompanyGovernanceDecision[];
  notes?: string;
}

export interface CompanyProfile {
  agencyId: string;
  companyId?: string;
  mission: string;
  vision: string;
  values: string[];
  monthlyRevenueTargetCents: number;
  averageDealValueCents: number;
  salesCallCloseRatePercent: number;
  annualRevenueTargetCents: number;
  capacity: CompanyCapacityPlan;
  projection: CompanyProjectionPlan;
  capital: CompanyCapitalPlan;
  objectives: CompanyObjective[];
  plans: CompanyPlan[];
  reviews: CompanyQuarterlyReview[];
  updatedAt: number;
}

export type LegalDocumentCategory = "contract" | "insurance" | "hmrc" | "letter" | "template" | "policy" | "company" | "other";
export type LegalDocumentStatus = "draft" | "active" | "action-required" | "expired" | "archived";

export interface LegalDocument {
  id: string;
  agencyId: string;
  companyIds?: string[];          // empty/undefined = parent/shared legal record
  title: string;
  category: LegalDocumentCategory;
  status: LegalDocumentStatus;
  counterparty?: string;
  reference?: string;
  effectiveAt?: number;
  expiresAt?: number;
  reminderAt?: number;
  notes?: string;
  fileName: string;
  contentType: string;
  size: number;
  storageProvider: "supabase" | "vercel-blob" | "local";
  storageKey: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type DevelopmentResourceKind =
  | "tool"
  | "app"
  | "design-inspiration"
  | "saved-page"
  | "template"
  | "git-template"
  | "component"
  | "seo-tool"
  | "canva-template"
  | "inspiration-pack"
  | "course"
  | "knowledge"
  | "credential"
  | "sop";

export type DevelopmentResourceVisibility = "team" | "private";

export interface DevelopmentResourceFile {
  fileName: string;
  contentType: string;
  size: number;
  storageProvider: "supabase" | "vercel-blob" | "local";
  storageKey: string;
}

export interface DevelopmentCredential {
  loginUrl?: string;
  username?: string;
  encryptedPassword?: string;
  passwordManagerUrl?: string;
  accessRoles: Role[];
  notes?: string;
}

export interface DevelopmentResource {
  id: string;
  agencyId: string;
  companyIds?: string[];
  kind: DevelopmentResourceKind;
  title: string;
  description?: string;
  category?: string;
  url?: string;
  localPath?: string;
  framework?: string;
  codeSnippet?: string;
  tags: string[];
  workflowStageIds: string[];
  sopIds: string[];
  visibility: DevelopmentResourceVisibility;
  file?: DevelopmentResourceFile;
  credential?: DevelopmentCredential;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface DevelopmentWorkflowStage {
  id: string;
  name: string;
  description?: string;
  order: number;
}

export interface DevelopmentWorkflow {
  id: string;
  agencyId: string;
  name: string;
  description?: string;
  productCategory?: string;
  stages: DevelopmentWorkflowStage[];
  active: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type AgencyWebsiteReleaseStatus = "live" | "gated" | "maintenance";
export type AgencyWebsitePageStatus = "live" | "updating";

export interface AgencyWebsitePage {
  route: string;
  label: string;
  status: AgencyWebsitePageStatus;
  message?: string;
  updatedAt: number;
}

export interface AgencyWebsiteTelemetryEvent {
  id: string;
  type: "pageview" | "performance" | "error" | "deployment" | "form" | "conversion" | "search" | "chatbot" | "interaction" | "heartbeat" | "consent" | "custom";
  receivedAt: number;
  occurredAt: number;
  propertyId?: string;
  url?: string;
  path?: string;
  title?: string;
  referrer?: string;
  message?: string;
  metric?: string;
  value?: number;
  release?: string;
  environment?: string;
  sessionId?: string;
  formName?: string;
  query?: string;
  impressions?: number;
  clicks?: number;
  position?: number;
  experimentId?: string;
  variant?: string;
  conversionValueCents?: number;
  consentVersion?: number;
  consentNecessary?: boolean;
  consentPreferences?: boolean;
  consentAnalytics?: boolean;
  consentMarketing?: boolean;
  userAgent?: string;
}

export interface AgencyWebsiteProject {
  agencyId: string;
  name: string;
  firstParty: true;
  status: AgencyWebsiteReleaseStatus;
  gateHeadline: string;
  gateMessage: string;
  maintenanceMessage: string;
  productionUrl: string;
  previewUrl: string;
  repositoryUrl: string;
  localPath: string;
  pages: AgencyWebsitePage[];
  telemetrySiteKey: string;
  telemetryEvents: AgencyWebsiteTelemetryEvent[];
  telemetryLastSeenAt?: number;
  updatedBy?: string;
  updatedAt: number;
}

export interface IntegrationConnection {
  id: string;
  agencyId: string;
  provider: import("@/lib/integrations/catalog").IntegrationProvider;
  label: string;
  clientId?: string;
  config: Record<string, string>;
  encryptedSecrets: Record<string, string>;
  status: import("@/lib/integrations/types").IntegrationConnectionStatus;
  lastTestedAt?: number;
  lastTestStatus?: "passed" | "failed";
  lastTestMessage?: string;
  /** Explicit default for this provider + workspace/client scope. */
  isActive?: boolean;
  activatedAt?: number;
  activatedBy?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Retained so stored records keep loading. It no longer decides anything.
 *
 * It USED to: "software is code-only" gated the browser off every project Ed
 * creates (everything defaults to `software`). Ed's rule is that the Aqua Tag
 * alone is the gate — a tagged game build gets a browser like anything else —
 * so `devProjectVisualEditorUnlocked` reads the tag and nothing else.
 */
export type DevProjectKind = "software" | "website" | "portal";

/**
 * What pressing MAP found in the repository.
 *
 * Recorded so the editor knows the shape of a project without re-walking it on
 * every open — a GitHub tree is a network round trip and the working tree is
 * thousands of `stat` calls. The counts are the honest headline ("2,914 files,
 * 431 of them pages"); the tree itself is not stored, because it is large,
 * goes stale the moment somebody commits, and is already served on demand by
 * `/api/portal/site-editor/files`.
 */
export interface DevProjectRepoMap {
  /** `github` — read at a ref — or `workspace` — the local working tree. */
  source: "github" | "workspace";
  /** "owner/repository", blank for the working tree. */
  repository: string;
  ref: string;
  /** The commit the map describes, when GitHub named one. */
  commitSha?: string;
  /** Files the editor can see (hidden/credential paths already excluded). */
  fileCount: number;
  /**
   * ...of those, the ones the visual editor can map — the `isMappableFile`
   * set (tsx/jsx/html/md/mdx), i.e. files that render markup.
   */
  mappableCount: number;
  /** Top-level directories, so a project can be described without the tree. */
  directories: string[];
  /** GitHub truncated the tree. Said out loud — never silently half-mapped. */
  truncated: boolean;
  mappedAt: number;
  /** Why the walk failed. Present means this half did NOT map. */
  error?: string;
}

/**
 * What pressing MAP found at the project's address — is the tag really there?
 *
 * "Connected" is not a checkbox somebody ticks. The tag either answers on the
 * page or it does not, and the browser depends on it, so Map fetches the page
 * the way any visitor would and reads the answer back.
 */
export interface DevProjectTagMap {
  /** The address checked. */
  url: string;
  /** The page actually read, after redirects. */
  finalUrl?: string;
  reachable: boolean;
  /** An `/aqua-tag.js` script is on the page... */
  tagPresent: boolean;
  /** ...and it carries THIS agency's master key, not somebody else's. */
  keyMatches: boolean;
  /** Whatever key the installed tag carries, for when it is the wrong one. */
  detectedSiteKey?: string;
  /** The src the snippet on the page points its script at, when one is there. */
  scriptSrc?: string;
  /**
   * Why a visitor's browser could NOT load that script — present means the
   * snippet is installed but DEAD (e.g. it points at `localhost`, which only
   * exists on the machine that generated it). Found live on the first real
   * client run: presence is not execution, and a check that reads HTML
   * server-side cannot see the browser refusing the fetch. Both fields are
   * optional so records written before they existed parse unchanged — absent
   * means "not assessed", never "dead".
   */
  scriptUnloadableReason?: string;
  checkedAt: number;
  error?: string;
}

/**
 * Where a project's Aqua Tag actually stands, as one word.
 *
 * "Tagged / not tagged" was never enough to tell somebody what to DO next.
 * A page that cannot be read, a page with no snippet on it, and a page
 * carrying somebody else's key all look identical through a boolean, and each
 * one needs a different action. These are the distinctions the operator can
 * act on, and `DevProjectMapStatus.tagSentence` is the same distinction said
 * in words.
 */
export type DevProjectTagState =
  /** No address, no tag, nothing checked — the browser has never been possible. */
  | "none"
  /** There is something to check, but no check has run yet. */
  | "unchecked"
  /** We tried to read the page and could not. */
  | "unreachable"
  /** The page read fine; our snippet is not on it. */
  | "absent"
  /** A tag is on the page, carrying a DIFFERENT agency's key. */
  | "foreign"
  /**
   * Our snippet is on the page with our key, but its script points somewhere a
   * visitor's browser cannot fetch — installed but DEAD, and no mode gets any
   * elements. Ranked above answering/redirected because presence is not
   * execution: this is a definitive negative, not a lesser success.
   */
  | "dead-snippet"
  /** Our tag is installed and answering at the address given. */
  | "answering"
  /** Our tag is answering, but at a different address after a redirect. */
  | "redirected";

/**
 * What is connected, what is mapped, and what is still missing — in words.
 *
 * Computed by `devProjectMapStatus` and sent to the screen, so the rule that
 * decides whether the browser runs has exactly ONE definition. Lives here
 * rather than beside the function because the setup screen is a client
 * component and must not pull a `server-only` module into its import graph.
 */
export interface DevProjectMapStatus {
  /** A repository (or the working tree) has been walked and recorded. */
  repoMapped: boolean;
  /** An Aqua Tag is mapped to this project. */
  tagged: boolean;
  /** The last MAP run proved the tag answers on the page. */
  tagVerified: boolean;
  /** Whether the browser pane can run — the tag, and only the tag. */
  browserAvailable: boolean;
  /** MAP has never been pressed. */
  neverMapped: boolean;
  /** Plain sentences naming what is not there yet. */
  missing: string[];
  /** Which of the eight tag situations this project is in. */
  tagState: DevProjectTagState;
  /** That situation as one sentence, written to be read straight out. */
  tagSentence: string;
}

/**
 * The agency's Aqua Tag as the setup screen needs to show it.
 *
 * Public by design — the site key ships inside the HTML of every page the tag
 * is installed on, which is exactly why it is safe to render and why it is
 * never rotated. No token, no provider secret and nothing from the vault
 * belongs in this shape.
 */
export interface DevProjectMasterTagView {
  /** The agency's permanent tag key. */
  siteKey: string;
  /** The one-line `<script>` to paste into a site's HTML. */
  snippet: string;
  /** Where the tag script is served from. */
  scriptUrl: string;
  /** The origin the snippet points at. */
  origin: string;
  /** That origin is not reachable from a stranger's browser — a dud snippet. */
  originIsFallback: boolean;
}

/** The record of the last MAP run — both halves, and when it happened. */
export interface DevProjectMap {
  repo?: DevProjectRepoMap;
  tag?: DevProjectTagMap;
  /** When MAP was last pressed, whatever it found. */
  lastMappedAt: number;
  lastMappedBy: string;
}

/**
 * A Dev Editor Engine project — the binding that was missing.
 *
 * Everything it points at already existed but was scattered: the repo/branch
 * were typed ad-hoc into the code workspace, GitHub + Vercel credentials lived
 * in `integrationConnections` (resolved per-agency, never per-project), and the
 * Aqua Tag was mapped elsewhere. This record ties one project's pieces together
 * so the engine can host MANY projects, each with its own repo and its own
 * token, and so injecting Dev Mode into a client workspace can reuse the same
 * engine by pointing at that client's project.
 *
 * Secrets are NOT stored here. `githubConnectionId` / `vercelConnectionId`
 * reference `IntegrationConnection`s; the token is resolved at call time via
 * `resolveIntegrationConnectionValues`, so the vault stays the only place a
 * credential lives.
 */
export interface DevProject {
  id: string;
  agencyId: string;
  name: string;
  /**
   * What it is, in Ed's own words — free text, not a category.
   *
   * There WAS a software/website/portal selector here. Ed's call: a project is
   * often all three at once, so forcing one label was a lie, and worse, the
   * editor changed shape based on it. The editor now adapts to what is
   * CONNECTED (a repository, an Aqua Tag, a client) rather than to a declared
   * type, and this field is a note for humans.
   */
  description?: string;
  /** Retained so existing records keep loading; no longer drives the editor. */
  kind: DevProjectKind;
  /** "owner/repository" — blank reads the local working tree (dev convenience). */
  repository: string;
  /** Branch or ref the engine reads. Defaults to "main". */
  ref: string;
  /** IntegrationConnection ids (provider github / vercel). Never raw tokens. */
  githubConnectionId?: string;
  vercelConnectionId?: string;
  /** Mapping an Aqua Tag is what unlocks the visual editor for this project. */
  aquaTagId?: string;
  /**
   * The address the Aqua Tag is installed on — what MAP checks, and what the
   * browser pane will load.
   *
   * Separate from `repository`: the repo is the source, this is the running
   * page. A project can have one, both or neither, and the editor adapts to
   * whichever is connected rather than to a declared type.
   */
  siteUrl?: string;
  /** Set when this project is a specific client's workspace (Dev Mode injection). */
  clientId?: string;
  /**
   * The project this one lives INSIDE, or absent for a top-level project.
   *
   * Ed's model, verbatim: a project can contain projects — "one project could
   * be a website they might have a software going on with it too". From inside
   * a project you can create another, and it is a CHILD of the project you are
   * in, never a new top-level one.
   *
   * EXACTLY TWO LEVELS — "project → inner projects and that's it" (Ed). A flat
   * parent/child pair, NOT a tree: an inner project can never itself be a
   * parent, and a project with children can never become a child. Both
   * directions are enforced in `saveDevProject`, in the STORE, not the UI —
   * which also makes cycles inexpressible. A child is otherwise a FULL
   * DevProject: its own repo, tag, AI config and history.
   *
   * Old records simply lack the field and parse unchanged (top-level).
   */
  parentProjectId?: string;
  /** The last MAP run — both halves and when. Absent means never mapped. */
  map?: DevProjectMap;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * AQUA EDITOR AI — one project's own assistant, configured per project.
 *
 * Ed's call, verbatim: "aqua editor ai needs to be its only thing… needs a
 * seperate tocken please to configure… its own thing and its saved per project
 * this one is."
 *
 * ── Why this is NOT a field on `DevProject` ─────────────────────────────────
 *
 * Two reasons, and the second is a real bug rather than a preference.
 *
 *   1. `DevProject` is returned WHOLE to the browser by the projects GET. The
 *      less that record carries about a credential, the fewer ways there are to
 *      leak one. It holds nothing about the editor's assistant at all.
 *
 *   2. `saveDevProject` REBUILDS the project field by field from the request
 *      body — there is no spread. Any field the setup form does not send back
 *      is silently dropped on the next rename. A `editorAiConnectionId` living
 *      there would have been erased by an unrelated save, unbinding the token
 *      with no error and no trace. Keeping the configuration in its own
 *      collection makes that impossible rather than a thing to remember.
 *
 * ── What is stored ──────────────────────────────────────────────────────────
 *
 * Never the token. `connectionId` references an `IntegrationConnection` of
 * provider `aqua-editor-ai`; the key itself is resolved from the encrypted
 * vault at call time by `resolveEditorAiToken`, which is server-only and whose
 * return value never enters a prop, a response body or a log.
 *
 * Keyed `${agencyId}|${projectId}` in `PortalState.editorAiConfigs`, and the
 * agency is checked BEFORE the project on every read — a project id alone must
 * never reach another tenant's configuration.
 */
export interface EditorAiConfig {
  /** `${agencyId}|${projectId}` — the storage key, kept on the record too. */
  id: string;
  agencyId: string;
  /** The `DevProject` this assistant belongs to. One project, one assistant. */
  projectId: string;
  /**
   * IntegrationConnection id, provider `aqua-editor-ai`. NEVER a raw token.
   * Absent means no key has been pasted yet, which is what `configured: false`
   * is reporting.
   */
  connectionId?: string;
  /** The model this project's assistant runs on. */
  model: string;
  /**
   * What this project's assistant should know about this project, in Ed's own
   * words. Per project, like everything else here — the editor's assistant for
   * a games repo should not be briefed like the one for a client's website.
   */
  instructions?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * The same configuration as the CLIENT is allowed to see it.
 *
 * The one shape that may cross to the browser. It carries whether a token is
 * set and — at most — a masked tail so Ed can tell which key he pasted. The
 * key itself has no representation here: there is no field it could occupy.
 */
export interface EditorAiStatus {
  projectId: string;
  /** A token is in the vault for this project. The gate the editor reads. */
  configured: boolean;
  /** The model in force, defaulted when nothing has been chosen. */
  model: string;
  /**
   * `••••4f2a` — the last four characters and nothing else, and only when the
   * stored key is long enough that four characters cannot be most of it.
   * Absent when no token is set, or when the token is too short to hint at.
   */
  tokenHint?: string;
  instructions?: string;
  /** The vault connection's label, so a screen can name what it is bound to. */
  connectionLabel?: string;
  updatedAt?: number;
}

// ─── AQUA EDITOR AI — its own chat history, per project ──────────────────────
//
// Ed: "the chat history per project only limited to a project nothing else".
//
// A SEPARATE collection from `PortalState.assistant`, not a filtered view of
// it. That separation is the requirement, not an implementation choice: the
// two stores must be independently clearable, so wiping the agency assistant
// cannot take an editor conversation with it and vice versa.
//
// The scoping differs from the Advisor's on purpose. `AssistantWorkspaceState`
// is keyed `${agencyId}|${userId}` — one private history per PERSON, spanning
// every project. This is keyed `${agencyId}|${projectId}` — one history per
// PROJECT, shared by the agency's operators working on it, which is what "per
// project only" means when two people edit the same site. `authorUserId` on a
// message is what keeps a shared thread legible.

/** One message in a project's Aqua Editor AI conversation. */
export interface EditorAiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** The exact user message this assistant line answers. Enables idempotent retries. */
  replyToMessageId?: string;
  /** Who typed it. Absent on assistant replies. A shared thread needs names. */
  authorUserId?: string;
  /** The stored content was cut to the per-message cap. See editorAiHistory. */
  truncated?: boolean;
  createdAt: number;
}

export interface EditorAiThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: EditorAiMessage[];
}

/**
 * ONE project's whole chat history. Nothing else is in here.
 *
 * Keyed `${agencyId}|${projectId}` in `PortalState.editorAiConversations`, and
 * the agency is checked BEFORE the project on every read — a project id alone
 * must never reach another tenant's conversation.
 */
export interface EditorAiConversation {
  /** `${agencyId}|${projectId}` — the storage key, kept on the record too. */
  id: string;
  agencyId: string;
  projectId: string;
  /** Most recently used first. Capped; see `EDITOR_AI_HISTORY_LIMITS`. */
  threads: EditorAiThread[];
  /**
   * How many messages eviction has dropped from this project, ever.
   *
   * Kept because a capped history that silently shortens is a history you
   * cannot trust: a screen can say "earlier messages were trimmed" rather than
   * letting somebody conclude the assistant forgot on its own.
   */
  evictedMessages: number;
  updatedAt: number;
}

export interface RadarMemoryIssueState {
  id: string;
  domain: string;
  severity: "critical" | "warning" | "watch";
  title: string;
  href: string;
  firstSeenAt: number;
  lastSeenAt: number;
  occurrences: number;
  consecutiveSweeps: number;
  status: "active" | "recovered";
  recoveredAt?: number;
}

export interface RadarMemoryCheckState {
  id: string;
  status: "critical" | "warning" | "blind";
  firstSeenAt: number;
  lastSeenAt: number;
  occurrences: number;
  consecutiveSweeps: number;
  recoveredAt?: number;
}

export interface RadarMemorySourceState {
  id: string;
  status: "connected" | "empty" | "disconnected" | "unavailable";
  recordCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  lastChangedAt: number;
  lastHealthyAt?: number;
  lastUnhealthyAt?: number;
  flapCount: number;
  consecutiveUnhealthySweeps: number;
}

export interface RadarMemoryScan {
  id: string;
  scannedAt: number;
  assurancePercent: number;
  totalChecks: number;
  firingChecks: number;
  blindChecks: number;
  criticalIssues: number;
  warningIssues: number;
  watchIssues: number;
  issueStates: Array<{ id: string; severity: "critical" | "warning" | "watch" }>;
  attentionCheckIds: string[];
  blindCheckIds: string[];
  sourceStates: Array<{ id: string; status: "connected" | "empty" | "disconnected" | "unavailable"; recordCount: number }>;
}

export interface RadarMemoryHourlyRollup {
  hour: number;
  sweeps: number;
  minAssurancePercent: number;
  lastAssurancePercent: number;
  maxFiringChecks: number;
  maxBlindChecks: number;
  maxCriticalIssues: number;
}

export interface RadarMemoryState {
  agencyId: string;
  firstSweepAt: number;
  lastSweepAt: number;
  totalSweeps: number;
  scans: RadarMemoryScan[];
  hourly: RadarMemoryHourlyRollup[];
  issues: Record<string, RadarMemoryIssueState>;
  checks: Record<string, RadarMemoryCheckState>;
  sources: Record<string, RadarMemorySourceState>;
}

export interface RadarSyntheticProbeResult {
  id: string;
  agencyId: string;
  propertyId: string;
  label: string;
  url: string;
  checkedAt: number;
  durationMs: number;
  ok: boolean;
  statusCode?: number;
  failureKind?: "invalid-url" | "unsafe-url" | "dns" | "timeout" | "network" | "redirect" | "http" | "tls";
  error?: string;
  finalUrl?: string;
  redirectCount: number;
  dnsAddresses: string[];
  contentType?: string;
  htmlBytes?: number;
  titleDetected?: boolean;
  formsDetected?: number;
  tagDetected?: boolean;
  tlsValid?: boolean;
  tlsExpiresAt?: number;
  tlsDaysRemaining?: number;
  securityHeaders: {
    strictTransportSecurity: boolean;
    contentSecurityPolicy: boolean;
    frameProtection: boolean;
    contentTypeOptions: boolean;
    referrerPolicy: boolean;
    permissionsPolicy: boolean;
  };
}

export interface RadarEvidencePoint {
  at: number;
  value: number;
  status: "pass" | "critical" | "warning" | "watch" | "blind";
}

export interface RadarEvidenceHourlyRollup {
  hour: number;
  samples: number;
  minimum: number;
  maximum: number;
  average: number;
  last: number;
}

export interface RadarEvidenceSeries {
  id: string;
  agencyId: string;
  domain: string;
  familyId: string;
  familyLabel: string;
  sourceId: string;
  expectedDirection: "higher" | "lower" | "neutral";
  firstSeenAt: number;
  lastSeenAt: number;
  totalSamples: number;
  points: RadarEvidencePoint[];
  hourly: RadarEvidenceHourlyRollup[];
  entityType?: "client" | "product" | "property";
  entityId?: string;
  entityLabel?: string;
  parentEntityId?: string;
}

export interface RadarEvidenceState {
  agencyId: string;
  totalSamples: number;
  firstRecordedAt: number;
  lastRecordedAt: number;
  series: Record<string, RadarEvidenceSeries>;
}

export interface OperationalAlertPreference {
  agencyId: string;
  userId: string;
  alertId: string;
  state: "read" | "parked" | "dismissed";
  alertOccurredAt: number;
  updatedAt: number;
  parkedUntil?: number;
  /**
   * How many times this has been put off, and when it was first deferred.
   *
   * Without a count, a parked item returns looking exactly like a new one, and
   * work deferred five times is indistinguishable from work seen once. That is
   * the whole failure mode for off-system jobs: nothing in Aqua does them, so
   * the only pressure to act is knowing how long you have not.
   */
  deferrals?: number;
  firstDeferredAt?: number;
}

// ─── People ──────────────────────────────────────────────────────────────

export type PeopleApplicationStage =
  | "applied"
  | "under-review"
  | "interview"
  | "shortlisted"
  | "offer"
  | "accepted"
  | "onboarding"
  | "declined"
  | "withdrawn";

export interface PeopleApplicationStageEntry {
  stage: PeopleApplicationStage;
  at: number;
  note?: string;
  actorUserId?: string;
}

export interface PeopleApplication {
  id: string;
  agencyId: string;
  statusTokenHash: string;
  name: string;
  email: string;
  phone?: string;
  roleInterest: string;
  employmentPreference?: PeopleEmploymentType;
  location?: string;
  portfolioUrl?: string;
  linkedInUrl?: string;
  coverNote?: string;
  availabilityNote?: string;
  cv: {
    fileName: string;
    contentType: string;
    size: number;
    storageProvider: "supabase" | "vercel-blob" | "local";
    storageKey: string;
  };
  stage: PeopleApplicationStage;
  stageHistory: PeopleApplicationStageEntry[];
  internalNotes: string[];
  employeeId?: string;
  submittedAt: number;
  updatedAt: number;
}

export type PeopleEmploymentType =
  | "full-time"
  | "part-time"
  | "contractor"
  | "freelancer"
  | "intern"
  | "volunteer";

export type PeopleWorkspaceStationId =
  | "my-day"
  | "actions"
  | "calendar"
  | "onboarding"
  | "leave"
  | "training"
  | "pay"
  | "notes"
  | "progression"
  | "chat";

export interface PeopleWorkspaceAccess {
  stationId: PeopleWorkspaceStationId;
  mode: "view" | "edit";
  order: number;
}

export interface PeopleOnboardingItem {
  id: string;
  label: string;
  detail?: string;
  status: "todo" | "in-progress" | "done" | "blocked";
  owner: "company" | "employee";
  dueAt?: number;
  completedAt?: number;
  evidence?: string;
}

export interface PeopleCommissionRule {
  id: string;
  label: string;
  basis: "revenue" | "gross-margin" | "new-client" | "product" | "fixed-bonus";
  ratePercent?: number;
  fixedAmountMinor?: number;
  thresholdMinor?: number;
  capMinor?: number;
  productIds?: string[];
  cadence: "per-event" | "monthly" | "quarterly";
  status: "draft" | "active" | "paused" | "retired";
  startsAt?: number;
  endsAt?: number;
}

export interface PeopleEmployee {
  id: string;
  agencyId: string;
  applicationId?: string;
  userId?: string;
  name: string;
  email: string;
  phone?: string;
  title: string;
  department?: string;
  managerEmployeeId?: string;
  employmentType: PeopleEmploymentType;
  status: "preboarding" | "active" | "leave" | "suspended" | "alumni";
  startDate?: number;
  endDate?: number;
  probationEndsAt?: number;
  targetRole?: string; // growth path — the role they're growing toward (owner-set)
  growthPathNote?: string; // how they get there (owner-set, shown to the staff member)
  weeklyHours?: number;
  holidayAllowanceDays?: number;
  payBasis: "salary" | "hourly" | "day-rate" | "commission-only" | "unpaid";
  basePayMinor?: number;
  currency: string;
  compensationProfileId?: string;
  commissionRules: PeopleCommissionRule[];
  workspaceAccess: PeopleWorkspaceAccess[];
  onboardingItems: PeopleOnboardingItem[];
  createdAt: number;
  updatedAt: number;
}

export interface PeopleLeaveRequest {
  id: string;
  agencyId: string;
  employeeId: string;
  type: "annual" | "sick" | "unpaid" | "compassionate" | "parental" | "other";
  startsOn: string;
  endsOn: string;
  days: number;
  note?: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewerUserId?: string;
  decisionNote?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PeopleShift {
  id: string;
  agencyId: string;
  employeeId: string;
  title: string;
  startsAt: number;
  endsAt: number;
  location?: string;
  note?: string;
  status: "draft" | "published" | "completed" | "cancelled";
  createdAt: number;
  updatedAt: number;
}

export interface PeopleTrainingAssignment {
  id: string;
  agencyId: string;
  employeeId: string;
  title: string;
  description?: string;
  sopId?: string;
  moduleId?: string; // links to a PeopleTrainingModule (quiz-gated completion)
  resourceUrl?: string;
  dueAt?: number;
  status: "assigned" | "in-progress" | "completed" | "overdue";
  completedAt?: number;
  score?: number; // last quiz score (percent) for a module assignment
  evidence?: string;
  createdAt: number;
  updatedAt: number;
}

export type PeopleFreelancerJobStatus = "proposed" | "active" | "delivered" | "paid" | "cancelled";

export interface PeopleFreelancerDeliverable {
  id: string;
  name: string;
  url: string;
  addedByUserId: string;
  addedAt: number;
}

export interface PeopleFreelancerSubmission {
  id: string;
  name: string;
  url: string;
  uploadedByUserId: string;
  uploadedAt: number;
  size: number;
  contentType: string;
  storageProvider: "supabase" | "vercel-blob" | "local";
  storageKey: string;
}

// A one-time project engagement for a freelancer/contractor — scoped work with a
// fee and a proposed→active→delivered→paid lifecycle. The job tracks its own fee
// and payment state, but Finance stays the authority on money actually paid:
// `paymentRef` links to the finance record once the payment is logged there
// (guess-then-confirm — the job never moves money itself).
export interface PeopleFreelancerJob {
  id: string;
  agencyId: string;
  employeeId: string; // the freelancer — a PeopleEmployee (employmentType freelancer/contractor)
  title: string;
  brief?: string;
  clientId?: string; // optional — the client/project it is for
  status: PeopleFreelancerJobStatus;
  feeMinor?: number;
  currency: string;
  startsOn?: string; // ISO yyyy-mm-dd
  dueOn?: string; // ISO yyyy-mm-dd
  deliveredAt?: number;
  paidAt?: number;
  paymentRef?: string; // finance reference once the payment is recorded there
  notes?: string;
  deliverables?: PeopleFreelancerDeliverable[];
  submissions?: PeopleFreelancerSubmission[];
  createdAt: number;
  updatedAt: number;
}

// Agency-configurable policy for what a freelancer sees + can do in their own
// workspace ("all configurable" — Ed). Lives in types.ts (not the server-only
// freelancerWorkspace module) so PortalState can reference it. Per-job
// overrides replace this agency-wide default when present.
export interface FreelancerAccessConfig {
  showFee: boolean;                       // the freelancer's own pay
  clientIdentity: "named" | "anonymised"; // real client name vs a neutral label
  showBrief: boolean;
  showDates: boolean;
  showDeliverables: boolean;
  showNotes: boolean;                     // agency-internal notes
  actions: { markSubmitted: boolean; upload: boolean; message: boolean };
}

// A configurable onboarding step Ed defines once; new hires are seeded from the
// template rather than a hardcoded list.
export interface PeopleOnboardingStep {
  id: string;
  label: string;
  owner: "company" | "employee";
  detail?: string;
  requiresEvidence?: boolean;
}

// Ed's own labels + guidance for each hiring pipeline stage. The stage *ids* stay
// fixed (Radar candidate-backlog/hiring reads key off them); only the presentation
// and his process notes are configurable.
export interface PeopleHiringStageConfig {
  id: PeopleApplicationStage;
  label: string;
  guidance?: string;
}

export interface PeopleProcessConfig {
  agencyId: string;
  onboardingSteps: PeopleOnboardingStep[];
  hiringStages: PeopleHiringStageConfig[];
  updatedAt: number;
}

// Internal staff chat — modeled on the inbox conversation pattern but kept
// staff-scoped in its own store (never the client inbox). A "team" channel is
// everyone in the agency; a "direct" channel is a 1:1 between two members.
export type PeopleChannelKind = "team" | "direct";

export interface PeopleChannel {
  id: string;
  agencyId: string;
  kind: PeopleChannelKind;
  name: string;
  memberUserIds: string[]; // empty for the team channel (everyone); the two ids for a direct
  createdAt: number;
  updatedAt: number;
}

export interface PeopleMessage {
  id: string;
  agencyId: string;
  channelId: string;
  authorUserId: string;
  authorName: string;
  body: string;
  createdAt: number;
  mentions?: string[]; // userIds @mentioned in the body (resolved against the roster at post time)
}

// Per-member read cursor for a chat channel — how "unread" is derived (a message
// after this timestamp, not authored by the member, is unread). Keyed
// `${agencyId}:${channelId}:${userId}` in state.
export interface PeopleChannelRead {
  agencyId: string;
  channelId: string;
  userId: string;
  lastReadAt: number;
}

// Training modules — Ed authors content as ordered blocks (aligned to the portal
// content-block pattern: heading / text / video / resource) plus a quiz. Assigned
// via PeopleTrainingAssignment (`moduleId`); completion gates on passing the quiz.
export type PeopleTrainingBlockType = "heading" | "text" | "video" | "resource";

export interface PeopleTrainingBlock {
  id: string;
  type: PeopleTrainingBlockType;
  text?: string; // heading / paragraph text
  url?: string; // video or resource URL
  label?: string; // resource link label
}

export interface PeopleTrainingQuizOption {
  id: string;
  text: string;
  correct: boolean;
}

export interface PeopleTrainingQuizQuestion {
  id: string;
  prompt: string;
  options: PeopleTrainingQuizOption[];
}

export interface PeopleTrainingModule {
  id: string;
  agencyId: string;
  title: string;
  summary?: string;
  blocks: PeopleTrainingBlock[];
  quiz: PeopleTrainingQuizQuestion[];
  passMark: number; // percent needed to pass (default 70)
  status: "draft" | "published";
  createdAt: number;
  updatedAt: number;
}

export type PeopleContractKind = "offer" | "employment" | "nda" | "commission" | "policy" | "other";
export type PeopleContractStatus = "draft" | "sent" | "acknowledged" | "declined";

// A staff/employment contract or policy document (offer letter, employment terms,
// NDA, commission agreement, policy to acknowledge). Mirrors the client-contract
// shape + reuses `contractTemplates`, but is staff-scoped and signed off by an
// acknowledgement (the staff member types their name) rather than a client accept.
export interface PeopleContract {
  id: string;
  agencyId: string;
  employeeId: string;
  kind: PeopleContractKind;
  title: string;
  summary?: string;
  body?: string;
  templateId?: string;
  status: PeopleContractStatus;
  createdAt: number;
  updatedAt: number;
  sentAt?: number;
  acknowledgedAt?: number;
  acknowledgedBy?: string; // the staff member's userId
  acknowledgementName?: string; // the typed name captured as the sign-off
  declinedAt?: number;
}

export type PeopleFeedbackSentiment = "positive" | "idea" | "concern";
export type PeopleFeedbackStatus = "new" | "read" | "actioned";

// Upward feedback from a staff member to the owner — a lightweight one-way
// channel (the fuller two-way conversation is the internal-chat phase).
export interface PeopleFeedback {
  id: string;
  agencyId: string;
  employeeId: string;
  message: string;
  sentiment: PeopleFeedbackSentiment;
  status: PeopleFeedbackStatus;
  createdAt: number;
  updatedAt: number;
}

export type PeopleRecognitionKind = "employee-of-month" | "shoutout";

// Lightweight internal recognition for a team member. Deliberately self-contained
// (owned by the People domain) — the richer gift/experience side lives in the
// "You Deserve It" clientDelight system, which this can later feed.
export interface PeopleRecognition {
  id: string;
  agencyId: string;
  employeeId: string;
  kind: PeopleRecognitionKind;
  period?: string; // ISO yyyy-mm, for employee-of-month
  note?: string;
  awardedByUserId: string;
  createdAt: number;
}

export type StaffProvisioningTargetKind = "agency-user" | "candidate" | "employee" | "freelancer";
export type StaffProvisioningStage =
  | "intent-recorded"
  | "provider-ready"
  | "local-user-ready"
  | "target-linked"
  | "complete";

/**
 * Durable, password-free checkpoint for creating one staff sign-in. The key is
 * derived from agency + canonical email; the fingerprint binds it to the exact
 * role and People target that the operator approved.
 */
export interface StaffProvisioningOperation {
  id: string;
  agencyId: string;
  email: string;
  name: string;
  localRole: "agency-manager" | "agency-staff" | "freelancer";
  targetKind: StaffProvisioningTargetKind;
  targetId: string;
  intentFingerprint: string;
  localUserId: string;
  targetEmployeeId?: string;
  providerUserId?: string;
  stage: StaffProvisioningStage;
  attempts: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

// ─── PortalState — the single typed object behind storage ─────────────────

export type CustomKpiOp = "ratio" | "rate" | "sum" | "diff";

/** A guided custom KPI (Phase 6 — KPI intelligence): combine a numerator base
 *  metric with an optional denominator via an op. Not a formula language — safe
 *  and honest by construction (only wires existing registry series together). */
export interface CustomKpiDefinition {
  id: string;
  label: string;
  numeratorId: string;
  denominatorId?: string;
  op: CustomKpiOp;
  category?: string;
  direction?: "higher" | "lower";
  createdAt: number;
  createdBy?: string;
}

/**
 * One file in the founder-only Dev Team workspace when the app is running on
 * immutable/serverless infrastructure. Local development still edits the
 * checked-out repository directly; production stores only the changed overlay
 * here and falls back to the deployment snapshot for untouched files.
 */
export interface DevTeamWorkspaceFile {
  relPath: string;
  encoding: "utf8" | "base64";
  content: string;
  sizeBytes: number;
  sha256: string;
  mtimeMs: number;
  deleted?: boolean;
  updatedBy?: string;
}

export interface PortalState {
  agencies: Record<string, Agency>;
  tradingCompanies: Record<string, TradingCompany>;
  clients: Record<string, Client>;
  endCustomers: Record<string, EndCustomer>;
  users: Record<string, ServerUser>;             // keyed by lower-cased email
  accessRoleTemplates: Record<string, AccessRoleTemplate>;
  accessGrants: Record<string, AccessGrant>;
  accessRequests: Record<string, AccessRequest>;
  pluginInstalls: Record<string, PluginInstall>; // keyed by PluginInstall.id
  pluginData: Record<string, Record<string, unknown>>; // installId → key → value
  phases: Record<string, PhaseDefinition>;
  activity: ActivityEntry[];
  clientRecordLedger: Record<string, ClientRecordLedgerEvent>;
  identityResolutionReviews: Record<string, IdentityResolutionReview>;
  // Canonical people and the companies they belong to. Optional in parsed
  // blobs (legacy state lacks them); the storage parser injects empty
  // records, same as pipelines below.
  persons: Record<string, Person>;
  organisations: Record<string, Organisation>;
  // What has actually been finished. See CompletedAction.
  completedActions: Record<string, CompletedAction>;
  // T1 R034 — multi-pipeline kanban model. Optional in parsed blobs
  // (legacy state lacks these fields); storage parser injects defaults.
  pipelines: Record<string, Pipeline>;
  pipelineCards: Record<string, PipelineCard>;
  // `${agencyId}|${userId}` → private assistant history and memories.
  assistant?: Record<string, AssistantWorkspaceState>;
  externalAssistantApiKeys: Record<string, ExternalAssistantApiKey>;
  externalAssistantActionProposals: Record<string, ExternalAssistantActionProposal>;
  integrationConnections: Record<string, IntegrationConnection>;
  // Dev Editor Engine projects — repo + connections + tag + kind. See DevProject.
  devProjects: Record<string, DevProject>;
  // `${agencyId}|${projectId}` → Aqua Editor AI's own per-project config: its
  // model, its brief, and the vault id of ITS token. Never a token. See
  // EditorAiConfig for why this is not a field on DevProject.
  editorAiConfigs: Record<string, EditorAiConfig>;
  // `${agencyId}|${projectId}` → Aqua Editor AI's chat history for that ONE
  // project. Deliberately NOT inside `assistant`, so clearing the agency
  // assistant cannot wipe an editor conversation. See EditorAiConversation.
  editorAiConversations: Record<string, EditorAiConversation>;
  // Production overlay for Dev Team docs/plans/findings/worker ledgers. The
  // checked-in deployment remains the baseline; only authored changes live
  // here so a Vercel instance never pretends its ephemeral filesystem is
  // durable.
  devTeamWorkspaceFiles: Record<string, DevTeamWorkspaceFile>;
  tasks: Record<string, AgencyTask>;
  // Saved task sequences. See AgencyTaskTemplate.
  taskTemplates: Record<string, AgencyTaskTemplate>;
  // A client's own software connected to their portal. See portalConnections.
  portalConnections: Record<string, import("@/lib/server/portal/portalConnections").PortalConnection>;
  // Where each Aqua-tagged website's submissions route. See server/websiteSources.
  websiteSources?: Record<string, import("@/server/websiteSources").WebsiteSource>;
  // Operator-added contact details for an enquiry (Phase 4), keyed by enquiry id.
  // See server/enquiryContactDetails.
  enquiryContactDetails?: Record<string, import("@/server/enquiryContactDetails").EnquiryContactDetails>;
  // One master Aqua-tag site key per agency — the owner's tag for their own
  // sites, pouring submissions into their inbox. See server/websiteSources.
  agencyMasterTagKeys?: Record<string, string>;
  // Per-site Aqua Tag config (injections now, form schemas later), keyed by
  // websiteSource id. See server/websiteInjections.
  websiteSiteConfigs?: Record<string, WebsiteSiteConfig>;
  notepadFolders: Record<string, NotepadFolder>;
  notepadNotes: Record<string, NotepadNote>;
  automationFolders: Record<string, AutomationFolder>;
  automationWorkflows: Record<string, AutomationWorkflow>;
  automationRuns: Record<string, AutomationRun>;
  customAIs: Record<string, CustomAIRecord>;
  dashboardDayPlans: Record<string, DashboardDayPlan>;
  dashboardWeekPlans: Record<string, DashboardWeekPlan>;
  dashboardWorkSessions: Record<string, DashboardWorkSession>;
  commandCalendarEntries: Record<string, CommandCalendarEntry>;
  commandCalendarConnections: Record<string, CommandCalendarConnection>;
  commandCalendarSources: Record<string, CommandCalendarSource>;
  commandCalendarExternalEvents: Record<string, CommandCalendarExternalEvent>;
  commandCalendarEventCreateOperations: Record<string, CommandCalendarEventCreateOperation>;
  sops: Record<string, SopDocument>;
  /** SOP Engine guides — ordered sequences of SOPs composed in the library. */
  sopGuides: Record<string, SopGuide>;
  agencyProducts: Record<string, AgencyProduct>;
  clientMilestones: Record<string, ClientMilestone>;
  performanceExperiments: Record<string, PerformanceExperiment>;
  experiencePackages: Record<string, ExperiencePackage>;
  clientDelight: Record<string, ClientDelightRecord>;
  agencySettings: Record<string, AgencyWorkspaceSettings>;
  portalEditor: Record<string, PortalFormEditorState>;
  clientPortalTemplates: Record<string, ClientPortalTemplateRecord>;
  clientPortalInstances: Record<string, ClientPortalInstanceRecord>;
  companyProfiles: Record<string, CompanyProfile>;
  legalDocuments: Record<string, LegalDocument>;
  contractTemplates: Record<string, import("@/lib/clients/clientContracts").ClientContractTemplate>;
  developmentResources: Record<string, DevelopmentResource>;
  developmentWorkflows: Record<string, DevelopmentWorkflow>;
  agencyWebsites: Record<string, AgencyWebsiteProject>;
  radarMemory: Record<string, RadarMemoryState>;
  radarSyntheticProbes: Record<string, Record<string, RadarSyntheticProbeResult>>;
  radarEvidence: Record<string, RadarEvidenceState>;
  /** Per-agency guided custom KPIs (Phase 6 — KPI intelligence). Additive. */
  customKpis: Record<string, CustomKpiDefinition[]>;
  /** Latest Infra sweep snapshot (radar upgrade Stage 4). App-wide DB/storage health — one probe, not per-agency. */
  radarInfraHealth?: import("@/engines/data/radar/businessRadar").RadarInfraHealthSnapshot;
  operationalAlertPreferences: Record<string, OperationalAlertPreference>;
  peopleApplications: Record<string, PeopleApplication>;
  peopleEmployees: Record<string, PeopleEmployee>;
  peopleLeaveRequests: Record<string, PeopleLeaveRequest>;
  peopleShifts: Record<string, PeopleShift>;
  peopleTrainingAssignments: Record<string, PeopleTrainingAssignment>;
  peopleFreelancerJobs: Record<string, PeopleFreelancerJob>;
  peopleRecognitions: Record<string, PeopleRecognition>;
  peopleFeedback: Record<string, PeopleFeedback>;
  peopleProcessConfig: Record<string, PeopleProcessConfig>;
  // Agency-wide freelancer-access policy, keyed by agencyId. Absent → defaults.
  freelancerAccessConfig: Record<string, FreelancerAccessConfig>;
  // Per-job freelancer-access override, keyed by jobId. Absent → agency default.
  freelancerJobOverride: Record<string, FreelancerAccessConfig>;
  peopleContracts: Record<string, PeopleContract>;
  peopleChannels: Record<string, PeopleChannel>;
  peopleMessages: Record<string, PeopleMessage>;
  peopleChannelReads: Record<string, PeopleChannelRead>;
  peopleTrainingModules: Record<string, PeopleTrainingModule>;
  staffProvisioningOperations: Record<string, StaffProvisioningOperation>;
}
