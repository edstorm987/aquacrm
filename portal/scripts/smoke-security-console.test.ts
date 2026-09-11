// Operator security console — the runnable incident controls the runbooks name.
// Guarantees: mutating commands are DRY-RUN by default (no --commit → no
// mutation), and required metadata (actor/reason) is enforced.
//
// Pass 5 moved the authoritative write controls off the process-local PortalState
// blob onto the durable `aqua_write_controls` plane, so a real freeze now persists
// to the database. The persistence tests therefore drive the REAL subprocess CLI
// against a localhost mock of the Supabase REST endpoints. The CLI runs via async
// `spawn` (NOT spawnSync) so the parent event loop stays free to answer it — a
// spawnSync would block the in-process mock server and deadlock.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONSOLE = join(HERE, "security-console.ts");

// ── Localhost mock of the durable-control Supabase REST RPCs + PortalState row ──
interface Control { scope: string; scopeId: string; frozen: boolean; revision: number; reason: string | null; actor: string | null; changedAt: string }
let globalControl: Control | null = null;
const tenantControls = new Map<string, Control>();
let portalState: Record<string, unknown> = { securityControl: { globalEpoch: 1, sessions: {}, userEpochs: {}, tenantLockdowns: {} } };
function resetDurableState() {
  globalControl = null;
  tenantControls.clear();
  portalState = { securityControl: { globalEpoch: 1, sessions: {}, userEpochs: {}, tenantLockdowns: {} } };
}
const iso = () => new Date().toISOString();
const defaultGlobal = (): Control => ({ scope: "global", scopeId: "global", frozen: false, revision: 1, reason: null, actor: null, changedAt: iso() });

let mockServer: Server;
let mockUrl = "";
before(async () => {
  mockServer = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      const url = req.url ?? "";
      const body = raw ? (JSON.parse(raw) as Record<string, any>) : {};
      const send = (obj: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
      if (url.includes("/rpc/set_aqua_write_control")) {
        const prev = body.p_scope_kind === "global" ? globalControl : tenantControls.get(body.p_scope_id);
        const control: Control = {
          scope: body.p_scope_kind, scopeId: body.p_scope_id, frozen: !!body.p_frozen,
          revision: (prev?.revision ?? 0) + 1, reason: body.p_reason ?? null, actor: body.p_actor ?? null, changedAt: iso(),
        };
        if (body.p_scope_kind === "global") globalControl = control; else tenantControls.set(body.p_scope_id, control);
        return send({ ok: true });
      }
      if (url.includes("/rpc/read_aqua_write_admission")) {
        const tenantId = body.p_tenant_id as string | null | undefined;
        return send({
          appKey: "aquacrm-portal-state",
          global: globalControl ?? defaultGlobal(),
          tenant: tenantId ? (tenantControls.get(tenantId) ?? null) : null,
          pendingQuarantines: 0,
          frozenTenants: [...tenantControls.values()].filter((c) => c.frozen).length,
        });
      }
      if (url.includes("/rpc/list_aqua_write_quarantines")) return send([]);
      if (url.includes("/rpc/load_app_datastore_with_sidecars")) {
        return send({ main: portalState, sidecars: Object.fromEntries((body.p_sidecar_specs ?? []).map((s: any) => [s.slug, { [s.key]: {} }])) });
      }
      if (url.includes("/rpc/apply_app_datastore_patch")) return send({ operationId: body.p_operation_id, main: portalState });
      if (req.method === "GET") return send([{ data: portalState }]);
      return send({ ok: true });
    });
  });
  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", () => resolve()));
  const addr = mockServer.address();
  mockUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
after(async () => { await new Promise<void>((resolve) => mockServer.close(() => resolve())); });

interface RunResult { status: number | null; stdout: string; stderr: string }
function run(args: string[], opts: { durable?: boolean } = {}): Promise<RunResult> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NODE_OPTIONS; // the launcher self-provides --conditions react-server
  delete env.SUPABASE_SECRET_KEY;
  if (opts.durable) {
    env.PORTAL_BACKEND = "supabase";
    env.NEXT_PUBLIC_SUPABASE_URL = mockUrl;
    env.SUPABASE_SERVICE_ROLE_KEY = "console-mock-service-role";
  } else {
    env.PORTAL_BACKEND = "memory";
    delete env.NEXT_PUBLIC_SUPABASE_URL;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
  }
  return new Promise<RunResult>((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", CONSOLE, ...args], { cwd: join(HERE, ".."), env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    const timer = setTimeout(() => child.kill(), 30_000);
    child.on("close", (code) => { clearTimeout(timer); resolve({ status: code, stdout, stderr }); });
  });
}

test("the documented command works with NO NODE_OPTIONS (launcher self-provides the condition)", async () => {
  const status = await run(["status"]);
  assert.equal(status.status, 0, `status should exit 0; stderr: ${status.stderr}`);
  assert.doesNotMatch(status.stderr, /server-only|cannot be imported/i);
  assert.match(status.stdout, /"globalEpoch"/);
});

test("a --commit mutation persists to the durable control plane and reads it back", async () => {
  resetDurableState();
  const frozen = await run(["freeze", "--actor", "ops", "--reason", "console read-back test", "--commit"], { durable: true });
  assert.equal(frozen.status, 0, `freeze --commit should exit 0; stderr: ${frozen.stderr}`);
  assert.match(frozen.stderr, /Global read-only ON/);
  assert.doesNotMatch(frozen.stderr, /FAILED/);
  // The DURABLE plane actually recorded the freeze — not just a process-local blob.
  assert.equal(globalControl?.frozen, true, "the durable control plane recorded the global freeze");
  const status = await run(["status"], { durable: true });
  assert.equal(status.status, 0, `status should exit 0; stderr: ${status.stderr}`);
  assert.match(status.stdout, /"globalReadOnly":\s*\{[\s\S]*?"frozen":\s*true/, "status reads the persisted global read-only back");
});

test("a mutating command without --commit is a DRY RUN and mutates nothing", async () => {
  resetDurableState();
  const freeze = await run(["freeze", "--actor", "ops", "--reason", "drill"], { durable: true });
  assert.equal(freeze.status, 0, `dry-run freeze should exit 0; stderr: ${freeze.stderr}`);
  assert.match(freeze.stderr, /DRY RUN/);
  // The durable plane was NOT touched...
  assert.equal(globalControl, null, "a DRY RUN must not write to the durable control plane");
  // ...and status reports the global control is NOT frozen. (The durable model
  // always has a global row; "not frozen" is frozen:false — the successor of the
  // old process-local `null`. Asserting frozen:false proves the same "unchanged".)
  const status = await run(["status"], { durable: true });
  assert.equal(status.status, 0, `status should exit 0; stderr: ${status.stderr}`);
  assert.match(status.stdout, /"globalReadOnly":\s*\{[\s\S]*?"frozen":\s*false/, "the dry run left the plane unfrozen");
  assert.doesNotMatch(status.stdout, /"frozen":\s*true/);
});

test("mutating commands require an actor and a reason", async () => {
  assert.match((await run(["freeze", "--reason", "x", "--commit"])).stderr, /--actor .* required/);
  assert.match((await run(["freeze", "--actor", "ops", "--commit"])).stderr, /--reason .* required/);
});

test("an unknown command fails loudly", async () => {
  const r = await run(["definitely-not-a-command"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /unknown command/);
});
