// Health Check -> Public Funnel -> Business OS journey.
//
// Drives the real public route handlers in-process against the memory backend.
// This proves that an anonymous completion is capture-only: it can register a
// brand-new lead, but cannot mint/reissue a session or attach to an existing
// identity. Mailbox-verified BOS continuation is a separate future flow.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.PORTAL_BACKEND = "memory";
process.env.PORTAL_SESSION_SECRET = "health-check-funnel-smoke-secret";
process.env.FOUNDER_PASSWORD = "AquaHealthCheck2026!";

const completionBody = {
  email: "health-check-journey@example.com",
  completionId: "hc_route_result_0001",
  sourceUrl: "http://localhost/health-check/",
  slot: {
    slot: 3,
    bucket: "building",
    schemaVersion: 1,
    summary: {
      score: 61,
      maxScore: 100,
      percentage: 61,
      stage: "Building",
      strengths: ["Clear offer"],
      priorities: ["Create a repeatable sales rhythm"],
    },
  },
};

function completionRequest(
  NextRequest: typeof import("next/server").NextRequest,
  body: Record<string, unknown> = completionBody,
) {
  return new NextRequest("http://localhost/api/public/health-check/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Health Check public-funnel journey", () => {
  it("persists a new lead once without returning identity or authentication", async () => {
    const [
      { NextRequest },
      completeRoute,
      contextRoute,
      { ensurePublicFunnelFoundationRegistered, publicFunnelContainerFor },
      { makePluginStorage },
      { getInstall },
      { getAgencyBySlug },
      { getUser },
    ] = await Promise.all([
      import("next/server"),
      import("../src/app/api/public/health-check/complete/route"),
      import("../src/app/api/public/business-os/context/route"),
      import("../src/built-ins/runtime/foundation-adapters/publicFunnelFoundation"),
      import("../src/lib/server/pluginStorage"),
      import("../src/server/pluginInstalls"),
      import("../src/server/tenants"),
      import("../src/server/users"),
    ]);

    const firstResponse = await completeRoute.POST(completionRequest(NextRequest));
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json() as Record<string, unknown>;
    assert.equal(first.ok, true);
    assert.equal(first.persisted, true);
    assert.equal(first.created, true);
    assert.equal(first.redirect, "/business-os/app.html?from=hc");
    assert.equal(first.authentication, "email_verification_required");
    assert.equal("captureId" in first, false);
    assert.equal("leadUserId" in first, false);
    assert.equal(firstResponse.headers.get("set-cookie"), null);

    ensurePublicFunnelFoundationRegistered();
    const founderAgency = getAgencyBySlug("milesymedia");
    assert.ok(founderAgency);
    const funnelInstall = getInstall({ agencyId: founderAgency.id }, "public-funnel");
    assert.ok(funnelInstall);
    const lead = getUser(completionBody.email);
    assert.ok(lead);
    assert.equal(lead.role, "lead");
    const directContext = await publicFunnelContainerFor({
      agencyId: founderAgency.id,
      install: funnelInstall,
      storage: makePluginStorage(funnelInstall.id),
    }).funnel.meContext(lead.id);
    assert.ok(directContext?.hcSlot, "the authoritative funnel row must retain its Health Check slot");

    const secondResponse = await completeRoute.POST(completionRequest(NextRequest));
    assert.equal(secondResponse.status, 400);
    assert.equal(secondResponse.headers.get("set-cookie"), null);
    assert.deepEqual(await secondResponse.json(), {
      ok: false,
      error: "invalid_completion",
      message: "The Health Check handoff details are invalid.",
      retryable: false,
    });

    const contextResponse = await contextRoute.GET(new NextRequest(
      "http://localhost/api/public/business-os/context",
    ));
    assert.equal(contextResponse.status, 200);
    assert.equal(contextResponse.headers.get("cache-control"), "private, no-store, max-age=0");
    const contextPayload = await contextResponse.json() as {
      ok: boolean;
      context: {
        leadUserId: string;
        email: string;
        hcSlot: typeof completionBody.slot;
      } | null;
    };
    assert.equal(contextPayload.ok, true);
    assert.equal(contextPayload.context, null);
  });

  it("rejects incomplete submissions without pretending they were persisted", async () => {
    const [{ NextRequest }, completeRoute] = await Promise.all([
      import("next/server"),
      import("../src/app/api/public/health-check/complete/route"),
    ]);
    const response = await completeRoute.POST(completionRequest(NextRequest, {
      completionId: "hc_route_result_0002",
      slot: completionBody.slot,
    }));
    assert.equal(response.status, 400);
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(payload.ok, false);
    assert.equal(payload.retryable, false);
  });

  it("cannot take over owner, manager, staff, client, or existing lead identities", async () => {
    const [
      { NextRequest }, completeRoute, { getAgencyBySlug }, users, tenants,
    ] = await Promise.all([
      import("next/server"),
      import("../src/app/api/public/health-check/complete/route"),
      import("../src/server/tenants"),
      import("../src/server/users"),
      import("../src/server/tenants"),
    ]);
    const agency = getAgencyBySlug("milesymedia");
    assert.ok(agency);
    const client = tenants.createClient(agency.id, {
      name: "HC takeover regression client",
      ownerEmail: "hc-client-owner@example.com",
    });
    const protectedUsers = [
      users.getUser("edwardhallam07@gmail.com"),
      users.createUser({ email: "hc-manager@example.com", password: "RegressionSecret42!", role: "agency-manager", agencyId: agency.id }),
      users.createUser({ email: "hc-staff@example.com", password: "RegressionSecret42!", role: "agency-staff", agencyId: agency.id }),
      users.createUser({ email: "hc-client-owner@example.com", password: "RegressionSecret42!", role: "client-owner", agencyId: agency.id, clientId: client.id }),
      users.getUser(completionBody.email),
    ];
    assert.ok(protectedUsers.every(Boolean));

    for (const [index, user] of protectedUsers.entries()) {
      assert.ok(user);
      const response = await completeRoute.POST(completionRequest(NextRequest, {
        email: user.email,
        completionId: `hc_takeover_${String(index).padStart(4, "0")}`,
        slot: { slot: 1 },
      }));
      assert.equal(response.status, 400, `anonymous capture accepted ${user.role}`);
      assert.equal(response.headers.get("set-cookie"), null, `${user.role} received a session cookie`);
      assert.deepEqual(await response.json(), {
        ok: false,
        error: "invalid_completion",
        message: "The Health Check handoff details are invalid.",
        retryable: false,
      });
    }
  });

  it("rejects forged email, completion id, and slot before any identity is created", async () => {
    const [{ NextRequest }, completeRoute, users] = await Promise.all([
      import("next/server"),
      import("../src/app/api/public/health-check/complete/route"),
      import("../src/server/users"),
    ]);
    const attempts = [
      { email: "not-an-email", completionId: "hc_forged_email_01", slot: { slot: 2 } },
      { email: "forged-id@example.com", completionId: "short", slot: { slot: 2 } },
      { email: "forged-slot@example.com", completionId: "hc_forged_slot_01", slot: { slot: 99 } },
    ];
    for (const body of attempts) {
      const response = await completeRoute.POST(completionRequest(NextRequest, body));
      assert.equal(response.status, 400);
      assert.equal(response.headers.get("set-cookie"), null);
      assert.equal((await response.json() as { error: string }).error, "invalid_completion");
    }
    assert.equal(users.getUser("forged-id@example.com"), null);
    assert.equal(users.getUser("forged-slot@example.com"), null);
  });

  it("ignores attacker-supplied tenant hints and captures only in the mounted founder funnel", async () => {
    const [
      { NextRequest }, completeRoute, { getAgencyBySlug, createAgency },
      { upsertInstall }, { makePluginStorage },
      { ensurePublicFunnelFoundationRegistered, publicFunnelContainerFor },
    ] = await Promise.all([
      import("next/server"),
      import("../src/app/api/public/health-check/complete/route"),
      import("../src/server/tenants"),
      import("../src/server/pluginInstalls"),
      import("../src/lib/server/pluginStorage"),
      import("../src/built-ins/runtime/foundation-adapters/publicFunnelFoundation"),
    ]);
    const decoy = createAgency({ name: "HC tenant confusion", slug: "hc-tenant-confusion" });
    const decoyInstall = upsertInstall({
      scope: { agencyId: decoy.id },
      pluginId: "public-funnel",
      enabled: true,
      installedBy: "regression",
    });
    const email = "hc-tenant-pinned@example.com";
    const response = await completeRoute.POST(completionRequest(NextRequest, {
      email,
      completionId: "hc_tenant_pinned_01",
      slot: { slot: 4 },
      agencyId: decoy.id,
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), null);

    ensurePublicFunnelFoundationRegistered();
    const founder = getAgencyBySlug("milesymedia");
    assert.ok(founder);
    const { getInstall } = await import("../src/server/pluginInstalls");
    const founderInstall = getInstall({ agencyId: founder.id }, "public-funnel");
    assert.ok(founderInstall);
    const founderCaptures = await publicFunnelContainerFor({
      agencyId: founder.id,
      install: founderInstall,
      storage: makePluginStorage(founderInstall.id),
    }).funnel.listByEmail(email);
    const decoyCaptures = await publicFunnelContainerFor({
      agencyId: decoy.id,
      install: decoyInstall,
      storage: makePluginStorage(decoyInstall.id),
    }).funnel.listByEmail(email);
    assert.equal(founderCaptures.length, 1);
    assert.equal(decoyCaptures.length, 0);
  });

  it("does not expose funnel context without the lead session", async () => {
    const [{ NextRequest }, contextRoute] = await Promise.all([
      import("next/server"),
      import("../src/app/api/public/business-os/context/route"),
    ]);
    const response = await contextRoute.GET(new NextRequest(
      "http://localhost/api/public/business-os/context",
    ));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, context: null });
  });
});
