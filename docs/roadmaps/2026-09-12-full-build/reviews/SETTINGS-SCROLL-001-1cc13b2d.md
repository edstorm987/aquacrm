# Independent Acceptance Review — SETTINGS-SCROLL-001 @ `1cc13b2d`

- **Verdict: REJECT**
- **Counts: P0 0 / P1 0 / P2 1** (1 attributable P2, documentation/evidence-integrity)
- **Exact SHA reviewed:** `1cc13b2d6eb095845720027e3d553bbd3f7c4055`
  (`SETTINGS-SCROLL-001: sticky Agency Settings rail, independent pane scroll (DECISIONS #10)`, parent `604dfe5e`)
- **Reviewer:** Claude Independent Acceptance + Documentation-Truth Worker
- **Date:** 2026-09-12 (BST)
- **Worktree:** `<TMP>/aquacrm-claude-review-20260912`, detached HEAD at the exact SHA, `git status --porcelain` = 0 lines (clean). `node_modules` was a symlink to the parent repo's (git-ignored; porcelain stayed clean) and was removed after the run.

## Scope (from REVIEW-INBOX)
> Authenticated desktop sticky rail/internal-pane scroll plus 320/390/768/1440, zoom, focus, overflow and persisted selection.

## Files in the commit (2; +55 / −2)
- `portal/src/app/portal/agency/settings/SettingsTabs.tsx` (modified, +15 / −2) — the `<nav aria-label="Settings sections">` gains `lg:sticky lg:top-6 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:overscroll-contain lg:pb-2` (plus an expanded comment). Nothing else changes.
- `portal/scripts/smoke-settings-scroll.test.ts` (new, 42 lines) — 4 tests, **all source-string** `readFileSync`+regex assertions.

The parent is `604dfe5e` (ABUSE-BASE-001, independently REJECTED this run); this slice is stacked on it and inherits its migration (see Pre-existing/inherited below).

---

## Attributable finding

### P2 — Focused test is source-string-only and its comment makes an unsubstantiated browser-acceptance claim citing a non-existent file
**File:** `portal/scripts/smoke-settings-scroll.test.ts` (esp. line 7)

Two linked evidence-integrity problems introduced by this commit's own new test:

1. **All four "focused" tests are source-text assertions, not behavior.** Each does `readFileSync("…/SettingsTabs.tsx")` + `assert.match(regex)`. The file itself states "Source assertions (this is a client component with no DOM/RTL harness here)." Per the review boundary ("Do not count a test that … tests source text instead of behavior"), the shipped `4/4 focused` provides **zero** behavioral verification of a slice whose entire value is runtime layout (sticky engagement, independent scroll, responsive fallback, zoom, overflow). A trivial rename of a class in the source would flip these tests without any behavioral guarantee.

2. **Line 7 asserts browser acceptance via a file that does not exist.**
   > `// Browser-accepted separately (see CLAUDE-HANDOFF.md) at 320/390/768/1440 + zoom.`
   `CLAUDE-HANDOFF.md` is present in **neither the commit tree nor any ref in the repository's history** (`git ls-files`, `git log --all -- "*CLAUDE-HANDOFF*"` both empty), and it is absent from the orchestration workspace. This directly contradicts the orchestration ledger: EVIDENCE line 22 records "**no authenticated browser acceptance was run**" and QUEUE line 57 records "browser acceptance remains." The comment therefore overstates the verification status and points at evidence that never existed.

**Impact.** Not a functional/security defect — the code is correct (see below). It is an evidence-integrity/documentation-truth defect: the deliverable's own test advertises browser acceptance that was not performed and cites a phantom document, and the "focused" evidence recorded in QUEUE/EVIDENCE is non-behavioral. The build has rejected on documentation-truth P2 before (ABUSE-002 roadmap `Why` 400-char contract), so this is treated consistently.

**Why acceptance also fails the "required evidence is real" clause.** For a UI slice, required evidence includes behavioral/browser verification; the shipped focused evidence is source-string and the browser-acceptance claim is phantom. I supplied the missing behavioral evidence myself (below), which confirms the code is correct — but the deliverable's own evidence is not real.

**Smallest corrective requirement (do not fix here).** Either (a) land the referenced browser evidence and a real behavioral/DOM check (or link genuine loopback screenshots that exist in-tree), or (b) correct line 7 to reflect actual status (e.g. "authenticated browser acceptance pending independent verification") and remove the dangling `CLAUDE-HANDOFF.md` reference. No source/CSS change is required.

---

## What was verified GREEN (evidence is real)

**Gates (worktree @ `1cc13b2d`, hermetic, 127.0.0.1/in-process only):**
- Focused `smoke-settings-scroll.test.ts` — **exit 0, 4/4 pass, 0 skipped** — but **source-string; not counted as behavioral** (see P2).
- Adjacent settings regression (`smoke-settings-hash-navigation`, `smoke-settings-hub`, `smoke-settings-restructure`, `smoke-agency-settings-outcomes`, `smoke-agency-settings-roles`), run with `NODE_OPTIONS='--conditions react-server'` — **exit 0, 36/36 pass, 0 fail, 0 skipped** (behavioral; includes real `resolveSettingsTabHash` hash-navigation logic and the role/capability contracts).
  - Note: a first run without `--conditions react-server` produced 6 false failures — all the `server-only` guard (`This module cannot be imported from a Client Component module`) firing at import of `src/lib/server/auth/auth.ts`. That is a harness-flag omission on my part, not a code defect; the flagged rerun is 36/36. (Counted only the correct run.)
- `node node_modules/typescript/bin/tsc --noEmit` (full project) — **exit 0, 0 diagnostics**.
- `git diff --check 1cc13b2d^ 1cc13b2d` — **exit 0, clean**.

**Independent in-browser behavioral verification of the layout contract** (I authored a faithful 1:1 static replica of the exact ancestor chain — `h-[100dvh] overflow-hidden` shell → inner `<main overflow-y-auto overscroll-contain>` scroll container (mirrors `agency/layout.tsx:212/218/246`) → `max-w-5xl` page → grid `lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start` → the reviewed sticky `<nav>` + a tall pane — served on `127.0.0.1` and driven with the browser tool). Results:
- **1440×900 (desktop):** rail `display:block`, `position:sticky`, `top:24px`, `max-height:772px` (=100vh−8rem), `overflow-y:auto`; grid = `240px 760px`; mobile grouped `<select>` `display:none`; inner `<main>` scrolls; on `main.scrollTop=600` the rail **pins at y=100** (main content-top 56+20 padding + 24 top) instead of scrolling to −442 → **sticky definitively engaged** against the inner scroll container; **no horizontal document overflow** (scrollWidth==clientWidth==1440).
- **768 / 390 / 320 (below `lg`):** rail `display:none`, grouped `<select>` `display:grid`, single-column grid (`736px` / `358px` / `288px`), **no horizontal overflow** at any width.
- **1280×400 (200%-zoom-on-wide-screen analog — rail taller than viewport):** rail bounded to `max-height:272px` (`clientHeight 272`, `scrollHeight 882`), **scrolls internally** (`scrollTop` moves), no clipping, no document horizontal or vertical overflow beyond the shell — exactly the diff comment's claim.

**Structural correctness (source inspection):**
- The authenticated portal shell scrolls in an **inner `<main>` (`overflow-y-auto`)** at `agency/layout.tsx:246`; the `overflow-hidden` ancestors (`:212`, `:218`) sit **above** that main, so they do not sit between the sticky nav and its scroll container — `position:sticky` binds correctly to `<main>`. `lg:items-start` on the grid gives the sticky item travel. This is the correct, standard sticky-rail pattern; no ancestor silently defeats it.
- The change is isolated to presentation. **Persisted selection** (`selectTab` → `setActive` + `history.replaceState('#'+id)`) and **focus order / focusable structure** (search input + section controls inside the pre-existing `<nav>`) are untouched by adding sticky/scroll classes — regression-safe by inspection and corroborated by the 36/36 adjacent suite (hash navigation green).

## Documentation-truth audit (this slice)
- **QUEUE.md line 57** ("desktop sticky/scrollable rail and small-width single-column fallback with 4/4 + 28/28 adjacent + TypeScript/diff green; browser acceptance remains; handoff's `1c67e5b7` SHA is stale"): **accurate** — the CSS matches, gates are green, and the actual reviewed HEAD is `1cc13b2d` (the `1c67e5b7` stale-SHA note is correct; `1c67e5b7` is not this commit). My adjacent selection returned 36/36 (a green superset of the handoff's 28).
- **EVIDENCE.md line 22:** **accurate** — sticky + bounded internal scroll/overscroll-contain at desktop, sub-lg select-driven single column, 4/4 + 28/28, tsc/diff green, "no authenticated browser acceptance was run."
- **DECISIONS #10:** matches the slice exactly ("left navigation sticky … independently scrolls the right content pane … single-column fallback on small screens and zoom"). Accurate.
- **Discrepancy (reported as the P2 above):** the shipped test comment claims browser acceptance and cites `CLAUDE-HANDOFF.md`, which exists in no ref; this contradicts EVIDENCE's "no authenticated browser acceptance."

## Separation of concerns
- **Attributable:** the P2 evidence-integrity/documentation-truth finding above. No P0/P1.
- **Pre-existing / inherited (NOT attributable to this slice):** the parent commit `604dfe5e` (ABUSE-BASE-001) migration `supabase/migrations/20260912140000_abuse_admission_limiter.sql` is present in this tree (inherited from the parent). Its version collides with the accepted `20260912140000_aqua_tag_capture_admission_claims.sql` on the release line — reported in full under `reviews/ABUSE-BASE-001-604dfe5e.md`. Attributable to ABUSE-BASE-001, not to SETTINGS-SCROLL-001.
- **External / live-only (NOT counted):** authenticated real-page browser acceptance — focus order and 200% zoom against the **real** Settings content, persisted-selection interaction on the live page, and an axe run on the authenticated route — could not be exercised hermetically (the page is auth-gated; the boundary forbids real credentials). My contract replica verifies the layout mechanism behaviorally but not the authenticated page's real content/focus/axe. This is the "browser acceptance remains" gate already recorded by the orchestration.

## Commands run (all local, hermetic)
```
git worktree add --detach <TMP>/aquacrm-claude-review-20260912 1cc13b2d
node --import <tsx>/dist/loader.mjs --test scripts/smoke-settings-scroll.test.ts                 # exit 0, 4/4 (source-string)
NODE_OPTIONS='--conditions react-server' node --import <tsx>/dist/loader.mjs --test \
  scripts/smoke-settings-hash-navigation.test.ts scripts/smoke-settings-hub.test.ts \
  scripts/smoke-settings-restructure.test.ts scripts/smoke-agency-settings-outcomes.test.ts \
  scripts/smoke-agency-settings-roles.test.ts                                                    # exit 0, 36/36
node node_modules/typescript/bin/tsc --noEmit                                                    # exit 0, 0 diagnostics
git diff --check 1cc13b2d^ 1cc13b2d                                                              # exit 0, clean
# independent browser contract probe: static replica served on 127.0.0.1:8137, driven at
# 1440/768/390/320 and 1280x400 (zoom analog) — sticky engaged, single-column fallback,
# internal rail scroll, zero horizontal overflow at every width.
git log --all -- "*CLAUDE-HANDOFF*"                                                              # empty (file never existed)
```

## Skipped / hung / unrun gates
- No hung tests; no zero-subtest suites; nothing skipped in the counted runs.
- The 4 focused tests are **source-string** (not behavioral) — noted, not counted as behavioral evidence.
- First adjacent run (without `--conditions react-server`) had 6 false import-guard failures — discarded; corrected rerun 36/36.
- **Authenticated** browser walk / axe on the real page: **not run** (auth-gated; external/live-only).

## No-live statement
No source/test/migration/doc was edited. No commit, cherry-pick, merge, push, PR, deploy, or migration apply. No contact with any live/deployed site, Railway, Supabase cloud, DNS, provider, email/SMS/payments. No real credentials or data. All work was local, in-process, or 127.0.0.1-only (a throwaway `python3 -m http.server` bound to 127.0.0.1 served only my own static replica in the scratchpad; it was stopped afterward). Heavy-job lock was held for the full-tsc run and released.
