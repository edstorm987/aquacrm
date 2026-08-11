import "server-only";

import type {
  AdvisorCoverageSource,
  AdvisorDomain,
  BusinessIssueRadar,
  BusinessIssueSeverity,
  BusinessMetricSignal,
  BusinessRadarIssue,
  BusinessSignalStatus,
  SpeedToLeadRadar,
} from "@/lib/businessRadar";
import { buildRadarCheckMatrix, summarizeRadarChecks } from "@/lib/radarCheckEngine";
import { buildRadarCorrelationIssues } from "@/lib/radarCorrelations";
import { applyAdaptiveRadarPolicy } from "@/lib/radarPolicyEngine";
import { RADAR_CHECKS_PER_DOMAIN, RADAR_RULE_LENSES } from "@/lib/radarRuleCatalog";
import { buildPropertySentinelChecks, buildRadarWatchdogChecks, buildSourceSentinelChecks } from "@/lib/radarSentinels";
import { buildSyntheticCanaryChecks, buildSyntheticCanaryIssues } from "@/lib/radarSyntheticChecks";
import { formatElapsed } from "@/lib/leadTiming";
import { getAgencyWorkspaceSettings } from "@/server/agencySettings";
import { listLegalDocuments } from "@/server/legalDocuments";
import { getState } from "@/server/storage";
import { listAgencyTasks } from "@/server/tasks";
import { listClients } from "@/server/tenants";
import { listUsersForAgency } from "@/server/users";
import { listInboxSnapshot } from "./inboxStore";
import { buildCompanyHealthSnapshot } from "./companyHealthSnapshot";
import { listOperationalAlerts, type OperationalAlert } from "./operationalAlerts";
import { listWebsiteEnquiries, type WebsiteEnquiry } from "./websiteEnquiries";
import { buildRadarObservations } from "./radarObservations";
import { buildRadarMemoryDigest, buildRadarMemoryIssues } from "./radarMemory";
import { applyRadarEvidenceBaselines, buildRadarEvidenceLayer } from "./radarEvidenceVault";
import { buildRadarTelemetrySnapshot } from "./radarTelemetry";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const RADAR_CACHE_TTL_MS = 30_000;

interface RadarCacheEntry {
  expiresAt: number;
  radar?: BusinessIssueRadar;
  pending?: Promise<BusinessIssueRadar>;
}

const radarCache = new Map<string, RadarCacheEntry>();

export function invalidateBusinessIssueRadarCache(agencyId: string): void {
  radarCache.delete(agencyId);
}

interface RadarInputs {
  company?: Awaited<ReturnType<typeof buildCompanyHealthSnapshot>>;
  operationalAlerts?: OperationalAlert[];
}

export function getCachedBusinessIssueRadar(
  agencyId: string,
  now = Date.now(),
): Promise<BusinessIssueRadar> {
  const cached = radarCache.get(agencyId);
  if (cached?.radar && cached.expiresAt > now) return Promise.resolve(cached.radar);
  if (cached?.pending) return cached.pending;

  const pending = buildBusinessIssueRadar(agencyId, now)
    .then(radar => {
      radarCache.set(agencyId, {
        radar,
        expiresAt: Date.now() + RADAR_CACHE_TTL_MS,
      });
      return radar;
    })
    .catch(error => {
      radarCache.delete(agencyId);
      throw error;
    });

  radarCache.set(agencyId, { pending, expiresAt: now + RADAR_CACHE_TTL_MS });
  return pending;
}

export async function buildBusinessIssueRadar(
  agencyId: string,
  now = Date.now(),
  inputs: RadarInputs = {},
): Promise<BusinessIssueRadar> {
  const state = getState();
  const settings = getAgencyWorkspaceSettings(agencyId);
  const clients = listClients(agencyId);
  const tasks = listAgencyTasks(agencyId);
  const legalDocuments = listLegalDocuments(agencyId);
  const team = listUsersForAgency(agencyId);
  const installs = Object.values(state.pluginInstalls).filter(install => install.agencyId === agencyId && install.enabled);
  const [companyResult, alertResult, enquiryResult, inboxResult] = await Promise.allSettled([
    inputs.company ? Promise.resolve(inputs.company) : buildCompanyHealthSnapshot(agencyId, now),
    inputs.operationalAlerts ? Promise.resolve(inputs.operationalAlerts) : listOperationalAlerts(agencyId, now),
    listWebsiteEnquiries(500),
    listInboxSnapshot(agencyId),
  ]);
  const company = companyResult.status === "fulfilled" ? companyResult.value : null;
  const operationalAlerts = alertResult.status === "fulfilled" ? alertResult.value : [];
  const enquiries = enquiryResult.status === "fulfilled" ? enquiryResult.value : [];
  const inbox = inboxResult.status === "fulfilled" ? inboxResult.value : null;
  const issues = operationalAlerts.map(issueFromOperationalAlert);
  const coverage: AdvisorCoverageSource[] = [];
  const signals: BusinessMetricSignal[] = [];
  const syntheticProbes = state.radarSyntheticProbes[agencyId] ?? {};
  const telemetry = buildRadarTelemetrySnapshot(state.agencyWebsites[agencyId], clients, syntheticProbes, now);
  issues.push(...telemetry.issues);
  issues.push(...buildSyntheticCanaryIssues(telemetry, syntheticProbes, now));

  const recentEnquiries = enquiries.filter(enquiry => enquiry.submittedAt >= now - 30 * DAY);
  const speedToLead = buildSpeedToLeadRadar(recentEnquiries, settings.advisor, now);
  signals.push(speedToLeadSignal(speedToLead, now));
  const speedIssue = speedToLeadIssue(speedToLead, recentEnquiries, now);
  if (speedIssue) issues.push(speedIssue);

  if (company) {
    signals.push({
      id: "metric:company-health",
      domain: "company",
      label: "Company health",
      value: company.health.overall,
      display: `${company.health.overall}/100`,
      target: "80 or above",
      status: scoreStatus(company.health.overall),
      detail: `Income ${company.health.income}, clients ${company.health.clients}, pipeline ${company.health.pipeline}, operations ${company.health.operations}.`,
      href: "/portal/agency/company",
      measuredAt: now,
    });
    if (company.health.overall < 70) {
      issues.push({
        id: "metric:company-health-below-target",
        severity: company.health.overall < 40 ? "critical" : "warning",
        domain: "company",
        title: `Company health is ${company.health.overall}/100`,
        detail: "At least one core operating area is materially behind its current target or expected baseline.",
        evidence: [
          `Income ${company.health.income}/100`,
          `Clients ${company.health.clients}/100`,
          `Pipeline ${company.health.pipeline}/100`,
          `Operations ${company.health.operations}/100`,
        ],
        href: "/portal/agency/company",
        detectedAt: now,
        sourceIds: ["metric:company-health"],
      });
    }
  }

  const openTasks = tasks.filter(task => task.status !== "done");
  const overdueTasks = openTasks.filter(task => Boolean(task.dueAt && task.dueAt < now));
  signals.push({
    id: "metric:overdue-work",
    domain: "operations",
    label: "Overdue work",
    value: overdueTasks.length,
    display: String(overdueTasks.length),
    target: "0 overdue",
    status: overdueTasks.length > 3 ? "critical" : overdueTasks.length ? "warning" : "healthy",
    detail: `${openTasks.length} open task${openTasks.length === 1 ? "" : "s"} are currently recorded.`,
    href: "/portal/agency/actions",
    measuredAt: now,
    sampleSize: openTasks.length,
  });

  const activeClients = clients.filter(client => client.status === "active");
  const clientsNeedingAttention = company?.actuals.clientsNeedingAttention ?? 0;
  signals.push({
    id: "metric:client-attention",
    domain: "clients",
    label: "Clients needing attention",
    value: clientsNeedingAttention,
    display: `${clientsNeedingAttention} of ${activeClients.length}`,
    target: "0 needing attention",
    status: clientsNeedingAttention > Math.max(2, activeClients.length / 2) ? "critical" : clientsNeedingAttention ? "warning" : activeClients.length ? "healthy" : "unknown",
    detail: "Checks contact gaps, open requests, blocked milestones, missing owners and production errors.",
    href: "/portal/clients?view=health",
    measuredAt: now,
    sampleSize: activeClients.length,
  });

  const recentActivity = state.activity.filter(entry => entry.agencyId === agencyId);
  const lastWorkspaceActivity = recentActivity.reduce((latest, entry) => Math.max(latest, entry.ts), 0);
  if (lastWorkspaceActivity && now - lastWorkspaceActivity > settings.advisor.staleDataHours * HOUR) {
    issues.push({
      id: "coverage:stale-workspace-data",
      severity: "warning",
      domain: "systems",
      title: "Business records may be stale",
      detail: `No workspace activity has been recorded for ${formatElapsed(now - lastWorkspaceActivity)}. Advisor conclusions may miss work completed elsewhere.`,
      evidence: [`Last recorded activity ${new Date(lastWorkspaceActivity).toISOString()}`, `Freshness guardrail ${settings.advisor.staleDataHours} hours`],
      href: "/portal/agency/settings#logs",
      detectedAt: now,
      sourceIds: ["activity-log"],
    });
  }

  const leadInstall = installs.find(install => install.pluginId === "leads-pipeline");
  const financeInstall = installs.find(install => install.pluginId === "agency-finance");
  const marketingInstall = installs.find(install => install.pluginId === "agency-marketing");
  const fulfilmentInstall = installs.find(install => install.pluginId === "fulfillment");
  const agencyPipelines = Object.values(state.pipelines).filter(pipeline => pipeline.agencyId === agencyId);
  const developmentWebsite = state.agencyWebsites[agencyId];
  const salesStatus: AdvisorCoverageSource["status"] = leadInstall ? (company?.actuals.leadCount ? "connected" : "empty") : "disconnected";
  const inboxStatus: AdvisorCoverageSource["status"] = enquiryResult.status === "rejected" && inboxResult.status === "rejected"
    ? "unavailable"
    : recentEnquiries.length || (inbox?.conversations.length ?? 0) ? "connected" : "empty";
  const financeStatus: AdvisorCoverageSource["status"] = financeInstall
    ? pluginRecordCount(state, financeInstall.id) ? "connected" : "empty"
    : "disconnected";
  const marketingStatus: AdvisorCoverageSource["status"] = marketingInstall || leadInstall
    ? pluginRecordCount(state, marketingInstall?.id ?? leadInstall?.id ?? "") || telemetry.totals.properties ? "connected" : "empty"
    : telemetry.totals.properties ? "connected" : "disconnected";
  const deliveryStatus: AdvisorCoverageSource["status"] = fulfilmentInstall || agencyPipelines.some(pipeline => pipeline.kind === "fulfilment") ? "connected" : "empty";
  const developmentStatus: AdvisorCoverageSource["status"] = telemetry.totals.properties
    ? telemetry.totals.connectedTags ? "connected" : "empty"
    : developmentWebsite ? "empty" : "disconnected";

  coverage.push(
    coverageSource("core:company", "company", "Company planning", "connected", company ? 1 : 0, company ? "Company health, objectives, plans and targets are readable." : "Company health could not be calculated.", now),
    coverageSource("core:clients", "clients", "Clients and contacts", clients.length ? "connected" : "empty", clients.length, "Client records, health, notes, requests and lifecycle data.", latestTimestamp(clients)),
    coverageSource("core:operations", "operations", "Actions and activity", tasks.length || recentActivity.length ? "connected" : "empty", tasks.length + recentActivity.length, "Tasks, reminders and workspace activity.", Math.max(latestTimestamp(tasks), lastWorkspaceActivity)),
    coverageSource("core:compliance", "compliance", "Legal and compliance", legalDocuments.length ? "connected" : "empty", legalDocuments.length, "Legal documents, insurance, reminders and expiry dates.", latestTimestamp(legalDocuments)),
    coverageSource("core:team", "team", "Team and capacity", team.length ? "connected" : "empty", team.length, "Workspace people, ownership and roles.", latestTimestamp(team)),
    coverageSource("core:sales", "sales", "Lead pipeline", salesStatus, company?.actuals.leadCount ?? 0, leadInstall ? "Lead pipeline and journey timing are connected." : "Install or enable the lead pipeline to measure sales flow.", leadInstall?.installedAt),
    coverageSource("core:inbox", "inbox", "Website and social inbox", inboxStatus, enquiries.length + (inbox?.conversations.length ?? 0), "Website enquiries, support and connected social conversations.", Math.max(latestTimestamp(enquiries), inbox?.generatedAt ?? 0)),
    coverageSource("core:finance", "finance", "Finance", financeStatus, financeInstall ? pluginRecordCount(state, financeInstall.id) : 0, financeInstall ? "Finance records, budgets, obligations and payments are connected." : "Enable Finance to monitor cash, budgets and obligations.", financeInstall?.installedAt),
    coverageSource("core:marketing", "marketing", "Marketing and acquisition", marketingStatus, (marketingInstall || leadInstall ? pluginRecordCount(state, marketingInstall?.id ?? leadInstall?.id ?? "") : 0) + telemetry.totals.forms7d + telemetry.totals.conversions7d, marketingInstall || leadInstall || telemetry.totals.properties ? "Campaigns, attribution, forms, conversions, search, and property traffic are monitored." : "Enable Marketing or connect Aqua Tag to measure acquisition.", Math.max(marketingInstall?.installedAt ?? 0, leadInstall?.installedAt ?? 0, telemetry.totals.latestEventAt ?? 0)),
    coverageSource("core:delivery", "delivery", "Fulfilment", deliveryStatus, agencyPipelines.length, "Fulfilment pipelines, client milestones and delivery records.", fulfilmentInstall?.installedAt ?? latestTimestamp(agencyPipelines)),
    coverageSource("core:development", "development", "Websites, servers and Aqua Tag", developmentStatus, telemetry.totals.properties + telemetry.properties.reduce((total, property) => total + property.events.length, 0), "Agency and client property telemetry, errors, heartbeats, tags, releases, traffic, forms, and performance.", telemetry.totals.latestEventAt),
  );

  for (const install of installs) {
    coverage.push(coverageSource(
      `module:${install.pluginId}:${install.id}`,
      domainForPlugin(install.pluginId),
      readable(install.pluginId),
      pluginRecordCount(state, install.id) ? "connected" : "empty",
      pluginRecordCount(state, install.id),
      `Installed module ${install.pluginId} is included in Advisor business context.`,
      install.healthCheckedAt ?? install.installedAt,
    ));
  }

  const blindSpots = coverage.filter(source => source.status === "disconnected" || source.status === "unavailable");
  if (blindSpots.length) {
    issues.push({
      id: "coverage:business-blind-spots",
      severity: "critical",
      domain: "systems",
      title: `${blindSpots.length} Advisor coverage gap${blindSpots.length === 1 ? "" : "s"}`,
      detail: `${blindSpots.map(source => source.label).join(", ")} ${blindSpots.length === 1 ? "is" : "are"} not fully connected, so a clear result there is not yet proof that everything is healthy.`,
      evidence: blindSpots.map(source => `${source.label}: ${source.status}`),
      href: "/portal/agency/company?view=connections",
      detectedAt: now,
      sourceIds: blindSpots.map(source => source.id),
    });
  }

  signals.push(
    {
      id: "metric:traffic-7d",
      domain: "marketing",
      label: "Tracked traffic",
      value: telemetry.totals.pageviews7d,
      display: `${telemetry.totals.pageviews7d} pageviews`,
      target: "Stable or growing week over week",
      status: telemetry.totals.trafficDrops ? "warning" : telemetry.totals.properties ? "healthy" : "unknown",
      detail: `${telemetry.totals.trafficSurges} surging and ${telemetry.totals.trafficDrops} declining propert${telemetry.totals.trafficDrops === 1 ? "y" : "ies"}.`,
      href: "/portal/agency/performance",
      measuredAt: now,
      sampleSize: telemetry.totals.properties,
    },
    {
      id: "metric:form-submissions",
      domain: "marketing",
      label: "Form submissions",
      value: telemetry.totals.forms24h,
      display: `${telemetry.totals.forms24h} in 24h`,
      target: "Every submission attributed, linked and answered",
      status: telemetry.totals.properties ? "healthy" : "unknown",
      detail: `${telemetry.totals.forms7d} forms and ${telemetry.totals.conversions7d} conversions were captured in 7 days.`,
      href: "/portal/agency/inbox?view=forms",
      measuredAt: now,
      sampleSize: telemetry.totals.forms7d,
    },
    {
      id: "metric:aqua-tag-coverage",
      domain: "development",
      label: "Aqua Tag coverage",
      value: telemetry.totals.connectedTags,
      display: `${telemetry.totals.connectedTags}/${telemetry.totals.expectedProperties}`,
      target: "Every live property reporting",
      status: telemetry.totals.expectedProperties === 0 ? "unknown" : telemetry.totals.connectedTags < telemetry.totals.expectedProperties ? "warning" : "healthy",
      detail: `${telemetry.totals.staleTags} tag${telemetry.totals.staleTags === 1 ? " is" : "s are"} stale beyond 48 hours.`,
      href: "/portal/agency/performance",
      measuredAt: now,
      sampleSize: telemetry.totals.expectedProperties,
    },
    {
      id: "metric:production-errors",
      domain: "development",
      label: "Production errors",
      value: telemetry.totals.errors24h,
      display: `${telemetry.totals.errors24h} in 24h`,
      target: "0 errors",
      status: telemetry.totals.errors24h >= 5 ? "critical" : telemetry.totals.errors24h ? "warning" : telemetry.totals.properties ? "healthy" : "unknown",
      detail: `${telemetry.totals.slowProperties} propert${telemetry.totals.slowProperties === 1 ? "y is" : "ies are"} slower than 2500ms.`,
      href: "/portal/agency/performance",
      measuredAt: now,
      sampleSize: telemetry.totals.properties,
    },
  );

  const observations = applyRadarEvidenceBaselines(agencyId, buildRadarObservations({
    now,
    state,
    agencyId,
    company,
    clients,
    tasks,
    legalDocuments,
    team,
    enquiries,
    inbox,
    operationalAlerts,
    speedToLead,
    telemetry,
    coverage,
  }));
  const evidenceLayer = buildRadarEvidenceLayer(agencyId, observations, now, settings.advisor.radarPolicy);
  issues.push(...evidenceLayer.issues);
  const catalogMatrix = buildRadarCheckMatrix(observations, coverage, now);
  const correlationIssues = buildRadarCorrelationIssues(observations, catalogMatrix.checks, now);
  issues.push(...correlationIssues);
  const sourceSentinels = buildSourceSentinelChecks(coverage, now);
  const propertySentinels = buildPropertySentinelChecks(telemetry, now);
  const syntheticSentinels = buildSyntheticCanaryChecks(telemetry, syntheticProbes, now);
  const historicalChecks = evidenceLayer.checks;
  const checksBeforeWatchdog = [...catalogMatrix.checks, ...sourceSentinels, ...propertySentinels, ...syntheticSentinels, ...historicalChecks];
  const watchdogChecks = buildRadarWatchdogChecks({
    checks: checksBeforeWatchdog,
    coverage,
    telemetry,
    correlationIssues,
    evidence: evidenceLayer.digest,
    now,
  });
  const rawChecks = [...checksBeforeWatchdog, ...watchdogChecks];
  const rawDomains = summarizeRadarChecks(rawChecks, coverage);
  for (const domain of rawDomains.filter(item => item.blindChecks > 0)) {
    issues.push({
      id: `coverage:${domain.domain}-check-blindness`,
      severity: "critical",
      domain: domain.domain,
      title: `${domain.blindChecks} ${readable(domain.domain).toLowerCase()} checks cannot prove health`,
      detail: `${domain.coveragePercent}% of this domain's ${domain.totalChecks} checks can currently run. Missing evidence is being treated as a visible blind spot, never as a pass.`,
      evidence: [`${domain.totalChecks} total checks`, `${domain.blindChecks} blind`, `${domain.sourceCount} registered sources`],
      href: "/portal/agency/company?view=connections",
      detectedAt: now,
      sourceIds: coverage.filter(source => source.domain === domain.domain).map(source => source.id),
    });
  }

  const dedupedIssues = dedupeIssues(issues).sort(issueSort).slice(0, 320);
  const businessContext = {
    currency: company?.actuals.currency ?? settings.defaultCurrency,
    monthRevenueCents: company?.actuals.monthRevenueCents ?? 0,
    monthlyRevenueTargetCents: company?.profile.monthlyRevenueTargetCents ?? 0,
    revenueGapCents: company?.revenueGapCents ?? 0,
    leadCount: company?.actuals.leadCount ?? 0,
    activeClientCount: company?.actuals.activeClients ?? activeClients.length,
    meetingsThisMonth: company?.actuals.meetingsThisMonth ?? 0,
    estimatedCallsNeeded: company?.estimatedCallsNeeded ?? 0,
  };
  const adaptive = applyAdaptiveRadarPolicy({
    checks: rawChecks,
    issues: dedupedIssues,
    signals,
    coverage,
    policy: settings.advisor.radarPolicy,
    business: businessContext,
    enquiryCount: recentEnquiries.length,
    now,
  });
  const checks = adaptive.checks;
  const passingChecks = checks.filter(check => check.status === "pass").length;
  const firingChecks = checks.filter(check => check.status === "critical" || check.status === "warning").length;
  const watchChecks = checks.filter(check => check.status === "watch").length;
  const blindChecks = checks.filter(check => check.status === "blind").length;
  const learningChecks = checks.filter(check => check.status === "learning").length;
  const inactiveChecks = checks.filter(check => check.status === "inactive").length;
  const applicableChecks = checks.length - inactiveChecks;
  const assuredChecks = passingChecks + firingChecks;
  const radar = {
    generatedAt: now,
    summary: {
      critical: adaptive.incidents.filter(issue => issue.severity === "critical").length,
      warning: adaptive.incidents.filter(issue => issue.severity === "warning").length,
      watch: adaptive.incidents.filter(issue => issue.severity === "watch").length,
      connectedSources: coverage.filter(source => source.status === "connected").length,
      totalSources: coverage.length,
      blindSpots: blindSpots.length,
      totalChecks: checks.length,
      passedChecks: passingChecks,
      firingChecks,
      watchChecks,
      blindChecks,
      learningChecks,
      inactiveChecks,
      applicableChecks,
      assuredChecks,
      checksPerDomain: RADAR_CHECKS_PER_DOMAIN,
      detectorLenses: RADAR_RULE_LENSES.length,
      assurancePercent: applicableChecks ? Math.round(assuredChecks / applicableChecks * 100) : 0,
      correlatedRisks: adaptive.issues.filter(issue => issue.id.startsWith("correlation:")).length,
      catalogChecks: catalogMatrix.checks.length,
      sentinelChecks: sourceSentinels.length + propertySentinels.length + syntheticSentinels.length + watchdogChecks.length,
      sourceSentinels: sourceSentinels.length,
      propertySentinels: propertySentinels.length,
      syntheticSentinels: syntheticSentinels.length,
      historicalChecks: historicalChecks.length,
      watchdogChecks: watchdogChecks.length,
      monitoredProperties: telemetry.properties.length,
      syntheticProperties: telemetry.properties.filter(property => property.expectedLive).length,
      failedSyntheticProbes: telemetry.properties.filter(property => property.expectedLive && !property.syntheticProbe?.ok).length,
      evidenceSeries: evidenceLayer.digest.measurableSeries,
      baselineReadySeries: evidenceLayer.digest.baselineReadySeries,
      baselineCoveragePercent: evidenceLayer.digest.baselineCoveragePercent,
      evidenceSamples: evidenceLayer.digest.totalSamples,
      historicalAnomalies: evidenceLayer.digest.anomalousSeries,
    },
    speedToLead,
    issues: adaptive.issues,
    incidents: adaptive.incidents,
    signals,
    coverage,
    checks,
    domains: adaptive.domains,
    evidence: evidenceLayer.digest,
    adaptive: adaptive.adaptive,
  } satisfies Omit<BusinessIssueRadar, "memory">;
  const memory = buildRadarMemoryDigest(agencyId, radar, now);
  const withMemory = applyAdaptiveRadarPolicy({
    checks: rawChecks,
    issues: dedupeIssues([...dedupedIssues, ...buildRadarMemoryIssues(memory, now)]).sort(issueSort).slice(0, 320),
    signals,
    coverage,
    policy: settings.advisor.radarPolicy,
    business: businessContext,
    enquiryCount: recentEnquiries.length,
    now,
  });
  return {
    ...radar,
    summary: {
      ...radar.summary,
      critical: withMemory.incidents.filter(issue => issue.severity === "critical").length,
      warning: withMemory.incidents.filter(issue => issue.severity === "warning").length,
      watch: withMemory.incidents.filter(issue => issue.severity === "watch").length,
    },
    issues: withMemory.issues,
    incidents: withMemory.incidents,
    checks: withMemory.checks,
    domains: withMemory.domains,
    adaptive: withMemory.adaptive,
    memory,
  };
}

function buildSpeedToLeadRadar(
  enquiries: WebsiteEnquiry[],
  guardrails: ReturnType<typeof getAgencyWorkspaceSettings>["advisor"],
  now: number,
): SpeedToLeadRadar {
  const targetMs = guardrails.speedToLeadTargetMinutes * 60_000;
  const warningMs = guardrails.speedToLeadWarningMinutes * 60_000;
  const criticalMs = guardrails.speedToLeadCriticalMinutes * 60_000;
  const responseTimes = enquiries.flatMap(enquiry => enquiry.firstRespondedAt && enquiry.firstRespondedAt >= enquiry.submittedAt
    ? [enquiry.firstRespondedAt - enquiry.submittedAt]
    : []);
  const waiting = enquiries.filter(enquiry => !enquiry.firstRespondedAt && enquiry.status !== "resolved");
  const waitingTimes = waiting.map(enquiry => Math.max(0, now - enquiry.submittedAt));
  const breachedCount = responseTimes.filter(value => value > targetMs).length + waitingTimes.filter(value => value > targetMs).length;
  const p90ResponseMs = percentile(responseTimes, 0.9);
  const oldestWaitingMs = waitingTimes.length ? Math.max(...waitingTimes) : null;
  const worstMs = Math.max(p90ResponseMs ?? 0, oldestWaitingMs ?? 0);
  const status: BusinessSignalStatus = enquiries.length === 0
    ? "unknown"
    : worstMs >= criticalMs
      ? "critical"
      : worstMs >= warningMs
        ? "warning"
        : worstMs > targetMs
          ? "watch"
          : "healthy";
  return {
    status,
    targetMinutes: guardrails.speedToLeadTargetMinutes,
    warningMinutes: guardrails.speedToLeadWarningMinutes,
    criticalMinutes: guardrails.speedToLeadCriticalMinutes,
    enquiryCount: enquiries.length,
    measuredResponseCount: responseTimes.length,
    awaitingResponseCount: waiting.length,
    breachedCount,
    withinTargetPercent: responseTimes.length ? Math.round(responseTimes.filter(value => value <= targetMs).length / responseTimes.length * 100) : null,
    medianResponseMs: percentile(responseTimes, 0.5),
    p90ResponseMs,
    oldestWaitingMs,
  };
}

function speedToLeadSignal(metric: SpeedToLeadRadar, now: number): BusinessMetricSignal {
  return {
    id: "metric:speed-to-lead",
    domain: "sales",
    label: "Speed to lead",
    value: metric.medianResponseMs,
    display: metric.medianResponseMs !== null ? formatElapsed(metric.medianResponseMs) : metric.oldestWaitingMs !== null ? `${formatElapsed(metric.oldestWaitingMs)} waiting` : "No enquiry data",
    target: `${metric.targetMinutes} min`,
    status: metric.status,
    detail: `${metric.awaitingResponseCount} awaiting response · ${metric.breachedCount} outside target · ${metric.withinTargetPercent ?? "—"}% of measured replies within target.`,
    href: "/portal/agency/inbox?view=forms",
    measuredAt: now,
    sampleSize: metric.enquiryCount,
  };
}

function speedToLeadIssue(metric: SpeedToLeadRadar, enquiries: WebsiteEnquiry[], now: number): BusinessRadarIssue | null {
  if (metric.status === "healthy" || metric.status === "unknown") return null;
  const targetMs = metric.targetMinutes * 60_000;
  const breached = enquiries
    .filter(enquiry => enquiry.firstRespondedAt
      ? enquiry.firstRespondedAt - enquiry.submittedAt > targetMs
      : enquiry.status !== "resolved" && now - enquiry.submittedAt > targetMs)
    .sort((left, right) => left.submittedAt - right.submittedAt);
  const oldest = breached[0];
  return {
    id: "metric:speed-to-lead-breach",
    severity: metric.status === "critical" ? "critical" : metric.status === "warning" ? "warning" : "watch",
    domain: "sales",
    title: `${metric.breachedCount} lead response${metric.breachedCount === 1 ? " is" : "s are"} outside the ${metric.targetMinutes}-minute target`,
    detail: oldest && !oldest.firstRespondedAt
      ? `${oldest.name}'s ${oldest.siteName} enquiry has waited ${formatElapsed(now - oldest.submittedAt)} without a recorded first response.`
      : `The measured response pattern is slower than the current lead-response guardrail.`,
    evidence: [
      `${metric.awaitingResponseCount} awaiting a response`,
      `${metric.withinTargetPercent ?? "No"}% of measured replies within target`,
      `P90 ${metric.p90ResponseMs === null ? "not measured" : formatElapsed(metric.p90ResponseMs)}`,
    ],
    href: oldest ? `/portal/agency/inbox?view=${oldest.channel === "form" ? "forms" : oldest.channel}&form=${encodeURIComponent(oldest.id)}` : "/portal/agency/inbox?view=forms",
    detectedAt: now,
    sourceIds: breached.map(enquiry => `website-enquiry:${enquiry.id}`).slice(0, 25),
  };
}

function issueFromOperationalAlert(alert: OperationalAlert): BusinessRadarIssue {
  return {
    id: `alert:${alert.id}`,
    severity: alert.severity === "notice" ? "watch" : alert.severity,
    domain: domainForAlert(alert.category),
    title: alert.title,
    detail: alert.detail,
    evidence: [alert.clientName, readable(alert.category), new Date(alert.occurredAt).toISOString()].filter(Boolean) as string[],
    href: alert.href,
    detectedAt: alert.occurredAt,
    sourceIds: [alert.id],
  };
}

function coverageSource(id: string, domain: AdvisorDomain, label: string, status: AdvisorCoverageSource["status"], recordCount: number, detail: string, lastActivityAt?: number): AdvisorCoverageSource {
  return { id, domain, label, status, recordCount, detail, lastActivityAt: lastActivityAt || undefined };
}

function scoreStatus(score: number): BusinessSignalStatus {
  return score < 40 ? "critical" : score < 70 ? "warning" : score < 80 ? "watch" : "healthy";
}

function domainForAlert(category: OperationalAlert["category"]): AdvisorDomain {
  if (category === "money") return "finance";
  if (category === "client") return "clients";
  if (category === "task" || category === "meeting") return "operations";
  if (category === "support") return "inbox";
  if (category === "contract" || category === "compliance") return "compliance";
  if (category === "development" || category === "outage") return "development";
  return "marketing";
}

function domainForPlugin(pluginId: string): AdvisorDomain {
  const value = pluginId.toLowerCase();
  if (/finance|invoice|expense|payment/.test(value)) return "finance";
  if (/lead|pipeline|sales/.test(value)) return "sales";
  if (/marketing|campaign|email|social/.test(value)) return "marketing";
  if (/fulfil|delivery|portal/.test(value)) return "delivery";
  if (/develop|website|performance/.test(value)) return "development";
  if (/inbox|message|support/.test(value)) return "inbox";
  return "systems";
}

function pluginRecordCount(state: ReturnType<typeof getState>, installId: string): number {
  return Object.keys(state.pluginData[installId] ?? {}).filter(key => !key.includes("/seq/") && !key.endsWith("/index")).length;
}

function latestTimestamp(values: unknown[]): number {
  return values.reduce<number>((latest, value) => Math.max(latest, timestampFrom(value)), 0);
}

function timestampFrom(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  for (const key of ["updatedAt", "submittedAt", "occurredAt", "createdAt", "ts"]) {
    const candidate = record[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }
  return 0;
}

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? null;
}

function dedupeIssues(issues: BusinessRadarIssue[]): BusinessRadarIssue[] {
  const seen = new Set<string>();
  return issues.filter(issue => {
    const key = `${issue.domain}:${issue.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function issueSort(left: BusinessRadarIssue, right: BusinessRadarIssue): number {
  const order: Record<BusinessIssueSeverity, number> = { critical: 0, warning: 1, watch: 2 };
  return order[left.severity] - order[right.severity] || right.detectedAt - left.detectedAt;
}

function readable(value: string): string {
  return value.replace(/^aqua-/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
