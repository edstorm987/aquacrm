import "server-only";
// Giving a trading company a portal of its own — PREVIEW ONLY.
//
// ⚠ THE MODEL, settled by the founder 2026-08-20: AGENCY is a holding group,
// TRADING COMPANIES are the businesses under it, each with its own CLIENTS.
// A company never becomes an agency; it stays a company and gains a portal.
// Everything below previews what would populate that portal — nothing moves.
//
// Phases 1-3 of `docs/development/plans/promote-trading-company.md` build the
// map, the preview and the endpoint's security shell. NOTHING in this file
// moves a record. `previewCompanyPortal` is a pure read: it takes the
// disposition map, walks the live state through it, and returns the inventory
// a human is asked to confirm. The whole point of the shape is that nothing
// moves until the map and the preview are trustworthy.
//
// Two rules this file obeys, and a test pins both:
//
//   1. ZERO WRITES. `getState()` only, never `mutate()`. The state must be
//      byte-identical before and after a preview.
//   2. EVERY collection appears. The walk is driven by `PROMOTION_DISPOSITION`,
//      so every PortalState collection is reported — including those with nothing in
//      them. That is what stops this becoming the next 25-of-78 hand-list.
//
// ─── THE NINTH OWNERSHIP SURFACE ──────────────────────────────────────────
//
// Eight record types in `types.ts` carry company ownership. A ninth lives
// INSIDE plugin data as opaque values under `state.pluginData[installId][key]`:
// Invoice.companyId, BudgetPot.companyIds, FinanceObligation.companyIds,
// CompensationProfile.companyIds (agency-finance); CommercialPack.companyId,
// Lead.companyId/companyIds, Campaign.companyIds (leads-pipeline);
// MarketingAsset.companyIds, MarketingCustomerProfile.companyIds
// (agency-marketing). A preview that ignores them UNDER-REPORTS what a
// promotion touches, so the walk below descends into plugin slices looking for
// the two field shapes by name. It reports; it never decides. Splitting opaque
// plugin values is the plugin's own `onPromoteCompany` job (phase 6) — the core
// must never guess at a `Record<string, unknown>`.

import { getState } from "../storage";
import type { PortalState } from "../types";
import {
  PROMOTION_COLLECTIONS,
  PROMOTION_COLLECTION_COUNT,
  dispositionFor,
  type CollectionPromotionPlan,
  type PromotionDisposition,
} from "./disposition";

type CollectionName = keyof Required<PortalState>;

/** Ids quoted back in the preview, capped so a big tenant stays readable. */
const SAMPLE_LIMIT = 8;
/** How deep the plugin-slice walk goes before giving up on a value. */
const PLUGIN_SCAN_MAX_DEPTH = 8;
/** Hard ceiling on nodes visited per plugin slice, so a preview cannot hang. */
const PLUGIN_SCAN_MAX_NODES = 50_000;

// ─── Result shapes ────────────────────────────────────────────────────────

export interface PromotionCollectionLine {
  collection: CollectionName;
  disposition: PromotionDisposition;
  ownership: CollectionPromotionPlan["ownership"];
  reason: string;
  /** True when this line is a PROPOSAL a human must confirm, not an answer. */
  needsConfirmation: boolean;
  /**
   * Top-level entries of this collection belonging to the origin tenant.
   * Entries, not leaf records: `customKpis[agencyId]` is one entry holding
   * many definitions, and saying otherwise would be a lie dressed as a number.
   */
  inOriginTenant: number;
  /** Entries that would leave the origin tenant. */
  moving: number;
  /** Entries the data cannot decide about — a human must. */
  ambiguous: number;
  /** Up to eight keys of the moving entries, for a human to spot-check. */
  sample: string[];
}

export type PromotionAmbiguityKind =
  | "shared-record"
  | "straddling-person"
  | "no-company-dimension"
  | "untenanted-source"
  | "staff-tag";

export interface PromotionAmbiguity {
  collection: CollectionName;
  kind: PromotionAmbiguityKind;
  count: number;
  /** Up to eight keys, so the proposal names real records. */
  recordIds: string[];
  why: string;
  /** Always LEAVE — the reversible direction. Confirmation may override it. */
  suggested: "leave";
}

export interface PromotionPluginDataLine {
  installId: string;
  pluginId: string;
  scope: "agency" | "client";
  clientId?: string;
  /** A client-scoped install whose client is moving travels with it. */
  followsMovingClient: boolean;
  /** The `pluginData[installId]` key whose value holds the matches. */
  key: string;
  /** Values naming ONLY this company. */
  exclusive: number;
  /** Values naming this company alongside others — a split, not a move. */
  shared: number;
  /**
   * True when the core cannot act: an agency-scoped install is SHARED between
   * brands, and only the plugin knows how to split its own opaque records.
   */
  requiresPluginHook: boolean;
}

export interface CompanyPromotionPreview {
  agencyId: string;
  companyId: string;
  companyName: string;
  companySlug: string;
  generatedAt: number;
  /** Set when this company has already been promoted — a second run is a no-op. */
  alreadyPromotedAgencyId?: string;
  promotedAt?: number;
  /** Clients that would cross the boundary. One clientId, one tenant, ever. */
  movingClientIds: string[];
  /** Always `PROMOTION_COLLECTION_COUNT` — proof the walk covered everything. */
  collectionsClassified: number;
  lines: PromotionCollectionLine[];
  ambiguities: PromotionAmbiguity[];
  pluginData: PromotionPluginDataLine[];
  totals: {
    movingEntries: number;
    ambiguousEntries: number;
    pluginValuesNamingCompany: number;
    pluginInstallsNeedingHook: number;
    /** How many COLLECTIONS carry each disposition. */
    collectionsByDisposition: Record<PromotionDisposition, number>;
  };
  /** Things a human must be told that no count can express. */
  warnings: string[];
}

// ─── Generic readers ──────────────────────────────────────────────────────

function entriesOf(collection: unknown): Array<[string, unknown]> {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection.map((value, index) => [String(index), value]);
  if (typeof collection === "object") return Object.entries(collection as Record<string, unknown>);
  return [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(record: Record<string, unknown> | null, field: string): string | undefined {
  const value = record?.[field];
  return typeof value === "string" && value ? value : undefined;
}

/** Does this key belong to the origin agency, for an `${agencyId}`-prefixed key? */
function keyIsUnderAgency(key: string, agencyId: string): boolean {
  return key === agencyId || key.startsWith(`${agencyId}:`) || key.startsWith(`${agencyId}|`);
}

/**
 * How a record names the promoted company.
 *
 * `exclusive` — this company and no other, so it can move outright.
 * `shared`    — this company AND others; a move would take it away from a
 *               brand that is staying. Ambiguous.
 * `unscoped`  — a `companyIds[]` collection with no ids set, which by
 *               convention means "every brand". Ambiguous, defaulting to LEAVE.
 * `none`      — nothing to do with this company.
 */
type CompanyLink = "exclusive" | "shared" | "unscoped" | "none";

function companyLink(record: Record<string, unknown> | null, companyId: string, multi: boolean): CompanyLink {
  if (!record) return "none";
  if (!multi) {
    if (stringField(record, "companyId") === companyId) return "exclusive";
    if (stringField(record, "destinationCompanyId") === companyId) return "exclusive";
    return "none";
  }
  const raw = record.companyIds;
  if (raw === undefined || (Array.isArray(raw) && raw.length === 0)) return "unscoped";
  if (!Array.isArray(raw)) return "none";
  const ids = raw.filter((value): value is string => typeof value === "string");
  if (ids.length === 1 && ids[0] === companyId) return "exclusive";
  if (ids.includes(companyId)) return "shared";
  return "none";
}

// ─── The preview ──────────────────────────────────────────────────────────

/**
 * What a promotion of `companyId` out of `agencyId` would move.
 *
 * Returns `null` when the company does not exist inside that agency — the same
 * answer as "not yours", deliberately, so a caller cannot use this to discover
 * whether a company id is real.
 *
 * Reads only. Never writes. Never throws on odd data — an unexpected shape is
 * reported as zero rather than crashing a preview a human is waiting on.
 */
export function previewCompanyPortal(agencyId: string, companyId: string): CompanyPromotionPreview | null {
  const state = getState();
  const company = state.tradingCompanies[companyId];
  if (!company || company.agencyId !== agencyId) return null;

  // 1. The clients that cross the boundary. Everything client-shaped keys off
  //    this set, so it is computed once, first.
  const movingClientIds = new Set<string>();
  for (const [clientId, client] of Object.entries(state.clients ?? {})) {
    const record = asRecord(client);
    if (!record) continue;
    if (stringField(record, "agencyId") !== agencyId) continue;
    if (stringField(record, "companyId") === companyId) movingClientIds.add(clientId);
  }

  const lines: PromotionCollectionLine[] = [];
  const ambiguities: PromotionAmbiguity[] = [];
  const warnings: string[] = [];
  const collectionsByDisposition: Record<PromotionDisposition, number> = {
    move: 0, rekey: 0, seed: 0, closure: 0, leave: 0, na: 0,
  };

  // 2. Walk the MAP, not the state — that is what guarantees all 78 appear.
  for (const collection of PROMOTION_COLLECTIONS) {
    const plan = dispositionFor(collection);
    collectionsByDisposition[plan.disposition] += 1;

    const line: PromotionCollectionLine = {
      collection,
      disposition: plan.disposition,
      ownership: plan.ownership,
      reason: plan.reason,
      needsConfirmation: plan.needsConfirmation === true,
      inOriginTenant: 0,
      moving: 0,
      ambiguous: 0,
      sample: [],
    };

    if (plan.keying === "singleton") {
      // App-wide, no tenant key. Nothing to count, nothing to promote.
      lines.push(line);
      continue;
    }

    const parentCollection = plan.parent
      ? asRecord((state as unknown as Record<string, unknown>)[plan.parent.collection])
      : null;

    const sharedIds: string[] = [];
    let sharedCount = 0;

    for (const [key, value] of entriesOf((state as unknown as Record<string, unknown>)[collection])) {
      const record = asRecord(value);

      // Resolve the owning record: for a `foreign-id` collection the tenancy
      // (and often the company) answer lives on the parent, not here.
      let parent: Record<string, unknown> | null = null;
      if (plan.parent && parentCollection) {
        const parentKey = plan.parent.via === "key" ? key : stringField(record, plan.parent.via);
        parent = parentKey ? asRecord(parentCollection[parentKey]) : null;
      }

      // Is this entry the origin tenant's at all?
      let belongs: boolean;
      switch (plan.keying) {
        case "agency-id":
          belongs = key === agencyId;
          break;
        case "agency-composite":
          belongs = keyIsUnderAgency(key, agencyId);
          break;
        case "foreign-id":
          belongs = stringField(parent, "agencyId") === agencyId || keyIsUnderAgency(key, agencyId);
          break;
        case "email":
          belongs =
            stringField(record, "agencyId") === agencyId ||
            (Array.isArray(record?.agencyIds) && (record!.agencyIds as unknown[]).includes(agencyId));
          break;
        default:
          belongs = stringField(record, "agencyId") === agencyId;
          break;
      }
      if (!belongs) continue;
      line.inOriginTenant += 1;

      // Does it belong to the promoted company?
      const multi = plan.ownership === "company-multi";
      let link = companyLink(record, companyId, multi);
      if (link === "none" && parent) link = companyLink(parent, companyId, multi);

      // A slice of plugin data carries no `clientId` of its own — its install
      // does. Same for any other child keyed by a parent's id.
      const clientId = stringField(record, "clientId") ?? stringField(parent, "clientId");
      const followsClient = clientId !== undefined && movingClientIds.has(clientId);

      if (plan.disposition === "move" || plan.disposition === "rekey") {
        if (link === "exclusive" || followsClient) {
          line.moving += 1;
          if (line.sample.length < SAMPLE_LIMIT) line.sample.push(key);
          continue;
        }
      }

      if (link === "shared" || (multi && link === "unscoped")) {
        line.ambiguous += 1;
        sharedCount += 1;
        if (sharedIds.length < SAMPLE_LIMIT) sharedIds.push(key);
      }
    }

    if (sharedCount > 0) {
      ambiguities.push({
        collection,
        kind: "shared-record",
        count: sharedCount,
        recordIds: sharedIds,
        why:
          "`companyIds` is either shared with another brand or left unset (meaning every brand). Moving it would take a record away from a company that is staying, so the data has no answer here.",
        suggested: "leave",
      });
    }

    lines.push(line);
  }

  // 3. Ambiguity classes the per-collection walk cannot express.
  collectStaffTagAmbiguity(state, agencyId, companyId, movingClientIds, ambiguities);
  collectStraddlingPeople(state, agencyId, movingClientIds, ambiguities);
  collectNoCompanyDimension(state, agencyId, ambiguities);

  // 4. The ninth ownership surface.
  const pluginData = scanPluginData(state, agencyId, companyId, movingClientIds);

  const pluginValuesNamingCompany = pluginData.reduce((total, row) => total + row.exclusive + row.shared, 0);
  const pluginInstallsNeedingHook = new Set(
    pluginData.filter(row => row.requiresPluginHook).map(row => row.installId),
  ).size;

  if (pluginInstallsNeedingHook > 0) {
    warnings.push(
      `${pluginInstallsNeedingHook} agency-scoped plugin install(s) hold records naming this company. Those are SHARED between brands and only the plugin can split its own opaque values — the core must never guess. That split is the \`onPromoteCompany\` hook, which does not exist yet.`,
    );
  }
  warnings.push(
    "Live enquiries are not counted here: `brand_enquiries` lives in Supabase with no `agency_id` column yet, so this preview cannot see them. Their consent (`consent`, `consentPurpose`, `consentVersion`, `consentCapturedAt`) was given to ONE legal entity and does not automatically travel to a new one — that is a DPO question, not a tick-box.",
  );
  if (company.portalAgencyId) {
    warnings.push(
      `This company was already promoted to agency \`${company.portalAgencyId}\`. A second promotion creates nothing.`,
    );
  }

  return {
    agencyId,
    companyId,
    companyName: company.name,
    companySlug: company.slug,
    generatedAt: Date.now(),
    alreadyPromotedAgencyId: company.portalAgencyId,
    promotedAt: company.portalCreatedAt,
    movingClientIds: [...movingClientIds],
    collectionsClassified: PROMOTION_COLLECTIONS.length,
    lines,
    ambiguities,
    pluginData,
    totals: {
      movingEntries: lines.reduce((total, line) => total + line.moving, 0),
      ambiguousEntries: lines.reduce((total, line) => total + line.ambiguous, 0),
      pluginValuesNamingCompany,
      pluginInstallsNeedingHook,
      collectionsByDisposition,
    },
    warnings,
  };
}

/** Sanity check for callers and tests: the walk covered every collection. */
export function previewCoversEveryCollection(preview: CompanyPromotionPreview): boolean {
  return (
    preview.collectionsClassified === PROMOTION_COLLECTION_COUNT &&
    preview.lines.length === PROMOTION_COLLECTION_COUNT
  );
}

// ─── Ambiguity classes ────────────────────────────────────────────────────

/**
 * Staff tagged with the promoted company.
 *
 * `ServerUser.companyIds` is read for display and assignment only. Treating it
 * as a tenancy grant would turn a label into a retroactive membership — the
 * exact widening the company switcher refuses. So staff are PROPOSED, never
 * granted, and the default is to leave them where they are.
 */
function collectStaffTagAmbiguity(
  state: PortalState,
  agencyId: string,
  companyId: string,
  movingClientIds: Set<string>,
  out: PromotionAmbiguity[],
): void {
  const ids: string[] = [];
  let count = 0;
  for (const [key, value] of Object.entries(state.users ?? {})) {
    const record = asRecord(value);
    if (!record) continue;
    const inAgency =
      stringField(record, "agencyId") === agencyId ||
      (Array.isArray(record.agencyIds) && (record.agencyIds as unknown[]).includes(agencyId));
    if (!inAgency) continue;
    const clientId = stringField(record, "clientId");
    if (clientId && movingClientIds.has(clientId)) continue; // moves with its client
    const tagged = Array.isArray(record.companyIds) && (record.companyIds as unknown[]).includes(companyId);
    if (!tagged) continue;
    count += 1;
    if (ids.length < SAMPLE_LIMIT) ids.push(key);
  }
  if (!count) return;
  out.push({
    collection: "users",
    kind: "staff-tag",
    count,
    recordIds: ids,
    why:
      "`ServerUser.companyIds` is a display label, not a membership. Granting the portal tenant to these people because of a tag would widen sessions retroactively — creating a portal must never become a way to widen a session. Propose, do not grant.",
    suggested: "leave",
  });
}

/**
 * Canonical people whose `facets.clientIds` straddle both tenants. A straddling
 * person stops for a human decision — never an automatic split.
 */
function collectStraddlingPeople(
  state: PortalState,
  agencyId: string,
  movingClientIds: Set<string>,
  out: PromotionAmbiguity[],
): void {
  for (const collection of ["persons", "organisations"] as const) {
    const ids: string[] = [];
    let count = 0;
    for (const [key, value] of Object.entries((state[collection] ?? {}) as Record<string, unknown>)) {
      const record = asRecord(value);
      if (!record || stringField(record, "agencyId") !== agencyId) continue;
      const clientIds = collectFacetClientIds(record);
      if (!clientIds.length) continue;
      const moving = clientIds.filter(id => movingClientIds.has(id)).length;
      if (moving === 0 || moving === clientIds.length) continue; // wholly one side
      count += 1;
      if (ids.length < SAMPLE_LIMIT) ids.push(key);
    }
    if (!count) continue;
    out.push({
      collection,
      kind: "straddling-person",
      count,
      recordIds: ids,
      why:
        "This record is linked to clients on BOTH sides of the new boundary. Splitting it automatically would destroy what somebody did in order to change what they are, so it stops here for a human.",
      suggested: "leave",
    });
  }
}

function collectFacetClientIds(record: Record<string, unknown>): string[] {
  const facets = record.facets;
  const found = new Set<string>();
  const visit = (value: unknown, depth: number): void => {
    if (depth > 4 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    for (const [field, inner] of Object.entries(value as Record<string, unknown>)) {
      if (field === "clientIds" && Array.isArray(inner)) {
        for (const id of inner) if (typeof id === "string") found.add(id);
      } else if (field === "clientId" && typeof inner === "string") {
        found.add(inner);
      } else {
        visit(inner, depth + 1);
      }
    }
  };
  visit(facets, 0);
  return [...found];
}

/**
 * Collections with no company dimension AT ALL — the sixteen `people*`
 * collections, the agency's own website project, and enquiry contact details
 * keyed by an untenanted enquiry id. One proposal per collection with a count,
 * rather than a per-record guess nobody could check.
 */
function collectNoCompanyDimension(state: PortalState, agencyId: string, out: PromotionAmbiguity[]): void {
  for (const collection of PROMOTION_COLLECTIONS) {
    const plan = dispositionFor(collection);
    if (plan.ownership !== "none") continue;
    const ids: string[] = [];
    let count = 0;
    for (const [key, value] of entriesOf((state as unknown as Record<string, unknown>)[collection])) {
      const record = asRecord(value);
      const belongs =
        plan.keying === "agency-id"
          ? key === agencyId
          : plan.keying === "agency-composite"
            ? keyIsUnderAgency(key, agencyId)
            : stringField(record, "agencyId") === agencyId;
      if (!belongs) continue;
      count += 1;
      if (ids.length < SAMPLE_LIMIT) ids.push(key);
    }
    if (!count) continue;
    out.push({
      collection,
      kind: collection === "enquiryContactDetails" ? "untenanted-source" : "no-company-dimension",
      count,
      recordIds: ids,
      why: plan.reason,
      suggested: "leave",
    });
  }
}

// ─── The ninth ownership surface: inside plugin data ──────────────────────

/**
 * Walk each of the origin tenant's plugin slices looking for values that name
 * the promoted company, by the two field shapes every plugin uses
 * (`companyId`, `companyIds[]`).
 *
 * This REPORTS. It does not decide, and it does not move anything: the values
 * are `Record<string, unknown>` whose meaning only the owning plugin knows.
 * Client-scoped installs travel with their client; agency-scoped installs are
 * shared and need the plugin's own split.
 */
function scanPluginData(
  state: PortalState,
  agencyId: string,
  companyId: string,
  movingClientIds: Set<string>,
): PromotionPluginDataLine[] {
  const rows: PromotionPluginDataLine[] = [];
  for (const [installId, install] of Object.entries(state.pluginInstalls ?? {})) {
    const record = asRecord(install);
    if (!record || stringField(record, "agencyId") !== agencyId) continue;
    const clientId = stringField(record, "clientId");
    const slice = asRecord((state.pluginData ?? {})[installId]);
    if (!slice) continue;
    for (const [key, value] of Object.entries(slice)) {
      const { exclusive, shared } = countCompanyMentions(value, companyId);
      if (exclusive + shared === 0) continue;
      rows.push({
        installId,
        pluginId: stringField(record, "pluginId") ?? "unknown",
        scope: clientId ? "client" : "agency",
        clientId,
        followsMovingClient: clientId !== undefined && movingClientIds.has(clientId),
        key,
        exclusive,
        shared,
        // Only an agency-scoped install is shared between brands. A
        // client-scoped one moves wholesale with its client.
        requiresPluginHook: clientId === undefined,
      });
    }
  }
  return rows;
}

function countCompanyMentions(value: unknown, companyId: string): { exclusive: number; shared: number } {
  let exclusive = 0;
  let shared = 0;
  let nodes = 0;
  const visit = (node: unknown, depth: number): void => {
    if (nodes >= PLUGIN_SCAN_MAX_NODES || depth > PLUGIN_SCAN_MAX_DEPTH) return;
    if (!node || typeof node !== "object") return;
    nodes += 1;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const record = node as Record<string, unknown>;
    // `companyId` and `companyIds` are checked independently: `Lead` carries
    // both, and a lead named by either is a lead this promotion touches.
    const single = companyLink(record, companyId, false);
    const many = companyLink(record, companyId, true);
    if (single === "exclusive" || many === "exclusive") exclusive += 1;
    else if (many === "shared") shared += 1;
    for (const inner of Object.values(record)) visit(inner, depth + 1);
  };
  visit(value, 0);
  return { exclusive, shared };
}
