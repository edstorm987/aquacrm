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

// ─── Server-side users ────────────────────────────────────────────────────

// R025 schema version. The migration runner walks the users map and
// rewrites legacy single-agency rows into multi-agency shape (agencyIds
// derived from `agencyId`). Bumped on schema changes that the runner
// can detect + repair idempotently.
export const USER_SCHEMA_V = 2;

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
  // Showcase Mode uses an isolated, hardcoded tenant during client calls.
  // The signed return id restores the live workspace without exposing it.
  showcaseReturnAgencyId?: string;
  // Public portfolio session for the real product demo. It is isolated to
  // fictional showcase data and middleware rejects every mutating request.
  publicShowcase?: boolean;
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

export interface AssistantWorkspaceState {
  agencyId: string;
  userId: string;
  threads: AssistantThread[];
  memories: AssistantMemory[];
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
export type AgencyTaskOrigin = "manual" | "radar" | "advisor" | "crm";
export type AgencyTaskReconciliationStatus = "pending" | "still-firing" | "resolved" | "unverifiable" | "reopened";

export interface AgencyTaskReconciliation {
  status: AgencyTaskReconciliationStatus;
  sourceIds: string[];
  activeSourceIds: string[];
  checkedAt?: number;
  resolvedAt?: number;
  detail: string;
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
  sopIds?: string[];
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
  kind: "written" | "file";
  resourceType?: "procedure" | "document" | "presentation" | "video" | "audio" | "image" | "spreadsheet";
  content?: string;
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

export type AgencyProductPricing = "fixed" | "from" | "recurring" | "custom";
export type AgencyProductPortalRequirement = "required" | "optional" | "none";
export type AgencyProductKind = "product" | "package";
export type AgencyProductPortalTemplateKey = "website" | "brand-identity" | "photography" | "google-profile" | "content" | "social-ads" | "automation" | "custom-software" | "ongoing-care" | "business-os" | "health-check";
export type AgencyProductPortalMode = "onboarding" | "designing" | "developed-launch" | "maintenance";

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
  deliverables: string[];
  contractTitle?: string;
  contractBody?: string;
  sopIds: string[];
  sopCategories: string[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
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
  createdBy: string;
  updatedBy: string;
  createdAt: number;
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
  | "notes";

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
  resourceUrl?: string;
  dueAt?: number;
  status: "assigned" | "in-progress" | "completed" | "overdue";
  completedAt?: number;
  evidence?: string;
  createdAt: number;
  updatedAt: number;
}

// ─── PortalState — the single typed object behind storage ─────────────────

export interface PortalState {
  agencies: Record<string, Agency>;
  tradingCompanies: Record<string, TradingCompany>;
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
  // `${agencyId}|${userId}` → private assistant history and memories.
  assistant?: Record<string, AssistantWorkspaceState>;
  externalAssistantApiKeys: Record<string, ExternalAssistantApiKey>;
  externalAssistantActionProposals: Record<string, ExternalAssistantActionProposal>;
  integrationConnections: Record<string, IntegrationConnection>;
  tasks: Record<string, AgencyTask>;
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
  sops: Record<string, SopDocument>;
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
  contractTemplates: Record<string, import("@/lib/clientContracts").ClientContractTemplate>;
  developmentResources: Record<string, DevelopmentResource>;
  developmentWorkflows: Record<string, DevelopmentWorkflow>;
  agencyWebsites: Record<string, AgencyWebsiteProject>;
  radarMemory: Record<string, RadarMemoryState>;
  radarSyntheticProbes: Record<string, Record<string, RadarSyntheticProbeResult>>;
  radarEvidence: Record<string, RadarEvidenceState>;
  operationalAlertPreferences: Record<string, OperationalAlertPreference>;
  peopleApplications: Record<string, PeopleApplication>;
  peopleEmployees: Record<string, PeopleEmployee>;
  peopleLeaveRequests: Record<string, PeopleLeaveRequest>;
  peopleShifts: Record<string, PeopleShift>;
  peopleTrainingAssignments: Record<string, PeopleTrainingAssignment>;
}
