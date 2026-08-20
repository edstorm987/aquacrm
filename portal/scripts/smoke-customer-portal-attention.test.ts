import assert from "node:assert/strict";
import test from "node:test";

import type { CustomerPortalData } from "../src/app/portal/customer/_portalData";
import { buildCustomerPortalAttention } from "../src/lib/portal/customerPortalAttention";

function portalData(patch: Partial<CustomerPortalData> = {}): CustomerPortalData {
  return {
    mode: "maintenance",
    approvals: [],
    brief: {},
    invoices: [],
    requests: [],
    workspaces: [],
    ...patch,
  } as CustomerPortalData;
}

test("customer portal attention points to exact shell and product destinations", () => {
  const attention = buildCustomerPortalAttention(portalData({
    mode: "onboarding",
    approvals: [{ id: "approval-1", status: "pending" }],
    invoices: [{ id: "invoice-1", status: "sent" }],
    requests: [{
      id: "request-1",
      status: "reviewed",
      replies: [{ id: "reply-1", from: "milesymedia", message: "Please review", createdAt: 10 }],
    }],
    workspaces: [{
      productId: "photography",
      decisions: [{ id: "decision-1", pageId: "gallery", status: "pending" }],
      collections: [{ id: "collection-1", pageId: "gallery", status: "review" }],
    }],
  } as Partial<CustomerPortalData>));

  assert.deepEqual(attention.sections.project, { count: 2, label: "2 project items need you" });
  assert.deepEqual(attention.sections.billing, { count: 1, label: "1 invoice needs review" });
  assert.deepEqual(attention.sections.support, { count: 1, label: "1 support reply is waiting" });
  assert.deepEqual(attention.modules.photography.gallery, { count: 2, label: "2 items need your decision" });
  assert.equal(attention.total, 6);
  assert.equal(attention.sections.home.count, 6);
});

test("customer portal attention stays quiet when no customer response is required", () => {
  const attention = buildCustomerPortalAttention(portalData({
    requests: [{
      id: "request-1",
      status: "open",
      replies: [{ id: "reply-1", from: "customer", message: "More context", createdAt: 10 }],
    }],
  } as Partial<CustomerPortalData>));

  assert.equal(attention.total, 0);
  assert.deepEqual(attention.sections, {});
  assert.deepEqual(attention.modules, {});
});
