import "server-only";

// The ORIGIN template — "the agency for everyone".
//
// Ed, 2026-08-27: "the original product will be the agency for everyone, with
// all products services, and we can choose to develop etc."
//
// One agency is designated the origin; a NEW agency is seeded from its
// catalogue. The open product question — whether the origin is a real agency Ed
// operates or a system-owned artefact no tenant can see — does not change the
// dangerous part, which is what crosses the tenant boundary. That is what this
// module owns, and it is deliberately the first thing built.
//
// ── The rule: nothing is contributed unless it is named ─────────────────────
//
// `PortalState` carries 88 collections. An allowlist that silently accepts
// whatever is added next is how a client record, a person, or an API key ends
// up inside somebody else's tenant. So every collection is classified into
// exactly one of two lists below, and `assertOriginClassificationIsComplete()`
// fails the moment a new collection appears in neither. A future collection is
// therefore EXCLUDED until a human deliberately says otherwise.
//
// ── And: no dangling references ─────────────────────────────────────────────
//
// A contributed record may only point at other contributed records. Anything
// referring to a collection we do not carry (a trading company, an SOP) has
// that reference DROPPED rather than copied, because an id belonging to the
// origin tenant is meaningless — and readable — inside the new one.

import { getState } from "@/server/storage";
import type { ClientContractTemplate } from "@/lib/clients/clientContracts";
import type {
  AgencyProduct,
  AgencyTaskTemplate,
  ClientPortalTemplateRecord,
  PortalState,
} from "@/server/types";

/**
 * The agency acting as the origin.
 *
 * Ed, 2026-08-27: *"just for now be a real agency I operate — I need to get this
 * out for myself first. But it will be both."* So today the origin is a real
 * tenant, named by configuration; later a system-owned artefact becomes a second
 * kind of origin. Nothing below assumes which: `projectAgencyOrigin` takes an
 * agency id, so a synthetic origin only has to produce one.
 */
export const ORIGIN_AGENCY_ENV = "AQUA_ORIGIN_AGENCY_ID";

export function getOriginAgencyId(): string | null {
  return process.env[ORIGIN_AGENCY_ENV]?.trim() || null;
}

type Collection = keyof PortalState;

/**
 * What a new agency inherits: the catalogue, and how those services present.
 *
 * Deliberately narrow. This is the "all products services" Ed described plus
 * the portal designs those services are delivered through — the shape of the
 * offer, not anybody's business.
 */
export const ORIGIN_CONTRIBUTES = [
  "agencyProducts",
  "clientPortalTemplates",
  "contractTemplates",
  "taskTemplates",
] as const satisfies readonly Collection[];

/**
 * Everything else, grouped by WHY it must not cross. The reasons matter more
 * than the list: they are what a future reader checks a new collection against.
 */
export const ORIGIN_NEVER_CONTRIBUTES: Readonly<Record<string, readonly Collection[]>> = {
  // Somebody else's customers, staff and relationships.
  people: [
    "clients", "endCustomers", "users", "persons", "organisations",
    "peopleApplications", "peopleEmployees", "peopleLeaveRequests", "peopleShifts",
    "peopleTrainingAssignments", "peopleFreelancerJobs", "peopleRecognitions",
    "peopleFeedback", "peopleProcessConfig", "peopleContracts", "peopleChannels",
    "peopleMessages", "peopleChannelReads", "peopleTrainingModules",
    "freelancerAccessConfig", "freelancerJobOverride", "staffProvisioningOperations",
    "clientProjectOperations",
    "clientMilestones", "clientDelight", "clientRecordLedger",
    "identityResolutionReviews", "enquiryContactDetails",
    // Enquiry events belonging to a specific client's website. A notice holds
    // no customer data itself, but it is a pointer into that client's own
    // database — seeding one into a brand-new agency would hand them a
    // reference to somebody else's enquiries and a count of them.
    "clientFormNotices",
    // The DSAR register. Never seeded: it is one controller's evidence of
    // which requests they received and how they identified the people who
    // made them. A brand-new agency inheriting somebody else's subject
    // requests would start life holding a compliance record that is not
    // theirs, with statutory clocks that were never running for them.
    "subjectRequests",
  ],
  // Credentials and tenant-bound keys. The loudest never.
  secrets: [
    "integrationConnections", "externalAssistantApiKeys", "externalAssistantActionProposals",
    "editorAiConfigs", "agencyMasterTagKeys", "commandCalendarConnections",
  ],
  // Live work, money and history — an origin seeds an offer, not a business.
  operations: [
    "activity", "outbox", "completedActions", "pipelines", "pipelineCards", "tasks",
    "pluginInstalls", "pluginData", "portalConnections", "clientPortalInstances",
    "performanceExperiments", "commandCalendarEntries", "commandCalendarSources",
    "commandCalendarExternalEvents", "commandCalendarEventCreateOperations",
    "dashboardDayPlans", "dashboardWeekPlans", "dashboardWorkSessions",
    "radarMemory", "radarSyntheticProbes", "radarEvidence", "radarInfraHealth",
    "customKpis", "operationalAlertPreferences", "userChromeLayouts",
    "assistant", "editorAiConversations",
    "notepadFolders", "notepadNotes", "automationRuns",
  ],
  // The tenant's own identity and estate, which a new agency defines itself.
  tenancy: [
    "agencies", "tradingCompanies", "companyProfiles", "agencySettings",
    "accessRoleTemplates", "accessGrants", "accessRequests",
    "devProjects", "devTeamWorkspaceFiles", "websiteSources", "websiteSiteConfigs",
    "agencyWebsites", "portalEditor", "developmentResources", "developmentWorkflows",
  ],
  /**
   * DECIDED by Ed, 2026-08-27, when asked what should cross:
   * *"no phases, SOPs — individually written ones won't transfer."*
   *
   * Written material is the agency's own voice and working detail, not the
   * shape of the offer. `phases` are a tenant's own lifecycle. Neither is a
   * template in the sense that matters here.
   */
  "written-material-and-lifecycle": [
    "phases", "sops", "sopGuides", "legalDocuments",
  ],
  /**
   * Not yet decided either way — nobody has asked for these to seed, and each
   * would need its own reference-safety pass first.
   */
  "not-yet-classified-as-safe": [
    "experiencePackages", "automationFolders", "automationWorkflows", "customAIs",
  ],
} as const;

/** Fails when a collection exists in neither list — new state must be classified. */
export function assertOriginClassificationIsComplete(sample: PortalState): void {
  const classified = new Set<string>([
    ...ORIGIN_CONTRIBUTES,
    ...Object.values(ORIGIN_NEVER_CONTRIBUTES).flat(),
  ]);
  const unclassified = Object.keys(sample).filter(key => !classified.has(key));
  if (unclassified.length > 0) {
    throw new Error(
      `Origin template: ${unclassified.length} state collection(s) are unclassified and would be `
      + `silently excluded — decide deliberately: ${unclassified.join(", ")}`,
    );
  }
}

export interface AgencyOriginProjection {
  originAgencyId: string;
  targetAgencyId: string;
  products: AgencyProduct[];
  portalTemplates: ClientPortalTemplateRecord[];
  contractTemplates: ClientContractTemplate[];
  taskTemplates: AgencyTaskTemplate[];
  /**
   * Contributed records whose wording still carries the origin's brand and
   * needs a human pass. Reported rather than "stripped": branding lives in free
   * text, and a regex pretending to remove it would be worse than saying so.
   */
  needsRebrand: { recordId: string; title: string; reason: string }[];
  /** Old origin id → new target id, for anything that needs to follow the copy. */
  idMap: Record<string, string>;
  /** References deliberately dropped because their collection is not contributed. */
  droppedReferences: { recordId: string; field: string; reason: string }[];
}

function mintId(prefix: string, targetAgencyId: string, sourceId: string): string {
  // Deterministic, so seeding the same origin into the same agency twice is
  // idempotent rather than duplicating the catalogue.
  return `${prefix}_${targetAgencyId}_${sourceId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 180);
}

/**
 * What a new agency would receive from this origin.
 *
 * Pure — it reads state and returns records; it writes nothing. Seeding is a
 * separate, deliberate step, and this is what it should be reviewed from.
 */
export function projectAgencyOrigin(input: {
  originAgencyId: string;
  targetAgencyId: string;
  /**
   * Who is doing the seeding. Contributed records are RE-ATTRIBUTED to them.
   *
   * Not cosmetic: `createdBy`/`updatedBy` on a template — and on every version
   * in its history — are user ids belonging to the ORIGIN tenant. Copying them
   * hands the new agency a person it cannot see, and hands anyone reading the
   * new tenant an identifier from another one.
   */
  actorUserId?: string;
  state?: PortalState;
  now?: number;
}): AgencyOriginProjection {
  const state = input.state ?? getState();
  const now = input.now ?? Date.now();
  const actor = input.actorUserId ?? "system";
  const { originAgencyId, targetAgencyId } = input;
  if (originAgencyId === targetAgencyId) {
    throw new Error("An agency cannot be seeded from itself.");
  }

  const idMap: Record<string, string> = {};
  const droppedReferences: AgencyOriginProjection["droppedReferences"] = [];

  const sourceProducts = Object.values(state.agencyProducts)
    .filter(product => product.agencyId === originAgencyId);
  for (const product of sourceProducts) idMap[product.id] = mintId("prod", targetAgencyId, product.id);

  const sourceTemplates = Object.values(state.clientPortalTemplates)
    .filter(template => template.agencyId === originAgencyId);
  for (const template of sourceTemplates) idMap[template.id] = mintId("tmpl", targetAgencyId, template.id);

  const products: AgencyProduct[] = sourceProducts.map(product => {
    // `companyIds` names the origin's trading companies, which are not
    // contributed. An id from another tenant is meaningless here, and copying
    // it would leak that tenant's structure.
    if (product.companyIds?.length) {
      droppedReferences.push({
        recordId: product.id,
        field: "companyIds",
        reason: "trading companies are not contributed by an origin",
      });
    }
    if (product.sopIds.length) {
      droppedReferences.push({
        recordId: product.id,
        field: "sopIds",
        reason: "SOPs are not yet classified as safe to contribute",
      });
    }
    return {
      ...structuredClone(product),
      id: idMap[product.id]!,
      agencyId: targetAgencyId,
      companyIds: undefined,
      sopIds: [],
      // Only keep links to products that genuinely came across.
      includedProductIds: product.includedProductIds
        .map(included => idMap[included])
        .filter((id): id is string => Boolean(id)),
      createdAt: now,
      updatedAt: now,
    };
  });

  const portalTemplates: ClientPortalTemplateRecord[] = sourceTemplates.map(template => ({
    ...structuredClone(template),
    id: idMap[template.id]!,
    agencyId: targetAgencyId,
    productId: template.productId ? idMap[template.productId] : undefined,
    // A base template only survives if the base itself came across.
    baseTemplateId: template.baseTemplateId ? idMap[template.baseTemplateId] : undefined,
    baseTemplateVersionId: template.baseTemplateId && idMap[template.baseTemplateId]
      ? template.baseTemplateVersionId
      : undefined,
    // Re-attributed: the origin's authors are people in another tenant.
    createdBy: actor,
    updatedBy: actor,
    // The version history is the same problem one level down — and a new
    // agency has no history with this template anyway, so it starts with the
    // published document alone rather than somebody else's audit trail.
    versions: template.versions
      .filter(version => version.id === template.publishedVersionId)
      .map(version => ({ ...structuredClone(version), createdBy: actor, createdAt: now })),
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
  }));

  const needsRebrand: AgencyOriginProjection["needsRebrand"] = [];

  // ── Contract templates ─────────────────────────────────────────────────────
  // Ed: "contract templates — branded, no. Templates, sure." Branding lives in
  // the body text, which cannot be stripped honestly, so the rule is drawn where
  // it CAN be drawn safely:
  //   • a template created FROM a real client contract is that client's
  //     agreement in template clothing — it does not transfer at all;
  //   • the rest transfer, and are flagged as carrying the origin's wording so
  //     a person rebrands them rather than a regex pretending to.
  const contractTemplates: ClientContractTemplate[] = Object.values(state.contractTemplates)
    .filter(template => template.agencyId === originAgencyId && template.status !== "archived")
    .filter(template => {
      if (!template.sourceContractId) return true;
      droppedReferences.push({
        recordId: template.id,
        field: "sourceContractId",
        reason: "created from a real client contract, so it is that client's agreement, not a template",
      });
      return false;
    })
    .map(template => {
      const id = mintId("ctpl", targetAgencyId, template.id);
      idMap[template.id] = id;
      needsRebrand.push({
        recordId: id,
        title: template.title,
        reason: "the body carries the origin agency's wording and terms",
      });
      return {
        ...structuredClone(template),
        id,
        agencyId: targetAgencyId,
        // An operation key belongs to the origin's command history.
        creationOperationId: undefined,
        sourceContractId: undefined,
        createdBy: actor,
        createdAt: now,
        updatedAt: now,
      };
    });

  // ── Task templates ─────────────────────────────────────────────────────────
  // "Templates, sure." Their steps may name an SOP, which does NOT transfer, and
  // may carry links holding the origin's client or user ids.
  const taskTemplates: AgencyTaskTemplate[] = Object.values(state.taskTemplates)
    .filter(template => template.agencyId === originAgencyId)
    .map(template => {
      const id = mintId("ttpl", targetAgencyId, template.id);
      idMap[template.id] = id;
      const steps = template.steps.map(step => {
        if (step.sopId) {
          droppedReferences.push({
            recordId: template.id,
            field: "steps[].sopId",
            reason: "SOPs are written material and do not transfer",
          });
        }
        const leaksTenantId = step.href
          ? /\b(cli_|usr_|prod_|devproj_)/.test(step.href) || step.href.includes(originAgencyId)
          : false;
        if (leaksTenantId) {
          droppedReferences.push({
            recordId: template.id,
            field: "steps[].href",
            reason: "the link contained an identifier from the origin tenant",
          });
        }
        return {
          ...structuredClone(step),
          sopId: undefined,
          href: leaksTenantId ? undefined : step.href,
        };
      });
      return {
        ...structuredClone(template),
        id,
        agencyId: targetAgencyId,
        steps,
        createdBy: actor,
        createdAt: now,
        updatedAt: now,
      };
    });

  return {
    originAgencyId,
    targetAgencyId,
    products,
    portalTemplates,
    contractTemplates,
    taskTemplates,
    idMap,
    droppedReferences,
    needsRebrand,
  };
}

/** One line for a review screen, before anybody seeds anything. */
export function describeAgencyOriginProjection(projection: AgencyOriginProjection): string {
  const products = projection.products.length;
  const templates = projection.portalTemplates.length;
  const contracts = projection.contractTemplates.length;
  const tasks = projection.taskTemplates.length;
  const dropped = projection.droppedReferences.length;
  const rebrand = projection.needsRebrand.length;
  const parts = [
    `${products} service${products === 1 ? "" : "s"}`,
    `${templates} portal template${templates === 1 ? "" : "s"}`,
    `${contracts} contract template${contracts === 1 ? "" : "s"}`,
    `${tasks} task template${tasks === 1 ? "" : "s"}`,
  ];
  return `${parts.join(", ")}`
    + `${dropped > 0 ? `, with ${dropped} reference${dropped === 1 ? "" : "s"} dropped as tenant-specific` : ""}`
    + `${rebrand > 0 ? `. ${rebrand} carr${rebrand === 1 ? "ies" : "y"} the origin's wording and need${rebrand === 1 ? "s" : ""} rebranding` : ""}.`;
}

// ─── Applying a projection ──────────────────────────────────────────────────
//
// The seed itself. Everything above decides WHAT crosses; this puts it in the
// new agency, and its one rule is the same rule the Update button follows:
//
//   **never overwrite something the new agency already has.**
//
// Seeding is idempotent because the ids are deterministic, so re-running after
// adding a service to the origin brings the new one across and leaves the rest
// alone — including any the new agency has since edited. A seed that silently
// replaced their edits would be the forced upgrade this system exists to avoid.

import { mutate } from "@/server/storage";

export interface AgencySeedResult {
  originAgencyId: string;
  targetAgencyId: string;
  created: Record<(typeof ORIGIN_CONTRIBUTES)[number], number>;
  /** Already present in the target — left exactly as they are. */
  skipped: Record<(typeof ORIGIN_CONTRIBUTES)[number], number>;
  needsRebrand: AgencyOriginProjection["needsRebrand"];
  droppedReferences: AgencyOriginProjection["droppedReferences"];
}

/**
 * Seed a target agency from an origin.
 *
 * Reviewable first: call `projectAgencyOrigin()` to see exactly what this will
 * do. Returns what it created versus what was already there, so a screen can
 * say "3 new services, 2 left alone" rather than claiming a wholesale copy.
 */
export function seedAgencyFromOrigin(input: {
  originAgencyId: string;
  targetAgencyId: string;
  actorUserId?: string;
  now?: number;
}): AgencySeedResult {
  const state = getState();
  if (!state.agencies[input.targetAgencyId]) {
    throw new Error("The agency being seeded does not exist.");
  }
  if (!state.agencies[input.originAgencyId]) {
    throw new Error("The origin agency does not exist.");
  }

  const projection = projectAgencyOrigin(input);
  const created: AgencySeedResult["created"] = {
    agencyProducts: 0, clientPortalTemplates: 0, contractTemplates: 0, taskTemplates: 0,
  };
  const skipped: AgencySeedResult["skipped"] = {
    agencyProducts: 0, clientPortalTemplates: 0, contractTemplates: 0, taskTemplates: 0,
  };

  mutate(current => {
    for (const product of projection.products) {
      if (current.agencyProducts[product.id]) { skipped.agencyProducts += 1; continue; }
      current.agencyProducts[product.id] = product;
      created.agencyProducts += 1;
    }
    for (const template of projection.portalTemplates) {
      if (current.clientPortalTemplates[template.id]) { skipped.clientPortalTemplates += 1; continue; }
      current.clientPortalTemplates[template.id] = template;
      created.clientPortalTemplates += 1;
    }
    for (const template of projection.contractTemplates) {
      if (current.contractTemplates[template.id]) { skipped.contractTemplates += 1; continue; }
      current.contractTemplates[template.id] = template;
      created.contractTemplates += 1;
    }
    for (const template of projection.taskTemplates) {
      if (current.taskTemplates[template.id]) { skipped.taskTemplates += 1; continue; }
      current.taskTemplates[template.id] = template;
      created.taskTemplates += 1;
    }
  });

  return {
    originAgencyId: projection.originAgencyId,
    targetAgencyId: projection.targetAgencyId,
    created,
    skipped,
    needsRebrand: projection.needsRebrand,
    droppedReferences: projection.droppedReferences,
  };
}

/** One line for the screen that ran the seed. */
export function describeAgencySeed(result: AgencySeedResult): string {
  const created = Object.values(result.created).reduce((total, count) => total + count, 0);
  const skipped = Object.values(result.skipped).reduce((total, count) => total + count, 0);
  if (created === 0 && skipped === 0) return "The origin had nothing to contribute.";
  if (created === 0) return `Everything was already here — ${skipped} record${skipped === 1 ? "" : "s"} left untouched.`;
  return `Added ${created} record${created === 1 ? "" : "s"}`
    + `${skipped > 0 ? `, left ${skipped} already here untouched` : ""}`
    + `${result.needsRebrand.length > 0 ? `. ${result.needsRebrand.length} need${result.needsRebrand.length === 1 ? "s" : ""} rebranding` : ""}.`;
}
