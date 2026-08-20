import type { Campaign, Lead } from "@/built-ins/modules/leads-pipeline/src/lib/domain";
import type {
  CommercialFormulaMetric,
  CommercialIntelligenceSnapshot,
  CommercialMetricCategory,
  CommercialMetricUnit,
  CommercialPersonRow,
  CommercialRecordState,
  CommercialSourcePerformance,
  CommandKpiStatus,
} from "@/lib/commandIntelligence";
import type { Client, Pipeline, PipelineCard } from "@/server/types";

const DAY = 86_400_000;
const STALE_AFTER = 14 * DAY;

interface BuildCommercialIntelligenceInput {
  leads: readonly Lead[];
  clients: readonly Client[];
  campaigns: readonly Campaign[];
  pipeline: Pipeline | null;
  cards: readonly PipelineCard[];
  currency: string;
  pageviews: number;
  forms: number;
  /**
   * Whether `pageviews` is an actual reading. The Radar emits `value: 0` on
   * `blind`/`learning`/`inactive` checks, so an agency with nothing monitored
   * arrives here indistinguishable from a monitored-but-quiet one. Callers that
   * know the difference pass `false` so the funnel can render "—" instead of a
   * fabricated zero. Omitted means "the caller asserts this is a reading" —
   * that keeps every pre-existing call site behaving exactly as before.
   */
  pageviewsMeasured?: boolean;
  /** Same contract as `pageviewsMeasured`, for `forms`. */
  formsMeasured?: boolean;
  now?: number;
}

/**
 * `CommercialIntelligenceSnapshot["lineage"]` plus the honesty flags. Additive
 * on purpose: `lineage.pageviews` stays `number` so `marketingIntelligence.ts`
 * (a different lane's file) keeps compiling untouched.
 */
export type CommercialLineage = CommercialIntelligenceSnapshot["lineage"] & {
  pageviewsMeasured: boolean;
  formsMeasured: boolean;
};

export type CommercialIntelligenceSnapshotWithMeasurement =
  Omit<CommercialIntelligenceSnapshot, "lineage"> & { lineage: CommercialLineage };

interface FormulaInput {
  id: string;
  label: string;
  category: CommercialMetricCategory;
  unit: CommercialMetricUnit;
  value: number | null;
  numerator?: number;
  denominator?: number;
  formula: string;
  target: string;
  status: CommandKpiStatus;
  source: string;
  detail: string;
  href?: string;
  evidence?: string[];
}

export function buildCommercialIntelligence({
  leads,
  clients,
  campaigns,
  pipeline,
  cards,
  currency,
  pageviews,
  forms,
  pageviewsMeasured = true,
  formsMeasured = true,
  now = Date.now(),
}: BuildCommercialIntelligenceInput): CommercialIntelligenceSnapshotWithMeasurement {
  const columns = [...(pipeline?.columns ?? [])].sort((left, right) => left.order - right.order);
  const columnById = new Map(columns.map(column => [column.id, column]));
  const cardsById = new Map(cards.map(card => [card.id, card]));
  const leadCardByLeadId = new Map<string, PipelineCard>();
  for (const card of cards) {
    if (card.kind !== "lead") continue;
    const leadId = (card.lead as typeof card.lead & { leadId?: string }).leadId;
    if (leadId) leadCardByLeadId.set(leadId, card);
  }
  const campaignsBySource = new Map(campaigns.flatMap(campaign => campaign.sourceKey
    ? [[sourceKey(campaign.sourceKey), campaign] as const]
    : []));
  const leadsById = new Map(leads.map(lead => [lead.id, lead]));
  const leadsByClientId = new Map(leads.flatMap(lead => lead.convertedClientId ? [[lead.convertedClientId, lead] as const] : []));
  const clientsById = new Map(clients.map(client => [client.id, client]));

  const leadRows: CommercialPersonRow[] = leads.map(lead => {
    const card = (lead.pipelineCardId ? cardsById.get(lead.pipelineCardId) : undefined) ?? leadCardByLeadId.get(lead.id);
    const stageId = card?.columnId ?? lead.currentStageId ?? "unassigned";
    const stageLabel = columnById.get(stageId)?.label ?? titleCase(stageId);
    const client = lead.convertedClientId ? clientsById.get(lead.convertedClientId) : undefined;
    const campaign = campaignsBySource.get(sourceKey(lead.source));
    const convertedAt = lead.convertedAt ?? (client ? client.createdAt : undefined);
    return {
      id: lead.id,
      kind: "lead",
      name: lead.name || lead.email || "Unnamed lead",
      email: lead.email,
      company: lead.company || "Not recorded",
      source: sourceLabel(lead.source),
      campaignId: campaign?.id,
      campaignName: campaign?.name,
      stageId,
      stageLabel,
      state: recordState(stageId, Boolean(convertedAt), client),
      capturedAt: lead.capturedAt,
      stageEnteredAt: lead.stageEnteredAt,
      firstContactedAt: lead.firstContactedAt,
      convertedAt,
      clientId: client?.id ?? lead.convertedClientId,
      clientStatus: client ? client.stage === "churned" || client.status === "archived" ? "churned" : client.status : undefined,
      responseMs: responseTime(lead),
      ageMs: Math.max(0, now - (lead.stageEnteredAt ?? lead.capturedAt)),
      timeToConversionMs: convertedAt && convertedAt >= lead.capturedAt ? convertedAt - lead.capturedAt : null,
      enquiryCount: lead.enquiryCount ?? lead.enquiryIds?.length ?? 0,
      touchCount: lead.journeyEvents?.filter(event => event.type === "contact-recorded" || event.type === "meeting-scheduled" || event.type === "stage-changed").length ?? 0,
      meetingScheduled: Boolean(lead.nextMeetingAt || lead.journeyEvents?.some(event => event.type === "meeting-scheduled")),
      tags: lead.tags,
      href: `/portal/agency/pipelines/leads?lead=${encodeURIComponent(lead.id)}`,
    };
  });

  const linkedClientIds = new Set(leadRows.flatMap(row => row.clientId ? [row.clientId] : []));
  const orphanClientRows: CommercialPersonRow[] = clients.filter(client => !linkedClientIds.has(client.id)).map(client => {
    const linkedLeadId = stringValue(client.metadata?.leadId) || stringValue(client.metadata?.promotedFromLeadId);
    const lead = linkedLeadId ? leadsById.get(linkedLeadId) : leadsByClientId.get(client.id);
    const source = stringValue(client.metadata?.leadSource) || stringValue(recordValue(client.metadata?.buyingJourney)?.source) || lead?.source || "";
    const churned = client.stage === "churned" || client.status === "archived";
    return {
      id: `client:${client.id}`,
      kind: "client",
      name: client.name,
      email: client.ownerEmail ?? "Not recorded",
      company: client.name,
      source: sourceLabel(source),
      stageId: client.stage,
      stageLabel: titleCase(client.stage),
      state: churned ? "churned" : "client",
      capturedAt: client.createdAt,
      clientId: client.id,
      clientStatus: churned ? "churned" : client.status,
      responseMs: null,
      ageMs: Math.max(0, now - client.updatedAt),
      timeToConversionMs: null,
      enquiryCount: 0,
      touchCount: 0,
      meetingScheduled: false,
      tags: [],
      href: `/portal/clients/${encodeURIComponent(client.id)}`,
    };
  });
  const people = [...leadRows, ...orphanClientRows].sort((left, right) => right.capturedAt - left.capturedAt);

  const stageRows = columns.map((column, index) => {
    const rows = leadRows.filter(row => row.stageId === column.id);
    const nextColumn = columns[index + 1];
    const terminal = /won|lost|closed|churn/i.test(column.id);
    const progressed = nextColumn && !terminal ? leads.filter(lead => reachedStage(lead, nextColumn.id, columns)).length : 0;
    const reached = leads.filter(lead => reachedStage(lead, column.id, columns)).length;
    return {
      id: column.id,
      label: column.label,
      order: column.order,
      leadCount: rows.length,
      sharePercent: percent(rows.length, leadRows.length),
      conversionToNextPercent: nextColumn && !terminal ? percent(progressed, reached) : null,
      medianAgeMs: median(rows.map(row => row.ageMs)),
      staleCount: rows.filter(row => row.ageMs >= STALE_AFTER && row.state !== "won" && row.state !== "lost").length,
      recordIds: rows.map(row => row.id),
    };
  });

  const sources = buildSourceRows(leadRows, clients, campaigns);
  const converted = leadRows.filter(row => row.state === "won" || row.state === "client" || row.state === "churned");
  const lost = leadRows.filter(row => row.state === "lost");
  const open = leadRows.filter(row => !["won", "lost", "client", "churned"].includes(row.state));
  const contacted = leadRows.filter(row => Boolean(row.firstContactedAt) || row.touchCount > 0 || !["new"].includes(row.state));
  const meetings = leadRows.filter(row => row.meetingScheduled || ["meeting", "proposal", "won", "client", "churned"].includes(row.state));
  const proposals = leadRows.filter(row => ["proposal", "won", "client", "churned"].includes(row.state));
  const activeClients = clients.filter(client => client.status === "active" && client.stage !== "churned");
  const churnedClients = clients.filter(client => client.stage === "churned" || client.status === "archived");
  const responseSamples = leadRows.flatMap(row => row.responseMs === null ? [] : [row.responseMs]);
  const conversionSamples = leadRows.flatMap(row => row.timeToConversionMs === null ? [] : [row.timeToConversionMs]);
  const attributedLeads = leadRows.filter(row => sourceKey(row.source) !== "unattributed");
  const campaignLinked = leadRows.filter(row => row.campaignId);
  const stageLinked = leadRows.filter(row => row.stageId !== "unassigned");
  const linkedConversions = converted.filter(row => row.clientId);
  const contactable = leadRows.filter(row => row.email && row.email !== "Not recorded");
  const zeroTouchOpen = open.filter(row => !row.firstContactedAt && row.touchCount === 0);
  const staleOpen = open.filter(row => row.ageMs >= STALE_AFTER);
  const campaignSpend = campaigns.reduce((sum, campaign) => sum + (campaign.spendCents ?? 0), 0);
  const campaignRevenue = campaigns.reduce((sum, campaign) => sum + (campaign.attributedRevenueCents ?? 0), 0);
  const campaignBudget = campaigns.reduce((sum, campaign) => sum + (campaign.budgetCents ?? 0), 0);
  const enquiryTotal = leadRows.reduce((sum, row) => sum + row.enquiryCount, 0);
  const touchTotal = leadRows.reduce((sum, row) => sum + row.touchCount, 0);
  const closed = converted.length + lost.length;
  const portfolio = activeClients.length + churnedClients.length;
  const slaMet = responseSamples.filter(value => value <= 5 * 60_000).length;
  const leadsWithEnquiries = leads.filter(lead => Boolean(lead.lastEnquiryAt) || (lead.enquiryCount ?? lead.enquiryIds?.length ?? 0) > 0);
  const repeatEnquiryLeads = leadRows.filter(row => row.enquiryCount > 1);
  const clientIdsWithSource = new Set([
    ...orphanClientRows.flatMap(row => row.clientId && sourceKey(row.source) !== "unattributed" ? [row.clientId] : []),
    ...leadRows.flatMap(row => row.clientId && sourceKey(row.source) !== "unattributed" ? [row.clientId] : []),
  ]);
  const largestSource = Math.max(0, ...sources.map(source => source.leads));
  const makeFormula = (input: FormulaInput) => formula(input, currency);

  const formulas = [
    makeFormula({ id: "lead-to-client", label: "Lead-to-client conversion", category: "outcome", unit: "percent", value: percent(converted.length, leads.length), numerator: converted.length, denominator: leads.length, formula: "Converted leads / all retained leads × 100", target: "20% or above after 5 leads", status: rateStatus(percent(converted.length, leads.length), leads.length, 5, 20, 10), source: "Lead records + converted client links", detail: "The complete retained lead pool that has become a recorded client." }),
    makeFormula({ id: "decision-win", label: "Decision win rate", category: "outcome", unit: "percent", value: percent(converted.length, closed), numerator: converted.length, denominator: closed, formula: "Won decisions / (won + lost decisions) × 100", target: "60% or above", status: rateStatus(percent(converted.length, closed), closed, 3, 60, 35), source: "Lead pipeline terminal stages", detail: "Separates sales effectiveness from still-open pipeline." }),
    makeFormula({ id: "portfolio-retention", label: "Portfolio retention", category: "outcome", unit: "percent", value: percent(activeClients.length, portfolio), numerator: activeClients.length, denominator: portfolio, formula: "Active clients / (active + churned clients) × 100", target: "80% or above", status: rateStatus(percent(activeClients.length, portfolio), portfolio, 3, 80, 60), source: "Client status and lifecycle stage", detail: "Recorded retained client relationships as a share of known client outcomes." }),
    makeFormula({ id: "portfolio-churn", label: "Portfolio churn", category: "outcome", unit: "percent", value: percent(churnedClients.length, portfolio), numerator: churnedClients.length, denominator: portfolio, formula: "Churned clients / (active + churned clients) × 100", target: "Below 20%", status: inverseRateStatus(percent(churnedClients.length, portfolio), portfolio, 3, 20, 40), source: "Client status and lifecycle stage", detail: "The complement to recorded retention, without treating suspended clients as retained." }),
    makeFormula({ id: "revenue-per-lead", label: "Attributed revenue per lead", category: "outcome", unit: "currency", value: leads.length && campaignRevenue ? campaignRevenue / leads.length : null, numerator: campaignRevenue, denominator: leads.length, formula: "Attributed campaign revenue / attributed lead records", target: "Above approved acquisition plan", status: campaignRevenue && leads.length ? "healthy" : "learning", source: "Campaign attributed revenue + lead records", detail: "Only activates when campaign revenue has actually been entered." }),
    makeFormula({ id: "open-pipeline", label: "Open pipeline", category: "driver", unit: "count", value: open.length, formula: "Leads excluding won and lost terminal states", target: "Enough qualified demand to cover plan", status: open.length ? "healthy" : leads.length ? "warning" : "learning", source: "Lead pipeline stages", detail: "Every retained opportunity still available to progress." }),
    makeFormula({ id: "new-leads-30d", label: "New leads in 30 days", category: "driver", unit: "count", value: leadRows.filter(row => row.capturedAt >= now - 30 * DAY).length, formula: "Lead capture timestamps within the trailing 30 days", target: "Growing against approved demand plan", status: leadRows.some(row => row.capturedAt >= now - 30 * DAY) ? "healthy" : "warning", source: "Lead capturedAt", detail: "Fresh demand entering the commercial system." }),
    makeFormula({ id: "contact-rate", label: "Contacted rate", category: "driver", unit: "percent", value: percent(contacted.length, leads.length), numerator: contacted.length, denominator: leads.length, formula: "Leads with a contact or progressed stage / all leads × 100", target: "95% or above", status: rateStatus(percent(contacted.length, leads.length), leads.length, 1, 95, 70), source: "Lead contact timestamps + journey events", detail: "Whether new demand is receiving a human or automated follow-up." }),
    makeFormula({ id: "meeting-rate", label: "Meeting progression", category: "driver", unit: "percent", value: percent(meetings.length, leads.length), numerator: meetings.length, denominator: leads.length, formula: "Leads reaching meeting or later / all leads × 100", target: "Track against sales plan", status: leads.length ? meetings.length ? "healthy" : "warning" : "learning", source: "Meetings + lead stage", detail: "How much demand advances to a substantive sales conversation." }),
    makeFormula({ id: "proposal-rate", label: "Proposal progression", category: "driver", unit: "percent", value: percent(proposals.length, leads.length), numerator: proposals.length, denominator: leads.length, formula: "Leads reaching proposal or later / all leads × 100", target: "Track against sales plan", status: leads.length ? proposals.length ? "healthy" : "warning" : "learning", source: "Lead stage", detail: "The share of demand reaching a commercial offer." }),
    makeFormula({ id: "median-response", label: "Median speed to lead", category: "efficiency", unit: "duration", value: median(responseSamples), formula: "Median(first response time − latest enquiry time)", target: "5 minutes or less", status: durationStatus(median(responseSamples), responseSamples.length, 1, 5 * 60_000, 60 * 60_000), source: "Enquiry and response timestamps", detail: "Uses only enquiries with a recorded response; missing responses remain visible elsewhere." }),
    makeFormula({ id: "response-sla", label: "Five-minute response compliance", category: "efficiency", unit: "percent", value: percent(slaMet, responseSamples.length), numerator: slaMet, denominator: responseSamples.length, formula: "Responses within 5 minutes / measured responses × 100", target: "95% or above", status: rateStatus(percent(slaMet, responseSamples.length), responseSamples.length, 1, 95, 70), source: "Enquiry and response timestamps", detail: "Compliance among measurable lead responses." }),
    makeFormula({ id: "median-conversion", label: "Median conversion cycle", category: "efficiency", unit: "duration", value: median(conversionSamples), formula: "Median(convertedAt − capturedAt)", target: "45 days or less", status: durationStatus(median(conversionSamples), conversionSamples.length, 3, 45 * DAY, 90 * DAY), source: "Lead capture + conversion timestamps", detail: "Elapsed time from original lead capture to client conversion." }),
    makeFormula({ id: "median-open-age", label: "Median open pipeline age", category: "efficiency", unit: "duration", value: median(open.map(row => row.ageMs)), formula: "Median(now − latest stage entry) for open leads", target: "Below 14 days", status: durationStatus(median(open.map(row => row.ageMs)), open.length, 1, 14 * DAY, 30 * DAY), source: "Lead stage timestamps", detail: "Typical time the current open pipeline has remained in its present stage." }),
    makeFormula({ id: "stale-open", label: "Stale open lead rate", category: "efficiency", unit: "percent", value: percent(staleOpen.length, open.length), numerator: staleOpen.length, denominator: open.length, formula: "Open leads unchanged for 14+ days / open leads × 100", target: "0%", status: inverseRateStatus(percent(staleOpen.length, open.length), open.length, 1, 0, 20), source: "Lead stage timestamps", detail: "Opportunities whose current stage has not changed for at least fourteen days." }),
    makeFormula({ id: "enquiries-per-lead", label: "Enquiries per lead", category: "driver", unit: "ratio", value: leads.length ? enquiryTotal / leads.length : null, numerator: enquiryTotal, denominator: leads.length, formula: "Recorded enquiries / retained leads", target: "Monitor repeat demand", status: leads.length ? "healthy" : "learning", source: "Lead enquiry roll-ups", detail: "Shows repeat enquiry depth rather than treating each person as one isolated form." }),
    makeFormula({ id: "touches-per-lead", label: "Commercial touches per lead", category: "driver", unit: "ratio", value: leads.length ? touchTotal / leads.length : null, numerator: touchTotal, denominator: leads.length, formula: "Contact, meeting and stage events / retained leads", target: "Enough contact to progress without over-servicing", status: leads.length ? touchTotal ? "healthy" : "warning" : "learning", source: "Lead journey events", detail: "Recorded commercial activity across the lead journey." }),
    makeFormula({ id: "zero-touch-open", label: "Untouched open leads", category: "quality", unit: "count", value: zeroTouchOpen.length, formula: "Open leads with no contact timestamp or contact event", target: "0", status: zeroTouchOpen.length ? "critical" : open.length ? "healthy" : "learning", source: "Lead contact timestamps + journey events", detail: "Exact open records that have no evidence of follow-up." }),
    makeFormula({ id: "source-coverage", label: "Lead source coverage", category: "quality", unit: "percent", value: percent(attributedLeads.length, leads.length), numerator: attributedLeads.length, denominator: leads.length, formula: "Leads with a usable source / all leads × 100", target: "95% or above", status: rateStatus(percent(attributedLeads.length, leads.length), leads.length, 1, 95, 75), source: "Lead source", detail: "Whether acquisition can be compared by source." }),
    makeFormula({ id: "campaign-coverage", label: "Campaign linkage coverage", category: "quality", unit: "percent", value: percent(campaignLinked.length, leads.length), numerator: campaignLinked.length, denominator: leads.length, formula: "Leads matching a campaign source key / all leads × 100", target: "100% of campaign-generated leads", status: campaigns.length ? rateStatus(percent(campaignLinked.length, leads.length), leads.length, 1, 80, 50) : "learning", source: "Campaign source keys + lead source", detail: "Exact linkage from marketing campaign records to retained leads." }),
    makeFormula({ id: "stage-coverage", label: "Pipeline stage coverage", category: "quality", unit: "percent", value: percent(stageLinked.length, leads.length), numerator: stageLinked.length, denominator: leads.length, formula: "Leads linked to a pipeline stage / all leads × 100", target: "100%", status: rateStatus(percent(stageLinked.length, leads.length), leads.length, 1, 100, 85), source: "Pipeline cards + lead stage", detail: "Confirms every lead can be found on a current pipeline stage." }),
    makeFormula({ id: "conversion-linkage", label: "Converted client linkage", category: "quality", unit: "percent", value: percent(linkedConversions.length, converted.length), numerator: linkedConversions.length, denominator: converted.length, formula: "Converted leads linked to a client / converted leads × 100", target: "100%", status: rateStatus(percent(linkedConversions.length, converted.length), converted.length, 1, 100, 80), source: "Lead convertedClientId + client metadata", detail: "Ensures a won lead continues into a real client record." }),
    makeFormula({ id: "contactability", label: "Lead contactability", category: "quality", unit: "percent", value: percent(contactable.length, leads.length), numerator: contactable.length, denominator: leads.length, formula: "Leads with a usable email / all leads × 100", target: "100%", status: rateStatus(percent(contactable.length, leads.length), leads.length, 1, 100, 90), source: "Lead contact fields", detail: "Basic reachability coverage across retained leads." }),
    makeFormula({ id: "cost-per-lead", label: "Cost per acquired lead", category: "efficiency", unit: "currency", value: campaignSpend && campaignLinked.length ? campaignSpend / campaignLinked.length : null, numerator: campaignSpend, denominator: campaignLinked.length, formula: "Recorded campaign spend / campaign-linked leads", target: "At or below approved channel target", status: campaignSpend && campaignLinked.length ? "healthy" : "learning", source: "Campaign spend + source-linked leads", detail: "Blended cost per traceable lead across recorded campaigns." }),
    makeFormula({ id: "customer-acquisition-cost", label: "Customer acquisition cost", category: "efficiency", unit: "currency", value: campaignSpend && linkedConversions.length ? campaignSpend / linkedConversions.length : null, numerator: campaignSpend, denominator: linkedConversions.length, formula: "Recorded campaign spend / linked converted clients", target: "Below approved gross-profit allowance", status: campaignSpend && linkedConversions.length ? "healthy" : "learning", source: "Campaign spend + converted-client links", detail: "Blended paid acquisition cost using only traceable client conversions." }),
    makeFormula({ id: "campaign-roas", label: "Campaign return on spend", category: "outcome", unit: "ratio", value: campaignSpend ? campaignRevenue / campaignSpend : null, numerator: campaignRevenue, denominator: campaignSpend, formula: "Attributed campaign revenue / recorded campaign spend", target: "3.00× or above", status: campaignSpend ? campaignRevenue / campaignSpend >= 3 ? "healthy" : campaignRevenue / campaignSpend >= 1 ? "warning" : "critical" : "learning", source: "Campaign spend + attributed revenue", detail: "Activates only when spend is recorded; revenue remains attribution-dependent." }),
    makeFormula({ id: "pageview-to-form", label: "Pageview-to-form conversion", category: "driver", unit: "percent", value: percent(forms, pageviews), numerator: forms, denominator: pageviews, formula: "Tracked forms / tracked pageviews × 100", target: "1% or above", status: rateStatus(percent(forms, pageviews), pageviews, 1, 1, 0.3), source: "Aqua Tag telemetry", detail: "The monitored estate's ability to turn visits into captured demand." }),
    makeFormula({ id: "form-to-lead", label: "Form-to-lead retention", category: "quality", unit: "percent", value: percent(leads.length, forms), numerator: leads.length, denominator: forms, formula: "Retained lead records / tracked forms × 100", target: "100% after deduplication policy", status: forms ? rateStatus(percent(leads.length, forms), forms, 1, 80, 50) : "learning", source: "Aqua Tag forms + lead records", detail: "A directional reconciliation; repeat forms and non-web leads can make the ratio exceed 100%." }),
    makeFormula({ id: "lead-loss-rate", label: "Recorded lead loss rate", category: "outcome", unit: "percent", value: percent(lost.length, closed), numerator: lost.length, denominator: closed, formula: "Lost decisions / (won + lost decisions) × 100", target: "Below 40%", status: inverseRateStatus(percent(lost.length, closed), closed, 3, 40, 65), source: "Lead pipeline terminal stages", detail: "Loss among decided opportunities, excluding leads that remain open." }),
    makeFormula({ id: "decision-coverage", label: "Pipeline decision coverage", category: "quality", unit: "percent", value: percent(closed, leads.length), numerator: closed, denominator: leads.length, formula: "Won or lost decisions / all retained leads × 100", target: "Enough closure to support conversion conclusions", status: leads.length ? closed ? "healthy" : "learning" : "learning", source: "Lead pipeline terminal stages", detail: "Shows how much of the retained lead pool has reached a recorded outcome." }),
    makeFormula({ id: "repeat-enquiry-rate", label: "Repeat enquiry rate", category: "driver", unit: "percent", value: percent(repeatEnquiryLeads.length, leads.length), numerator: repeatEnquiryLeads.length, denominator: leads.length, formula: "Leads with 2+ enquiries / all leads × 100", target: "Monitor buying intent and support overlap", status: leads.length ? "healthy" : "learning", source: "Lead enquiry roll-ups", detail: "Identifies people returning through more than one enquiry event." }),
    makeFormula({ id: "response-measurement", label: "Response measurement coverage", category: "quality", unit: "percent", value: percent(responseSamples.length, leadsWithEnquiries.length), numerator: responseSamples.length, denominator: leadsWithEnquiries.length, formula: "Enquiry leads with a valid response clock / leads with enquiries × 100", target: "100%", status: rateStatus(percent(responseSamples.length, leadsWithEnquiries.length), leadsWithEnquiries.length, 1, 100, 80), source: "Enquiry and response timestamps", detail: "Separates response performance from missing response evidence." }),
    makeFormula({ id: "source-concentration", label: "Largest-source concentration", category: "quality", unit: "percent", value: percent(largestSource, leads.length), numerator: largestSource, denominator: leads.length, formula: "Leads from largest source cohort / all leads × 100", target: "Below 70% after 10 leads", status: inverseRateStatus(percent(largestSource, leads.length), leads.length, 10, 70, 85), source: "Normalised lead source cohorts", detail: "Acquisition resilience against dependence on a single source." }),
    makeFormula({ id: "source-diversity", label: "Acquisition source diversity", category: "driver", unit: "count", value: sources.filter(source => source.id !== "unattributed" && source.leads > 0).length, formula: "Distinct attributed source cohorts with at least one retained lead", target: "Intentional, measurable channel mix", status: attributedLeads.length ? "healthy" : "learning", source: "Normalised lead sources", detail: "The number of acquisition routes producing retained lead evidence." }),
    makeFormula({ id: "meeting-to-proposal", label: "Meeting-to-proposal progression", category: "driver", unit: "percent", value: percent(proposals.length, meetings.length), numerator: proposals.length, denominator: meetings.length, formula: "Leads reaching proposal / leads reaching meeting × 100", target: "Track against qualification policy", status: meetings.length ? proposals.length ? "healthy" : "warning" : "learning", source: "Lead meetings + pipeline stage", detail: "Measures progression after a substantive sales conversation." }),
    makeFormula({ id: "proposal-close-rate", label: "Proposal close rate", category: "outcome", unit: "percent", value: percent(converted.length, proposals.length), numerator: converted.length, denominator: proposals.length, formula: "Converted leads / leads reaching proposal × 100", target: "50% or above after 3 proposals", status: rateStatus(percent(converted.length, proposals.length), proposals.length, 3, 50, 25), source: "Lead proposal stage + client conversion", detail: "The commercial effectiveness of issued proposals." }),
    makeFormula({ id: "client-source-coverage", label: "Client source coverage", category: "quality", unit: "percent", value: percent(clientIdsWithSource.size, clients.length), numerator: clientIdsWithSource.size, denominator: clients.length, formula: "Clients with a linked lead or explicit source / all clients × 100", target: "95% or above", status: rateStatus(percent(clientIdsWithSource.size, clients.length), clients.length, 1, 95, 75), source: "Client metadata + converted lead links", detail: "Whether retained and churned client outcomes can flow back to acquisition." }),
    makeFormula({ id: "orphan-clients", label: "Clients without lead linkage", category: "quality", unit: "count", value: orphanClientRows.filter(row => sourceKey(row.source) === "unattributed").length, formula: "Client records without converted lead linkage or explicit acquisition source", target: "0", status: orphanClientRows.some(row => sourceKey(row.source) === "unattributed") ? "warning" : clients.length ? "healthy" : "learning", source: "Client metadata + lead conversion links", detail: "Exact client records whose acquisition history cannot yet be traced." }),
    makeFormula({ id: "campaign-budget-use", label: "Campaign budget utilisation", category: "efficiency", unit: "percent", value: percent(campaignSpend, campaignBudget), numerator: campaignSpend, denominator: campaignBudget, formula: "Recorded campaign spend / funded campaign budget × 100", target: "At or below 100% with planned deployment", status: campaignBudget ? campaignSpend > campaignBudget ? "critical" : "healthy" : "learning", source: "Campaign budget and spend", detail: "The portfolio's use of explicitly recorded campaign funding." }),
    makeFormula({ id: "revenue-per-client", label: "Attributed revenue per converted client", category: "outcome", unit: "currency", value: campaignRevenue && linkedConversions.length ? campaignRevenue / linkedConversions.length : null, numerator: campaignRevenue, denominator: linkedConversions.length, formula: "Attributed campaign revenue / linked converted clients", target: "Above acquisition cost and delivery allowance", status: campaignRevenue && linkedConversions.length ? "healthy" : "learning", source: "Campaign attributed revenue + converted client links", detail: "Revenue yield for each traceable converted relationship." }),
  ];

  return {
    generatedAt: now,
    formulas,
    stages: stageRows,
    people,
    sources,
    lineage: { pageviews, forms, pageviewsMeasured, formsMeasured, leads: leads.length, contacted: contacted.length, meetings: meetings.length, proposals: proposals.length, won: converted.length, activeClients: activeClients.length, churnedClients: churnedClients.length },
    quality: {
      sourceCoveragePercent: percent(attributedLeads.length, leads.length),
      campaignCoveragePercent: percent(campaignLinked.length, leads.length),
      stageCoveragePercent: percent(stageLinked.length, leads.length),
      conversionLinkCoveragePercent: percent(linkedConversions.length, converted.length),
      contactabilityPercent: percent(contactable.length, leads.length),
      exactRecords: people.length,
      missingSource: leads.length - attributedLeads.length,
      missingStage: leads.length - stageLinked.length,
      missingClientLink: converted.length - linkedConversions.length,
    },
  };
}

function buildSourceRows(leadRows: readonly CommercialPersonRow[], clients: readonly Client[], campaigns: readonly Campaign[]): CommercialSourcePerformance[] {
  const keys = new Set([...leadRows.map(row => sourceKey(row.source)), ...campaigns.flatMap(campaign => campaign.sourceKey ? [sourceKey(campaign.sourceKey)] : [])]);
  return [...keys].map(key => {
    const campaign = campaigns.find(item => item.sourceKey && sourceKey(item.sourceKey) === key);
    const rows = leadRows.filter(row => sourceKey(row.source) === key);
    const won = rows.filter(row => ["won", "client", "churned"].includes(row.state));
    const lost = rows.filter(row => row.state === "lost");
    const linkedClients = clients.filter(client => rows.some(row => row.clientId === client.id));
    const activeClients = linkedClients.filter(client => client.status === "active" && client.stage !== "churned");
    const churnedClients = linkedClients.filter(client => client.stage === "churned" || client.status === "archived");
    const spend = campaign?.spendCents ?? 0;
    const revenue = campaign?.attributedRevenueCents ?? 0;
    return {
      id: key,
      label: campaign?.name ? sourceLabel(campaign.sourceKey || key) : rows[0]?.source ?? sourceLabel(key),
      campaignId: campaign?.id,
      campaignName: campaign?.name,
      channel: campaign?.channel,
      leads: rows.length,
      open: rows.length - won.length - lost.length,
      won: won.length,
      lost: lost.length,
      clients: linkedClients.length,
      activeClients: activeClients.length,
      churnedClients: churnedClients.length,
      conversionRatePercent: percent(won.length, rows.length),
      decisionWinRatePercent: percent(won.length, won.length + lost.length),
      retentionRatePercent: percent(activeClients.length, activeClients.length + churnedClients.length),
      medianResponseMs: median(rows.flatMap(row => row.responseMs === null ? [] : [row.responseMs])),
      medianConversionMs: median(rows.flatMap(row => row.timeToConversionMs === null ? [] : [row.timeToConversionMs])),
      spendCents: spend,
      revenueCents: revenue,
      costPerLeadCents: spend && rows.length ? spend / rows.length : null,
      acquisitionCostCents: spend && won.length ? spend / won.length : null,
      roas: spend ? revenue / spend : null,
      href: campaign ? `/portal/agency/marketing?view=campaigns&campaign=${encodeURIComponent(campaign.id)}` : `/portal/clients?view=journey&source=${encodeURIComponent(key)}`,
    };
  }).sort((left, right) => right.leads - left.leads || left.label.localeCompare(right.label));
}

function formula(input: FormulaInput, currency: string): CommercialFormulaMetric {
  return { ...input, display: metricDisplay(input.value, input.unit, currency), href: input.href ?? "/portal/clients?view=journey", evidence: input.evidence ?? [input.source, input.denominator === undefined ? "Direct count" : `${input.numerator ?? 0}/${input.denominator}`] };
}

function metricDisplay(value: number | null, unit: CommercialMetricUnit, currency: string): string {
  if (value === null || !Number.isFinite(value)) return "Not measurable";
  if (unit === "percent") return `${round(value, 1)}%`;
  if (unit === "duration") return duration(value);
  if (unit === "currency") return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(value / 100);
  if (unit === "ratio") return `${round(value, 2)}×`;
  return Math.round(value).toLocaleString("en-GB");
}

function responseTime(lead: Lead): number | null {
  if (!lead.lastEnquiryAt || !lead.lastEnquiryRespondedAt || lead.lastEnquiryRespondedAt < lead.lastEnquiryAt) return null;
  return lead.lastEnquiryRespondedAt - lead.lastEnquiryAt;
}

function recordState(stageId: string, converted: boolean, client?: Client): CommercialRecordState {
  if (client?.stage === "churned" || client?.status === "archived") return "churned";
  if (client) return "client";
  if (converted || /won|convert/i.test(stageId)) return "won";
  if (/lost|disqual|closed/i.test(stageId)) return "lost";
  if (/proposal|quote|payment|negotiat/i.test(stageId)) return "proposal";
  if (/meeting|call|discovery/i.test(stageId)) return "meeting";
  if (/contact|qualif|opportun/i.test(stageId)) return "contacted";
  return "new";
}

function reachedStage(lead: Lead, stageId: string, columns: Pipeline["columns"]): boolean {
  if (lead.currentStageId === stageId) return true;
  if (lead.journeyEvents?.some(event => event.type === "stage-changed" && event.toStage === stageId)) return true;
  const currentIndex = columns.findIndex(column => column.id === lead.currentStageId);
  const targetIndex = columns.findIndex(column => column.id === stageId);
  const currentIsTerminalLoss = /lost|disqual|closed/i.test(lead.currentStageId ?? "");
  return !currentIsTerminalLoss && currentIndex >= 0 && targetIndex >= 0 && currentIndex >= targetIndex;
}
function sourceKey(value: string): string { const key = value.trim().toLowerCase().replace(/\s*:\s*/g, ":").replace(/\s+/g, "-"); return key && !["unknown", "none", "n/a", "not-recorded"].includes(key) ? key : "unattributed"; }
function sourceLabel(value: string): string { const key = sourceKey(value); return key === "unattributed" ? "Unattributed" : key.split(":").map(part => titleCase(part.replace(/-/g, " "))).join(": "); }
function titleCase(value: string): string { return value.replace(/[-_]/g, " ").replace(/\b\w/g, match => match.toUpperCase()); }
function percent(numerator: number, denominator: number): number | null { return denominator > 0 ? round(numerator / denominator * 100, 1) : null; }
function median(values: readonly number[]): number | null { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function round(value: number, precision = 1): number { const factor = 10 ** precision; return Math.round(value * factor) / factor; }
function duration(value: number): string { if (value < 60_000) return `${Math.round(value / 1_000)}s`; if (value < 3_600_000) return `${Math.round(value / 60_000)}m`; if (value < DAY) return `${round(value / 3_600_000, 1)}h`; return `${round(value / DAY, 1)}d`; }
function rateStatus(value: number | null, sample: number, minimum: number, healthy: number, warning: number): CommandKpiStatus { if (sample < minimum || value === null) return "learning"; return value >= healthy ? "healthy" : value >= warning ? "warning" : "critical"; }
function inverseRateStatus(value: number | null, sample: number, minimum: number, healthy: number, warning: number): CommandKpiStatus { if (sample < minimum || value === null) return "learning"; return value <= healthy ? "healthy" : value <= warning ? "warning" : "critical"; }
function durationStatus(value: number | null, sample: number, minimum: number, healthy: number, warning: number): CommandKpiStatus { if (sample < minimum || value === null) return "learning"; return value <= healthy ? "healthy" : value <= warning ? "warning" : "critical"; }
function stringValue(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function recordValue(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
