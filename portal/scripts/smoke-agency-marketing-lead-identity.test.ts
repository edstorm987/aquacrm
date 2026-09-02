import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  createLeadHandler,
  listLeadsHandler,
  updateLeadHandler,
} from "../src/built-ins/modules/agency-marketing/src/api/handlers";
import type {
  PluginCtx,
  PluginStorage,
} from "../src/built-ins/modules/agency-marketing/src/lib/aquaPluginTypes";
import type {
  ActivityEntry,
  Agency,
  PluginInstall,
} from "../src/built-ins/modules/agency-marketing/src/lib/tenancy";
import {
  clearAgencyMarketingFoundation,
  registerAgencyMarketingFoundation,
} from "../src/built-ins/modules/agency-marketing/src/server/foundationAdapter";

const agencyId = "agency_marketing_lead_identity";
const actor = "user_marketing_lead_identity";

function context(): PluginCtx {
  const values = new Map<string, unknown>();
  const storage: PluginStorage = {
    async get<T = unknown>(key: string) { return values.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T) { values.set(key, structuredClone(value)); },
    async runExclusive<T>(_key: string, operation: () => Promise<T>) { return operation(); },
    async del(key: string) { values.delete(key); },
    async list(prefix = "") { return [...values.keys()].filter(key => key.startsWith(prefix)); },
  };
  const install: PluginInstall = {
    id: "install_marketing_lead_identity",
    pluginId: "agency-marketing",
    agencyId,
    enabled: true,
    config: {},
    features: {},
    installedAt: Date.now(),
  };
  return {
    agencyId,
    actor,
    install,
    storage,
    services: {} as PluginCtx["services"],
  };
}

function leadRequest(method: "POST" | "PATCH", body: unknown): Request {
  return new Request("http://localhost/leads", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Agency Marketing lead identity boundary", () => {
  before(() => {
    const agency: Agency = {
      id: agencyId,
      name: "Marketing identity test",
      slug: "marketing-identity-test",
      brand: { primaryColor: "#000000" },
      status: "active",
      createdAt: 0,
      updatedAt: 0,
    };
    registerAgencyMarketingFoundation({
      tenant: { getAgency: id => id === agencyId ? agency : null },
      user: { getUser: () => null },
      activity: {
        logActivity: input => ({ id: "activity", ts: Date.now(), ...input } as ActivityEntry),
        listActivity: () => [],
      },
      events: { emit: () => undefined },
      pluginInstalls: { getInstall: () => null },
    });
  });

  after(() => clearAgencyMarketingFoundation());

  it("returns 409 without moving either canonical email pointer", async () => {
    const ctx = context();
    const firstResponse = await createLeadHandler(leadRequest("POST", {
      email: " First.Owner@Example.com ",
      name: "First owner",
    }), ctx);
    const secondResponse = await createLeadHandler(leadRequest("POST", {
      email: "second.owner@example.com",
      name: "Second owner",
    }), ctx);
    assert.equal(firstResponse.status, 201);
    assert.equal(secondResponse.status, 201);
    const first = (await firstResponse.json()) as { lead: { id: string; email: string } };
    const second = (await secondResponse.json()) as { lead: { id: string; email: string } };
    assert.equal(first.lead.email, "first.owner@example.com");

    const conflictResponse = await updateLeadHandler(leadRequest("PATCH", {
      id: second.lead.id,
      patch: { email: " FIRST.OWNER@example.com " },
    }), ctx);
    assert.equal(conflictResponse.status, 409);
    assert.deepEqual(await conflictResponse.json(), {
      ok: false,
      error: "marketing_lead_identity_conflict",
      message: "Another marketing lead already uses this email. Review that record instead of merging people silently.",
    });

    const listResponse = await listLeadsHandler(new Request("http://localhost/leads"), ctx);
    const listed = (await listResponse.json()) as { leads: Array<{ id: string; email: string }> };
    assert.deepEqual(
      listed.leads.map(lead => [lead.id, lead.email]).sort((a, b) => a[1].localeCompare(b[1])),
      [
        [first.lead.id, "first.owner@example.com"],
        [second.lead.id, "second.owner@example.com"],
      ],
    );
  });

  it("accepts only one simultaneous create for a canonical address", async () => {
    const ctx = context();
    const responses = await Promise.all([
      createLeadHandler(leadRequest("POST", { email: " race.route@example.com " }), ctx),
      createLeadHandler(leadRequest("POST", { email: "RACE.ROUTE@example.com" }), ctx),
    ]);
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);

    const listResponse = await listLeadsHandler(new Request("http://localhost/leads"), ctx);
    const listed = (await listResponse.json()) as { leads: Array<{ email: string }> };
    assert.deepEqual(listed.leads.map(lead => lead.email), ["race.route@example.com"]);
  });
});
