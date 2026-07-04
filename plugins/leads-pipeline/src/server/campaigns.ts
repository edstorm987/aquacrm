// CampaignService — single-shot email-blast dispatcher.
//
// Lifecycle: `draft` → optional `scheduled` → `sending` → `sent`.
// `send()` is the canonical entry point; it walks the resolved
// audience, enqueues one EmailSender message per recipient (via the
// `EmailEnqueuePort` adapter), records `sentCount` per Lead, stamps
// `Campaign.sentAt`, and emits `leads.campaign.sent`.
//
// Rate-limiting: the email-sender plugin owns the queue (T2 R024). We
// just pile messages onto it; the SMTP driver drains at whatever pace
// the agency's identity allows. No back-pressure logic here.
//
// Idempotency: each enqueue uses externalRef `campaign:<id>:<email>`
// so re-running send() on a half-failed campaign collapses dupes.

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
    if (!input.subject.trim()) throw new Error("Campaign subject required.");
    if (!input.bodyHtml.trim() && !input.bodyText) {
      throw new Error("Campaign needs bodyHtml or bodyText.");
    }
    const id = makeId("camp");
    const ts = now();
    const status: CampaignStatus = input.scheduleAt && input.scheduleAt > ts ? "scheduled" : "draft";
    const campaign: Campaign = {
      id,
      agencyId: this.agencyId,
      name: input.name.trim(),
      subject: input.subject.trim(),
      bodyHtml: input.bodyHtml,
      bodyText: input.bodyText,
      status,
      scheduleAt: input.scheduleAt,
      audienceFilter: input.audienceFilter,
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
      updatedAt: now(),
    };
    await this.storage.set(campaignKey(id), updated);
    return updated;
  }

  // ─── Send pipeline ─────────────────────────────────────────────────────
  //
  // 1. Re-read the campaign + flip status to "sending".
  // 2. Resolve audience via LeadService.resolveAudience.
  // 3. For each lead → enqueue email + bump Lead.sentCount + stamp
  //    Lead.lastContactedAt.
  // 4. Flip status to "sent" + stamp recipients/sentCount/sentAt.
  //
  // Bails early with an unmodified campaign if `EmailEnqueuePort` is
  // not wired up (foundation-pending). The chapter calls this out.

  async send(id: string, actor: UserId): Promise<Campaign> {
    const campaign = await this.get(id);
    if (!campaign) throw new Error(`Campaign ${id} not found.`);
    if (campaign.status === "sending" || campaign.status === "sent") {
      throw new Error(`Campaign ${id} already ${campaign.status}.`);
    }
    if (!this.emailEnqueue) {
      throw new Error("email-sender not wired (EmailEnqueuePort missing). Foundation-pending.");
    }

    const sending: Campaign = { ...campaign, status: "sending", updatedAt: now() };
    await this.storage.set(campaignKey(id), sending);

    const audience: Lead[] = await this.leads.resolveAudience(campaign.audienceFilter);
    let sent = 0;
    const sendStamp = now();
    for (const lead of audience) {
      try {
        await this.emailEnqueue.enqueue({
          agencyId: this.agencyId,
          to: lead.email,
          subject: campaign.subject,
          bodyHtml: campaign.bodyHtml,
          bodyText: campaign.bodyText,
          triggeredByPlugin: PLUGIN_ID,
          externalRef: `campaign:${id}:${lead.email}`,
        });
        await this.leads.stampLastEmailedAt(lead.id, sendStamp, actor);
        sent += 1;
      } catch (err) {
        // One bad recipient should not abort the blast. The error is
        // recorded on the activity log; the caller sees `sent < recipients`.
        await this.activity.logActivity({
          agencyId: this.agencyId,
          actorUserId: actor,
          category: "leads",
          action: "leads.campaign.send_skip",
          message: `Skipped ${lead.email}: ${err instanceof Error ? err.message : String(err)}`,
          metadata: { campaignId: id, leadId: lead.id },
        });
      }
    }

    const finalRow: Campaign = {
      ...sending,
      status: "sent",
      recipients: audience.length,
      sentCount: sent,
      sentAt: sendStamp,
      updatedAt: now(),
    };
    await this.storage.set(campaignKey(id), finalRow);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "leads",
      action: "leads.campaign.sent",
      message: `Sent campaign "${campaign.name}" to ${sent}/${audience.length} recipient${audience.length === 1 ? "" : "s"}.`,
      metadata: { campaignId: id, recipients: audience.length, sentCount: sent },
    });
    this.events.emit({ agencyId: this.agencyId }, "leads.campaign.sent", {
      campaignId: id,
      recipients: audience.length,
      sentCount: sent,
    });
    return finalRow;
  }
}
