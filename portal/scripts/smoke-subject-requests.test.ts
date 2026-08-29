// The DSAR register — GDPR Art. 12(3) and 12(6).
//
// `compliancePosture` recorded the gap precisely: "no request log, no
// identity-verification step and no response clock. If a regulator asked you to
// evidence a request you handled, you could show the erasure but not the
// request."
//
// The interesting property is the SEQUENCE. Erasure and export both work; the
// risk is performing one for the wrong person. So the test that matters is that
// fulfilment is refused until identity has been checked — a rule, not a prompt.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {}, paths: [], children: [],
} as never;

let storage: typeof import("../src/server/storage");
let requests: typeof import("../src/lib/server/compliance/subjectRequests");

before(async () => {
  process.env.PORTAL_BACKEND = "memory";
  storage = await import("../src/server/storage");
  await storage.ensureHydrated();
  requests = await import("../src/lib/server/compliance/subjectRequests");
});

const MONTH_ISH = 27 * 24 * 60 * 60 * 1000;

test("the clock is one calendar month from RECEIPT, not from logging", () => {
  // A request that arrives by post and is logged three days later is already
  // three days into its month. Running the clock from data entry would give
  // the controller time the regulation does not.
  const received = Date.UTC(2026, 0, 15, 9, 0, 0);
  const request = requests.recordSubjectRequest({
    agencyId: "agency_clock", kind: "access", subjectLabel: "someone@example.com",
    createdBy: "owner", receivedAt: received,
  });
  assert.equal(request.receivedAt, received);
  assert.equal(request.dueAt, Date.UTC(2026, 1, 15, 9, 0, 0), "one calendar month later");

  // Month-end: 31 January + one month must not roll into March. Rolling forward
  // would hand back MORE time than Art. 12(3) allows.
  const endOfMonth = requests.oneMonthAfter(Date.UTC(2026, 0, 31, 12, 0, 0));
  const asDate = new Date(endOfMonth);
  assert.equal(asDate.getUTCMonth(), 1, "31 Jan + 1 month must land in February, not March");
  assert.equal(asDate.getUTCDate(), 28, "clamped to the last day of the shorter month");
});

test("a request cannot be fulfilled before identity is checked", () => {
  // Art. 12(6). Releasing somebody's data to whoever asked for it is itself a
  // breach, and this is the one place the order can be ENFORCED rather than
  // remembered by whoever is on the rota that week.
  const agencyId = "agency_seq";
  const request = requests.recordSubjectRequest({
    agencyId, kind: "access", subjectLabel: "claimant@example.com", createdBy: "owner",
  });

  assert.throws(
    () => requests.fulfilSubjectRequest(agencyId, request.id, "owner", "Exported and sent."),
    (error: unknown) => (error as { code?: string }).code === "identity_unverified",
    "fulfilment must be refused while identity is unverified",
  );

  const verified = requests.verifySubjectRequestIdentity(agencyId, request.id, "owner");
  assert.ok(verified?.identityVerifiedAt, "verification must stamp a time");
  assert.equal(verified?.identityVerifiedBy, "owner", "and who did it");

  // Re-verifying must not move the timestamp — it is evidence, not a status.
  const stamp = verified!.identityVerifiedAt;
  const again = requests.verifySubjectRequestIdentity(agencyId, request.id, "someone-else");
  assert.equal(again?.identityVerifiedAt, stamp, "re-verifying must not rewrite the evidence");
  assert.equal(again?.identityVerifiedBy, "owner", "nor reassign who checked");

  const done = requests.fulfilSubjectRequest(agencyId, request.id, "owner", "Exported and sent.");
  assert.ok(done?.fulfilledAt, "now it may be fulfilled");

  // Closing twice would overwrite the original outcome and its timestamp.
  assert.throws(
    () => requests.fulfilSubjectRequest(agencyId, request.id, "owner", "Again"),
    (error: unknown) => (error as { code?: string }).code === "already_closed",
  );
});

test("an extension runs from the original deadline and must state a reason", () => {
  const agencyId = "agency_ext";
  const received = Date.UTC(2026, 2, 1, 0, 0, 0);
  const request = requests.recordSubjectRequest({
    agencyId, kind: "erasure", subjectLabel: "x@example.com", createdBy: "owner", receivedAt: received,
  });
  const originalDue = request.dueAt;

  assert.equal(
    requests.extendSubjectRequest(agencyId, request.id, "   "),
    null,
    "an extension with no reason is not an extension — the subject must be told why",
  );

  const extended = requests.extendSubjectRequest(agencyId, request.id, "Complex — records across three systems.");
  assert.ok(extended?.extendedAt);
  assert.equal(extended?.dueAt, requests.oneMonthAfter(requests.oneMonthAfter(originalDue)),
    "two further months from the ORIGINAL deadline; extending from today would reward answering late");
  assert.match(String(extended?.extensionReason), /Complex/);

  // Only once.
  assert.equal(requests.extendSubjectRequest(agencyId, request.id, "again"), null, "Art. 12(3) allows one extension");
});

test("the register is scoped, and the clock counts what is actually late", () => {
  const mine = "agency_mine_dsar";
  const theirs = "agency_theirs_dsar";
  const now = Date.now();

  const overdue = requests.recordSubjectRequest({
    agencyId: mine, kind: "access", subjectLabel: "late@example.com", createdBy: "owner",
    receivedAt: now - MONTH_ISH - 5 * 24 * 60 * 60 * 1000,
  });
  requests.recordSubjectRequest({
    agencyId: mine, kind: "access", subjectLabel: "soon@example.com", createdBy: "owner",
    receivedAt: now - MONTH_ISH + 3 * 24 * 60 * 60 * 1000,
  });
  requests.recordSubjectRequest({
    agencyId: theirs, kind: "access", subjectLabel: "not-ours@example.com", createdBy: "owner",
  });

  assert.equal(requests.listSubjectRequests(mine).length, 2, "another agency's requests are not in this register");
  assert.equal(requests.findSubjectRequest(theirs, overdue.id), null, "scope, then find");

  const clock = requests.subjectRequestClock(mine, now);
  assert.equal(clock.open, 2);
  assert.equal(clock.overdue, 1, "the one past its deadline");
  assert.equal(clock.dueWithin7Days, 1, "the one about to be");
  assert.equal(clock.awaitingIdentity, 2, "neither has been identity-checked yet");

  // A closed request leaves the clock.
  requests.verifySubjectRequestIdentity(mine, overdue.id, "owner");
  requests.fulfilSubjectRequest(mine, overdue.id, "owner", "Done.");
  assert.equal(requests.subjectRequestClock(mine, now).overdue, 0, "a fulfilled request is not still late");
});
