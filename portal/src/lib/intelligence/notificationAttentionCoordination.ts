import type { OperationalAlertAction, OperationalAlertView } from "@/lib/intelligence/operationalAttention";

export const NOTIFICATION_ACTIVATION_REFRESH_INTERVAL_MS = 3 * 60 * 1000;

export function notificationActivationRefreshDue(
  lastRefreshStartedAt: number,
  now: number,
  intervalMs = NOTIFICATION_ACTIVATION_REFRESH_INTERVAL_MS,
): boolean {
  return now - lastRefreshStartedAt >= intervalMs;
}

export interface NotificationRefreshToken {
  id: number;
  mutationGeneration: number;
}

export interface NotificationMutationToken {
  id: number;
  alertId: string;
  version: number;
}

interface PendingMutation {
  token: NotificationMutationToken;
  action: OperationalAlertAction;
  parkedUntil?: number;
}

interface AlertMutationState {
  baseAlert?: OperationalAlertView;
  baseIndex: number;
  pending: Map<number, PendingMutation>;
}

export interface NotificationCoordinationResult {
  applied: boolean;
  alerts: OperationalAlertView[];
  exposeFailure?: boolean;
}

/**
 * Owns request ordering without owning React state. Refreshes are accepted only
 * when they are still the newest refresh and no mutation began or settled while
 * they were in flight. Alert mutations are coordinated independently, so a
 * response for one alert never replaces another alert's newer local state.
 */
export class NotificationAttentionCoordinator {
  private nextRefreshId = 0;
  private latestRefreshId = 0;
  private mutationGeneration = 0;
  private nextMutationId = 0;
  private readonly nextAlertVersion = new Map<string, number>();
  private readonly alertStates = new Map<string, AlertMutationState>();
  private readonly mutations = new Map<number, PendingMutation>();

  beginRefresh(): NotificationRefreshToken {
    const id = ++this.nextRefreshId;
    this.latestRefreshId = id;
    return { id, mutationGeneration: this.mutationGeneration };
  }

  acceptRefresh(
    token: NotificationRefreshToken,
    current: OperationalAlertView[],
    serverAlerts: OperationalAlertView[],
  ): NotificationCoordinationResult {
    if (token.id !== this.latestRefreshId || token.mutationGeneration !== this.mutationGeneration) {
      return { applied: false, alerts: current };
    }

    return { applied: true, alerts: this.rebasePendingMutations(serverAlerts) };
  }

  beginMutation(
    current: OperationalAlertView[],
    alertId: string,
    action: OperationalAlertAction,
    parkedUntil?: number,
  ): { token: NotificationMutationToken; alerts: OperationalAlertView[] } {
    const version = (this.nextAlertVersion.get(alertId) ?? 0) + 1;
    this.nextAlertVersion.set(alertId, version);
    const token = { id: ++this.nextMutationId, alertId, version };
    const mutation = { token, action, parkedUntil };
    let state = this.alertStates.get(alertId);

    if (!state) {
      const baseIndex = current.findIndex(alert => alert.id === alertId);
      state = {
        baseAlert: baseIndex >= 0 ? current[baseIndex] : undefined,
        baseIndex: baseIndex >= 0 ? baseIndex : current.length,
        pending: new Map(),
      };
      this.alertStates.set(alertId, state);
    }

    state.pending.set(version, mutation);
    this.mutations.set(token.id, mutation);
    this.mutationGeneration += 1;
    return { token, alerts: this.applyAlertState(current, alertId, state) };
  }

  acceptMutation(
    token: NotificationMutationToken,
    current: OperationalAlertView[],
    serverAlerts: OperationalAlertView[],
  ): NotificationCoordinationResult {
    const mutation = this.mutations.get(token.id);
    if (!mutation) return { applied: false, alerts: current };

    const state = this.alertStates.get(token.alertId);
    if (!state || state.pending.get(token.version)?.token.id !== token.id) {
      this.mutations.delete(token.id);
      return { applied: false, alerts: current };
    }

    const serverIndex = serverAlerts.findIndex(alert => alert.id === token.alertId);
    state.baseAlert = serverIndex >= 0 ? serverAlerts[serverIndex] : undefined;
    if (serverIndex >= 0) state.baseIndex = serverIndex;

    for (const [version, pending] of state.pending) {
      if (version > token.version) continue;
      state.pending.delete(version);
      this.mutations.delete(pending.token.id);
    }

    this.mutationGeneration += 1;
    const alerts = this.applyAlertState(current, token.alertId, state);
    this.releaseEmptyState(token.alertId, state);
    return { applied: true, alerts };
  }

  rejectMutation(
    token: NotificationMutationToken,
    current: OperationalAlertView[],
  ): NotificationCoordinationResult {
    const mutation = this.mutations.get(token.id);
    if (!mutation) return { applied: false, alerts: current, exposeFailure: false };

    const state = this.alertStates.get(token.alertId);
    if (!state || state.pending.get(token.version)?.token.id !== token.id) {
      this.mutations.delete(token.id);
      return { applied: false, alerts: current, exposeFailure: false };
    }

    const exposeFailure = ![...state.pending.keys()].some(version => version > token.version);
    state.pending.delete(token.version);
    this.mutations.delete(token.id);
    this.mutationGeneration += 1;
    const alerts = this.applyAlertState(current, token.alertId, state);
    this.releaseEmptyState(token.alertId, state);
    return { applied: true, alerts, exposeFailure };
  }

  rebaseSnapshot(serverAlerts: OperationalAlertView[]): OperationalAlertView[] {
    this.latestRefreshId = ++this.nextRefreshId;
    this.mutationGeneration += 1;
    return this.rebasePendingMutations(serverAlerts);
  }

  reset(): void {
    this.latestRefreshId = ++this.nextRefreshId;
    this.mutationGeneration += 1;
    this.alertStates.clear();
    this.mutations.clear();
  }

  pendingAlertIds(): string[] {
    return [...this.alertStates]
      .filter(([, state]) => state.pending.size > 0)
      .map(([alertId]) => alertId);
  }

  private rebasePendingMutations(serverAlerts: OperationalAlertView[]): OperationalAlertView[] {
    let next = serverAlerts;
    for (const [alertId, state] of this.alertStates) {
      if (!state.pending.size) continue;
      const serverIndex = serverAlerts.findIndex(alert => alert.id === alertId);
      state.baseAlert = serverIndex >= 0 ? serverAlerts[serverIndex] : undefined;
      if (serverIndex >= 0) state.baseIndex = serverIndex;
      next = this.applyAlertState(next, alertId, state);
    }
    return next;
  }

  private applyAlertState(
    current: OperationalAlertView[],
    alertId: string,
    state: AlertMutationState,
  ): OperationalAlertView[] {
    let nextAlert = state.baseAlert;
    for (const pending of [...state.pending.values()].sort((left, right) => left.token.version - right.token.version)) {
      nextAlert = optimisticAlertValue(nextAlert, pending.action, pending.parkedUntil);
    }
    return replaceAlert(current, alertId, nextAlert, state.baseIndex);
  }

  private releaseEmptyState(alertId: string, state: AlertMutationState): void {
    if (!state.pending.size) this.alertStates.delete(alertId);
  }
}

export function optimisticAlertUpdate(
  alerts: OperationalAlertView[],
  alertId: string,
  action: OperationalAlertAction,
  parkedUntil?: number,
): OperationalAlertView[] {
  const index = alerts.findIndex(alert => alert.id === alertId);
  if (index < 0) return alerts;
  return replaceAlert(alerts, alertId, optimisticAlertValue(alerts[index], action, parkedUntil), index);
}

function optimisticAlertValue(
  alert: OperationalAlertView | undefined,
  action: OperationalAlertAction,
  parkedUntil?: number,
): OperationalAlertView | undefined {
  if (!alert || action === "dismiss") return undefined;
  if (action === "read") return { ...alert, state: "read", attention: false, parkedUntil: undefined };
  if (action === "unread") return { ...alert, state: "unread", attention: true, parkedUntil: undefined };
  return { ...alert, state: "parked", attention: false, parkedUntil };
}

function replaceAlert(
  alerts: OperationalAlertView[],
  alertId: string,
  replacement: OperationalAlertView | undefined,
  preferredIndex: number,
): OperationalAlertView[] {
  const currentIndex = alerts.findIndex(alert => alert.id === alertId);
  if (!replacement) return currentIndex < 0 ? alerts : alerts.filter(alert => alert.id !== alertId);
  if (currentIndex >= 0) return alerts.map((alert, index) => index === currentIndex ? replacement : alert);

  const index = Math.min(Math.max(0, preferredIndex), alerts.length);
  return [...alerts.slice(0, index), replacement, ...alerts.slice(index)];
}
