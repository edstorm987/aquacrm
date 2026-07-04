// TouchpointService — every contact attempt with a lead.
// R008 addition.
//
// Storage layout:
//   touchpoints/index           → string[] of touchpoint ids
//   touchpoints/by-id/<id>      → Touchpoint
//   touchpoints/by-lead/<lead>  → string[] of touchpoint ids

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CreateTouchpointInput,
  PerformanceSummary,
  Touchpoint,
  TouchpointFilter,
  TouchpointType,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import type { CampaignService } from "./campaigns";
import type { ContentCalendarService } from "./content";

const INDEX_KEY = "touchpoints/index";
const tpKey = (id: string): string => `touchpoints/by-id/${id}`;
const byLeadKey = (id: string): string => `touchpoints/by-lead/${id}`;

const TYPE_LIST: readonly TouchpointType[] = ["outreach", "reply", "open", "click", "meeting", "note"] as const;

export class TouchpointService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  private inScope(t: Touchpoint): boolean {
    return t.agencyId === this.agencyId;
  }

  async list(filter: TouchpointFilter = {}): Promise<Touchpoint[]> {
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    const out: Touchpoint[] = [];
    for (const id of ids) {
      const t = await this.storage.get<Touchpoint>(tpKey(id));
      if (!t || !this.inScope(t)) continue;
      if (filter.leadId && t.leadId !== filter.leadId) continue;
      if (filter.campaignId && t.campaignId !== filter.campaignId) continue;
      if (filter.type && t.type !== filter.type) continue;
      if (filter.channel && t.channel !== filter.channel) continue;
      if (filter.fromAt !== undefined && t.at < filter.fromAt) continue;
      if (filter.toAt !== undefined && t.at >= filter.toAt) continue;
      out.push(t);
    }
    return out.sort((a, b) => b.at - a.at);
  }

  async get(id: string): Promise<Touchpoint | null> {
    const t = await this.storage.get<Touchpoint>(tpKey(id));
    return t && this.inScope(t) ? t : null;
  }

  async listForLead(leadId: string): Promise<Touchpoint[]> {
    return this.list({ leadId });
  }

  async record(actor: UserId, input: CreateTouchpointInput): Promise<Touchpoint> {
    if (!input.leadId) throw new Error("agency-marketing: leadId required");
    if (!TYPE_LIST.includes(input.type)) throw new Error("agency-marketing: invalid touchpoint type");
    const t = now();
    const tp: Touchpoint = {
      id: makeId("tp"),
      agencyId: this.agencyId,
      leadId: input.leadId,
      campaignId: input.campaignId,
      type: input.type,
      channel: input.channel,
      at: input.at ?? t,
      summary: input.summary,
      metadata: input.metadata,
      createdAt: t,
    };
    await this.storage.set(tpKey(tp.id), tp);
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    if (!ids.includes(tp.id)) await this.storage.set(INDEX_KEY, [...ids, tp.id]);
    const leadIdx = (await this.storage.get<string[]>(byLeadKey(tp.leadId))) ?? [];
    if (!leadIdx.includes(tp.id)) await this.storage.set(byLeadKey(tp.leadId), [...leadIdx, tp.id]);

    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "marketing", action: "touchpoint.recorded",
      message: `Touchpoint ${tp.type} via ${tp.channel} for lead ${tp.leadId}`,
      metadata: { touchpointId: tp.id, leadId: tp.leadId, campaignId: tp.campaignId },
    });
    this.events.emit({ agencyId: this.agencyId },
      "agency-marketing.touchpoint.recorded", { id: tp.id, leadId: tp.leadId });
    return tp;
  }

  // Subscriber-style helper for client-crm `lead.status_changed`
  // events. Wires up at register time so a CRM status flip silently
  // logs a touchpoint of type "note". Idempotency guaranteed by the
  // caller (CRM should de-dup its own events).
  async onCrmLeadStatusChanged(args: {
    leadId: string;
    fromStatus?: string;
    toStatus: string;
    actor?: UserId;
  }): Promise<Touchpoint> {
    return this.record(args.actor ?? "system", {
      leadId: args.leadId,
      type: "note",
      channel: "email",
      summary: `Lead status: ${args.fromStatus ?? "(none)"} → ${args.toStatus}`,
      metadata: { source: "client-crm.lead.status_changed", fromStatus: args.fromStatus, toStatus: args.toStatus },
    });
  }
}

const WEEK_MS = 7 * 86_400_000;

// Performance summary composes counts from campaigns + content +
// touchpoints. Sparkline = trailing 12 weekly buckets ending at now.
export class PerformanceService {
  constructor(
    private campaigns: CampaignService,
    private content: ContentCalendarService,
    private touchpoints: TouchpointService,
  ) {}

  async summary(refNow: number, weeks = 12): Promise<PerformanceSummary> {
    const windowEnd = refNow;
    const windowStart = refNow - weeks * WEEK_MS;
    const allCampaigns = await this.campaigns.list();
    const allContent = await this.content.list();
    const allTouchpoints = await this.touchpoints.list({ fromAt: windowStart, toAt: windowEnd });

    const byTypeMap = new Map<TouchpointType, number>();
    for (const t of allTouchpoints) {
      byTypeMap.set(t.type, (byTypeMap.get(t.type) ?? 0) + 1);
    }
    const byType = TYPE_LIST.map(type => ({ type, count: byTypeMap.get(type) ?? 0 })).filter(r => r.count > 0);

    const weekly: number[] = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const wEnd = refNow - i * WEEK_MS;
      const wStart = wEnd - WEEK_MS;
      weekly.push(allTouchpoints.filter(t => t.at >= wStart && t.at < wEnd).length);
    }

    return {
      windowStart, windowEnd,
      campaigns: {
        total: allCampaigns.length,
        active: allCampaigns.filter(c => c.status === "running").length,
      },
      content: {
        scheduled: allContent.filter(c => c.status === "scheduled").length,
        published: allContent.filter(c => c.status === "published").length,
      },
      touchpoints: { total: allTouchpoints.length, byType },
      weeklyTouchpoints: weekly,
      hasData: allCampaigns.length > 0 || allTouchpoints.length > 0 || allContent.length > 0,
    };
  }
}
