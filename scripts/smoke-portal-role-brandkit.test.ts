// T1 R15 smoke — PortalRole widening + BrandKit 16-var emission.
// Run via `npm run smoke:portal-role-brandkit` (tsx --test).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PORTAL_ROLES,
  assertPortalRole,
  isPortalRole,
} from "../src/plugins/_types";
import { brandToCss } from "../src/lib/chrome/brandKit";

describe("PortalRole widening", () => {
  it("PORTAL_ROLES contains the 4 legacy roles + 4 new", () => {
    assert.deepEqual([...PORTAL_ROLES].sort(), [
      "account", "affiliates", "customer", "login",
      "member", "orders", "other", "start-here",
    ]);
  });

  it("assertPortalRole accepts each canonical role", () => {
    for (const r of PORTAL_ROLES) {
      assert.equal(assertPortalRole(r), r);
    }
  });

  it("assertPortalRole accepts the four new roles specifically", () => {
    for (const r of ["customer", "member", "start-here", "other"]) {
      assert.equal(assertPortalRole(r), r);
    }
  });

  it("assertPortalRole rejects unknown strings", () => {
    assert.throws(() => assertPortalRole("admin"));
    assert.throws(() => assertPortalRole(""));
    assert.throws(() => assertPortalRole(null));
    assert.throws(() => assertPortalRole(undefined));
    assert.throws(() => assertPortalRole(42));
  });

  it("isPortalRole narrows correctly", () => {
    assert.equal(isPortalRole("login"), true);
    assert.equal(isPortalRole("member"), true);
    assert.equal(isPortalRole("nope"), false);
    assert.equal(isPortalRole(null), false);
  });
});

describe("BrandKit 16-var emission", () => {
  it("emits the single primary var from a minimal kit", () => {
    const out = brandToCss({ primaryColor: "#FF6B35" });
    assert.deepEqual(Object.keys(out.vars), ["--brand-primary"]);
  });

  it("emits all 16 vars from a fully-populated kit", () => {
    const out = brandToCss({
      primaryColor:   "#FF6B35",
      secondaryColor: "#FFF7ED",
      accentColor:    "#7C3AED",
      fontHeading:    "Playfair Display",
      fontBody:       "Inter",
      borderRadius:   "12px",
      logoUrl:        "https://cdn.example.com/logo.png",
      bgElevated:     "#FFFFFF",
      text:           "#0F172A",
      textMuted:      "#64748B",
      border:         "rgba(0,0,0,0.08)",
      radiusSm:       "4px",
      radiusMd:       "8px",
      radiusLg:       "16px",
    });
    const expected = [
      "--brand-primary",
      "--brand-secondary",
      "--brand-accent",
      "--brand-font-heading",
      "--brand-font-body",
      "--brand-radius",
      "--brand-logo",
      "--brand-bg-elevated",
      "--brand-text",
      "--brand-text-muted",
      "--brand-border",
      "--brand-radius-sm",
      "--brand-radius-md",
      "--brand-radius-lg",
    ];
    assert.deepEqual(Object.keys(out.vars).sort(), [...expected].sort());
    // Spot-check the namespaced new vars carry verbatim values.
    assert.equal(out.vars["--brand-bg-elevated"], "#FFFFFF");
    assert.equal(out.vars["--brand-radius-lg"], "16px");
    assert.equal(out.vars["--brand-text-muted"], "#64748B");
  });

  it("does NOT emit fabricated defaults — vars only present when set", () => {
    const out = brandToCss({ primaryColor: "#000" });
    assert.equal(out.vars["--brand-bg-elevated"], undefined);
    assert.equal(out.vars["--brand-text"], undefined);
    assert.equal(out.vars["--brand-radius-sm"], undefined);
  });
});
