import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

let storage: typeof import("../src/server/storage");
let tenants: typeof import("../src/server/tenants");
let connections: typeof import("../src/server/portalConnectionStore");
let activity: typeof import("../src/server/activity");
let erasure: typeof import("../src/server/clientErasure");
let pluginInstalls: typeof import("../src/server/pluginInstalls");
let outboundReplay: typeof import("../src/lib/server/telephony/outboundCommunicationReplay");
let serverUsers: typeof import("../src/server/users");

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  tenants = await import("../src/server/tenants");
  connections = await import("../src/server/portalConnectionStore");
  activity = await import("../src/server/activity");
  erasure = await import("../src/server/clientErasure");
  pluginInstalls = await import("../src/server/pluginInstalls");
  outboundReplay = await import("../src/lib/server/telephony/outboundCommunicationReplay");
  serverUsers = await import("../src/server/users");
});

// A minimal fake Supabase client for the live-table scrub: chainable + thenable,
// operating on seeded arrays. Never touches live data — the whole point.
function getPath(row: Record<string, unknown>, col: string): unknown {
  if (col.includes("->>")) {
    const [objectPath, leaf] = col.split("->>");
    let current: unknown = row;
    for (const segment of objectPath.split("->")) {
      if (!current || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    return current && typeof current === "object"
      ? (current as Record<string, unknown>)[leaf]
      : undefined;
  }
  return row[col];
}
function makeFakeSupabase(
  tables: Record<string, Record<string, unknown>[]>,
  options: {
    /** Runs immediately before the fake RPC takes its transaction locks. */
    beforeInboxErasureLock?: (tables: Record<string, Record<string, unknown>[]>) => void;
  } = {},
) {
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
  function rpc(fn: string, args: Record<string, unknown>) {
    if (fn !== "erase_client_inbox_data") {
      return Promise.resolve({ data: null, error: { message: `unknown rpc: ${fn}` } });
    }
    options.beforeInboxErasureLock?.(tables);
    const agencyId = args.p_agency_id;
    const clientId = args.p_client_id;
    try {
      if (typeof agencyId !== "string" || !agencyId.trim() || typeof clientId !== "string" || !clientId.trim()) {
        throw new Error("A valid inbox erasure scope is required.");
      }
      const connections = tables.inbox_channel_connections ?? [];
      const identities = (tables.inbox_contact_identities ?? [])
        .filter(row => row.agency_id === agencyId && row.client_id === clientId);
      const identityIds = identities.map(row => row.id);
      const identitySet = new Set(identityIds);
      if (identityIds.some(id => typeof id !== "string") || identitySet.size !== identityIds.length) {
        throw new Error("Inbox identity ownership is inconsistent.");
      }
      const connectionById = new Map(connections.map(row => [row.id, row]));
      if (identities.some(identity => {
        const connection = connectionById.get(identity.connection_id);
        return !connection || connection.agency_id !== agencyId;
      })) {
        throw new Error("Inbox identity ownership is inconsistent.");
      }

      const conversations = (tables.inbox_conversations ?? [])
        .filter(row => identitySet.has(row.identity_id));
      const conversationIds = conversations.map(row => row.id);
      const conversationSet = new Set(conversationIds);
      if (conversationIds.some(id => typeof id !== "string") || conversationSet.size !== conversationIds.length
        || conversations.some(conversation => {
          const identity = identities.find(row => row.id === conversation.identity_id);
          return !identity || conversation.agency_id !== agencyId
            || conversation.connection_id !== identity.connection_id;
        })) {
        throw new Error("Inbox conversation ownership is inconsistent.");
      }

      const messages = (tables.inbox_messages ?? [])
        .filter(row => conversationSet.has(row.conversation_id));
      const messageIds = messages.map(row => row.id);
      if (messageIds.some(id => typeof id !== "string") || new Set(messageIds).size !== messageIds.length
        || messages.some(message => {
          const conversation = conversations.find(row => row.id === message.conversation_id);
          return !conversation || message.agency_id !== agencyId
            || message.connection_id !== conversation.connection_id;
        })) {
        throw new Error("Inbox message ownership is inconsistent.");
      }

      const starts = conversations.map(row => row.created_at).filter((value): value is string => typeof value === "string").sort();
      const ends = conversations
        .map(row => row.last_message_at ?? row.created_at)
        .filter((value): value is string => typeof value === "string")
        .sort();

      // Commit only after the complete chain validates, modelling one locked
      // database transaction and the schema's two ON DELETE CASCADE edges.
      tables.inbox_messages = (tables.inbox_messages ?? []).filter(row => !conversationSet.has(row.conversation_id));
      tables.inbox_conversations = (tables.inbox_conversations ?? []).filter(row => !identitySet.has(row.identity_id));
      tables.inbox_contact_identities = (tables.inbox_contact_identities ?? []).filter(row => !identitySet.has(row.id));

      return Promise.resolve({
        data: [{
          deleted_identity_count: identities.length,
          deleted_conversation_count: conversations.length,
          deleted_message_count: messages.length,
          conversation_from: starts[0] ?? null,
          conversation_to: ends[ends.length - 1] ?? null,
        }],
        error: null,
      });
    } catch (error) {
      return Promise.resolve({
        data: null,
        error: { message: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  return { from: (t: string) => builder(t), rpc };
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
  return {
    from: () => builder(),
    rpc: () => Promise.resolve({ data: null, error: { message } }),
  };
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

  it("fails closed when an installed plugin manifest is unavailable", async () => {
    const installId = `install_missing_${process.hrtime.bigint()}`;
    storage.mutate(state => {
      state.pluginInstalls[installId] = {
        id: installId,
        pluginId: "missing-erasure-plugin",
        agencyId,
        clientId,
        enabled: true,
        config: {},
        features: {},
        installedAt: Date.now(),
      } as never;
      state.pluginData[installId] = {
        "private/record": { clientId, secret: "must survive an unknown disposition" },
      };
    });

    const result = await erasure.eraseClientCompletely({ agencyId, clientId, actorUserId: "ed" });

    assert.equal(result?.completed, false);
    assert.equal(result?.collections["hookError:plugin:missing-erasure-plugin"], 1);
    assert.ok(tenants.getClientForAgency(agencyId, clientId), "runtime drift removed the Client retry handle");
    assert.ok(storage.getState().pluginData[installId]?.["private/record"],
      "runtime drift silently applied the generic delete disposition");
  });

  it("fails closed when client data belongs to an orphan plugin slice", async () => {
    const orphanInstallId = `orphan_${process.hrtime.bigint()}`;
    storage.mutate(state => {
      state.pluginData[orphanInstallId] = {
        "private/record": { clientId, secret: "retention disposition is unknown" },
      };
    });

    const result = await erasure.eraseClientCompletely({ agencyId, clientId, actorUserId: "ed" });

    assert.equal(result?.completed, false);
    assert.equal(result?.collections[`hookError:orphan-plugin-data:${orphanInstallId}`], 1);
    assert.ok(tenants.getClientForAgency(agencyId, clientId), "orphan plugin data removed the Client retry handle");
    assert.ok(storage.getState().pluginData[orphanInstallId]?.["private/record"],
      "orphan plugin data was destructively defaulted without a manifest");
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
    assert.match(page(), /canErase=\{inboxManageable && !session\.publicShowcase && session\.role === "agency-owner"\}/);
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
    const survivingClient = tenants.createClient(A, { name: "Surviving client" });

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
      // The real schema routes client ownership through contact identities;
      // conversations deliberately have no client_id column.
      inbox_channel_connections: [
        { id: "connection-a", agency_id: A },
        { id: "connection-b", agency_id: A },
        { id: "connection-foreign", agency_id: `${A}-foreign` },
      ],
      inbox_conversations: [
        { id: "cv1", agency_id: A, connection_id: "connection-a", identity_id: "id1", created_at: "2026-01-01", last_message_at: "2026-02-01" },
        { id: "cv-b", agency_id: A, connection_id: "connection-b", identity_id: "id-b", created_at: "2026-03-01", last_message_at: "2026-03-02" },
        { id: "cv-foreign", agency_id: `${A}-foreign`, connection_id: "connection-foreign", identity_id: "id-foreign", created_at: "2026-04-01", last_message_at: "2026-04-02" },
      ],
      inbox_messages: [
        { id: "m1", agency_id: A, connection_id: "connection-a", conversation_id: "cv1", body_text: "secret" },
        { id: "m-b", agency_id: A, connection_id: "connection-b", conversation_id: "cv-b", body_text: "surviving client" },
        { id: "m-foreign", agency_id: `${A}-foreign`, connection_id: "connection-foreign", conversation_id: "cv-foreign", body_text: "other tenant" },
      ],
      inbox_contact_identities: [
        { id: "id1", agency_id: A, connection_id: "connection-a", client_id: C, handle: "doomed@x.com" },
        { id: "id-b", agency_id: A, connection_id: "connection-b", client_id: survivingClient.id, handle: "survivor@x.com" },
        { id: "id-foreign", agency_id: `${A}-foreign`, connection_id: "connection-foreign", client_id: C, handle: "foreign@x.com" },
      ],
      brand_enquiries: [
        { id: "e1", agency_id: A, name: "Jane", email: "jane@x.com", message: "hi",
          metadata: { clientId: C, identityResolution: { status: "resolved", clientId: C } } },
        { id: "e2", agency_id: A, name: "Bob", email: "bob@x.com",
          metadata: { clientId: C, identityResolution: { status: "ambiguous", clientId: C } } },
        { id: "e-shared", agency_id: A, name: "Shared", email: "shared@x.com", message: "belongs to B",
          metadata: { clientId: C, identityResolution: {
            status: "resolved", clientId: survivingClient.id, clientName: survivingClient.name,
          } } },
        { id: "e-resolved-a-routed-b", agency_id: A, name: "Target identity", email: "target@x.com",
          message: "A's identity routed to B", metadata: {
            clientId: survivingClient.id,
            identityResolution: { status: "resolved", clientId: C, clientName: client.name },
          } },
        { id: "e-foreign", agency_id: `${A}-foreign`, name: "Foreign", email: "foreign@x.com",
          metadata: { clientId: C, identityResolution: { status: "resolved", clientId: C } } },
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
    assert.deepEqual(tables.inbox_conversations.map(row => row.id), ["cv-b", "cv-foreign"],
      "only conversations reached from the target client's exact identity were deleted");
    assert.deepEqual(tables.inbox_messages.map(row => row.id), ["m-b", "m-foreign"],
      "same-agency shared-client and foreign-agency messages were preserved");
    assert.deepEqual(tables.inbox_contact_identities.map(row => row.id), ["id-b", "id-foreign"],
      "same-agency shared-client and foreign-agency identities were preserved");
    assert.equal(result!.live!.inboxConversations, 1);
    assert.equal(result!.live!.inboxMessages, 1);
    assert.equal(result!.live!.inboxContactIdentities, 1);
    assert.equal(result!.live!.inboxConversationsFrom, "2026-01-01");
    assert.ok(!JSON.stringify(result!.live).includes("secret"), "stub carries NO message content");

    // LIVE — brand_enquiries anonymised, split by resolution.
    const e1 = tables.brand_enquiries.find(r => r.id === "e1")!;
    const e2 = tables.brand_enquiries.find(r => r.id === "e2")!;
    const shared = tables.brand_enquiries.find(r => r.id === "e-shared")!;
    const resolvedARoutedB = tables.brand_enquiries.find(r => r.id === "e-resolved-a-routed-b")!;
    const foreign = tables.brand_enquiries.find(r => r.id === "e-foreign")!;
    assert.equal(e1.name, null, "e1 (resolved AS client) PII stripped");
    assert.equal((e1.metadata as Record<string, unknown>).clientId, undefined, "e1 link dropped");
    assert.equal(e2.name, "Bob", "e2 (separate party) PII kept");
    assert.equal((e2.metadata as Record<string, unknown>).clientId, undefined, "e2 link dropped");
    assert.equal(shared.name, "Shared", "client B's resolved enquirer PII was stripped by client A's route");
    assert.equal((shared.metadata as Record<string, unknown>).clientId, undefined,
      "client A's top-level enquiry route was not removed");
    assert.deepEqual((shared.metadata as { identityResolution?: unknown }).identityResolution, {
      status: "resolved", clientId: survivingClient.id, clientName: survivingClient.name,
    }, "client B's exact nested identity resolution was altered");
    assert.equal(resolvedARoutedB.email, null,
      "client A's exact nested identity was missed because the enquiry routes to B");
    assert.equal((resolvedARoutedB.metadata as Record<string, unknown>).clientId, survivingClient.id,
      "client B's top-level route was removed while erasing nested identity A");
    assert.deepEqual((resolvedARoutedB.metadata as { identityResolution?: unknown }).identityResolution, {
      status: "resolved",
    }, "client A's nested identity link was not removed");
    assert.equal(foreign.name, "Foreign", "same client id in another agency is outside erasure authority");
    assert.equal((foreign.metadata as Record<string, unknown>).clientId, C,
      "foreign-agency enquiry link must remain untouched");
    assert.equal(result!.live!.enquiriesAnonymised, 4);
    assert.equal(result!.live!.enquiriesPiiStripped, 2);
    assert.deepEqual(result!.live!.enquiriesReviewRequired, { legacyUnscoped: 1, sharedIdentity: 1 });
    assert.ok(result!.reviewRequired.some(item =>
      item.system === "brand-enquiries" && item.reason === "legacy-unscoped" && item.records === 1));
    assert.ok(result!.reviewRequired.some(item =>
      item.system === "brand-enquiries" && item.reason === "shared-identity" && item.records === 1));

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

  it("fails closed before mutating when the inbox identity chain crosses agencies", async () => {
    const agency = tenants.createAgency({ name: "Inbox boundary", slug: `ib-${Math.floor(performance.now())}` });
    const client = tenants.createClient(agency.id, { name: "Target" });
    const tables: Record<string, Record<string, unknown>[]> = {
      inbox_channel_connections: [
        { id: "connection-target", agency_id: agency.id },
      ],
      inbox_contact_identities: [
        { id: "identity-target", agency_id: agency.id, connection_id: "connection-target", client_id: client.id, handle: "target@example.test" },
      ],
      inbox_conversations: [
        { id: "conversation-target", agency_id: agency.id, connection_id: "connection-target", identity_id: "identity-target" },
      ],
      inbox_messages: [
        { id: "message-target", agency_id: agency.id, connection_id: "connection-target", conversation_id: "conversation-target" },
        { id: "message-foreign", agency_id: `${agency.id}-foreign`, connection_id: "connection-target", conversation_id: "conversation-target" },
      ],
      brand_enquiries: [],
    };

    const result = await erasure.eraseClientCompletely({
      agencyId: agency.id,
      clientId: client.id,
      actorUserId: "ed",
      supabase: makeFakeSupabase(tables) as never,
    });

    assert.equal(result?.completed, false);
    assert.match(result!.live!.errors!.join("\n"), /Inbox message ownership is inconsistent/);
    assert.ok(tenants.getClientForAgency(agency.id, client.id), "the retry handle was removed");
    assert.deepEqual(tables.inbox_contact_identities.map(row => row.id), ["identity-target"]);
    assert.deepEqual(tables.inbox_conversations.map(row => row.id), ["conversation-target"]);
    assert.deepEqual(tables.inbox_messages.map(row => row.id), ["message-target", "message-foreign"]);
  });

  it("uses ownership as it exists when the locked inbox erasure begins", async () => {
    const agency = tenants.createAgency({ name: "Inbox race", slug: `ir-${Math.floor(performance.now())}` });
    const target = tenants.createClient(agency.id, { name: "Former owner" });
    const currentOwner = tenants.createClient(agency.id, { name: "Current owner" });
    const tables: Record<string, Record<string, unknown>[]> = {
      inbox_channel_connections: [{ id: "connection", agency_id: agency.id }],
      inbox_contact_identities: [{
        id: "identity",
        agency_id: agency.id,
        connection_id: "connection",
        client_id: target.id,
      }],
      inbox_conversations: [{
        id: "conversation",
        agency_id: agency.id,
        connection_id: "connection",
        identity_id: "identity",
      }],
      inbox_messages: [{
        id: "message",
        agency_id: agency.id,
        connection_id: "connection",
        conversation_id: "conversation",
      }],
      brand_enquiries: [],
    };
    const supabase = makeFakeSupabase(tables, {
      beforeInboxErasureLock: liveTables => {
        liveTables.inbox_contact_identities[0].client_id = currentOwner.id;
      },
    });

    const result = await erasure.eraseClientCompletely({
      agencyId: agency.id,
      clientId: target.id,
      actorUserId: "ed",
      supabase: supabase as never,
    });

    assert.equal(result?.completed, true);
    assert.equal(result!.live!.inboxContactIdentities, 0);
    assert.deepEqual(tables.inbox_contact_identities.map(row => row.id), ["identity"]);
    assert.deepEqual(tables.inbox_conversations.map(row => row.id), ["conversation"]);
    assert.deepEqual(tables.inbox_messages.map(row => row.id), ["message"]);
  });

  it("pins inbox erasure to one locked service-role RPC and the real cascade schema", () => {
    const path = require("node:path");
    const migration = readFileSync(path.join(
      __dirname, "..", "..", "supabase", "migrations", "20260912130000_atomic_client_inbox_erasure.sql",
    ), "utf-8");
    const masterSchema = readFileSync(path.join(
      __dirname, "..", "..", "supabase", "migrations", "20260811113000_master_inbox_messaging.sql",
    ), "utf-8");
    const source = readFileSync(path.join(__dirname, "..", "src", "server", "clientErasure.ts"), "utf-8");
    const inboxSlice = source.slice(
      source.indexOf("atomic exact client-owned identity"),
      source.indexOf("── brand_enquiries"),
    );

    assert.match(masterSchema, /identity_id text not null references public\.inbox_contact_identities\(id\) on delete cascade/);
    assert.match(masterSchema, /conversation_id text not null references public\.inbox_conversations\(id\) on delete cascade/);
    assert.match(migration, /lock table[\s\S]*public\.inbox_channel_connections[\s\S]*public\.inbox_contact_identities[\s\S]*public\.inbox_conversations[\s\S]*public\.inbox_messages[\s\S]*in share row exclusive mode/i);
    assert.match(migration, /where identity_row\.agency_id = p_agency_id[\s\S]*identity_row\.client_id = p_client_id[\s\S]*for update/i);
    assert.match(migration, /connection_row\.agency_id is distinct from p_agency_id/);
    assert.match(migration, /conversation_row\.identity_id = any\(v_identity_ids\)/);
    assert.match(migration, /message_row\.conversation_id = any\(v_conversation_ids\)/);
    assert.match(migration, /conversation_row\.agency_id is distinct from p_agency_id/);
    assert.match(migration, /conversation_row\.connection_id is distinct from identity_row\.connection_id/);
    assert.match(migration, /message_row\.agency_id is distinct from p_agency_id/);
    assert.match(migration, /message_row\.connection_id is distinct from conversation_row\.connection_id/);
    assert.match(migration, /delete from public\.inbox_contact_identities/);
    assert.doesNotMatch(migration, /delete from public\.inbox_(?:conversations|messages)/);
    assert.match(migration, /v_deleted_identity_count <> v_identity_count[\s\S]*conversation_row\.identity_id = any\(v_identity_ids\)[\s\S]*message_row\.conversation_id = any\(v_conversation_ids\)/);
    assert.match(migration, /revoke all on function public\.erase_client_inbox_data\(text, text\) from public, anon, authenticated/);
    assert.match(migration, /grant execute on function public\.erase_client_inbox_data\(text, text\) to service_role/);
    assert.match(inboxSlice, /supabase\.rpc<InboxErasureRow>\("erase_client_inbox_data"/);
    assert.doesNotMatch(inboxSlice, /\.from\([^)]+inbox_(?:conversations|messages|contact_identities)/);
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
    assert.ok(!((slice["contacts/index"] as string[] | undefined) ?? []).includes(contact.id),
      "contact index membership survived");
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

  it("destroys exact Prospect dossiers while preserving legacy/shared identity matches for review", async () => {
    const EMAIL = `prospect-erasure-${process.hrtime.bigint()}@example.com`;
    const LEGACY_EMAIL = `legacy-prospect-${process.hrtime.bigint()}@example.com`;
    const PHONE = "+44 7700 910777";
    const SECRET_RESEARCH = `research-secret-${process.hrtime.bigint()}`;
    const SECRET_NOTE = `note-secret-${process.hrtime.bigint()}`;
    const SECRET_OUTREACH = `outreach-secret-${process.hrtime.bigint()}`;
    const SOCIAL_PATH = `erased-prospect-${process.hrtime.bigint()}`;
    const { agencyId, installId, c } = freshAgency("prospect-dossier");

    const target = await c.prospects.create({
      name: "Erased Prospect",
      company: "Erased Prospect Ltd",
      email: EMAIL,
      phone: PHONE,
      website: "https://erased-prospect.example/",
      googleMapsUrl: "https://www.google.com/maps/place/Erased+Prospect",
      instagramUrl: `https://instagram.com/${SOCIAL_PATH}`,
      facebookUrl: `https://facebook.com/${SOCIAL_PATH}`,
      linkedinUrl: `https://linkedin.com/company/${SOCIAL_PATH}`,
      researchNotes: SECRET_RESEARCH,
      opportunity: "PII-bearing opportunity prose",
      source: "networking",
    } as never, "user_scout" as never);
    await c.prospects.addNote(target.id, SECRET_NOTE, "user_researcher" as never);
    await c.prospects.recordOutreach(target.id, {
      attemptId: "erase-target-call",
      channel: "call",
      outcome: "interested",
      note: SECRET_OUTREACH,
    }, "user_caller" as never);

    const { lead } = await c.leads.upsert({
      email: EMAIL,
      name: "Erased Prospect",
      phone: PHONE,
      company: "Erased Prospect Ltd",
      source: "scouting:networking",
      tags: [],
    } as never, "user_qualifier" as never);
    const qualified = await c.prospects.linkQualifiedLead(target.id, lead.id, "user_qualifier" as never);
    assert.ok(qualified);
    await c.leads.attachProspectAcquisition(
      lead.id,
      plugin.leadProspectAcquisition(qualified!),
      "user_qualifier" as never,
    );

    // A pre-backlink record has no server-owned Client/Person edge. Its address
    // is evidence for review, never deletion authority.
    const legacy = await c.prospects.create({
      company: "Legacy Erasure Target",
      email: LEGACY_EMAIL,
      phone: PHONE,
      researchNotes: "legacy prospect research must go",
      source: "csv:legacy.csv",
    } as never, "user_importer" as never);

    const { lead: unrelatedLead } = await c.leads.upsert({
      email: `unrelated-lead-${process.hrtime.bigint()}@example.com`,
      source: "manual",
      tags: [],
    } as never, "user_other" as never);
    const protectedSharedInbox = await c.prospects.create({
      company: "Different Person Shared Inbox",
      email: EMAIL,
      source: "networking",
    } as never, "user_other" as never);
    await c.prospects.linkQualifiedLead(protectedSharedInbox.id, unrelatedLead.id, "user_other" as never);
    const protectedActivity = activity.logActivity({
      agencyId,
      category: "leads",
      action: "leads.prospect.shared-inbox-reviewed",
      message: "Reviewed another qualified acquisition dossier.",
      metadata: { prospectId: protectedSharedInbox.id, email: EMAIL },
    });
    const legacyAddressActivity = activity.logActivity({
      agencyId,
      category: "leads",
      action: "leads.legacy-address-note",
      message: `Legacy note for ${EMAIL} via ${PHONE}`,
      metadata: { email: EMAIL, phone: PHONE },
    });
    const legacyIdTextActivity = activity.logActivity({
      agencyId,
      category: "leads",
      action: "leads.legacy-id-text-note",
      message: `Operator note mentioning ${target.id} without a typed lineage edge.`,
      metadata: {},
    });
    const unrelated = await c.prospects.create({
      company: "Unrelated Prospect",
      email: `unrelated-prospect-${process.hrtime.bigint()}@example.com`,
      researchNotes: "unrelated research survives",
      source: "networking",
    } as never, "user_other" as never);

    // Calls/emails happen before the Prospect becomes a Client, so these rows
    // deliberately have no clientId. The exact Prospect edge is what must carry
    // erasure through conversion. A shared-inbox sibling proves we do not fall
    // back to deleting every row with the same recipient identity.
    const targetCallActivity = activity.logActivity({
      agencyId,
      actorUserId: "user_caller",
      category: "inbox",
      action: "call.initiated",
      message: `Called Erased Prospect (${PHONE})`,
      metadata: {
        phone: PHONE,
        prospectId: target.id,
        logicalCallId: "erase-target-logical-call-0001",
      },
    });
    const targetEmailActivity = activity.logActivity({
      agencyId,
      actorUserId: "user_caller",
      category: "inbox",
      action: "outreach.email.sent",
      message: `Emailed ${EMAIL}`,
      metadata: {
        to: EMAIL,
        prospectId: target.id,
        logicalSendId: "erase-target-logical-email-0001",
      },
    });
    const protectedInboxActivity = activity.logActivity({
      agencyId,
      actorUserId: "user_other",
      category: "inbox",
      action: "outreach.email.sent",
      message: `Emailed ${EMAIL}`,
      metadata: {
        to: EMAIL,
        prospectId: protectedSharedInbox.id,
        logicalSendId: "protected-shared-logical-email-0001",
      },
    });

    const targetCallOperation = {
      agencyId,
      channel: "twilio-call" as const,
      operationId: "erase-target-call-operation-0001",
      senderId: "connection:target-twilio:call",
      subjectReferences: { prospectId: target.id },
      requestFingerprint: outboundReplay.buildOutboundCommunicationFingerprint({
        agencyId,
        channel: "call",
        recipient: PHONE,
        senderId: "connection:target-twilio:call",
        payload: { prospectId: target.id },
      }),
    };
    const targetEmailOperation = {
      agencyId,
      channel: "smtp-email" as const,
      operationId: "erase-target-email-operation-0001",
      senderId: "connection:target-smtp:email",
      subjectReferences: { prospectId: target.id },
      requestFingerprint: outboundReplay.buildOutboundCommunicationFingerprint({
        agencyId,
        channel: "email",
        recipient: EMAIL,
        senderId: "connection:target-smtp:email",
        payload: { prospectId: target.id, subject: "Pre-conversion" },
      }),
    };
    const protectedEmailOperation = {
      agencyId,
      channel: "smtp-email" as const,
      operationId: "protected-email-operation-0001",
      senderId: "connection:target-smtp:email",
      subjectReferences: { prospectId: protectedSharedInbox.id },
      requestFingerprint: outboundReplay.buildOutboundCommunicationFingerprint({
        agencyId,
        channel: "email",
        recipient: EMAIL,
        senderId: "connection:target-smtp:email",
        payload: { prospectId: protectedSharedInbox.id, subject: "Shared inbox" },
      }),
    };
    await outboundReplay.runReplayProtectedOutboundOperation(targetCallOperation, async () => ({
      successful: true,
      via: "twilio",
      externalProviderId: "CA-erasure-target",
    }));
    await outboundReplay.runReplayProtectedOutboundOperation(targetEmailOperation, async () => ({
      successful: true,
      via: "smtp",
      externalProviderId: "smtp-erasure-target",
    }));
    await outboundReplay.runReplayProtectedOutboundOperation(protectedEmailOperation, async () => ({
      successful: true,
      via: "smtp",
      externalProviderId: "smtp-protected-shared-inbox",
    }));
    const targetCallOperationId = outboundReplay.outboundOperationRecordId(
      agencyId,
      targetCallOperation.channel,
      targetCallOperation.operationId,
    );
    const targetEmailOperationId = outboundReplay.outboundOperationRecordId(
      agencyId,
      targetEmailOperation.channel,
      targetEmailOperation.operationId,
    );
    const protectedEmailOperationId = outboundReplay.outboundOperationRecordId(
      agencyId,
      protectedEmailOperation.channel,
      protectedEmailOperation.operationId,
    );

    const foreign = freshAgency("foreign-prospect-dossier");
    const foreignProspect = await foreign.c.prospects.create({
      company: "Foreign Prospect",
      email: EMAIL,
      phone: PHONE,
      researchNotes: "foreign research survives",
      source: "networking",
    } as never, "foreign_user" as never);

    const client = tenants.createClient(agencyId, {
      name: "Prospect Erasure Client",
      ownerEmail: EMAIL,
      metadata: {
        phone: PHONE,
        prospectId: target.id,
        linkedContacts: [{
          id: "legacy-contact",
          name: "Legacy Prospect",
          email: LEGACY_EMAIL,
          phone: PHONE,
          primary: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }],
      },
    } as never);
    const prospectLedgerActivity = activity.logActivity({
      agencyId,
      clientId: client.id,
      category: "leads",
      action: "leads.prospect.context-recorded",
      message: `Prospect context ${SECRET_RESEARCH}`,
      metadata: { prospectId: target.id },
    });
    assert.ok(Object.values(storage.getState().clientRecordLedger).some(event =>
      event.sourceType === "activity" && event.sourceId === prospectLedgerActivity.id),
    "test setup did not project the PII-bearing activity reference");
    const converted = await c.leads.recordConversion(lead.id, client.id, "user_qualifier" as never);
    await c.contacts.promoteLead(converted as never, "user_qualifier" as never);

    const erasureResult = await erasure.eraseClientCompletely({
      agencyId,
      clientId: client.id,
      actorUserId: "user_owner",
    });

    assert.equal(await c.prospects.get(target.id), null, "linked Prospect row survived");
    assert.ok(await c.prospects.get(legacy.id), "legacy identity evidence became delete authority");
    assert.ok(erasureResult?.reviewRequired.some(item => item.system === "leads-pipeline" && item.records >= 1));
    const slice = (storage.getState().pluginData[installId] ?? {}) as Record<string, unknown>;
    assert.equal(slice[`prospect:${target.id}`], undefined);
    assert.ok(slice[`prospect:${legacy.id}`]);
    assert.equal(slice[`prospects/lead/${lead.id}`], undefined, "qualified-lead pointer survived");
    assert.ok(!((slice["prospects/index"] as string[] | undefined) ?? []).includes(target.id), "Prospect index membership survived");
    assert.ok(!JSON.stringify(slice).includes(SECRET_RESEARCH), "research prose survived");
    assert.ok(!JSON.stringify(slice).includes(SECRET_NOTE), "note prose survived");
    assert.ok(!JSON.stringify(slice).includes(SECRET_OUTREACH), "outreach prose survived");
    assert.ok(!JSON.stringify(slice).includes(SOCIAL_PATH), "social profile URLs survived");
    assert.ok(!storage.getState().activity.some(entry =>
      entry.agencyId === agencyId
      && JSON.stringify(entry.metadata ?? {}).includes(target.id)), "typed Prospect activity/reference rows survived");
    assert.ok(!Object.values(storage.getState().clientRecordLedger).some(event =>
      event.sourceType === "activity" && event.sourceId === prospectLedgerActivity.id),
    "PII-bearing client-ledger activity projection survived");

    assert.ok(await c.prospects.get(protectedSharedInbox.id), "another Lead's shared-inbox dossier was erased");
    assert.equal(slice[`prospects/lead/${unrelatedLead.id}`], protectedSharedInbox.id,
      "erasure removed another Lead's owned dossier pointer");
    assert.ok(storage.getState().activity.some(entry => entry.id === protectedActivity.id),
      "another Lead's explicitly-owned activity was erased by the shared-email fallback");
    assert.ok(storage.getState().activity.some(entry => entry.id === legacyAddressActivity.id),
      "legacy address-only activity was erased without an exact entity edge");
    assert.ok(storage.getState().activity.some(entry => entry.id === legacyIdTextActivity.id),
      "free-text id mention became deletion authority without typed metadata");
    assert.ok(erasureResult?.reviewRequired.some(item =>
      item.system === "leads-activity" && item.reason === "shared-identity" && item.records >= 1),
    "preserved address-only activity was not surfaced as review work");
    assert.ok(!storage.getState().activity.some(entry => entry.id === targetCallActivity.id),
      "pre-conversion call activity survived subject erasure");
    assert.ok(!storage.getState().activity.some(entry => entry.id === targetEmailActivity.id),
      "pre-conversion email activity survived subject erasure");
    assert.ok(storage.getState().activity.some(entry => entry.id === protectedInboxActivity.id),
      "shared-inbox activity for another exact Prospect was erased");
    assert.equal(storage.getState().outboundCommunicationOperations[targetCallOperationId], undefined,
      "pre-conversion Twilio replay admission survived subject erasure");
    assert.equal(storage.getState().outboundCommunicationOperations[targetEmailOperationId], undefined,
      "pre-conversion SMTP replay admission survived subject erasure");
    assert.ok(storage.getState().outboundCommunicationOperations[protectedEmailOperationId],
      "shared-inbox replay admission for another exact Prospect was erased");
    assert.ok(await c.prospects.get(unrelated.id), "unrelated agency Prospect was erased");
    assert.ok(await foreign.c.prospects.get(foreignProspect.id), "foreign-agency Prospect was erased");

    // Full erasure removes the Client, so exercise the plugin hook directly to
    // prove a partial-failure retry remains safe with its captured subject.
    const runtime = await import("../src/built-ins/runtime/_runtime");
    const registry = await import("../src/built-ins/runtime/_registry");
    const install = storage.getState().pluginInstalls[installId];
    const manifest = registry.getPlugin("leads-pipeline");
    assert.ok(install && manifest?.onEraseClient);
    const reviewRequired: Array<{ system: string; reason: "legacy-unscoped" | "shared-identity"; records: number }> = [];
    await manifest!.onEraseClient!(runtime.makeCtx(install!), client.id, {
      emails: [],
      phones: [],
      exactOwnership: { agencyId, clientId: client.id, personShared: true },
      identityEvidence: {
        emails: [EMAIL, LEGACY_EMAIL],
        phones: [PHONE],
        sharedEmails: [EMAIL],
        sharedPhones: [PHONE],
      },
      reviewRequired,
      metadata: {},
    });
    assert.ok(reviewRequired.some(item => item.system === "leads-pipeline"));
    assert.ok(await c.prospects.get(legacy.id), "retry deleted a preserved legacy dossier");
    assert.ok(await c.prospects.get(protectedSharedInbox.id), "retry erased protected shared-inbox dossier");
    assert.ok(await c.prospects.get(unrelated.id), "retry erased unrelated Prospect");
    assert.ok(await foreign.c.prospects.get(foreignProspect.id), "retry crossed the agency boundary");
  });

  it("preserves an address-only CONTACT with no exact conversion back-link", async () => {
    // A historical conversion with no durable backlink is review work. The
    // ownerEmail is not enough authority to destroy a Contact and its history.
    const EMAIL = `contact-only-${process.hrtime.bigint()}@example.com`;
    const { agencyId, installId, c } = freshAgency("contactonly");
    const { contact } = await c.contacts.upsert(
      { email: EMAIL, name: "Contact Only", type: "customer", source: "manual", tags: [] } as never,
      "ed" as never,
    );
    const client = tenants.createClient(agencyId, { name: "Contact-only Client", ownerEmail: EMAIL } as never);

    const result = await erasure.eraseClientCompletely({ agencyId, clientId: client.id, actorUserId: "ed" });

    assert.ok(result?.reviewRequired.some(item => item.system === "leads-pipeline"));
    const slice = (storage.getState().pluginData[installId] ?? {}) as Record<string, unknown>;
    assert.ok(slice[`contact:${contact.id}`], "address-only Contact was deleted");
    assert.ok(tracesOf(EMAIL).length > 0, "the preserved review record unexpectedly vanished");
  });

  it("is idempotent — erasing again is a no-op, not a throw", async () => {
    const EMAIL = `twice-${process.hrtime.bigint()}@example.com`;
    const { agencyId, c } = freshAgency("twice");
    const client = tenants.createClient(agencyId, { name: "Twice Client" });
    const { lead } = await c.leads.upsert(
      { email: EMAIL, source: "manual", tags: [], type: "lead" } as never, "ed" as never,
    );
    const converted = await c.leads.recordConversion(lead.id, client.id, "ed" as never);
    const contact = await c.contacts.promoteLead(converted as never, "ed" as never);

    await erasure.eraseClientCompletely({ agencyId, clientId: client.id, actorUserId: "ed" });
    // The client record is gone, so a re-erase returns null — but the hook is
    // still safe to re-run directly (a partial failure must be retryable).
    const registry = await import("../src/built-ins/runtime/_registry");
    const runtime = await import("../src/built-ins/runtime/_runtime");
    const manifest = registry.getPlugin("leads-pipeline");
    const install = Object.values(storage.getState().pluginInstalls).find(candidate =>
      candidate.agencyId === agencyId && candidate.pluginId === "leads-pipeline");
    assert.ok(install && manifest?.onEraseClient, "the hook must exist");
    const subject = {
      emails: [],
      phones: [],
      exactOwnership: {
        agencyId,
        clientId: client.id,
        leadId: lead.id,
        contactId: contact.id,
        personShared: true,
      },
      identityEvidence: {
        emails: [EMAIL], phones: [], sharedEmails: [], sharedPhones: [],
      },
      reviewRequired: [],
      metadata: {},
    };
    await manifest!.onEraseClient!(runtime.makeCtx(install!), client.id, subject);
    await manifest!.onEraseClient!(runtime.makeCtx(install!), client.id, subject);
    assert.equal(await erasure.eraseClientCompletely({ agencyId, clientId: client.id, actorUserId: "ed" }), null);
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
describe("email erasure uses exact ownership, not the recipient address", () => {
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

  it("deletes only the target client's message and preserves shared/unscoped mail for review", async () => {
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
    const mailStore = pluginStorage.makePluginStorage(mailInstall.id);
    const mailC = mail.containerFor({ agencyId: A as never, storage: mailStore as never } as never);
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
    const otherClient = tenants.createClient(A, { name: "Other Shared Inbox Client", ownerEmail: EMAIL } as never);
    const converted = await c.leads.recordConversion(lead.id, client.id, "ed" as never);
    await c.contacts.promoteLead(converted as never, "ed" as never);
    const exactTarget = await mailC.emails.enqueue({
      to: EMAIL,
      subject: "Target client message",
      bodyText: "delete only this exact row",
      clientId: client.id,
      externalRef: `exact-target:${client.id}`,
      triggeredByPlugin: "client-crm",
    } as never, "ed" as never);
    const exactOther = await mailC.emails.enqueue({
      to: EMAIL,
      subject: "Other client message",
      bodyText: "preserve this exact row",
      clientId: otherClient.id,
      externalRef: `exact-other:${otherClient.id}`,
      triggeredByPlugin: "client-crm",
    } as never, "ed" as never);

    const result = await erasure.eraseClientCompletely({ agencyId: A, clientId: client.id, actorUserId: "ed" });

    const slice = (storage.getState().pluginData[mailInstall.id] ?? {}) as Record<string, unknown>;
    assert.equal(slice[`email/by-id/${exactTarget.id}`], undefined, "exact target message survived");
    assert.equal(slice[`email/idem/${exactTarget.idempotencyKey}`], undefined, "target idempotency pointer survived");
    assert.ok(!((slice["email/by-status/queued"] as string[] | undefined) ?? []).includes(exactTarget.id),
      "target status index membership survived");
    assert.ok(!((slice["email/index"] as string[] | undefined) ?? []).includes(exactTarget.id),
      "target email index membership survived");
    const remainingMessages = await mailC.emails.list();
    assert.ok(remainingMessages.some(message => message.clientId === undefined && message.subject === "Spring offer"),
      "legacy message was erased by recipient address");
    assert.ok(remainingMessages.some(message => message.id === exactOther.id),
      "another client's message was erased by recipient address");
    assert.ok(tenants.getClientForAgency(A, otherClient.id), "another client was erased");
    assert.ok(result?.reviewRequired.some(item =>
      item.system === "email-sender" && item.reason === "shared-identity" && item.records === 2));

    const registry = await import("../src/built-ins/runtime/_registry");
    const runtime = await import("../src/built-ins/runtime/_runtime");
    const manifest = registry.getPlugin("email-sender");
    const installed = storage.getState().pluginInstalls[mailInstall.id];
    assert.ok(installed && manifest?.onEraseClient, "email erasure hook must exist");
    const retrySubject = {
      emails: [], phones: [],
      exactOwnership: { agencyId: A, clientId: client.id, personShared: true },
      identityEvidence: { emails: [EMAIL], phones: [], sharedEmails: [EMAIL], sharedPhones: [] },
      reviewRequired: [], metadata: {},
    };
    await manifest!.onEraseClient!(runtime.makeCtx(installed!), client.id, retrySubject);
    await manifest!.onEraseClient!(runtime.makeCtx(installed!), client.id, retrySubject);
    assert.equal(await mailStore.get(`email/by-id/${exactTarget.id}`), undefined, "email hook retry revived the target");
    assert.ok(await mailStore.get(`email/by-id/${exactOther.id}`), "email hook retry erased client B");
  });

  it("rolls back an earlier plugin deletion when a later erasure hook fails", async () => {
    const agency = tenants.createAgency({ name: "Atomic Erasure Co", slug: `atomic-erase-${process.hrtime.bigint()}` });
    const A = agency.id;
    // Insertion order is intentional: email-sender mutates first, then the
    // forged leads lineage makes the later hook fail.
    const mailInstall = pluginInstalls.upsertInstall({
      scope: { agencyId: A }, pluginId: "email-sender", installedBy: "ed",
    } as never);
    const leadsInstall = pluginInstalls.upsertInstall({
      scope: { agencyId: A }, pluginId: "leads-pipeline", installedBy: "ed",
    } as never);
    const mailStore = pluginStorage.makePluginStorage(mailInstall.id);
    const mailC = mail.containerFor({
      agencyId: A as never,
      storage: mailStore as never,
    } as never);
    const c = leads.containerWithDeps({
      agencyId: A as never,
      storage: pluginStorage.makePluginStorage(leadsInstall.id) as never,
      foundation: {
        tenant: ports.tenantPort,
        activity: ports.activityPort,
        events: ports.eventBusPort,
        pluginInstalls: ports.pluginInstallStorePort,
        pipeline: leadsPorts.pipelinePort,
      } as never,
    });
    const identity = await mailC.identities.create({
      name: "Atomic Agency",
      email: `atomic-sender-${process.hrtime.bigint()}@agency.test`,
      isDefault: true,
    } as never, "ed" as never);
    await mailC.identities.verifyDomain(identity.id, "ed" as never);

    const otherClient = tenants.createClient(A, { name: "Other Exact Client" });
    const otherLead = (await c.leads.upsert({
      email: `other-exact-${process.hrtime.bigint()}@example.com`,
      source: "manual",
      tags: [],
    } as never, "ed" as never)).lead;
    await c.leads.recordConversion(otherLead.id, otherClient.id, "ed" as never);

    const targetClient = tenants.createClient(A, {
      name: "Atomic Target",
      ownerEmail: `atomic-target-${process.hrtime.bigint()}@example.com`,
      metadata: { leadId: otherLead.id },
    } as never);
    const targetMessage = await mailC.emails.enqueue({
      to: targetClient.ownerEmail!,
      subject: "Must roll back",
      bodyText: "This exact deletion must not partially commit.",
      clientId: targetClient.id,
      externalRef: `atomic-target:${targetClient.id}`,
      triggeredByPlugin: "client-crm",
    } as never, "ed" as never);

    const result = await erasure.eraseClientCompletely({
      agencyId: A,
      clientId: targetClient.id,
      actorUserId: "ed",
    });
    assert.equal(result?.completed, false);
    assert.deepEqual(result?.collections, { "hookError:leads-pipeline": 1 });
    assert.ok(tenants.getClientForAgency(A, targetClient.id), "failed erasure removed the Client retry handle");
    assert.ok((await mailC.emails.list()).some(message => message.id === targetMessage.id),
      "an earlier hook deletion escaped the transaction rollback");
    assert.ok(await mailStore.get(`email/idem/${targetMessage.idempotencyKey}`),
      "rollback failed to restore the target idempotency pointer");
    assert.ok(((await mailStore.get<string[]>("email/by-status/queued")) ?? []).includes(targetMessage.id),
      "rollback failed to restore the target status index");
    assert.ok(((await mailStore.get<string[]>("email/index")) ?? []).includes(targetMessage.id),
      "rollback failed to restore the target email index");
    assert.equal(storage.getState().activity.some(entry =>
      entry.action === "email.erased" && entry.agencyId === A), false,
    "the rolled-back plugin audit survived");

    // Repair the forged edge and retry the SAME operation. This proves the
    // retained Client is a useful retry handle rather than a dead-end failure.
    tenants.updateClient(A, targetClient.id, { metadata: { leadId: undefined } });
    const retry = await erasure.eraseClientCompletely({
      agencyId: A,
      clientId: targetClient.id,
      actorUserId: "ed",
    });
    assert.equal(retry?.completed, true, "repaired erasure did not complete on retry");
    assert.equal(tenants.getClientForAgency(A, targetClient.id), null, "successful retry retained the Client");
    assert.equal(await mailStore.get(`email/by-id/${targetMessage.id}`), undefined,
      "successful retry retained the exact message");
    assert.equal(await mailStore.get(`email/idem/${targetMessage.idempotencyKey}`), undefined,
      "successful retry retained the idempotency pointer");
    assert.ok(!((await mailStore.get<string[]>("email/by-status/queued")) ?? []).includes(targetMessage.id),
      "successful retry retained the status index membership");
    assert.ok(!((await mailStore.get<string[]>("email/index")) ?? []).includes(targetMessage.id),
      "successful retry retained the email index membership");
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
// so their address is review evidence until a durable Client/Person stamp is
// added. It must never be promoted into deletion authority.
// ─────────────────────────────────────────────────────────────────────────────
describe("erasing a client reaches the plugins that captured them before they were one", () => {
  let funnel: typeof import("@aqua/plugin-public-funnel/server");
  let marketing: typeof import("@aqua/plugin-agency-marketing/server");
  let ports: typeof import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
  let leadFunnelPorts: typeof import("../src/built-ins/runtime/foundation-adapters/leadFunnelPorts");
  let pluginStorage: typeof import("../src/lib/server/pluginStorage");

  before(async () => {
    funnel = await import("@aqua/plugin-public-funnel/server");
    marketing = await import("@aqua/plugin-agency-marketing/server");
    ports = await import("../src/built-ins/runtime/foundation-adapters/_foundationPorts");
    leadFunnelPorts = await import("../src/built-ins/runtime/foundation-adapters/leadFunnelPorts");
    pluginStorage = await import("../src/lib/server/pluginStorage");

    funnel.registerFunnelFoundation({
      activity: ports.activityPort,
      events: ports.eventBusPort,
      // Use the real local-only adapter: pending captures create no User, while
      // exact erasure must still clean pre-migration capture-created Users.
      leadUsers: leadFunnelPorts.leadUserPort,
      promotionAuthority: leadFunnelPorts.pendingCapturePromotionAuthorityPort,
      promotions: leadFunnelPorts.pendingCapturePromotionPort,
    });
    marketing.registerAgencyMarketingFoundation({
      tenant: ports.tenantPort, user: ports.userPort,
      activity: ports.activityPort, events: ports.eventBusPort,
      pluginInstalls: ports.pluginInstallStorePort,
    } as never);
  });

  it("public-funnel: an unscoped capture is preserved and surfaced for review", async () => {
    const EMAIL = `funnelled-${process.hrtime.bigint()}@example.com`;
    const agency = tenants.createAgency({ name: "Funnelled Co", slug: `fnl-${process.hrtime.bigint()}` });
    const install = pluginInstalls.upsertInstall({ scope: { agencyId: agency.id }, pluginId: "public-funnel", installedBy: "ed" } as never);
    const c = funnel.containerFor({
      agencyId: agency.id as never,
      install: install as never,
      storage: pluginStorage.makePluginStorage(install.id) as never,
    });

    // Captured from a public form — no client exists yet, so no clientId anywhere.
    await c.funnel.captureHcCompletion({ email: EMAIL, slot: { slot: 3, answers: {} } } as never);
    assert.equal((await c.funnel.listByEmail(EMAIL)).length, 1, "the capture must exist");

    // …only later do they become a client.
    const client = tenants.createClient(agency.id, { name: "Funnelled Client", ownerEmail: EMAIL } as never);
    const result = await erasure.eraseClientCompletely({ agencyId: agency.id, clientId: client.id, actorUserId: "ed" });

    assert.equal((await c.funnel.listByEmail(EMAIL)).length, 1, "unscoped capture was deleted by address");
    assert.deepEqual(result?.reviewRequired, [{
      system: "public-funnel",
      reason: "legacy-unscoped",
      records: 1,
    }]);
  });

  it("public-funnel: exact legacy A capture and user delete while B and unscoped identities survive", async () => {
    const suffix = process.hrtime.bigint();
    const EMAIL_A = `funnel-a-${suffix}@example.com`;
    const EMAIL_B = `funnel-b-${suffix}@example.com`;
    const EMAIL_LEGACY = `funnel-legacy-${suffix}@example.com`;
    const agency = tenants.createAgency({ name: "Funnel Lineage Co", slug: `fnl-lineage-${suffix}` });
    const install = pluginInstalls.upsertInstall({
      scope: { agencyId: agency.id }, pluginId: "public-funnel", installedBy: "ed",
    } as never);
    const store = pluginStorage.makePluginStorage(install.id);
    const c = funnel.containerFor({ agencyId: agency.id as never, install: install as never, storage: store as never });

    const captureA = await c.funnel.captureHcCompletion({
      email: EMAIL_A, completionId: `exact_a_${suffix}`, slot: { slot: 1 },
    } as never);
    const captureB = await c.funnel.captureHcCompletion({
      email: EMAIL_B, completionId: `exact_b_${suffix}`, slot: { slot: 2 },
    } as never);
    const captureLegacy = await c.funnel.captureHcCompletion({
      email: EMAIL_LEGACY, completionId: `legacy_${suffix}`, slot: { slot: 3 },
    } as never);

    const clientA = tenants.createClient(agency.id, { name: "Funnel Client A", ownerEmail: EMAIL_A } as never);
    const clientB = tenants.createClient(agency.id, { name: "Funnel Client B", ownerEmail: EMAIL_B } as never);
    const persons = await import("../src/server/persons");
    const personA = persons.upsertPerson(agency.id, {
      emails: [EMAIL_A, EMAIL_LEGACY], facets: { clientIds: [clientA.id] },
    }).person;
    const personB = persons.upsertPerson(agency.id, {
      emails: [EMAIL_B], facets: { clientIds: [clientB.id] },
    }).person;
    tenants.updateClient(agency.id, clientA.id, { personId: personA.id });
    tenants.updateClient(agency.id, clientB.id, { personId: personB.id });

    const keyA = `captures/by-id/${captureA.capture.id}`;
    const keyB = `captures/by-id/${captureB.capture.id}`;
    const keyLegacy = `captures/by-id/${captureLegacy.capture.id}`;
    // Model rows written before pending identities landed. Anonymous capture no
    // longer creates these Users; cleanup support remains for stored legacy data.
    const legacyUserA = serverUsers.createUser({ email: EMAIL_A, password: "LegacyCaptureSecret42!", role: "lead" });
    const legacyUserB = serverUsers.createUser({ email: EMAIL_B, password: "LegacyCaptureSecret42!", role: "lead" });
    const legacyUserUnscoped = serverUsers.createUser({ email: EMAIL_LEGACY, password: "LegacyCaptureSecret42!", role: "lead" });
    await store.set(keyA, {
      ...(await store.get(keyA) as object), clientId: clientA.id, personId: personA.id,
      leadUserId: legacyUserA.id,
    });
    await store.set(keyB, {
      ...(await store.get(keyB) as object), clientId: clientB.id, personId: personB.id,
      leadUserId: legacyUserB.id,
    });
    await store.set(keyLegacy, {
      ...(await store.get(keyLegacy) as object), leadUserId: legacyUserUnscoped.id,
    });
    await store.set("captures/index", [captureA.capture.id, captureB.capture.id, captureLegacy.capture.id]);
    await store.set(`captures/by-email/${EMAIL_A.toLowerCase()}`, [captureA.capture.id]);
    await store.set(`captures/by-email/${EMAIL_B.toLowerCase()}`, [captureB.capture.id]);
    await store.set(`captures/by-email/${EMAIL_LEGACY.toLowerCase()}`, [captureLegacy.capture.id]);
    assert.ok(Object.values(storage.getState().users).some(user => user.id === legacyUserA.id), "A legacy lead user not seeded");
    assert.ok(Object.values(storage.getState().users).some(user => user.id === legacyUserB.id), "B legacy lead user not seeded");
    const signupOutboxIds = (userId: string) => Object.entries(storage.getState().outbox ?? {})
      .filter(([, event]) => event.name === "user.signed_up" && event.payload.userId === userId)
      .map(([id]) => id);
    assert.ok(signupOutboxIds(legacyUserA.id).length > 0, "A signup outbox receipt not seeded");
    assert.ok(signupOutboxIds(legacyUserB.id).length > 0, "B signup outbox receipt not seeded");
    storage.mutate(state => {
      state.securityControl ??= {
        globalEpoch: 0, tenantEpochs: {}, userEpochs: {}, suspendedUsers: {}, sessions: {},
      };
      state.securityControl.userEpochs[legacyUserA.id] = 2;
      state.securityControl.userEpochs[legacyUserB.id] = 3;
      state.securityControl.suspendedUsers[legacyUserA.id] = { reason: "legacy-a", at: Date.now(), actor: "test" };
      state.securityControl.suspendedUsers[legacyUserB.id] = { reason: "legacy-b", at: Date.now(), actor: "test" };
      state.securityControl.sessions["sid-funnel-a"] = {
        sid: "sid-funnel-a", userId: legacyUserA.id, role: "lead", issuedAt: Date.now(), issuedVia: "legacy-test",
      };
      state.securityControl.sessions["sid-funnel-b"] = {
        sid: "sid-funnel-b", userId: legacyUserB.id, role: "lead", issuedAt: Date.now(), issuedVia: "legacy-test",
      };
    });

    const result = await erasure.eraseClientCompletely({
      agencyId: agency.id, clientId: clientA.id, actorUserId: "ed",
    });

    assert.equal(result?.completed, true);
    assert.equal(await store.get(keyA), undefined, "A exact capture survived");
    assert.ok(await store.get(keyB), "B exact capture was collateral damage");
    assert.ok(await store.get(`captures/by-id/${captureLegacy.capture.id}`), "legacy capture was collateral damage");
    assert.deepEqual(await store.get("captures/index"), [captureB.capture.id, captureLegacy.capture.id]);
    assert.equal(await store.get(`captures/by-email/${EMAIL_A.toLowerCase()}`), undefined, "A legacy email index survived");
    assert.ok(await store.get(`captures/by-email/${EMAIL_B.toLowerCase()}`), "B email index was removed");
    assert.ok(await store.get(`captures/by-email/${EMAIL_LEGACY.toLowerCase()}`), "legacy email index was removed");
    assert.equal(Object.values(storage.getState().users).some(user => user.id === legacyUserA.id), false,
      "A generated lead identity survived exact capture erasure");
    assert.ok(Object.values(storage.getState().users).some(user => user.id === legacyUserB.id),
      "B generated lead identity was collateral damage");
    assert.ok(Object.values(storage.getState().users).some(user => user.id === legacyUserUnscoped.id),
      "legacy generated lead identity was collateral damage");
    const control = storage.getState().securityControl!;
    assert.equal(Object.prototype.hasOwnProperty.call(control.userEpochs, legacyUserA.id), false,
      "A user security epoch survived");
    assert.equal(Object.prototype.hasOwnProperty.call(control.suspendedUsers, legacyUserA.id), false,
      "A user suspension survived");
    assert.equal(control.sessions["sid-funnel-a"], undefined, "A legacy session registry row survived");
    assert.equal(signupOutboxIds(legacyUserA.id).length, 0, "A signup outbox receipt survived");
    assert.equal(control.userEpochs[legacyUserB.id], 3, "B user security epoch was collateral damage");
    assert.ok(control.suspendedUsers[legacyUserB.id], "B user suspension was collateral damage");
    assert.ok(control.sessions["sid-funnel-b"], "B legacy session registry row was collateral damage");
    assert.ok(signupOutboxIds(legacyUserB.id).length > 0, "B signup outbox receipt was collateral damage");
    assert.equal(storage.getState().activity.some(entry =>
      entry.agencyId === agency.id && (entry.metadata as { captureId?: string } | undefined)?.captureId === captureA.capture.id), false,
    "A exact capture activity survived");
    assert.ok(result!.reviewRequired.some(item =>
      item.system === "public-funnel" && item.reason === "legacy-unscoped" && item.records === 2),
    "legacy capture and its generated identity were not both surfaced for review");

    const registry = await import("../src/built-ins/runtime/_registry");
    const runtime = await import("../src/built-ins/runtime/_runtime");
    const manifest = registry.getPlugin("public-funnel");
    const installed = storage.getState().pluginInstalls[install.id];
    assert.ok(installed && manifest?.onEraseClient, "public-funnel erasure hook must exist");
    const retrySubject = {
      emails: [], phones: [],
      exactOwnership: {
        agencyId: agency.id,
        clientId: clientA.id,
        personId: personA.id,
        personShared: false,
      },
      identityEvidence: {
        emails: [EMAIL_A, EMAIL_LEGACY], phones: [], sharedEmails: [], sharedPhones: [],
      },
      reviewRequired: [], metadata: {},
    };
    await manifest!.onEraseClient!(runtime.makeCtx(installed!), clientA.id, retrySubject);
    await manifest!.onEraseClient!(runtime.makeCtx(installed!), clientA.id, retrySubject);
    assert.equal(await store.get(keyA), undefined, "funnel hook retry revived A");
    assert.ok(await store.get(keyB), "funnel hook retry erased B");
    assert.ok(await store.get(`captures/by-id/${captureLegacy.capture.id}`),
      "funnel hook retry erased legacy review evidence");
  });

  it("public-funnel: identical completion ids in two agencies do not cross-delete activity", async () => {
    const suffix = process.hrtime.bigint();
    const completionId = `cross_agency_${suffix}`;
    const agencyA = tenants.createAgency({ name: "Funnel Collision A", slug: `funnel-collision-a-${suffix}` });
    const agencyB = tenants.createAgency({ name: "Funnel Collision B", slug: `funnel-collision-b-${suffix}` });
    const installA = pluginInstalls.upsertInstall({
      scope: { agencyId: agencyA.id }, pluginId: "public-funnel", installedBy: "ed",
    } as never);
    const installB = pluginInstalls.upsertInstall({
      scope: { agencyId: agencyB.id }, pluginId: "public-funnel", installedBy: "ed",
    } as never);
    const storeA = pluginStorage.makePluginStorage(installA.id);
    const storeB = pluginStorage.makePluginStorage(installB.id);
    const funnelA = funnel.containerFor({ agencyId: agencyA.id as never, install: installA as never, storage: storeA as never });
    const funnelB = funnel.containerFor({ agencyId: agencyB.id as never, install: installB as never, storage: storeB as never });
    const captureA = await funnelA.funnel.captureHcCompletion({
      email: `collision-a-${suffix}@example.com`, completionId, slot: { slot: 1 },
    } as never);
    const captureB = await funnelB.funnel.captureHcCompletion({
      email: `collision-b-${suffix}@example.com`, completionId, slot: { slot: 2 },
    } as never);
    assert.equal(captureA.capture.id, captureB.capture.id, "setup did not reproduce the cross-agency id collision");
    const clientA = tenants.createClient(agencyA.id, {
      name: "Collision Client A", ownerEmail: captureA.capture.email,
    } as never);
    const persons = await import("../src/server/persons");
    const personA = persons.upsertPerson(agencyA.id, {
      emails: [captureA.capture.email], facets: { clientIds: [clientA.id] },
    }).person;
    tenants.updateClient(agencyA.id, clientA.id, { personId: personA.id });
    const captureKey = `captures/by-id/${captureA.capture.id}`;
    await storeA.set(captureKey, {
      ...(await storeA.get(captureKey) as object), clientId: clientA.id, personId: personA.id,
    });

    await erasure.eraseClientCompletely({ agencyId: agencyA.id, clientId: clientA.id, actorUserId: "ed" });

    assert.ok(await storeB.get(captureKey), "agency B capture was deleted through a colliding completion id");
    assert.equal((await storeB.get<{ pendingLeadId?: string }>(captureKey))?.pendingLeadId, captureB.pendingLeadId,
      "agency B pending identity was altered through a colliding completion id");
    assert.ok(storage.getState().activity.some(entry =>
      entry.agencyId === agencyB.id
      && (entry.metadata as { captureId?: string } | undefined)?.captureId === captureB.capture.id),
    "agency B activity was deleted through a colliding completion id");
  });

  it("public-funnel: the real adapter preserves a lead user still owned by another capture", async () => {
    const suffix = process.hrtime.bigint();
    const agency = tenants.createAgency({ name: "Shared Funnel User", slug: `shared-funnel-user-${suffix}` });
    const install = pluginInstalls.upsertInstall({
      scope: { agencyId: agency.id }, pluginId: "public-funnel", installedBy: "ed",
    } as never);
    const store = pluginStorage.makePluginStorage(install.id);
    const c = funnel.containerFor({ agencyId: agency.id as never, install: install as never, storage: store as never });
    const captureA = await c.funnel.captureHcCompletion({
      email: `shared-user-a-${suffix}@example.com`, completionId: `shared_user_a_${suffix}`, slot: { slot: 1 },
    } as never);
    const captureB = await c.funnel.captureHcCompletion({
      email: `shared-user-b-${suffix}@example.com`, completionId: `shared_user_b_${suffix}`, slot: { slot: 2 },
    } as never);
    const clientA = tenants.createClient(agency.id, {
      name: "Shared Funnel Client A", ownerEmail: captureA.capture.email,
    } as never);
    const persons = await import("../src/server/persons");
    const personA = persons.upsertPerson(agency.id, {
      emails: [captureA.capture.email], facets: { clientIds: [clientA.id] },
    }).person;
    tenants.updateClient(agency.id, clientA.id, { personId: personA.id });
    const keyA = `captures/by-id/${captureA.capture.id}`;
    const keyB = `captures/by-id/${captureB.capture.id}`;
    const legacyUser = serverUsers.createUser({
      email: captureA.capture.email,
      password: "SharedLegacyCapture42!",
      role: "lead",
    });
    await store.set(keyA, {
      ...(await store.get(keyA) as object), clientId: clientA.id, personId: personA.id,
      leadUserId: legacyUser.id,
    });
    // Reproduce legacy/corrupt shared ownership that the real adapter must
    // preserve: B still references A's generated lead identity.
    await store.set(keyB, {
      ...(await store.get(keyB) as object), leadUserId: legacyUser.id,
    });

    const result = await erasure.eraseClientCompletely({
      agencyId: agency.id, clientId: clientA.id, actorUserId: "ed",
    });

    assert.equal(result?.completed, true);
    assert.equal(await store.get(keyA), undefined, "A exact capture survived");
    assert.equal((await store.get<{ leadUserId: string }>(keyB))?.leadUserId, legacyUser.id,
      "B's surviving shared-user capture was altered");
    assert.ok(Object.values(storage.getState().users).some(user => user.id === legacyUser.id),
      "real lead-user adapter deleted an identity still referenced by capture B");
    assert.ok(result!.reviewRequired.some(item =>
      item.system === "public-funnel" && item.reason === "shared-identity" && item.records >= 1),
    "preserved shared lead user was not surfaced for review");
  });

  it("public-funnel: a corrupt capture cannot delete a different generated lead user", async () => {
    const suffix = process.hrtime.bigint();
    const realIdentityEmail = `real-generated-${suffix}@example.com`;
    const corruptCaptureEmail = `corrupt-capture-${suffix}@example.com`;
    const realIdentity = serverUsers.createUser({
      email: realIdentityEmail,
      password: "CorruptLegacyCapture42!",
      role: "lead",
    });
    const agency = tenants.createAgency({ name: "Corrupt Funnel Co", slug: `corrupt-funnel-${suffix}` });
    const install = pluginInstalls.upsertInstall({
      scope: { agencyId: agency.id }, pluginId: "public-funnel", installedBy: "ed",
    } as never);
    const store = pluginStorage.makePluginStorage(install.id);
    const captureId = `lc_hc_corrupt_${suffix}`;
    const client = tenants.createClient(agency.id, {
      name: "Corrupt Capture Client", ownerEmail: corruptCaptureEmail,
    } as never);
    const persons = await import("../src/server/persons");
    const person = persons.upsertPerson(agency.id, {
      emails: [corruptCaptureEmail], facets: { clientIds: [client.id] },
    }).person;
    tenants.updateClient(agency.id, client.id, { personId: person.id });
    await store.set(`captures/by-id/${captureId}`, {
      id: captureId,
      source: "hc",
      leadUserId: realIdentity.id,
      email: corruptCaptureEmail,
      capturedAt: Date.now(),
      sourceMeta: {},
      clientId: client.id,
      personId: person.id,
    });

    const result = await erasure.eraseClientCompletely({
      agencyId: agency.id, clientId: client.id, actorUserId: "ed",
    });

    assert.equal(result?.completed, true);
    assert.equal(await store.get(`captures/by-id/${captureId}`), undefined, "exact corrupt capture survived");
    assert.ok(Object.values(storage.getState().users).some(user =>
      user.id === realIdentity.id && user.email === realIdentityEmail),
    "capture email mismatch deleted a different generated lead user");
    assert.ok(result!.reviewRequired.some(item =>
      item.system === "public-funnel" && item.reason === "shared-identity" && item.records >= 1),
    "preserved mismatched generated user was not surfaced for review");
  });

  it("agency-marketing: exact rows delete while unscoped leads remain review work", async () => {
    const EMAIL = `marketed-${process.hrtime.bigint()}@example.com`;
    const EXACT_EMAIL = `exact-marketed-${process.hrtime.bigint()}@example.com`;
    const PHONE = "+44 (0)20 7946 0555";
    const CAMPAIGN = `cmp_${process.hrtime.bigint()}`;
    const STAFF = `staff_${process.hrtime.bigint()}`;
    const agency = tenants.createAgency({ name: "Marketed Co", slug: `mkt-${process.hrtime.bigint()}` });
    const install = pluginInstalls.upsertInstall({ scope: { agencyId: agency.id }, pluginId: "agency-marketing", installedBy: "ed" } as never);
    const store = pluginStorage.makePluginStorage(install.id);
    const c = marketing.containerFor({ agencyId: agency.id as never, storage: store as never } as never);

    await c.leads.create({ email: EMAIL, name: "Legacy Marketed Person" } as never, "ed" as never);
    const phoneOnlyLegacy = await c.leads.create({
      email: `phone-only-${process.hrtime.bigint()}@example.com`,
      phone: "020 7946 0555 ext 123",
      name: "Legacy Switchboard Contact",
    } as never, "ed" as never);
    assert.ok(await c.leads.getByEmail(EMAIL), "the marketing lead must exist");

    const client = tenants.createClient(agency.id, {
      name: "Marketed Client", ownerEmail: EMAIL, metadata: { phone: PHONE },
    } as never);
    const exact = await c.leads.create({
      email: EXACT_EMAIL,
      name: "Exact Marketed Person",
      clientId: client.id,
      campaignId: CAMPAIGN,
      assignedStaffId: STAFF,
    } as never, "ed" as never);
    const result = await erasure.eraseClientCompletely({ agencyId: agency.id, clientId: client.id, actorUserId: "ed" });

    assert.ok(await c.leads.getByEmail(EMAIL), "legacy lead was erased by address");
    assert.ok(await c.leads.get(phoneOnlyLegacy.id), "phone-only legacy lead was erased by normalised telephone");
    assert.equal(await c.leads.getByEmail(EXACT_EMAIL), null, "exact client-stamped lead survived");
    const slice = (storage.getState().pluginData[install.id] ?? {}) as Record<string, unknown>;
    assert.equal(slice[`leads/by-id/${exact.id}`], undefined, "exact marketing row survived");
    assert.equal(slice[`leads/by-email/${EXACT_EMAIL.toLowerCase()}`], undefined, "exact email pointer survived");
    assert.ok(!((slice["leads/index"] as string[] | undefined) ?? []).includes(exact.id), "exact lead index membership survived");
    assert.ok(!((slice[`leads/by-campaign/${CAMPAIGN}`] as string[] | undefined) ?? []).includes(exact.id),
      "exact campaign index membership survived");
    assert.ok(!((slice[`leads/by-staff/${STAFF}`] as string[] | undefined) ?? []).includes(exact.id),
      "exact staff index membership survived");
    assert.deepEqual(result?.reviewRequired, [{
      system: "agency-marketing",
      reason: "legacy-unscoped",
      records: 2,
    }]);

    const registry = await import("../src/built-ins/runtime/_registry");
    const runtime = await import("../src/built-ins/runtime/_runtime");
    const manifest = registry.getPlugin("agency-marketing");
    const installed = storage.getState().pluginInstalls[install.id];
    assert.ok(installed && manifest?.onEraseClient, "marketing erasure hook must exist");
    const retrySubject = {
      emails: [], phones: [],
      exactOwnership: { agencyId: agency.id, clientId: client.id, personShared: true },
      identityEvidence: {
        emails: [EMAIL], phones: ["+442079460555"], sharedEmails: [], sharedPhones: [],
      },
      reviewRequired: [], metadata: {},
    };
    await manifest!.onEraseClient!(runtime.makeCtx(installed!), client.id, retrySubject);
    await manifest!.onEraseClient!(runtime.makeCtx(installed!), client.id, retrySubject);
    assert.equal(await store.get(`leads/by-id/${exact.id}`), undefined, "marketing retry revived the target");
    assert.ok(await store.get(`leads/by-id/${phoneOnlyLegacy.id}`), "marketing retry erased legacy phone evidence");
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
    tenants.updateClient(agency.id, client.id, { personId: person.id });
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

  it("unlinks but does not anonymise a reverse-only legacy Person facet", async () => {
    const EMAIL = `reverse-only-${process.hrtime.bigint()}@example.com`;
    const PHONE = "+447700901234";
    const agency = tenants.createAgency({ name: "Reverse Person Co", slug: `reverse-person-${process.hrtime.bigint()}` });
    const client = tenants.createClient(agency.id, { name: "Reverse-only Client", ownerEmail: EMAIL } as never);
    const { person } = persons.upsertPerson(agency.id, {
      emails: [EMAIL],
      phones: [PHONE],
      name: "Legacy Reverse Person",
      facets: { clientIds: [client.id] },
    });
    persons.updatePerson(agency.id, person.id, { notes: "Review before any identity deletion." });
    // Deliberately do not set Client.personId: one-way legacy lineage is not
    // destructive authority, though its exact client-id edge must not dangle.

    const result = await erasure.eraseClientCompletely({
      agencyId: agency.id, clientId: client.id, actorUserId: "ed",
    });

    const after = persons.getPerson(agency.id, person.id);
    assert.ok(after);
    assert.equal(persons.primaryEmail(after!), EMAIL);
    assert.equal(persons.primaryPhone(after!), PHONE);
    assert.equal(after!.name, "Legacy Reverse Person");
    assert.equal(after!.notes, "Review before any identity deletion.");
    assert.deepEqual(after!.facets.clientIds, [], "deleted Client id remained on the review-required Person");
    assert.ok(result?.reviewRequired.some(item =>
      item.system === "person-identity" && item.reason === "legacy-unscoped" && item.records === 1));
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
    tenants.updateClient(agency.id, erased.id, { personId: person.id });
    tenants.updateClient(agency.id, kept.id, { personId: person.id });

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
    tenants.updateClient(agency.id, client.id, { personId: person.id });

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
    tenants.updateClient(agency.id, client.id, { personId: person.id });
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
    const { person } = persons.upsertPerson(agency.id, {
      emails: [EMAIL], name: "Aud Person", facets: { clientIds: [client.id] },
    });
    tenants.updateClient(agency.id, client.id, { personId: person.id });

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

  it("erases exact lineage, preserves unscoped review records, and keeps finance", async () => {
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
    const funnelC = funnelPlugin.containerFor({ agencyId: A as never, install: funnelI as never, storage: store(funnelI.id) });
    const mktC = marketing.containerFor({ agencyId: A as never, storage: store(mktI.id) } as never);
    const ident = await mailC.identities.create({ name: "Agency", email: "hello@agency.test", isDefault: true } as never, "ed" as never);
    await mailC.identities.verifyDomain(ident.id, "ed" as never);

    // ── BEFORE they are a client: every pre-client surface ──
    await funnelC.funnel.captureHcCompletion({ email: EMAIL, slot: { slot: 3, answers: {} } } as never);
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
    const { person } = persons.upsertPerson(A, {
      emails: [EMAIL], phones: [PHONE], name: NAME,
      facets: { enquiryIds: ["enq_all"], clientIds: [client.id] },
    });
    tenants.updateClient(A, client.id, { personId: person.id });
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
      inbox_channel_connections: [{ id: "connection", agency_id: A }],
      inbox_conversations: [{ id: "cv", agency_id: A, connection_id: "connection", identity_id: "i", created_at: "2026-01-01", last_message_at: "2026-02-01" }],
      inbox_messages: [{ id: "m", agency_id: A, connection_id: "connection", conversation_id: "cv", body_text: `from ${EMAIL}` }],
      inbox_contact_identities: [{ id: "i", agency_id: A, connection_id: "connection", client_id: client.id, handle: EMAIL }],
      brand_enquiries: [{ id: "e", agency_id: A, name: NAME, email: EMAIL, message: "hi",
        metadata: { clientId: client.id, identityResolution: { status: "resolved", clientId: client.id } } }],
    };

    // ── ERASE ──
    const result = await erasure.eraseClientCompletely({
      agencyId: A, clientId: client.id, actorUserId: "ed", supabase: makeFakeSupabase(tables) as never,
    });
    assert.ok(result);

    // ── 1. exact ownership is erased; pre-client records are preserved ──
    const state = JSON.stringify(storage.getState());
    assert.equal(tenants.getClientForAgency(A, client.id), null, "client record survived");
    assert.ok(!state.includes(PHONE), "exact Person/Lead phone survived erasure");
    assert.equal((await funnelC.funnel.listByEmail(EMAIL)).length, 1, "pre-client capture was deleted by address");
    assert.ok(await mktC.leads.getByEmail(EMAIL), "pre-client marketing lead was deleted by address");
    assert.equal((await mailC.emails.list()).length, 1, "pre-client email was deleted by recipient address");
    for (const system of ["email-sender", "public-funnel", "agency-marketing"]) {
      const expectedRecords = 1;
      assert.ok(result!.reviewRequired.some(item => item.system === system && item.records === expectedRecords),
        `${system} did not surface its preserved record for review`);
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

  it("deleting client A preserves client B, legacy plugin rows, the funnel capture, and shared Person history", async () => {
    const SHARED_EMAIL = `shared-clients-${process.hrtime.bigint()}@example.com`;
    const SHARED_PHONE = "+44 20 7946 0555";
    const agency = tenants.createAgency({ name: "Shared ownership Co", slug: `shared-own-${process.hrtime.bigint()}` });
    const A = agency.id;
    const store = (id: string) => pluginStorage.makePluginStorage(id) as never;
    const install = (pluginId: string) => pluginInstalls.upsertInstall(
      { scope: { agencyId: A }, pluginId, installedBy: "ed" } as never);
    const mailI = install("email-sender");
    const funnelI = install("public-funnel");
    const marketingI = install("agency-marketing");
    const mailC = mail.containerFor({ agencyId: A as never, storage: store(mailI.id) } as never);
    const funnelC = funnelPlugin.containerFor({ agencyId: A as never, install: funnelI as never, storage: store(funnelI.id) });
    const marketingC = marketing.containerFor({ agencyId: A as never, storage: store(marketingI.id) } as never);

    const identity = await mailC.identities.create({
      name: "Shared Agency",
      email: `sender-${process.hrtime.bigint()}@agency.test`,
      isDefault: true,
    } as never, "ed" as never);
    await mailC.identities.verifyDomain(identity.id, "ed" as never);

    const clientA = tenants.createClient(A, { name: "Client A", ownerEmail: SHARED_EMAIL } as never);
    const clientB = tenants.createClient(A, { name: "Client B", ownerEmail: SHARED_EMAIL } as never);
    const { person } = persons.upsertPerson(A, {
      emails: [SHARED_EMAIL],
      phones: [SHARED_PHONE],
      name: "Shared Person",
      // Deliberately omit B from the reciprocal facet. Its authoritative
      // Client.personId pointer must still make this shared identity fail safe.
      facets: { clientIds: [clientA.id] },
    });
    tenants.updateClient(A, clientA.id, { personId: person.id });
    tenants.updateClient(A, clientB.id, { personId: person.id });
    const withHistory = persons.addPersonRecord(A, person.id, {
      kind: "meeting",
      summary: "Shared relationship review",
      body: "History belongs to the Person across both workspaces.",
      createdBy: "ed",
    });
    assert.equal(withHistory?.record?.length, 1);

    const exactAMessage = await mailC.emails.enqueue({
      to: SHARED_EMAIL,
      subject: "Client A exact",
      bodyText: "delete A",
      clientId: clientA.id,
      personId: person.id,
      externalRef: `shared-a:${clientA.id}`,
      triggeredByPlugin: "client-crm",
    } as never, "ed" as never);
    const exactBMessage = await mailC.emails.enqueue({
      to: SHARED_EMAIL,
      subject: "Client B exact",
      bodyText: "keep B",
      clientId: clientB.id,
      personId: person.id,
      externalRef: `shared-b:${clientB.id}`,
      triggeredByPlugin: "client-crm",
    } as never, "ed" as never);
    const legacyMessage = await mailC.emails.enqueue({
      to: SHARED_EMAIL,
      subject: "Legacy shared recipient",
      bodyText: "review only",
      externalRef: `shared-legacy:${process.hrtime.bigint()}`,
      triggeredByPlugin: "leads-pipeline",
    } as never, "ed" as never);

    const exactAMarketing = await marketingC.leads.create({
      email: `client-a-${process.hrtime.bigint()}@example.com`,
      name: "Client A campaign row",
      clientId: clientA.id,
      personId: person.id,
    } as never, "ed" as never);
    const exactBMarketing = await marketingC.leads.create({
      email: `client-b-${process.hrtime.bigint()}@example.com`,
      name: "Client B campaign row",
      clientId: clientB.id,
      personId: person.id,
    } as never, "ed" as never);
    const legacyMarketing = await marketingC.leads.create({
      email: SHARED_EMAIL,
      name: "Legacy shared campaign row",
    } as never, "ed" as never);
    const capture = await funnelC.funnel.captureHcCompletion({
      email: SHARED_EMAIL,
      slot: { slot: 3, answers: {} },
      completionId: `shared_${process.hrtime.bigint()}`,
    } as never);

    const result = await erasure.eraseClientCompletely({
      agencyId: A,
      clientId: clientA.id,
      actorUserId: "ed",
    });
    assert.equal(result?.completed, true);

    const messages = await mailC.emails.list();
    assert.ok(!messages.some(message => message.id === exactAMessage.id), "client A message survived");
    assert.ok(messages.some(message => message.id === exactBMessage.id), "client B message was collateral damage");
    assert.ok(messages.some(message => message.id === legacyMessage.id), "unscoped message was erased by address");
    assert.equal(await marketingC.leads.get(exactAMarketing.id), null, "client A marketing row survived");
    assert.ok(await marketingC.leads.get(exactBMarketing.id), "client B marketing row was collateral damage");
    assert.ok(await marketingC.leads.get(legacyMarketing.id), "unscoped marketing row was erased by address");
    assert.ok((await funnelC.funnel.list()).some(row => row.id === capture.capture.id),
      "pre-client funnel capture was erased by address");

    const preservedPerson = persons.getPerson(A, person.id);
    assert.ok(preservedPerson, "shared Person was removed");
    assert.deepEqual(preservedPerson!.facets.clientIds, [clientB.id]);
    assert.equal(persons.primaryEmail(preservedPerson!), SHARED_EMAIL);
    assert.equal(persons.primaryPhone(preservedPerson!), "+442079460555",
      "shared Person phone was stripped as collateral damage");
    assert.equal(preservedPerson!.record?.[0]?.body, "History belongs to the Person across both workspaces.");
    assert.ok(tenants.getClientForAgency(A, clientB.id), "client B was removed");

    for (const system of ["agency-marketing", "email-sender", "public-funnel"]) {
      assert.ok(result!.reviewRequired.some(item => item.system === system && item.reason === "shared-identity"),
        `${system} did not surface shared review work`);
    }
    assert.ok(!JSON.stringify(result!.reviewRequired).includes(SHARED_EMAIL), "review output leaked the shared email");
    assert.ok(!JSON.stringify(result!.reviewRequired).includes(SHARED_PHONE), "review output leaked the shared phone");
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

describe("erasure covers client form notices", () => {
  // A GDPR check on data added on 2026-08-28. Client-form notices are pointers
  // to enquiries living in a CLIENT's own Supabase — an id, a timestamp, a seen
  // flag. They hold no customer PII by design, but they do record that a named
  // client received enquiries and when, which is client data and must not
  // outlive the client.
  //
  // Nothing was written to make this work: `clientFormNotices` simply is not in
  // RETAIN_COLLECTIONS, PLUGIN_COLLECTIONS or DEDICATED_COLLECTIONS, so the
  // generic `pruneClientId` pass reaches it. That is exactly why it deserves a
  // test — the guarantee is currently an ABSENCE from three lists, and an
  // absence is the easiest thing in the world to reverse by accident.
  it("removes a client's notices when that client is erased", async () => {
    const notices = await import("../src/lib/server/clientForms/clientFormNotices");

    const agency = tenants.createAgency({ name: "Erase Notices", slug: `en-${Math.floor(performance.now())}` });
    const doomed = tenants.createClient(agency.id, { name: "Doomed" });
    const survivor = tenants.createClient(agency.id, { name: "Survivor" });

    notices.recordClientFormNotice({
      agencyId: agency.id, clientId: doomed.id, connectionId: "conn_d", table: "form_submissions", rowId: "d1",
    });
    notices.recordClientFormNotice({
      agencyId: agency.id, clientId: doomed.id, connectionId: "conn_d", table: "form_submissions", rowId: "d2",
    });
    const kept = notices.recordClientFormNotice({
      agencyId: agency.id, clientId: survivor.id, connectionId: "conn_s", table: "form_submissions", rowId: "s1",
    });

    assert.equal(notices.listClientFormNotices(agency.id, doomed.id).length, 2, "seed must actually land");

    const result = await erasure.eraseClientCompletely({
      agencyId: agency.id,
      clientId: doomed.id,
      actorUserId: "user_test",
    });
    assert.ok(result?.completed, "the erasure must complete");

    // The point of the test.
    assert.equal(
      notices.listClientFormNotices(agency.id, doomed.id).length,
      0,
      "erasing a client must not leave their enquiry notices behind",
    );

    // Read the store directly too: `listClientFormNotices` filters by client, so
    // on its own it would report zero even if the rows were merely orphaned.
    const remaining = Object.values(storage.getState().clientFormNotices ?? {}) as Array<{ clientId?: string }>;
    assert.equal(
      remaining.some(notice => notice.clientId === doomed.id),
      false,
      "no notice may survive with the erased client's id on it",
    );

    // And erasure must be surgical: the other client is untouched.
    assert.equal(notices.listClientFormNotices(agency.id, survivor.id).length, 1, "another client's notices must survive");
    assert.equal(notices.listClientFormNotices(agency.id, survivor.id)[0]?.id, kept.id);
  });
});

describe("what survives an erasure is genuinely de-identified", () => {
  // The RETAIN set's whole justification, in `clientErasure.ts`:
  //
  //   "Excluded from the erasure sweep — the client record's own PII still
  //    goes, so what remains is de-identified."
  //
  // That is true of the IDENTIFIERS. It is not automatically true of FREE TEXT.
  // `ClientMilestone` carries `title` and `description?`, both operator-typed,
  // and a milestone called "Onboarding call with Jane Smith" survives erasure
  // as a row nobody can find again — the client record that would have led you
  // to it is gone.
  //
  // This is the same rule the codebase already learned for activity messages
  // ("Never put PII in an activity message — the erasure sweep is keyed by
  // clientId"), applied to a collection that never had it written down.
  //
  // ── What this test does and does not do ──────────────────────────────
  //
  // It cannot scrub free text; deciding what delivery proof must survive is a
  // legal question (Q1 in the DPO pack). What it CAN do is make the retain set
  // a reviewed list rather than an incidental one, so adding a collection to it
  // is a deliberate act taken against this concern.

  it("retains exactly the collections that have been reviewed for it", async () => {
    const source = readFileSync("src/server/clientErasure.ts", "utf8");
    const match = /const RETAIN_COLLECTIONS = new Set<string>\(\[([^\]]*)\]\)/.exec(source);
    assert.ok(match, "RETAIN_COLLECTIONS must still be a literal set for this to mean anything");
    const retained = [...match[1].matchAll(/"([a-zA-Z]+)"/g)].map(entry => entry[1]).sort();

    assert.deepEqual(
      retained,
      ["clientMilestones"],
      "A collection was added to or removed from RETAIN_COLLECTIONS. Retained data survives erasure, "
      + "so before changing this list: does the collection carry operator-typed free text that could "
      + "name a person? If so, the 'what remains is de-identified' justification does not hold for it.",
    );
  });

  it("names the free-text risk where somebody changing it will read it", () => {
    // A finding recorded only in a plan document is a finding that gets lost.
    const source = readFileSync("src/server/clientErasure.ts", "utf8");
    assert.match(
      source,
      /free text|free-text/i,
      "clientErasure.ts must say, next to RETAIN_COLLECTIONS, that de-identification covers identifiers "
      + "and not operator-typed prose",
    );
  });
});

describe("the customer portal's activity feed cannot leak internal wording", () => {
  // The portal ships an `activity` list to the client. Every entry goes through
  // `customerActivityMessage`, which is an ALLOWLIST — it matches known actions
  // and `return undefined` for everything else, so an action nobody has
  // considered is dropped rather than shown. That is the right shape, and it is
  // why the actions added on 2026-08-28 (`subject_access.exported`,
  // `retention.policy_set`) cannot reach a client.
  //
  // ── The one exception, and why it needs a guard ──────────────────────
  //
  // One line breaks the allowlist:
  //
  //     if (item.action.startsWith("product_workspace.")) return item.message;
  //
  // It passes the RAW stored message straight to the client. That is safe today
  // only because the single writer of those actions builds its message with
  // `customerMessage(...)` — text authored for the customer at write time.
  //
  // Nothing enforces that. A second writer, or a change to the existing one,
  // would put internal wording in front of a client with no code change to the
  // portal at all. These two assertions are what stands between the convention
  // and a leak.

  it("the portal passes product_workspace messages through verbatim", () => {
    const portal = readFileSync("src/app/portal/customer/_portalData.ts", "utf8");
    assert.match(
      portal,
      /item\.action\.startsWith\("product_workspace\."\)\) return item\.message;/,
      "if this passthrough is removed the guard below is no longer needed — delete it too",
    );
    // Everything else must still fall through to "show nothing".
    assert.match(portal, /\n\s*return undefined;\n}/, "unknown actions must be dropped, never passed through");
  });

  it("so every writer of those actions must author customer-facing text", () => {
    const writers = execSync(
      'grep -rln "product_workspace\\." src/app src/server src/lib || true',
      { encoding: "utf8" },
    ).split("\n").filter(Boolean).filter(file => !file.includes("_portalData.ts"));

    assert.deepEqual(
      writers,
      ["src/app/api/tenants/product-workspaces/route.ts"],
      "A new writer of product_workspace.* activity appeared. The customer portal shows those messages "
      + "VERBATIM, so it must build its message with customer-facing wording — check it, then add it here.",
    );

    const writer = readFileSync(writers[0], "utf8");
    assert.match(
      writer,
      /message: customerMessage\(action, workspace\.productName\)/,
      "the message must come from customerMessage(), which is written for the client to read",
    );
  });
});

describe("internal call notes never reach the customer portal", () => {
  // Found in the 2026-08-28 GDPR pass, and it is the sharpest kind of bug:
  // the SAME data classified two different ways by two paths over it.
  //
  //   `websiteEnquiries.ts` builds a record-ledger entry per enquiry call whose
  //   body is `[outcome, call.notes, recording]` and marks it
  //   `visibility: "internal"`.
  //
  //   `_portalData.ts` built its OWN entry from the same `enquiry.calls`, put
  //   `call.notes` in the body, and spread it into `recordEntries` — AFTER the
  //   `.filter(entry => entry.visibility === "client")` applied to the other
  //   source. So the gate existed, and this list walked around it.
  //
  // The tell was already in the code: the recording URL on the very next line
  // is gated on `consentConfirmed`. Somebody thought hard about the recording
  // and not about the notes beside it.

  it("the portal's call entries carry duration, never notes", () => {
    const portal = readFileSync("src/app/portal/customer/_portalData.ts", "utf8");
    const block = /const enquiryCallEntries[\s\S]*?\}\)\)\);/.exec(portal);
    assert.ok(block, "enquiryCallEntries must still exist for this guard to mean anything");

    assert.doesNotMatch(block[0], /call\.notes/, "call notes are internal — they must not reach a client's screen");
    assert.match(block[0], /call\.durationSeconds/, "keeping that the call happened is the point");
    // The consent gate on the recording must survive too.
    assert.match(block[0], /call\.recording\?\.consentConfirmed \? call\.recording\.url : undefined/,
      "a recording may only be linked where consent was confirmed");
  });

  it("the ledger still classifies those same calls as internal", () => {
    // If this classification ever changes to "client", the portal decision
    // above should be revisited rather than silently diverging again.
    const ledger = readFileSync("src/lib/server/websiteEnquiries.ts", "utf8");
    const callEntry = /sourceType: "call" as const[\s\S]*?visibility: "(\w+)" as const/.exec(ledger);
    assert.ok(callEntry, "the ledger must still build a call entry with a visibility");
    assert.equal(
      callEntry[1],
      "internal",
      "enquiry call entries are classified internal; if that changed, revisit what the customer portal shows",
    );
  });
});

describe("the customer portal builds its payload field by field", () => {
  // The invariant that makes `requests`, `approvals`, `files`, `invoices` and
  // `contracts` safe — and whose absence made `enquiryCallEntries` unsafe.
  //
  // `ClientRequest` carries no internal-only field today, so copying it whole
  // would leak nothing. But `_portalData.ts` maps it property by property
  // anyway, which means the day somebody adds `internalNote?: string` to that
  // type, the portal does NOT start showing it. The explicit mapping IS the
  // protection; a spread would silently opt every future field in.
  //
  // Checked 2026-08-28: no source record is spread into a customer-facing
  // object anywhere in the file. The one `...` present spreads an array of
  // ALREADY-MAPPED replies, which is a different thing.

  it("never spreads a source record into the customer payload", () => {
    const portal = readFileSync("src/app/portal/customer/_portalData.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    // Sources that come from stored state. Spreading one of these into an
    // object literal hands the client every field it happens to carry.
    const sources = "meta|client|entry|request|approval|file|invoice|contract|call|enquiry|reply|plan|message";
    const offenders: string[] = [];
    for (const match of portal.matchAll(new RegExp(`\\.\\.\\.(${sources})\\b([^\\n]*)`, "g"))) {
      const rest = match[2] ?? "";
      // `...enquiry.replies.map(...)` spreads a mapped ARRAY — allowed.
      if (/^\s*\.\w+/.test(rest) && /\.(map|filter|flatMap|slice|concat)\s*\(/.test(rest)) continue;
      offenders.push(`...${match[1]}${rest.slice(0, 60)}`);
    }

    assert.deepEqual(
      offenders,
      [],
      "A stored record is being spread into the customer payload. Map its fields by hand instead — "
      + "a spread opts in every field the type gains later, which is how internal data reaches a client "
      + "without anyone editing this file:\n  " + offenders.join("\n  "),
    );
  });

  it("still maps the collections it is supposed to", () => {
    // Guards the guard: if the file were renamed or gutted, the check above
    // would pass over an empty string and prove nothing.
    const portal = readFileSync("src/app/portal/customer/_portalData.ts", "utf8");
    for (const name of ["safeFiles", "safeRequests", "safeApprovals", "safeInvoices", "safeContracts"]) {
      assert.match(portal, new RegExp(`const ${name}`), `${name} must still be built here`);
    }
    // And the visibility gate on files, which is the one collection with a flag.
    assert.match(portal, /file\.customerVisible === true/, "files must stay gated on their visibility flag");
  });
});

describe("data-compliance check: demo-seeded PII against the erasure surface", () => {
  // ── Why this block exists ───────────────────────────────────────────────
  //
  // Everything above proves erasure works on a client a test just made up.
  // Nobody had ever asked the other question: what about the PII this codebase
  // seeds *itself* — the demo tenant Ed shows people, and the sample data the
  // website editor ships as block defaults? That check was run for the first
  // time on 2026-08-31 and it has two halves that answer differently.
  //
  //   • STATE is clean. A tenant seeded by the REAL `seedDemoAgency()` — not a
  //     hand-built lookalike, which would only prove the fixture is erasable —
  //     is offered by the Governance workspace's erasure list and is genuinely
  //     swept: client record, the account carrying the demo email, activity.
  //
  //   • SOURCE is not. A real person (Ed's client Felicia of Luv & Ker) is
  //     hardcoded as a runtime default in six files. Erasure operates on
  //     state, so it removes the row and the next seed puts the person back.
  //     One of the six is not demo data at all: `api/tenants/seed` defaults
  //     its client-owner to `felicia@luvandker.com` — the REAL address.
  //
  // Replacing the persona is Ed's call (his demo branding, and it re-pins
  // several website-editor tests), so this block does not change it. What it
  // does is make the gap impossible to lose: the limit must be stated where a
  // machine reads it (the semantic registry) and where a human reads it (the
  // hazards register), and an EIGHTH hardcoded persona fails the sweep.
  //
  // This describe runs last in the file on purpose — it erases the demo tenant.

  let demoSeed: typeof import("../src/lib/server/seeds/demoSeed");
  let governance: typeof import("../src/app/portal/agency/governance/_governanceData");
  let users: typeof import("../src/server/users");
  let demoAgencyId: string;
  let demoClientId: string;

  before(async () => {
    demoSeed = await import("../src/lib/server/seeds/demoSeed");
    governance = await import("../src/app/portal/agency/governance/_governanceData");
    users = await import("../src/server/users");
    const seeded = await demoSeed.seedDemoAgency("compliance-audit");
    demoAgencyId = seeded.agency.id;
    demoClientId = seeded.client.id;
  });

  it("offers the demo tenant's client to the governance erasure surface", async () => {
    // If demo PII were not on this list, the erasure tool could not be pointed
    // at it at all and the "we can erase on request" claim would have a hole.
    const snapshot = await governance.buildGovernanceSnapshot({ agencyId: demoAgencyId });
    const row = snapshot.erasureClients.find(client => client.id === demoClientId);
    assert.ok(
      row,
      "the demo-seeded client is not offered by the Governance erasure list — demo PII would be unerasable "
      + "through the product's own surface",
    );
    assert.equal(row!.name, demoSeed.DEMO_CLIENT_NAME);
  });

  it("erases the demo persona out of state — record, account and activity", async () => {
    activity.logActivity({
      agencyId: demoAgencyId, clientId: demoClientId, category: "tenant",
      action: "demo.audit_probe", message: "seeded activity for the compliance audit",
    });
    assert.ok(users.getUser(demoSeed.DEMO_CLIENT_EMAIL), "precondition: the demo client-owner account exists");

    const result = await erasure.eraseClientCompletely({
      agencyId: demoAgencyId, clientId: demoClientId, actorUserId: "compliance-audit",
    });
    assert.ok(result, "erasure refused the demo client");
    assert.equal(result!.completed, true);

    assert.equal(tenants.getClientForAgency(demoAgencyId, demoClientId), null, "the demo client record survived");
    assert.equal(
      users.getUser(demoSeed.DEMO_CLIENT_EMAIL),
      null,
      `the account carrying ${demoSeed.DEMO_CLIENT_EMAIL} survived the erasure — a demo tenant is not exempt`,
    );
    assert.equal(
      storage.getState().activity.some(entry => entry.clientId === demoClientId),
      false,
      "activity stamped with the erased demo client survived",
    );
  });

  it("cannot reach the persona compiled into source — and the semantic registry says so", () => {
    // The erasure above committed. The person is still in the codebase, so the
    // very next `seedDemoAgency()` restores them. That is not a bug erasure can
    // fix — it is a limit of erasing STATE — but a limit nobody wrote down is
    // indistinguishable from an over-claim, and `semanticRegistry.ts` was
    // over-claiming: "clientErasure.ts sweeps the client's PII" full stop.
    const seedSource = readFileSync("src/lib/server/seeds/demoSeed.ts", "utf8");
    assert.match(
      seedSource,
      /DEMO_CLIENT_EMAIL = "felicia@luvandker\.demo"/,
      "the demo persona is expected to STILL be a source constant after an erasure — if it is gone, this "
      + "audit's finding has been fixed and this block plus the hazards entry should be retired together",
    );

    const registry = readFileSync("src/lib/data/semanticRegistry.ts", "utf8");
    const client = registry.slice(registry.indexOf('id: "client",'));
    const retention = /retention:\s*((?:"[^"]*"\s*\+?\s*)+)/.exec(client);
    assert.ok(retention, "the client entity must still declare a retention rule");
    assert.match(
      retention![1],
      /source constant|codebase|next seed|re-?seed/i,
      "semanticRegistry's `client` retention says erasure sweeps the client's PII. That is true of state and "
      + "NOT of the persona hardcoded in demoSeed.ts / api/tenants/seed / the website-editor block defaults, "
      + "which a re-seed restores. The retention line must name that limit rather than imply the person is gone.",
    );
  });

  it("declares every source file that hardcodes the real persona as a runtime default", () => {
    // The sweep, and what it deliberately ignores: a comment mentioning the
    // client is context for the next reader, and a form `placeholder` is
    // example text a user overwrites. Neither is stored, seeded or rendered as
    // somebody's data. What is left is the persona used as a real VALUE.
    const PERSONA = /Felicia|Luv\s*&\s*Ker|luvandker|Ghanaian/;
    const sourceFiles = execSync(
      String.raw`find src \( -name '*.ts' -o -name '*.tsx' \) | sort`,
      { encoding: "utf8" },
    ).split("\n").filter(Boolean)
      .filter(file => !/__smoke__|__tests__|\.test\./.test(file));

    const offenders = sourceFiles.filter(file =>
      readFileSync(file, "utf8").split("\n").some(raw => {
        const trimmed = raw.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return false;
        // Strip a trailing line comment. `\s//` cannot match inside `https://`.
        const code = raw.replace(/(^|\s)\/\/.*$/, "$1");
        if (/placeholder/i.test(code)) return false;
        return PERSONA.test(code);
      }),
    );

    const hazards = readFileSync("docs/workspace/hazards-and-duplication.md", "utf8");
    const undeclared = offenders.filter(file => !hazards.includes(file));

    assert.deepEqual(
      undeclared,
      [],
      "A source file hardcodes a real person's identity (Felicia / Luv & Ker) as a runtime default and is not "
      + "declared in docs/workspace/hazards-and-duplication.md. Client erasure sweeps STATE, so it can never "
      + "reach this — a re-seed restores the person. Either use a synthetic persona, or add the file to the "
      + "hazards table with what it holds and why it has to be a real person:\n  " + undeclared.join("\n  "),
    );

    // Guards the guard: a sweep that finds nothing would pass silently if the
    // persona were renamed, and the audit would quietly stop being performed.
    assert.ok(
      offenders.length >= 6,
      `the persona sweep found only ${offenders.length} files; it found 6 after the obsolete portal wizard was retired on `
      + "2026-09-01. If the persona was genuinely replaced further, retire this block and the hazards entry together "
      + "rather than leaving a sweep that cannot fail.",
    );
  });
});
