import type { ServerCommandStation } from "./commandStationRouting";

export type ServerStationLocalView = {
  activeStation: "executive" | "day" | "battle" | "devteam" | "intelligence" | "radar";
  dashboardMode: "radar" | "workspace" | "inspector" | "day" | "calendar" | "actions" | "advisor" | "intelligence" | "battle";
};

export type PendingServerStationNavigation = {
  target: ServerCommandStation;
  previous: ServerStationLocalView;
};

export function pendingServerStationView(target: ServerCommandStation): ServerStationLocalView {
  if (target === "executive") return { activeStation: "executive", dashboardMode: "radar" };
  if (target === "battle") return { activeStation: "battle", dashboardMode: "battle" };
  if (target === "devteam") return { activeStation: "devteam", dashboardMode: "radar" };
  if (target === "advisor") return { activeStation: "radar", dashboardMode: "advisor" };
  return { activeStation: "day", dashboardMode: target };
}

/** One in-flight RSC station navigation owns the controls until it settles. */
export function beginServerStationNavigation(
  current: PendingServerStationNavigation | null,
  target: ServerCommandStation,
  previous: ServerStationLocalView,
): PendingServerStationNavigation {
  return current ?? { target, previous };
}

/** A matching resolved query committed successfully; a mismatch restores the old local view. */
export function serverStationSettlementFallback(
  pending: PendingServerStationNavigation,
  resolvedStation: ServerCommandStation | null,
): ServerStationLocalView | null {
  return resolvedStation === pending.target ? null : pending.previous;
}
