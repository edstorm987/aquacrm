import "server-only";

import type {
  AdvisorDomain,
  RadarSourceDataIndex,
  RadarSourceDatasetInspection,
  RadarSourceDatasetSummary,
} from "@/engines/data/radar/businessRadar";
import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { containerFor as leadsContainerFor } from "@aqua/plugin-leads-pipeline/server";
import { canReadClientAssociation } from "@/lib/server/access/clientAssociationElement";
import {
  clientWorkspaceElementAtLeast,
  clientWorkspaceElementLevel,
  resolveActorClientWorkspaceElementAccess,
} from "@/lib/server/access/clientWorkspaceElementAccess";
import {
  resolveActorWorkspaceElementAccess,
  workspaceElementAtLeast,
  workspaceElementLevel,
  type WorkspaceElementAccess,
} from "@/lib/server/access/workspaceElementAccess";
import { agencyElementForModule } from "@/lib/server/portal/pluginClientElement";
import { FOUNDER_AGENCY_SLUG } from "@/lib/server/seeds/founderSeed";
import { resolveActorAccess, type CurrentAccessActor } from "@/server/accessControl";
import { getState } from "@/server/storage";
import { listAgencyTasks } from "@/server/tasks";
import { listAgencyCommandCalendarEntries } from "@/server/commandCalendar";
import { listClients } from "@/server/tenants";
import { listUsersForAgency } from "@/server/users";
import { listLegalDocuments } from "@/server/legalDocuments";
import { listInboxSnapshot } from "@/lib/server/inbox/inboxStore";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getRequestWebsiteEnquiries } from "@/lib/server/websiteEnquiries";
import { getActiveDataRealmId } from "@/server/dataRealm";
import type { AccessCapability, AccessElementKey } from "@/server/types";

interface RadarSourceDataset extends RadarSourceDatasetSummary {
  records: Array<Record<string, unknown>>;
}

export interface RadarSourceSearchDataset extends RadarSourceDatasetSummary {
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

interface RadarSourceCacheEntry {
  expiresAt: number;
  datasets?: RadarSourceDataset[];
  pending?: Promise<RadarSourceDataset[]>;
}

const SECRET_KEY = /^(?:password|passwordhash|secret|secrets|accessToken|refreshToken|apiKey|privateKey|tokenHash|encryptedSecret|encryptedSecrets|encryptedPassword|encryptedToken|signature|authorization|webhookVerifyToken|clientSecret|appSecret)$/i;
const MAX_INSPECTION_DEPTH = 8;
const MAX_STRING_LENGTH = 50_000;
const EXTERNAL_SOURCE_TIMEOUT_MS = 4_000;
const SOURCE_CACHE_TTL_MS = 15_000;

const sourceCache = new Map<string, RadarSourceCacheEntry>();

/**
 * The raw source room is more privileged than the Radar summary that links to
 * it. Passing an agency id alone used to turn the outer
 * `workspace.overview.view` check into authority for every underlying source:
 * pay/team rows, Inbox messages, delivery records and client data were all
 * serialised together. The three public inspection functions therefore take
 * the resolved actor, not a caller-supplied tenant id, and apply this projection
 * after the tenant/realm cache but before summaries, pages or archives exist.
 */
export async function inspectRadarSourceData(actor: CurrentAccessActor): Promise<RadarSourceDataIndex> {
  const datasets = await getActorRadarSourceDatasets(actor);
  return sourceDataIndex(datasets);
}

export async function listRadarSourceSearchDatasets(agencyId: string): Promise<RadarSourceSearchDataset[]> {
  const datasets = await getRadarSourceDatasets(agencyId);
  return datasets.map(dataset => ({
    ...summary(dataset),
    records: dataset.records.map(record => ({ ...record })),
  }));
}

/** Actor-bound variant for shared Search; raw search indexing must not bypass the source room projection. */
export async function listRadarSourceSearchDatasetsForActor(actor: CurrentAccessActor): Promise<RadarSourceSearchDataset[]> {
  const datasets = await getActorRadarSourceDatasets(actor);
  return datasets.map(dataset => ({
    ...summary(dataset),
    records: dataset.records.map(record => ({ ...record })),
  }));
}

export async function inspectRadarSourceDataset(
  actor: CurrentAccessActor,
  datasetId: string,
  offset = 0,
  limit = 100,
): Promise<RadarSourceDatasetInspection | null> {
  const datasets = await getActorRadarSourceDatasets(actor);
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

export async function exportRadarSourceData(actor: CurrentAccessActor, datasetId?: string): Promise<unknown> {
  const datasets = await getActorRadarSourceDatasets(actor);
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
  const agencySuffix = `:${agencyId}`;
  for (const key of sourceCache.keys()) {
    if (key.endsWith(agencySuffix)) sourceCache.delete(key);
  }
}

const RADAR_SOURCE_DATASET_IDS = [
  "core:clients",
  "core:tasks",
  "core:activity",
  "core:team",
  "core:company",
  "core:legal",
  "core:pipelines",
  "core:pipeline-cards",
  "core:products",
  "core:milestones",
  "core:experiments",
  "core:experience-packages",
  "core:client-delight",
  "core:automations",
  "core:automation-runs",
  "core:sops",
  "core:development-resources",
  "core:development-workflows",
  "core:website-pages",
  "core:website-telemetry",
  "core:synthetic-probes",
  "core:dashboard-sessions",
  "core:calendar-commitments",
  "external:website-enquiries",
  "external:response-time-clocks",
  "external:social-connections",
  "external:social-conversations",
  "external:social-messages",
  "module:lead-records",
] as const;

type RadarSourceDatasetId = typeof RADAR_SOURCE_DATASET_IDS[number];

interface RadarSourceDatasetRule {
  /** Every element is required unless `anyElement` is explicitly set. */
  elements: readonly AccessElementKey[];
  anyElement?: boolean;
  /** Raw mixed-domain rows have no safe delegated projection yet. */
  ownerOnly?: boolean;
  /** Element that owns a row carrying a client id. */
  clientElement?: AccessElementKey;
  /** Agency-wide client capability may expose rows without a client id. */
  agencyClientElement?: AccessElementKey;
}

/**
 * Total classification for every first-party source. Unknown ids have no rule
 * and are withheld. Dynamic plugin storage is classified separately through
 * the existing module-to-element registry; an unmapped plugin is also withheld.
 */
const RADAR_SOURCE_DATASET_RULES = {
  "core:clients": { elements: [], clientElement: "client.overview" },
  "core:tasks": { elements: ["workspace.actions"], clientElement: "client.overview" },
  "core:activity": { elements: ["workspace.overview"], ownerOnly: true, clientElement: "client.record" },
  "core:team": { elements: ["staff.people"] },
  "core:company": { elements: ["workspace.overview"] },
  "core:legal": { elements: ["workspace.settings"] },
  "core:pipelines": { elements: ["growth.leads", "fulfilment.projects"], anyElement: true },
  "core:pipeline-cards": { elements: ["growth.leads", "fulfilment.projects"], anyElement: true, clientElement: "client.overview" },
  "core:products": { elements: ["fulfilment.services"] },
  "core:milestones": { elements: ["fulfilment.projects"], clientElement: "client.fulfilment" },
  "core:experiments": { elements: ["fulfilment.projects"], clientElement: "client.systems" },
  "core:experience-packages": { elements: ["client.communications"], agencyClientElement: "client.communications" },
  "core:client-delight": { elements: ["client.communications"], clientElement: "client.communications", agencyClientElement: "client.communications" },
  "core:automations": { elements: ["growth.campaigns"] },
  "core:automation-runs": { elements: ["growth.campaigns"] },
  "core:sops": { elements: ["fulfilment.services"] },
  "core:development-resources": { elements: ["fulfilment.projects"] },
  "core:development-workflows": { elements: ["fulfilment.projects"] },
  "core:website-pages": { elements: ["fulfilment.projects"] },
  "core:website-telemetry": { elements: ["fulfilment.projects"] },
  "core:synthetic-probes": { elements: ["fulfilment.projects"] },
  "core:dashboard-sessions": { elements: ["staff.people"] },
  "core:calendar-commitments": { elements: ["workspace.calendar"] },
  "external:website-enquiries": { elements: ["workspace.inbox", "growth.leads"] },
  "external:response-time-clocks": { elements: ["workspace.inbox", "growth.leads"], clientElement: "client.communications" },
  "external:social-connections": { elements: ["workspace.inbox"] },
  "external:social-conversations": { elements: ["workspace.inbox"], clientElement: "client.communications" },
  "external:social-messages": { elements: ["workspace.inbox"], clientElement: "client.communications" },
  "module:lead-records": { elements: ["growth.leads"], clientElement: "client.relationship" },
} as const satisfies Readonly<Record<RadarSourceDatasetId, RadarSourceDatasetRule>>;

interface RadarSourceActorScope {
  actor: CurrentAccessActor;
  /** Only the owner baseline receives byte-for-byte raw records. */
  full: boolean;
  /** Legacy managers retain every classified source, but still receive privacy-safe rows. */
  legacyManager: boolean;
  agencyCapabilities: ReadonlySet<AccessCapability>;
  staff: WorkspaceElementAccess;
  growth: WorkspaceElementAccess;
  fulfilment: WorkspaceElementAccess;
  clientAccess: Map<string, ReturnType<typeof resolveActorClientWorkspaceElementAccess>>;
}

function hasCapability(capabilities: ReadonlySet<AccessCapability>, element: AccessElementKey): boolean {
  return capabilities.has(`element.${element}.view` as AccessCapability)
    || capabilities.has(`element.${element}.use` as AccessCapability)
    || capabilities.has(`element.${element}.manage` as AccessCapability);
}

function workspaceHasElement(access: WorkspaceElementAccess, element: AccessElementKey): boolean {
  return workspaceElementAtLeast(workspaceElementLevel(access, element), "view")
    || access.capabilities.includes(`element.${element}.view` as AccessCapability)
    || access.capabilities.includes(`element.${element}.use` as AccessCapability)
    || access.capabilities.includes(`element.${element}.manage` as AccessCapability);
}

function actorHasElement(scope: RadarSourceActorScope, element: AccessElementKey): boolean {
  if (scope.full || scope.legacyManager || hasCapability(scope.agencyCapabilities, element)) return true;
  return workspaceHasElement(scope.staff, element)
    || workspaceHasElement(scope.growth, element)
    || workspaceHasElement(scope.fulfilment, element);
}

function actorHasClientElement(scope: RadarSourceActorScope, clientId: string, element: AccessElementKey): boolean {
  let access = scope.clientAccess.get(clientId);
  if (!access) {
    access = resolveActorClientWorkspaceElementAccess(scope.actor, clientId);
    scope.clientAccess.set(clientId, access);
  }
  return clientWorkspaceElementAtLeast(clientWorkspaceElementLevel(access, element), "view");
}

function sourceScopeForActor(actor: CurrentAccessActor): RadarSourceActorScope {
  const agency = resolveActorAccess(actor, { kind: "agency", id: actor.resourceAgencyId });
  const staff = resolveActorWorkspaceElementAccess(actor, "staff");
  const growth = resolveActorWorkspaceElementAccess(actor, "growth");
  const fulfilment = resolveActorWorkspaceElementAccess(actor, "fulfilment");
  // Preserve the documented manager migration fallback only when no governed
  // workspace has become authoritative. As soon as one is configured, each
  // dataset is decided by its element rather than by the manager role.
  const legacyManager = actor.session.role === "agency-manager"
    && agency.grantIds.length === 0
    && !staff.canonical
    && !growth.canonical
    && !fulfilment.canonical;
  return {
    actor,
    full: agency.ownerBaseline,
    legacyManager,
    agencyCapabilities: new Set(agency.capabilities),
    staff,
    growth,
    fulfilment,
    clientAccess: new Map(),
  };
}

function pluginRule(scope: RadarSourceActorScope, datasetId: string): RadarSourceDatasetRule | null {
  if (!datasetId.startsWith("plugin:")) return null;
  const installId = datasetId.slice("plugin:".length);
  const install = scope.actor.resourceState.pluginInstalls[installId];
  if (!install || install.agencyId !== scope.actor.resourceAgencyId || !install.enabled) return null;
  const element = agencyElementForModule(install.pluginId);
  // Owners and wholly un-migrated managers retain the catalogue they had
  // before per-element scoping. Everyone else gets no raw plugin data until
  // that module has an explicit semantic owner.
  return element ? { elements: [element] } : scope.full || scope.legacyManager ? { elements: [] } : null;
}

function datasetRule(scope: RadarSourceActorScope, datasetId: string): RadarSourceDatasetRule | null {
  return (RADAR_SOURCE_DATASET_RULES as Readonly<Record<string, RadarSourceDatasetRule>>)[datasetId]
    ?? pluginRule(scope, datasetId);
}

interface ClientIdField {
  present: boolean;
  clientId: string | null;
  malformed: boolean;
}

function clientIdField(record: Record<string, unknown>, key: string): ClientIdField {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return { present: false, clientId: null, malformed: false };
  }
  const value = record[key];
  if (value === null || value === undefined) {
    return { present: true, clientId: null, malformed: false };
  }
  if (typeof value !== "string") {
    return { present: true, clientId: null, malformed: true };
  }
  return { present: true, clientId: value.trim() || null, malformed: false };
}

/**
 * A string is a verified client association, null is explicitly unlinked and
 * undefined means the supplied provenance is malformed or contradictory.
 * Delegated reads fail closed on undefined; the owner baseline returns before
 * this classifier so recovery access to malformed source records is retained.
 */
function clientIdFromRecord(datasetId: string, record: Record<string, unknown>): string | null | undefined {
  if (datasetId === "core:clients") {
    const id = clientIdField(record, "id");
    return id.malformed || !id.clientId ? undefined : id.clientId;
  }

  const direct = clientIdField(record, "clientId");
  if (direct.malformed) return undefined;

  if (datasetId === "external:social-conversations") {
    if (!record.identity || typeof record.identity !== "object" || Array.isArray(record.identity)) return undefined;
    const nested = clientIdField(record.identity as Record<string, unknown>, "clientId");
    if (nested.malformed) return undefined;
    if (direct.clientId && nested.clientId && direct.clientId !== nested.clientId) return undefined;
    return direct.clientId ?? nested.clientId ?? null;
  }

  // These flattened/projection-only records must carry an explicit field from
  // their parent row. A missing field is indistinguishable from a projection
  // regression that discarded a hidden-client association, so fail closed.
  if ((datasetId === "external:social-messages" || datasetId === "external:response-time-clocks")
    && !direct.present) {
    return undefined;
  }
  return direct.clientId;
}

function pipelineRecordVisible(scope: RadarSourceActorScope, record: Record<string, unknown>): boolean {
  const kind = record.kind;
  if (kind === "fulfilment") return actorHasElement(scope, "fulfilment.projects");
  if (kind === "leads" || kind === "sales") return actorHasElement(scope, "growth.leads");
  // A custom pipeline has no semantic owner. Requiring both relevant elements
  // is the conservative answer; guessing one would make the classifier look
  // enforced while exposing records owned by the other workspace.
  return kind === "custom"
    && actorHasElement(scope, "growth.leads")
    && actorHasElement(scope, "fulfilment.projects");
}

function pipelineCardVisible(scope: RadarSourceActorScope, record: Record<string, unknown>): boolean {
  const pipelineId = typeof record.pipelineId === "string" ? record.pipelineId : "";
  const pipeline = scope.actor.resourceState.pipelines[pipelineId];
  if (!pipeline || pipeline.agencyId !== scope.actor.resourceAgencyId) return false;
  if (!pipelineRecordVisible(scope, pipeline as unknown as Record<string, unknown>)) return false;
  // Pipelines are polymorphic. The board's kind alone cannot authorise a lead
  // snapshot placed on a fulfilment board (or a client record placed on a
  // sales board), so the card's own semantic kind is an additional ceiling.
  if (record.kind === "lead" || record.kind === "deal") return actorHasElement(scope, "growth.leads");
  if (record.kind === "client") return actorHasElement(scope, "fulfilment.projects");
  return record.kind === "custom"
    && actorHasElement(scope, "growth.leads")
    && actorHasElement(scope, "fulfilment.projects");
}

function staffOwnsRecord(scope: RadarSourceActorScope, record: Record<string, unknown>): boolean {
  if (scope.actor.session.role !== "agency-staff") return true;
  return record.userId === scope.actor.user.id
    || record.ownerUserId === scope.actor.user.id
    || record.assigneeUserId === scope.actor.user.id
    || record.createdBy === scope.actor.user.id;
}

function actorOwnsRecord(scope: RadarSourceActorScope, record: Record<string, unknown>): boolean {
  return record.userId === scope.actor.user.id
    || record.ownerUserId === scope.actor.user.id
    || record.assigneeUserId === scope.actor.user.id
    || record.createdBy === scope.actor.user.id;
}

function calendarRecordVisible(scope: RadarSourceActorScope, record: Record<string, unknown>): boolean {
  // A delegated Business Radar never becomes a route into somebody else's
  // personal calendar. Owners retain organisation-wide operational records,
  // but personal goals/day plans remain in My Radar for owners too.
  if (!scope.full && !actorOwnsRecord(scope, record)) return false;
  if (record.recordType === "task") return actorHasElement(scope, "workspace.actions");
  if (record.recordType === "calendar-entry") {
    // Goals and hand-written notes belong to My Radar. Until calendar entries
    // carry an explicit personal/business classification, the Business source
    // room keeps only operational commitments and never another person's row.
    return actorHasElement(scope, "workspace.calendar")
      && (record.type === "event" || record.type === "work-block" || record.type === "reminder");
  }
  // Daily plans contain personal focus, reflection and revenue intentions.
  // Business Radar consumes their aggregate elsewhere; the raw plans stay out.
  if (record.recordType === "day-plan") return false;
  if (record.recordType === "lead-meeting") return actorHasElement(scope, "growth.leads");
  return false;
}

function recordVisible(
  scope: RadarSourceActorScope,
  dataset: RadarSourceDataset,
  rule: RadarSourceDatasetRule,
  record: Record<string, unknown>,
): boolean {
  if (dataset.id === "core:dashboard-sessions" && !scope.full && !actorOwnsRecord(scope, record)) {
    return false;
  }
  if (dataset.id === "core:calendar-commitments" && !calendarRecordVisible(scope, record)) return false;
  if (scope.full) return true;
  if (dataset.id === "core:tasks") {
    if (!staffOwnsRecord(scope, record)) return false;
  }
  if (dataset.id === "core:pipelines" && !pipelineRecordVisible(scope, record)) return false;
  if (dataset.id === "core:pipeline-cards" && !pipelineCardVisible(scope, record)) return false;

  const clientId = clientIdFromRecord(dataset.id, record);
  if (clientId === undefined) return false;
  if (!clientId) {
    return !rule.agencyClientElement || actorHasElement(scope, rule.agencyClientElement);
  }
  // Generic agency Actions use the shared association classifier. Other
  // durable client records use the element that owns that record family.
  if (dataset.id === "core:tasks"
    || (dataset.id === "core:calendar-commitments" && record.recordType === "task")) {
    return canReadClientAssociation(scope.actor, "agency-task", clientId);
  }
  return rule.clientElement
    ? actorHasClientElement(scope, clientId, rule.clientElement)
    : false;
}

function privacySafeRecord(
  scope: RadarSourceActorScope,
  dataset: RadarSourceDataset,
  record: Record<string, unknown>,
): Record<string, unknown> {
  if (dataset.id === "core:clients" && !scope.full) {
    // Client.metadata is deliberately schemaless and currently carries values
    // owned by Commercial, Communications, Files and Systems. Overview access
    // cannot safely export that monolith, so this source keeps only the typed
    // overview identity/lifecycle projection.
    return {
      id: record.id,
      agencyId: record.agencyId,
      relationshipId: record.relationshipId,
      companyId: record.companyId,
      workspaceLabel: record.workspaceLabel,
      name: record.name,
      slug: record.slug,
      brand: record.brand,
      stage: record.stage,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
  if (dataset.id === "core:dashboard-sessions") {
    const blocks = Array.isArray(record.activityBlocks)
      ? record.activityBlocks.flatMap(value => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return [];
          const block = value as Record<string, unknown>;
          return [{
            id: block.id,
            mode: block.mode,
            startedAt: block.startedAt,
            endedAt: block.endedAt,
            source: block.source,
            departmentId: block.departmentId,
          }];
        })
      : undefined;
    // Keep only business capacity evidence. Personal focus/notes, route history,
    // idle telemetry and clock-out wellbeing/review answers never cross into
    // the Business Radar source room for a delegated actor.
    return {
      id: record.id,
      agencyId: record.agencyId,
      userId: record.userId,
      date: record.date,
      departmentId: record.departmentId,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      aquaActiveMs: record.aquaActiveMs,
      externalWorkMs: record.externalWorkMs,
      breakMs: record.breakMs,
      activityBlocks: blocks,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
  if (dataset.id === "core:calendar-commitments" && record.recordType === "calendar-entry") {
    const { notes: _notes, ...safe } = record;
    return safe;
  }
  if (scope.full) return record;
  return record;
}

function datasetVisible(scope: RadarSourceActorScope, dataset: RadarSourceDataset, rule: RadarSourceDatasetRule): boolean {
  if (scope.full) return true;
  if (rule.ownerOnly) return false;
  if (dataset.id === "core:clients") {
    return dataset.records.some(record => {
      const clientId = clientIdFromRecord(dataset.id, record);
      return Boolean(clientId && actorHasClientElement(scope, clientId, "client.overview"));
    });
  }
  if (rule.elements.length === 0) return false;
  const matches = rule.elements.map(element => actorHasElement(scope, element));
  return rule.anyElement ? matches.some(Boolean) : matches.every(Boolean);
}

function scopedDataset(scope: RadarSourceActorScope, source: RadarSourceDataset): RadarSourceDataset | null {
  const rule = datasetRule(scope, source.id);
  if (!rule || !datasetVisible(scope, source, rule)) return null;
  const records = source.records
    .filter(record => recordVisible(scope, source, rule, record))
    .map(record => privacySafeRecord(scope, source, record));
  return {
    ...source,
    status: source.status === "unavailable" ? "unavailable" : records.length ? "available" : "empty",
    recordCount: records.length,
    lastUpdatedAt: newest(records.map(timestampFrom)),
    fields: collectFields(records),
    records,
  };
}

async function getActorRadarSourceDatasets(actor: CurrentAccessActor): Promise<RadarSourceDataset[]> {
  const sources = await getRadarSourceDatasets(actor.resourceAgencyId);
  const scope = sourceScopeForActor(actor);
  return sources.flatMap(source => {
    const visible = scopedDataset(scope, source);
    return visible ? [visible] : [];
  });
}

function getRadarSourceDatasets(agencyId: string): Promise<RadarSourceDataset[]> {
  const realmId = getActiveDataRealmId();
  const cacheKey = `${realmId}:${agencyId}`;
  const cached = sourceCache.get(cacheKey);
  const now = Date.now();
  if (cached?.datasets && cached.expiresAt > now) return Promise.resolve(cached.datasets);
  if (cached?.pending) return cached.pending;

  const entry: RadarSourceCacheEntry = { expiresAt: now + SOURCE_CACHE_TTL_MS };
  const pending = buildRadarSourceDatasets(agencyId).then(datasets => {
    if (sourceCache.get(cacheKey) === entry) {
      sourceCache.set(cacheKey, { datasets, expiresAt: Date.now() + SOURCE_CACHE_TTL_MS });
    }
    return datasets;
  }).catch(error => {
    if (sourceCache.get(cacheKey) === entry) sourceCache.delete(cacheKey);
    throw error;
  });
  entry.pending = pending;
  sourceCache.set(cacheKey, entry);
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
    within(EXTERNAL_SOURCE_TIMEOUT_MS, "Website enquiries", canInspectPublicEnquiries ? getRequestWebsiteEnquiries(agencyId, 500) : Promise.resolve([])),
    within(EXTERNAL_SOURCE_TIMEOUT_MS, "Social inbox", listInboxSnapshot(agencyId)),
    within(EXTERNAL_SOURCE_TIMEOUT_MS, "Lead pipeline", leadInstall ? listRadarLeads(agencyId, leadInstall.id) : Promise.resolve([])),
  ]);
  const website = state.agencyWebsites[agencyId];
  const inbox = inboxResult.status === "fulfilled" ? inboxResult.value : null;
  const enquiries = enquiryResult.status === "fulfilled" ? enquiryResult.value : [];
  const leads = leadResult.status === "fulfilled" ? leadResult.value : [];
  const calendarCommitments = [
    ...listAgencyTasks(agencyId).filter(task => task.startAt || task.dueAt || task.reminderAt).map(task => ({ recordType: "task", ...task })),
    ...listAgencyCommandCalendarEntries(agencyId).map(entry => ({ recordType: "calendar-entry", ...entry })),
    ...Object.values(state.dashboardDayPlans).filter(plan => plan.agencyId === agencyId).map(plan => ({ recordType: "day-plan", ...plan })),
    ...leads.filter(lead => lead.nextMeetingAt).map(lead => ({ recordType: "lead-meeting", id: lead.id, name: lead.name, email: lead.email, nextMeetingAt: lead.nextMeetingAt, meetingStatus: lead.meetingStatus, meetingMode: lead.meetingMode, meetingLocation: lead.meetingLocation, meetingReminderAt: lead.meetingReminderAt })),
  ];
  const responseClocks = enquiries.map(enquiry => ({
    id: enquiry.id,
    enquiryId: enquiry.id,
    name: enquiry.name,
    siteName: enquiry.siteName,
    channel: enquiry.channel,
    status: enquiry.status,
    clientId: enquiry.clientId,
    submittedAt: enquiry.submittedAt,
    firstRespondedAt: enquiry.firstRespondedAt,
    responseTimeMs: enquiry.firstRespondedAt ? Math.max(0, enquiry.firstRespondedAt - enquiry.submittedAt) : undefined,
    awaitingResponse: !enquiry.firstRespondedAt && enquiry.status !== "resolved",
  }));

  const datasets: RadarSourceDataset[] = [
    dataset({ id: "core:clients", domain: "clients", label: "Clients and contacts", description: "Client identity, lifecycle, ownership, brand and status records used by client health and commercial checks.", href: "/portal/clients", sourceIds: ["core:clients", "clients", "client-health", "clients:active"], records: clients }),
    dataset({ id: "core:tasks", domain: "operations", label: "Tasks and actions", description: "Open, overdue, assigned and completed work used by operational load and ownership checks.", href: "/portal/agency/actions", sourceIds: ["core:operations", "tasks", "operations:tasks"], records: listAgencyTasks(agencyId) }),
    dataset({ id: "core:activity", domain: "systems", label: "Workspace activity", description: "Tenant activity events used to assess freshness, continuity and operational change.", href: "/portal/agency/settings#logs", sourceIds: ["activity-log", "systems:activity", "core:operations"], records: state.activity.filter(entry => entry.agencyId === agencyId) }),
    dataset({ id: "core:team", domain: "team", label: "Team and access", description: "Safe user identity, role and ownership fields. Authentication material is never exposed.", href: "/portal/account/permissions", sourceIds: ["core:team", "team", "team:users"], records: listUsersForAgency(agencyId).map(user => ({ id: user.id, email: user.email, username: user.username, name: user.name, role: user.role, agencyIds: user.agencyIds, companyIds: user.companyIds, clientId: user.clientId, mustChangePassword: user.mustChangePassword, emailVerifiedAt: user.emailVerifiedAt, createdAt: user.createdAt, updatedAt: user.updatedAt })) }),
    dataset({ id: "core:company", domain: "company", label: "Company plans, capital and targets", description: "Business plan, objectives, targets, capacity, ownership, investments, distributions, authority and reviews behind executive health.", href: "/portal/agency?station=battle", sourceIds: ["core:company", "company-health", "company:planning", "company:capital"], records: Object.values(state.companyProfiles).filter(profile => profile.agencyId === agencyId) }),
    dataset({ id: "core:legal", domain: "compliance", label: "Legal and compliance", description: "Contracts, insurance, filing reminders and expiry records used by compliance checks.", href: "/portal/agency/company?view=legal", sourceIds: ["core:compliance", "legal", "compliance:legal"], records: listLegalDocuments(agencyId) }),
    dataset({ id: "core:pipelines", domain: "sales", label: "Journey pipelines", description: "Configured lead, sales, fulfilment and custom pipeline definitions.", href: "/portal/clients?view=journey", sourceIds: ["pipelines", "sales:pipelines", "delivery:pipelines"], records: pipelines }),
    dataset({ id: "core:pipeline-cards", domain: "sales", label: "Pipeline cards", description: "Tenant cards and their current columns, including lead, client, deal and custom cards.", href: "/portal/clients?view=journey", sourceIds: ["pipeline-cards", "sales:pipeline-cards"], records: Object.values(state.pipelineCards).filter(card => pipelineIds.has(card.pipelineId)) }),
    dataset({ id: "core:products", domain: "delivery", label: "Products and packages", description: "Offer, pricing, fulfilment, portal and product configuration used by client and delivery checks.", href: "/portal/agency/products", sourceIds: ["products", "delivery:products"], records: Object.values(state.agencyProducts).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:milestones", domain: "delivery", label: "Client milestones", description: "Delivery progress, blockers, targets and tracked client outcomes.", href: "/portal/agency/fulfilment", sourceIds: ["milestones", "delivery:milestones"], records: Object.values(state.clientMilestones).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:experiments", domain: "marketing", label: "Performance experiments", description: "Active and completed experiments, variants, traffic and conversion evidence.", href: "/portal/agency/fulfilment/technical/performance", sourceIds: ["performance-experiments", "marketing:experiments"], records: Object.values(state.performanceExperiments).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:experience-packages", domain: "clients", label: "Experience packages", description: "Curated client and staff experience packages, costs and fulfilment steps.", href: "/portal/agency/you-deserve-it", sourceIds: ["experience-packages", "clients:experience"], records: Object.values(state.experiencePackages).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:client-delight", domain: "clients", label: "Client experience records", description: "Planned and delivered care, rewards, events, trips and client experience outcomes.", href: "/portal/agency/you-deserve-it", sourceIds: ["client-delight", "clients:delight"], records: Object.values(state.clientDelight).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:automations", domain: "operations", label: "Automation workflows", description: "Workflow configuration, state, ownership and aggregate run outcomes.", href: "/portal/agency/marketing?view=automations", sourceIds: ["automations", "operations:automations"], records: Object.values(state.automationWorkflows).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:automation-runs", domain: "operations", label: "Automation runs", description: "Run status, trigger evidence, node logs, waits and failures.", href: "/portal/agency/marketing?view=automations", sourceIds: ["automation-runs", "operations:automation-runs"], records: Object.values(state.automationRuns).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:sops", domain: "operations", label: "SOP library", description: "Procedure metadata, categories, tags and content references used by operational readiness checks.", href: "/portal/agency/sop-library", sourceIds: ["sops", "operations:sops"], records: Object.values(state.sops).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:development-resources", domain: "development", label: "Technical delivery resources", description: "Tools, components, resources and saved references. Credential secrets are redacted.", href: "/portal/agency/fulfilment/technical/toolkit", sourceIds: ["development-resources", "development:resources"], records: Object.values(state.developmentResources).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:development-workflows", domain: "development", label: "Technical delivery workflows", description: "Configured delivery workflows and stages for technical work.", href: "/portal/agency/fulfilment/technical/workflow", sourceIds: ["development-workflows", "development:workflow"], records: Object.values(state.developmentWorkflows).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:website-pages", domain: "development", label: "Website project and pages", description: "First-party release state, routes and page update evidence.", href: "/portal/agency/fulfilment/technical/website", sourceIds: ["agency-website", "development:websites"], records: website ? [{ ...website, telemetryEvents: undefined }] : [] }),
    dataset({ id: "core:website-telemetry", domain: "development", label: "Website telemetry events", description: "Pageviews, forms, conversions, errors, performance, search and heartbeat events received by Aqua Tag.", href: "/portal/agency/fulfilment/technical/performance", sourceIds: ["website-telemetry", "development:telemetry", "marketing:telemetry"], records: website?.telemetryEvents ?? [] }),
    dataset({ id: "core:synthetic-probes", domain: "systems", label: "Synthetic probe results", description: "Active property probes, response status and failure evidence used by uptime sentinels.", href: "/portal/agency/fulfilment?view=technical", sourceIds: ["synthetic-probes", "systems:synthetic"], records: Object.values(state.radarSyntheticProbes[agencyId] ?? {}) }),
    dataset({ id: "core:dashboard-sessions", domain: "operations", label: "Work sessions", description: "Clocked work sessions, focus and completion notes used by capacity and execution checks.", href: "/portal/agency", sourceIds: ["dashboard-work-sessions", "operations:capacity"], records: Object.values(state.dashboardWorkSessions).filter(record => record.agencyId === agencyId) }),
    dataset({ id: "core:calendar-commitments", domain: "operations", label: "Calendar commitments", description: "Dated tasks, calendar entries, daily command plans and lead meetings used to inspect ownership, deadlines and upcoming commitments.", href: "/portal/agency?station=calendar", sourceIds: ["core:calendar-commitments", "calendar", "operations:calendar", "metric:calendar-commitments-7d", "metric:calendar-unowned"], records: calendarCommitments }),
    dataset({ id: "external:website-enquiries", domain: "inbox", label: "Website enquiries", description: "Form, chatbot and support submissions with source, campaign, response and lifecycle timestamps.", href: "/portal/agency/inbox?view=forms", sourceIds: ["core:inbox", "website-enquiries", "inbox:enquiries", "sales:enquiries"], records: enquiryResult.status === "fulfilled" ? enquiryResult.value : undefined, unavailableReason: !canInspectPublicEnquiries ? "Public enquiry rows belong to the canonical AquaOasis owner workspace." : enquiryResult.status === "rejected" ? safeError(enquiryResult.reason) : undefined }),
    dataset({ id: "external:response-time-clocks", domain: "sales", label: "Lead response clocks", description: "Exact enquiry receipt, first-response and waiting-time records used by speed-to-lead checks.", href: "/portal/agency/inbox?view=forms", sourceIds: ["external:response-time-clocks", "metric:speed-to-lead", "metric:speed-to-lead-breach", "sales:response-clocks"], records: enquiryResult.status === "fulfilled" ? responseClocks : undefined, unavailableReason: !canInspectPublicEnquiries ? "Public enquiry rows belong to the canonical AquaOasis owner workspace." : enquiryResult.status === "rejected" ? safeError(enquiryResult.reason) : undefined }),
    dataset({ id: "external:social-connections", domain: "inbox", label: "Social inbox connections", description: "Connected Meta channel status, scopes, webhooks and sync health. Access credentials are never exposed.", href: "/portal/agency/inbox?view=social", sourceIds: ["social-inbox", "inbox:connections"], records: inbox?.connections, unavailableReason: inboxResult.status === "rejected" ? safeError(inboxResult.reason) : undefined }),
    dataset({ id: "external:social-conversations", domain: "inbox", label: "Social conversations", description: "Conversation state, identity, attribution, timing and response evidence.", href: "/portal/agency/inbox?view=social", sourceIds: ["social-conversations", "inbox:conversations"], records: inbox?.conversations.map(({ messages: _messages, ...conversation }) => ({ ...conversation, clientId: conversation.identity.clientId })), unavailableReason: inboxResult.status === "rejected" ? safeError(inboxResult.reason) : undefined }),
    dataset({ id: "external:social-messages", domain: "inbox", label: "Social messages", description: "Inbound, outbound and internal message records used by response and continuity checks.", href: "/portal/agency/inbox?view=social", sourceIds: ["social-messages", "inbox:messages"], records: inbox?.conversations.flatMap(conversation => conversation.messages.map(message => ({ ...message, clientId: conversation.identity.clientId }))), unavailableReason: inboxResult.status === "rejected" ? safeError(inboxResult.reason) : undefined }),
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
  if (domain === "development") return "/portal/agency/fulfilment?view=technical";
  if (domain === "inbox") return "/portal/agency/inbox";
  return "/portal/agency";
}

function readable(value: string): string {
  return value.replace(/^aqua-/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
