// Server component that resolves the current `Site` from a clientId.
// Round-1: a thin wrapper — the foundation passes the client ID in via
// props. Round-2 plugin adds host-based custom-domain resolution.
//
// Faithful port from `02/src/components/SiteResolver.tsx` minus the
// host-matching branch (custom-domain support is deferred).

import type { ReactNode } from "react";
import type { Site } from "../../types/site";

export interface SiteResolverProps {
  site: Site | null;
  fallback?: ReactNode;
  children: (site: Site) => ReactNode;
}

export function SiteResolver({ site, fallback, children }: SiteResolverProps) {
  if (!site) return <>{fallback ?? null}</>;
  return <>{children(site)}</>;
}
