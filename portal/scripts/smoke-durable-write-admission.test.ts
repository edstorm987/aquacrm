import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test, { afterEach, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

import {
  AQUA_WRITE_ADMISSION_APP_KEY,
  assertFreshWriteAdmission,
  setWriteAdmissionTestReader,
  WriteAdmissionDeniedError,
  type DurableWriteAdmissionSnapshot,
} from "../src/lib/server/security/writeAdmission";
import { createWriteAdmittedFetch } from "../src/lib/supabase/guardedServiceRoleClient";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const originalNodeEnv = process.env.NODE_ENV;
const originalBackend = process.env.PORTAL_BACKEND;
const originalFrozen = process.env.PORTAL_WRITES_FROZEN;

function snapshot(input: {
  globalFrozen?: boolean;
  tenantId?: string;
  tenantFrozen?: boolean;
  pendingQuarantines?: number;
} = {}): DurableWriteAdmissionSnapshot {
  const changedAt = "2026-09-10T12:00:00.000Z";
  return {
    appKey: AQUA_WRITE_ADMISSION_APP_KEY,
    global: {
      scope: "global",
      scopeId: "global",
      frozen: input.globalFrozen ?? false,
      revision: 7,
      reason: input.globalFrozen ? "incident" : null,
      actor: "security-test",
      changedAt,
    },
    tenant: input.tenantId ? {
      scope: "tenant",
      scopeId: input.tenantId,
      frozen: input.tenantFrozen ?? false,
      revision: 3,
      reason: input.tenantFrozen ? "tenant incident" : null,
      actor: "security-test",
      changedAt,
    } : null,
    pendingQuarantines: input.pendingQuarantines ?? 0,
    frozenTenants: input.tenantFrozen ? 1 : 0,
  };
}

beforeEach(() => {
  process.env.NODE_ENV = "test";
  delete process.env.PORTAL_WRITES_FROZEN;
  setWriteAdmissionTestReader(async tenantId => snapshot({ tenantId }));
});

afterEach(() => {
  process.env.NODE_ENV = "test";
  setWriteAdmissionTestReader(null);
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalBackend === undefined) delete process.env.PORTAL_BACKEND;
  else process.env.PORTAL_BACKEND = originalBackend;
  if (originalFrozen === undefined) delete process.env.PORTAL_WRITES_FROZEN;
  else process.env.PORTAL_WRITES_FROZEN = originalFrozen;
});

test("fresh authority denies global, tenant, quarantine and missing tenant context", async () => {
  setWriteAdmissionTestReader(async tenantId => snapshot({ tenantId, globalFrozen: true }));
  await assert.rejects(
    assertFreshWriteAdmission({ kind: "tenant", tenantId: "agency-a", surface: "test" }),
    (error: unknown) => error instanceof WriteAdmissionDeniedError && error.scope === "global",
  );

  setWriteAdmissionTestReader(async tenantId => snapshot({ tenantId, tenantFrozen: true }));
  await assert.rejects(
    assertFreshWriteAdmission({ kind: "tenant", tenantId: "agency-a", surface: "test" }),
    (error: unknown) => error instanceof WriteAdmissionDeniedError && error.scope === "tenant",
  );

  setWriteAdmissionTestReader(async tenantId => snapshot({ tenantId, pendingQuarantines: 1 }));
  await assert.rejects(
    assertFreshWriteAdmission({ kind: "tenant", tenantId: "agency-a", surface: "test" }),
    (error: unknown) => error instanceof WriteAdmissionDeniedError && /reconciliation/.test(error.message),
  );

  await assert.rejects(
    assertFreshWriteAdmission({ kind: "tenant", tenantId: " ", surface: "test" }),
    (error: unknown) => error instanceof WriteAdmissionDeniedError && error.scope === "context",
  );
});

test("service-role transport takes a new authority read immediately before every mutation", async () => {
  let authorityReads = 0;
  let transports = 0;
  setWriteAdmissionTestReader(async tenantId => {
    authorityReads += 1;
    return snapshot({ tenantId, globalFrozen: authorityReads > 1 });
  });
  const admittedFetch = createWriteAdmittedFetch(
    { surface: "database.test", tenantId: "agency-a" },
    (async () => {
      transports += 1;
      return new Response(null, { status: 204 });
    }) as typeof fetch,
  );

  await admittedFetch("https://database.invalid/table", { method: "POST" });
  await assert.rejects(admittedFetch("https://database.invalid/table", { method: "PATCH" }), WriteAdmissionDeniedError);
  assert.equal(authorityReads, 2);
  assert.equal(transports, 1, "the denied mutation must not reach the transport");
});

test("production refuses a backend without durable admission parity", async () => {
  setWriteAdmissionTestReader(null);
  process.env.NODE_ENV = "production";
  process.env.PORTAL_BACKEND = "postgres";
  await assert.rejects(
    assertFreshWriteAdmission({ kind: "platform", purpose: "platform-maintenance", surface: "test" }),
    (error: unknown) => error instanceof WriteAdmissionDeniedError && error.scope === "unavailable",
  );
});

test("migration makes containment durable, fail closed, scoped and explicitly recoverable", () => {
  const sql = readFileSync(join(ROOT, "../supabase/migrations/20260910130000_durable_write_admission.sql"), "utf8");
  for (const table of ["aqua_write_controls", "aqua_write_control_events", "aqua_write_quarantines"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`));
  }
  assert.match(sql, /'aquacrm-portal-state', 'global', 'global', true, 1/);
  assert.match(sql, /aqua_write_control_unavailable:global/);
  assert.match(sql, /aqua_write_control_unavailable:tenant/);
  assert.match(sql, /Initial durable tenant admission row/);
  assert.match(sql, /Tenant discovered in authoritative LIVE PortalState/);
  assert.match(sql, /aqua_writes_frozen:pending-quarantine/);
  assert.match(sql, /aqua_writes_frozen:tenant-context-required/);
  assert.match(sql, /control_scope_kind text not null/);
  assert.match(sql, /scope_kind = quarantine\.control_scope_kind/);
  assert.match(sql, /current_control\.revision <= quarantine\.control_revision/);
  assert.match(sql, /current_control\.revision <> p_expected_control_revision/);
  assert.match(sql, /p_action not in \('replay', 'discard'\)/);
  assert.match(sql, /p_datastore_key like p_app_key \|\| ':%'/);
  assert.match(sql, /before insert or update or delete on public\.app_datastores/);
  assert.match(sql, /before insert or update or delete on public\.app_datastore_patch_receipts/);
  assert.match(sql, /perform public\.aqua_assert_write_admitted\(p_app_key, p_tenant_id\)/);
  const releaseSection = sql.slice(sql.indexOf("revoke all on function public.release_product_workspace_lease"));
  assert.doesNotMatch(releaseSection, /aqua_assert_write_admitted/);
});

test("pilot exports contain no browser-direct database write — only the client-owned Edge Function", () => {
  // The pilot invariant, KEPT and strengthened after the 2026-09 secure-intake
  // redesign: an exported bundle must never carry a browser-direct database
  // write. The unsafe path — a raw PostgREST table plus a public anon key baked
  // into the page — is REMOVED, not gated out. An exported form posts only to
  // the client-owned `aqua-form-submit` Edge Function, which enforces the field
  // allowlist, CAPTCHA, honeypot, PAN rejection, rate limits and idempotency
  // server-side, and holds the service-role key only inside its own runtime.
  const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // The doc comments describe the REMOVED path (a raw table, a bearer key), so
  // the emitted-content checks run against code with comments stripped.
  const exportCode = stripComments(readFileSync(join(ROOT, "src/built-ins/modules/website-editor/src/server/staticExport.ts"), "utf8"));
  const resolverSrc = stripComments(readFileSync(join(ROOT, "src/lib/server/clientForms/clientSupabaseExport.ts"), "utf8"));

  // No embedded Supabase client, project/anon/service env, or credential.
  assert.doesNotMatch(exportCode, /NEXT_PUBLIC_SUPABASE|SUPABASE_(?:URL|ANON_KEY|SERVICE_ROLE_KEY)|createClient\(/);
  // No raw PostgREST table endpoint, apikey header, or bearer key in an exported page.
  assert.doesNotMatch(exportCode, /\/rest\/v1\//, "no raw PostgREST table endpoint in an exported page");
  assert.doesNotMatch(exportCode, /\bapikey\b/i, "no anon/publishable apikey header in an exported page");
  assert.doesNotMatch(exportCode, /Bearer/i, "no bearer key concatenated into an exported request");

  // The export target's TYPE cannot even express a table, an anon key, or a secret.
  const targetType = exportCode.match(/export interface ExportSupabaseTarget \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(targetType, "the export target type must exist");
  assert.doesNotMatch(
    targetType, /\b(anonKey|table|webhookSecret|readSecret|secret)\b/i,
    "the export target type must carry no table, anon key, or secret",
  );
  assert.match(targetType, /submitUrl/, "the export target carries only the Edge Function URL and public ids");

  // The only intake destination the resolver can produce is the client-owned
  // Edge Function, built without ever reading a secret.
  assert.match(resolverSrc, /\/functions\/v1\/aqua-form-submit/, "the only intake endpoint is the client-owned Edge Function");
  assert.doesNotMatch(resolverSrc, /\/rest\/v1\//, "the resolver must not build a raw table endpoint");
});

test("a race-lost PortalState patch is durably quarantined, invalidated and never auto-replayed", () => {
  const script = String.raw`
    import assert from "node:assert/strict";
    const admissionNamespace = await import("./src/lib/server/security/writeAdmission.ts");
    const admission = admissionNamespace.default ?? admissionNamespace;
    admission.setWriteAdmissionTestReader(async () => ({
      appKey: admission.AQUA_WRITE_ADMISSION_APP_KEY,
      global: { scope: "global", scopeId: "global", frozen: false, revision: 9, reason: null, actor: "test", changedAt: "2026-09-10T12:00:00.000Z" },
      tenant: null,
      pendingQuarantines: 0,
      frozenTenants: 0,
    }));
    let patchAttempts = 0;
    let quarantineBody;
    globalThis.fetch = async (input, init = {}) => {
      const url = String(input);
      if (url.includes("/rpc/apply_app_datastore_patch")) {
        patchAttempts += 1;
        return new Response(JSON.stringify({ code: "AQ423", message: "aqua_writes_frozen:global", details: "race freeze" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/rpc/record_aqua_write_quarantine")) {
        quarantineBody = JSON.parse(String(init.body));
        return new Response(JSON.stringify({
          id: 41,
          status: "pending",
          operationId: quarantineBody.p_operation_id,
          controlScope: "global",
          controlScopeId: "global",
          controlRevision: 10,
          controlReason: "race freeze",
          capturedAt: "2026-09-10T12:00:01.000Z",
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error("unexpected transport " + url);
    };
    const storageNamespace = await import("./src/server/storage.ts");
    const storage = storageNamespace.default ?? storageNamespace;
    storage.mutate(state => { state.agencies["quarantine-test"] = { id: "quarantine-test" }; });
    await assert.rejects(storage.flushPendingWrites(), storage.PortalStateWriteQuarantinedError);
    assert.ok(quarantineBody.p_main_operations.length > 0, "the exact pending patch must be sealed");
    const info = storage.getBackendInfo();
    assert.equal(info.writable, false);
    assert.equal(info.quarantineDurable, true);
    assert.equal(info.quarantine?.id, 41);
    assert.throws(
      () => storage.mutate(state => { state.agencies["must-not-replay"] = { id: "must-not-replay" }; }),
      storage.PortalStateWriteQuarantinedError,
    );
    assert.equal(patchAttempts, 1, "a quarantined worker must not retry the patch after a thaw");
  `;
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--eval", script], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORTAL_BACKEND: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "https://database.invalid",
      SUPABASE_SECRET_KEY: "not-a-real-key",
    },
  });
  assert.equal(child.status, 0, `${child.stderr}\n${child.stdout}`);
});
