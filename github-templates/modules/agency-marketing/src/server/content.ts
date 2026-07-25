// ContentCalendarService — content items + week/month grid.
// R008 addition.
//
// Storage layout:
//   content/index           → string[] of item ids
//   content/by-id/<id>      → ContentItem
//   content/by-campaign/<c> → string[] of item ids

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CalendarBucket,
  CalendarWindow,
  ContentItem,
  ContentItemFilter,
  CreateContentItemInput,
  UpdateContentItemPatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const INDEX_KEY = "content/index";
const itemKey = (id: string): string => `content/by-id/${id}`;
const byCampaignKey = (cid: string): string => `content/by-campaign/${cid}`;

const DAY_MS = 86_400_000;

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export class ContentCalendarService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  private inScope(c: ContentItem): boolean {
    return c.agencyId === this.agencyId;
  }

  async list(filter: ContentItemFilter = {}): Promise<ContentItem[]> {
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    const out: ContentItem[] = [];
    for (const id of ids) {
      const c = await this.storage.get<ContentItem>(itemKey(id));
      if (!c || !this.inScope(c)) continue;
      if (filter.campaignId && c.campaignId !== filter.campaignId) continue;
      if (filter.status && c.status !== filter.status) continue;
      if (filter.channel && c.channel !== filter.channel) continue;
      if (filter.fromScheduledAt !== undefined && (!c.scheduledAt || c.scheduledAt < filter.fromScheduledAt)) continue;
      if (filter.toScheduledAt !== undefined && (!c.scheduledAt || c.scheduledAt >= filter.toScheduledAt)) continue;
      out.push(c);
    }
    return out.sort((a, b) => (a.scheduledAt ?? a.createdAt) - (b.scheduledAt ?? b.createdAt));
  }

  async get(id: string): Promise<ContentItem | null> {
    const c = await this.storage.get<ContentItem>(itemKey(id));
    return c && this.inScope(c) ? c : null;
  }

  async create(actor: UserId, input: CreateContentItemInput): Promise<ContentItem> {
    if (!input.title.trim()) throw new Error("agency-marketing: title required");
    const t = now();
    const item: ContentItem = {
      id: makeId("ci"),
      agencyId: this.agencyId,
      campaignId: input.campaignId,
      title: input.title.trim(),
      channel: input.channel,
      scheduledAt: input.scheduledAt,
      status: input.status ?? (input.scheduledAt ? "scheduled" : "draft"),
      url: input.url,
      notes: input.notes,
      createdAt: t,
      updatedAt: t,
    };
    await this.storage.set(itemKey(item.id), item);
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    if (!ids.includes(item.id)) await this.storage.set(INDEX_KEY, [...ids, item.id]);
    if (item.campaignId) {
      const idx = (await this.storage.get<string[]>(byCampaignKey(item.campaignId))) ?? [];
      if (!idx.includes(item.id)) await this.storage.set(byCampaignKey(item.campaignId), [...idx, item.id]);
    }
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "marketing", action: "content.created",
      message: `Content "${item.title}" created (${item.channel}, ${item.status})`,
      metadata: { contentItemId: item.id, campaignId: item.campaignId },
    });
    this.events.emit({ agencyId: this.agencyId },
      "agency-marketing.content.created", { id: item.id });
    return item;
  }

  async update(actor: UserId, id: string, patch: UpdateContentItemPatch): Promise<ContentItem> {
    const cur = await this.get(id);
    if (!cur) throw new Error("agency-marketing: content item not found");
    const next: ContentItem = {
      ...cur,
      title: patch.title?.trim() || cur.title,
      channel: patch.channel ?? cur.channel,
      scheduledAt: patch.scheduledAt ?? cur.scheduledAt,
      publishedAt: patch.publishedAt ?? cur.publishedAt,
      status: patch.status ?? cur.status,
      url: patch.url ?? cur.url,
      notes: patch.notes ?? cur.notes,
      updatedAt: now(),
    };
    await this.storage.set(itemKey(id), next);
    this.events.emit({ agencyId: this.agencyId },
      "agency-marketing.content.updated", { id });
    return next;
  }

  async publish(actor: UserId, id: string): Promise<ContentItem> {
    return this.update(actor, id, { status: "published", publishedAt: now() });
  }

  async archive(actor: UserId, id: string): Promise<void> {
    const cur = await this.get(id);
    if (!cur) throw new Error("agency-marketing: content item not found");
    await this.storage.set(itemKey(id), { ...cur, status: "archived", updatedAt: now() });
    this.events.emit({ agencyId: this.agencyId },
      "agency-marketing.content.archived", { id });
  }

  // Window grid: bucket items by UTC day for the calendar page.
  // Items without a scheduledAt are surfaced via `unscheduledCount`
  // so the UI can show a side rail.
  async window(windowStart: number, windowEnd: number): Promise<CalendarWindow> {
    const items = await this.list({ fromScheduledAt: windowStart, toScheduledAt: windowEnd });
    const map = new Map<string, CalendarBucket>();
    for (let day = Math.floor(windowStart / DAY_MS) * DAY_MS; day < windowEnd; day += DAY_MS) {
      map.set(dayKey(day), { day: dayKey(day), items: [] });
    }
    for (const c of items) {
      if (!c.scheduledAt) continue;
      const k = dayKey(c.scheduledAt);
      const bucket = map.get(k);
      if (bucket) bucket.items.push(c);
    }
    const all = await this.list();
    const unscheduledCount = all.filter(c => !c.scheduledAt && c.status !== "archived").length;
    return {
      windowStart,
      windowEnd,
      buckets: [...map.values()],
      unscheduledCount,
    };
  }
}
