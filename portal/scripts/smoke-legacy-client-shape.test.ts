import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, test } from "node:test";

process.env.PORTAL_BACKEND = "memory";
process.env.NODE_ENV = "test";

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");

let storage: Storage;
let tenants: Tenants;

before(async () => {
  [storage, tenants] = await Promise.all([
    import("../src/server/storage"),
    import("../src/server/tenants"),
  ]);
  await storage.ensureHydrated();
});

test("legacy clients without required brand or slug remain listable and openable", async () => {
  await storage.reset();
  const agency = tenants.createAgency({
    name: "Legacy Client Shape",
    brand: { primaryColor: "#123456" },
  });
  const created = tenants.createClient(agency.id, { name: "Legacy Dental" });

  storage.mutate(state => {
    const legacy = state.clients[created.id] as unknown as Record<string, unknown>;
    delete legacy.brand;
    delete legacy.slug;
    delete legacy.status;
    legacy.stage = "active";
    delete legacy.relationshipId;
  });

  const listed = tenants.listClients(agency.id);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.brand.primaryColor, "#123456", "missing client colour inherits the agency brand");
  assert.equal(listed[0]?.slug, "legacy-dental");
  assert.equal(listed[0]?.status, "active");
  assert.equal(listed[0]?.stage, "live");
  assert.equal(listed[0]?.relationshipId, created.id);

  const opened = tenants.getClientForAgency(agency.id, created.id);
  assert.equal(opened?.brand.primaryColor, "#123456");
  assert.equal(opened?.slug, "legacy-dental");
  assert.equal(opened?.status, "active");
  assert.equal(opened?.stage, "live");

  tenants.updateClient(agency.id, created.id, { metadata: { note: "repair on next write" } });
  assert.equal(storage.getState().clients[created.id]?.brand.primaryColor, "#123456");
  assert.equal(storage.getState().clients[created.id]?.slug, "legacy-dental");
  assert.equal(storage.getState().clients[created.id]?.status, "active");
  assert.equal(storage.getState().clients[created.id]?.stage, "live");
});

test("custom portal probing refuses an absent legacy slug before joining a filesystem path", () => {
  const source = readFileSync("src/app/portal/clients/[clientId]/page.tsx", "utf8");
  const guard = source.indexOf('if (typeof slug !== "string" || !slug.trim()) return false;');
  const join = source.indexOf('join(root, "..", "clients", slug.trim())');
  assert.ok(guard >= 0 && join > guard);
});
