// #187 — LIVE READINESS MUST NOT BE MASKED ON RAILWAY.
//
// `/healthz/full` used to fold readiness into its HTTP status only when
// `VERCEL_ENV === "production"`. On Railway that is false, so an explicitly
// unready release (`readyForProduction:false`) still answered HTTP 200, and the
// deployed commit SHA read `null`. These tests pin the substrate-aware
// contract in `src/lib/server/deployment.ts`, which both health routes and the
// storage safety net now share:
//   - production is detected on Railway / Vercel / generic hosts, never Vercel-only;
//   - a deployed SHA resolves from each platform's own variable;
//   - `/healthz/full` returns non-2xx in production when a required item is unready;
//   - local/dev/preview stay green while still reporting the truth in the body.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  deployedCommitSha,
  deploymentEnvironmentLabel,
  deploymentPlatform,
  isProductionDeployment,
  resolveFullHealthOk,
  shouldEnforceHealthReadiness,
  shouldRefuseEphemeralProductionStorage,
} from "../src/lib/server/deployment";

const SHA = "a808bb3ff41808c7cc78d5c95530d47b213ffde1";

describe("#187 deployment substrate detection", () => {
  describe("deploymentPlatform", () => {
    it("names Railway from its markers", () => {
      assert.equal(deploymentPlatform({ RAILWAY_ENVIRONMENT_NAME: "production" }), "railway");
      assert.equal(deploymentPlatform({ RAILWAY_SERVICE_ID: "svc_x" }), "railway");
    });
    it("names Vercel from its markers", () => {
      assert.equal(deploymentPlatform({ VERCEL: "1" }), "vercel");
      assert.equal(deploymentPlatform({ VERCEL_ENV: "preview" }), "vercel");
    });
    it("is a bare node host locally with no platform markers", () => {
      assert.equal(deploymentPlatform({ NODE_ENV: "development" }), "node");
      assert.equal(deploymentPlatform({ NODE_ENV: "production" }), "node");
    });
  });

  describe("deployedCommitSha", () => {
    it("reads the Railway commit SHA (the current substrate)", () => {
      assert.equal(deployedCommitSha({ RAILWAY_GIT_COMMIT_SHA: SHA }), SHA);
    });
    it("reads the Vercel commit SHA", () => {
      assert.equal(deployedCommitSha({ VERCEL_GIT_COMMIT_SHA: SHA }), SHA);
    });
    it("reads GitHub Actions and generic markers", () => {
      assert.equal(deployedCommitSha({ GITHUB_SHA: SHA }), SHA);
      assert.equal(deployedCommitSha({ SOURCE_COMMIT: SHA }), SHA);
    });
    it("prefers an explicit PORTAL_BUILD_SHA override", () => {
      assert.equal(deployedCommitSha({ PORTAL_BUILD_SHA: SHA, VERCEL_GIT_COMMIT_SHA: "other" }), SHA);
    });
    it("returns null rather than fabricating a value when unknown (local dev)", () => {
      assert.equal(deployedCommitSha({ NODE_ENV: "development" }), null);
      assert.equal(deployedCommitSha({ RAILWAY_GIT_COMMIT_SHA: "  " }), null);
    });
  });

  describe("isProductionDeployment", () => {
    it("is TRUE on Railway production (the #187 regression case)", () => {
      assert.equal(isProductionDeployment({ NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "production" }), true);
    });
    it("is TRUE on a generic recognised platform running NODE_ENV=production", () => {
      // Railway markers present but no explicit environment name still counts.
      assert.equal(isProductionDeployment({ NODE_ENV: "production", RAILWAY_SERVICE_ID: "svc_x" }), true);
    });
    it("is FALSE on a Railway non-production environment", () => {
      assert.equal(isProductionDeployment({ NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "staging" }), false);
    });
    it("is TRUE on Vercel production and FALSE on Vercel preview", () => {
      assert.equal(isProductionDeployment({ VERCEL_ENV: "production" }), true);
      assert.equal(isProductionDeployment({ VERCEL_ENV: "preview" }), false);
    });
    it("honours a generic PORTAL_ENV/APP_ENV marker", () => {
      assert.equal(isProductionDeployment({ PORTAL_ENV: "production" }), true);
      assert.equal(isProductionDeployment({ APP_ENV: "staging" }), false);
    });
    it("is FALSE for a local next dev (no markers, development)", () => {
      assert.equal(isProductionDeployment({ NODE_ENV: "development" }), false);
    });
    it("is FALSE for a local production build test (NODE_ENV=production, no platform)", () => {
      // This is what keeps `next start` acceptance lanes green rather than 503.
      assert.equal(isProductionDeployment({ NODE_ENV: "production" }), false);
    });
    it("IGNORES the health/readiness override entirely — a false flag cannot declassify production", () => {
      // The fail-open this replaces: previously `…=false` made this return false,
      // which also switched off the production storage guard. It must not.
      assert.equal(isProductionDeployment({ RAILWAY_ENVIRONMENT_NAME: "production", PORTAL_HEALTHZ_ENFORCE_READINESS: "false" }), true);
      assert.equal(isProductionDeployment({ VERCEL_ENV: "production", PORTAL_ENFORCE_READINESS: "false" }), true);
      assert.equal(isProductionDeployment({ RAILWAY_ENVIRONMENT_NAME: "production", PORTAL_HEALTHZ_ENFORCE_READINESS: "true" }), true);
      // A true flag does NOT fabricate production on a bare host (no platform markers).
      assert.equal(isProductionDeployment({ PORTAL_HEALTHZ_ENFORCE_READINESS: "true" }), false);
      assert.equal(isProductionDeployment({ NODE_ENV: "production", PORTAL_HEALTHZ_ENFORCE_READINESS: "true" }), false);
    });
  });

  describe("shouldEnforceHealthReadiness — the enforcement decision (separate, fail-closed)", () => {
    it("Railway production ALWAYS enforces — override unset, true, or false", () => {
      const railway = (o?: Record<string, string>) => ({ NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "production", ...o });
      assert.equal(shouldEnforceHealthReadiness(railway()), true);
      assert.equal(shouldEnforceHealthReadiness(railway({ PORTAL_HEALTHZ_ENFORCE_READINESS: "true" })), true);
      assert.equal(shouldEnforceHealthReadiness(railway({ PORTAL_HEALTHZ_ENFORCE_READINESS: "false" })), true); // cannot disable
      assert.equal(shouldEnforceHealthReadiness(railway({ PORTAL_ENFORCE_READINESS: "0" })), true);
    });
    it("Vercel/Render/Fly production also always enforce regardless of a false override", () => {
      assert.equal(shouldEnforceHealthReadiness({ VERCEL_ENV: "production", PORTAL_HEALTHZ_ENFORCE_READINESS: "off" }), true);
      assert.equal(shouldEnforceHealthReadiness({ NODE_ENV: "production", RENDER: "true", PORTAL_ENFORCE_READINESS: "no" }), true);
      assert.equal(shouldEnforceHealthReadiness({ NODE_ENV: "production", FLY_APP_NAME: "aqua", PORTAL_HEALTHZ_ENFORCE_READINESS: "false" }), true);
    });
    it("a TRUE flag opts a bare-Node production host into health enforcement", () => {
      assert.equal(shouldEnforceHealthReadiness({ NODE_ENV: "production", PORTAL_HEALTHZ_ENFORCE_READINESS: "true" }), true);
      assert.equal(shouldEnforceHealthReadiness({ PORTAL_ENFORCE_READINESS: "yes" }), true);
    });
    it("local dev and ordinary local next start do NOT enforce", () => {
      assert.equal(shouldEnforceHealthReadiness({ NODE_ENV: "development" }), false);
      assert.equal(shouldEnforceHealthReadiness({ NODE_ENV: "production" }), false); // bare `next start`, no flag
      assert.equal(shouldEnforceHealthReadiness({}), false);
    });
  });

  describe("shouldRefuseEphemeralProductionStorage — the storage guard is NOT disable-able via the health override", () => {
    it("trips for file/memory on Railway production EVEN with the false health override (the security fix)", () => {
      const railwayFalse = { NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "production", PORTAL_HEALTHZ_ENFORCE_READINESS: "false" };
      assert.equal(shouldRefuseEphemeralProductionStorage("file", railwayFalse), true);
      assert.equal(shouldRefuseEphemeralProductionStorage("memory", railwayFalse), true);
      // ...and with the legacy flag name too.
      assert.equal(shouldRefuseEphemeralProductionStorage("file", { VERCEL_ENV: "production", PORTAL_ENFORCE_READINESS: "false" }), true);
    });
    it("does NOT trip for a durable backend, or during the production build phase, or locally", () => {
      const railwayProd = { NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "production" };
      assert.equal(shouldRefuseEphemeralProductionStorage("postgres", railwayProd), false);
      assert.equal(shouldRefuseEphemeralProductionStorage("supabase", railwayProd), false);
      assert.equal(shouldRefuseEphemeralProductionStorage("file", { ...railwayProd, NEXT_PHASE: "phase-production-build" }), false);
      assert.equal(shouldRefuseEphemeralProductionStorage("file", { NODE_ENV: "development" }), false); // local dev
      assert.equal(shouldRefuseEphemeralProductionStorage("file", { NODE_ENV: "production" }), false); // bare local next start
    });
  });

  describe("deploymentEnvironmentLabel", () => {
    it("prefers the platform environment name over NODE_ENV", () => {
      assert.equal(deploymentEnvironmentLabel({ NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "production" }), "production");
      assert.equal(deploymentEnvironmentLabel({ NODE_ENV: "production", VERCEL_ENV: "preview" }), "preview");
    });
    it("falls back to NODE_ENV, then unknown", () => {
      assert.equal(deploymentEnvironmentLabel({ NODE_ENV: "development" }), "development");
      assert.equal(deploymentEnvironmentLabel({}), "unknown");
    });
  });

  describe("resolveFullHealthOk — the /healthz/full status decision", () => {
    it("READY + Railway production → ok (200)", () => {
      const r = resolveFullHealthOk({ env: { NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "production" }, probeOk: true, ready: true });
      assert.deepEqual(r, { ok: true, enforcingReadiness: true });
    });
    it("UNREADY + Railway production → NOT ok (503) — this is the fix", () => {
      const r = resolveFullHealthOk({ env: { NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "production" }, probeOk: true, ready: false });
      assert.deepEqual(r, { ok: false, enforcingReadiness: true });
    });
    it("UNREADY + Vercel production → NOT ok (503) — behaviour preserved", () => {
      const r = resolveFullHealthOk({ env: { VERCEL_ENV: "production" }, probeOk: true, ready: false });
      assert.deepEqual(r, { ok: false, enforcingReadiness: true });
    });
    it("UNREADY + Railway production + a FALSE health override → STILL NOT ok (503) — the fail-open fix", () => {
      const r = resolveFullHealthOk({ env: { NODE_ENV: "production", RAILWAY_ENVIRONMENT_NAME: "production", PORTAL_HEALTHZ_ENFORCE_READINESS: "false" }, probeOk: true, ready: false });
      assert.deepEqual(r, { ok: false, enforcingReadiness: true });
    });
    it("UNREADY + bare-Node with a TRUE opt-in flag → NOT ok (503)", () => {
      const r = resolveFullHealthOk({ env: { NODE_ENV: "production", PORTAL_ENFORCE_READINESS: "true" }, probeOk: true, ready: false });
      assert.deepEqual(r, { ok: false, enforcingReadiness: true });
    });
    it("UNREADY + local/dev → ok (200), readiness reported but not enforced", () => {
      const r = resolveFullHealthOk({ env: { NODE_ENV: "development" }, probeOk: true, ready: false });
      assert.deepEqual(r, { ok: true, enforcingReadiness: false });
    });
    it("a down primary database is never ok, even outside production", () => {
      const r = resolveFullHealthOk({ env: { NODE_ENV: "development" }, probeOk: false, ready: true });
      assert.equal(r.ok, false);
    });
    it("a down database in production is not ok either", () => {
      const r = resolveFullHealthOk({ env: { RAILWAY_ENVIRONMENT_NAME: "production", NODE_ENV: "production" }, probeOk: false, ready: true });
      assert.equal(r.ok, false);
    });
  });

  // Phase 8 — application-state health, not connectivity alone. A PortalState
  // hydration/parse failure must force 503 in EVERY environment: a SELECT 1 can
  // pass while the portal cannot read its own state. The route folds
  // hydrationOk into both probeOk and the final ok, and never swallows it.
  describe("/healthz/full treats a hydration failure as fatal", () => {
    const routeSource = readFileSync(
      new URL("../src/app/healthz/full/route.ts", import.meta.url),
      "utf8",
    );
    it("catches ensureHydrated failure and sets hydrationOk=false (not just a null plugin count)", () => {
      assert.match(routeSource, /hydrationOk\s*=\s*false/, "a hydration failure must set hydrationOk=false");
      assert.match(routeSource, /catch\s*\(error\)/, "the hydration catch must capture the error, not swallow it");
    });
    it("forces the overall ok false on hydration failure, independent of the readiness decision", () => {
      assert.match(routeSource, /probeOk:\s*probe\.ok\s*&&\s*hydrationOk/, "hydration must feed the probe signal");
      assert.match(routeSource, /const ok\s*=\s*decision\.ok\s*&&\s*hydrationOk/, "the final ok must AND in hydrationOk");
    });
  });
});
