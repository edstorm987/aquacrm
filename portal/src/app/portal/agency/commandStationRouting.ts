export type ServerCommandStation = "executive" | "battle" | "calendar" | "actions" | "advisor" | "devteam";

type SearchParamValue = string | string[] | null | undefined;

/**
 * Only these stations need a server-rendered workspace. Dev Team remains
 * founder-gated even when somebody hand-types its query parameter.
 */
export function resolveServerCommandStation(
  value: SearchParamValue,
  devTeamVisible = false,
): ServerCommandStation | null {
  const station = Array.isArray(value) ? value[0] : value;
  // `omega` is the original bookmarked name for the Executive station. Keep
  // resolving it server-side so the client never selects Executive without
  // receiving its lazily constructed workspace.
  if (station === "omega") return "executive";
  if (station === "executive" || station === "battle" || station === "calendar" || station === "actions" || station === "advisor") return station;
  if (station === "devteam") return devTeamVisible ? station : null;
  return null;
}

/** Preserve every unrelated query parameter while selecting or clearing the
 * one server-backed station. */
export function serverCommandStationHref(
  pathname: string,
  currentQuery: string,
  station: ServerCommandStation | null,
  scanResultHandle?: string | null,
): string {
  const params = new URLSearchParams(currentQuery);
  // Legacy `scan=1` bookmarks are inert and stripped. A completed Radar + KPI
  // payload crosses RSC station moves only through the bounded server-issued
  // handle; GET navigation has no execution path to replay.
  params.delete("scan");
  if (scanResultHandle === null) params.delete("scanResult");
  else if (scanResultHandle) params.set("scanResult", scanResultHandle);
  if (station) params.set("station", station);
  else params.delete("station");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
