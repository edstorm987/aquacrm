# Handoff — the Dev Editor, 22 August 2026

**Written for the next agent (Ed is continuing in Codex).** Everything here was
built and verified in one long session. Read this, then
[`aqua dev.md`](../../aqua%20dev.md) (the map) and
[`plans/dev-editor-finish.md`](../development/plans/dev-editor-finish.md) (the 18-phase
plan, 13 ticked). Do not re-explore from scratch — this file exists so you don't have to.

---

## 1. The one thing that matters most

**13 of 18 phases shipped, each adversarially verified by 2–4 independent agents.**
Suite **3,354 pass / 0 fail / 1 skip**, `tsc` exit 0.

And the proof that isn't a test: **the editor created `hello-ed.md` in the real client
repo `edstorm987/Beast-marks`, chained a second commit, and opened PR #1** — from the
browser, through the draft branch. The write path is not theoretical.

```
780eb08  create hello-ed.md      (via the + menu)
4da8b29  save hello-ed.md        (CHAINED on the branch tip — the fast-forward fix, live)
PR #1    https://github.com/edstorm987/Beast-marks/pull/1   (open, unmerged)
```

**If you do nothing else: that PR is still open.** Ed's next test is merging it *from
inside the editor's Drafts tab* (built, never walked) rather than on GitHub.

---

## 2. Ed's rules — learned the hard way, do not relitigate

| Rule | Why it exists |
|---|---|
| **Everything editor-wise lives IN the editor** | Ed, four times: tag, GitHub, AI token, settings, and finally *"no everything inside the editor thats the whole point of it"* when I sent him to GitHub to press merge. Never link out to finish what the editor started. |
| **Check whether it exists before building** | **Seven times** in one session the feature was already built and merely unmounted: the studio, the tag's element explorer, 70 blocks, 26 device presets, `devProjectVisualEditorUnlocked()`, the git ops, `mergePullRequest`. Search `docs/reference/` and `feature-index.md` FIRST. |
| **Never `git checkout`/`restore`/`reset`** | The tree carries other workers' uncommitted work. |
| **Never push/commit unless Ed asks** | A push triggers Vercel → production. |
| **Run the FULL suite** | `NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts`. Contract tests in unrelated files pin editor behaviour, including exact strings. |
| **NEVER set `PORTAL_DATA_FILE` for a full-suite run** | It violates the memory-backend invariant and manufactures ~47 false failures. Isolated state files are for single harnesses only. |
| **Build the inputs; Ed fills real credentials** | Never enter, invent or commit a real key. |

---

## 3. What shipped (all verified)

**The editor is `src/engines/editor/DevEditor.tsx`**, mounted by two doors, lifted out of
the old portal-studio component (which is why portal assumptions stopped leaking).

- **Aqua Tag** — made, snippeted, bound and verified in the editor. Eight tag states,
  each with a sentence that is true. `dead-snippet` (installed but its script can't load)
  **revokes** the browser rather than claiming verified.
- **GitHub** — connected inline in the editor; saves AND auth-checks on the spot. Map
  explains a 404 (fine-grained tokens answer 404, not 403, outside their grant) instead
  of relaying "Not Found".
- **Write path** — `repoWrite.ts`: save/create commit to `aqua-editor/<projectId>`,
  branch-tip reads, fingerprint lost-update guard, hidden-path refusals, per-branch lock.
  Publish opens/reuses the PR. **Merge and revert are in the Drafts tab.**
- **Words → source** — find → *human confirms a candidate* → commit. `sourceMatch.ts`
  refuses rather than guessing into JSX.
- **Aqua Editor AI** — its own vault provider (`aqua-editor-ai`), per-project config and
  history, its own UI, and a **reply path on the project's own key with no fallback**.
- **Librarian + `findFiles()`** — file-finding built once as a skill, consumed by the
  Librarian (Dev-mode tab). The editor AI *edits*; the Librarian *finds*.
- **70 blocks** mounted and lazy-split; inserting one **writes real code** (preview → confirm → commit).
- **Three modes** (Just tell it / Visual / Dev), **exact device sizing** with drag handles,
  **network throttling** through the tag, **two-level project nesting**.

---

## 4. What is NOT done — the honest list

**Phases 8, 9, 17, 18 are unstarted.** Full text in the plan; the summary:

1. **Phase 8 — the navigator.** Ed: *"if i put in a website id get stuck."* The browser
   loads ONE address and there is no way to reach the site's other pages. Three header
   switchers: project (scoped to the door project + its children — the reasoning for
   *door*-anchoring is written into phase 8, read it), **navigator**, surface.
2. **Phase 9 — Website vs Normal surface modes.** Per-page SEO/OG/canonical in Website
   mode. **Orthogonal to the editing modes** — and do NOT resurrect `projectKind`, that
   field caused half the bugs this session.
3. **Phase 17 — the browser walk.** Large parts of the above have never rendered in a
   browser. Everything built after ~22:00 on 21 Aug is logic- and contract-tested only.
4. **Phase 18 — the editor in a client portal.** The WHOLE editor, unchanged (Ed was
   explicit — no cut-down variant, no role-hidden features). The only boundary is
   tenant-then-project scoping.

**Known gaps inside shipped work:**

- **Ed's live client tag is dead** — the snippet on `beast-marks.vercel.app` points at
  `http://localhost:3032/aqua-tag.js`, which no visitor's browser can load. **Ed's fix,
  not code:** set `NEXT_PUBLIC_PORTAL_BASE_URL` to the public portal address, regenerate
  the snippet, re-paste. Until then words/visual/assist have no elements on that site.
- **Saved components** — deliberately not built; no per-agency store exists.
- **The insert emitter** writes structural, unstyled markup with default words — correct
  code that compiles, not a styled Squarespace section. Gap stated in the plan.
- **Mobile** has no in-editor project switcher (the compact one is `xl:` and up).
- **The app-wide browser audit FAILED** — 6 of 8 walkers errored on the browser pane's
  tab cap. Re-run with walkers sharing ONE tab sequentially, not one tab each.

---

## 5. Traps that will cost you an hour each

- **`TAB_META` is an exhaustive `Record<InspectorTab, …>`** — adding a tab to
  `INSPECTOR_TABS` and adding its `TAB_META` row + panel branch is ONE compile unit. tsc
  holds them together; do all three or none.
- **Tab-count pins.** Several suites assert exact tab arrays and counts
  (`smoke-editor-target-aware`, `smoke-dev-editor-tag-bridge`, `smoke-editor-element-palette`,
  `smoke-librarian`). A new tab reddens them all — rewrite loudly, never delete.
- **The tag protocol drift guard** (`smoke-aqua-tag-bridge.test.ts`) proves 22/22 mutations
  detected. If you add a message, extend the guard **in both directions** and mutation-test
  it. A guard hole is exactly how the original "editor and tag speak different languages"
  bug survived.
- **Doc generators do not prune.** After a move: `rm -rf docs/reference/files`, run both
  generators, then `grep` the old path expecting zero hits.
- **`docs/development/roadmap.md` is byte-fragile** — a test round-trips it. Edit it
  through the Dev Console, never by hand.
- **Plans with zero parsed phases** are pinned by an exact list in
  `smoke-dev-tasks-parse.test.ts`. A new plan needs a real `## Phasing` numbered list.

---

## 6. Where to look

| Question | File |
|---|---|
| Where does anything in the editor live? | [`aqua dev.md`](../../aqua%20dev.md) — the full map |
| What's left and in what order? | [`plans/dev-editor-finish.md`](../development/plans/dev-editor-finish.md) |
| What changed and when? | [`development/updates.md`](../development/updates.md) — the log |
| Where do we stand overall? | [`development/checklist.md`](../development/checklist.md) |
| What must not be built twice? | [`workspace/hazards-and-duplication.md`](../workspace/hazards-and-duplication.md) |
| What is broken elsewhere in the app? | [`development/findings/2026-08-22-app-audit-salvage.md`](../development/findings/2026-08-22-app-audit-salvage.md) — **read this, it has a live access-control hole in it** |

---

## 7. The app audit — partial, and one finding is urgent

An app-wide browser audit ran and **mostly failed** (6 of 8 walkers died on the browser
pane's 9-tab cap). Two clusters reported, verified in-process rather than visually. Full
report in the findings file above. The one that should not wait:

> **`agency-staff` can open `/portal/agency/agency-finance/{budgets,operations,planning,settings}`
> by typing the URL — and Operations ships salaries and bonuses in its SSR props.** The
> nav hides those tabs; the pages do not. The plugin manifest declares no
> `visibleToRoles`, so the host's only gate is `requireRole(AGENCY_ROLES)`.

Also real: Stripe can never be configured (no surface renders the manifest's settings
fields), and two marketing panels tell a real founder they are "in a demo session" when
an enquiry read fails.

**If you re-run the audit: ONE browser walker, sequentially.** Eight agents each
demanding a tab is what killed it.

**Uncommitted:** everything from this session is in the working tree on
`work/2026-08-20-parallel-session`, one commit ahead of origin (`69e96bb`) plus ~320
changed files. Ed is opening the PR himself from the app's Create PR control.
