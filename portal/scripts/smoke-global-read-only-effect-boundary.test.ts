// Behavioural proof for irreversible seams outside PortalState.mutate().
// Run with NODE_OPTIONS=--conditions react-server.

import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import {
  assertWritesAllowed,
  clearGlobalReadOnly,
  isGlobalReadOnly,
  liftTenantLockdown,
  lockdownTenant,
  setGlobalReadOnly,
  WritesFrozenError,
} from "../src/lib/server/auth/securityControl";
import { assertDurableNonceWriteAllowed } from "../src/lib/server/auth/nonceStore";
import {
  clearCommandScanResultsForTests,
  issueCommandScanResult,
  readCommandScanResult,
} from "../src/lib/server/commandScanResults";
import { stripeHttpRequest } from "../src/lib/server/integrations/stripeHttp";
import { guardServiceRoleClient } from "../src/lib/supabase/guardedServiceRoleClient";
import { publishEdits } from "../src/engines/editor/server/publish";
import { runInDataRealm } from "../src/server/dataRealm";
import { getState } from "../src/server/storage";

beforeEach(() => {
  clearCommandScanResultsForTests();
  if (isGlobalReadOnly()) clearGlobalReadOnly("effect-boundary-test-reset");
  for (const agencyId of Object.keys(getState().securityControl?.tenantLockdowns ?? {})) {
    liftTenantLockdown(agencyId, "effect-boundary-test-reset");
  }
});

test("LIVE global and tenant containment still binds a sandbox/showcase realm", () => {
  setGlobalReadOnly("incident-controller", "cross-realm incident");
  assert.throws(
    () => runInDataRealm("sandbox-effect-test", () => assertWritesAllowed("test.cross-realm", { tenantId: "agency-a" })),
    WritesFrozenError,
  );
  clearGlobalReadOnly("incident-controller");

  lockdownTenant("agency-a", "incident-controller", "tenant incident");
  assert.throws(
    () => runInDataRealm("showcase-effect-test", () => assertWritesAllowed("test.cross-realm", { tenantId: "agency-a" })),
    WritesFrozenError,
  );
  assert.doesNotThrow(
    () => runInDataRealm("showcase-effect-test", () => assertWritesAllowed("test.cross-realm", { tenantId: "agency-b" })),
  );
  liftTenantLockdown("agency-a", "incident-controller");
});

test("service-role reads remain available while database, RPC, storage, auth-admin and function effects refuse", async () => {
  const touched: string[] = [];
  const table = {
    select: async () => { touched.push("select"); return { data: [] }; },
    insert: async () => { touched.push("insert"); return { data: [] }; },
    update: async () => { touched.push("update"); return { data: [] }; },
    delete: async () => { touched.push("delete"); return { data: [] }; },
  };
  const raw = {
    from: () => table,
    rpc: async () => { touched.push("rpc"); return { data: null }; },
    storage: {
      from: () => ({
        download: async () => { touched.push("download"); return { data: null }; },
        upload: async () => { touched.push("upload"); return { data: null }; },
      }),
    },
    auth: { admin: {
      listUsers: async () => { touched.push("listUsers"); return { data: { users: [] } }; },
      createUser: async () => { touched.push("createUser"); return { data: null }; },
    } },
    functions: { invoke: async () => { touched.push("invoke"); return { data: null }; } },
  };
  const client = guardServiceRoleClient(raw, { surface: "database.test.service-role", tenantId: "agency-a" });

  setGlobalReadOnly("incident-controller", "database incident");
  await client.from().select();
  await client.storage.from().download();
  await client.auth.admin.listUsers();
  assert.deepEqual(touched, ["select", "download", "listUsers"]);
  assert.throws(() => client.from().insert(), WritesFrozenError);
  assert.throws(() => client.from().update(), WritesFrozenError);
  assert.throws(() => client.from().delete(), WritesFrozenError);
  assert.throws(() => client.rpc(), WritesFrozenError);
  assert.throws(() => client.storage.from().upload(), WritesFrozenError);
  assert.throws(() => client.auth.admin.createUser(), WritesFrozenError);
  assert.throws(() => client.functions.invoke(), WritesFrozenError);
  assert.deepEqual(touched, ["select", "download", "listUsers"], "a refused effect must not touch its SDK method");

  clearGlobalReadOnly("incident-controller");
  await client.from().insert();
  assert.equal(touched.at(-1), "insert", "lifting the control restores the same boundary");
});

test("provider GET remains readable while POST refuses before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = (async () => {
    fetches += 1;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    setGlobalReadOnly("incident-controller", "provider incident");
    const read = await stripeHttpRequest<{ ok: boolean }>({
      secretKey: "sk_test_not_real",
      path: "/v1/test-read",
      method: "GET",
      outcome: "read",
    });
    assert.equal(read.ok, true);
    assert.equal(fetches, 1);
    await assert.rejects(stripeHttpRequest({
      secretKey: "sk_test_not_real",
      path: "/v1/test-write",
      method: "POST",
      form: new URLSearchParams({ a: "b" }),
      outcome: "idempotent-write",
    }), WritesFrozenError);
    assert.equal(fetches, 1, "refused provider mutation must not start fetch");
  } finally {
    if (isGlobalReadOnly()) clearGlobalReadOnly("incident-controller");
    globalThis.fetch = originalFetch;
  }
});

test("confirmed editor GitHub publication refuses, while its dry-run stays side-effect free", async () => {
  let fetches = 0;
  const fetchImpl = (async () => {
    fetches += 1;
    return new Response(JSON.stringify({}), { status: 500, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const request = {
    target: { repository: "example/site", baseBranch: "main", baseSha: "a".repeat(40) },
    plan: { files: [{ file: "index.html", line: 1, before: "old", after: "new", contents: "new" }], rejected: [] },
    message: "test",
    branch: "aqua-editor/test",
    token: "not-a-real-token",
    tenantId: "agency-a",
    fetchImpl,
  };

  setGlobalReadOnly("incident-controller", "repository incident");
  const dryRun = await publishEdits({ ...request, confirm: false });
  assert.equal(dryRun.published, false);
  assert.equal(fetches, 0);
  await assert.rejects(publishEdits({ ...request, confirm: true }), WritesFrozenError);
  assert.equal(fetches, 0, "confirmed publish must be refused before GitHub I/O");
});

test("background/sidecar result issuance refuses before its repository save", async () => {
  const principal = { realmId: "live", agencyId: "agency-a", userId: "user-a", sessionRev: 0, accessRev: 0 };
  setGlobalReadOnly("incident-controller", "background incident");
  assert.throws(() => issueCommandScanResult({ principal, radar: {} as never, intelligence: {} as never }), WritesFrozenError);

  clearGlobalReadOnly("incident-controller");
  const issued = await issueCommandScanResult({ principal, radar: {} as never, intelligence: {} as never });
  assert.equal((await readCommandScanResult({ handle: issued.handle, principal }))?.handle, issued.handle);
});

test("durable auth nonce SQL has an awaited fail-closed seam before DDL/DML", async () => {
  setGlobalReadOnly("incident-controller", "auth persistence incident");
  await assert.rejects(assertDurableNonceWriteAllowed(), WritesFrozenError);
  clearGlobalReadOnly("incident-controller");
  await assert.doesNotReject(assertDurableNonceWriteAllowed());
});
