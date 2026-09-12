process.env.PORTAL_BACKEND ??= "memory";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { websiteEnquiryBelongsToClientRecord } from "../src/lib/server/websiteEnquiries";

test("client records accept only an exact enquiry link with server-recorded provenance", () => {
  const exact = { clientId: "client-a", clientLinkSource: "configured-site-route" as const };
  assert.equal(websiteEnquiryBelongsToClientRecord(exact, "client-a"), true);
  assert.equal(websiteEnquiryBelongsToClientRecord(exact, "client-b"), false);
  assert.equal(websiteEnquiryBelongsToClientRecord({ clientId: "client-a" }, "client-a"), false);
  assert.equal(websiteEnquiryBelongsToClientRecord({ clientLinkSource: "manual-review" }, "client-a"), false);
});

test("customer and internal client portals never join enquiries by public email or phone", () => {
  const customerPortal = readFileSync("src/app/portal/customer/_portalData.ts", "utf8");
  const internalClient = readFileSync("src/app/portal/clients/[clientId]/page.tsx", "utf8");

  for (const source of [customerPortal, internalClient]) {
    assert.match(source, /websiteEnquiryBelongsToClientRecord\(enquiry, client\.id\)/);
    const matchedEnquiries = source.match(/const matchedEnquiries = websiteEnquiries\.filter\([\s\S]*?\);/)?.[0] ?? "";
    assert.ok(matchedEnquiries, "the client-record enquiry predicate must remain explicit and reviewable");
    assert.doesNotMatch(matchedEnquiries, /enquiry\.email|enquiry\.phone|customerEmails|customerPhones/);
  }
});
