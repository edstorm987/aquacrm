// CampaignService — single-shot email-blast dispatcher.
//
// Lifecycle: `draft` → optional `scheduled` → `sending` → one of
// `sent` / `partially-sent` / `queued` / `failed`.
//
// `send()` is the canonical entry point; it walks the resolved audience
// and, for each recipient, enqueues AND delivers one EmailSender message
// through the `EmailEnqueuePort` adapter, then finalises the campaign from
// the outcomes it actually observed.
//
// Delivery is SYNCHRONOUS on purpose (issues #32). There is no job runner
// in this app, so a campaign that only enqueued would sit in the outbox
// with nothing to drain it while the UI claimed "sent". A campaign is only
// `sent` when every recipient was confirmed delivered; anything else keeps
// the unfinished recipients in `pendingLeadIds` so a re-run retries ONLY
// those people. `Lead.lastEmailedAt` / `sentCount` are stamped on confirmed
// delivery alone — never on a message that merely reached the queue.
//
// Rate-limiting: the email-sender plugin owns the queue (T2 R024). We drive
// it one recipient at a time; the driver applies whatever pace the agency's
// identity allows. No back-pressure logic here.
//
// Idempotency: each send uses externalRef `campaign:<id>:<lead.id>` so a
// retry collapses onto the same outbox row rather than duplicating it.

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  Campaign,
  CampaignStatus,
  CreateCampaignInput,
  Lead,
  UpdateCampaignPatch,
} from "../lib/domain";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EmailEnqueuePort,
  EmailEnqueueResult,
  EventBusPort,
} from "./ports";
import type { LeadService } from "./leads";

const CAMPAIGN_INDEX_KEY = "campaigns/index";
const campaignKey = (id: string): string => `campaign:${id}`;

export const PLUGIN_ID = "leads-pipeline";

export class CampaignService {
  constructor(
    private agencyId: AgencyId,
    private storage: PluginStorage,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private leads: LeadService,
    private emailEnqueue?: EmailEnqueuePort,
  ) {}

  async list(): Promise<Campaign[]> {
    const index = (await this.storage.get<string[]>(CAMPAIGN_INDEX_KEY)) ?? [];
    const rows: Campaign[] = [];
    for (const id of index) {
      const row = await this.storage.get<Campaign>(campaignKey(id));
      if (row && row.agencyId === this.agencyId) rows.push(row);
    }
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<Campaign | null> {
    const row = await this.storage.get<Campaign>(campaignKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  async create(input: CreateCampaignInput, actor: UserId): Promise<Campaign> {
    if (!input.name.trim()) throw new Error("Campaign name required.");
    const channel = input.channel ?? "email";
    if (isEmailLikeChannel(channel) && !input.subject?.trim()) throw new Error("Campaign subject required.");
    if (isEmailLikeChannel(channel) && !input.bodyHtml?.trim() && !input.bodyText) {
      throw new Error("Campaign needs bodyHtml or bodyText.");
    }
    const id = makeId("camp");
    const ts = now();
    const status: CampaignStatus = input.scheduleAt && input.scheduleAt > ts ? "scheduled" : "draft";
    const campaign: Campaign = {
      id,
      agencyId: this.agencyId,
      name: input.name.trim(),
      companyIds: cleanIds(input.companyIds),
      customerProfileIds: cleanIds(input.customerProfileIds),
      channel,
      kind: input.kind,
      sourceKey: input.sourceKey?.trim() || undefined,
      subject: input.subject?.trim() ?? "",
      bodyHtml: input.bodyHtml ?? "",
      bodyText: input.bodyText,
      budgetCents: input.budgetCents,
      budgetPotId: input.budgetPotId?.trim().slice(0, 120) || undefined,
      spendCents: input.spendCents,
      attributedRevenueCents: input.attributedRevenueCents,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      externalUrl: input.externalUrl?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      steps: cleanSteps(input.steps),
      creative: input.creative,
      status,
      scheduleAt: input.scheduleAt,
      audienceFilter: {
        ...input.audienceFilter,
        companyIds: cleanIds(input.audienceFilter.companyIds),
      },
      recipients: 0,
      sentCount: 0,
      createdAt: ts,
      updatedAt: ts,
      createdBy: actor,
    };
    await this.storage.set(campaignKey(id), campaign);
    const index = (await this.storage.get<string[]>(CAMPAIGN_INDEX_KEY)) ?? [];
    if (!index.includes(id)) {
      await this.storage.set(CAMPAIGN_INDEX_KEY, [...index, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.campaign.created",
      message: `Created campaign "${campaign.name}".`,
      metadata: { campaignId: id, status },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.campaign.created", { campaignId: id });
    return campaign;
  }

  async update(id: string, patch: UpdateCampaignPatch, actor: UserId): Promise<Campaign | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (existing.status === "sending" || existing.status === "sent") {
      throw new Error(`Campaign ${id} is ${existing.status}; can't edit.`);
    }
    const updated: Campaign = {
      ...existing,
      ...patch,
      companyIds: patch.companyIds === undefined ? existing.companyIds : cleanIds(patch.companyIds),
      customerProfileIds: patch.customerProfileIds === undefined ? existing.customerProfileIds : cleanIds(patch.customerProfileIds),
      budgetPotId: patch.budgetPotId === undefined
        ? existing.budgetPotId
        : patch.budgetPotId?.trim().slice(0, 120) || undefined,
      steps: patch.steps === undefined ? existing.steps : cleanSteps(patch.steps),
      audienceFilter: patch.audienceFilter === undefined ? existing.audienceFilter : {
        ...patch.audienceFilter,
        companyIds: cleanIds(patch.audienceFilter.companyIds),
      },
      updatedAt: now(),
    };
    await this.storage.set(campaignKey(id), updated);
    return updated;
  }

  // ─── Send pipeline ─────────────────────────────────────────────────────
  //
  // 1. Re-read the campaign + flip status to "sending".
  // 2. Resolve audience via LeadService.resolveAudience — narrowed to
  //    `pendingLeadIds` when this run is a retry of an unfinished blast.
  // 3. For each lead → enqueue AND deliver, then classify the outcome:
  //    delivered (bump Lead.sentCount + stamp Lead.lastContactedAt),
  //    queued (in the outbox, unconfirmed — no Lead stamp) or failed.
  // 4. Finalise the campaign from those outcomes, not from the enqueue
  //    count, and keep the unfinished recipients for the next attempt.
  //
  // Throws if `EmailEnqueuePort` is not wired up (foundation-pending) —
  // the campaign is left untouched rather than marked sent.

  async send(id: string, actor: UserId): Promise<Campaign> {
    const campaign = await this.get(id);
    if (!campaign) throw new Error(`Campaign ${id} not found.`);
    if (campaign.status === "sending" || campaign.status === "sent") {
      throw new Error(`Campaign ${id} already ${campaign.status}.`);
    }
    if (!isEmailLikeChannel(campaign.channel ?? "email")) {
      throw new Error("Only email and newsletter campaigns can be sent from Milesymedia. Track other channels here and publish them manually.");
    }
    if (!this.emailEnqueue) {
      throw new Error("email-sender not wired (EmailEnqueuePort missing). Foundation-pending.");
    }

    const port = this.emailEnqueue;
    // `send()` reports what actually happened; `enqueue()` can only say the
    // message was accepted. When an adapter offers no `send()`, every
    // recipient is honestly recorded as queued rather than as delivered.
    const attempt = port.send?.bind(port) ?? port.enqueue.bind(port);

    // A retry needs people to retry. An unfinished campaign with an empty
    // pending set (nobody resolved last time) is a fresh attempt, not a retry —
    // narrowing to an empty set would send to nobody and then call itself sent.
    const pending = campaign.pendingLeadIds ?? [];
    const isRetry = RETRYABLE_STATUSES.has(campaign.status) && pending.length > 0;
    const retrySet = isRetry ? new Set(pending) : null;

    const sending: Campaign = { ...campaign, status: "sending", updatedAt: now() };
    await this.storage.set(campaignKey(id), sending);

    const resolved: Lead[] = await this.leads.resolveAudience(campaign.audienceFilter);
    // A retry re-attempts only the people still owed an email. Anyone already
    // confirmed delivered must not be emailed a second time.
    const audience = retrySet ? resolved.filter(lead => retrySet.has(lead.id)) : resolved;

    let delivered = 0;
    let failed = 0;
    let queued = 0;
    const pendingLeadIds: string[] = [];
    let lastSendError: string | undefined;
    const sendStamp = now();

    if (retrySet) {
      // Someone still owed an email who no longer resolves (archived, retagged,
      // moved column) cannot be reached by this retry. They stay pending and
      // counted, so the campaign can never call itself "sent" over their head.
      const reachable = new Set(audience.map(lead => lead.id));
      for (const leadId of retrySet) {
        if (reachable.has(leadId)) continue;
        failed += 1;
        pendingLeadIds.push(leadId);
        lastSendError ??= "One or more unfinished recipients are no longer in the audience.";
        await this.activity.logActivity({
          agencyId: this.agencyId,
          actorUserId: actor,
          category: "leads",
          action: "leads.campaign.send_failed",
          message: `Lead ${leadId} is still owed this campaign but no longer matches its audience.`,
          metadata: { campaignId: id, leadId, outcome: "failed", reason: "left_audience" },
        });
      }
    }

    for (const lead of audience) {
      if (!lead.email) {
        // Not a delivery and not a provider refusal — nobody could be reached,
        // so it counts against the campaign and stays in the retry set in case
        // the address is filled in later.
        failed += 1;
        pendingLeadIds.push(lead.id);
        lastSendError ??= "One or more leads have no email address.";
        await this.activity.logActivity({
          agencyId: this.agencyId,
          actorUserId: actor,
          category: "leads",
          action: "leads.campaign.send_skip",
          message: `Skipped lead ${lead.id}: no email address.`,
          metadata: { campaignId: id, leadId: lead.id, reason: "missing_email" },
        });
        continue;
      }
      let result: EmailEnqueueResult | undefined;
      let thrown: string | undefined;
      try {
        result = await attempt({
          agencyId: this.agencyId,
          to: lead.email,
          subject: campaign.subject,
          bodyHtml: campaign.bodyHtml,
          bodyText: campaign.bodyText,
          triggeredByPlugin: PLUGIN_ID,
          // Keyed by lead id, not address: this ref becomes the email-sender
          // idempotency key, which lands in a STORAGE KEY NAME — PII there
          // survives any value-based erasure sweep. The id is just as unique.
          externalRef: `campaign:${id}:${lead.id}`,
        });
      } catch (err) {
        // One bad recipient must not abort the blast, but it is a failure —
        // never a silent omission from the totals.
        thrown = err instanceof Error ? err.message : String(err);
      }

      if (thrown !== undefined) {
        failed += 1;
        pendingLeadIds.push(lead.id);
        lastSendError ??= thrown;
        await this.activity.logActivity({
          agencyId: this.agencyId,
          actorUserId: actor,
          category: "leads",
          action: "leads.campaign.send_failed",
          message: `Could not send to lead ${lead.id}: ${thrown}`,
          metadata: { campaignId: id, leadId: lead.id, outcome: "failed" },
        });
        continue;
      }

      const outcome = classifyOutcome(result);
      if (outcome === "delivered") {
        await this.leads.stampLastEmailedAt(lead.id, sendStamp, actor);
        delivered += 1;
        continue;
      }

      pendingLeadIds.push(lead.id);
      const reason = result?.error
        ?? (outcome === "queued" ? "Accepted into the outbox; delivery not confirmed." : "Delivery was not confirmed.");
      lastSendError ??= reason;
      if (outcome === "queued") queued += 1;
      else failed += 1;
      await this.activity.logActivity({
        agencyId: this.agencyId,
        actorUserId: actor,
        category: "leads",
        action: outcome === "queued" ? "leads.campaign.send_queued" : "leads.campaign.send_failed",
        message: outcome === "queued"
          ? `Queued for lead ${lead.id}, not yet delivered: ${reason}`
          : `Delivery to lead ${lead.id} failed: ${reason}`,
        metadata: { campaignId: id, leadId: lead.id, outcome, messageId: result?.messageId, code: result?.code },
      });
    }

    const sentCount = (isRetry ? campaign.sentCount : 0) + delivered;
    const recipients = isRetry ? campaign.recipients : audience.length;
    if (sentCount === 0 && pendingLeadIds.length === 0) {
      // Nobody resolved, so nobody could be emailed. Stamping that "sent" would
      // be the exact claim-a-delivery-that-never-happened this pipeline exists
      // to stop — and it would lock the campaign out of editing and re-sending.
      lastSendError ??= "No leads matched this campaign's audience, so nobody was emailed.";
    }
    const status = finalStatus({ delivered: sentCount, failed, queued });
    const finalRow: Campaign = {
      ...sending,
      status,
      recipients,
      sentCount,
      failedCount: failed,
      queuedCount: queued,
      pendingLeadIds,
      lastSendError: status === "sent" ? undefined : lastSendError,
      // Only a confirmed delivery earns a sent date; an outbox row does not.
      sentAt: delivered > 0 ? (campaign.sentAt ?? sendStamp) : campaign.sentAt,
      updatedAt: now(),
    };
    await this.storage.set(campaignKey(id), finalRow);

    const summary = `${sentCount}/${recipients} delivered`
      + (failed ? ` · ${failed} failed` : "")
      + (queued ? ` · ${queued} queued, not confirmed` : "");
    const anythingDelivered = sentCount > 0;
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: anythingDelivered ? "leads.campaign.sent" : "leads.campaign.send_failed",
      message: anythingDelivered
        ? `Campaign "${campaign.name}": ${summary}.`
        : `Campaign "${campaign.name}" delivered to nobody: ${summary}.`,
      metadata: {
        campaignId: id,
        recipients,
        sentCount,
        failedCount: failed,
        queuedCount: queued,
        status,
      },
    });
    this.events.emit(
      { agencyId: this.agencyId },
      anythingDelivered ? "leads.campaign.sent" : "leads.campaign.send_failed",
      {
        campaignId: id,
        recipients,
        sentCount,
        failedCount: failed,
        queuedCount: queued,
        status,
      },
    );
    return finalRow;
  }
}

// A campaign that did not finish can be run again; the retry targets only
// `pendingLeadIds`, so nobody is emailed twice.
const RETRYABLE_STATUSES = new Set<CampaignStatus>(["queued", "partially-sent", "failed"]);

type SendOutcome = "delivered" | "queued" | "failed";

function classifyOutcome(result: EmailEnqueueResult | undefined): SendOutcome {
  if (!result) return "failed";
  if (result.delivered === true) return "delivered";
  // No verdict at all = the adapter could only enqueue. `provider_unconfigured`
  // is email-sender saying the durable row is still there, waiting for a
  // provider — both are "queued", neither is a delivery.
  if (result.delivered === undefined) return "queued";
  if (result.code === "provider_unconfigured") return "queued";
  return "failed";
}

function finalStatus(counts: {
  delivered: number;
  failed: number;
  queued: number;
}): CampaignStatus {
  const unfinished = counts.failed + counts.queued;
  // Nobody delivered AND nobody left owed = the audience was empty. "sent" is
  // reserved for "every recipient was confirmed", and zero recipients confirms
  // nothing; the campaign stays re-sendable once the audience has people in it.
  if (unfinished === 0 && counts.delivered === 0) return "failed";
  if (unfinished === 0) return "sent";
  if (counts.delivered > 0) return "partially-sent";
  return counts.failed > 0 ? "failed" : "queued";
}

function cleanIds(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean))).slice(0, 30);
}

function cleanSteps(values: CreateCampaignInput["steps"] | undefined): CreateCampaignInput["steps"] {
  if (!Array.isArray(values)) return [];
  return values
    .filter(step => step.name?.trim())
    .slice(0, 30)
    .map(step => ({
      id: step.id?.trim() || makeId("step"),
      name: step.name.trim(),
      channel: step.channel,
      owner: step.owner?.trim() || undefined,
      dueAt: step.dueAt,
      status: step.status ?? "todo",
      notes: step.notes?.trim() || undefined,
    }));
}

function isEmailLikeChannel(channel: Campaign["channel"]): boolean {
  return channel === "email" || channel === "newsletter";
}
