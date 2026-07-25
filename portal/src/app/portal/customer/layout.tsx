import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { getClientForAgency } from "@/server/tenants";
import { getUserById } from "@/server/users";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { CustomerPortalChrome } from "./_CustomerPortalChrome";
import { portalMode } from "./_portalData";

const MODE_LABEL = {
  onboarding: "Onboarding",
  designing: "Designing",
  "developed-launch": "Build & launch",
  maintenance: "Live care",
} as const;

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

  const h = await headers();

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

  const user = getUserById(session.userId);
  const meta = (client.metadata ?? {}) as {
    portalMode?: unknown;
    portalLogoUrl?: string;
    portalAccentColor?: string;
  };
  const modeLabel = MODE_LABEL[portalMode(meta.portalMode)];
  const accentColor = /^#[0-9a-f]{6}$/i.test(meta.portalAccentColor ?? "")
    ? meta.portalAccentColor
    : "#8b6c33";

  return (
    <>
      <ThemeInjector brand={client.brand} scope="customer" />
      <CustomerPortalChrome
        clientName={client.name}
        email={session.email}
        name={user?.name}
        avatarUrl={user?.avatarUrl}
        modeLabel={modeLabel}
        logoUrl={meta.portalLogoUrl}
        accentColor={accentColor}
      >
        <ErrorBoundary label="client portal">{children}</ErrorBoundary>
      </CustomerPortalChrome>
    </>
  );
}
