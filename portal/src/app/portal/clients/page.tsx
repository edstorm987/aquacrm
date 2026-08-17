import { redirect } from "next/navigation";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getAgency, listClients } from "@/server/tenants";
import { phaseLabel } from "@/server/phases";
import { getUserById } from "@/server/users";
import { getInstall, listInstalledFor } from "@/server/pluginInstalls";
import { buildSidebar } from "@/lib/chrome/sidebarLayout";
import { effectiveRole, hasAllPermissions } from "@/lib/server/effectiveRole";
import { ThemeInjector } from "@/components/chrome/ThemeInjector";
import { Sidebar } from "@/components/chrome/Sidebar";
import { Topbar } from "@/components/chrome/Topbar";
import { NotificationCentreButton } from "@/components/chrome/NotificationCentreButton";
import { AdvisorDrawerControl } from "@/components/chrome/AdvisorDrawerControl";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { containerFor } from "@aqua/plugin-leads-pipeline/server";
import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { PeopleHub, type ContactRole, type HubContact } from "./_PeopleHub";
import { ensureDefaultAgencyProducts, listAgencyProducts } from "@/server/agencyProducts";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { INTERNAL_WORKSPACE_NAME } from "@/lib/internalWorkspace";
import { listOperationalAlerts } from "@/lib/server/operationalAlerts";
import { addSidebarAttention } from "@/lib/server/sidebarAttention";
import { listOperationalAlertViews } from "@/lib/server/operationalAlertPreferences";
import { NotificationAttentionProvider } from "@/components/chrome/NotificationAttentionProvider";
import { RadarQuickLookControl } from "@/components/chrome/RadarQuickLookControl";
import { resolvePortalProductAssignment } from "@/lib/productAssignments";
import { LeadsPipelineWorkspaceServer } from "@/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer";
import { isLeadJourneyEligible, isWebsiteEnquiryClassification } from "@/lib/enquiryClassification";
import { ensureAgencyFinanceFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/agencyFinanceFoundation";
import { containerFor as financeContainerFor } from "@/built-ins/modules/agency-finance/src/server/foundationAdapter";
import type { Invoice } from "@/built-ins/modules/agency-finance/src/lib/domain";
import { listContractTemplates } from "@/server/contractTemplates";
import type { ClientContract, ClientContractTemplate } from "@/lib/clientContracts";
import { calculateClientAquaHealth } from "@/lib/clientAquaHealth";
import { JourneyCommercialWorkspace, type JourneyCommercialClient } from "./_JourneyCommercialWorkspace";
import type { JourneyMeetingPerson } from "./_JourneyMeetingsWorkspace";
import { cleanClientPaymentPlans, reconcileClientPaymentPlan } from "@/lib/clientPaymentPlans";
import { listWebsiteEnquiries, synchroniseWebsiteEnquiryIdentities } from "@/lib/server/websiteEnquiries";
import { listInboxSnapshot } from "@/lib/server/inboxStore";
import { synchroniseInboxIdentityResolutions } from "@/lib/server/inboxService";
import { clearIdentityResolutionReviews, listIdentityResolutionReviews } from "@/lib/server/identityResolution";
import { clientRelationshipId } from "@/server/clientRelationships";
import { inferLeadRelationshipCategory, isLeadRelationshipCategory } from "@/built-ins/modules/leads-pipeline/src/lib/domain";

interface JourneyClientMetadata {
  leadId?: string;
  contactId?: string;
  promotedFromLeadId?: string;
  leadSource?: string;
  lastContactedAt?: number;
  products?: unknown[];
  portalProducts?: unknown;
  niche?: string;
  customFields?: Record<string, unknown>;
  clientRequests?: Array<{ type?: string; status?: string; priority?: string; submittedAt?: number; replies?: Array<{ from?: string; createdAt?: number }> }>;
  contracts?: ClientContract[];
  planTier?: "foundational" | "expansion" | "mastery";
  portalServicePlan?: string;
  lockInPaid?: boolean;
  stripeLink?: string;
  portalLoginEmail?: string;
  clientEmail?: string;
  clientPaymentPlans?: unknown;
  files?: Array<{
    id: string;
    name?: string;
    url?: string;
    category?: string;
    uploadedAt?: number;
    customerVisible?: boolean;
    collectionId?: string;
  }>;
}

// /portal/clients — agency-side client list. Client-* roles redirect
// straight to their own client portal (a list of "all clients" makes no
// sense for them).

export default async function ClientsList({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  const agency = getAgency(session.agencyId);
  if (!agency) redirect("/login");

  const currentUser = getUserById(session.userId);
  const serviceBrands = listTradingCompanies(session.agencyId).filter(company => company.status !== "archived");
  const clients = listClients(session.agencyId);
  const relationshipWorkspaceCounts = clients.reduce((counts, client) => {
    const relationshipId = clientRelationshipId(client);
    counts.set(relationshipId, (counts.get(relationshipId) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  ensureDefaultAgencyProducts(session.agencyId);
  const products = listAgencyProducts(session.agencyId);
  const workspaceSettings = getAgencyWorkspaceSettings(session.agencyId);
  const leadsInstall = getInstall({ agencyId: agency.id }, "leads-pipeline");
  let contacts: HubContact[] = [];
  let journeyMeetingPeople: JourneyMeetingPerson[] = [];
  if (leadsInstall) {
    ensureLeadsPipelineFoundationRegistered();
    const leadsContainer = containerFor({
      agencyId: agency.id,
      storage: makePluginStorage(leadsInstall.id) as never,
    });
    const [contactRows, leadRows] = await Promise.all([
      leadsContainer.contacts.list(),
      leadsContainer.leads.list(),
    ]);
    const contactEmails = new Set(contactRows.map(contact => contact.email.toLowerCase()));
    const meetingContacts = contactRows.filter(contact => contact.type === "lead" || contact.type === "customer" || contact.type === "account");
    const meetingContactEmails = new Set(meetingContacts.map(contact => contact.email.toLowerCase()));
    journeyMeetingPeople = [
      ...meetingContacts.map(contact => ({
        id: contact.id,
        kind: "contact" as const,
        email: contact.email,
        name: contact.name,
        phone: contact.phone,
        company: contact.company,
        serviceNames: [],
        nextMeetingAt: contact.nextMeetingAt,
        meetingLink: contact.meetingLink,
        meetingNotes: contact.meetingNotes,
        meetingMode: contact.meetingMode,
        meetingLocation: contact.meetingLocation,
        meetingStatus: contact.meetingStatus,
        meetingConfirmedAt: contact.meetingConfirmedAt,
        meetingReminderAt: contact.meetingReminderAt,
        meetingReminderSentAt: contact.meetingReminderSentAt,
        meetingAttempts: contact.meetingAttempts,
        salesPresentations: contact.salesPresentations,
        callRecordingUrl: contact.callRecordingUrl,
        sessionNotes: contact.sessionNotes,
      })),
      ...leadRows
        .filter(isLeadJourneyEligible)
        .filter(lead => !meetingContactEmails.has(lead.email.toLowerCase()))
        .map(lead => ({
          id: lead.id,
          kind: "lead" as const,
          email: lead.email,
          name: lead.name,
          phone: lead.phone,
          company: lead.company,
          serviceNames: [],
          nextMeetingAt: lead.nextMeetingAt,
          meetingLink: lead.meetingLink,
          meetingNotes: lead.meetingNotes,
          meetingMode: lead.meetingMode,
          meetingLocation: lead.meetingLocation,
          meetingStatus: lead.meetingStatus,
          meetingConfirmedAt: lead.meetingConfirmedAt,
          meetingReminderAt: lead.meetingReminderAt,
          meetingReminderSentAt: lead.meetingReminderSentAt,
          meetingAttempts: lead.meetingAttempts,
          salesPresentations: lead.salesPresentations,
          callRecordingUrl: lead.callRecordingUrl,
          sessionNotes: lead.sessionNotes,
        })),
    ];
    contacts = [
      ...contactRows.map(contact => ({
        id: contact.id,
        email: contact.email,
        name: contact.name,
        phone: contact.phone,
        company: contact.company,
        tags: contact.tags,
	        type: contact.type as ContactRole,
	        source: contact.source,
	        notes: contact.notes,
	        lastContactedAt: contact.lastContactedAt,
	        nextMeetingAt: contact.nextMeetingAt,
	        promotedFromLeadId: contact.promotedFromLeadId,
	        createdAt: contact.createdAt,
	        clientId: contact.clientId,
	        recordKind: "contact" as const,
          relationshipCategory: isLeadRelationshipCategory(contact.customFields?.leadRelationshipCategory)
            ? contact.customFields.leadRelationshipCategory
            : undefined,
          enquiryClassification: isWebsiteEnquiryClassification(contact.customFields?.enquiryClassification)
            ? contact.customFields.enquiryClassification
            : undefined,
          brandIds: [],
          brandNames: [],
          serviceIds: [],
          serviceNames: [],
      })),
      ...leadRows
        .filter(isLeadJourneyEligible)
        .filter(lead => !contactEmails.has(lead.email.toLowerCase()))
        .map(lead => ({
          id: lead.id,
          email: lead.email,
          name: lead.name,
          phone: lead.phone,
          company: lead.company,
          tags: lead.tags,
          type: "lead" as const,
	          source: lead.source,
	          notes: lead.notes,
	          lastContactedAt: lead.lastContactedAt,
	          nextMeetingAt: lead.nextMeetingAt,
	          capturedAt: lead.capturedAt,
	          lastEnquiryAt: lead.lastEnquiryAt,
	          lastEnquiryRespondedAt: lead.lastEnquiryRespondedAt,
	          currentStageId: lead.currentStageId,
	          pipelineCardId: lead.pipelineCardId,
	          recordKind: "lead" as const,
          relationshipCategory: inferLeadRelationshipCategory(lead),
          brandIds: [...new Set([lead.companyId, ...(lead.companyIds ?? [])].filter((value): value is string => Boolean(value)))],
          brandNames: [],
          serviceIds: [...new Set(lead.serviceLines ?? [])],
          serviceNames: [],
          enquiryClassification: isWebsiteEnquiryClassification(lead.customFields?.enquiryClassification)
            ? lead.customFields.enquiryClassification
            : undefined,
        })),
    ];
  }
  const brandById = new Map(serviceBrands.map(brand => [brand.id, brand.name]));
  const productById = new Map(products.map(product => [product.id, product.name]));
  contacts = contacts.map(contact => {
    const email = contact.email.trim().toLowerCase();
    const relatedClients = clients.filter(client => {
      const metadata = client.metadata as { leadId?: string; contactId?: string; promotedFromLeadId?: string; linkedContacts?: unknown } | undefined;
      if (contact.clientId === client.id) return true;
      if (contact.recordKind === "lead" && (metadata?.leadId === contact.id || metadata?.promotedFromLeadId === contact.id)) return true;
      if (contact.recordKind === "contact" && metadata?.contactId === contact.id) return true;
      if (contact.promotedFromLeadId && (metadata?.leadId === contact.promotedFromLeadId || metadata?.promotedFromLeadId === contact.promotedFromLeadId)) return true;
      if (client.ownerEmail?.trim().toLowerCase() === email) return true;
      if (!Array.isArray(metadata?.linkedContacts)) return false;
      return metadata.linkedContacts.some(value => {
        if (!value || typeof value !== "object") return false;
        const linked = value as { id?: unknown; email?: unknown };
        return linked.id === contact.id || (typeof linked.email === "string" && linked.email.trim().toLowerCase() === email);
      });
    });
    const brandIds = [...new Set([...contact.brandIds, ...relatedClients.map(client => client.companyId).filter((value): value is string => Boolean(value))])];
    const services = relatedClients.flatMap(client => resolvePortalProductAssignment(client.metadata ?? {}, products).products);
    const canonicalServiceIds = contact.serviceIds.map(value => products.find(product => product.id === value || product.name.toLowerCase() === value.toLowerCase())?.id ?? value);
    const serviceIds = [...new Set([...canonicalServiceIds, ...services.map(service => service.id)])];
    return {
      ...contact,
      brandIds,
      brandNames: brandIds.map(id => brandById.get(id) ?? "Unknown brand"),
      serviceIds,
      serviceNames: serviceIds.map(id => services.find(service => service.id === id)?.name ?? productById.get(id) ?? id),
    };
  });
  journeyMeetingPeople = journeyMeetingPeople.map(person => {
    const related = contacts.find(contact => contact.email.trim().toLowerCase() === person.email.trim().toLowerCase());
    return {
      ...person,
      brandName: related?.brandNames[0],
      serviceNames: related?.serviceNames ?? [],
    };
  });
  if (session.isDemo) {
    clearIdentityResolutionReviews(session.agencyId);
  } else {
    const [identityEnquiries, identitySocial] = await Promise.allSettled([
      listWebsiteEnquiries(500),
      listInboxSnapshot(session.agencyId),
    ]);
    if (identityEnquiries.status === "fulfilled") {
      await synchroniseWebsiteEnquiryIdentities(session.agencyId, identityEnquiries.value).catch(() => identityEnquiries.value);
    }
    if (identitySocial.status === "fulfilled") {
      await synchroniseInboxIdentityResolutions(session.agencyId, identitySocial.value).catch(() => identitySocial.value);
    }
  }
  await flushPendingWrites();
  const identityReviews = session.isDemo ? [] : listIdentityResolutionReviews(session.agencyId, { status: "all" });
  const requestedView = (await searchParams).view;
  const initialView = requestedView === "health"
    ? "clients"
    : requestedView === "all"
      ? "contacts"
      : requestedView === "contacts" || requestedView === "staff" || requestedView === "clients" || requestedView === "leads" || requestedView === "journey" || requestedView === "identity"
      ? requestedView
      : "journey";
  const installs = listInstalledFor({ agencyId: agency.id });
  const eff = effectiveRole(session);
  const canViewFinance = hasAllPermissions(eff, ["finance.view"]);
  const contractTemplates: ClientContractTemplate[] = [
    ...listContractTemplates(agency.id),
    ...products
      .filter(product => Boolean(product.contractBody?.trim()))
      .map(product => ({
        id: `product:${product.id}`,
        agencyId: agency.id,
        title: product.contractTitle?.trim() || `${product.name} agreement`,
        summary: product.description,
        body: product.contractBody!.trim(),
        status: "active" as const,
        source: "product" as const,
        createdBy: "product-library",
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      })),
  ];
  const invoicesByClient = new Map<string, Invoice[]>();
  let financeConnected = false;
  const financeInstall = getInstall({ agencyId: agency.id }, "agency-finance");
  if (financeInstall?.enabled && canViewFinance) {
    try {
      ensureAgencyFinanceFoundationRegistered();
      const finance = financeContainerFor({ agencyId: agency.id, storage: makePluginStorage(financeInstall.id) as never, install: financeInstall });
      for (const invoice of await finance.invoices.list()) {
        const rows = invoicesByClient.get(invoice.clientId) ?? [];
        rows.push(invoice);
        invoicesByClient.set(invoice.clientId, rows);
      }
      financeConnected = true;
    } catch {
      // Journey remains operational and declares finance evidence as unavailable.
    }
  }
  const journeyClients: JourneyCommercialClient[] = clients.map(client => {
    const metadata = client.metadata as JourneyClientMetadata | undefined;
    const services = resolvePortalProductAssignment(metadata ?? {}, products).products;
    const requestsObserved = Array.isArray(metadata?.clientRequests);
    const contracts = Array.isArray(metadata?.contracts) ? metadata.contracts : [];
    return {
      id: client.id,
      name: client.name,
      relationshipId: clientRelationshipId(client),
      relationshipWorkspaceCount: relationshipWorkspaceCounts.get(clientRelationshipId(client)) ?? 1,
      workspaceLabel: client.workspaceLabel,
      ownerEmail: metadata?.portalLoginEmail || metadata?.clientEmail || client.ownerEmail,
      primaryColor: client.brand.primaryColor,
      stageLabel: phaseLabel(client.stage),
      brandName: client.companyId ? brandById.get(client.companyId) ?? "Unknown brand" : undefined,
      serviceNames: services.map(service => service.name),
      financeInitial: {
        planTier: metadata?.planTier,
        servicePlan: metadata?.portalServicePlan,
        lockInPaid: metadata?.lockInPaid,
        stripeLink: metadata?.stripeLink,
      },
      contracts,
      paymentPlans: cleanClientPaymentPlans(metadata?.clientPaymentPlans)
        .map(plan => reconcileClientPaymentPlan(plan, invoicesByClient.get(client.id) ?? [])),
      commercialFiles: (Array.isArray(metadata?.files) ? metadata.files : [])
        .filter(file => (file.category === "payment-plan" || file.category === "payment-proof") && Boolean(file.id && file.name && file.url))
        .map(file => ({
          id: file.id,
          name: file.name!,
          url: file.url!,
          category: file.category!,
          uploadedAt: file.uploadedAt,
          customerVisible: file.customerVisible,
          collectionId: file.collectionId,
        })),
      products: services.map(service => ({ id: service.id, name: service.name })),
      aquaHealth: calculateClientAquaHealth({
        financeConnected,
        invoices: invoicesByClient.get(client.id) ?? [],
        lastContactedAt: metadata?.lastContactedAt,
        requestsObserved,
        requests: requestsObserved ? metadata!.clientRequests! : [],
        contracts,
      }),
    };
  });
  const basePanels = buildSidebar({
    role: session.role,
    scope: "agency",
    installedPlugins: installs,
    permissions: eff.permissions,
    isFounder: eff.isFounder,
  });
  const operationalAlerts = await listOperationalAlerts(agency.id);
  const alertViews = listOperationalAlertViews(agency.id, session.userId, operationalAlerts);
  const panels = addSidebarAttention(basePanels, alertViews.filter(alert => alert.attention));
  const currentPath = initialView === "journey" ? "/portal/clients?view=journey" : "/portal/clients";

  return (
    <>
      <ThemeInjector brand={agency.brand} scope="agency" />
      <NotificationAttentionProvider initialAlerts={alertViews}>
      <div className="mm-portal-root flex h-dvh overflow-hidden">
        <Sidebar
          panels={panels}
          tenantLabel={INTERNAL_WORKSPACE_NAME}
          currentPath={currentPath}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar
            title={INTERNAL_WORKSPACE_NAME}
            subtitle="Journey"
            role={session.role}
            email={session.email}
            name={currentUser?.name}
            avatarUrl={currentUser?.avatarUrl}
            panels={panels}
            tenantLabel={INTERNAL_WORKSPACE_NAME}
            currentPath={currentPath}
            isDemo={session.isDemo}
            showcaseMode={Boolean(session.showcaseReturnAgencyId)}
            privacyTerms={[
              ...clients.flatMap(client => [client.name, client.ownerEmail ?? ""]),
              ...contacts.flatMap(contact => [contact.name ?? "", contact.email, contact.phone ?? "", contact.company ?? ""]),
            ]}
            notifications={<NotificationCentreButton />}
            radarControl={session.role === "agency-owner" || session.role === "agency-manager" ? <RadarQuickLookControl agencyId={session.agencyId} /> : null}
            advisorControl={session.role === "agency-owner" || session.role === "agency-manager" ? (
              <AdvisorDrawerControl agencyId={session.agencyId} userId={session.userId} userName={currentUser?.name || session.email} />
            ) : null}
          />
          <main id="main-content" className="mm-private-surface min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <ErrorBoundary label="clients index">
              <PeopleHub
                initialView={initialView}
                identityReviews={identityReviews}
                clientDefaults={workspaceSettings}
                brands={serviceBrands.map(company => ({
                  id: company.id,
                  name: company.name,
                  primaryColor: company.brand.primaryColor,
                }))}
                products={products.map(product => ({
                  id: product.id, kind: product.kind, name: product.name, category: product.category,
                  description: product.description ?? "", deliverables: product.deliverables,
                  buyerHeadline: product.buyerHeadline, coverImageUrl: product.coverImageUrl,
                  accentColor: product.accentColor, portalRequirement: product.portalRequirement,
                  portalHeadline: product.portalHeadline, portalWelcomeNote: product.portalWelcomeNote,
                  includedProductIds: product.includedProductIds, welcomePackItems: product.welcomePackItems,
                  welcomePackNotes: product.welcomePackNotes, pricing: product.pricing,
                  priceCents: product.priceCents, billingInterval: product.billingInterval,
                  depositPercent: product.depositPercent, taxRatePercent: product.taxRatePercent,
                  paymentTermsDays: product.paymentTermsDays, billingNotes: product.billingNotes,
                  internalInfo: product.internalInfo, contractTitle: product.contractTitle,
                  contractBody: product.contractBody, sopIds: product.sopIds,
                  sopCategories: product.sopCategories, companyIds: product.companyIds,
                }))}
                journeyWorkspace={<JourneyCommercialWorkspace
                  pipeline={<LeadsPipelineWorkspaceServer agencyId={agency.id} userId={session.userId} />}
                  meetingPeople={journeyMeetingPeople}
                  referenceNow={Date.now()}
                  clients={journeyClients}
                  contractTemplates={contractTemplates}
                  canViewFinance={canViewFinance}
                />}
                clients={clients.map(client => {
	                  const metadata = client.metadata as JourneyClientMetadata | undefined;
                  const services = resolvePortalProductAssignment(metadata ?? {}, products).products;
                  const healthNotes = [
                    !client.ownerEmail ? "Account email missing" : null,
                    !metadata?.leadSource ? "Acquisition source missing" : null,
                    metadata?.lastContactedAt && Date.now() - metadata.lastContactedAt > 1000 * 60 * 60 * 24 * 14 ? "No contact in 14+ days" : null,
                  ].filter((note): note is string => Boolean(note));
                  return {
                  id: client.id,
                  name: client.name,
                  ownerEmail: client.ownerEmail,
                  websiteUrl: client.websiteUrl,
                  stageLabel: phaseLabel(client.stage),
                  status: client.status,
	                  primaryColor: client.brand.primaryColor,
	                  source: metadata?.leadSource ?? "Unknown",
	                  leadId: metadata?.leadId,
	                  contactId: metadata?.contactId,
	                  promotedFromLeadId: metadata?.promotedFromLeadId,
	                  niche: metadata?.niche ?? (typeof metadata?.customFields?.niche === "string" ? metadata.customFields.niche : undefined),
                  lastContactedAt: metadata?.lastContactedAt,
                  health: healthNotes.length ? "attention" as const : "healthy" as const,
                  healthNotes,
                  brandId: client.companyId,
                  brandName: client.companyId ? brandById.get(client.companyId) ?? "Unknown brand" : undefined,
                  relationshipId: clientRelationshipId(client),
                  relationshipWorkspaceCount: relationshipWorkspaceCounts.get(clientRelationshipId(client)) ?? 1,
                  workspaceLabel: client.workspaceLabel,
                  serviceIds: services.map(service => service.id),
                  serviceNames: services.map(service => service.name),
                };})}
                contacts={contacts}
              />
            </ErrorBoundary>
          </main>
        </div>
      </div>
      </NotificationAttentionProvider>
    </>
  );
}
