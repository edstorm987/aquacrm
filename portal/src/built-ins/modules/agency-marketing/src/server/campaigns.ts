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

const CAMPAIGN_CHANNELS = new Set<Campaign["channel"]>(["email", "sms", "social", "paid", "organic", "event"]);
const CAMPAIGN_STATUSES = new Set<CampaignStatus>(["draft", "scheduled", "running", "paused", "completed", "archived"]);
const CAMPAIGN_CURRENCIES = new Set<Campaign["currency"]>(["usd", "gbp", "eur"]);
const CAMPAIGN_KPIS = new Set<NonNullable<Campaign["goalKpi"]>>(["leads", "signups", "revenue", "engagement"]);
const campaignMutationQueues = new Map<AgencyId, Promise<void>>();

async function withCampaignMutationLock<T>(agencyId: AgencyId, work: () => Promise<T>): Promise<T> {
  const previous = campaignMutationQueues.get(agencyId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const queued = previous.then(() => gate);
  campaignMutationQueues.set(agencyId, queued);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (campaignMutationQueues.get(agencyId) === queued) campaignMutationQueues.delete(agencyId);
  }
}

function assertOptionalText(field: string, value: unknown): void {
  if (value !== undefined && typeof value !== "string") throw new Error(`${field} must be text.`);
}

function assertOptionalNumber(field: string, value: unknown, integer = false): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    throw new Error(`${field} must be a finite, non-negative${integer ? " integer" : " number"}.`);
  }
}

function assertCampaignRecord(campaign: Campaign): void {
  if (typeof campaign.name !== "string" || !campaign.name.trim()) throw new Error("Campaign name required.");
  if (!CAMPAIGN_CHANNELS.has(campaign.channel)) throw new Error("channel must be a supported campaign channel.");
  if (!CAMPAIGN_STATUSES.has(campaign.status)) throw new Error("status must be a supported campaign status.");
  if (!CAMPAIGN_CURRENCIES.has(campaign.currency)) throw new Error("currency must be usd, gbp or eur.");
  if (campaign.goalKpi !== undefined && !CAMPAIGN_KPIS.has(campaign.goalKpi)) {
    throw new Error("goalKpi must be leads, signups, revenue or engagement.");
  }
  assertOptionalNumber("startAt", campaign.startAt, true);
  assertOptionalNumber("endAt", campaign.endAt, true);
  assertOptionalNumber("budgetCents", campaign.budgetCents, true);
  assertOptionalNumber("goalTarget", campaign.goalTarget);
  assertOptionalNumber("resultActual", campaign.resultActual);
  assertOptionalText("ownerStaffId", campaign.ownerStaffId);
  assertOptionalText("notes", campaign.notes);
  if (campaign.startAt !== undefined && campaign.endAt !== undefined && campaign.endAt < campaign.startAt) {
    throw new Error("endAt must be on or after startAt.");
  }
}

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
    return withCampaignMutationLock(this.agencyId, () => this.createUnlocked(input, actor, defaultCurrency));
  }

  private async createUnlocked(input: CreateCampaignInput, actor: UserId, defaultCurrency: Currency): Promise<Campaign> {
    if (typeof input.name !== "string") throw new Error("Campaign name required.");
    assertOptionalText("ownerStaffId", input.ownerStaffId);
    assertOptionalText("notes", input.notes);
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
    assertCampaignRecord(row);
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
    return withCampaignMutationLock(this.agencyId, () => this.updateUnlocked(id, patch, actor));
  }

  private async updateUnlocked(id: string, patch: UpdateCampaignPatch, actor: UserId): Promise<Campaign | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    if (patch.name !== undefined && typeof patch.name !== "string") throw new Error("Campaign name must be text.");
    if (patch.ownerStaffId !== undefined && patch.ownerStaffId !== null) assertOptionalText("ownerStaffId", patch.ownerStaffId);
    assertOptionalText("notes", patch.notes);

    const next: Campaign = {
      ...existing,
      ...patch,
      ownerStaffId: patch.ownerStaffId === null ? undefined : patch.ownerStaffId ?? existing.ownerStaffId,
      name: patch.name?.trim() ?? existing.name,
      updatedAt: now(),
    };
    assertCampaignRecord(next);

    if (next.status !== existing.status && !ALLOWED_TRANSITIONS[existing.status].includes(next.status)) {
      throw new Error(`Cannot transition campaign ${existing.name} from ${existing.status} → ${next.status}.`);
    }

    // Channel re-index when changed.
    if (next.channel !== existing.channel) {
      const oldIx = (await this.storage.get<string[]>(byChannelKey(existing.channel))) ?? [];
      await this.storage.set(byChannelKey(existing.channel), oldIx.filter(x => x !== id));
      const newIx = (await this.storage.get<string[]>(byChannelKey(next.channel))) ?? [];
      if (!newIx.includes(id)) {
        await this.storage.set(byChannelKey(next.channel), [...newIx, id]);
      }
    }

    await this.storage.set(cmpKey(id), next);

    if (next.status !== existing.status) {
      const action = `campaign.${
        next.status === "scheduled" ? "scheduled" :
        next.status === "running" ? "started" :
        next.status === "paused" ? "paused" :
        next.status === "completed" ? "completed" :
        next.status === "archived" ? "archived" :
        "updated"
      }` as const;
      await this.activity.logActivity({
        agencyId: this.agencyId,
        actorUserId: actor,
        category: "marketing",
        action,
        message: `Campaign "${next.name}" → ${next.status}.`,
        metadata: { campaignId: id, fromStatus: existing.status, toStatus: next.status },
      });
      this.events.emit({ agencyId: this.agencyId }, action, { campaignId: id, status: next.status });
    }
    return next;
  }

  async delete(id: string, actor: UserId): Promise<boolean> {
    return withCampaignMutationLock(this.agencyId, () => this.deleteUnlocked(id, actor));
  }

  private async deleteUnlocked(id: string, actor: UserId): Promise<boolean> {
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
