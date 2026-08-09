import { notFound, redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getClientForAgency } from "@/server/tenants";
import { getUserById } from "@/server/users";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { CustomerPortalChrome } from "@/app/portal/customer/_CustomerPortalChrome";
import { CustomerPortalContent, type CustomerPortalSection } from "@/app/portal/customer/_CustomerPortalViews";
import { loadCustomerPortalData } from "@/app/portal/customer/_portalData";
import { portalProjectLabel } from "@/lib/portalProducts";
import { getTradingCompany } from "@/server/tradingCompanies";

const MODE_LABEL = {
  onboarding: "Onboarding",
  designing: "In progress",
  "developed-launch": "Review & delivery",
  maintenance: "Live care",
} as const;

export default async function ClientPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/login");
  }

  const { clientId } = await params;
  const query = await searchParams;
  const embedded = query.embedded === "1";
  const requestedSection = Array.isArray(query.section) ? query.section[0] : query.section;
  const allowedSections = new Set<CustomerPortalSection>(["home", "project", "results", "files", "billing", "support", "resources", "details"]);
  const section: CustomerPortalSection = allowedSections.has(requestedSection as CustomerPortalSection)
    ? requestedSection as CustomerPortalSection
    : "home";
  const agencyId = session.activeAgencyId ?? session.agencyId;
  const client = getClientForAgency(agencyId, clientId);
  if (!client) notFound();

  const user = getUserById(session.userId);
  const provider = client.companyId ? getTradingCompany(agencyId, client.companyId) : null;
  const providerName = provider?.name ?? "AquaOasis-Web";
  const data = await loadCustomerPortalData(client, client.name, providerName);
  const backHref = `/portal/clients/${client.id}?tab=fulfilment`;
  const previewHrefPrefix = `/client-preview/${client.id}?${embedded ? "embedded=1&" : ""}section=`;

  return (
    <>
      <ThemeInjector brand={client.brand} scope="customer" />
      <CustomerPortalChrome
        clientName={client.name}
        email=""
        name={user?.name}
        avatarUrl={user?.avatarUrl}
        modeLabel={MODE_LABEL[data.mode]}
        previewBackHref={embedded ? undefined : backHref}
        previewHrefPrefix={previewHrefPrefix}
        activePreviewSection={section}
        hideAccountMenu
        logoUrl={data.logoUrl}
        accentColor={data.accentColor}
        projectLabel={portalProjectLabel(data.products)}
        providerName={providerName}
        providerMark={providerName.charAt(0).toUpperCase()}
      >
        <CustomerPortalContent section={section} client={client} data={data} previewHrefPrefix={previewHrefPrefix} providerName={providerName} />
      </CustomerPortalChrome>
    </>
  );
}
