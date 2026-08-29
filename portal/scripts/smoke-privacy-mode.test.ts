import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("top bars expose a persistent privacy control", () => {
  const topbar = read("src/components/chrome/Topbar.tsx");
  const customer = read("src/app/portal/customer/_CustomerPortalChrome.tsx");
  assert.match(topbar, /PrivacyModeControl/);
  assert.match(customer, /PrivacyModeControl canEnterShowcase=\{false\}/);
});

test("privacy mode masks sensitive values while leaving the workspace usable", () => {
  const component = read("src/components/chrome/PrivacyModeControl.tsx");
  const css = read("src/app/globals.css");
  assert.match(component, /toggleAttribute\("data-privacy-mode"/);
  assert.match(component, /sessionStorage/);
  assert.match(component, /data-privacy-value/);
  assert.match(component, /MutationObserver/);
  assert.match(component, /sensitiveTerms/);
  assert.match(component, /PrivacyCategory/);
  assert.match(component, /looksLikePhoneNumber/);
  assert.match(component, /MONEY_PATTERN/);
  assert.match(component, /data-privacy-visible/);
  assert.doesNotMatch(component, /digits\.length > 0/);
  assert.match(css, /html\[data-privacy-mode\] \[data-privacy-value\]/);
  assert.match(css, /:not\(input\):not\(textarea\):not\(select\)/);
  assert.match(css, /caret-color: var\(--brand-primary\)/);
  assert.doesNotMatch(css, /html\[data-privacy-mode\] \.mm-private-surface,\s*html\[data-privacy-mode\] \.mm-private-sidebar/);
  assert.doesNotMatch(css, /\.mm-private-surface input,/);
});

test("a deliberate hold enters the isolated showcase workspace", () => {
  const component = read("src/components/chrome/PrivacyModeControl.tsx");
  assert.match(component, /HOLD_MS = 900/);
  // The hold now enters through the canonical sandbox endpoint rather than the
  // separate `/api/auth/showcase-mode` — the 26 August Sandbox Mode
  // consolidation. The new call says MORE than the old one did: it names the
  // dataset and the access level, so "isolated" and "read-only" are both
  // asserted here instead of being implied by the endpoint's name.
  assert.match(component, /\/api\/auth\/sandbox-mode/);
  assert.match(component, /action: "enter"/);
  assert.match(component, /dataset: "demo"/, "the hold stopped entering the isolated demo dataset");
  assert.match(component, /access: "read-only"/, "the hold stopped being read-only — it can now write to the demo tenant");
  assert.match(component, /longPressTriggered/);
});
