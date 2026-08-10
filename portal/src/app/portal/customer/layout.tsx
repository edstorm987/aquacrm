import { redirect, notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { getClientForAgency } from "@/server/tenants";
import { getUserById } from "@/server/users";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { CustomerPortalChrome } from "./_CustomerPortalChrome";
import { loadCustomerPortalData } from "./_portalData";
import { portalProjectLabel } from "@/lib/portalProducts";
import { getAuthBrand } from "@/lib/authBrand";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const authBrand = getAuthBrand(cookieStore.get("aqua_public_brand")?.value);
  return {
    title: `${authBrand.name} client portal`,
  };
}

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
        <main id="main-content" data-testid="portal-customer-embed" className="mm-portal-root min-h-screen px-4 py-4">
          <ErrorBoundary label="customer (embed)">{children}</ErrorBoundary>
        </main>
      </>
    );
  }

  const user = getUserById(session.userId);
  const cookieStore = await cookies();
  const authBrand = getAuthBrand(cookieStore.get("aqua_public_brand")?.value);
  const portalData = await loadCustomerPortalData(client, user?.name ?? client.name, authBrand.name);

  return (
    <>
      <ThemeInjector brand={client.brand} scope="customer" />
      <CustomerPortalChrome
        clientName={client.name}
        email={session.email}
        name={user?.name}
        avatarUrl={user?.avatarUrl}
        modeLabel={portalData.presentation.stages[portalData.mode].label}
        presentation={portalData.presentation}
        logoUrl={portalData.logoUrl}
        accentColor={portalData.accentColor}
        projectLabel={portalProjectLabel(portalData.products)}
        providerName={authBrand.name}
        providerMark={authBrand.mark}
      >
        <ErrorBoundary label="client portal">{children}</ErrorBoundary>
      </CustomerPortalChrome>
    </>
  );
}
