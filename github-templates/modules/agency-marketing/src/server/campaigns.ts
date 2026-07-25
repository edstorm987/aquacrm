// Campaign service. CRUD + status state-machine + budget vs result rollup.
//
// Storage:
//   campaigns/by-id/<id>           → Campaign
//   campaigns/by-channel/<channel> → string[] of campaign ids
//   campaigns/index                → string[] of all campaign ids
//
// Status transitions:
//   draft     → scheduled | running | archived
//   scheduled → running | paused | archived
//   running   → paused | completed | archived
//   paused    → running | completed | archived
//   completed → archived
//   archived  → (terminal)

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  Campaign,
  CampaignFilter,
  CampaignStatus,
  CreateCampaignInput,
  Currency,
  UpdateCampaignPatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const CMP_INDEX_KEY = "campaigns/index";
const cmpKey = (id: string): string => `campaigns/by-id/${id}`;
const byChannelKey = (channel: string): string => `campaigns/by-channel/${channel}`;

const ALLOWED_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ["scheduled", "running", "archived"],
  scheduled: ["running", "paused", "archived"],
  running: ["paused", "completed", "archived"],
  paused: ["running", "completed", "archived"],
  completed: ["archived"],
  archived: [],
};

export class CampaignService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(filter?: CampaignFilter): Promise<Campaign[]> {
    const ids = (await this.storage.get<string[]>(CMP_INDEX_KEY)) ?? [];
    const out: Campaign[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Campaign>(cmpKey(id));
      if (row) out.push(row);
    }
    const q = filter?.query?.toLowerCase().trim();
    return out
      .filter(c => !filter?.status || c.status === filter.status)
      .filter(c => !filter?.channel || c.channel === filter.channel)
      .filter(c => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<Campaign | null> {
    const row = await this.storage.get<Campaign>(cmpKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  async listForChannel(channel: string): Promise<Campaign[]> {
    const ids = (await this.storage.get<string[]>(byChannelKey(channel))) ?? [];
    const out: Campaign[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Campaign>(cmpKey(id));
      if (row) out.push(row);
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  async create(input: CreateCampaignInput, actor: UserId, defaultCurrency: Currency = "usd"): Promise<Campaign> {
    if (!input.name.trim()) throw new Error("Campaign name required.");
    if (input.startAt && input.endAt && input.endAt < input.startAt) {
      throw new Error("endAt must be on or after startAt.");
    }
    if (input.budgetCents !== undefined && input.budgetCents < 0) {
      throw new Error("budgetCents must be ≥ 0.");
    }
    const id = makeId("cmp");
    const ts = now();
    const row: Campaign = {
      id,
      agencyId: this.agencyId,
      name: input.name.trim(),
      channel: input.channel,
      status: "draft",
      startAt: input.startAt,
      endAt: input.endAt,
      budgetCents: input.budgetCents,
      currency: input.currency ?? defaultCurrency,
      goalKpi: input.goalKpi,
      goalTarget: input.goalTarget,
      ownerStaffId: input.ownerStaffId,
      notes: input.notes,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(cmpKey(id), row);
    const ix = (await this.storage.get<string[]>(CMP_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(CMP_INDEX_KEY, [...ix, id]);
    }
    const cIx = (await this.storage.get<string[]>(byChannelKey(input.channel))) ?? [];
    if (!cIx.includes(id)) {
      await this.storage.set(byChannelKey(input.channel), [...cIx, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "marketing",
      action: "campaign.created",
      message: `Drafted campaign "${row.name}" (${row.channel}).`,
      metadata: { campaignId: id, channel: row.channel },
    });
    this.events.emit({ agencyId: this.agencyId }, "campaign.created", { campaignId: id });
    return row;
  }

  async update(id: string, patch: UpdateCampaignPatch, actor: UserId): Promise<Campaign | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    if (patch.status && patch.status !== existing.status) {
      if (!ALLOWED_TRANSITIONS[existing.status].includes(patch.status)) {
        throw new Error(`Cannot transition campaign ${existing.name} from ${existing.status} → ${patch.status}.`);
      }
    }
    if (patch.startAt && patch.endAt && patch.endAt < patch.startAt) {
      throw new Error("endAt must be on or after startAt.");
    }

    // Channel re-index when changed.
    if (patch.channel && patch.channel !== existing.channel) {
      const oldIx = (await this.storage.get<string[]>(byChannelKey(existing.channel))) ?? [];
      await this.storage.set(byChannelKey(existing.channel), oldIx.filter(x => x !== id));
      const newIx = (await this.storage.get<string[]>(byChannelKey(patch.channel))) ?? [];
      if (!newIx.includes(id)) {
        await this.storage.set(byChannelKey(patch.channel), [...newIx, id]);
      }
    }

    const next: Campaign = {
      ...existing,
      ...patch,
      ownerStaffId: patch.ownerStaffId === null ? undefined : patch.ownerStaffId ?? existing.ownerStaffId,
      name: patch.name?.trim() ?? existing.name,
      updatedAt: now(),
    };
    await this.storage.set(cmpKey(id), next);

    if (patch.status && patch.status !== existing.status) {
      const action = `campaign.${
        patch.status === "scheduled" ? "scheduled" :
        patch.status === "running" ? "started" :
        patch.status === "paused" ? "paused" :
        patch.status === "completed" ? "completed" :
        patch.status === "archived" ? "archived" :
        "updated"
      }` as const;
      await this.activity.logActivity({
        agencyId: this.agencyId,
        actorUserId: actor,
        category: "marketing",
        action,
        message: `Campaign "${next.name}" → ${patch.status}.`,
        metadata: { campaignId: id, fromStatus: existing.status, toStatus: patch.status },
      });
      this.events.emit({ agencyId: this.agencyId }, action, { campaignId: id, status: patch.status });
    }
    return next;
  }

  async delete(id: string, actor: UserId): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    if (existing.status !== "draft") {
      throw new Error(`Only draft campaigns can be deleted. Archive ${existing.name} instead.`);
    }
    await this.storage.del(cmpKey(id));
    const ix = (await this.storage.get<string[]>(CMP_INDEX_KEY)) ?? [];
    await this.storage.set(CMP_INDEX_KEY, ix.filter(x => x !== id));
    const cIx = (await this.storage.get<string[]>(byChannelKey(existing.channel))) ?? [];
    await this.storage.set(byChannelKey(existing.channel), cIx.filter(x => x !== id));
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "marketing",
      action: "campaign.deleted",
      message: `Deleted draft campaign "${existing.name}".`,
      metadata: { campaignId: id },
    });
    return true;
  }

  // Bumps `resultActual` — typically called externally when a metric
  // (signups / leads / revenue) ticks up. Idempotent on the value
  // (caller passes the current cumulative).
  async setResult(id: string, resultActual: number, actor: UserId): Promise<Campaign | null> {
    return this.update(id, { resultActual }, actor);
  }
}
