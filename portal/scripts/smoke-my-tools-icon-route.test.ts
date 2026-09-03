// Behavioural acceptance for My Tools' two server boundaries.
//
// The palette smoke keeps fast source-shape pins. This file invokes the real
// route handlers against the memory backend so a passing regex cannot conceal
// a caller-scope leak, a forged private-storage key, or an orphaned icon.

import { withRequestScope, withSession } from "./dev-console-request-scope";

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ORIGINAL_CWD = process.cwd();
const PORTAL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_KEYS = [
  "PORTAL_BACKEND",
  "PORTAL_SESSION_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_STORE_ID",
  "VERCEL_OIDC_TOKEN",
  "VERCEL_ENV",
  "VERCEL",
  "NODE_ENV",
] as const;
const ORIGINAL_ENV = new Map(ENV_KEYS.map(key => [key, process.env[key]]));

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "my-tools-icon-route-smoke-secret";
process.env.NODE_ENV = "test";
for (const key of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_STORE_ID",
  "VERCEL_OIDC_TOKEN",
  "VERCEL_ENV",
  "VERCEL",
] as const) delete process.env[key];

const require_ = createRequire(import.meta.url);
const serverOnly = require_.resolve("server-only");
require_.cache[serverOnly] = {
  id: serverOnly, filename: serverOnly, loaded: true, exports: {}, paths: [], children: [],
} as never;

type Auth = typeof import("../src/lib/server/auth/auth");
type IconRoute = typeof import("../src/app/api/portal/chrome/tools/[toolId]/icon/route");
type LayoutRoute = typeof import("../src/app/api/portal/chrome/layout/route");
type Layouts = typeof import("../src/lib/server/chrome/userChromeLayout");
type NextServer = typeof import("next/server");
type PrivateObjectLifecycle = typeof import("../src/lib/server/privateObjectLifecycle");
type SavedToolIconAsset = import("../src/server/types").SavedToolIconAsset;
type Storage = typeof import("../src/server/storage");
type Users = typeof import("../src/server/users");

let auth: Auth;
let iconRoute: IconRoute;
let layoutRoute: LayoutRoute;
let layouts: Layouts;
let nextServer: NextServer;
let privateObjectLifecycle: PrivateObjectLifecycle;
let storage: Storage;
let users: Users;
let tempRoot = "";

interface Actor {
  agencyId: string;
  id: string;
  token: string;
}

interface World {
  owner: Actor;
  other: Actor;
}

const TOOL_ID = "tool_a";
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function tokenFor(user: ReturnType<Users["createUser"]>): string {
  return auth.issueSession({
    userId: user.id,
    email: user.email,
    role: user.role,
    agencyId: user.agencyId,
    sessionRev: user.sessionRev,
    accessRev: user.accessRev,
  });
}

function iconContext(toolId = TOOL_ID): Parameters<IconRoute["GET"]>[1] {
  return { params: Promise.resolve({ toolId }) };
}

function iconRequest(
  method: "GET" | "POST" | "DELETE",
  token?: string,
  body?: FormData,
): InstanceType<NextServer["NextRequest"]> {
  return new nextServer.NextRequest(`http://localhost/api/portal/chrome/tools/${TOOL_ID}/icon`, {
    method,
    headers: token ? { cookie: `${auth.SESSION_COOKIE_NAME}=${token}` } : undefined,
    body,
  });
}

function upload(file: File): FormData {
  const form = new FormData();
  form.set("file", file);
  return form;
}

function iconPath(storageKey: string): string {
  return resolve(tempRoot, ".data", "saved-tool-icons", storageKey);
}

async function iconFiles(directory = resolve(tempRoot, ".data", "saved-tool-icons")): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await iconFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

function layoutPut(token: string, body: unknown): Promise<Response> {
  return withSession(token, () => layoutRoute.PUT(new Request(
    "http://localhost/api/portal/chrome/layout",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  )));
}

async function retainFailedIconCleanup(
  world: World,
  asset: SavedToolIconAsset,
  objectId: string,
): Promise<void> {
  const requestHash = privateObjectLifecycle.privateObjectRequestHash([
    "saved-tool-icon-delete",
    world.owner.agencyId,
    world.owner.id,
    TOOL_ID,
    asset.storageProvider,
    asset.storageKey,
  ]);
  const failed = await privateObjectLifecycle.deletePrivateObjectWithRecovery({
    agencyId: world.owner.agencyId,
    purpose: "saved-tool-icon-delete",
    objectId,
    requestHash,
    localDirectory: "saved-tool-icons",
    prepare: () => ({
      snapshot: asset,
      storageProvider: asset.storageProvider,
      storageKey: asset.storageKey,
      metadata: { userId: world.owner.id, toolId: TOOL_ID },
    }),
    completedSnapshot: snapshot => ({ fileName: snapshot.fileName }),
    providers: { local: async () => { throw new Error("forced retained cleanup refusal"); } },
  });
  assert.equal(failed.ok, false, "the fixture did not retain a failed cleanup pointer");
}

async function seedWorld(): Promise<World> {
  // Each test owns one mkdtemp root. Clear only its generated local bytes so a
  // prior assertion cannot make a later file-count check pass or fail.
  await rm(resolve(tempRoot, ".data"), { recursive: true, force: true });
  await storage.reset();
  const agencyId = "agency_my_tools";
  const ownerUser = users.createUser({
    email: "owner@my-tools.test",
    password: "Safe-pass-123!",
    name: "Owner",
    role: "agency-owner",
    agencyId,
  });
  const otherUser = users.createUser({
    email: "other@my-tools.test",
    password: "Safe-pass-123!",
    name: "Other person",
    role: "agency-staff",
    agencyId,
  });
  const baseLayout = {
    panelOrder: [],
    itemOrder: {},
    savedTabs: [],
    savedToolFolders: [],
    topbarControls: [],
  };
  const tool = {
    id: TOOL_ID,
    label: "Tool A",
    url: "https://example.com",
    order: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  layouts.saveUserChromeLayout(agencyId, ownerUser.id, { ...baseLayout, savedTools: [tool] });
  // Deliberately reuse the public card id. Route ownership must come from the
  // session-scoped layout, never from the guessability or uniqueness of an id.
  layouts.saveUserChromeLayout(agencyId, otherUser.id, { ...baseLayout, savedTools: [tool] });
  return {
    owner: { agencyId, id: ownerUser.id, token: tokenFor(ownerUser) },
    other: { agencyId, id: otherUser.id, token: tokenFor(otherUser) },
  };
}

before(async () => {
  // All imports that pull in Next happen after dev-console-request-scope has
  // installed AsyncLocalStorage and after `server-only` is stubbed for Node.
  auth = await import("../src/lib/server/auth/auth");
  iconRoute = await import("../src/app/api/portal/chrome/tools/[toolId]/icon/route");
  layoutRoute = await import("../src/app/api/portal/chrome/layout/route");
  layouts = await import("../src/lib/server/chrome/userChromeLayout");
  nextServer = await import("next/server");
  privateObjectLifecycle = await import("../src/lib/server/privateObjectLifecycle");
  storage = await import("../src/server/storage");
  users = await import("../src/server/users");
  tempRoot = await mkdtemp(join(tmpdir(), "aquacrm-my-tools-icons-"));
  process.chdir(tempRoot);
  await storage.ensureHydrated();
});

after(async () => {
  try {
    await storage.reset();
  } finally {
    process.chdir(ORIGINAL_CWD);
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
    restoreEnv();
  }
});

describe("saved tool icon route", { concurrency: false }, () => {
  it("uploads, reads and deletes exact private bytes for only the caller", async () => {
    const world = await seedWorld();
    assert.equal((await iconRoute.GET(iconRequest("GET"), iconContext())).status, 401);
    assert.equal((await iconRoute.GET(iconRequest("GET", world.owner.token), iconContext())).status, 404);

    const posted = await iconRoute.POST(iconRequest(
      "POST",
      world.owner.token,
      upload(new File([PIXEL_PNG], "pixel.png", { type: "image/png" })),
    ), iconContext());
    const postedBody = await posted.json() as { ok?: boolean };
    assert.equal(posted.status, 201);
    assert.equal(postedBody.ok, true);

    const ownerLayout = layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id);
    const asset = ownerLayout.savedTools[0]?.iconAsset;
    assert.ok(asset, "the successful upload was not attached to its tool");
    assert.equal(asset.storageProvider, "local");
    const localPath = resolve(tempRoot, ".data", "saved-tool-icons", asset.storageKey);
    assert.equal(existsSync(localPath), true, "the acknowledged icon bytes were not stored");

    const read = await iconRoute.GET(iconRequest("GET", world.owner.token), iconContext());
    assert.equal(read.status, 200);
    assert.equal(read.headers.get("content-type"), "image/png");
    assert.equal(read.headers.get("content-length"), String(PIXEL_PNG.length));
    assert.equal(read.headers.get("cache-control"), "private, no-store, max-age=0",
      "authenticated icon bytes can survive an account switch in the browser cache");
    assert.equal(read.headers.get("pragma"), "no-cache");
    assert.equal(read.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Buffer.from(await read.arrayBuffer()), PIXEL_PNG);

    assert.equal((await iconRoute.GET(iconRequest("GET", world.other.token), iconContext())).status, 404,
      "another person read an icon by guessing its tool id");
    // The other account owns a card with the same id but no icon. Its delete is
    // its own idempotent no-op and must not address the owner's storage object.
    assert.equal((await iconRoute.DELETE(iconRequest("DELETE", world.other.token), iconContext())).status, 200);
    assert.equal((await iconRoute.GET(iconRequest("GET", world.owner.token), iconContext())).status, 200,
      "another person's delete removed the owner's icon");

    assert.equal((await iconRoute.DELETE(iconRequest("DELETE", world.owner.token), iconContext())).status, 200);
    assert.equal(layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id).savedTools[0]?.iconAsset, undefined);
    assert.equal(existsSync(localPath), false, "DELETE cleared metadata but left its local private bytes behind");
    assert.equal((await iconRoute.GET(iconRequest("GET", world.owner.token), iconContext())).status, 404);
    assert.equal((await iconRoute.DELETE(iconRequest("DELETE", world.owner.token), iconContext())).status, 200,
      "deleting an already-absent icon is not idempotent");
  });

  it("refuses missing, empty, oversized, unsupported, absent-tool and unauthenticated uploads", async () => {
    const world = await seedWorld();
    assert.equal((await iconRoute.POST(iconRequest("POST", world.owner.token, new FormData()), iconContext())).status, 400);
    assert.equal((await iconRoute.POST(iconRequest(
      "POST", world.owner.token, upload(new File([], "empty.png", { type: "image/png" })),
    ), iconContext())).status, 413);
    assert.equal((await iconRoute.POST(iconRequest(
      "POST", world.owner.token, upload(new File([new Uint8Array(512 * 1024 + 1)], "large.png", { type: "image/png" })),
    ), iconContext())).status, 413);
    assert.equal((await iconRoute.POST(iconRequest(
      "POST", world.owner.token, upload(new File(["<svg/>"], "vector.svg", { type: "image/svg+xml" })),
    ), iconContext())).status, 415);
    assert.equal((await iconRoute.POST(iconRequest(
      "POST", world.owner.token, upload(new File([PIXEL_PNG], "pixel.png", { type: "image/png" })),
    ), iconContext("missing_tool"))).status, 404);
    assert.equal((await iconRoute.POST(iconRequest(
      "POST", undefined, upload(new File([PIXEL_PNG], "pixel.png", { type: "image/png" })),
    ), iconContext())).status, 401);
  });

  it("serialises concurrent replacements and delete so exactly the final owner survives", async () => {
    const world = await seedWorld();
    const first = await iconRoute.POST(iconRequest(
      "POST", world.owner.token, upload(new File([PIXEL_PNG], "first.png", { type: "image/png" })),
    ), iconContext());
    assert.equal(first.status, 201);
    const firstAsset = layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id).savedTools[0]?.iconAsset;
    assert.ok(firstAsset);
    const firstPath = iconPath(firstAsset.storageKey);

    const secondBytes = Buffer.concat([PIXEL_PNG, Buffer.from([0x42])]);
    const thirdBytes = Buffer.concat([PIXEL_PNG, Buffer.from([0x43])]);
    const [second, third] = await Promise.all([
      iconRoute.POST(iconRequest(
        "POST", world.owner.token, upload(new File([secondBytes], "second.png", { type: "image/png" })),
      ), iconContext()),
      iconRoute.POST(iconRequest(
        "POST", world.owner.token, upload(new File([thirdBytes], "third.png", { type: "image/png" })),
      ), iconContext()),
    ]);
    assert.deepEqual([second.status, third.status], [201, 201]);
    assert.equal(second.headers.get("cache-control"), "no-store");
    assert.equal(third.headers.get("cache-control"), "no-store");
    const replacementBodies = await Promise.all([
      second.json() as Promise<{ ok?: boolean; cleanupPending?: boolean }>,
      third.json() as Promise<{ ok?: boolean; cleanupPending?: boolean }>,
    ]);
    assert.deepEqual(replacementBodies.map(body => body.ok), [true, true]);
    assert.deepEqual(replacementBodies.map(body => body.cleanupPending), [false, false]);

    let finalLayout = layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id);
    let finalAsset = finalLayout.savedTools[0]?.iconAsset;
    assert.ok(finalAsset, "two successful replacements left no owning icon");
    assert.equal(existsSync(firstPath), false, "the first replaced icon was orphaned");
    assert.deepEqual(await iconFiles(), [iconPath(finalAsset.storageKey)],
      "concurrent replacements left more than the one owner-referenced file");
    const finalRead = await iconRoute.GET(iconRequest("GET", world.owner.token), iconContext());
    assert.equal(finalRead.status, 200);
    const finalBytes = Buffer.from(await finalRead.arrayBuffer());
    assert.ok(finalBytes.equals(secondBytes) || finalBytes.equals(thirdBytes),
      "the final owner points at neither successfully uploaded replacement");

    const beforeReplaceDeletePath = iconPath(finalAsset.storageKey);
    const fourthBytes = Buffer.concat([PIXEL_PNG, Buffer.from([0x44])]);
    const [replacement, deletion] = await Promise.all([
      iconRoute.POST(iconRequest(
        "POST", world.owner.token, upload(new File([fourthBytes], "fourth.png", { type: "image/png" })),
      ), iconContext()),
      iconRoute.DELETE(iconRequest("DELETE", world.owner.token), iconContext()),
    ]);
    assert.deepEqual([replacement.status, deletion.status], [201, 200]);
    assert.equal(replacement.headers.get("cache-control"), "no-store");
    assert.equal(deletion.headers.get("cache-control"), "no-store");
    assert.equal(existsSync(beforeReplaceDeletePath), false,
      "the icon owned before the replacement/delete race was retained without an owner");

    finalLayout = layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id);
    finalAsset = finalLayout.savedTools[0]?.iconAsset;
    const files = await iconFiles();
    if (finalAsset) {
      assert.deepEqual(files, [iconPath(finalAsset.storageKey)]);
      const read = await iconRoute.GET(iconRequest("GET", world.owner.token), iconContext());
      assert.equal(read.status, 200);
      assert.deepEqual(Buffer.from(await read.arrayBuffer()), fourthBytes,
        "replacement won the race but the surviving owner points at stale bytes");
      assert.equal((await iconRoute.DELETE(iconRequest("DELETE", world.owner.token), iconContext())).status, 200);
    } else {
      assert.deepEqual(files, [], "delete won the race but a detached replacement file survived");
      assert.equal((await iconRoute.GET(iconRequest("GET", world.owner.token), iconContext())).status, 404);
    }
    assert.equal(privateObjectLifecycle.pendingPrivateObjectDeletionSnapshots(
      world.owner.agencyId,
      "saved-tool-icon-delete",
    ).length, 0, "a successful concurrent operation left a cleanup retry outstanding");
    assert.deepEqual(await iconFiles(), []);
  });

  it("retains a refused deletion pointer and the next icon command retries it", async () => {
    const world = await seedWorld();
    const posted = await iconRoute.POST(iconRequest(
      "POST", world.owner.token, upload(new File([PIXEL_PNG], "retry.png", { type: "image/png" })),
    ), iconContext());
    assert.equal(posted.status, 201);
    const asset = layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id).savedTools[0]?.iconAsset;
    assert.ok(asset);
    const localPath = iconPath(asset.storageKey);
    const objectId = "forced-delete-refusal";
    const requestHash = privateObjectLifecycle.privateObjectRequestHash([
      "saved-tool-icon-delete",
      world.owner.agencyId,
      world.owner.id,
      TOOL_ID,
      asset.storageProvider,
      asset.storageKey,
    ]);
    const failed = await privateObjectLifecycle.deletePrivateObjectWithRecovery({
      agencyId: world.owner.agencyId,
      purpose: "saved-tool-icon-delete",
      objectId,
      requestHash,
      localDirectory: "saved-tool-icons",
      prepare: state => {
        const key = layouts.chromeLayoutKey(world.owner.agencyId, world.owner.id);
        const latest = layouts.normaliseLayout(state.userChromeLayouts[key], world.owner.agencyId, world.owner.id);
        const now = latest.updatedAt + 1;
        state.userChromeLayouts[key] = layouts.normaliseLayout({
          ...latest,
          savedTools: latest.savedTools.map(tool => tool.id === TOOL_ID
            ? { ...tool, iconAsset: undefined, updatedAt: now }
            : tool),
          updatedAt: now,
        }, world.owner.agencyId, world.owner.id);
        return {
          snapshot: asset,
          storageProvider: asset.storageProvider,
          storageKey: asset.storageKey,
          metadata: { userId: world.owner.id, toolId: TOOL_ID },
        };
      },
      completedSnapshot: snapshot => ({ fileName: snapshot.fileName }),
      providers: { local: async () => { throw new Error("forced local deletion refusal"); } },
    });
    assert.equal(failed.ok, false);
    assert.equal(layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id).savedTools[0]?.iconAsset, undefined,
      "provider refusal restored a live owner pointer to a file being retired");
    assert.equal(existsSync(localPath), true, "the refusing provider unexpectedly removed the test file");

    const pending = privateObjectLifecycle.pendingPrivateObjectDeletionSnapshots<NonNullable<typeof asset>>(
      world.owner.agencyId,
      "saved-tool-icon-delete",
    );
    assert.equal(pending.length, 1, "the failed cleanup lost its retry pointer");
    assert.equal(pending[0]?.record.state, "delete-failed");
    assert.equal(pending[0]?.record.storageKey, asset.storageKey);
    assert.equal(pending[0]?.record.metadata?.userId, world.owner.id);
    assert.equal(pending[0]?.record.metadata?.toolId, TOOL_ID);
    assert.equal(pending[0]?.snapshot.storageKey, asset.storageKey);

    const retried = await iconRoute.DELETE(iconRequest("DELETE", world.owner.token), iconContext());
    const retryBody = await retried.json() as { ok?: boolean; cleanupPending?: boolean };
    assert.equal(retried.status, 200);
    assert.equal(retried.headers.get("cache-control"), "no-store");
    assert.equal(retryBody.ok, true);
    assert.equal(retryBody.cleanupPending, false);
    assert.equal(existsSync(localPath), false, "the next command did not replay the retained provider deletion");
    assert.equal(privateObjectLifecycle.pendingPrivateObjectDeletionSnapshots(
      world.owner.agencyId,
      "saved-tool-icon-delete",
    ).length, 0);
  });

  it("reports cleanup pending when an older refusal survives after the current icon deletes", async () => {
    const world = await seedWorld();
    const posted = await iconRoute.POST(iconRequest(
      "POST", world.owner.token, upload(new File([PIXEL_PNG], "current.png", { type: "image/png" })),
    ), iconContext());
    assert.equal(posted.status, 201);
    const currentAsset = layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id).savedTools[0]?.iconAsset;
    assert.ok(currentAsset);
    const currentPath = iconPath(currentAsset.storageKey);

    // This models an older, already-detached asset. Its path-confinement
    // refusal remains deterministic when the real route replays it.
    const oldAsset = {
      ...currentAsset,
      fileName: "older.png",
      storageKey: "../outside-saved-tool-icons/older.png",
      uploadedAt: currentAsset.uploadedAt - 1,
    };
    await retainFailedIconCleanup(world, oldAsset, "older-cleanup-still-refuses");

    const removed = await iconRoute.DELETE(iconRequest("DELETE", world.owner.token), iconContext());
    const body = await removed.json() as { ok?: boolean; code?: string; cleanupPending?: boolean };
    assert.equal(removed.status, 503,
      "DELETE acknowledged full cleanup even though an older retained pointer still refused deletion");
    assert.equal(body.ok, false);
    assert.equal(body.code, "saved_tool_icon_cleanup_pending");
    assert.equal(body.cleanupPending, true);
    assert.equal(layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id).savedTools[0]?.iconAsset, undefined,
      "the successfully deleted current icon stayed attached");
    assert.equal(existsSync(currentPath), false, "the current icon was not deleted before the partial-cleanup response");
    const pending = privateObjectLifecycle.pendingPrivateObjectDeletionSnapshots(
      world.owner.agencyId,
      "saved-tool-icon-delete",
    );
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.record.objectId, "older-cleanup-still-refuses");
  });
});

describe("chrome layout metadata authority", { concurrency: false }, () => {
  it("canonicalises an existing tool id before preserving its server-owned icon", async () => {
    const world = await seedWorld();
    const realAsset = {
      fileName: "real.png",
      contentType: "image/png" as const,
      size: 12,
      storageProvider: "local" as const,
      storageKey: "owner-scope/real.png",
      uploadedAt: 1,
    };
    const current = layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id);
    layouts.saveUserChromeLayout(world.owner.agencyId, world.owner.id, {
      ...current,
      savedTools: [{ ...current.savedTools[0]!, iconAsset: realAsset }],
    });

    const response = await layoutPut(world.owner.token, {
      savedTools: [{
        ...current.savedTools[0]!,
        id: `  ${TOOL_ID}\n`,
        label: "Whitespace rename",
        iconAsset: { ...realAsset, storageKey: "forged/secret.png" },
      }],
    });
    assert.equal(response.status, 200);
    const stored = layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id);
    assert.equal(stored.savedTools[0]?.id, TOOL_ID);
    assert.equal(stored.savedTools[0]?.label, "Whitespace rename");
    assert.equal(stored.savedTools[0]?.iconAsset?.storageKey, realAsset.storageKey,
      "normalisation changed the id before the metadata-authority lookup and silently detached its icon");
  });

  it("preserves server-owned icon identity and blocks every orphan path", async () => {
    const world = await seedWorld();
    const realAsset = {
      fileName: "real.png",
      contentType: "image/png" as const,
      size: 12,
      storageProvider: "local" as const,
      storageKey: "owner-scope/real.png",
      uploadedAt: 1,
    };
    const forgedAsset = {
      ...realAsset,
      fileName: "forged.png",
      storageKey: "another-person/secret.png",
      uploadedAt: 99,
    };
    const folder = { id: "folder_a", name: "Design", order: 0, createdAt: 1, updatedAt: 1 };
    const current = layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id);
    layouts.saveUserChromeLayout(world.owner.agencyId, world.owner.id, {
      ...current,
      savedToolFolders: [folder],
      savedTools: [{ ...current.savedTools[0]!, folderId: folder.id, iconAsset: realAsset }],
    });

    const forged = await layoutPut(world.owner.token, {
      agencyId: "agency_evil",
      userId: "user_evil",
      savedTools: [
        { ...current.savedTools[0]!, label: "Renamed", folderId: folder.id, iconAsset: forgedAsset },
        {
          id: "tool_b", label: "New tool", url: "https://new.example", iconAsset: forgedAsset,
          order: 1, createdAt: 2, updatedAt: 2,
        },
      ],
    });
    assert.equal(forged.status, 200);
    let stored = layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id);
    assert.equal(stored.savedTools[0]?.iconAsset?.storageKey, realAsset.storageKey,
      "the browser replaced the server-owned storage key");
    assert.equal(stored.savedTools[1]?.iconAsset, undefined,
      "a new browser-authored card smuggled in a private storage key");
    assert.equal(stored.savedTools[0]?.label, "Renamed");
    assert.equal(storage.getState().userChromeLayouts["agency_evil|user_evil"], undefined,
      "body-supplied identity redirected a self-layout write");

    const omitted = await layoutPut(world.owner.token, { panelOrder: ["ops"] });
    assert.equal(omitted.status, 200);
    stored = layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id);
    assert.equal(stored.savedTools.length, 2);
    assert.equal(stored.savedToolFolders.length, 1);
    assert.equal(stored.savedTools[0]?.folderId, folder.id,
      "an older chrome client erased palette data it did not send");

    const attachedDelete = await layoutPut(world.owner.token, { savedTools: [stored.savedTools[1]] });
    assert.equal(attachedDelete.status, 409);
    assert.equal((await attachedDelete.json() as { code?: string }).code, "saved_tool_icon_attached");

    const malformedSameId = await layoutPut(world.owner.token, {
      savedTools: [
        { ...stored.savedTools[0]!, label: "", url: "javascript:alert(1)" },
        stored.savedTools[1],
      ],
    });
    assert.equal(malformedSameId.status, 409,
      "a malformed row carried the real id through the raw-id guard, then orphaned its icon when normalization dropped it");
    assert.equal(layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id).savedTools.length, 2);

    const unauthenticated = await withRequestScope({}, () => layoutRoute.PUT(new Request(
      "http://localhost/api/portal/chrome/layout",
      { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" },
    )));
    assert.equal(unauthenticated.status, 401);
  });

  it("refuses account-chrome erasure until its private icons use the lifecycle route", async () => {
    const world = await seedWorld();
    const posted = await iconRoute.POST(iconRequest(
      "POST", world.owner.token, upload(new File([PIXEL_PNG], "erase.png", { type: "image/png" })),
    ), iconContext());
    assert.equal(posted.status, 201);
    const asset = layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id).savedTools[0]?.iconAsset;
    assert.ok(asset);
    const localPath = iconPath(asset.storageKey);

    assert.throws(
      () => layouts.deleteUserChromeLayout(world.owner.agencyId, world.owner.id),
      /saved_tool_icons_require_lifecycle_cleanup/,
      "account erasure dropped the last durable pointer to private icon bytes",
    );
    assert.equal(layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id).savedTools[0]?.iconAsset?.storageKey, asset.storageKey);
    assert.equal(existsSync(localPath), true);

    const removed = await iconRoute.DELETE(iconRequest("DELETE", world.owner.token), iconContext());
    assert.equal(removed.status, 200);
    assert.equal(existsSync(localPath), false);
    assert.doesNotThrow(() => layouts.deleteUserChromeLayout(world.owner.agencyId, world.owner.id));
    assert.equal(storage.getState().userChromeLayouts[
      layouts.chromeLayoutKey(world.owner.agencyId, world.owner.id)
    ], undefined, "chrome erasure still retained its owner record after every icon was cleaned");
  });

  it("refuses account-chrome erasure while a saved-tool icon cleanup is pending", async () => {
    const world = await seedWorld();
    const detachedAsset = {
      fileName: "detached.png",
      contentType: "image/png" as const,
      size: 12,
      storageProvider: "local" as const,
      storageKey: "detached/retained.png",
      uploadedAt: 1,
    };
    await retainFailedIconCleanup(world, detachedAsset, "pending-account-erasure-cleanup");
    const key = layouts.chromeLayoutKey(world.owner.agencyId, world.owner.id);
    assert.equal(layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id).savedTools[0]?.iconAsset, undefined);

    assert.throws(
      () => layouts.deleteUserChromeLayout(world.owner.agencyId, world.owner.id),
      /saved_tool_icons_require_lifecycle_cleanup/,
      "account erasure removed the durable scope needed to retry a retained icon deletion",
    );
    assert.ok(storage.getState().userChromeLayouts[key], "the refusing erasure still removed the chrome record");
    assert.equal(privateObjectLifecycle.pendingPrivateObjectDeletionSnapshots(
      world.owner.agencyId,
      "saved-tool-icon-delete",
    ).length, 1);
  });

  it("refuses account-chrome erasure when malformed raw storage hides an icon owner", async () => {
    const world = await seedWorld();
    const key = layouts.chromeLayoutKey(world.owner.agencyId, world.owner.id);
    const current = layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id);
    const hiddenAsset = {
      fileName: "hidden.png",
      contentType: "image/png" as const,
      size: 12,
      storageProvider: "local" as const,
      storageKey: "hidden/raw-owner.png",
      uploadedAt: 1,
    };
    storage.mutate(state => {
      state.userChromeLayouts[key] = {
        ...current,
        savedTools: [{
          ...current.savedTools[0]!,
          url: "javascript:alert(1)",
          iconAsset: hiddenAsset,
        }],
      };
    });
    assert.equal(layouts.getUserChromeLayout(world.owner.agencyId, world.owner.id).savedTools.length, 0,
      "the fixture's unsafe URL was not dropped by normalisation");
    assert.equal(storage.getState().userChromeLayouts[key]?.savedTools[0]?.iconAsset?.storageKey, hiddenAsset.storageKey);

    assert.throws(
      () => layouts.deleteUserChromeLayout(world.owner.agencyId, world.owner.id),
      /saved_tool_icons_require_lifecycle_cleanup/,
      "account erasure trusted a normalised view that concealed a raw private-icon owner",
    );
    assert.equal(storage.getState().userChromeLayouts[key]?.savedTools[0]?.iconAsset?.storageKey, hiddenAsset.storageKey,
      "the refusing erasure still dropped the only raw owner pointer");
  });
});

describe("chrome client write convergence", { concurrency: false }, () => {
  it("does not fire rapid optimistic writes directly at the same server revision", () => {
    const source = readFileSync(resolve(PORTAL_ROOT, "src/components/chrome/pinnedTabsStore.ts"), "utf8");
    assert.doesNotMatch(source, /void persist\(next, expectedUpdatedAt\)/,
      "rapid fire-and-forget writes race with the same expectedUpdatedAt and can lose a user's later action");
    assert.match(source, /(?:persist|write|mutation)[A-Za-z]*(?:queue|tail|chain)|(?:queue|tail|chain)[A-Za-z]*(?:persist|write|mutation)/i,
      "the client store has no explicit per-account serial write lane");
    assert.match(source, /(?:retry|replay|conflict)/i,
      "a refused queued write is not replayed against the authoritative revision");
  });
});
