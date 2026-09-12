import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import path from "node:path";
import { buildContentSecurityPolicy } from "../src/lib/security/contentSecurityPolicy";

test("development CSP permits supervised ephemeral loopback preview frames only outside production", () => {
  const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
  const development = buildContentSecurityPolicy({ nodeEnv: "development" });
  const production = buildContentSecurityPolicy({ nodeEnv: "production" });

  assert.match(development, /frame-src 'self' http:\/\/localhost:\* http:\/\/127\.0\.0\.1:\* https:/);
  // Phase 0-C narrowed frame-ancestors: the broad `https:` embedder allowance was a
  // clickjacking surface (ANY https site could frame the authenticated portal).
  // The dev loopback exception this suite exists to supervise is unchanged.
  assert.match(development, /frame-ancestors 'self' http:\/\/localhost:\* http:\/\/127\.0\.0\.1:\*/);
  assert.doesNotMatch(production, /http:\/\/localhost|http:\/\/127\.0\.0\.1/);
  assert.match(config, /buildContentSecurityPolicy\(\{ nodeEnv: process\.env\.NODE_ENV \}\)/);
});
