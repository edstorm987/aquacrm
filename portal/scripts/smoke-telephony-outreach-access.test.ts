import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { contactMatchesRecipient } from "../src/lib/telephony/contactRecipientPolicy";
import { agencyRoleMayContactResolvedSubject } from "../src/lib/telephony/prospectTargetAccess";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");
const CALL_ROUTE = read("src/app/api/portal/telephony/call/route.ts");
const EMAIL_ROUTE = read("src/app/api/portal/telephony/email/route.ts");

function routeParts(source: string): { get: string; post: string } {
  const postAt = source.indexOf("export async function POST");
  assert.notEqual(postAt, -1, "route has no POST handler");
  return { get: source.slice(0, postAt), post: source.slice(postAt) };
}

function assertBefore(source: string, first: string, second: string, message: string) {
  const firstAt = source.indexOf(first);
  const secondAt = source.indexOf(second);
  assert.ok(firstAt >= 0, `missing first boundary: ${first}`);
  assert.ok(secondAt >= 0, `missing second boundary: ${second}`);
  assert.ok(firstAt < secondAt, message);
}

describe("telephony outreach access boundaries", () => {
  it("denies staff whenever exact resolution contains a Prospect, including indirect ids", () => {
    assert.equal(agencyRoleMayContactResolvedSubject("agency-staff", { prospectId: "prospect-direct" }), false);
    assert.equal(agencyRoleMayContactResolvedSubject("agency-staff", {
      prospectId: "prospect-via-contact",
      contactId: "contact-hint",
    }), false, "a Contact id tunneled staff access into its linked Prospect");
    assert.equal(agencyRoleMayContactResolvedSubject("agency-staff", {
      prospectId: "prospect-via-lead",
      leadId: "lead-hint",
    }), false, "a Lead component tunneled staff access into its linked Prospect");
    assert.equal(agencyRoleMayContactResolvedSubject("agency-staff", { contactId: "contact-only" }), true);
    assert.equal(agencyRoleMayContactResolvedSubject("agency-staff", { leadId: "lead-only" }), true);
    assert.equal(agencyRoleMayContactResolvedSubject("agency-owner", { prospectId: "prospect-owner" }), true);
    assert.equal(agencyRoleMayContactResolvedSubject("agency-manager", { prospectId: "prospect-manager" }), true);

    for (const [name, source, providerBoundary] of [
      ["call", CALL_ROUTE, "initiatePhoneCall({"],
      ["email", EMAIL_ROUTE, "sendTransactionalEmail({"],
    ] as const) {
      const post = routeParts(source).post;
      assertBefore(post, "const exactSubject =", "agencyRoleMayContactResolvedSubject(session.role", `${name} checks Prospect access before exact resolution`);
      assertBefore(post, "agencyRoleMayContactResolvedSubject(session.role", providerBoundary, `${name} checks Prospect access after provider execution`);
      assert.match(post, /agencyRoleMayContactResolvedSubject\(session\.role, \{[\s\S]*?resolvedProspectId[\s\S]*?resolvedLeadId[\s\S]*?verifiedContactId/,
        `${name} does not authorize the complete canonical subject`);
      assert.match(post, /agencyRoleMayContactResolvedSubject[\s\S]*?status: 403/,
        `${name} does not return a real authorization refusal for a staff Prospect target`);
    }
  });

  it("requires the Sales Outreach element for every catalogue read and provider action", () => {
    for (const [name, source] of [["call", CALL_ROUTE], ["email", EMAIL_ROUTE]] as const) {
      const parts = routeParts(source);
      assert.match(
        parts.get,
        /requireCurrentWorkspaceElementAccess\("growth", "growth\.outreach", "view"\)/,
        `${name} catalogue reads can bypass Outreach view`,
      );
      assert.match(
        parts.post,
        /requireCurrentWorkspaceElementAccess\("growth", "growth\.outreach", "use"\)/,
        `${name} provider actions can bypass Outreach use`,
      );
      assertBefore(
        parts.post,
        'requireCurrentWorkspaceElementAccess("growth", "growth.outreach", "use")',
        "request.json()",
        `${name} parses an untrusted provider request before its Outreach use gate`,
      );
    }
  });

  it("filters client senders on reads and re-authorizes their exact client on writes", () => {
    for (const [name, source, providerBoundary] of [
      ["call", CALL_ROUTE, "initiatePhoneCall({"],
      ["email", EMAIL_ROUTE, "sendTransactionalEmail({"],
    ] as const) {
      const parts = routeParts(source);
      assert.match(
        parts.get,
        /if \(!sender\.clientId\) return true;[\s\S]*?resolveActorClientWorkspaceElementAccess\(actor, sender\.clientId\)[\s\S]*?clientWorkspaceElementLevel\(access, "client\.communications"\)[\s\S]*?"view"/,
        `${name} exposes a client-owned sender without exact-client Communications view`,
      );
      assert.match(
        parts.post,
        /sender\.clientId[\s\S]*?assertClientWorkspaceElementAccess\([\s\S]*?resolveActorClientWorkspaceElementAccess\(actor, sender\.clientId\)[\s\S]*?"client\.communications"[\s\S]*?"use"/,
        `${name} can execute with a client-owned sender without exact-client Communications use`,
      );
      assertBefore(
        parts.post,
        "assertClientWorkspaceElementAccess(",
        providerBoundary,
        `${name} authorizes the client-owned sender after the provider action`,
      );
    }
  });
});

describe("browser contact attribution", () => {
  it("matches only the exact phone or email inside the route tenant", () => {
    const contact = {
      agencyId: "agency-a",
      clientId: "client-a",
      phone: "+44 7700 900123",
      email: " Person@Example.com ",
    };

    assert.equal(contactMatchesRecipient(
      contact,
      { agencyId: "agency-a" },
      { channel: "call", phone: "07700 900123" },
    ), true);
    assert.equal(contactMatchesRecipient(
      contact,
      { agencyId: "agency-a", clientId: "client-a" },
      { channel: "email", email: "person@example.com" },
    ), true);
    assert.equal(contactMatchesRecipient(
      contact,
      { agencyId: "agency-b" },
      { channel: "call", phone: "07700 900123" },
    ), false, "a contact from another agency passed");
    assert.equal(contactMatchesRecipient(
      contact,
      { agencyId: "agency-a", clientId: "client-b" },
      { channel: "email", email: "person@example.com" },
    ), false, "a contact from another client passed");
    assert.equal(contactMatchesRecipient(
      contact,
      { agencyId: "agency-a" },
      { channel: "call", phone: "07700 900999" },
    ), false, "a contact id was accepted for a different phone");
    assert.equal(contactMatchesRecipient(
      contact,
      { agencyId: "agency-a" },
      { channel: "email", email: "other@example.com" },
    ), false, "a contact id was accepted for a different email");
  });

  it("rejects unverified ids before provider work and records only the verified id", () => {
    for (const [name, source, target, providerBoundary] of [
      ["call", CALL_ROUTE, '{ channel: "call", phone }', "initiatePhoneCall({"],
      ["email", EMAIL_ROUTE, '{ channel: "email", email: to }', "sendTransactionalEmail({"],
    ] as const) {
      const post = routeParts(source).post;
      assert.match(post, /if \(contactId\) \{[\s\S]*?verifyContactRecipient\(/,
        `${name} trusts a browser contact id without server verification`);
      assert.ok(post.includes(target), `${name} contact verification is not bound to its provider recipient`);
      assert.match(post, /if \(!matchesRecipient\) \{[\s\S]*?status: 409/,
        `${name} does not reject a stale, foreign or mismatched contact id`);
      assertBefore(
        post,
        "verifyContactRecipient(",
        providerBoundary,
        `${name} verifies contact attribution after provider execution`,
      );
      assert.doesNotMatch(post, /\.\.\.\(contactId \? \{ contactId \} : \{\}\)/,
        `${name} still writes the unverified browser contact id to audit metadata`);
      assert.match(post, /verifiedContactId \? \{ contactId: verifiedContactId \}/,
        `${name} audit metadata no longer uses the verified contact id`);
    }

    assert.match(EMAIL_ROUTE, /contactId: verifiedContactId \?\? ""/,
      "email idempotency still trusts the browser contact id");
    const resolver = read("src/lib/server/telephony/resolveCaller.ts");
    assert.match(resolver, /container\.contacts\.get\(contactId\)/,
      "contact verification does not load the tenant-scoped Contact row by id");
    assert.match(resolver, /contactMatchesRecipient\(contact, \{ agencyId, clientId \}, target\)/,
      "the loaded Contact is not checked against tenant and exact recipient");
  });

  it("retains an actor-attributed device-call handoff before the browser can navigate away", () => {
    const post = routeParts(CALL_ROUTE).post;
    assert.match(post, /result\.via === "device"[\s\S]*?action: "call\.device-handoff"/,
      "device calls still rely on a later browser callback for their audit record");
    assert.match(post, /idempotencyKey: `outreach-call-device:\$\{logicalCallId\}:\$\{logicalCallFingerprint\}`/,
      "replaying the same device handoff can duplicate its activity record");
    assert.match(post, /verifiedContactId \? \{ contactId: verifiedContactId \}/,
      "the retained device handoff is not bound to the verified Contact");
    assert.match(post, /if \(result\.via === "device"\) \{[\s\S]*?action: "call\.device-handoff"[\s\S]*?await flushPendingWrites\(\);[\s\S]*?\}\s*return NextResponse\.json\(/,
      "the device route returns before durably retaining the handoff");
  });
});
