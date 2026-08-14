"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  destinationForOperationalAlert,
  operationalAlertMatchesHref,
  operationalAlertMatchesHrefPrefix,
  type OperationalAlertAction,
  type OperationalAlertCategory,
  type OperationalAlertView,
} from "@/lib/operationalAttention";

interface AttentionContextValue {
  alerts: OperationalAlertView[];
  busyAlertId: string | null;
  error: string;
  refreshAlerts: () => Promise<boolean>;
  updateAlert: (alertId: string, action: OperationalAlertAction, parkedUntil?: number) => Promise<boolean>;
}

const AttentionContext = createContext<AttentionContextValue | null>(null);

export function NotificationAttentionProvider({ initialAlerts, children }: { initialAlerts: OperationalAlertView[]; children: ReactNode }) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => setAlerts(initialAlerts), [initialAlerts]);

  const refreshAlerts = useCallback(async (): Promise<boolean> => {
    const response = await fetch("/api/portal/notifications", { method: "GET", cache: "no-store" }).catch(() => null);
    if (!response?.ok) return false;
    const payload = await response.json().catch(() => null) as { alerts?: OperationalAlertView[] } | null;
    if (!payload?.alerts) return false;
    setAlerts(payload.alerts);
    return true;
  }, []);

  useEffect(() => {
    const refreshWhenActive = () => {
      if (!document.hidden) void refreshAlerts();
    };
    const interval = window.setInterval(refreshWhenActive, 30_000);
    window.addEventListener("focus", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
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
    const previous = alerts;
    setBusyAlertId(alertId);
    setError("");
    setAlerts(current => optimisticAlertUpdate(current, alertId, action, parkedUntil));
    try {
      const response = await fetch("/api/portal/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ alertId, action, parkedUntil }),
      });
      const payload = await response.json().catch(() => null) as { alerts?: OperationalAlertView[]; error?: string } | null;
      if (!response.ok || !payload?.alerts) throw new Error(payload?.error || "The notification could not be updated.");
      setAlerts(payload.alerts);
      return true;
    } catch (cause) {
      setAlerts(previous);
      setError(cause instanceof Error ? cause.message : "The notification could not be updated.");
      return false;
    } finally {
      setBusyAlertId(null);
    }
  }

  const value = useMemo(() => ({ alerts, busyAlertId, error, refreshAlerts, updateAlert }), [alerts, busyAlertId, error, refreshAlerts]);
  return <AttentionContext.Provider value={value}>{children}</AttentionContext.Provider>;
}

export function useNotificationAttention(): AttentionContextValue | null {
  return useContext(AttentionContext);
}

export function useAttentionMatches({
  hrefs = [],
  prefixHrefs = [],
  categories = [],
  navId,
  all = false,
}: {
  hrefs?: string[];
  prefixHrefs?: string[];
  categories?: OperationalAlertCategory[];
  navId?: string;
  all?: boolean;
}): OperationalAlertView[] {
  const context = useNotificationAttention();
  return useMemo(() => {
    const live = context?.alerts.filter(alert => alert.attention) ?? [];
    if (all) return live;
    return live.filter(alert => {
      if (navId && destinationForOperationalAlert(alert) === navId) return true;
      if (navId?.startsWith("client-") && hrefs.some(href => operationalAlertMatchesHref(alert, href))) return true;
      if (categories.includes(alert.category)) return true;
      return hrefs.some(href => operationalAlertMatchesHref(alert, href))
        || prefixHrefs.some(href => operationalAlertMatchesHrefPrefix(alert, href));
    });
  }, [all, categories, context?.alerts, hrefs, navId, prefixHrefs]);
}

export function useUnresolvedAttentionMatches({ navId }: { navId: string }): OperationalAlertView[] {
  const context = useNotificationAttention();
  return useMemo(() => {
    if (!context) return [];
    return context.alerts.filter(alert =>
      alert.persistentUntilResolved
      && alert.state !== "parked"
      && destinationForOperationalAlert(alert) === navId
    );
  }, [context, navId]);
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

function optimisticAlertUpdate(
  alerts: OperationalAlertView[],
  alertId: string,
  action: OperationalAlertAction,
  parkedUntil?: number,
): OperationalAlertView[] {
  if (action === "dismiss") return alerts.filter(alert => alert.id !== alertId);
  return alerts.map(alert => {
    if (alert.id !== alertId) return alert;
    if (action === "read") return { ...alert, state: "read", attention: false, parkedUntil: undefined };
    if (action === "unread") return { ...alert, state: "unread", attention: true, parkedUntil: undefined };
    return { ...alert, state: "parked", attention: false, parkedUntil };
  });
}
