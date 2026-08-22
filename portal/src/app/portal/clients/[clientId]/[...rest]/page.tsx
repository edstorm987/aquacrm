// Client-scope plugin route catch-all.
//
// Matches `/portal/clients/<clientId>/<rest>`. The parent
// `/portal/clients/[clientId]/layout.tsx` already painted the chrome with
// the client's brand kit and verified tenant-scope match. Here we only
// resolve the URL → plugin page and render it.

import { notFound } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRoleForClient } from "@/lib/server/auth/auth";
import { getClientForAgency } from "@/server/tenants";
import { ALL_ROLES } from "@/server/types";
import { resolveClientPluginPage } from "@/built-ins/runtime/_routeResolver";
import { FOUNDATION_SERVICES } from "@/built-ins/runtime/foundation-adapters";
import { pageAllowsRoleAt } from "@/built-ins/runtime/_pageScope";
import type { PluginPageProps } from "@/built-ins/runtime/_types";
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

  // TENANCY, said out loud. `requireRoleForClient` waves EVERY agency role
  // through for any clientId — it only pins client-side roles to their own — so
  // this host's clientId is still just a path segment the caller typed. Both
  // siblings under this folder (`page.tsx`, `settings/page.tsx`) already refuse
  // a client that is not this agency's, and so does the layout; a layout and
  // its page render concurrently, so the page must not lean on the layout's
  // refusal to avoid resolving a stranger's workspace. Today the resolver
  // happens to find nothing for a foreign client — that is an accident of
  // install scoping, not a rule, and this makes it one.
  if (!getClientForAgency(session.agencyId, clientId)) notFound();

  const resolved = resolveClientPluginPage({
    agencyId: session.agencyId,
    clientId,
    rest,
  });
  if (!resolved) notFound();
  const { plugin, page, install, segments } = resolved;

  // The gate is the SURFACE's, not just the manifest's. `requireRoleForClient`
  // above answers "are you attached to this client?" — every role in the
  // product can be. It never answered "does the client workspace belong to
  // you", which is why an end-customer used to render agency-hr's staff
  // directory here. `pageAllowsRoleAt` caps this host at
  // AGENCY_ROLES ∪ CLIENT_ROLES before any declared roles narrow it further,
  // so an undeclared page inherits the surface's ceiling rather than the
  // door's.
  if (!pageAllowsRoleAt(plugin, page, "client", session.role)) notFound();

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
      <div className="plugin-page-shell" data-plugin-id={install.pluginId}>
        <Component {...props} />
      </div>
    </ErrorBoundary>
  );
}
