import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {}, paths: [], children: [],
} as never;

type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Attention = typeof import("../src/lib/server/clientAttention");

let storage: Storage;
let tenants: Tenants;
let attention: Attention;

const DAY = 86_400_000;

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  attention = await import("../src/lib/server/clientAttention");
  await storage.ensureHydrated();
});

let seq = 0;
const ev = (type: string, occurredAt: number) => ({ id: `evt_${(seq += 1)}`, type, occurredAt, receivedAt: occurredAt });
const enquiryNone = () => [
  ...Array.from({ length: 5 }, () => ev("form", -45 * DAY)),
  ...Array.from({ length: 4 }, () => ev("form", -75 * DAY)),
];

test("lists only clients in risk/watch, with the top reason and a Fulfilment link", async () => {
  await storage.reset();
  const now = Date.UTC(2026, 7, 14);
  const agency = tenants.createAgency({ name: "Attention Panel", slug: "attention-panel" });

  const risky = tenants.createClient(agency.id, {
    name: "Silent Enquiries Ltd",
    stage: "live",
    ownerEmail: "owner@example.com", // owner present, so the risk is the enquiry signal, not a missing owner
    metadata: {
      lastContactedAt: now - 3 * DAY,
      telemetryLastSeenAt: now - DAY,
      telemetryEvents: enquiryNone().map(event => ({ ...event, occurredAt: now + event.occurredAt, receivedAt: now + event.occurredAt })),
    },
  });
  // A churned client is never surfaced, however bad its signals look.
  const churned = tenants.createClient(agency.id, {
    name: "Gone Already",
    stage: "churned",
    ownerEmail: "gone@example.com",
    metadata: { telemetryEvents: enquiryNone().map(event => ({ ...event, occurredAt: now + event.occurredAt, receivedAt: now + event.occurredAt })) },
  });

  const items = await attention.listClientsNeedingAttention(agency.id, now);
  const risk = items.find(item => item.clientId === risky.id);

  assert.ok(risk, "the enquiry-none client should need attention");
  assert.equal(risk.state, "risk");
  assert.match(risk.headline, /Enquir/i);
  assert.equal(risk.href, `/portal/clients/${risky.id}`);
  assert.ok(!items.some(item => item.clientId === churned.id), "a churned client is never listed");
  assert.ok(items.every(item => item.state === "risk" || item.state === "watch"), "only risk/watch clients appear");
});

test("returns nothing for an agency with no active clients", async () => {
  await storage.reset();
  const agency = tenants.createAgency({ name: "Empty", slug: "empty-attention" });
  assert.deepEqual(await attention.listClientsNeedingAttention(agency.id, Date.UTC(2026, 7, 14)), []);
});

test("ranks risk ahead of watch", async () => {
  await storage.reset();
  const now = Date.UTC(2026, 7, 14);
  const agency = tenants.createAgency({ name: "Ordering", slug: "ordering-attention" });
  tenants.createClient(agency.id, {
    name: "Risk Client",
    stage: "live",
    ownerEmail: "r@example.com",
    metadata: {
      lastContactedAt: now - 3 * DAY,
      telemetryEvents: enquiryNone().map(event => ({ ...event, occurredAt: now + event.occurredAt, receivedAt: now + event.occurredAt })),
    },
  });
  const items = await attention.listClientsNeedingAttention(agency.id, now);
  // Risk always precedes watch; within a state the lower score comes first.
  for (let index = 1; index < items.length; index += 1) {
    const order = { risk: 0, watch: 1 } as const;
    assert.ok(order[items[index - 1].state] <= order[items[index].state], "risk must sort before watch");
  }
});
