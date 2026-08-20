import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.PORTAL_HANDOFF_SECRET = "a-test-secret-that-is-long-enough-to-pass-32";

let handoff: typeof import("../src/lib/server/portalHandoff");
before(async () => { handoff = await import("../src/lib/server/portalHandoff"); });
beforeEach(() => handoff.clearRedeemedHandoffTokens());

const claims = {
  clientId: "cli_1", userId: "usr_1", email: "ruth@cedar.test", agencyId: "milesymedia",
};

describe("signing a client in from their own application", () => {
  it("mints a token that verifies", () => {
    const result = handoff.verifyHandoffToken(handoff.mintHandoffToken(claims));
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.claims.clientId, "cli_1");
  });

  it("refuses a token whose payload was edited", () => {
    // A stolen token must not be editable into a different client. The
    // signature covers the whole payload, so any change breaks it.
    const token = handoff.mintHandoffToken(claims);
    const [body, signature] = token.split(".");
    const tampered = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    tampered.clientId = "cli_someone_else";
    const forged = `${Buffer.from(JSON.stringify(tampered)).toString("base64url")}.${signature}`;
    assert.equal(handoff.verifyHandoffToken(forged).ok, false);
  });

  it("refuses a token signed with the wrong secret", () => {
    const token = handoff.mintHandoffToken(claims);
    const previous = process.env.PORTAL_HANDOFF_SECRET;
    process.env.PORTAL_HANDOFF_SECRET = "a-different-secret-also-long-enough-to-pass";
    const result = handoff.verifyHandoffToken(token);
    process.env.PORTAL_HANDOFF_SECRET = previous;
    assert.equal(result.ok, false);
  });

  it("expires quickly — a logged link is worthless within minutes", () => {
    const token = handoff.mintHandoffToken(claims, 1_000_000);
    assert.equal(handoff.verifyHandoffToken(token, 1_000_000 + 89_000).ok, true);
    const late = handoff.verifyHandoffToken(token, 1_000_000 + 120_000);
    assert.equal(late.ok, false);
    assert.equal(late.ok === false && late.reason, "expired");
  });

  it("refuses a token issued well in the future", () => {
    // A forged `iat` or a badly wrong clock, refused rather than accepted.
    const token = handoff.mintHandoffToken(claims, 2_000_000);
    const result = handoff.verifyHandoffToken(token, 1_000_000);
    assert.equal(result.ok === false && result.reason, "not-yet-valid");
  });

  it("rejects nonsense without throwing", () => {
    for (const bad of ["", "no-dot", ".", "a.b", undefined]) {
      assert.equal(handoff.verifyHandoffToken(bad as string).ok, false, `accepted "${bad}"`);
    }
  });
});

describe("a handoff link works exactly once", () => {
  it("redeems the first time and refuses after", () => {
    // A leaked token that has already been used is worthless.
    const token = handoff.mintHandoffToken(claims);
    const result = handoff.verifyHandoffToken(token);
    assert.ok(result.ok);
    const { jti, exp } = result.ok ? result.claims : { jti: "", exp: 0 };
    assert.equal(handoff.redeemHandoffToken(jti, exp), true);
    assert.equal(handoff.redeemHandoffToken(jti, exp), false, "a replayed token must be refused");
  });

  it("forgets tokens once they could not be valid anyway", () => {
    // Keeping them forever would grow without bound to guard against a replay
    // of something that expired long ago.
    handoff.redeemHandoffToken("old", 1_000, 1_000_000);
    assert.equal(handoff.redeemHandoffToken("old", 1_000, 5_000_000), true);
  });

  it("keeps two tokens for one client apart", () => {
    const first = handoff.verifyHandoffToken(handoff.mintHandoffToken(claims));
    const second = handoff.verifyHandoffToken(handoff.mintHandoffToken(claims));
    assert.notEqual(
      first.ok && first.claims.jti,
      second.ok && second.claims.jti,
      "two links must be independently redeemable",
    );
  });
});

describe("where a handoff can send somebody", () => {
  it("allows a path inside the portal", () => {
    assert.equal(handoff.safeDestination("/portal/customer/billing"), "/portal/customer/billing");
  });

  it("refuses anything that leaves the site", () => {
    // Otherwise this is an open redirect: a link that signs somebody in and
    // forwards them to an attacker's page, carrying Aqua's name with it.
    for (const bad of [
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "javascript:alert(1)",
      "portal/customer",
    ]) {
      assert.equal(handoff.safeDestination(bad), undefined, `allowed "${bad}"`);
    }
  });

  it("drops an unsafe destination at mint time, not just on arrival", () => {
    const token = handoff.mintHandoffToken({ ...claims, destination: "https://evil.test" });
    const result = handoff.verifyHandoffToken(token);
    assert.equal(result.ok && result.claims.destination, undefined);
  });
});

describe("it refuses to work without a secret", () => {
  it("will not mint with a missing or weak secret", () => {
    // Failing loudly beats signing with something guessable.
    const previous = process.env.PORTAL_HANDOFF_SECRET;
    for (const weak of ["", "short"]) {
      process.env.PORTAL_HANDOFF_SECRET = weak;
      process.env.SESSION_SECRET = weak;
      assert.throws(() => handoff.mintHandoffToken(claims));
    }
    process.env.PORTAL_HANDOFF_SECRET = previous;
  });
});
