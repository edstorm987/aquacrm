// Health Check -> Public Funnel -> Business OS journey.
//
// Drives the real public route handlers in-process against the memory backend.
// This proves that an email-backed completion is durably captured, retry-safe,
// given a lead session, and restored into BOS from server context. It never
// touches the developer's local portal data file.

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
  it("persists once, resumes a retry, and restores the result into BOS", async () => {
    const [
      { NextRequest },
      completeRoute,
      contextRoute,
      { ensurePublicFunnelFoundationRegistered, publicFunnelContainerFor },
      { makePluginStorage },
      { getInstall },
      { getAgencyBySlug },
    ] = await Promise.all([
      import("next/server"),
      import("../src/app/api/public/health-check/complete/route"),
      import("../src/app/api/public/business-os/context/route"),
      import("../src/built-ins/runtime/foundation-adapters/publicFunnelFoundation"),
      import("../src/lib/server/pluginStorage"),
      import("../src/server/pluginInstalls"),
      import("../src/server/tenants"),
    ]);

    const firstResponse = await completeRoute.POST(completionRequest(NextRequest));
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json() as Record<string, unknown>;
    assert.equal(first.ok, true);
    assert.equal(first.persisted, true);
    assert.equal(first.created, true);
    assert.equal(first.redirect, "/business-os/app.html?from=hc");
    assert.match(String(first.captureId), /^lc_hc_hc_route_result_0001$/);

    const setCookie = firstResponse.headers.get("set-cookie");
    assert.ok(setCookie, "successful completion must issue a lead session cookie");
    assert.match(setCookie, /(?:^|,\s*)lk_session_v1=/);
    assert.match(setCookie, /HttpOnly/i);

    ensurePublicFunnelFoundationRegistered();
    const founderAgency = getAgencyBySlug("milesymedia");
    assert.ok(founderAgency);
    const funnelInstall = getInstall({ agencyId: founderAgency.id }, "public-funnel");
    assert.ok(funnelInstall);
    const directContext = await publicFunnelContainerFor({
      agencyId: founderAgency.id,
      install: funnelInstall,
      storage: makePluginStorage(funnelInstall.id),
    }).funnel.meContext(String(first.leadUserId));
    assert.ok(directContext?.hcSlot, "the authoritative funnel row must retain its Health Check slot");

    const secondResponse = await completeRoute.POST(completionRequest(NextRequest));
    assert.equal(secondResponse.status, 200);
    const second = await secondResponse.json() as Record<string, unknown>;
    assert.equal(second.persisted, true);
    assert.equal(second.captureId, first.captureId);
    assert.equal(second.leadUserId, first.leadUserId);
    assert.equal(second.created, false);

    const cookiePair = setCookie.split(";")[0];
    const contextResponse = await contextRoute.GET(new NextRequest(
      "http://localhost/api/public/business-os/context",
      { headers: { cookie: cookiePair ?? "" } },
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
    assert.ok(contextPayload.context);
    assert.equal(contextPayload.context.leadUserId, first.leadUserId);
    assert.equal(contextPayload.context.email, completionBody.email);
    assert.ok(
      contextPayload.context.hcSlot,
      `BOS context must include the saved Health Check slot: ${JSON.stringify(contextPayload)}`,
    );
    assert.deepEqual(contextPayload.context.hcSlot.summary, completionBody.slot.summary);
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
