const COMMAND_CENTER_ROOT = "/portal/agency";
const COMMAND_CENTER_STATION_PATHS = [
  "/portal/agency/command-center",
  "/portal/agency/radar",
] as const;

export function isCommandCenterPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return normalized === COMMAND_CENTER_ROOT
    || COMMAND_CENTER_STATION_PATHS.some(path => normalized === path || normalized.startsWith(`${path}/`));
}
