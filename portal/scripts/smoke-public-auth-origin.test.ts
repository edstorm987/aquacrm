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
      "https://0.0.0.0",
      "https://0177.0.0.1",
      "https://0x7f.1",
      "https://2130706433",
      "https://100.64.0.1",
      "https://192.0.0.1",
      "https://192.0.2.1",
      "https://192.88.99.1",
      "https://198.18.0.1",
      "https://198.51.100.1",
      "https://203.0.113.1",
      "https://224.0.0.1",
      "https://239.255.255.255",
      "https://240.0.0.1",
      "https://255.255.255.255",
      "https://[::]",
      "https://[::1]",
      "https://[fc00::1]",
      "https://[fd12:3456::1]",
      "https://[fe80::1]",
      "https://[::ffff:127.0.0.1]",
      "https://[::ffff:8.8.8.8]",
      "https://[ff02::1]",
      "https://[100::1]",
      "https://[2001:2::1]",
      "https://[2001:db8::1]",
      "https://[2002::1]",
      "https://[3fff::1]",
      "https://portal.home.arpa",
      "https://hidden-service.onion",
    ]) {
      assert.equal(configuredPublicAuthOrigin({
        NODE_ENV: "production",
        ...(value === undefined ? {} : { NEXT_PUBLIC_PORTAL_BASE_URL: value }),
      } as NodeJS.ProcessEnv), null, String(value));
    }
    assert.equal(configuredPublicAuthOrigin({
      NODE_ENV: "production",
      NEXT_PUBLIC_PORTAL_BASE_URL: "https://8.8.8.8",
    } as NodeJS.ProcessEnv), "https://8.8.8.8");
    assert.equal(configuredPublicAuthOrigin({
      NODE_ENV: "production",
      NEXT_PUBLIC_PORTAL_BASE_URL: "https://[2606:4700:4700::1111]",
    } as NodeJS.ProcessEnv), "https://[2606:4700:4700::1111]");
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
      "src/app/api/auth/password/request-reset/handler.ts",
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
    const reset = readFileSync("src/app/api/auth/password/request-reset/handler.ts", "utf8");
    const magicRequest = readFileSync("src/app/api/auth/magic/request/route.ts", "utf8");
    const invite = readFileSync("src/app/api/tenants/customer-portal-control/route.ts", "utf8");
    assert.doesNotMatch(reset, /resetUrl[\s\S]{0,180}req\.nextUrl\.origin/);
    assert.doesNotMatch(magicRequest, /new URL\("\/login\/magic", req\.nextUrl\.origin\)/);
    assert.doesNotMatch(invite, /new URL\("\/login\/magic", req\.nextUrl\.origin\)/);
  });
});
