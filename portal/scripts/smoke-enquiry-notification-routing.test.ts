// Where a public enquiry alert leaves from, and lands in.
//
// Ed, 2026-08-30: *"MILESYMEDIA_FROM_EMAIL, ENQUIRY_NOTIFY_TO,
// ENQUIRY_EMAIL_FROM ... should be setup in app not env since i may add
// multiple ... as i add more clients they may do there own emails etc."*
//
// The in-app path already existed — `catalog.ts` declares the fields and
// `resolveIntegrationValues` resolves them per-agency AND per-client. Three
// things were wrong:
//
//   1. `notifyBrandEnquiry` never passed a clientId, so per-client routing
//      could not happen however it was configured.
//   2. It fell back to a literal `edwardhallam07@gmail.com` and to Resend's
//      `onboarding@resend.dev` sandbox sender — so an unconfigured client's
//      customer data was mailed to the founder's personal inbox.
//   3. `|| process.env.RESEND_API_KEY` walked straight past
//      `mayUseEnvironmentCredentials`, the gate that exists precisely so a
//      second company does not silently send on the founder's key.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

describe("enquiry notifications route to the configured mailbox", () => {
  const source = read("src/lib/server/email/enquiryNotifications.ts");
  // Comments in this file deliberately NAME what was removed, so that the next
  // person understands why the fallbacks are absent. Assertions about what the
  // code does must therefore read the code, not the prose.
  const code = source
    .split("\n")
    .filter(line => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");

  it("never falls back to a person's own address or a sandbox sender", () => {
    // Comments may DESCRIBE what was removed; no code may reach it.
    assert.doesNotMatch(code, /edwardhallam07/,
      "a real person's inbox is back on a live send path");
    assert.doesNotMatch(code, /onboarding@resend\.dev/,
      "the Resend sandbox sender is back — it only ever delivers to the account owner");
  });

  it("consults the environment only through the founder gate", () => {
    // `resolveIntegrationValues` refuses environment credentials to any agency
    // that is not the founder's. Reading process.env for the KEY sidesteps it.
    assert.doesNotMatch(code, /process\.env\.RESEND_API_KEY/,
      "the API key is read directly again, so a second tenant sends on the founder's key");
    assert.match(source, /includeEnvironmentFallback: false/,
      "saved and environment values are no longer told apart");
  });

  it("resolves per client, not just per agency", () => {
    assert.match(source, /resolveEnquiryNotificationRouting\(\s*\n?\s*agencyId: string,\s*\n?\s*clientId\?: string,/,
      "the resolver no longer takes a client");
    assert.match(source, /resolveIntegrationValues\(agencyId, "resend", \{ clientId/,
      "the client scope is not passed through, so per-client routing cannot happen");
  });

  it("sends nothing rather than inventing a recipient or a sender", () => {
    assert.match(source, /if \(!apiKey \|\| !notifyTo \|\| !senderEmail\) return \{ attempted: false, sent: false \}/,
      "an unconfigured agency will attempt a send with a missing field");
  });

  it("routes on the configured site, never on the visitor guess", () => {
    // `identityResolution.clientId` is a guess about who the SUBMITTER is.
    // Routing outbound mail on it posts one client an enquiry that arrived on
    // another client's site.
    const route = read("src/app/api/public/brand-enquiry/route.ts");
    const call = route.slice(route.indexOf("await notifyBrandEnquiry({"));
    assert.match(call.slice(0, 1400), /clientId: routedClientId/,
      "the notification is not routed on the configured site");
    assert.doesNotMatch(call.slice(0, 1400), /clientId: owningClientId/,
      "outbound mail is being routed on the visitor identity guess");
  });

  it("keeps the personal address out of the shipped example env", () => {
    const example = read(".env.example");
    assert.doesNotMatch(example, /ENQUIRY_NOTIFY_TO=\S/,
      "the example env ships a real inbox as the default enquiry destination");
  });
});
