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
const RUNNER = "src/lib/server/plugins/pluginHealthRunner.ts";
const source = readFileSync(ROUTE, "utf8");
// The asking moved out of the route on 2026-08-30, because the route was not
// the only caller any more: the radar sweep runs the same hooks on a cadence
// and persists what they say. The rules below did not change — they are pinned
// where the code now lives, so one runner serves the live read and the sweep
// and the two can never answer differently.
const runner = readFileSync(RUNNER, "utf8");

describe("the plugin health route", () => {
  it("exists and is a GET", () => {
    assert.match(source, /export async function GET\(/);
  });

  it("delegates the asking to the shared runner rather than keeping a second copy", () => {
    assert.match(source, /runInstallHealthcheck/, "the route must drive the shared runner");
    assert.doesNotMatch(source, /plugin\.healthcheck\(/,
      "a second copy of the hook-running logic is how the panel and Radar start disagreeing");
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
    assert.match(runner, /if \(!plugin\?\.healthcheck\)/);
    assert.match(runner, /supported: false/);
    const unsupportedBranch = /if \(!plugin\?\.healthcheck\) \{[\s\S]{0,160}?\}/.exec(runner)?.[0] ?? "";
    assert.doesNotMatch(unsupportedBranch, /ok:\s*false/,
      "a module that ships no healthcheck must not be reported as failing one");
  });

  it("bounds every hook, so a slow module cannot hang the request", () => {
    assert.match(runner, /HEALTHCHECK_TIMEOUT_MS/, "there must be a timeout constant");
    assert.match(runner, /Promise\.race\(\[/, "…and each hook must race it");
    assert.match(runner, /clearTimeout\(timer\)/, "…and the timer must always be cleared");
  });

  it("contains a throwing module instead of failing the whole report", () => {
    assert.match(runner, /catch \(error\) \{[\s\S]*?supported: true,[\s\S]*?ok: false/,
      "a hook that throws must become one unhealthy row");
    assert.match(runner, /error: error instanceof Error \? error\.message : String\(error\)/,
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

  it("the runner hands the hook the read-only wrapper", () => {
    assert.match(runner, /readOnlyPluginStorage\(ctx\.storage/,
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

// ══════════════════════════════════════════════════════════════════════════
// AND THE ANSWER OUTLIVES THE REQUEST
// ══════════════════════════════════════════════════════════════════════════
//
// Everything above is the LIVE read: ask now, show now, write nothing. That was
// the whole of plugin health until 2026-08-30, and it left the more important
// half undone. Radar's `systems:module-health` counted failures out of
// `PluginInstall.health` — a field with no writer anywhere in `src/` — so it
// reported a confident permanent zero, and the only way to learn a module was
// broken was for a human to open the Dev Console and look.
//
// The sweep is the writer. It runs the same hooks on the radar cadence and
// records each answer on the install, so "no module is failing" becomes
// something that was actually checked. Its acceptance cases are the four states
// an install can be in — answered, answered-badly, asked-but-silent, never
// asked — and every module used below is a REAL one, reporting what it really
// reports in an empty workspace. Nothing here is stubbed: `ecommerce` genuinely
// says no without Stripe keys, `website-editor` genuinely ships no hook, and a
// mis-scoped `agency-hr` genuinely throws out of its own foundation container.

import { getInstall, recordInstallHealth } from "../src/server/pluginInstalls";
import {
  PLUGIN_HEALTH_CADENCE_MS,
  PLUGIN_HEALTH_STALE_MS,
  runPluginHealthSweep,
} from "../src/lib/server/plugins/pluginHealthRunner";

describe("the sweep that persists what the modules said", () => {
  const NOW = Date.parse("2026-08-30T09:00:00.000Z");
  let agencyId = "";
  let sweepClientId = "";
  let sweepToken = "";
  const scope = () => ({ agencyId, clientId: sweepClientId });

  before(async () => {
    await ensureHydrated();
    const agency = createAgency({ name: "Sweep Co", slug: `sweep-${Date.now().toString(36)}` });
    agencyId = agency.id;
    const owner = createUser({
      email: `sweep-${Date.now().toString(36)}@health.test`,
      password: "health-test-2026",
      name: "Sweep Owner",
      role: "agency-owner",
      agencyId: agency.id,
    });
    sweepToken = issueSession({ userId: owner.id, email: owner.email, role: "agency-owner", agencyId: agency.id });
    sweepClientId = createClient(agency.id, { name: "Sweep Client" }).id;
    for (const pluginId of ["client-crm", "ecommerce", "website-editor", "agency-hr"]) {
      await upsertInstall({
        pluginId,
        scope: { agencyId: agency.id, clientId: sweepClientId },
        enabled: true,
        config: {},
        features: {},
      });
    }
  });

  it("the live route writes nothing — health is read there, recorded only by the sweep", async () => {
    const { status } = await call(sweepToken, `?clientId=${encodeURIComponent(sweepClientId)}`);
    assert.equal(status, 200);
    for (const pluginId of ["client-crm", "ecommerce", "website-editor"]) {
      assert.equal(getInstall(scope(), pluginId)?.healthCheckedAt, undefined,
        `${pluginId} was written by a GET — read paths must not mutate (smoke-read-path-mutations)`);
    }
    assert.doesNotMatch(source, /recordInstallHealth|mutate\(/,
      "the route must not acquire a write; the sweep is the writer");
  });

  it("records each module's own verdict, unmodified, on its install", async () => {
    const result = await runPluginHealthSweep(agencyId, { now: NOW });
    assert.ok(result.checked >= 4, `expected every enabled install asked, got ${result.checked}`);

    const crm = getInstall(scope(), "client-crm");
    assert.equal(crm?.healthCheckedAt, NOW, "the check time is the sweep's, not the install's");
    assert.equal(crm?.health?.ok, true);
    assert.match(crm?.health?.message ?? "", /contacts/,
      "the stored message must be the module's own words, not synthesised here");

    // ecommerce reports ok:false in an unconfigured workspace. Before the sweep
    // existed this failure was reachable only by opening the panel.
    const shop = getInstall(scope(), "ecommerce");
    assert.equal(shop?.health?.ok, false, "a module that says no must be stored as no");
    assert.match(shop?.health?.message ?? "", /Stripe/);
    assert.ok(result.unhealthy >= 1, "the sweep must report the failures it recorded");
  });

  it("records a module with no healthcheck as asked-but-silent, never as healthy", () => {
    const editor = getInstall(scope(), "website-editor");
    assert.equal(editor?.healthCheckedAt, NOW, "it WAS asked, and that is a fact worth recording");
    assert.equal(editor?.health, undefined,
      "no hook means no verdict — storing ok:true here would invent an answer nobody gave");
  });

  it("stores the reason when a hook throws, rather than a silent green", () => {
    // A client-scoped agency-hr cannot resolve its own agency container, so its
    // healthcheck throws — exactly the broken state a sweep exists to surface.
    const hr = getInstall(scope(), "agency-hr");
    assert.equal(hr?.health?.ok, false, "a hook that throws is unhealthy, not unknown");
    assert.match(hr?.health?.message ?? "", /agency-hr|not installed/i,
      "the stored message must name why, or an operator learns nothing from it");
  });

  it("honours its cadence, and a forced sweep overrides it", async () => {
    const soon = NOW + PLUGIN_HEALTH_CADENCE_MS - 60_000;
    const skipped = await runPluginHealthSweep(agencyId, { now: soon });
    assert.equal(skipped.checked, 0, "a sweep inside the cadence window must not re-run ten modules' I/O");
    assert.ok(skipped.skipped >= 4);
    assert.equal(getInstall(scope(), "client-crm")?.healthCheckedAt, NOW, "…and must not restamp the answer");

    const forced = await runPluginHealthSweep(agencyId, { now: soon, force: true });
    assert.ok(forced.checked >= 4, "an explicit full scan must re-ask, or it reports yesterday");
    assert.equal(getInstall(scope(), "client-crm")?.healthCheckedAt, soon);

    const due = await runPluginHealthSweep(agencyId, { now: soon + PLUGIN_HEALTH_CADENCE_MS });
    assert.ok(due.checked >= 4, "past the cadence the unforced sweep must ask again");
  });

  it("a module cannot write its own health", () => {
    // The whole value of the field is that the HOST recorded what it saw. A
    // module able to patch its own `health` could mark itself green while
    // broken — the one thing this field must never be able to say.
    const moduleFacing = readFileSync("src/built-ins/runtime/_types.ts", "utf8");
    const patchShape = /export interface PluginInstallPatch \{[\s\S]*?\n\}/.exec(moduleFacing)?.[0] ?? "";
    assert.ok(patchShape, "PluginInstallPatch has moved — re-point this assertion");
    assert.doesNotMatch(patchShape, /health/,
      "the module-facing patch shape must not expose health");
    const store = readFileSync("src/server/pluginInstalls.ts", "utf8");
    const patchFn = /export function patchInstall\([\s\S]*?\n\}/.exec(store)?.[0] ?? "";
    assert.ok(patchFn, "patchInstall has moved — re-point this assertion");
    assert.doesNotMatch(patchFn, /health/,
      "patchInstall is reachable from module code and must not be able to write health");
  });

  it("is wired into the radar cadence, so it runs without anyone opening a panel", () => {
    const sweeps = readFileSync("src/engines/data/server/radar/radarSweeps.ts", "utf8");
    assert.match(sweeps, /export async function runRadarModuleHealthSweep/);
    assert.match(sweeps, /runRadarModuleHealthSweep\(agencyId, \{ force: true, now: options\.now \}\)/,
      "the full scan must force a re-ask");
    assert.match(sweeps, /runRadarModuleHealthSweep\(agencyId, \{ now: options\.now \}\)/,
      "the scheduled sweep must run it on the runner's own cadence");
  });

  it("a recorded answer is not permanent — it goes stale", () => {
    // Recording the answer is only half the honesty. An answer from three days
    // ago is not proof that a module is healthy now, and the constant that says
    // so is the one Radar reads.
    recordInstallHealth(scope(), "client-crm", { health: { ok: true, message: "fine" }, healthCheckedAt: NOW });
    const stored = getInstall(scope(), "client-crm");
    assert.equal(stored?.healthCheckedAt, NOW);
    // Read from the module rather than restated as a literal: a hard-coded 48h
    // here would keep passing if someone shortened the stale window to an hour,
    // which is the exact failure this line claims to guard against.
    assert.ok(PLUGIN_HEALTH_CADENCE_MS < PLUGIN_HEALTH_STALE_MS,
      "the cadence must be shorter than the stale window, or every answer is stale on arrival");
  });
});
