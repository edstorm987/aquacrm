// InboxService — read-only over foundation activity, with per-actor
// read state stored in the plugin install's PluginStorage.
//
// Storage layout (per-install):
//   inbox/read/<actorUserId> → ActorReadState
//   inbox/filters/<actorUserId> → InboxFilter (last-used; convenience)
//
// Read state is "lastReadTs" rather than per-event ids — keeps the
// payload bounded regardless of activity volume and matches how the
// foundation log already orders entries (newest first / monotonic ts).

import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  ActorReadState,
  InboxFilter,
  InboxGroup,
  InboxItem,
  InboxListResult,
} from "../lib/domain";
import { dayKey, resolveRange } from "../lib/domain";
import type { ActivityLogPort, StoragePort } from "./ports";

const READ_PREFIX = "inbox/read/";
const FILTERS_PREFIX = "inbox/filters/";
const READ_HARD_LIMIT = 5_000;

const readKey = (actorUserId: UserId): string => `${READ_PREFIX}${actorUserId}`;
const filtersKey = (actorUserId: UserId): string => `${FILTERS_PREFIX}${actorUserId}`;

export class InboxService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
  ) {}

  async getReadState(actorUserId: UserId): Promise<ActorReadState> {
    const existing = await this.storage.get<ActorReadState>(readKey(actorUserId));
    if (existing) return existing;
    return { actorUserId, lastReadTs: 0, lastSeenAt: 0 };
  }

  async markAllRead(actorUserId: UserId, ts?: number): Promise<ActorReadState> {
    const stamp = ts ?? now();
    const state: ActorReadState = {
      actorUserId,
      lastReadTs: stamp,
      lastSeenAt: stamp,
    };
    await this.storage.set(readKey(actorUserId), state);
    return state;
  }

  async getFilters(actorUserId: UserId): Promise<InboxFilter | null> {
    const f = await this.storage.get<InboxFilter>(filtersKey(actorUserId));
    return f ?? null;
  }

  async setFilters(actorUserId: UserId, filter: InboxFilter): Promise<void> {
    await this.storage.set(filtersKey(actorUserId), filter);
  }

  // Single source of truth — used by `list()` and the bell-count helper.
  private async loadActivity(scanLimit: number): Promise<InboxItem[]> {
    const raw = await this.activity.listActivity({
      agencyId: this.agencyId,
      limit: scanLimit,
    });
    return raw.map(e => ({ ...e, read: false }));
  }

  async unreadCount(actorUserId: UserId, scanLimit = 500): Promise<number> {
    const state = await this.getReadState(actorUserId);
    const all = await this.loadActivity(scanLimit);
    return all.filter(e => e.ts > state.lastReadTs).length;
  }

  async list(
    actorUserId: UserId,
    filter: InboxFilter = {},
    refNow: number = now(),
  ): Promise<InboxListResult> {
    const state = await this.getReadState(actorUserId);
    const scan = Math.min(filter.limit ?? 500, READ_HARD_LIMIT);
    const all = await this.loadActivity(scan);

    const window = resolveRange(filter.range, refNow, filter.rangeStart, filter.rangeEnd);
    const cats = filter.categories?.length ? new Set(filter.categories) : null;
    const clients = filter.clientIds?.length ? new Set(filter.clientIds) : null;
    const q = filter.query?.toLowerCase().trim() || null;

    let unreadCount = 0;
    const items: InboxItem[] = [];
    for (const e of all) {
      if (e.ts < window.start || e.ts >= window.end) continue;
      if (cats && !cats.has(e.category)) continue;
      if (clients && (!e.clientId || !clients.has(e.clientId))) continue;
      if (q) {
        const hay = `${e.message} ${e.action}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const read = e.ts <= state.lastReadTs;
      if (!read) unreadCount++;
      if (filter.unreadOnly && read) continue;
      items.push({ ...e, read });
    }

    items.sort((a, b) => b.ts - a.ts);
    return {
      items,
      groups: groupByDayAndClient(items),
      unreadCount,
      totalScanned: all.length,
    };
  }
}

function groupByDayAndClient(items: InboxItem[]): InboxGroup[] {
  const map = new Map<string, InboxGroup>();
  for (const it of items) {
    const day = dayKey(it.ts);
    const key = `${day}::${it.clientId ?? "_agency"}`;
    let g = map.get(key);
    if (!g) {
      g = { day, clientId: it.clientId, items: [] };
      map.set(key, g);
    }
    g.items.push(it);
  }
  // Newest day first; within day, agency-level (no clientId) first.
  return [...map.values()].sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    const ac = a.clientId ?? "";
    const bc = b.clientId ?? "";
    if (!ac && bc) return -1;
    if (ac && !bc) return 1;
    return ac < bc ? -1 : ac > bc ? 1 : 0;
  });
}
