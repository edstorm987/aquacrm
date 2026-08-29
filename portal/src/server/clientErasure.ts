import "server-only";

import { getState, mutate } from "./storage";
import { getClientForAgency } from "./tenants";
import { logActivity } from "./activity";
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
 * A plugin usually cannot find the person by `clientId`: a funnel capture, a
 * marketing lead or a campaign email all predate the client existing, so the
 * only thing tying the record to them is the ADDRESS it was sent to or captured
 * from. The client record holds those addresses — and it is deleted moments
 * later, so this is the last moment they can be read.
 */
function resolveErasureSubject(agencyId: string, clientId: string): import("@/built-ins/runtime/_types").ErasureSubject {
  const client = getClientForAgency(agencyId, clientId);
  const metadata = (client?.metadata ?? {}) as Record<string, unknown>;
  const linked = Array.isArray(metadata.linkedContacts) ? metadata.linkedContacts : [];
  const emails = [
    client?.ownerEmail,
    metadata.portalLoginEmail,
    metadata.clientEmail,
    ...linked.map(entry => (entry as { email?: unknown } | null)?.email),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map(value => value.trim().toLowerCase());
  return { emails: Array.from(new Set(emails)), name: client?.name, metadata };
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
  relationshipId: string | undefined,
  collections: Record<string, number>,
): void {
  let unlinked = 0;
  let anonymised = 0;

  for (const person of Object.values(state.persons)) {
    if (!person || person.agencyId !== agencyId) continue;
    const clientIds = person.facets?.clientIds ?? [];
    const heldThisClient = clientIds.includes(clientId);
    const heldThisRelationship = relationshipId !== undefined && person.relationshipId === relationshipId;
    if (!heldThisClient && !heldThisRelationship) continue;

    // 1. Always unlink — unconditional, whatever else is true of them.
    const remaining = clientIds.filter(id => id !== clientId);
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
): Promise<Map<string, ErasureDisposition>> {
  const map = new Map<string, ErasureDisposition>();
  const runtime = await loadRuntime();
  if (!runtime) return map; // no runtime → generic sweep treats every slice as "delete"
  const subject = resolveErasureSubject(agencyId, clientId);

  // Agency-scoped installs for this agency, plus this-client-scoped installs.
  const installs = Object.values(getState().pluginInstalls).filter(
    i => i.agencyId === agencyId && (i.clientId === undefined || i.clientId === clientId),
  );

  for (const install of installs) {
    const plugin = runtime.getPlugin(install.pluginId);
    if (plugin?.onEraseClient) {
      map.set(install.id, "hook");
      try {
        await plugin.onEraseClient(runtime.makeCtx(install), clientId, subject);
        collections[`hook:${install.pluginId}`] = 1;
      } catch (err) {
        collections[`hookError:${install.pluginId}`] = 1;
        console.error(`[clientErasure] onEraseClient failed for "${install.pluginId}"`, err);
      }
    } else if (plugin?.dataDisposition === "retain") {
      map.set(install.id, "retain");
    } else {
      map.set(install.id, "delete");
    }
  }
  return map;
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
    // Orphan slices (no install record) default to "delete".
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
 * scrub continues (the memory erasure has already committed; deletes/anonymise
 * are safe to re-run). Finance/contracts/deliverables are NOT touched here —
 * confirmed to be RETAIN.
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
  };
  const fail = (where: string, msg: string) => {
    (stub.errors ??= []).push(`${where}: ${msg}`);
    collections[`liveError:${where}`] = 1;
    console.error(`[clientErasure] live scrub ${where} failed: ${msg}`);
  };

  // ── inbox: delete conversations + their messages + contact identities ──
  try {
    const convRes = await supabase
      .from<{ id: string; created_at?: string; last_message_at?: string }>("inbox_conversations")
      .select("id, created_at, last_message_at").eq("agency_id", agencyId).eq("client_id", clientId);
    if (convRes.error) throw new Error(convRes.error.message);
    const convs = convRes.data ?? [];
    stub.inboxConversations = convs.length;
    if (convs.length) {
      const starts = convs.map(c => c.created_at).filter(Boolean).sort() as string[];
      const ends = convs.map(c => c.last_message_at ?? c.created_at).filter(Boolean).sort() as string[];
      stub.inboxConversationsFrom = starts[0];
      stub.inboxConversationsTo = ends[ends.length - 1];

      const convIds = convs.map(c => c.id);
      const msgRes = await supabase.from("inbox_messages").delete().in("conversation_id", convIds).select("id");
      if (msgRes.error) throw new Error(`inbox_messages: ${msgRes.error.message}`);
      stub.inboxMessages = (msgRes.data ?? []).length;

      const delConv = await supabase.from("inbox_conversations").delete().eq("agency_id", agencyId).eq("client_id", clientId);
      if (delConv.error) throw new Error(`inbox_conversations delete: ${delConv.error.message}`);

      collections["deleted:inbox_conversations"] = stub.inboxConversations;
      if (stub.inboxMessages) collections["deleted:inbox_messages"] = stub.inboxMessages;
    }
  } catch (err) {
    fail("inbox", err instanceof Error ? err.message : String(err));
  }

  try {
    const identRes = await supabase.from("inbox_contact_identities").delete()
      .eq("agency_id", agencyId).eq("client_id", clientId).select("id");
    if (identRes.error) throw new Error(identRes.error.message);
    stub.inboxContactIdentities = (identRes.data ?? []).length;
    if (stub.inboxContactIdentities) collections["deleted:inbox_contact_identities"] = stub.inboxContactIdentities;
  } catch (err) {
    fail("inbox_contact_identities", err instanceof Error ? err.message : String(err));
  }

  // ── brand_enquiries: anonymise, split by identity resolution ──
  try {
    const enqRes = await supabase
      .from<{ id: string; metadata: Record<string, unknown> | null }>("brand_enquiries")
      .select("id, metadata").eq("metadata->>clientId", clientId);
    if (enqRes.error) throw new Error(enqRes.error.message);
    for (const row of enqRes.data ?? []) {
      const metadata: Record<string, unknown> = row.metadata && typeof row.metadata === "object" ? { ...row.metadata } : {};
      const ir = metadata.identityResolution && typeof metadata.identityResolution === "object"
        ? { ...(metadata.identityResolution as Record<string, unknown>) } : undefined;
      const resolvedAsClient = ir?.status === "resolved" && (ir?.clientId === clientId || metadata.clientId === clientId);

      // Always drop the client link.
      delete metadata.clientId;
      delete metadata.clientLinkedAt;
      if (ir) { delete ir.clientId; delete ir.clientName; metadata.identityResolution = ir; }

      const update: Record<string, unknown> = { metadata };
      if (resolvedAsClient) {
        // The enquirer IS the erased client → strip their PII too.
        update.name = null; update.email = null; update.phone = null;
        update.contact_method = null; update.message = null; update.source_url = null;
        delete metadata.replies; delete metadata.calls; delete metadata.formCapture;
        stub.enquiriesPiiStripped++;
      }
      const upd = await supabase.from("brand_enquiries").update(update).eq("id", row.id);
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
  let recordsErased = 0;

  // Live systems go first. Their operations are idempotent, while deleting the
  // local client first used to remove the only normal route to retry a partial
  // failure. A failed live attempt leaves the client and all local records in
  // place and records only de-identified per-system outcomes for the retry.
  let live: LiveErasureStub | undefined;
  if (input.supabase) {
    live = await scrubClientLiveTables(input.supabase, input.agencyId, input.clientId, collections);
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
      return { completed: false, clientName, recordsErased: 0, collections, live };
    }
  }

  // Resolve dispositions + run bespoke plugin hooks first (async — they use
  // their own storage API), so a plugin can erase what the generic scan can't.
  const dispositions = await resolveDispositionsAndRunHooks(input.agencyId, input.clientId, collections);
  const failedHooks = Object.keys(collections)
    .filter(key => key.startsWith("hookError:"))
    .map(key => key.slice("hookError:".length));
  if (failedHooks.length) {
    logActivity({
      agencyId: input.agencyId,
      clientId: input.clientId,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      category: "tenant",
      action: "client.erasure_failed",
      message: "Client erasure is incomplete and can be retried; the local client record was retained.",
      metadata: { clientId: input.clientId, failedSystems: failedHooks.map(id => `plugin:${id}`), collections, live },
    });
    return { completed: false, clientName, recordsErased: 0, collections, live };
  }

  mutate(state => {
    // Plugin-owned storage — swept before the top-level pass so client-scoped
    // install ids are still resolvable.
    recordsErased += sweepPluginData(state, input.agencyId, input.clientId, collections, dispositions);

    // Person records — unlink always, strip identifiers only when orphaned.
    anonymiseOrphanedPersons(state, input.agencyId, input.clientId, client.relationshipId, collections);

    // Identity-resolution reviews — links to a client via `selectedClientId`,
    // which the generic clientId sweep cannot see.
    anonymiseIdentityResolutionReviews(state, input.agencyId, input.clientId, collections);

    for (const [collectionName, collection] of Object.entries(state as unknown as Record<string, unknown>)) {
      if (!collection) continue;
      // Plugin slices/records are handled above; skip them here.
      if (PLUGIN_COLLECTIONS.has(collectionName)) continue;
      // Persons get the anonymise-if-orphaned pass, not the generic one.
      if (DEDICATED_COLLECTIONS.has(collectionName)) continue;

      // Legal-hold collections survive erasure — the client's PII still goes
      // via the client-record delete, leaving a de-identified record.
      if (RETAIN_COLLECTIONS.has(collectionName)) {
        let kept = 0;
        if (Array.isArray(collection)) {
          kept = collection.filter(e => recordNamesClient(e, input.clientId)).length;
        } else if (typeof collection === "object") {
          kept = Object.values(collection as Record<string, unknown>).filter(r => recordNamesClient(r, input.clientId)).length;
        }
        if (kept) collections[`retained:${collectionName}`] = kept;
        continue;
      }

      if (Array.isArray(collection)) {
        // Arrays (e.g. the activity log) — drop entries that name this client.
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
        // Record<string, X> — delete entries stamped with this client.
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

    // The client record itself is keyed by its own id, not a `clientId` field,
    // so it is removed explicitly. Always deleted — even when finance is
    // retained, only the random clientId token survives, never the person.
    if (state.clients[input.clientId]) {
      delete state.clients[input.clientId];
      collections["deleted:clients"] = (collections["deleted:clients"] ?? 0) + 1;
      recordsErased += 1;
    }
  });

  // Recorded AFTER the wipe so the audit trail survives it. Names no personal
  // data — only that an erasure occurred, by whom, the disposition per area,
  // and the no-PII live-scrub stub (counts + date span, never content).
  logActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    category: "tenant",
    action: "client.erased",
    message: `Permanently erased a client and associated data (${recordsErased} records deleted). This cannot be undone.`,
    metadata: { clientId: input.clientId, recordsErased, collections, live },
  });

  return { completed: true, clientName, recordsErased, collections, live };
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
