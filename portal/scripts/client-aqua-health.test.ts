import assert from "node:assert/strict";
import test from "node:test";

import { calculateClientAquaHealth, clientTelemetryRiskSignals } from "../src/lib/clients/clientAquaHealth";
import type { ClientTelemetryEvent } from "../src/lib/clients/clientTelemetry";

const DAY = 86_400_000;

let telemetrySeq = 0;
function event(type: ClientTelemetryEvent["type"], occurredAt: number): ClientTelemetryEvent {
  telemetrySeq += 1;
  return { id: `evt_${telemetrySeq}`, type, occurredAt, receivedAt: occurredAt };
}
function events(type: ClientTelemetryEvent["type"], occurredAt: number, count: number): ClientTelemetryEvent[] {
  return Array.from({ length: count }, () => event(type, occurredAt));
}

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
  // No site telemetry, so the enquiry and traffic factors stay honestly
  // `learning` (uncounted): full relationship evidence now tops out at 70%
  // confidence, and site health is a visible blind spot rather than a free pass.
  assert.equal(health.confidence, 70);
});

test("Aqua Health never turns an unavailable invoice read into a healthy payment factor", () => {
  const now = Date.UTC(2026, 7, 14);
  const health = calculateClientAquaHealth({
    now,
    financeConnected: true,
    financeAvailable: false,
    invoices: [],
    lastContactedAt: now - DAY,
    requestsObserved: true,
    requests: [],
    contracts: [{ id: "ctr_1", title: "Agreement", status: "accepted", createdAt: now - 10, updatedAt: now - 5 }],
  });
  const payment = health.factors.find(factor => factor.id === "payment");

  assert.equal(payment?.sourceState, "unavailable");
  assert.equal(payment?.score, null);
  assert.equal(payment?.state, "learning");
  assert.match(payment?.detail ?? "", /invoice evidence is unavailable/i);
  assert.equal(health.state, "learning");
  assert.match(health.summary, /cannot give a complete conclusion/i);
});

test("Aqua Health raises risk when enquiries fall to none against an evolving baseline", () => {
  const now = Date.UTC(2026, 7, 14);
  const health = calculateClientAquaHealth({
    now,
    financeConnected: false,
    invoices: [],
    requestsObserved: false,
    requests: [],
    contracts: [],
    telemetryEvents: [
      ...events("form", now - 45 * DAY, 5), // prior month
      ...events("form", now - 75 * DAY, 4), // month before
      // nothing in the trailing 30 days
    ],
  });
  const enquiry = health.factors.find(factor => factor.id === "enquiry");
  assert.equal(enquiry?.state, "risk");
  assert.ok((enquiry?.score ?? 100) <= 20, "a fall to none should land in the severe band");
  assert.equal(health.state, "risk");
  assert.match(health.summary, /Enquiry flow needs attention/);
});

test("Aqua Health raises risk on a sharp traffic drop against the evolving baseline", () => {
  const now = Date.UTC(2026, 7, 14);
  const health = calculateClientAquaHealth({
    now,
    financeConnected: false,
    invoices: [],
    requestsObserved: false,
    requests: [],
    contracts: [],
    telemetryEvents: [
      ...events("pageview", now - 45 * DAY, 40),
      ...events("pageview", now - 75 * DAY, 40),
      ...events("pageview", now - 10 * DAY, 10), // ~75% below the ~40/mo baseline
    ],
  });
  const traffic = health.factors.find(factor => factor.id === "traffic");
  assert.equal(traffic?.state, "risk");
  assert.ok((traffic?.score ?? 100) <= 20, "a >=50% fall should land in the severe band");
  assert.equal(health.state, "risk");
});

test("Aqua Health keeps a >10% dip informational rather than firing risk", () => {
  const now = Date.UTC(2026, 7, 14);
  const health = calculateClientAquaHealth({
    now,
    financeConnected: false,
    invoices: [],
    requestsObserved: false,
    requests: [],
    contracts: [],
    telemetryEvents: [
      ...events("pageview", now - 45 * DAY, 100),
      ...events("pageview", now - 75 * DAY, 100),
      ...events("pageview", now - 10 * DAY, 75), // 25% below baseline — dip, not a hard drop
    ],
  });
  const traffic = health.factors.find(factor => factor.id === "traffic");
  assert.equal(traffic?.state, "watch");
  assert.ok((traffic?.score ?? 0) >= 55 && (traffic?.score ?? 0) < 80, "a 10-50% dip is the informational watch tier");
});

test("Aqua Health stays learning for enquiries when a site has no enquiry history", () => {
  const now = Date.UTC(2026, 7, 14);
  const health = calculateClientAquaHealth({
    now,
    financeConnected: false,
    invoices: [],
    requestsObserved: false,
    requests: [],
    contracts: [],
    telemetryEvents: [
      ...events("pageview", now - 45 * DAY, 40),
      ...events("pageview", now - 10 * DAY, 45), // traffic exists, but no form/conversion ever
    ],
  });
  const enquiry = health.factors.find(factor => factor.id === "enquiry");
  const traffic = health.factors.find(factor => factor.id === "traffic");
  assert.equal(enquiry?.state, "learning");
  assert.equal(enquiry?.score, null);
  assert.notEqual(traffic?.state, "learning");
});

test("Aqua Health reaches full confidence when every signal including telemetry is strong", () => {
  const now = Date.UTC(2026, 7, 14);
  const health = calculateClientAquaHealth({
    now,
    financeConnected: true,
    invoices: [{ status: "paid", dueAt: now - 5 * DAY, paidAt: now - 6 * DAY, totalCents: 250_000, currency: "gbp" }],
    lastContactedAt: now - 2 * DAY,
    requestsObserved: true,
    requests: [],
    contracts: [{ id: "ctr_1", title: "Agreement", status: "accepted", createdAt: now - 10, updatedAt: now - 5 }],
    telemetryEvents: [
      ...events("form", now - 45 * DAY, 3),
      ...events("form", now - 75 * DAY, 3),
      ...events("form", now - 5 * DAY, 4), // enquiries growing above baseline
      ...events("pageview", now - 45 * DAY, 20),
      ...events("pageview", now - 75 * DAY, 20),
      ...events("pageview", now - 5 * DAY, 26), // traffic growing above baseline
    ],
  });
  assert.equal(health.confidence, 100);
  assert.equal(health.score, 100);
  assert.equal(health.state, "strong");
});

test("clientTelemetryRiskSignals surfaces enquiry-none and a sharp traffic drop", () => {
  const now = Date.UTC(2026, 7, 14);
  const signals = clientTelemetryRiskSignals([
    ...events("form", now - 45 * DAY, 5),
    ...events("form", now - 75 * DAY, 4), // enquiries fell to none
    ...events("pageview", now - 45 * DAY, 40),
    ...events("pageview", now - 75 * DAY, 40),
    ...events("pageview", now - 10 * DAY, 8), // ~80% below the ~40/mo baseline
  ], now);
  const enquiry = signals.find(signal => signal.id === "enquiry");
  const traffic = signals.find(signal => signal.id === "traffic");
  assert.equal(enquiry?.kind, "enquiry-none");
  assert.equal(enquiry?.headline, "no enquiries this month");
  assert.equal(traffic?.kind, "traffic-drop");
  assert.match(traffic?.headline ?? "", /traffic down \d+%/);
});

test("clientTelemetryRiskSignals flags gone-silent traffic distinctly from a drop", () => {
  const now = Date.UTC(2026, 7, 14);
  const signals = clientTelemetryRiskSignals([
    ...events("pageview", now - 45 * DAY, 40),
    ...events("pageview", now - 75 * DAY, 40),
    // no pageviews in the trailing 30 days
  ], now);
  assert.equal(signals.find(signal => signal.id === "traffic")?.kind, "traffic-silent");
});

test("clientTelemetryRiskSignals is empty when signals are healthy or have no baseline", () => {
  const now = Date.UTC(2026, 7, 14);
  const healthy = clientTelemetryRiskSignals([
    ...events("pageview", now - 45 * DAY, 40),
    ...events("pageview", now - 5 * DAY, 45), // growing traffic, no enquiry history
  ], now);
  assert.equal(healthy.length, 0);
  assert.equal(clientTelemetryRiskSignals(undefined, now).length, 0);
});
