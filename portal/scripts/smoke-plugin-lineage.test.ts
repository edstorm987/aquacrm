// PLUGIN-LINEAGE-001 — authenticated HTTP bodies cannot stamp reserved
// client/person lineage or overwrite immutable record metadata. The generic
// email enqueue service is in-process only: mounting it as an owner/manager
// HTTP route would let a browser invent plugin provenance, idempotency refs,
// and another client's erasure lineage.
//
// Drives the REAL exported handlers with a minimal in-memory foundation.
// Run: node --import tsx --test scripts/smoke-plugin-lineage.test.ts

import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  createCampaignHandler,
  createLeadHandler,
  createTemplateHandler,
  updateCampaignHandler,
  updateLeadHandler,
  updateTemplateHandler,
} from "../src/built-ins/modules/agency-marketing/src/api/handlers";
import {
  containerFor as agencyMarketingContainerFor,
  registerAgencyMarketingFoundation,
  clearAgencyMarketingFoundation,
} from "../src/built-ins/modules/agency-marketing/src/server/foundationAdapter";
import { createIdentityHandler } from "../src/built-ins/modules/email-sender/src/api/handlers";
import {
  containerFor as emailSenderContainerFor,
  registerEmailSenderFoundation,
  clearEmailSenderFoundation,
} from "../src/built-ins/modules/email-sender/src/server/foundationAdapter";
import emailSenderManifest from "../src/built-ins/modules/email-sender";
import {
  createCampaignHandler as distributedCreateCampaignHandler,
  createLeadHandler as distributedCreateLeadHandler,
  createTemplateHandler as distributedCreateTemplateHandler,
  updateCampaignHandler as distributedUpdateCampaignHandler,
  updateLeadHandler as distributedUpdateLeadHandler,
  updateTemplateHandler as distributedUpdateTemplateHandler,
} from "../../github-templates/modules/agency-marketing/src/api/handlers";
import {
  containerFor as distributedAgencyMarketingContainerFor,
  registerAgencyMarketingFoundation as registerDistributedAgencyMarketingFoundation,
  clearAgencyMarketingFoundation as clearDistributedAgencyMarketingFoundation,
} from "../../github-templates/modules/agency-marketing/src/server/foundationAdapter";
import {
  createIdentityHandler as distributedCreateIdentityHandler,
} from "../../github-templates/modules/email-sender/src/api/handlers";
import {
  containerFor as distributedEmailSenderContainerFor,
  registerEmailSenderFoundation as registerDistributedEmailSenderFoundation,
  clearEmailSenderFoundation as clearDistributedEmailSenderFoundation,
} from "../../github-templates/modules/email-sender/src/server/foundationAdapter";
import distributedEmailSenderManifest from "../../github-templates/modules/email-sender";

const AGENCY_ID = "agency_lineage_smoke";
const ACTOR = "user_admin_lineage";
const OTHER_CLIENT = "client_victim_should_not_bind";
const OTHER_PERSON = "per_victim_should_not_bind";
const OWNED_CLIENT = "client_exact_owner";
const OWNED_PERSON = "per_exact_owner";

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
  registerDistributedAgencyMarketingFoundation(ports as never);
  registerDistributedEmailSenderFoundation(ports as never);
});
after(() => {
  clearAgencyMarketingFoundation();
  clearEmailSenderFoundation();
  clearDistributedAgencyMarketingFoundation();
  clearDistributedEmailSenderFoundation();
});

function post(url: string, body: unknown): Request {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function patch(url: string, body: unknown): Request {
  return new Request(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
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

test("PLUGIN-LINEAGE-001: lead PATCH cannot overwrite ownership, identity, contact history, or record metadata", async () => {
  const storage = makeStorage();
  const container = agencyMarketingContainerFor({ agencyId: AGENCY_ID, storage: storage as never, install });
  const created = await container.leads.create({
    email: "owned@example.com",
    name: "Owned lead",
    clientId: OWNED_CLIENT,
    personId: OWNED_PERSON,
  }, ACTOR);

  const forged = {
    id: "lead_forged",
    agencyId: "agency_foreign",
    clientId: OTHER_CLIENT,
    personId: OTHER_PERSON,
    source: "import",
    contactHistory: [{ at: 1, by: "attacker", note: "forged contact" }],
    createdAt: 1,
    updatedAt: 1,
    lastContactedAt: 1,
    name: "Allowed handler edit",
  };
  const response = await updateLeadHandler(
    patch("http://portal.test/api/portal/agency-marketing/leads", { id: created.id, patch: forged }),
    ctxWith(storage),
  );
  assert.equal(response.status, 200);
  const handlerRow = ((await response.json()) as { lead: typeof created }).lead;
  assert.equal(handlerRow.name, "Allowed handler edit", "the allowlist keeps legitimate mutable fields");
  assert.equal(handlerRow.id, created.id);
  assert.equal(handlerRow.agencyId, AGENCY_ID);
  assert.equal(handlerRow.clientId, OWNED_CLIENT);
  assert.equal(handlerRow.personId, OWNED_PERSON);
  assert.equal(handlerRow.source, "manual");
  assert.deepEqual(handlerRow.contactHistory, []);
  assert.equal(handlerRow.createdAt, created.createdAt);
  assert.notEqual(handlerRow.updatedAt, 1);
  assert.equal(handlerRow.lastContactedAt, undefined);

  const serviceRow = await container.leads.update(created.id, {
    ...forged,
    name: "Allowed service edit",
  } as never, ACTOR);
  assert.equal(serviceRow?.name, "Allowed service edit", "the service allowlist keeps legitimate mutable fields");
  assert.equal(serviceRow?.id, created.id);
  assert.equal(serviceRow?.agencyId, AGENCY_ID);
  assert.equal(serviceRow?.clientId, OWNED_CLIENT);
  assert.equal(serviceRow?.personId, OWNED_PERSON);
  assert.deepEqual(serviceRow?.contactHistory, []);
  assert.equal(serviceRow?.createdAt, created.createdAt);

  const erasure = await container.leads.eraseForClient({
    clientId: OWNED_CLIENT,
    personId: OWNED_PERSON,
    personShared: false,
    emails: [created.email],
    phones: [],
    sharedEmails: [],
    sharedPhones: [],
  });
  assert.equal(erasure.erased, 1, "a hostile PATCH cannot move an exact-owned lead outside its erasure scope");
  assert.equal(await container.leads.get(created.id), null);
});

test("PLUGIN-LINEAGE-001: campaign PATCH cannot overwrite id, agencyId, or createdAt through either boundary", async () => {
  const storage = makeStorage();
  const createdResponse = await createCampaignHandler(post("http://portal.test/api/portal/agency-marketing/campaigns", {
    name: "Original campaign",
    channel: "email",
  }), ctxWith(storage));
  assert.equal(createdResponse.status, 201);
  const created = ((await createdResponse.json()) as { campaign: { id: string; agencyId: string; createdAt: number } }).campaign;
  const forged = {
    id: "cmp_forged",
    agencyId: "agency_foreign",
    createdAt: 1,
    updatedAt: 1,
    name: "Allowed handler campaign edit",
  };

  const response = await updateCampaignHandler(
    patch("http://portal.test/api/portal/agency-marketing/campaigns", { id: created.id, patch: forged }),
    ctxWith(storage),
  );
  assert.equal(response.status, 200);
  const handlerRow = ((await response.json()) as { campaign: Record<string, unknown> }).campaign;
  assert.equal(handlerRow.name, "Allowed handler campaign edit");
  assert.equal(handlerRow.id, created.id);
  assert.equal(handlerRow.agencyId, AGENCY_ID);
  assert.equal(handlerRow.createdAt, created.createdAt);
  assert.notEqual(handlerRow.updatedAt, 1);

  const container = agencyMarketingContainerFor({ agencyId: AGENCY_ID, storage: storage as never, install });
  const serviceRow = await container.campaigns.update(created.id, {
    ...forged,
    name: "Allowed service campaign edit",
  } as never, ACTOR);
  assert.equal(serviceRow?.name, "Allowed service campaign edit");
  assert.equal(serviceRow?.id, created.id);
  assert.equal(serviceRow?.agencyId, AGENCY_ID);
  assert.equal(serviceRow?.createdAt, created.createdAt);
});

test("PLUGIN-LINEAGE-001: template PATCH cannot overwrite id, agencyId, createdAt, or default provenance", async () => {
  const storage = makeStorage();
  const createdResponse = await createTemplateHandler(post("http://portal.test/api/portal/agency-marketing/templates", {
    name: "Original template",
    subject: "Original subject",
    bodyHtml: "<p>Original</p>",
    category: "other",
  }), ctxWith(storage));
  assert.equal(createdResponse.status, 201);
  const created = ((await createdResponse.json()) as { template: { id: string; agencyId: string; createdAt: number; isDefault: boolean } }).template;
  const forged = {
    id: "tpl_forged",
    agencyId: "agency_foreign",
    createdAt: 1,
    updatedAt: 1,
    isDefault: true,
    subject: "Allowed handler subject",
  };

  const response = await updateTemplateHandler(
    patch("http://portal.test/api/portal/agency-marketing/templates", { id: created.id, patch: forged }),
    ctxWith(storage),
  );
  assert.equal(response.status, 200);
  const handlerRow = ((await response.json()) as { template: Record<string, unknown> }).template;
  assert.equal(handlerRow.subject, "Allowed handler subject");
  assert.equal(handlerRow.id, created.id);
  assert.equal(handlerRow.agencyId, AGENCY_ID);
  assert.equal(handlerRow.createdAt, created.createdAt);
  assert.equal(handlerRow.isDefault, false);
  assert.notEqual(handlerRow.updatedAt, 1);

  const container = agencyMarketingContainerFor({ agencyId: AGENCY_ID, storage: storage as never, install });
  const serviceRow = await container.templates.update(created.id, {
    ...forged,
    subject: "Allowed service subject",
  } as never, ACTOR);
  assert.equal(serviceRow?.subject, "Allowed service subject");
  assert.equal(serviceRow?.id, created.id);
  assert.equal(serviceRow?.agencyId, AGENCY_ID);
  assert.equal(serviceRow?.createdAt, created.createdAt);
  assert.equal(serviceRow?.isDefault, false);
});

test("PLUGIN-LINEAGE-001: arbitrary email enqueue is not HTTP-mounted, while typed in-process lineage remains erasable", async () => {
  assert.equal(
    emailSenderManifest.api.some(route => route.path.replace(/^\//, "") === "internal/enqueue"),
    false,
    "the catch-all dispatcher can only resolve manifest routes, so arbitrary lineage-bearing enqueue must be absent",
  );

  const storage = makeStorage();
  const container = emailSenderContainerFor({ agencyId: AGENCY_ID, storage: storage as never, install });
  const message = await container.emails.enqueue({
    to: "owned-recipient@example.com",
    from: { name: "Trusted sender", email: "sender@example.com" },
    subject: "Typed in-process event",
    bodyText: "The event subscriber can still enqueue through the service.",
    triggeredByPlugin: "client-crm",
    externalRef: "automation:owned-card",
    clientId: OWNED_CLIENT,
    personId: OWNED_PERSON,
  });
  assert.equal(message.clientId, OWNED_CLIENT);
  assert.equal(message.personId, OWNED_PERSON);

  const erasure = await container.emails.eraseForClient({
    clientId: OWNED_CLIENT,
    personId: OWNED_PERSON,
    personShared: false,
    emails: ["owned-recipient@example.com"],
    sharedEmails: [],
  });
  assert.equal(erasure.erased, 1, "trusted in-process lineage remains available to exact erasure");
  assert.equal(await container.emails.get(message.id), null);
});

test("PLUGIN-LINEAGE-001 distribution: lead PATCH preserves immutable ownership and append-only contact metadata", async () => {
  const storage = makeStorage();
  const createdResponse = await distributedCreateLeadHandler(post("http://template.test/api/portal/agency-marketing/leads", {
    email: "distributed-lead@example.com",
    name: "Original distributed lead",
  }), ctxWith(storage));
  assert.equal(createdResponse.status, 201);
  const created = ((await createdResponse.json()) as { lead: {
    id: string;
    agencyId: string;
    source: string;
    contactHistory: unknown[];
    createdAt: number;
  } }).lead;
  const forged = {
    id: "lead_forged",
    agencyId: "agency_foreign",
    source: "import",
    contactHistory: [{ at: 1, by: "attacker", note: "forged contact" }],
    createdAt: 1,
    updatedAt: 1,
    lastContactedAt: 1,
    name: "Allowed distributed handler edit",
  };

  const response = await distributedUpdateLeadHandler(
    patch("http://template.test/api/portal/agency-marketing/leads", { id: created.id, patch: forged }),
    ctxWith(storage),
  );
  assert.equal(response.status, 200);
  const handlerRow = ((await response.json()) as { lead: Record<string, unknown> }).lead;
  assert.equal(handlerRow.name, "Allowed distributed handler edit");
  assert.equal(handlerRow.id, created.id);
  assert.equal(handlerRow.agencyId, AGENCY_ID);
  assert.equal(handlerRow.source, "manual");
  assert.deepEqual(handlerRow.contactHistory, []);
  assert.equal(handlerRow.createdAt, created.createdAt);
  assert.notEqual(handlerRow.updatedAt, 1);
  assert.equal(handlerRow.lastContactedAt, undefined);

  const container = distributedAgencyMarketingContainerFor({ agencyId: AGENCY_ID, storage: storage as never, install });
  const serviceRow = await container.leads.update(created.id, {
    ...forged,
    name: "Allowed distributed service edit",
  } as never, ACTOR);
  assert.equal(serviceRow?.name, "Allowed distributed service edit");
  assert.equal(serviceRow?.id, created.id);
  assert.equal(serviceRow?.agencyId, AGENCY_ID);
  assert.equal(serviceRow?.source, "manual");
  assert.deepEqual(serviceRow?.contactHistory, []);
  assert.equal(serviceRow?.createdAt, created.createdAt);
});

test("PLUGIN-LINEAGE-001 distribution: campaign PATCH preserves id, agencyId, and createdAt at both boundaries", async () => {
  const storage = makeStorage();
  const createdResponse = await distributedCreateCampaignHandler(post("http://template.test/api/portal/agency-marketing/campaigns", {
    name: "Original distributed campaign",
    channel: "email",
  }), ctxWith(storage));
  assert.equal(createdResponse.status, 201);
  const created = ((await createdResponse.json()) as { campaign: { id: string; agencyId: string; createdAt: number } }).campaign;
  const forged = {
    id: "cmp_forged",
    agencyId: "agency_foreign",
    createdAt: 1,
    updatedAt: 1,
    name: "Allowed distributed handler edit",
  };

  const response = await distributedUpdateCampaignHandler(
    patch("http://template.test/api/portal/agency-marketing/campaigns", { id: created.id, patch: forged }),
    ctxWith(storage),
  );
  assert.equal(response.status, 200);
  const handlerRow = ((await response.json()) as { campaign: Record<string, unknown> }).campaign;
  assert.equal(handlerRow.name, "Allowed distributed handler edit");
  assert.equal(handlerRow.id, created.id);
  assert.equal(handlerRow.agencyId, AGENCY_ID);
  assert.equal(handlerRow.createdAt, created.createdAt);
  assert.notEqual(handlerRow.updatedAt, 1);

  const container = distributedAgencyMarketingContainerFor({ agencyId: AGENCY_ID, storage: storage as never, install });
  const serviceRow = await container.campaigns.update(created.id, {
    ...forged,
    name: "Allowed distributed service edit",
  } as never, ACTOR);
  assert.equal(serviceRow?.name, "Allowed distributed service edit");
  assert.equal(serviceRow?.id, created.id);
  assert.equal(serviceRow?.agencyId, AGENCY_ID);
  assert.equal(serviceRow?.createdAt, created.createdAt);
});

test("PLUGIN-LINEAGE-001 distribution: template PATCH preserves id, agencyId, createdAt, and default provenance", async () => {
  const storage = makeStorage();
  const createdResponse = await distributedCreateTemplateHandler(post("http://template.test/api/portal/agency-marketing/templates", {
    name: "Original distributed template",
    subject: "Original subject",
    bodyHtml: "<p>Original</p>",
    category: "other",
  }), ctxWith(storage));
  assert.equal(createdResponse.status, 201);
  const created = ((await createdResponse.json()) as { template: {
    id: string;
    agencyId: string;
    createdAt: number;
    isDefault: boolean;
  } }).template;
  const forged = {
    id: "tpl_forged",
    agencyId: "agency_foreign",
    createdAt: 1,
    updatedAt: 1,
    isDefault: true,
    subject: "Allowed distributed handler subject",
  };

  const response = await distributedUpdateTemplateHandler(
    patch("http://template.test/api/portal/agency-marketing/templates", { id: created.id, patch: forged }),
    ctxWith(storage),
  );
  assert.equal(response.status, 200);
  const handlerRow = ((await response.json()) as { template: Record<string, unknown> }).template;
  assert.equal(handlerRow.subject, "Allowed distributed handler subject");
  assert.equal(handlerRow.id, created.id);
  assert.equal(handlerRow.agencyId, AGENCY_ID);
  assert.equal(handlerRow.createdAt, created.createdAt);
  assert.equal(handlerRow.isDefault, false);
  assert.notEqual(handlerRow.updatedAt, 1);

  const container = distributedAgencyMarketingContainerFor({ agencyId: AGENCY_ID, storage: storage as never, install });
  const serviceRow = await container.templates.update(created.id, {
    ...forged,
    subject: "Allowed distributed service subject",
  } as never, ACTOR);
  assert.equal(serviceRow?.subject, "Allowed distributed service subject");
  assert.equal(serviceRow?.id, created.id);
  assert.equal(serviceRow?.agencyId, AGENCY_ID);
  assert.equal(serviceRow?.createdAt, created.createdAt);
  assert.equal(serviceRow?.isDefault, false);
});

test("PLUGIN-LINEAGE-001 distribution: generated email module exposes no HTTP enqueue but preserves typed in-process lineage", async () => {
  assert.equal(
    distributedEmailSenderManifest.api.some(route => route.path.replace(/^\//, "") === "internal/enqueue"),
    false,
    "a generated deployment must not reintroduce the arbitrary lineage-bearing HTTP route",
  );

  const storage = makeStorage();
  const identityResponse = await distributedCreateIdentityHandler(post("http://template.test/api/portal/email-sender/identities", {
    name: "Distributed sender",
    email: "distributed-sender@example.com",
    clientId: OTHER_CLIENT,
  }), ctxWith(storage));
  assert.equal(identityResponse.status, 201);
  const identity = ((await identityResponse.json()) as { identity: Record<string, unknown> }).identity;
  assert.equal(identity.clientId, undefined, "a generated identity endpoint cannot accept client ownership lineage");
  assert.equal(identity.agencyId, AGENCY_ID);

  const container = distributedEmailSenderContainerFor({ agencyId: AGENCY_ID, storage: storage as never, install });
  const message = await container.emails.enqueue({
    to: "distributed-owned@example.com",
    from: { name: "Trusted distributed sender", email: "distributed-sender@example.com" },
    subject: "Typed distributed event",
    bodyText: "The generated module still supports trusted in-process subscribers.",
    triggeredByPlugin: "client-crm",
    externalRef: "distributed:owned-card",
    clientId: OWNED_CLIENT,
  });
  assert.equal(message.clientId, OWNED_CLIENT);
  assert.equal(message.triggeredByPlugin, "client-crm");
});
