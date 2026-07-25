// Smoke — R012 Portal-variant editor.
//
// Asserts:
//   - listAllPortalVariants returns variants across all 4 PortalRoles
//   - sort: roles ordered by PORTAL_ROLES, active-first within role,
//     then updatedAt desc
//   - status string mirrors isActive
//   - HTTP handler shapes (200 with siteId, 400 missing siteId)
//   - setActivePortalVariant flips status across roles correctly

import { listAllPortalVariants } from "../server/portalVariants";
import {
  handleListAllPortalVariants,
  handleSetActivePortalVariant,
} from "../api/handlers/pages";
import { createPage, setActivePortalVariant } from "../server/pages";
import { getOrCreateDefaultSite } from "../server/sites";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { AgencyId, ClientId } from "../lib/tenancy";

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

const a = "ag_smoke" as AgencyId;
const c = "cl_smoke" as ClientId;

(async () => {
  // ─── seed ───────────────────────────────────────────────────────────────
  const storage = memStorage();
  const site = await getOrCreateDefaultSite(storage, a, c, c);
  const siteId = site.id;

  // 2 login variants (one will be active), 1 account, 1 affiliates,
  // 1 orders. Stagger updatedAt manually so sort is testable.
  const login1 = await createPage(storage, {
    siteId, agencyId: a, clientId: c, title: "Login (default)",
    slug: "_p-login-1", blocks: [], portalRole: "login",
    isActivePortal: false, variantId: "login-default",
  });
  await new Promise(r => setTimeout(r, 5));
  const login2 = await createPage(storage, {
    siteId, agencyId: a, clientId: c, title: "Login (design)",
    slug: "_p-login-2", blocks: [], portalRole: "login",
    isActivePortal: false, variantId: "login-design",
  });
  const account1 = await createPage(storage, {
    siteId, agencyId: a, clientId: c, title: "Account default",
    slug: "_p-acct-1", blocks: [], portalRole: "account",
    isActivePortal: false, variantId: "account-default",
  });
  const affiliates1 = await createPage(storage, {
    siteId, agencyId: a, clientId: c, title: "Affiliates default",
    slug: "_p-aff-1", blocks: [], portalRole: "affiliates",
    isActivePortal: false, variantId: "affiliates-default",
  });
  const orders1 = await createPage(storage, {
    siteId, agencyId: a, clientId: c, title: "Orders default",
    slug: "_p-ord-1", blocks: [], portalRole: "orders",
    isActivePortal: false, variantId: "orders-default",
  });

  // Flip login1 active.
  await setActivePortalVariant(storage, a, c, siteId, "login", login1.id);

  // ─── A: listAllPortalVariants ─────────────────────────────────────────
  const all = await listAllPortalVariants(storage, a, c, siteId);
  expect("returns 5 variants", all.length === 5,
    `got ${all.length}: ${all.map(v => `${v.role}/${v.title}`).join(", ")}`);

  // Role ordering follows PORTAL_ROLES = login, affiliates, orders, account.
  const roleOrder = all.map(v => v.role);
  expect("roles ordered login → affiliates → orders → account",
    JSON.stringify(roleOrder) === JSON.stringify(["login", "login", "affiliates", "orders", "account"]),
    `got ${JSON.stringify(roleOrder)}`);

  // login1 (active) should appear before login2 within the login group.
  const loginRows = all.filter(v => v.role === "login");
  expect("login active variant sorts first within role",
    loginRows[0]!.pageId === login1.id && loginRows[0]!.isActive === true);
  expect("login draft variant sorts second", loginRows[1]!.pageId === login2.id);

  // Status mirrors isActive.
  expect("active variant carries status='live'",
    loginRows[0]!.status === "live");
  expect("draft variant carries status='draft'",
    loginRows[1]!.status === "draft");

  // variantId surfaced when set.
  expect("variantId surfaces when present",
    loginRows[0]!.variantId === "login-default");

  // ─── B: HTTP handler ──────────────────────────────────────────────────
  const ctx = {
    agencyId: a, clientId: c, actor: "u_smoke",
    storage,
    services: {} as Record<string, unknown>,
    install: { config: {} },
  } as unknown as Parameters<typeof handleListAllPortalVariants>[1];

  const listRes = await handleListAllPortalVariants(
    new Request(`http://x/portal-variants/all?siteId=${siteId}`), ctx,
  );
  expect("GET /portal-variants/all 200", listRes.status === 200);
  const listBody = await listRes.json() as { ok: boolean; variants: { role: string; isActive: boolean }[] };
  expect("GET surfaces 5 variants", listBody.variants.length === 5);
  expect("GET preserves sort (login active first)",
    listBody.variants[0]!.role === "login" && listBody.variants[0]!.isActive === true);

  const noSite = await handleListAllPortalVariants(
    new Request(`http://x/portal-variants/all`), ctx,
  );
  expect("GET without siteId → 400", noSite.status === 400);

  // ─── C: setActive flow via handler flips role correctly ───────────────
  const flip = await handleSetActivePortalVariant(new Request("http://x/portal-variants/active", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteId, role: "login", pageId: login2.id }),
  }), ctx);
  expect("POST set-active 200", flip.status === 200);

  const afterFlip = await listAllPortalVariants(storage, a, c, siteId);
  const newLoginActive = afterFlip.find(v => v.role === "login" && v.isActive);
  expect("flip swaps active to login2", newLoginActive?.pageId === login2.id);
  const oldActive = afterFlip.find(v => v.pageId === login1.id);
  expect("login1 now draft after flip",
    oldActive?.isActive === false && oldActive?.status === "draft");

  // Singleton invariant: still exactly one active variant per role.
  for (const role of ["login", "affiliates", "orders", "account"] as const) {
    const actives = afterFlip.filter(v => v.role === role && v.isActive);
    expect(`${role} has ≤ 1 active variant (singleton)`, actives.length <= 1,
      `got ${actives.length} actives for ${role}`);
  }

  // Account, affiliates, orders never had a flip → all draft.
  expect("account still draft (no flip)", account1 && afterFlip.find(v => v.pageId === account1.id)?.isActive === false);
  expect("affiliates still draft (no flip)", affiliates1 && afterFlip.find(v => v.pageId === affiliates1.id)?.isActive === false);
  expect("orders still draft (no flip)", orders1 && afterFlip.find(v => v.pageId === orders1.id)?.isActive === false);

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
