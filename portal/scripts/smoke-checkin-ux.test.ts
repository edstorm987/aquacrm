// CHECKIN-UX-001 / DECISIONS #11 — the inactivity work-session check-in.
//
// The check-in already exists and is mounted (portal/layout.tsx, internal
// operators only). The reviewer's requirement is BEHAVIOURAL proof, not source
// presence, so the first suite drives the extracted decision logic directly:
// the 10-minute trigger, its active-work-session scope, the interaction reset
// and the snooze determinism. The second suite asserts the wiring and the
// non-destructive contract (the check-in never signs anyone out or loses
// unsaved input on trigger). LIVE keyboard/focus/browser acceptance of the
// mounted prompt is the reviewer's step (it is an auth-gated portal surface).
//
// Run: node --import tsx --test scripts/smoke-checkin-ux.test.ts

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  shouldPromptLocalIdle,
  LOCAL_IDLE_PROMPT_MS,
  REMIND_LATER_MS,
  CLOCK_OUT_REVIEW_SNOOZE_MS,
} from "../src/components/chrome/workSessionCheckIn";

const T = 1_000_000_000_000; // arbitrary fixed clock

test("CHECKIN-UX-001: the local trigger is exactly 10 minutes of idle", () => {
  assert.equal(LOCAL_IDLE_PROMPT_MS, 10 * 60_000, "the documented 10-minute trigger");
  const base = { currentMode: "aqua" as const, now: T, snoozedUntil: 0 };
  // Exactly 10 minutes idle → prompt.
  assert.equal(shouldPromptLocalIdle({ ...base, lastInteractionAt: T - 10 * 60_000 }), true);
  // One second short → no prompt.
  assert.equal(shouldPromptLocalIdle({ ...base, lastInteractionAt: T - (10 * 60_000 - 1_000) }), false);
  // Well past → prompt.
  assert.equal(shouldPromptLocalIdle({ ...base, lastInteractionAt: T - 60 * 60_000 }), true);
});

test("CHECKIN-UX-001: any interaction resets the idle gap", () => {
  // A long session but a very recent interaction → no prompt.
  assert.equal(
    shouldPromptLocalIdle({ currentMode: "aqua", now: T, lastInteractionAt: T - 2_000, snoozedUntil: 0 }),
    false,
    "recent activity must keep the prompt closed",
  );
});

test("CHECKIN-UX-001: only monitored Aqua work is locally idle-checked (scope)", () => {
  const idle = { now: T, lastInteractionAt: T - 30 * 60_000, snoozedUntil: 0 };
  for (const currentMode of ["external", "break", "unconfirmed", null, undefined] as const) {
    assert.equal(
      shouldPromptLocalIdle({ ...idle, currentMode }),
      false,
      `${String(currentMode)} time must not trip the LOCAL idle prompt (it is governed by the server nextCheckIn)`,
    );
  }
  assert.equal(shouldPromptLocalIdle({ ...idle, currentMode: "aqua" }), true);
});

test("CHECKIN-UX-001: snooze/dismissal is deterministic", () => {
  const idle = { currentMode: "aqua" as const, lastInteractionAt: T - 20 * 60_000 };
  // Snoozed into the future → suppressed, no matter how idle.
  assert.equal(shouldPromptLocalIdle({ ...idle, now: T, snoozedUntil: T + REMIND_LATER_MS }), false);
  // Exactly at the snooze deadline → allowed again.
  assert.equal(shouldPromptLocalIdle({ ...idle, now: T + REMIND_LATER_MS, snoozedUntil: T + REMIND_LATER_MS }), true);
  // The two documented snooze windows.
  assert.equal(REMIND_LATER_MS, 5 * 60_000);
  assert.equal(CLOCK_OUT_REVIEW_SNOOZE_MS, 10 * 60_000);
});

test("CHECKIN-UX-001: it is mounted for internal operators only, on an active work session", () => {
  const layout = readFileSync("src/app/portal/layout.tsx", "utf8");
  assert.match(layout, /internalOperator\s*\?\s*<SmartWorkSessionMonitor/, "mounted only for internal operators");
  const cmp = readFileSync("src/components/chrome/SmartWorkSessionMonitor.tsx", "utf8");
  assert.match(cmp, /if \(!session\) return null;/, "renders nothing without an active work session");
  // The tested logic is the logic that runs.
  assert.match(cmp, /shouldPromptLocalIdle\(\{/, "the component uses the extracted, tested decision");
});

test("CHECKIN-UX-001: the check-in is non-destructive — no sign-out or reload on idle", () => {
  const cmp = readFileSync("src/components/chrome/SmartWorkSessionMonitor.tsx", "utf8");
  // Never signs the operator out.
  assert.doesNotMatch(cmp, /signOut|\/api\/auth\/logout/, "the check-in must never sign active work out");
  // The idle timer only OPENS the prompt; the sole navigation is the explicit
  // user-clicked clock-out review, not the idle path.
  assert.match(cmp, /shouldPromptLocalIdle\([\s\S]*?\)\)\s*\{\s*\n\s*setOpen\(true\);/, "the idle trigger only opens the prompt");
  const nav = cmp.match(/window\.location\.assign\(/g) ?? [];
  assert.equal(nav.length, 1, "exactly one navigation, and it is the user clock-out review");
  assert.match(cmp, /function requestClockOutReview\(\)[\s\S]*?window\.location\.assign\(/, "the only navigation belongs to the explicit clock-out action");
  // A non-modal dialog: it does not trap focus or steal it from unsaved work.
  assert.match(cmp, /role="dialog" aria-modal="false"/, "the prompt is a non-modal dialog (no focus trap/steal)");
});
