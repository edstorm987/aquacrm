// NotificationService — rules CRUD + event-fan-out engine + cooldown
// dedup.
//
// Storage layout (per-install):
//   rules/index                       → string[] of rule ids
//   rules/by-id/<id>                  → NotificationRule
//   config                            → ChannelConfig (agency-level)
//   cooldowns/<userId>/<eventId>      → number (ts of last dispatch)
//
// scopePolicy: "agency". Per-user preferences live as one rule per
// user × channel-set; the API returns rules grouped by user for the
// preferences UI but storage keeps them flat.

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  ActivityShape,
  ChannelConfig,
  ChannelKey,
  CreateRuleInput,
  DispatchInput,
  MatchedDispatch,
  NotificationRule,
  UpdateRulePatch,
} from "../lib/domain";
import { CHANNEL_KEYS } from "../lib/domain";
import type {
  ActivityLogPort,
  ChannelDriver,
  EventBusPort,
  StoragePort,
} from "./ports";

const INDEX_KEY = "rules/index";
const CONFIG_KEY = "config";
const ruleKey = (id: string): string => `rules/by-id/${id}`;
const cooldownKey = (userId: UserId, eventId: string): string => `cooldowns/${userId}/${eventId}`;

function uniq<T>(xs: T[] | undefined): T[] {
  if (!xs) return [];
  const out: T[] = [];
  const seen = new Set<T>();
  for (const x of xs) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

export interface NotificationsDeps {
  agencyId: AgencyId;
  storage: StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  drivers: Record<string, ChannelDriver>;
}

export class NotificationService {
  private readonly agencyId: AgencyId;
  private readonly storage: StoragePort;
  private readonly activity: ActivityLogPort;
  private readonly events: EventBusPort;
  private readonly drivers: Record<string, ChannelDriver>;

  constructor(deps: NotificationsDeps) {
    this.agencyId = deps.agencyId;
    this.storage = deps.storage;
    this.activity = deps.activity;
    this.events = deps.events;
    this.drivers = deps.drivers;
  }

  // ── ChannelConfig ──────────────────────────────────────────────

  async getConfig(): Promise<ChannelConfig> {
    return (await this.storage.get<ChannelConfig>(CONFIG_KEY)) ?? {};
  }

  async setConfig(patch: ChannelConfig): Promise<ChannelConfig> {
    const next: ChannelConfig = { ...(await this.getConfig()), ...patch };
    await this.storage.set(CONFIG_KEY, next);
    return next;
  }

  // ── Rules CRUD ─────────────────────────────────────────────────

  async listRules(filter: { userId?: UserId } = {}): Promise<NotificationRule[]> {
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    const out: NotificationRule[] = [];
    for (const id of ids) {
      const r = await this.storage.get<NotificationRule>(ruleKey(id));
      if (!r) continue;
      if (filter.userId && r.userId !== filter.userId) continue;
      out.push(r);
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getRule(id: string): Promise<NotificationRule | null> {
    return (await this.storage.get<NotificationRule>(ruleKey(id))) ?? null;
  }

  async createRule(input: CreateRuleInput): Promise<NotificationRule> {
    const t = now();
    const channels = uniq(input.channels).filter(c => (CHANNEL_KEYS as readonly string[]).includes(c)) as ChannelKey[];
    if (channels.length === 0) throw new Error("notifications: at least one channel required");
    const rule: NotificationRule = {
      id: makeId("nrule"),
      userId: input.userId,
      eventCategories: uniq(input.eventCategories),
      channels,
      cooldownSeconds: input.cooldownSeconds,
      clientIds: uniq(input.clientIds),
      enabled: input.enabled ?? true,
      createdAt: t,
      updatedAt: t,
    };
    await this.storage.set(ruleKey(rule.id), rule);
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    if (!ids.includes(rule.id)) await this.storage.set(INDEX_KEY, [...ids, rule.id]);
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: input.userId,
      category: "settings", action: "notification.rule.created",
      message: `Notification rule for ${rule.userId} → ${rule.channels.join(", ")} created`,
      metadata: { ruleId: rule.id },
    });
    this.events.emit({ agencyId: this.agencyId }, "notifications.rule.created", { id: rule.id });
    return rule;
  }

  async updateRule(id: string, patch: UpdateRulePatch): Promise<NotificationRule> {
    const r = await this.getRule(id);
    if (!r) throw new Error("notifications: rule not found");
    const next: NotificationRule = {
      ...r,
      eventCategories: patch.eventCategories ? uniq(patch.eventCategories) : r.eventCategories,
      channels: patch.channels ? uniq(patch.channels) : r.channels,
      cooldownSeconds: patch.cooldownSeconds ?? r.cooldownSeconds,
      clientIds: patch.clientIds ? uniq(patch.clientIds) : r.clientIds,
      enabled: patch.enabled ?? r.enabled,
      updatedAt: now(),
    };
    if (next.channels.length === 0) throw new Error("notifications: at least one channel required");
    await this.storage.set(ruleKey(id), next);
    this.events.emit({ agencyId: this.agencyId }, "notifications.rule.updated", { id });
    return next;
  }

  async archiveRule(id: string): Promise<void> {
    const r = await this.getRule(id);
    if (!r) throw new Error("notifications: rule not found");
    await this.storage.del(ruleKey(id));
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    await this.storage.set(INDEX_KEY, ids.filter(x => x !== id));
    this.events.emit({ agencyId: this.agencyId }, "notifications.rule.archived", { id });
  }

  // ── Engine ─────────────────────────────────────────────────────

  async onActivityEvent(event: ActivityShape): Promise<MatchedDispatch[]> {
    const rules = await this.listRules();
    const matches: MatchedDispatch[] = [];
    const config = await this.getConfig();
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (rule.eventCategories.length > 0 && !rule.eventCategories.includes(event.category)) continue;
      if (rule.clientIds && rule.clientIds.length > 0) {
        if (!event.clientId || !rule.clientIds.includes(event.clientId)) continue;
      }
      for (const channel of rule.channels) {
        const suppressed = await this.checkAndSetCooldown(rule, event);
        if (suppressed) {
          this.events.emit({ agencyId: this.agencyId }, "notifications.dispatch.suppressed",
            { ruleId: rule.id, channel, eventId: event.id });
          matches.push({ ruleId: rule.id, userId: rule.userId, channel, suppressed: true });
          continue;
        }
        const driver = this.drivers[channel];
        const input: DispatchInput = {
          userId: rule.userId,
          channel,
          subject: `[${event.category}] ${event.action}`,
          body: event.message,
          eventId: event.id,
          metadata: { agencyId: event.agencyId, clientId: event.clientId, ts: event.ts },
        };
        const result = driver
          ? await driver.dispatch(input, config)
          : { channel, status: "skipped" as const, reason: "no_driver_registered", attemptedAt: now() };
        const eventName = result.status === "sent" ? "notifications.dispatch.sent"
          : result.status === "error" ? "notifications.dispatch.error"
          : "notifications.dispatch.skipped";
        this.events.emit({ agencyId: this.agencyId }, eventName,
          { ruleId: rule.id, channel, eventId: event.id, status: result.status, reason: result.reason });
        matches.push({ ruleId: rule.id, userId: rule.userId, channel, suppressed: false, result });
      }
    }
    return matches;
  }

  // Returns true when this dispatch should be suppressed by cooldown.
  // Stores the new ts when not suppressed (so next call within window
  // is suppressed). Cooldown is keyed by (userId, eventId) — same
  // event firing twice for the same user dedups; same event for two
  // users still dispatches to both.
  private async checkAndSetCooldown(rule: NotificationRule, event: ActivityShape): Promise<boolean> {
    const cd = rule.cooldownSeconds ?? 0;
    if (cd <= 0) return false;
    const key = cooldownKey(rule.userId, event.id);
    const last = await this.storage.get<number>(key);
    const t = now();
    if (last && t - last < cd * 1000) return true;
    await this.storage.set(key, t);
    return false;
  }
}
