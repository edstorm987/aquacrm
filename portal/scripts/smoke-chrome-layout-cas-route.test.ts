// Behavioural acceptance for the per-account chrome compare-and-set boundary.

import { withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";

const ENV_KEYS = ["PORTAL_BACKEND", "PORTAL_SESSION_SECRET", "NODE_ENV"] as const;
const ORIGINAL_ENV = new Map(ENV_KEYS.map(key => [key, process.env[key]]));

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "chrome-layout-cas-smoke-secret";
process.env.NODE_ENV = "test";

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = {
  id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [],
} as never;

type Auth = typeof import("../src/lib/server/auth/auth");
type LayoutRoute = typeof import("../src/app/api/portal/chrome/layout/route");
type Layouts = typeof import("../src/lib/server/chrome/userChromeLayout");
type Storage = typeof import("../src/server/storage");
type Users = typeof import("../src/server/users");

let auth: Auth;
let layoutRoute: LayoutRoute;
let layouts: Layouts;
let storage: Storage;
let users: Users;
let agencyId = "";
let userId = "";
let token = "";

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function put(body: unknown): Promise<Response> {
  return withSession(token, () => layoutRoute.PUT(new Request(
    "http://localhost/api/portal/chrome/layout",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  )));
}

function removeOrder(): Promise<Response> {
  return withSession(token, () => layoutRoute.DELETE());
}

before(async () => {
  auth = await import("../src/lib/server/auth/auth");
  layoutRoute = await import("../src/app/api/portal/chrome/layout/route");
  layouts = await import("../src/lib/server/chrome/userChromeLayout");
  storage = await import("../src/server/storage");
  users = await import("../src/server/users");
});

beforeEach(async () => {
  await storage.reset();
  agencyId = `agency_chrome_cas_${Date.now()}`;
  const user = users.createUser({
    email: `${agencyId}@chrome-cas.test`,
    password: "Safe-pass-123!",
    name: "Chrome CAS",
    role: "agency-owner",
    agencyId,
  });
  userId = user.id;
  token = auth.issueSession({
    userId,
    email: user.email,
    role: user.role,
    agencyId,
    sessionRev: user.sessionRev,
    accessRev: user.accessRev,
  });
});

after(async () => {
  try {
    await storage.reset();
  } finally {
    restoreEnv();
  }
});

describe("chrome layout compare-and-set", { concurrency: false }, () => {
  it("the shared client sends its revision and adopts both success and conflict layouts", () => {
    const source = readFileSync("src/components/chrome/pinnedTabsStore.ts", "utf8");
    assert.match(source, /JSON\.stringify\(\{ \.\.\.next, expectedUpdatedAt \}\)/);
    assert.match(source, /const rehydrated = rehydrateFromResponse\(payload\)/);
    assert.match(source, /next\.updatedAt >= authoritative\.updatedAt/,
      "an older crossed acknowledgement can replace newer shared state");
    assert.match(source, /persistTail = persistTail\.then/,
      "rapid local writes are not serialized before they reuse a revision");
    assert.match(source, /if \(!canRebase\(write\)\)[\s\S]*?resolveResult\(false\)[\s\S]*?return/,
      "a later queued full-array write can erase a remote winner after its optimistic predecessor is refused");
    assert.match(source, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/,
      "a cross-tab compare-and-set conflict silently discards the local action");
    assert.match(source, /new BroadcastChannel\(SYNC_CHANNEL\)/,
      "other open tabs do not learn about an acknowledged layout change");
    assert.match(source, /if \(loaded\.updatedAt >= authoritative\.updatedAt\) authoritative = loaded/,
      "a delayed initial GET can regress a newer broadcast or conflict response");
    const hook = source.slice(source.indexOf("export function useChromeLayout"));
    assert.ok(hook.indexOf("ensureCrossTabSync();") < hook.indexOf("void loadOnce()"),
      "another tab can save during the initial GET before this tab subscribes to notifications");
  });

  it("lets exactly one request commit a shared revision and returns the latest record to the loser", async () => {
    const futureRevision = Date.now() + 60_000;
    layouts.saveUserChromeLayout(agencyId, userId, {
      panelOrder: [], itemOrder: {}, savedTabs: [], savedTools: [], savedToolFolders: [], topbarControls: [],
    }, futureRevision);

    const [left, right] = await Promise.all([
      put({ expectedUpdatedAt: futureRevision, panelOrder: ["left"] }),
      put({ expectedUpdatedAt: futureRevision, panelOrder: ["right"] }),
    ]);
    assert.deepEqual([left.status, right.status].sort((a, b) => a - b), [200, 409]);
    assert.equal(left.headers.get("cache-control"), "private, no-store");
    assert.equal(right.headers.get("cache-control"), "private, no-store");

    const winner = (left.status === 200 ? await left.json() : await right.json()) as {
      layout: { panelOrder: string[]; updatedAt: number };
    };
    const loser = (left.status === 409 ? await left.json() : await right.json()) as {
      code: string;
      layout: { panelOrder: string[]; updatedAt: number };
    };
    assert.equal(loser.code, "stale_chrome_layout");
    assert.deepEqual(loser.layout, winner.layout, "the conflict did not return the authoritative layout");
    assert.equal(winner.layout.updatedAt, futureRevision + 1,
      "a clock behind the stored revision moved updatedAt backwards or left it unchanged");
    assert.deepEqual(layouts.getUserChromeLayout(agencyId, userId).panelOrder, winner.layout.panelOrder);
  });

  it("keeps old unversioned partial writers working and preserves every omitted field", async () => {
    layouts.saveUserChromeLayout(agencyId, userId, {
      panelOrder: ["old"],
      itemOrder: { old: ["item"] },
      savedTabs: [],
      savedTools: [{ id: "tool_a", label: "Reference", url: "https://example.com", folderId: "folder_a", order: 0, createdAt: 1, updatedAt: 1 }],
      savedToolFolders: [{ id: "folder_a", name: "Reference", order: 0, createdAt: 1, updatedAt: 1 }],
      topbarControls: [],
      customCss: ".a { color: red; }",
    }, 10);

    const response = await put({ panelOrder: ["new"] });
    assert.equal(response.status, 200);
    const current = layouts.getUserChromeLayout(agencyId, userId);
    assert.deepEqual(current.panelOrder, ["new"]);
    assert.deepEqual(current.itemOrder, { old: ["item"] });
    assert.equal(current.savedTools[0]?.id, "tool_a");
    assert.equal(current.savedToolFolders[0]?.id, "folder_a");
    assert.equal(current.customCss, ".a { color: red; }");
  });

  it("serializes reset with a partial writer so neither loses the fields the other owns", async () => {
    const initial = layouts.saveUserChromeLayout(agencyId, userId, {
      panelOrder: ["ops"], itemOrder: { ops: ["finance"] }, savedTabs: [],
      savedTools: [], savedToolFolders: [], topbarControls: [],
    }, 20);
    const savedTabs = [{
      id: "tab_a", href: "/portal/agency", label: "Home", placement: { kind: "topbar" as const },
      order: 0, createdAt: 1, updatedAt: 1,
    }];

    const [resetResponse, tabResponse] = await Promise.all([
      removeOrder(),
      put({ expectedUpdatedAt: initial.updatedAt, savedTabs }),
    ]);
    assert.ok([200, 409].includes(tabResponse.status));
    assert.equal(resetResponse.status, 200);

    // If the versioned tab save happened second it correctly conflicted. Retry
    // from the returned revision, exactly as a rehydrated client can.
    if (tabResponse.status === 409) {
      const conflict = await tabResponse.json() as { layout: { updatedAt: number } };
      assert.equal((await put({ expectedUpdatedAt: conflict.layout.updatedAt, savedTabs })).status, 200);
    }
    const current = layouts.getUserChromeLayout(agencyId, userId);
    assert.deepEqual(current.panelOrder, []);
    assert.deepEqual(current.itemOrder, {});
    assert.equal(current.savedTabs[0]?.id, "tab_a");
  });

  it("refuses a malformed revision instead of treating it as an unversioned write", async () => {
    const response = await put({ expectedUpdatedAt: "0", panelOrder: ["wrong"] });
    assert.equal(response.status, 400);
    assert.deepEqual(layouts.getUserChromeLayout(agencyId, userId).panelOrder, []);
  });
});
