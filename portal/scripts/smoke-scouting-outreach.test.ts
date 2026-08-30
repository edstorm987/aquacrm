// Scouting Stage 1 — outreach happens INSIDE scouting, protected and logged.
//
// Ed, 2026-08-30: *"the scouting needs to transition i need to be able to do
// the outreach inside it ... press call button ... if i want to email i press
// email simple and logging what i do how many times."* And his opt-out finding
// the same day: raw tel:/mailto: anchors sat beside protected controls, so the
// suppression could be walked around by clicking the other button.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const SCOUTING = read("src/app/portal/agency/pipelines/[slug]/_ScoutingCommand.tsx");

describe("scouting outreach is protected and logged", () => {
  it("mounts the telephony pair, not bare anchors, for call and email", () => {
    assert.match(SCOUTING, /<CallButton/, "the protected call control is gone");
    assert.match(SCOUTING, /<EmailButton/, "the protected email control is gone");
    assert.match(SCOUTING, /<CallLinePicker \/>/, "no way to choose which line calls go out on");
    assert.match(SCOUTING, /<EmailLinePicker \/>/, "no way to choose the sending address");
    // The raw routes those controls replaced. sms/wa.me/social anchors stay —
    // there is no protected equivalent for them yet.
    assert.doesNotMatch(SCOUTING, /href=\{`tel:\$\{selected\.phone\}`\}/,
      "the bare tel: anchor is back — it bypasses suppression and logs nothing");
    assert.doesNotMatch(SCOUTING, /href=\{`mailto:\$\{selected\.email\}`\}/,
      "the bare mailto: anchor is back — it bypasses suppression and logs nothing");
  });

  it("the SERVER records the attempt, atomically with delivery", () => {
    // Moved server-side the same day it was built (Ed's finding): a separate
    // fire-and-forget log request could be lost to navigation, and device
    // (tel:) calls never fired a client callback at all. The buttons carry the
    // prospect id; the routes gate AND record.
    assert.match(SCOUTING, /prospectId=\{selected\.id\}/,
      "the buttons no longer identify the prospect, so the server cannot gate or record");
    // Narrowed to the AUTO-log's own signature: the manual outcome form also
    // posts prospects/outreach, and that one is the point — the person
    // recording "no answer" after the call. Only the fire-and-forget
    // attempted/sent auto-log is forbidden.
    assert.doesNotMatch(SCOUTING, /outcome: channel === "call" \? "attempted" : "sent"/,
      "the client-side auto-log is back — it loses attempts to navigation");
    const call = read("src/app/api/portal/telephony/call/route.ts");
    assert.match(call, /assertProspectContactable/, "the call route no longer gates on the prospect");
    assert.match(call, /recordProspectOutreach\(tenant\.agencyId, prospectId, "call", "attempted"/,
      "the call route no longer records the attempt");
    const email = read("src/app/api/portal/telephony/email/route.ts");
    assert.match(email, /recordProspectOutreach\(tenant\.agencyId, prospectId, "email", "sent"/,
      "the email route no longer records the send");
    const button = read("src/components/telephony/CallControls.tsx");
    assert.match(button, /onCalled\?\.\(\);\s*\n\s*window\.location\.href = `tel:/,
      "the device branch returns before onCalled again — device calls vanish from the ledger");
  });

  it("closes the routes for an opted-out prospect, with words", () => {
    assert.match(SCOUTING, /has opted out of contact/,
      "an opted-out prospect shows no explanation — the buttons just vanish");
    assert.match(SCOUTING, /!selected\.doNotContact && selectedInspected \?/,
      "the call/email controls no longer gate on opt-out + inspection");
  });

  it("explains the inspection gate instead of 4xxing after the call", () => {
    // The server refuses outreach until the three required checks are done.
    // The UI mirrors the module's own inspectionComplete() so the person is
    // told BEFORE dialling, not after.
    assert.match(SCOUTING, /selected \? inspectionComplete\(selected\) : false/,
      "the gate no longer uses the module's own helper — a second copy will drift");
    assert.match(SCOUTING, /Complete the three required inspection checks/);
  });
});

describe("the opt-out fence holds on the server", () => {
  it("the email route resolves the RECIPIENT, not a browser-supplied phone", () => {
    const route = read("src/app/api/portal/telephony/email/route.ts");
    assert.match(route, /resolveEmailRecipient\(tenant\.agencyId, to, session\.userId\)/,
      "suppression is keyed on the browser's optional phone again — omitting the field skips the check");
    const resolver = read("src/lib/server/telephony/resolveCaller.ts");
    assert.match(resolver, /export async function resolveEmailRecipient/,
      "the email-keyed resolver is gone");
  });

  it("the contacts card no longer offers raw routes beside protected ones", () => {
    const contacts = read("src/app/portal/agency/leads-pipeline/contacts/_ContactsWorkspace.tsx");
    assert.doesNotMatch(contacts, /href=\{`tel:\$\{row\.phone\}`\}/,
      "the contacts card's bare tel: anchor is back");
  });

  it("the send path never uses the deployment's key for a non-founder", () => {
    const email = read("src/lib/server/email/transactionalEmail.ts");
    assert.match(email, /envMailAllowed \? process\.env\.RESEND_API_KEY/,
      "the founder gate left the send path — env-and-sellability §1.1 is back");
  });
});
