import { notFound, redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getClientForAgency } from "@/server/tenants";
import { getUserById } from "@/server/users";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { CustomerPortalChrome } from "@/app/portal/customer/_CustomerPortalChrome";
import { CustomerPortalContent, type CustomerPortalSection } from "@/app/portal/customer/_CustomerPortalViews";
import { customerPortalModeLabel, loadCustomerPortalData, portalMode, type CustomerPortalMode } from "@/app/portal/customer/_portalData";
import { portalProjectLabel } from "@/lib/portalProducts";
import { getTradingCompany } from "@/server/tradingCompanies";

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
  const queryValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const embedded = queryValue(query.embedded) === "1";
  const manage = queryValue(query.manage) === "1";
  const requestedSection = queryValue(query.section);
  const requestedProductId = queryValue(query.productId);
  const requestedModuleId = queryValue(query.module);
  const requestedProductIds = (queryValue(query.productIds) || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
    .slice(0, 8);
  const requestedMode = queryValue(query.portalMode);
  const scope = queryValue(query.portalScope) === "template" ? "template" : "client";
  const draft = queryValue(query.portalDraft) === "1";
  const templateId = queryValue(query.templateId);
  const allowedSections = new Set<CustomerPortalSection>(["home", "project", "results", "files", "billing", "support", "resources", "details", "service"]);
  const section: CustomerPortalSection = allowedSections.has(requestedSection as CustomerPortalSection)
    ? requestedSection as CustomerPortalSection
    : "home";
  const agencyId = session.activeAgencyId ?? session.agencyId;
  const client = getClientForAgency(agencyId, clientId);
  if (!client) notFound();

  const user = getUserById(session.userId);
  const provider = client.companyId ? getTradingCompany(agencyId, client.companyId) : null;
  const providerName = provider?.name ?? "AquaOasis-Web";
  const loadedData = await loadCustomerPortalData(client, client.name, providerName, {
    scope,
    templateId,
    productIds: requestedProductIds,
    draft,
    audience: "agency",
  });
  const validModes = new Set<CustomerPortalMode>(["onboarding", "designing", "developed-launch", "maintenance"]);
  const data = requestedMode && validModes.has(requestedMode as CustomerPortalMode)
    ? { ...loadedData, mode: portalMode(requestedMode) }
    : loadedData;
  const backHref = `/portal/clients/${client.id}?tab=portal`;
  const previewParams = new URLSearchParams();
  if (embedded) previewParams.set("embedded", "1");
  if (manage) previewParams.set("manage", "1");
  if (queryValue(query.portalScope)) previewParams.set("portalScope", scope);
  if (draft) previewParams.set("portalDraft", "1");
  if (requestedMode) previewParams.set("portalMode", data.mode);
  if (templateId) previewParams.set("templateId", templateId);
  if (requestedProductIds.length) previewParams.set("productIds", requestedProductIds.join(","));
  const previewQuery = previewParams.toString();
  const previewHrefPrefix = `/client-preview/${client.id}?${previewQuery ? `${previewQuery}&` : ""}section=`;

  return (
    <>
      <ThemeInjector brand={client.brand} scope="customer" />
      <CustomerPortalChrome
        clientName={client.name}
        email=""
        name={user?.name}
        avatarUrl={user?.avatarUrl}
        modeLabel={customerPortalModeLabel(data)}
        presentation={data.presentation}
        previewBackHref={embedded ? undefined : backHref}
        previewHrefPrefix={previewHrefPrefix}
        activePreviewSection={section}
        hideAccountMenu
        logoUrl={data.logoUrl}
        accentColor={data.accentColor}
        projectLabel={portalProjectLabel(data.products)}
        products={data.products}
        activePreviewProductId={requestedProductId}
        activePreviewModuleId={requestedModuleId}
        providerName={providerName}
        providerMark={providerName.charAt(0).toUpperCase()}
      >
        <CustomerPortalContent section={section} client={client} data={data} previewHrefPrefix={previewHrefPrefix} productId={requestedProductId} moduleId={requestedModuleId} providerName={providerName} workspaceRole={manage ? "agency" : "preview"} />
      </CustomerPortalChrome>
    </>
  );
}
