import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  cleanClientPaymentPlans,
  customerVisiblePaymentPlans,
  paymentPlanPaid,
  paymentPlanTotal,
  reconcileClientPaymentPlan,
  summariseClientPaymentPosition,
} from "../src/lib/clientPaymentPlans";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("client payment plans normalise, reconcile and hide internal context", () => {
  const [plan] = cleanClientPaymentPlans([{
    id: "plan-1",
    title: "Website launch",
    currency: "gbp",
    status: "active",
    customerVisible: true,
    internalNotes: "Private margin context",
    createdAt: 1,
    updatedAt: 1,
    milestones: [
      { id: "m-1", title: "Deposit", amountCents: 1_000, dueAt: 10, status: "invoiced", invoiceId: "inv-1" },
      { id: "m-2", title: "Launch", amountCents: 2_000, dueAt: 20, status: "planned" },
    ],
  }]);
  const reconciled = reconcileClientPaymentPlan(plan, [{ id: "inv-1", number: "INV-1", status: "paid", paidAt: 12 }]);
  assert.equal(reconciled.milestones[0].status, "paid");
  assert.equal(reconciled.milestones[0].invoiceNumber, "INV-1");
  assert.equal(paymentPlanTotal(reconciled), 3_000);
  assert.equal(paymentPlanPaid(reconciled), 1_000);
  const [visible] = customerVisiblePaymentPlans([reconciled]);
  assert.equal(visible.internalNotes, undefined);
});

test("completed state follows canonical invoice evidence", () => {
  const [plan] = cleanClientPaymentPlans([{
    id: "plan-2",
    title: "Care plan",
    currency: "gbp",
    status: "active",
    customerVisible: true,
    createdAt: 1,
    updatedAt: 1,
    milestones: [{ id: "m-1", title: "Care", amountCents: 5_000, dueAt: 10, status: "invoiced", invoiceId: "inv-2" }],
  }]);
  const reconciled = reconcileClientPaymentPlan(plan, [{ id: "inv-2", number: "INV-2", status: "paid" }]);
  assert.equal(reconciled.status, "completed");
});

test("payment position distinguishes active, missed, due and paid-in-full states", () => {
  const [plan] = cleanClientPaymentPlans([{
    id: "plan-position",
    title: "Project schedule",
    currency: "gbp",
    status: "active",
    customerVisible: true,
    createdAt: 1,
    updatedAt: 1,
    milestones: [
      { id: "deposit", title: "Deposit", amountCents: 4_000, dueAt: 100, status: "invoiced", invoiceId: "inv-position" },
      { id: "launch", title: "Launch", amountCents: 6_000, dueAt: 500, status: "planned" },
    ],
  }]);
  const missed = summariseClientPaymentPosition([plan], [{ id: "inv-position", number: "INV-P", status: "sent", dueAt: 100, totalCents: 4_000, currency: "gbp" }], 200);
  assert.equal(missed.state, "missed-payment");
  assert.equal(missed.missedPayments, 1);
  assert.equal(missed.agreedCents, 10_000);
  assert.equal(missed.outstandingCents, 10_000);
  assert.equal(missed.nextDueAt, 500);

  const due = summariseClientPaymentPosition([], [{ id: "inv-due", number: "INV-D", status: "sent", dueAt: 300, totalCents: 2_500, currency: "gbp" }], 200);
  assert.equal(due.state, "payment-due");
  assert.equal(due.openInvoices, 1);

  const paid = summariseClientPaymentPosition([plan], [{ id: "inv-position", number: "INV-P", status: "paid", dueAt: 100, totalCents: 4_000, currency: "gbp", paidAt: 90 }], 200);
  assert.equal(paid.state, "payment-plan");
  assert.equal(paid.paidCents, 4_000);

  const [single] = cleanClientPaymentPlans([{ id: "single", title: "Paid", currency: "gbp", status: "active", customerVisible: true, createdAt: 1, updatedAt: 1, milestones: [{ id: "only", title: "Full payment", amountCents: 9_000, dueAt: 100, status: "invoiced", invoiceId: "inv-paid" }] }]);
  const complete = summariseClientPaymentPosition([single], [{ id: "inv-paid", number: "INV-PAID", status: "paid", dueAt: 100, totalCents: 9_000, currency: "gbp", paidAt: 90 }], 200);
  assert.equal(complete.state, "paid-in-full");
  assert.equal(complete.outstandingCents, 0);
});

test("client workspace wires plans to products, Finance invoices, files and customer portal", () => {
  const api = read("src/app/api/tenants/client-payment-plans/route.ts");
  const panel = read("src/app/portal/clients/[clientId]/_PaymentPlansPanel.tsx");
  const page = read("src/app/portal/clients/[clientId]/page.tsx");
  const portalData = read("src/app/portal/customer/_portalData.ts");
  const portalView = read("src/app/portal/customer/_CustomerPortalViews.tsx");
  const uploads = read("src/app/api/tenants/client-files/upload/route.ts");
  const filesApi = read("src/app/api/tenants/client-files/route.ts");

  assert.match(api, /resolvePortalProductAssignment/);
  assert.match(api, /finance\.invoices\.create/);
  assert.match(api, /finance\.invoices\.update/);
  assert.match(api, /clientPaymentPlans/);
  assert.match(panel, /Issue invoice/);
  assert.match(panel, /payment-plan/);
  assert.match(panel, /Payment position/);
  assert.match(panel, /Missed payments/);
  assert.match(panel, /summariseClientPaymentPosition/);
  assert.match(panel, /Share in customer portal/);
  assert.match(panel, /form\.set\("collectionId", evidencePlanId\)/);
  assert.match(panel, /Linked evidence/);
  assert.match(panel, /setEvidenceVisibility/);
  assert.match(panel, /moveEvidence/);
  assert.match(page, /initialPaymentPlans/);
  assert.match(page, /initialCommercialFiles/);
  assert.match(page, /selectedProducts\.map/);
  assert.match(portalData, /customerVisiblePaymentPlans/);
  assert.match(portalData, /options\.audience === "agency"/);
  assert.match(portalView, /Agreed payment schedule/);
  assert.match(portalView, /Schedule documents/);
  assert.match(portalView, /file\.collectionId === plan\.id/);
  assert.match(uploads, /payment-proof/);
  assert.match(uploads, /collectionId/);
  assert.match(uploads, /application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation/);
  assert.match(filesApi, /action: "collection"/);
  assert.match(filesApi, /client_file\.attached/);
  assert.match(api, /detachedEvidence/);
});
