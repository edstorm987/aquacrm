import { notFound, redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getAgency, getClientForAgency } from "@/server/tenants";
import { getUserById } from "@/server/users";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { CustomerPortalChrome } from "@/app/portal/customer/_CustomerPortalChrome";
import { CustomerPortalContent, type CustomerPortalSection } from "@/app/portal/customer/_CustomerPortalViews";
import { customerPortalModeLabel, loadCustomerPortalData, portalMode, type CustomerPortalMode } from "@/app/portal/customer/_portalData";
import { portalProjectLabel } from "@/lib/portal/portalProducts";
import { resolveClientPortalProvider } from "@/lib/server/clients/clientPortalProvider";
import { buildCustomerPortalAttention } from "@/lib/portal/customerPortalAttention";
import { isSampleClientId, sampleClientAgencyId, sampleClientFor } from "@/lib/server/clients/samplePreviewClient";
import { listClientFormNotices } from "@/lib/server/clientForms/clientFormNotices";

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
  const requestedCustomPageSlug = queryValue(query.customPage);
  const requestedProductIds = (queryValue(query.productIds) || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
    .slice(0, 8);
  const requestedMode = queryValue(query.portalMode);
  const scope = queryValue(query.portalScope) === "template" ? "template" : "client";
  const draft = queryValue(query.portalDraft) === "1";
  const templateId = queryValue(query.templateId);
  // Kept in step with `CustomerPortalSection` by
  // `smoke-client-form-notices`, which fails if a section exists that the
  // agency cannot preview. "enquiries" was missing here for exactly that
  // reason: the type gained it and this hand-written list did not, so the
  // preview silently answered "home" instead of saying it did not know the
  // section.
  const allowedSections = new Set<CustomerPortalSection>(["home", "project", "results", "files", "billing", "support", "resources", "details", "service", "custom", "enquiries"]);
  const section: CustomerPortalSection = allowedSections.has(requestedSection as CustomerPortalSection)
    ? requestedSection as CustomerPortalSection
    : "home";
  const agencyId = session.activeAgencyId ?? session.agencyId;
  // A TEMPLATE can be drafted before any client exists. The studio previews a
  // template by rendering it through a client, so with none on the agency there
  // was nothing to render and the editor refused to open (Ed, 2026-08-27).
  //
  // The reserved sample id resolves to a synthesised stand-in rather than a
  // stored row — see samplePreviewClient.ts for why nothing is created. It is
  // still scoped: the id carries the agency it belongs to, and a sample id for
  // ANOTHER agency resolves to nothing here.
  const sampleForThisAgency = isSampleClientId(clientId) && sampleClientAgencyId(clientId) === agencyId;
  const client = sampleForThisAgency ? sampleClientFor(agencyId) : getClientForAgency(agencyId, clientId);
  if (!client) notFound();

  const user = getUserById(session.userId);
  const agencyName = getAgency(client.agencyId)?.name?.trim() || "AquaOasis-Web";
  const provider = resolveClientPortalProvider(client, { name: agencyName, mark: agencyName.charAt(0) });
  const providerName = provider.name;
  const loadedData = await loadCustomerPortalData(client, client.name, providerName, {
    scope,
    templateId,
    productIds: requestedProductIds,
    draft,
    audience: manage ? "agency" : "customer",
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

  // The enquiry POINTERS, and only in the section that shows them.
  //
  // Safe for an agency to see because that is what they already are: this
  // agency is told an enquiry arrived, and the notice holds nothing but an id,
  // a timestamp and a seen flag. The person's name, email and message stay in
  // the client's own database and are read only by the client's own detail
  // view — which is why the preview shows the LIST and does not link into it.
  const enquiryNotices = section === "enquiries"
    ? listClientFormNotices(client.agencyId, client.id).map(notice => ({
        id: notice.id,
        receivedAt: notice.receivedAt,
        seen: Boolean(notice.seenAt),
      }))
    : [];

  return (
    <>
      <ThemeInjector brand={client.brand} scope="customer" />
      <CustomerPortalChrome
        viewerRole={"end-customer"}
        clientName={client.name}
        email=""
        name={user?.name}
        avatarUrl={user?.avatarUrl}
        modeLabel={customerPortalModeLabel(data)}
        presentation={data.presentation}
        presentationProductId={data.presentationProductId}
        productPresentations={data.productPresentations}
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
        activePreviewCustomPageSlug={requestedCustomPageSlug}
        providerName={providerName}
        providerMark={provider.mark}
        attention={buildCustomerPortalAttention(data)}
      >
        <CustomerPortalContent section={section} client={client} data={data} previewHrefPrefix={previewHrefPrefix} productId={requestedProductId} moduleId={requestedModuleId} customPageSlug={requestedCustomPageSlug} providerName={providerName} workspaceRole={manage ? "agency" : "preview"} enquiryNotices={enquiryNotices} />
      </CustomerPortalChrome>
    </>
  );
}
