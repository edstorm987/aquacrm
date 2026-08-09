import "server-only";

import type { StoragePatchOperation } from "./storagePatch";

const STATE_KEY = process.env.PORTAL_STATE_KEY?.trim() || "aquacrm-portal-state";

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

export async function loadBlob(): Promise<string | null> {
  const { url, serviceRoleKey } = getConfig();
  const response = await fetch(
    `${url}/rest/v1/app_datastores?app_key=eq.${encodeURIComponent(STATE_KEY)}&select=data&limit=1`,
    { headers: headers(serviceRoleKey), cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error(`[supabase-storage] load failed (${response.status}): ${await response.text()}`);
  }
  const rows = (await response.json()) as Array<{ data?: unknown }>;
  if (!rows[0]?.data) return null;
  return JSON.stringify(rows[0].data);
}

export async function saveBlob(content: string): Promise<void> {
  const { url, serviceRoleKey } = getConfig();
  const response = await fetch(`${url}/rest/v1/app_datastores?on_conflict=app_key`, {
    method: "POST",
    headers: {
      ...headers(serviceRoleKey),
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ app_key: STATE_KEY, data: JSON.parse(content) as unknown }),
  });
  if (!response.ok) {
    throw new Error(`[supabase-storage] save failed (${response.status}): ${await response.text()}`);
  }
}

export async function applyPatch(operations: StoragePatchOperation[]): Promise<string> {
  const { url, serviceRoleKey } = getConfig();
  const response = await fetch(`${url}/rest/v1/rpc/apply_app_datastore_patch`, {
    method: "POST",
    headers: headers(serviceRoleKey),
    body: JSON.stringify({
      p_app_key: STATE_KEY,
      p_operations: operations,
    }),
  });
  if (!response.ok) {
    throw new Error(`[supabase-storage] patch failed (${response.status}): ${await response.text()}`);
  }
  return JSON.stringify(await response.json());
}
