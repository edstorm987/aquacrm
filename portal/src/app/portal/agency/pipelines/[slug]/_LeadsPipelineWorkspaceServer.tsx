import { agencyProductsForRead, listAgencyProducts } from "@/server/agencyProducts";
import { installPlugin, setPluginEnabled } from "@/built-ins/runtime/_runtime";
import { resolvePortalProductAssignment } from "@/lib/products/productAssignments";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { containerFor as leadsContainerFor } from "@aqua/plugin-leads-pipeline/server";
import { getInstall } from "@/server/pluginInstalls";
import { getPipelineBySlug, listCards, listPipelines } from "@/server/pipelines";
import { listClients } from "@/server/tenants";
import { listTradingCompanies } from "@/server/tradingCompanies";
import { isLeadJourneyEligible } from "@/lib/enquiries/enquiryClassification";
import { getPortalFormFields } from "@/server/portalEditor";
import { getUserById } from "@/server/users";

import { LeadsPipelineWorkspace } from "./_LeadsPipelineWorkspace";
import type { LeadJourneyEventView } from "./_leadTypes";
import { acquisitionJourneyEvents } from "./_leadJourneyProjection";
import { toScoutingProspectView } from "./_scoutingProspectView";
import { loadUpcomingMeetings } from "@/lib/server/agency/meetingsFeed";
import { clientMatchesLead } from "@/built-ins/modules/leads-pipeline/src/lib/clientMatch";

export async function LeadsPipelineWorkspaceServer({
  agencyId,
  userId,
  showAcquisitionTabs = true,
}: {
  agencyId: string;
  userId: string;
  showAcquisitionTabs?: boolean;
}) {
  const pipeline = getPipelineBySlug(agencyId, "leads");
  if (!pipeline || pipeline.kind !== "leads") return <JourneyUnavailable detail="The Journey pipeline has not been initialised for this workspace." />;

  let install = getInstall({ agencyId }, "leads-pipeline");
  if (!install) {
    const result = await installPlugin("leads-pipeline", {
      scope: { agencyId },
      installedBy: userId,
    });
    if (result.ok) install = result.install;
  } else if (!install.enabled) {
    await setPluginEnabled({ agencyId }, "leads-pipeline", true);
    install = getInstall({ agencyId }, "leads-pipeline");
  }
  if (!install?.enabled) return <JourneyUnavailable detail="The Journey data module could not be enabled." />;

  const storage = makePluginStorage(install.id);
  const container = leadsContainerFor({ agencyId, storage: storage as never });
  const referenceNow = Date.now();
  agencyProductsForRead(agencyId);
  const productCatalogue = listAgencyProducts(agencyId, true);
  const products = productCatalogue.filter(product => product.active);
  const brands = listTradingCompanies(agencyId).filter(company => company.status !== "archived");
  const [leadList, archivedList, prospectList, journeyMeetings] = await Promise.all([
    container.leads.list(),
    // Their own view, and only their own view — see the note in page.tsx.
    container.leads.list({ archived: "only" }),
    container.prospects.list(),
    loadUpcomingMeetings(agencyId, referenceNow),
  ]);
  const journeyLeadList = leadList.filter(isLeadJourneyEligible);
  const clients = listClients(agencyId);
  const brandById = new Map(brands.map(brand => [brand.id, brand.name]));
  const cards = listCards(pipeline.id);
  const actorLabelFor = (actorUserId?: string): string | undefined => {
    if (!actorUserId) return undefined;
    const actor = getUserById(actorUserId);
    if (!actor || !actor.agencyIds.includes(agencyId)) return "Former team member";
    return actor.name.trim() || actor.email;
  };
  const columnByLeadId = new Map<string, string>();
  const cardUpdatedAtByLeadId = new Map<string, number>();

  for (const card of cards) {
    if (card.kind !== "lead") continue;
    const snapshot = card.lead as unknown as { leadId?: string };
    const key = snapshot.leadId;
    if (key) {
      columnByLeadId.set(key, card.columnId);
      cardUpdatedAtByLeadId.set(key, card.updatedAt);
    }
  }

  const boards = listPipelines(agencyId)
    .filter(item => item.kind === "leads" || item.kind === "fulfilment")
    .sort((a, b) => a.kind === b.kind ? 0 : a.kind === "leads" ? -1 : 1)
    .map(item => ({
      slug: item.slug,
      label: item.kind === "leads" ? "Sales & leads" : "Fulfilment",
    }));

  return (
    <LeadsPipelineWorkspace
      showAcquisitionTabs={showAcquisitionTabs}
      journeyMeetings={journeyMeetings}
      referenceNow={referenceNow}
      archivedLeads={archivedList.map(lead => ({
        id: lead.id,
        email: lead.email,
        name: lead.name,
        phone: lead.phone,
        company: lead.company,
        tags: lead.tags,
        capturedAt: lead.capturedAt,
        archivedAt: lead.archivedAt,
      }))}
      columns={pipeline.columns.map(column => ({ id: column.id, label: column.label, color: column.color }))}
      prospects={prospectList
        .filter(prospect => prospect.status === "scouting")
        .map(prospect => toScoutingProspectView(prospect, actorLabelFor))}
      dismissedProspects={prospectList
        .filter(prospect => prospect.status === "dismissed")
        .map(prospect => toScoutingProspectView(prospect, actorLabelFor))}
      leads={journeyLeadList.map(lead => {
        const client = clients.find(candidate => clientMatchesLead(candidate, lead));
        const clientMetadata = client?.metadata ?? {};
        const services = resolvePortalProductAssignment(clientMetadata, productCatalogue).products;
        const customFields = lead.customFields as Record<string, unknown> | undefined;
        const explicitBrandId = typeof customFields?.brandId === "string"
          ? customFields.brandId
          : typeof customFields?.clientFacingBrandId === "string"
            ? customFields.clientFacingBrandId
            : undefined;
        const brandId = client?.companyId ?? lead.companyId ?? lead.companyIds?.[0] ?? explicitBrandId;
        const explicitServiceIds = Array.isArray(customFields?.serviceIds)
          ? customFields.serviceIds.filter((value): value is string => typeof value === "string")
          : [];
        const canonicalServiceIds = (lead.serviceLines ?? []).map(value => products.find(product => product.id === value || product.name.toLowerCase() === value.toLowerCase())?.id ?? value);
        const serviceIds = [...new Set([...services.map(service => service.id), ...canonicalServiceIds, ...explicitServiceIds])];
        const serviceNames = serviceIds.map(serviceId => services.find(service => service.id === serviceId)?.name ?? products.find(product => product.id === serviceId)?.name ?? serviceId);
        const journeyEvents: LeadJourneyEventView[] = [
          ...(lead.journeyEvents ?? []).map(({ actorUserId, outcomeActorUserId, ...event }) => ({
            ...event,
            actorLabel: actorLabelFor(actorUserId),
            outcomeActorLabel: actorLabelFor(outcomeActorUserId),
          })),
          ...(lead.prospectAcquisitions ?? []).flatMap(acquisition => acquisitionJourneyEvents(acquisition, actorLabelFor)),
        ];
        return {
          id: lead.id,
          prospectId: lead.prospectAcquisitions?.[0]?.prospectId,
          clientId: client?.id,
          email: lead.email,
          name: lead.name,
          phone: lead.phone,
          company: lead.company,
          source: lead.source,
          tags: lead.tags,
          notes: lead.notes,
          capturedAt: lead.capturedAt,
          lastEnquiryAt: lead.lastEnquiryAt,
          lastEnquiryRespondedAt: lead.lastEnquiryRespondedAt,
          enquiryCount: lead.enquiryCount,
          firstContactedAt: lead.firstContactedAt,
          lastContactedAt: lead.lastContactedAt,
          currentStageId: columnByLeadId.get(lead.id) ?? lead.currentStageId ?? pipeline.columns[0]?.id ?? "new",
          stageEnteredAt: lead.currentStageId === (columnByLeadId.get(lead.id) ?? lead.currentStageId)
            ? lead.stageEnteredAt
            : cardUpdatedAtByLeadId.get(lead.id) ?? lead.stageEnteredAt,
          convertedAt: lead.convertedAt,
          journeyEvents,
          nextMeetingAt: lead.nextMeetingAt,
          meetingLink: lead.meetingLink,
          meetingNotes: lead.meetingNotes,
          meetingMode: lead.meetingMode,
          meetingLocation: lead.meetingLocation,
          meetingStatus: lead.meetingStatus,
          meetingConfirmedAt: lead.meetingConfirmedAt,
          meetingReminderAt: lead.meetingReminderAt,
          meetingReminderSentAt: lead.meetingReminderSentAt,
          meetingAttempts: lead.meetingAttempts?.map(attempt => ({
            id: attempt.id,
            at: attempt.at,
            actorLabel: actorLabelFor(attempt.actorUserId),
            channel: attempt.channel,
            outcome: attempt.outcome,
            notes: attempt.notes,
          })),
          salesPresentations: lead.salesPresentations,
          callRecordingUrl: lead.callRecordingUrl,
          sessionNotes: lead.sessionNotes,
          inspirationLinks: lead.inspirationLinks,
          potentialProblems: lead.potentialProblems,
          potentialSolutions: lead.potentialSolutions,
          pricePoints: lead.pricePoints,
          budgetRange: lead.budgetRange,
          designFeedback: lead.designFeedback,
          supportNotes: lead.supportNotes,
          existingServicePlan: typeof clientMetadata.portalServicePlan === "string" ? clientMetadata.portalServicePlan : undefined,
          existingProductId: services[0]?.id,
          existingProjectValue: typeof clientMetadata.agreedProjectValue === "string" ? clientMetadata.agreedProjectValue : undefined,
          existingBillingCadence: typeof clientMetadata.portalBillingCadence === "string" ? clientMetadata.portalBillingCadence : undefined,
          niche: typeof lead.customFields?.niche === "string"
            ? lead.customFields.niche
            : lead.tags.find(tag => tag.startsWith("niche:"))?.slice("niche:".length).replace(/-/g, " "),
          sentCount: lead.sentCount,
          columnId: columnByLeadId.get(lead.id) ?? pipeline.columns[0]?.id ?? "new",
          brandId,
          brandName: brandId ? brandById.get(brandId) ?? "Unknown brand" : undefined,
          serviceIds,
          serviceNames,
          customFields: lead.customFields ?? {},
          enquiryId: typeof lead.customFields?.enquiryId === "string" ? lead.customFields.enquiryId : undefined,
          enquiryClassification: lead.customFields?.enquiryClassification === "sales" ? "sales" : undefined,
        };
      })}
      importHref="/portal/agency/leads-pipeline/contacts"
      campaignsHref="/portal/agency/marketing"
      boards={boards}
      brands={brands.map(brand => ({ id: brand.id, name: brand.name }))}
      products={products.map(product => ({
        id: product.id,
        kind: product.kind,
        name: product.name,
        category: product.category,
        description: product.description ?? "",
        buyerHeadline: product.buyerHeadline,
        portalRequirement: product.portalRequirement,
        includedProductIds: product.includedProductIds,
        pricing: product.pricing,
        priceCents: product.priceCents,
        billingInterval: product.billingInterval,
      }))}
      customFields={getPortalFormFields(agencyId, "leads")}
    />
  );
}

function JourneyUnavailable({ detail }: { detail: string }) {
  return (
    <section className="border-y border-amber-200 bg-amber-50 px-4 py-5 text-amber-950">
      <h2 className="text-sm font-semibold">Journey workspace needs attention</h2>
      <p className="mt-1 text-sm text-amber-900/70">{detail} Refresh once the leads pipeline is available.</p>
    </section>
  );
}
