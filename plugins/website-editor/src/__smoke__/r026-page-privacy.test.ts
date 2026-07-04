// Smoke — R026 Per-page privacy + password gate.

import {
  hashPagePassword,
  verifyPagePassword,
  makeUnlockToken,
  verifyUnlockToken,
  evaluatePageAccess,
  pagesVisibleInSitemap,
} from "../lib/pagePrivacy";
import {
  handleSetPagePrivacy,
  handleUnlockPage,
} from "../api/handlers/pagePrivacy";
import { createPage, getPage } from "../server/pages";
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
  // ─── A: hashPagePassword + verifyPagePassword ────────────────────────
  const h1 = await hashPagePassword("page_a", "secret");
  expect("hash starts with sha256: prefix", h1.startsWith("sha256:"));
  expect("hash is hex+prefix length",
    /^sha256:[0-9a-f]{64}$/.test(h1));

  const h2 = await hashPagePassword("page_b", "secret");
  expect("same password + different pageId → different hash (per-page salt)",
    h1 !== h2);

  expect("verify accepts correct password",
    await verifyPagePassword("page_a", "secret", h1));
  expect("verify rejects wrong password",
    !(await verifyPagePassword("page_a", "wrong", h1)));
  expect("verify rejects different pageId",
    !(await verifyPagePassword("page_b", "secret", h1)));
  expect("verify rejects non-prefixed hash",
    !(await verifyPagePassword("page_a", "secret", "plaintext")));

  // ─── B: makeUnlockToken + verifyUnlockToken ──────────────────────────
  const token = await makeUnlockToken("page_a", h1);
  expect("token starts with pageId:",
    token.startsWith("page_a:"));
  expect("verifyUnlockToken accepts matching",
    await verifyUnlockToken("page_a", h1, token));
  expect("verifyUnlockToken rejects mismatch pageId",
    !(await verifyUnlockToken("page_b", h1, token)));
  expect("verifyUnlockToken rejects mismatch hash",
    !(await verifyUnlockToken("page_a", h2, token)));
  expect("verifyUnlockToken rejects garbage",
    !(await verifyUnlockToken("page_a", h1, "garbage")));

  // ─── C: evaluatePageAccess ─────────────────────────────────────────────
  expect("public page allows always",
    (await evaluatePageAccess({ id: "p", privacy: "public" })).allow === true);
  const undef = await evaluatePageAccess({ id: "p" });
  expect("missing privacy defaults to public allow",
    undef.allow === true);

  const unl = await evaluatePageAccess({ id: "p", privacy: "unlisted" });
  expect("unlisted allows but hides from sitemap",
    unl.allow === true && unl.hideFromSitemap === true);

  // members-only
  const mDeny = await evaluatePageAccess({ id: "p", privacy: "members-only" });
  expect("members-only without role → deny + reason 'members-only'",
    !mDeny.allow && mDeny.reason === "members-only");
  const mAllow = await evaluatePageAccess({ id: "p", privacy: "members-only" }, { memberRole: "client-staff" });
  expect("members-only with role → allow",
    mAllow.allow === true);

  // password
  const pwNoToken = await evaluatePageAccess({ id: "page_a", privacy: "password", passwordHash: h1 });
  expect("password without token → challenge",
    !pwNoToken.allow && pwNoToken.reason === "challenge");

  const pwBadToken = await evaluatePageAccess(
    { id: "page_a", privacy: "password", passwordHash: h1 },
    { unlockToken: "bogus" },
  );
  expect("password with bogus token → challenge",
    !pwBadToken.allow && pwBadToken.reason === "challenge");

  const pwOk = await evaluatePageAccess(
    { id: "page_a", privacy: "password", passwordHash: h1 },
    { unlockToken: token },
  );
  expect("password with valid token → allow",
    pwOk.allow === true);

  const pwNoHash = await evaluatePageAccess(
    { id: "page_a", privacy: "password" },
    { unlockToken: token },
  );
  expect("password gate without hash → challenge (default-deny)",
    !pwNoHash.allow);

  // ─── D: pagesVisibleInSitemap ────────────────────────────────────────
  const allPages = [
    { privacy: "public" as const },
    { privacy: "unlisted" as const },
    { privacy: "password" as const },
    { privacy: "members-only" as const },
    { /* no privacy = defaults to public */ },
  ];
  const visible = pagesVisibleInSitemap(allPages);
  expect("pagesVisibleInSitemap drops non-public",
    visible.length === 2);

  // ─── E: HTTP — set privacy + unlock ──────────────────────────────────
  const ctxStorage = memStorage();
  const site = await getOrCreateDefaultSite(ctxStorage, a, c, c);
  const page = await createPage(ctxStorage, {
    siteId: site.id, agencyId: a, clientId: c,
    title: "Private", slug: "/private", blocks: [],
  });
  const ctx = {
    agencyId: a, clientId: c, actor: "u_smoke",
    storage: ctxStorage,
    services: {} as Record<string, unknown>,
    install: { config: {} },
  } as unknown as Parameters<typeof handleSetPagePrivacy>[1];

  // Set privacy=password requires password.
  const noPw = await handleSetPagePrivacy(
    new Request(`http://x/pages/privacy?siteId=${site.id}&id=${page.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ privacy: "password" }),
    }), ctx,
  );
  expect("POST set privacy=password without password → 400",
    noPw.status === 400);

  // Set privacy=password with password.
  const setPw = await handleSetPagePrivacy(
    new Request(`http://x/pages/privacy?siteId=${site.id}&id=${page.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ privacy: "password", password: "open-sesame" }),
    }), ctx,
  );
  expect("POST set privacy=password 200", setPw.status === 200);
  const setPwBody = await setPw.json() as { ok: boolean; page: { privacy: string; passwordHash?: string } };
  expect("response masks passwordHash",
    setPwBody.page.privacy === "password" && setPwBody.page.passwordHash === undefined);

  // Verify hash actually persisted (storage-side).
  const persisted = await getPage(ctxStorage, a, c, site.id, page.id);
  expect("password hash persisted to storage",
    persisted?.passwordHash?.startsWith("sha256:") === true);

  // Switching to public drops the hash.
  const setPub = await handleSetPagePrivacy(
    new Request(`http://x/pages/privacy?siteId=${site.id}&id=${page.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ privacy: "public" }),
    }), ctx,
  );
  expect("POST set privacy=public 200", setPub.status === 200);
  const persistedPub = await getPage(ctxStorage, a, c, site.id, page.id);
  expect("switching to public drops hash",
    persistedPub?.passwordHash === undefined);

  // Switch back to password mode (operator must re-supply pw).
  await handleSetPagePrivacy(
    new Request(`http://x/pages/privacy?siteId=${site.id}&id=${page.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ privacy: "password", password: "newpw" }),
    }), ctx,
  );

  // Unlock with wrong pw → 401.
  const unlockBad = await handleUnlockPage(
    new Request(`http://x/pages/privacy/unlock?siteId=${site.id}&id=${page.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    }), ctx,
  );
  expect("unlock wrong password → 401", unlockBad.status === 401);

  // Unlock with correct pw → 200 + token.
  const unlockOk = await handleUnlockPage(
    new Request(`http://x/pages/privacy/unlock?siteId=${site.id}&id=${page.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "newpw" }),
    }), ctx,
  );
  expect("unlock correct password → 200", unlockOk.status === 200);
  const unlockBody = await unlockOk.json() as { ok: boolean; token: string };
  expect("unlock returns token starting with pageId:",
    unlockBody.token.startsWith(`${page.id}:`));

  // Unlock 400 / 404 paths.
  const unNoSite = await handleUnlockPage(
    new Request(`http://x/pages/privacy/unlock?id=${page.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "x" }),
    }), ctx,
  );
  expect("unlock without siteId → 400", unNoSite.status === 400);

  const setBadValue = await handleSetPagePrivacy(
    new Request(`http://x/pages/privacy?siteId=${site.id}&id=${page.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ privacy: "garbage" }),
    }), ctx,
  );
  expect("set privacy=garbage → 400", setBadValue.status === 400);

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
