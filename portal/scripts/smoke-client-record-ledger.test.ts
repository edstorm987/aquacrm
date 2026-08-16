import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

process.env.PORTAL_BACKEND = "memory";

const read = (path: string) => readFileSync(path, "utf8");

test("client record ledger uses stable keyset cursors without crossing tenant boundaries", async () => {
  const { ensureHydrated } = await import("../src/server/storage");
  const { queryClientRecordLedger, synchroniseClientRecordLedger } = await import("../src/lib/server/clientRecordLedger");
  await ensureHydrated();
  const agencyId = "agency-ledger-cursor";
  const clientId = "client-ledger-cursor";
  const base = Date.UTC(2026, 0, 1);
  synchroniseClientRecordLedger({
    agencyId,
    clientId,
    events: Array.from({ length: 61 }, (_, index) => ({
      sourceType: "activity" as const,
      sourceId: `activity-${String(index).padStart(3, "0")}`,
      group: "activity" as const,
      title: `Activity ${index}`,
      occurredAt: base + index,
      eyebrow: "Operations",
      visibility: "internal" as const,
    })),
  });
  synchroniseClientRecordLedger({
    agencyId: "another-agency",
    clientId,
    events: [{ sourceType: "activity", sourceId: "private", group: "activity", title: "Other tenant", occurredAt: base + 999, eyebrow: "Private", visibility: "internal" }],
  });

  const first = queryClientRecordLedger({ agencyId, clientId, limit: 25 });
  assert.equal(first.events.length, 25);
  assert.equal(first.total, 61);
  assert.equal(first.hasMore, true);
  assert.ok(first.nextCursor);

  synchroniseClientRecordLedger({
    agencyId,
    clientId,
    events: [{ sourceType: "activity", sourceId: "new-arrival", group: "activity", title: "Arrived during pagination", occurredAt: base + 10_000, eyebrow: "Operations", visibility: "internal" }],
  });
  const second = queryClientRecordLedger({ agencyId, clientId, limit: 25, cursor: first.nextCursor });
  assert.equal(second.events.length, 25);
  assert.equal(new Set([...first.events, ...second.events].map(event => event.id)).size, 50);
  assert.equal(second.events.some(event => event.sourceId === "new-arrival"), false);
  assert.equal(second.events.some(event => event.title === "Other tenant"), false);
});

test("ledger pagination retains every event when several records share a timestamp", async () => {
  const { queryClientRecordLedger, synchroniseClientRecordLedger } = await import("../src/lib/server/clientRecordLedger");
  const agencyId = "agency-ledger-tied-cursor";
  const clientId = "client-ledger-tied-cursor";
  const occurredAt = Date.UTC(2026, 7, 16, 12);
  synchroniseClientRecordLedger({
    agencyId,
    clientId,
    events: Array.from({ length: 17 }, (_, index) => ({
      sourceType: "message" as const,
      sourceId: `tied-message-${String(index).padStart(2, "0")}`,
      group: "messages" as const,
      title: `Tied message ${index}`,
      occurredAt,
      eyebrow: "Inbox",
      visibility: "inherent" as const,
    })),
  });

  for (const sort of ["newest", "oldest"] as const) {
    const retainedIds: string[] = [];
    let cursor: string | undefined;
    do {
      const page = queryClientRecordLedger({ agencyId, clientId, limit: 5, cursor, sort });
      retainedIds.push(...page.events.map(event => event.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(retainedIds.length, 17);
    assert.equal(new Set(retainedIds).size, 17);
  }
});

test("linked evidence can be queried independently of the surrounding client timeline", async () => {
  const { queryClientRecordLedger, synchroniseClientRecordLedger } = await import("../src/lib/server/clientRecordLedger");
  const agencyId = "agency-ledger-evidence";
  const clientId = "client-ledger-evidence";
  const occurredAt = Date.UTC(2026, 7, 16, 13);
  synchroniseClientRecordLedger({
    agencyId,
    clientId,
    events: [
      { sourceType: "file", sourceId: "file-a", parentSourceId: "record-a", group: "files", title: "Call recording", occurredAt, eyebrow: "Recording", visibility: "internal" },
      { sourceType: "file", sourceId: "file-b", parentSourceId: "record-b", group: "files", title: "Other brief", occurredAt, eyebrow: "Brief", visibility: "client" },
      { sourceType: "record-entry", sourceId: "record-a", group: "calls", title: "Discovery call", occurredAt, eyebrow: "Call", visibility: "internal" },
    ],
  });

  const page = queryClientRecordLedger({ agencyId, clientId, parentSourceId: "record-a" });
  assert.equal(page.total, 1);
  assert.equal(page.events[0]?.sourceId, "file-a");
});

test("complete ledger sources reconcile deletions while append-only connectors retain history", async () => {
  const { queryClientRecordLedger, synchroniseClientRecordLedger } = await import("../src/lib/server/clientRecordLedger");
  const agencyId = "agency-ledger-reconcile";
  const clientId = "client-ledger-reconcile";
  const manual = (sourceId: string) => ({
    sourceType: "record-entry" as const,
    sourceId,
    group: "notes" as const,
    title: sourceId,
    occurredAt: Date.UTC(2026, 1, 1),
    eyebrow: "Note",
    visibility: "internal" as const,
  });
  synchroniseClientRecordLedger({ agencyId, clientId, events: [manual("one"), manual("two")], completeSources: ["record-entry"] });
  synchroniseClientRecordLedger({
    agencyId,
    clientId,
    events: [{ sourceType: "message", sourceId: "message-one", group: "messages", title: "Retained message", occurredAt: Date.UTC(2026, 1, 2), eyebrow: "Email", visibility: "inherent" }],
  });
  synchroniseClientRecordLedger({ agencyId, clientId, events: [manual("two")], completeSources: ["record-entry"] });

  const page = queryClientRecordLedger({ agencyId, clientId, limit: 25 });
  assert.deepEqual(new Set(page.events.map(event => event.sourceId)), new Set(["two", "message-one"]));
  assert.equal(page.summary.shared, 1);
});

test("client activity writes through to the ledger and query lenses are server-side", async () => {
  const { logActivity } = await import("../src/server/activity");
  const { queryClientRecordLedger, synchroniseClientRecordLedger } = await import("../src/lib/server/clientRecordLedger");
  const agencyId = "agency-ledger-activity";
  const clientId = "client-ledger-activity";
  logActivity({ agencyId, clientId, category: "tenant", action: "relationship.reviewed", message: "Quarterly review completed" });
  synchroniseClientRecordLedger({
    agencyId,
    clientId,
    events: [{ sourceType: "invoice", sourceId: "invoice-overdue", group: "commercial", title: "Invoice overdue", occurredAt: Date.UTC(2026, 2, 1), eyebrow: "Commercial", visibility: "system", attention: "critical" }],
  });

  const search = queryClientRecordLedger({ agencyId, clientId, query: "quarterly", filter: "activity" });
  assert.equal(search.total, 1);
  const attention = queryClientRecordLedger({ agencyId, clientId, scope: "attention" });
  assert.equal(attention.total, 1);
  assert.equal(attention.events[0]?.sourceType, "invoice");
});

test("finance activity snapshots create, update and remove canonical invoice records", async () => {
  const { logActivity } = await import("../src/server/activity");
  const { queryClientRecordLedger } = await import("../src/lib/server/clientRecordLedger");
  const agencyId = "agency-ledger-finance-port";
  const clientId = "client-ledger-finance-port";
  const invoiceId = "invoice-port-1";
  const now = Date.UTC(2026, 7, 16);
  const metadata = {
    invoiceId,
    number: "INV-PORT-001",
    totalCents: 45_000,
    currency: "gbp",
    status: "sent",
    issuedAt: now,
    dueAt: now + 86_400_000,
    lineItemDescription: "Strategy sprint",
  };

  logActivity({ agencyId, clientId, category: "finance", action: "invoice.sent", message: "Sent invoice", metadata });
  let page = queryClientRecordLedger({ agencyId, clientId });
  assert.equal(page.total, 1);
  assert.equal(page.events[0]?.sourceId, `invoice:${invoiceId}`);
  assert.equal(page.events[0]?.attention, "warning");

  logActivity({ agencyId, clientId, category: "finance", action: "invoice.deleted", message: "Deleted invoice", metadata });
  page = queryClientRecordLedger({ agencyId, clientId });
  assert.equal(page.total, 0);
});

test("linked social messages write through with stable conversation identities", async () => {
  const { queryClientRecordLedger, upsertClientSocialMessageLedgerEvent } = await import("../src/lib/server/clientRecordLedger");
  const agencyId = "agency-ledger-social";
  const clientId = "client-ledger-social";
  upsertClientSocialMessageLedgerEvent(agencyId, clientId, {
    conversationId: "conversation-1",
    messageId: "message-1",
    channel: "instagram",
    accountName: "Aqua Studio",
    participantName: "Sam Client",
    text: "Can we move the review?",
    sentAt: Date.UTC(2026, 7, 16, 10),
    direction: "inbound",
    status: "received",
  });

  const page = queryClientRecordLedger({ agencyId, clientId, query: "move the review" });
  assert.equal(page.total, 1);
  assert.equal(page.events[0]?.title, "Instagram message");
  assert.match(page.events[0]?.sourceId ?? "", /social%3Aconversation-1/);
  assert.match(page.events[0]?.eyebrow ?? "", /Sam Client/);
});

test("canonical record builders preserve source identity and expose actionable status", async () => {
  const {
    clientContractLedgerEvent,
    clientInvoiceLedgerEvent,
    clientMilestoneLedgerEvent,
    clientPaymentPlanLedgerEvent,
    clientRequestLedgerEvents,
  } = await import("../src/lib/server/clientRecordLedger");
  const clientId = "client-ledger-builders";
  const now = Date.UTC(2026, 7, 16);

  const contract = clientContractLedgerEvent(clientId, {
    id: "contract-1",
    title: "Growth agreement",
    version: 2,
    status: "sent",
    createdAt: now - 2_000,
    issuedAt: now - 1_000,
  });
  assert.equal(contract.sourceId, "contract:contract-1");
  assert.equal(contract.attention, "warning");
  assert.match(contract.href ?? "", /tab=finance#client-contracts/);

  const invoice = clientInvoiceLedgerEvent(clientId, {
    id: "invoice-1",
    number: "INV-001",
    totalCents: 125_000,
    currency: "gbp",
    status: "overdue",
    issuedAt: now - 20_000,
    dueAt: now - 10_000,
  });
  assert.equal(invoice.sourceId, "invoice:invoice-1");
  assert.equal(invoice.attention, "critical");
  assert.match(invoice.title, /£1,250\.00/);

  const plan = clientPaymentPlanLedgerEvent(clientId, {
    id: "plan-1",
    title: "Launch plan",
    currency: "gbp",
    status: "active",
    createdAt: now - 30_000,
    activatedAt: now - 20_000,
    milestones: [{ amountCents: 50_000, dueAt: now - 1, status: "planned" }],
  }, now);
  assert.equal(plan.sourceId, "payment-plan:plan-1");
  assert.equal(plan.attention, "critical");

  const milestone = clientMilestoneLedgerEvent(clientId, {
    id: "milestone-1",
    title: "Launch website",
    status: "blocked",
    progress: 40,
    createdAt: now - 30_000,
    updatedAt: now,
  }, now);
  assert.equal(milestone.sourceId, "delivery:milestone-1");
  assert.equal(milestone.attention, "critical");

  const messages = clientRequestLedgerEvents(clientId, {
    id: "request-1",
    type: "support-ticket",
    message: "Please check the form",
    status: "open",
    submittedBy: "client@example.com",
    submittedAt: now,
    replies: [{ id: "reply-1", message: "On it", from: "milesymedia", createdAt: now + 1 }],
  }, new Set(["client@example.com"]));
  assert.equal(messages.length, 2);
  assert.match(messages[0]?.eyebrow ?? "", /inbound/);
  assert.match(messages[1]?.eyebrow ?? "", /outbound/);
  assert.notEqual(messages[0]?.sourceId, messages[1]?.sourceId);
});

test("canonical source mutations write through to the client record ledger", () => {
  const contracts = read("src/app/api/tenants/client-contracts/route.ts");
  const plans = read("src/app/api/tenants/client-payment-plans/route.ts");
  const invoices = read("src/built-ins/modules/agency-finance/src/server/invoices.ts");
  const milestones = read("src/server/clientMilestones.ts");
  const requests = read("src/app/api/tenants/client-requests/route.ts");
  const social = read("src/lib/server/inboxService.ts");
  const socialLinks = read("src/app/api/portal/inbox/conversations/route.ts");

  assert.match(contracts, /upsertClientContractLedgerEvent/);
  assert.match(contracts, /removeClientRecordLedgerEvent/);
  assert.match(plans, /completeSources: \["payment-plan"\]/);
  assert.match(plans, /upsertClientInvoiceLedgerEvent/);
  assert.match(invoices, /invoiceActivityMetadata/);
  assert.match(invoices, /action: "invoice\.updated"/);
  assert.match(read("src/lib/server/clientRecordLedger.ts"), /entry\.action\.startsWith\("invoice\."\)/);
  assert.match(milestones, /upsertClientMilestoneLedgerEvent/);
  assert.match(milestones, /removeClientRecordLedgerEvent/);
  assert.match(requests, /synchroniseClientRequestLedgerEvents/);
  assert.match(requests, /await flushPendingWrites\(\)/);
  assert.match(social, /upsertClientSocialMessageLedgerEvent/);
  assert.match(socialLinks, /upsertClientSocialMessageLedgerEvent/);
  assert.match(socialLinks, /await flushPendingWrites\(\)/);
});

test("client record ledger is authenticated, cursor-paginated, and wired into the workspace", () => {
  const route = read("src/app/api/tenants/client-record-ledger/route.ts");
  const workspace = read("src/app/portal/clients/[clientId]/_ClientRecordWorkspace.tsx");
  const page = read("src/app/portal/clients/[clientId]/page.tsx");
  const storage = read("src/server/storage.ts");

  assert.match(route, /requireRoleForClient\(\[\.\.\.AGENCY_ROLES\]/);
  assert.match(route, /queryClientRecordLedger/);
  assert.match(route, /parentSourceId/);
  assert.match(workspace, /client-record-ledger/);
  assert.match(workspace, /page\.nextCursor/);
  assert.match(workspace, /Load next/);
  assert.match(workspace, /client-record-inspector/);
  assert.match(workspace, /saveSelectedEntry/);
  assert.match(workspace, /attachSelectedEvidence/);
  assert.match(workspace, /deleteLinkedEvidence/);
  assert.match(workspace, /Linked files and recordings/);
  assert.match(page, /synchroniseClientRecordLedger/);
  assert.match(page, /completeSources: \["record-entry", "file", "contract", "invoice", "payment-plan", "delivery"\]/);
  assert.match(storage, /clientRecordLedger: parsed\.clientRecordLedger \?\? \{\}/);
});
