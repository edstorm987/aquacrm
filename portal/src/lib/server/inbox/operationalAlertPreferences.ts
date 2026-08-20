import "server-only";

import type {
  OperationalAlert,
  OperationalAlertAction,
  OperationalAlertView,
} from "@/lib/intelligence/operationalAttention";
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
    // Deferral history survives the alert changing underneath. The job was put
    // off five times; a new figure on the same job does not reset that.
    const history = preference?.deferrals
      ? { deferrals: preference.deferrals, firstDeferredAt: preference.firstDeferredAt }
      : {};
    if (!preference || changed) return [{ ...alert, ...history, state: "unread" as const, attention: true }];
    if (preference.state === "dismissed") {
      return alert.persistentUntilResolved
        ? [{ ...alert, ...history, state: "read" as const, attention: false }]
        : [];
    }
    if (preference.state === "parked" && (preference.parkedUntil ?? 0) > now) {
      return [{ ...alert, ...history, state: "parked" as const, attention: false, parkedUntil: preference.parkedUntil }];
    }
    if (preference.state === "parked") return [{ ...alert, ...history, state: "unread" as const, attention: true }];
    return [{ ...alert, ...history, state: "read" as const, attention: false }];
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
    const existing = state.operationalAlertPreferences[key];
    // Counted on park only. Reading an item is not putting it off, and
    // dismissing it is a decision — neither should inflate the tally that
    // says "you keep avoiding this".
    const deferrals = (existing?.deferrals ?? 0) + (action === "park" ? 1 : 0);
    const preference: OperationalAlertPreference = {
      agencyId,
      userId,
      alertId: alert.id,
      state: action === "dismiss" ? "dismissed" : action === "park" ? "parked" : "read",
      alertOccurredAt: alert.occurredAt,
      updatedAt: now,
      ...(action === "park" && parkedUntil ? { parkedUntil } : {}),
      ...(deferrals ? { deferrals, firstDeferredAt: existing?.firstDeferredAt ?? now } : {}),
    };
    state.operationalAlertPreferences[key] = preference;
  });
}
