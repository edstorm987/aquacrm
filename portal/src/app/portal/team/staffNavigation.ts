import { isStaffWorkspacePagePath } from "@/lib/staffWorkspacePolicy";

export type StaffNavigationStation = {
  id: string;
  label: string;
  href: string;
};

export type StaffNavigationAccess = {
  stationId: string;
  mode: "view" | "edit";
  order: number;
};

export type StaffSurfacePanelId =
  | "staff-command"
  | "staff-inbox-actions"
  | "staff-operations"
  | "staff-tools";

export type StaffNavigationItem = {
  id: string;
  label: string;
  href: string;
  panelId: StaffSurfacePanelId;
  order: number;
  badge?: "View";
};

export type StaffNavigationPanel = {
  id: StaffSurfacePanelId;
  label: string;
  order: number;
  items: StaffNavigationItem[];
};

const STAFF_SURFACES: ReadonlyArray<{
  id: StaffSurfacePanelId;
  label: string;
  order: number;
}> = [
  { id: "staff-command", label: "Command", order: 0 },
  { id: "staff-inbox-actions", label: "Inbox & actions", order: 10 },
  { id: "staff-operations", label: "Operations", order: 20 },
  { id: "staff-tools", label: "Tools", order: 30 },
];

const STAFF_SURFACE_BY_STATION: Readonly<Record<string, StaffSurfacePanelId>> = {
  "my-day": "staff-command",
  actions: "staff-inbox-actions",
  chat: "staff-inbox-actions",
  calendar: "staff-operations",
  onboarding: "staff-operations",
  leave: "staff-operations",
  training: "staff-operations",
  pay: "staff-operations",
  notes: "staff-tools",
  progression: "staff-tools",
};

const FALLBACK_SURFACE: StaffSurfacePanelId = "staff-tools";

/**
 * Present the already-authorised staff stations as clear workspace surfaces.
 * This function does not decide access: its input is the canonical projection
 * returned by staffStationAccessEntries. Unknown future stations fall back to
 * Tools so an allowed destination is never lost to a stale presentation map.
 */
export function buildStaffNavigationPanels(
  stations: readonly StaffNavigationStation[],
  access: readonly StaffNavigationAccess[],
): StaffNavigationPanel[] {
  const stationById = new Map(stations.map(station => [station.id, station]));
  const itemsByPanel = new Map<StaffSurfacePanelId, StaffNavigationItem[]>(
    STAFF_SURFACES.map(surface => [surface.id, []]),
  );

  for (const entry of access) {
    const station = stationById.get(entry.stationId);
    if (!station || !isStaffWorkspacePagePath(station.href)) continue;
    const panelId = STAFF_SURFACE_BY_STATION[entry.stationId] ?? FALLBACK_SURFACE;
    itemsByPanel.get(panelId)!.push({
      id: station.id,
      label: station.label,
      href: station.href,
      panelId,
      order: entry.order,
      ...(entry.mode === "view" ? { badge: "View" as const } : {}),
    });
  }

  return STAFF_SURFACES.flatMap(surface => {
    const items = itemsByPanel.get(surface.id)!
      .slice()
      .sort((left, right) => left.order - right.order);
    return items.length ? [{ ...surface, items }] : [];
  });
}
