import "server-only";

import type {
  OperationalAlert,
  OperationalAlertAction,
  OperationalAlertView,
} from "@/lib/operationalAttention";
import { getState, mutate } from "@/server/storage";
import type { OperationalAlertPreference } from "@/server/types";

function preferenceKey(agencyId: string, userId: string, alertId: string): string {
  return `${agencyId}|${userId}|${alertId}`;
}

export function listOperationalAlertViews(
  agencyId: string,
  userId: string,
  alerts: OperationalAlert[],
  now = Date.now(),
): OperationalAlertView[] {
  const preferences = getState().operationalAlertPreferences;
  return alerts.flatMap<OperationalAlertView>(alert => {
    const preference = preferences[preferenceKey(agencyId, userId, alert.id)];
    const changed = Boolean(preference && alert.occurredAt > preference.alertOccurredAt);
    if (!preference || changed) return [{ ...alert, state: "unread" as const, attention: true }];
    if (preference.state === "dismissed") {
      return alert.persistentUntilResolved
        ? [{ ...alert, state: "read" as const, attention: false }]
        : [];
    }
    if (preference.state === "parked" && (preference.parkedUntil ?? 0) > now) {
      return [{ ...alert, state: "parked" as const, attention: false, parkedUntil: preference.parkedUntil }];
    }
    if (preference.state === "parked") return [{ ...alert, state: "unread" as const, attention: true }];
    return [{ ...alert, state: "read" as const, attention: false }];
  });
}

export function setOperationalAlertPreference({
  agencyId,
  userId,
  alert,
  action,
  parkedUntil,
  now = Date.now(),
}: {
  agencyId: string;
  userId: string;
  alert: OperationalAlert;
  action: OperationalAlertAction;
  parkedUntil?: number;
  now?: number;
}): void {
  const key = preferenceKey(agencyId, userId, alert.id);
  mutate(state => {
    if (action === "unread") {
      delete state.operationalAlertPreferences[key];
      return;
    }
    const preference: OperationalAlertPreference = {
      agencyId,
      userId,
      alertId: alert.id,
      state: action === "dismiss" ? "dismissed" : action === "park" ? "parked" : "read",
      alertOccurredAt: alert.occurredAt,
      updatedAt: now,
      ...(action === "park" && parkedUntil ? { parkedUntil } : {}),
    };
    state.operationalAlertPreferences[key] = preference;
  });
}
