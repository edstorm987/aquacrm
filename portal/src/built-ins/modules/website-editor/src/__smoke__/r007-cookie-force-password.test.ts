// Smoke — R007 cookie-consent block + force-password-change registry.
//
// Block test is structural (no DOM): we assert blockRegistry surfaces
// the new entry with the right shape + defaults so applyStarterVariant
// + the editor's field-form + the renderer all see a consistent
// contract.
//
// Force-password-change tests round-trip the registry + handler.

import { getBlockDefinition } from "../components/blockRegistry";
import {
  setRequirePasswordChange,
  getRequirePasswordChange,
  clearRequirePasswordChange,
  setRequirePasswordChangeForAgency,
  clearRequirePasswordChangeForAgency,
  listRequirePasswordChangeUsers,
} from "../server/forcePasswordChange";
import { handleGetForcePassword, handleSetForcePassword } from "../api/handlers/forcePassword";
import type { PluginStorage } from "../lib/aquaPluginTypes";

function memStorage(): PluginStorage {
  const m = new Map<string, unknown>();
  return {
    async get<T>(k: string) { return m.get(k) as T | undefined; },
    async set(k, v) { m.set(k, v); },
    async del(k) { m.delete(k); },
    async list(prefix = "") { return [...m.keys()].filter(k => k.startsWith(prefix)); },
  };
}

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

(async () => {
  // ─── cookie-consent block registration ───────────────────────────────────
  const def = getBlockDefinition("cookie-consent");
  expect("cookie-consent block registered", !!def);
  expect("cookie-consent label set", def?.label === "Cookie consent");
  expect("cookie-consent has bottom-bar default position",
    def?.defaultProps.position === "bottom-bar");
  expect("cookie-consent default message non-empty",
    typeof def?.defaultProps.message === "string" && (def?.defaultProps.message as string).length > 0);
  expect("cookie-consent fields include position select",
    Array.isArray(def?.fields) && def!.fields!.some(f => f.key === "position" && f.type === "select"));
  expect("cookie-consent fields include policyUrl",
    def!.fields!.some(f => f.key === "policyUrl"));

  // ─── force-password-change registry: per-user ───────────────────────────
  const storage = memStorage();
  expect("getRequirePasswordChange empty by default",
    (await getRequirePasswordChange(storage, "ag_smoke", "u1")) === false);

  const rec = await setRequirePasswordChange(storage, "ag_smoke", "u1", "u_admin");
  expect("setRequirePasswordChange returns record with setBy",
    rec.setBy === "u_admin" && typeof rec.setAt === "string");
  expect("getRequirePasswordChange true after set",
    (await getRequirePasswordChange(storage, "ag_smoke", "u1")) === true);
  expect("u2 unaffected by u1 set",
    (await getRequirePasswordChange(storage, "ag_smoke", "u2")) === false);

  const cleared = await clearRequirePasswordChange(storage, "ag_smoke", "u1");
  expect("clearRequirePasswordChange returns true on hit", cleared === true);
  expect("getRequirePasswordChange false after clear",
    (await getRequirePasswordChange(storage, "ag_smoke", "u1")) === false);
  expect("clearRequirePasswordChange returns false on miss",
    (await clearRequirePasswordChange(storage, "ag_smoke", "u_nope")) === false);

  // ─── agency-wide flag ───────────────────────────────────────────────────
  const wide = await setRequirePasswordChangeForAgency(storage, "ag_smoke", "u_admin");
  expect("agency-wide flag stored", typeof wide.setAt === "string");
  expect("agency-wide flag implies required for any user",
    (await getRequirePasswordChange(storage, "ag_smoke", "u_anyone")) === true);
  expect("agency-wide flag scoped to its agency",
    (await getRequirePasswordChange(storage, "ag_other", "u_anyone")) === false);

  // listRequirePasswordChangeUsers excludes the agency-wide _all key.
  await setRequirePasswordChange(storage, "ag_smoke", "u3", "u_admin");
  const list = await listRequirePasswordChangeUsers(storage, "ag_smoke");
  expect("listRequirePasswordChangeUsers excludes _all key",
    list.length === 1 && list[0]!.userId === "u3");

  expect("clearRequirePasswordChangeForAgency returns true on hit",
    (await clearRequirePasswordChangeForAgency(storage, "ag_smoke")) === true);
  expect("clearRequirePasswordChangeForAgency returns false on miss",
    (await clearRequirePasswordChangeForAgency(storage, "ag_other")) === false);

  // ─── HTTP handler shape ──────────────────────────────────────────────────
  const ctxStorage = memStorage();
  const ctx = {
    agencyId: "ag_smoke",
    actor: "u_admin",
    storage: ctxStorage,
    services: {} as Record<string, unknown>,
    install: { config: {} },
  } as unknown as Parameters<typeof handleSetForcePassword>[1];

  // GET empty
  const getEmpty = await handleGetForcePassword(new Request("http://x/users/force-password"), ctx);
  expect("GET /users/force-password 200", getEmpty.status === 200);
  const getEmptyBody = await getEmpty.json() as { ok: boolean; users: unknown[] };
  expect("GET returns empty users array", getEmptyBody.ok && getEmptyBody.users.length === 0);

  // POST per-user true
  const setRes = await handleSetForcePassword(new Request("http://x/users/force-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "u9", value: true }),
  }), ctx);
  expect("POST per-user value=true 200", setRes.status === 200);

  // GET ?userId=u9 → required:true
  const getOne = await handleGetForcePassword(new Request("http://x/users/force-password?userId=u9"), ctx);
  const getOneBody = await getOne.json() as { ok: boolean; required: boolean };
  expect("GET ?userId=u9 returns required=true",
    getOneBody.ok && getOneBody.required === true);

  // POST per-user false → clears
  const clearRes = await handleSetForcePassword(new Request("http://x/users/force-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "u9", value: false }),
  }), ctx);
  expect("POST per-user value=false 200", clearRes.status === 200);
  const getCleared = await handleGetForcePassword(new Request("http://x/users/force-password?userId=u9"), ctx);
  const getClearedBody = await getCleared.json() as { ok: boolean; required: boolean };
  expect("GET ?userId=u9 returns required=false after clear",
    getClearedBody.required === false);

  // POST agency-wide
  const wideRes = await handleSetForcePassword(new Request("http://x/users/force-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ all: true, value: true }),
  }), ctx);
  expect("POST all:true value:true 200", wideRes.status === 200);
  const getAfterWide = await handleGetForcePassword(new Request("http://x/users/force-password?userId=u_anyone"), ctx);
  const getAfterWideBody = await getAfterWide.json() as { ok: boolean; required: boolean };
  expect("agency-wide flag implies required for arbitrary user via handler",
    getAfterWideBody.required === true);

  // POST without value → 400
  const badNoValue = await handleSetForcePassword(new Request("http://x/users/force-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "u9" }),
  }), ctx);
  expect("POST without value → 400", badNoValue.status === 400);

  // POST without userId AND without all → 400
  const badNoTarget = await handleSetForcePassword(new Request("http://x/users/force-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: true }),
  }), ctx);
  expect("POST without userId or all → 400", badNoTarget.status === 400);

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
