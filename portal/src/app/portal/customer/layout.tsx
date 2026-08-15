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
import { customerPortalModeLabel, loadCustomerPortalData } from "./_portalData";
import { portalProjectLabel } from "@/lib/portalProducts";
import { getAuthBrand } from "@/lib/authBrand";
import { resolveClientPortalProvider } from "@/lib/server/clientPortalProvider";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const authBrand = getAuthBrand(cookieStore.get("aqua_public_brand")?.value);
  try {
    await ensureHydrated();
    const session = await requireRole("end-customer");
    const client = session.clientId ? getClientForAgency(session.agencyId, session.clientId) : null;
    if (client) {
      const provider = resolveClientPortalProvider(client, authBrand);
      return { title: `${provider.name} client portal` };
    }
  } catch {
    // The layout owns authentication and redirect behaviour; metadata stays neutral here.
  }
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
  const provider = resolveClientPortalProvider(client, authBrand);
  const portalData = await loadCustomerPortalData(client, user?.name ?? client.name, provider.name);

  return (
    <>
      <ThemeInjector brand={client.brand} scope="customer" />
      <CustomerPortalChrome
        clientName={client.name}
        email={session.email}
        name={user?.name}
        avatarUrl={user?.avatarUrl}
        modeLabel={customerPortalModeLabel(portalData)}
        presentation={portalData.presentation}
        logoUrl={portalData.logoUrl}
        accentColor={portalData.accentColor}
        projectLabel={portalProjectLabel(portalData.products)}
        products={portalData.products}
        providerName={provider.name}
        providerMark={provider.mark}
      >
        <ErrorBoundary label="client portal">{children}</ErrorBoundary>
      </CustomerPortalChrome>
    </>
  );
}
