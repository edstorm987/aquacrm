import "server-only";

import { getState, mutate } from "./storage";
import { getClientForAgency } from "./tenants";
import { logActivity } from "./activity";
import { withPortalStateTransaction } from "./productWorkspaceCoordinator";
import { normaliseIdentityPhone } from "@/lib/server/identityResolution";
import type { ErasureReviewRequired, ErasureSubject } from "@/built-ins/runtime/_types";
import type { PortalState } from "./types";

/**
 * Permanent, unrecoverable erasure of a client and everything belonging to it.
 *
 * This is the "right to be forgotten" tool — for a data-subject erasure
 * request, or simply removing a record for good. Unlike archiving (which
 * hides), this destroys.
 *
 * ── Not "nuke everything": the disposition policy ───────────────────────────
 *
 * Erasure is not a blanket delete. Deleting *everything* stamped with a client
 * would destroy records you are legally entitled or obliged to keep — finance,
 * contracts, deliverable proof — leaving you unable to defend a claim
 * (GDPR Art. 17(3)(e)) or in breach of financial-record retention law. So data
 * is handled by one of three dispositions (see the erasure-disposition-policy
 * in `docs/development/plans/plugin-data-erasure.md`):
 *
 *   • DELETE   — raw comms, marketing PII, contact handles. Removed outright.
 *   • RETAIN   — finance, contracts, deliverable proof, and the erasure audit.
 *                Excluded from the sweep; survives as the legal-defence record.
 *   • (plugin-defined) — a plugin with an `onEraseClient` hook decides for
 *                itself: typically strip the PII, keep a de-identified payment
 *                record. The hook takes precedence over the flag below.
 *
 * For plugin-owned data (`pluginData[installId]`), disposition comes from the
 * plugin manifest: an `onEraseClient` hook (authoritative) or its
 * `dataDisposition` flag ("retain" excludes it; default "delete" sweeps it).
 * For top-level `PortalState` collections, `RETAIN_COLLECTIONS` names the ones
 * held under legal retention. Everything else stamped with the `clientId` is
 * deleted, so a new collection is covered automatically.
 *
 * ── What is deliberately kept ───────────────────────────────────────────────
 *
 * The client record itself is always deleted (its name/PII is the identity the
 * subject is entitled to lose) — so even retained finance keeps only the random
 * `clientId` token, not the person. And one audit entry survives the wipe,
 * recording that a lawful erasure occurred, by whom, and the disposition of
 * each area. It names no personal data; it is the proof of erasure.
 */

/**
 * Top-level `PortalState` collections held under a legal-retention obligation
 * (deliverable proof / delivery record). Excluded from the erasure sweep — the
 * client record's own PII still goes, so what remains is de-identified. Finance
 * and contracts are plugin-owned (agency-finance / fulfillment, flagged
 * `dataDisposition: "retain"`) or not `clientId`-stamped at the top level.
 */
/**
 * ⚠ De-identification here covers IDENTIFIERS, not free text.
 *
 * The justification above — "the client record's own PII still goes, so what
 * remains is de-identified" — is true of the ids that point at a person. It is
 * NOT automatically true of operator-typed prose.
 *
 * `ClientMilestone` carries `title` and `description`, both free text. A
 * milestone called "Onboarding call with Jane Smith" survives an erasure, and
 * once the client record is gone it is an orphaned row nobody can search back
 * to. Same rule the activity log already has written down elsewhere: **never
 * put a person's details in free text that outlives them.**
 *
 * Before adding a collection here, ask whether it carries operator-typed prose.
 * If it does, this justification does not cover it and the answer is either a
 * scrub-on-erasure hook (as ecommerce does for orders — strip the PII, keep the
 * payment record) or leaving it out of the retain set. `smoke-client-erasure`
 * pins this list so the question has to be answered deliberately.
 *
 * Whether the retained proof should ever expire at all is question Q1 in the
 * DPO pack — a legal answer, not a default this module may choose.
 */
const RETAIN_COLLECTIONS = new Set<string>(["clientMilestones"]);

/** Collections handled by the dedicated plugin sweep — skip in the generic pass. */
const PLUGIN_COLLECTIONS = new Set<string>(["pluginData", "pluginInstalls"]);

/** Collections with a dedicated pass below — skipped by the generic sweep. */
const DEDICATED_COLLECTIONS = new Set<string>(["persons", "identityResolutionReviews"]);

/**
 * Does this record name the client?
 *
 * A top-level `clientId` is the common form and was, until 2026-08-27, the only
 * one the generic sweep looked for. It is not the only one: an access GRANT and
 * an access REQUEST reference a client through `scope: { kind: "client", id }`,
 * and other records use `scope: { clientId }`. Both are nested, so both survived
 * an erasure that promises the client and their associated data are gone.
 *
 * That mattered more than a dangling id, because those records carry a
 * free-text `reason` written by a person — and people name the client in it
 * ("Granted for Acme Ltd onboarding", "I need access to Acme Ltd's files").
 * The erasure's own audit line claims it names no personal data; a surviving
 * reason field contradicted that.
 *
 * Found by the item-6 reference-integrity probe. Kept as ONE predicate so the
 * arrays pass, the records pass and the retained-count pass cannot drift apart.
 */
function recordNamesClient(record: unknown, clientId: string): boolean {
  if (!record || typeof record !== "object") return false;
  const value = record as {
    clientId?: unknown;
    scope?: { kind?: unknown; id?: unknown; clientId?: unknown } | null;
  };
  if (value.clientId === clientId) return true;
  const scope = value.scope;
  if (scope && typeof scope === "object") {
    if (scope.clientId === clientId) return true;
    if (scope.kind === "client" && scope.id === clientId) return true;
  }
  return false;
}

export type ErasureDisposition = "delete" | "retain" | "hook";

// ─── Live Supabase scrub (Phase 3) ────────────────────────────────────────
//
// A client's data also lives in live Supabase (`inbox_*`, `brand_enquiries`),
// which has no memory backend. To keep `eraseClientCompletely` testable, the
// live scrub takes an INJECTED client: production passes the real admin client
// (from the erase route, mirroring the website-enquiries hard-delete path);
// tests pass a fake that records the calls — so a test never touches live data.
// Only the minimal query surface used here is typed.

interface QueryResult<Row> { data: Row[] | null; error: { message: string } | null }
interface QueryBuilder<Row> extends PromiseLike<QueryResult<Row>> {
  select(cols: string): QueryBuilder<Row>;
  delete(): QueryBuilder<Row>;
  update(values: Record<string, unknown>): QueryBuilder<Row>;
  eq(col: string, val: string | number): QueryBuilder<Row>;
  in(col: string, vals: readonly string[]): QueryBuilder<Row>;
}
export interface LiveScrubClient {
  from<Row = { id: string }>(table: string): QueryBuilder<Row>;
  rpc<Row = Record<string, unknown>>(
    fn: string,
    args: Record<string, string | number | boolean | null>,
  ): PromiseLike<QueryResult<Row>>;
}

/** The no-PII record of the live scrub, kept in the audit entry as proof. */
export interface LiveErasureStub {
  inboxConversations: number;
  inboxConversationsFrom?: string;
  inboxConversationsTo?: string;
  inboxMessages: number;
  inboxContactIdentities: number;
  enquiriesAnonymised: number;
  /** Subset whose enquirer was `resolved` AS the client → PII stripped, not just unlinked. */
  enquiriesPiiStripped: number;
  /** Enquiries preserved because the client route was not exact identity authority. */
  enquiriesReviewRequired: {
    legacyUnscoped: number;
    sharedIdentity: number;
  };
  errors?: string[];
}

export interface ClientErasureResult {
  /** True only when every required scrub completed and the local record is gone. */
  completed: boolean;
  clientName: string;
  recordsErased: number;
  /** Per-area tally, for the confirmation summary and the audit note. Keys are
   * prefixed by disposition: `deleted:*`, `retained:*`, `anonymised:*`, `hook:*`. */
  collections: Record<string, number>;
  /** Preserved ambiguous records, reported without identity values. */
  reviewRequired: ErasureReviewRequired[];
  /** The live-table scrub summary (present when a Supabase client was passed). */
  live?: LiveErasureStub;
}

/**
 * Recursively remove any object stamped with `clientId` from a value, in
 * place. Returns how many were removed.
 */
function pruneClientId(value: unknown, clientId: string): number {
  if (Array.isArray(value)) {
    let removed = 0;
    for (let i = value.length - 1; i >= 0; i--) {
      const el = value[i];
      if (el && typeof el === "object") {
        if ((el as { clientId?: string }).clientId === clientId) {
          value.splice(i, 1);
          removed++;
          continue;
        }
        removed += pruneClientId(el, clientId);
      }
    }
    return removed;
  }
  if (value && typeof value === "object") {
    let removed = 0;
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const child = (value as Record<string, unknown>)[key];
      if (child && typeof child === "object") {
        if ((child as { clientId?: string }).clientId === clientId) {
          delete (value as Record<string, unknown>)[key];
          removed++;
          continue;
        }
        removed += pruneClientId(child, clientId);
      }
    }
    return removed;
  }
  return 0;
}

/** Read-only twin of pruneClientId — counts matches without mutating. */
function countClientIdMatches(value: unknown, clientId: string): number {
  if (Array.isArray(value)) {
    let n = 0;
    for (const el of value) {
      if (el && typeof el === "object") {
        if ((el as { clientId?: string }).clientId === clientId) n++;
        else n += countClientIdMatches(el, clientId);
      }
    }
    return n;
  }
  if (value && typeof value === "object") {
    let n = 0;
    for (const child of Object.values(value as Record<string, unknown>)) {
      if (child && typeof child === "object") {
        if ((child as { clientId?: string }).clientId === clientId) n++;
        else n += countClientIdMatches(child, clientId);
      }
    }
    return n;
  }
  return 0;
}

/** Count clientId-stamped entries in a plugin storage slice (top-level + nested). */
function countSliceMatches(slice: Record<string, unknown>, clientId: string): number {
  let n = 0;
  for (const val of Object.values(slice)) {
    if (val && typeof val === "object" && (val as { clientId?: string }).clientId === clientId) n++;
    else n += countClientIdMatches(val, clientId);
  }
  return n;
}

/**
 * Who is being erased — resolved ONCE, before anything is deleted, and handed
 * to every `onEraseClient` hook.
 *
 * Address/phone values are collected as REVIEW EVIDENCE only. They are not
 * deletion authority: inboxes, switchboards and legacy imports can legitimately
 * be shared by several people or client workspaces. Hooks may erase only an
 * exact agency/client stamp or the reciprocal, exclusive Person lineage below.
 */
function resolveErasureSubject(agencyId: string, clientId: string): ErasureSubject {
  const client = getClientForAgency(agencyId, clientId);
  const metadata = (client?.metadata ?? {}) as Record<string, unknown>;
  const linked = Array.isArray(metadata.linkedContacts) ? metadata.linkedContacts : [];
  const state = getState();
  const candidatePerson = client?.personId ? getState().persons[client.personId] : undefined;
  const evidencePerson = candidatePerson?.agencyId === agencyId ? candidatePerson : undefined;
  // Only a reciprocal, agency-scoped Client <-> Person edge may become an
  // exact erasure root. A caller-editable metadata id is never promoted here.
  const person = candidatePerson?.agencyId === agencyId
    && candidatePerson.facets.clientIds?.includes(clientId)
    ? candidatePerson
    : undefined;
  const evidenceEmails = [
    client?.ownerEmail,
    metadata.portalLoginEmail,
    metadata.clientEmail,
    ...(evidencePerson?.emails ?? []).flatMap(entry => [entry.value, entry.raw]),
    ...linked.map(entry => (entry as { email?: unknown } | null)?.email),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map(value => value.trim().toLowerCase());
  const evidencePhones = [
    metadata.phone,
    metadata.contactPhone,
    metadata.clientPhone,
    ...(evidencePerson?.phones ?? []).flatMap(entry => [entry.value, entry.raw]),
    ...linked.map(entry => (entry as { phone?: unknown } | null)?.phone),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map(value => normaliseIdentityPhone(value))
    .filter(Boolean);

  const emails = Array.from(new Set(evidenceEmails));
  const phones = Array.from(new Set(evidencePhones));
  const wantedEmails = new Set(emails);
  const wantedPhones = new Set(phones);
  const sharedEmails = new Set<string>();
  const sharedPhones = new Set<string>();

  const addSharedClientEvidence = (candidate: typeof client) => {
    const candidateMetadata = (candidate?.metadata ?? {}) as Record<string, unknown>;
    const candidateLinked = Array.isArray(candidateMetadata.linkedContacts) ? candidateMetadata.linkedContacts : [];
    for (const value of [
      candidate?.ownerEmail,
      candidateMetadata.portalLoginEmail,
      candidateMetadata.clientEmail,
      ...candidateLinked.map(entry => (entry as { email?: unknown } | null)?.email),
    ]) {
      if (typeof value !== "string") continue;
      const canonical = value.trim().toLowerCase();
      if (wantedEmails.has(canonical)) sharedEmails.add(canonical);
    }
    for (const value of [
      candidateMetadata.phone,
      candidateMetadata.contactPhone,
      candidateMetadata.clientPhone,
      ...candidateLinked.map(entry => (entry as { phone?: unknown } | null)?.phone),
    ]) {
      if (typeof value !== "string") continue;
      const canonical = normaliseIdentityPhone(value);
      if (canonical && wantedPhones.has(canonical)) sharedPhones.add(canonical);
    }
  };

  // A second Client pointing at this Person is enough to make the identity
  // shared, even when old data is missing the reciprocal Person facet. Treat
  // that inconsistency as a preserve signal; never turn it into delete power.
  const personReferencedByOtherClient = Boolean(evidencePerson && Object.values(state.clients).some(candidate =>
    candidate.agencyId === agencyId
    && candidate.id !== clientId
    && candidate.personId === evidencePerson.id));
  for (const candidate of Object.values(state.clients)) {
    if (candidate.agencyId === agencyId && candidate.id !== clientId) addSharedClientEvidence(candidate);
  }
  for (const candidate of Object.values(state.persons)) {
    if (candidate.agencyId !== agencyId) continue;
    const sharesTargetRelationship = candidate.id === evidencePerson?.id
      && ((candidate.facets.clientIds ?? []).some(id => id !== clientId)
        || personReferencedByOtherClient
        || STANDALONE_PERSON_CLASSIFICATIONS.has(candidate.classification));
    for (const entry of candidate.emails) {
      const canonical = entry.value.trim().toLowerCase();
      if (wantedEmails.has(canonical) && (candidate.id !== evidencePerson?.id || sharesTargetRelationship)) {
        sharedEmails.add(canonical);
      }
    }
    for (const entry of candidate.phones) {
      const canonical = normaliseIdentityPhone(entry.value);
      if (canonical && wantedPhones.has(canonical)
        && (entry.shared === true || candidate.id !== evidencePerson?.id || sharesTargetRelationship)) {
        sharedPhones.add(canonical);
      }
    }
  }

  const personShared = Boolean(person && (
    (person.facets.clientIds ?? []).some(id => id !== clientId)
    || personReferencedByOtherClient
    || STANDALONE_PERSON_CLASSIFICATIONS.has(person.classification)
  ));
  const exclusivePerson = person && !personShared ? person : undefined;
  const reviewRequired: ErasureReviewRequired[] = [];
  const reverseOnlyPeople = Object.values(state.persons).filter(candidate =>
    candidate.agencyId === agencyId
    && candidate.id !== person?.id
    && (candidate.facets.clientIds ?? []).includes(clientId));
  const legacyPersonReviewIds = new Set<string>();
  const sharedPersonReviewIds = new Set<string>();
  if (evidencePerson && !person) {
    const shared = personReferencedByOtherClient
      || STANDALONE_PERSON_CLASSIFICATIONS.has(evidencePerson.classification);
    (shared ? sharedPersonReviewIds : legacyPersonReviewIds).add(evidencePerson.id);
  }
  if (personShared && person) sharedPersonReviewIds.add(person.id);
  for (const candidate of reverseOnlyPeople) {
    const shared = STANDALONE_PERSON_CLASSIFICATIONS.has(candidate.classification)
      || Object.values(state.clients).some(other =>
        other.agencyId === agencyId && other.id !== clientId && other.personId === candidate.id);
    (shared ? sharedPersonReviewIds : legacyPersonReviewIds).add(candidate.id);
  }
  for (const id of sharedPersonReviewIds) legacyPersonReviewIds.delete(id);
  if (legacyPersonReviewIds.size > 0) reviewRequired.push({
    system: "person-identity",
    reason: "legacy-unscoped",
    records: legacyPersonReviewIds.size,
  });
  if (sharedPersonReviewIds.size > 0) reviewRequired.push({
    system: "person-identity",
    reason: "shared-identity",
    records: sharedPersonReviewIds.size,
  });
  return {
    // Kept for old third-party hook shapes, but intentionally empty so an old
    // address-deleting hook fails closed rather than deleting a shared record.
    emails: [],
    phones: [],
    exactOwnership: {
      agencyId,
      clientId,
      ...(person ? { personId: person.id } : {}),
      ...(exclusivePerson?.facets.leadId ? { leadId: exclusivePerson.facets.leadId } : {}),
      ...(exclusivePerson?.facets.contactId ? { contactId: exclusivePerson.facets.contactId } : {}),
      personShared,
    },
    identityEvidence: {
      emails,
      phones,
      sharedEmails: [...sharedEmails],
      sharedPhones: [...sharedPhones],
    },
    reviewRequired,
    name: client?.name,
    ...(exclusivePerson ? {
      personId: exclusivePerson.id,
      ...(exclusivePerson.facets.leadId ? { leadId: exclusivePerson.facets.leadId } : {}),
      ...(exclusivePerson.facets.contactId ? { contactId: exclusivePerson.facets.contactId } : {}),
    } : {}),
    metadata,
  };
}

/**
 * Classifications that stand on their own: the person has a lawful basis for
 * being on file that has nothing to do with any client workspace. Erasing a
 * client must never strip a supplier's contact details as collateral.
 */
const STANDALONE_PERSON_CLASSIFICATIONS = new Set<string>(["supplier", "partnership", "marketer"]);

/**
 * Person records — ANONYMISE IF ORPHANED (Ed's decision, 2026-08-19; see the
 * erasure plan).
 *
 * A `Person` carries no `clientId`, so neither the generic sweep nor
 * `pruneClientId` can reach it — the email/phone of a client whose relationship
 * began as a website enquiry would otherwise survive erasure untouched.
 *
 * Deleting the person outright would be wrong: `facets.clientIds` is an ARRAY
 * (one buyer may hold several client workspaces) and a supplier/partnership/
 * marketer exists independently of any client. So this is the same split
 * `brand_enquiries` already uses:
 *
 *   1. ALWAYS unlink — drop the erased `clientId` from `facets.clientIds`, and
 *      clear `relationshipId` when it pointed at this client's relationship.
 *   2. THEN strip the identifiers ONLY if the person is now orphaned: no other
 *      client workspace AND not a standalone role. `facets`, `classification`,
 *      `classificationHistory` and the record entries' structure are KEPT — so
 *      what they DID survives, de-identified. Changing what somebody IS must
 *      never destroy what they did.
 */
function anonymiseOrphanedPersons(
  state: PortalState,
  agencyId: string,
  clientId: string,
  exactPersonId: string | undefined,
  relationshipId: string | undefined,
  collections: Record<string, number>,
): void {
  let unlinked = 0;
  let anonymised = 0;

  for (const person of Object.values(state.persons)) {
    if (!person || person.agencyId !== agencyId) continue;
    const exactPerson = Boolean(exactPersonId && person.id === exactPersonId);
    const clientIds = person.facets?.clientIds ?? [];
    const heldThisClient = clientIds.includes(clientId);
    const heldThisRelationship = exactPerson
      && relationshipId !== undefined
      && person.relationshipId === relationshipId;
    if (!heldThisClient && !heldThisRelationship) continue;

    // A reverse-only legacy facet is not enough authority to anonymise the
    // Person, but the exact disappearing client id must not remain dangling.
    // Remove only that edge and leave every identity/history field untouched;
    // resolveErasureSubject has already surfaced the record for review.
    if (!exactPerson) {
      person.facets = { ...person.facets, clientIds: clientIds.filter(id => id !== clientId) };
      person.updatedAt = Date.now();
      unlinked += 1;
      continue;
    }

    // 1. Always unlink — unconditional, whatever else is true of them.
    // Repair missing reciprocal facets defensively while deciding whether the
    // Person is orphaned. A surviving Client's authoritative personId pointer
    // is a preserve signal even if legacy Person.clientIds drifted.
    const referencingClientIds = Object.values(state.clients)
      .filter(candidate => candidate.agencyId === agencyId
        && candidate.id !== clientId
        && candidate.personId === person.id)
      .map(candidate => candidate.id);
    const remaining = Array.from(new Set([
      ...clientIds.filter(id => id !== clientId),
      ...referencingClientIds,
    ]));
    person.facets = { ...person.facets, clientIds: remaining };
    if (heldThisRelationship) person.relationshipId = undefined;
    person.updatedAt = Date.now();
    unlinked++;

    // 2. Strip identifiers only when the erased client was their ONLY basis.
    const orphaned = remaining.length === 0
      && !STANDALONE_PERSON_CLASSIFICATIONS.has(person.classification);
    if (!orphaned) continue;

    person.emails = [];
    person.phones = [];
    person.name = undefined;
    person.company = undefined;
    person.jobTitle = undefined;
    person.notes = undefined;
    person.customFields = undefined;
    // The meetings/calls/notes THEY HAD are kept as de-identified facts: the
    // entry, its kind and when it happened survive; the free text goes.
    person.record = (person.record ?? []).map(entry => ({
      ...entry,
      summary: "",
      body: undefined,
      location: undefined,
      outcome: undefined,
    }));
    anonymised++;
  }

  // Counts only — the audit entry must never name a person.
  if (unlinked) collections["unlinked:persons"] = unlinked;
  if (anonymised) collections["anonymised:persons"] = anonymised;
}

/**
 * Identity-resolution reviews — ANONYMISE, split by resolution.
 *
 * `IdentityResolutionReview` is the in-memory sibling of a `brand_enquiries`
 * row: it holds the enquirer's `name`/`email`/`phone`/`company` and links to a
 * client through **`selectedClientId`**, NOT `clientId` — so the generic
 * `record.clientId === clientId` sweep never saw it and the enquirer's details
 * survived erasure untouched.
 *
 * Deliberately the SAME split the live `brand_enquiries` scrub already uses
 * (and which the auditor has passed) rather than a second pattern:
 *
 *   • ALWAYS drop the client link — `selectedClientId` and the resolution's
 *     `clientId`/`clientName`/`clientContactId`.
 *   • Strip the enquirer's PII ONLY when the review resolved them AS the erased
 *     client. A separate party merely matched against this client keeps their
 *     own record; only the link goes.
 *
 * `resolution.explanation` is cleared with the rest: it is generated prose that
 * quotes the matched address ("Matched on jane@…"). `candidates` name other
 * client workspaces and are dropped with the resolution they justified.
 */
function anonymiseIdentityResolutionReviews(
  state: PortalState,
  agencyId: string,
  clientId: string,
  collections: Record<string, number>,
): void {
  let unlinked = 0;
  let stripped = 0;

  for (const review of Object.values(state.identityResolutionReviews ?? {})) {
    if (!review || review.agencyId !== agencyId) continue;
    const resolvedAsClient = review.selectedClientId === clientId
      || review.resolution?.clientId === clientId;
    const namesClient = resolvedAsClient
      || (review.resolution?.candidates ?? []).some(candidate => candidate.clientId === clientId);
    if (!namesClient) continue;

    // 1. Always drop the link.
    review.selectedClientId = undefined;
    if (review.resolution) {
      review.resolution = {
        ...review.resolution,
        clientId: review.resolution.clientId === clientId ? undefined : review.resolution.clientId,
        clientName: review.resolution.clientId === clientId ? undefined : review.resolution.clientName,
        clientContactId: review.resolution.clientId === clientId ? undefined : review.resolution.clientContactId,
        candidates: (review.resolution.candidates ?? []).filter(c => c.clientId !== clientId),
      };
    }
    review.updatedAt = Date.now();
    unlinked++;

    // 2. Strip the enquirer's details only when they WERE this client.
    if (!resolvedAsClient) continue;
    review.name = undefined;
    review.email = undefined;
    review.phone = undefined;
    review.company = undefined;
    review.decisionNote = undefined;
    if (review.resolution) review.resolution = { ...review.resolution, explanation: "", candidates: [] };
    stripped++;
  }

  // Counts only — the audit entry must never name anybody.
  if (unlinked) collections["unlinked:identityResolutionReviews"] = unlinked;
  if (stripped) collections["anonymised:identityResolutionReviews"] = stripped;
}

type Runtime = {
  getPlugin: typeof import("@/built-ins/runtime/_registry").getPlugin;
  makeCtx: typeof import("@/built-ins/runtime/_runtime").makeCtx;
};

class PluginErasureHookError extends Error {
  readonly originalError: unknown;

  constructor(readonly pluginId: string, cause: unknown) {
    super(`Client erasure hook failed for ${pluginId}.`);
    this.name = "PluginErasureHookError";
    this.originalError = cause;
  }
}

class PluginErasureRuntimeError extends Error {
  constructor(readonly system = "plugin-runtime") {
    super("Client erasure plugin runtime is unavailable.");
    this.name = "PluginErasureRuntimeError";
  }
}

function compactReviewRequired(items: readonly ErasureReviewRequired[]): ErasureReviewRequired[] {
  const counts = new Map<string, ErasureReviewRequired>();
  for (const item of items) {
    if (!Number.isFinite(item.records) || item.records <= 0) continue;
    const key = `${item.system}\u0000${item.reason}`;
    const prior = counts.get(key);
    if (prior) prior.records += Math.floor(item.records);
    else counts.set(key, { ...item, records: Math.floor(item.records) });
  }
  return [...counts.values()].sort((a, b) =>
    a.system.localeCompare(b.system) || a.reason.localeCompare(b.reason));
}

/** Load the plugin runtime, or null if unavailable (e.g. a minimal context). */
async function loadRuntime(): Promise<Runtime | null> {
  try {
    const [{ getPlugin }, { makeCtx }] = await Promise.all([
      import("@/built-ins/runtime/_registry"),
      import("@/built-ins/runtime/_runtime"),
    ]);
    return { getPlugin, makeCtx };
  } catch {
    return null;
  }
}

/**
 * Resolve each installed plugin's erasure disposition and run any bespoke
 * `onEraseClient` hook (before the generic sweep, so a hook can clean
 * identifiers the value-scan can't reach — e.g. data held in storage keys).
 * Returns an installId → disposition map the generic sweep obeys.
 */
async function resolveDispositionsAndRunHooks(
  agencyId: string,
  clientId: string,
  collections: Record<string, number>,
): Promise<{
  dispositions: Map<string, ErasureDisposition>;
  reviewRequired: ErasureReviewRequired[];
  subject: ErasureSubject;
}> {
  const map = new Map<string, ErasureDisposition>();
  const subject = resolveErasureSubject(agencyId, clientId);
  const runtime = await loadRuntime();
  // Without the runtime we cannot know which agency-scoped slices need a
  // bespoke hook (including indexes whose keys contain PII). Never silently
  // fall through to the generic clientId sweep and claim a complete erasure.
  if (!runtime) throw new PluginErasureRuntimeError();

  // Agency-scoped installs for this agency, plus this-client-scoped installs.
  const installs = Object.values(getState().pluginInstalls).filter(
    i => i.agencyId === agencyId && (i.clientId === undefined || i.clientId === clientId),
  );

  for (const install of installs) {
    const plugin = runtime.getPlugin(install.pluginId);
    if (!plugin) {
      // A missing manifest means its retention/hook policy is unknowable.
      // Treat registry drift as a retryable failure, never as permission to
      // delete a client-scoped slice or partially prune an agency slice.
      throw new PluginErasureRuntimeError(`plugin:${install.pluginId}`);
    }
    if (plugin.onEraseClient) {
      map.set(install.id, "hook");
      try {
        await plugin.onEraseClient(runtime.makeCtx(install), clientId, subject);
        collections[`hook:${install.pluginId}`] = 1;
      } catch (err) {
        collections[`hookError:${install.pluginId}`] = 1;
        console.error(`[clientErasure] onEraseClient failed for "${install.pluginId}"`, err);
        throw new PluginErasureHookError(install.pluginId, err);
      }
    } else if (plugin?.dataDisposition === "retain") {
      map.set(install.id, "retain");
    } else {
      map.set(install.id, "delete");
    }
  }
  const reviewRequired = compactReviewRequired(subject.reviewRequired);
  for (const item of reviewRequired) {
    collections[`review:${item.system}:${item.reason}`] = item.records;
  }
  return { dispositions: map, reviewRequired, subject };
}

/**
 * Sweep plugin-owned storage slices + install records for this client, inside a
 * mutate, honouring each install's disposition.
 */
function sweepPluginData(
  state: PortalState,
  agencyId: string,
  clientId: string,
  collections: Record<string, number>,
  dispositions: Map<string, ErasureDisposition>,
): number {
  let removed = 0;

  for (const [installId, slice] of Object.entries(state.pluginData)) {
    if (!slice || typeof slice !== "object") continue;
    const install = state.pluginInstalls[installId];
    const pid = install ? install.pluginId : installId;
    if (!install && countSliceMatches(slice as Record<string, unknown>, clientId) > 0) {
      // Without its manifest/install record we cannot know whether this slice
      // needs a bespoke scrub or a legal-retention disposition. Preserve the
      // complete transaction and require registry repair before retrying.
      throw new PluginErasureRuntimeError(`orphan-plugin-data:${installId}`);
    }
    const disposition = dispositions.get(installId) ?? "delete";

    if (disposition === "hook") continue; // the plugin's hook already handled it

    if (disposition === "retain") {
      const kept = countSliceMatches(slice as Record<string, unknown>, clientId);
      if (kept) collections[`retained:${pid}`] = (collections[`retained:${pid}`] ?? 0) + kept;
      continue;
    }

    // disposition === "delete"
    const label = `deleted:${pid}`;
    if (install && install.agencyId === agencyId && install.clientId === clientId) {
      // Client-scoped install — the whole slice is this client's. Drop it.
      const n = Object.keys(slice).length;
      delete state.pluginData[installId];
      if (n) {
        collections[label] = (collections[label] ?? 0) + n;
        removed += n;
      }
      continue;
    }

    // Agency-scoped or orphan slice — prune only this client's objects.
    let sliceRemoved = 0;
    for (const [key, val] of Object.entries(slice as Record<string, unknown>)) {
      if (val && typeof val === "object" && (val as { clientId?: string }).clientId === clientId) {
        delete (slice as Record<string, unknown>)[key];
        sliceRemoved++;
        continue;
      }
      sliceRemoved += pruneClientId(val, clientId);
    }
    if (sliceRemoved) {
      collections[label] = (collections[label] ?? 0) + sliceRemoved;
      removed += sliceRemoved;
    }
  }

  // Install records: delete only DELETE-disposition installs scoped to this
  // client. Retained/hooked installs keep their record so the retained data
  // stays coherent; agency-scoped installs are shared and never removed.
  for (const [id, install] of Object.entries(state.pluginInstalls)) {
    if (install.agencyId !== agencyId || install.clientId !== clientId) continue;
    if ((dispositions.get(id) ?? "delete") === "delete") {
      delete state.pluginInstalls[id];
      collections["deleted:pluginInstalls"] = (collections["deleted:pluginInstalls"] ?? 0) + 1;
      removed += 1;
    }
  }

  return removed;
}

/**
 * Scrub the client's data from live Supabase, per the disposition policy:
 *
 *   • `inbox_conversations` / `inbox_messages` / `inbox_contact_identities`
 *     → DELETE (raw comms). Messages go via their conversation ids (they carry
 *     no `client_id`). `inbox_channel_connections` are agency-level with no
 *     client PII → untouched. A no-PII stub (count + date span) is returned for
 *     the audit — proof the comms existed and were erased.
 *   • `brand_enquiries` (`metadata.clientId`) → ANONYMISE. Always drop the
 *     client link (`metadata.clientId` + `identityResolution.clientId`). Only
 *     when identity resolution `resolved` the enquirer AS this client do we also
 *     strip the enquirer's PII (name/email/phone/message + replies/calls) — a
 *     separate party merely tagged to the client keeps their own record.
 *
 * Best-effort + idempotent: a per-table failure is recorded in the stub and the
 * scrub continues. The local transaction does not begin unless every live
 * table reports success, and each live delete/anonymisation is safe to re-run.
 * Finance/contracts/deliverables are NOT touched here — confirmed to be RETAIN.
 */
async function scrubClientLiveTables(
  supabase: LiveScrubClient,
  agencyId: string,
  clientId: string,
  collections: Record<string, number>,
): Promise<LiveErasureStub> {
  const stub: LiveErasureStub = {
    inboxConversations: 0, inboxMessages: 0, inboxContactIdentities: 0,
    enquiriesAnonymised: 0, enquiriesPiiStripped: 0,
    enquiriesReviewRequired: { legacyUnscoped: 0, sharedIdentity: 0 },
  };
  const fail = (where: string, msg: string) => {
    (stub.errors ??= []).push(`${where}: ${msg}`);
    collections[`liveError:${where}`] = 1;
    console.error(`[clientErasure] live scrub ${where} failed: ${msg}`);
  };

  // ── inbox: atomic exact client-owned identity → conversation → message chain ──
  // `inbox_conversations` has no client_id. The service-role-only RPC locks and
  // validates the complete FK chain, then deletes the still-owned identity
  // roots so PostgreSQL cascades the exact conversations/messages atomically.
  try {
    type InboxErasureRow = {
      deleted_identity_count: number;
      deleted_conversation_count: number;
      deleted_message_count: number;
      conversation_from: string | null;
      conversation_to: string | null;
    };
    const inboxResult = await supabase.rpc<InboxErasureRow>("erase_client_inbox_data", {
      p_agency_id: agencyId,
      p_client_id: clientId,
    });
    if (inboxResult.error) throw new Error(inboxResult.error.message);
    if (!inboxResult.data || inboxResult.data.length !== 1) {
      throw new Error("inbox erasure returned an ambiguous result");
    }
    const [row] = inboxResult.data;
    const counts = [row.deleted_identity_count, row.deleted_conversation_count, row.deleted_message_count];
    if (counts.some(value => !Number.isSafeInteger(value) || value < 0)) {
      throw new Error("inbox erasure returned invalid counts");
    }
    if ((row.conversation_from !== null && typeof row.conversation_from !== "string")
      || (row.conversation_to !== null && typeof row.conversation_to !== "string")) {
      throw new Error("inbox erasure returned invalid date bounds");
    }

    stub.inboxContactIdentities = row.deleted_identity_count;
    stub.inboxConversations = row.deleted_conversation_count;
    stub.inboxMessages = row.deleted_message_count;
    stub.inboxConversationsFrom = row.conversation_from ?? undefined;
    stub.inboxConversationsTo = row.conversation_to ?? undefined;
    if (stub.inboxContactIdentities) {
      collections["deleted:inbox_contact_identities"] = stub.inboxContactIdentities;
    }
    if (stub.inboxConversations) collections["deleted:inbox_conversations"] = stub.inboxConversations;
    if (stub.inboxMessages) collections["deleted:inbox_messages"] = stub.inboxMessages;
  } catch (err) {
    fail("inbox", err instanceof Error ? err.message : String(err));
  }

  // ── brand_enquiries: anonymise, split by identity resolution ──
  try {
    const routedRes = await supabase
      .from<{ id: string; metadata: Record<string, unknown> | null }>("brand_enquiries")
      .select("id, metadata").eq("agency_id", agencyId).eq("metadata->>clientId", clientId);
    if (routedRes.error) throw new Error(routedRes.error.message);
    const resolvedRes = await supabase
      .from<{ id: string; metadata: Record<string, unknown> | null }>("brand_enquiries")
      .select("id, metadata").eq("agency_id", agencyId)
      .eq("metadata->identityResolution->>clientId", clientId);
    if (resolvedRes.error) throw new Error(resolvedRes.error.message);
    const rows = new Map([
      ...(routedRes.data ?? []),
      ...(resolvedRes.data ?? []),
    ].map(row => [row.id, row]));
    for (const row of rows.values()) {
      const metadata: Record<string, unknown> = row.metadata && typeof row.metadata === "object" ? { ...row.metadata } : {};
      const ir = metadata.identityResolution && typeof metadata.identityResolution === "object"
        ? { ...(metadata.identityResolution as Record<string, unknown>) } : undefined;
      const routedAsClient = metadata.clientId === clientId;
      const identityNamesClient = ir?.clientId === clientId;
      // Site routing and identity resolution are independent. A top-level
      // route to A is enough to unlink A, but only a completed nested identity
      // resolution to A may authorise stripping the enquirer's PII. A nested
      // resolution to B belongs to B and must survive A's erasure.
      const resolvedAsClient = ir?.status === "resolved" && identityNamesClient;
      if (!resolvedAsClient) {
        const resolvedAsAnotherClient = ir?.status === "resolved"
          && typeof ir.clientId === "string"
          && ir.clientId.length > 0
          && ir.clientId !== clientId;
        if (resolvedAsAnotherClient) stub.enquiriesReviewRequired.sharedIdentity++;
        else stub.enquiriesReviewRequired.legacyUnscoped++;
      }

      // Drop only the exact target links. In either direction the other link
      // may legitimately belong to a different Client and must survive.
      if (routedAsClient) {
        delete metadata.clientId;
        delete metadata.clientLinkedAt;
      }
      if (ir) {
        if (identityNamesClient) {
          delete ir.clientId;
          delete ir.clientName;
        }
        metadata.identityResolution = ir;
      }

      const update: Record<string, unknown> = { metadata };
      if (resolvedAsClient) {
        // The enquirer IS the erased client → strip their PII too.
        update.name = null; update.email = null; update.phone = null;
        update.contact_method = null; update.message = null; update.source_url = null;
        delete metadata.replies; delete metadata.calls; delete metadata.formCapture;
        stub.enquiriesPiiStripped++;
      }
      const upd = await supabase.from("brand_enquiries").update(update)
        .eq("agency_id", agencyId).eq("id", row.id);
      if (upd.error) throw new Error(`update ${row.id}: ${upd.error.message}`);
      stub.enquiriesAnonymised++;
    }
    if (stub.enquiriesAnonymised) collections["anonymised:brand_enquiries"] = stub.enquiriesAnonymised;
  } catch (err) {
    fail("brand_enquiries", err instanceof Error ? err.message : String(err));
  }

  return stub;
}

export async function eraseClientCompletely(input: {
  agencyId: string;
  clientId: string;
  actorUserId: string;
  actorEmail?: string;
  /** Live Supabase client for the `inbox_*` / `brand_enquiries` scrub. When
   * omitted (e.g. memory tests), only in-memory state is erased. */
  supabase?: LiveScrubClient;
}): Promise<ClientErasureResult | null> {
  const client = getClientForAgency(input.agencyId, input.clientId);
  if (!client) return null;

  const clientName = client.name;
  const collections: Record<string, number> = {};

  // Live systems go first. Their operations are idempotent, while deleting the
  // local client first used to remove the only normal route to retry a partial
  // failure. A failed live attempt leaves the client and all local records in
  // place and records only de-identified per-system outcomes for the retry.
  let live: LiveErasureStub | undefined;
  let liveReviewRequired: ErasureReviewRequired[] = [];
  if (input.supabase) {
    live = await scrubClientLiveTables(input.supabase, input.agencyId, input.clientId, collections);
    liveReviewRequired = compactReviewRequired([
      ...(live.enquiriesReviewRequired.legacyUnscoped ? [{
        system: "brand-enquiries",
        reason: "legacy-unscoped" as const,
        records: live.enquiriesReviewRequired.legacyUnscoped,
      }] : []),
      ...(live.enquiriesReviewRequired.sharedIdentity ? [{
        system: "brand-enquiries",
        reason: "shared-identity" as const,
        records: live.enquiriesReviewRequired.sharedIdentity,
      }] : []),
    ]);
    for (const item of liveReviewRequired) {
      collections[`review:${item.system}:${item.reason}`] = item.records;
    }
    if (live.errors?.length) {
      const failedSystems = live.errors.map(error => error.split(":", 1)[0]);
      logActivity({
        agencyId: input.agencyId,
        clientId: input.clientId,
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
        category: "tenant",
        action: "client.erasure_failed",
        message: "Client erasure is incomplete and can be retried; no local client data was deleted.",
        metadata: {
          clientId: input.clientId,
          failedSystems,
          collections,
          live: { ...live, errors: undefined },
        },
      });
      return { completed: false, clientName, recordsErased: 0, collections, reviewRequired: liveReviewRequired, live };
    }
  }
  const committedCollections = { ...collections };

  // Every local/plugin mutation shares one durable transaction. Plugin storage
  // `runExclusive` calls nest into this boundary, so a late hook failure rolls
  // back earlier hooks and the generic sweep together.
  try {
    return await withPortalStateTransaction(
      // Share the public-funnel identity lane. Otherwise a capture could pass
      // its global user check while this erasure concurrently decides that the
      // same generated lead is unreferenced, producing a dangling capture.
      "public-funnel:anonymous-lead-capture",
      async (): Promise<ClientErasureResult | null> => {
        const lockedClient = getClientForAgency(input.agencyId, input.clientId);
        if (!lockedClient) return null;
        let recordsErased = 0;
        const resolved = await resolveDispositionsAndRunHooks(
          input.agencyId,
          input.clientId,
          collections,
        );
        const reviewRequired = compactReviewRequired([
          ...resolved.reviewRequired,
          ...liveReviewRequired,
        ]);
        for (const item of reviewRequired) {
          collections[`review:${item.system}:${item.reason}`] = item.records;
        }

        mutate(state => {
          // Plugin-owned storage — swept before the top-level pass so client-scoped
          // install ids are still resolvable.
          recordsErased += sweepPluginData(
            state,
            input.agencyId,
            input.clientId,
            collections,
            resolved.dispositions,
          );

          // Person records — unlink always, strip identifiers only when orphaned.
          anonymiseOrphanedPersons(
            state,
            input.agencyId,
            input.clientId,
            resolved.subject.exactOwnership.personId,
            lockedClient.relationshipId,
            collections,
          );

          // Identity-resolution reviews — links to a client via `selectedClientId`,
          // which the generic clientId sweep cannot see.
          anonymiseIdentityResolutionReviews(state, input.agencyId, input.clientId, collections);

          for (const [collectionName, collection] of Object.entries(state as unknown as Record<string, unknown>)) {
            if (!collection) continue;
            if (PLUGIN_COLLECTIONS.has(collectionName)) continue;
            if (DEDICATED_COLLECTIONS.has(collectionName)) continue;

            if (RETAIN_COLLECTIONS.has(collectionName)) {
              let kept = 0;
              if (Array.isArray(collection)) {
                kept = collection.filter(e => recordNamesClient(e, input.clientId)).length;
              } else if (typeof collection === "object") {
                kept = Object.values(collection as Record<string, unknown>)
                  .filter(r => recordNamesClient(r, input.clientId)).length;
              }
              if (kept) collections[`retained:${collectionName}`] = kept;
              continue;
            }

            if (Array.isArray(collection)) {
              const before = collection.length;
              const kept = collection.filter(entry => !recordNamesClient(entry, input.clientId));
              if (kept.length !== before) {
                (state as unknown as Record<string, unknown>)[collectionName] = kept;
                const droppedCount = before - kept.length;
                collections[`deleted:${collectionName}`] = droppedCount;
                recordsErased += droppedCount;
              }
              continue;
            }

            if (typeof collection === "object") {
              let droppedCount = 0;
              for (const [id, record] of Object.entries(collection as Record<string, unknown>)) {
                if (recordNamesClient(record, input.clientId)) {
                  delete (collection as Record<string, unknown>)[id];
                  droppedCount++;
                }
              }
              if (droppedCount) {
                collections[`deleted:${collectionName}`] = droppedCount;
                recordsErased += droppedCount;
              }
            }
          }

          if (state.clients[input.clientId]) {
            delete state.clients[input.clientId];
            collections["deleted:clients"] = (collections["deleted:clients"] ?? 0) + 1;
            recordsErased += 1;
          }
        });

        logActivity({
          agencyId: input.agencyId,
          actorUserId: input.actorUserId,
          actorEmail: input.actorEmail,
          category: "tenant",
          action: "client.erased",
          message: `Permanently erased a client and associated data (${recordsErased} records deleted). This cannot be undone.`,
          metadata: {
            clientId: input.clientId,
            recordsErased,
            collections,
            reviewRequired,
            live,
          },
        });

        return {
          completed: true,
          clientName: lockedClient.name,
          recordsErased,
          collections,
          reviewRequired,
          live,
        };
      },
    );
  } catch (error) {
    if (!(error instanceof PluginErasureHookError) && !(error instanceof PluginErasureRuntimeError)) throw error;
    const failedSystem = error instanceof PluginErasureHookError ? error.pluginId : error.system;
    const failedHooks = [failedSystem];
    const failureCollections = {
      ...committedCollections,
      [`hookError:${failedSystem}`]: 1,
    };
    logActivity({
      agencyId: input.agencyId,
      clientId: input.clientId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      category: "tenant",
      action: "client.erasure_failed",
      message: "Client erasure is incomplete and can be retried; the local client record was retained.",
      metadata: {
        clientId: input.clientId,
        failedSystems: failedHooks.map(id => `plugin:${id}`),
        collections: failureCollections,
        live,
      },
    });
    return {
      completed: false,
      clientName,
      recordsErased: 0,
      collections: failureCollections,
      reviewRequired: liveReviewRequired,
      live,
    };
  }
}

/**
 * How many records an erasure WOULD delete, without deleting them — the "will
 * be removed" count for the confirmation, not a total footprint. Estimate:
 * retained (legal-hold) plugin data is excluded, and hook-managed plugins are
 * counted as 0 (their hook keeps the record, stripping PII in place). Live
 * tables aren't counted (they need a round-trip). Async because it resolves
 * each install's disposition through the plugin runtime.
 */
export async function previewClientErasure(agencyId: string, clientId: string): Promise<number | null> {
  const client = getClientForAgency(agencyId, clientId);
  if (!client) return null;
  let count = 0;
  const state = getState();

  for (const [collectionName, collection] of Object.entries(state as unknown as Record<string, unknown>)) {
    if (PLUGIN_COLLECTIONS.has(collectionName) || RETAIN_COLLECTIONS.has(collectionName)) continue;
    // Persons are anonymised in place, never deleted — not a "will be removed".
    if (DEDICATED_COLLECTIONS.has(collectionName)) continue;
    if (Array.isArray(collection)) {
      count += collection.filter(entry =>
        entry && typeof entry === "object" && (entry as { clientId?: string }).clientId === clientId).length;
    } else if (collection && typeof collection === "object") {
      count += Object.values(collection as Record<string, unknown>).filter(record =>
        record && typeof record === "object" && (record as { clientId?: string }).clientId === clientId).length;
    }
  }

  // Plugin-owned slices: only "delete"-disposition plugins are counted. Retain
  // and hook plugins keep their records, so they aren't "will be deleted".
  const runtime = await loadRuntime();
  for (const [installId, slice] of Object.entries(state.pluginData)) {
    if (!slice || typeof slice !== "object") continue;
    const install = state.pluginInstalls[installId];
    const plugin = install && runtime ? runtime.getPlugin(install.pluginId) : undefined;
    const disposition: ErasureDisposition = plugin?.onEraseClient ? "hook"
      : plugin?.dataDisposition === "retain" ? "retain" : "delete";
    if (disposition !== "delete") continue;
    if (install && install.agencyId === agencyId && install.clientId === clientId) {
      count += Object.keys(slice).length;
      continue;
    }
    count += countSliceMatches(slice as Record<string, unknown>, clientId);
  }

  return count + 1; // + the client record itself
}
