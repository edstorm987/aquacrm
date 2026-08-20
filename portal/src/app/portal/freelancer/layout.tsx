// Freelancer workspace layout — a self-contained, deliberately-narrow shell
// (like the customer portal has its own), NOT the agency Topbar/Sidebar. A
// freelancer only ever sees their own assigned jobs. Colours use the theme
// tokens (--mm-*) so it adapts to light + dark without a Tailwind darkMode.

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { getAgency } from "@/server/tenants";
import { getUserById } from "@/server/users";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PortalRouteCanvas } from "@/components/chrome/PortalRouteCanvas";
import { ExitPreview } from "./_ExitPreview";

export default async function FreelancerLayout({ children }: { children: ReactNode }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole("freelancer");
  } catch {
    redirect("/portal");
  }
  const agency = getAgency(session.agencyId);
  if (!agency) redirect("/login");
  const user = getUserById(session.userId);

  return (
    <>
      <ThemeInjector brand={agency.brand} scope="agency" />
      <div className="mm-portal-root flex min-h-dvh flex-col bg-[var(--mm-surface-muted)] text-[var(--mm-text)]">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--mm-border)] bg-[var(--mm-surface)] px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--mm-text)]">{agency.name} · Freelancer</p>
            <p className="truncate text-xs text-[var(--mm-text-muted)]">{user?.name ?? session.email}</p>
          </div>
          {session.previewReturnAgencyId ? (
            <ExitPreview />
          ) : (
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="rounded-md border border-[var(--mm-border)] px-3 py-1.5 text-xs font-medium text-[var(--mm-text-secondary)] transition hover:bg-[var(--mm-surface-muted)]"
              >
                Sign out
              </button>
            </form>
          )}
        </header>
        <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
          <ErrorBoundary label="freelancer workspace"><PortalRouteCanvas>{children}</PortalRouteCanvas></ErrorBoundary>
        </main>
      </div>
    </>
  );
}
