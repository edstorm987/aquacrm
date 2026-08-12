import "server-only";

import type {
  AdvisorDomain,
  RadarSourceDataIndex,
  RadarSourceDatasetInspection,
  RadarSourceDatasetSummary,
} from "@/lib/businessRadar";
import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { containerFor as leadsContainerFor } from "@aqua/plugin-leads-pipeline/server";
import { FOUNDER_AGENCY_SLUG } from "@/lib/server/founderSeed";
import { getState } from "@/server/storage";
import { listAgencyTasks } from "@/server/tasks";
import { listClients } from "@/server/tenants";
import { listUsersForAgency } from "@/server/users";
import { listLegalDocuments } from "@/server/legalDocuments";
import { listInboxSnapshot } from "./inboxStore";
import { makePluginStorage } from "./pluginStorage";
import { listWebsiteEnquiries } from "./websiteEnquiries";

interface RadarSourceDataset extends RadarSourceDatasetSummary {
  records: Array<Record<string, unknown>>;
}

interface DatasetInput {
  id: string;
  domain: AdvisorDomain;
  label: string;
  description: string;
  href: string;
  sourceIds: string[];
  records?: unknown[];
  unavailableReason?: string;
}

const SECRET_KEY = /^(?:password|passwordhash|secret|secrets|accessToken|refreshToken|apiKey|privateKey|tokenHash|encryptedSecret|encryptedSecrets|encryptedPassword|encryptedToken|signature|authorization|webhookVerifyToken|clientSecret|appSecret)$/i;
const MAX_INSPECTION_DEPTH = 8;
const MAX_STRING_LENGTH = 50_000;
const EXTERNAL_SOURCE_TIMEOUT_MS = 4_000;
const SOURCE_CACHE_TTL_MS = 15_000;

const sourceCache = new Map<string, { expiresAt: number; datasets?: RadarSourceDataset[]; pending?: Promise<RadarSourceDataset[]> }>();

export async function inspectRadarSourceData(agencyId: string): Promise<RadarSourceDataIndex> {
  const datasets = await getRadarSourceDatasets(agencyId);
  return sourceDataIndex(datasets);
}

export async function inspectRadarSourceDataset(
  agencyId: string,
  datasetId: string,
  offset = 0,
  limit = 100,
): Promise<RadarSourceDatasetInspection | null> {
  const datasets = await getRadarSourceDatasets(agencyId);
  const dataset = datasets.find(item => item.id === datasetId);
  if (!dataset) return null;
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.min(250, Math.max(1, Math.floor(limit)));
  return {
    ...summary(dataset),
    generatedAt: Date.now(),
    offset: safeOffset,
    limit: safeLimit,
    hasMore: safeOffset + safeLimit < dataset.records.length,
    records: dataset.records.slice(safeOffset, safeOffset + safeLimit),
  };
}

export async function exportRadarSourceData(agencyId: string, datasetId?: string): Promise<unknown> {
  const datasets = await getRadarSourceDatasets(agencyId);
  if (datasetId) {
    const dataset = datasets.find(item => item.id === datasetId);
    return dataset ? { ...summary(dataset), generatedAt: Date.now(), records: dataset.records } : null;
  }
  return {
    ...sourceDataIndex(datasets),
    datasets: datasets.map(dataset => ({ ...summary(dataset), records: dataset.records })),
  };
}

export function invalidateRadarSourceInspection(agencyId: string): void {
  sourceCache.delete(agencyId);
}

function getRadarSourceDatasets(agencyId: string): Promise<RadarSourceDataset[]> {
  const cached = sourceCache.get(agencyId);
  const now = Date.now();
  if (cached?.datasets && cached.expiresAt > now) return Promise.resolve(cached.datasets);
  if (cached?.pending) return cached.pending;
  const pending = buildRadarSourceDatasets(agencyId).then(datasets => {
    sourceCache.set(agencyId, { datasets, expiresAt: Date.now() + SOURCE_CACHE_TTL_MS });
    return datasets;
  }).catch(error => {
    sourceCache.delete(agencyId);
    throw error;
  });
  sourceCache.set(agencyId, { pending, expiresAt: now + SOURCE_CACHE_TTL_MS });
  return pending;
}

async function buildRadarSourceDatasets(agencyId: string): Promise<RadarSourceDataset[]> {
  const state = getState();
  const clients = listClients(agencyId, { includeArchived: true });
  const pipelines = Object.values(state.pipelines).filter(pipeline => pipeline.agencyId === agencyId);
  const pipelineIds = new Set(pipelines.map(pipeline => pipeline.id));
  const installs = Object.values(state.pluginInstalls).filter(install => install.agencyId === agencyId && install.enabled);
  const leadInstall = installs.find(install => install.pluginId === "leads-pipeline");
  const canInspectPublicEnquiries = state.agencies[agencyId]?.slug === FOUNDER_AGENCY_SLUG;
  const [enquiryResult, inboxResult, leadResult] = await Promise.allSettled([
    within(EXTERNAL_SOURCE_TIMEOUT_MS, "Website enquiries", canInspectPublicEnquiries ? listWebsiteEnquiries(500) : Promise.resolve([])),
    within(EXTERNAL_SOURCE_TIMEOUT_MS, "Social inbox", listInboxSnapshot(agencyId)),
    within(EXTERNAL_SOURCE_TIMEOUT_MS, "Lead pipeline", leadInstall ? listRadarLeads(agencyId, leadInstall.id) : Promise.resolve([])),
  ]);
  const website = state.agencyWebsites[agencyId];
  const inbox = inboxResult.status === "fulfilled" ? inboxResult.value : null;

  const datasets: RadarSourceDataset[] = [
    dataset({ id: "core:clients", domain: "clients", label: "Clients and contacts", description: "Client identity, lifecycle, ownership, brand and status records used by client health and commercial checks.", href: "/portal/clients", sourceIds: ["core:clients", "clients", "client-health", "clients:active"], records: clients }),
    dataset({ id: "core:tasks", domain: "operations", label: "Tasks and actions", description: "Open, overdue, assigned and completed work used by operational load and ownership checks.", href: "/portal/agency/actions", sourceIds: ["core:operations", "tasks", "operations:tasks"], records: listAgencyTasks(agencyId) }),
    dataset({ id: "core:activity", domain: "systems", label: "Workspace activity", description: "Tenant activity events used to assess freshness, continuity and operational change.", href: "/portal/agency/settings#logs", sourceIds: ["activity-log", "systems:activity", "core:operations"], records: state.activity.filter(entry => entry.agencyId === agencyId) }),
    dataset({ id: "core:team", domain: "team", label: "Team and access", description: "Safe user identity, role and ownership fields. Authentication material is never exposed.", href: "/portal/account/permissions", sourceIds: ["core:team", "team", "team:users"], records: listUsersForAgency(agencyId).map(user => ({ id: user.id, email: user.email, username: user.username, name: user.name, role: user.role, agencyIds: user.agencyIds, companyIds: user.companyIds, clientId: user.clientId, mustChangePassword: user.mustChangePassword, emailVerifiedAt: user.emailVerifiedAt, createdAt: user.createdAt, updatedAt: user.updatedAt })) }),
    dataset({ id: "core:company", domain: "company", label: "Company plans and targets", description: "Business plan, objectives, targets, capacity assumptions and reviews behind company health.", href: "/portal/agency/company", sourceIds: ["core:company", "company-health", "company:planning"], records: Object.values(state.companyProfiles).filter(profile => profile.agencyId === agencyId) }),
    dataset({ id: "core:legal", domain: "compliance", label: "Legal and compliance", description: "Contracts, insurance, filing reminders and expiry records used by compliance checks.", href: "/portal/agency/company?view=legal", sourceIds: ["core:compliance", "legal", "compliance:legal"], records: listLegalDocuments(agencyId) }),
    dataset({ id: "core:pipelines", domain: "sales", label: "Journey pipelines", description: "Configured lead, sales, fulfilment and custom pipeline definitions.", href: "/portal/clients?view=journey", sourceIds: ["pipelines", "sales:pipelines", "delivery:pipelines"], records: pipelines }),
    dataset({ id: "core:pipeline-cards", domain: "sales", label: "Pipeline cards", description: "Tenant cards and their current columns, including lead, client, deal and custom cards.", href: "/portal/clients?view=journey", sourceIds: ["pipeline-cards", "sales:pipeline-cards"], records: Object.values(state.pipelineCards).filter(card => pipelineIds.has(card.pipelineId)) }),
    dataset({ id: "core:products", domain: "delivery", label: "Products and packages", description: "Offer, pricing, fulfilment, portal and product configuration used by client and delivery checks.", href: "/portal/agency/products", sourceIds: ["products", "delivery:products"], records: Object.values(state.agencyProducts).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:milestones", domain: "delivery", label: "Client milestones", description: "Delivery progress, blockers, targets and tracked client outcomes.", href: "/portal/agency/fulfilment", sourceIds: ["milestones", "delivery:milestones"], records: Object.values(state.clientMilestones).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:experiments", domain: "marketing", label: "Performance experiments", description: "Active and completed experiments, variants, traffic and conversion evidence.", href: "/portal/agency/performance", sourceIds: ["performance-experiments", "marketing:experiments"], records: Object.values(state.performanceExperiments).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:experience-packages", domain: "clients", label: "Experience packages", description: "Curated client and staff experience packages, costs and fulfilment steps.", href: "/portal/agency/you-deserve-it", sourceIds: ["experience-packages", "clients:experience"], records: Object.values(state.experiencePackages).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:client-delight", domain: "clients", label: "Client experience records", description: "Planned and delivered care, rewards, events, trips and client experience outcomes.", href: "/portal/agency/you-deserve-it", sourceIds: ["client-delight", "clients:delight"], records: Object.values(state.clientDelight).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:automations", domain: "operations", label: "Automation workflows", description: "Workflow configuration, state, ownership and aggregate run outcomes.", href: "/portal/agency/marketing?view=automations", sourceIds: ["automations", "operations:automations"], records: Object.values(state.automationWorkflows).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:automation-runs", domain: "operations", label: "Automation runs", description: "Run status, trigger evidence, node logs, waits and failures.", href: "/portal/agency/marketing?view=automations", sourceIds: ["automation-runs", "operations:automation-runs"], records: Object.values(state.automationRuns).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:sops", domain: "operations", label: "SOP library", description: "Procedure metadata, categories, tags and content references used by operational readiness checks.", href: "/portal/agency/sop-library", sourceIds: ["sops", "operations:sops"], records: Object.values(state.sops).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:development-resources", domain: "development", label: "Development resources", description: "Tools, components, resources and saved references. Credential secrets are redacted.", href: "/portal/agency/development", sourceIds: ["development-resources", "development:resources"], records: Object.values(state.developmentResources).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:development-workflows", domain: "development", label: "Development workflows", description: "Configured delivery workflows and stages for technical work.", href: "/portal/agency/development/workflow", sourceIds: ["development-workflows", "development:workflow"], records: Object.values(state.developmentWorkflows).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:website-pages", domain: "development", label: "Website project and pages", description: "First-party release state, routes and page update evidence.", href: "/portal/agency/development/website", sourceIds: ["agency-website", "development:websites"], records: website ? [{ ...website, telemetryEvents: undefined }] : [] }),
    dataset({ id: "core:website-telemetry", domain: "development", label: "Website telemetry events", description: "Pageviews, forms, conversions, errors, performance, search and heartbeat events received by Aqua Tag.", href: "/portal/agency/performance", sourceIds: ["website-telemetry", "development:telemetry", "marketing:telemetry"], records: website?.telemetryEvents ?? [] }),
    dataset({ id: "core:synthetic-probes", domain: "systems", label: "Synthetic probe results", description: "Active property probes, response status and failure evidence used by uptime sentinels.", href: "/portal/agency/development", sourceIds: ["synthetic-probes", "systems:synthetic"], records: Object.values(state.radarSyntheticProbes[agencyId] ?? {}) }),
    dataset({ id: "core:dashboard-sessions", domain: "operations", label: "Work sessions", description: "Clocked work sessions, focus and completion notes used by capacity and execution checks.", href: "/portal/agency", sourceIds: ["dashboard-work-sessions", "operations:capacity"], records: Object.values(state.dashboardWorkSessions).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "external:website-enquiries", domain: "inbox", label: "Website enquiries", description: "Form, chatbot and support submissions with source, campaign, response and lifecycle timestamps.", href: "/portal/agency/inbox?view=forms", sourceIds: ["core:inbox", "website-enquiries", "inbox:enquiries", "sales:enquiries"], records: enquiryResult.status === "fulfilled" ? enquiryResult.value : undefined, unavailableReason: !canInspectPublicEnquiries ? "Public enquiry rows belong to the canonical AquaOasis owner workspace." : enquiryResult.status === "rejected" ? safeError(enquiryResult.reason) : undefined }),
    dataset({ id: "external:social-connections", domain: "inbox", label: "Social inbox connections", description: "Connected Meta channel status, scopes, webhooks and sync health. Access credentials are never exposed.", href: "/portal/agency/inbox?view=social", sourceIds: ["social-inbox", "inbox:connections"], records: inbox?.connections, unavailableReason: inboxResult.status === "rejected" ? safeError(inboxResult.reason) : undefined }),
    dataset({ id: "external:social-conversations", domain: "inbox", label: "Social conversations", description: "Conversation state, identity, attribution, timing and response evidence.", href: "/portal/agency/inbox?view=social", sourceIds: ["social-conversations", "inbox:conversations"], records: inbox?.conversations.map(({ messages: _messages, ...conversation }) => conversation), unavailableReason: inboxResult.status === "rejected" ? safeError(inboxResult.reason) : undefined }),
    dataset({ id: "external:social-messages", domain: "inbox", label: "Social messages", description: "Inbound, outbound and internal message records used by response and continuity checks.", href: "/portal/agency/inbox?view=social", sourceIds: ["social-messages", "inbox:messages"], records: inbox?.conversations.flatMap(conversation => conversation.messages), unavailableReason: inboxResult.status === "rejected" ? safeError(inboxResult.reason) : undefined }),
    dataset({ id: "module:lead-records", domain: "sales", label: "Lead records", description: "Lead source, status, timestamps, linkage and commercial lifecycle evidence.", href: "/portal/clients?view=journey", sourceIds: ["core:sales", "leads", "sales:leads"], records: leadResult.status === "fulfilled" ? leadResult.value : undefined, unavailableReason: leadResult.status === "rejected" ? safeError(leadResult.reason) : leadInstall ? undefined : "The lead pipeline is not enabled." }),
  ];

  for (const install of installs) {
    const records = Object.entries(state.pluginData[install.id] ?? {})
      .filter(([key]) => !key.includes("/seq/") && !key.endsWith("/index"))
      .map(([storageKey, value]) => ({ storageKey, value }));
    datasets.push(dataset({
      id: `plugin:${install.id}`,
      domain: domainForPlugin(install.pluginId),
      label: `${readable(install.pluginId)} storage`,
      description: `Raw tenant records retained by the ${readable(install.pluginId)} module. Internal sequence and index keys are omitted.`,
      href: hrefForDomain(domainForPlugin(install.pluginId)),
      sourceIds: [`module:${install.pluginId}:${install.id}`, install.id, install.pluginId],
      records,
    }));
  }

  return datasets.sort((left, right) => left.domain.localeCompare(right.domain) || left.label.localeCompare(right.label));
}

function dataset(input: DatasetInput): RadarSourceDataset {
  const records = (input.records ?? []).map((record, index) => normalizeRecord(record, index));
  const sorted = records.sort((left, right) => timestampFrom(right) - timestampFrom(left));
  return {
    id: input.id,
    domain: input.domain,
    label: input.label,
    description: input.description,
    status: input.unavailableReason ? "unavailable" : sorted.length ? "available" : "empty",
    recordCount: sorted.length,
    lastUpdatedAt: newest(sorted.map(timestampFrom)),
    href: input.href,
    sourceIds: input.sourceIds,
    fields: collectFields(sorted),
    unavailableReason: input.unavailableReason,
    records: sorted,
  };
}

function sourceDataIndex(datasets: RadarSourceDataset[]): RadarSourceDataIndex {
  return {
    generatedAt: Date.now(),
    totalDatasets: datasets.length,
    availableDatasets: datasets.filter(dataset => dataset.status !== "unavailable").length,
    unavailableDatasets: datasets.filter(dataset => dataset.status === "unavailable").length,
    totalRecords: datasets.reduce((total, dataset) => total + dataset.recordCount, 0),
    datasets: datasets.map(summary),
  };
}

function summary(dataset: RadarSourceDataset): RadarSourceDatasetSummary {
  const { records: _records, ...value } = dataset;
  return value;
}

function normalizeRecord(value: unknown, index: number): Record<string, unknown> {
  const sanitized = sanitize(value, 0);
  if (sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)) return sanitized as Record<string, unknown>;
  return { row: index + 1, value: sanitized };
}

function sanitize(value: unknown, depth: number): unknown {
  if (depth > MAX_INSPECTION_DEPTH) return "[nested data omitted]";
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (/^data:[^;]+;base64,/i.test(value)) return "[embedded binary data omitted]";
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}\n[truncated for inspection]` : value;
  }
  if (Array.isArray(value)) return value.map(item => sanitize(item, depth + 1));
  if (!value || typeof value !== "object") return String(value ?? "");
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    if (SECRET_KEY.test(key.replace(/[^a-z0-9]/gi, ""))) return [[key, "[redacted]"]];
    return [[key, sanitize(item, depth + 1)]];
  }));
}

function collectFields(records: Array<Record<string, unknown>>): string[] {
  const fields = new Set<string>();
  for (const record of records.slice(0, 250)) {
    for (const key of Object.keys(record)) fields.add(key);
  }
  return [...fields].sort().slice(0, 80);
}

function timestampFrom(record: Record<string, unknown>): number {
  for (const key of ["updatedAt", "submittedAt", "occurredAt", "receivedAt", "sentAt", "createdAt", "ts", "finishedAt", "lastMessageAt"]) {
    const candidate = record[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string") {
      const stamp = Date.parse(candidate);
      if (Number.isFinite(stamp)) return stamp;
    }
  }
  return 0;
}

function newest(values: number[]): number | undefined {
  const valid = values.filter(value => Number.isFinite(value) && value > 0);
  return valid.length ? Math.max(...valid) : undefined;
}

function safeError(error: unknown): string {
  if (!(error instanceof Error)) return "This source could not be loaded.";
  return error.message.replace(/(password|secret|token|key)=[^\s&]+/gi, "$1=[redacted]").slice(0, 500);
}

function within<T>(milliseconds: number, label: string, promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} did not respond within ${milliseconds / 1_000} seconds.`)), milliseconds);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

async function listRadarLeads(agencyId: string, installId: string) {
  ensureLeadsPipelineFoundationRegistered();
  return leadsContainerFor({ agencyId, storage: makePluginStorage(installId) as never }).leads.list();
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

function hrefForDomain(domain: AdvisorDomain): string {
  if (domain === "finance") return "/portal/agency/agency-finance";
  if (domain === "sales" || domain === "clients") return "/portal/clients?view=journey";
  if (domain === "marketing") return "/portal/agency/marketing";
  if (domain === "delivery") return "/portal/agency/fulfilment";
  if (domain === "development") return "/portal/agency/development";
  if (domain === "inbox") return "/portal/agency/inbox";
  return "/portal/agency";
}

function readable(value: string): string {
  return value.replace(/^aqua-/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
