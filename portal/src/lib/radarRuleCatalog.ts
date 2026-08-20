import type { AdvisorDomain, RadarCheckTier, RadarDataDependency, RadarRuleLens } from "@/lib/businessRadar";
import { classifyRadarCheck } from "@/lib/radarClassification";

export interface RadarSignalFamilyDefinition {
  id: string;
  label: string;
  description: string;
}

export interface BusinessRadarRuleDefinition {
  id: string;
  domain: AdvisorDomain;
  familyId: string;
  familyLabel: string;
  lens: RadarRuleLens;
  lensLabel: string;
  description: string;
  /** Classification metadata (radar upgrade Stage 2). Every catalogue rule is `kpi` scope. */
  tier: RadarCheckTier;
  dataDependency: RadarDataDependency;
}

export const RADAR_RULE_LENSES: ReadonlyArray<{ id: RadarRuleLens; label: string; description: string }> = [
  { id: "connection", label: "Connection", description: "Confirms the source is connected and observable." },
  { id: "freshness", label: "Freshness", description: "Detects stale, delayed, or silent reporting." },
  { id: "threshold", label: "Threshold", description: "Checks the current value against its operating guardrail." },
  { id: "trend", label: "Trend", description: "Compares the current period with the preceding period." },
  { id: "anomaly", label: "Anomaly", description: "Finds unusual jumps, drops, and pattern breaks." },
  { id: "integrity", label: "Integrity", description: "Checks sample quality, completeness, and internal consistency." },
  { id: "continuity", label: "Continuity", description: "Proves the signal is reporting without an unexplained monitoring gap." },
  { id: "baseline", label: "Baseline", description: "Confirms enough historical context exists to distinguish normal from abnormal." },
  { id: "confidence", label: "Confidence", description: "Grades whether the sample is large and trustworthy enough for a decision." },
  { id: "forecast", label: "Forecast", description: "Projects whether current momentum is moving toward or away from the guardrail." },
  { id: "volatility", label: "Volatility", description: "Detects unstable movement that can hide inside an acceptable current value." },
  { id: "resilience", label: "Resilience", description: "Checks whether the result remains observable when a source becomes stale or degraded." },
] as const;

const DOMAIN_SIGNAL_FAMILIES: Record<AdvisorDomain, readonly RadarSignalFamilyDefinition[]> = {
  company: families([
    ["overall-health", "Overall company health", "Combined health across income, clients, pipeline, and operations."],
    ["income-health", "Income health", "Revenue pace against the current monthly target."],
    ["client-health", "Client portfolio health", "Share of active clients operating without an attention flag."],
    ["pipeline-health", "Pipeline health", "Commercial pipeline coverage against the revenue gap."],
    ["operations-health", "Operating health", "Open and overdue work pressure across the company."],
    ["revenue-target", "Revenue target progress", "Actual monthly revenue relative to the configured target."],
    ["revenue-gap", "Revenue gap", "Remaining money required to reach the monthly plan."],
    ["objectives", "Business objectives", "Current strategic objectives and their freshness."],
    ["plans", "Business plans", "Active plans, owners, timelines, and review state."],
    ["capacity", "Company capacity", "Available operating hours relative to committed delivery demand."],
    ["trading-companies", "Trading company coverage", "Operating records across every configured company and brand."],
    ["direction-profile", "Company direction profile", "Mission, vision, values, targets, and executive review freshness."],
    ["ownership-register", "Ownership register", "Active shareholders, issued shares, share classes, and voting control."],
    ["share-authority", "Share issue authority", "Issued shares remaining within the authorised amount for every class."],
    ["capital-ledger", "Capital movement ledger", "Contributions, loans, transfers, repayments, issues, and buybacks retained."],
    ["investment-valuations", "Investment valuation freshness", "Company-held investments carrying a current valuation date."],
    ["dividend-obligations", "Dividend obligations", "Declared distributions paid within their retained due dates."],
    ["capital-governance", "Capital governance evidence", "Completed capital movements and distributions linked to an approval decision."],
  ]),
  sales: families([
    ["enquiries-24h", "Enquiries in 24 hours", "New commercial enquiries received in the last day."],
    ["enquiries-7d", "Enquiries in 7 days", "Current weekly inbound enquiry volume."],
    ["enquiries-30d", "Enquiries in 30 days", "Rolling monthly inbound enquiry volume."],
    ["form-enquiries", "Form enquiries", "Commercial messages submitted through website forms."],
    ["chatbot-enquiries", "Chatbot enquiries", "Commercial conversations initiated through chatbot routes."],
    ["urgent-enquiries", "Urgent enquiries", "Open enquiries whose content or priority requires immediate action."],
    ["median-response", "Median speed to lead", "Typical time from enquiry submission to first response."],
    ["p90-response", "P90 speed to lead", "Slow-end lead response performance."],
    ["awaiting-response", "Leads awaiting response", "Open enquiries without a recorded first response."],
    ["target-breaches", "Lead response breaches", "Enquiries outside the configured response target."],
    ["pipeline-leads", "Pipeline lead volume", "Lead records currently available to the sales pipeline."],
    ["enquiry-linkage", "Enquiry-to-contact linkage", "Inbound enquiries linked to a lead or contact record."],
    ["enquiry-routing", "Enquiry routing coverage", "Tagged website sources pointing their enquiries at a specific client or company rather than the agency catch-all."],
  ]),
  inbox: families([
    ["conversation-volume", "Conversation volume", "Social and direct message conversations in the master inbox."],
    ["open-conversations", "Open conversations", "Inbox conversations still requiring resolution."],
    ["unread-messages", "Unread messages", "Unread inbound messages across connected channels."],
    ["response-overdue", "Response overdue", "Conversations whose response due time has passed."],
    ["unassigned-conversations", "Unassigned conversations", "Open conversations without a clear owner."],
    ["failed-messages", "Failed outbound messages", "Messages that failed to send or deliver."],
    ["channel-connections", "Channel connections", "Instagram and Facebook channel connection coverage."],
    ["connection-errors", "Connection errors", "Channels reporting connection or authentication problems."],
    ["webhook-health", "Webhook health", "Subscription and inbound webhook activity."],
    ["sync-freshness", "Inbox sync freshness", "Age of the latest successful sync or webhook."],
    ["support-demand", "Support demand", "Open support enquiries and portal support requests."],
    ["notification-delivery", "Enquiry notification delivery", "Delivery state of internal lead notifications."],
  ]),
  clients: families([
    ["active-clients", "Active clients", "Current active client portfolio size."],
    ["attention-clients", "Clients needing attention", "Clients with service, contact, delivery, or system concerns."],
    ["owner-coverage", "Client owner coverage", "Active clients with a responsible account email recorded."],
    ["contact-freshness", "Client contact freshness", "Time since the last recorded client contact."],
    ["telemetry-coverage", "Client telemetry coverage", "Active clients whose digital properties report live telemetry."],
    ["telemetry-freshness", "Client telemetry freshness", "Age of the latest client property event."],
    ["production-errors", "Client production errors", "Live errors recorded across client properties."],
    ["open-requests", "Open client requests", "Client requests that still need action."],
    ["blocked-milestones", "Blocked milestones", "Client outcomes blocked from progressing."],
    ["product-coverage", "Client product coverage", "Active clients with at least one product or service assigned."],
    ["source-attribution", "Client source attribution", "Client records retaining their original lead source."],
    ["retention-state", "Retention state", "Archived and churned clients relative to the active portfolio."],
  ]),
  finance: families([
    ["monthly-revenue", "Monthly revenue", "Recorded income in the current reporting month."],
    ["mrr", "Monthly recurring revenue", "Current recurring revenue baseline."],
    ["target-progress", "Revenue target progress", "Income pace against the monthly company target."],
    ["cash-gap", "Revenue and cash gap", "Outstanding amount required to reach plan."],
    ["overdue-invoices", "Overdue invoices", "Invoices whose payment deadline has passed."],
    ["budget-pressure", "Budget pressure", "Pots nearing or exceeding funded limits."],
    ["obligations", "Finance obligations", "Tax, audit, insurance, filing, and renewal deadlines."],
    ["people-payments", "People payments", "Salary, bonus, freelancer, and contractor payment readiness."],
    ["expense-evidence", "Expense evidence", "Paid costs backed by receipts or supporting records."],
    ["recurring-costs", "Recurring costs", "Scheduled expenses due or overdue."],
    ["currency-coverage", "Currency coverage", "Reporting currency and international transaction readiness."],
    ["finance-records", "Finance record coverage", "Connected invoices, expenses, budgets, and planning records."],
  ]),
  delivery: families([
    ["fulfilment-pipelines", "Fulfilment pipelines", "Configured delivery pipelines and stages."],
    ["delivery-cards", "Delivery work in flight", "Cards currently moving through fulfilment pipelines."],
    ["stalled-cards", "Stalled delivery work", "Delivery cards with no recent movement."],
    ["milestones", "Client milestones", "Tracked delivery and outcome milestones."],
    ["blocked-milestones", "Blocked delivery milestones", "Milestones explicitly marked as blocked."],
    ["overdue-milestones", "Overdue delivery milestones", "Incomplete milestones beyond their target date."],
    ["product-assignments", "Product assignments", "Products attached to active client workspaces."],
    ["pending-approvals", "Pending approvals", "Client approvals still awaiting a decision."],
    ["open-requests", "Delivery requests", "Open delivery and change requests from clients."],
    ["deliverables", "Deliverable coverage", "Files and final outputs recorded for active client work."],
    ["portal-readiness", "Portal readiness", "Prepared client portals and access delivery state."],
    ["delivery-alerts", "Delivery alerts", "Operational delivery issues requiring intervention."],
  ]),
  marketing: families([
    ["traffic-24h", "Website traffic in 24 hours", "Pageview activity across agency and client properties."],
    ["traffic-7d", "Website traffic in 7 days", "Current weekly traffic across monitored properties."],
    ["traffic-change", "Traffic movement", "Current traffic compared with the previous period."],
    ["traffic-surges", "Traffic surges", "Properties with unusually strong traffic growth."],
    ["traffic-drops", "Traffic drops", "Properties with material traffic decline or silence."],
    ["form-submissions", "Form submissions", "Every tracked website form submission."],
    ["conversions", "Tracked conversions", "Conversion events across agency and client journeys."],
    ["conversion-rate", "Website conversion rate", "Conversions as a share of tracked pageviews."],
    ["campaign-attribution", "Campaign attribution", "Enquiries retaining campaign or referral context."],
    ["unattributed-leads", "Unattributed leads", "Inbound demand without a usable source or campaign."],
    ["search-visibility", "Search visibility", "Search impressions and clicks from connected properties."],
    ["campaign-records", "Campaign record coverage", "Configured campaigns, channels, budgets, and owners."],
  ]),
  operations: families([
    ["open-tasks", "Open tasks", "Outstanding work across the operating system."],
    ["overdue-tasks", "Overdue tasks", "Tasks beyond their due date."],
    ["urgent-tasks", "Urgent tasks", "Open tasks marked urgent."],
    ["unassigned-tasks", "Unassigned tasks", "Open work without a responsible owner."],
    ["in-progress-tasks", "Work in progress", "Tasks actively being worked."],
    ["due-soon", "Tasks due soon", "Work due within the next 24 hours."],
    ["task-completion", "Task completion", "Work completed during the current week."],
    ["activity-volume", "Workspace activity", "Recorded actions across the business."],
    ["activity-freshness", "Activity freshness", "Time since the latest workspace event."],
    ["active-automations", "Active automations", "Enabled workflows performing internal work."],
    ["automation-failures", "Automation failures", "Failed workflow executions and outcomes."],
    ["automation-coverage", "Automation coverage", "Core workflows with an active automation or manual control."],
  ]),
  compliance: families([
    ["legal-register", "Legal register", "Legal and compliance records held by the company."],
    ["expired-records", "Expired legal records", "Documents and cover already beyond expiry."],
    ["due-records", "Legal deadlines", "Records expiring or due within 30 days."],
    ["action-required", "Compliance action required", "Legal records explicitly requiring action."],
    ["insurance", "Insurance coverage", "Current insurance policies and renewal visibility."],
    ["contracts", "Contract coverage", "Client and supplier agreements with recorded status."],
    ["contract-acceptance", "Contract acceptance", "Issued agreements awaiting acceptance."],
    ["tax-records", "Tax and HMRC records", "Tax registrations, filings, and supporting documents."],
    ["policy-coverage", "Policy coverage", "Current internal and public policy documents."],
    ["audit-readiness", "Audit readiness", "Evidence, deadlines, and records required for review."],
    ["compliance-freshness", "Compliance review freshness", "Age of the latest legal register review."],
    ["obligation-coverage", "Obligation coverage", "Finance and legal obligations captured before they fall due."],
  ]),
  development: families([
    ["property-coverage", "Digital property coverage", "Agency and client websites, portals, and software properties."],
    ["tag-coverage", "Aqua Tag coverage", "Properties with an installed and reporting telemetry tag."],
    ["tag-freshness", "Aqua Tag freshness", "Age of the latest event from every connected property."],
    ["heartbeat-health", "Server heartbeat health", "Expected heartbeat events from live properties."],
    ["production-errors", "Production errors", "Runtime errors recorded in live environments."],
    ["error-rate", "Error rate", "Errors relative to tracked traffic volume."],
    ["load-performance", "Page load performance", "Average tracked load time across properties."],
    ["slow-properties", "Slow properties", "Properties exceeding the page-load guardrail."],
    ["deployments", "Deployment activity", "Production deployment events in the last 30 days."],
    ["release-errors", "Release-linked errors", "Errors correlated with a release or deployment."],
    ["monitoring-silence", "Monitoring silence", "Live properties that have stopped reporting."],
    ["telemetry-integrity", "Telemetry integrity", "Valid event shapes, timestamps, sessions, and property linkage."],
    ["injection-coverage", "Tag injection coverage", "Tagged sites configured to inject third-party tools (analytics, pixels, verification) through the Aqua Tag."],
  ]),
  team: families([
    ["team-size", "Team size", "Active users with access to the workspace."],
    ["owner-coverage", "Leadership coverage", "Agency owner and manager role coverage."],
    ["staff-coverage", "Staff coverage", "Operational staff available for assigned work."],
    ["freelancer-coverage", "Freelancer coverage", "External talent and contractor records."],
    ["task-ownership", "Task ownership", "Open work assigned to a responsible person."],
    ["workload-balance", "Workload balance", "Open tasks distributed across the available team."],
    ["capacity-plan", "Capacity plan", "Configured weekly hours and delivery assumptions."],
    ["capacity-pressure", "Capacity pressure", "Committed work relative to available hours."],
    ["hiring-trigger", "Hiring trigger", "Capacity utilisation against the hiring threshold."],
    ["capacity-growth", "Growth capacity", "Growth and marketing demand against its configured people allocation."],
    ["capacity-sales", "Sales capacity", "Acquisition demand, follow-up and meeting load against sales capacity."],
    ["capacity-client-success", "Client success capacity", "Relationship, support and retention demand against available care capacity."],
    ["capacity-delivery", "Delivery capacity", "Committed fulfilment demand against available delivery hours."],
    ["capacity-operations", "Operations capacity", "Coordination, administration and quality demand against operating capacity."],
    ["capacity-finance", "Finance capacity", "Finance, reporting and compliance demand against specialist capacity."],
    ["capacity-systems", "Systems capacity", "Technical, automation and development demand against specialist capacity."],
    ["people-payments", "People payment readiness", "Salary, bonus, freelancer, and contractor payment coverage."],
    ["objective-ownership", "Objective ownership", "Strategic objectives assigned to accountable people."],
    ["role-integrity", "Role and access integrity", "People with complete, appropriate workspace roles."],
    ["candidate-backlog", "Candidate review backlog", "Applications waiting beyond the hiring review guardrail."],
    ["employee-portal-coverage", "Employee portal coverage", "Active people linked to an authenticated employee workspace."],
    ["onboarding-readiness", "Onboarding readiness", "Required onboarding work completed by company and employee."],
    ["leave-decisions", "Leave decision time", "Leave requests waiting for a retained manager decision."],
    ["leave-entitlement", "Leave entitlement coverage", "Employees with an appropriate retained allowance."],
    ["shift-coverage", "Shift coverage", "Published assignments with valid times and owners."],
    ["training-overdue", "Training overdue", "Required training beyond its retained due date."],
    ["training-completion", "Training completion", "Assigned development work completed with evidence."],
    ["workspace-composition", "Workspace composition", "Every active employee has an explicit scoped station set."],
    ["commission-governance", "Commission governance", "Active commission rules with valid rates, cadence and dates."],
    ["employment-terms", "Employment terms", "Active people with retained title, type, hours, pay basis and start date."],
    ["onboarding-age", "Onboarding age", "Preboarding records moving through required steps without stalling."],
  ]),
  systems: families([
    ["installed-modules", "Installed modules", "Enabled AquaCRM modules included in monitoring."],
    ["module-data", "Module data coverage", "Enabled modules with readable records."],
    ["module-health", "Module health checks", "Recent health state for every enabled module."],
    ["integration-coverage", "Integration coverage", "Connected external systems and providers."],
    ["integration-failures", "Integration failures", "Connections whose latest test failed."],
    ["data-freshness", "Business data freshness", "Age of the latest recorded workspace change."],
    ["automation-health", "Automation engine health", "Workflow execution and failure state."],
    ["custom-ai-register", "Custom AI register", "Recorded specialist AI systems and access links."],
    ["telemetry-ingestion", "Telemetry ingestion", "Event collection across monitored properties."],
    ["inbox-ingestion", "Inbox ingestion", "Webhook and message ingestion from connected channels."],
    ["storage-activity", "Persistence activity", "Durable business records and recent writes."],
    ["blind-spot-control", "Blind spot control", "Sources that are disconnected, unavailable, or uninstrumented."],
    ["portal-connections", "Portal connections", "Client software linked into their portals, and whether it still reports."],
  ]),
};

export const RADAR_SIGNAL_FAMILIES = DOMAIN_SIGNAL_FAMILIES;
export const BUSINESS_RADAR_RULE_CATALOG: readonly BusinessRadarRuleDefinition[] = Object.entries(DOMAIN_SIGNAL_FAMILIES)
  .flatMap(([domain, domainFamilies]) => domainFamilies.flatMap(family => RADAR_RULE_LENSES.map(lens => ({
    id: `radar:${domain}:${family.id}:${lens.id}`,
    domain: domain as AdvisorDomain,
    familyId: family.id,
    familyLabel: family.label,
    lens: lens.id,
    lensLabel: lens.label,
    description: `${lens.description} ${family.description}`,
    // Catalogue rules are all evaluated in-state during the Pulse build (scope "kpi").
    ...classifyRadarCheck({ scope: "kpi", lens: lens.id }),
  }))));

export const RADAR_CHECKS_PER_DOMAIN = RADAR_RULE_LENSES.length * 12;

export function radarRulesForDomain(domain: AdvisorDomain): readonly BusinessRadarRuleDefinition[] {
  return BUSINESS_RADAR_RULE_CATALOG.filter(rule => rule.domain === domain);
}

function families(rows: ReadonlyArray<readonly [string, string, string]>): readonly RadarSignalFamilyDefinition[] {
  return rows.map(([id, label, description]) => ({ id, label, description }));
}
