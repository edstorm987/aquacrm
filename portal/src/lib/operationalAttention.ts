export type OperationalAlertSeverity = "critical" | "warning" | "notice";

export type OperationalAlertCategory =
  | "outage"
  | "support"
  | "money"
  | "meeting"
  | "client"
  | "marketing"
  | "task"
  | "compliance"
  | "contract"
  | "development";


export interface OperationalAlert {
  id: string;
  severity: OperationalAlertSeverity;
  category: OperationalAlertCategory;
  title: string;
  detail: string;
  href: string;
  persistentUntilResolved?: boolean;
  clientId?: string;
  clientName?: string;
  occurredAt: number;
}

export type OperationalAlertViewState = "unread" | "read" | "parked";

export interface OperationalAlertView extends OperationalAlert {
  state: OperationalAlertViewState;
  attention: boolean;
  parkedUntil?: number;
}

export type OperationalAlertAction = "read" | "unread" | "park" | "dismiss";

const CATEGORY_DESTINATION: Record<OperationalAlertCategory, string> = {
  task: "actions",
  support: "inbox",
  meeting: "pipelines",
  client: "pipelines",
  outage: "fulfilment",
  development: "fulfilment",
  marketing: "marketing",
  money: "finance",
  compliance: "finance",
  contract: "finance",
};

export function destinationForOperationalAlert(alert: OperationalAlert): string {
  const href = alert.href;
  if (href.startsWith("/portal/agency/actions")) return "actions";
  if (href.startsWith("/portal/agency/inbox")) return "inbox";
  if (href.startsWith("/portal/agency/marketing") || href.includes("tab=marketing")) return "marketing";
  if (href.startsWith("/portal/agency/fulfilment") || href.startsWith("/portal/agency/portals") || href.startsWith("/portal/agency/development") || href.startsWith("/portal/agency/performance") || href.includes("tab=fulfilment") || href.includes("tab=delivery") || href.includes("tab=portal") || href.includes("tab=systems") || href.includes("tab=properties")) return "fulfilment";
  if (href.startsWith("/portal/agency/pipelines") || href.startsWith("/portal/clients?")) return "pipelines";
  if (href.startsWith("/portal/agency/agency-finance") || href.includes("tab=finance")) return "finance";
  if (href.startsWith("/portal/agency/people")) return "people";
  return CATEGORY_DESTINATION[alert.category];
}

export function operationalAlertMatchesHref(alert: OperationalAlert, targetHref: string): boolean {
  const alertUrl = new URL(alert.href, "https://aquacrm.local");
  const targetUrl = new URL(targetHref, "https://aquacrm.local");
  if (alertUrl.pathname !== targetUrl.pathname) return false;

  return operationalAlertQueryMatches(alertUrl, targetUrl);
}

export function operationalAlertMatchesHrefPrefix(alert: OperationalAlert, targetHref: string): boolean {
  const alertUrl = new URL(alert.href, "https://aquacrm.local");
  const targetUrl = new URL(targetHref, "https://aquacrm.local");
  if (alertUrl.pathname !== targetUrl.pathname && !alertUrl.pathname.startsWith(`${targetUrl.pathname}/`)) return false;

  return operationalAlertQueryMatches(alertUrl, targetUrl);
}

export function operationalAlertBelongsToClient(alert: OperationalAlert, clientId: string): boolean {
  if (alert.clientId) return alert.clientId === clientId;
  const alertUrl = new URL(alert.href, "https://aquacrm.local");
  const routeMatch = alertUrl.pathname.match(/^\/portal\/clients\/([^/]+)/);
  if (routeMatch?.[1]) {
    try {
      return decodeURIComponent(routeMatch[1]) === clientId;
    } catch {
      return routeMatch[1] === clientId;
    }
  }
  return alert.id.split(":").includes(clientId);
}

function operationalAlertQueryMatches(alertUrl: URL, targetUrl: URL): boolean {
  for (const [key, value] of targetUrl.searchParams) {
    if (alertUrl.searchParams.get(key) !== value) return false;
  }
  if (targetUrl.hash && alertUrl.hash !== targetUrl.hash) return false;
  return true;
}
