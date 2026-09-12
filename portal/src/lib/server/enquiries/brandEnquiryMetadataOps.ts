// BRAND-ERASURE-001 — race-safe brand-enquiry metadata operations.
//
// `brand_enquiries.metadata` is a jsonb blob mutated by MANY writers (the
// ingestion completion, call/recording, classification, communications and
// response recorders) and by client erasure (which prunes the client lineage
// and, when the enquirer IS the erased client, the PII). Every writer today
// does a read-whole / modify / write-whole round trip, so any two race with a
// lost update — and when a writer's stale whole-value write lands AFTER an
// erasure, it RESTORES the client lineage / PII the erasure removed.
//
// The fix is to make the operations ATOMIC and COMMUTATIVE:
//   - a writer only MERGES its own top-level keys (never rewriting the whole
//     blob), so it never carries a stale copy of the lineage; and
//   - erasure only REMOVES the exact lineage keys.
// A merge and an erase of DIFFERENT keys then commute: applied in either order
// the final metadata has the writer's keys AND the lineage removed. Backed by
// single-statement jsonb RPCs (see the migration), each op is atomic at the row,
// so no interleaving read-modify-write can occur.
//
// This module is the PURE, order-independent semantics — the same logic the SQL
// applies — so the commutativity and idempotency are provable without a
// database (the local-only boundary forbids contacting one).

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A writer's atomic contribution: shallow-merge its own top-level keys onto the
 * current metadata. It must never include lineage keys (`clientId`,
 * `clientLinkedAt`, `identityResolution`) — those belong to routing/erasure, not
 * to a response/call/classification writer.
 */
export function mergeEnquiryMetadata(current: Json | null | undefined, patch: Json): Json {
  return { ...(isObject(current) ? current : {}), ...patch };
}

/** Lineage keys a writer patch may never touch (they are owned by routing/erasure). */
export const RESERVED_LINEAGE_KEYS = ["clientId", "clientLinkedAt", "identityResolution"] as const;

/** True when a writer patch stays in its lane (no lineage keys). */
export function isWriterPatchSafe(patch: Json): boolean {
  return !RESERVED_LINEAGE_KEYS.some((key) => key in patch);
}

export interface EraseLineageResult {
  metadata: Json;
  /** The enquirer IS the erased client → the row's PII columns must be nulled. */
  stripPii: boolean;
  /** Whether anything changed (false → already erased / never linked → no write). */
  changed: boolean;
  /** For the review ledger — surfaced, never silently dropped. */
  review: "none" | "sharedIdentity" | "legacyUnscoped";
}

/**
 * Remove exactly this client's lineage from one enquiry's metadata.
 *
 * Idempotent: re-running on already-erased metadata reports `changed: false` and
 * returns it unchanged. Preserves routing-vs-identity independence — a top-level
 * route to this client unlinks it, and only a COMPLETED nested identity
 * resolution to this client authorises stripping the enquirer's PII; a nested
 * resolution to ANOTHER client is left entirely alone (it belongs to them).
 */
export function eraseEnquiryClientLineage(current: Json | null | undefined, clientId: string): EraseLineageResult {
  const metadata: Json = isObject(current) ? { ...current } : {};
  const ir = isObject(metadata.identityResolution) ? { ...metadata.identityResolution } : undefined;

  const routedAsClient = metadata.clientId === clientId;
  const identityNamesClient = ir?.clientId === clientId;
  const resolvedAsClient = ir?.status === "resolved" && identityNamesClient;

  let changed = false;

  if (routedAsClient) {
    delete metadata.clientId;
    delete metadata.clientLinkedAt;
    changed = true;
  }
  if (ir && identityNamesClient) {
    delete ir.clientId;
    delete ir.clientName;
    changed = true;
  }
  if (ir) metadata.identityResolution = ir;

  if (resolvedAsClient) {
    // The enquirer is the erased client → their captured PII goes too.
    for (const key of ["replies", "calls", "formCapture"]) {
      if (key in metadata) { delete metadata[key]; changed = true; }
    }
  }

  // Review classification for anything NOT confidently erasable.
  let review: EraseLineageResult["review"] = "none";
  if ((routedAsClient || identityNamesClient) && !resolvedAsClient) {
    const resolvedAsAnotherClient = ir?.status === "resolved"
      && typeof ir.clientId === "string"
      && (ir.clientId as string).length > 0
      && ir.clientId !== clientId;
    review = resolvedAsAnotherClient ? "sharedIdentity" : "legacyUnscoped";
  }

  return { metadata, stripPii: resolvedAsClient, changed, review };
}
