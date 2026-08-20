// Finance Phase 2 — payment channel model + "money in across everything".
//
// Pure logic tests (real inputs → outputs): the canonical channel catalogue,
// the legacy-value normaliser, and the per-channel money-in aggregator that
// feeds the unified money-in view.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PAYMENT_CHANNELS,
  channelLabel,
  channelMeta,
  normaliseChannel,
} from "../src/built-ins/modules/agency-finance/src/lib/channels";
import {
  summariseMoneyInByChannel,
  type MoneyInRecord,
} from "../src/built-ins/modules/agency-finance/src/lib/moneyIn";

test("the canonical four channels — Stripe automated, the rest manual, each with its own receipt", () => {
  assert.deepEqual(PAYMENT_CHANNELS.map(channel => channel.channel), ["stripe", "bank-transfer", "cash", "other"]);
  assert.equal(channelMeta("stripe").kind, "automated");
  for (const channel of ["bank-transfer", "cash", "other"] as const) {
    assert.equal(channelMeta(channel).kind, "manual");
  }
  // "Each with its own receipt handling" — the reference field is channel-named.
  assert.equal(channelMeta("stripe").referenceLabel, "Stripe charge ID");
  assert.equal(channelMeta("bank-transfer").referenceLabel, "Bank reference");
  assert.equal(channelMeta("cash").referenceLabel, "Receipt no.");
});

test("normaliseChannel folds legacy 'manual' (and anything unknown) onto 'other'", () => {
  assert.equal(normaliseChannel("stripe"), "stripe");
  assert.equal(normaliseChannel("bank-transfer"), "bank-transfer");
  assert.equal(normaliseChannel("cash"), "cash");
  assert.equal(normaliseChannel("other"), "other");
  assert.equal(normaliseChannel("manual"), "other");   // the legacy recording-method value
  assert.equal(normaliseChannel(undefined), "other");
  assert.equal(channelLabel("manual"), "Other");
  assert.equal(channelLabel("stripe"), "Stripe");
});

test("summariseMoneyInByChannel groups every money-in record by channel, per currency, all four always present", () => {
  const records: MoneyInRecord[] = [
    { amountCents: 10_000, currency: "gbp", method: "stripe", paidAt: 6 },
    { amountCents: 5_000, currency: "gbp", method: "stripe", paidAt: 5 },
    { amountCents: 20_000, currency: "gbp", method: "bank-transfer", paidAt: 4 },
    { amountCents: 3_000, currency: "gbp", method: "cash", paidAt: 3 },
    { amountCents: 4_000, currency: "usd", method: "manual", paidAt: 2 },   // legacy → other
    { amountCents: 1_000, currency: "gbp", method: "other", paidAt: 1 },
  ];
  const summary = summariseMoneyInByChannel(records);
  const byChannel = Object.fromEntries(summary.channels.map(channel => [channel.channel, channel]));

  assert.equal(summary.channels.length, 4, "all four channels always present, even zero ones");
  assert.equal(summary.totalCount, 6);

  assert.deepEqual(byChannel.stripe.totalsByCurrency, [["gbp", 15_000]]);
  assert.equal(byChannel.stripe.count, 2);
  assert.deepEqual(byChannel["bank-transfer"].totalsByCurrency, [["gbp", 20_000]]);
  assert.equal(byChannel.cash.count, 1);

  // The legacy "manual" record folds into "other", alongside the explicit
  // "other" record, tracked per currency (never summed across gbp + usd).
  assert.equal(byChannel.other.count, 2);
  assert.deepEqual(byChannel.other.totalsByCurrency, [["gbp", 1_000], ["usd", 4_000]]);
});

test("an empty world still reports all four channels at zero (never hides a channel)", () => {
  const summary = summariseMoneyInByChannel([]);
  assert.equal(summary.channels.length, 4);
  assert.equal(summary.totalCount, 0);
  for (const channel of summary.channels) {
    assert.equal(channel.count, 0);
    assert.deepEqual(channel.totalsByCurrency, []);
  }
});
