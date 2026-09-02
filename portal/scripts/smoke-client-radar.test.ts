import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateClientAquaHealth } from "../src/lib/clients/clientAquaHealth";
import { buildClientRadarSnapshot, type ClientRadarInput } from "../src/engines/data/radar/clientRadar";

const NOW = Date.parse("2026-08-16T12:00:00.000Z");
const DAY = 86_400_000;

function input(overrides: Partial<ClientRadarInput> = {}): ClientRadarInput {
  const invoices = overrides.invoices ?? [];
  const requests = overrides.requests ?? [];
  const contracts = overrides.contracts ?? [];
  const financeConnected = overrides.financeConnected ?? false;
  const financeAvailable = overrides.financeAvailable ?? true;
  const requestsObserved = overrides.requestsObserved ?? false;
  const lastContactedAt = overrides.lastContactedAt;
  return {
    now: NOW,
    client: {
      id: "client-a",
      name: "Client A",
      status: "active",
      stage: "live",
      createdAt: NOW - 30 * DAY,
      updatedAt: NOW,
      ownerEmail: "client@example.com",
      ...overrides.client,
    },
    aquaHealth: overrides.aquaHealth ?? calculateClientAquaHealth({
      now: NOW,
      financeConnected,
      financeAvailable,
      invoices,
      lastContactedAt,
      requestsObserved,
      requests,
      contracts: [],
    }),
    products: overrides.products ?? [],
    properties: overrides.properties ?? [],
    milestones: overrides.milestones ?? [],
    alerts: overrides.alerts ?? [],
    financeConnected,
    financeAvailable,
    paymentPosition: overrides.paymentPosition,
    invoices,
    requestsObserved,
    requests,
    contracts,
    portal: overrides.portal ?? {
      expected: false,
      pendingApprovals: 0,
      sharedFiles: 0,
    },
    marketing: overrides.marketing,
    lastContactedAt,
    lastRecordedAt: overrides.lastRecordedAt,
  };
}

describe("client-scoped adaptive Radar", () => {
  it("starts a new active client with honest setup and learning states", () => {
    const radar = buildClientRadarSnapshot(input());
    const service = radar.checks.find(check => check.id.endsWith(":service-assignment"));
    const finance = radar.checks.find(check => check.id.endsWith(":payment-position"));

    assert.equal(service?.status, "warning");
    assert.equal(finance?.status, "blind");
    assert.equal(radar.packs.some(pack => pack.id === "client-core"), true);
    assert.equal(radar.summary.includes("Service assignment"), true);
    assert.equal(radar.healthState, "learning");
  });

  it("adds product and property detector packs with exact entities", () => {
    const overdueInvoice = {
      status: "overdue",
      dueAt: NOW - 5 * DAY,
      totalCents: 125_000,
      currency: "gbp",
    };
    const radar = buildClientRadarSnapshot(input({
      financeConnected: true,
      invoices: [overdueInvoice],
      products: [{
        id: "website-build",
        name: "Website build",
        key: "website",
        requiresPortal: true,
        deliverableCount: 3,
        workspace: {
          progress: 40,
          pendingDecisions: 0,
          blockedDecisions: 0,
          outputCount: 2,
          readyOutputs: 1,
          lastUpdatedAt: NOW,
        },
      }],
      properties: [{
        id: "site-main",
        label: "Main website",
        expectedLive: true,
        tagDeclared: true,
        lastSeenAt: NOW - 5 * 60_000,
        errors24h: 7,
        averageLoadMs: 5_600,
        syntheticOk: false,
      }],
      portal: {
        expected: true,
        builtAt: NOW - DAY,
        accessEmail: "client@example.com",
        pendingApprovals: 0,
        sharedFiles: 2,
      },
    }));

    assert.equal(radar.packs.some(pack => pack.id === "product:website-build"), true);
    assert.equal(radar.packs.some(pack => pack.id === "property:site-main"), true);
    const errorCheck = radar.checks.find(check => check.id.endsWith(":property:site-main:errors"));
    assert.equal(errorCheck?.status, "critical");
    assert.deepEqual(errorCheck?.entity, {
      type: "property",
      id: "site-main",
      label: "Main website",
      parentId: "client-a",
    });
    assert.equal(radar.checks.find(check => check.id.endsWith(":payment-position"))?.status, "critical");
  });

  it("gives an unknown future product a useful generic detector pack", () => {
    const radar = buildClientRadarSnapshot(input({
      products: [{
        id: "future-service",
        name: "Future service",
        requiresPortal: false,
        deliverableCount: 2,
      }],
    }));
    const pack = radar.packs.find(item => item.id === "product:future-service");

    assert.ok(pack);
    assert.equal(pack.totalChecks, 3);
    assert.equal(radar.checks.some(check => check.entity?.type === "product" && check.entity.id === "future-service"), true);
  });

  it("does not call a client strong while an applicable warning remains", () => {
    const paidInvoice = {
      status: "paid",
      dueAt: NOW - DAY,
      paidAt: NOW - 2 * DAY,
      totalCents: 50_000,
      currency: "gbp",
    };
    const radar = buildClientRadarSnapshot(input({
      financeConnected: true,
      invoices: [paidInvoice],
      requestsObserved: true,
      lastContactedAt: NOW,
    }));

    assert.equal(radar.checks.find(check => check.id.endsWith(":service-assignment"))?.status, "warning");
    assert.equal(radar.healthState, "watch");
  });

  it("turns a reconciled missed instalment into exact critical finance evidence", () => {
    const radar = buildClientRadarSnapshot(input({
      financeConnected: true,
      paymentPosition: {
        state: "missed-payment",
        label: "1 missed payment",
        currencyPositions: [{
          currency: "gbp",
          agreedCents: 100_000,
          paidCents: 40_000,
          outstandingCents: 60_000,
          missedPayments: 1,
          openInvoices: 1,
          activePlans: 1,
          completedPlans: 0,
        }],
        missedPayments: 1,
        openInvoices: 1,
        activePlans: 1,
        completedPlans: 0,
      },
    }));
    const finance = radar.checks.find(check => check.id.endsWith(":payment-position"));
    assert.equal(finance?.status, "critical");
    assert.match(finance?.detail ?? "", /£600\.00 remains outstanding/);
    assert.deepEqual(finance?.evidence.slice(0, 3), ["1 missed", "1 open invoices", "GBP: £400.00 collected · £600.00 outstanding"]);
  });

  it("keeps Finance blind and the client conclusion learning when the invoice read is unavailable", () => {
    const radar = buildClientRadarSnapshot(input({
      financeConnected: true,
      financeAvailable: false,
      invoices: [],
      requestsObserved: true,
      lastContactedAt: NOW,
      products: [{
        id: "retainer",
        name: "Retainer",
        requiresPortal: false,
        deliverableCount: 1,
        workspace: {
          progress: 100,
          pendingDecisions: 0,
          blockedDecisions: 0,
          outputCount: 1,
          readyOutputs: 1,
          lastUpdatedAt: NOW,
        },
      }],
    }));
    const finance = radar.checks.find(check => check.id.endsWith(":payment-position"));

    assert.equal(finance?.status, "blind");
    assert.equal(finance?.value, undefined);
    assert.equal(finance?.sampleSize, 0);
    assert.match(finance?.detail ?? "", /invoice evidence is unavailable/i);
    assert.doesNotMatch(finance?.evidence.join(" ") ?? "", /0 overdue|0 open|0 retained/);
    assert.equal(radar.sourceAvailability.finance, "unavailable");
    assert.notEqual(radar.healthState, "strong");
  });

  it("never shares check identities between client workspaces", () => {
    const first = buildClientRadarSnapshot(input());
    const second = buildClientRadarSnapshot(input({
      client: { id: "client-b", name: "Client B" },
    }));
    const firstIds = new Set(first.checks.map(check => check.id));

    assert.equal(second.checks.some(check => firstIds.has(check.id)), false);
    assert.equal(second.checks.every(check => check.familyId.includes("client:client-b:")), true);
  });
});
