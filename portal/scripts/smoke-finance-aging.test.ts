// Finance Phase 5 — AR/AP aging buckets.

import assert from "node:assert/strict";
import { test } from "node:test";

import { summariseAging, type AgingItem } from "../src/built-ins/modules/agency-finance/src/lib/aging.ts";

const DAY = 86_400_000;
const NOW = 100 * DAY;

test("aging buckets items by days past due, keeps 'current' out of overdue", () => {
  const items: AgingItem[] = [
    { amountCents: 100, dueAt: 110 * DAY }, // 10 days in the future → current
    { amountCents: 100, dueAt: 100 * DAY }, // due today → current
    { amountCents: 500, dueAt: 90 * DAY },  // 10 days overdue → 1–30
    { amountCents: 300, dueAt: 55 * DAY },  // 45 days overdue → 31–60
    { amountCents: 200, dueAt: 30 * DAY },  // 70 days overdue → 61–90
    { amountCents: 1000, dueAt: 0 },        // 100 days overdue → 90+
  ];
  const summary = summariseAging(items, NOW);
  const byKey = Object.fromEntries(summary.buckets.map(b => [b.key, b]));

  assert.equal(summary.buckets.length, 5, "always all five buckets, in order");
  assert.deepEqual(summary.buckets.map(b => b.key), ["current", "1-30", "31-60", "61-90", "90+"]);
  assert.equal(summary.totalCents, 2200);
  assert.equal(summary.count, 6);
  assert.equal(summary.overdueCents, 2000, "the two 'current' items (200) are not overdue");

  assert.deepEqual([byKey.current.count, byKey.current.totalCents], [2, 200]);
  assert.deepEqual([byKey["1-30"].count, byKey["1-30"].totalCents], [1, 500]);
  assert.deepEqual([byKey["31-60"].count, byKey["31-60"].totalCents], [1, 300]);
  assert.deepEqual([byKey["61-90"].count, byKey["61-90"].totalCents], [1, 200]);
  assert.deepEqual([byKey["90+"].count, byKey["90+"].totalCents], [1, 1000]);
});

test("an empty ledger ages to all-zero buckets", () => {
  const summary = summariseAging([], NOW);
  assert.equal(summary.buckets.length, 5);
  assert.equal(summary.totalCents, 0);
  assert.equal(summary.count, 0);
  assert.equal(summary.overdueCents, 0);
  assert.ok(summary.buckets.every(b => b.count === 0 && b.totalCents === 0));
});

test("a boundary day lands in the right bucket (30 → 1–30, 31 → 31–60)", () => {
  assert.equal(summariseAging([{ amountCents: 1, dueAt: NOW - 30 * DAY }], NOW).buckets.find(b => b.key === "1-30")?.count, 1);
  assert.equal(summariseAging([{ amountCents: 1, dueAt: NOW - 31 * DAY }], NOW).buckets.find(b => b.key === "31-60")?.count, 1);
});
