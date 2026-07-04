// End-customer-scope plugin route catch-all.
//
// Matches `/portal/customer/<rest>`. The parent
// `/portal/customer/layout.tsx` already painted the chrome with the
// embedding client's brand kit and verified `requireRole("end-customer")`.
// Here we only resolve the URL → plugin page and render it.

import { notFound } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { resolveCustomerPluginPage } from "@/plugins/_routeResolver";
import { FOUNDATION_SERVICES } from "@/plugins/foundation-adapters";
import { pluginPageAllowedRoles } from "@/plugins/_types";
import type { PluginPageProps } from "@/plugins/_types";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

interface RouteProps {
  params: Promise<{ rest: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CustomerPluginCatchAll({ params, searchParams }: RouteProps) {
  await ensureHydrated();
  const session = await requireRole("end-customer");
  if (!session.clientId) notFound();

  const { rest } = await params;
  const sp = await searchParams;

  const resolved = resolveCustomerPluginPage({
    agencyId: session.agencyId,
    clientId: session.clientId,
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
    clientId: session.clientId,
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
