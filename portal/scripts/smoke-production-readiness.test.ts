import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectProductionReadiness } from "../src/lib/server/productionReadiness";

function productionEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    VERCEL_ENV: "production",
    PORTAL_BACKEND: "postgres",
    DATABASE_URL: "postgres://portal.example.invalid/milesymedia",
    PORTAL_SESSION_SECRET: "a-production-session-secret-over-32-characters",
    NEXT_PUBLIC_PORTAL_SECURITY: "strict",
    NEXT_PUBLIC_PORTAL_BASE_URL: "https://portal.milesymedia.co.uk",
    POSTMARK_SERVER_TOKEN: "postmark-token",
    MILESYMEDIA_FROM_EMAIL: "portal@milesymedia.co.uk",
    BLOB_READ_WRITE_TOKEN: "blob-token",
    ...overrides,
  };
}

describe("production readiness", () => {
  it("does not call an unconfigured local environment production-ready", () => {
    const result = inspectProductionReadiness({});
    assert.equal(result.environment, "local");
    assert.equal(result.ready, false);
    assert.equal(result.items.filter(item => item.required && item.status === "ready").length, 0);
  });

  it("accepts a fully configured production environment", () => {
    const result = inspectProductionReadiness(productionEnv());
    assert.equal(result.environment, "production");
    assert.equal(result.ready, true);
    assert.ok(result.items.filter(item => item.required).every(item => item.status === "ready"));
  });

  it("rejects an insecure public portal origin", () => {
    const result = inspectProductionReadiness(productionEnv({
      NEXT_PUBLIC_PORTAL_BASE_URL: "http://localhost:3032",
    }));
    assert.equal(result.ready, false);
    assert.equal(result.items.find(item => item.id === "security")?.status, "needs-setup");
  });

  it("requires durable customer data", () => {
    const result = inspectProductionReadiness(productionEnv({
      DATABASE_URL: "",
      PORTAL_BACKEND: "file",
    }));
    assert.equal(result.ready, false);
    assert.equal(result.items.find(item => item.id === "database")?.status, "needs-setup");
  });

  it("accepts each supported Vercel Blob credential", () => {
    for (const name of ["BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "VERCEL_OIDC_TOKEN"] as const) {
      const env = productionEnv({ BLOB_READ_WRITE_TOKEN: "" });
      env[name] = "configured";
      const result = inspectProductionReadiness(env);
      assert.equal(result.items.find(item => item.id === "uploads")?.status, "ready");
    }
  });

  it("keeps client billing and Sentry optional", () => {
    const result = inspectProductionReadiness(productionEnv(), {
      activeClientCount: 3,
      billingConfiguredClientCount: 0,
    });
    assert.equal(result.ready, true);
    assert.equal(result.items.find(item => item.id === "billing")?.status, "optional");
    assert.equal(result.items.find(item => item.id === "monitoring")?.status, "optional");
  });
});
