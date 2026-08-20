export const CLIENT_WORKSPACE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "relationship", label: "Relationship" },
  { id: "delivery", label: "Fulfilment" },
  { id: "marketing", label: "Social & ads" },
  { id: "systems", label: "Systems" },
  { id: "finance", label: "Finance" },
  { id: "communications", label: "Communications" },
  { id: "files", label: "Files" },
  { id: "portal", label: "Portal" },
  { id: "notes", label: "Record" },
] as const;

export type ClientWorkspaceTabId = (typeof CLIENT_WORKSPACE_TABS)[number]["id"];

export function clientWorkspaceDisplayName(client: { name: string; workspaceLabel?: string | null }): string {
  const workspaceLabel = client.workspaceLabel?.trim();
  return workspaceLabel ? `${client.name} · ${workspaceLabel}` : client.name;
}

const LEGACY_TAB_ALIASES: Record<string, ClientWorkspaceTabId> = {
  fulfilment: "delivery",
  kanban: "delivery",
  sops: "delivery",
  website: "systems",
  properties: "systems",
  tools: "systems",
  assets: "files",
};

const TAB_IDS = new Set<ClientWorkspaceTabId>(CLIENT_WORKSPACE_TABS.map(tab => tab.id));

export function resolveClientWorkspaceTab(value: string | undefined): ClientWorkspaceTabId {
  if (!value) return "overview";
  if (TAB_IDS.has(value as ClientWorkspaceTabId)) return value as ClientWorkspaceTabId;
  return LEGACY_TAB_ALIASES[value] ?? "overview";
}

export function clientWorkspaceHref(
  clientId: string,
  tab: ClientWorkspaceTabId,
  extra: Record<string, string | undefined> = {},
): string {
  const base = `/portal/clients/${encodeURIComponent(clientId)}`;
  const params = new URLSearchParams();
  if (tab !== "overview") params.set("tab", tab);
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
