export function clientWorkspaceRouteId(pathname: string): string | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const match = normalized.match(/^\/portal\/clients\/([^/]+)(?:\/.*)?$/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
