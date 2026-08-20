// End-customer-scope plugin route catch-all.
//
// Matches `/portal/customer/<rest>`. The parent
// `/portal/customer/layout.tsx` already painted the chrome with the
// embedding client's brand kit and verified `requireRole("end-customer")`.
// Here we only resolve the URL → plugin page and render it.

import { notFound } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { resolveCustomerPluginPage } from "@/built-ins/runtime/_routeResolver";
import { FOUNDATION_SERVICES } from "@/built-ins/runtime/foundation-adapters";
import { pluginPageAllowedRoles } from "@/built-ins/runtime/_types";
import type { PluginPageProps } from "@/built-ins/runtime/_types";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import {
  CustomerPortalView,
  type CustomerPortalSection,
} from "../_CustomerPortalViews";

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
  const section = rest[0];
  if (section === "service" && rest.length >= 2 && rest.length <= 3) {
    return <CustomerPortalView section="service" productId={rest[1]} moduleId={rest[2]} />;
  }
  if (section === "page" && rest.length === 2) {
    return <CustomerPortalView section="custom" customPageSlug={rest[1]} />;
  }
  const fixedSections: CustomerPortalSection[] = ["project", "results", "files", "billing", "support", "resources", "details"];
  if (rest.length === 1 && fixedSections.includes(section as CustomerPortalSection)) {
    return <CustomerPortalView section={section as CustomerPortalSection} />;
  }

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
      <div className="plugin-page-shell" data-plugin-id={install.pluginId}>
        <Component {...props} />
      </div>
    </ErrorBoundary>
  );
}
