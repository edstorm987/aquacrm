// Mounted Marketing records across REAL processes (issue #82).
//
// Channel/funnel assets and customer profiles write independent by-id rows
// under `withMarketingRecordLock`, which hands its work to the storage port's
// exclusive lane — on the file backend a cross-process transaction that
// re-hydrates before the work runs. `smoke-marketing-record-concurrency`
// proves the versioned compare-and-set with two SIMULATED instances in one
// process; this suite proves it with separate Node processes on one shared
// PORTAL_DATA_FILE behind a filesystem barrier, the same shape as
// smoke-marketing-durable-processes and smoke-commercial-durable-processes.
process.env.PORTAL_BACKEND ??= "memory";

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

const require_ = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsxLoader = require_.resolve("tsx");
const sandbox = mkdtempSync(join(tmpdir(), "aqua-marketing-records-durable-"));

const childSource = String.raw`
const { createRequire } = await import("node:module");
const { access, writeFile } = await import("node:fs/promises");
const { join } = await import("node:path");
const require_ = createRequire(join(process.cwd(), "aqua-marketing-records-child.cjs"));
const input = JSON.parse(process.env.AQUA_TEST_INPUT || "{}");
const storageModule = require_("./src/server/storage");
const tenants = require_("./src/server/tenants");
const installs = require_("./src/server/pluginInstalls");
const { makePluginStorage } = require_("./src/lib/server/pluginStorage");
const assets = require_("./src/built-ins/modules/agency-marketing/src/api/handlers");
const profiles = require_("./src/built-ins/modules/agency-marketing/src/api/handlers-customer-profiles");

async function reply(response) {
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body };
}

try {
  await storageModule.ensureHydrated();
  let result;
  if (input.action === "seed") {
    const agency = tenants.createAgency({ name: "Marketing records durable" });
    const install = installs.upsertInstall({ pluginId: "agency-marketing", scope: { agencyId: agency.id }, enabled: true, config: {}, features: {}, installedBy: "durable" });
    result = { agencyId: agency.id, installId: install.id };
  } else {
    if (input.readyPath) {
      await writeFile(input.readyPath, "ready", "utf8");
      while (true) {
        try { await access(input.goPath); break; }
        catch { await new Promise(resolve => setTimeout(resolve, 10)); }
      }
    }
    const ctx = { agencyId: input.agencyId, storage: makePluginStorage(input.installId) };
    const headers = { "content-type": "application/json" };
    if (input.action === "asset-create") {
      result = await reply(await assets.createMarketingAssetHandler(new Request("http://localhost/assets", { method: "POST", headers, body: JSON.stringify({ kind: "social", name: input.name, platform: "LinkedIn", status: "active" }) }), ctx));
    } else if (input.action === "asset-update") {
      result = await reply(await assets.updateMarketingAssetHandler(new Request("http://localhost/assets", { method: "PATCH", headers, body: JSON.stringify({ id: input.id, patch: { name: input.name }, expectedUpdatedAt: input.expectedUpdatedAt }) }), ctx));
    } else if (input.action === "asset-delete") {
      const query = input.expectedUpdatedAt !== undefined ? "&updatedAt=" + input.expectedUpdatedAt : "";
      result = await reply(await assets.deleteMarketingAssetHandler(new Request("http://localhost/assets?id=" + input.id + query, { method: "DELETE" }), ctx));
    } else if (input.action === "asset-list") {
      result = await reply(await assets.listMarketingAssetsHandler(new Request("http://localhost/assets"), ctx));
    } else if (input.action === "profile-create") {
      result = await reply(await profiles.customerProfilesHandler(new Request("http://localhost/customer-profiles", { method: "POST", headers, body: JSON.stringify({ name: input.name, audienceType: "business", status: "active" }) }), ctx));
    } else if (input.action === "profile-update") {
      result = await reply(await profiles.customerProfilesHandler(new Request("http://localhost/customer-profiles", { method: "PATCH", headers, body: JSON.stringify({ id: input.id, patch: { name: input.name }, expectedUpdatedAt: input.expectedUpdatedAt }) }), ctx));
    } else if (input.action === "profile-delete") {
      const query = input.expectedUpdatedAt !== undefined ? "&updatedAt=" + input.expectedUpdatedAt : "";
      result = await reply(await profiles.customerProfilesHandler(new Request("http://localhost/customer-profiles?id=" + input.id + query, { method: "DELETE" }), ctx));
    } else if (input.action === "profile-list") {
      result = await reply(await profiles.customerProfilesHandler(new Request("http://localhost/customer-profiles"), ctx));
    } else {
      throw new Error("unknown action " + input.action);
    }
  }
  if (typeof storageModule.flushPendingWrites === "function") await storageModule.flushPendingWrites();
  process.stdout.write(JSON.stringify({ ok: true, result }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.stack || error.message : String(error) }));
}
`;

interface ChildResult { ok: boolean; result?: unknown; error?: string }
interface Reply { status: number; body: Record<string, unknown> & { asset?: Record<string, unknown>; profile?: Record<string, unknown>; assets?: Array<Record<string, unknown>>; profiles?: Array<Record<string, unknown>> } }

function runChild(dataFile: string, input: Record<string, unknown>): Promise<ChildResult> {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, [
      "--conditions=react-server",
      "--import",
      tsxLoader,
      "--input-type=module",
      "--eval",
      childSource,
    ], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORTAL_BACKEND: "file",
        PORTAL_DATA_FILE: dataFile,
        PORTAL_SESSION_SECRET: "marketing-records-durable-process-test-secret",
        TSX_TSCONFIG_PATH: join(root, "tsconfig.json"),
        AQUA_TEST_INPUT: JSON.stringify(input),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", rejectChild);
    child.on("close", code => {
      if (code !== 0) return rejectChild(new Error(`child exited ${code}: ${stderr || stdout}`));
      try { resolveChild(JSON.parse(stdout) as ChildResult); }
      catch { rejectChild(new Error(`child returned non-JSON output: ${stdout}\n${stderr}`)); }
    });
  });
}

async function waitFor(path: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try { await access(path); return; }
    catch { await new Promise(resolveWait => setTimeout(resolveWait, 10)); }
  }
  throw new Error(`child did not reach barrier: ${path}`);
}

async function collideMany(dataFile: string, common: Record<string, unknown>, workers: Array<Record<string, unknown>>): Promise<ChildResult[]> {
  const barrier = join(sandbox, `barrier-${Math.random().toString(36).slice(2)}`);
  await mkdir(barrier, { recursive: true });
  const goPath = join(barrier, "go");
  const readyPaths = workers.map((_, index) => join(barrier, `worker-${index}`));
  const results = workers.map((worker, index) => runChild(dataFile, { ...common, ...worker, readyPath: readyPaths[index], goPath }));
  await Promise.all(readyPaths.map(waitFor));
  await writeFile(goPath, "go", "utf8");
  return Promise.all(results);
}

function replyOf(result: ChildResult, label: string): Reply {
  assert.equal(result.ok, true, `${label}: ${result.error}`);
  return result.result as Reply;
}

async function seed(dataFile: string) {
  const seeded = await runChild(dataFile, { action: "seed" });
  assert.equal(seeded.ok, true, seeded.error);
  return seeded.result as { agencyId: string; installId: string };
}

after(async () => { await rm(sandbox, { recursive: true, force: true }); });

describe("real-process Marketing record durability", () => {
  it("simultaneous asset and profile creates from separate processes all survive and a fresh process lists them", async () => {
    const dataFile = join(sandbox, "creates.json");
    const world = await seed(dataFile);
    const results = await collideMany(dataFile, world, [
      { action: "asset-create", name: "Asset alpha" },
      { action: "asset-create", name: "Asset bravo" },
      { action: "profile-create", name: "Profile alpha" },
      { action: "profile-create", name: "Profile bravo" },
    ]);
    assert.deepEqual(results.map((result, index) => replyOf(result, `create ${index}`).status), [201, 201, 201, 201]);
    const assets = replyOf(await runChild(dataFile, { ...world, action: "asset-list" }), "asset list").body.assets ?? [];
    assert.deepEqual(assets.map(asset => asset.name).sort(), ["Asset alpha", "Asset bravo"], "no create may replace another's row");
    const profiles = replyOf(await runChild(dataFile, { ...world, action: "profile-list" }), "profile list").body.profiles ?? [];
    assert.deepEqual(profiles.map(profile => profile.name).sort(), ["Profile alpha", "Profile bravo"]);
  });

  it("two processes editing the same asset version yield one 200 and one visible 409, and a stale delete from another process is refused", async () => {
    const dataFile = join(sandbox, "asset-edits.json");
    const world = await seed(dataFile);
    const created = replyOf(await runChild(dataFile, { ...world, action: "asset-create", name: "Shared asset" }), "create");
    const asset = created.body.asset as { id: string; updatedAt: number };
    const [left, right] = await collideMany(dataFile, { ...world, action: "asset-update", id: asset.id, expectedUpdatedAt: asset.updatedAt }, [
      { name: "Left edit" },
      { name: "Right edit" },
    ]);
    const statuses = [replyOf(left, "left").status, replyOf(right, "right").status].sort();
    assert.deepEqual(statuses, [200, 409], "exactly one of two same-version edits wins across processes");
    const listed = replyOf(await runChild(dataFile, { ...world, action: "asset-list" }), "list").body.assets ?? [];
    assert.equal(listed.length, 1);
    const winner = [replyOf(left, "left"), replyOf(right, "right")].find(reply => reply.status === 200)!.body.asset as { name: string; updatedAt: number };
    assert.equal(listed[0].name, winner.name, "the stored row is the winner's, not a merge of both");
    assert.equal(listed[0].updatedAt, winner.updatedAt);
    assert.ok(winner.updatedAt > asset.updatedAt, "the version advanced exactly once");

    const stale = replyOf(await runChild(dataFile, { ...world, action: "asset-delete", id: asset.id, expectedUpdatedAt: asset.updatedAt }), "stale delete");
    assert.equal(stale.status, 409, "a delete raised on the pre-edit version is refused");
    assert.equal((replyOf(await runChild(dataFile, { ...world, action: "asset-list" }), "list after stale delete").body.assets ?? []).length, 1);
    const fresh = replyOf(await runChild(dataFile, { ...world, action: "asset-delete", id: asset.id, expectedUpdatedAt: winner.updatedAt }), "fresh delete");
    assert.equal(fresh.status, 200);
    assert.equal((replyOf(await runChild(dataFile, { ...world, action: "asset-list" }), "list after delete").body.assets ?? []).length, 0);
  });

  it("two processes editing the same customer profile version yield one 200 and one visible 409, and a reload shows the winner", async () => {
    const dataFile = join(sandbox, "profile-edits.json");
    const world = await seed(dataFile);
    const created = replyOf(await runChild(dataFile, { ...world, action: "profile-create", name: "Shared profile" }), "create");
    const profile = created.body.profile as { id: string; updatedAt: number };
    const [left, right] = await collideMany(dataFile, { ...world, action: "profile-update", id: profile.id, expectedUpdatedAt: profile.updatedAt }, [
      { name: "Left profile edit" },
      { name: "Right profile edit" },
    ]);
    const replies = [replyOf(left, "left"), replyOf(right, "right")];
    assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 409]);
    const refused = replies.find(reply => reply.status === 409)!;
    assert.match(String(refused.body.error), /changed in another tab/);
    const winner = replies.find(reply => reply.status === 200)!.body.profile as { name: string; updatedAt: number };
    const listed = replyOf(await runChild(dataFile, { ...world, action: "profile-list" }), "list").body.profiles ?? [];
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, winner.name);
    const staleDelete = replyOf(await runChild(dataFile, { ...world, action: "profile-delete", id: profile.id, expectedUpdatedAt: profile.updatedAt }), "stale delete");
    assert.equal(staleDelete.status, 409);
    const freshDelete = replyOf(await runChild(dataFile, { ...world, action: "profile-delete", id: profile.id, expectedUpdatedAt: winner.updatedAt }), "fresh delete");
    assert.equal(freshDelete.status, 200);
    assert.equal((replyOf(await runChild(dataFile, { ...world, action: "profile-list" }), "list after delete").body.profiles ?? []).length, 0);
  });
});
