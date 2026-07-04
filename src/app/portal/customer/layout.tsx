import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { getClientForAgency } from "@/server/tenants";
import { getUserById } from "@/server/users";
import { listInstalledFor } from "@/server/pluginInstalls";
import { buildSidebar } from "@/lib/chrome/sidebarLayout";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { Sidebar } from "@/components/chrome/Sidebar";
import { Topbar } from "@/components/chrome/Topbar";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

// End-customer layout — Felicia's shoppers / members / affiliates.
// Branded as the parent client (not the agency).

export default async function CustomerLayout({ children }: { children: ReactNode }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole("end-customer");
  } catch {
    redirect("/portal");
  }

  // End-customer must be tied to a client.
  if (!session.clientId) redirect("/login");
  const client = getClientForAgency(session.agencyId, session.clientId);
  if (!client) notFound();

  const installs = listInstalledFor({ agencyId: session.agencyId, clientId: client.id });
  const panels = buildSidebar({
    role: session.role,
    scope: "customer",
    currentClient: client,
    installedPlugins: installs,
  });
  const h = await headers();
  const currentPath = h.get("x-invoke-path") ?? h.get("x-pathname") ?? "/portal/customer";

  // R019 Goal D — iframe embed mode strips Sidebar + Topbar so the
  // customer portal renders flush inside the client website's iframe.
  // Cookie set by /demo?embed=1 (R013) and the foundation /embed/<slug>/customer
  // route (R016). Brand kit still injected so iframe inherits client styling.
  const embed = h.get("cookie")?.includes("lk_demo_embed=1") ?? false;
  if (embed) {
    return (
      <>
        <ThemeInjector brand={client.brand} scope="customer" />
        <main id="main-content" data-testid="portal-customer-embed" className="min-h-screen px-4 py-4">
          <ErrorBoundary label="customer (embed)">{children}</ErrorBoundary>
        </main>
      </>
    );
  }

  return (
    <>
      <ThemeInjector brand={client.brand} scope="customer" />
      <div className="flex min-h-screen">
        <Sidebar panels={panels} tenantLabel={client.name} currentPath={currentPath} />
        <div className="flex flex-1 flex-col">
          <Topbar
            title="My account"
            subtitle={client.name}
            role={session.role}
            email={session.email}
            name={getUserById(session.userId)?.name}
            avatarUrl={getUserById(session.userId)?.avatarUrl}
            panels={panels}
            tenantLabel={client.name}
            currentPath={currentPath}
            isDemo={session.isDemo}
          />
          <main id="main-content" className="flex-1 px-8 py-6">
            <ErrorBoundary label="account">{children}</ErrorBoundary>
          </main>
        </div>
      </div>
    </>
  );
}
