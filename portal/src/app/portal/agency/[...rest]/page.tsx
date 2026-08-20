// Agency-scope workspace route catch-all.
//
// Matches every URL under `/portal/agency/<rest>` that isn't claimed by a
// more specific page (Next gives literal routes priority over catch-all).
// Resolves the URL → workspace tool manifest + activation + page component, then
// renders the tool's component inside the agency chrome that the
// parent layout already painted.
//
// T1 nav-audit (2026-05-08): differentiate "no such tool path"
// (genuine 404) from "tool path exists but activation missing" (friendly
// not-active page). Stops the hostile blank "Something went wrong
// loading agency workspace" failure when a sidebar entry points at a
// tool the tenant hasn't enabled yet.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { resolveAgencyPluginPage } from "@/built-ins/runtime/_routeResolver";
import { listPlugins } from "@/built-ins/runtime/_registry";
import { getInstall } from "@/server/pluginInstalls";
import { FOUNDATION_SERVICES } from "@/built-ins/runtime/foundation-adapters";
import { pluginPageAllowedRoles } from "@/built-ins/runtime/_types";
import type { PluginPageProps } from "@/built-ins/runtime/_types";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PluginWorkspaceNav } from "@/components/workspaces/PluginWorkspaceNav";
import { installPlugin, setPluginEnabled } from "@/built-ins/runtime/_runtime";
import { retiredStaffRedirect } from "./_retiredStaffRoute";

interface RouteProps {
  params: Promise<{ rest: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AgencyPluginCatchAll({ params, searchParams }: RouteProps) {
  const { rest } = await params;
  const sp = await searchParams;

  // Retired duplicate: agency-hr's Staff directory (P5). Runs ahead of the
  // session check on purpose — it is a pure URL rewrite that reads no tenant
  // data, and the destination is itself role-gated (the agency layout plus
  // /portal/agency/people). Departments / Leave / Employees / Roles / Settings
  // fall straight through to normal plugin resolution.
  const retiredStaff = retiredStaffRedirect(rest, sp);
  if (retiredStaff) redirect(retiredStaff);

  await ensureHydrated({ fresh: true });
  const session = await requireRole([...AGENCY_ROLES]);

  if (rest[0] === "fulfillment") {
    if (rest.length === 1) redirect("/portal/agency/fulfilment");
    if (rest[1] === "clients") redirect("/portal/agency/fulfilment?view=clients");
    if (rest[1] === "marketplace") redirect("/portal/agency/fulfilment?view=services");
    if (rest[1] === "phases") redirect("/portal/agency/phases");
    if (rest.length === 2) redirect(`/portal/clients/${encodeURIComponent(rest[1])}?tab=delivery`);
  }
  if (rest[0] === "leads-pipeline") {
    if (rest.length === 1) redirect("/portal/agency/leads-pipeline/contacts");
    if (rest[1] === "board") redirect("/portal/agency/pipelines/leads");
    if (rest[1] === "campaigns") redirect("/portal/agency/marketing");
  }
  if (rest[0] === "agency-finance" && rest[1] === "founder") redirect("/portal/agency/agency-finance");

  let resolved = resolveAgencyPluginPage({ agencyId: session.agencyId, rest });
  const workspacePluginId = rest[0];
  const mayProvisionWorkspace = session.role === "agency-owner" || session.role === "agency-manager";
  if (!resolved && mayProvisionWorkspace && workspacePluginId && ["agency-hr", "email-sender", "agency-marketing"].includes(workspacePluginId)) {
    const existing = getInstall({ agencyId: session.agencyId }, workspacePluginId);
    if (!existing) {
      await installPlugin(workspacePluginId, {
        scope: { agencyId: session.agencyId },
        installedBy: session.userId,
      });
    } else if (!existing.enabled) {
      await setPluginEnabled({ agencyId: session.agencyId }, workspacePluginId, true);
    }
    resolved = resolveAgencyPluginPage({ agencyId: session.agencyId, rest });
  }
  if (!resolved) {
    // Friendly path — the URL's first segment matches a built-in tool id we
    // ship but the tenant hasn't activated it. Sidebar wires
    // entries optimistically; this surface explains the gap instead of
    // 404'ing.
    const head = rest[0];
    const known = head ? listPlugins().find(p => p.id === head) : null;
    if (known) {
      const existing = getInstall({ agencyId: session.agencyId }, known.id);
      const reason = !existing
        ? "not active"
        : !existing.enabled
          ? "turned off"
          : "no matching page";
      return (
        <main
          id="main-content"
          data-testid="workspace-tool-unavailable"
          className="mx-auto max-w-2xl px-6 py-16"
        >
          <p className="text-xs uppercase tracking-wide text-black/50">
            Workspace section {reason}
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-black/90">
            This workspace section is not ready for this agency yet
          </h1>
          <p className="mt-3 text-sm leading-6 text-black/70">
            This URL points to <code className="rounded bg-black/5 px-1">/portal/agency/{rest.join("/")}</code>{" "}
            but {known.name ?? known.id} {reason === "not active" ? "is not active yet" : reason === "turned off" ? "is currently turned off" : "doesn’t expose this sub-page"} for{" "}
            <strong>{session.agencyId}</strong>. Open Settings to manage workspace systems.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/portal/agency/settings"
              className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm text-black/80 hover:bg-black/5"
            >
              Open Settings
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
      <div className="plugin-page-shell" data-plugin-id={install.pluginId}>
        <PluginWorkspaceNav pluginId={install.pluginId} activePath={page.path} role={session.role} />
        <Component {...props} />
      </div>
    </ErrorBoundary>
  );
}
