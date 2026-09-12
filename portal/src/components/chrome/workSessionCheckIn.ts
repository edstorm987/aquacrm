// CHECKIN-UX-001 / DECISIONS #11 — the decision logic of the inactivity
// work-session check-in, extracted from SmartWorkSessionMonitor so the
// 10-minute trigger, its active-work-session scope, the interaction reset and
// the snooze determinism are PROVABLE in isolation (no React, no DOM). The
// component imports these; a behavioural test drives them directly.
//
// Runtime-pure: the only import is a type (erased at build), so this module can
// be unit-tested without pulling in React, the DOM, or any server module.

import type { DashboardWorkActivityMode } from "@/server/types";

/** Local idle threshold before the check-in prompt opens: 10 minutes. */
export const LOCAL_IDLE_PROMPT_MS = 10 * 60_000;
/** "Ask in 5m" — the explicit snooze on an unconfirmed prompt. */
export const REMIND_LATER_MS = 5 * 60_000;
/** "Review & clock out" defers the prompt by 10 minutes while the review runs. */
export const CLOCK_OUT_REVIEW_SNOOZE_MS = 10 * 60_000;

export interface IdlePromptInput {
  /** The session's confirmed activity mode. */
  currentMode: DashboardWorkActivityMode | null | undefined;
  /** Current wall-clock time (ms). */
  now: number;
  /** When the last real interaction (pointer/key/scroll/touch/focus) happened. */
  lastInteractionAt: number;
  /** A snooze deadline; while `now` is before it, the prompt stays closed. */
  snoozedUntil: number;
  /** Override the idle threshold (tests). */
  idleMs?: number;
}

/**
 * Whether the LOCAL idle check-in prompt should open.
 *
 * Non-destructive by construction — it only decides whether to SHOW the prompt,
 * never to sign anyone out. Rules:
 *   - Only monitored Aqua work is locally idle-checked. External / break /
 *     unconfirmed time is governed by the server's `nextCheckIn`, not this local
 *     timer, so they never trip it.
 *   - A snooze (`now < snoozedUntil`) deterministically suppresses the prompt —
 *     "Ask in 5m" and the clock-out review both rely on this.
 *   - The threshold is measured from the LAST interaction, so any real activity
 *     resets it; the prompt only appears after a genuine idle gap.
 */
export function shouldPromptLocalIdle(input: IdlePromptInput): boolean {
  const idleMs = input.idleMs ?? LOCAL_IDLE_PROMPT_MS;
  if (input.currentMode !== "aqua") return false;
  if (input.now < input.snoozedUntil) return false;
  return input.now - input.lastInteractionAt >= idleMs;
}
