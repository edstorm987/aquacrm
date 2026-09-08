// AI + provider credential isolation (assume-breach containment, Phase 6).
//
// Two findings:
//  1. openaiAssistant.ts resolved the API key as
//        `managed.apiKey || process.env.OPENAI_API_KEY`
//     The second operand BYPASSED resolveIntegrationValues()'s founder-only
//     env gate (mayUseEnvironmentCredentials), so EVERY keyless tenant silently
//     ran on the founder's OpenAI key and account — breaking per-tenant
//     credential/data/cost attribution. Fixed to `managed.apiKey` alone; the
//     resolver still returns the env key for the founder's OWN agency.
//  2. Shopify's tenant-configured `domain` was used verbatim; a re-pointed
//     domain would receive the storefront token. Now validated as a
//     <shop>.myshopify.com host before the token is attached.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

test("the assistant key resolution has NO ungated env fallback", () => {
  const src = read("src/lib/server/assistants/openaiAssistant.ts");
  // The dangerous idiom must be gone from every generation call site.
  assert.doesNotMatch(
    src,
    /managed\.apiKey\s*\|\|\s*process\.env\.OPENAI_API_KEY/,
    "the ungated `managed.apiKey || process.env.OPENAI_API_KEY` fallback must not return",
  );
  // Both generation entry points resolve through the founder-gated resolver.
  const managedApiKeyUses = src.match(/const apiKey = managed\.apiKey;/g) ?? [];
  assert.ok(managedApiKeyUses.length >= 2, "both askMilesymediaAssistant paths must use managed.apiKey alone");
});

test("only the founder's own agency may inherit the environment OpenAI key", async () => {
  // With no founder seeded, mayUseEnvironmentCredentials is false for every
  // agency, so resolveIntegrationValues returns NO key even when the env has one.
  const prior = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-env-founder-key";
  try {
    const { resolveIntegrationValues } = await import("../src/lib/server/integrations/integrationConnections");
    const { mayUseEnvironmentCredentials } = await import("../src/lib/server/auth/founderAgency");
    // A random non-founder agency (no founder user seeded → gate closed).
    assert.equal(mayUseEnvironmentCredentials("agency-not-the-founder"), false);
    const values = resolveIntegrationValues("agency-not-the-founder", "openai");
    assert.equal(values.apiKey, undefined, "a non-founder agency must NOT inherit the env OpenAI key");
  } finally {
    if (prior === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prior;
  }
});

test("Shopify refuses a non-myshopify domain before attaching the token", () => {
  const src = read("src/built-ins/modules/ecommerce/src/lib/shopify.ts");
  assert.match(src, /\\\.myshopify\\\.com\$/, "must validate the <shop>.myshopify.com host shape");
  // The token header must be attached only after the host check (the check
  // throws, so the brokeredFetch below never runs for a bad host).
  const checkIndex = src.indexOf("myshopify.com storefront host");
  const tokenIndex = src.indexOf("X-Shopify-Storefront-Access-Token");
  assert.ok(checkIndex > -1 && tokenIndex > -1 && checkIndex < tokenIndex, "host validation must precede the token");
  assert.match(src, /followRedirects:\s*false/, "credential-bearing Shopify calls must not follow redirects");
});
