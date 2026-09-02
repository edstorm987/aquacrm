"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  destinationForOperationalAlert,
  operationalAlertBelongsToClient,
  operationalAlertMatchesHref,
  operationalAlertMatchesHrefPrefix,
  type OperationalAlertAction,
  type OperationalAlertCategory,
  type OperationalAlertView,
} from "@/lib/intelligence/operationalAttention";
import {
  ATTENTION_PROTECTION_EVENT,
  ATTENTION_PROTECTION_STORAGE_KEY,
  attentionProtectionEnabled,
  buildOperationalAttentionWindow,
  setAttentionProtectionEnabled,
  type OperationalAttentionWindow,
} from "@/lib/intelligence/attentionProtection";
import {
  NOTIFICATION_ACTIVATION_REFRESH_INTERVAL_MS,
  NotificationAttentionCoordinator,
  notificationActivationRefreshDue,
} from "@/lib/intelligence/notificationAttentionCoordination";

interface AttentionContextValue {
  alerts: OperationalAlertView[];
  attentionWindow: OperationalAttentionWindow;
  focusProtectionEnabled: boolean;
  isAlertBusy: (alertId: string) => boolean;
  error: string;
  setFocusProtectionEnabled: (enabled: boolean) => void;
  refreshAlerts: () => Promise<boolean>;
  updateAlert: (alertId: string, action: OperationalAlertAction, parkedUntil?: number) => Promise<boolean>;
}

const AttentionContext = createContext<AttentionContextValue | null>(null);

export function NotificationAttentionProvider({
  initialAlerts,
  children,
  clientId,
  enabled = true,
}: {
  initialAlerts: OperationalAlertView[];
  children: ReactNode;
  clientId?: string;
  enabled?: boolean;
}) {
  const scopeAlerts = useCallback(
    (items: OperationalAlertView[]) => clientId
      ? items.filter(alert => operationalAlertBelongsToClient(alert, clientId))
      : items,
    [clientId],
  );
  const [alerts, setAlerts] = useState(() => scopeAlerts(initialAlerts));
  const alertsRef = useRef(alerts);
  const coordinatorRef = useRef(new NotificationAttentionCoordinator());
  const clientScopeRef = useRef(clientId);
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);
  const lastRefreshStartedAtRef = useRef(Date.now());
  const [focusProtectionEnabled, setFocusProtectionState] = useState(true);
  const [busyAlertIds, setBusyAlertIds] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState("");
  const attentionWindow = useMemo(
    () => buildOperationalAttentionWindow(alerts, { enabled: focusProtectionEnabled }),
    [alerts, focusProtectionEnabled],
  );

  const commitAlerts = useCallback((next: OperationalAlertView[]) => {
    alertsRef.current = next;
    setAlerts(next);
  }, []);

  const syncBusyAlerts = useCallback(() => {
    setBusyAlertIds(new Set(coordinatorRef.current.pendingAlertIds()));
  }, []);

  useEffect(() => {
    const scopedAlerts = scopeAlerts(initialAlerts);
    lastRefreshStartedAtRef.current = Date.now();
    if (clientScopeRef.current !== clientId) {
      coordinatorRef.current.reset();
      clientScopeRef.current = clientId;
      commitAlerts(scopedAlerts);
      syncBusyAlerts();
      return;
    }
    commitAlerts(coordinatorRef.current.rebaseSnapshot(scopedAlerts));
    syncBusyAlerts();
  }, [clientId, commitAlerts, initialAlerts, scopeAlerts, syncBusyAlerts]);

  useEffect(() => {
    const sync = () => setFocusProtectionState(attentionProtectionEnabled());
    const syncCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      setFocusProtectionState(typeof detail?.enabled === "boolean" ? detail.enabled : attentionProtectionEnabled());
    };
    const syncStorage = (event: StorageEvent) => {
      if (event.key === ATTENTION_PROTECTION_STORAGE_KEY) sync();
    };
    sync();
    window.addEventListener(ATTENTION_PROTECTION_EVENT, syncCustom);
    window.addEventListener("storage", syncStorage);
    return () => {
      window.removeEventListener(ATTENTION_PROTECTION_EVENT, syncCustom);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  const setFocusProtectionEnabled = useCallback((enabled: boolean) => {
    setFocusProtectionState(enabled);
    setAttentionProtectionEnabled(enabled);
  }, []);

  const refreshAlerts = useCallback((): Promise<boolean> => {
    if (!enabled) return Promise.resolve(false);
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    lastRefreshStartedAtRef.current = Date.now();
    const coordinator = coordinatorRef.current;
    const token = coordinator.beginRefresh();
    const request = (async () => {
      const response = await fetch("/api/portal/notifications", { method: "GET", cache: "no-store" }).catch(() => null);
      if (!response?.ok) return false;
      const payload = await response.json().catch(() => null) as { alerts?: OperationalAlertView[] } | null;
      if (!payload?.alerts) return false;
      const result = coordinator.acceptRefresh(token, alertsRef.current, scopeAlerts(payload.alerts));
      if (coordinator === coordinatorRef.current && result.applied) commitAlerts(result.alerts);
      return true;
    })();
    const trackedRequest = request.finally(() => {
      if (refreshInFlightRef.current === trackedRequest) refreshInFlightRef.current = null;
    });
    refreshInFlightRef.current = trackedRequest;
    return trackedRequest;
  }, [commitAlerts, enabled, scopeAlerts]);

  useEffect(() => {
    const refreshWhenStaleAndActive = () => {
      const now = Date.now();
      if (!document.hidden && notificationActivationRefreshDue(lastRefreshStartedAtRef.current, now)) {
        void refreshAlerts();
      }
    };
    const interval = window.setInterval(refreshWhenStaleAndActive, NOTIFICATION_ACTIVATION_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshWhenStaleAndActive);
    document.addEventListener("visibilitychange", refreshWhenStaleAndActive);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenStaleAndActive);
      document.removeEventListener("visibilitychange", refreshWhenStaleAndActive);
    };
  }, [refreshAlerts]);

  useEffect(() => {
    const parkedUntil = alerts
      .filter(alert => alert.state === "parked" && alert.parkedUntil)
      .map(alert => alert.parkedUntil as number)
      .sort((a, b) => a - b)[0];
    if (!parkedUntil) return;
    const timer = window.setTimeout(() => void refreshAlerts(), Math.min(Math.max(1_000, parkedUntil - Date.now() + 500), 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [alerts, refreshAlerts]);

  async function updateAlert(alertId: string, action: OperationalAlertAction, parkedUntil?: number): Promise<boolean> {
    if (!enabled) return false;
    const coordinator = coordinatorRef.current;
    const mutation = coordinator.beginMutation(alertsRef.current, alertId, action, parkedUntil);
    setError("");
    commitAlerts(mutation.alerts);
    syncBusyAlerts();
    try {
      const response = await fetch("/api/portal/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ alertId, action, parkedUntil }),
      });
      const payload = await response.json().catch(() => null) as { alerts?: OperationalAlertView[]; error?: string } | null;
      if (!response.ok || !payload?.alerts) throw new Error(payload?.error || "The notification could not be updated.");
      const result = coordinator.acceptMutation(mutation.token, alertsRef.current, scopeAlerts(payload.alerts));
      if (coordinator === coordinatorRef.current && result.applied) commitAlerts(result.alerts);
      return true;
    } catch (cause) {
      const result = coordinator.rejectMutation(mutation.token, alertsRef.current);
      if (coordinator === coordinatorRef.current && result.applied) commitAlerts(result.alerts);
      if (coordinator === coordinatorRef.current && result.exposeFailure) {
        setError(cause instanceof Error ? cause.message : "The notification could not be updated.");
      }
      return false;
    } finally {
      if (coordinator === coordinatorRef.current) syncBusyAlerts();
    }
  }

  const isAlertBusy = useCallback((alertId: string) => busyAlertIds.has(alertId), [busyAlertIds]);

  const value = useMemo(() => ({
    alerts,
    attentionWindow,
    focusProtectionEnabled,
    isAlertBusy,
    error,
    setFocusProtectionEnabled,
    refreshAlerts,
    updateAlert,
  }), [alerts, attentionWindow, focusProtectionEnabled, isAlertBusy, error, setFocusProtectionEnabled, refreshAlerts]);
  return <AttentionContext.Provider value={value}>{children}</AttentionContext.Provider>;
}

export function useNotificationAttention(): AttentionContextValue | null {
  return useContext(AttentionContext);
}

export function useAttentionMatches({
  hrefs = [],
  prefixHrefs = [],
  categories = [],
  clientCategories = [],
  destinations = [],
  clientId,
  allForClient = false,
  navId,
  all = false,
  pool = "focus",
}: {
  hrefs?: string[];
  prefixHrefs?: string[];
  categories?: OperationalAlertCategory[];
  clientCategories?: OperationalAlertCategory[];
  /**
   * Roll up several alert destinations onto one row: match if the alert's
   * destination is in this set. Used by the single "Operations" row to
   * aggregate the badges of its collapsed functions (finance/fulfilment/…).
   */
  destinations?: string[];
  clientId?: string;
  allForClient?: boolean;
  navId?: string;
  all?: boolean;
  pool?: "focus" | "reserve" | "all";
}): OperationalAlertView[] {
  const context = useNotificationAttention();
  const destinationsKey = destinations.join(",");
  return useMemo(() => {
    const live = !context ? [] : pool === "focus"
      ? context.attentionWindow.focus
      : pool === "reserve"
        ? context.attentionWindow.reserve
        : [...context.attentionWindow.focus, ...context.attentionWindow.reserve];
    if (all) return live;
    return live.filter(alert => {
      const belongsToClient = clientId ? operationalAlertBelongsToClient(alert, clientId) : false;
      if (allForClient && belongsToClient) return true;
      if (belongsToClient && clientCategories.includes(alert.category)) return true;
      if (navId && destinationForOperationalAlert(alert) === navId) {
        return navId.startsWith("client-") ? belongsToClient : true;
      }
      if (destinations.length && destinations.includes(destinationForOperationalAlert(alert))) return true;
      if (navId?.startsWith("client-") && hrefs.some(href => operationalAlertMatchesHref(alert, href))) return true;
      if (categories.includes(alert.category)) return true;
      return hrefs.some(href => operationalAlertMatchesHref(alert, href))
        || prefixHrefs.some(href => operationalAlertMatchesHrefPrefix(alert, href));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, allForClient, categories, clientCategories, clientId, context, hrefs, navId, pool, prefixHrefs, destinationsKey]);
}

export function useUnresolvedAttentionMatches({
  navId,
  clientId,
}: {
  navId: string;
  clientId?: string;
}): OperationalAlertView[] {
  const context = useNotificationAttention();
  return useMemo(() => {
    if (!context) return [];
    return context.attentionWindow.focus.filter(alert =>
      alert.persistentUntilResolved
      && alert.state !== "parked"
      && destinationForOperationalAlert(alert) === navId
      && (!clientId || operationalAlertBelongsToClient(alert, clientId))
    );
  }, [clientId, context, navId]);
}

export function AttentionDot({
  href,
  hrefs,
  prefixHref,
  prefixHrefs,
  categories,
  all,
  className = "",
}: {
  href?: string;
  hrefs?: string[];
  prefixHref?: string;
  prefixHrefs?: string[];
  categories?: OperationalAlertCategory[];
  all?: boolean;
  className?: string;
}) {
  const targets = useMemo(() => hrefs ?? (href ? [href] : []), [href, hrefs]);
  const prefixTargets = useMemo(() => prefixHrefs ?? (prefixHref ? [prefixHref] : []), [prefixHref, prefixHrefs]);
  const matches = useAttentionMatches({ hrefs: targets, prefixHrefs: prefixTargets, categories, all });
  if (!matches.length) return null;
  const title = attentionTitle(matches);
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={`inline-flex size-2.5 shrink-0 rounded-full bg-red-600 ring-2 ring-white ${className}`}
    />
  );
}

export function attentionTitle(alerts: OperationalAlertView[]): string {
  const lines = alerts.slice(0, 5).map(alert => `• ${alert.title}`);
  if (alerts.length > 5) lines.push(`• ${alerts.length - 5} more`);
  return `${alerts.length} ${alerts.length === 1 ? "item needs" : "items need"} attention\n${lines.join("\n")}`;
}
