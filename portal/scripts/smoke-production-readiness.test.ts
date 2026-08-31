import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectProductionReadiness } from "../src/lib/server/productionReadiness";
import {
  inspectObservabilityCapability,
  isSentrySdkInstalled,
} from "../src/lib/server/observabilityCapability";

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

  // #132: a DSN string is not evidence. @sentry/nextjs is an optional
  // dependency and every capture is a silent no-op while it is absent, so
  // the checklist must ask for setup instead of reporting "ready".
  it("does not call error monitoring ready from a DSN string alone", () => {
    const env = productionEnv({ SENTRY_DSN: "https://public@o0.ingest.sentry.io/0" });
    const result = inspectProductionReadiness(env, {
      observabilityCapability: inspectObservabilityCapability(env, false),
    });
    const monitoring = result.items.find(item => item.id === "monitoring");
    assert.equal(monitoring?.status, "needs-setup");
    assert.ok(monitoring?.summary.includes("no error is delivered"));
    assert.notEqual(monitoring?.action, "No action needed.");
  });

  it("reports error monitoring ready once the DSN and the SDK are both present", () => {
    const env = productionEnv({ SENTRY_DSN: "https://public@o0.ingest.sentry.io/0" });
    const result = inspectProductionReadiness(env, {
      observabilityCapability: inspectObservabilityCapability(env, true),
    });
    assert.equal(result.items.find(item => item.id === "monitoring")?.status, "ready");
    // Monitoring is not a required launch gate either way.
    assert.equal(result.ready, true);
  });

  it("probes the live dependency state when no capability is supplied", () => {
    const result = inspectProductionReadiness(
      productionEnv({ SENTRY_DSN: "https://public@o0.ingest.sentry.io/0" }),
    );
    const monitoring = result.items.find(item => item.id === "monitoring");
    assert.equal(monitoring?.status, isSentrySdkInstalled() ? "ready" : "needs-setup");
  });

  // ── Whose readiness is this? (env-and-sellability.md §3) ──────────────────
  //
  // Every row used to be decided by `process.env`, and the verdict with them.
  // On a sold instance that means a screen the buyer cannot act on: rows about
  // a database and a session secret only the operator can change, and a
  // "customer email" row that reads off the operator's Resend key. The buyer
  // could connect SMTP, their own everything, and still be told "production
  // setup is incomplete" forever.
  describe("a company that is not the operator", () => {
    const tenant = {
      agencyId: "buyer-agency",
      environmentCredentialsBelongToAgency: false,
    } as const;

    it("is never judged on the operator's environment", () => {
      // A fully configured deployment — every env var the operator's own
      // readiness passes on — and a tenant with nothing of their own.
      const result = inspectProductionReadiness(productionEnv(), tenant);

      assert.equal(result.audience, "company");
      assert.equal(
        result.items.some(item => item.scope === "platform"),
        false,
        "platform rows name variables a tenant cannot set; showing them offers an action they cannot take",
      );
      assert.deepEqual(
        result.items.filter(item => item.required).map(item => item.id),
        ["email"],
        "the buyer's only required row is their own customer email",
      );
      assert.equal(result.ready, false, "they have connected nothing, so they are not ready");
      assert.equal(
        result.items.find(item => item.id === "email")?.status,
        "needs-setup",
        "the operator's RESEND_API_KEY is not this company's mail",
      );
      // The optional rows must not read as connected off the operator's keys
      // either — a green "GitHub publishing" row would be Ed's token.
      for (const id of ["billing", "github", "vercel", "assistant", "assistant-api"] as const) {
        assert.equal(result.items.find(item => item.id === id)?.status, "optional", id);
      }
    });

    it("is not handed the operator's variable names to debug with", () => {
      const result = inspectProductionReadiness(productionEnv(), tenant);
      assert.deepEqual(
        [...new Set(result.items.map(item => item.envKeys.length))],
        [0],
        "envKeys is a founder-facing aid, and this object is serialised into the browser",
      );
    });

    // The headline break: `smtp` is a first-class catalog provider that
    // `sendTransactionalEmail` fully supports, but readiness only asked about
    // `resend` — so an SMTP buyer failed a REQUIRED row and the whole instance
    // read `ready: false` permanently, with no way out from inside the app.
    it("reads ready once its own email is connected — SMTP included", () => {
      const result = inspectProductionReadiness(productionEnv({ RESEND_API_KEY: "" }), {
        ...tenant,
        managedIntegrationProviders: ["smtp"],
        transactionalEmailConfigured: true,
        enquiryNotificationsConfigured: true,
      });
      assert.equal(result.items.find(item => item.id === "email")?.status, "ready");
      assert.equal(result.ready, true, "a sellable instance can reach ready without a redeploy");
    });

    it("counts an SMTP connection as customer email on its own", () => {
      const result = inspectProductionReadiness({}, {
        ...tenant,
        managedIntegrationProviders: ["smtp"],
        enquiryNotificationsConfigured: true,
      });
      assert.equal(result.items.find(item => item.id === "email")?.status, "ready");
    });

    // The other direction: `notifyTo` is OPTIONAL in the Resend catalog entry,
    // so a bare connection used to turn the row green while a public enquiry
    // had no inbox to land in. Missing evidence is never a healthy pass.
    it("does not call enquiry notifications ready from a bare email connection", () => {
      const result = inspectProductionReadiness({}, {
        ...tenant,
        managedIntegrationProviders: ["resend"],
        transactionalEmailConfigured: true,
        enquiryNotificationsConfigured: false,
      });
      const email = result.items.find(item => item.id === "email");
      assert.equal(email?.status, "needs-setup");
      assert.equal(result.ready, false);
      // And it must say WHICH half is missing: the fix is a notification
      // address, not another email provider.
      assert.match(email?.summary ?? "", /enquiry has no inbox/i);
      assert.match(email?.action ?? "", /enquiry notification email|support email/i);
    });
  });

  it("still gives the operator's own agency the whole deployment view", () => {
    const result = inspectProductionReadiness(productionEnv(), {
      agencyId: "founder-agency",
      environmentCredentialsBelongToAgency: true,
    });
    assert.equal(result.audience, "platform");
    assert.ok(
      result.items.some(item => item.id === "database" && item.scope === "platform"),
      "the environment IS the founder's configuration, so their rows still read from it",
    );
    assert.equal(result.ready, true);
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
