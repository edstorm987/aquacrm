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
    MILESYMEDIA_FROM_EMAIL: "portal@milesymedia.co.uk",
    RESEND_API_KEY: "resend-token",
    ENQUIRY_NOTIFY_TO: "owner@example.com",
    ENQUIRY_EMAIL_FROM: "AquaCRM enquiries <enquiries@example.com>",
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
      NEXT_PUBLIC_PORTAL_BASE_URL: "http://localhost:3030",
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

  it("does not accept a localhost database for a public deployment", () => {
    const result = inspectProductionReadiness(productionEnv({
      DATABASE_URL: "postgres://portal:secret@127.0.0.1:5432/milesymedia",
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

  it("accepts Supabase for both durable state and private uploads", () => {
    const result = inspectProductionReadiness(productionEnv({
      PORTAL_BACKEND: "supabase",
      DATABASE_URL: "",
      BLOB_READ_WRITE_TOKEN: "",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "server-service-role-key",
      NEXT_PUBLIC_SUPABASE_UPLOAD_BUCKET: "aquacrm-uploads",
    }));
    assert.equal(result.ready, true);
    assert.equal(result.items.find(item => item.id === "database")?.status, "ready");
    assert.equal(result.items.find(item => item.id === "uploads")?.status, "ready");
  });

  it("requires both account mail and enquiry notifications", () => {
    const withoutEnquiryMail = inspectProductionReadiness(productionEnv({ RESEND_API_KEY: "" }));
    assert.equal(withoutEnquiryMail.ready, false);
    assert.equal(withoutEnquiryMail.items.find(item => item.id === "email")?.status, "needs-setup");
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

  it("reports optional service connections without exposing their values", () => {
    const secrets = {
      STRIPE_SECRET_KEY: "stripe-private-value",
      STRIPE_WEBHOOK_SECRET: "stripe-webhook-private-value",
      GITHUB_TOKEN: "github-private-value",
      VERCEL_TOKEN: "vercel-private-value",
      OPENAI_API_KEY: "openai-private-value",
      MILESYMEDIA_ASSISTANT_API_TOKEN: "assistant-private-value",
      MILESYMEDIA_ASSISTANT_AGENCY_ID: "milesymedia",
    };
    const result = inspectProductionReadiness(productionEnv(secrets));

    for (const id of ["billing", "github", "vercel", "assistant", "assistant-api"] as const) {
      assert.equal(result.items.find(item => item.id === id)?.status, "ready");
    }

    const visibleCopy = JSON.stringify(result);
    for (const value of Object.values(secrets)) {
      assert.equal(visibleCopy.includes(value), false);
    }
  });
});
