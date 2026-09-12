// LOGIN-UX-001 — preservation + accessibility guard for the sign-in surface.
//
// The visual treatment/background re-skin from Ed's screenshot is a design
// decision that needs the screenshot (recorded as OPEN in CLAUDE-HANDOFF.md).
// What this suite locks down is everything a re-skin must NOT break, plus the
// two objective, screenshot-independent improvements shipped now:
//   • a visible keyboard focus ring on every interactive control, and
//   • a reduced-motion guard on the surface.
// Source assertions (no DOM/RTL harness exists here); they fail loudly if a
// later redesign drops MFA, recovery, OAuth, CAPTCHA, tenancy or the Policies
// link, or removes the focus/motion rules.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync("src/app/login/page.tsx", "utf8");
const form = readFileSync("src/app/login/LoginForm.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");

test("LOGIN-UX-001: tenancy + the canonical Policies destination are preserved", () => {
  assert.match(page, /data-auth-brand=\{brand\.id\}/, "the shell stays brand-scoped (tenant-safe theming)");
  assert.match(page, /resolveAuthBrand/, "brand resolution (with neutral fallback) is preserved");
  assert.match(page, /href="\/privacy"/, "the one canonical Policies destination (/privacy) is preserved");
  assert.match(page, /<LoginForm/, "the sign-in form is still mounted");
});

test("LOGIN-UX-001: MFA, recovery, OAuth and CAPTCHA are preserved on the form", () => {
  assert.match(form, /mfaRequired/, "the second-factor (MFA) step is preserved");
  assert.match(form, /one-time-code/, "the authenticator code field is preserved");
  assert.match(form, /recoveryCodes/, "recovery-code handling is preserved");
  assert.match(form, /oauth\/google\/start/, "the Google OAuth entry is preserved");
  assert.match(form, /googleEnabled/, "OAuth stays server-gated");
  assert.match(form, /<BotChallenge/, "the managed CAPTCHA widget is preserved");
  assert.match(form, /\/login\/forgot/, "the password-recovery link is preserved");
});

test("LOGIN-UX-001: every interactive control on the surface has a keyboard focus ring", () => {
  assert.match(
    css,
    /\.mm-auth-shell a:focus-visible[\s\S]*?\.mm-auth-shell button:focus-visible[\s\S]*?outline:/,
    "links and buttons on the sign-in surface must show a visible :focus-visible ring",
  );
  assert.match(css, /\.mm-auth-shell \.mm-input:focus-visible/, "inputs keep a keyboard focus ring");
});

test("LOGIN-UX-001: the sign-in surface honours prefers-reduced-motion", () => {
  // A reduced-motion block that scopes to the auth shell and removes the
  // primary button's hover transform.
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.mm-auth-shell \.mm-btn-primary:hover:not\(:disabled\) \{\s*transform: none;/,
    "reduced motion must neutralise the sign-in button's hover movement",
  );
});
