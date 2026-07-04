// Shared portal types. Storage, server modules, auth, chrome and the
// plugin runtime all import from here. Keeping this module dependency-free
// means it can be safely imported from edge / middleware / client code
// when the bundler tree-shakes the unused symbols.

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

// ─── Server-side users ────────────────────────────────────────────────────

// R025 schema version. The migration runner walks the users map and
// rewrites legacy single-agency rows into multi-agency shape (agencyIds
// derived from `agencyId`). Bumped on schema changes that the runner
// can detect + repair idempotently.
export const USER_SCHEMA_V = 2;

export interface ServerUser {
  id: string;
  email: string;
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
  clientId?: string;             // set for client-* roles + freelancer + end-customer
  mustChangePassword?: boolean;
  emailVerifiedAt?: number;       // R020: epoch ms when verification token redeemed
  sessionRev?: number;            // R021: rotation counter; bumped on role/password change
  // R036: optional profile picture as a `data:image/...;base64,...` data URL.
  // v1 stores inline on the user record (256×256 cap → ~50KB after client-side
  // canvas resize). R+1 swaps to an external ref via the client-files plugin
  // once foundation has user-scoped file storage.
  avatarUrl?: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Session cookie payload ───────────────────────────────────────────────
//
// Carried in `lk_session_v1` (HMAC-signed). Middleware decodes; route
// handlers re-verify via `getSession()`. iat/exp in unix seconds.

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
  // Sandboxed demo session. Set when the cookie was issued by `/demo`
  // (not by `/api/auth/login`). Surfaces a banner + POV toggle in the
  // portal chrome and isolates the demo agency from real tenants.
  isDemo?: boolean;
  // R021: session-rotation revision. When user.sessionRev > payload.sessionRev
  // the session is stale (role/password changed) and should be rejected on
  // user-aware paths (getCurrentUser / requireRole+lookup). Stateless verify
  // via HMAC stays cheap; rotation enforcement is opt-in at the lookup layer.
  sessionRev?: number;
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

// ─── PortalState — the single typed object behind storage ─────────────────

export interface PortalState {
  agencies: Record<string, Agency>;
  clients: Record<string, Client>;
  endCustomers: Record<string, EndCustomer>;
  users: Record<string, ServerUser>;             // keyed by lower-cased email
  pluginInstalls: Record<string, PluginInstall>; // keyed by PluginInstall.id
  pluginData: Record<string, Record<string, unknown>>; // installId → key → value
  phases: Record<string, PhaseDefinition>;
  activity: ActivityEntry[];
  // T1 R034 — multi-pipeline kanban model. Optional in parsed blobs
  // (legacy state lacks these fields); storage parser injects defaults.
  pipelines: Record<string, Pipeline>;
  pipelineCards: Record<string, PipelineCard>;
}
