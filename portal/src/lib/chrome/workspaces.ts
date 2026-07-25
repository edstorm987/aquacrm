// Workspaces — Ed's "custom sidebar" concept. Each workspace is a
// mode the operator switches into: the sidebar narrows to the panels
// that belong to that workspace, the theme tints to match, and a Back
// row sits at the top of the sidebar. Persists in localStorage under
// `mm-active-workspace`. The active value is mirrored as a
// `data-workspace="<id>"` attribute on the sidebar <aside>, which CSS
// rules in globals.css consume to hide non-matching panels and
// override `--brand-primary`.

export const WORKSPACE_STORAGE_KEY = "mm-active-workspace";

export interface WorkspaceConfig {
  id: string;
  label: string;
  /** Aqua-tinted brand color applied when this workspace is active. */
  color: string;
  /** Panel IDs that belong to this workspace (from sidebarLayout). */
  panels: string[];
  /** Whether to keep the AgencyToolsBallpark "Aqua HQ" + "More tools" extra rendered. */
  extra?: boolean;
  /** Short hint shown on the tile. */
  hint: string;
  /** Workspace dashboard route — picking the tile lands the operator here. */
  dashboardHref: string;
}

// Milesymedia scope: only Aqua HQ. Finance / Marketing / Operations
// workspaces and their dashboards have been parked in _attic/ for later.
export const WORKSPACES: WorkspaceConfig[] = [
  {
    id: "aqua-hq",
    label: "Aqua HQ",
    color: "#0EA5A4",
    panels: ["main", "fulfillment"],
    extra: true,
    hint: "Command — pipelines, inbox, SOPs.",
    dashboardHref: "/portal/agency",
  },
];

export function findWorkspace(id: string | null | undefined): WorkspaceConfig | null {
  if (!id) return null;
  return WORKSPACES.find(w => w.id === id) ?? null;
}
