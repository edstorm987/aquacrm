// AUTH-001 — source-contract guard for every AquaCRM-owned public form that
// reaches a CAPTCHA-gated route. Behavioural verifier/route tests live beside
// this file; these assertions prevent a caller being added or refactored
// without carrying the token/action/reset contract with it.

import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function assertReactChallenge(
  path: string,
  action: "login" | "public-contact" | "brand-enquiry",
): void {
  const text = source(path);
  assert.match(text, /BotChallenge/);
  assert.match(text, /captchaToken/);
  assert.match(text, new RegExp(`action=["'{]+${action}`));
  assert.match(text, /captchaRef\.current\?\.reset\(\)/);
}

function assertStaticChallenge(
  path: string,
  action: "brand-enquiry",
  minimumForms = 1,
): void {
  const text = source(path);
  const markers = text.match(
    new RegExp(`data-aqua-challenge-action=["']${action}["']`, "g"),
  ) ?? [];
  assert.ok(
    markers.length >= minimumForms,
    `${path} must mark at least ${minimumForms} challenge-gated form(s)`,
  );
  assert.match(text, /aqua-bot-challenge\.js|site-experience\.js/);
}

describe("managed challenge — React surface inventory", () => {
  it("wires the portal login, connection login, and editor login block", () => {
    const portalLogin = source("../src/app/login/LoginForm.tsx");
    assert.match(portalLogin, /BotChallenge/);
    assert.match(portalLogin, /captchaToken/);
    assert.match(portalLogin, /"magic-link-request"/);
    assert.match(portalLogin, /: "login"/);
    assert.match(portalLogin, /captchaRef\.current\?\.reset\(\)/);
    assertReactChallenge(
      "../src/app/connect/[connectionId]/_ConnectFlow.tsx",
      "login",
    );

    const block = source(
      "../src/built-ins/modules/website-editor/src/components/blocks/LoginFormBlock.tsx",
    );
    assert.match(block, /BotChallenge/);
    assert.match(block, /name="captchaToken"/);
    assert.match(block, /action="login"/);
  });

  it("wires the editor contact block and dormant launch-gate form", () => {
    assertReactChallenge(
      "../src/built-ins/modules/website-editor/src/components/blocks/CrmContactFormBlock.tsx",
      "public-contact",
    );
    assertReactChallenge("../src/app/(website)/LaunchGateForm.tsx", "brand-enquiry");
  });
});

describe("managed challenge — static AquaCRM form inventory", () => {
  it("wires both published AquaCRM document roots and the contact pages", () => {
    assertStaticChallenge("../public/aquacrm-site/index.html", "brand-enquiry", 2);
    assertStaticChallenge("../public/aquacrm-site/contact/index.html", "brand-enquiry");
    assertStaticChallenge("../../website/index.html", "brand-enquiry", 2);
    assertStaticChallenge("../../website/contact/index.html", "brand-enquiry");

    const sharedHandler = source("../public/aquacrm-site/site-experience.js");
    assert.match(sharedHandler, /captchaToken/);
    assert.match(sharedHandler, /AquaBotChallenge\?\.reset\(form\)/);
    for (const path of ["../../website/index.html", "../../website/contact/index.html"]) {
      const document = source(path);
      assert.match(document, /captchaToken/);
      assert.match(document, /AquaBotChallenge\?\.reset\(form\)/);
    }
  });

  it("wires both health-check forms", () => {
    assertStaticChallenge("../public/health-check/index.html", "brand-enquiry", 2);
    const document = source("../public/health-check/index.html");
    assert.match(document, /captchaToken/);
    assert.match(document, /AquaBotChallenge\?\.reset\(ev\.target\)/);
  });

  it("keeps the shared static loader fail-closed and multi-form aware", () => {
    const loader = source("../public/aqua-bot-challenge.js");
    assert.match(loader, /querySelectorAll\("form\[data-aqua-challenge-action\]"\)/);
    assert.match(loader, /hidden\.name = "captchaToken"/);
    assert.match(loader, /document\.addEventListener\("submit"/);
    assert.match(loader, /event\.stopImmediatePropagation\(\)/);
    assert.match(loader, /MutationObserver/);
    assert.match(loader, /turnstile-script-timeout/);
    assert.match(loader, /credentials: "omit"/);
    assert.match(loader, /required: true/);
  });
});

describe("managed challenge — cross-origin branded login boundary", () => {
  it("binds the external Origin to its brand and passes hostname internally", () => {
    const wrapper = source("../src/app/api/auth/login/browser/route.ts");
    assert.match(wrapper, /configuredOriginForBrand/);
    assert.match(wrapper, /configuredOriginForBrand\(brand\) === parsed\.origin/);
    assert.match(wrapper, /brand === "aqua"/);
    assert.match(wrapper, /brand === "zimante"/);
    assert.match(wrapper, /loginWithTrustedChallengeHostname/);
    assert.match(wrapper, /from "\.\.\/trustedChallengeLogin"/);
    assert.match(wrapper, /captchaToken/);
    assert.doesNotMatch(wrapper, /x-(?:trusted-)?(?:captcha|challenge)-hostname/i);

    const route = source("../src/app/api/auth/login/route.ts");
    const trustedHandler = source("../src/app/api/auth/login/trustedChallengeLogin.ts");
    assert.doesNotMatch(route, /export async function loginWithTrustedChallengeHostname/);
    assert.match(trustedHandler, /import "server-only"/);
    assert.match(trustedHandler, /trustedChallengeHostname/);
  });

  it("exposes only public runtime configuration", () => {
    const route = source("../src/app/api/public/bot-challenge/config/route.ts");
    assert.match(route, /siteKey: config\.siteKey/);
    assert.match(route, /enabled: config\.enabled/);
    assert.match(route, /required: config\.required/);
    assert.doesNotMatch(route, /TURNSTILE_SECRET_KEY|secretKey|config\.secret/);
    assert.match(route, /cache-control/);
    assert.match(route, /no-store/);
  });
});
