import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  configuredPublicAuthOrigin,
  isExactConfiguredRequestOrigin,
} from "../src/lib/server/auth/publicAuthOrigin";

describe("canonical public auth origin", () => {
  it("accepts one configured origin and strips only its trailing slash", () => {
    assert.equal(configuredPublicAuthOrigin({
      NODE_ENV: "production",
      NEXT_PUBLIC_PORTAL_BASE_URL: "https://aqua-crm.com/",
    } as NodeJS.ProcessEnv), "https://aqua-crm.com");
  });

  it("rejects missing, malformed, credentialed, path-bearing, local, and insecure production values", () => {
    for (const value of [
      undefined,
      "not a url",
      "https://user:secret@aqua-crm.com",
      "https://aqua-crm.com/tenant/path",
      "https://aqua-crm.com/?next=evil",
      "http://aqua-crm.com",
      "https://localhost:3030",
      "https://192.168.1.2",
    ]) {
      assert.equal(configuredPublicAuthOrigin({
        NODE_ENV: "production",
        ...(value === undefined ? {} : { NEXT_PUBLIC_PORTAL_BASE_URL: value }),
      } as NodeJS.ProcessEnv), null, String(value));
    }
  });

  it("uses Origin only as an exact setup-request corroboration", () => {
    const configured = "https://aqua-crm.com";
    assert.equal(isExactConfiguredRequestOrigin(new Request(`${configured}/api/auth/signup`, {
      headers: { origin: configured },
    }), configured), true);
    assert.equal(isExactConfiguredRequestOrigin(new Request(`${configured}/api/auth/signup`, {
      headers: { origin: "https://attacker.example" },
    }), configured), false);
    assert.equal(isExactConfiguredRequestOrigin(new Request(`${configured}/api/auth/signup`), configured), false);
  });

  it("all password, signup, and magic link builders use the configured origin, never request Host", () => {
    for (const path of [
      "src/app/api/auth/password/request-reset/route.ts",
      "src/app/api/auth/signup/route.ts",
      "src/app/api/auth/magic/request/route.ts",
      "src/app/api/auth/magic/verify/route.ts",
      "src/app/api/auth/verify-email/route.ts",
      "src/app/api/tenants/customer-portal-control/route.ts",
      "src/server/freelancerAdmin.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      assert.match(source, /configuredPublicAuthOrigin/);
    }
    const reset = readFileSync("src/app/api/auth/password/request-reset/route.ts", "utf8");
    const magicRequest = readFileSync("src/app/api/auth/magic/request/route.ts", "utf8");
    const invite = readFileSync("src/app/api/tenants/customer-portal-control/route.ts", "utf8");
    assert.doesNotMatch(reset, /resetUrl[\s\S]{0,180}req\.nextUrl\.origin/);
    assert.doesNotMatch(magicRequest, /new URL\("\/login\/magic", req\.nextUrl\.origin\)/);
    assert.doesNotMatch(invite, /new URL\("\/login\/magic", req\.nextUrl\.origin\)/);
  });
});
