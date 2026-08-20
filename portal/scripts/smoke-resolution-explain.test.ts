import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { alertAge, clearanceFor, plainMeaningFor } from "../src/lib/inbox/resolutionExplain";
import { RESOLUTION_FOCUSES } from "../src/lib/inbox/resolutionContext";
import { inferResolutionFocus } from "../src/lib/inbox/resolutionFocus";

// Some alerts have no button: chasing a client, renewing insurance, waiting
// for somebody to sign in. Pointing a ring at a control that does not exist is
// worse than nothing, and an alert with no button and no explanation gets
// dismissed rather than dealt with.

describe("every alert family says what will clear it", () => {
  const families = [
    "enquiry-classification:", "person-organisation:", "invoice:", "payment-plan:",
    "contract-awaiting:", "compliance-expired:", "compliance-reminder:", "compliance-due:",
    "portal-access:", "contact:", "meeting:", "prospect-follow-up:",
    "campaign-budget:", "campaign-target:", "finance:budget-", "external-proposal:",
    "task:", "outage:", "development:errors:", "request:", "people:",
  ];

  it("states a clearance condition for every family the alert layer emits", () => {
    const missing = families.filter(prefix => !clearanceFor(`${prefix}x`).clearsWhen);
    assert.deepEqual(missing, [],
      `no clearance condition for: ${missing.join(", ")} — the operator cannot tell when they are done`);
  });

  it("stays silent for an unknown family rather than guessing", () => {
    // A wrong clearance sends someone to do the wrong thing, then wonder why
    // it is still firing. An undeclared family is a judgement call: the only
    // honest thing to say is that somebody has to look at it. Claiming
    // in-app would offer a Resolve button for a fix that may not exist.
    const unknown = clearanceFor("brand-new-thing:x");
    assert.equal(unknown.clearsWhen, undefined);
    assert.equal(unknown.kind, "judgement");
  });

  it("marks the genuinely off-screen work as off-system", () => {
    for (const prefix of ["invoice:", "contract-awaiting:", "portal-access:", "contact:", "meeting:"]) {
      assert.equal(clearanceFor(`${prefix}x`).kind, "off-system", `${prefix} happens off-screen`);
    }
  });

  it("does not mark in-app decisions as off-system", () => {
    for (const prefix of ["enquiry-classification:", "person-organisation:", "external-proposal:", "task:"]) {
      assert.equal(clearanceFor(`${prefix}x`).kind, "in-app", `${prefix} is resolved on screen`);
    }
  });

  it("covers every family that has a focus, so none is left unexplained", () => {
    const focused = ["enquiry-classification:", "person-organisation:", "invoice:", "task:",
      "contract-awaiting:", "portal-access:", "meeting:", "compliance-expired:"];
    for (const prefix of focused) {
      assert.ok(inferResolutionFocus(`${prefix}x`), `${prefix} should have a focus`);
      assert.ok(clearanceFor(`${prefix}x`).clearsWhen, `${prefix} should explain its clearance`);
    }
    assert.ok(RESOLUTION_FOCUSES.length > 0);
  });
});

describe("alert age reads naturally", () => {
  const now = 1_000_000_000_000;
  it("uses days, hours then minutes", () => {
    assert.equal(alertAge(now - 3 * 86_400_000, now), "3 days");
    assert.equal(alertAge(now - 86_400_000, now), "1 day");
    assert.equal(alertAge(now - 5 * 3_600_000, now), "5 hours");
    assert.equal(alertAge(now - 3_600_000, now), "1 hour");
    assert.equal(alertAge(now - 120_000, now), "2 minutes");
  });

  it("never reports a negative age for a future timestamp", () => {
    assert.equal(alertAge(now + 86_400_000, now), "0 minutes");
  });
});

describe("statistics get translated into something a human can act on", () => {
  // Ed's real alert: "Integration Coverage broke its historical pattern —
  // 99.0 robust deviations from its retained median", Current 1 · Median 0.
  // Going from 0 to 1 is an infinite deviation and a +100% change; presented
  // as urgent, alerts like this teach the operator to ignore Radar, which
  // costs far more than the alert is worth.
  const title = "Integration Coverage broke its historical pattern";
  const detail = "The current value is 99.0 robust deviations from its retained median.";
  const evidence = "Current 1 · Median 0 · Change +100.0%";

  it("says what the numbers actually mean", () => {
    const { plainMeaning } = plainMeaningFor(title, detail, evidence);
    assert.ok(plainMeaning, "a deviation alert must be translated");
    assert.match(plainMeaning!, /usually around 0/);
    assert.match(plainMeaning!, /Right now it is 1/);
    assert.doesNotMatch(plainMeaning!, /deviation/i, "the translation must not repeat the jargon");
  });

  it("warns that a zero baseline makes the percentage meaningless", () => {
    const { weakEvidence } = plainMeaningFor(title, detail, evidence);
    assert.ok(weakEvidence, "a median of 0 must be called out");
    assert.match(weakEvidence!, /not meaningful|worth acting on/i);
  });

  it("warns when both numbers are tiny, even without a zero baseline", () => {
    const { weakEvidence } = plainMeaningFor(title, detail, "Current 2 · Median 1");
    assert.ok(weakEvidence, "small numbers overstate percentage change");
  });

  it("leaves an ordinary alert untranslated", () => {
    const { plainMeaning } = plainMeaningFor("Overdue invoice", "INV-9 is 14 days late.");
    assert.equal(plainMeaning, undefined, "only jargon needs translating");
  });

  it("classifies radar pattern alerts as judgement, not a task", () => {
    // Nothing you press returns a metric to its median.
    const radar = clearanceFor("recommended-radar:integration-coverage");
    assert.equal(radar.kind, "judgement");
    assert.equal(radar.clearsWhen, undefined,
      "a judgement call must not claim a mechanical clearance condition");
  });
});
