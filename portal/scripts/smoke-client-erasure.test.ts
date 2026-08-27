import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

let storage: typeof import("../src/server/storage");
let tenants: typeof import("../src/server/tenants");
let connections: typeof import("../src/server/portalConnectionStore");
let activity: typeof import("../src/server/activity");
let erasure: typeof import("../src/server/clientErasure");
let pluginInstalls: typeof import("../src/server/pluginInstalls");

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  tenants = await import("../src/server/tenants");
  connections = await import("../src/server/portalConnectionStore");
  activity = await import("../src/server/activity");
  erasure = await import("../src/server/clientErasure");
  pluginInstalls = await import("../src/server/pluginInstalls");
});

// A minimal fake Supabase client for the live-table scrub: chainable + thenable,
// operating on seeded arrays. Never touches live data — the whole point.
function getPath(row: Record<string, unknown>, col: string): unknown {
  if (col.includes("->>")) { const [b, k] = col.split("->>"); return (row[b] as Record<string, unknown> ?? {})[k]; }
  return row[col];
}
function makeFakeSupabase(tables: Record<string, Record<string, unknown>[]>) {
  function builder(table: string) {
    let op: "select" | "delete" | "update" = "select";
    let updateValues: Record<string, unknown> = {};
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    const b: Record<string, unknown> = {
      select(_c: string) { return b; },
      delete() { op = "delete"; return b; },
      update(v: Record<string, unknown>) { op = "update"; updateValues = v; return b; },
      eq(col: string, val: unknown) { filters.push(r => getPath(r, col) === val); return b; },
      in(col: string, vals: unknown[]) { filters.push(r => vals.includes(r[col])); return b; },
      then(resolve: (x: { data: unknown[]; error: null }) => void) {
        const rows = (tables[table] ?? []).filter(r => filters.every(f => f(r)));
        if (op === "delete") {
          const ids = new Set(rows.map(r => r.id));
          tables[table] = (tables[table] ?? []).filter(r => !ids.has(r.id));
        } else if (op === "update") {
          for (const r of rows) Object.assign(r, updateValues);
        }
        resolve({ data: rows.map(r => (op === "select" ? r : { id: r.id })), error: null });
      },
    };
    return b;
  }
  return { from: (t: string) => builder(t) };
}

function makeFailingSupabase(message = "provider unavailable") {
  function builder() {
    const b = {
      select() { return b; },
      delete() { return b; },
      update() { return b; },
      eq() { return b; },
      in() { return b; },
      then(resolve: (value: { data: null; error: { message: string } }) => void) {
        resolve({ data: null, error: { message } });
      },
    };
    return b;
  }
  return { from: () => builder() };
}

describe("permanently erasing a client", () => {
  let agencyId: string;
  let clientId: string;

  beforeEach(() => {
    const agency = tenants.createAgency({ name: "Erasure Co", slug: `erase-${Math.floor(performance.now())}` });
    agencyId = agency.id;
    const client = tenants.createClient(agencyId, { name: "Doomed Client" });
    clientId = client.id;
    // Scatter some client-stamped data across different collections.
    connections.openPortalConnection({ agencyId, clientId, label: "Their app", createdBy: "ed" });
    activity.logActivity({ agencyId, clientId, category: "tenant", action: "test.event", message: "something happened" });
  });

  it("removes the client and everything stamped with its id", async () => {
    const before = await erasure.previewClientErasure(agencyId, clientId);
    assert.ok(before && before >= 3, "preview should count the client + its records");

    const result = await erasure.eraseClientCompletely({ agencyId, clientId, actorUserId: "ed" });
    assert.ok(result);
    assert.equal(result!.completed, true);
    assert.equal(result!.clientName, "Doomed Client");
    assert.ok(result!.recordsErased >= 3);

    // The client is gone, and so is its scattered data.
    assert.equal(tenants.getClientForAgency(agencyId, clientId), null);
    assert.equal(connections.listPortalConnections(agencyId, clientId).length, 0);
  });

  it("keeps one audit entry recording the erasure — the proof it happened", async () => {
    // GDPR-style: the personal data goes, but that a lawful erasure occurred
    // must be provable. The audit entry names only a random client id.
    await erasure.eraseClientCompletely({ agencyId, clientId, actorUserId: "ed", actorEmail: "ed@x.com" });
    const entries = storage.getState().activity.filter(e => e.action === "client.erased" && e.clientId === undefined ? false : true);
    const erased = storage.getState().activity.find(e => e.action === "client.erased");
    assert.ok(erased, "no audit entry recorded the erasure");
    assert.match(erased!.message, /cannot be undone/i);
    assert.doesNotMatch(erased!.message, /Doomed Client/);
    // And the client's OWN prior activity is gone.
    assert.equal(storage.getState().activity.some(e => e.clientId === clientId && e.action === "test.event"), false);
    void entries;
  });

  it("refuses to erase a client that is not the caller's", async () => {
    const other = tenants.createAgency({ name: "Someone Else", slug: `other-${Math.floor(performance.now())}` });
    assert.equal(await erasure.eraseClientCompletely({ agencyId: other.id, clientId, actorUserId: "them" }), null);
    assert.ok(tenants.getClientForAgency(agencyId, clientId), "the client must be untouched by a foreign erase");
  });

  it("reports live failures as retryable and keeps the local client until retry succeeds", async () => {
    const failed = await erasure.eraseClientCompletely({
      agencyId,
      clientId,
      actorUserId: "ed",
      supabase: makeFailingSupabase() as never,
    });
    assert.ok(failed);
    assert.equal(failed!.completed, false);
    assert.ok(failed!.live?.errors?.length);
    assert.ok(tenants.getClientForAgency(agencyId, clientId), "a failed live scrub removed the retry target");
    assert.equal(connections.listPortalConnections(agencyId, clientId).length, 1, "local data changed before live completion");

    const failureAudit = storage.getState().activity.find(entry => entry.action === "client.erasure_failed");
    assert.ok(failureAudit, "retryable per-system outcomes were not persisted");
    assert.doesNotMatch(failureAudit!.message, /Doomed Client/);
    assert.ok(Array.isArray((failureAudit!.metadata as { failedSystems?: unknown[] }).failedSystems));

    const retried = await erasure.eraseClientCompletely({
      agencyId,
      clientId,
      actorUserId: "ed",
      supabase: makeFakeSupabase({}) as never,
    });
    assert.equal(retried?.completed, true);
    assert.equal(tenants.getClientForAgency(agencyId, clientId), null);
  });

  it("gates the route on the owner and a typed-back name", () => {
    const route = (require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "src", "app", "api", "portal", "clients", "[clientId]", "erase", "route.ts"), "utf-8") as string);
    assert.match(route, /requireRole\("agency-owner"\)/);
    assert.match(route, /confirmName !== client\.name/);
    assert.match(route, /if \(!result\.completed\)/);
    assert.match(route, /retryable: true/);
    assert.match(route, /status: 502/);
  });
});

describe("manually deleting a website enquiry", () => {
  const read = (...p: string[]) => (require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", ...p), "utf-8") as string);
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  const route = () => strip(read("src", "app", "api", "portal", "website-enquiries", "erase", "route.ts"));
  const inbox = () => read("src", "app", "portal", "agency", "inbox", "_MasterInbox.tsx");
  const page = () => read("src", "app", "portal", "agency", "inbox", "page.tsx");

  it("is owner-only and actually deletes the row", () => {
    const src = route();
    assert.match(src, /requireRole\("agency-owner"\)/);
    assert.match(src, /from\("brand_enquiries"\)\s*\.delete\(\)/s);
  });

  it("keeps an audit record that the deletion happened", () => {
    assert.match(route(), /action: "website_enquiry\.erased"/);
  });

  it("shows the delete button only to an owner", () => {
    // The inbox renders it behind canErase, and the page only sets that for an
    // agency-owner — so ordinary staff never see it.
    assert.match(inbox(), /canErase \? <EnquiryDeleteButton/);
    assert.match(page(), /canErase=\{!session\.publicShowcase && session\.role === "agency-owner"\}/);
  });

  it("asks twice before deleting, in place, without a modal", () => {
    const src = inbox();
    assert.match(src, /Delete for good\?/);
    assert.match(src, /setConfirming\(true\)/);
  });
});

describe("erasure disposition policy (GDPR Art. 17(3)(e)) + live scrub", () => {
  function inst(agencyId: string, pluginId: string, clientId?: string) {
    const id = pluginInstalls.makeInstallId(clientId ? { agencyId, clientId } : { agencyId }, pluginId);
    return { id, pluginId, agencyId, clientId, enabled: true, config: {}, features: {}, installedAt: 1 };
  }

  it("deletes comms/marketing, RETAINS finance/deliverables, and scrubs live tables per disposition", async () => {
    const agency = tenants.createAgency({ name: "Disp", slug: `disp-${Math.floor(performance.now())}` });
    const A = agency.id;
    const client = tenants.createClient(A, { name: "Doomed" });
    const C = client.id;

    const fin = inst(A, "agency-finance");        // agency-scoped, RETAIN
    const ecom = inst(A, "ecommerce", C);         // client-scoped, HOOK (strip PII, keep order)
    const crm = inst(A, "client-crm", C);         // client-scoped, DELETE
    const leads = inst(A, "leads-pipeline");      // agency-scoped, HOOK (key-PII)

    storage.mutate(state => {
      for (const i of [fin, ecom, crm, leads]) state.pluginInstalls[i.id] = i as never;
      state.pluginData[fin.id] = { "invoice:1": { id: "1", clientId: C, amount: 500, status: "paid" } };
      state.pluginData[ecom.id] = { "order:1": { id: "1", clientId: C, amountTotal: 99, customerEmail: "shop@x.com", paymentIntentId: "pi_1" } };
      state.pluginData[crm.id] = { "contact:1": { id: "1", clientId: C, email: "crm@x.com" } };
      state.pluginData[leads.id] = {
        "contacts/index": ["l1"],
        "contact:l1": { id: "l1", agencyId: A, clientId: C, email: "lead@x.com", type: "customer", tags: [], createdAt: 1 },
        "contacts/email/lead@x.com": "l1",
      };
      state.clientMilestones["ms1"] = { id: "ms1", agencyId: A, clientId: C, title: "Launch", status: "done" } as never;
      state.endCustomers["ec1"] = { id: "ec1", clientId: C, email: "shop@x.com", name: "Shopper" } as never;
    });

    const tables: Record<string, Record<string, unknown>[]> = {
      inbox_conversations: [{ id: "cv1", agency_id: A, client_id: C, created_at: "2026-01-01", last_message_at: "2026-02-01" }],
      inbox_messages: [{ id: "m1", conversation_id: "cv1", body_text: "secret" }],
      inbox_contact_identities: [{ id: "id1", agency_id: A, client_id: C, handle: "doomed@x.com" }],
      brand_enquiries: [
        { id: "e1", name: "Jane", email: "jane@x.com", message: "hi",
          metadata: { clientId: C, identityResolution: { status: "resolved", clientId: C } } },
        { id: "e2", name: "Bob", email: "bob@x.com",
          metadata: { clientId: C, identityResolution: { status: "ambiguous", clientId: C } } },
      ],
    };

    const result = await erasure.eraseClientCompletely({
      agencyId: A, clientId: C, actorUserId: "ed", supabase: makeFakeSupabase(tables) as never,
    });
    assert.ok(result, "erase returned a result");
    const col = result!.collections;
    const s = storage.getState();

    // RETAIN — finance + deliverable proof survive (legal hold).
    assert.ok((s.pluginData[fin.id] as never)?.["invoice:1"], "finance invoice retained");
    assert.equal(col["retained:agency-finance"], 1, "audit records finance retained");
    assert.ok(s.clientMilestones["ms1"], "deliverable milestone retained");
    assert.equal(col["retained:clientMilestones"], 1);

    // HOOK — ecommerce order retained but customer PII stripped, payment ref kept.
    const order = (s.pluginData[ecom.id] as never)?.["order:1"] as Record<string, unknown>;
    assert.ok(order, "order retained");
    assert.equal(order.customerEmail, undefined, "order PII stripped");
    assert.equal(order.paymentIntentId, "pi_1", "payment ref kept");

    // HOOK — leads-pipeline email-in-key erased.
    assert.equal((s.pluginData[leads.id] as never)?.["contacts/email/lead@x.com"], undefined, "leads email key erased");
    // PII — and the erased email must NOT survive in the activity log. The
    // hook runs ContactService.delete, which logs an archive entry; the sweep
    // matches only on clientId (this leads entry carries none), so a raw email
    // in that message would persist after erasure. Assert it's gone everywhere.
    assert.ok(!s.activity.some(e => JSON.stringify(e).includes("lead@x.com")),
      "erased contact email must not survive in the activity log");

    // DELETE — client-crm slice + install removed; endCustomer identity swept.
    assert.equal(s.pluginData[crm.id], undefined, "crm slice dropped");
    assert.equal(s.endCustomers["ec1"], undefined, "endCustomer identity deleted");
    assert.equal(tenants.getClientForAgency(A, C), null, "client record gone");

    // LIVE — inbox deleted (via conversation id for messages) + no-PII stub.
    assert.equal(tables.inbox_conversations.length, 0, "conversations deleted");
    assert.equal(tables.inbox_messages.length, 0, "messages deleted");
    assert.equal(tables.inbox_contact_identities.length, 0, "identities deleted");
    assert.equal(result!.live!.inboxConversations, 1);
    assert.equal(result!.live!.inboxMessages, 1);
    assert.equal(result!.live!.inboxConversationsFrom, "2026-01-01");
    assert.ok(!JSON.stringify(result!.live).includes("secret"), "stub carries NO message content");

    // LIVE — brand_enquiries anonymised, split by resolution.
    const e1 = tables.brand_enquiries.find(r => r.id === "e1")!;
    const e2 = tables.brand_enquiries.find(r => r.id === "e2")!;
    assert.equal(e1.name, null, "e1 (resolved AS client) PII stripped");
    assert.equal((e1.metadata as Record<string, unknown>).clientId, undefined, "e1 link dropped");
    assert.equal(e2.name, "Bob", "e2 (separate party) PII kept");
    assert.equal((e2.metadata as Record<string, unknown>).clientId, undefined, "e2 link dropped");
    assert.equal(result!.live!.enquiriesAnonymised, 2);
    assert.equal(result!.live!.enquiriesPiiStripped, 1);

    // AUDIT — one entry, disposition per area + no-PII live stub, no personal data.
    const erased = s.activity.find(e => e.action === "client.erased" && (e.metadata as { clientId?: string })?.clientId === C);
    assert.ok(erased, "audit entry recorded");
    assert.ok((erased!.metadata as { live?: unknown }).live, "audit carries the live stub");
  });

  it("erases only in-memory when no Supabase client is passed (safe for tests)", async () => {
    const agency = tenants.createAgency({ name: "NoLive", slug: `nl-${Math.floor(performance.now())}` });
    const client = tenants.createClient(agency.id, { name: "X" });
    const result = await erasure.eraseClientCompletely({ agencyId: agency.id, clientId: client.id, actorUserId: "ed" });
    assert.ok(result);
    assert.equal(result!.live, undefined, "no live scrub without a client");
  });

  it("wires the live admin client into the erase route (same boundary as enquiry hard-delete)", () => {
    const src = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "src", "app", "api", "portal", "clients", "[clientId]", "erase", "route.ts"), "utf-8") as string;
    assert.match(src, /createSupabaseAdminClient/);
    assert.match(src, /supabase: createSupabaseAdminClient\(\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The right-to-be-forgotten test that drives the REAL lifecycle.
//
// The earlier version of this file seeded a leads contact with a raw
// `state.pluginData` write carrying a `clientId` — a shape production can never
// produce (`ContactService` never writes `clientId`, and `CreateContactInput`
// has no such field). It therefore proved nothing: the erase hook matched the
// impossible seed, the real create-path activity entries were never written, and
// a converted client's email survived erasure behind a green suite. Twice.
//
// So everything below goes through the same service calls the API handlers use
// — `LeadService.upsert` → `recordConversion` → `ContactService.promoteLead` →
// `update` — and then asserts on the WHOLE state, not on a chosen key.
// ─────────────────────────────────────────────────────────────────────────────
describe("erasing a client created through the real lead → convert → promote flow", () => {
  type LeadsPlugin = typeof import("@aqua/plugin-leads-pipeline/server");
  let plugin: LeadsPlugin;
  let foundationPorts: typeof import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
  let leadsPorts: typeof import("../src/lib/server/leadsPipelinePorts");
  let pluginStorage: typeof import("../src/lib/server/pluginStorage");

  before(async () => {
    plugin = await import("@aqua/plugin-leads-pipeline/server");
    foundationPorts = await import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
    leadsPorts = await import("../src/lib/server/leadsPipelinePorts");
    pluginStorage = await import("../src/lib/server/pluginStorage");
  });

  // The production container, wired to the REAL foundation ports (the same
  // objects `leadsPipelineFoundation.ts` registers at boot) — so activity goes
  // to the real log and storage to the real `pluginData` slice. Passed
  // explicitly rather than registered globally: test files share one process.
  function realContainer(agencyId: string, installId: string) {
    return plugin.containerWithDeps({
      agencyId: agencyId as never,
      storage: pluginStorage.makePluginStorage(installId) as never,
      foundation: {
        tenant: foundationPorts.tenantPort,
        activity: foundationPorts.activityPort,
        events: foundationPorts.eventBusPort,
        pluginInstalls: foundationPorts.pluginInstallStorePort,
        pipeline: leadsPorts.pipelinePort,
      } as never,
    });
  }

  function freshAgency(tag: string) {
    const agency = tenants.createAgency({ name: `Erase ${tag}`, slug: `erase-${tag}-${Math.floor(performance.now())}-${process.hrtime.bigint()}` });
    const install = pluginInstalls.upsertInstall({
      scope: { agencyId: agency.id }, pluginId: "leads-pipeline", installedBy: "ed",
    } as never);
    return { agencyId: agency.id, installId: install.id, c: realContainer(agency.id, install.id) };
  }

  /** Every string value AND storage-key name in state that contains `needle`. */
  function tracesOf(needle: string): string[] {
    const found: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (typeof node === "string") {
        if (node.includes(needle)) found.push(`${path} = ${node.slice(0, 80)}`);
        return;
      }
      if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
      if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          if (key.includes(needle)) found.push(`${path} <storage key> "${key}"`);
          walk(value, `${path}.${key}`);
        }
      }
    };
    walk(storage.getState(), "state");
    return found;
  }

  it("leaves NO trace of the subject's email or phone anywhere in state", async () => {
    const EMAIL = `forget-me-${process.hrtime.bigint()}@example.com`;
    const PHONE = "+447700900321";
    const { agencyId, installId, c } = freshAgency("real");
    const client = tenants.createClient(agencyId, { name: "Converted Client" });

    // ── the real lifecycle ──
    const { lead } = await c.leads.upsert(
      { email: EMAIL, name: "Forget Me", phone: PHONE, company: "Forget Ltd", source: "manual", tags: [] } as never,
      "ed" as never,
    );
    const converted = await c.leads.recordConversion(lead.id, client.id, "ed" as never);
    assert.equal(converted?.convertedClientId, client.id, "conversion must stamp the client link the hook resolves through");
    const contact = await c.contacts.promoteLead(converted as never, "ed" as never);
    await c.contacts.update(contact.id, { notes: "spoke on the phone" } as never, "ed" as never);

    // Nothing writes `Contact.clientId` — the exact reason the old hook's
    // `contact.clientId === clientId` filter never matched a real contact.
    assert.equal((contact as { clientId?: string }).clientId, undefined);

    // ── PII must never reach the activity log in the first place ──
    // (The four leads/contact log sites used to embed the raw email; the
    // clientId-only sweep can't reach them, so they survived erasure forever.)
    assert.deepEqual(
      storage.getState().activity.filter(e => JSON.stringify(e).includes(EMAIL)).map(e => e.message),
      [], "the create/convert/promote/update log entries must name ids, not the email",
    );
    // …and the flow really did write entries (so the assertion above is not
    // passing because nothing happened).
    assert.ok(
      storage.getState().activity.some(e => e.action === "leads.contact.promoted"),
      "the real promote path must have logged",
    );

    // ── erase ──
    const result = await erasure.eraseClientCompletely({ agencyId, clientId: client.id, actorUserId: "ed" });
    assert.ok(result, "erase returned a result");

    // ── the whole point: zero trace, anywhere ──
    assert.deepEqual(tracesOf(EMAIL), [], "the erased client's email survived somewhere in state");
    assert.deepEqual(tracesOf(PHONE), [], "the erased client's phone survived somewhere in state");

    // …and specifically, the surfaces that were leaking:
    const slice = (storage.getState().pluginData[installId] ?? {}) as Record<string, unknown>;
    assert.equal(slice[`contact:${contact.id}`], undefined, "contact row still present");
    assert.equal(slice[`contacts/email/${EMAIL}`], undefined, "email-pointer key still present");
    assert.equal(slice[`leads/email/${EMAIL}`], undefined, "lead email-pointer key still present");
    assert.equal(slice[`leads/phone/${PHONE}`], undefined, "lead phone-pointer key still present");
    assert.ok(!storage.getState().activity.some(e => JSON.stringify(e).includes(EMAIL)), "email in the activity log");
    assert.equal(await c.contacts.getByEmail(EMAIL), null, "contact still resolvable by email");
    assert.equal(tenants.getClientForAgency(agencyId, client.id), null, "client record still present");
  });

  it("keeps the lead as a de-identified funnel record (ANONYMISE, not delete)", async () => {
    // Disposition policy: relationship/lifecycle facts are anonymised, not
    // destroyed — drop who they were, keep what they did.
    const EMAIL = `funnel-${process.hrtime.bigint()}@example.com`;
    const { agencyId, c } = freshAgency("funnel");
    const client = tenants.createClient(agencyId, { name: "Funnel Client" });
    const { lead } = await c.leads.upsert(
      { email: EMAIL, name: "Funnel Person", phone: "+447700900322", company: "Funnel Ltd", source: "csv:jan.csv", tags: ["warm"] } as never,
      "ed" as never,
    );
    const converted = await c.leads.recordConversion(lead.id, client.id, "ed" as never);
    await c.contacts.promoteLead(converted as never, "ed" as never);

    await erasure.eraseClientCompletely({ agencyId, clientId: client.id, actorUserId: "ed" });

    const kept = await c.leads.get(lead.id);
    assert.ok(kept, "the funnel record must survive erasure");
    assert.equal(kept!.email, "", "identity removed");
    assert.equal(kept!.name, undefined);
    assert.equal(kept!.phone, undefined);
    assert.equal(kept!.company, undefined);
    assert.equal(kept!.source, "csv:jan.csv", "the de-identified funnel fact is kept");
    assert.equal(kept!.currentStageId, "won", "so is the lifecycle outcome");
    assert.ok((kept!.journeyEvents ?? []).length > 0, "and the journey");
  });

  it("erases a client converted straight from a CONTACT, which writes no back-link", async () => {
    // `convertContactToClientHandler` creates the client from a contact and
    // records no link on either side — only `client.ownerEmail` ties them. The
    // hook reaches it through the same matcher the conversion handler uses.
    const EMAIL = `contact-only-${process.hrtime.bigint()}@example.com`;
    const { agencyId, installId, c } = freshAgency("contactonly");
    const { contact } = await c.contacts.upsert(
      { email: EMAIL, name: "Contact Only", type: "customer", source: "manual", tags: [] } as never,
      "ed" as never,
    );
    const client = tenants.createClient(agencyId, { name: "Contact-only Client", ownerEmail: EMAIL } as never);

    await erasure.eraseClientCompletely({ agencyId, clientId: client.id, actorUserId: "ed" });

    assert.deepEqual(tracesOf(EMAIL), [], "a contact-converted client's email survived erasure");
    const slice = (storage.getState().pluginData[installId] ?? {}) as Record<string, unknown>;
    assert.equal(slice[`contact:${contact.id}`], undefined, "contact row still present");
  });

  it("is idempotent — erasing again is a no-op, not a throw", async () => {
    const EMAIL = `twice-${process.hrtime.bigint()}@example.com`;
    const { agencyId, c } = freshAgency("twice");
    const client = tenants.createClient(agencyId, { name: "Twice Client" });
    const { lead } = await c.leads.upsert(
      { email: EMAIL, source: "manual", tags: [], type: "lead" } as never, "ed" as never,
    );
    const converted = await c.leads.recordConversion(lead.id, client.id, "ed" as never);
    await c.contacts.promoteLead(converted as never, "ed" as never);

    await erasure.eraseClientCompletely({ agencyId, clientId: client.id, actorUserId: "ed" });
    // The client record is gone, so a re-erase returns null — but the hook is
    // still safe to re-run directly (a partial failure must be retryable).
    const runtime = await import("../src/built-ins/runtime/_registry");
    const manifest = runtime.getPlugin("leads-pipeline");
    assert.ok(manifest?.onEraseClient, "the hook must exist");
    await erasure.eraseClientCompletely({ agencyId, clientId: client.id, actorUserId: "ed" });
    assert.deepEqual(tracesOf(EMAIL), [], "a second erase must leave nothing behind either");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The second instance of the same bug, found by probing the first.
//
// A campaign email goes to a LEAD, so `EmailMessage.clientId` is unset — the
// generic clientId value-scan finds nothing. When that lead later converts into
// a client, erasing the client used to leave their address in the message row,
// in `idempotencyKey`/`externalRef`, in the `email/idem/<key>` STORAGE KEY NAME,
// and in the "Queued email → <address>" activity message.
// ─────────────────────────────────────────────────────────────────────────────
describe("erasing a client also erases the emails sent to them", () => {
  let leads: typeof import("@aqua/plugin-leads-pipeline/server");
  let mail: typeof import("@aqua/plugin-email-sender/server");
  let ports: typeof import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
  let leadsPorts: typeof import("../src/lib/server/leadsPipelinePorts");
  let pluginStorage: typeof import("../src/lib/server/pluginStorage");

  before(async () => {
    leads = await import("@aqua/plugin-leads-pipeline/server");
    mail = await import("@aqua/plugin-email-sender/server");
    ports = await import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
    leadsPorts = await import("../src/lib/server/leadsPipelinePorts");
    pluginStorage = await import("../src/lib/server/pluginStorage");
    // Same ports the boot adapter registers.
    mail.registerEmailSenderFoundation({
      tenant: {
        getAgency: (id: string) => ports.tenantPort.getAgency(id),
        getClientForAgency: (agencyId: string, clientId: string) =>
          ports.tenantPort.getClientForAgency(agencyId, clientId),
      },
      activity: ports.activityPort,
      events: ports.eventBusPort,
      pluginInstalls: ports.pluginInstallStorePort,
    } as never);
  });

  it("removes the message row, the email-bearing idempotency KEY, and the log line", async () => {
    const EMAIL = `mailed-${process.hrtime.bigint()}@example.com`;
    const agency = tenants.createAgency({ name: "Mailed Co", slug: `mailed-${process.hrtime.bigint()}` });
    const A = agency.id;
    const leadsInstall = pluginInstalls.upsertInstall({ scope: { agencyId: A }, pluginId: "leads-pipeline", installedBy: "ed" } as never);
    const mailInstall = pluginInstalls.upsertInstall({ scope: { agencyId: A }, pluginId: "email-sender", installedBy: "ed" } as never);

    const c = leads.containerWithDeps({
      agencyId: A as never,
      storage: pluginStorage.makePluginStorage(leadsInstall.id) as never,
      foundation: {
        tenant: ports.tenantPort, activity: ports.activityPort, events: ports.eventBusPort,
        pluginInstalls: ports.pluginInstallStorePort, pipeline: leadsPorts.pipelinePort,
        emailEnqueue: leadsPorts.emailEnqueuePort,
      } as never,
    });
    const mailC = mail.containerFor({ agencyId: A as never, storage: pluginStorage.makePluginStorage(mailInstall.id) as never } as never);
    const ident = await mailC.identities.create({ name: "Agency", email: "hello@agency.test", isDefault: true } as never, "ed" as never);
    await mailC.identities.verifyDomain(ident.id, "ed" as never);

    // A lead is captured and emailed by a campaign — no clientId anywhere yet.
    const { lead } = await c.leads.upsert({ email: EMAIL, name: "Mailed Person", source: "manual", tags: ["warm"] } as never, "ed" as never);
    await leadsPorts.emailEnqueuePort.enqueue({
      agencyId: A as never,
      to: lead.email,
      subject: "Spring offer",
      bodyHtml: "<p>hi</p>",
      triggeredByPlugin: "leads-pipeline" as never,
      externalRef: `campaign:cmp_1:${lead.id}`,
    } as never);
    assert.equal((await mailC.emails.list()).length, 1, "the campaign email must be queued");

    // …and only THEN becomes a client, exactly as `convertLeadToClientHandler` does.
    const client = tenants.createClient(A, { name: "Mailed Client", ownerEmail: EMAIL } as never);
    const converted = await c.leads.recordConversion(lead.id, client.id, "ed" as never);
    await c.contacts.promoteLead(converted as never, "ed" as never);

    await erasure.eraseClientCompletely({ agencyId: A, clientId: client.id, actorUserId: "ed" });

    const slice = (storage.getState().pluginData[mailInstall.id] ?? {}) as Record<string, unknown>;
    assert.deepEqual(
      Object.keys(slice).filter(key => key.includes(EMAIL)), [],
      "an address must not survive in a storage KEY name",
    );
    assert.equal((await mailC.emails.list()).length, 0, "the message addressed to the erased client survived");
    assert.ok(!JSON.stringify(storage.getState()).includes(EMAIL), "the erased client's address survived somewhere in state");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The rest of the class.
//
// Sweeping every plugin for the shape that caused the first two bugs —
// AGENCY-SCOPED + holds a person's PII + no `clientId` on the record — turned up
// two more: `public-funnel` (a Health-Check/tool capture) and `agency-marketing`
// (its own lead store). Both keep the address in a STORAGE KEY NAME as well
// (`captures/by-email/<email>`, `leads/by-email/<email>`), which no value-based
// sweep can ever reach. Both are captured long BEFORE the person is a client,
// so the address is the only link back to them — which is what `ErasureSubject`
// exists to provide.
// ─────────────────────────────────────────────────────────────────────────────
describe("erasing a client reaches the plugins that captured them before they were one", () => {
  let funnel: typeof import("@aqua/plugin-public-funnel/server");
  let marketing: typeof import("@aqua/plugin-agency-marketing/server");
  let ports: typeof import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
  let pluginStorage: typeof import("../src/lib/server/pluginStorage");

  before(async () => {
    funnel = await import("@aqua/plugin-public-funnel/server");
    marketing = await import("@aqua/plugin-agency-marketing/server");
    ports = await import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
    pluginStorage = await import("../src/lib/server/pluginStorage");

    funnel.registerFunnelFoundation({
      activity: ports.activityPort,
      events: ports.eventBusPort,
      // The only foundation dep the capture path needs; the logic under test is
      // the capture storage, not user creation.
      leadUsers: {
        // A real lead user gets a generated id — never one built from the
        // address (that would smuggle the PII into every `actorUserId`).
        upsertLeadByEmail: (email: string) => ({
          user: { id: `usr_${process.hrtime.bigint()}`, email, agencyId: "a", clientId: "c" }, created: true,
        }),
      },
    } as never);
    marketing.registerAgencyMarketingFoundation({
      tenant: ports.tenantPort, user: ports.userPort,
      activity: ports.activityPort, events: ports.eventBusPort,
      pluginInstalls: ports.pluginInstallStorePort,
    } as never);
  });

  it("public-funnel: the capture, its email-named KEY, and the log line all go", async () => {
    const EMAIL = `funnelled-${process.hrtime.bigint()}@example.com`;
    const agency = tenants.createAgency({ name: "Funnelled Co", slug: `fnl-${process.hrtime.bigint()}` });
    const install = pluginInstalls.upsertInstall({ scope: { agencyId: agency.id }, pluginId: "public-funnel", installedBy: "ed" } as never);
    const c = funnel.containerFor({ agencyId: agency.id as never, storage: pluginStorage.makePluginStorage(install.id) as never } as never);

    // Captured from a public form — no client exists yet, so no clientId anywhere.
    await c.funnel.captureHcCompletion({ email: EMAIL, slot: { answers: {} } } as never);
    assert.equal((await c.funnel.listByEmail(EMAIL)).length, 1, "the capture must exist");

    // …only later do they become a client.
    const client = tenants.createClient(agency.id, { name: "Funnelled Client", ownerEmail: EMAIL } as never);
    await erasure.eraseClientCompletely({ agencyId: agency.id, clientId: client.id, actorUserId: "ed" });

    const slice = (storage.getState().pluginData[install.id] ?? {}) as Record<string, unknown>;
    assert.deepEqual(Object.keys(slice).filter(k => k.includes(EMAIL)), [], "address survived in a storage KEY name");
    assert.equal((await c.funnel.listByEmail(EMAIL)).length, 0, "the capture survived");
    assert.ok(!JSON.stringify(storage.getState()).includes(EMAIL), "the address survived somewhere in state");
  });

  it("agency-marketing: the lead, its email-named KEY, and the log line all go", async () => {
    const EMAIL = `marketed-${process.hrtime.bigint()}@example.com`;
    const agency = tenants.createAgency({ name: "Marketed Co", slug: `mkt-${process.hrtime.bigint()}` });
    const install = pluginInstalls.upsertInstall({ scope: { agencyId: agency.id }, pluginId: "agency-marketing", installedBy: "ed" } as never);
    const c = marketing.containerFor({ agencyId: agency.id as never, storage: pluginStorage.makePluginStorage(install.id) as never } as never);

    await c.leads.create({ email: EMAIL, name: "Marketed Person" } as never, "ed" as never);
    assert.ok(await c.leads.getByEmail(EMAIL), "the marketing lead must exist");

    const client = tenants.createClient(agency.id, { name: "Marketed Client", ownerEmail: EMAIL } as never);
    await erasure.eraseClientCompletely({ agencyId: agency.id, clientId: client.id, actorUserId: "ed" });

    const slice = (storage.getState().pluginData[install.id] ?? {}) as Record<string, unknown>;
    assert.deepEqual(Object.keys(slice).filter(k => k.includes(EMAIL)), [], "address survived in a storage KEY name");
    assert.equal(await c.leads.getByEmail(EMAIL), null, "the marketing lead survived");
    assert.ok(!JSON.stringify(storage.getState()).includes(EMAIL), "the address survived somewhere in state");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Person records — ANONYMISE IF ORPHANED (Ed's decision, 2026-08-19).
//
// A `Person` has no `clientId`, so the sweep could never reach it: the email and
// phone of a client whose relationship began as a website enquiry survived
// erasure untouched. But deleting the person is equally wrong — `clientIds` is
// an ARRAY, and a supplier/partnership/marketer stands on its own basis.
//
// So both directions are asserted here. A one-sided test is exactly what let the
// original hook bug through, and either half of this rule failing is a real
// fault: leaving PII behind, or wiping a supplier's details as collateral.
// ─────────────────────────────────────────────────────────────────────────────
describe("erasing a client anonymises their Person only when it orphans them", () => {
  let persons: typeof import("../src/server/persons");

  before(async () => {
    persons = await import("../src/server/persons");
  });

  it("strips the identifiers when the erased client was their only basis", async () => {
    const EMAIL = `enquirer-${process.hrtime.bigint()}@example.com`;
    const PHONE = "+447700900771";
    const agency = tenants.createAgency({ name: "Person Co", slug: `psn-${process.hrtime.bigint()}` });
    const client = tenants.createClient(agency.id, { name: "Enquirer Client", ownerEmail: EMAIL } as never);

    // The real intake path: an enquiry resolves to a canonical Person.
    const { person } = persons.upsertPerson(agency.id, {
      emails: [EMAIL], phones: [PHONE], name: "Jane Enquirer",
      company: "Enquirer Ltd", jobTitle: "Owner",
      source: "website:aquaoasis",
      facets: { enquiryIds: ["enq_1"], clientIds: [client.id] },
    });
    assert.equal(persons.primaryEmail(person), EMAIL.toLowerCase(), "seeded through the real path");

    await erasure.eraseClientCompletely({ agencyId: agency.id, clientId: client.id, actorUserId: "ed" });

    const after = persons.getPerson(agency.id, person.id);
    assert.ok(after, "the person record itself must survive — only the identity goes");
    assert.deepEqual(after!.emails, [], "email survived erasure");
    assert.deepEqual(after!.phones, [], "phone survived erasure");
    assert.equal(after!.name, undefined);
    assert.equal(after!.company, undefined);
    assert.equal(after!.jobTitle, undefined);
    assert.deepEqual(after!.facets.clientIds, [], "the client link must be gone");
    // …but what they DID survives, de-identified.
    assert.equal(after!.classification, person.classification, "classification kept");
    assert.ok(Array.isArray(after!.classificationHistory), "history kept");
    assert.deepEqual(after!.facets.enquiryIds, ["enq_1"], "the enquiry facet is a fact, not an identifier");

    assert.ok(!JSON.stringify(storage.getState()).includes(EMAIL), "the email survived somewhere in state");
    assert.ok(!JSON.stringify(storage.getState()).includes(PHONE), "the phone survived somewhere in state");
  });

  it("leaves the details alone when they still hold another client workspace", async () => {
    const EMAIL = `two-hats-${process.hrtime.bigint()}@example.com`;
    const agency = tenants.createAgency({ name: "Two Hats Co", slug: `two-${process.hrtime.bigint()}` });
    const erased = tenants.createClient(agency.id, { name: "First Workspace", ownerEmail: EMAIL } as never);
    const kept = tenants.createClient(agency.id, { name: "Second Workspace" });

    const { person } = persons.upsertPerson(agency.id, {
      emails: [EMAIL], name: "Multi Buyer",
      facets: { clientIds: [erased.id, kept.id] },
    });

    await erasure.eraseClientCompletely({ agencyId: agency.id, clientId: erased.id, actorUserId: "ed" });

    const after = persons.getPerson(agency.id, person.id)!;
    assert.equal(persons.primaryEmail(after), EMAIL.toLowerCase(), "a person with another workspace keeps their details");
    assert.equal(after.name, "Multi Buyer");
    assert.deepEqual(after.facets.clientIds, [kept.id], "only the erased link is dropped");
  });

  it("leaves a supplier alone — their basis has nothing to do with the client", async () => {
    const EMAIL = `supplier-${process.hrtime.bigint()}@example.com`;
    const agency = tenants.createAgency({ name: "Supplier Co", slug: `sup-${process.hrtime.bigint()}` });
    const client = tenants.createClient(agency.id, { name: "A Client", ownerEmail: EMAIL } as never);

    const { person } = persons.upsertPerson(agency.id, {
      emails: [EMAIL], name: "Sam Supplier", company: "Print Shop",
      classification: "supplier",
      facets: { clientIds: [client.id] },
    });

    await erasure.eraseClientCompletely({ agencyId: agency.id, clientId: client.id, actorUserId: "ed" });

    const after = persons.getPerson(agency.id, person.id)!;
    assert.equal(persons.primaryEmail(after), EMAIL.toLowerCase(), "a supplier's details must NOT be collateral damage");
    assert.equal(after.name, "Sam Supplier");
    assert.equal(after.company, "Print Shop");
    assert.deepEqual(after.facets.clientIds, [], "but the link to the erased client is gone");
  });

  it("clears the free text on their meetings and calls, keeping that they happened", async () => {
    const EMAIL = `recorded-${process.hrtime.bigint()}@example.com`;
    const agency = tenants.createAgency({ name: "Recorded Co", slug: `rec-${process.hrtime.bigint()}` });
    const client = tenants.createClient(agency.id, { name: "Recorded Client", ownerEmail: EMAIL } as never);
    const { person } = persons.upsertPerson(agency.id, {
      emails: [EMAIL], name: "Rec Person", facets: { clientIds: [client.id] },
    });
    persons.addPersonRecord(agency.id, person.id, {
      kind: "meeting", at: Date.now(),
      summary: `Coffee with Rec Person (${EMAIL})`, body: "They mentioned their budget.",
    } as never);

    await erasure.eraseClientCompletely({ agencyId: agency.id, clientId: client.id, actorUserId: "ed" });

    const after = persons.getPerson(agency.id, person.id)!;
    assert.equal(after.record?.length, 1, "that the meeting happened is a fact worth keeping");
    assert.equal(after.record![0].kind, "meeting");
    assert.equal(after.record![0].summary, "", "the free text must go");
    assert.equal(after.record![0].body, undefined);
    assert.ok(!JSON.stringify(storage.getState()).includes(EMAIL), "the email survived in a record entry");
  });

  it("records the disposition in the audit as counts, never as a person", async () => {
    const EMAIL = `audited-${process.hrtime.bigint()}@example.com`;
    const agency = tenants.createAgency({ name: "Audited Co", slug: `aud-${process.hrtime.bigint()}` });
    const client = tenants.createClient(agency.id, { name: "Audited Client", ownerEmail: EMAIL } as never);
    persons.upsertPerson(agency.id, { emails: [EMAIL], name: "Aud Person", facets: { clientIds: [client.id] } });

    const result = await erasure.eraseClientCompletely({ agencyId: agency.id, clientId: client.id, actorUserId: "ed" });

    assert.equal(result!.collections["unlinked:persons"], 1);
    assert.equal(result!.collections["anonymised:persons"], 1);
    assert.ok(!JSON.stringify(result!.collections).includes(EMAIL), "the audit must name no person");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CAPSTONE — the plan's "Done when", as one test.
//
// Every pass above was built and proven separately. This erases ONE client who
// has the lot — a lead, a promoted contact, a campaign email, a funnel capture,
// a marketing lead, a canonical Person, a commercial pack, retained finance, and
// live inbox/enquiry rows — and asserts the whole disposition policy held at
// once. Separately-correct passes can still interact badly; nothing else here
// would catch that.
// ─────────────────────────────────────────────────────────────────────────────
describe("CAPSTONE: erasing a client who has everything", () => {
  let leads: typeof import("@aqua/plugin-leads-pipeline/server");
  let mail: typeof import("@aqua/plugin-email-sender/server");
  let funnelPlugin: typeof import("@aqua/plugin-public-funnel/server");
  let marketing: typeof import("@aqua/plugin-agency-marketing/server");
  let ports: typeof import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
  let leadsPorts: typeof import("../src/lib/server/leadsPipelinePorts");
  let pluginStorage: typeof import("../src/lib/server/pluginStorage");
  let persons: typeof import("../src/server/persons");

  before(async () => {
    leads = await import("@aqua/plugin-leads-pipeline/server");
    mail = await import("@aqua/plugin-email-sender/server");
    funnelPlugin = await import("@aqua/plugin-public-funnel/server");
    marketing = await import("@aqua/plugin-agency-marketing/server");
    ports = await import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
    leadsPorts = await import("../src/lib/server/leadsPipelinePorts");
    pluginStorage = await import("../src/lib/server/pluginStorage");
    persons = await import("../src/server/persons");
  });

  it("leaves no identifier anywhere, keeps the de-identified record, and keeps finance", async () => {
    const EMAIL = `everything-${process.hrtime.bigint()}@example.com`;
    const PHONE = "+447700900991";
    const NAME = "Everything Person";
    const agency = tenants.createAgency({ name: "All Co", slug: `all-${process.hrtime.bigint()}` });
    const A = agency.id;
    const store = (id: string) => pluginStorage.makePluginStorage(id) as never;
    const install = (pluginId: string, clientId?: string) => pluginInstalls.upsertInstall(
      { scope: clientId ? { agencyId: A, clientId } : { agencyId: A }, pluginId, installedBy: "ed" } as never);

    const leadsI = install("leads-pipeline");
    const mailI = install("email-sender");
    const funnelI = install("public-funnel");
    const mktI = install("agency-marketing");
    const finI = install("agency-finance");

    const c = leads.containerWithDeps({
      agencyId: A as never, storage: store(leadsI.id),
      foundation: {
        tenant: ports.tenantPort, activity: ports.activityPort, events: ports.eventBusPort,
        pluginInstalls: ports.pluginInstallStorePort, pipeline: leadsPorts.pipelinePort,
        emailEnqueue: leadsPorts.emailEnqueuePort,
      } as never,
    });
    const mailC = mail.containerFor({ agencyId: A as never, storage: store(mailI.id) } as never);
    const funnelC = funnelPlugin.containerFor({ agencyId: A as never, storage: store(funnelI.id) } as never);
    const mktC = marketing.containerFor({ agencyId: A as never, storage: store(mktI.id) } as never);
    const ident = await mailC.identities.create({ name: "Agency", email: "hello@agency.test", isDefault: true } as never, "ed" as never);
    await mailC.identities.verifyDomain(ident.id, "ed" as never);

    // ── BEFORE they are a client: every pre-client surface ──
    await funnelC.funnel.captureHcCompletion({ email: EMAIL, slot: { answers: {} } } as never);
    await mktC.leads.create({ email: EMAIL, name: NAME } as never, "ed" as never);
    const { lead } = await c.leads.upsert(
      { email: EMAIL, name: NAME, phone: PHONE, company: "All Ltd", source: "manual", tags: ["warm"] } as never, "ed" as never);
    await leadsPorts.emailEnqueuePort.enqueue({
      agencyId: A as never, to: EMAIL, subject: "Offer", bodyHtml: "<p>hi</p>",
      triggeredByPlugin: "leads-pipeline" as never, externalRef: `campaign:cmp:${lead.id}`,
    } as never);

    // ── they convert ──
    const client = tenants.createClient(A, { name: "All Client", ownerEmail: EMAIL } as never);
    const converted = await c.leads.recordConversion(lead.id, client.id, "ed" as never);
    const contact = await c.contacts.promoteLead(converted as never, "ed" as never);
    persons.upsertPerson(A, {
      emails: [EMAIL], phones: [PHONE], name: NAME,
      facets: { enquiryIds: ["enq_all"], clientIds: [client.id] },
    });
    await c.commercial.save({
      partyKind: "contact", partyId: contact.id, recipientEmail: EMAIL, recipientName: NAME,
      lineItems: [{ description: "Website", quantity: 1, unitCents: 250_000 }],
      agreementBody: "Terms apply.", agreementTitle: "Service agreement",
      dueAt: Date.now() + 86_400_000, billingCadence: "one-off", currency: "gbp", serviceLevel: "standard",
    } as never, "ed" as never);

    // Guard against a vacuous pass: every surface must really be seeded, or the
    // "no trace afterwards" assertions would pass because nothing was there.
    assert.equal((await funnelC.funnel.listByEmail(EMAIL)).length, 1, "funnel capture seeded");
    assert.ok(await mktC.leads.getByEmail(EMAIL), "marketing lead seeded");
    assert.equal((await mailC.emails.list()).length, 1, "campaign email seeded");
    assert.ok(await c.contacts.getByEmail(EMAIL), "contact seeded");
    assert.ok(await c.commercial.get("contact", contact.id), "commercial pack seeded");
    assert.ok(persons.findPersonByIdentity(A, { emails: [EMAIL] }), "person seeded");
    assert.ok(JSON.stringify(storage.getState()).includes(EMAIL), "the email IS in state before the erase");

    // Retained finance + a live inbox row, to prove the policy's other half.
    storage.mutate(state => {
      state.pluginData[finI.id] = { "invoice:1": { id: "1", clientId: client.id, amountCents: 250_000, status: "paid" } };
    });
    const tables: Record<string, Record<string, unknown>[]> = {
      inbox_conversations: [{ id: "cv", agency_id: A, client_id: client.id, created_at: "2026-01-01", last_message_at: "2026-02-01" }],
      inbox_messages: [{ id: "m", conversation_id: "cv", body_text: `from ${EMAIL}` }],
      inbox_contact_identities: [{ id: "i", agency_id: A, client_id: client.id, handle: EMAIL }],
      brand_enquiries: [{ id: "e", name: NAME, email: EMAIL, message: "hi",
        metadata: { clientId: client.id, identityResolution: { status: "resolved", clientId: client.id } } }],
    };

    // ── ERASE ──
    const result = await erasure.eraseClientCompletely({
      agencyId: A, clientId: client.id, actorUserId: "ed", supabase: makeFakeSupabase(tables) as never,
    });
    assert.ok(result);

    // ── 1. no identifier anywhere in state — value OR storage-key name ──
    const state = JSON.stringify(storage.getState());
    for (const [label, needle] of [["email", EMAIL], ["phone", PHONE], ["name", NAME]] as const) {
      assert.ok(!state.includes(needle), `${label} survived erasure somewhere in state`);
    }

    // ── 2. …and in the live tables ──
    assert.equal(tables.inbox_conversations.length, 0, "inbox conversations deleted");
    assert.equal(tables.inbox_contact_identities.length, 0, "inbox identities deleted");
    assert.equal(tables.brand_enquiries[0].email, null, "enquirer PII stripped");
    assert.equal((tables.brand_enquiries[0].metadata as Record<string, unknown>).clientId, undefined, "enquiry link dropped");

    // ── 3. the de-identified record SURVIVES (not a blanket delete) ──
    const leadsSlice = (storage.getState().pluginData[leadsI.id] ?? {}) as Record<string, unknown>;
    const keptLead = leadsSlice[`lead:${lead.id}`] as Record<string, unknown> | undefined;
    assert.ok(keptLead, "the funnel record must survive, de-identified");
    assert.equal(keptLead!.source, "manual", "what they DID is kept");
    const pack = leadsSlice[`commercial/party/contact/${contact.id}`] as Record<string, unknown> | undefined;
    assert.ok(pack, "the commercial pack is a legal-hold record — it must survive");
    assert.equal(pack!.recipientEmail, "", "…with the recipient identity stripped");
    assert.equal(pack!.totalCents, 250_000, "…and the money intact");

    // ── 4. finance RETAINED, untouched ──
    assert.ok((storage.getState().pluginData[finI.id] as never)?.["invoice:1"], "retained finance must survive");
    assert.equal(result!.collections["retained:agency-finance"], 1);

    // ── 5. the audit proves it happened and names nobody ──
    const audit = storage.getState().activity.find(
      e => e.action === "client.erased" && (e.metadata as { clientId?: string })?.clientId === client.id);
    assert.ok(audit, "the erasure must be provable");
    assert.ok(!JSON.stringify(audit).includes(EMAIL), "the audit must carry no PII");
    for (const key of ["hook:leads-pipeline", "hook:email-sender", "hook:public-funnel", "hook:agency-marketing"]) {
      assert.ok(result!.collections[key], `${key} must have run`);
    }
    assert.equal(result!.collections["anonymised:persons"], 1, "the Person was anonymised");
  });

  it("still erases when the client record carries no ownerEmail — the address comes from the lead", async () => {
    // A hand-made client workspace has no `ownerEmail`, so `ErasureSubject.emails`
    // is empty and the address-matching hooks have nothing to match on. The
    // leads hook must still resolve through `convertedClientId`.
    const EMAIL = `no-owner-${process.hrtime.bigint()}@example.com`;
    const agency = tenants.createAgency({ name: "NoOwner Co", slug: `no-${process.hrtime.bigint()}` });
    const leadsI = pluginInstalls.upsertInstall({ scope: { agencyId: agency.id }, pluginId: "leads-pipeline", installedBy: "ed" } as never);
    const c = leads.containerWithDeps({
      agencyId: agency.id as never, storage: pluginStorage.makePluginStorage(leadsI.id) as never,
      foundation: {
        tenant: ports.tenantPort, activity: ports.activityPort, events: ports.eventBusPort,
        pluginInstalls: ports.pluginInstallStorePort, pipeline: leadsPorts.pipelinePort,
      } as never,
    });
    const client = tenants.createClient(agency.id, { name: "No Owner Client" }); // no ownerEmail
    const { lead } = await c.leads.upsert({ email: EMAIL, source: "manual", tags: [] } as never, "ed" as never);
    const converted = await c.leads.recordConversion(lead.id, client.id, "ed" as never);
    await c.contacts.promoteLead(converted as never, "ed" as never);

    await erasure.eraseClientCompletely({ agencyId: agency.id, clientId: client.id, actorUserId: "ed" });

    assert.ok(!JSON.stringify(storage.getState()).includes(EMAIL),
      "the conversion link must reach them even with no address on the client record");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Identity-resolution reviews — the in-memory sibling of `brand_enquiries`.
//
// Found by classifying EVERY state collection for "holds a person's PII" vs
// "carries a clientId the sweep can match". This one holds the enquirer's
// name/email/phone and links through `selectedClientId` — NOT `clientId` — so
// the sweep never saw it. Same split as brand_enquiries, both directions.
// ─────────────────────────────────────────────────────────────────────────────
describe("erasing a client anonymises the identity-resolution reviews that named them", () => {
  let idr: typeof import("../src/lib/server/identityResolution");

  before(async () => { idr = await import("../src/lib/server/identityResolution"); });

  function seedReview(agencyId: string, sourceId: string, who: { name: string; email: string; phone: string },
                      resolution: Record<string, unknown>) {
    return idr.upsertIdentityResolutionReview(
      { agencyId, sourceType: "website-enquiry", sourceId, sourceLabel: "Website enquiry", ...who } as never,
      { confidence: 0.9, candidates: [], explanation: `Matched on ${who.email}`, resolvedAt: Date.now(), ...resolution } as never,
    );
  }

  it("strips the enquirer's details when the review resolved them AS the erased client", async () => {
    const EMAIL = `review-me-${process.hrtime.bigint()}@example.com`;
    const PHONE = "+447700900663";
    const agency = tenants.createAgency({ name: "Review Co", slug: `rev-${process.hrtime.bigint()}` });
    const client = tenants.createClient(agency.id, { name: "Review Client", ownerEmail: EMAIL } as never);
    const review = seedReview(agency.id, "enq_self", { name: "Review Person", email: EMAIL, phone: PHONE },
      { status: "resolved", clientId: client.id, clientName: "Review Client" });

    const result = await erasure.eraseClientCompletely({ agencyId: agency.id, clientId: client.id, actorUserId: "ed" });

    const after = storage.getState().identityResolutionReviews![review.id];
    assert.ok(after, "the de-identified review shell must survive — it is the record an enquiry happened");
    assert.equal(after.email, undefined, "enquirer email survived");
    assert.equal(after.phone, undefined, "enquirer phone survived");
    assert.equal(after.name, undefined);
    assert.equal(after.selectedClientId, undefined, "the client link must be dropped");
    assert.equal(after.resolution.explanation, "", "the explanation quotes the matched address");
    assert.equal(after.sourceType, "website-enquiry", "the de-identified fact that it happened is kept");
    assert.ok(!JSON.stringify(storage.getState()).includes(EMAIL), "the email survived somewhere in state");
    assert.ok(!JSON.stringify(storage.getState()).includes(PHONE), "the phone survived somewhere in state");
    assert.equal(result!.collections["anonymised:identityResolutionReviews"], 1);
  });

  it("keeps a separate party's details — they were only a candidate, not the client", async () => {
    // Someone else's enquiry that merely matched against this client. Their own
    // record has its own basis; only the link to the erased client goes.
    const OTHER = `someone-else-${process.hrtime.bigint()}@example.com`;
    const agency = tenants.createAgency({ name: "Other Co", slug: `oth-${process.hrtime.bigint()}` });
    const client = tenants.createClient(agency.id, { name: "Other Client" });
    const review = seedReview(agency.id, "enq_other", { name: "Someone Else", email: OTHER, phone: "+447700900664" },
      { status: "ambiguous",
        candidates: [{ clientId: client.id, clientName: "Other Client", confidence: 0.4, reasons: [] }] });

    await erasure.eraseClientCompletely({ agencyId: agency.id, clientId: client.id, actorUserId: "ed" });

    const after = storage.getState().identityResolutionReviews![review.id];
    assert.equal(after.email, OTHER, "a separate party's details must NOT be collateral damage");
    assert.equal(after.name, "Someone Else");
    assert.deepEqual(after.resolution.candidates, [], "but the erased client is no longer named as a candidate");
  });
});
