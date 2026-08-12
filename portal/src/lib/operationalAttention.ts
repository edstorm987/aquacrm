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
  outage: "development",
  development: "development",
  marketing: "marketing",
  money: "finance",
  compliance: "finance",
  contract: "finance",
};

export function destinationForOperationalAlert(alert: OperationalAlert): string {
  const href = alert.href;
  if (href.startsWith("/portal/agency/actions")) return "actions";
  if (href.startsWith("/portal/agency/inbox")) return "inbox";
  if (href.startsWith("/portal/agency/fulfilment") || href.startsWith("/portal/agency/portals") || href.includes("tab=fulfilment")) return "fulfilment";
  if (href.startsWith("/portal/agency/pipelines") || href.startsWith("/portal/clients?")) return "pipelines";
  if (href.startsWith("/portal/agency/development") || href.includes("tab=systems") || href.includes("tab=properties")) return "development";
  if (href.startsWith("/portal/agency/marketing")) return "marketing";
  if (href.startsWith("/portal/agency/agency-finance") || href.includes("tab=finance")) return "finance";
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

function operationalAlertQueryMatches(alertUrl: URL, targetUrl: URL): boolean {
  for (const [key, value] of targetUrl.searchParams) {
    if (alertUrl.searchParams.get(key) !== value) return false;
  }
  if (targetUrl.hash && alertUrl.hash !== targetUrl.hash) return false;
  return true;
}
