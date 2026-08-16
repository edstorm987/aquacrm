import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { cleanClientRecordEntries } from "../src/lib/clientRelationshipRecord";
import { cleanClientRequests } from "../src/lib/clientRequests";

const read = (path: string) => readFileSync(path, "utf8");

test("client relationship records retain typed visibility and reject malformed history", () => {
  const entries = cleanClientRecordEntries([
    {
      id: "rec_shared",
      kind: "meeting",
      title: "Quarterly review",
      body: "Targets approved.",
      occurredAt: 2_000,
      createdAt: 1_000,
      updatedAt: 2_000,
      createdBy: "owner@example.com",
      visibility: "client",
      url: "https://example.com/recording",
    },
    {
      id: "rec_private",
      kind: "note",
      title: "Internal risk",
      occurredAt: 3_000,
      createdAt: 3_000,
      updatedAt: 3_000,
      createdBy: "owner@example.com",
      visibility: "anything-else",
      url: "javascript:alert(1)",
    },
    { id: "broken", kind: "unknown" },
  ]);

  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.id, "rec_private");
  assert.equal(entries[0]?.visibility, "internal");
  assert.equal(entries[0]?.url, undefined);
  assert.equal(entries[1]?.visibility, "client");
});

test("partial legacy requests stay usable across client, inbox and portal surfaces", () => {
  const requests = cleanClientRequests([
    { id: "legacy", status: "closed", type: "suggestion" },
    { id: "support", status: "open", type: "support-ticket", message: " Help ", submittedBy: " client@example.com " },
    null,
  ]);

  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.message, "No message was recorded.");
  assert.equal(requests[0]?.submittedBy, "Unknown sender");
  assert.equal(requests[0]?.submittedAt, 0);
  assert.equal(requests[1]?.message, "Help");
  assert.equal(requests[1]?.submittedBy, "client@example.com");

  const clientPage = read("src/app/portal/clients/[clientId]/page.tsx");
  const customerData = read("src/app/portal/customer/_portalData.ts");
  const inbox = read("src/app/portal/agency/inbox/page.tsx");
  assert.match(clientPage, /cleanClientRequests\(meta\.clientRequests\)/);
  assert.match(customerData, /cleanClientRequests\(meta\.clientRequests\)/);
  assert.match(inbox, /cleanClientRequests\(metadata\?\.clientRequests\)/);
});

test("the internal client record unifies messages, calls, files and controlled publishing", () => {
  const page = read("src/app/portal/clients/[clientId]/page.tsx");
  const workspace = read("src/app/portal/clients/[clientId]/_ClientRecordWorkspace.tsx");
  const route = read("src/app/api/tenants/client-record/route.ts");
  const fileRoute = read("src/app/api/tenants/client-files/route.ts");
  const uploadRoute = read("src/app/api/tenants/client-files/upload/route.ts");
  const files = read("src/app/portal/clients/[clientId]/_FilesTabClient.tsx");
  const contracts = read("src/app/portal/clients/[clientId]/_ContractsPanel.tsx");
  const paymentPlans = read("src/app/portal/clients/[clientId]/_PaymentPlansPanel.tsx");
  const finance = read("src/app/portal/clients/[clientId]/_FinanceTabClient.tsx");
  const notes = read("src/app/portal/clients/[clientId]/_ClientNotesWorkspace.tsx");

  assert.match(page, /listInboxSnapshot/);
  assert.match(page, /listWebsiteEnquiries/);
  assert.match(page, /clientRecordMessages/);
  assert.match(page, /ClientRecordWorkspace/);
  assert.match(workspace, /Complete client record/);
  assert.match(workspace, /Search the complete client record/);
  assert.match(workspace, /client-record-capture/);
  assert.match(workspace, /Complete history/);
  assert.match(workspace, /Needs attention/);
  assert.match(workspace, /Last 90 days/);
  assert.match(workspace, /PAGE_SIZE = 25/);
  assert.match(workspace, /client-record-ledger/);
  assert.match(workspace, /page\.nextCursor/);
  assert.match(workspace, /Date not recorded/);
  assert.match(workspace, /Source import window reached/);
  assert.match(page, /recordActivityWindowReached/);
  assert.match(page, /websiteEnquiryWindowReached/);
  assert.match(page, /synchroniseClientRecordLedger/);
  assert.match(page, /queryClientRecordLedger/);
  assert.match(notes, /<details/);
  assert.match(notes, /Open scratchpads/);
  assert.match(workspace, /Private is the default/);
  assert.match(workspace, /Preview client record/);
  assert.match(workspace, /Attach evidence/);
  assert.match(workspace, /recordEntryId/);
  assert.match(workspace, /Saving & uploading/);
  assert.match(workspace, /label: "Commercial"/);
  assert.match(workspace, /label: "Delivery"/);
  assert.match(workspace, /Canonical record/);
  assert.match(workspace, /Inspect source/);
  assert.match(page, /clientRecordCanonicalEvents/);
  assert.match(page, /clientContractLedgerEvent/);
  assert.match(page, /clientInvoiceLedgerEvent/);
  assert.match(page, /clientMilestoneLedgerEvent/);
  assert.match(page, /clientPaymentPlanLedgerEvent/);
  assert.match(page, /!item\.action\.startsWith\("contract\."\)/);
  assert.match(page, /!item\.action\.startsWith\("invoice\."\)/);
  assert.match(contracts, /id="client-contracts"/);
  assert.match(paymentPlans, /id="client-payment-plans"/);
  assert.match(finance, /id="client-invoices"/);
  assert.match(route, /requireRoleForClient\(\[\.\.\.AGENCY_ROLES\]/);
  assert.match(route, /clientRecordEntries/);
  assert.match(route, /recordEntryId === changed\?\.id/);
  assert.match(route, /await flushPendingWrites\(\)/);
  assert.match(fileRoute, /client record entry not found/);
  assert.match(uploadRoute, /client record entry not found/);
  assert.match(files, /Shared with client/);
  assert.match(files, /action: "visibility"/);
});

test("the customer portal receives only approved records and linked participant messages", () => {
  const data = read("src/app/portal/customer/_portalData.ts");
  const view = read("src/app/portal/customer/_CustomerPortalViews.tsx");
  const design = read("src/lib/clientPortalDesign.ts");
  const content = read("src/app/api/tenants/client-files/content/route.ts");

  assert.match(data, /entry\.visibility === "client"/);
  assert.match(data, /message\.direction !== "internal"/);
  assert.match(data, /file\.customerVisible === true/);
  assert.match(data, /listWebsiteEnquiries/);
  assert.match(data, /recordMessages/);
  assert.match(data, /attachments: safeFiles\.filter\(file => file\.recordEntryId === entry\.id\)/);
  assert.doesNotMatch(data, /\["Session notes", meta\.sessionNotes/);
  assert.doesNotMatch(data, /\["Support notes", meta\.supportNotes/);
  assert.match(view, /Every linked message/);
  assert.match(view, /Private agency notes never appear here/);
  assert.match(view, /entry\.attachments/);
  assert.match(design, /label: "Your record"/);
  assert.match(content, /file\.customerVisible !== true && !uploadedByCustomer/);
});

test("recordings default to portal sharing only when no explicit integration choice exists", () => {
  const linkedFiles = read("src/app/api/tenants/client-files/route.ts");
  const uploadedFiles = read("src/app/api/tenants/client-files/upload/route.ts");

  assert.match(linkedFiles, /body\.file\.customerVisible === undefined && body\.file\.category === "recording"/);
  assert.match(uploadedFiles, /form\?\.get\("customerVisible"\) === null && category === "recording"/);
  assert.match(linkedFiles, /only agency staff can change client visibility/);
});
