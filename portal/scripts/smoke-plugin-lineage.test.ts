// PLUGIN-LINEAGE-001 — authenticated Agency Marketing and Email Sender HTTP
// bodies must not carry reserved client/person lineage. A caller who names a
// `clientId`/`personId` in the body must NOT get it stamped onto the created
// record: a spoofed id would misfile a lead/identity into another client's
// records and erasure scope, or forge a canonical-Person link that SEC-004/005
// require to come from a server-side path. Lineage is stamped server-side only.
//
// Drives the REAL exported handlers with a minimal in-memory foundation.
// Run: node --import tsx --test scripts/smoke-plugin-lineage.test.ts

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { createLeadHandler } from "../src/built-ins/modules/agency-marketing/src/api/handlers";
import {
  registerAgencyMarketingFoundation,
  clearAgencyMarketingFoundation,
} from "../src/built-ins/modules/agency-marketing/src/server/foundationAdapter";
import { createIdentityHandler } from "../src/built-ins/modules/email-sender/src/api/handlers";
import {
  registerEmailSenderFoundation,
  clearEmailSenderFoundation,
} from "../src/built-ins/modules/email-sender/src/server/foundationAdapter";

const AGENCY_ID = "agency_lineage_smoke";
const ACTOR = "user_admin_lineage";
const OTHER_CLIENT = "client_victim_should_not_bind";
const OTHER_PERSON = "per_victim_should_not_bind";

function makeStorage() {
  const data = new Map<string, unknown>();
  return {
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> { data.set(key, value); },
    async del(key: string): Promise<void> { data.delete(key); },
    async list(prefix?: string): Promise<string[]> {
      const keys = [...data.keys()];
      return prefix ? keys.filter((k) => k.startsWith(prefix)) : keys;
    },
    async runExclusive<T>(_key: string, op: () => Promise<T>): Promise<T> { return op(); },
  };
}

// Minimal foundation ports — structurally satisfy both modules.
const agency = { id: AGENCY_ID, name: "Lineage Co", slug: "lineage-co", brand: { primaryColor: "#000" }, status: "active", createdAt: 0, updatedAt: 0 };
const ports = {
  tenant: { getAgency: (id: string) => (id === AGENCY_ID ? agency : null) },
  user: { getUser: (id: string) => (id === ACTOR ? { id: ACTOR, email: "admin@lineage.test", name: "Admin", agencyId: AGENCY_ID } : null) },
  activity: { logActivity: () => ({}), listActivity: () => [] },
  events: { emit: () => {} },
  pluginInstalls: { getInstall: () => null },
};

const install = {
  id: "inst_lineage", pluginId: "x", agencyId: AGENCY_ID, enabled: true,
  config: {}, features: {}, installedAt: 0,
};

function ctxWith(storage: ReturnType<typeof makeStorage>) {
  return { agencyId: AGENCY_ID, install, storage, actor: ACTOR } as unknown as never;
}

before(() => {
  registerAgencyMarketingFoundation(ports as never);
  registerEmailSenderFoundation(ports as never);
});
after(() => {
  clearAgencyMarketingFoundation();
  clearEmailSenderFoundation();
});

function post(url: string, body: unknown): Request {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("PLUGIN-LINEAGE-001: createLead strips caller-supplied clientId/personId, keeps real fields", async () => {
  const storage = makeStorage();
  const req = post("http://portal.test/api/portal/agency-marketing/leads", {
    email: "prospect@example.com",
    name: "Prospect",
    campaignId: "cmp_real",
    clientId: OTHER_CLIENT,
    personId: OTHER_PERSON,
  });
  const res = await createLeadHandler(req, ctxWith(storage));
  assert.equal(res.status, 201, "a valid lead is still created");
  const body = (await res.json()) as { ok: boolean; lead: Record<string, unknown> };
  assert.equal(body.ok, true);
  assert.equal(body.lead.clientId, undefined, "a body-supplied clientId must NOT be stamped onto the lead");
  assert.equal(body.lead.personId, undefined, "a body-supplied personId must NOT be stamped onto the lead");
  // The non-lineage fields the caller legitimately owns are preserved.
  assert.equal(body.lead.email, "prospect@example.com");
  assert.equal(body.lead.campaignId, "cmp_real");
  assert.equal(body.lead.agencyId, AGENCY_ID, "agency lineage is server-derived from the context");
});

test("PLUGIN-LINEAGE-001: createIdentity strips a caller-supplied clientId, keeps name/email", async () => {
  const storage = makeStorage();
  const req = post("http://portal.test/api/portal/email-sender/identities", {
    name: "Support",
    email: "support@lineage.test",
    clientId: OTHER_CLIENT,
  });
  const res = await createIdentityHandler(req, ctxWith(storage));
  assert.equal(res.status, 201, "a valid sender identity is still created");
  const body = (await res.json()) as { ok: boolean; identity: Record<string, unknown> };
  assert.equal(body.ok, true);
  assert.equal(body.identity.clientId, undefined, "a body-supplied clientId must NOT be stamped onto the identity");
  assert.equal(body.identity.name, "Support");
  assert.equal(body.identity.email, "support@lineage.test");
  assert.equal(body.identity.agencyId, AGENCY_ID, "agency lineage is server-derived from the context");
});
