// Client-scope plugin route catch-all.
//
// Matches `/portal/clients/<clientId>/<rest>`. The parent
// `/portal/clients/[clientId]/layout.tsx` already painted the chrome with
// the client's brand kit and verified tenant-scope match. Here we only
// resolve the URL → plugin page and render it.

import { notFound } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRoleForClient } from "@/lib/server/auth";
import { ALL_ROLES } from "@/server/types";
import { resolveClientPluginPage } from "@/plugins/_routeResolver";
import { FOUNDATION_SERVICES } from "@/plugins/foundation-adapters";
import { pluginPageAllowedRoles } from "@/plugins/_types";
import type { PluginPageProps } from "@/plugins/_types";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

interface RouteProps {
  params: Promise<{ clientId: string; rest: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ClientPluginCatchAll({ params, searchParams }: RouteProps) {
  await ensureHydrated();
  const { clientId, rest } = await params;
  const session = await requireRoleForClient([...ALL_ROLES], clientId);
  const sp = await searchParams;

  const resolved = resolveClientPluginPage({
    agencyId: session.agencyId,
    clientId,
    rest,
  });
  if (!resolved) notFound();
  const { page, install, segments } = resolved;

  const allowed = pluginPageAllowedRoles(page);
  if (allowed && !allowed.includes(session.role)) notFound();

  const mod = await page.component();
  const Component = mod.default;
  const props: PluginPageProps = {
    agencyId: session.agencyId,
    clientId,
    install,
    segments,
    searchParams: sp,
    actor: session.userId,
    services: FOUNDATION_SERVICES,
    storage: makePluginStorage(install.id),
  };
  return (
    <ErrorBoundary label={`${install.pluginId}${page.path ? `/${page.path}` : ""}`}>
      <Component {...props} />
    </ErrorBoundary>
  );
}
