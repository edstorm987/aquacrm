import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateCompanyHealth, calculateServiceBrandHealth } from "../src/lib/performance/companyHealth";

describe("company health", () => {
  it("scores a healthy company from live operating signals", () => {
    const health = calculateCompanyHealth({
      monthRevenueCents: 250_000,
      monthlyRevenueTargetCents: 500_000,
      dayOfMonth: 15,
      daysInMonth: 30,
      activeClients: 4,
      clientsNeedingAttention: 0,
      revenueGapCents: 250_000,
      estimatedCallsNeeded: 4,
      meetingsThisMonth: 4,
      openTasks: 8,
      overdueTasks: 0,
    });

    assert.deepEqual(health, {
      overall: 100,
      income: 100,
      clients: 100,
      pipeline: 100,
      operations: 100,
      monthElapsedPercent: 50,
    });
  });

  it("surfaces weak income, client, pipeline, and overdue-work signals", () => {
    const health = calculateCompanyHealth({
      monthRevenueCents: 50_000,
      monthlyRevenueTargetCents: 500_000,
      dayOfMonth: 15,
      daysInMonth: 30,
      activeClients: 4,
      clientsNeedingAttention: 2,
      revenueGapCents: 450_000,
      estimatedCallsNeeded: 5,
      meetingsThisMonth: 1,
      openTasks: 10,
      overdueTasks: 4,
    });

    assert.equal(health.income, 20);
    assert.equal(health.clients, 50);
    assert.equal(health.pipeline, 20);
    assert.equal(health.operations, 60);
    assert.equal(health.overall, 34);
  });
});

describe("service brand health", () => {
  it("scores a complete active company with live operating records", () => {
    const health = calculateServiceBrandHealth({
      status: "active",
      hasWebsite: true,
      hasDescription: true,
      clientCount: 3,
      activeClientCount: 3,
      productCount: 2,
      staffCount: 1,
    });

    assert.equal(health.overall, 100);
  });

  it("makes missing records visible instead of inventing a healthy score", () => {
    const health = calculateServiceBrandHealth({
      status: "paused",
      hasWebsite: false,
      hasDescription: true,
      clientCount: 2,
      activeClientCount: 1,
      productCount: 0,
      staffCount: 0,
    });

    assert.deepEqual(health, {
      overall: 25,
      clients: 50,
      offers: 0,
      people: 0,
      profile: 40,
      operations: 40,
    });
  });
});
