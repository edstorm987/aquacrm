# Dev Docs — worker handoff (for the orchestrator)

← [dev-docs.md](dev-docs.md) (the plan) · [development.md](../../development.md) (the law) · [state.md](../context/state.md)

_Debrief from the Dev-Docs worker, 2026-08-19. Everything I did, why, what's proven, what's left, and my honest read. Nothing lives only in chat._

---

## TL;DR
**Plan complete — all 3 phases + 2 Ed-requested extras.** Code-complete, **full suite 1738 / 0 fail**, my files `tsc`-clean, **22 behavioural tests** + safe render/scan proofs. **One new dependency** (`react-markdown` + `remark-gfm`, npm, Ed-authorised — shared `package.json`). **Nothing committed.**

**The one thing NOT done — and it isn't mine to do:** the **`:3032` browser walk**. This session shares `aquaCRM/portal/` with the Commander's `:3032` and has no git-worktree isolation, so I could not self-spin `dev:verify` without clobbering the shared sandbox ([[aquacrm-preview-lock-hand-verify-to-commander]]). So the logic is proven; the **live look + the react-markdown webpack bundle** need a real browser pass. **→ Commander, then auditor.**

---

## What it is
An **owner-only, Dev-Mode-gated "Dev Docs"** surface at `/portal/agency/dev-docs` that lists **every markdown doc in the project** (1,802 today) live off disk, newest-edited first, in a **collapsible folder tree**, renders any doc's markdown **in-app**, and opens on a **status overview** (launch blockers parsed from state.md). Read-only. Never ships to prod.

## What shipped (phase by phase)
- **Phase 1 — Index + sidebar.** A dev-only **"Dev Docs"** item in the settings footer (`sidebarLayout.ts`), the route + a server doc-index that scans off disk newest-first, grouped, with a "3m ago" stamp.
- **Phase 2 — Viewer.** Click a doc → `readDevDoc` (gated, path-confined) → markdown renders in-app via **`react-markdown` + `remark-gfm`** (raw HTML escaped by default), styled via a components map (external links → new tab; relative doc links neutralised so a click can't 404), with a last-edited stamp + back link.
- **Phase 3 — Overview.** A **Launch blockers** strip **parsed live from state.md's `## Blockers`** (`parseBlockers`), open 🔴 + a collapsible "cleared" list, atop the recently-edited feed.
- **+ Extra 1 (Ed: "all of the docs"):** widened from the six `docs/` dirs to **every markdown file in the portal** (a single project-root walk skipping `node_modules`/`.next`/`.git`/build dirs). That pulled in the **root handoff files** (`CLAUDE.md`, `AGENTS.md`, `README.md`), the `src/` module READMEs, `public/`, `assistant-integrations/`.
- **+ Extra 2 (Ed: "in folders" + lazy):** a **collapsible folder tree** mirroring the real layout, then **lazy-expand** — a folder's children **mount only when opened**, so the DOM never holds all ~1,800 nodes (the 1,700-file `reference/` tree isn't in the page until clicked). SVG chevrons, indent guides, hover, tabular counts/ages.

## The gate (the crux — why reading `docs/` off disk is safe)
Three independent layers, all requiring **`canUseDevMode()` AND `effectiveRole(session).isFounder`**:
1. **Sidebar item** — only appears for a founder in Dev Mode. `buildSidebar` stays a **pure** function: the caller (`agency/layout.tsx`) injects a `devModeAvailable` flag (it already computes `canUseDevMode()`), so the env read never moved into the assembly and the sidebar tests stay hermetic.
2. **Route** (`page.tsx`) — `notFound()` unless founder + Dev Mode. Reads as "this route doesn't exist" in any prod-like context.
3. **Reader** (`devDocs.ts`) — `listDevDocs`/`readDevDoc` assert the same gate; `readDevDoc` is path-confined to the project root (rejects `..`/absolute escapes, non-`.md`, and vendor/build dirs).
Defaults off for every other `buildSidebar` caller. Invisible + unreachable in production — that's the whole safety story.

## Decisions
**Ed's (surfaced up front):** (1) list **everything incl. generated `docs/reference/`**; (2) blocker strip **parsed from state.md** (not hand-curated). **Mid-flight (Ed):** (3) use a **markdown library** for the viewer (I'd recommended hand-rolling; Ed chose the library — hence react-markdown); (4) **all** docs incl. the root handoff files; (5) **folders + lazy-expand**.
**Mine (defaults, flagged):** sidebar item lives in the settings footer (survives the AquaOasis nav override, which drops non-canonical main items but keeps settings); injected the dev-mode flag rather than reading env inside `buildSidebar`; extracted `relativeAge` into the isomorphic `formatDateTime.ts` so the client tree can use it (out of the `server-only` module).

## Verification — honest levels
- **Static + logic + behavioural:** `smoke-dev-docs.test.ts`, **22 cases** — the gate (incl. absent / non-founder / client-scope / prod-like negatives), the both-required predicate, the live scan (every doc, newest-first, tree structure, known plan present, root files in, `node_modules` out), the tree-builder (counts aggregate, folders-before-files, nesting), `readDevDoc` path-safety (traversal / non-`.md` / missing / vendor-dir all rejected), the blocker parser, `relativeAge`.
- **Full suite:** **1738 / 0 fail / 1 pre-existing skip.** **`tsc`:** my files clean.
- **Safe runtime proofs (no server, read-only):** SSR'd the real `DocMarkdown` via `react-dom/server` → correct HTML (h1, GFM `<table>`, `<pre>` code, styled inline code, external `target=_blank`, relative href absent); ran `scanDevDocs`/`scanBlockers` against the live repo (1,802 files, correct tree + blockers).
- **NOT done:** the `:3032` browser walk (see TL;DR) and the react-markdown **webpack bundle** confirmation.

## Files
**New (mine):** `lib/server/devDocs.ts`; `app/portal/agency/dev-docs/{page,_DevDocsIndex,_DevDocViewer,_DocMarkdown,_DocTree}.tsx`; `scripts/smoke-dev-docs.test.ts`.
**Additive shared (flagged):** `lib/chrome/sidebarLayout.ts` (one gated settings item + the `devModeAvailable` input); `app/portal/agency/layout.tsx` (one line injecting `canUseDevMode()`); `lib/formatDateTime.ts` (added `relativeAge`); `package.json` + `package-lock.json` (react-markdown + remark-gfm).
**Touches no product surface** — radar, finance, people, inbox, auth/login all untouched.

## Challenges + notes (the non-obvious stuff)
- **npm vs pnpm.** The folder has BOTH `package-lock.json` and `pnpm-lock.yaml` + a `node_modules/.pnpm` dir, but it's **npm-managed** (real `node_modules/next`, newer lockfile, `.npmrc` says `npm install`). Adding the dep with pnpm would have corrupted the shared `node_modules`. Saved as a memory ([[aquacrm-package-manager-is-npm]]) so the next dep-adder doesn't trip it. Installed while `:3032` was down; snapshotted the manifests first.
- **server-only boundary.** Lazy-expand needs the tree to render client-side, but `devDocs.ts` is `server-only` — so `relativeAge` moved to `formatDateTime.ts`; the client tree imports only that + `type DevDocTreeNode` (types are erased, safe).
- **Two `tsc` errors that are NOT mine.** `.next/dev/types/.../inbox/cardsim/page.ts` (TS2307) — stale generated types from another worker's deleted throwaway `cardsim` route. They appeared mid-session from concurrent-worker `.next` churn; nothing to do with dev-docs. I didn't touch another worker's `.next`.
- **Symbol-reference regen deferred (on purpose).** My new exports mean `generate-symbol-reference.mjs` is technically stale, but (a) another worker regenerated it ~mid-session so mine would conflict, and (b) regenerating churns the mtimes of the very `docs/reference/` files this feature displays as "recently edited." Better as an end-of-wave step.
- **DOM size → solved.** The first tree cut server-rendered all ~1,800 nodes (collapsed via `<details>`); Ed asked for lazy-expand, so the client tree now mounts children on open only.

## My honest read
- **The gate is the whole game, and I'm confident in it** — three layers, pure/hermetic sidebar, path-confined reader, defaults-off. The behavioural tests pin exactly the "appears only for founder+DevMode / absent otherwise" contract, which is the #1 safety property.
- **The one real risk I can't close from here is react-markdown bundling under Next 16 webpack** (this is "not the Next.js you know" per AGENTS.md). I proved it renders at runtime (SSR) and it typechecks, but webpack bundling of the ESM tree as a client component is the untested bit. **If the viewer errors on `:3032`, that's the first suspect — and note Phases 1 & 3 don't import react-markdown, so the index + tree + blockers + gate all stand even if the viewer needs a fix.** Suggest the Commander open a doc first thing.
- **Scope grew well beyond the original plan** (all-docs + tree + lazy) at Ed's request; the plan doc + status.md + updates.md are all updated to match, so it's not silent drift.
- **No content leaves the box** — it's founder-only, local-fs-only, read-only. The viewer sends only file *metadata* + the markdown of the doc you open, all behind the gate.

## For the orchestrator — what to do
1. **Confirm** from [updates.md](../updates.md) (4 dated entries) + [status.md](../status.md) (the Dev Docs row) + this debrief.
2. **Browser-verify on `:3032`** (the only open item): `/dev` → enter Dev Mode → **"Dev Docs"** shows in the settings footer → the tree expands (try `reference/`) → **click a doc → it renders styled** → the blockers strip shows → **Exit Dev Mode → "Dev Docs" is gone.** Then confirm no console errors (esp. a react-markdown bundling error on the viewer).
3. **Note the new dependency** (`react-markdown` + `remark-gfm`, npm) — a shared `package.json` change; relevant if anyone rebases/installs.
4. **Route to the auditor** (gate + path-safety are security-relevant).
5. **Log the row** in [state.md](../context/state.md) Workers-in-flight and **tick/close** the item, once browser-verified.
6. **Optional end-of-wave:** regenerate the symbol reference (`node scripts/generate-symbol-reference.mjs`) to capture the new exports.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `docs/development/plans/dev-docs-handoff.md`
