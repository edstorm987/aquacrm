import {
  destinationForOperationalAlert,
  type OperationalAlertView,
} from "@/lib/operationalAttention";

export type AttentionLoadLevel = "clear" | "steady" | "elevated" | "overload";

export type AttentionReserveGroup = {
  key: string;
  count: number;
};

export type ProtectedAttentionWindow<T> = {
  level: AttentionLoadLevel;
  protected: boolean;
  total: number;
  focusLimit: number;
  focus: T[];
  reserve: T[];
  reserveCount: number;
  reserveGroups: AttentionReserveGroup[];
};

export type OperationalAttentionReserveGroup = AttentionReserveGroup & {
  label: string;
  href: string;
};

export type OperationalAttentionWindow = ProtectedAttentionWindow<OperationalAlertView> & {
  criticalTotal: number;
  warningTotal: number;
  reserveDestinations: OperationalAttentionReserveGroup[];
};

export const ATTENTION_PROTECTION_STORAGE_KEY = "aqua-attention-protection";
export const ATTENTION_PROTECTION_EVENT = "aqua-attention-protection:change";

const DESTINATION_LABELS: Record<string, string> = {
  actions: "Actions",
  inbox: "Master inbox",
  pipelines: "Journey",
  fulfilment: "Fulfilment",
  marketing: "Marketing",
  finance: "Finance",
  people: "Staff",
};

/**
 * How far repeatedly-deferred work is promoted up the queue.
 *
 * The shield caps the focus window, which is what makes it useful — but it
 * also means a job put off ten times can sit in the reserve forever, never
 * surfacing precisely because it keeps being pushed back. "You keep swerving
 * this" is a reason to look at something, not a reason to hide it.
 *
 * Exactly one tier, never more. Deferring a job does not make it more
 * important than a live outage, and letting the count climb without limit
 * would let stale annoyances outrank genuine emergencies. One tier is enough
 * to break out of the reserve without reordering the top of the queue.
 */
export const DEFERRALS_BEFORE_PROMOTION = 3;

export function promoteForDeferrals(rank: number, deferrals?: number): number {
  if ((deferrals ?? 0) < DEFERRALS_BEFORE_PROMOTION) return rank;
  return Math.max(0, rank - 1);
}

export function buildProtectedAttentionWindow<T>(items: readonly T[], options: {
  groupKey: (item: T) => string;
  urgencyRank: (item: T) => number;
  focusLimit?: number;
  protectionThreshold?: number;
  enabled?: boolean;
}): ProtectedAttentionWindow<T> {
  const focusLimit = Math.max(1, Math.round(options.focusLimit ?? 5));
  const protectionThreshold = Math.max(focusLimit + 1, Math.round(options.protectionThreshold ?? 8));
  const ranked = items
    .map((item, index) => ({ item, index, group: options.groupKey(item), urgency: options.urgencyRank(item) }))
    .sort((left, right) => left.urgency - right.urgency || left.index - right.index);
  const total = ranked.length;
  const level: AttentionLoadLevel = total === 0 ? "clear" : total >= 12 ? "overload" : total >= protectionThreshold ? "elevated" : "steady";
  const protectedMode = options.enabled !== false && total >= protectionThreshold;

  if (!protectedMode) {
    return {
      level,
      protected: false,
      total,
      focusLimit,
      focus: ranked.map(row => row.item),
      reserve: [],
      reserveCount: 0,
      reserveGroups: [],
    };
  }

  const selected = new Set<number>();
  const selectedGroups = new Set<string>();
  const urgencyTiers = [...new Set(ranked.map(row => row.urgency))].sort((left, right) => left - right);

  for (const urgency of urgencyTiers) {
    const tier = ranked.filter(row => row.urgency === urgency);
    for (const row of tier) {
      if (selected.size >= focusLimit) break;
      if (selectedGroups.has(row.group)) continue;
      selected.add(row.index);
      selectedGroups.add(row.group);
    }
    for (const row of tier) {
      if (selected.size >= focusLimit) break;
      selected.add(row.index);
    }
    if (selected.size >= focusLimit) break;
  }

  const focus = ranked.filter(row => selected.has(row.index)).map(row => row.item);
  const reserveRows = ranked.filter(row => !selected.has(row.index));
  const reserveGroups = [...reserveRows.reduce((groups, row) => {
    groups.set(row.group, (groups.get(row.group) ?? 0) + 1);
    return groups;
  }, new Map<string, number>())]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));

  return {
    level,
    protected: true,
    total,
    focusLimit,
    focus,
    reserve: reserveRows.map(row => row.item),
    reserveCount: reserveRows.length,
    reserveGroups,
  };
}

export function attentionProtectionEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ATTENTION_PROTECTION_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setAttentionProtectionEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ATTENTION_PROTECTION_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* The live page can still honour the preference when storage is unavailable. */
  }
  document.documentElement.dataset.attentionProtection = String(enabled);
  window.dispatchEvent(new CustomEvent(ATTENTION_PROTECTION_EVENT, { detail: { enabled } }));
}

export function buildOperationalAttentionWindow(alerts: readonly OperationalAlertView[], options: { enabled?: boolean } = {}): OperationalAttentionWindow {
  const eligible = alerts.filter(alert => alert.state !== "parked" && (alert.attention || alert.persistentUntilResolved));
  const window = buildProtectedAttentionWindow(eligible, {
    groupKey: destinationForOperationalAlert,
    urgencyRank: alert => promoteForDeferrals(
      alert.severity === "critical" ? 0 : alert.severity === "warning" ? 1 : 2,
      alert.deferrals,
    ),
    enabled: options.enabled,
  });
  const reserveDestinations = window.reserveGroups.map(group => {
    const representative = window.reserve.find(alert => destinationForOperationalAlert(alert) === group.key);
    return {
      ...group,
      label: DESTINATION_LABELS[group.key] ?? titleCase(group.key),
      href: representative?.href ?? "/portal/agency",
    };
  });
  return {
    ...window,
    criticalTotal: eligible.filter(alert => alert.severity === "critical").length,
    warningTotal: eligible.filter(alert => alert.severity === "warning").length,
    reserveDestinations,
  };
}

function titleCase(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, character => character.toUpperCase());
}
