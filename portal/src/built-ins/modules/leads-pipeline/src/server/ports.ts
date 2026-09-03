// Foundation port contracts for the leads-pipeline plugin.
//
// Same minimal slice as agency-hr (Tenant + Activity + EventBus +
// PluginInstallStore) plus two plugin-specific ports:
//
//   - `EmailEnqueuePort` — adapter onto the email-sender plugin's
//     `EmailService.enqueue`. The foundation binds this so this plugin
//     never imports the email-sender package directly (cross-plugin
//     coupling stays inside foundation glue).
//
//   - `PipelinePort` — adapter onto T1's foundation pipelines service
//     (R034). When the cross-plugin subscriber fires, it asks for the
//     leads pipeline + the "New" column and adds a card. The port is
//     optional in v1 — if the foundation hasn't wired it up yet, the
//     subscriber still creates the Lead row, just without the card
//     (foundation-pending — see chapter).

import type {
  ActivityCategory,
  ActivityEntry,
  Agency,
  AgencyId,
  ClientId,
  PluginInstall,
  PluginInstallScope,
  UserId,
} from "../lib/tenancy";

// ─── Tenant ────────────────────────────────────────────────────────────────

export interface TenantPort {
  getAgency(id: AgencyId): Promise<Agency | null> | Agency | null;
}

// ─── Activity ──────────────────────────────────────────────────────────────

export interface LogActivityInput {
  /** Stable source-operation identity. Replays return the original entry. */
  idempotencyKey?: string;
  agencyId: AgencyId;
  clientId?: ClientId;
  actorUserId?: UserId;
  actorEmail?: string;
  category: ActivityCategory;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ListActivityFilter {
  agencyId: AgencyId;
  clientId?: ClientId;
  limit?: number;
}

export interface ActivityLogPort {
  logActivity(input: LogActivityInput): Promise<ActivityEntry> | ActivityEntry;
  listActivity(filter: ListActivityFilter): Promise<ActivityEntry[]> | ActivityEntry[];
}

// ─── Event bus ─────────────────────────────────────────────────────────────

export type LeadsEventName =
  | "leads.prospect.created"
  | "leads.prospect.updated"
  | "leads.prospect.inspection-saved"
  | "leads.prospect.follow-up-scheduled"
  | "leads.prospect.follow-up-resolved"
  | "leads.lead.created"
  | "leads.lead.updated"
  | "leads.lead.archived"
  | "leads.lead.restored"
  | "leads.lead.purged"
  | "leads.contact.created"
  | "leads.contact.promoted"
  | "leads.csv.imported"
  | "leads.campaign.created"
  | "leads.campaign.sent"
  // Emitted instead of `sent` when a send attempt confirmed no deliveries.
  | "leads.campaign.send_failed";

// Cross-plugin events this plugin subscribes to.
export type SubscribedEventName =
  | "public-funnel.lead.captured"
  | "pipelines.card.moved";        // T1 emits when card column changes

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: LeadsEventName | string,
    payload: T,
  ): void;
  // Subscribe is optional — the foundation can wire subscriptions itself
  // by inspecting `EVENT_SUBSCRIPTIONS` exported from the server barrel.
  on?<T = unknown>(
    name: SubscribedEventName | string,
    listener: (scope: { agencyId: AgencyId; clientId?: ClientId }, payload: T) => void | Promise<void>,
  ): void;
}

// ─── Plugin install store (read-only) ─────────────────────────────────────

export interface PluginInstallStorePort {
  getInstall(scope: PluginInstallScope, pluginId: string): Promise<PluginInstall | null> | PluginInstall | null;
}

// ─── Email enqueue (adapter onto T2 R024 email-sender) ────────────────────

export interface EmailEnqueueInput {
  agencyId: AgencyId;
  to: string | string[];
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  triggeredByPlugin: string;       // "@aqua/plugin-leads-pipeline"
  externalRef?: string;            // canonical idempotency seed (e.g. campaign:<id>:<email>)
}

export interface EmailEnqueueResult {
  messageId: string;
  // `true` = the provider confirmed delivery. `false` = the attempt was made
  // and did not land. `undefined` = the message was only accepted into the
  // outbox and NOTHING confirms it went anywhere.
  delivered?: boolean;
  error?: string;
  // email-sender's `DeliveryFailureCode`. `provider_unconfigured` is the one
  // that means "still durably queued, repair the configuration and it goes",
  // as opposed to a refusal by a real provider.
  code?: string;
}

export interface EmailEnqueuePort {
  enqueue(input: EmailEnqueueInput): Promise<EmailEnqueueResult> | EmailEnqueueResult;
  // Enqueue AND attempt delivery, reporting the real outcome. CampaignService
  // prefers this: `enqueue` alone can never tell a campaign whether anyone
  // actually received it.
  send?(input: EmailEnqueueInput): Promise<EmailEnqueueResult> | EmailEnqueueResult;
}

// ─── Pipeline port (adapter onto T1 R034 foundation pipelines) ───────────

export interface PipelineCardRef {
  cardId: string;
  pipelineId: string;
  columnId: string;
}

export interface AddLeadCardInput {
  agencyId: AgencyId;
  leadId: string;
  email: string;
  phone?: string;
  name?: string;
  company?: string;
  source: string;
  // Optional column override; defaults to the leads pipeline's "New".
  columnId?: string;
  // Optional column LABEL override (the `newColumnLabel` setting). Honoured
  // only when a column with that label exists; otherwise the default applies.
  columnLabel?: string;
}

export interface PipelinePort {
  // Returns null when the foundation hasn't seeded a leads pipeline yet,
  // or when the agency hasn't been bootstrapped — the caller treats null
  // as "skip pipeline integration, still persist the Lead row".
  addLeadCard(input: AddLeadCardInput): Promise<PipelineCardRef | null> | PipelineCardRef | null;
  // Lookup used by Campaign send when AudienceFilter.pipelineColumn is set.
  // Returns the lead ids whose card currently sits in the named column.
  leadIdsInColumn(args: { agencyId: AgencyId; columnLabel: string }): Promise<string[]> | string[];
  // Lookup used by Lead→Contact promotion. Returns the lead's current
  // pipeline column label (e.g. "Won"); null if no card exists.
  columnLabelForLead(args: { agencyId: AgencyId; leadId: string }): Promise<string | null> | string | null;
  // Which column the lead's card is in, so archive can remember where to put it
  // back. Returns null when there is no card — the same "foundation-pending"
  // answer every other method here gives.
  columnIdForLead?(args: { agencyId: AgencyId; leadId: string }): Promise<string | null> | string | null;
  // Remove the lead's card when the lead leaves the active board.
  //
  // Issue #62: without this the card SURVIVED the archive, holding a snapshot of
  // the lead's name, email and phone, on a board where nobody could see it was
  // stale. Sweeps by `leadId` as well as by the stored `pipelineCardId`, because
  // the id is only stored when the foundation was wired up at capture time.
  // Returns how many cards it removed.
  removeLeadCards?(args: {
    agencyId: AgencyId;
    leadId: string;
    cardId?: string;
  }): Promise<number> | number;
}
