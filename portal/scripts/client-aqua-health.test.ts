import assert from "node:assert/strict";
import test from "node:test";

import { calculateClientAquaHealth } from "../src/lib/clientAquaHealth";

test("Aqua Health declares learning when relationship evidence is absent", () => {
  const health = calculateClientAquaHealth({
    now: Date.UTC(2026, 7, 14),
    financeConnected: false,
    invoices: [],
    requestsObserved: false,
    requests: [],
    contracts: [],
  });
  assert.equal(health.state, "learning");
  assert.equal(health.score, null);
  assert.equal(health.confidence, 0);
});

test("Aqua Health exposes overdue payment risk even with incomplete coverage", () => {
  const now = Date.UTC(2026, 7, 14);
  const health = calculateClientAquaHealth({
    now,
    financeConnected: true,
    invoices: [{ status: "overdue", dueAt: now - 86_400_000, totalCents: 125_000, currency: "gbp" }],
    requestsObserved: false,
    requests: [],
    contracts: [],
  });
  assert.equal(health.state, "risk");
  assert.equal(health.factors[0]?.score, 10);
  assert.match(health.summary, /Payment relationship needs attention/);
});

test("Aqua Health rewards current contact, paid invoices and accepted terms", () => {
  const now = Date.UTC(2026, 7, 14);
  const health = calculateClientAquaHealth({
    now,
    financeConnected: true,
    invoices: [{ status: "paid", dueAt: now - 5 * 86_400_000, paidAt: now - 6 * 86_400_000, totalCents: 250_000, currency: "gbp" }],
    lastContactedAt: now - 2 * 86_400_000,
    requestsObserved: true,
    requests: [],
    contracts: [{ id: "ctr_1", title: "Agreement", status: "accepted", createdAt: now - 10, updatedAt: now - 5 }],
  });
  assert.equal(health.state, "strong");
  assert.equal(health.score, 100);
  assert.equal(health.confidence, 100);
});
