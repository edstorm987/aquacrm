// In-process smoke for @aqua/plugin-domains.
//
// Mocks the four foundation ports + a tiny in-memory PluginStorage,
// exercises attach (without VERCEL_TOKEN) → list → verify → remove.
// Vercel API calls are NOT made — `VERCEL_TOKEN` stays unset for the
// run, so the service falls into the "captured locally, skip API"
// branch documented in the runbook. A separate live-test path with
// real Vercel sandbox creds is documented in the chapter.

import test from "node:test";
import assert from "node:assert/strict";

import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  PluginInstallStorePort,
  TenantPort,
} from "../server/ports";
import {
  registerDomainsFoundation,
  clearDomainsFoundation,
  containerWithDeps,
} from "../server/foundationAdapter";

// ─── In-memory PluginStorage ─────────────────────────────────────────────

function memStorage(): PluginStorage {
  const map = new Map<string, unknown>();
  return {
    async get(key) {
      return map.get(key) as undefined;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async del(key) {
      map.delete(key);
    },
    async list(prefix = "") {
      return Array.from(map.keys()).filter((k) => k.startsWith(prefix));
    },
  };
}

// ─── Mocks ───────────────────────────────────────────────────────────────

function makeFoundation(): {
  tenant: TenantPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  log: { actions: string[]; events: string[] };
} {
  const log = { actions: [] as string[], events: [] as string[] };
  return {
    tenant: {
      getAgency: () => null,
      getClient: () => null,
    },
    activity: {
      logActivity(input) {
        log.actions.push(input.action);
        return {
          id: `act_${log.actions.length}`,
          ts: Date.now(),
          agencyId: input.agencyId,
          ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
          category: input.category,
          action: input.action,
          message: input.message,
        };
      },
      listActivity: () => [],
    },
    events: {
      emit(_scope, name) {
        log.events.push(String(name));
      },
    },
    pluginInstalls: {
      getInstall: () => null,
    },
    log,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────

test("isConfigured = false when VERCEL_TOKEN unset", () => {
  delete process.env.VERCEL_TOKEN;
  const f = makeFoundation();
  registerDomainsFoundation(f);
  try {
    const c = containerWithDeps({
      agencyId: "ag1",
      storage: memStorage(),
      foundation: f,
    });
    assert.equal(c.domains.isConfigured(), false);
  } finally {
    clearDomainsFoundation();
  }
});

test("attach without VERCEL_TOKEN captures hostname + skips API", async () => {
  delete process.env.VERCEL_TOKEN;
  const f = makeFoundation();
  registerDomainsFoundation(f);
  try {
    const c = containerWithDeps({
      agencyId: "ag1",
      storage: memStorage(),
      foundation: f,
    });
    const result = await c.domains.attach({
      hostname: "Example.com",
      vercelProjectId: "prj_test",
    });
    assert.equal(result.configured, false);
    assert.equal(result.ok, false);
    assert.equal(result.error, "vercel-token-not-configured");
    assert.ok(result.domain);
    // Hostname normalisation.
    assert.equal(result.domain?.hostname, "example.com");
    assert.equal(result.domain?.status, "pending");
    // Activity + events logged.
    assert.ok(f.log.events.includes("domain.attach.requested"));
    assert.ok(f.log.actions.includes("domain.attach.skipped"));
  } finally {
    clearDomainsFoundation();
  }
});

test("attach is idempotent on duplicate hostname", async () => {
  delete process.env.VERCEL_TOKEN;
  const f = makeFoundation();
  registerDomainsFoundation(f);
  try {
    const storage = memStorage();
    const c = containerWithDeps({
      agencyId: "ag1",
      storage,
      foundation: f,
    });
    const a = await c.domains.attach({ hostname: "example.com", vercelProjectId: "prj_test" });
    const b = await c.domains.attach({ hostname: "EXAMPLE.com", vercelProjectId: "prj_test" });
    assert.equal(a.domain?.id, b.domain?.id);
    const list = await c.domains.list();
    assert.equal(list.length, 1);
  } finally {
    clearDomainsFoundation();
  }
});

test("list scopes by agencyId and clientId", async () => {
  delete process.env.VERCEL_TOKEN;
  const f = makeFoundation();
  registerDomainsFoundation(f);
  try {
    const storage = memStorage();
    const agency = containerWithDeps({ agencyId: "ag1", storage, foundation: f });
    const client = containerWithDeps({
      agencyId: "ag1",
      clientId: "c1",
      storage,
      foundation: f,
    });
    await agency.domains.attach({ hostname: "agency.example", vercelProjectId: "prj_a" });
    await client.domains.attach({ hostname: "client.example", vercelProjectId: "prj_c" });
    const aList = await agency.domains.list();
    const cList = await client.domains.list();
    assert.equal(aList.length, 1);
    assert.equal(aList[0]?.hostname, "agency.example");
    assert.equal(cList.length, 1);
    assert.equal(cList[0]?.hostname, "client.example");
  } finally {
    clearDomainsFoundation();
  }
});

test("verify on missing record returns not-found", async () => {
  delete process.env.VERCEL_TOKEN;
  const f = makeFoundation();
  registerDomainsFoundation(f);
  try {
    const c = containerWithDeps({
      agencyId: "ag1",
      storage: memStorage(),
      foundation: f,
    });
    const result = await c.domains.verify("dom_does_not_exist");
    assert.equal(result.ok, false);
    assert.equal(result.error, "not-found");
  } finally {
    clearDomainsFoundation();
  }
});

test("remove drops the record (no Vercel call when token unset)", async () => {
  delete process.env.VERCEL_TOKEN;
  const f = makeFoundation();
  registerDomainsFoundation(f);
  try {
    const c = containerWithDeps({
      agencyId: "ag1",
      storage: memStorage(),
      foundation: f,
    });
    const attached = await c.domains.attach({
      hostname: "removeme.example",
      vercelProjectId: "prj_test",
    });
    const id = attached.domain?.id;
    assert.ok(id);
    const r = await c.domains.remove(id!);
    assert.equal(r.ok, true);
    const list = await c.domains.list();
    assert.equal(list.length, 0);
    assert.ok(f.log.events.includes("domain.removed"));
  } finally {
    clearDomainsFoundation();
  }
});

test("attach rejects empty hostname", async () => {
  delete process.env.VERCEL_TOKEN;
  const f = makeFoundation();
  registerDomainsFoundation(f);
  try {
    const c = containerWithDeps({
      agencyId: "ag1",
      storage: memStorage(),
      foundation: f,
    });
    const result = await c.domains.attach({ hostname: "  ", vercelProjectId: "prj_test" });
    assert.equal(result.ok, false);
    assert.equal(result.error, "missing-hostname");
  } finally {
    clearDomainsFoundation();
  }
});

test("attach rejects missing projectId", async () => {
  delete process.env.VERCEL_TOKEN;
  const f = makeFoundation();
  registerDomainsFoundation(f);
  try {
    const c = containerWithDeps({
      agencyId: "ag1",
      storage: memStorage(),
      foundation: f,
    });
    const result = await c.domains.attach({ hostname: "ok.example", vercelProjectId: "" });
    assert.equal(result.ok, false);
    assert.equal(result.error, "missing-vercel-project-id");
  } finally {
    clearDomainsFoundation();
  }
});
