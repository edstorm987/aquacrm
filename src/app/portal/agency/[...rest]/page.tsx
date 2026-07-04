// Agency-scope plugin route catch-all.
//
// Matches every URL under `/portal/agency/<rest>` that isn't claimed by a
// more specific page (Next gives literal routes priority over catch-all).
// Resolves the URL → plugin manifest + install + page component, then
// renders the plugin's component inside the agency chrome that the
// parent layout already painted.
//
// T1 nav-audit (2026-05-08): differentiate "no such plugin path"
// (genuine 404) from "plugin path exists but install missing" (friendly
// not-installed page). Stops the hostile blank "Something went wrong
// loading agency workspace" failure when a sidebar entry points at a
// plugin the tenant hasn't enabled yet.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { resolveAgencyPluginPage } from "@/plugins/_routeResolver";
import { listPlugins } from "@/plugins/_registry";
import { getInstall } from "@/server/pluginInstalls";
import { FOUNDATION_SERVICES } from "@/plugins/foundation-adapters";
import { pluginPageAllowedRoles } from "@/plugins/_types";
import type { PluginPageProps } from "@/plugins/_types";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

interface RouteProps {
  params: Promise<{ rest: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AgencyPluginCatchAll({ params, searchParams }: RouteProps) {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);

  const { rest } = await params;
  const sp = await searchParams;

  const resolved = resolveAgencyPluginPage({ agencyId: session.agencyId, rest });
  if (!resolved) {
    // Friendly path — the URL's first segment matches a plugin id we
    // ship but the tenant hasn't installed/enabled it. Sidebar wires
    // entries optimistically; this surface explains the gap instead of
    // 404'ing.
    const head = rest[0];
    const known = head ? listPlugins().find(p => p.id === head) : null;
    if (known) {
      const existing = getInstall({ agencyId: session.agencyId }, known.id);
      const reason = !existing
        ? "not installed"
        : !existing.enabled
          ? "disabled"
          : "no matching page";
      return (
        <main
          id="main-content"
          data-testid="plugin-not-installed"
          className="mx-auto max-w-2xl px-6 py-16"
        >
          <p className="text-xs uppercase tracking-wide text-black/50">
            Plugin {reason}
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-black/90">
            {known.id} isn&apos;t wired up for this agency yet
          </h1>
          <p className="mt-3 text-sm leading-6 text-black/70">
            The sidebar links to <code className="rounded bg-black/5 px-1">/portal/agency/{rest.join("/")}</code>{" "}
            but {known.id} {reason === "not installed" ? "hasn’t been installed" : reason === "disabled" ? "is currently disabled" : "doesn’t expose this sub-page"} for{" "}
            <strong>{session.agencyId}</strong>. Install or enable it via the
            Marketplace, then come back to this URL.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/portal/agency/settings"
              className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm text-black/80 hover:bg-black/5"
            >
              Open Marketplace
            </Link>
            <Link
              href="/portal/agency"
              className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm text-black/80 hover:bg-black/5"
            >
              ← Back to dashboard
            </Link>
          </div>
        </main>
      );
    }
    notFound();
  }
  const { page, install, segments } = resolved;

  const allowed = pluginPageAllowedRoles(page);
  if (allowed && !allowed.includes(session.role)) notFound();

  const mod = await page.component();
  const Component = mod.default;
  const props: PluginPageProps = {
    agencyId: session.agencyId,
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
