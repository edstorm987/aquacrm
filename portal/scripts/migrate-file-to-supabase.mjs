import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error("Supabase URL and service role key are required.");
}

const statePath = resolve(process.cwd(), ".data", "portal-state.json");
const state = JSON.parse(await readFile(statePath, "utf8"));
const appKey = "aquacrm-portal-state";
const headers = {
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
  "content-type": "application/json",
};

const existingResponse = await fetch(
  `${url}/rest/v1/app_datastores?app_key=eq.${appKey}&select=app_key,updated_at&limit=1`,
  { headers },
);
if (!existingResponse.ok) {
  throw new Error(`Unable to inspect remote state: ${await existingResponse.text()}`);
}
const existing = await existingResponse.json();
if (existing.length > 0 && !process.argv.includes("--force")) {
  console.log("Remote AquaCRM portal state already exists. Re-run with --force to replace it.");
  process.exit(2);
}

const response = await fetch(`${url}/rest/v1/app_datastores?on_conflict=app_key`, {
  method: "POST",
  headers: { ...headers, prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify({ app_key: appKey, data: state }),
});
if (!response.ok) {
  throw new Error(`Unable to migrate portal state: ${await response.text()}`);
}

console.log(
  `Migrated AquaCRM state: ${Object.keys(state.clients ?? {}).length} clients, ` +
  `${Object.keys(state.users ?? {}).length} users, ${Object.keys(state.tasks ?? {}).length} tasks.`,
);
