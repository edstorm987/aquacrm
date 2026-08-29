import "server-only";

import {
  withRemoteOperationDeadline,
  type RemoteOperationBudget,
  type RemoteOperationOutcome,
} from "@/lib/server/remoteOperation";
import type { StoragePatchOperation } from "./storagePatch";
import type { DevTeamWorkspaceFileMutation } from "./devTeamWorkspacePersistence";

const STATE_KEY = process.env.PORTAL_STATE_KEY?.trim() || "aquacrm-portal-state";

export function stateKeyForRealm(realmId = "live"): string {
  const clean = realmId.trim().toLowerCase();
  return clean === "live" ? STATE_KEY : `${STATE_KEY}:realm:${clean}`;
}

/**
 * The Dev Team workspace files live in their OWN datastore row.
 *
 * Measured on the live project 2026-08-29: `devTeamWorkspaceFiles` was **967 KB
 * of a 3.25 MB document — 29% of it**, and the largest single collection. The
 * actual business data (`clients`) was 181 KB, 5.4%.
 *
 * That matters because of how the datastore is written. PostgreSQL applies each
 * `jsonb_set` **against the complete value**, and the patch RPC returns the
 * whole saved document to be re-parsed into the cache. So a founder editing one
 * markdown file, and equally somebody marking one enquiry as seen, paid for
 * those 967 KB on every write and every response.
 *
 * Splitting them out needs **no SQL change at all**: both RPCs already take
 * `p_app_key` and read `data->'devTeamWorkspaceFiles'` from whichever row that
 * names, so pointing the workspace RPC at a second key is a one-line change and
 * the row-level lock it takes is now on a row nothing else contends for.
 *
 * They are a good first collection to move precisely because they are NOT
 * personal data — a mistake here costs a founder tool, not a client's records.
 */
export function sidecarKeyForRealm(slug: string, realmId = "live"): string {
  return `${stateKeyForRealm(realmId)}:${slug}`;
}

/** Back-compat name for the first sidecar, kept so call sites read plainly. */
export function devWorkspaceKeyForRealm(realmId = "live"): string {
  return sidecarKeyForRealm("dev-workspace-files", realmId);
}

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "[supabase-storage] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
  }
  return { url, serviceRoleKey };
}

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };
}

export interface SupabaseStorageRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function request(
  operation: string,
  budget: RemoteOperationBudget,
  outcome: RemoteOperationOutcome,
  url: string,
  init: RequestInit,
  options: SupabaseStorageRequestOptions,
): Promise<{ ok: boolean; status: number; body: string }> {
  return withRemoteOperationDeadline({
    operation,
    budget,
    outcome,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  }, async signal => {
    const response = await fetch(url, { ...init, signal });
    return { ok: response.ok, status: response.status, body: await response.text() };
  });
}

export async function loadBlob(
  options: SupabaseStorageRequestOptions = {},
  realmId = "live",
): Promise<string | null> {
  const { url, serviceRoleKey } = getConfig();
  const stateKey = stateKeyForRealm(realmId);
  const response = await request(
    "Supabase state load",
    "storageRead",
    "read",
    `${url}/rest/v1/app_datastores?app_key=eq.${encodeURIComponent(stateKey)}&select=data&limit=1`,
    { headers: headers(serviceRoleKey), cache: "no-store" },
    options,
  );
  if (!response.ok) {
    throw new Error(`[supabase-storage] load failed (${response.status}): ${response.body}`);
  }
  const rows = JSON.parse(response.body || "[]") as Array<{ data?: unknown }>;
  if (!rows[0]?.data) return null;
  return JSON.stringify(rows[0].data);
}

export async function saveBlob(
  content: string,
  options: SupabaseStorageRequestOptions = {},
  realmId = "live",
): Promise<void> {
  const { url, serviceRoleKey } = getConfig();
  const stateKey = stateKeyForRealm(realmId);
  const data = JSON.parse(content) as unknown;
  const response = await request(
    "Supabase state save",
    "storageWrite",
    "non-idempotent-write",
    `${url}/rest/v1/app_datastores?on_conflict=app_key`,
    {
      method: "POST",
      headers: {
        ...headers(serviceRoleKey),
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ app_key: stateKey, data }),
    },
    options,
  );
  if (!response.ok) {
    throw new Error(`[supabase-storage] save failed (${response.status}): ${response.body}`);
  }
}

/**
 * The Dev Team workspace files, from their own row.
 *
 * Returns `null` when the row does not exist yet — which is the normal state
 * until the first commit, and is deliberately NOT an error: a fresh project has
 * no sidecar and must fall back to whatever the main document holds.
 */
export async function loadSidecarBlob(
  slug: string,
  options: SupabaseStorageRequestOptions = {},
  realmId = "live",
): Promise<string | null> {
  const { url, serviceRoleKey } = getConfig();
  const stateKey = sidecarKeyForRealm(slug, realmId);
  const response = await request(
    "Supabase sidecar load",
    "storageRead",
    "read",
    `${url}/rest/v1/app_datastores?app_key=eq.${encodeURIComponent(stateKey)}&select=data&limit=1`,
    { headers: headers(serviceRoleKey), cache: "no-store" },
    options,
  );
  if (!response.ok) throw new Error(`[supabase-storage] sidecar "${slug}" load failed (${response.status})`);
  const rows = JSON.parse(response.body) as Array<{ data: unknown }>;
  if (!rows.length) return null;
  return JSON.stringify(rows[0]!.data ?? {});
}

export const loadDevWorkspaceBlob = (
  options: SupabaseStorageRequestOptions = {},
  realmId = "live",
): Promise<string | null> => loadSidecarBlob("dev-workspace-files", options, realmId);

/**
 * Seed the Dev Team workspace sidecar row.
 *
 * Used exactly once per project, on the first commit after the split: the RPC
 * only ever writes the operations it is handed, so without this the first
 * commit would leave the sidecar holding one file and the main document about
 * to drop the rest. Upsert-merge, so running it twice is harmless.
 */
export async function saveSidecarBlob(
  slug: string,
  content: string,
  options: SupabaseStorageRequestOptions = {},
  realmId = "live",
): Promise<void> {
  const { url, serviceRoleKey } = getConfig();
  const stateKey = sidecarKeyForRealm(slug, realmId);
  const data = JSON.parse(content) as unknown;
  const response = await request(
    "Supabase sidecar save",
    "storageWrite",
    "non-idempotent-write",
    `${url}/rest/v1/app_datastores?on_conflict=app_key`,
    {
      method: "POST",
      headers: { ...headers(serviceRoleKey), prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ app_key: stateKey, data }),
    },
    options,
  );
  if (!response.ok) throw new Error(`[supabase-storage] sidecar "${slug}" save failed (${response.status})`);
}

export const saveDevWorkspaceBlob = (
  content: string,
  options: SupabaseStorageRequestOptions = {},
  realmId = "live",
): Promise<void> => saveSidecarBlob("dev-workspace-files", content, options, realmId);

export async function applyPatch(
  operations: StoragePatchOperation[],
  options: SupabaseStorageRequestOptions = {},
  realmId = "live",
): Promise<string> {
  const { url, serviceRoleKey } = getConfig();
  const stateKey = stateKeyForRealm(realmId);
  const response = await request(
    "Supabase state patch",
    "storageWrite",
    "idempotent-write",
    `${url}/rest/v1/rpc/apply_app_datastore_patch`,
    {
      method: "POST",
      headers: headers(serviceRoleKey),
      body: JSON.stringify({
        p_app_key: stateKey,
        p_operations: operations,
      }),
    },
    options,
  );
  if (!response.ok) {
    throw new Error(`[supabase-storage] patch failed (${response.status}): ${response.body}`);
  }
  return JSON.stringify(JSON.parse(response.body));
}

export async function applyDevTeamWorkspaceFiles(
  operations: DevTeamWorkspaceFileMutation[],
  options: SupabaseStorageRequestOptions = {},
  realmId = "live",
): Promise<string> {
  const { url, serviceRoleKey } = getConfig();
  // The sidecar row, not the main document — see `devWorkspaceKeyForRealm`.
  const stateKey = devWorkspaceKeyForRealm(realmId);
  const response = await request(
    "Supabase Dev Team workspace commit",
    "storageWrite",
    "idempotent-write",
    `${url}/rest/v1/rpc/apply_dev_team_workspace_files`,
    {
      method: "POST",
      headers: headers(serviceRoleKey),
      body: JSON.stringify({
        p_app_key: stateKey,
        p_operations: operations,
      }),
    },
    options,
  );
  if (!response.ok) {
    throw new Error(`[supabase-storage] Dev Team workspace commit failed (${response.status}): ${response.body}`);
  }
  return JSON.stringify(JSON.parse(response.body));
}

async function replyClaimRpc(
  name: string,
  body: Record<string, unknown>,
  options: SupabaseStorageRequestOptions = {},
  realmId = "live",
): Promise<unknown> {
  const { url, serviceRoleKey } = getConfig();
  const stateKey = stateKeyForRealm(realmId);
  const response = await request(
    `Supabase ${name}`,
    "storageWrite",
    "idempotent-write",
    `${url}/rest/v1/rpc/${name}`,
    {
      method: "POST",
      headers: headers(serviceRoleKey),
      body: JSON.stringify({ p_app_key: stateKey, ...body }),
    },
    options,
  );
  if (!response.ok) {
    throw new Error(`[supabase-storage] ${name} failed (${response.status}): ${response.body}`);
  }
  // PostgREST returns JSON for the claim function, while void completion and
  // release functions may legitimately answer with an empty body. Parsing an
  // empty success response used to turn a completed database operation into a
  // client-side failure and leave the caller unsure whether it held the claim.
  return response.body ? JSON.parse(response.body) as unknown : null;
}

export function claimEditorAiReply(
  claimKey: string,
  holderId: string,
  leaseMs: number,
  options: SupabaseStorageRequestOptions = {},
  realmId = "live",
): Promise<unknown> {
  return replyClaimRpc("claim_editor_ai_reply", {
    p_claim_key: claimKey,
    p_holder_id: holderId,
    p_lease_ms: Math.max(1_000, Math.floor(leaseMs)),
  }, options, realmId);
}

export async function completeEditorAiReply(
  claimKey: string,
  holderId: string,
  options: SupabaseStorageRequestOptions = {},
  realmId = "live",
): Promise<void> {
  await replyClaimRpc("complete_editor_ai_reply", { p_claim_key: claimKey, p_holder_id: holderId }, options, realmId);
}

export async function releaseEditorAiReply(
  claimKey: string,
  holderId: string,
  options: SupabaseStorageRequestOptions = {},
  realmId = "live",
): Promise<void> {
  await replyClaimRpc("release_editor_ai_reply", { p_claim_key: claimKey, p_holder_id: holderId }, options, realmId);
}

export function claimLeadConversion(
  claimKey: string,
  requestHash: string,
  holderId: string,
  leaseMs: number,
  options: SupabaseStorageRequestOptions = {},
  realmId = "live",
): Promise<unknown> {
  return replyClaimRpc("claim_lead_conversion", {
    p_claim_key: claimKey,
    p_request_hash: requestHash,
    p_holder_id: holderId,
    p_lease_ms: Math.max(1_000, Math.floor(leaseMs)),
  }, options, realmId);
}

export async function completeLeadConversion(
  claimKey: string,
  requestHash: string,
  holderId: string,
  result: unknown,
  options: SupabaseStorageRequestOptions = {},
  realmId = "live",
): Promise<void> {
  await replyClaimRpc("complete_lead_conversion", {
    p_claim_key: claimKey,
    p_request_hash: requestHash,
    p_holder_id: holderId,
    p_result: result,
  }, options, realmId);
}

export async function failLeadConversion(
  claimKey: string,
  requestHash: string,
  holderId: string,
  error: string,
  options: SupabaseStorageRequestOptions = {},
  realmId = "live",
): Promise<void> {
  await replyClaimRpc("fail_lead_conversion", {
    p_claim_key: claimKey,
    p_request_hash: requestHash,
    p_holder_id: holderId,
    p_error: error.slice(0, 1_000),
  }, options, realmId);
}

export function claimProductWorkspaceLease(
  workspaceKey: string,
  holderId: string,
  leaseMs: number,
  options: SupabaseStorageRequestOptions = {},
  realmId = "live",
): Promise<unknown> {
  return replyClaimRpc("claim_product_workspace_lease", {
    p_workspace_key: workspaceKey,
    p_holder_id: holderId,
    p_lease_ms: Math.max(1_000, Math.floor(leaseMs)),
  }, options, realmId);
}

export async function releaseProductWorkspaceLease(
  workspaceKey: string,
  holderId: string,
  options: SupabaseStorageRequestOptions = {},
  realmId = "live",
): Promise<void> {
  await replyClaimRpc("release_product_workspace_lease", {
    p_workspace_key: workspaceKey,
    p_holder_id: holderId,
  }, options, realmId);
}
