// Plugin health — the route that finally asks.
//
// Ten of the thirteen modules implement `healthcheck`, and until 2026-08-28
// nothing in the host called a single one. `smoke-manifest-fields-consumed.test.ts`
// is the sweep that found it; this is the contract for the consumer that fixed it.
//
// The behaviours below are the ones a health surface gets wrong in ways that
// make it worse than having none:
//
//   • a module with no hook reported as UNHEALTHY (it is unknown, not broken);
//   • one throwing module taking the whole report down;
//   • a slow module hanging the request;
//   • a summary that disagrees with the rows it summarises.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";

const ROUTE = "src/app/api/portal/plugins/health/route.ts";
const source = readFileSync(ROUTE, "utf8");

describe("the plugin health route", () => {
  it("exists and is a GET", () => {
    assert.match(source, /export async function GET\(/);
  });

  it("is gated and tenant-scoped like every other plugin-scoped route", () => {
    assert.match(source, /requireRole\(VIEWERS\)/, "it must require an agency role");
    assert.match(source, /routeTenantScope\(session, \{ clientId: requestedClientId \}\)/,
      "a clientId in the query must go through the shared tenant resolution, not be trusted");
    assert.match(source, /client not found/, "…and an unresolvable client must 404");
  });

  it("treats a module with no healthcheck as unsupported, never as unhealthy", () => {
    // The distinction Radar already insists on: missing evidence is a blind
    // spot, not a pass and not a failure.
    assert.match(source, /if \(!plugin\?\.healthcheck\)/);
    assert.match(source, /supported: false/);
    const unsupportedBranch = /if \(!plugin\?\.healthcheck\) \{[\s\S]{0,160}?\}/.exec(source)?.[0] ?? "";
    assert.doesNotMatch(unsupportedBranch, /ok:\s*false/,
      "a module that ships no healthcheck must not be reported as failing one");
  });

  it("bounds every hook, so a slow module cannot hang the request", () => {
    assert.match(source, /HEALTHCHECK_TIMEOUT_MS/, "there must be a timeout constant");
    assert.match(source, /Promise\.race\(\[/, "…and each hook must race it");
    assert.match(source, /clearTimeout\(timer\)/, "…and the timer must always be cleared");
  });

  it("contains a throwing module instead of failing the whole report", () => {
    assert.match(source, /catch \(error\) \{[\s\S]*?supported: true,[\s\S]*?ok: false/,
      "a hook that throws must become one unhealthy row");
    assert.match(source, /error: error instanceof Error \? error\.message : String\(error\)/,
      "…naming the reason, rather than swallowing it");
  });

  it("runs the checks concurrently", () => {
    assert.match(source, /Promise\.all\(installs\.map/,
      "ten sequential I/O checks is a slow page for no reason, and each is already bounded");
  });

  it("computes the summary from the rows it returns", () => {
    // A summary derived anywhere else can disagree with the table under it.
    assert.match(source, /checked: health\.filter/);
    assert.match(source, /unhealthy: health\.filter\(row => row\.supported && row\.status\?\.ok === false\)/,
      "unhealthy must mean 'ran and said no', not 'did not run'");
  });

  it("only asks enabled installs", () => {
    assert.match(source, /install\.enabled/, "a disabled module has no health to report");
  });
});

describe("the modules it asks", () => {
  it("ten of them actually implement a healthcheck", async () => {
    // If this drops, either modules were removed or the field is being
    // abandoned — either way the route's reason for existing has changed.
    const { listPlugins } = await import("../src/built-ins/runtime/_registry");
    const withHook = listPlugins().filter(plugin => typeof plugin.healthcheck === "function");
    assert.ok(
      withHook.length >= 10,
      `expected at least ten modules implementing healthcheck, found ${withHook.length}: `
      + withHook.map(plugin => plugin.id).join(", "),
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AND IT ACTUALLY RUNS — not just "the source has the right shape"
// ══════════════════════════════════════════════════════════════════════════
//
// Everything above reads the file. That is worth having (it pins the reasoning
// at the place someone would change it) but on its own it is the weaker half:
// a route can match every pattern and still 500 on the first request. So the
// real handler is driven with a real session against a real install.

import { withSession } from "./dev-console-request-scope";
import { ensureHydrated } from "../src/server/storage";
import { createAgency, createClient } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import { issueSession } from "../src/lib/server/auth/auth";
import { upsertInstall } from "../src/server/pluginInstalls";
import * as healthRoute from "../src/app/api/portal/plugins/health/route";

interface HealthBody {
  ok?: boolean;
  error?: string;
  health?: Array<{ pluginId: string; supported: boolean; status?: { ok: boolean; message?: string }; error?: string; durationMs: number }>;
  summary?: { checked: number; unsupported: number; unhealthy: number };
}

async function call(token: string, query: string): Promise<{ status: number; body: HealthBody }> {
  const response = await withSession(token, () =>
    healthRoute.GET(new Request(`http://localhost/api/portal/plugins/health${query}`) as never));
  return { status: response.status, body: (await response.json()) as HealthBody };
}

describe("driving the real handler", () => {
  let ownerToken = "";
  let clientId = "";

  before(async () => {
    await ensureHydrated();
    const agency = createAgency({ name: "Health Co", slug: `health-${Date.now().toString(36)}` });
    const owner = createUser({
      email: `owner-${Date.now().toString(36)}@health.test`,
      password: "health-test-2026",
      name: "Health Owner",
      role: "agency-owner",
      agencyId: agency.id,
    });
    // `issueSession` takes an explicit payload, not a User row — passing the
    // row produced a token the auth layer refused with 401.
    ownerToken = issueSession({
      userId: owner.id,
      email: owner.email,
      role: "agency-owner",
      agencyId: agency.id,
    });
    const client = createClient(agency.id, { name: "Health Client" });
    clientId = client.id;
    // client-crm ships a healthcheck; it is the module this route was built for.
    await upsertInstall({
      pluginId: "client-crm",
      scope: { agencyId: agency.id, clientId: client.id },
      enabled: true,
      config: {},
      features: {},
    });
  });

  it("answers a real request and runs the module's own healthcheck", async () => {
    const { status, body } = await call(ownerToken, `?clientId=${encodeURIComponent(clientId)}`);
    assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(body)}`);
    assert.equal(body.ok, true);

    const crm = body.health?.find(row => row.pluginId === "client-crm");
    assert.ok(crm, `client-crm must be reported: ${JSON.stringify(body.health)}`);
    assert.equal(crm.supported, true, "client-crm ships a healthcheck, so it must be asked");
    // The module's own hook returns "<n>/<n> active contacts · <n> segments".
    assert.ok(crm.status, "a supported module must carry a status");
    assert.match(
      crm.status.message ?? "",
      /contacts/,
      "the message must come from the module's own healthcheck, not be synthesised here",
    );
  });

  it("summarises exactly what it reported", async () => {
    const { body } = await call(ownerToken, `?clientId=${encodeURIComponent(clientId)}`);
    const rows = body.health ?? [];
    assert.equal(body.summary?.checked, rows.filter(row => row.supported).length);
    assert.equal(body.summary?.unsupported, rows.filter(row => !row.supported).length);
    assert.equal(
      body.summary?.unhealthy,
      rows.filter(row => row.supported && row.status?.ok === false).length,
      "the summary must be derived from the rows, or the header can contradict the table",
    );
  });

  it("narrows to one module when asked", async () => {
    const { body } = await call(ownerToken, `?clientId=${encodeURIComponent(clientId)}&pluginId=client-crm`);
    assert.deepEqual([...new Set((body.health ?? []).map(row => row.pluginId))], ["client-crm"]);
  });

  it("refuses a client that is not this agency's", async () => {
    const { status } = await call(ownerToken, "?clientId=cli_someone_elses");
    assert.equal(status, 404, "an unresolvable client must not be answered with another scope's health");
  });
});

describe("a healthcheck cannot write", () => {
  // A healthcheck answers a GET, and `makeCtx` hands every hook the module's
  // real read/write storage. Without this, polling health could mutate state —
  // the hidden-write-on-a-read-path class issue #21 removed and that
  // `smoke-read-path-mutations.test.ts` exists to catch. The retention engine
  // answers it the same way, keeping `findExpired` away from `mutate`.

  it("the route hands the hook the read-only wrapper", () => {
    assert.match(readFileSync(ROUTE, "utf8"), /readOnlyPluginStorage\(ctx\.storage/,
      "the healthcheck must receive the wrapper, not the module's real storage");
  });

  it("reads pass through and every write refuses — exercised, not read", async () => {
    const { readOnlyPluginStorage, ReadOnlyPluginStorageError } =
      await import("../src/lib/server/plugins/readOnlyPluginStorage");

    const written: string[] = [];
    const real = {
      get: async (key: string) => `value:${key}`,
      list: async () => ["a", "b"],
      set: async (key: string) => { written.push(key); },
      del: async (key: string) => { written.push(key); },
      setIfAbsent: async (key: string) => { written.push(key); return true; },
      runExclusive: async <T>(_key: string, op: () => Promise<T>) => op(),
    };
    const guarded = readOnlyPluginStorage(real as never, "test hook");

    assert.equal(await guarded.get("k"), "value:k", "reads must still work");
    assert.deepEqual(await guarded.list(), ["a", "b"]);

    await assert.rejects(() => guarded.set("k", 1), ReadOnlyPluginStorageError);
    await assert.rejects(() => guarded.del("k"), ReadOnlyPluginStorageError);
    await assert.rejects(() => guarded.setIfAbsent!("k", 1), ReadOnlyPluginStorageError);
    await assert.rejects(() => guarded.runExclusive!("k", async () => 1), ReadOnlyPluginStorageError);

    assert.deepEqual(written, [], "not one write may reach the real storage");
  });

  it("names the hook in the refusal, so an unhealthy row is actionable", async () => {
    const { readOnlyPluginStorage } = await import("../src/lib/server/plugins/readOnlyPluginStorage");
    const guarded = readOnlyPluginStorage({ get: async () => undefined, list: async () => [] } as never,
      "client-crm healthcheck");
    await assert.rejects(() => guarded.set("k", 1), /client-crm healthcheck attempted to write/);
  });
});
