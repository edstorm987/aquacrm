import "server-only";

import type { AdvisorActionCategory } from "@/lib/advisor/advisorActions";
import type { AdvisorDomain, BusinessIssueRadar } from "@/lib/radar/businessRadar";
import type { OperationalAlertCategory } from "@/lib/intelligence/operationalAttention";
import { buildAdvisorContext } from "@/lib/server/assistants/advisorContext";
import {
  sanitizeExternalData,
  type ExternalAssistantAuth,
  type ExternalAssistantModule,
} from "@/lib/server/assistants/externalAssistantApi";

const MODULE_DOMAINS: Record<ExternalAssistantModule, AdvisorDomain[]> = {
  clients: ["clients"],
  contacts: ["clients", "inbox"],
  staff: ["team"],
  leads: ["sales"],
  pipelines: ["sales", "delivery"],
  tasks: ["operations"],
  sops: ["operations"],
  products: ["delivery"],
  milestones: ["delivery"],
  "client-care": ["clients"],
  company: ["company"],
  legal: ["compliance"],
  finance: ["finance"],
  activity: ["systems"],
  "business-modules": ["marketing", "development", "systems"],
};

const ACTION_MODULES: Record<AdvisorActionCategory, ExternalAssistantModule[]> = {
  company: ["company"],
  client: ["clients", "contacts", "client-care"],
  sales: ["leads", "pipelines"],
  finance: ["finance"],
  delivery: ["pipelines", "products", "milestones"],
  support: ["clients", "contacts"],
  development: ["business-modules"],
  marketing: ["business-modules"],
  operations: ["tasks", "sops"],
};

const ALERT_MODULES: Record<OperationalAlertCategory, ExternalAssistantModule[]> = {
  outage: ["business-modules"],
  support: ["clients", "contacts"],
  money: ["finance"],
  meeting: ["leads", "pipelines"],
  client: ["clients", "contacts"],
  marketing: ["business-modules"],
  task: ["tasks"],
  compliance: ["legal"],
  contract: ["legal", "clients"],
  development: ["business-modules"],
};

export async function buildExternalAdvisorContext(auth: ExternalAssistantAuth, now = Date.now()) {
  const source = await buildAdvisorContext(auth.agencyId, now);
  const allowedModules = new Set(auth.modules);
  const allowedDomains = externalAssistantDomains(auth.modules);
  const allowedDomainSet = new Set(allowedDomains);
  const radar = scopeRadar(source.businessRadar, allowedDomainSet);
  const recommendations = source.recommendedActions
    .filter(item => ACTION_MODULES[item.category].some(module => allowedModules.has(module)));
  const operationalAlerts = source.operationalAlerts
    .filter(item => ALERT_MODULES[item.category].some(module => allowedModules.has(module)))
    .slice(0, 80);

  const company = allowedModules.has("company") ? {
    health: source.company.health,
    targets: source.company.targets,
    objectives: source.company.objectives,
    activePlans: source.company.activePlans,
    capital: {
      currency: source.company.capital.currency,
      shareClasses: source.company.capital.shareClasses,
      shareholders: source.company.capital.shareholders,
      decisions: source.company.capital.decisions,
      ...(allowedModules.has("finance") ? {
        transactions: source.company.capital.transactions,
        investments: source.company.capital.investments,
        dividends: source.company.capital.dividends,
      } : {}),
    },
    ...(allowedModules.has("finance") ? {
      actuals: source.company.actuals,
      revenueGapCents: source.company.revenueGapCents,
    } : {}),
    ...(allowedModules.has("leads") || allowedModules.has("pipelines") ? {
      dealsNeeded: source.company.dealsNeeded,
      estimatedCallsNeeded: source.company.estimatedCallsNeeded,
    } : {}),
  } : undefined;

  return sanitizeExternalData({
    generatedAt: source.generatedAt,
    role: "advisor-peer",
    readOnly: true,
    humanApprovalRequired: true,
    assistant: {
      name: auth.keyName,
      managed: auth.managed,
    },
    scope: {
      modules: auth.modules,
      domains: allowedDomains,
      permissions: auth.permissions,
    },
    company,
    radar,
    operationalAlerts,
    recommendedActions: recommendations,
    openTasks: allowedModules.has("tasks") ? source.openTasks : [],
    workAccountability: allowedModules.has("activity") ? source.workAccountability : undefined,
    operatingRules: [
      "Treat missing or stale evidence as uncertainty, never as proof of health.",
      "Recommendations are proposals only; a person must accept work inside AquaCRM.",
      "Never claim that this read-only connection changed, approved, sent, deleted, or paid anything.",
      "Stay within the modules and permissions granted to this assistant key.",
      "Never label unconfirmed work time as procrastination. Ask for confirmation and preserve uncertainty.",
    ],
  });
}

export function externalAssistantDomains(modules: ExternalAssistantModule[]): AdvisorDomain[] {
  return [...new Set(modules.flatMap(module => MODULE_DOMAINS[module]))];
}

function scopeRadar(radar: BusinessIssueRadar, allowedDomains: Set<AdvisorDomain>) {
  const domains = radar.domains.filter(item => allowedDomains.has(item.domain));
  const issues = radar.issues.filter(item => allowedDomains.has(item.domain));
  const incidents = radar.incidents.filter(item => allowedDomains.has(item.domain));
  const signals = radar.signals.filter(item => allowedDomains.has(item.domain));
  const coverage = radar.coverage.filter(item => allowedDomains.has(item.domain));
  const checks = radar.checks.filter(item => allowedDomains.has(item.domain));
  const conclusions = radar.adaptive.conclusions.filter(item => allowedDomains.has(item.domain));
  const readinessPercent = average(domains.map(item => item.readinessPercent));
  const confidencePercent = average(domains.map(item => item.confidencePercent));

  return {
    generatedAt: radar.generatedAt,
    summary: {
      critical: incidents.filter(item => item.severity === "critical").length,
      warning: incidents.filter(item => item.severity === "warning").length,
      watch: incidents.filter(item => item.severity === "watch").length,
      totalChecks: checks.length,
      passedChecks: checks.filter(item => item.status === "pass").length,
      firingChecks: checks.filter(item => ["critical", "warning"].includes(item.status)).length,
      watchChecks: checks.filter(item => item.status === "watch").length,
      blindChecks: checks.filter(item => item.status === "blind").length,
      learningChecks: checks.filter(item => item.status === "learning").length,
      inactiveChecks: checks.filter(item => item.status === "inactive").length,
      connectedSources: coverage.filter(item => item.status === "connected").length,
      totalSources: coverage.length,
      readinessPercent,
      confidencePercent,
    },
    domains,
    incidents: incidents.slice(0, 50),
    issues: issues.slice(0, 80),
    signals: signals.slice(0, 100),
    coverage,
    checks: checks.filter(item => item.status !== "pass").slice(0, 120),
    adaptive: {
      operatingStage: radar.adaptive.operatingStage,
      readinessPercent,
      confidencePercent,
      healthScore: allowedDomains.has("company") ? radar.adaptive.healthScore : null,
      calibratingDomains: radar.adaptive.calibratingDomains.filter(domain => allowedDomains.has(domain)),
      conclusions,
    },
    speedToLead: allowedDomains.has("sales") || allowedDomains.has("inbox") ? radar.speedToLead : undefined,
    commercial: allowedDomains.has("sales") || allowedDomains.has("clients") ? radar.commercial : undefined,
  };
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}
