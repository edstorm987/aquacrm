# Plan — Dev Docs: in-app docs browser (owner / dev-only) ⚡

← [todo.md](../todo.md) · [development.md](../../development.md)

**Status: ✅ SHIPPED — all 3 phases (2026-08-19), browser- and bundle-verified.**

> 📌 **Qualifies for `plans/archive/` but has NOT been moved.** Tried on 2026-08-20 and reverted: `scripts/smoke-dev-docs.test.ts:171–172` looks this file up by its exact path, `docs/development/plans/dev-docs.md`, and asserts the Dev Docs plan is indexed. Moving it breaks two Dev Docs suites. The move needs that path updated in the same change — source, not docs. **Commander's call.** The `:3032` walk and the react-markdown webpack confirmation are CLOSED: `_DocMarkdown.tsx` was split into a lazy `_DocMarkdownBody.tsx` (`next/dynamic ssr:false`) and the doc render was verified in a real `next build` + browser pass. Absorbed into the Dev Team Library, but the standalone `/portal/agency/dev-docs` route + settings-footer entry BOTH still exist.
gated sidebar item, in-app viewer (`react-markdown` + `remark-gfm`), and the
overview blocker strip (parsed live from state.md) all landed; suite-green +
behaviourally proven + SSR render-proofed. Pending only the Commander's `:3032`
visual walk + react-markdown webpack-bundle confirmation (this worker shares the
folder — no worktree isolation, so it can't self-spin a server). Ed's two
decisions: **list everything incl. `reference/`** · **blockers parsed from state.md**.
📄 **Full worker debrief → [dev-docs-handoff.md](dev-docs-handoff.md)** (done · decisions · verification · challenges · real thoughts · what the orchestrator should do).
An owner-only, **Dev-Mode-gated**
"Dev Docs" sidebar surface that lists every dev doc (plans, updates, state, todo,
audits, context, workspace chapters) with **last-edited** time, renders the
markdown **in-app**, and opens on a **status overview**. So Ed can see everything —
all plans, what moved, the whole picture — without leaving the app. Reads the
**live files**, so it's always current (supersedes the one-off status artifact).

## Why it's safe + easy
- **Dev-only.** Gated behind `canUseDevMode()` / `isDevModeEnabled()` (the Dev Mode
  gate: `PORTAL_DEV_MODE` + not production + file/memory backend). It **never ships
  to prod**, so reading `docs/` off the local filesystem is fine and safe — no
  Vercel/serverless-fs concern because it only ever runs locally.
- **Owner-only** on top of the dev gate (`effectiveRole(session).isFounder`).
- **Read-only.** It browses + renders docs; it does not edit them.
- **Reuse:** the Dev Mode gate (`devMode.ts`), the sidebar (`lib/chrome/sidebarLayout.ts`),
  any existing markdown renderer in the app (check SOP library / the portal block
  model / `docs`-rendering helpers before adding a lib), Node `fs.promises` + `path`.

## Design
- **Sidebar:** a new dev-only item **"Dev Docs"** in `sidebarLayout.ts`, shown only
  when `canUseDevMode()` + founder. Route `app/portal/agency/dev-docs/`.
- **Doc index (server):** a server function walks the dev-docs dirs —
  `docs/development/plans/`, `docs/development/*.md`, `docs/context/*.md`,
  `docs/workspace/*.md` — for `*.md`, returning `{ path, title, category, mtimeMs, sizeBytes }`.
  Titles from the first `# heading`; category from the dir. **Sorted by last-modified**
  (recently-touched first) with category grouping.
- **Doc viewer:** click a doc → server reads the file → render its markdown in-app,
  with a "last edited <relative time>" stamp + the raw path. Sanitised render (these
  are trusted local files, but escape by default).
- **Overview landing:** a status summary at the top — counts by state, the launch
  blockers, and a "recently edited" list (top N by mtime). Simple-first: the
  recently-edited list is the hero (that's the "what moved" Ed wants); a hand-curated
  or state.md-derived blocker strip above it.

## Phases (simple-first)
1. ✅ **Index + sidebar.** Dev-only "Dev Docs" sidebar item + route; the server doc-index
   (all dev `*.md` with mtime + category), rendered as a grouped, **recently-edited-first**
   list. Each row: title · category · "edited 3m ago" · path.
2. ✅ **Viewer.** Click a doc → render its markdown in-app (last-edited stamp). Back to index.
3. ✅ **Overview landing.** Status strip (state counts + launch blockers) + the recently-edited
   feed as the landing view.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/lib/server/dev/devDocs.ts`
- `src/app/portal/agency/dev-docs/page.tsx`
- `src/app/portal/agency/dev-docs/_DevDocsIndex.tsx`
- `src/app/portal/agency/dev-docs/_DevDocViewer.tsx`
- `src/app/portal/agency/dev-docs/_DocMarkdown.tsx`
- `src/app/portal/agency/dev-docs/_DocMarkdownBody.tsx`
- `src/app/portal/agency/dev-docs/_DocTree.tsx`
- `src/app/portal/dev-team/library/_LibraryDocViewer.tsx`
- `scripts/smoke-dev-docs.test.ts`
- `src/lib/chrome/sidebarLayout.ts`
- `src/app/portal/agency/layout.tsx`
- `src/lib/shared/formatDateTime.ts`
- `package.json`
- `docs/development/plans/dev-docs.md`

## Decisions (Ed) — small
- **Which doc dirs to include:** default = `development/plans` + `development/*.md`
  (updates/state/todo/audits/status) + `context/*.md` + `workspace/*.md`. Confirm or trim.
- **Overview blocker strip:** hand-curated for now vs. parsed from state.md. [default: simple hand-curated + the recently-edited feed]

## Done when (runtime-verified)
In Dev Mode as the owner: a **"Dev Docs"** sidebar item appears (and is **absent**
for a non-dev/prod-like context); it lists every dev `*.md` **newest-edited first**
with a last-edited stamp; clicking one renders the markdown in-app; the landing shows
the status overview. Browser-verified on `:3032` (the builder can self-verify now via
`dev:verify` + `/dev`).
