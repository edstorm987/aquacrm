// Lead identity conflict boundary.
//
// Exercises the real leads-pipeline HTTP handler against isolated in-memory
// plugin storage. It proves that an attempted identity collision is refused as
// a recoverable 409 and that the editor keeps a failed draft visible.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

process.env.PORTAL_BACKEND = "memory";

interface MemoryStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  runExclusive<T>(key: string, work: () => Promise<T>): Promise<T>;
}

function memoryStorage(): MemoryStorage {
  const values = new Map<string, unknown>();
  const exclusiveQueues = new Map<string, Promise<void>>();
  return {
    async get<T>(key: string) { return values.get(key) as T | undefined; },
    async set<T>(key: string, value: T) { values.set(key, structuredClone(value)); },
    async del(key: string) { values.delete(key); },
    async list(prefix = "") { return [...values.keys()].filter(key => key.startsWith(prefix)); },
    async runExclusive<T>(key: string, work: () => Promise<T>) {
      const previous = exclusiveQueues.get(key) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const queued = previous.then(() => gate);
      exclusiveQueues.set(key, queued);
      await previous;
      try {
        return await work();
      } finally {
        release();
        if (exclusiveQueues.get(key) === queued) exclusiveQueues.delete(key);
      }
    },
  };
}

describe("Lead identity conflict boundary", () => {
  it("returns 409 without changing either lead's identity pointers", async () => {
    const [foundation, handlers] = await Promise.all([
      import("../src/built-ins/modules/leads-pipeline/src/server/foundationAdapter"),
      import("../src/built-ins/modules/leads-pipeline/src/api/handlers"),
    ]);
    const storage = memoryStorage();
    const agencyId = "agency_identity_conflict_smoke";
    const actor = "user_identity_conflict_smoke";
    const agency = {
      id: agencyId,
      name: "Identity Test Agency",
      slug: "identity-test-agency",
      brand: { primaryColor: "#006b7b" },
      status: "active" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const install = {
      id: "install_identity_conflict_smoke",
      pluginId: "leads-pipeline",
      agencyId,
      enabled: true,
      config: {},
      features: {},
      installedAt: Date.now(),
      installedBy: actor,
    };
    const activity = {
      logActivity: async (input: Record<string, unknown>) => ({
        id: `activity_${Date.now()}`,
        ts: Date.now(),
        ...input,
      }),
      listActivity: async () => [],
    };
    const events = { emit: () => undefined };

    foundation.registerLeadsPipelineFoundation({
      tenant: { getAgency: (id: string) => id === agencyId ? agency : null },
      activity,
      events,
      pluginInstalls: { getInstall: () => install },
    });

    try {
      const container = foundation.containerFor({ agencyId, storage });
      const alpha = await container.leads.upsert({
        email: "alpha@example.com",
        phone: "+447700900001",
        name: "Alpha Person",
        source: "identity-smoke",
      }, actor);
      const bravo = await container.leads.upsert({
        email: "bravo@example.com",
        phone: "+447700900002",
        name: "Bravo Person",
        source: "identity-smoke",
      }, actor);

      const response = await handlers.updateLeadHandler(new Request(
        `http://localhost/api/plugins/leads-pipeline/leads?id=${bravo.lead.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: " ALPHA@example.com " }),
        },
      ), {
        agencyId,
        install,
        storage,
        services: {
          clients: {},
          pluginInstalls: {},
          pluginRuntime: {},
          registry: {},
          phases: {},
          activity,
          events,
          variants: {},
          tenant: { getAgency: () => agency },
        },
        actor,
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        ok: false,
        error: "lead_identity_conflict",
        field: "email",
        message: "Another lead already uses this email. Review that record instead of merging people silently.",
      });
      assert.equal((await container.leads.getByEmail("alpha@example.com"))?.id, alpha.lead.id);
      assert.equal((await container.leads.getByEmail("bravo@example.com"))?.id, bravo.lead.id);
      assert.equal((await container.leads.get(bravo.lead.id))?.email, "bravo@example.com");
    } finally {
      foundation.clearLeadsPipelineFoundation();
    }
  });

  it("keeps the sales-record dialog and draft open when save is refused", () => {
    // The sales-record dialog moved into `_DetailsEditor` on 2026-08-29. The
    // guarantee is unchanged: a refused save must leave the dialog and the
    // typed draft alone, so the user can fix the conflict rather than retype it.
    const source = readFileSync(join(
      process.cwd(),
      "src/app/portal/agency/pipelines/[slug]/_DetailsEditor.tsx",
    ), "utf8");
    assert.match(source, /const result = await onSave\(\{/);
    assert.match(source, /if \(result\.ok\) setOpen\(false\);/);
    assert.match(source, /else setSaveError\(result\.error/);
    assert.match(source, /role="alert"/);
  });
});
