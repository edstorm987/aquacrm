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
const forgot = readFileSync("src/app/login/forgot/page.tsx", "utf8");
const reset = readFileSync("src/app/login/reset/page.tsx", "utf8");
const form = readFileSync("src/app/login/LoginForm.tsx", "utf8");
const challenge = readFileSync("src/components/security/BotChallenge.tsx", "utf8");
const skipLink = readFileSync("src/components/ui/SkipToContent.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");
const browserGate = readFileSync("scripts/browser-login-ux-acceptance.mjs", "utf8");
const challengeFrameCss = /\.mm-captcha-frame \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";

function relativeLuminance(hex: string): number {
  const channels = hex.match(/[0-9a-f]{2}/gi)?.map(value => Number.parseInt(value, 16) / 255) ?? [];
  assert.equal(channels.length, 3, `expected a six-digit hex colour, received ${hex}`);
  const [red, green, blue] = channels.map(value => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

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

test("LOGIN-UX-001: OAuth separator and Aqua support link retain AA contrast", () => {
  const aquaAccent = /\.mm-auth-shell\[data-auth-brand="aqua"\] \{[\s\S]*?--auth-accent:\s*(#[0-9a-f]{6})/i.exec(css)?.[1];
  const divider = /\.mm-or-divider \{[\s\S]*?color:\s*(#[0-9a-f]{6})/i.exec(css)?.[1];
  assert.ok(aquaAccent, "the Aqua accent must be a measurable six-digit colour");
  assert.ok(divider, "the OAuth separator must use a measurable six-digit foreground");
  for (const [label, foreground] of [["Aqua support link", aquaAccent], ["OAuth separator", divider]] as const) {
    for (const background of ["#FFFFFF", "#FDFCFA"]) {
      assert.ok(contrastRatio(foreground, background) >= 4.5, `${label} must meet WCAG AA on ${background}`);
    }
  }
});

// ─── Approved re-skin (ORCHESTRATOR-FEEDBACK 2026-09-12) ──────────────────

test("LOGIN-UX-001: the dated two-panel treatment and vague filler are gone", () => {
  assert.doesNotMatch(page, /mm-auth-brand-panel/, "the marketing panel is removed from the sign-in DOM");
  assert.doesNotMatch(page, /mm-auth-split/, "the two-panel split wrapper is gone from the sign-in page");
  assert.doesNotMatch(page, /One account|Secure access issued/, "the vague filler is removed");
  assert.match(page, /className="mm-auth-card"/, "the sign-in renders a single centred card");
  assert.match(page, /mm-auth-logo/, "a concise in-card brand lockup replaces the panel");
});

test("LOGIN-UX-001: the background is a restrained CSS-only field (no photo/glass)", () => {
  const shell = /\.mm-auth-shell \{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
  assert.match(shell, /linear-gradient|radial-gradient/, "the shell paints a CSS gradient field");
  assert.match(shell, /--auth-bg-/, "brand-retintable background tokens are present");
  assert.doesNotMatch(css, /aquacrm-workspace\.png/, "the sign-in background photo is removed");
  assert.match(
    css,
    /\.mm-auth-split \{[\s\S]*?backdrop-filter: none;[\s\S]*?\}/,
    "the retired split carries no glass blur",
  );
  assert.match(css, /\.mm-auth-brand-panel \{ display: none; \}/, "the marketing panel is retired in CSS too");
});

test("LOGIN-UX-001: the card is a single centred column sized ~520-600px", () => {
  assert.match(css, /\.mm-auth-card \{[\s\S]*?max-width: 560px;/, "the card is centred at ~560px, not a wide split");
  assert.match(css, /\.mm-auth-split \{[\s\S]*?max-width: 560px;[\s\S]*?margin: 0 auto;/, "recovery pages collapse to the same single centred card");
});

test("LOGIN-UX-001: every auth route is a working skip-link target", () => {
  for (const [route, source] of [["login", page], ["forgot", forgot], ["reset", reset]] as const) {
    assert.match(source, /<main id="main-content" tabIndex=\{-1\}/, `${route} exposes the exact focusable skip target`);
  }
  assert.match(skipLink, /target\.focus\(\{ preventScroll: true \}\)/, "the global skip control moves focus explicitly");
  assert.match(skipLink, /target\.scrollIntoView\(\{ block: "start" \}\)/, "the global skip control scrolls to the target");
  assert.match(browserGate, /activeElement\?\.id === "main-content"/, "the browser gate proves focus moves to the target");
});

test("LOGIN-UX-001: recovery routes retain the visible tenant lockup", () => {
  for (const [route, source] of [["forgot", forgot], ["reset", reset]] as const) {
    assert.match(source, /className="mm-auth-logo"/, `${route} has the in-card tenant lockup`);
    assert.match(source, /className="mm-auth-logo-mark" aria-hidden="true"/, `${route} hides the decorative mark`);
    assert.match(source, /className="mm-auth-logo-name">\{brand\.name\}/, `${route} exposes one readable tenant name`);
    assert.match(source, /href=\{`\/login\?brand=\$\{brand\.id\}`\}/, `${route} preserves the tenant-scoped sign-in destination`);
  }
});

test("LOGIN-UX-001: narrow challenges use the provider compact mode, never clipping", () => {
  assert.match(challenge, /size\?: "normal" \| "compact" \| "flexible"/, "the provider size contract is typed");
  assert.match(challenge, /getBoundingClientRect\(\)\.width < 300 \? "compact" : "flexible"/, "layout selects the provider's compact mode below 300px");
  assert.match(challenge, /size: widgetSize/, "the measured size reaches the real Turnstile render call");
  assert.doesNotMatch(challengeFrameCss, /overflow: hidden;/, "the challenge iframe is never cropped");
  assert.match(challengeFrameCss, /overflow: visible;/, "provider controls may paint without clipping");
  assert.match(browserGate, /const iframeWidth = size === "compact" \? 150 : 300/, "the browser fixture uses provider-sized iframe dimensions");
});
