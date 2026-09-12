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
import {
  MarketingMutationValidationError,
} from "../src/built-ins/modules/agency-marketing/src/lib/mutationAllowlist";
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
  MarketingMutationValidationError as DistributedMarketingMutationValidationError,
} from "../../github-templates/modules/agency-marketing/src/lib/mutationAllowlist";
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
  let revision = 0;
  return {
    async get<T = unknown>(key: string): Promise<T | undefined> { return data.get(key) as T | undefined; },
    async set<T = unknown>(key: string, value: T): Promise<void> { data.set(key, value); revision += 1; },
    async del(key: string): Promise<void> { data.delete(key); revision += 1; },
    async list(prefix?: string): Promise<string[]> {
      const keys = [...data.keys()];
      return prefix ? keys.filter((k) => k.startsWith(prefix)) : keys;
    },
    async runExclusive<T>(_key: string, op: () => Promise<T>): Promise<T> { return op(); },
    snapshot(): { revision: number; entries: Array<[string, unknown]> } {
      return {
        revision,
        entries: [...data.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, value]) => [key, structuredClone(value)]),
      };
    },
  };
}

// Minimal foundation ports — structurally satisfy both modules.
const agency = { id: AGENCY_ID, name: "Lineage Co", slug: "lineage-co", brand: { primaryColor: "#000" }, status: "active", createdAt: 0, updatedAt: 0 };
const activityEntries: unknown[] = [];
const emittedEvents: unknown[] = [];
const ports = {
  tenant: { getAgency: (id: string) => (id === AGENCY_ID ? agency : null) },
  user: { getUser: (id: string) => (id === ACTOR ? { id: ACTOR, email: "admin@lineage.test", name: "Admin", agencyId: AGENCY_ID } : null) },
  activity: {
    logActivity: (entry: unknown) => { activityEntries.push(structuredClone(entry)); return {}; },
    listActivity: () => [],
  },
  events: { emit: (...args: unknown[]) => { emittedEvents.push(structuredClone(args)); } },
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

function mutationSnapshot(storage: ReturnType<typeof makeStorage>) {
  return {
    storage: storage.snapshot(),
    activity: structuredClone(activityEntries),
    events: structuredClone(emittedEvents),
  };
}

async function assertHttpValidationIsAtomic(
  storage: ReturnType<typeof makeStorage>,
  label: string,
  call: () => Promise<Response>,
): Promise<void> {
  const before = mutationSnapshot(storage);
  const response = await call();
  assert.equal(response.status, 422, `${label} must fail as an unprocessable patch`);
  assert.deepEqual(mutationSnapshot(storage), before, `${label} must not mutate records, indexes, activity or events`);
}

type MarketingValidationErrorConstructor =
  | typeof MarketingMutationValidationError
  | typeof DistributedMarketingMutationValidationError;

async function assertServiceValidationIsAtomic(
  storage: ReturnType<typeof makeStorage>,
  label: string,
  ErrorType: MarketingValidationErrorConstructor,
  call: () => Promise<unknown>,
): Promise<void> {
  const before = mutationSnapshot(storage);
  await assert.rejects(call, (error: unknown) => {
    assert.ok(error instanceof ErrorType, `${label} must throw its typed mutation validation error`);
    assert.equal((error as { code?: unknown }).code, "invalid_marketing_mutation");
    return true;
  });
  assert.deepEqual(mutationSnapshot(storage), before, `${label} must not mutate records, indexes, activity or events`);
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

const INVALID_LEAD_PATCHES: ReadonlyArray<readonly [string, unknown]> = [
  ["null container", null],
  ["array container", []],
  ["empty no-op", {}],
  ["immutable-only no-op", { id: "forged" }],
  ["email object", { email: {} }],
  ["blank email", { email: "   " }],
  ["name array", { name: [] }],
  ["phone boolean", { phone: false }],
  ["campaign object", { campaignId: {} }],
  ["blank campaign id", { campaignId: " " }],
  ["unknown status", { status: "root" }],
  ["staff number", { assignedStaffId: 7 }],
  ["blank staff id", { assignedStaffId: " " }],
  ["notes object", { notes: {} }],
  ["index change plus late bad name", { campaignId: "cmp_attacker", name: [] }],
  ["email index change plus bad notes", { email: "attacker@example.com", notes: {} }],
];

const INVALID_CAMPAIGN_PATCHES: ReadonlyArray<readonly [string, unknown]> = [
  ["null container", null],
  ["array container", []],
  ["empty no-op", {}],
  ["immutable-only no-op", { agencyId: "foreign" }],
  ["name array", { name: [] }],
  ["blank name", { name: " " }],
  ["unknown channel", { channel: "carrier-pigeon" }],
  ["unknown status", { status: "root" }],
  ["negative start", { startAt: -1 }],
  ["fractional end", { endAt: 1.5 }],
  ["fractional budget", { budgetCents: 1.5 }],
  ["unknown currency", { currency: "btc" }],
  ["unknown KPI", { goalKpi: "vanity" }],
  ["negative target", { goalTarget: -1 }],
  ["infinite result", { resultActual: Number.POSITIVE_INFINITY }],
  ["owner object", { ownerStaffId: {} }],
  ["blank owner id", { ownerStaffId: " " }],
  ["notes object", { notes: {} }],
  ["invalid prospective window", { startAt: 300, endAt: 200 }],
  ["invalid start against retained end", { startAt: 300 }],
  ["invalid end against retained start", { endAt: 50 }],
  ["channel index change plus late bad name", { channel: "sms", name: [] }],
];

const INVALID_TEMPLATE_PATCHES: ReadonlyArray<readonly [string, unknown]> = [
  ["null container", null],
  ["array container", []],
  ["empty no-op", {}],
  ["immutable-only no-op", { createdAt: 1 }],
  ["name array", { name: [] }],
  ["blank name", { name: " " }],
  ["subject object", { subject: {} }],
  ["blank subject", { subject: " " }],
  ["body HTML array", { bodyHtml: [] }],
  ["blank body HTML", { bodyHtml: " " }],
  ["body text object", { bodyText: {} }],
  ["unknown category", { category: "phishing" }],
  ["unknown status", { status: "root" }],
];

test("PLUGIN-LINEAGE-001: installed PATCH validation is typed, exhaustive, and atomic", async () => {
  const storage = makeStorage();
  const container = agencyMarketingContainerFor({ agencyId: AGENCY_ID, storage: storage as never, install });
  const lead = await container.leads.create({
    email: "atomic-installed@example.com",
    campaignId: "cmp_original",
    assignedStaffId: "staff_original",
  }, ACTOR);
  const campaign = await container.campaigns.create({
    name: "Atomic installed campaign",
    channel: "email",
    startAt: 100,
    endAt: 200,
  }, ACTOR);
  const template = await container.templates.create({
    name: "Atomic installed template",
    subject: "Subject",
    bodyHtml: "<p>Body</p>",
    category: "other",
  }, ACTOR);

  for (const [label, value] of INVALID_LEAD_PATCHES) {
    await assertHttpValidationIsAtomic(storage, `installed lead HTTP: ${label}`, () => updateLeadHandler(
      patch("http://portal.test/api/portal/agency-marketing/leads", { id: lead.id, patch: value }),
      ctxWith(storage),
    ));
    await assertServiceValidationIsAtomic(
      storage,
      `installed lead service: ${label}`,
      MarketingMutationValidationError,
      () => container.leads.update(lead.id, value as never, ACTOR),
    );
  }
  await assertServiceValidationIsAtomic(
    storage,
    "installed lead service: prototype-only patch",
    MarketingMutationValidationError,
    () => container.leads.update(lead.id, Object.create({ name: "inherited" }) as never, ACTOR),
  );

  for (const [label, value] of INVALID_CAMPAIGN_PATCHES) {
    await assertHttpValidationIsAtomic(storage, `installed campaign HTTP: ${label}`, () => updateCampaignHandler(
      patch("http://portal.test/api/portal/agency-marketing/campaigns", { id: campaign.id, patch: value }),
      ctxWith(storage),
    ));
    await assertServiceValidationIsAtomic(
      storage,
      `installed campaign service: ${label}`,
      MarketingMutationValidationError,
      () => container.campaigns.update(campaign.id, value as never, ACTOR),
    );
  }
  await assertServiceValidationIsAtomic(
    storage,
    "installed campaign service: prototype-only patch",
    MarketingMutationValidationError,
    () => container.campaigns.update(campaign.id, Object.create({ name: "inherited" }) as never, ACTOR),
  );

  for (const [label, value] of INVALID_TEMPLATE_PATCHES) {
    await assertHttpValidationIsAtomic(storage, `installed template HTTP: ${label}`, () => updateTemplateHandler(
      patch("http://portal.test/api/portal/agency-marketing/templates", { id: template.id, patch: value }),
      ctxWith(storage),
    ));
    await assertServiceValidationIsAtomic(
      storage,
      `installed template service: ${label}`,
      MarketingMutationValidationError,
      () => container.templates.update(template.id, value as never, ACTOR),
    );
  }
  await assertServiceValidationIsAtomic(
    storage,
    "installed template service: prototype-only patch",
    MarketingMutationValidationError,
    () => container.templates.update(template.id, Object.create({ subject: "inherited" }) as never, ACTOR),
  );
});

test("PLUGIN-LINEAGE-001 distribution: generated PATCH validation is typed, exhaustive, and atomic", async () => {
  const storage = makeStorage();
  const container = distributedAgencyMarketingContainerFor({ agencyId: AGENCY_ID, storage: storage as never, install });
  const lead = await container.leads.create({
    email: "atomic-distributed@example.com",
    campaignId: "cmp_original",
    assignedStaffId: "staff_original",
  }, ACTOR);
  const campaign = await container.campaigns.create({
    name: "Atomic distributed campaign",
    channel: "email",
    startAt: 100,
    endAt: 200,
  }, ACTOR);
  const template = await container.templates.create({
    name: "Atomic distributed template",
    subject: "Subject",
    bodyHtml: "<p>Body</p>",
    category: "other",
  }, ACTOR);

  for (const [label, value] of INVALID_LEAD_PATCHES) {
    await assertHttpValidationIsAtomic(storage, `distributed lead HTTP: ${label}`, () => distributedUpdateLeadHandler(
      patch("http://template.test/api/portal/agency-marketing/leads", { id: lead.id, patch: value }),
      ctxWith(storage),
    ));
    await assertServiceValidationIsAtomic(
      storage,
      `distributed lead service: ${label}`,
      DistributedMarketingMutationValidationError,
      () => container.leads.update(lead.id, value as never, ACTOR),
    );
  }
  await assertServiceValidationIsAtomic(
    storage,
    "distributed lead service: prototype-only patch",
    DistributedMarketingMutationValidationError,
    () => container.leads.update(lead.id, Object.create({ name: "inherited" }) as never, ACTOR),
  );

  for (const [label, value] of INVALID_CAMPAIGN_PATCHES) {
    await assertHttpValidationIsAtomic(storage, `distributed campaign HTTP: ${label}`, () => distributedUpdateCampaignHandler(
      patch("http://template.test/api/portal/agency-marketing/campaigns", { id: campaign.id, patch: value }),
      ctxWith(storage),
    ));
    await assertServiceValidationIsAtomic(
      storage,
      `distributed campaign service: ${label}`,
      DistributedMarketingMutationValidationError,
      () => container.campaigns.update(campaign.id, value as never, ACTOR),
    );
  }
  await assertServiceValidationIsAtomic(
    storage,
    "distributed campaign service: prototype-only patch",
    DistributedMarketingMutationValidationError,
    () => container.campaigns.update(campaign.id, Object.create({ name: "inherited" }) as never, ACTOR),
  );

  for (const [label, value] of INVALID_TEMPLATE_PATCHES) {
    await assertHttpValidationIsAtomic(storage, `distributed template HTTP: ${label}`, () => distributedUpdateTemplateHandler(
      patch("http://template.test/api/portal/agency-marketing/templates", { id: template.id, patch: value }),
      ctxWith(storage),
    ));
    await assertServiceValidationIsAtomic(
      storage,
      `distributed template service: ${label}`,
      DistributedMarketingMutationValidationError,
      () => container.templates.update(template.id, value as never, ACTOR),
    );
  }
  await assertServiceValidationIsAtomic(
    storage,
    "distributed template service: prototype-only patch",
    DistributedMarketingMutationValidationError,
    () => container.templates.update(template.id, Object.create({ subject: "inherited" }) as never, ACTOR),
  );
});

test("PLUGIN-LINEAGE-001: installed PATCH keeps every legitimate mutable field and supported null-clear", async () => {
  const storage = makeStorage();
  const container = agencyMarketingContainerFor({ agencyId: AGENCY_ID, storage: storage as never, install });
  const lead = await container.leads.create({
    email: "mutable-installed-old@example.com",
    name: "Old name",
    phone: "020 7000 0000",
    campaignId: "cmp_original",
    assignedStaffId: "staff_original",
    notes: "Old notes",
  }, ACTOR);
  const campaign = await container.campaigns.create({
    name: "Mutable installed campaign",
    channel: "email",
    startAt: 100,
    endAt: 200,
    budgetCents: 10,
    currency: "usd",
    goalKpi: "leads",
    goalTarget: 1,
    ownerStaffId: "staff_original",
    notes: "Old notes",
  }, ACTOR);
  const template = await container.templates.create({
    name: "Mutable installed template",
    subject: "Old subject",
    bodyHtml: "<p>Old</p>",
    bodyText: "Old text",
    category: "other",
  }, ACTOR);

  const leadResponse = await updateLeadHandler(patch("http://portal.test/api/portal/agency-marketing/leads", {
    id: lead.id,
    patch: {
      email: "mutable-installed-new@example.com",
      name: "New name",
      phone: "+44 20 7000 0001",
      campaignId: null,
      status: "contacted",
      assignedStaffId: null,
      notes: "",
    },
  }), ctxWith(storage));
  assert.equal(leadResponse.status, 200);
  const updatedLead = ((await leadResponse.json()) as { lead: Record<string, unknown> }).lead;
  assert.equal(updatedLead.email, "mutable-installed-new@example.com");
  assert.equal(updatedLead.name, "New name");
  assert.equal(updatedLead.phone, "+44 20 7000 0001");
  assert.equal(updatedLead.campaignId, undefined);
  assert.equal(updatedLead.status, "contacted");
  assert.equal(updatedLead.assignedStaffId, undefined);
  assert.equal(updatedLead.notes, "");
  assert.equal(await container.leads.getByEmail("mutable-installed-old@example.com"), null);
  assert.equal((await container.leads.getByEmail("mutable-installed-new@example.com"))?.id, lead.id);
  assert.deepEqual(await container.leads.listForCampaign("cmp_original"), []);
  assert.deepEqual(await container.leads.listForStaff("staff_original"), []);

  const campaignResponse = await updateCampaignHandler(patch("http://portal.test/api/portal/agency-marketing/campaigns", {
    id: campaign.id,
    patch: {
      name: "Updated installed campaign",
      channel: "sms",
      status: "scheduled",
      startAt: 110,
      endAt: 220,
      budgetCents: 20,
      currency: "gbp",
      goalKpi: "revenue",
      goalTarget: 2.5,
      resultActual: 1.25,
      ownerStaffId: null,
      notes: "",
    },
  }), ctxWith(storage));
  assert.equal(campaignResponse.status, 200);
  const updatedCampaign = ((await campaignResponse.json()) as { campaign: Record<string, unknown> }).campaign;
  assert.deepEqual(
    {
      name: updatedCampaign.name,
      channel: updatedCampaign.channel,
      status: updatedCampaign.status,
      startAt: updatedCampaign.startAt,
      endAt: updatedCampaign.endAt,
      budgetCents: updatedCampaign.budgetCents,
      currency: updatedCampaign.currency,
      goalKpi: updatedCampaign.goalKpi,
      goalTarget: updatedCampaign.goalTarget,
      resultActual: updatedCampaign.resultActual,
      ownerStaffId: updatedCampaign.ownerStaffId,
      notes: updatedCampaign.notes,
    },
    {
      name: "Updated installed campaign", channel: "sms", status: "scheduled", startAt: 110, endAt: 220,
      budgetCents: 20, currency: "gbp", goalKpi: "revenue", goalTarget: 2.5, resultActual: 1.25,
      ownerStaffId: undefined, notes: "",
    },
  );
  assert.deepEqual(await container.campaigns.listForChannel("email"), []);
  assert.equal((await container.campaigns.listForChannel("sms"))[0]?.id, campaign.id);

  const templateResponse = await updateTemplateHandler(patch("http://portal.test/api/portal/agency-marketing/templates", {
    id: template.id,
    patch: {
      name: "Updated installed template",
      subject: "New subject",
      bodyHtml: "<p>New</p>",
      bodyText: "",
      category: "newsletter",
      status: "archived",
    },
  }), ctxWith(storage));
  assert.equal(templateResponse.status, 200);
  const updatedTemplate = ((await templateResponse.json()) as { template: Record<string, unknown> }).template;
  assert.deepEqual(
    {
      name: updatedTemplate.name,
      subject: updatedTemplate.subject,
      bodyHtml: updatedTemplate.bodyHtml,
      bodyText: updatedTemplate.bodyText,
      category: updatedTemplate.category,
      status: updatedTemplate.status,
    },
    {
      name: "Updated installed template", subject: "New subject", bodyHtml: "<p>New</p>", bodyText: "",
      category: "newsletter", status: "archived",
    },
  );
});

test("PLUGIN-LINEAGE-001 distribution: generated PATCH keeps every mutable field and supported null-clear", async () => {
  const storage = makeStorage();
  const container = distributedAgencyMarketingContainerFor({ agencyId: AGENCY_ID, storage: storage as never, install });
  const lead = await container.leads.create({
    email: "mutable-distributed-old@example.com",
    name: "Old name",
    phone: "020 7000 0000",
    campaignId: "cmp_original",
    assignedStaffId: "staff_original",
    notes: "Old notes",
  }, ACTOR);
  const campaign = await container.campaigns.create({
    name: "Mutable distributed campaign",
    channel: "email",
    startAt: 100,
    endAt: 200,
    budgetCents: 10,
    currency: "usd",
    goalKpi: "leads",
    goalTarget: 1,
    ownerStaffId: "staff_original",
    notes: "Old notes",
  }, ACTOR);
  const template = await container.templates.create({
    name: "Mutable distributed template",
    subject: "Old subject",
    bodyHtml: "<p>Old</p>",
    bodyText: "Old text",
    category: "other",
  }, ACTOR);

  const leadResponse = await distributedUpdateLeadHandler(patch("http://template.test/api/portal/agency-marketing/leads", {
    id: lead.id,
    patch: {
      email: "mutable-distributed-new@example.com",
      name: "New name",
      phone: "+44 20 7000 0001",
      campaignId: null,
      status: "contacted",
      assignedStaffId: null,
      notes: "",
    },
  }), ctxWith(storage));
  assert.equal(leadResponse.status, 200);
  const updatedLead = ((await leadResponse.json()) as { lead: Record<string, unknown> }).lead;
  assert.equal(updatedLead.email, "mutable-distributed-new@example.com");
  assert.equal(updatedLead.name, "New name");
  assert.equal(updatedLead.phone, "+44 20 7000 0001");
  assert.equal(updatedLead.campaignId, undefined);
  assert.equal(updatedLead.status, "contacted");
  assert.equal(updatedLead.assignedStaffId, undefined);
  assert.equal(updatedLead.notes, "");
  assert.equal(await container.leads.getByEmail("mutable-distributed-old@example.com"), null);
  assert.equal((await container.leads.getByEmail("mutable-distributed-new@example.com"))?.id, lead.id);
  assert.deepEqual(await container.leads.listForCampaign("cmp_original"), []);
  assert.deepEqual(await container.leads.listForStaff("staff_original"), []);

  const campaignResponse = await distributedUpdateCampaignHandler(patch("http://template.test/api/portal/agency-marketing/campaigns", {
    id: campaign.id,
    patch: {
      name: "Updated distributed campaign",
      channel: "sms",
      status: "scheduled",
      startAt: 110,
      endAt: 220,
      budgetCents: 20,
      currency: "gbp",
      goalKpi: "revenue",
      goalTarget: 2.5,
      resultActual: 1.25,
      ownerStaffId: null,
      notes: "",
    },
  }), ctxWith(storage));
  assert.equal(campaignResponse.status, 200);
  const updatedCampaign = ((await campaignResponse.json()) as { campaign: Record<string, unknown> }).campaign;
  assert.deepEqual(
    {
      name: updatedCampaign.name,
      channel: updatedCampaign.channel,
      status: updatedCampaign.status,
      startAt: updatedCampaign.startAt,
      endAt: updatedCampaign.endAt,
      budgetCents: updatedCampaign.budgetCents,
      currency: updatedCampaign.currency,
      goalKpi: updatedCampaign.goalKpi,
      goalTarget: updatedCampaign.goalTarget,
      resultActual: updatedCampaign.resultActual,
      ownerStaffId: updatedCampaign.ownerStaffId,
      notes: updatedCampaign.notes,
    },
    {
      name: "Updated distributed campaign", channel: "sms", status: "scheduled", startAt: 110, endAt: 220,
      budgetCents: 20, currency: "gbp", goalKpi: "revenue", goalTarget: 2.5, resultActual: 1.25,
      ownerStaffId: undefined, notes: "",
    },
  );
  assert.deepEqual(await container.campaigns.listForChannel("email"), []);
  assert.equal((await container.campaigns.listForChannel("sms"))[0]?.id, campaign.id);

  const templateResponse = await distributedUpdateTemplateHandler(patch("http://template.test/api/portal/agency-marketing/templates", {
    id: template.id,
    patch: {
      name: "Updated distributed template",
      subject: "New subject",
      bodyHtml: "<p>New</p>",
      bodyText: "",
      category: "newsletter",
      status: "archived",
    },
  }), ctxWith(storage));
  assert.equal(templateResponse.status, 200);
  const updatedTemplate = ((await templateResponse.json()) as { template: Record<string, unknown> }).template;
  assert.deepEqual(
    {
      name: updatedTemplate.name,
      subject: updatedTemplate.subject,
      bodyHtml: updatedTemplate.bodyHtml,
      bodyText: updatedTemplate.bodyText,
      category: updatedTemplate.category,
      status: updatedTemplate.status,
    },
    {
      name: "Updated distributed template", subject: "New subject", bodyHtml: "<p>New</p>", bodyText: "",
      category: "newsletter", status: "archived",
    },
  );
});
