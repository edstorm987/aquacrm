import "server-only";

/**
 * Typed wrappers over the Aqua Tag submission RPCs declared in
 * `supabase/migrations/20260902093000_aqua_tag_submission_delivery.sql`.
 *
 * The public routes call these with the service-role client they already
 * hold. Every wrapper distinguishes three answers: the boundary worked, the
 * boundary is not there yet (the migration is applied by hand, so the code can
 * be live against a database without it — the caller then keeps the older
 * process-local path), or the submission id is being reused for a different
 * submission (SQLSTATE AQ409 from the merge-facts rule).
 */

export interface SubmissionRpcError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

export interface SubmissionClaimClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: SubmissionRpcError | null }>;
}

export type AquaTagArrival = "tag" | "brand";
export type AquaTagSubmissionState = "capture-only" | "ingesting" | "complete" | "dead-letter";
export type AquaTagWorkStatus = "idle" | "pending" | "processing" | "complete" | "dead";

export interface AquaTagIngestInput {
  tenantScope: string;
  submissionId: string;
  siteKey: string;
  arrival: AquaTagArrival;
  /** Immutable facts for this arrival kind; a contradiction refuses the write. */
  facts: Record<string, unknown>;
  capture?: Record<string, unknown> | null;
  brand?: Record<string, unknown> | null;
  /** The brand_enquiries columns to create with, or promote onto the hold row. */
  enquiryRow: Record<string, unknown>;
}

export interface AquaTagIngestReceipt {
  enquiryId: string;
  state: AquaTagSubmissionState;
  workStatus: AquaTagWorkStatus;
  created: boolean;
  promoted: boolean;
  attached: boolean;
  replay: boolean;
  attempts: number;
  effects: Record<string, Record<string, unknown>>;
}

export type AquaTagIngestResult =
  | { kind: "ingested"; receipt: AquaTagIngestReceipt }
  | { kind: "unavailable"; reason: string }
  | { kind: "conflict"; fact: string; message: string };

export interface AquaTagWorkClaim {
  tenantScope: string;
  submissionId: string;
  siteKey: string;
  enquiryId: string | null;
  owner: string;
  token: string;
  attempts: number;
  maxAttempts: number;
  leaseExpiresAt: number;
  state: AquaTagSubmissionState;
  workStatus: AquaTagWorkStatus;
  facts: Record<string, unknown>;
  capture: Record<string, unknown> | null;
  brand: Record<string, unknown> | null;
  effects: Record<string, Record<string, unknown>>;
}

export type AquaTagSettleOutcome = "complete" | "retry" | "dead";

export interface AquaTagSettleReceipt {
  settled: boolean;
  reason?: string;
  workStatus?: AquaTagWorkStatus;
  state?: AquaTagSubmissionState;
  attempts?: number;
  availableAt?: number;
  lastError?: string | null;
}

const MISSING_OBJECT_CODES = new Set(["PGRST202", "PGRST205", "42883", "42P01"]);
const CONFLICT_CODE = "AQ409";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * True when the database answered "no such function/table" for one of the
 * Aqua Tag delivery objects — the migration has not been applied there yet.
 * Anything else (network, permission, a real constraint failure) is a genuine
 * error and must not be mistaken for "fall back quietly".
 */
export function isSubmissionDeliveryUnavailable(error: SubmissionRpcError | null | undefined): boolean {
  if (!error) return false;
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
  if (!/aqua_tag/i.test(text)) return false;
  if (MISSING_OBJECT_CODES.has(error.code ?? "")) return true;
  return /could not find the function|does not exist|schema cache/i.test(text);
}

export function isSubmissionConflict(error: SubmissionRpcError | null | undefined): boolean {
  if (!error) return false;
  return error.code === CONFLICT_CODE || /aqua_tag_submission_conflict/.test(error.message ?? "");
}

function conflictFact(error: SubmissionRpcError): string {
  const match = /aqua_tag_submission_conflict:([A-Za-z0-9_.-]+)/.exec(error.message ?? "");
  return match?.[1] ?? "submission";
}

/**
 * A delivery error that is safe to persist and show: one line, no stack, no
 * connection string, no bearer token, and never longer than the column.
 */
export function safeDeliveryError(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "Delivery failed.";
  const line = raw.split(/\r?\n/)[0]?.trim() || "Delivery failed.";
  return line
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s@]+@\S+/gi, "[redacted-url]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-token]")
    .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{8,}\b/g, "[redacted-key]")
    .slice(0, 300);
}

function receiptFrom(data: unknown): AquaTagIngestReceipt {
  const body = record(data);
  if (!body || typeof body.enquiryId !== "string" || !body.enquiryId) {
    throw new Error("The submission boundary returned an incomplete receipt.");
  }
  return {
    enquiryId: body.enquiryId,
    state: String(body.state) as AquaTagSubmissionState,
    workStatus: String(body.workStatus) as AquaTagWorkStatus,
    created: body.created === true,
    promoted: body.promoted === true,
    attached: body.attached === true,
    replay: body.replay === true,
    attempts: typeof body.attempts === "number" ? body.attempts : 0,
    effects: (record(body.effects) ?? {}) as Record<string, Record<string, unknown>>,
  };
}

export async function ingestAquaTagSubmission(
  client: SubmissionClaimClient,
  input: AquaTagIngestInput,
): Promise<AquaTagIngestResult> {
  const { data, error } = await client.rpc("ingest_aqua_tag_submission", {
    p_tenant_scope: input.tenantScope,
    p_submission_id: input.submissionId,
    p_site_key: input.siteKey,
    p_arrival: input.arrival,
    p_facts: input.facts,
    p_capture: input.capture ?? null,
    p_brand: input.brand ?? null,
    p_enquiry_row: input.enquiryRow,
  });
  if (error) {
    if (isSubmissionDeliveryUnavailable(error)) {
      return { kind: "unavailable", reason: error.message ?? "aqua_tag_submissions is not available" };
    }
    if (isSubmissionConflict(error)) {
      return {
        kind: "conflict",
        fact: conflictFact(error),
        message: "This submission reference was already used for a different submission.",
      };
    }
    throw new Error(`Could not record the submission: ${error.message ?? "unknown error"}`);
  }
  return { kind: "ingested", receipt: receiptFrom(data) };
}

function claimFromRow(row: Record<string, unknown>): AquaTagWorkClaim | null {
  const tenantScope = typeof row.tenant_scope === "string" ? row.tenant_scope : "";
  const submissionId = typeof row.submission_id === "string" ? row.submission_id : "";
  const owner = typeof row.claim_owner === "string" ? row.claim_owner : "";
  const token = typeof row.claim_token === "string" ? row.claim_token : "";
  const lease = typeof row.lease_expires_at === "string" ? Date.parse(row.lease_expires_at) : Number.NaN;
  if (!tenantScope || !submissionId || !owner || !token || !Number.isFinite(lease)) return null;
  return {
    tenantScope,
    submissionId,
    siteKey: typeof row.site_key === "string" ? row.site_key : "",
    enquiryId: typeof row.enquiry_id === "string" ? row.enquiry_id : null,
    owner,
    token,
    attempts: typeof row.attempts === "number" ? row.attempts : 0,
    maxAttempts: typeof row.max_attempts === "number" ? row.max_attempts : 6,
    leaseExpiresAt: lease,
    state: String(row.state) as AquaTagSubmissionState,
    workStatus: String(row.work_status) as AquaTagWorkStatus,
    facts: record(row.facts) ?? {},
    capture: record(row.capture),
    brand: record(row.brand),
    effects: (record(row.effects) ?? {}) as Record<string, Record<string, unknown>>,
  };
}

/**
 * Claim due work under a lease. `null` means the boundary is unavailable; an
 * empty list means nothing is due (or another owner holds it). A malformed
 * row is dropped rather than run with a missing fence.
 */
export async function claimAquaTagSubmissionWork(
  client: SubmissionClaimClient,
  input: { owner: string; leaseMs?: number; tenantScope?: string; submissionId?: string; limit?: number },
): Promise<AquaTagWorkClaim[] | null> {
  const { data, error } = await client.rpc("claim_aqua_tag_submission_work", {
    p_owner: input.owner,
    p_lease_ms: input.leaseMs ?? 90_000,
    p_tenant_scope: input.tenantScope ?? null,
    p_submission_id: input.submissionId ?? null,
    p_limit: input.limit ?? 1,
  });
  if (error) {
    if (isSubmissionDeliveryUnavailable(error)) return null;
    throw new Error(`Could not claim submission work: ${error.message ?? "unknown error"}`);
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map(row => claimFromRow(record(row) ?? {})).filter((claim): claim is AquaTagWorkClaim => claim !== null);
}

/** Fenced checkpoint. `false` means the lease is lost: stop, do not continue. */
export async function checkpointAquaTagSubmissionWork(
  client: SubmissionClaimClient,
  claim: Pick<AquaTagWorkClaim, "tenantScope" | "submissionId" | "owner" | "token">,
  effect: string,
  record_: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await client.rpc("checkpoint_aqua_tag_submission_work", {
    p_tenant_scope: claim.tenantScope,
    p_submission_id: claim.submissionId,
    p_owner: claim.owner,
    p_token: claim.token,
    p_effect: effect,
    p_record: record_,
  });
  if (error) throw new Error(`Could not checkpoint submission work: ${error.message ?? "unknown error"}`);
  return data === true;
}

export async function settleAquaTagSubmissionWork(
  client: SubmissionClaimClient,
  claim: Pick<AquaTagWorkClaim, "tenantScope" | "submissionId" | "owner" | "token">,
  input: {
    outcome: AquaTagSettleOutcome;
    error?: string;
    effects?: Record<string, Record<string, unknown>>;
    metadataPatch?: Record<string, unknown>;
  },
): Promise<AquaTagSettleReceipt> {
  const { data, error } = await client.rpc("settle_aqua_tag_submission_work", {
    p_tenant_scope: claim.tenantScope,
    p_submission_id: claim.submissionId,
    p_owner: claim.owner,
    p_token: claim.token,
    p_outcome: input.outcome,
    p_error: input.error ?? null,
    p_effects: input.effects ?? null,
    p_metadata_patch: input.metadataPatch ?? null,
  });
  if (error) throw new Error(`Could not settle submission work: ${error.message ?? "unknown error"}`);
  const body = record(data) ?? {};
  return {
    settled: body.settled === true,
    reason: typeof body.reason === "string" ? body.reason : undefined,
    workStatus: typeof body.workStatus === "string" ? body.workStatus as AquaTagWorkStatus : undefined,
    state: typeof body.state === "string" ? body.state as AquaTagSubmissionState : undefined,
    attempts: typeof body.attempts === "number" ? body.attempts : undefined,
    availableAt: typeof body.availableAt === "number" ? body.availableAt : undefined,
    lastError: typeof body.lastError === "string" ? body.lastError : null,
  };
}

/**
 * The scope half of the identity. A resolved agency owns the submission; a
 * capture from a site key nobody registered is scoped to that key so it can
 * still never collide with another site's ids. Never empty.
 */
export function aquaTagTenantScope(agencyId: string | null | undefined, siteKey: string): string {
  const agency = (agencyId ?? "").trim();
  if (agency) return agency;
  return `site:${siteKey.trim() || "unknown"}`;
}
