import assert from "node:assert/strict";
import { test } from "node:test";

import { buildHiringCapacityAnalysis, buildHiringCapacitySignals, defaultCapacityAreas } from "../src/lib/performance/hiringCapacity";

test("area capacity ranks the highest-impact constrained role and retains exact evidence", () => {
  const analysis = buildHiringCapacityAnalysis({
    capacity: {
      weeklyAvailableHours: 40,
      deliveryHoursPerActiveClient: 5,
      salesHoursPerCall: 1,
      adminBufferPercent: 20,
      hiringTriggerPercent: 85,
      areas: defaultCapacityAreas(),
    },
    actuals: {
      monthlyRevenueTargetCents: 1_000_000,
      monthRevenueCents: 400_000,
      averageDealValueCents: 200_000,
      salesCallCloseRatePercent: 25,
      activeClients: 8,
      clientsNeedingAttention: 2,
      leadCount: 12,
      meetingsThisMonth: 4,
      productCount: 6,
      legalCount: 3,
      financeConnected: true,
    },
    signals: buildHiringCapacitySignals({
      tasks: [
        { title: "Finish client photography delivery", priority: "urgent", dueAt: 1, status: "todo" },
        { title: "Sales follow-up", priority: "high", status: "todo" },
      ],
      people: [{ title: "Founder", department: "Operations", weeklyHours: 10, status: "active" }],
      now: 2,
    }),
  });

  const delivery = analysis.areas.find(area => area.id === "delivery");
  assert.ok(delivery);
  assert.equal(delivery.state, "hire-now");
  assert.ok(delivery.gapHours > 20);
  assert.ok(delivery.estimatedMonthlyCostCents > 0);
  assert.ok(delivery.estimatedMonthlyCapacityValueCents > 0);
  assert.ok(delivery.evidence.some(item => item.includes("weekly demand")));
  assert.equal(analysis.primary?.id, "delivery");
  assert.ok(analysis.hireNowCount >= 1);
});

test("capacity signals classify retained work and People hours by operating area", () => {
  const signals = buildHiringCapacitySignals({
    tasks: [
      { title: "Prepare VAT return", priority: "high", status: "todo", dueAt: 100 },
      { title: "Fix production website error", priority: "urgent", status: "todo", dueAt: 1 },
      { title: "Completed marketing task", status: "done" },
    ],
    people: [
      { title: "Bookkeeper", department: "Finance", weeklyHours: 8, status: "active" },
      { title: "Developer", department: "Systems", weeklyHours: 20, status: "active" },
    ],
    now: 50,
  });

  assert.equal(signals.peopleHoursByArea.finance, 8);
  assert.equal(signals.peopleHoursByArea.systems, 20);
  assert.equal(signals.taskHoursByArea.finance, 1.5);
  assert.equal(signals.taskHoursByArea.systems, 2);
  assert.equal(signals.overdueTasksByArea.systems, 1);
  assert.equal(signals.openTaskCount, 2);
});
