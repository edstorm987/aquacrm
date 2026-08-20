import "server-only";

import type { InboxSnapshot } from "@/lib/inbox/types";
import type { AdvisorCoverageSource, AdvisorDomain, BusinessSignalStatus, SpeedToLeadRadar } from "@/engines/data/radar/businessRadar";
import type { RadarObservation } from "@/engines/data/radar/radarCheckEngine";
import type { CommercialLifecycleSnapshot } from "@/lib/intelligence/commercialLifecycle";
import { RADAR_SIGNAL_FAMILIES } from "@/engines/data/radar/radarRuleCatalog";
import type { WebsiteEnquiry } from "@/lib/server/websiteEnquiries";
import type { OperationalAlert } from "@/lib/server/inbox/operationalAlerts";
import type { RadarTelemetrySnapshot } from "@/engines/data/server/radar/radarTelemetry";
import type { buildCompanyHealthSnapshot } from "@/engines/data/server/kpi/companyHealthSnapshot";
import type { LegalDocument, PortalState, ServerUser, AgencyTask, Client } from "@/server/types";
import { buildHiringCapacityAnalysis, buildHiringCapacitySignals } from "@/lib/performance/hiringCapacity";

const DAY = 86_400_000;
const HOUR = 3_600_000;

export interface RadarObservationInputs {
  now: number;
  state: PortalState;
  agencyId: string;
  company: Awaited<ReturnType<typeof buildCompanyHealthSnapshot>> | null;
  clients: Client[];
  tasks: AgencyTask[];
  legalDocuments: LegalDocument[];
  team: ServerUser[];
  enquiries: WebsiteEnquiry[];
  inbox: InboxSnapshot | null;
  operationalAlerts: OperationalAlert[];
  speedToLead: SpeedToLeadRadar;
  telemetry: RadarTelemetrySnapshot;
  coverage: AdvisorCoverageSource[];
  commercial: CommercialLifecycleSnapshot;
}

export function buildRadarObservations(input: RadarObservationInputs): RadarObservation[] {
  const { now, state, agencyId, company, clients, tasks, legalDocuments, team, enquiries, inbox, operationalAlerts, speedToLead, telemetry, coverage, commercial } = input;
  const observations: RadarObservation[] = [];
  const activeClients = clients.filter(client => client.status === "active" && client.stage !== "churned");
  const clientMetadata = activeClients.map(client => ({ client, metadata: client.metadata ?? {} }));
  const current7dEnquiries = enquiries.filter(enquiry => enquiry.submittedAt >= now - 7 * DAY);
  const previous7dEnquiries = enquiries.filter(enquiry => enquiry.submittedAt >= now - 14 * DAY && enquiry.submittedAt < now - 7 * DAY);
  const current30dEnquiries = enquiries.filter(enquiry => enquiry.submittedAt >= now - 30 * DAY);
  const previous30dEnquiries = enquiries.filter(enquiry => enquiry.submittedAt >= now - 60 * DAY && enquiry.submittedAt < now - 30 * DAY);
  const openEnquiries = enquiries.filter(enquiry => enquiry.status !== "resolved");
  const activity = state.activity.filter(entry => entry.agencyId === agencyId);
  const recentActivity = activity.filter(entry => entry.ts >= now - 7 * DAY);
  const previousActivity = activity.filter(entry => entry.ts >= now - 14 * DAY && entry.ts < now - 7 * DAY);
  const openTasks = tasks.filter(task => task.status !== "done");
  const overdueTasks = openTasks.filter(task => Boolean(task.dueAt && task.dueAt < now));
  const completed7d = tasks.filter(task => task.status === "done" && (task.completedAt ?? task.updatedAt) >= now - 7 * DAY);
  const completedPrevious7d = tasks.filter(task => task.status === "done" && (task.completedAt ?? task.updatedAt) >= now - 14 * DAY && (task.completedAt ?? task.updatedAt) < now - 7 * DAY);
  const milestones = Object.values(state.clientMilestones).filter(item => item.agencyId === agencyId);
  const pipelines = Object.values(state.pipelines).filter(item => item.agencyId === agencyId);
  const fulfilmentPipelines = pipelines.filter(item => item.kind === "fulfilment");
  const pipelineIds = new Set(pipelines.map(item => item.id));
  const fulfilmentIds = new Set(fulfilmentPipelines.map(item => item.id));
  const pipelineCards = Object.values(state.pipelineCards).filter(card => pipelineIds.has(card.pipelineId));
  const deliveryCards = pipelineCards.filter(card => fulfilmentIds.has(card.pipelineId));
  const workflows = Object.values(state.automationWorkflows).filter(item => item.agencyId === agencyId);
  const runs = Object.values(state.automationRuns).filter(item => item.agencyId === agencyId);
  const recentRuns = runs.filter(run => run.createdAt >= now - 7 * DAY);
  const installs = Object.values(state.pluginInstalls).filter(item => item.agencyId === agencyId && item.enabled);
  const integrations = Object.values(state.integrationConnections).filter(item => item.agencyId === agencyId);
  const portalInstances = Object.values(state.clientPortalInstances).filter(item => item.agencyId === agencyId);
  const marketingInstall = installs.find(item => item.pluginId === "agency-marketing");
  const financeInstall = installs.find(item => item.pluginId === "agency-finance");
  const leadInstall = installs.find(item => item.pluginId === "leads-pipeline");
  const financeAlerts = operationalAlerts.filter(alert => alert.category === "money" || alert.category === "compliance");
  const deliveryAlerts = operationalAlerts.filter(alert => alert.category === "client" || alert.category === "development" || alert.category === "outage");
  const peopleEmployees = Object.values(state.peopleEmployees).filter(employee => employee.agencyId === agencyId && employee.status !== "alumni");
  const profile = company?.profile;
  const capacityAvailable = profile ? profile.capacity.weeklyAvailableHours * (1 - profile.capacity.adminBufferPercent / 100) : 0;
  const capacityDemand = profile ? activeClients.length * profile.capacity.deliveryHoursPerActiveClient + company.actuals.meetingsThisMonth * profile.capacity.salesHoursPerCall : 0;
  const capacityPercent = capacityAvailable > 0 ? Math.round(capacityDemand / capacityAvailable * 100) : 0;
  const hiringCapacity = profile && company ? buildHiringCapacityAnalysis({
    capacity: profile.capacity,
    actuals: {
      monthlyRevenueTargetCents: profile.monthlyRevenueTargetCents,
      monthRevenueCents: company.actuals.monthRevenueCents,
      averageDealValueCents: profile.averageDealValueCents,
      salesCallCloseRatePercent: profile.salesCallCloseRatePercent,
      activeClients: company.actuals.activeClients,
      clientsNeedingAttention: company.actuals.clientsNeedingAttention,
      leadCount: company.actuals.leadCount,
      meetingsThisMonth: company.actuals.meetingsThisMonth,
      productCount: Object.values(state.agencyProducts).filter(product => product.agencyId === agencyId).length,
      legalCount: legalDocuments.length,
      financeConnected: company.actuals.financeConnected,
    },
    signals: buildHiringCapacitySignals({ tasks, people: peopleEmployees, now }),
  }) : null;
  const latestActivityAt = newest(activity.map(entry => entry.ts));
  const linkedEnquiries = current30dEnquiries.filter(enquiry => enquiry.leadId || enquiry.leadLinkedAt);
  const inboxThreads = inbox?.conversations ?? [];
  const inboxMessages = inboxThreads.flatMap(thread => thread.messages);
  const inboxConnections = inbox?.connections ?? [];
  const openThreads = inboxThreads.filter(thread => thread.status === "open");
  const latestInboxAt = newest([
    ...inboxThreads.map(thread => thread.lastMessageAt),
    ...inboxConnections.map(connection => connection.lastWebhookAt ?? connection.lastSyncAt),
  ]);
  const metadataArrays = clientMetadata.map(({ metadata }) => ({
    requests: arrayOfRecords(metadata.clientRequests),
    approvals: arrayOfRecords(metadata.portalApprovals),
    files: arrayOfRecords(metadata.files),
    products: arrayOfRecords(metadata.portalProducts),
    contracts: arrayOfRecords(metadata.contracts),
  }));
  const allRequests = metadataArrays.flatMap(item => item.requests);
  const allApprovals = metadataArrays.flatMap(item => item.approvals);
  const allFiles = metadataArrays.flatMap(item => item.files);
  const allProducts = metadataArrays.flatMap(item => item.products);
  const allContracts = metadataArrays.flatMap(item => item.contracts);
  const tradingCompanies = Object.values(state.tradingCompanies).filter(item => item.agencyId === agencyId);
  const coverageFor = (domain: AdvisorDomain) => coverage.filter(source => source.domain === domain);
  const domainConnected = (domain: AdvisorDomain) => coverageFor(domain).some(source => source.status === "connected" || source.status === "empty");
  const domainLastSeen = (domain: AdvisorDomain) => newest(coverageFor(domain).map(source => source.lastActivityAt));
  const add = (domain: AdvisorDomain, familyId: string, patch: MetricPatch) => observations.push(observation(domain, familyId, now, patch));

  const companyConnected = Boolean(company);
  add("company", "overall-health", metric(company?.health.overall ?? null, company?.health.overall ?? null, scoreStatus(company?.health.overall), `${company?.health.overall ?? "No"}/100`, "80 or above", "/portal/agency?station=battle", "company-health", companyConnected, "Combined executive health score.", now));
  add("company", "income-health", metric(company?.health.income ?? null, null, scoreStatus(company?.health.income), `${company?.health.income ?? "No"}/100`, "80 or above", "/portal/agency?station=battle", "company-income", companyConnected, "Revenue pace health.", now));
  add("company", "client-health", metric(company?.health.clients ?? null, null, scoreStatus(company?.health.clients), `${company?.health.clients ?? "No"}/100`, "80 or above", "/portal/clients?view=health", "company-clients", companyConnected, "Portfolio care health.", now));
  add("company", "pipeline-health", metric(company?.health.pipeline ?? null, null, scoreStatus(company?.health.pipeline), `${company?.health.pipeline ?? "No"}/100`, "80 or above", "/portal/clients?view=journey", "company-pipeline", companyConnected, "Commercial pipeline health.", now));
  add("company", "operations-health", metric(company?.health.operations ?? null, null, scoreStatus(company?.health.operations), `${company?.health.operations ?? "No"}/100`, "80 or above", "/portal/agency/actions", "company-operations", companyConnected, "Operating execution health.", now));
  add("company", "revenue-target", metric(company?.actuals.monthRevenueCents ?? null, null, company && profile?.monthlyRevenueTargetCents ? ratioStatus(company.actuals.monthRevenueCents, profile.monthlyRevenueTargetCents) : "unknown", money(company?.actuals.monthRevenueCents, company?.actuals.currency), money(profile?.monthlyRevenueTargetCents, company?.actuals.currency), "/portal/agency/agency-finance", "finance:revenue", companyConnected, "Revenue recorded against plan.", now, undefined, profile?.monthlyRevenueTargetCents ? Math.round(company!.actuals.monthRevenueCents / profile.monthlyRevenueTargetCents * 100) : undefined));
  add("company", "revenue-gap", metric(company?.revenueGapCents ?? null, null, company?.revenueGapCents ? "warning" : company ? "healthy" : "unknown", money(company?.revenueGapCents, company?.actuals.currency), "0 gap", "/portal/agency?station=battle", "company:revenue-gap", companyConnected, "Remaining revenue required this month.", now, undefined, company?.revenueGapCents));
  add("company", "objectives", metric(profile?.objectives.length ?? null, null, profile ? minimumStatus(profile.objectives.length, 1) : "unknown", String(profile?.objectives.length ?? 0), "At least 1 current objective", "/portal/agency?station=battle", "company:objectives", companyConnected, "Strategic objective register.", profile?.updatedAt || now, profile?.objectives.length));
  add("company", "plans", metric(profile?.plans.filter(plan => !["complete", "paused"].includes(plan.status)).length ?? null, null, profile ? minimumStatus(profile.plans.length, 1) : "unknown", String(profile?.plans.length ?? 0), "At least 1 active plan", "/portal/agency?station=battle", "company:plans", companyConnected, "Business plan register.", profile?.updatedAt || now, profile?.plans.length));
  add("company", "capacity", metric(capacityPercent, null, capacityPercent >= (profile?.capacity.hiringTriggerPercent ?? 85) ? "warning" : company ? "healthy" : "unknown", `${capacityPercent}%`, `Below ${profile?.capacity.hiringTriggerPercent ?? 85}%`, "/portal/agency?station=battle", "company:capacity", companyConnected, "Estimated weekly delivery and sales demand against usable hours.", profile?.updatedAt || now, activeClients.length, capacityPercent, "lower"));
  add("company", "trading-companies", metric(tradingCompanies.length, null, "healthy", String(tradingCompanies.length), "Every operating company recorded", "/portal/agency?station=battle", "company:trading-companies", true, "Trading company register.", newest(tradingCompanies.map(item => item.updatedAt)) ?? now, tradingCompanies.length));
  add("company", "direction-profile", metric(profile ? Number(Boolean(profile.mission)) + Number(Boolean(profile.vision)) + Number(profile.values.length > 0) : null, null, profile ? minimumStatus(Number(Boolean(profile.mission)) + Number(Boolean(profile.vision)) + Number(profile.values.length > 0), 3) : "unknown", profile ? `${Number(Boolean(profile.mission)) + Number(Boolean(profile.vision)) + Number(profile.values.length > 0)}/3` : "Not available", "Mission, vision and values complete", "/portal/agency?station=battle", "company:direction", companyConnected, "Company direction and executive context.", profile?.updatedAt || now, 3));
  const activeOwners = profile?.capital.shareholders.filter(item => item.status === "active") ?? [];
  const issuedByClass = new Map<string, number>();
  activeOwners.forEach(item => issuedByClass.set(item.shareClassId, (issuedByClass.get(item.shareClassId) ?? 0) + item.shares));
  const overIssuedClasses = profile?.capital.shareClasses.filter(item => (issuedByClass.get(item.id) ?? 0) > item.authorisedShares).length ?? 0;
  const staleInvestmentValuations = profile?.capital.investments.filter(item => item.status === "active" && (!item.valuedAt || now - item.valuedAt > 90 * DAY)).length ?? 0;
  const overdueDividendObligations = profile?.capital.dividends.filter(item => item.status !== "cancelled" && item.paymentDueAt && item.paymentDueAt < now && item.paidCents < item.declaredCents).length ?? 0;
  const unlinkedCapitalApprovals = profile ? profile.capital.transactions.filter(item => (item.status === "approved" || item.status === "completed") && !item.approvalId).length + profile.capital.dividends.filter(item => item.status !== "draft" && item.status !== "cancelled" && !item.approvalId).length : 0;
  add("company", "ownership-register", metric(profile ? activeOwners.length : null, null, profile ? minimumStatus(activeOwners.length, 1) : "unknown", String(activeOwners.length), "At least 1 active shareholder", "/portal/agency?station=battle&battle=capital", "company:capital", companyConnected, "Authoritative active shareholder register.", profile?.updatedAt || now, activeOwners.length));
  add("company", "share-authority", zeroTargetMetric(overIssuedClasses, "Share classes whose issued balance exceeds retained authority.", "/portal/agency?station=battle&battle=capital", "company:capital", companyConnected, profile?.updatedAt || now, 1, 1));
  add("company", "capital-ledger", countMetric(profile?.capital.transactions.length ?? 0, null, "Retained capital contributions, loans, issues, transfers, repayments, and buybacks.", "/portal/agency?station=battle&battle=capital", "company:capital", companyConnected, profile?.updatedAt || now, "neutral"));
  add("company", "investment-valuations", zeroTargetMetric(staleInvestmentValuations, "Active company-held investments with no valuation or a valuation older than 90 days.", "/portal/agency?station=battle&battle=capital", "company:capital", companyConnected, profile?.updatedAt || now, 1, 3));
  add("company", "dividend-obligations", zeroTargetMetric(overdueDividendObligations, "Declared dividend payments beyond their retained due date.", "/portal/agency?station=battle&battle=capital", "company:capital", companyConnected, profile?.updatedAt || now, 1, 1));
  add("company", "capital-governance", zeroTargetMetric(unlinkedCapitalApprovals, "Approved or completed capital records without a linked governance decision.", "/portal/agency?station=battle&battle=capital", "company:capital", companyConnected, profile?.updatedAt || now, 1, 3));

  add("sales", "enquiries-24h", countMetric(enquiries.filter(item => item.submittedAt >= now - DAY).length, enquiries.filter(item => item.submittedAt >= now - 2 * DAY && item.submittedAt < now - DAY).length, "Demand received in the last day.", "/portal/agency/inbox?view=forms", "sales:enquiries", enquiryConnected(enquiries), latest(enquiries), "higher"));
  add("sales", "enquiries-7d", countMetric(current7dEnquiries.length, previous7dEnquiries.length, "Weekly inbound enquiry volume.", "/portal/agency/inbox?view=forms", "sales:enquiries", enquiryConnected(enquiries), latest(enquiries), "higher"));
  add("sales", "enquiries-30d", countMetric(current30dEnquiries.length, previous30dEnquiries.length, "Rolling monthly enquiry volume.", "/portal/agency/inbox?view=forms", "sales:enquiries", enquiryConnected(enquiries), latest(enquiries), "higher"));
  add("sales", "form-enquiries", countMetric(current30dEnquiries.filter(item => item.channel === "form").length, previous30dEnquiries.filter(item => item.channel === "form").length, "Website form demand.", "/portal/agency/inbox?view=forms", "sales:forms", enquiryConnected(enquiries), latest(enquiries), "higher"));
  add("sales", "chatbot-enquiries", countMetric(current30dEnquiries.filter(item => item.channel === "chatbot").length, previous30dEnquiries.filter(item => item.channel === "chatbot").length, "Chatbot demand.", "/portal/agency/inbox?view=chatbot", "sales:chatbot", enquiryConnected(enquiries), latest(enquiries), "higher"));
  add("sales", "urgent-enquiries", zeroTargetMetric(openEnquiries.filter(item => item.priority === "urgent").length, "Urgent unresolved enquiries.", "/portal/agency/inbox?view=forms", "sales:urgent", enquiryConnected(enquiries), latest(openEnquiries), 1, 3));
  add("sales", "median-response", durationMetric(speedToLead.medianResponseMs, speedToLead.status, speedToLead.targetMinutes * 60_000, "Typical first response time.", "/portal/agency/inbox?view=forms", "sales:response", enquiryConnected(enquiries), latest(enquiries)));
  add("sales", "p90-response", durationMetric(speedToLead.p90ResponseMs, speedToLead.status, speedToLead.targetMinutes * 60_000, "P90 first response time.", "/portal/agency/inbox?view=forms", "sales:response", enquiryConnected(enquiries), latest(enquiries)));
  add("sales", "awaiting-response", zeroTargetMetric(speedToLead.awaitingResponseCount, "Open leads without a first response.", "/portal/agency/inbox?view=forms", "sales:response", enquiryConnected(enquiries), latest(openEnquiries), 1, 4));
  add("sales", "target-breaches", zeroTargetMetric(speedToLead.breachedCount, "Leads outside the response target.", "/portal/agency/inbox?view=forms", "sales:response", enquiryConnected(enquiries), latest(openEnquiries), 1, 4));
  add("sales", "pipeline-leads", metric(commercial.leadCount, null, commercial.available ? "healthy" : "unknown", String(commercial.leadCount), "Pipeline connected", "/portal/agency/pipelines/leads", "sales:pipeline", commercial.available, "Lead records available to the pipeline.", commercial.latestActivityAt ?? leadInstall?.installedAt ?? now, commercial.leadCount, undefined, "higher"));
  add("sales", "enquiry-linkage", percentMetric(current30dEnquiries.length ? Math.round(linkedEnquiries.length / current30dEnquiries.length * 100) : null, 90, "Enquiries linked to a lead record.", "/portal/clients?view=journey", "sales:linkage", enquiryConnected(enquiries), latest(enquiries)));
  // Tag → Radar (aqua-tag plan Phase 5): how many tagged sites point their
  // enquiries at a specific client/company vs the agency catch-all. Informational
  // — the catch-all is a valid choice for the owner's own sites, so this is a
  // watched routing-coverage baseline (feeding trend/evidence), never a false
  // "route it!" alarm; it stays connected (readable in-state) even at zero so it
  // is never a blind spot. See server/websiteSources.
  const agencyWebsiteSources = Object.values(state.websiteSources ?? {}).filter(source => source.agencyId === agencyId);
  const routedWebsiteSources = agencyWebsiteSources.filter(source => source.destinationClientId || source.destinationCompanyId).length;
  add("sales", "enquiry-routing", countMetric(routedWebsiteSources, null, `${routedWebsiteSources} of ${agencyWebsiteSources.length} tagged site${agencyWebsiteSources.length === 1 ? "" : "s"} route enquiries to a specific client or company; the rest land in the agency catch-all.`, "/portal/agency/fulfilment?view=tags", "sales:routing", true, now));
  add("sales", "lead-conversion-rate", metric(commercial.conversionRatePercent, null, higherRateStatus(commercial.conversionRatePercent, commercial.leadCount, 5, 20, 10), displayPercent(commercial.conversionRatePercent), "20% or above after 5 leads", "/portal/clients?view=journey", "commercial:lifecycle", commercial.available, "Lead capture through to recorded client conversion.", commercial.latestActivityAt, commercial.leadCount, undefined, "higher"));
  add("sales", "lost-decision-rate", metric(commercial.lostDecisionRatePercent, null, lowerRateStatus(commercial.lostDecisionRatePercent, commercial.convertedLeadCount + commercial.lostLeadCount, 5, 35, 60), displayPercent(commercial.lostDecisionRatePercent), "Below 35% of closed decisions", "/portal/clients?view=journey", "commercial:lifecycle", commercial.available, "Lost outcomes among leads with a recorded won or lost decision.", commercial.latestActivityAt, commercial.convertedLeadCount + commercial.lostLeadCount, undefined, "lower"));
  add("sales", "stale-open-leads", zeroTargetMetric(commercial.staleOpenLeadCount, "Open leads untouched for at least 14 days.", "/portal/clients?view=journey", "commercial:lifecycle", commercial.available, commercial.latestActivityAt, 1, 5));
  add("sales", "conversion-cycle", metric(commercial.medianConversionMs, null, commercial.convertedLeadCount < 3 ? "unknown" : commercial.medianConversionMs && commercial.medianConversionMs >= 90 * DAY ? "critical" : commercial.medianConversionMs && commercial.medianConversionMs >= 45 * DAY ? "warning" : "healthy", commercial.medianConversionMs === null ? "Learning" : duration(commercial.medianConversionMs), "Median below 45 days", "/portal/clients?view=journey", "commercial:lifecycle", commercial.available, "Median elapsed time from lead capture to client conversion.", commercial.latestActivityAt, commercial.convertedLeadCount, undefined, "lower"));
  add("sales", "source-conversion-spread", metric(commercial.conversionSpreadPercent, null, lowerRateStatus(commercial.conversionSpreadPercent, commercial.cohorts.filter(cohort => cohort.conversionSampleReady).length, 2, 35, 60), displayPercent(commercial.conversionSpreadPercent), "Below 35 percentage points", "/portal/agency/marketing", "commercial:lifecycle", commercial.available, "Conversion performance spread across mature lead-source cohorts.", commercial.latestActivityAt, commercial.cohorts.filter(cohort => cohort.conversionSampleReady).length, undefined, "lower"));

  add("inbox", "conversation-volume", countMetric(inboxThreads.length, null, "Connected social conversation volume.", "/portal/agency/inbox", "inbox:conversations", Boolean(inbox), latestInboxAt, "higher"));
  add("inbox", "open-conversations", zeroTargetMetric(openThreads.length, "Conversations still open.", "/portal/agency/inbox", "inbox:open", Boolean(inbox), latestInboxAt, 8, 20));
  add("inbox", "unread-messages", zeroTargetMetric(inboxThreads.reduce((total, thread) => total + thread.unreadCount, 0), "Unread social messages.", "/portal/agency/inbox", "inbox:unread", Boolean(inbox), latestInboxAt, 5, 20));
  add("inbox", "response-overdue", zeroTargetMetric(openThreads.filter(thread => thread.responseDueAt && thread.responseDueAt < now).length, "Conversations beyond response due time.", "/portal/agency/inbox", "inbox:response-due", Boolean(inbox), latestInboxAt, 1, 5));
  add("inbox", "unassigned-conversations", zeroTargetMetric(openThreads.filter(thread => !thread.assignedTo).length, "Open conversations without an owner.", "/portal/agency/inbox", "inbox:assignment", Boolean(inbox), latestInboxAt, 1, 5));
  add("inbox", "failed-messages", zeroTargetMetric(inboxMessages.filter(message => message.status === "failed").length, "Outbound messages that failed.", "/portal/agency/inbox", "inbox:delivery", Boolean(inbox), newest(inboxMessages.map(message => message.updatedAt)), 1, 3));
  add("inbox", "channel-connections", metric(inboxConnections.filter(connection => connection.status === "connected").length, null, inboxConnections.length && inboxConnections.every(connection => connection.status === "connected") ? "healthy" : inboxConnections.length ? "warning" : "unknown", `${inboxConnections.filter(connection => connection.status === "connected").length}/${inboxConnections.length}`, "Every configured channel connected", "/portal/agency/inbox?view=connections", "inbox:connections", Boolean(inbox), "Connected social channels.", newest(inboxConnections.map(connection => connection.updatedAt)) ?? now, inboxConnections.length));
  add("inbox", "connection-errors", zeroTargetMetric(inboxConnections.filter(connection => connection.status === "needs-attention" || connection.lastError).length, "Channel authentication and connection errors.", "/portal/agency/inbox?view=connections", "inbox:connections", Boolean(inbox), latestInboxAt, 1, 2));
  add("inbox", "webhook-health", metric(inboxConnections.filter(connection => connection.webhookStatus === "subscribed").length, null, inboxConnections.length && inboxConnections.every(connection => connection.webhookStatus === "subscribed") ? "healthy" : inboxConnections.length ? "warning" : "unknown", `${inboxConnections.filter(connection => connection.webhookStatus === "subscribed").length}/${inboxConnections.length}`, "Every connected channel subscribed", "/portal/agency/inbox?view=connections", "inbox:webhooks", Boolean(inbox), "Inbound webhook subscription coverage.", latestInboxAt ?? now, inboxConnections.length));
  add("inbox", "sync-freshness", metric(latestInboxAt ? now - latestInboxAt : null, null, latestInboxAt && now - latestInboxAt > 2 * DAY ? "warning" : latestInboxAt ? "healthy" : "unknown", latestInboxAt ? `${Math.round((now - latestInboxAt) / HOUR)}h ago` : "No sync", "Within 48h", "/portal/agency/inbox?view=connections", "inbox:sync", Boolean(inbox), "Age of latest inbox sync or message.", latestInboxAt ?? now, inboxThreads.length, undefined, "lower"));
  add("inbox", "support-demand", zeroTargetMetric(openEnquiries.filter(enquiry => enquiry.channel === "support").length + allRequests.filter(request => clean(request.status) === "open").length, "Open support demand.", "/portal/agency/inbox?view=support", "inbox:support", Boolean(inbox) || enquiryConnected(enquiries), latest(openEnquiries), 4, 10));
  add("inbox", "notification-delivery", zeroTargetMetric(enquiries.filter(enquiry => enquiry.notification === "failed").length, "Failed internal enquiry notifications.", "/portal/agency/inbox?view=forms", "inbox:notifications", enquiryConnected(enquiries), latest(enquiries), 1, 3));

  const clientsWithTelemetry = activeClients.filter(client => Array.isArray(client.metadata?.telemetryEvents) && (client.metadata?.telemetryEvents as unknown[]).length > 0).length;
  const missingOwners = activeClients.filter(client => !client.ownerEmail).length;
  const staleContacts = activeClients.filter(client => !numeric(client.metadata?.lastContactedAt) || now - numeric(client.metadata?.lastContactedAt)! > 14 * DAY).length;
  const clientsWithProducts = clientMetadata.filter(({ metadata }) => arrayOfRecords(metadata.portalProducts).length > 0).length;
  add("clients", "active-clients", countMetric(activeClients.length, null, "Active client portfolio.", "/portal/clients", "clients:active", true, newest(activeClients.map(client => client.updatedAt)), "higher"));
  add("clients", "attention-clients", zeroTargetMetric(company?.actuals.clientsNeedingAttention ?? 0, "Clients with a current health concern.", "/portal/clients?view=health", "clients:attention", true, newest(activeClients.map(client => client.updatedAt)), 1, Math.max(3, Math.ceil(activeClients.length / 2))));
  add("clients", "owner-coverage", percentMetric(activeClients.length ? Math.round((activeClients.length - missingOwners) / activeClients.length * 100) : null, 100, "Active clients with an owner email.", "/portal/clients", "clients:owners", true, newest(activeClients.map(client => client.updatedAt))));
  add("clients", "contact-freshness", zeroTargetMetric(staleContacts, "Clients not contacted within 14 days.", "/portal/clients?view=health", "clients:contact", true, newest(activeClients.map(client => numeric(client.metadata?.lastContactedAt))), 1, Math.max(3, Math.ceil(activeClients.length / 2))));
  add("clients", "telemetry-coverage", percentMetric(activeClients.length ? Math.round(clientsWithTelemetry / activeClients.length * 100) : null, 100, "Active clients with reporting telemetry.", "/portal/agency/fulfilment/technical/performance", "clients:telemetry", true, telemetry.totals.latestEventAt));
  add("clients", "telemetry-freshness", metric(telemetry.totals.latestEventAt ? now - telemetry.totals.latestEventAt : null, null, telemetry.totals.latestEventAt && now - telemetry.totals.latestEventAt <= 2 * DAY ? "healthy" : telemetry.totals.properties ? "warning" : "unknown", telemetry.totals.latestEventAt ? `${Math.round((now - telemetry.totals.latestEventAt) / HOUR)}h ago` : "No events", "Within 48h", "/portal/agency/fulfilment/technical/performance", "clients:telemetry", telemetry.totals.properties > 0, "Latest client or agency property activity.", telemetry.totals.latestEventAt ?? now, telemetry.totals.properties, undefined, "lower"));
  add("clients", "production-errors", zeroTargetMetric(telemetry.properties.filter(property => property.clientId).reduce((total, property) => total + property.errors24h, 0), "Client production errors in 24 hours.", "/portal/agency/fulfilment/technical/performance", "clients:errors", telemetry.totals.properties > 0, telemetry.totals.latestEventAt, 1, 5));
  add("clients", "open-requests", zeroTargetMetric(allRequests.filter(request => ["open", "reviewed"].includes(clean(request.status))).length, "Open client requests.", "/portal/agency/inbox?view=support", "clients:requests", true, newest(allRequests.map(item => timestamp(item))), 5, 15));
  add("clients", "blocked-milestones", zeroTargetMetric(milestones.filter(item => item.status === "blocked").length, "Blocked client milestones.", "/portal/agency/fulfilment/technical/performance", "clients:milestones", true, newest(milestones.map(item => item.updatedAt)), 1, 4));
  add("clients", "product-coverage", percentMetric(activeClients.length ? Math.round(clientsWithProducts / activeClients.length * 100) : null, 100, "Active clients with products assigned.", "/portal/agency/products", "clients:products", true, newest(activeClients.map(client => client.updatedAt))));
  add("clients", "source-attribution", percentMetric(commercial.clientSourceCoveragePercent, 85, "Clients traceable to their original lead source.", "/portal/clients?view=journey", "commercial:lifecycle", commercial.available, commercial.latestActivityAt));
  add("clients", "retention-state", metric(commercial.retentionRatePercent, null, higherRateStatus(commercial.retentionRatePercent, commercial.activeClientCount + commercial.churnedClientCount, 3, 80, 60), displayPercent(commercial.retentionRatePercent), "80% or above", "/portal/clients?view=health", "commercial:lifecycle", commercial.available, "Active clients as a share of active plus recorded churned relationships.", commercial.latestActivityAt, commercial.activeClientCount + commercial.churnedClientCount, undefined, "higher"));
  add("clients", "recent-client-churn", zeroTargetMetric(commercial.recentlyChurnedClientCount, "Clients marked churned or archived in 90 days.", "/portal/clients?view=health", "commercial:lifecycle", commercial.available, commercial.latestActivityAt, 1, 3));
  add("clients", "pending-cancellations", zeroTargetMetric(commercial.pendingCancellationCount, "Open cancellation and provider-move requests.", "/portal/agency/inbox?view=support", "commercial:lifecycle", commercial.available, commercial.latestActivityAt, 1, 1));
  add("clients", "source-churn-spread", metric(commercial.churnSpreadPercent, null, lowerRateStatus(commercial.churnSpreadPercent, commercial.cohorts.filter(cohort => cohort.retentionSampleReady).length, 2, 20, 40), displayPercent(commercial.churnSpreadPercent), "Below 20 percentage points", "/portal/agency/marketing", "commercial:lifecycle", commercial.available, "Recorded churn spread across mature acquisition-source cohorts.", commercial.latestActivityAt, commercial.cohorts.filter(cohort => cohort.retentionSampleReady).length, undefined, "lower"));

  const alertCount = (pattern: RegExp) => financeAlerts.filter(alert => pattern.test(alert.id)).length;
  add("finance", "monthly-revenue", metric(company?.actuals.monthRevenueCents ?? null, null, financeInstall ? "healthy" : "unknown", money(company?.actuals.monthRevenueCents, company?.actuals.currency), "Recorded monthly income", "/portal/agency/agency-finance", "finance:revenue", Boolean(financeInstall), "Current month recorded revenue.", now));
  add("finance", "mrr", metric(company?.actuals.mrrCents ?? null, null, financeInstall ? "healthy" : "unknown", money(company?.actuals.mrrCents, company?.actuals.currency), "Tracked recurring baseline", "/portal/agency/agency-finance", "finance:mrr", Boolean(financeInstall), "Monthly recurring revenue.", now));
  add("finance", "target-progress", metric(profile?.monthlyRevenueTargetCents ? Math.round((company?.actuals.monthRevenueCents ?? 0) / profile.monthlyRevenueTargetCents * 100) : null, null, profile?.monthlyRevenueTargetCents ? ratioStatus(company?.actuals.monthRevenueCents ?? 0, profile.monthlyRevenueTargetCents) : "unknown", profile?.monthlyRevenueTargetCents ? `${Math.round((company?.actuals.monthRevenueCents ?? 0) / profile.monthlyRevenueTargetCents * 100)}%` : "No target", "100% monthly target", "/portal/agency/agency-finance/planning", "finance:target", Boolean(financeInstall), "Revenue pace against target.", now, undefined, undefined, "higher"));
  add("finance", "cash-gap", metric(company?.revenueGapCents ?? null, null, company?.revenueGapCents ? "warning" : financeInstall ? "healthy" : "unknown", money(company?.revenueGapCents, company?.actuals.currency), "0 gap", "/portal/agency/agency-finance/planning", "finance:gap", Boolean(financeInstall), "Revenue gap against plan.", now, undefined, undefined, "lower"));
  add("finance", "overdue-invoices", zeroTargetMetric(alertCount(/overdue-invoices|invoice:/), "Overdue invoice alerts.", "/portal/agency/agency-finance/invoices?status=overdue", "finance:invoices", Boolean(financeInstall), newest(financeAlerts.map(alert => alert.occurredAt)), 1, 3));
  add("finance", "budget-pressure", zeroTargetMetric(alertCount(/budget-/), "Budget pots under pressure.", "/portal/agency/agency-finance/budgets", "finance:budgets", Boolean(financeInstall), newest(financeAlerts.map(alert => alert.occurredAt)), 1, 3));
  add("finance", "obligations", zeroTargetMetric(alertCount(/obligations/), "Finance and legal obligations requiring attention.", "/portal/agency/agency-finance/operations", "finance:obligations", Boolean(financeInstall), newest(financeAlerts.map(alert => alert.occurredAt)), 1, 3));
  add("finance", "people-payments", zeroTargetMetric(alertCount(/people-payments/), "People payments due or overdue.", "/portal/agency/agency-finance/operations", "finance:people", Boolean(financeInstall), newest(financeAlerts.map(alert => alert.occurredAt)), 1, 3));
  add("finance", "expense-evidence", zeroTargetMetric(alertCount(/expense-evidence/), "Paid expenses missing evidence.", "/portal/agency/agency-finance/expenses?evidence=missing", "finance:evidence", Boolean(financeInstall), newest(financeAlerts.map(alert => alert.occurredAt)), 1, 5));
  add("finance", "recurring-costs", zeroTargetMetric(alertCount(/recurring-expenses/), "Recurring costs due for posting.", "/portal/agency/agency-finance/expenses?recurring=recurring", "finance:recurring", Boolean(financeInstall), newest(financeAlerts.map(alert => alert.occurredAt)), 1, 5));
  add("finance", "currency-coverage", metric(company?.actuals.currency ? 1 : null, null, company?.actuals.currency ? "healthy" : "unknown", company?.actuals.currency?.toUpperCase() ?? "Not set", "Reporting currency configured", "/portal/agency/agency-finance/settings", "finance:currency", Boolean(financeInstall), "Base reporting currency.", now, 1));
  add("finance", "finance-records", metric(financeInstall ? pluginRecordCount(state, financeInstall.id) : null, null, financeInstall ? "healthy" : "unknown", String(financeInstall ? pluginRecordCount(state, financeInstall.id) : 0), "Finance module connected", "/portal/agency/agency-finance", "finance:records", Boolean(financeInstall), "Finance records readable by the radar.", financeInstall?.healthCheckedAt ?? financeInstall?.installedAt ?? now));

  const stalledDeliveryCards = deliveryCards.filter(card => now - card.updatedAt > 7 * DAY).length;
  const overdueMilestones = milestones.filter(item => item.targetAt && item.targetAt < now && item.status !== "complete").length;
  add("delivery", "fulfilment-pipelines", countMetric(fulfilmentPipelines.length, null, "Configured fulfilment pipelines.", "/portal/agency/fulfilment", "delivery:pipelines", domainConnected("delivery"), domainLastSeen("delivery"), "higher"));
  add("delivery", "delivery-cards", countMetric(deliveryCards.length, null, "Delivery work in flight.", "/portal/agency/fulfilment", "delivery:cards", domainConnected("delivery"), newest(deliveryCards.map(card => card.updatedAt)), "neutral"));
  add("delivery", "stalled-cards", zeroTargetMetric(stalledDeliveryCards, "Delivery cards unchanged for 7 days.", "/portal/agency/fulfilment", "delivery:cards", domainConnected("delivery"), newest(deliveryCards.map(card => card.updatedAt)), 1, 5));
  add("delivery", "milestones", countMetric(milestones.length, null, "Tracked client milestones.", "/portal/agency/fulfilment/technical/performance", "delivery:milestones", true, newest(milestones.map(item => item.updatedAt)), "higher"));
  add("delivery", "blocked-milestones", zeroTargetMetric(milestones.filter(item => item.status === "blocked").length, "Blocked delivery milestones.", "/portal/agency/fulfilment/technical/performance", "delivery:milestones", true, newest(milestones.map(item => item.updatedAt)), 1, 4));
  add("delivery", "overdue-milestones", zeroTargetMetric(overdueMilestones, "Milestones beyond target date.", "/portal/agency/fulfilment/technical/performance", "delivery:milestones", true, newest(milestones.map(item => item.updatedAt)), 1, 4));
  add("delivery", "product-assignments", countMetric(allProducts.length, null, "Products attached to client portals.", "/portal/agency/products", "delivery:products", true, newest(activeClients.map(client => client.updatedAt)), "higher"));
  add("delivery", "pending-approvals", zeroTargetMetric(allApprovals.filter(item => clean(item.status) === "pending").length, "Pending client approvals.", "/portal/agency/fulfilment", "delivery:approvals", true, newest(allApprovals.map(item => timestamp(item))), 5, 15));
  add("delivery", "open-requests", zeroTargetMetric(allRequests.filter(item => ["open", "reviewed"].includes(clean(item.status))).length, "Open delivery requests.", "/portal/agency/fulfilment", "delivery:requests", true, newest(allRequests.map(item => timestamp(item))), 5, 15));
  add("delivery", "deliverables", countMetric(allFiles.filter(item => ["deliverable", "preview"].includes(clean(item.category))).length, null, "Recorded deliverable files.", "/portal/agency/fulfilment", "delivery:files", true, newest(allFiles.map(item => timestamp(item))), "higher"));
  add("delivery", "portal-readiness", metric(portalInstances.length, null, activeClients.length && portalInstances.length < activeClients.length ? "watch" : "healthy", `${portalInstances.length}/${activeClients.length}`, "Portal available where required", "/portal/agency/portals", "delivery:portals", true, "Client portal instance coverage.", newest(portalInstances.map(item => item.updatedAt)) ?? now, activeClients.length));
  add("delivery", "delivery-alerts", zeroTargetMetric(deliveryAlerts.length, "Current delivery and development alerts.", "/portal/agency/fulfilment", "delivery:alerts", true, newest(deliveryAlerts.map(alert => alert.occurredAt)), 3, 8));

  const trafficChangePercent = telemetry.totals.previousPageviews7d ? Math.round((telemetry.totals.pageviews7d - telemetry.totals.previousPageviews7d) / telemetry.totals.previousPageviews7d * 100) : null;
  const attributedEnquiries = current30dEnquiries.filter(enquiry => enquiry.campaign || enquiry.sourceUrl).length;
  add("marketing", "traffic-24h", countMetric(telemetry.totals.pageviews24h, null, "Pageviews in the last 24 hours.", "/portal/agency/fulfilment/technical/performance", "marketing:traffic", telemetry.totals.properties > 0, telemetry.totals.latestEventAt, "higher"));
  add("marketing", "traffic-7d", countMetric(telemetry.totals.pageviews7d, telemetry.totals.previousPageviews7d, "Pageviews in the current 7-day window.", "/portal/agency/fulfilment/technical/performance", "marketing:traffic", telemetry.totals.properties > 0, telemetry.totals.latestEventAt, "higher"));
  add("marketing", "traffic-change", metric(trafficChangePercent, null, trafficChangePercent === null ? "unknown" : trafficChangePercent <= -50 ? "warning" : "healthy", trafficChangePercent === null ? "No comparison" : `${trafficChangePercent > 0 ? "+" : ""}${trafficChangePercent}%`, "Stable or growing", "/portal/agency/fulfilment/technical/performance", "marketing:traffic", telemetry.totals.properties > 0, "Traffic change against the preceding 7 days.", telemetry.totals.latestEventAt ?? now, telemetry.totals.pageviews7d + telemetry.totals.previousPageviews7d, undefined, "higher"));
  add("marketing", "traffic-surges", countMetric(telemetry.totals.trafficSurges, null, "Properties with traffic above the surge guardrail.", "/portal/agency/fulfilment/technical/performance", "marketing:surges", telemetry.totals.properties > 0, telemetry.totals.latestEventAt, "neutral"));
  add("marketing", "traffic-drops", zeroTargetMetric(telemetry.totals.trafficDrops, "Properties with a material traffic drop.", "/portal/agency/fulfilment/technical/performance", "marketing:drops", telemetry.totals.properties > 0, telemetry.totals.latestEventAt, 1, 3));
  add("marketing", "form-submissions", countMetric(telemetry.totals.forms7d, null, "Tracked forms submitted in 7 days.", "/portal/agency/fulfilment/technical/performance", "marketing:forms", telemetry.totals.properties > 0, telemetry.totals.latestEventAt, "higher"));
  add("marketing", "conversions", countMetric(telemetry.totals.conversions7d, null, "Tracked conversion events in 7 days.", "/portal/agency/fulfilment/technical/performance", "marketing:conversions", telemetry.totals.properties > 0, telemetry.totals.latestEventAt, "higher"));
  add("marketing", "conversion-rate", percentMetric(telemetry.totals.pageviews7d ? Math.round(telemetry.totals.conversions7d / telemetry.totals.pageviews7d * 10_000) / 100 : null, 1, "Conversions as a share of pageviews.", "/portal/agency/fulfilment/technical/performance", "marketing:conversion-rate", telemetry.totals.properties > 0, telemetry.totals.latestEventAt));
  add("marketing", "campaign-attribution", percentMetric(current30dEnquiries.length ? Math.round(attributedEnquiries / current30dEnquiries.length * 100) : null, 80, "Enquiries with campaign or source context.", "/portal/agency/marketing", "marketing:attribution", enquiryConnected(enquiries), latest(enquiries)));
  add("marketing", "unattributed-leads", zeroTargetMetric(Math.max(0, current30dEnquiries.length - attributedEnquiries), "Recent enquiries without attribution.", "/portal/agency/marketing", "marketing:attribution", enquiryConnected(enquiries), latest(enquiries), 3, 10));
  add("marketing", "search-visibility", metric(telemetry.totals.searchClicks28d, null, telemetry.totals.searchImpressions28d ? "healthy" : "unknown", `${telemetry.totals.searchClicks28d} clicks / ${telemetry.totals.searchImpressions28d} impressions`, "Search data connected", "/portal/agency/fulfilment/technical/performance", "marketing:search", telemetry.totals.properties > 0, "Search Console visibility.", telemetry.totals.latestEventAt ?? now, telemetry.totals.searchImpressions28d, undefined, "higher"));
  add("marketing", "campaign-records", metric(marketingInstall ? pluginRecordCount(state, marketingInstall.id) : null, null, marketingInstall ? "healthy" : "unknown", String(marketingInstall ? pluginRecordCount(state, marketingInstall.id) : 0), "Marketing module connected", "/portal/agency/marketing", "marketing:campaigns", Boolean(marketingInstall), "Campaign and channel records readable by the radar.", marketingInstall?.healthCheckedAt ?? marketingInstall?.installedAt ?? now));
  add("marketing", "lead-source-attribution", metric(commercial.leadCount ? Math.round((commercial.leadCount - commercial.unattributedLeadCount) / commercial.leadCount * 1000) / 10 : null, null, lowerRateStatus(commercial.leadCount ? commercial.unattributedLeadCount / commercial.leadCount * 100 : null, commercial.leadCount, 3, 15, 40), commercial.leadCount ? `${Math.round((commercial.leadCount - commercial.unattributedLeadCount) / commercial.leadCount * 1000) / 10}%` : "Learning", "85% or above", "/portal/agency/marketing", "commercial:lifecycle", commercial.available, "Retained leads with a usable acquisition source.", commercial.latestActivityAt, commercial.leadCount, undefined, "higher"));
  add("marketing", "source-concentration", metric(commercial.sourceConcentrationPercent, null, lowerRateStatus(commercial.sourceConcentrationPercent, commercial.leadCount, 10, 70, 85), displayPercent(commercial.sourceConcentrationPercent), "No source above 70%", "/portal/agency/marketing", "commercial:lifecycle", commercial.available, "Share of all leads contributed by the largest source cohort.", commercial.latestActivityAt, commercial.leadCount, undefined, "lower"));
  add("marketing", "source-outcome-depth", countMetric(commercial.cohorts.filter(cohort => cohort.conversionSampleReady).length, null, "Lead sources with enough retained leads for conversion comparison.", "/portal/agency/marketing", "commercial:lifecycle", commercial.available, commercial.latestActivityAt, "higher"));

  add("operations", "open-tasks", zeroTargetMetric(openTasks.length, "Open task volume.", "/portal/agency/actions", "operations:tasks", true, newest(tasks.map(task => task.updatedAt)), 20, 50));
  add("operations", "overdue-tasks", zeroTargetMetric(overdueTasks.length, "Tasks beyond due date.", "/portal/agency/actions", "operations:tasks", true, newest(tasks.map(task => task.updatedAt)), 1, 5));
  add("operations", "urgent-tasks", zeroTargetMetric(openTasks.filter(task => task.priority === "urgent").length, "Urgent open work.", "/portal/agency/actions", "operations:tasks", true, newest(tasks.map(task => task.updatedAt)), 2, 5));
  add("operations", "unassigned-tasks", zeroTargetMetric(openTasks.filter(task => !task.assigneeUserId).length, "Open work without an owner.", "/portal/agency/actions", "operations:ownership", true, newest(tasks.map(task => task.updatedAt)), 3, 10));
  add("operations", "in-progress-tasks", countMetric(openTasks.filter(task => task.status === "in-progress").length, null, "Work actively in progress.", "/portal/agency/actions", "operations:tasks", true, newest(tasks.map(task => task.updatedAt)), "neutral"));
  add("operations", "due-soon", zeroTargetMetric(openTasks.filter(task => task.dueAt && task.dueAt >= now && task.dueAt <= now + DAY).length, "Tasks due in 24 hours.", "/portal/agency/actions", "operations:tasks", true, newest(tasks.map(task => task.updatedAt)), 5, 12));
  add("operations", "task-completion", countMetric(completed7d.length, completedPrevious7d.length, "Tasks completed this week.", "/portal/agency/actions", "operations:completion", true, newest(tasks.map(task => task.completedAt ?? task.updatedAt)), "higher"));
  add("operations", "activity-volume", countMetric(recentActivity.length, previousActivity.length, "Workspace activity in 7 days.", "/portal/agency/settings#logs", "operations:activity", true, latestActivityAt, "higher"));
  add("operations", "activity-freshness", metric(latestActivityAt ? now - latestActivityAt : null, null, latestActivityAt && now - latestActivityAt <= 2 * DAY ? "healthy" : latestActivityAt ? "warning" : "unknown", latestActivityAt ? `${Math.round((now - latestActivityAt) / HOUR)}h ago` : "No activity", "Within 48h", "/portal/agency/settings#logs", "operations:activity", true, "Age of latest workspace activity.", latestActivityAt ?? now, activity.length, undefined, "lower"));
  add("operations", "active-automations", countMetric(workflows.filter(workflow => workflow.status === "active").length, null, "Active internal automation workflows.", "/portal/agency/automations", "operations:automations", true, newest(workflows.map(workflow => workflow.updatedAt)), "higher"));
  add("operations", "automation-failures", zeroTargetMetric(recentRuns.filter(run => run.status === "failed").length, "Automation runs failed in 7 days.", "/portal/agency/automations", "operations:automation-runs", true, newest(recentRuns.map(run => run.updatedAt)), 1, 5));
  add("operations", "automation-coverage", metric(workflows.length, null, workflows.length ? "healthy" : "watch", String(workflows.length), "Critical workflows automated or explicitly manual", "/portal/agency/automations", "operations:automations", true, "Recorded workflow controls.", newest(workflows.map(workflow => workflow.updatedAt)) ?? now, workflows.length));

  const activeLegal = legalDocuments.filter(document => document.status !== "archived");
  const dueLegal = activeLegal.filter(document => document.expiresAt && document.expiresAt >= now && document.expiresAt <= now + 30 * DAY);
  add("compliance", "legal-register", countMetric(activeLegal.length, null, "Active legal register records.", "/portal/agency/company?view=legal", "compliance:legal", true, newest(activeLegal.map(document => document.updatedAt)), "higher"));
  add("compliance", "expired-records", zeroTargetMetric(activeLegal.filter(document => document.status === "expired" || Boolean(document.expiresAt && document.expiresAt < now)).length, "Expired legal records.", "/portal/agency/company?view=legal", "compliance:legal", true, newest(activeLegal.map(document => document.updatedAt)), 1, 2));
  add("compliance", "due-records", zeroTargetMetric(dueLegal.length, "Legal records due in 30 days.", "/portal/agency/company?view=legal", "compliance:legal", true, newest(dueLegal.map(document => document.updatedAt)), 3, 8));
  add("compliance", "action-required", zeroTargetMetric(activeLegal.filter(document => document.status === "action-required").length, "Legal records marked action required.", "/portal/agency/company?view=legal", "compliance:legal", true, newest(activeLegal.map(document => document.updatedAt)), 1, 3));
  add("compliance", "insurance", metric(activeLegal.filter(document => document.category === "insurance" && document.status === "active").length, null, activeClients.length && !activeLegal.some(document => document.category === "insurance" && document.status === "active") ? "warning" : "healthy", String(activeLegal.filter(document => document.category === "insurance" && document.status === "active").length), "Current insurance recorded where required", "/portal/agency/company?view=legal", "compliance:insurance", true, "Insurance register coverage.", newest(activeLegal.filter(document => document.category === "insurance").map(document => document.updatedAt)) ?? now));
  add("compliance", "contracts", countMetric(allContracts.length, null, "Client contract records.", "/portal/agency/company?view=legal", "compliance:contracts", true, newest(allContracts.map(item => timestamp(item))), "higher"));
  add("compliance", "contract-acceptance", zeroTargetMetric(operationalAlerts.filter(alert => alert.id.includes("contract-awaiting")).length, "Contracts awaiting acceptance beyond guardrail.", "/portal/agency/company?view=legal", "compliance:contracts", true, newest(operationalAlerts.map(alert => alert.occurredAt)), 1, 4));
  add("compliance", "tax-records", metric(activeLegal.filter(document => document.category === "hmrc").length, null, activeLegal.some(document => document.category === "hmrc") ? "healthy" : "watch", String(activeLegal.filter(document => document.category === "hmrc").length), "Tax records captured", "/portal/agency/company?view=legal", "compliance:tax", true, "HMRC and tax register coverage.", newest(activeLegal.filter(document => document.category === "hmrc").map(document => document.updatedAt)) ?? now));
  add("compliance", "policy-coverage", metric(activeLegal.filter(document => document.category === "policy").length, null, activeLegal.some(document => document.category === "policy") ? "healthy" : "watch", String(activeLegal.filter(document => document.category === "policy").length), "Required policies recorded", "/portal/agency/company?view=legal", "compliance:policies", true, "Policy register coverage.", newest(activeLegal.filter(document => document.category === "policy").map(document => document.updatedAt)) ?? now));
  add("compliance", "audit-readiness", zeroTargetMetric(financeAlerts.filter(alert => /evidence|obligation|audit/i.test(`${alert.id} ${alert.title}`)).length, "Audit-readiness alerts.", "/portal/agency/agency-finance/operations", "compliance:audit", Boolean(financeInstall), newest(financeAlerts.map(alert => alert.occurredAt)), 1, 4));
  add("compliance", "compliance-freshness", metric(activeLegal.length ? now - (newest(activeLegal.map(document => document.updatedAt)) ?? now) : null, null, activeLegal.length && now - (newest(activeLegal.map(document => document.updatedAt)) ?? 0) > 90 * DAY ? "warning" : activeLegal.length ? "healthy" : "unknown", activeLegal.length ? `${Math.round((now - (newest(activeLegal.map(document => document.updatedAt)) ?? now)) / DAY)}d ago` : "No review", "Reviewed within 90d", "/portal/agency/company?view=legal", "compliance:legal", true, "Age of latest legal record update.", newest(activeLegal.map(document => document.updatedAt)) ?? now, activeLegal.length, undefined, "lower"));
  add("compliance", "obligation-coverage", zeroTargetMetric(financeAlerts.filter(alert => alert.id.includes("obligations")).length, "Finance and legal obligations needing attention.", "/portal/agency/agency-finance/operations", "compliance:obligations", Boolean(financeInstall), newest(financeAlerts.map(alert => alert.occurredAt)), 1, 4));

  add("development", "property-coverage", countMetric(telemetry.totals.properties, null, "Agency and client digital properties.", "/portal/agency/fulfilment/technical/performance", "development:properties", true, telemetry.totals.latestEventAt, "higher"));
  add("development", "tag-coverage", percentMetric(telemetry.totals.expectedProperties ? Math.round(telemetry.totals.connectedTags / telemetry.totals.expectedProperties * 100) : null, 100, "Expected live properties reporting telemetry.", "/portal/agency/fulfilment/technical/performance", "development:tags", true, telemetry.totals.latestEventAt));
  add("development", "tag-freshness", zeroTargetMetric(telemetry.totals.staleTags, "Live tags silent for more than 48 hours.", "/portal/agency/fulfilment/technical/performance", "development:tags", telemetry.totals.properties > 0, telemetry.totals.latestEventAt, 1, 3));
  // Tag → Radar (aqua-tag plan Phase 5): how many tagged sites inject third-party
  // tools through the Aqua Tag (consent-gated). Informational coverage — whether
  // each tool is actually *firing* on the page is a later detection slice; stays
  // connected at zero so it is never a false blind spot. See server/websiteInjections.
  const agencySiteConfigs = Object.values(state.websiteSiteConfigs ?? {}).filter(config => config.agencyId === agencyId);
  const sitesInjectingTools = agencySiteConfigs.filter(config => config.injections.some(injection => injection.enabled)).length;
  add("development", "injection-coverage", countMetric(sitesInjectingTools, null, `${sitesInjectingTools} tagged site${sitesInjectingTools === 1 ? "" : "s"} inject third-party tools through the Aqua Tag.`, "/portal/agency/fulfilment?view=tags", "development:injections", true, now));
  add("development", "heartbeat-health", metric(telemetry.totals.heartbeats24h, null, telemetry.totals.expectedProperties && telemetry.totals.heartbeats24h === 0 ? "warning" : telemetry.totals.properties ? "healthy" : "unknown", String(telemetry.totals.heartbeats24h), "At least 1 heartbeat per live property", "/portal/agency/fulfilment/technical/performance", "development:heartbeats", telemetry.totals.properties > 0, "Heartbeat events in 24 hours.", telemetry.totals.latestEventAt ?? now, telemetry.totals.properties));
  add("development", "production-errors", zeroTargetMetric(telemetry.totals.errors24h, "Production errors in 24 hours.", "/portal/agency/fulfilment/technical/performance", "development:errors", telemetry.totals.properties > 0, telemetry.totals.latestEventAt, 1, 5));
  add("development", "error-rate", percentMetric(telemetry.totals.pageviews24h ? Math.round(telemetry.totals.errors24h / telemetry.totals.pageviews24h * 10_000) / 100 : telemetry.totals.errors24h ? 100 : 0, 0, "Errors relative to pageviews.", "/portal/agency/fulfilment/technical/performance", "development:errors", telemetry.totals.properties > 0, telemetry.totals.latestEventAt, true));
  add("development", "load-performance", metric(telemetry.totals.averageLoadMs ?? null, null, telemetry.totals.averageLoadMs && telemetry.totals.averageLoadMs > 5_000 ? "critical" : telemetry.totals.averageLoadMs && telemetry.totals.averageLoadMs > 2_500 ? "warning" : telemetry.totals.averageLoadMs ? "healthy" : "unknown", telemetry.totals.averageLoadMs ? `${telemetry.totals.averageLoadMs}ms` : "No sample", "2500ms or faster", "/portal/agency/fulfilment/technical/performance", "development:performance", telemetry.totals.properties > 0, "Average tracked page load.", telemetry.totals.latestEventAt ?? now, telemetry.totals.properties, undefined, "lower"));
  add("development", "slow-properties", zeroTargetMetric(telemetry.totals.slowProperties, "Properties slower than 2500ms.", "/portal/agency/fulfilment/technical/performance", "development:performance", telemetry.totals.properties > 0, telemetry.totals.latestEventAt, 1, 3));
  add("development", "deployments", countMetric(telemetry.properties.reduce((total, property) => total + property.events.filter(event => event.type === "deployment" && event.occurredAt >= now - 30 * DAY).length, 0), null, "Deployments recorded in 30 days.", "/portal/agency/fulfilment/technical/website", "development:deployments", telemetry.totals.properties > 0, telemetry.totals.latestEventAt, "neutral"));
  add("development", "release-errors", zeroTargetMetric(telemetry.properties.reduce((total, property) => total + property.events.filter(event => event.type === "error" && event.release && event.occurredAt >= now - 7 * DAY).length, 0), "Errors linked to a release in 7 days.", "/portal/agency/fulfilment/technical/website", "development:releases", telemetry.totals.properties > 0, telemetry.totals.latestEventAt, 1, 4));
  add("development", "monitoring-silence", zeroTargetMetric(telemetry.properties.filter(property => property.expectedLive && (!property.lastSeenAt || now - property.lastSeenAt > 2 * DAY)).length, "Live properties not reporting.", "/portal/agency/fulfilment/technical/performance", "development:silence", telemetry.totals.properties > 0, telemetry.totals.latestEventAt, 1, 3));
  add("development", "telemetry-integrity", percentMetric(telemetry.totals.properties ? Math.round(telemetry.properties.filter(property => property.events.every(event => Number.isFinite(event.occurredAt) && Boolean(event.type))).length / telemetry.totals.properties * 100) : null, 100, "Properties with structurally valid retained events.", "/portal/agency/fulfilment/technical/performance", "development:integrity", telemetry.totals.properties > 0, telemetry.totals.latestEventAt));

  const taskOwners = new Set(openTasks.map(task => task.assigneeUserId).filter(Boolean));
  const activePeopleEmployees = peopleEmployees.filter(employee => employee.status === "active" || employee.status === "leave");
  const peopleApplications = Object.values(state.peopleApplications).filter(application => application.agencyId === agencyId);
  const peopleLeave = Object.values(state.peopleLeaveRequests).filter(request => request.agencyId === agencyId);
  const peopleShifts = Object.values(state.peopleShifts).filter(shift => shift.agencyId === agencyId);
  const peopleTraining = Object.values(state.peopleTrainingAssignments).filter(training => training.agencyId === agencyId);
  const workloadCounts = team.map(user => openTasks.filter(task => task.assigneeUserId === user.id).length);
  const maxWorkload = workloadCounts.length ? Math.max(...workloadCounts) : 0;
  add("team", "team-size", countMetric(team.length, null, "Workspace team members.", "/portal/agency/settings", "team:users", true, newest(team.map(user => user.updatedAt)), "higher"));
  add("team", "owner-coverage", metric(team.filter(user => user.role === "agency-owner" || user.role === "agency-manager").length, null, team.some(user => user.role === "agency-owner") ? "healthy" : "warning", String(team.filter(user => user.role === "agency-owner" || user.role === "agency-manager").length), "At least one owner", "/portal/agency/settings", "team:leadership", true, "Leadership role coverage.", newest(team.map(user => user.updatedAt)) ?? now));
  add("team", "staff-coverage", countMetric(team.filter(user => user.role === "agency-staff").length, null, "Agency staff records.", "/portal/agency/settings", "team:staff", true, newest(team.map(user => user.updatedAt)), "higher"));
  add("team", "freelancer-coverage", countMetric(team.filter(user => user.role === "freelancer").length, null, "Freelancer workspace access.", "/portal/agency/settings", "team:freelancers", true, newest(team.map(user => user.updatedAt)), "neutral"));
  add("team", "task-ownership", percentMetric(openTasks.length ? Math.round(taskOwners.size ? openTasks.filter(task => task.assigneeUserId).length / openTasks.length * 100 : 0) : 100, 90, "Open tasks with an assignee.", "/portal/agency/actions", "team:tasks", true, newest(tasks.map(task => task.updatedAt))));
  add("team", "workload-balance", metric(maxWorkload, null, maxWorkload > 20 ? "warning" : "healthy", String(maxWorkload), "No person above 20 open tasks", "/portal/agency/actions", "team:workload", true, "Largest assigned open-task workload.", newest(tasks.map(task => task.updatedAt)) ?? now, openTasks.length, undefined, "lower"));
  add("team", "capacity-plan", metric(profile?.capacity.weeklyAvailableHours ?? null, null, profile ? "healthy" : "unknown", profile ? `${profile.capacity.weeklyAvailableHours}h` : "Not set", "Weekly hours configured", "/portal/agency?station=battle", "team:capacity", Boolean(profile), "Weekly available capacity plan.", profile?.updatedAt ?? now));
  add("team", "capacity-pressure", metric(capacityPercent, null, capacityPercent >= (profile?.capacity.hiringTriggerPercent ?? 85) ? "warning" : "healthy", `${capacityPercent}%`, `Below ${profile?.capacity.hiringTriggerPercent ?? 85}%`, "/portal/agency?station=battle", "team:capacity", Boolean(profile), "Estimated capacity utilisation.", profile?.updatedAt ?? now, activeClients.length, undefined, "lower"));
  add("team", "hiring-trigger", metric(capacityPercent, null, capacityPercent >= (profile?.capacity.hiringTriggerPercent ?? 85) ? "warning" : "healthy", `${capacityPercent}%`, `Hiring review at ${profile?.capacity.hiringTriggerPercent ?? 85}%`, "/portal/agency?station=battle", "team:hiring", Boolean(profile), "Capacity against configured hiring trigger.", profile?.updatedAt ?? now, activeClients.length, undefined, "lower"));
  for (const area of hiringCapacity?.areas ?? []) {
    const status: BusinessSignalStatus = area.state === "hire-now" ? "critical" : area.state === "prepare" ? "warning" : area.state === "watch" ? "watch" : "healthy";
    add("team", `capacity-${area.id}`, metric(area.utilisationPercent, null, status, `${area.utilisationPercent}%`, `At or below ${area.targetUtilisationPercent}%`, "/portal/agency?station=battle&battle=capacity", `team:capacity:${area.id}`, true, `${area.label}: ${area.demandHours}h demand, ${area.availableHours}h available, ${area.gapHours}h above the area guardrail. Recommended role: ${area.roleTitle}.`, profile?.updatedAt ?? now, area.peopleCount + Math.round(area.openTaskHours), area.utilisationPercent, "lower"));
  }
  add("team", "people-payments", zeroTargetMetric(alertCount(/people-payments/), "People payments requiring action.", "/portal/agency/agency-finance/operations", "team:payments", Boolean(financeInstall), newest(financeAlerts.map(alert => alert.occurredAt)), 1, 3));
  add("team", "objective-ownership", percentMetric(profile?.objectives.length ? Math.round(profile.plans.filter(plan => plan.owner).length / Math.max(1, profile.plans.length) * 100) : null, 90, "Plans with an accountable owner.", "/portal/agency?station=battle", "team:objectives", Boolean(profile), profile?.updatedAt));
  add("team", "role-integrity", percentMetric(team.length ? Math.round(team.filter(user => user.role && user.agencyIds.includes(agencyId)).length / team.length * 100) : null, 100, "Users with an agency role and membership.", "/portal/account/permissions", "team:roles", true, newest(team.map(user => user.updatedAt))));
  add("team", "candidate-backlog", zeroTargetMetric(peopleApplications.filter(application => !["declined", "withdrawn", "onboarding"].includes(application.stage) && now - application.updatedAt > 7 * DAY).length, "Applications without a retained decision or update for more than 7 days.", "/portal/agency/people?view=candidates", "team:recruitment", true, newest(peopleApplications.map(application => application.updatedAt)), 1, 4));
  add("team", "employee-portal-coverage", percentMetric(activePeopleEmployees.length ? Math.round(activePeopleEmployees.filter(employee => Boolean(employee.userId)).length / activePeopleEmployees.length * 100) : null, 100, "Active People records linked to a staff login.", "/portal/agency/people?view=team", "team:people", true, newest(peopleEmployees.map(employee => employee.updatedAt))));
  const onboardingItems = peopleEmployees.flatMap(employee => employee.onboardingItems);
  add("team", "onboarding-readiness", percentMetric(onboardingItems.length ? Math.round(onboardingItems.filter(item => item.status === "done").length / onboardingItems.length * 100) : null, 100, "Required onboarding checklist completion.", "/portal/agency/people?view=development", "team:onboarding", peopleEmployees.length > 0, newest(peopleEmployees.map(employee => employee.updatedAt))));
  add("team", "leave-decisions", zeroTargetMetric(peopleLeave.filter(request => request.status === "pending" && now - request.createdAt > 2 * DAY).length, "Leave requests waiting more than 2 days for a decision.", "/portal/agency/people?view=time", "team:leave", true, newest(peopleLeave.map(request => request.updatedAt)), 1, 3));
  add("team", "leave-entitlement", percentMetric(activePeopleEmployees.filter(employee => employee.employmentType === "full-time" || employee.employmentType === "part-time").length ? Math.round(activePeopleEmployees.filter(employee => (employee.employmentType !== "full-time" && employee.employmentType !== "part-time") || (employee.holidayAllowanceDays ?? 0) > 0).length / activePeopleEmployees.length * 100) : null, 100, "Employees with retained annual leave entitlement.", "/portal/agency/people?view=time", "team:leave", activePeopleEmployees.length > 0, newest(activePeopleEmployees.map(employee => employee.updatedAt))));
  add("team", "shift-coverage", zeroTargetMetric(peopleShifts.filter(shift => shift.status === "published" && (!state.peopleEmployees[shift.employeeId] || shift.endsAt <= shift.startsAt)).length, "Published shifts without a valid employee or time range.", "/portal/agency/people?view=time", "team:shifts", true, newest(peopleShifts.map(shift => shift.updatedAt)), 1, 2));
  add("team", "training-overdue", zeroTargetMetric(peopleTraining.filter(training => training.status !== "completed" && Boolean(training.dueAt && training.dueAt < now)).length, "Training beyond its retained due date.", "/portal/agency/people?view=development", "team:training", true, newest(peopleTraining.map(training => training.updatedAt)), 1, 4));
  add("team", "training-completion", percentMetric(peopleTraining.length ? Math.round(peopleTraining.filter(training => training.status === "completed").length / peopleTraining.length * 100) : null, 90, "Assigned training completed.", "/portal/agency/people?view=development", "team:training", peopleTraining.length > 0, newest(peopleTraining.map(training => training.updatedAt))));
  add("team", "workspace-composition", percentMetric(activePeopleEmployees.length ? Math.round(activePeopleEmployees.filter(employee => employee.workspaceAccess.length > 0 && employee.workspaceAccess.some(access => access.stationId === "my-day")).length / activePeopleEmployees.length * 100) : null, 100, "Active employees with an explicit scoped workspace.", "/portal/agency/people?view=access", "team:access", activePeopleEmployees.length > 0, newest(activePeopleEmployees.map(employee => employee.updatedAt))));
  const activeCommissionRules = peopleEmployees.flatMap(employee => employee.commissionRules).filter(rule => rule.status === "active");
  add("team", "commission-governance", zeroTargetMetric(activeCommissionRules.filter(rule => rule.basis === "fixed-bonus" ? !rule.fixedAmountMinor : !rule.ratePercent || rule.ratePercent <= 0).length, "Active commission plans missing a valid rate or fixed amount.", "/portal/agency/people?view=rewards", "team:commission", true, newest(peopleEmployees.map(employee => employee.updatedAt)), 1, 2));
  add("team", "employment-terms", percentMetric(activePeopleEmployees.length ? Math.round(activePeopleEmployees.filter(employee => employee.title && employee.startDate && employee.weeklyHours !== undefined && employee.payBasis && employee.currency).length / activePeopleEmployees.length * 100) : null, 100, "Active employees with retained working and pay terms.", "/portal/agency/people?view=team", "team:terms", activePeopleEmployees.length > 0, newest(activePeopleEmployees.map(employee => employee.updatedAt))));
  add("team", "onboarding-age", zeroTargetMetric(peopleEmployees.filter(employee => employee.status === "preboarding" && now - employee.createdAt > 21 * DAY).length, "Preboarding records open for more than 21 days.", "/portal/agency/people?view=development", "team:onboarding", true, newest(peopleEmployees.map(employee => employee.updatedAt)), 1, 3));

  const failedIntegrations = integrations.filter(connection => connection.lastTestStatus === "failed" || connection.status === "needs-attention").length;
  const moduleRecords = installs.reduce((total, install) => total + pluginRecordCount(state, install.id), 0);
  const unhealthyInstalls = installs.filter(install => install.health?.ok === false).length;
  const customAIs = Object.values(state.customAIs).filter(item => item.agencyId === agencyId);
  add("systems", "installed-modules", countMetric(installs.length, null, "Enabled modules monitored by the radar.", "/portal/agency/company?view=connections", "systems:modules", true, newest(installs.map(item => item.installedAt)), "higher"));
  add("systems", "module-data", metric(moduleRecords, null, installs.length && moduleRecords === 0 ? "watch" : "healthy", String(moduleRecords), "Enabled modules readable", "/portal/agency/company?view=connections", "systems:module-data", true, "Readable records across plugin storage.", newest(installs.map(item => item.healthCheckedAt ?? item.installedAt)) ?? now, installs.length));
  add("systems", "module-health", zeroTargetMetric(unhealthyInstalls, "Modules reporting failed health.", "/portal/agency/company?view=connections", "systems:module-health", true, newest(installs.map(item => item.healthCheckedAt ?? item.installedAt)), 1, 3));
  add("systems", "integration-coverage", countMetric(integrations.filter(connection => connection.status === "connected").length, null, "Connected external integrations.", "/portal/agency/settings#integrations", "systems:integrations", true, newest(integrations.map(item => item.updatedAt)), "higher"));
  add("systems", "integration-failures", zeroTargetMetric(failedIntegrations, "Integrations whose latest test failed.", "/portal/agency/settings#integrations", "systems:integrations", true, newest(integrations.map(item => item.lastTestedAt ?? item.updatedAt)), 1, 3));
  add("systems", "data-freshness", metric(latestActivityAt ? now - latestActivityAt : null, null, latestActivityAt && now - latestActivityAt > 2 * DAY ? "warning" : latestActivityAt ? "healthy" : "unknown", latestActivityAt ? `${Math.round((now - latestActivityAt) / HOUR)}h ago` : "No activity", "Within 48h", "/portal/agency/settings#logs", "systems:activity", true, "Age of latest business record activity.", latestActivityAt ?? now, activity.length, undefined, "lower"));
  add("systems", "automation-health", zeroTargetMetric(recentRuns.filter(run => run.status === "failed").length, "Failed automation runs in 7 days.", "/portal/agency/automations", "systems:automations", true, newest(recentRuns.map(run => run.updatedAt)), 1, 5));
  add("systems", "custom-ai-register", countMetric(customAIs.length, null, "Recorded specialist AI systems.", "/portal/agency/automations", "systems:custom-ai", true, newest(customAIs.map(item => item.updatedAt)), "neutral"));
  add("systems", "telemetry-ingestion", countMetric(telemetry.properties.reduce((total, property) => total + property.events.length, 0), null, "Retained telemetry events across properties.", "/portal/agency/fulfilment/technical/performance", "systems:telemetry", telemetry.totals.properties > 0, telemetry.totals.latestEventAt, "higher"));
  add("systems", "inbox-ingestion", countMetric(inboxMessages.length, null, "Retained inbox messages.", "/portal/agency/inbox", "systems:inbox", Boolean(inbox), latestInboxAt, "higher"));
  // NOTE: this counts recorded workspace *activity rows* — a write-volume proxy,
  // NOT database/storage health. Real DB reachability/latency/storage rides the
  // Infra sweep (radar upgrade Stage 4, scope "infra"). Kept (family id unchanged)
  // so the 2,040 catalogue is intact; relabelled here to stop implying storage health.
  add("systems", "storage-activity", countMetric(activity.length, null, "Recorded workspace activity rows (write-volume proxy — real DB/storage health rides the Infra sweep).", "/portal/agency/settings#logs", "systems:storage", true, latestActivityAt, "higher"));
  add("systems", "blind-spot-control", zeroTargetMetric(coverage.filter(source => source.status === "disconnected" || source.status === "unavailable").length, "Disconnected or unavailable radar sources.", "/portal/agency/company?view=connections", "systems:coverage", true, domainLastSeen("systems"), 1, 4));
  // Client software linked into their portals. `uses` and `lastSeenAt` are
  // absent until the Aqua Tag heartbeat lands, so the freshness lens goes
  // blind rather than green — the honest reading is "connected, cannot yet
  // confirm alive", which is what a blind spot is for. Counting them at all is
  // the point Ed asked for: the connections become something the radar scans.
  const portalConnections = Object.values(state.portalConnections ?? {}).filter(connection => connection.agencyId === agencyId);
  const activePortalConnections = portalConnections.filter(connection => connection.status === "active");
  add("systems", "portal-connections", countMetric(activePortalConnections.length, null, "Client software linked into their portals.", "/portal/agency/portals", "systems:portal-connections", true, newest(activePortalConnections.map(connection => connection.lastSeenAt)), "neutral"));

  return completeObservations(observations, coverage, now);
}

type MetricPatch = Omit<RadarObservation, "domain" | "familyId" | "measuredAt"> & { measuredAt?: number };

function observation(domain: AdvisorDomain, familyId: string, now: number, patch: MetricPatch): RadarObservation {
  return { domain, familyId, measuredAt: patch.measuredAt ?? now, ...patch };
}

function metric(
  current: number | null,
  previous: number | null,
  status: BusinessSignalStatus,
  display: string,
  target: string,
  href: string,
  sourceId: string,
  connected: boolean,
  detail: string,
  lastSeenAt?: number,
  sampleSize?: number,
  value?: number,
  expectedDirection: RadarObservation["expectedDirection"] = "neutral",
): MetricPatch {
  return {
    sourceId,
    connected,
    current: value ?? current,
    previous,
    status,
    display,
    target,
    detail,
    href,
    lastSeenAt,
    freshnessMs: 2 * DAY,
    sampleSize,
    integrity: current === null || Number.isFinite(current),
    minimumSampleSize: expectedDirection === "neutral" ? 1 : 5,
    expectedDirection,
    anomalyFloor: 5,
  };
}

function countMetric(current: number, previous: number | null, detail: string, href: string, sourceId: string, connected: boolean, lastSeenAt?: number, expectedDirection: RadarObservation["expectedDirection"] = "neutral"): MetricPatch {
  return metric(current, previous, connected ? "healthy" : "unknown", String(current), "Monitored baseline", href, sourceId, connected, detail, lastSeenAt, current, undefined, expectedDirection);
}

function zeroTargetMetric(current: number, detail: string, href: string, sourceId: string, connected: boolean, lastSeenAt: number | undefined, warningAt: number, criticalAt: number): MetricPatch {
  return {
    ...metric(current, null, connected ? current >= criticalAt ? "critical" : current >= warningAt ? "warning" : "healthy" : "unknown", String(current), "0 requiring attention", href, sourceId, connected, detail, lastSeenAt, current, undefined, "lower"),
    minimumSampleSize: 1,
    zeroIsEvidence: true,
  };
}

function durationMetric(current: number | null, status: BusinessSignalStatus, targetMs: number, detail: string, href: string, sourceId: string, connected: boolean, lastSeenAt?: number): MetricPatch {
  return metric(current, null, status, current === null ? "No sample" : duration(current), duration(targetMs), href, sourceId, connected, detail, lastSeenAt, undefined, undefined, "lower");
}

function percentMetric(current: number | null, targetPercent: number, detail: string, href: string, sourceId: string, connected: boolean, lastSeenAt?: number, zeroIsHealthy = false): MetricPatch {
  const status: BusinessSignalStatus = current === null ? "unknown" : zeroIsHealthy && current === 0 ? "healthy" : current >= targetPercent ? "healthy" : current >= targetPercent * 0.7 ? "warning" : "critical";
  return metric(current, null, status, current === null ? "No sample" : `${current}%`, `${targetPercent}% or above`, href, sourceId, connected, detail, lastSeenAt, undefined, undefined, zeroIsHealthy ? "lower" : "higher");
}

function completeObservations(observations: RadarObservation[], coverage: AdvisorCoverageSource[], now: number): RadarObservation[] {
  const keys = new Set(observations.map(item => `${item.domain}:${item.familyId}`));
  for (const [domain, families] of Object.entries(RADAR_SIGNAL_FAMILIES) as Array<[AdvisorDomain, typeof RADAR_SIGNAL_FAMILIES[AdvisorDomain]]>) {
    for (const family of families) {
      if (keys.has(`${domain}:${family.id}`)) continue;
      const sources = coverage.filter(source => source.domain === domain);
      const connected = sources.some(source => source.status === "connected" || source.status === "empty");
      observations.push(observation(domain, family.id, now, {
        sourceId: sources[0]?.id ?? `domain:${domain}`,
        connected,
        current: null,
        previous: null,
        status: "unknown",
        display: "Awaiting baseline",
        target: "Dedicated baseline established",
        detail: `${family.description} The source is registered, but a dedicated numeric baseline has not been established yet.`,
        href: "/portal/agency/company?view=connections",
        lastSeenAt: newest(sources.map(source => source.lastActivityAt)),
        sampleSize: sources.reduce((total, source) => total + source.recordCount, 0),
        integrity: false,
      }));
    }
  }
  return observations;
}

function scoreStatus(value: number | null | undefined): BusinessSignalStatus {
  if (value === null || value === undefined) return "unknown";
  return value < 40 ? "critical" : value < 70 ? "warning" : value < 80 ? "watch" : "healthy";
}

function ratioStatus(value: number, target: number): BusinessSignalStatus {
  if (!target) return "unknown";
  const ratio = value / target;
  return ratio < 0.35 ? "critical" : ratio < 0.7 ? "warning" : ratio < 0.9 ? "watch" : "healthy";
}

function higherRateStatus(value: number | null, sample: number, minimumSample: number, warningBelow: number, criticalBelow: number): BusinessSignalStatus {
  if (sample < minimumSample || value === null) return "unknown";
  return value < criticalBelow ? "critical" : value < warningBelow ? "warning" : "healthy";
}

function lowerRateStatus(value: number | null, sample: number, minimumSample: number, warningAbove: number, criticalAbove: number): BusinessSignalStatus {
  if (sample < minimumSample || value === null) return "unknown";
  return value >= criticalAbove ? "critical" : value >= warningAbove ? "warning" : "healthy";
}

function displayPercent(value: number | null): string {
  return value === null ? "Learning" : `${value}%`;
}

function minimumStatus(value: number, minimum: number): BusinessSignalStatus {
  return value >= minimum ? "healthy" : "watch";
}

function enquiryConnected(enquiries: WebsiteEnquiry[]): boolean {
  return Array.isArray(enquiries);
}

function latest(enquiries: Array<{ submittedAt?: number; updatedAt?: number; occurredAt?: number }>): number | undefined {
  return newest(enquiries.map(item => item.submittedAt ?? item.updatedAt ?? item.occurredAt));
}

function newest(values: Array<number | undefined>): number | undefined {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  return valid.length ? Math.max(...valid) : undefined;
}

function money(value?: number | null, currency = "gbp"): string {
  if (value === null || value === undefined) return "No data";
  try { return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(value / 100); }
  catch { return `${currency.toUpperCase()} ${(value / 100).toFixed(0)}`; }
}

function duration(value: number): string {
  if (value < 60_000) return `${Math.max(1, Math.round(value / 1_000))}s`;
  if (value < HOUR) return `${Math.round(value / 60_000)}m`;
  if (value < DAY) return `${Math.round(value / HOUR)}h`;
  return `${Math.round(value / DAY)}d`;
}

function pluginRecordCount(state: PortalState, installId: string): number {
  return Object.keys(state.pluginData[installId] ?? {}).filter(key => !key.includes("/seq/") && !key.endsWith("/index")).length;
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function timestamp(value: Record<string, unknown>): number | undefined {
  for (const key of ["updatedAt", "createdAt", "submittedAt", "occurredAt", "targetAt"]) {
    const candidate = numeric(value[key]);
    if (candidate) return candidate;
  }
  return undefined;
}

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
