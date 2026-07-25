// T1 R033 smoke — ActivityCategory enum batch + chip styling.
// Run via `npm run smoke:activity-category-batch` (tsx --test).
//
// Pure runtime — activityCategoryStyle.ts has no server-only shim.
// Plus source-marker on the enum + activity feed wire-up.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATEGORY_FILTER_ORDER,
  categoryStyle,
  deriveActivitySeverity,
  describeActivityChip,
} from "../src/lib/chrome/activityCategoryStyle";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TYPES = join(ROOT, "src", "server", "types.ts");
const FEED = join(ROOT, "src", "app", "portal", "agency", "_AgencyActivityFeed.tsx");

const NEW_CATEGORIES = [
  "public-funnel",   // R032 (already promoted)
  "bos-auth-gate",   // R032 (already promoted)
  "payroll",
  "integrations",
  "support",
  "onboarding",
  "reports",
  "feedback",
  "team-resources",
  "resources",
  "files",
] as const;

describe("ActivityCategory enum — batch promotion (R033)", () => {
  it("types.ts union contains every promoted category", () => {
    const src = readFileSync(TYPES, "utf8");
    for (const cat of NEW_CATEGORIES) {
      assert.ok(src.includes(`"${cat}"`), `missing ${cat} from ActivityCategory union`);
    }
  });
});

describe("ActivityCategory chip styling (R033)", () => {
  it("every category resolves to a chip with color + icon + label", () => {
    for (const cat of NEW_CATEGORIES) {
      const style = categoryStyle(cat);
      assert.match(style.color, /^#[0-9a-f]{6}$/i, `${cat} color must be hex`);
      assert.ok(style.icon.length >= 1, `${cat} icon present`);
      assert.ok(style.label.length >= 2, `${cat} label present`);
    }
  });

  it("existing categories also resolve (no regression)", () => {
    for (const cat of ["auth", "tenant", "ecommerce", "hr", "memberships"] as const) {
      const style = categoryStyle(cat);
      assert.ok(style.color);
      assert.ok(style.icon);
    }
  });

  it("unknown category falls back to neutral chip", () => {
    const style = categoryStyle("not-a-real-category");
    assert.equal(style.label, "Other");
  });

  it("CATEGORY_FILTER_ORDER includes every promoted category", () => {
    for (const cat of NEW_CATEGORIES) {
      assert.ok(
        (CATEGORY_FILTER_ORDER as readonly string[]).includes(cat),
        `${cat} missing from filter order`,
      );
    }
  });
});

describe("ActivityCategory severity — detractor warn (R033)", () => {
  it("feedback.detractor.* → warn (chapter #131 high-severity)", () => {
    const sev = deriveActivitySeverity({ action: "feedback.detractor.score_logged" });
    assert.equal(sev, "warn");
  });

  it("non-detractor feedback events → info", () => {
    const sev = deriveActivitySeverity({ action: "feedback.promoter.score_logged" });
    assert.equal(sev, "info");
  });

  it("stripe.payment.failed + auth.lockout → warn", () => {
    assert.equal(deriveActivitySeverity({ action: "stripe.payment.failed" }), "warn");
    assert.equal(deriveActivitySeverity({ action: "auth.lockout.locked" }), "warn");
  });

  it("system.error.* + plugin.crash.* → error", () => {
    assert.equal(deriveActivitySeverity({ action: "system.error.fatal" }), "error");
    assert.equal(deriveActivitySeverity({ action: "plugin.crash.kanban" }), "error");
  });

  it("describeActivityChip composes category + severity in one call", () => {
    const chip = describeActivityChip({ category: "feedback", action: "feedback.detractor.score_logged" });
    assert.equal(chip.severity, "warn");
    assert.equal(chip.category.label, "Feedback");
  });
});

describe("ActivityCategory feed wire-up (R033, source-marker)", () => {
  it("_AgencyActivityFeed imports describeActivityChip + applies severity outline + bell", () => {
    const src = readFileSync(FEED, "utf8");
    assert.ok(src.includes("describeActivityChip"));
    assert.ok(src.includes('chip.severity'));
    assert.ok(src.includes("border-l-amber-500") || src.includes("amber-500"), "warn outline present");
    assert.ok(src.includes("border-l-red-600") || src.includes("red-600"), "error outline present");
    assert.ok(src.includes("🔔"), "bell glyph for high-severity events");
  });

  it("InboxEntry now carries optional `action` so severity can derive", () => {
    const src = readFileSync(FEED, "utf8");
    assert.ok(src.includes("action?: string"));
  });
});
