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
import {
  resolveContactableScoutingProspect,
  type ProspectContactRecord,
} from "../src/lib/telephony/prospectOutreachPolicy";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const SCOUTING = read("src/app/portal/agency/pipelines/[slug]/_ScoutingCommand.tsx");

const inspected = ["business-verified", "contact-route-verified", "opportunity-confirmed"];
function prospect(input: Partial<ProspectContactRecord> & Pick<ProspectContactRecord, "id">): ProspectContactRecord {
  return { status: "scouting", inspectionChecks: inspected, inspectedAt: 1, ...input };
}

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

  it("the server records in the provider request and returns an explicit receipt", () => {
    // Moved server-side the same day it was built (Ed's finding): a separate
    // fire-and-forget log request could be lost to navigation, and device
    // (tel:) calls never fired a client callback at all. The buttons carry the
    // prospect id; the routes gate AND record.
    assert.match(SCOUTING, /prospectId=\{selected\.id\}/,
      "the buttons no longer identify the prospect, so the server cannot gate or record");
    const emailButton = read("src/components/telephony/EmailControls.tsx");
    assert.match(emailButton, /JSON\.stringify\(\[prospectId \?\? "", email \?\? ""\]\)/,
      "an email draft can leak between distinct prospect dossiers that share an address");
    assert.match(emailButton, /\[[^\]]*contactId, prospectId, onSent, onPrepared, onPendingChange[^\]]*\]/,
      "the send callback can retain the previous prospect id after the selected dossier changes");
    assert.match(emailButton, /logicalSendRef/,
      "email retries no longer retain one logical-send identity for the reviewed payload");
    assert.match(emailButton, /logicalSendId, \.\.\.\(phone/,
      "the logical-send identity is no longer sent to the server");
    // Narrowed to the AUTO-log's own signature: the manual outcome form also
    // posts prospects/outreach, and that one is the point — the person
    // recording "no answer" after the call. Only the fire-and-forget
    // attempted/sent auto-log is forbidden.
    assert.doesNotMatch(SCOUTING, /outcome: channel === "call" \? "attempted" : "sent"/,
      "the client-side auto-log is back — it loses attempts to navigation");
    const call = read("src/app/api/portal/telephony/call/route.ts");
    assert.match(call, /assertProspectContactable/, "the call route no longer gates on the prospect");
    assert.match(call, /const \{ actor \} = await requireCurrentWorkspaceElementAccess\("growth", "growth\.outreach", "use"\)/,
      "a direct call request can bypass the Outreach use grant");
    assert.match(call, /phone,\s*\}\)/,
      "the call gate is not bound to the phone the provider will dial");
    assert.match(call, /recordProspectOutreach\([\s\S]*?tenant\.agencyId,[\s\S]*?resolvedProspectId,[\s\S]*?"call",[\s\S]*?"attempted"/,
      "the call route no longer records the attempt");
    assert.match(call, /const outreachAttemptId = resolvedProspectId[\s\S]*?`call_\$\{crypto\.createHash\("sha256"\)/,
      "a provider-call replay no longer receives one stable ledger identity");
    assert.match(call, /logicalCallId/,
      "the call route no longer requires a client-generated replay identity");
    assert.match(call, /\.\.\.outreachReceipt/,
      "the call response hides whether the successful provider action reached the prospect ledger");
    const email = read("src/app/api/portal/telephony/email/route.ts");
    assert.match(email, /const \{ actor \} = await requireCurrentWorkspaceElementAccess\("growth", "growth\.outreach", "use"\)/,
      "a direct email request can bypass the Outreach use grant");
    assert.match(email, /email: to/,
      "the email gate is not bound to the recipient the provider will send to");
    assert.match(email, /recordProspectOutreach\([\s\S]*?tenant\.agencyId,[\s\S]*?resolvedProspectId,[\s\S]*?"email",[\s\S]*?"sent"/,
      "the email route no longer records the send");
    assert.match(email, /externalRef: `outreach:\$\{logicalSendId\}:\$\{logicalSendFingerprint\}`/,
      "email retries no longer reuse the logical-send id as the provider idempotency reference");
    assert.match(email, /const outreachAttemptId = `email_\$\{crypto\.createHash\("sha256"\)/,
      "the Prospect attempt id is not bound to the canonical email payload");
    assert.match(email, /\^\[A-Za-z0-9\]\[A-Za-z0-9\._:-\]\{7,159\}\$/,
      "oversized logical-send ids are silently truncated into another send identity");
    assert.match(email, /idempotencyKey: `outreach-email:\$\{logicalSendId\}:\$\{logicalSendFingerprint\}`/,
      "an email retry can duplicate the general activity ledger");
    assert.match(email, /\.\.\.outreachReceipt/,
      "the email response hides whether the successful delivery reached the prospect ledger");
    const gate = read("src/lib/telephony/prospectOutreachPolicy.ts");
    assert.match(gate, /The recipient does not match this prospect/,
      "a valid prospect id can be paired with a different recipient");
    assert.match(gate, /candidate => candidate\.status === "scouting" && matchesRecipient\(candidate/,
      "omitting prospectId no longer resolves the active dossier from the actual recipient");
    const button = read("src/components/telephony/CallControls.tsx");
    assert.match(button, /onCalled\?\.\(readProspectOutreachReceipt\(result\)\);\s*\n\s*window\.location\.href = `tel:/,
      "the device branch returns before onCalled again — device calls vanish from the ledger");
    assert.match(button, /onCalled\?: \(receipt: ProspectOutreachReceipt\) => void/,
      "the call control no longer exposes ledger status and attempt id to its parent");
    assert.match(emailButton, /onSent\?: \(receipt: ProspectOutreachReceipt\) => void/,
      "the email control no longer exposes ledger status and attempt id to its parent");
    assert.match(SCOUTING, /setActiveAttemptId\(receipt\.outreachAttemptId\)/,
      "the command no longer retains the provider attempt for human disposition");
    assert.match(SCOUTING, /attemptId: activeAttemptId/,
      "the manual outcome creates a second attempt instead of finalising the provider row");
    assert.match(SCOUTING, /setActiveAttemptId\(undefined\)/,
      "a completed or switched dossier can retain a stale provider attempt");
    assert.match(SCOUTING, /selectedProspectIdRef\.current !== prospectId/,
      "a late provider receipt can attach itself to a different selected prospect");
    assert.match(SCOUTING, /setOutcome\(channel === "email" \? "sent" : "attempted"\)/,
      "email delivery repair no longer starts from the truthful sent outcome");
    assert.match(SCOUTING, /const outreachLocked = providerPending !== null \|\| heldProviderReceipt/,
      "the shared command lock no longer spans provider requests and unfinalised receipts");
    assert.match(SCOUTING, /<CallButton[\s\S]*?disabled=\{outreachLocked\}[\s\S]*?onPendingChange=\{pending => onProviderPendingChange\(selected\.id, "call", pending\)\}/,
      "the call control can overlap another provider action or lose its bound dossier");
    assert.match(SCOUTING, /<EmailButton[\s\S]*?disabled=\{outreachLocked\}[\s\S]*?onPendingChange=\{pending => onProviderPendingChange\(selected\.id, "email", pending\)\}/,
      "the email control can overlap another provider action or lose its bound dossier");
    assert.match(SCOUTING, /if \(pending\) \{\s*setReadyForNext\(false\);[\s\S]*?setProviderPending\(\{ prospectId, channel \}\)/,
      "starting a provider action can inherit completion state from the previous contact");
    assert.match(button, /onPendingChange\?\.\(true\);\s*const response = await fetch/,
      "the call control does not acquire the shared lock immediately before its one provider request");
    assert.match(button, /finally \{\s*onPendingChange\?\.\(false\);\s*\}/,
      "the call control can strand its shared lock after a provider completion or error");
    assert.match(button, /Call status is unknown\. Check your handset or provider before trying again/,
      "an ambiguous call timeout is presented as definite failure and invites a duplicate call");
    assert.match(emailButton, /onPendingChange\?\.\(true\);\s*const response = await fetch/,
      "the email control does not acquire the shared lock immediately before its provider request");
    assert.match(emailButton, /finally \{\s*onPendingChange\?\.\(false\);\s*setBusy\(false\);\s*\}/,
      "the email control can strand its shared lock after a provider completion or error");
    assert.match(emailButton, /Email status is unknown\. Check the provider before retrying; Aqua will reuse this send reference/,
      "an ambiguous email timeout is presented as definite failure and invites an unsafe blind retry");
    assert.match(SCOUTING, /if \(receipt\.outreachRecorded\)[\s\S]*?else \{[\s\S]*?setReadyForNext\(false\)/,
      "the command can advance after delivery when its Prospect ledger write is still missing");
    const bridge = read("src/lib/server/telephony/prospectOutreach.ts");
    assert.match(bridge, /Promise<ProspectOutreachReceipt>/,
      "the provider-to-ledger bridge stopped returning an explicit receipt");
    assert.match(bridge, /outreachRecorded: false, outreachAttemptId: attemptId/,
      "ledger failure can no longer be distinguished from provider failure or manually repaired");
    const receipt = read("src/lib/telephony/prospectOutreachReceipt.ts");
    assert.match(receipt, /row\.outreachRecorded === true && Boolean\(outreachAttemptId\)/,
      "a malformed recorded receipt without an attempt id can advance the queue");
    const prospectService = read("src/built-ins/modules/leads-pipeline/src/server/prospects.ts");
    assert.match(prospectService, /attemptId: `\$\{id\}:\$\{attempt\.id\}`/,
      "reusing a client attempt token on another prospect can collapse two quota units");
    assert.match(prospectService, /outreachAttemptStateDigest\(attempt\)/,
      "note-only or follow-up-reason revisions can disappear from the idempotent audit trail");
  });

  it("opens the default email app only after an honest attempted receipt", () => {
    const emailRoute = read("src/app/api/portal/telephony/email/route.ts");
    const emailButton = read("src/components/telephony/EmailControls.tsx");
    assert.match(emailRoute, /id: "device:email"/,
      "the default email app is no longer an explicit sender choice");
    assert.match(emailRoute, /sender\.provider === "device"[\s\S]*?recordProspectOutreach\([\s\S]*?"email",[\s\S]*?"attempted"/,
      "opening a device composer no longer creates an honest attempted receipt first");
    assert.match(emailRoute, /action: "outreach\.email\.prepared"/,
      "the activity ledger incorrectly presents a prepared device draft as sent");
    assert.match(emailRoute, /mailto\.length > 8_000/,
      "oversized mailto drafts can be silently truncated by the operating system");
    assert.match(emailButton, /onPrepared\?: \(receipt: ProspectOutreachReceipt\) => void/,
      "the parent cannot distinguish a prepared device draft from a provider send");
    assert.match(emailButton, /result\.via === "device"[\s\S]*?onPrepared\?\.\(receipt\)[\s\S]*?window\.location\.href = result\.mailto/,
      "the receipt is not retained before control leaves for the default email app");
    assert.match(SCOUTING, /onPrepared=\{receipt => onDeviceEmailPrepared\(selected\.id, receipt\)\}/,
      "Outreach Command treats a prepared device draft as a sent provider email");
    assert.match(SCOUTING, /setOutcome\("attempted"\)/,
      "a prepared device draft does not require a real manual outcome");
  });

  it("closes the routes for an opted-out prospect, with words", () => {
    assert.match(SCOUTING, /has opted out of contact/,
      "an opted-out prospect shows no explanation — the buttons just vanish");
    assert.match(SCOUTING, /!selected\.doNotContact \?/,
      "the call/email controls no longer gate on opt-out");
  });

  it("keeps Researching useful without making it an outreach prerequisite", () => {
    const policy = read("src/lib/telephony/prospectOutreachPolicy.ts");
    const service = read("src/built-ins/modules/leads-pipeline/src/server/prospects.ts");
    const handlers = read("src/built-ins/modules/leads-pipeline/src/api/handlers.ts");
    assert.doesNotMatch(policy, /Complete the required scouting inspection before reaching out/,
      "the telephony boundary still treats optional research as authorisation");
    assert.doesNotMatch(service, /Complete the required scouting inspection before recording outreach/,
      "the ledger still rejects a valid outreach attempt solely because research is incomplete");
    assert.doesNotMatch(handlers, /Complete the business, contact-route, and opportunity inspection before qualifying/,
      "Add into Journey still treats optional Researching as a prerequisite");
    assert.match(handlers, /"scouting-inspection-checks": prospect\.inspectionChecks\.join\(","\)/,
      "available research evidence is no longer preserved during Journey conversion");
    assert.match(handlers, /if \(!prospect\.email && !prospect\.phone\)/,
      "Journey conversion no longer requires a real contact route");
    assert.match(handlers, /if \(prospect\.doNotContact\)/,
      "Journey conversion can bypass the do-not-contact hold");
  });
});

describe("the opt-out fence holds on the server", () => {
  it("binds an inspected dossier to the actual provider recipient", () => {
    const alice = prospect({
      id: "alice",
      phone: "+44 7700 900 111",
      email: "ALICE@example.com",
      inspectionChecks: [],
      inspectedAt: undefined,
    });
    const bob = prospect({ id: "bob", phone: "+44 7700 900 222", email: "bob@example.com" });
    const qualified = prospect({
      id: "qualified",
      status: "qualified",
      qualifiedLeadId: "lead-qualified",
      email: "qualified@example.com",
    });
    const dismissed = prospect({ id: "dismissed", status: "dismissed", email: "dismissed@example.com" });
    const suppressedQualified = prospect({
      id: "suppressed-qualified",
      status: "qualified",
      qualifiedLeadId: "lead-suppressed",
      email: "suppressed@example.com",
      doNotContact: true,
    });

    assert.throws(
      () => resolveContactableScoutingProspect([alice, bob], { prospectId: bob.id, phone: alice.phone }),
      /recipient does not match/i,
    );
    assert.throws(
      () => resolveContactableScoutingProspect([alice, bob], { prospectId: "missing", email: alice.email }),
      /no longer exists/i,
    );
    assert.equal(resolveContactableScoutingProspect([alice, bob], { phone: "07700 900111" })?.id, alice.id,
      "a newly scouted recipient should remain contactable before optional research");
    assert.equal(resolveContactableScoutingProspect([alice, bob], { phone: "07700 900222" })?.id, bob.id);
    assert.equal(resolveContactableScoutingProspect([alice, bob], { email: " BOB@EXAMPLE.COM " })?.id, bob.id);
    assert.equal(resolveContactableScoutingProspect([alice, bob], { phone: "+447700999999" }), undefined,
      "generic non-prospect telephony must remain available");
    assert.equal(
      resolveContactableScoutingProspect([qualified], { prospectId: qualified.id, email: " QUALIFIED@example.com " })?.id,
      qualified.id,
      "an explicitly selected qualified dossier must reach the server-side Lead lifecycle check",
    );
    assert.equal(resolveContactableScoutingProspect([qualified], { email: qualified.email }), undefined,
      "recipient-only resolution must not let a historic qualified dossier shadow Contact telephony");
    assert.throws(
      () => resolveContactableScoutingProspect([dismissed], { prospectId: dismissed.id, email: dismissed.email }),
      /Only active scouting or qualified prospects/i,
    );
    assert.throws(
      () => resolveContactableScoutingProspect(
        [suppressedQualified],
        { prospectId: suppressedQualified.id, email: suppressedQualified.email },
      ),
      /opted out/i,
      "qualification must not bypass the existing suppression hold",
    );
    assert.throws(
      () => resolveContactableScoutingProspect([qualified], { prospectId: qualified.id, email: bob.email }),
      /recipient does not match/i,
      "qualification must not weaken exact recipient binding",
    );
  });

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
