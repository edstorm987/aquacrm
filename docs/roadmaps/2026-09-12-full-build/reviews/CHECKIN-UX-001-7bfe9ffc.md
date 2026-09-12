# Independent Acceptance Review — CHECKIN-UX-001 @ `7bfe9ffc`

- **Verdict: ACCEPT**
- **Counts: P0 0 / P1 0 / P2 0** (attributable)
- **Exact SHA reviewed:** `7bfe9ffc691443d92ea771630599a87235cb00c7`
  (`CHECKIN-UX-001: prove the inactivity check-in (extract testable decision logic)`, parent `1cc13b2d`)
- **Reviewer:** Claude Independent Acceptance + Documentation-Truth Worker
- **Date:** 2026-09-12 (BST)
- **Worktree:** `<TMP>/aquacrm-claude-review-20260912`, detached HEAD at the exact SHA, `git status --porcelain` = 0 lines (clean). `node_modules` was a symlink to the parent repo's (git-ignored; porcelain stayed clean), removed after the run.

## Scope (from REVIEW-INBOX)
> Mounted authenticated 10-minute inactivity prompt: scope, snooze, keyboard/focus, unsaved input, route changes and return behavior.

## Files in the commit (3; +149 / −4)
- `portal/src/components/chrome/workSessionCheckIn.ts` (new, 50 lines) — a runtime-pure decision helper: `shouldPromptLocalIdle(...)` plus the constants `LOCAL_IDLE_PROMPT_MS` (10m), `REMIND_LATER_MS` (5m), `CLOCK_OUT_REVIEW_SNOOZE_MS` (10m). Only import is a `type` (erased at build).
- `portal/src/components/chrome/SmartWorkSessionMonitor.tsx` (modified, +12 / −4) — replaces the inline idle condition and the two magic snooze numbers with the helper; nothing else changes.
- `portal/scripts/smoke-checkin-ux.test.ts` (new, 91 lines) — 6 tests (4 behavioral + 2 source-string wiring).

This slice sits on the stack `b5d2cc5d → 604dfe5e → 1cc13b2d → 7bfe9ffc`; it inherits the ancestor migration (see Pre-existing/inherited).

## The change is a provably behavior-preserving extraction
Original inline condition (`SmartWorkSessionMonitor.tsx@1cc13b2d^`):
```
active?.currentMode === "aqua" && stamp - lastInteractionRef.current >= LOCAL_IDLE_PROMPT_MS(10*60_000) && stamp >= snoozedUntil
```
New:
```
shouldPromptLocalIdle({ currentMode: active?.currentMode, now: stamp, lastInteractionAt: lastInteractionRef.current, snoozedUntil })
```
with
```
if (input.currentMode !== "aqua") return false;
if (input.now < input.snoozedUntil) return false;
return input.now - input.lastInteractionAt >= (input.idleMs ?? LOCAL_IDLE_PROMPT_MS);
```
The two boolean forms are identical on every branch and boundary (`>=` idle, `>=` snooze, aqua-only, undefined mode → false). Snooze constants are unchanged (`requestClockOutReview` 10m, `remindLater` 5m). Confirmed by an exhaustive independent equivalence sweep (below).

## What was verified GREEN (evidence is real)

**Gates (worktree @ `7bfe9ffc`, hermetic, in-process only):**
- Focused `smoke-checkin-ux.test.ts` (`--conditions react-server`) — **exit 0, 6/6 pass, 0 skipped**. Tests 1–4 are **behavioral** — they drive `shouldPromptLocalIdle` directly for the 10-minute trigger (boundary-exact), the interaction reset, the Aqua-only scope (`external/break/unconfirmed/null/undefined` → no prompt), and snooze determinism. Tests 5–6 are **source-string** wiring/non-destructive assertions (not counted as behavioral; independently corroborated below).
- Adjacent regression (`smoke-work-lifecycle`, `smoke-modal-keyboard-contract`, `smoke-shared-chrome-speed`, `smoke-dashboard-command-center`, `--conditions react-server`) — **exit 0, 70/70 pass, 0 fail, 0 skipped** (a green superset of the handoff's claimed 13/13).
- `node node_modules/typescript/bin/tsc --noEmit` (full project) — **exit 0, 0 diagnostics**.
- `git diff --check 7bfe9ffc^ 7bfe9ffc` — **exit 0, clean**.

**Independent hostile probe** (reviewer-authored, byte-identical copy sha256 `1406c85b…2b0c30`, run via `tsx`) — all checks pass:
- **Exact equivalence to the original inline condition across all 192 cases** (6 modes × 8 idle gaps × 4 snooze offsets) — zero mismatches.
- Idle boundary inclusive at exactly 10m, exclusive at 10m−1ms.
- Snooze boundary: prompt allowed at `now == snoozedUntil`, suppressed at `now == snoozedUntil+1` (matches original `stamp >= snoozedUntil`).
- `idleMs` override respected; function is pure (no observable side effects); constants intact (10m/5m/10m).

**Source-inspection corroboration of the wiring/contract (the two source-string tests):**
- Component imports the helper and uses `shouldPromptLocalIdle({...})` at the heartbeat (`:135`); the idle branch only `setOpen(true)` — it never signs out or reloads.
- No dangling reference to the removed component-local `LOCAL_IDLE_PROMPT_MS` (it moved to the helper; nothing external imported the old module-local const; tsc clean).
- Exactly one navigation in the component — `window.location.assign("/portal/agency?station=day&review=clock-out")` (`:207`), inside the explicit user `requestClockOutReview`, not the idle path.
- Prompt is `role="dialog" aria-modal="false"` (`:236`) — non-modal, no focus trap/steal — consistent with DECISIONS #11's non-destructive contract. None of this markup is altered by the diff.

## Documentation-truth audit (this slice) — PASS
- **QUEUE.md line 58** ("extracts the mounted monitor's exact 10-minute idle/scope/snooze decision … 6/6 + 13/13 adjacent + TypeScript/diff green. Authenticated mounted keyboard/focus/unsaved-input browser behavior remains unverified"): **accurate** on every count.
- **EVIDENCE.md line 24** (handoff): **accurate** — pure exact decision helper, 10-minute Aqua-work idle threshold, interaction reset, deterministic 5-/10-minute snoozes, non-modal idle prompt only (no sign-out/reload), sole navigation is the explicit clock-out review, 6/6 + 13/13, tsc/diff green, mounted authenticated browser behavior remains VERIFY.
- **DECISIONS #11** ("Inactivity check-in is restored as an accessible, non-destructive prompt. It must not falsely sign out active work, steal focus repeatedly, or lose unsaved input"): matched by source — non-modal dialog, no `signOut`/logout, idle only opens the prompt.
- **Test header comment is truthful** — it states the behavioral suite drives the extracted logic and that "LIVE keyboard/focus/browser acceptance of the mounted prompt is the reviewer's step (it is an auth-gated portal surface)." No phantom evidence file is cited (contrast SETTINGS-SCROLL-001). No stale/false/missing claim found.

## Separation of concerns
- **Attributable:** none (no P0/P1/P2).
- **Pre-existing / inherited (NOT attributable to this slice):** the ancestor commit `604dfe5e` (ABUSE-BASE-001) migration `supabase/migrations/20260912140000_abuse_admission_limiter.sql` is present in this tree (inherited via `1cc13b2d`). Its version collides with the accepted `20260912140000_aqua_tag_capture_admission_claims.sql` on the release line — reported in full under `reviews/ABUSE-BASE-001-604dfe5e.md`. Attributable to ABUSE-BASE-001, not CHECKIN-UX-001.
- **External / live-only (NOT counted):** authenticated mounted browser acceptance of the prompt — real keyboard/focus behaviour, unsaved-input preservation, route-change/return behaviour on the live portal — is auth-gated and cannot be exercised hermetically (boundary forbids real credentials). Crucially, **this commit does not modify any of that behaviour** (only the decision logic + two constants are extracted; the dialog markup, focus handling, and navigation are unchanged), so there is no attributable regression risk; the live walk is the same VERIFY gate the orchestration already records.

## Commands run (all local, hermetic)
```
git worktree add --detach <TMP>/aquacrm-claude-review-20260912 7bfe9ffc
NODE_OPTIONS='--conditions react-server' node --import <tsx>/dist/loader.mjs --test scripts/smoke-checkin-ux.test.ts   # exit 0, 6/6
NODE_OPTIONS='--conditions react-server' node --import <tsx>/dist/loader.mjs --test \
  scripts/smoke-work-lifecycle.test.ts scripts/smoke-modal-keyboard-contract.test.ts \
  scripts/smoke-shared-chrome-speed.test.ts scripts/smoke-dashboard-command-center.test.ts               # exit 0, 70/70
node node_modules/typescript/bin/tsc --noEmit                                                             # exit 0, 0 diagnostics
git diff --check 7bfe9ffc^ 7bfe9ffc                                                                       # exit 0, clean
node --import <tsx>/dist/loader.mjs probe-checkin.ts   # 192-case equivalence + boundaries + purity, all pass
```

## Skipped / hung / unrun gates
- No hung tests; no zero-subtest suites; nothing skipped in the counted runs.
- Focused tests 5–6 are source-string (wiring/non-destructive) — not counted as behavioral; independently corroborated by source inspection. The delta itself (decision logic) is behaviorally covered by tests 1–4 and my probe.
- **Authenticated** mounted browser walk (keyboard/focus/unsaved-input/route/return on the live prompt): **not run** (auth-gated; external/live-only; unchanged by this diff).

## No-live statement
No source/test/migration/doc was edited. No commit, cherry-pick, merge, push, PR, deploy, or migration apply. No contact with any live/deployed site, Railway, Supabase cloud, DNS, provider, email/SMS/payments. No real credentials or data. All work was local and in-process only (no dev server was needed this cycle). Heavy-job lock was held only for the full-tsc run and released.
