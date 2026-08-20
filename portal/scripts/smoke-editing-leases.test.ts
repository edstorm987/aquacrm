import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  canTakeOver, claimLease, isLeaseActive, leaseNotice, leaseStatus,
  LEASE_DURATION_MS, TAKEOVER_AFTER_MS, type EditLease,
} from "../src/lib/editing/leases.ts";

const NOW = 1_000_000;
const lease = (over: Partial<EditLease> = {}): EditLease => ({
  documentId: "portal:cli_1", holderId: "ed", holderName: "Ed",
  startedAt: NOW - 60_000, expiresAt: NOW + 60_000, ...over,
});

describe("knowing somebody is already in here", () => {
  it("reports a colleague's active lease", () => {
    const status = leaseStatus({ lease: lease(), viewerId: "sam", now: NOW });
    assert.equal(status.state, "held");
  });

  it("does not warn you about yourself in another tab", () => {
    // Warning somebody about themselves teaches them to ignore the banner.
    const status = leaseStatus({ lease: lease(), viewerId: "ed", now: NOW });
    assert.equal(status.state, "clear");
  });

  it("clears once the lease has expired", () => {
    // The common way an edit ends is a closed laptop, not a click.
    const status = leaseStatus({ lease: lease({ expiresAt: NOW - 1 }), viewerId: "sam", now: NOW });
    assert.equal(status.state, "clear");
    assert.equal(isLeaseActive(lease({ expiresAt: NOW - 1 }), NOW), false);
  });

  it("is clear when nobody holds one", () => {
    assert.equal(leaseStatus({ viewerId: "sam", now: NOW }).state, "clear");
  });
});

describe("what the banner says", () => {
  it("names the person and how long they have been in there", () => {
    // "Somebody is editing" gives the reader nothing to act on.
    const status = leaseStatus({ lease: lease({ startedAt: NOW - 20 * 60_000 }), viewerId: "sam", now: NOW });
    assert.equal(leaseNotice(status), "Ed is making changes here for 20 minutes. Please leave it until they are done.");
  });

  it("reads naturally for a lease just started", () => {
    const status = leaseStatus({ lease: lease({ startedAt: NOW - 5_000 }), viewerId: "sam", now: NOW });
    assert.match(leaseNotice(status) ?? "", /just now/);
  });

  it("says nothing at all when nobody is editing", () => {
    assert.equal(leaseNotice({ state: "clear" }), null);
  });
});

describe("claiming and renewing", () => {
  it("claims a free document", () => {
    const result = claimLease({ documentId: "d", holderId: "ed", holderName: "Ed", now: NOW });
    assert.equal(result.claimed, true);
    assert.equal(result.lease.expiresAt, NOW + LEASE_DURATION_MS);
  });

  it("refuses to claim one somebody else is actively holding", () => {
    const result = claimLease({
      documentId: "d", holderId: "sam", holderName: "Sam", existing: lease(), now: NOW,
    });
    assert.equal(result.claimed, false);
    assert.equal(result.lease.holderId, "ed");
  });

  it("keeps the original start time when renewing", () => {
    // Otherwise the banner resets every heartbeat and always reads "just now",
    // so nobody can tell a two-minute edit from a two-hour one.
    const existing = lease({ startedAt: NOW - 20 * 60_000 });
    const result = claimLease({ documentId: "d", holderId: "ed", holderName: "Ed", existing, now: NOW });
    assert.equal(result.claimed, true);
    assert.equal(result.lease.startedAt, existing.startedAt);
    assert.equal(result.lease.expiresAt, NOW + LEASE_DURATION_MS);
  });

  it("takes over an expired lease", () => {
    const result = claimLease({
      documentId: "d", holderId: "sam", holderName: "Sam",
      existing: lease({ expiresAt: NOW - 1 }), now: NOW,
    });
    assert.equal(result.claimed, true);
    assert.equal(result.lease.holderId, "sam");
  });
});

describe("taking over", () => {
  it("is refused while somebody is genuinely working", () => {
    const status = leaseStatus({ lease: lease(), viewerId: "sam", now: NOW });
    assert.equal(canTakeOver(status, NOW), false);
  });

  it("is allowed once the lease looks abandoned", () => {
    // Somebody on holiday with a tab open must not block a client's portal
    // indefinitely — and a takeover is safe because the fingerprint check
    // still refuses any edit that would overwrite their work.
    const status = leaseStatus({
      lease: lease({ startedAt: NOW - TAKEOVER_AFTER_MS - 1 }), viewerId: "sam", now: NOW,
    });
    assert.equal(canTakeOver(status, NOW), true);
  });

  it("is always allowed when nobody holds it", () => {
    assert.equal(canTakeOver({ state: "clear" }, NOW), true);
  });
});

describe("the banner is advisory, not a lock", () => {
  it("never disables the form", () => {
    // Locking the fields would strand anybody whose colleague closed a laptop
    // without releasing, and the takeover is deliberately slower than that.
    const ui = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "src", "components", "editing", "EditingNotice.tsx"), "utf-8");
    assert.doesNotMatch(ui, /disabled=\{/);
    assert.match(ui, /role="status"/);
  });
});

describe("who gets told, and how firmly", () => {
  // The two sides are not symmetrical and should not pretend to be.
  const held = (over: Partial<Parameters<typeof leaseStatus>[0]> = {}) =>
    leaseStatus({ lease: lease(), viewerId: "sam", now: NOW, ...over });

  it("blocks a client while Aqua is working", () => {
    // A client cannot know that what they are about to type is going to be
    // overwritten by work already in progress.
    const status = held({ viewer: "client", holder: "agency" });
    assert.equal(status.state === "held" && status.access, "blocked");
  });

  it("only advises an agency user when a client is editing", () => {
    // Locking Aqua out of their own client's portal would be absurd.
    const status = held({ viewer: "agency", holder: "client" });
    assert.equal(status.state === "held" && status.access, "advisory");
  });

  it("only advises one agency user about another", () => {
    const status = held({ viewer: "agency", holder: "agency" });
    assert.equal(status.state === "held" && status.access, "advisory");
  });

  it("does not block one client because of another", () => {
    // Two clients colliding is their own business, and the conflict check
    // still covers it.
    const status = held({ viewer: "client", holder: "client" });
    assert.equal(status.state === "held" && status.access, "advisory");
  });

  it("defaults to the gentler behaviour when nobody says who is looking", () => {
    // The stricter behaviour must never be the default: a missing role would
    // otherwise lock people out of their own work.
    assert.equal(held().state === "held" && (held() as { access: string }).access, "advisory");
  });
});

describe("what a blocked client is told", () => {
  it("does not name the staff member or how long it has been", () => {
    // That reads as an excuse. What they need is that it is in hand.
    const status = leaseStatus({ lease: lease({ startedAt: NOW - 40 * 60_000 }), viewerId: "sam", now: NOW, viewer: "client", holder: "agency" });
    const notice = leaseNotice(status) ?? "";
    assert.doesNotMatch(notice, /Ed|40 minutes/);
    assert.match(notice, /Aqua is making changes/);
  });

  it("explains why rather than just refusing", () => {
    const status = leaseStatus({ lease: lease(), viewerId: "sam", now: NOW, viewer: "client", holder: "agency" });
    assert.match(leaseNotice(status) ?? "", /would be overwritten/);
  });
});

describe("the blocked client is given somewhere to put the request", () => {
  const read = () => require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "src", "components", "editing", "EditingOverlay.tsx"), "utf-8");

  it("captures it as a real client request, not a parallel system", () => {
    // The same pipeline the portal's own request form uses, so it surfaces in
    // Actions like any other rather than sitting somewhere nobody looks.
    assert.match(read(), /api\/tenants\/client-requests/);
    assert.match(read(), /"design-feedback"/);
  });

  it("promises what actually happens next", () => {
    assert.match(read(), /incorporate your changes once we/);
  });

  it("only appears for a blocked viewer", () => {
    assert.match(read(), /status\.access !== "blocked"\) return null/);
  });
});
