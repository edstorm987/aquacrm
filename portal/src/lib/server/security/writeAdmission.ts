import "server-only";

import { RemoteOperationDefinitiveError } from "@/lib/server/remoteOperation";

/**
 * Durable write admission for Aqua-owned effects.
 *
 * This module is deliberately a leaf: it does not import PortalState storage,
 * the embedded security-control module, or a Supabase SDK client.  Admission
 * therefore cannot recurse through the very write boundary it protects and it
 * cannot inherit a sandbox/showcase realm or a process-local cache.
 */

// The control plane has one stable identity even when a test/release process
// points PortalState at a temporary datastore row. Production custom state
// namespaces remain a readiness failure until the database trigger mapping is
// explicitly migrated for them.
export const AQUA_WRITE_ADMISSION_APP_KEY = "aquacrm-portal-state";

export const PLATFORM_WRITE_PURPOSES = [
  "cross-tenant-queue-claim",
  "incident-auth-recovery",
  "identity-lifecycle",
  "security-control",
  "platform-maintenance",
] as const;

export type PlatformWritePurpose = typeof PLATFORM_WRITE_PURPOSES[number];

export type WriteAdmissionContext =
  | {
      kind: "tenant";
      tenantId: string;
      surface: string;
      actor?: string;
    }
  | {
      kind: "platform";
      purpose: PlatformWritePurpose;
      surface: string;
      actor?: string;
    };

export interface DurableWriteControlRecord {
  scope: "global" | "tenant";
  scopeId: string;
  frozen: boolean;
  revision: number;
  reason: string | null;
  actor: string | null;
  changedAt: string;
}

export interface DurableWriteAdmissionSnapshot {
  appKey: string;
  global: DurableWriteControlRecord;
  tenant: DurableWriteControlRecord | null;
  pendingQuarantines: number;
  frozenTenants: number;
}

export interface DurableWriteQuarantineSummary {
  id: number;
  datastoreKey: string;
  realmId: string;
  operationId: string;
  controlScope: "global" | "tenant";
  controlScopeId: string;
  controlRevision: number;
  controlReason: string | null;
  capturedBy: string;
  capturedAt: string;
  status: "pending" | "replayed" | "discarded";
  resolvedBy: string | null;
  resolutionReason: string | null;
  resolvedAt: string | null;
}

export class WriteAdmissionDeniedError extends RemoteOperationDefinitiveError {
  readonly code = "writes_frozen";
  readonly surface: string;
  readonly scope: "environment" | "global" | "tenant" | "unavailable" | "context";

  constructor(
    surface: string,
    scope: WriteAdmissionDeniedError["scope"],
    reason: string,
  ) {
    super(`[security] write to '${surface}' refused (${scope}): ${reason}`);
    this.name = "WriteAdmissionDeniedError";
    this.surface = surface;
    this.scope = scope;
  }
}

export function isWriteAdmissionDenied(error: unknown): error is WriteAdmissionDeniedError {
  return error instanceof WriteAdmissionDeniedError
    || (Boolean(error) && typeof error === "object" && (error as { code?: unknown }).code === "writes_frozen");
}

interface RpcFailure {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

type TestReader = (tenantId?: string) => Promise<DurableWriteAdmissionSnapshot>;
let testReader: TestReader | null = null;

/** Test-only injection. Production refuses to install an in-memory authority. */
export function setWriteAdmissionTestReader(reader: TestReader | null): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("write_admission_test_reader_is_test_only");
  }
  testReader = reader;
}

function productionBackend(): "supabase" | "unsupported" | "development" {
  const explicit = process.env.PORTAL_BACKEND?.trim().toLowerCase();
  if (explicit === "postgres" || explicit === "file" || explicit === "memory" || explicit === "kv") {
    return process.env.NODE_ENV === "production" ? "unsupported" : "development";
  }
  if (!explicit && process.env.DATABASE_URL) {
    return process.env.NODE_ENV === "production" ? "unsupported" : "development";
  }
  const hasSupabase = Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim())
    && (process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
  );
  if (explicit === "supabase" || hasSupabase) return "supabase";
  return process.env.NODE_ENV === "production" ? "unsupported" : "development";
}

function config(): { url: string; key: string } | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || "")
    .replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || "";
  return url && key ? { url, key } : null;
}

function unavailable(surface: string, reason: string): never {
  throw new WriteAdmissionDeniedError(surface, "unavailable", reason);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseControl(value: unknown, expectedScope: "global" | "tenant"): DurableWriteControlRecord {
  const row = record(value);
  const scope = row?.scope;
  const scopeId = row?.scopeId;
  const frozen = row?.frozen;
  const revision = row?.revision;
  const changedAt = row?.changedAt;
  if (
    scope !== expectedScope
    || typeof scopeId !== "string"
    || !scopeId.trim()
    || typeof frozen !== "boolean"
    || typeof revision !== "number"
    || !Number.isSafeInteger(revision)
    || revision < 1
    || typeof changedAt !== "string"
    || !Number.isFinite(Date.parse(changedAt))
  ) {
    throw new Error(`malformed_${expectedScope}_write_control`);
  }
  return {
    scope: expectedScope,
    scopeId,
    frozen,
    revision,
    reason: typeof row!.reason === "string" ? row!.reason : null,
    actor: typeof row!.actor === "string" ? row!.actor : null,
    changedAt,
  };
}

function parseSnapshot(value: unknown, tenantId?: string): DurableWriteAdmissionSnapshot {
  const body = record(value);
  if (!body || body.appKey !== AQUA_WRITE_ADMISSION_APP_KEY) {
    throw new Error("malformed_write_admission_snapshot");
  }
  const tenantValue = body.tenant;
  const tenant = tenantValue === null || tenantValue === undefined
    ? null
    : parseControl(tenantValue, "tenant");
  if (tenantId && (!tenant || tenant.scopeId !== tenantId)) {
    throw new Error(tenant ? "write_admission_tenant_mismatch" : "write_admission_tenant_missing");
  }
  return {
    appKey: AQUA_WRITE_ADMISSION_APP_KEY,
    global: parseControl(body.global, "global"),
    tenant,
    pendingQuarantines:
      typeof body.pendingQuarantines === "number"
      && Number.isSafeInteger(body.pendingQuarantines)
      && body.pendingQuarantines >= 0
        ? body.pendingQuarantines
        : (() => { throw new Error("malformed_write_quarantine_count"); })(),
    frozenTenants:
      typeof body.frozenTenants === "number"
      && Number.isSafeInteger(body.frozenTenants)
      && body.frozenTenants >= 0
        ? body.frozenTenants
        : (() => { throw new Error("malformed_frozen_tenant_count"); })(),
  };
}

async function readRpc(tenantId?: string): Promise<DurableWriteAdmissionSnapshot> {
  if (testReader) return testReader(tenantId);
  const backend = productionBackend();
  if (backend === "development") {
    // Local/test file and memory backends intentionally have no durable shared
    // authority. The existing synchronous/environment guards still exercise
    // those lanes; a hosted production deployment is never allowed here.
    const now = new Date().toISOString();
    return {
      appKey: AQUA_WRITE_ADMISSION_APP_KEY,
      global: { scope: "global", scopeId: "global", frozen: false, revision: 1, reason: null, actor: null, changedAt: now },
      tenant: null,
      pendingQuarantines: 0,
      frozenTenants: 0,
    };
  }
  if (backend !== "supabase") {
    return unavailable("write-admission.read", "the selected production backend has no durable write-admission implementation");
  }
  const resolved = config();
  if (!resolved) return unavailable("write-admission.read", "Supabase write-admission credentials are missing");

  let response: Response;
  try {
    response = await fetch(`${resolved.url}/rest/v1/rpc/read_aqua_write_admission`, {
      method: "POST",
      headers: {
        apikey: resolved.key,
        authorization: `Bearer ${resolved.key}`,
        "content-type": "application/json",
        "cache-control": "no-store",
      },
      body: JSON.stringify({
        p_app_key: AQUA_WRITE_ADMISSION_APP_KEY,
        p_tenant_id: tenantId?.trim() || null,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    return unavailable(
      "write-admission.read",
      `the durable control could not be reached${error instanceof Error ? `: ${error.message}` : ""}`,
    );
  }
  const raw = await response.text();
  if (!response.ok) {
    let failure: RpcFailure = {};
    try { failure = JSON.parse(raw) as RpcFailure; } catch { /* body remains redacted */ }
    return unavailable(
      "write-admission.read",
      `the durable control refused the snapshot (${failure.code || response.status})`,
    );
  }
  try {
    return parseSnapshot(JSON.parse(raw), tenantId);
  } catch (error) {
    return unavailable(
      "write-admission.read",
      error instanceof Error ? error.message : "the durable control returned malformed data",
    );
  }
}

/** Always performs a no-store authoritative read in production. */
export async function readAuthoritativeWriteAdmission(tenantId?: string): Promise<DurableWriteAdmissionSnapshot> {
  return readRpc(tenantId?.trim() || undefined);
}

export async function assertFreshWriteAdmission(context: WriteAdmissionContext): Promise<DurableWriteAdmissionSnapshot> {
  const tenantId = context.kind === "tenant" ? context.tenantId.trim() : undefined;
  if (context.kind === "tenant" && !tenantId) {
    throw new WriteAdmissionDeniedError(context.surface, "context", "tenant lineage is required");
  }
  if (process.env.PORTAL_WRITES_FROZEN === "1") {
    throw new WriteAdmissionDeniedError(
      context.surface,
      "environment",
      "PORTAL_WRITES_FROZEN=1",
    );
  }
  let snapshot: DurableWriteAdmissionSnapshot;
  try {
    snapshot = await readRpc(tenantId);
  } catch (error) {
    if (error instanceof WriteAdmissionDeniedError) {
      throw new WriteAdmissionDeniedError(context.surface, error.scope, error.message);
    }
    return unavailable(context.surface, "the durable write-control snapshot is unavailable");
  }
  if (snapshot.global.frozen) {
    throw new WriteAdmissionDeniedError(
      context.surface,
      "global",
      snapshot.global.reason || "global read-only is active",
    );
  }
  if (snapshot.pendingQuarantines > 0) {
    throw new WriteAdmissionDeniedError(
      context.surface,
      "global",
      `${snapshot.pendingQuarantines} quarantined write${snapshot.pendingQuarantines === 1 ? "" : "s"} require explicit operator reconciliation`,
    );
  }
  if (context.kind === "platform" && snapshot.frozenTenants > 0) {
    throw new WriteAdmissionDeniedError(
      context.surface,
      "tenant",
      `${snapshot.frozenTenants} tenant containment${snapshot.frozenTenants === 1 ? " is" : "s are"} active; this platform write cannot prove tenant exclusion`,
    );
  }
  if (snapshot.tenant?.frozen) {
    throw new WriteAdmissionDeniedError(
      context.surface,
      "tenant",
      snapshot.tenant.reason || `tenant ${snapshot.tenant.scopeId} is contained`,
    );
  }
  return snapshot;
}

export async function setAuthoritativeWriteControl(input: {
  scope: "global" | "tenant";
  scopeId?: string;
  frozen: boolean;
  reason: string;
  actor: string;
  expectedRevision?: number;
}): Promise<DurableWriteAdmissionSnapshot> {
  if (productionBackend() === "development" && !testReader) {
    throw new WriteAdmissionDeniedError(
      "security-control",
      "unavailable",
      "durable write controls require the Supabase production backend",
    );
  }
  const resolved = config();
  if (!resolved) return unavailable("security-control", "Supabase write-control credentials are missing");
  const scopeId = input.scope === "global" ? "global" : input.scopeId?.trim();
  if (!scopeId) throw new WriteAdmissionDeniedError("security-control", "context", "tenant scope is required");
  const response = await fetch(`${resolved.url}/rest/v1/rpc/set_aqua_write_control`, {
    method: "POST",
    headers: {
      apikey: resolved.key,
      authorization: `Bearer ${resolved.key}`,
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify({
      p_app_key: AQUA_WRITE_ADMISSION_APP_KEY,
      p_scope_kind: input.scope,
      p_scope_id: scopeId,
      p_frozen: input.frozen,
      p_reason: input.reason.trim(),
      p_actor: input.actor.trim(),
      p_expected_revision: input.expectedRevision ?? null,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const raw = await response.text();
    let code = String(response.status);
    try { code = (JSON.parse(raw) as RpcFailure).code || code; } catch { /* redacted */ }
    return unavailable("security-control", `the durable control update failed (${code})`);
  }
  return readRpc(input.scope === "tenant" ? scopeId : undefined);
}

function quarantineSummary(value: unknown): DurableWriteQuarantineSummary {
  const row = record(value);
  const status = row?.status;
  if (
    !row
    || typeof row.id !== "number"
    || !Number.isSafeInteger(row.id)
    || row.id < 1
    || typeof row.datastoreKey !== "string"
    || typeof row.realmId !== "string"
    || typeof row.operationId !== "string"
    || (row.controlScope !== "global" && row.controlScope !== "tenant")
    || typeof row.controlScopeId !== "string"
    || !row.controlScopeId.trim()
    || typeof row.controlRevision !== "number"
    || !Number.isSafeInteger(row.controlRevision)
    || typeof row.capturedBy !== "string"
    || typeof row.capturedAt !== "string"
    || (status !== "pending" && status !== "replayed" && status !== "discarded")
  ) {
    throw new Error("malformed_write_quarantine");
  }
  return {
    id: row.id,
    datastoreKey: row.datastoreKey,
    realmId: row.realmId,
    operationId: row.operationId,
    controlScope: row.controlScope,
    controlScopeId: row.controlScopeId,
    controlRevision: row.controlRevision,
    controlReason: typeof row.controlReason === "string" ? row.controlReason : null,
    capturedBy: row.capturedBy,
    capturedAt: row.capturedAt,
    status,
    resolvedBy: typeof row.resolvedBy === "string" ? row.resolvedBy : null,
    resolutionReason: typeof row.resolutionReason === "string" ? row.resolutionReason : null,
    resolvedAt: typeof row.resolvedAt === "string" ? row.resolvedAt : null,
  };
}

/** Metadata only: the patch payload is deliberately not exposed by the list RPC. */
export async function listAuthoritativeWriteQuarantines(
  status: DurableWriteQuarantineSummary["status"] | null = "pending",
): Promise<DurableWriteQuarantineSummary[]> {
  const resolved = config();
  if (productionBackend() !== "supabase" || !resolved) {
    return unavailable("security-control.quarantine-list", "Supabase write-quarantine authority is unavailable");
  }
  const response = await fetch(`${resolved.url}/rest/v1/rpc/list_aqua_write_quarantines`, {
    method: "POST",
    headers: {
      apikey: resolved.key,
      authorization: `Bearer ${resolved.key}`,
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify({ p_app_key: AQUA_WRITE_ADMISSION_APP_KEY, p_status: status }),
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  const raw = await response.text();
  if (!response.ok) return unavailable("security-control.quarantine-list", `quarantine list failed (${response.status})`);
  try {
    const rows = JSON.parse(raw) as unknown;
    if (!Array.isArray(rows)) throw new Error("malformed_write_quarantine_list");
    return rows.map(quarantineSummary);
  } catch (error) {
    return unavailable(
      "security-control.quarantine-list",
      error instanceof Error ? error.message : "malformed_write_quarantine_list",
    );
  }
}

export async function resolveAuthoritativeWriteQuarantine(input: {
  id: number;
  action: "replay" | "discard";
  actor: string;
  reason: string;
  expectedControlRevision: number;
}): Promise<{ id: number; status: "replayed" | "discarded"; controlRevision: number }> {
  const resolved = config();
  if (productionBackend() !== "supabase" || !resolved) {
    return unavailable("security-control.quarantine-resolve", "Supabase write-quarantine authority is unavailable");
  }
  const response = await fetch(`${resolved.url}/rest/v1/rpc/resolve_aqua_write_quarantine`, {
    method: "POST",
    headers: {
      apikey: resolved.key,
      authorization: `Bearer ${resolved.key}`,
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify({
      p_app_key: AQUA_WRITE_ADMISSION_APP_KEY,
      p_quarantine_id: input.id,
      p_action: input.action,
      p_actor: input.actor.trim(),
      p_reason: input.reason.trim(),
      p_expected_control_revision: input.expectedControlRevision,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await response.text();
  if (!response.ok) {
    let code = String(response.status);
    try { code = (JSON.parse(raw) as RpcFailure).code || code; } catch { /* redacted */ }
    return unavailable("security-control.quarantine-resolve", `quarantine resolution failed (${code})`);
  }
  try {
    const row = record(JSON.parse(raw));
    const status = row?.status;
    if (
      typeof row?.id !== "number"
      || (status !== "replayed" && status !== "discarded")
      || typeof row.controlRevision !== "number"
    ) throw new Error("malformed_write_quarantine_resolution");
    return { id: row.id, status, controlRevision: row.controlRevision };
  } catch (error) {
    return unavailable(
      "security-control.quarantine-resolve",
      error instanceof Error ? error.message : "malformed_write_quarantine_resolution",
    );
  }
}
