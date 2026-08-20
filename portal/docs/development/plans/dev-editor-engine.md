# The Dev Editor Engine (was "Aqua Engine")

**Status:** planned — Ed's grand-unification vision 2026-08-20. BIG epic, phased. Most pieces
ALREADY EXIST; the work is unification + install-tiering + rename, not building from scratch.

## Rename
"Aqua Engine" → **DEV EDITOR ENGINE** (Ed: more fitting). Same thing we renamed "Studio" to
earlier; this is the final name. It is the ONE engine that edits everything.

## The vision (Ed, verbatim intent)
> "the editor is supposed to be the full-blown engine in max spec including our version of VS
> Code, the whole git registry, so I can straight-up edit everything. This makes the Dev Team
> installable into other products — a software portal internal workspace — so I can build other
> client portals just using this. Right now the whole Dev Team is in its macro view; it can be
> installed into client internal workspaces for fulfilment. The engine detects what it's looking
> at (website / portal / software / whatever) and adapts. I can hardcode the install: a non-tech
> client gets only the simple editor; others get the whole thing. Setup should be real simple —
> all it should ever need is a GitHub link, an Aqua Tag install, and Vercel, then it all just
> works seamlessly."

## What ALREADY EXISTS (the unification substrate — do NOT rebuild)
- **Code + git ("our VS Code"):** `src/lib/server/siteEditor/` — `githubSource.ts`
  (readRepoTree/readRepoFile, GitHubRepoSource), `fileTree.ts` (TreeFile/TreeDirectory,
  MAX_EDITABLE_BYTES), `codeAdapter.ts` (codeEditAdapter), `patch.ts` (plan/applyPatch),
  `publish.ts` (publishEdits → commit). UI already at `/portal/agency/development/code`
  (`_CodeWorkspace.tsx`).
- **Element/block editing:** the current Aqua Engine (`src/lib/elements/**` + website-editor
  plugin) — hero/blocks/portal vocabulary, the P1-P3 work.
- **The unifying loop with ADAPTERS:** `src/lib/editing/engine.ts` — EditTarget → plan →
  confirm → publish, with adapters for portal / website / marketing / **source (git)**. This is
  literally the "detect and adapt" mechanism Ed describes; it already spans blocks AND git.
- **Editing modes:** `src/lib/editing/modes.ts` — simple / visual / developer (tab-gated). This
  IS the "simple editor vs full engine" tiering, already modelled.
- **Install machinery:** the plugin system (`pluginInstalls`, 13 modules) — how an engine gets
  installed onto a scope (agency/company/client) with a `features` map. The Dev Editor Engine
  becomes an installable module with a tier in that features map.
- **Setup inputs:** GitHub (`githubSource` + `githubProjectPublisher`), Aqua Tag (built), Vercel
  (`vercelDomain`/`vercelProjectDeployer`). The three setup inputs Ed names already have modules.

## What is actually NEW (the epic)
1. **Unify** code+git (siteEditor) + blocks (elements) + app-config under ONE Dev Editor Engine
   surface, driven by `editing/engine.ts` adapters. One editor, target-detected.
2. **Target detection + adaptation:** the engine inspects what it's opening (a website repo, a
   client portal, a software project, app config) and picks the right adapter + mode automatically.
3. **Dev Team as the editor's home** (macro view) AND **installable into client internal
   workspaces** (fulfilment micro view) — the Dev Team becomes a "software portal internal
   workspace" you can drop into a client, so client portals are built with the same engine.
4. **Install tiers, hardcodable per client:** simple-editor-only (non-tech client edits their
   website) … up to the full engine (code+git+everything). Rides the plugin `features` map +
   the existing editing modes.
5. **Seamless setup contract:** GitHub link + Aqua Tag install + Vercel → the engine wires
   itself and "just works". Codify this as the install flow.

## Phases (high level — this is multi-sprint)
1. **Rename** Aqua Engine → Dev Editor Engine (labels + docs; cheap, do first).
2. **Point the Dev Team editor at the real engine** — replace the app-config-only editor with
   the siteEditor code+git engine (`_CodeWorkspace` machinery) surfaced in Dev Team. (This is the
   immediate "editor is wrong" fix; folds into the Dev Team shell lane's Editor item.)
3. **Unify** blocks + code+git + app-config behind engine.ts adapters, with target detection.
4. **Make it an installable module** with tiers (features map + editing modes).
5. **Client-workspace install** (fulfilment micro view) + the GitHub+AquaTag+Vercel setup flow.

## Files (broad — epic)
`src/lib/editing/**`, `src/lib/elements/**`, `src/lib/server/siteEditor/**`,
`src/app/portal/agency/development/code/**`, `src/app/portal/dev-team/editor/**`,
`src/built-ins/modules/website-editor/**` (rename), plugin install layer, client internal
workspaces. Overlaps many SHARED files — phased, one sub-surface at a time, never all at once.

## Open questions for Ed (later, not blocking capture)
- Tier definitions: how many install tiers, and exactly what each exposes?
- Does a client-installed engine commit to THEIR GitHub repo, or a sandbox we control?
- Macro (Dev Team) vs micro (client fulfilment) — same routes reskinned, or separate mounts?
