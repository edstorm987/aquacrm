// Hermetic side-effect proof for public request ceilings. Oversize streams
// must be cancelled before tenant lookup, rate accounting, proof, or storage.

process.env.PORTAL_BACKEND ??= "memory";

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require_ = createRequire(import.meta.url);
const { NextRequest } = require_("next/server") as typeof import("next/server");

type Handler = (request: import("next/server").NextRequest) => Promise<Response>;
type StubMap = Record<string, Record<string, unknown>>;

function counter() {
  let calls = 0;
  return { hit: () => { calls += 1; }, calls: () => calls };
}

async function withStubs(routePath: string, stubs: StubMap, operation: (handler: Handler) => Promise<void>) {
  const originals = new Map<string, NodeModule | undefined>();
  const routeId = require_.resolve(routePath);
  const oldRoute = require_.cache[routeId];
  try {
    for (const [modulePath, exports] of Object.entries(stubs)) {
      const id = require_.resolve(modulePath);
      originals.set(id, require_.cache[id]);
      require_.cache[id] = { id, filename: id, loaded: true, paths: [], children: [], exports } as NodeModule;
    }
    delete require_.cache[routeId];
    const handler = (require_(routePath) as { POST: Handler }).POST;
    await operation(handler);
  } finally {
    delete require_.cache[routeId];
    if (oldRoute) require_.cache[routeId] = oldRoute;
    for (const [id, original] of originals) {
      if (original) require_.cache[id] = original;
      else delete require_.cache[id];
    }
  }
}

function oversizedRequest(path: string, cap: number) {
  let produced = 0;
  let cancelled = false;
  const bytes = new TextEncoder().encode("x".repeat(cap + 16_384));
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (produced >= bytes.length) {
        controller.close();
        return;
      }
      const next = bytes.slice(produced, Math.min(produced + 4_096, bytes.length));
      produced += next.length;
      controller.enqueue(next);
    },
    cancel() { cancelled = true; },
  });
  const request = new NextRequest(`https://portal.example.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://site.example.test" },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  return { request, produced: () => produced, cancelled: () => cancelled };
}

describe("oversize streams stop before route side effects", { concurrency: false }, () => {
  it("admission stops before hydration, normalization, scope, rate, or managed proof", async () => {
    const probe = counter();
    const hit = () => { probe.hit(); throw new Error("downstream admission work ran"); };
    await withStubs("../src/app/api/public/aqua-tag-admission/route", {
      "../src/lib/enquiries/formCapture": { isSafeCapturedFieldKey: hit },
      "../src/lib/enquiries/submissionIdentity": { normaliseAquaSubmissionId: hit },
      "../src/lib/public/publicSites": { publicAquaPropertyId: hit },
      "../src/lib/server/rateLimit": { clientIpFromHeaders: hit, rateLimit: hit },
      "../src/lib/server/security/botChallenge": { verifyBotChallenge: hit },
      "../src/lib/server/security/aquaTagFormAdmission": {
        AQUA_TAG_FORM_CAPTURE_ACTION: "aqua-tag-form-capture",
        issueAquaTagFormAdmission: hit,
        resolveAquaTagAdmissionScope: hit,
      },
      "../src/server/storage": { ensureHydrated: hit },
    }, async handler => {
      const body = oversizedRequest("/api/public/aqua-tag-admission", 160 * 1_024);
      assert.equal((await handler(body.request)).status, 413);
      assert.equal(body.cancelled(), true);
      assert.ok(body.produced() <= 160 * 1_024 + 8_192);
      assert.equal(probe.calls(), 0);
    });
  });

  it("capture stops before hydration, admission proof, claim/storage, or rate work", async () => {
    const probe = counter();
    const hit = () => { probe.hit(); throw new Error("downstream capture work ran"); };
    await withStubs("../src/app/api/public/form-capture/route", {
      "../src/lib/server/rateLimit": { clientIpFromHeaders: hit, rateLimitBatch: hit, refundRateLimitBatch: hit },
      "../src/lib/public/publicSites": { PUBLIC_AQUA_SITES: {}, publicAquaPropertyId: hit, publicAquaSiteName: hit },
      "../src/lib/supabase/admin": { createSupabaseAdminClient: hit },
      "../src/server/websiteSources": { resolveWebsiteSourceRouting: hit },
      "../src/server/tenants": { getAgencyBySlug: hit },
      "../src/lib/server/seeds/founderSeed": { FOUNDER_AGENCY_SLUG: "founder" },
      "../src/lib/server/clients/clientRecordLedger": { upsertClientRecordLedgerEvent: hit },
      "../src/lib/server/enquirySubmissionOperation": { withEnquirySubmissionOperation: hit },
      "../src/lib/enquiries/formCapture": {
        additionalFields: hit,
        derivePurpose: hit,
        describeForm: hit,
        isSafeCapturedFieldKey: hit,
      },
      "../src/lib/enquiries/submissionIdentity": { normaliseAquaSubmissionId: hit },
      "../src/lib/supabase/enquirySubmissionClaims": {
        AquaTagCaptureCompletionError: class extends Error {},
        aquaTagTenantScope: hit,
        claimAquaTagCapture: hit,
        completeAquaTagCapture: hit,
        releaseAquaTagCapture: hit,
      },
      "../src/lib/server/security/aquaTagFormAdmission": {
        aquaTagCaptureDigest: hit,
        legacyAquaTagCaptureFingerprint: hit,
        resolveAquaTagAdmissionScope: hit,
        verifyAquaTagFormAdmission: hit,
      },
      "../src/server/storage": { ensureHydrated: hit },
    }, async handler => {
      const body = oversizedRequest("/api/public/form-capture", 160 * 1_024);
      assert.equal((await handler(body.request)).status, 413);
      assert.equal(body.cancelled(), true);
      assert.ok(body.produced() <= 160 * 1_024 + 8_192);
      assert.equal(probe.calls(), 0);
    });
  });

  it("telemetry stops before hydration, scope, limiter, sink, or consent storage", async () => {
    const probe = counter();
    const hit = () => { probe.hit(); throw new Error("downstream telemetry work ran"); };
    await withStubs("../src/app/api/telemetry/collect/route", {
      "../src/lib/server/clients/clientTelemetryService": { recordClientTelemetry: hit },
      "../src/server/agencyWebsite": { recordAgencyWebsiteTelemetry: hit },
      "../src/server/storage": { ensureHydrated: hit },
      "../src/lib/supabase/admin": { createSupabaseAdminClient: hit },
      "../src/lib/public/publicSites": { publicAquaPropertyId: hit, publicAquaSite: hit },
      "../src/lib/server/rateLimit": { clientIpFromHeaders: hit, rateLimit: hit },
      "../src/lib/server/security/aquaTagFormAdmission": { resolveAquaTagAdmissionScope: hit },
    }, async handler => {
      const body = oversizedRequest("/api/telemetry/collect", 32_768);
      assert.equal((await handler(body.request)).status, 413);
      assert.equal(body.cancelled(), true);
      assert.ok(body.produced() <= 32_768 + 8_192);
      assert.equal(probe.calls(), 0);
    });
  });
});
