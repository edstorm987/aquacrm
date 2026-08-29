// Which of email-sender's declared subscribers are actually connected.
//
// `EVENT_SUBSCRIPTIONS` reads like wiring. It is not: its own comment used to
// claim "Foundation's R6 router reads this list and subscribes", and **no such
// router exists** — found 2026-08-28 while sweeping for manifest fields nothing
// consumes. Every subscriber is connected by hand in `_eventSubscribers.ts`.
//
// "Wire up the dormant subscribers" then turned out to be four different jobs,
// not one, and two of them are not wirable at all:
//
//   ✅ crm.automation.email_requested  — emitted, wired
//   ✅ membership.subscription_changed — emitted, wired (address resolved in the wire)
//   ⚠ affiliate.payout_completed      — emitted, NOT wired: payload lacks the recipient
//   ❌ forms.notification.requested    — nothing emits it
//   ❌ auth.bootstrap.signup           — nothing emits it
//
// Wiring the last three anyway would have produced subscribers that look
// connected and send nothing — the same defect in a new costume. This file
// stops the notes going stale in either direction.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

const WIRING = "src/built-ins/runtime/foundation-adapters/_eventSubscribers.ts";
const ADAPTER = "src/built-ins/modules/email-sender/src/server/foundationAdapter.ts";

const wiring = readFileSync(WIRING, "utf8");
const adapter = readFileSync(ADAPTER, "utf8");

/** Every `.ts`/`.tsx` under src, so "nothing emits this" is a real claim. */
function allSource(dir = "src"): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...allSource(path));
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

const sources = allSource().map(path => ({ path, text: readFileSync(path, "utf8") }));

/** Does anything emit this event, outside email-sender's own declaration? */
function emitters(event: string): string[] {
  return sources
    .filter(file => !file.path.includes("email-sender"))
    .filter(file => !file.path.endsWith("_eventSubscribers.ts"))
    .filter(file => new RegExp(`["']${event.replace(/\./g, "\\.")}["']`).test(file.text))
    .map(file => file.path);
}

const isWired = (event: string): boolean =>
  new RegExp(`subscribeForPlugin\\(\\s*"email-sender",\\s*"${event.replace(/\./g, "\\.")}"`).test(wiring);

describe("email subscribers: declared vs actually connected", () => {
  it("the list does not claim a router that does not exist", () => {
    assert.doesNotMatch(
      adapter,
      /Foundation's R6 router\s*\n?\s*\/\/ reads this list, looks up the matching method/,
      "the old comment said a router reads this list and subscribes. It does not exist, and that "
      + "sentence is why four dead subscribers looked connected for months.",
    );
    assert.match(adapter, /declaration of intent, not a wiring mechanism/,
      "the list must say what it is");
  });

  it("the two that are wired really are", () => {
    for (const event of ["crm.automation.email_requested", "membership.subscription_changed"]) {
      assert.ok(isWired(event), `${event} must be subscribed in ${WIRING}`);
      assert.ok(emitters(event).length > 0 || event.startsWith("crm.automation"),
        `${event} must have an emitter, or wiring it achieves nothing`);
    }
  });

  it("the membership wire resolves an address the event does not carry", () => {
    // The handler's first line is `if (!payload.userEmail) return null`, and the
    // emitted payload has no email. Without this lookup the subscriber would be
    // connected and permanently silent.
    const block = /subscribeForPlugin\("email-sender", "membership\.subscription_changed"[\s\S]*?\n\}\);/.exec(wiring)?.[0] ?? "";
    assert.match(block, /userPort\.getUser\(payload\.userId\)/, "the recipient must be resolved");
    assert.match(block, /if \(!recipient\?\.email\) return;/,
      "and an unresolvable user must send nothing, rather than inventing a recipient");
    assert.match(block, /if \(!isWelcome && !isCancel\) return;/,
      "…and the cheap check must come before the lookup");
  });

  it("affiliate payout is still not wired, and the reason still holds", () => {
    assert.equal(isWired("affiliate.payout_completed"), false,
      "if this is now wired, delete this test — but first check the payload actually carries a "
      + "recipient, because the handler returns null without one");
    assert.ok(emitters("affiliate.payout_completed").length > 0, "it IS emitted — that half is real");
    const emitted = sources.find(file => file.path.endsWith("affiliates/src/server/payouts.ts"))?.text ?? "";
    assert.match(emitted, /payoutId: id,\s*\n\s*affiliateId: payout\.affiliateId,/,
      "the payload still carries affiliateId, not the affiliateUserId/affiliateEmail the handler needs");
  });

  it("the two with no emitter still have none", () => {
    // The strongest claim in this file, so it is re-derived from the whole tree
    // rather than trusted. If one gains an emitter, wiring it becomes worth
    // doing and this test says so.
    for (const event of ["forms.notification.requested", "auth.bootstrap.signup"]) {
      assert.deepEqual(
        emitters(event),
        [],
        `${event} now has an emitter. Wiring its subscriber is now worth doing — it was skipped only `
        + "because nothing fired it.",
      );
      assert.equal(isWired(event), false, `${event} has no emitter, so a subscriber would be dead code`);
    }
  });

  it("the sweep is looking at a real tree", () => {
    // Guards the guard: an empty file list would make every "nothing emits it"
    // claim pass trivially.
    assert.ok(sources.length > 500, `expected the source tree, walked ${sources.length} files`);
    assert.ok(emitters("membership.subscription_changed").length > 0,
      "a known emitter must be found, or the detector is broken");
  });
});
