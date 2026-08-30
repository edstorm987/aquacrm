// Who is on the phone — the contract for the two seconds before you say hello.
//
// Built 2026-08-29 for the cold-calling workflow: upload a CSV, dial through
// it, and when somebody rings back know instantly whether they are a paying
// client, a warm lead, or a name off a bought list you tried yesterday.
//
// The failures worth testing are the ones that would actually cost money:
//
//   • greeting a paying client as a cold prospect, because one human can be a
//     contact row AND a lead AND a client at the same time;
//   • dialling somebody who asked to be taken off the list;
//   • an inbound number failing to match the outbound number it was dialled
//     from, which would make every callback arrive as "unknown".

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  formatPhoneForDisplay, normalisePhone, samePhoneNumber,
} from "../src/lib/telephony/phoneNumbers";
import {
  categoryLabelFor, isDoNotCall, resolveCallerIdentity, type CallerRecord,
} from "../src/lib/telephony/callerIdentity";
// The dialler's own normaliser, imported from where the CALL is placed. If
// these two ever diverge, callbacks stop matching — so the test imports both.
import { normalisePhone as diallerNormalise } from "../src/lib/server/email/outboundCommunications";

function contact(over: Partial<CallerRecord> = {}): CallerRecord {
  return { source: "contact", id: "c1", phone: "07700900123", ...over };
}

describe("phone normalisation", () => {
  it("puts UK numbers written any of the usual ways onto one key", () => {
    const written = ["07700900123", "07700 900123", "+447700900123", "00447700900123", "+44 7700 900 123"];
    const keys = new Set(written.map(value => normalisePhone(value)));
    assert.equal(keys.size, 1, `expected one key, got ${[...keys].join(", ")}`);
    assert.equal([...keys][0], "+447700900123");
  });

  it("refuses what is not a phone number, rather than dialling it", () => {
    // CSV columns are full of this. None of it may become a call.
    for (const junk of ["", "   ", "ask for Dave", "ext 204", "123", "-", "n/a"]) {
      assert.equal(normalisePhone(junk), null, `"${junk}" must not normalise`);
    }
  });

  it("rejects a number too long to be E.164", () => {
    assert.equal(normalisePhone("+4477009001234567"), null);
  });

  it("is the SAME function the dialler uses", () => {
    // The whole reason this module exists. A second implementation that drifted
    // would mean a prospect dialled on Monday arrives unrecognised on Tuesday.
    assert.equal(diallerNormalise, normalisePhone,
      "outboundCommunications must re-export the shared normaliser, not keep its own");
  });

  it("matches two differently-written forms of one line", () => {
    assert.equal(samePhoneNumber("07700 900123", "+447700900123"), true);
    assert.equal(samePhoneNumber("07700900123", "07700900124"), false);
    assert.equal(samePhoneNumber("", "+447700900123"), false, "junk must never match");
  });

  it("shows a UK number the way a person would read it back", () => {
    assert.equal(formatPhoneForDisplay("+447700900123"), "07700 900123");
    assert.equal(formatPhoneForDisplay("+441204123456"), "01204 123456");
    assert.equal(formatPhoneForDisplay("+12125550100"), "+12125550100", "non-UK stays E.164");
  });
});

describe("a number belonging to more than one record", () => {
  // The expensive mistake: this human is a paying client AND still sitting in
  // the bought CSV you imported in March.
  const records: CallerRecord[] = [
    contact({ id: "cold", name: "K Webb", lastCallOutcome: "no answer" }),
    { source: "lead", id: "lead1", phone: "07700900123", name: "Karen Webb", leadStatus: "contacted" },
    contact({ id: "linked", name: "Karen Webb", clientId: "cl1", clientStage: "live", clientName: "Bolton Dental" }),
  ];
  const identity = resolveCallerIdentity("+447700900123", records);

  it("answers CLIENT, not cold prospect", () => {
    assert.equal(identity.kind, "client");
    assert.equal(identity.clientId, "cl1");
  });

  it("names the stage, because onboarding and live are different conversations", () => {
    assert.equal(identity.categoryLabel, "Client · Live");
  });

  it("still reports the other records rather than hiding them", () => {
    assert.equal(identity.matches.length, 3, "one human really can be all three");
  });
});

describe("categories you answer the phone on", () => {
  it("a client in onboarding reads differently from a live one", () => {
    assert.equal(categoryLabelFor(contact({ clientId: "c", clientStage: "onboarding" })), "Client · Onboarding");
    assert.equal(categoryLabelFor(contact({ clientId: "c", clientStage: "live" })), "Client · Live");
  });

  it("a lead carries its pipeline status", () => {
    assert.equal(
      categoryLabelFor({ source: "lead", id: "l", phone: "07700900123", leadStatus: "meeting-booked" }),
      "Lead · Meeting booked",
    );
  });

  it("a cold prospect you already rang says so — that changes the opener", () => {
    assert.equal(categoryLabelFor(contact({ lastCallOutcome: "no answer" })), "Cold prospect · No answer");
    assert.equal(categoryLabelFor(contact({ lastContactedAt: 1_700_000_000_000 })), "Cold prospect · contacted");
    assert.equal(categoryLabelFor(contact()), "Cold prospect");
  });

  it("an unrecognised number says unknown rather than guessing", () => {
    const identity = resolveCallerIdentity("+447700900999", [contact()]);
    assert.equal(identity.kind, "unknown");
    assert.equal(identity.categoryLabel, "Unknown number");
    assert.equal(identity.displayName, "+447700900999", "with no name, show the number");
  });
});

describe("do not call", () => {
  it("is honoured however it was written", () => {
    for (const tag of ["do-not-call", "DNC", "Opt-Out", "do not call"]) {
      assert.equal(isDoNotCall({ tags: [tag] }), true, `"${tag}" must count`);
    }
    assert.equal(isDoNotCall({ tags: ["warm", "bolton"] }), false);
  });

  it("respects an explicit flag as well as a tag", () => {
    assert.equal(isDoNotCall({ doNotCall: true }), true);
  });

  it("sticks to the number even when only ONE record carries it", () => {
    // Somebody who opted out on their lead row has not consented via a stale
    // contact row imported from a different list.
    const identity = resolveCallerIdentity("07700900123", [
      contact({ id: "stale" }),
      { source: "lead", id: "l", phone: "07700900123", tags: ["do-not-call"] },
    ]);
    assert.equal(identity.doNotCall, true);
  });
});

describe("identifying by however the number was typed", () => {
  it("matches a CSV row written 07… against an inbound +44… call", () => {
    // The exact inbound case: Twilio always delivers E.164, and a bought CSV
    // never contains it.
    const identity = resolveCallerIdentity("+447700900123", [contact({ name: "Karen Webb" })]);
    assert.equal(identity.kind, "prospect");
    assert.equal(identity.displayName, "Karen Webb");
  });

  it("never matches records whose number is junk", () => {
    const identity = resolveCallerIdentity("+447700900123", [contact({ phone: "ask for Dave" })]);
    assert.equal(identity.kind, "unknown");
  });

  it("returns an identity for an unmatchable inbound number instead of throwing", () => {
    const identity = resolveCallerIdentity("withheld", [contact()]);
    assert.equal(identity.kind, "unknown");
    assert.equal(identity.phone, "withheld");
    assert.equal(identity.doNotCall, false);
  });

  it("falls back to company, then the number, for a nameless row", () => {
    assert.equal(resolveCallerIdentity("07700900123", [contact({ company: "Bolton Dental" })]).displayName, "Bolton Dental");
    assert.equal(resolveCallerIdentity("07700900123", [contact()]).displayName, "+447700900123");
  });
});

describe("the calling-line picker tells the truth about what it can do", () => {
  // Found by opening the page rather than by reading the code, 2026-08-29.
  //
  // `outboundCommunicationReadiness` ALWAYS pushes a `device:call` sender, so
  // the picker's list is never empty. The original "No calling number connected"
  // empty state was therefore unreachable — the exact declared-never-consumed
  // defect this codebase keeps finding, written the same day.
  //
  // With no Twilio connection the picker really reads "This device · Device
  // dialler", and pressing Call opens the phone's own dialler: it works, it
  // shows YOUR number, and it records nothing. That is worth saying out loud.

  it("a device-only list still offers a sender", () => {
    const source = readFileSync("src/lib/server/email/outboundCommunications.ts", "utf8");
    assert.match(source, /senders\.push\(\{ id: "device:call"/,
      "if this stops being unconditional, the picker's empty state becomes reachable again");
  });

  it("warns when nothing can place a bridged call", () => {
    const picker = readFileSync("src/components/telephony/CallControls.tsx", "utf8");
    assert.match(picker, /sender\.provider !== "device"/,
      "the question is not 'is the list empty' but 'can anything actually bridge'");
    assert.match(picker, /connect Twilio to call from a business number/);
  });

  it("no longer claims there is no calling number", () => {
    const picker = readFileSync("src/components/telephony/CallControls.tsx", "utf8");
    assert.doesNotMatch(picker, /No calling number connected/,
      "that state cannot happen and reading it would send somebody looking for a bug");
  });
});
