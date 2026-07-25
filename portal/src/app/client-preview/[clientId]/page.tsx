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

const MODE_LABEL = {
  onboarding: "Onboarding",
  designing: "Designing",
  "developed-launch": "Build & launch",
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
  const allowedSections = new Set<CustomerPortalSection>(["home", "project", "files", "billing", "support", "resources"]);
  const section: CustomerPortalSection = allowedSections.has(requestedSection as CustomerPortalSection)
    ? requestedSection as CustomerPortalSection
    : "home";
  const agencyId = session.activeAgencyId ?? session.agencyId;
  const client = getClientForAgency(agencyId, clientId);
  if (!client) notFound();

  const user = getUserById(session.userId);
  const data = await loadCustomerPortalData(client, client.name);
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
      >
        <CustomerPortalContent section={section} client={client} data={data} previewHrefPrefix={previewHrefPrefix} />
      </CustomerPortalChrome>
    </>
  );
}
