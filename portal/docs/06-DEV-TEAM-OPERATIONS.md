# Dev Team operations

> Commander/worker briefs, orchestration, live state and operational handoffs.
>
> Consolidated 2026-09-04 from **7** source documents / **18,737 words**. Each source is retained verbatim between provenance markers. The original path remains alongside it because relative links and runtime-backed Dev Team records still resolve from that location during the compatibility phase.

## Source map

- [`aqua dev.md`](#source-aqua-dev-md) — 3,658 words · `2f70ff272bdc`
- [`docs/context/commander-handoff.md`](#source-docs-context-commander-handoff-md) — 989 words · `0925e11d043b`
- [`docs/context/next-wave-briefs.md`](#source-docs-context-next-wave-briefs-md) — 2,481 words · `693f2947a2e0`
- [`docs/context/orchestration-model.md`](#source-docs-context-orchestration-model-md) — 963 words · `b619466bed62`
- [`docs/context/README.md`](#source-docs-context-readme-md) — 755 words · `9a90ee612b83`
- [`docs/context/state.md`](#source-docs-context-state-md) — 8,701 words · `6fd3a70b2a71`
- [`docs/context/worker-brief.md`](#source-docs-context-worker-brief-md) — 1,190 words · `995e16442d23`

---

<a id="source-aqua-dev-md"></a>

## Source document — `aqua dev.md`

<!-- AQUACRM_SOURCE_START path="aqua dev.md" sha256="2f70ff272bdcd0e4a31d250266053b1181b34a230256766958ca093b44abc1b3" -->
# Aqua Dev — where absolutely everything is

The Dev Editor and the dev workspace, mapped. Every path is relative to `aquaCRM/portal/`.

**Snapshot: 2026-08-21.** Written by hand against the real tree, not generated. If it disagrees
with the code, the code is right — say so and fix this file.

> **Why this is a map and not a folder.** Ed asked for all the dev files in one folder. Two of them
> can't move: Next.js App Router routes only exist if they live under `src/app/`, so moving
> `src/app/portal/dev-team/**` out deletes those pages; and `@/` is aliased to `src/`, so anything
> outside `src/` cannot be imported at all. A folder with a space in its name breaks the alias too.
> The code is already consolidated where it can be — `src/engines/editor/` is the engine. This file
> is the index over the parts that must stay put.

---

## 1. The two doors

There is **ONE editor**. It has two ways in, and both mount the same component.

| Door | Route file | What it is |
|---|---|---|
| Dev workspace | `src/app/portal/dev-team/editor/studio/page.tsx` | The main one. Reached from the projects workspace. |
| Agency portals | `src/app/portal/agency/portals/editor/page.tsx` | Pointed at a client portal. |

Both call `loadPortalStudioProps()` from `src/engines/editor/server/portalStudio.ts` and render
`DevEditor`. There is no separate "portal studio", "website editor" or "code editor" — those were
merged. If you find a doc saying otherwise, it's stale.

**The projects workspace** (what you land on first, *not* the editor):
`src/app/portal/dev-team/editor/page.tsx` → `src/app/portal/dev-team/editor/setup/_DevEditorSetup.tsx`

---

## 2. The editor itself

| Path | What |
|---|---|
| `src/engines/editor/DevEditor.tsx` | **The editor.** ~1,900 lines. Header, canvas, browser panes, inspector. |
| `src/engines/editor/server/portalStudio.ts` | Loads its props. Both doors use it. |
| `src/engines/editor/server/editorAssistant.ts` | Loads the AI side. **No longer the Advisor's brain** — see §9a. |
| `src/engines/editor/server/editorAi.ts` | **Aqua Editor AI's own config + its own token**, per project. |
| `src/engines/editor/server/editorAiHistory.ts` | **Its own chat history**, per project. Its own collection, capped. |

### Its UI pieces — `src/components/editing/`

| File | What |
|---|---|
| `EditorCodeCanvas.tsx` | File tree + open tabs + save. The Dev-mode workspace. |
| `CodeSurface.tsx` | CodeMirror 6 + VS Code Dark+ theme. Real grammars, real editing. |
| `AquaEditorAI.tsx` | **Aqua Editor AI's own interface.** Shell: identity, the project it is scoped to, and the capture strip. |
| `AquaEditorAIThread.tsx` | Its conversation — threads, messages, composer, clear-history. Per project. |
| `AquaEditorAIKey.tsx` | Its key, model and brief. Per project. Write-only key field. |
| `editorAiClient.ts` | The browser's side of its two endpoints. POST-only; nothing in a URL. |
| `editorAiSkin.ts` | The editor's clothes — accent, focus ring, contrast floor. **No `--dt-*`.** |
| `AddMenu.tsx` | The `+`. Blocks, files, folders. |
| `EditorModeSwitch.tsx` | The 4 modes, top-left, with the cutscene. |
| `BreakpointControl.tsx` | Device widths for the browser pane. |
| `RepositoryPanel.tsx` | The Repo tab. |
| `codeTheme.ts` | File-type colours. |
| `EditingOverlay.tsx`, `EditingNotice.tsx` | In-page editing chrome. **Currently unmounted.** |

---

## 3. The four modes

`src/engines/editor/editing/modes.ts` defines the ladder. They are **cumulative**, not four editors.

| Mode | Label | Needs | A click on an element goes to |
|---|---|---|---|
| `assist` | Just tell it | tagged browser | the AI |
| `simple` | Just the words | tagged browser | the exact text, in the right menu |
| `visual` | Visual builder | tagged browser | the builder |
| `developer` | Dev | **nothing** — repo files | all of it + the code surface |

Routing lives in `src/engines/editor/editing/selectionRouting.ts` — one click, four destinations.

**Dev is the only mode that works without an Aqua Tag**, because it reads repo files directly and
never needs a live page.

**THREE questions gate the inspector tabs. Do not conflate them** (`editing/modes.ts`):

| Question | Flag | Owns |
|---|---|---|
| Which vocabulary does this target speak? | `elementSurface` | **builder** — every target has one |
| Is there an Aqua-hosted portal DOCUMENT? | `portalTarget` | `PORTAL_DOCUMENT_TABS`: pages · brand · versions · code (the portal's own CSS/JS layer), plus **content** on a portal |
| Can a live page be clicked? | `tagMapped` | **element** — and **content** off a portal, in `assist` only (there it *is* the Element panel, and it must not appear twice) |

---

## 4. Aqua Tag — the whole chain

This is what makes the browser (and therefore words / assist / visual) work at all.

| Path | What |
|---|---|
| `src/lib/integrations/aquaTagSource.ts` | **The tag script itself** (~673 lines of browser JS as a string). Maps every element, hover/select outlines, click → `postMessage`. |
| `src/app/aqua-tag.js/route.ts` | Serves it at `/aqua-tag.js`. |
| `src/engines/editor/editing/aquaTagBridge.ts` | **The shared protocol.** Message names, payload types, parser, origin policy. Both sides import this so they can't drift. |
| `src/lib/integrations/aquaExplorerBridge.ts` | Older spelling. Now a pure re-export of the above — declares nothing. |
| `src/lib/server/integrations/aquaTagDetection.ts` | Server-side "is the tag actually on that page?" |
| `src/app/api/portal/aqua-tags/detect/route.ts` | The detect endpoint. |
| `src/app/api/public/aqua-tag-config/route.ts` | Config the tag fetches at runtime. |
| `src/engines/editor/server/mapProject.ts` | **Map.** Follows redirects, verifies the tag, records `finalUrl`. |
| `src/app/portal/dev-team/editor/setup/_DevEditorSetup.tsx` | **Where a tag gets MADE** (2026-08-21) — the editor's inspector Settings tab renders this. Snippet + copy + address + "Check it", per project. |

**Injection:** `/aqua-tag.js` is injected by `src/app/(website)/layout.tsx` only.
It is **not** on `/client-preview/*` — the portal preview reports selections through the
first-party block protocol instead. This is why the browser gate is `portalTarget || tagMapped`
and not tag-only.

**Two protocols, deliberately separate:**
- `aqua-explorer:*` — the tag, cross-origin, exact-origin checked
- `aqua:portal-block-select` — Aqua-hosted portals, same-origin only

---

## 5. Blocks and components

| Path | What |
|---|---|
| `src/engines/editor/elements/registry.ts` | **The shared block registry.** Both editors register into it. |
| `src/engines/editor/elements/portalElements.ts` | Portal-only block definitions. |
| `src/engines/editor/elements/palette.ts` | **What can be placed here** — `elementSurfaceFor` / `elementPalette(surface)` / `elementLibrarySentence`. |
| `src/engines/editor/elements/websiteElements.ts` | `ensureWebsiteElements()` — loads the website vocabulary on demand. |
| `src/engines/editor/elements/websiteVocabulary.ts` | The split point: the ONE import of the plugin's registry. |
| `src/engines/editor/elements/BlockRenderer.tsx` | Renders a block tree. |
| `src/engines/editor/elements/blockTreeOps.ts` | Insert / move / delete on the tree. |
| `src/engines/editor/elements/schema.ts`, `block.ts`, `definition.ts`, `ids.ts` | The vocabulary. |
| `src/engines/editor/elements/blockSchemaMigrations.ts` | Version migrations. |
| `src/built-ins/modules/website-editor/src/components/blocks/` | **78 block components.** |
| `src/built-ins/modules/website-editor/src/components/blockRegistry.ts` | Registers all 78 into the shared registry. |

**MOUNTED 2026-08-21.** The editor now asks *which vocabulary does this target speak?* and gets an
answer for every target:

| Target | Surface | Palette |
|---|---|---|
| Aqua-hosted portal | `portal` | the portal's 16 names (`PORTAL_ELEMENT_PAIRINGS`) — unchanged |
| site / repo / game | `website` | the shared registry's 70 website definitions |

- `elementSurfaceFor({ portalTarget })` names the surface; `elementPalette(surface)` reads
  `listElementDefinitions(surface)`. No hardcoded list anywhere in `DevEditor.tsx`.
- Registration is an import SIDE EFFECT, so the editor now performs it — through
  `ensureWebsiteElements()`, a memoised **dynamic** `import()` of `websiteVocabulary.ts`. Only the
  metadata table travels: the 78 components are already behind `lazyBlock`, one chunk each.
  The indirection module is load-bearing — the plugin's `package.json` says `"type": "module"`,
  so a direct `import()` of `blockRegistry` crosses ESM/CJS under `tsx` and throws.
- The Builder tab is no longer portal-gated. `PORTAL_ONLY_TABS` is now `PORTAL_DOCUMENT_TABS`
  (pages · brand · versions · code) — see §3.

> ⚠ **Still not placeable.** The library can be browsed and an element selected; there is nowhere
> to DROP one on a non-portal target. No block document exists for a repo, and the tag protocol
> carries selections and text patches, not inserts. `elementLibrarySentence()` is the one place
> that is written down.

---

## 6. The dev workspace

Routes under `src/app/portal/dev-team/`. Sidebar is assembled in `layout.tsx` (7 items).

| Route | Page file |
|---|---|
| Home | `page.tsx` |
| Roadmap | `roadmap/page.tsx` (+ `plans/new/page.tsx`) |
| Findings | `findings/page.tsx` |
| Library | `library/page.tsx`, `docs/page.tsx` |
| Tools | `tools/page.tsx` |
| **Editor** | `editor/page.tsx` → `editor/studio/page.tsx` |
| Notes | `notes/page.tsx` |

**Redirect stubs** (old routes kept alive): `working/`, `tasks/`, `auditor/`, `logs/`, `updates/`,
`inspector/`, `api/`. `chat/` exists but is no longer a sidebar item.

> **Not the Dev Editor:** `src/app/portal/dev-team/editor/_AppConfigEditor.tsx` and `_Section.tsx`
> are the small app-config edit→preview→publish loop under Tools → Editor. Different thing, similar
> name. `src/app/api/portal/dev-team/editor/route.ts` serves *that*, not the Dev Editor.

---

## 7. APIs

**Editor:**
| Route | What |
|---|---|
| `src/app/api/portal/site-editor/files/route.ts` | Read tree / read file / write / create. Fingerprint concurrency, path safety, repo-backed refusal. |
| `src/app/api/portal/dev/projects/route.ts` | List / save / delete projects, and `action:"map"`. |
| `src/app/api/portal/dev/editor-activity/route.ts` | Presence — who else is on this file. |
| `src/app/api/portal/dev/editor-ai/route.ts` | Aqua Editor AI's key + model + brief, per project. **POST only, no GET.** |
| `src/app/api/portal/dev/source-edit/route.ts` | **Words → source → a commit.** `action:"find"` / `action:"publish"`. POST only. |
| `src/app/api/portal/dev/editor-ai/history/route.ts` | Aqua Editor AI's chat history for ONE project — read / append / new-thread / rename-thread / delete-thread / clear. **POST only, no GET.** |

**Dev workspace:** everything under `src/app/api/portal/dev-team/` —
`console`, `docs`, `findings` (+`findings/image`), `plans`, `roadmap`, `thoughts`, `updates`,
`workers`, `editor`.

---

## 8. Server libs

**Editor** — `src/engines/editor/server/`:
`devProjects.ts` (projects + the unlock rule) · `fileTree.ts` (what's readable/editable) ·
`githubSource.ts` · `codeAdapter.ts` · `sourceAdapter.ts` · `sourceStamp.ts` ·
`patch.ts` · `publish.ts` · `workspaceFiles.ts` · `registry.ts` · `mapProject.ts` ·
`portalStudio.ts` · `editorAssistant.ts` · `editorAi.ts` ·
`sourceMatch.ts` (words → candidate lines, and the splice that cannot break the build) ·
`sourceEdit.ts` (**the caller** patch/publish never had — find, then commit) · `editorAiHistory.ts`

**Dev workspace** — `src/lib/server/dev/`:
`devDocs.ts` (parses blockers, indexes the library) · `devTeamBoard.ts` (workers, plan statuses) ·
`devTeamRoadmap.ts` · `devTeamTasks.ts` · `devTeamPlans.ts` · `devTeamUpdates.ts` ·
`devTeamAuditor.ts` · `devTeamFindings.ts` · `devTeamWorkers.ts` · `devTeamThoughts.ts` ·
`devConsoleStatus.ts` · `devDocEdits.ts` · `devMarkdownCache.ts` · `devLocalTime.ts` ·
`devMode.ts` · `devModeAccess.ts`

---

## 9. State

Projects live in `PortalState.devProjects` — type in `src/server/types.ts` (`DevProject`).
Aqua Editor AI's per-project config lives in `PortalState.editorAiConfigs`, keyed
`${agencyId}|${projectId}` (`EditorAiConfig`) — deliberately NOT a field on `DevProject`, because
`saveDevProject` rebuilds that record field by field and would erase a connection id on the next
rename.
Its chat history lives in `PortalState.editorAiConversations`, keyed the same way — a **separate
collection** from `PortalState.assistant` (the Advisor's, keyed `${agencyId}|${userId}`) so that
clearing one cannot empty the other.
The whole state is one JSON blob; `src/server/storage.ts` `empty()`/`parseBlob` must handle every
collection. Secrets are **never** on the project — tokens resolve per-request through the encrypted
integrations vault via `resolveIntegrationConnectionValues()`.

---

## 9a. Aqua Editor AI — its own assistant (2026-08-21)

**This reversed an earlier decision. Do not "fix" it back.** `editorAssistant.ts` used to say in its
own header "One brain, three skins — nothing here is a second assistant". Ed's call:

> "aqua editor ai needs to be its only thing please now. needs a seperate tocken please to configure
> please. it needs its own thing and its saved per project this one is please the chat history per
> project only limited to a project nothing else and needs its own proper ui for this"

| Piece | Where |
|---|---|
| Config + resolver | `src/engines/editor/server/editorAi.ts` |
| State | `PortalState.editorAiConfigs`, keyed `${agencyId}\|${projectId}` |
| The key itself | Encrypted integrations vault, provider **`aqua-editor-ai`** (its own kind, not `openai`) |
| API | `src/app/api/portal/dev/editor-ai/route.ts` — POST only, actions `status` / `save` / `set-token` / `clear-token` |
| **Chat history** | `src/engines/editor/server/editorAiHistory.ts` → `PortalState.editorAiConversations`, keyed `${agencyId}\|${projectId}` |
| **History API** | `src/app/api/portal/dev/editor-ai/history/route.ts` — POST only, actions `read` / `append` / `new-thread` / `rename-thread` / `delete-thread` / `clear` |
| Tests | `scripts/smoke-aqua-editor-ai-token.test.ts`, `scripts/smoke-aqua-editor-ai-history.test.ts` (+ the rewritten reuse cases in `smoke-aqua-editor-ai.test.ts`) |

**The rules.** The token never leaves the server: `resolveEditorAiToken` is the only function that
sees it, and the only shape that crosses to a client is `EditorAiStatus` (configured / model /
`••••abcd` / brief) which has no field a key could occupy. Nothing is echoed back, not even on the
POST that just set it. Tenant is checked **before** project everywhere, through
`getDevProject(agencyId, id)`. There is **no fallback** — not to the agency's `openai` connection,
not to `OPENAI_API_KEY`. A key pasted for the editor does not switch the Advisor on, and the
Advisor's key does not switch the editor on.

**What is DONE (Phase 1) — the credential:** the key, the model, the brief, the API, the tenant
scoping, and the gate — `configured` on `EditorAssistantProps` now means *this project's own key*,
not the agency's. Visible consequence: **until Ed pastes a key on a project, Aqua Editor AI's
composer is disabled**, even in a workspace whose Advisor works. That is the point of "a seperate
tocken".

**What is DONE (Phase 2) — the history store:** `editorAiHistory.ts` + `editorAiConversations`. A
conversation belongs to exactly ONE project; the agency is checked **before** the project through
`getDevProject`, so another agency's project id, a project id from a different agency and an
invented id all return the same nothing. It is a **separate collection** from the Advisor's, so
clearing either cannot empty the other. `loadEditorAssistant` now hands the editor
`initialConversation` for the project it was opened on.

**The cap — say it out loud, because a history that silently shortens is one you cannot trust.**
`PortalState` is ONE document rewritten in full on every save, so the conversation is bounded:
12 threads per project (least recently used out) · 60 messages per thread (oldest out) ·
6,000 characters per message (truncated, and flagged `truncated`) · **80,000 characters per
project**, enforced by dropping the oldest message in the least recently used thread until it fits.
The character budget is the one that actually binds. Every eviction increments
`evictedMessages` so a screen can say the history was trimmed. The message just appended is never
the one evicted.

**What is DONE (Phase 3) — its own interface.** `AquaEditorAI.tsx` no longer mounts
`AssistantWorkspace` and the editor no longer calls `/api/assistant` at all. It is now a shell over
three new files in `src/components/editing/`:

| File | What |
|---|---|
| `AquaEditorAI.tsx` | Identity, the project badge, the gate line, and the capture strip (point-at · attach · load-what-I'm-editing). |
| `AquaEditorAIThread.tsx` | The conversation: thread list, rename, delete, messages, composer, trim notice, **clear this project's history**. |
| `AquaEditorAIKey.tsx` | The key (write-only), the model, the brief, and a NOT CONFIGURED state that says what to do. |
| `editorAiClient.ts` | The only place the two endpoints are named. POST-only, nothing in a URL, `apiKey` on one call. |
| `editorAiSkin.ts` | The editor's vocabulary — `--mode-accent`, a focus ring on every control, a contrast floor. |

`initialWorkspace` and `coverage` are now **dead props typed `never`**: the loader no longer reads
the Advisor's per-person history and no longer runs an agency-wide radar sweep to render a chat
panel. They are declared only because `DevEditor.tsx` still names them at the mount.

**⚠ THE MOUNT IS NOT UPDATED, so none of it is live yet.** `DevEditor.tsx` was excluded from this
pass (another agent was editing it). It still passes only `initialWorkspace / configured / model /
userName / coverage / context / picking / onPickElement` — it does **not** pass `projectId`, so the
panel renders its NOT-SCOPED state and says so in words rather than pretending.

The change is at the `<AquaEditorAI …>` mount inside `Inspector` (the `tab === "assistant"` branch,
`DevEditor.tsx` ~line 1904). **Delete** `initialWorkspace={assistant.initialWorkspace}` and
`coverage={assistant.coverage}`; **add**:

```tsx
projectId={projectId ?? ""}
projectName={projectId === assistant.projectId ? assistant.projectName : ""}
initialConversation={assistant.initialConversation}
historyLimits={assistant.historyLimits}
editorAi={assistant.editorAi}
reason={assistant.reason}
```

`projectId` must be `Inspector`'s own prop — the LIVE, switchable one — **not**
`assistant.projectId`, which is only the project the page was opened on. The panel guards the
mismatch itself: it uses `initialConversation` / `editorAi` only when they are genuinely this
project's, refetches otherwise, and reports the assistant OFF in the meantime rather than inheriting
the previous project's gate. `Inspector` has no project NAME, hence the `assistant.projectName`
guard above; threading `projectName={selectedProject?.name ?? ""}` down through `Inspector` from
`DevEditor` is the tidier version and makes the badge correct after an in-editor switch too.

**What is STILL not done — the model call (Phase 4).** `resolveEditorAiToken` has no caller. Sending
a message appends it to this project's history and nothing answers; the panel says so, in an amber
line above the composer, rather than looking broken. Wiring it means one endpoint that resolves the
project's key, calls its model and appends the assistant's reply through `appendEditorAiMessage`.

---

## 10. Tests

`scripts/smoke-editor-element-palette.test.ts` (the palette, the on-demand load, the three gates) ·
`smoke-dev-editor-engine.test.ts` · `smoke-dev-editor-tag-bridge.test.ts` ·
`smoke-aqua-tag-bridge.test.ts` (the drift guard) · `smoke-engines-editor.test.ts` ·
`smoke-editor-target-aware.test.ts` · `smoke-editor-write-path.test.ts` ·
`smoke-editor-presence.test.ts` · `smoke-editor-adapters.test.ts` ·
`smoke-site-editor-publish.test.ts` · `smoke-aqua-editor-ai.test.ts` ·
`smoke-editor-words-publish.test.ts` (words → source → commit: the search, the refusals, the real commit sequence) ·
`smoke-aqua-editor-ai-token.test.ts` (its own token: secrecy, separation, per-project, tenant) ·
`smoke-aqua-editor-ai-history.test.ts` (its own chat history: per project, tenant, the cap) ·
`smoke-aqua-editor-ai-ui.test.ts` (its own interface: not the Advisor's, key write-only, per project, the editor's clothes) ·
`smoke-dev-projects.test.ts` · `smoke-aqua-tag-detection.test.ts` ·
`smoke-aqua-tag-injections.test.ts` · `smoke-aqua-tag-consent-injection.test.ts` ·
`smoke-dev-editor-aqua-tag.test.ts` (making a tag from the editor) · `smoke-dev-project-map.test.ts` ·
plus `smoke-dev-team-*.test.ts` for the workspace shell.

Run the **full** suite, never a subset — contract tests in unrelated files pin editor behaviour:

```bash
NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts
```

---

## 11. Docs

`docs/development/plans/dev-editor-engine.md` · `dev-editor-checklist.md` ·
`dev-editor-inspector.md` · `aqua-engine-and-dev-team-plugin.md` · `dev-team-portal.md` ·
`dev-team-hub.md` · `dev-team-finish.md` · `dev-team-ui-polish.md`

Chapters: `docs/workspace/shared-logic.md` (the two protocols, the handshake),
`docs/workspace/hazards-and-duplication.md` (what not to "unify").

---

## 12. What is NOT wired — read this before trusting the rest

> **Updated 2026-08-22.** Most of what this section used to warn about is now BUILT and
> verified — words and code both commit to the draft branch, publish opens the PR, merge
> and revert live in the Drafts tab, the AI answers on the project's own key, and the 70
> blocks are mounted and can insert real code. The editor made real commits in a real
> client repo (see `docs/context/HANDOFF-2026-08-22-dev-editor.md`). What remains
> unbuilt is phases 17 and 18 — the browser walk and the client-portal mount. Phase 8
> (the navigator) and phase 9 (SURFACE MODES: Website vs Normal, with per-page SEO
> written into the page's own head down the same preview → confirm → draft-branch path)
> both shipped 2026-08-22 and have never rendered in a browser. The list below is kept
> for the parts still true.
>
> **Phase 9's map:** `engines/editor/editing/surfaces.ts` (the two surfaces, and the
> default DERIVED from a tag answering on a real address — never `projectKind`),
> `engines/editor/editing/pageSeo.ts` (the fields, the plan, and the rule: own a marked
> block, refuse everything else), `components/editing/SurfaceSwitch.tsx`,
> `components/editing/PageSeoPanel.tsx`, `repoWrite.readPageSeoFromRepo` /
> `writePageSeoToRepo`, and the `seo-read` / `seo-write` actions on
> `/api/portal/dev/repo-write`. Pinned by `scripts/smoke-editor-surface-modes.test.ts`.

- **Nothing has been verified in a browser.** The full tag round-trip has never actually run.
- **Making a tag from the editor now works** (2026-08-21) — Settings → a project → **Aqua Tag**: the agency key is
  created-or-fetched by the projects listing (`masterTag`), the snippet is `masterTagSnippet()`'s (same well as
  Tools → API), and **Check it** (`action:"connect-tag"`) fetches the address through Map's own tag half and binds
  `aquaTagId` only from the key the page really carried. `DevProjectMapStatus` now also carries `tagState` +
  `tagSentence` (none · unchecked · unreachable · absent · foreign · answering · redirected), which is the ONE place
  those words are written. The tag id is no longer a text box — a typed tag is not a tag.
- **Words edits now persist** (2026-08-21). `patch.ts` → `publish.ts` finally has a caller:
  `src/engines/editor/server/sourceEdit.ts`, behind `POST /api/portal/dev/source-edit`. In the
  right menu, under the words box, **Find it in the source → pick a line → Save it**.
  - It is TWO presses because the first one is a **guess**. An `AquaTagElement` carries no file
    and no line — `data-aqua-src` is stamped by nothing, and `elementSource.ts` reads React
    fibers, which no browser exposes cross-origin. So the repository is SEARCHED for the words
    and a human confirms which line. The dry run shows the literal before/after line before
    anything is written.
  - It commits to `aqua-editor/<projectId>`, created from the commit the search read, then opens
    a pull request. **Never to the default branch** — `publish.ts` rule 2, and on this deployment
    a merge to `main` is a production deploy. So "it goes to git" is true; "it is live" is not
    until the PR is merged.
  - Refused rather than committed: a branch that moved since the search, a line that changed,
    the same words twice on one line, and any `<`/`>`/`{`/`}`/newline in JSX text (a `{` in a
    heading stops the site building) or the delimiter inside a quoted value.
- **Styling and image edits are still preview-only.** They change the loaded page through the tag
  and vanish on reload. The panel says exactly that, and says it separately from the words now.
- **Dev-mode CODE publish still does not commit.** `EditorCodeCanvas` saves through
  `/api/portal/site-editor/files`, which writes this server's working tree and **refuses outright**
  for a repository-backed project. The words path above is the only thing that commits; a repo
  project's code edits have nowhere to go yet.
- **The 78 blocks ARE mounted** (2026-08-21, see §5) — the Add menu and the Builder tab offer the
  website surface on a site/repo and the portal surface on a portal. What is still NOT wired is
  placing one: a repo has no block document and the tag protocol has no insert message, so the
  library is browse-and-select only and says so.
- **Element → source doesn't work cross-origin** and cannot — `elementSource.ts` reads React fibers
  inside the previewed document, which a browser will not expose across origins. It answers on a
  same-origin portal only.
- **In flight as of this snapshot:** a repair pass on the tag bridge (redirect-origin bug, portal
  door false alarm) and a contrast/style pass on the chrome. Both may have moved things below.
<!-- AQUACRM_SOURCE_END path="aqua dev.md" -->

---

<a id="source-docs-context-commander-handoff-md"></a>

## Source document — `docs/context/commander-handoff.md`

<!-- AQUACRM_SOURCE_START path="docs/context/commander-handoff.md" sha256="0925e11d043b59c1e5bc5a82751fc5834bc9aca528949292226d728507dc9c9d" -->
# Commander handoff — re-spin the orchestrator

← [context/](README.md)

Paste this into a fresh Claude chat to spin a **commander** (orchestrator) with
full context — so orchestration survives without the previous chat's window.

## The paste-ready commander init
```
You're the COMMANDER (orchestrator) for AquaCRM development, working dir:
aquaCRM/portal/

You don't primarily build — you coordinate a multi-chat dev process: assign plans
to worker chats, track state, keep the docs in sync, and report to Ed. You build
only when Ed asks or a task is too small to spin a worker for.

ORIENT (read in this order):
1. docs/context/README.md — the orchestration book (this whole setup).
2. docs/context/state.md — the LIVE orchestration state. Start with its current
   P0/P1 ground-truth table (source/runtime-reviewed 2026-08-24), then treat the earlier verified table as dated
   evidence. Treat every section headed "HISTORICAL" as a dated record of what
   someone believed that day — NOT fact. THE SOURCE IS THE TRUTH: when a doc and the code
   disagree, read the code, then fix the doc. Three already-fixed "launch blockers" were briefed
   as open on 2026-08-20 and one would have sent a worker back into a hardened auth route.
2b. docs/development/checklist.md — the canonical current summary of where the project stands.
   Update it when verified source changes the current answer. docs/architecture-noobie.md explains
   the system plainly.
3. docs/context/orchestration-model.md — the model + the rules that stop workers
   colliding on one repo (incl. the AUDIT LOOP + the read-only auditor rule).
4. docs/development/audits.md — the auditor's VERDICTS (what's verified vs merely
   claimed). Reconcile against updates.md.
5. docs/development.md — the project law (plans, todos, code map, discipline).

CURRENT PRIORITY OVERRIDE (2026-08-24): issue #22 central session revocation is
P0. A stale owner cookie created a working external-AI token after owner→staff
downgrade. Then issues #23/#24: showcase mutating GET/OAuth bypass and erasure
false-success/non-retry/audit-name. Do not dispatch from the old “three blockers
fixed” history before reading these current entries.

STANDING SETUP — two things should always be running alongside you. On boot,
check state.md for their status and ASK ED TO CONFIRM each is up (re-establish if not):
  1. DEV SERVER (in your own chat) — `npm run dev:sandbox:real` for the shared
     port-3032 file-backed sandbox, or `npm run sandbox:fork -- <name> <port>` for
     isolated verification. It's how you browser-verify worker
     output. If it's not up, offer to start it.
  2. THE AUDITOR — verifies shipped work before it's trusted as done; writes verdicts to
     docs/development/audits.md. ⏸ The RECURRING LOOP IS STOPPED (Ed, 2026-08-19): re-audits are
     ON-REQUEST and will NOT auto-fire. When a fix lands, ask Ed to re-run it. Its brief
     is docs/context/auditor-brief.md; Ed starts it with:
       /loop 20m You're the AquaCRM auditor. Read docs/context/auditor-brief.md and
       follow it exactly — run one audit sweep now, then each tick.
     If audits.md has gone quiet while work is shipping, ask Ed whether an on-request
     audit should be started. You do NOT run the auditor yourself — it must be an
     independent chat (never the builder, never you).

YOUR LOOP:
- Read state.md + docs/development/todo.md → pick the next plan(s) to assign
  (priority + NO file overlap with in-flight workers — see state.md ownership).
- Write Ed a worker brief (docs/context/worker-brief.md template, filled in with
  the plan + files owned/avoided) so he can spin a worker chat.
- Log every assignment/completion/blocker in state.md — never only in chat.
- Track workers' reports (their updates.md entries) → update state.md.
- Read docs/development/audits.md for new VERDICTS: PASS/NITS → mark the item done
  in state.md + tick the todo (log any nits as follow-ups); REWORK → route the
  findings back to the owning builder via Ed, and don't call it done until re-audit.
- Surface decisions Ed owes; don't guess them.
- Keep the golden rules: one plan owns its files; parallelise independent plans,
  serialise ones sharing foundations (radar / websiteSources / types.ts / KPI
  registry); full test suite before "done"; the AUDITOR verifies before "done";
  docs updated after every change; never commit without Ed.

Start by (a) confirming the standing setup above with Ed (dev server + auditor
loop), then (b) reading state.md + audits.md and telling Ed the current picture:
what's in flight, what's verified vs still-only-claimed, what's ready to assign
next, and what decisions you need from him.
```

## What makes a good commander turn
- **Confirm the standing setup** — on boot, check the dev server + the auditor loop are running and ask Ed if unsure. They're part of the machine, not optional extras.
- **Lead with the picture** — from [state.md](state.md) + [audits.md](../development/audits.md): in-flight, ready, blocked, **verified vs only-claimed**, decisions owed.
- **Assign for parallelism without collision** — check file ownership; pair independent plans; serialise shared-foundation ones.
- **Hand Ed a ready-to-paste worker brief** — filled in, not a template.
- **Close the audit loop** — a plan isn't *done* until the auditor PASSes it, not just when the builder's suite is green. Route REWORKs back to the builder; mark done only on a PASS.
- **Keep [state.md](state.md) live — and TRUE.** It's the whole point, and its `## Blockers`
  section is **parsed by the app** (`parseBlockers()` in `src/lib/server/dev/devDocs.ts`) to drive the
  launch-blocker badges, so a wrong line there is visible on screen. When you mark something done,
  strike it out here *and* in [next-wave-briefs.md](next-wave-briefs.md) with the `file:line` that
  proves it — a stale brief is what sends a worker to re-break fixed code.
- **Never touch git** — not commit, not push, not `checkout`. A push triggers Vercel → production,
  and the tree is entirely uncommitted so `checkout` deletes other workers' work.
- **Don't hoard building** — the commander's value is coordination + keeping the written state true, so any chat can pick up.

## The relationship to development.md
`development.md` is the *law* (what to build + the discipline). This context book
is the *operations* (how we run the chats). The commander lives in both: it reads
the law to know the work, and maintains the context to run the work.
<!-- AQUACRM_SOURCE_END path="docs/context/commander-handoff.md" -->

---

<a id="source-docs-context-next-wave-briefs-md"></a>

## Source document — `docs/context/next-wave-briefs.md`

<!-- AQUACRM_SOURCE_START path="docs/context/next-wave-briefs.md" sha256="693f2947a2e09ecbff76c9016f773a336bd7697bb09f7f40f49f86ed432450e5" -->
# Next wave — ready-to-spin briefs + launch checklist

← [state.md](state.md) · Written 2026-08-19 · **P0/P1 queue corrected against source/runtime evidence 2026-08-24.**

> 🛑 **READ THIS BEFORE YOU PASTE ANYTHING FROM THIS FILE.**
> This file holds paste-ready worker briefs. **A stale brief is worse than a stale doc** — it sends a
> real worker to "fix" code that is already fixed and hardened. That happened: on 2026-08-20 the
> three 🔴 briefs below were still live here, and one of them would have sent a worker back into a
> hardened auth route. **They are struck through now. Do not resurrect them.**
>
> **Rule for this file from now on: the moment a fix lands, strike its brief out with the file:line
> that proves it.** Before pasting any brief, open the files it names and confirm the bug is still
> there.
>
> **What is actually left (2026-08-24):** P0 central session revocation first;
> then P1 erasure completion/retry/audit truth and capability-based showcase
> read-only/isolation. The remaining engineering queue is file persistence/recovery,
> Editor AI distributed contract/proof, Editor transition/prefill guards, staff
> policy, unresolved references/truthful empty states, read-path performance and
> browser acceptance. External/live-account work remains separate in
> [checklist.md](../development/checklist.md).

---

> ⚠ **RE-AUDITS ARE NOW ON-REQUEST** — the recurring auditor loop was **stopped by Ed (2026-08-19)**. The auditor does NOT auto-fire anymore. When a 🔴 fix lands, whoever's driving must **re-run `/loop` in the Auditor chat** (or point it at the changed files) to get the re-verify — do NOT wait for an automatic tick. All existing verdicts + the 3 🔴s carry over in [audits.md](../development/audits.md).

## ✅ ~~The 3 blocker-fixes~~ — ALL THREE ARE FIXED. DO NOT SPIN THESE. (verified 2026-08-20)

> **Current override:** those three historical fixes remain fixed, but they no
> longer mean there are no launch blockers. Issues #22 (P0 session revocation),
> #23 (showcase mutation bypass) and #24 (erasure false-success/retry/audit PII)
> were found on 2026-08-24. In particular, the old erasure brief below closed a
> plugin-log leak, not the new end-to-end erasure failure.

| Was | Now | Proof in source |
|---|---|---|
| Fix 1 — freelancer preview privilege escalation | ✅ **FIXED** | `src/app/api/auth/preview-as-freelancer/route.ts` — `enter` stashes `previewReturnUserId: session.userId` (`:97-101`), `exit` restores **that exact user** with no owner fallback (`:43-49`). A MANAGER→MANAGER regression test exists (`scripts/smoke-dev-mode.test.ts`). |
| Fix 2 — erasure email-in-LOG (GDPR) | ✅ **FIXED** | `leads-pipeline/src/server/contacts.ts` — the three activity messages log a contact **id**, not an email (`:227` Promoted · `:252` Updated · `:279` Archived). And the deeper bug the auditor found is closed too: `onEraseClient` no longer matches on the never-set `contact.clientId`; it resolves the subject's emails and matches those (`leads-pipeline/index.ts:168-180`). |
| Fix 3 — finance create-surface idempotency | ✅ **FIXED** | `src/built-ins/modules/agency-finance/src/lib/idempotency.ts` — one shared mechanism, wired into six create surfaces plus expenses. |

<details>
<summary>The original three briefs, kept only as a record of what the bugs were. ⛔ Do not paste.</summary>

### ~~Fix 1 — Freelancer preview privilege escalation (SECURITY — most urgent)~~ ⛔ ALREADY FIXED
**Route to:** the freelancer-workspace worker (it owns the code). **File:** `src/app/api/auth/preview-as-freelancer/route.ts`.
> The preview `enter` admits owner **and** manager (~:47), but `exit` re-mints as *"an agency-owner it finds"* (~:31) regardless of who entered — the preview session stores only `previewReturnAgencyId`, not the enterer's identity. **So any MANAGER can: POST {employeeId} (enter) → POST {action:"exit"} → and hold a full OWNER session. 2 requests, manager → owner.** Tests miss it (they use an owner enterer).
> **Fix:** stash the ENTERER's exact identity (userId) on the preview session at enter, and on exit restore THAT specific user — never "an owner it finds." (Fast fallback: owner/founder-only enter, but that drops manager-preview.) **Test (must add):** a MANAGER enters then exits → restored to the MANAGER session, NOT owner. Also confirm the additive `api/auth/dev-mode/route.ts` edit didn't weaken Dev Mode's founder-only gate. Full suite + browser-verify. Re-audit after.

### ~~Fix 2 — Erasure email-in-LOG (GDPR launch blocker)~~ ⛔ ALREADY FIXED
**Route to:** the erasure worker. **Files:** `built-ins/modules/leads-pipeline/.../contacts.ts` (`ContactService.delete`, ~:272) + `server/clientErasure.ts`.
> `ContactService.delete` logs `"Archived contact <email>"` with **no clientId**; `clientErasure` sweeps activity by `clientId` only (no content scrub) → **the email survives in the activity log after a client erase.** Phase 2b fixed the email-in-KEY (pointer) — a *different* thing. Auditor **confirmed** the RETAIN classification + `brand_enquiries` split are SOUND — only this log line is open.
> **Fix:** don't log the email (redact/omit) in that log path during a client erasure. **Test (must add):** after erasing a leads-pipeline client, assert the email is ABSENT from the activity log. Re-audit → un-hold launch-safe when both land.

### ~~Fix 3 — Finance create-surface idempotency (money launch blocker)~~ ⛔ ALREADY FIXED
**Route to:** a fresh Finance worker (files free). **Files:** `built-ins/modules/agency-finance/` — `payments.record`, `createInvoice`, `createIncome`, `createPlan`, compensationPayments + `lib/server/closeDeal.ts`.
> The create-surface has **no dedup** → recording a manual bank/cash payment twice **double-counts money-in** (aggregation shows 2×); a double-click on "Close the deal" **double-bills**. (The Stripe webhook + delight wire ARE idempotent; the create-surface is not — the "idempotent" in payments.ts is only a comment about the Stripe externalRef.)
> **Fix:** ONE shared idempotency mechanism (client-supplied idempotency key server-checked, or same-actor/same-amount/short-window dedup) across all finance money-create paths. REUSE the existing stable-reference pattern (Stripe PaymentIntent / delight `delight:<id>` reference). **PRESERVE the nuance:** multiple payments per invoice ARE legitimate (partial payments) — dedup ACCIDENTAL dupes, never block intentional multiples. **Test (must prove both):** two rapid identical submits → exactly one record; a genuine second/partial payment → still allowed. **Safety invariant:** app never holds funds; Stripe keys are Ed's, never logged; TEST mode. Re-audit → un-hold money-safe after.

</details>

---

## ✅ CLOSED 2026-08-23 — published-site signup form transport

`src/app/api/auth/signup/route.ts` now accepts both native form posts and JSON,
returns the form flow with a 303 redirect, and preserves rate limiting. The real
form-encoding regression is in `scripts/smoke-auth-form-encoding.test.ts`. Do not
dispatch this brief again.

<details>
<summary>Historical brief — kept only to explain the fix</summary>

**Narrowed 2026-08-20.** The original finding covered **both** the login and signup blocks. The
**login half has since been fixed** — `src/app/api/auth/login/route.ts:124` now reads `req.formData()`
and 303-redirects, and [checklist.md](../development/checklist.md) lists "published-site login" as
shipped. **Do not touch the login route.** What is still broken is signup only:
`src/app/api/auth/signup/route.ts:53` parses `req.json()` only — the file contains **zero**
`formData` references — so `SignupFormBlock.tsx:8`'s native `<form method="POST">` to
`/api/auth/signup` still navigates a real visitor onto a raw
`{"ok":false,"error":"Invalid JSON."}`. Full write-up: [issues.md #14](../development/issues.md).

**Before pasting:** re-open `src/app/api/auth/signup/route.ts` and confirm it still has no
`formData()`. If it does, this brief is done — strike it out.

**Paste-ready:**
```
You're a development worker on AquaCRM, working dir: aquaCRM/portal/

ORIENT: docs/development.md → docs/development/issues.md #14 → docs/context/worker-brief.md

THE BUG: a visitor to a client's PUBLISHED website cannot SIGN UP.
`website-editor/src/components/blocks/SignupFormBlock.tsx:8` renders a native
`<form action={action} method="POST">` defaulting to `/api/auth/signup`. A native submit sends
form-encoded and does a full-page navigation; `src/app/api/auth/signup/route.ts:53` parses with
`req.json()` only and catches the throw into a 400 JSON body — so the visitor lands on a raw
`{"ok":false,"error":"Invalid JSON."}` with no way back.

SCOPE: SIGNUP ONLY. `/api/auth/login` was ALREADY FIXED (it accepts formData and 303-redirects at
login/route.ts:124). Read it first — it is your in-repo reference for this exact change on this
exact pair of routes. Do NOT modify the login route.

YOUR JOB: fix signup, and prove it end-to-end (a real form-encoded POST, not just a unit test).
Copy the shape already used by `src/app/api/auth/login/route.ts` (and originally by
`src/app/api/auth/profile/update/route.ts`): `req.json().catch(() => ({}))` → `req.formData()` →
`NextResponse.redirect(..., 303)`. It keeps the block working without JS.

CARE: this is the real sign-up route. Do NOT weaken the rate limiter, the error messages (they must
not leak whether an account exists), the email-verification token, or the session/cookie handling.
Adding an encoding is the whole change. On a redirect, do not put credentials or errors in the
query string. Check whether the block is actually reachable in a shipped template — this was
source-verified only, never confirmed against a live published site; if it is unreachable, say so
and fix the route anyway (cheap, and the block exists).

TESTS: a form-encoded POST creates an account and 303s to a page (not a 400 JSON blob); a JSON POST
still works unchanged; a duplicate email still 409s the same way it does today.

HARD RULES: full suite before done (PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server'
npx tsx --test scripts/*.test.ts — the full `scripts/*.test.ts` glob, NOT smoke:all) · own sandbox
(npm run sandbox:fork -- <name> <port>) · npm run worker:checkin · NEVER TOUCH GIT (the tree is
all-uncommitted — a push triggers Vercel → production, and `git checkout <file>` deletes other
workers' unshipped work; back up to the scratchpad and restore with cp).
```

</details>

## Ready non-security work — source-verified 2026-08-24

1. **Storage reliability (issues #16–#17).** Make persistence acknowledgement
   await the real write, make `flush()` truthful, write the blob atomically, and
   fail into an explicit recovery state when JSON is malformed. Add failure-path
   tests that reproduce an unwritable target and corrupt input before changing code.
2. **Editor completion (issues #18–#19).** Treat local replay as already built.
   The migration, adapters, coordinator, project dirty-state reporting and AI
   project remount are now built and focused-tested. Add the claim DDL to the
   optional direct-Postgres schema, refresh state after the provider wait, apply
   and live-prove the migration, then cover browser hide, surface, lifecycle,
   refresh and project switching in one browser matrix.
3. **Truthful data and fast reads (issues #20–#21).** Reject or resolve orphan
   client references, remove fabricated website defaults, inventory `GET` routes
   that mutate, profile the whole-state rewrite cost, and isolate the showcase
   fixture. The broader showcase purge regression is green; visitor isolation is not.

These are independent workstreams only where their file ownership does not
overlap. Re-read [state.md](state.md) before dispatching because workers are active.

## 🧑‍💼 Launch checklist — Ed's external bits (not code)
- [x] ~~**Connect an email sender**~~ ✅ **ALREADY DONE — corrected 2026-08-20.** Resend is configured (`RESEND_API_KEY` is set) and `inspectProductionReadiness()` reports email READY. This sat unticked here for days while it was already live.
- [ ] **Create a Meta Developer app** + HTTPS deploy + register the webhook (`/api/webhooks/meta`) + verify token — to test the Meta inbox live (localhost can't complete OAuth by design).
- [x] ~~**Enable RLS** in the Supabase dashboard~~ ✅ **ALREADY ON — corrected 2026-08-23.** Verified across 14 live tables with the public anon key on 2026-08-20. The RLS policies are version-controlled in 16 migrations under `aquaCRM/supabase/migrations/`; the newest pending migrations still need to be applied before production rollout. Open engineering residue: `brand_enquiries` has no `agency_id`, and service-role call sites bypass RLS — measure the current count before acting. See [rls-enable](../development/plans/rls-enable.md).
- [ ] **Live-Stripe verify** — `stripe@22.5.0` is now installed and the in-app Finance settings/vault path is wired. What remains is live-account proof: confirm or replace the real keys in Finance settings, point a signed HTTPS webhook at `…/api/portal/agency-finance/stripe/webhook?agencyId=<id>`, then test Checkout, payment reconciliation and a refund. Never copy key values into this brief.
- [ ] **Erasure:** staged live run vs a throwaway seeded client (dev/staging Supabase) + **DPO/solicitor sign-off** on the retention schedule, then wire retained-data expiry.
- [x] ~~**First git commit**~~ ✅ **DONE 2026-08-21.** The branch was committed and pushed; merging it to `main` remains Ed's deployment decision.
- [ ] **`PORTAL_SESSION_SECRET`** set in every environment (prod especially) — the connect codes are signed with it. *(It IS set in local `.env.local`; the open part is prod.)*
- [ ] **Walk the onboarding chain once** on your own data — client → connection link → they sign in → they see their portal. Everything is built; **the code step has never been clicked.** ([checklist.md](../development/checklist.md) calls this the thing standing between you and the waiting clients.)
- [x] ~~**Decide: is a "company" an Agency or a TradingCompany?**~~ **SETTLED
  2026-08-20:** agency is the holding group; trading companies remain companies
  and receive portals. Company-promotion phases 1–3 use this model.

---

## ⚙️ ~~Infra blocker~~ → RESOLVED — and the shared-file hazard below is **also** solved now
> **Corrected 2026-08-20:** the warning at the end of this section ("route UI checks through the
> Commander server") is **retired**. Every worker forks a fully isolated sandbox with
> `npm run sandbox:fork -- <name> <port>` — own state file, own build dir, own port — so concurrent
> verification cannot clobber anything. The shared sandbox now additionally requires an explicit
> `PORTAL_ALLOW_SHARED_STATE=1` opt-in (`src/server/storage.ts:248`), pinned by
> `scripts/smoke-sandbox-protection.test.ts`. Workers browser-verify their own work.

### The original 2026-08-19 note — `:3032` FREED, Commander verify server RUNNING
✅ `:3032` is **free and serving** — the dead lock cleared when its owning chat closed; the Commander verify server is back up (`aquacrm-verify` = file backend + `milesymedia` seed + dev-mode; `/dev` mints an owner session; browser-verified — Contacts renders, no console errors). The **browser-verify sweep can proceed.** ⚠ Shared file backend (`.data/portal-state.json`): concurrent worker `dev:verify` runs can clobber it → route UI checks through the Commander server, or commit → git worktrees (own checkout/port/`.data` per worker). The **Commander runs the browser-verify sweep:**
- Freelancer (after its fix — incl. the manager-exit-doesn't-become-owner test)
- Finance UIs (pay-by-card, close-the-deal, AR/AP aging)
- Public-bucket **live CDN** — ⚠ writes 1 test image to the **LIVE** `aquacrm-public` bucket (no local Supabase sandbox) → **needs Ed's explicit OK**; delete the object after.
- Dev-docs · connect-flow code-step · enquiry-card real-data · KPI custom-builder + customer-intel

---

## 📝 Held / parked
- **Radar §9 continuation** — a brief exists but its invariant is STALE: it says keep **2,040 rules / 170 families**. ✅ **Re-verified 2026-08-20: the real figure is 2,064 / 172** — `src/engines/data/radar/radarRuleCatalog.ts` defines **172** family entries and `RADAR_RULE_LENSES` has **12** lenses (172 × 12 = 2,064). **Correct the brief to 2,064 / 172 before spinning** or the worker's first suite run fails. Feature-extension → park behind the blockers.
- **Small follow-ups:** kpiViews server-persisted saved views (Ed said "both", built local-only) · public-bucket refcount-aware unpublish cleanup · aqua-tag remainders (P5 flagging findings need the radar probe pipeline; company enquiry surface; per-client injection keys) · Staff's agency-hr `Staff` retirement (cleanup) · enquiry-card's Person-on-conversion + leads-pipeline re-linking.

## 🤔 Decisions Ed owes (unblock parked plans) — pruned 2026-08-20
Advisor Omega **vision** · Operations **sidebar name + GDPR-first vs HIPAA** · Marketing **fixed KPIs vs explorer** · **kpiViews** park-or-build · **You-Deserve-It** when.
~~Marketing **consolidate 12 views?**~~ ✅ **DECIDED AND DONE** — marketing consolidated **10 views → 5**, every old `?view=` still resolving.

---

## The one-line status (corrected 2026-08-24, P0/P1 scope)
**Last whole-suite proof (2026-08-23): 3,621 pass · 0 fail · 1 live-Postgres skip · typecheck clean.**
The product is broadly built; P0 session revocation is first, followed by P1
erasure/showcase truth and the remaining runtime reliability work (storage,
Editor, staff policy, data truth and slow read paths), then the unwalked browser
journeys and external setup owned by
[checklist.md](../development/checklist.md).

~~Engine built + auditor-verified. 3 narrow fixes + Ed's external bits + a verify sweep = launch-ready.~~
<!-- AQUACRM_SOURCE_END path="docs/context/next-wave-briefs.md" -->

---

<a id="source-docs-context-orchestration-model-md"></a>

## Source document — `docs/context/orchestration-model.md`

<!-- AQUACRM_SOURCE_START path="docs/context/orchestration-model.md" sha256="b619466bed624146be8ae3069eebe74e382eeffc31bd57842372041962ed6dea" -->
# Orchestration model

← [context/](README.md)

How AquaCRM development runs across multiple Claude chats without depending on any
one chat's memory.

## The roles
| Role | Who | Job |
|---|---|---|
| **Ed** | the human | Sets direction, spins chats, makes the decisions plans flag, approves commits. |
| **Commander** | one Claude chat (orchestrator) | Assigns plans to workers, tracks [state](state.md), writes worker briefs, keeps docs in sync, reports to Ed. Builds only when asked / for trivial tasks. |
| **Worker** | a Claude chat per plan | Builds **one plan**, staged; runs tests; updates the docs; reports back. Owns its files. |
| **Auditor** | an independent audit chat, started on request | Independently **verifies** shipped work before it's trusted as done — re-runs the suite, runs the app, checks the contracts + tests-are-real + docs-are-true. **Read-only on source** (findings, never fixes); writes only [audits.md](../development/audits.md). Never audits its own build. See [auditor-brief.md](auditor-brief.md). |

## How work flows
```
Ed ── spins ──▶ Commander ── reads state.md + development.md
                    │
                    ├─ picks the next plan(s) from todo.md (priority + no file overlap)
                    ├─ writes a worker-brief  ──▶ Ed spins a Worker with it
                    ├─ logs the assignment in state.md (worker · plan · files owned · status)
                    │
Worker ── reads brief + development.md + its plan
                    ├─ builds it (simple-first phases), runs the full suite
                    ├─ updates docs (updates.md, its chapter, ticks the todo)
                    └─ reports back ──▶ Commander updates state.md (done / blocked / next)
```

## Independent audit (verify before "done")
Builders test their own work; the auditor is the **independent** check that a claim
is real. The recurring loop was stopped on 2026-08-19; audits are currently
started on request and use the docs as their queue.
```
Builder ships ─▶ logs the claim in updates.md
                     │
Auditor (on request) ───────────▶ pending = updates.md − audits.md
                     ├─ audits the oldest unaudited: re-runs the suite, runs the app,
                     │   checks contracts / tests-real / reuse / scope / docs
                     └─ writes a verdict to audits.md   (loud line up top if REWORK/🔴)
                     │
Commander reads audits.md ─▶ PASS/NITS → mark done in state.md + todo.md
                             REWORK     → findings back to the builder (via Ed) → re-audit
```
The auditor is **read-only on source and writes only [audits.md](../development/audits.md)**,
so it runs safely alongside any live worker. Full contract: [auditor-brief.md](auditor-brief.md).

## The rules that stop collisions (multiple workers, one repo)
This is the real risk — we've already seen two chats editing the repo at once.
1. **One plan owns its files.** Before assigning, the commander checks [state.md](state.md) for file overlap. Two workers must not own the same files/modules at the same time. Plans that touch shared foundations (e.g. `radarClassification`, `websiteSources`, `types.ts`) are **serialised**, not parallelised.
2. **Prefer independent slices.** Good parallel pairs: a UI plan + an unrelated backend plan. Bad: two plans both editing Radar, or both editing the inbox.
3. **Shared-file changes are announced.** If a worker must touch a shared file another worker owns, it goes through the commander (note in state.md), not silently.
4. **`updates.md` is append-only-ish** — add a new dated entry at the top; don't rewrite others' entries (workers run concurrently and both write it). Use a stable anchor.
5. **The dev server / `.next`** — ✅ **SOLVED (2026-08-19; note corrected 2026-08-20).** `npm run sandbox:fork -- <name> <port>` gives each worker its own **state file** (`PORTAL_DATA_FILE`), **build dir** (`NEXT_DIST_DIR`) and **port**, so concurrent runtime verification cannot clobber anyone. Bare `npm run dev:verify` is NOT safe for this — it writes the shared `.data/portal-state.json`; the shared sandbox now requires an explicit `PORTAL_ALLOW_SHARED_STATE=1` opt-in (`src/server/storage.ts:248`). Commander runs :3032; workers take 3041+.
6. **Tests** — run the full suite (`PORTAL_BACKEND=memory … scripts/*.test.ts`) before "done"; it's safe to run concurrently (memory backend).
7. ⛔ **NEVER TOUCH GIT** — every worker, every time. Not commit, not push, not `checkout`, not `restore`. A push triggers Vercel → **production**; and because the whole tree is uncommitted, `git checkout <file>` silently deletes another worker's unshipped work (this has happened). Rollback = a scratchpad copy, not git. *(Strengthened 2026-08-20 from the old "not without Ed" wording — Ed's standing decision is "never".)*
8. **The auditor is read-only on source.** It never edits source or tests — it writes only [audits.md](../development/audits.md) — so it can verify a worker's files while that worker is still live, with zero collision risk. It uses its own **forked sandbox** (`npm run sandbox:fork -- auditor <port>`), never the shared one. It reports findings; the **builder** does any rework (never the auditor — that would break rule 1).

## What a "plan" is (the unit of work)
A plan in [development/plans/](../development/plans/) is the unit a worker takes:
it has a goal, staged phases, what to reuse, the decisions Ed's already made, and
a runtime-verifiable "done when". A worker's job is to execute its plan's phases,
not to re-design. If a plan needs a decision Ed hasn't made, the worker surfaces
it (doesn't guess).

## Reporting cadence
- **Worker → commander:** after each shipped phase (what shipped, tests green, docs updated, what's next / any blocker). The `updates.md` entry *is* the report.
- **Auditor → commander:** a verdict per audited entry. The [audits.md](../development/audits.md) entry *is* the report; a REWORK/🔴 shouts from the top of that file.
- **Commander → Ed:** a running picture from [state.md](state.md) — what's in flight, what shipped, what's verified, what needs a decision.

## When to parallelise vs serialise
- **Parallelise** independent plans (different areas, no shared files) — that's the point of the multi-chat setup.
- **Serialise** plans that share foundations, or where one is a dependency of another (e.g. the KPI registry before the marketing KPI view; the `websiteSources` company-destination before the Aqua Tag company setup).
- The [state.md](state.md) dependency notes say which is which.
<!-- AQUACRM_SOURCE_END path="docs/context/orchestration-model.md" -->

---

<a id="source-docs-context-readme-md"></a>

## Source document — `docs/context/README.md`

<!-- AQUACRM_SOURCE_START path="docs/context/README.md" sha256="9a90ee612b83b8f91c5d5b832c0911337f3247a28435cb5ddaafcf5b65dd0761" -->
# context/ — the orchestration book

**This book exists so we stop relying on the chat context window.** It holds the
*orchestration* layer — how we run AquaCRM development across multiple Claude
chats: one **commander** (orchestrator) + several **worker** chats. Everything an
orchestrator or a worker needs to pick up cold lives here or is linked from here.

> **Two books, two jobs:**
> - **[checklist.md](../development/checklist.md)** = where the product stands now — the one current answer.
> - **[development.md](../development.md)** = the build map (plans, todos and code map), not a competing status summary.
> - **context/** (this) = *how we run it* (the orchestration: who's doing what, how to spin a worker, the live state). The meta.
>
> A worker reads `development.md` + its assigned plan. The commander reads this
> book + `development.md`. Nothing important lives only in a chat window.

## The model in one line
**You (Ed) spin a commander chat (me). I assign plans to worker chats, track
state, keep the docs current, and coordinate. Workers build one plan each, report
back, and update the docs. State lives in files, so any chat can be re-spun.**

## The book
1. **[orchestration-model.md](orchestration-model.md)** — the commander + workers model: roles, how work flows, and the rules that stop two workers colliding on one repo.
2. **[worker-brief.md](worker-brief.md)** — the paste-ready template to spin a worker chat on a plan, plus the conventions every worker follows.
3. **[auditor-brief.md](auditor-brief.md)** — the paste-ready template for the
   independent auditor that verifies shipped work before it is trusted as done
   (writes verdicts to [audits.md](../development/audits.md)). The recurring loop
   is stopped; audits are currently started on request.
4. **[state.md](state.md)** — the **live orchestration log**: what's in flight and who owns it. It is not the product-status authority; that is the checklist. Its `## Blockers` section is **parsed by the app** and drives the Dev Console's launch-blocker badges, so an error there shows up on screen.
4b. **[next-wave-briefs.md](next-wave-briefs.md)** — paste-ready worker briefs + Ed's launch checklist. ⚠ **Strike a brief out the moment its fix lands**, with the `file:line` that proves it; a stale brief sends a worker to re-break working code.
4c. **[archive/](archive/README.md)** — 🗄 **the history shelf**: finished worker debriefs, superseded "where we stand" summaries, dated session records. Kept for the record, **never current** — nothing here should brief a worker. It has its own index saying what each file was superseded by.
5. **[commander-handoff.md](commander-handoff.md)** — how to re-spin **me** (the commander) with full context, so orchestration survives a fresh chat.

## How to use it (the loop)
- **Ed** → spins a commander (me) with [commander-handoff.md](commander-handoff.md); spins workers when I hand you a [worker-brief](worker-brief.md).
- **Commander (me)** → reads [state.md](state.md) + [development.md](../development.md) → assigns the next plan(s) → writes you a worker brief → updates [state.md](state.md) → tracks progress → keeps everything in sync.
- **Worker** → reads its brief + `development.md` + its plan → builds it (staged) → runs tests → updates the docs ([updates.md](../development/updates.md), its chapter, ticks the todo) → reports back.
- **Auditor** (on request) → reads `updates.md` − [audits.md](../development/audits.md) → independently verifies an unaudited claim (re-runs the suite, runs the app, checks contracts) → logs a verdict to [audits.md](../development/audits.md). PASS → I mark it done; REWORK → back to the builder.

## The golden rules (so the multi-chat setup doesn't melt down)
1. **One plan owns its files.** Assign non-overlapping areas to avoid two workers editing the same files. [state.md](state.md) is the source of truth for work ownership; [checklist.md](../development/checklist.md) is the source of truth for current product status.
2. **State is written, not remembered.** Every assignment, completion, and blocker goes in [state.md](state.md) — never only in a chat.
3. **The development.md discipline still holds** — run the full suite, update the docs after every change, and **never touch git at all** (a push triggers Vercel → production; the tree is uncommitted so `git checkout` deletes other workers' work). (See [development.md](../development.md).)
3b. **The SOURCE is the truth.** A doc records what someone believed the day they wrote it. When a doc and the code disagree, read the code, then fix the doc — never the other way round.
4. **The commander doesn't have to build.** My default job is orchestration; I build only when Ed asks or a task is too small to spin a worker for.
5. **Verify before "done".** A builder's green suite is a claim, not proof. The independent [auditor](auditor-brief.md) confirms it (or sends it back) — and it's read-only on source, so it never collides with a live worker.
<!-- AQUACRM_SOURCE_END path="docs/context/README.md" -->

---

<a id="source-docs-context-state-md"></a>

## Source document — `docs/context/state.md`

<!-- AQUACRM_SOURCE_START path="docs/context/state.md" sha256="6fd3a70b2a71740cdf3eb1818918c718e623d9afaedc4d8345ff449b6588b971" -->
# Live orchestration state

← [context/](README.md) · **Keep this current — it's the shared brain.**

_Snapshot: **2026-08-26**. Phase: **P0/P1 reliability, finishing and live acceptance.** The last
documented whole-suite run is **3,621 pass / 0 fail / 1 live-Postgres skip** with typecheck clean. MFA, the
published-site signup transport and the Stripe package/settings path are built. External account
setup, pending database migrations, runtime reliability and browser acceptance remain; [checklist.md](../development/checklist.md)
owns that current list._

> **2026-08-24 scope correction:** a later same-day read-only review reopened
> security/compliance. The current table includes the new P0/P1 findings and
> supersedes the earlier non-security-only deferral.

> ⚠ **HOW TO READ THIS FILE (2026-08-23 docs pass).** Everything under
> *"Verified ground truth"* below was re-checked against the SOURCE through 2026-08-23 and is safe to
> act on. Everything under *"🗄 Historical"* is a dated record of what people believed on the day
> they wrote it — **do not brief a worker from it without re-checking the code.** Three phantom
> "launch blockers" were briefed as open here after they were already fixed; that is what this
> warning is for. The most reliable current summary is
> [checklist.md](../development/checklist.md); plain-English system tour:
> [architecture-noobie.md](../architecture-noobie.md).

## Current ground truth — source/runtime-reviewed 2026-08-24, implementation corrections through 2026-08-26

| Claim | Verdict | Evidence |
|---|---|---|
| Session revocation | **P0 OPEN:** a stale owner cookie created a working external-AI token after the user was downgraded to staff; central request/role helpers do not enforce `sessionRev` | [issues #22](../development/issues.md) · `src/lib/server/auth/auth.ts` |
| File persistence | **OPEN:** mutation can advance the persisted version without awaiting the real file write; corrupt JSON becomes an empty writable workspace | [issues #16–#17](../development/issues.md) · `src/server/storage.ts` |
| Finance payment allocation | **RESOLVED 2026-08-26:** direct/mark-paid recording atomically caps to current net outstanding; mounted Income and Checkout share the same rule. Cross-process races cannot over-allocate and valid complementary partials survive. | [issues #114](../development/issues.md) · separate-process/reload 3/3 · current complete Finance 271/271 · TypeScript/diff clean |
| Finance record validity | **RESOLVED 2026-08-26:** one exact service-boundary schema layer rejects unsupported fields/currencies/enums, unsafe money, invalid dates/timelines, recurrence, invoice lines, attachments and invalid composed patches before any Finance mutation. | [issues #115](../development/issues.md) · byte-identical refusal 115/115 · current complete Finance 271/271 · TypeScript/diff clean |
| Finance plan assignment | **RESOLVED 2026-08-26:** client/target validation is pre-write; one agency-wide transaction and durable versioned marker converge forward membership and reverse lookup after faults or competing processes. | [issues #116](../development/issues.md) · fault/race/reload 18/18 · current complete Finance 271/271 · TypeScript/diff clean |
| Finance recurring expenses | **RESOLVED 2026-08-26:** schedule+due timestamp identifies one deterministic child/result; pending operations resume before newer work and the source advances exactly once per real period. | [issues #117](../development/issues.md) · write/log/process/reload 15/15 · current complete Finance 271/271 · TypeScript/diff clean |
| Finance reporting truth | **RESOLVED 2026-08-26:** one selected-currency accounting snapshot names cash, commitment/accrual, pending, receivable and tax figures; Overview, Reports, Budgets, Planning, P&L and APIs all consume it without implicit FX. | [issues #118](../development/issues.md) · mixed-currency/status/mounted 5/5 · complete Finance 271/271 · TypeScript/diff clean |
| Finance refund accounting | **RESOLVED 2026-08-26:** immutable provider-identified negative allocations reconcile cumulative partial/full refunds, drive invoice/net receivable state and reverse cash/tax across every consumer; disputes remain separate durable evidence. | [issues #119](../development/issues.md) · failure/retry/process/reload 4/4 · complete Finance 271/271 · TypeScript/diff clean |
| Finance settings effectiveness | **CODE/BEHAVIOUR RESOLVED 2026-08-26; browser acceptance pending:** Workspace Settings owns bounded terms/default tax and seller/tax identity; new invoices consume them and snapshot identity, so later changes cannot rewrite old exports. | [issues #120](../development/issues.md) · settings outcome 3/3 · current complete Finance 271/271 · plugin/settings 27/27 · isolated listener denied `EPERM`; 3032 untouched |
| Finance commercial-plan truth | **CODE/BEHAVIOUR RESOLVED 2026-08-26; browser acceptance pending:** Client Payment Plans are canonical schedules, Finance Plans are pricing templates, mounted controls own assign/move/cancel, and MRR/Deposits consume active linked schedule snapshots. | [issues #121](../development/issues.md) · GBP→USD invoice/payment/deposit/move/cancel/retry/reload 3/3 · complete Finance 271/271 · TypeScript/diff clean · isolated listener denied `EPERM`; 3032 untouched |
| Membership subscription lifecycle | **CODE/BEHAVIOUR RESOLVED 2026-08-26; mounted/live-provider acceptance pending:** one per-user cross-process command coordinates paid→paid, paid→free, free→paid and cancellation, adopts provider success after local failure/reload and terminates free access immediately. | [issues #122](../development/issues.md) · lifecycle 2/2 · widened Membership/customer/discount 49/49 · package+lifecycle 11/11 · TypeScript/diff clean · production Stripe foundation #33 still open |
| Membership webhook delivery | **CODE/BEHAVIOUR RESOLVED 2026-08-26; signed live-provider acceptance pending:** a scoped event inbox retries failed/interrupted/legacy work, completes after subscriber/payment state and synchronous effects, validates metadata, persists payment rows and returns 503 on processing failure. | [issues #123](../development/issues.md) · webhook 4/4 · combined Membership dedicated 6/6 · widened 53/53 · package+dedicated 15/15 · TypeScript/diff clean · production Stripe foundation #33 still open |
| Affiliate payout ownership | **CODE/BEHAVIOUR RESOLVED 2026-08-26; mounted/live-Connect acceptance pending:** affiliate-scoped scheduling claims each approved commission once and resumes partial work; manual/Stripe completion shares a staged operation and derives earnings from canonical paid attributions. | [issues #124](../development/issues.md) · focused 3/3 · package+focused 17/17 · combined Membership/Affiliate 70/70 · TypeScript/diff clean · production Connect #45 still open |
| Affiliate currency/refund accounting | **CODE/BEHAVIOUR RESOLVED 2026-08-26; mounted/live-provider acceptance pending:** eligible source orders snapshot currency/settlement facts, payouts are currency-bound, and cancellation/refund state becomes a pre-transfer reversal or replay-safe same-currency future offset. | [issues #125](../development/issues.md) · focused 3/3 · Affiliate package+focused 20/20 · widened Membership/Affiliate/Ecommerce 79/79 · TypeScript/diff clean · production Connect #45 still open |
| Membership/Affiliate record validity | **CODE/BEHAVIOUR RESOLVED 2026-08-26; mounted acceptance pending:** allowlisted inputs and complete candidate schemas reject invalid identity, enum/currency, money/rate/date, reference, category, provider and payout combinations before mutation. | [issues #126](../development/issues.md) · byte-identical refusal 3/3 · widened Membership/Affiliate/Ecommerce 82/82 · TypeScript/diff clean |
| Affiliate identity claims | **RESOLVED 2026-08-26:** install-scoped durable claims converge identical user/code/order work on one complete row, repair partial pointers/indexes, refuse conflicting code ownership and reconcile referral counters exactly once; collection locks preserve every shared Affiliate/code/attribution/payout index. | [issues #127](../development/issues.md) · delayed/fault multi-container 4/4 · focused 27/27 · widened Membership/Affiliate/Ecommerce 86/86 · TypeScript/diff clean |
| Ecommerce checkout authority | **PARTIAL — NON-SECURITY CORE RESOLVED 2026-08-26:** strict ids/quantity input, server-resolved money/stock/value/shipping/tax, durable immutable operation and authoritative settlement are complete; guest/end-customer authorization is deliberately deferred. | [issues #69](../development/issues.md) · focused Ecommerce/package gate 39/39 · TypeScript clean · mounted/live Stripe not claimed · 3032 untouched |
| Ecommerce storefront bridge | **PARTIAL — NON-SECURITY CORE RESOLVED 2026-08-26:** catalogue/search/cart/variant/quote/by-session contracts share tenant/store-keyed DTOs and minor units; public route plus literal two-store browser acceptance remains. | [issues #72](../development/issues.md) · mounted source contracts in focused 39/39 · security/public-route work deferred |
| Ecommerce value/inventory/quote | **CODE/BEHAVIOUR RESOLVED 2026-08-26; mounted/live-provider acceptance pending:** checkout-owned discount/issuance and SKU reservations commit/release once; versioned admin edits preserve state; configured shipping/tax produces one immutable summary/provider/order quote. | [issues #70, #73–#74](../development/issues.md) · concurrency/failure/expiry/refund/quote proof in focused 39/39 |
| Ecommerce provider ledger | **CODE/BEHAVIOUR RESOLVED 2026-08-26; signed live-provider acceptance pending:** durable inbox work settles the authoritative operation, retries side effects, releases expiry, accounts cumulative refunds and constrains audited fulfilment transitions. | [issues #75](../development/issues.md) · order lifecycle 8/8 · focused total 39/39 |
| Ecommerce product lifecycle | **CODE/BEHAVIOUR RESOLVED 2026-08-26; mounted acceptance pending:** ordinary retirement archives stable identity/dependants; scoped CAS authoring, recoverable slug migration, graph validation and lossless rich variants prevent stale overwrite/identity loss. | [issues #71 and #77](../development/issues.md) · product lifecycle 6/6 · focused total 39/39 |
| Ecommerce reporting | **RESOLVED 2026-08-26:** gross/refund/net/cancelled/pending and customer net spend are grouped by source currency rather than fabricated as GBP. | [issues #76](../development/issues.md) · reporting 3/3 · focused total 39/39 |
| Finance invoice identity | **RESOLVED 2026-08-26:** mounted create retains one operation key and Finance adopts/reserves/persists under refreshed cross-process storage coordination. Different intents cannot share a human number and same-key retries cannot create/burn another. | [issues #113](../development/issues.md) · separate-process/reload 2/2 · wider 91/91 · TypeScript/diff clean |
| Editor AI reply replay | **PARTIAL/INCOMPLETE:** claim coordinator/adapters exist and focused regressions pass; the Supabase RPC/direct-Postgres contracts, post-provider freshness, migration application and live two-instance proof remain | [issues #18](../development/issues.md) |
| Editor transitions | **PARTIAL:** project dirty buffers, aborted reads and source-level AI project/prefill clearing are covered; browser hide, surface, lifecycle and refresh remain open and prefill bleed is still reported | [issues #19](../development/issues.md) |
| Data truth | **OPEN:** cross-agency ids are scoped, but unresolved ids can still be stored and absent website config still returns Milesymedia defaults | [issues #20](../development/issues.md) |
| Showcase | **P1 OPEN:** hidden/mutating `GET` and OAuth callbacks bypass the non-GET block; `/showcase` also resets one shared fixture | [issues #21 and #23](../development/issues.md) |
| Client erasure | **P1 OPEN:** live failures can return success, normal retry is stranded after local deletion, and the permanent audit message keeps the client name | [issues #24](../development/issues.md) |
| Staff capability policy | **OPEN:** broad proxy restrictions conflict with leaf routes that advertise staff access | [issues #25](../development/issues.md) |
| Full suite | **LAST DOCUMENTED 2026-08-23:** 3,621 pass / 0 fail / 1 skip; not rerun during this docs refresh | [tests.md](../development/tests.md) |

## ✅ Earlier verified ground truth — re-checked against source through 2026-08-23

| Claim | Verdict | Evidence |
|---|---|---|
| Suite / typecheck | **3,621 pass · 0 fail · 1 live-Postgres skip · typecheck clean** | full-suite run across 663 suites; skip is explicit because `DATABASE_URL` was absent (see [checklist.md](../development/checklist.md)) |
| 🔴 Freelancer preview privilege escalation | **FIXED** — `enter` stashes the enterer, `exit` restores exactly them, no owner fallback | `src/app/api/auth/preview-as-freelancer/route.ts:49,97-101` |
| 🔴 Finance create-surface idempotency | **FIXED** — one shared mechanism wired into six create surfaces + expenses | `src/built-ins/modules/agency-finance/src/lib/idempotency.ts` |
| 🔴 Erasure email-in-log (GDPR) | **FIXED** — the three log sites log an **id**, not an email; `onEraseClient` now matches by the erasure subject's emails, not the never-set `contact.clientId` | `leads-pipeline/src/server/contacts.ts:168,227,252,279` · `leads-pipeline/index.ts:168-180` |
| MFA on login | **BUILT — all four phases.** Server gate, login code step, session assurance and ten one-time recovery codes are implemented | [mfa-login.md](../development/plans/mfa-login.md) · `src/app/api/auth/login/route.ts` · `src/lib/server/mfa.ts` |
| Connect flow — real codes | **SHIPPED**; only the code-step browser walk is unwalked | [connect-flow-real-codes.md](../development/plans/connect-flow-real-codes.md) |
| Company switcher | **SHIPPED**, brand-aware sign-in | `src/app/api/auth/switch-agency/route.ts` |
| Email sender | **CONFIGURED** — Resend key set; `inspectProductionReadiness()` reports email READY | `.env.local` `RESEND_API_KEY` |
| RLS | **ON in live Supabase** (14 tables, public anon key, verified 2026-08-20). Policies are version-controlled in **16 migrations**; pending migrations still need production application. Open residue: `brand_enquiries` has no `agency_id`, and service-role call sites bypass RLS — measure the current count before acting | [rls-enable.md](../development/plans/rls-enable.md) |
| Published-site signup | **FIXED** — native form posts and JSON requests are both accepted; the browser form gets a 303 redirect and rate limiting still applies | `src/app/api/auth/signup/route.ts` · `scripts/smoke-auth-form-encoding.test.ts` |
| Stripe runtime/config | **BUILT LOCALLY** — `stripe@22.5.0` resolves and Finance writes/reads declared secrets through the encrypted settings path. Real Checkout/webhook/refund proof is still external | [checklist.md](../development/checklist.md) |
| Dev Console shape (**re-checked 2026-08-21**) | **SEVEN sections** with `?view=` tabs, not twelve sidebar items: Home · Roadmap · Findings · Library · Tools · **Editor** · Notes. `dev-team/editor/page.tsx` is a **real page** (`DevEditorProjectsPage` rendering `DevEditorSetup`), NOT a redirect stub — its only `redirect()` is the auth-failure branch. **Team chat is not a sidebar row** (zero occurrences of "chat" in `layout.tsx`); `dev-team/chat/page.tsx` still exists and still renders `TeamChat`, it is simply unlinked from the nav. | nav items `dev-team/layout.tsx:74-89`. Old routes still redirect stubs: `dev-team/{working,tasks,auditor,logs,updates,inspector,api}/page.tsx` |
| Findings + Auditor combined | **DONE** (this file used to say "not done yet") | `dev-team/auditor/page.tsx:6` → `/portal/dev-team/findings?view=auditor` |
| Marketing views | **10 → 5**, every old `?view=` still resolving | — |
| Element engine | **P1+P2 landed** — the block vocabulary lives in `src/engines/editor/elements/` | `src/engines/editor/elements/{registry,block,definition}.ts` |
| Where the editor lives (**re-checked 2026-08-21**) | **ONE universal editor: `src/engines/editor/DevEditor.tsx`.** It is NOT owned by any route — `agency/portals/editor/page.tsx` and `dev-team/editor/studio/page.tsx` are its two **doors**, both mounting the same component via `loadPortalStudioProps`. It was `agency/portals/editor/_ClientPortalStudio.tsx` (component `ClientPortalStudio`) until 2026-08-21; sitting inside the portals route kept leaking portal-specific copy at people editing a plain repository. Structural move only — no behaviour change, `tsc` 0, suite 2709/0/1skip. Anything below in 🗄 HISTORICAL still saying `_ClientPortalStudio` is a dated record, not a live path. | `src/engines/editor/DevEditor.tsx` · `src/engines/editor/server/portalStudio.ts` (loader + the `PortalStudio*` type names, deliberately unchanged) |
| Environment credentials | belong **only** to the founder's agency | `src/lib/server/auth/founderAgency.ts` |
| Radar catalogue | **172 families × 12 lenses = 2,064 rules** (the "2,040 / 170" figure in older briefs is stale) | `src/engines/data/radar/radarRuleCatalog.ts` — 172 family entries |

**Still genuinely open** (highest risk first):
1. **P0/P1 safety:** central session revocation, truthful/retryable erasure, and a capability-based read-only plus isolated showcase.
2. **Runtime reliability:** file persistence/recovery, live proof and remaining freshness work for the Editor AI distributed contract, the remaining Editor transition/prefill guards, staff policy, unresolved references/truthful website defaults and read-path performance.
3. **Live/external proof:** Stripe Checkout + signed HTTPS webhook + payment/refund, Meta OAuth/webhook, deployment environment verification, pending Supabase migrations and DPO sign-off.
4. **Browser acceptance:** the waiting-client connect/code journey and the complete Aqua Editor round trip; source tests are green, but these human paths have not been fully walked.
5. **Broader source backlog:** whole-editor-in-client-portal, engine widening/assistant proposals, stage/wizard generalisation, env-only sellability audit, RLS residue and Aqua Tag production routing re-entry. [checklist.md](../development/checklist.md) owns the exact order.

## 🗄 HISTORICAL — session log, 2026-08-19 (late) · superseded by the ground-truth table above
> Kept for context. **Do not brief a worker from anything below without re-checking the source.**

### What changed this session (the big ones)
0b. **THE DEV CONSOLE SIDEBAR IS SIX SECTIONS, NOT TWELVE SCREENS (2026-08-20).** Ed's call:
   "a lot of things could be views rather than set sidebar items." Every screen that was a sibling
   of the one above it became a `?view=` of one route, so the nav item stays highlighted and every
   old URL still lands (each old route is a redirect stub):
   - **Home** — now a real DASHBOARD: in-flight count, live workers with their check-in text,
     tasks done, open findings, what's due next, launch blockers. Every number read from the same
     source its section reads, so home cannot disagree with the page it links to.
   - **Roadmap** — `Roadmap` · `Right now` (the old board) · `Tasks`
   - **Findings** — `Found by me` · `Found by the auditor` (**this closes Ed's "combine findings
     and auditor" ask** — same thing, one manual one automated)
   - **Library** — `Docs` · `Logs` · `Updates`
   - **Tools** — `Inspector` · `Editor` · `API & MCP`
   - **Notes**, then `← Leave Dev Team` (now pinned to the bottom of a scrolling nav)
   Section bodies live in `<section>/_Section.tsx`; the host route picks a view and passes it the
   shared `<ViewTabs>` from `_ui.tsx`.
0. **THE ROADMAP EXISTS — the outer view (2026-08-20).** `docs/development/roadmap.md` +
   `/portal/dev-team/roadmap`. An item is an OUTCOME with a horizon (Now / Next / Later /
   Someday / Shipped), a target date and the plans that deliver it; its progress is **computed**
   from those plans' phases, never typed, so it cannot drift. Seeded with the real 21 items.
   **The Roadmap section absorbed "What we're working on" AND "Tasks"** — one sidebar entry, three
   views (`Roadmap` / `?view=now` / `?view=tasks`), because they are the same work at three
   altitudes. The old routes redirect. Ed adds feature requests straight from the UI.
   ⚠ This **supersedes `phases.md`** (archived 2026-08-21 to `docs/context/archive/phases.md`, not deleted) — do not add items there.
   **Two real bugs fixed on the way:** `devTeamTasks.parsePhases` let a `## Phases` section run past
   its `###` sub-sections and swallow every later numbered list — inflating counts (134 → **127**
   real tasks) and producing DUPLICATE task ids (React key collisions on the board); and the Dev
   Team sidebar overflowed at laptop height so "My profile" printed over "Leave Dev Team".
1. **The verify bottleneck is SOLVED.** `storage.ts` hardcoded one sandbox file, so a second
   worker's `dev:verify` silently clobbered the first — that's why workers were told not to
   self-verify. Now `PORTAL_DATA_FILE` + `NEXT_DIST_DIR` + `npm run sandbox:fork -- <name> <port>`
   give every worker its own state file, build dir and port. **Proven:** a worker server on :3041
   wrote only its own sandbox while the shared one stayed byte-identical. ⛔ The old rule
   ("hand UI checks to the Commander") is RETIRED — workers browser-verify themselves.
2. **Dev Mode no longer changes who you are.** Entering the workspace is plain navigation: Ed
   stays Ed on his real data. Identity changes ONLY via **Inspector** (was "Profiles" — renamed;
   it collided with client/customer/user profiles). Exiting an inspection restores the **exact**
   person who started it — the same escalation class as the freelancer bug, fixed with tests
   (`smoke-dev-mode.test.ts`).
3. **The input side exists.** `/portal/dev-team/findings` — capture what's wrong while using the
   app (title · severity · **file upload** for iPad-annotated screenshots · drag-drop · paste),
   then select findings → **generate a plan** that embeds the evidence, marks them planned, and
   lands on the board. Findings are markdown in `docs/development/findings/` with images served
   through a gated route.
4. **Performance pass (8 fixes, suite green throughout).** Root causes were redundant server work
   + eager bundling, NOT hydration. Shipped: `React cache()` request-dedup (alerts/company-health/
   enquiries were computing 2–4× per render, each a live Supabase round-trip), streaming
   (`agency/loading.tsx` + Suspense — the two duplicate `AgencyActionsPage` renders are off the
   critical path), code-split command-centre stations, lazy Advisor drawer, lazy react-markdown,
   `optimizePackageImports`, dynamic React Flow.
5. **Dev Console UI:** colour-with-meaning (each section owns a hue across sidebar + card +
   header), hover motion, **dark mode** (token system in the layout; accents use `color-mix` so
   one definition serves both modes), **Logs** (check-ins + file activity + signed doc edits),
   **Edit docs moved INTO the Library** (it's an action on a doc, not a place).
6. **Command Centre:** Dev Team is a 4th station, renamed **Dev Console**, badge now shows the
   real open-blocker count (was hardcoded 0).

### The 8 workers in flight (all check in — see `/portal/dev-team/logs`)
`api` ✅done (browser-verified; also built the Master Tag panel Ed asked for) · `bundle` ✅done
(block registry 347KB→59KB) · `security` ✅done · `money` ✅done · `devteam` ✅done (suite 1816) ·
**`erasure` ACTIVE** (found the same PII bug in email-sender; now on the Person disposition) ·
**`marketing` ACTIVE** (P1–P4 + attribution shipped; **needs Ed on P6**) · **`console` ACTIVE**
(topbar Dev Console, P1 — plan: [dev-console-topbar.md](../development/plans/archive/dev-console-topbar.md)).

### Decisions Ed made this session (do not re-litigate)
- **NEVER touch git.** A push triggers Vercel → production deploy. No commits either. Rollback is
  a scratchpad snapshot, not git.
- **Person erasure = ANONYMISE IF ORPHANED** — always unlink the erased client; strip PII only if
  no other `clientIds` entry and no standalone role (supplier/partnership/marketer). Full rule in
  [plugin-data-erasure.md](../development/plans/plugin-data-erasure.md). Relayed to the erasure worker.
- **Dev Mode entry must not swap identity** (see #2 above).
- Separate worker chats > one orchestrator with subagents (Ed found the latter too slow).

### Outstanding / next
- 🟠 **PARTLY FIXED 2026-08-20 — the LOGIN half is done; only SIGNUP is still broken.**
  `api/auth/login/route.ts:124` now accepts `formData()` and 303-redirects (checklist.md lists
  "published-site login" as shipped). `api/auth/signup/route.ts:53` still parses `req.json()` only —
  **that half is still open.** The original write-up, unedited, follows:
  ~~UNROUTED FINDING — needs an owner (from the `money` worker, 2026-08-19).~~ A published client
  website's **Login / Signup blocks are broken out of the box.** `website-editor`'s
  `LoginFormBlock`/`SignupFormBlock` render a **native `<form method="POST">`** defaulting to
  `/api/auth/login` + `/api/auth/signup`, but both routes parse with `req.json()` only and catch the
  throw into a 400 — so a **visitor** who tries to sign in is navigated off the page onto a raw
  `{"ok":false,"error":"Invalid request."}` with no way back. **Public-facing; a real end customer
  sees it.** Source-verified, NOT confirmed against a live published site. Full write-up +
  both fix options: **[issues.md #14](../development/issues.md)**. **Why it is unrouted:** `/api/auth/*`
  is shared, security-sensitive foundation (rate-limited sign-in) and `website-editor` belongs to the
  `bundle` worker — the money worker deliberately did not touch either. **Route to whoever owns
  auth-or-website-editor next.** Recommended fix (a): make the two routes accept **either** encoding
  and 303-redirect — `api/auth/profile/update/route.ts` **already does exactly this** and is the
  reference; it keeps the blocks working without JS.
- ✅ **Findings + Auditor are COMBINED** — Ed's call ("same thing, one manual one automated") is
  **DONE**: `/portal/dev-team/auditor` is now a redirect stub to
  `/portal/dev-team/findings?view=auditor` (`dev-team/auditor/page.tsx:6`). *(This line said "not
  done yet" until 2026-08-20 — it was stale.)*
- **Not browser-verified:** dark mode (seen working once, before the server died), Logs, Inspector.
  The machine hit load 81 with 8 workers running suites and the dev server was killed.
- **Ed owes** *(corrected 2026-08-23 — `email sender`, `RLS`, Stripe installation and the first
  git commit are done)*: Meta app · live-Stripe keys/signed webhook walkthrough · DPO sign-off on the erasure retention schedule · walk the onboarding
  chain once (the connect code step has never been clicked) · is a "company" an Agency or a
  TradingCompany. ~~email sender~~ ✅ Resend configured. ~~RLS~~ ✅ on in live Supabase.
- ~~Workers report suites at 1816–1827 green~~ → **current: 3,621 pass / 0 fail / 1 live-Postgres skip, typecheck clean (2026-08-23).**

## 🗄 HISTORICAL — the 2026-08-19 commander boot notes (⚠ item 3 was already wrong when written)
**The full build batch is DONE + auditor-verified. We're no longer building — we're finishing.** Boot sequence:
1. **Read [next-wave-briefs.md](next-wave-briefs.md) FIRST** — the go-forward payload. *(Corrected 2026-08-20: its "3 blocker-fixes" are all FIXED and struck through there; the only live brief is published-site **signup**.)* Ed's launch checklist, the `:3032` infra blocker + the browser-verify sweep, held/parked items, and Ed's decisions. THEN this file's workers table + [audits.md](../development/audits.md) for the verified picture. Per-worker debriefs were moved to [`context/archive/`](archive/) on 2026-08-20 (all four plans shipped) + `development/`.
2. ✅ **Engine built + auditor-verified:** Radar · Staff · Aqua-Tag · KPI · Client-Health · Dev-Mode · Meta-inbox all PASSED; Connect-flow security-verified; Public-Bucket / Enquiry-card / Dev-Docs built + auditor finishing.
3. ~~🔴 **3 narrow fixes = the only real dev work left**~~ ✅ **ALL THREE ARE FIXED — corrected 2026-08-20.** Freelancer-preview escalation (`preview-as-freelancer/route.ts:49,97-101`), erasure email-in-LOG (`leads-pipeline/src/server/contacts.ts:227,252,279` log ids, not emails), finance create-surface idempotency (`agency-finance/src/lib/idempotency.ts`). **This line stayed 🔴 for a day after the work landed and nearly sent a worker to "fix" a hardened auth route.** Do not re-brief them.
4. 🔍 **The auditor loop is the MVP** — it caught 3 launch-blocker OVERCLAIMS this batch (a PII leak, a money double-count, a privilege escalation) — all wore green suites. Every worker "complete" → route to the auditor; treat "complete" ≠ "verified" ≠ "launch-safe". Verdicts in [audits.md](../development/audits.md). ⚠ **The recurring loop was STOPPED 2026-08-19 → re-audits are ON-REQUEST: re-run `/loop` in the Auditor chat when a fix lands; it will NOT auto-fire.**
5. ✅✅ **VERIFY BOTTLENECK SOLVED (2026-08-19) — workers now self-verify in a FULLY ISOLATED sandbox. No git/worktrees needed.**
   - **Root cause was `storage.ts:114`** — the file backend hardcoded `.data/portal-state.json`, so every `dev:verify` wrote the SAME file (worker #2 silently clobbered worker #1 + the Commander). Plus all servers shared one `.next` (the "stale folder-lock" that wedged :3032).
   - **Fix (both env-configurable, defaults unchanged → zero risk to existing usage):** `PORTAL_DATA_FILE` (storage.ts) + `NEXT_DIST_DIR` (`next.config.ts` `distDir`) + new `npm run dev:worker` + `npm run sandbox:fork` (`scripts/fork-sandbox.mjs` — copies the shared state so a worker starts with REAL data, never writes the shared file).
   - **Worker recipe:** `npm run sandbox:fork -- <name> <port>` → run the printed command → `http://localhost:<port>/dev` (zero-credential owner session). Own state file · own build dir · own port.
   - **PROVEN empirically:** a worker server on :3041 wrote only its own sandbox while `.data/portal-state.json` stayed byte-identical; `/dev` returned 200. Suite **1748 · 0 fail** after the change. Test artifacts cleaned up.
   - **⛔ RETIRED RULE:** "workers must hand browser-verification to the Commander" — that constraint is gone; workers browser-verify their own UI. Full recipe + browser-tool gotchas in [worker-brief.md](worker-brief.md).
   - Commander still runs :3032 for cross-cutting sweeps. **Ports:** Commander 3032 · workers 3041+.
6. 🧑‍💼 **Ed owes the launch bits** (email sender · Meta app · RLS · live-Stripe · git commit) + plan decisions — all in next-wave-briefs.

## 🔧 Fix wave — AUDITED 2026-08-19 (single-orchestrator subagents): 2 PASS · 1 REWORK (erasure STILL OPEN)
**Model (Ed, 2026-08-19):** ONE orchestrator + parallel read-only adversarial verifier subagents. This sweep PAID OFF — caught that erasure (a GDPR blocker) is wide open behind a green suite + a "complete" claim. Suite 1748 · 0 fail throughout. (audits.md has a concurrent peer writer — verdict detail captured here.)
| Fix | Verdict |
|---|---|
| ✅ Freelancer preview → OWNER escalation (security) | **PASS — escalation genuinely closed.** `preview-as-freelancer/route.ts` stashes `previewReturnUserId` at enter, `exit` restores THAT exact enterer, fails closed (no owner fallback); all adversarial inputs fail closed; dedicated MANAGER→MANAGER regression test (`smoke-dev-mode.test.ts:698`). Launch-safe pending Ed/Commander browser-walk. ⚠ Latent (founder-only, NOT this bug): dev-mode `exit` still "finds an owner" (`dev-mode/route.ts:165`) — **fix when the Dev Team hub reworks that route.** |
| ✅ Erasure (GDPR) — **REWORK CLOSED 2026-08-20** | **FIXED — re-verified against source 2026-08-20.** `onEraseClient` no longer matches on the never-set `contact.clientId`; it resolves the subject's emails from the erasure `subject` and matches on those (`leads-pipeline/index.ts:168-180`), and the three activity messages now log a contact **id**, not an email (`contacts.ts:227` Promoted · `:252` Updated · `:279` Archived). The 2026-08-19 REWORK verdict below is kept as the historical record: **REWORK — empirically proven NOT closed.** The leads `onEraseClient` hook (`index.ts:147` `contact.clientId === clientId`) NEVER matches (NO writer ever sets `contact.clientId`) → a converted client's contacts are **never erased**: email survives in `state.activity` via 3 un-fixed log sites (`contacts.ts:161` Added / `:220` Promoted / `:245` Updated), AND the contact row (email/name/phone) + `contacts/email/<email>` pointer survive in pluginData. The delete-path fix (`:277`) is real but unreachable; the green test seeds an impossible clientId-bearing contact (bypasses `upsert`). **Real fix:** hook must identify a client's contacts (stamp `clientId` at `promoteLead`, or match `convertedFromLeadId`/converted client) + strip email from the 3 messages + re-seed test via real `ContactService.upsert`. **PARKED behind Dev Team (Ed's call) — genuine launch blocker.** |
| ✅ Finance idempotency (money) | ✅ **RESIDUALS NOW CLOSED (2026-08-19, `money` worker) — pending auditor re-verify.** Both keyless paths fixed (`stripeReconcile` → `idempotencyKey: externalRef`; `markInvoicePaid` → server-derived `settle:<invoiceId>`), each **mutation-checked** (revert → 3 payments / 2 and 5 payments). **+3 more bugs found and fixed while testing:** a concurrent-create **lost-index-slot** bug that made a stored payment invisible to money-in (it was *masking* the Stripe triple-record) — now `index ∪ row-scan` via one shared `server/rowIndex.ts` across all 8 finance stores; the **Stripe drop-on-retry** 🟠 (cached the event id *before* reconcile succeeded → a transient failure made Stripe stop retrying a real payment); and **payroll had a guard no UI fed**. Also: 4 dead write-only indexes removed, and the **Plans create form repaired** — it posted form-encoded into a JSON handler, so *every* plan creation 400'd (runtime-verified fixed on an isolated `:3042`). Suite 1841/1843 (the 1 fail is `devteam`'s nav contract). ⚠ Worker logged a **self-inflicted `git checkout`** that wiped an uncommitted guard — repaired + verified; see updates.md. **Original PASS text:** double-click record + close closed, dedup holds under a parallel race, partials preserved. |

## 🗄 HISTORICAL — WAVE 2: 7 workers spun 2026-08-19 (Ed). Ports 3041–3046 + dev-team-finish.
> **All finished; nobody is in flight as of 2026-08-20. Every file listed below is FREE.** Kept as a record of who touched what.
Each owns a disjoint file set; all use isolated sandboxes (`npm run sandbox:fork`) and report via
`npm run worker:checkin`, so the Dev Team board shows them live.

| # | Worker | Owns | Watch |
|---|---|---|---|
| 1 | **Dev Team portal completion** ([dev-team-finish](../development/plans/dev-team-finish.md)) | `app/portal/dev-team/**` (incl. **`layout.tsx`**) · `agency/_DevTeamStation.tsx` · `lib/server/devTeamBoard.ts` + `devTeamAuditor.ts` · plan `**Status:` lines · surgical `_DashboardCommandCenter.tsx` + `agency/page.tsx` | ⚠ **OWNS `dev-team/layout.tsx`** — see collision below |
| 2 | **Leads-pipeline contact erasure** ([plugin-data-erasure](../development/plans/plugin-data-erasure.md)) 🔴 | `built-ins/modules/leads-pipeline/{index.ts,src/server/contacts.ts}` · `server/clientErasure.ts` · `smoke-client-erasure.test.ts` | The last true launch blocker. Claimed done twice, wasn't. |
| 3 | ✅ **Finance idempotency residual — DONE** ([finance-command-surface](../development/plans/finance-command-surface.md)) | grew to: `agency-finance/src/server/{stripeReconcile,payments,invoices,income,plans,expenses,categories,budgets,operations,rowIndex}.ts` · `api/{handlers,handlers-stripe}.ts` · `components/{NewPlanForm,FinanceOperationsWorkspace}.tsx` · `pages/PlansPage.tsx` · finance tests | Both keyless paths closed **+3 further money bugs** (lost record · Stripe drop-on-retry · payroll's unfed guard) + the broken Plans form. Partials preserved and proven. All mutation-checked. **Files FREE. → auditor re-verify.** 🟠 It also surfaced an **unrouted finding for you** — see *Outstanding / next* (published-site Login/Signup blocks). |
| 4 | **Bundle optimization** | `built-ins/modules/website-editor/src/components/blockRegistry.ts` · `app/globals.css` (React-Flow CSS) · `automations/` | ⚠ globals.css is shared — one surgical line. Scoped AWAY from `agency/page.tsx` (worker 1 owns it). |
| 5 | **Marketing workspace overhaul** ([marketing-workspace-overhaul](../development/plans/marketing-workspace-overhaul.md)) | marketing workspace files | Consumes kpiRegistry + aqua-tag READ-ONLY (both now shipped → unblocked). Has 2 Ed decisions to surface. |
| 6 | **Pre-launch hardening** ([security-hardening](../development/plans/security-hardening.md)) | `lib/server/publicUploadStorage.ts` · `aquaTagSource.ts` · `metaMessaging.ts` + their tests | All auditor-flagged nits. Add depth, don't change posture. |
| 7 | **Dev portal API/MCP section** | NEW `app/portal/dev-team/api/page.tsx` · `docs/external-assistant-api.md` · `docs/workspace/api-reference.md` | ⚠ **must NOT edit `dev-team/layout.tsx`** — see collision below. Surfacing only: MCP + keys + vault already exist. |

### ⚠ COLLISION — resolve before both land
**Workers 1 and 7 both want `src/app/portal/dev-team/layout.tsx`** (1 adds icons to every nav item; 7 wants to add an "API & MCP" item). **Resolution: worker 1 OWNS the file.** Worker 7 builds its page + docs and does NOT touch the layout; worker 1 adds the `api` nav entry (href `/portal/dev-team/api`, order 55, lucide `Plug`) alongside its icon pass. If worker 7 has already edited it, worker 1 must re-read before its own edit.

### What already exists (worker 7 — do NOT rebuild)
Recon (2026-08-19) found the API/MCP layer **already shipped + smoke-tested**: `/api/mcp` (hand-rolled JSON-RPC, 7 permission-gated tools, no SDK dep) · `aqa_` bearer API keys (SHA-256-hashed, per-key modules/permissions/expiry, rotate/revoke, rate-limited, audited) · `/api/v1/**` + a served OpenAPI 3.1 spec · AES-256-GCM credentials vault (9 providers) · the human-acceptance proposal inbox (`createAgencyTask` unreachable externally) · a 554-line `ExternalAiConnectionPanel` + `SKILL.md`.
**Real gaps:** no OAuth discovery (connectors need a pasted token) · **API keys persist in local `PortalState`, not Supabase** (a sandbox reset loses them — surface honestly) · `docs/external-assistant-api.md` says "read-only, no write path" which **contradicts the shipped code**.

## 🗄 HISTORICAL — worker/plan ledger (nobody is in flight as of 2026-08-20)
> ⚠ Statuses below are as each worker left them. Several are now **wrong** — most notably the MFA row (see the correction on that row) and any row still carrying a 🔴. Re-check the source before acting on any of it.

| Worker | Plan | Owns (files/areas) | Status |
|---|---|---|---|
| ~~Radar worker~~ | [radar-upgrade.md](../development/plans/radar-upgrade.md) | Radar files | ✅ **COMPLETE — all 7 stages shipped + extras** (probe-cadence cron, external-DB monitoring, two new UI panels browser-verified). Plan marked done. Radar files now FREE to touch (but coordinate client-health / battle-table which *consume* radar). Suite ~1482 green. |
| (this chat) Commander | — | docs/ (plans, todos, context) | Orchestrating. Ocean Boulevard audit done → folded into staff plan. |
| ~~Staff worker~~ | [staff-team-system.md](../development/plans/staff-team-system.md) | `server/people.ts`, `server/staffCapacity.ts`, `components/people/TeamChat.tsx`, `api/portal/{people,team-chat}`, `built-ins/modules/agency-hr`, `portal/team/`, staff command + portal UI | ✅ **COMPLETE — all 10 phases shipped** (2026-08-19): directory/card/owner · presence · capacity+freelancer-jobs · delegation+EOTM+calendar · progression+feedback · internal-chat · configurable-onboarding/hiring · org-chart · **training modules+quizzes** (`PeopleTrainingModule` block+quiz builder, pure grading, pass-gated, answer-key-never-leaked) · staff-contracts. Decisions (Ed): PeopleEmployee canonical, owner-as-card, FULL card, freelancers=full+jobs, chat=full-inbox, training=content-blocks. **People suite 19 cases, full suite 1622 green, all my files typecheck-clean.** ✅ **BROWSER-VERIFIED on `:3032`** (2026-08-19, self, via Claude-in-Chrome): agency `/portal/agency/people` all 10 tabs render, Capacity shows live Radar data, Team chat works, no console errors; staff `/portal/team` via Dev Mode POV → demo staff, progression/training/chat stations all render; exited Dev Mode cleanly. **Fixed a live bug** (TeamChat infinite-spinner-on-failed-load → error + retry). 📄 **Full debrief: [staff-worker-handoff.md](archive/staff-worker-handoff.md)** (done / tested / challenges / real thoughts / what's left). Noted future enhancements: unified cross-domain contracts view, full `_ClientPortalStudio` embedding for module authoring, **retire/reconcile agency-hr `Staff`** (redundant now). **Staff files now FREE.** → enters audit queue. |
| **Connect-flow worker** | [connect-flow-real-codes.md](../development/plans/connect-flow-real-codes.md) 🔴 | `lib/server/connectionConfirmation.ts`, `app/connect/`, `app/api/portal/connections/` + **additive** `pendingCode` on `portalConnections.ts` & 2 fns in `portalConnectionStore.ts` (flagged) | ✅ **ALL 4 PHASES SHIPPED — code-complete** (generate+store+verify+single-use; email via `request-code` + resend; lockout after 5 + rate-limits; expiry-countdown/error UX). **Server-runtime-verified 13/13** (real route handlers); connect page renders live on `:3032` (no console errors). Suite **1517 green**, my files typecheck-clean. **Not launch-done until:** ① agency connects a Resend/SMTP sender; ② code-step browser walk (deferred — needs seeded connection+session). Auditor: P1 🟡 PASS-WITH-NITS (both nits since closed by P2+P3); **P2/P3/P4 still to audit.** 📄 **Full debrief: [handoffs/connect-flow-real-codes.md](archive/connect-flow-real-codes-handoff.md)**. Connect-flow files now FREE (with the flagged additive `pendingCode` on portalConnections). |
| ~~Erasure worker~~ | [plugin-data-erasure.md](../development/plans/plugin-data-erasure.md) | `server/clientErasure.ts`, `built-ins/runtime/_types.ts`, `api/portal/clients/[clientId]/erase` **+ (out-of-lane, Ed-approved) 7 plugin modules: leads-pipeline/ecommerce/affiliates (`onEraseClient`); +agency-finance/fulfillment/memberships (`dataDisposition`) + vendored types** | ✅ **COMPLETE — all phases (1,2,2b,2.5,2.5c,3,4,5) shipped + runtime-verified in memory** (20/20, 24/24, 23/23 + per-disposition smoke). pluginData sweep + **disposition policy** (DELETE comms/marketing · RETAIN finance/orders/deliverables, GDPR Art.17(3)(e) · plugin hooks strip-PII/keep-payment + key-PII) + **live scrub** (`inbox_*` delete + no-PII stub; `brand_enquiries` anonymise, resolution split) via an **injected** Supabase client (route passes admin client, tests a fake → never touch live). Critical guard: old blanket sweep WAS over-deleting finance → now RETAIN. Gating suite **1535 green** (repeat-run stable), my files typecheck-clean; self-review polish done (async `previewClientErasure` — fixed an RSC `require()` over-count). **Erasure files now FREE.** **Before real clients (not a code gap):** staged live run vs a throwaway client + **DPO sign-off** on retention schedule (see [status.md](../development/status.md)). ⚠ pre-existing unrelated fulfillment **module**-smoke drift flagged as separate task. 📄 **Full debrief: [erasure-worker-handoff.md](archive/erasure-worker-handoff.md)**. ⚠🔴 **NOT launch-safe — auditor's email-in-LOG hole appears UNADDRESSED:** worker fixed the email-in-**KEY** (2b pointer) but not the activity-**LOG** line (`ContactService.delete` → "Archived contact <email>" during erase). Log-fix (don't-log-PII + log-absent test) routed to this worker; auditor re-verifying, launch-safe HELD. Follow-ups (ops/legal, not code): staged live run · DPO sign-off · retention-expiry wiring. → **audit queue (email-in-log HOLD).** |

| **MFA worker (Worker 2)** | [mfa-login.md](../development/plans/mfa-login.md) | `app/api/auth/login`, `lib/server/mfa.ts` | **CURRENT CORRECTION 2026-08-23:** all four phases are built — server gate, login code step, session assurance and ten one-time recovery codes. The earlier 2026-08-20 correction that called phases 3–4 absent is itself superseded. |

| **Dev-Mode worker** | [dev-mode-demo-profiles.md](../development/plans/dev-mode-demo-profiles.md) ⭐ | `app/api/auth/dev-mode` route, `canUseDevMode()` gate, dev-mode toggle in the Topbar account dropdown, POV switcher, cinematic load-in · additive `types.ts` | ⤳ **SUPERSEDED — substrate SHIPPED and in use.** P1–4 code-complete and browser-verified (2026-08-19). ✅ Works: toggle placement (dropdown, under Performance/Focus); enter→demo owner + cinematic; **demo-staff identity + role-scoping** (staff bounced from agency views); fenced demo data (9 vs real 14 alerts); return-to-real. Historical: 3 browser-only bugs were found (unit tests were 22/22 green): **(1) "View as demo client" hop broken** — plays cinematic but stays owner + **overlay STICKS blocking the top bar** (hard-reload to escape); **(2) demo-staff dead-end** — lands bare `/portal/account`, no switcher/Exit reachable; **(3) load-in caption hardcoded "owner view".** → ⤳ **SUPERSEDED by [dev-team-portal](../development/plans/dev-team-portal.md) (BUILT 2026-08-19).** Entering Dev Mode no longer mints a demo persona at all — Ed stays himself in the Dev Team workspace — so bugs (1) and (2) (broken client hop, demo-staff dead-end) no longer apply to his path. The POV switcher now lives in the portal's **Profiles** section. Remaining cinematic polish tracked in [dev-team-finish](../development/plans/dev-team-finish.md). Topbar edit was collision-free (Staff strip is in `_PeopleCommand.tsx`). |

| **KPI worker** | [kpi-intelligence-overhaul.md](../development/plans/kpi-intelligence-overhaul.md) | NEW `kpiRegistry`(+server); new `customKpis`/`kpiViews`/`kpiTargets`; wraps `commandIntelligence`; edits `_CustomerProfilesWorkspace` (& maybe `_CommandCentreKpiTrajectory`); **+ shared `_CommandIntelligenceWorkspace.tsx` + a mount in `_DashboardCommandCenter.tsx` (Ed-approved 2026-08-19)**; additive `types.ts` | **Phase 1 ✅ + Phase 3 ✅ (2026-08-19).** Decisions (Ed): saved views **BOTH**; **REPURPOSED `KpiComparisonWorkspace`** (not a new `_KpiExplorer`). Shipped: registry `lib/kpiRegistry.ts` (+server twin); **line/area/bar** chart types; **registry-backed selector**; "Explore all KPIs" surface on the trajectory; **the 40 commercial formulas registered + plotting** (chart pipeline migrated `CommandKpi`→`KpiDescriptor.series`, command output identical by construction; **`onInspect` contained so battle-table is UNTOUCHED**). My 13 registry tests pass; my files `tsc`-clean. **NOT browser-verified by me** (won't spin a 2nd file-backend server → clobbers shared `:3032` — commander please verify command+commercial plot together). Also shipped: **all ~1,500 radar evidence series** lazily loadable into the explorer (new `GET /api/portal/kpi-registry/evidence` + `describeEvidenceSeries`; picker render capped at 200). ****P4 foundation shipped** (targets model + layered/versioned `resolveKpiTarget`/`applyKpiTargetOverride` in kpiRegistry + `agencySettings.kpiTargets` store `lib/server/kpiTargets.ts`; additive `types.ts`); **P4 ✅ COMPLETE** (`/api/portal/kpi-registry/targets` + explorer now persists target overrides server-side, versioned; roundtrip + wiring tested); **Phases 1, 3, 4 all done.** **P5.A ✅** (suggested targets from history — rolling median + growth band, guess-then-confirm ✨ in the explorer; pure, consumes series only). ⚠ **P5.B (adaptive baseline IN the evidence vault) = radar-engine — NOT started; coordinate + serialise vs Aqua-Tag's tag→Radar (ACTIVE now).** **P6 ✅** (guided custom KPIs — numerator/denominator/op builder, `PortalState.customKpis` + `/api/portal/kpi-registry/custom`, computed client-side + plottable). **P7 ✅** (customer-intelligence scope selector + configurable breakdown dimension in `_CustomerProfilesWorkspace`; real geo deferred). **🎉 KPI overhaul COMPLETE — Phases 1/3/4/5A/6/7 all shipped; **P5B ✅ (Ed: "just do it")** — rolling/learned baseline added to `radarEvidenceVault.ts`'s summary (additive; **anomaly path UNTOUCHED**, all radar tests green; no engine-file edit), surfaced as the evidence-KPI adaptive baseline. **🎉 KPI OVERHAUL 100% COMPLETE (Phases 1/3/4/5A/5B/6/7). 📄 **Full debrief: [kpi-worker-handoff.md](archive/kpi-worker-handoff.md)** (done / tested / problems / thoughts / what's left — incl. the one decided-but-unbuilt item: `kpiViews` server-persisted saved views)..** ⚠ I additively edited `radarEvidenceVault.ts` (vault summary only) — flag for Aqua-Tag/radar coordination.** → P5 adaptive/radar-engine → P6 custom → P7 customer-intel. ⚠ **`_CommandIntelligenceWorkspace.tsx` shared — battle-table consumes it; coordinate before battle-table spins.** ⚠ radar-engine ONLY in P5 → **serialise w/ Aqua-Tag's tag→Radar**; `types.ts` still untouched. |
| **Public-bucket worker** | [public-bucket.md](../development/plans/public-bucket.md) | NEW `publicUploadStorage`; `website-editor` asset routing; approval gate; env | ✅ **COMPLETE — all phases shipped (2026-08-19); auditor PASSED** (prod fail-closed to Supabase, content-addressed keys, per-agency namespaced, no traversal). Cleanest island — no shared files with anyone. Pre-launch hardenings noted: allow-list the served content-type; path-within-dir guard on the local-dev write. |
| ~~Enquiry-card worker~~ | [enquiry-detail-card.md](../development/plans/enquiry-detail-card.md) + [handoff](../development/plans/enquiry-detail-card-handoff.md) | `_EnquiryDetailCard` (modal), extracted expand from `_MasterInbox`, `enquiryContactDetails` store, form-template endpoint · additive: aqua-tag's `WebsiteSiteConfig.formSchemas` + `websiteFormSchemas.ts`, Worker-10's `_WebsiteSourcesConfig` | ✅ **COMPLETE — all 5 phases** (2026-08-19; beyond its P1-only scope; suite **1732 green**, tsc clean; **self-browser-verified per phase**). P1 focus-trapped enquiry modal (submission-mirror + consent-first contact layers) · P2 **Import forms** (SSRF-safe → `formSchemas`; **closes Aqua-Tag's P2 seam**) · P3 real-form-shape layout · P4 editable "Added by hand" (`enquiryContactDetails`, NEVER writes live `brand_enquiries`/`people.ts` — test-guarded) · P5 polish. Coordination additive/clean (no clobber). → auditor (SSRF + no-live-write guard). **Backlog:** (a) manual-details→canonical Person on conversion (edits `people.ts`, respect facet-retention); (b) leads-pipeline re-linking. Files FREE. |
| ~~Client-health worker~~ | [client-health.md](../development/plans/client-health.md) | `clientAquaHealth`, `operationalAlerts` (alert types), NEW `server/clientAttention.ts` + `agency/_ClientsNeedingAttention.tsx`; **+ Ed-approved shared-file edits: `agency/page.tsx` + `_DashboardCommandCenter.tsx` (panel mount)**; rides `clientRadar`/`_ClientRadarPanel` | ✅ **COMPLETE — all 4 phases shipped + BROWSER-VERIFIED (2026-08-19).** P1 enquiry+traffic factors (evolving monthly baseline, ±10% band, two-tier watch/risk — Ed's decision); P2 firing risk → specific `operationalAlert` (off-system, `?tab=systems`); P3 rides `buildClientRadarFleet`; P4 `ClientsNeedingAttention` panel **mounted in Command Centre Day Command + verified live on `:3032`** ("1 to review → Northlight Studio · watch · reason · 91/100 · Fulfilment link"); the six Aqua-Health factor chips (incl. new Enquiry flow + Site traffic) render clean. **Suite 1639 green; my files typecheck-clean.** ✅ SUITE-RED `client-health-` classification FIXED (off-system in `resolutionExplain`+`resolutionFocus`, additive). Consumed radar READ-ONLY. ⚠ **Commander: I edited shared `page.tsx` + `_DashboardCommandCenter.tsx` (Ed-approved, surgical) — if KPI worker has them open, re-read.** ⚠ owns `operationalAlerts` — you-deserve-it shares it later → sequence. **Client-health files free.** |

| ~~Aqua-Tag worker (Worker 11)~~ ⭐ | [aqua-tag-system.md](../development/plans/aqua-tag-system.md) + [handoff](../development/plans/aqua-tag-handoff.md) | `websiteSources`, `websiteInjections`, `types.ts` (additive), Fulfilment `tags` workspace, config/injection endpoints, `aquaTagSource.ts` injection, radar `sales`/`development` families | ✅ **COMPLETE — all 6 phases** (2026-08-19; suite ~1679 green, tsc clean): P1 routing keystone (inbox\|client\|company), P3 company-aware registry + workspace **moved to Fulfilment** (`?view=tags`; old route removed), **P4 consent-gated tag-manager BROWSER-VERIFIED END-TO-END** (injection store allow-listed by id/key · public cached config endpoint · tag-side consent-gated injection, 7 providers), P5 two tag→Radar signals, P6 client-routed sites link into the website editor. **Files FREE except:** `website-sources/route.ts` + `_WebsiteSourcesConfig.tsx` now **CO-EDITED by the form-import worker** (P2 `websiteFormSchemas`/`import-forms`) → coordinate before touching those two. **Radar catalogue grew 170→172 families (2,040→2,064 rules) — guarded, count-invariants + rules-reference updated; KPI radar use is read-only → NO collision (resolved).** Auditor: ✅ **FULLY PASSED** — P4-config + tag-side consent enforcement (sound, not bypassable) + catalogue growth (guarded, real families, zero-blindness honored). Optional pre-launch hardenings noted (VM injection test + fail-close category-less default). Remaining bits = cross-subsystem passes (see handoff), not clean aqua-tag slices. |
| ~~Finance worker~~ ⭐ | [finance-command-surface.md](../development/plans/finance-command-surface.md) + [handoff](archive/finance-command-surface-handoff.md) | `built-ins/modules/agency-finance/` (whole plugin), per-client finance UI (`_FinanceTabClient`/`_ContractsPanel`/`_PaymentPlansPanel`), `lib/clientPaymentPlans.ts`, Finance `sidebarLayout` entry, NEW `lib/server/{closeDeal,clientDelightExpense}.ts` + `api/tenants/close-deal` · cross-domain (Ed-cleared): `_LeadsPipelineWorkspace` (P4b UI-only), `client-delight/route` (wire hook), `resolutionPlans` (2-line fix) | ✅ **PLAN BUILT — P1–P5 + You-Deserve-It wire** (2026-08-19; suite 1696 green, tsc clean, ~26 tests). Channels + money-in view · Stripe TEST-mode (idempotent-on-PaymentIntent webhook + refunds/chargebacks) · one-button close (client+lead) · AR/AP aging · delight→approval-gated-expense. Safety held (never holds funds; Ed's keys; TEST). P1/P2 browser-verified; **P3/P4/P5/wire unit-tested, NOT browser-walked** (:3032 dropped) → commander browser pass. Files FREE. ✅ **MONEY IDEMPOTENCY FIXED + AUDIT PASSED** (2026-08-19): a shared `deriveRecordId`/`normaliseIdempotencyKey` guard covers the create-surface; double-click record + double-click close are closed (dedup holds even under a parallel race) and genuine partial payments still allowed. ⚠ Residual (hardening, not blocking): `stripeReconcile.ts:53` + `handlers.ts:117` record without a key → double-count only under TRUE concurrent webhook/click. **NEEDS ED:** live Stripe verify (`npm i stripe` + TEST keys + webhook). **ROUTE:** `finance:refund/chargeback` alert → client-health's `operationalAlerts.ts`. |
| **Freelancer workspace** | [freelancer-workspace.md](../development/plans/freelancer-workspace.md) + [dated handoff](../development/plans/freelancer-workspace-HANDOFF.md) | Dedicated freelancer workspace and policy; agency management/preview; resumable provider/local/People invitation; job deliverables/submissions; private upload/download; direct owner messaging | **P1–P6 built; #112 resolved 2026-08-25.** The seeded read surface has prior responsive browser proof. The new mounted in-process journey passes 3/3 (including legacy-local adoption/replay) and surrounding 105/105 with TypeScript clean: one-identity retry, setup fallback, deliverable, policy gates, message to owner Team Chat, private upload/download on both sides and submit. The isolated build was environment-killed during webpack compile without a diagnostic. Exact build, real Supabase/email/reset/login plus browser/cross-process reload remain acceptance. The dated handoff's “remote login/upload/message not built” paragraphs are historical and explicitly superseded. |
| ~~Meta-inbox worker (Worker 10)~~ | [meta-inbox-connect.md](../development/plans/meta-inbox-connect.md) + [internal-chat-attention.md](../development/plans/internal-chat-attention.md) | `agency/inbox/` Channels (catalog-driven, **NO `_MasterInbox` edit** → no enquiry-card collision, RESOLVED), `integrationConnections`, `api/webhooks/meta`, `IntegrationConnectionsPanel`, chat read-state/@mentions, `operationalAlerts` (people:chat-attention) | ✅ **COMPLETE — 3 workstreams** (2026-08-19; handoff [doc](archive/handoff-inbox-chat-2026-08-19.md)): (1) **Meta self-serve Connect-now** (catalog provider, encrypted creds, stored-then-env, HMAC-gated multi-tenant webhook, multi-account); (2) **email-sender "Start here" callout** (powers connect-codes + enquiry replies — helps the Connect-flow blocker); (3) **internal-chat → owner Needs-attention** (read-state + @mentions + alert, e2e-tested). Suite **1668 green**, tsc clean, nothing committed. Worker browser-verified Connect-now form + banners + email callout. **NEEDS CMDR walk:** internal-chat alert live (2nd-user msg → owner Needs-attention). **NEEDS ED (external):** Meta Developer app + HTTPS deploy + register webhook; connect an email sender. ⚠ **webhook agency-resolution is security-sensitive → routed to Auditor.** Files free. |

⚠ **Complete + free: Radar ✅ · MFA ✅ · Erasure ✅.** Staff (P1–5 shipped; P6–10 need Ed decisions/larger). Their files free; client-health/battle-table still CONSUME radar → coordinate.
⚠ **In parallel now: Dev-Mode · KPI · Public-bucket · Enquiry-card(P1) · Client-health · Aqua-Tag · Worker-10(inbox, unknown).** Watch points: `Topbar` (Dev-Mode vs Staff presence) · `types.ts` (KPI/Dev-Mode/Aqua-Tag additive) · `operationalAlerts` (client-health) · **`websiteSources` (Aqua-Tag OWNS → enquiry-card stays P1)** · **radar-engine (Aqua-Tag tag→Radar vs KPI P5 — serialise)** · **`agency/inbox/` (Enquiry-card vs Worker-10 — RECONCILE).**

## Standing setup (should always be running)
- 🖥 **Dev server** — up in the Commander chat on `:3032` (file backend, `milesymedia` seed, `aquacrm-verify` config). For browser-verifying worker output.
- 🔍 **Auditor loop** — ⏸ **STOPPED / ON-REQUEST** (corrected 2026-08-20; this line said "RUNNING", which contradicted [next-wave-briefs.md](next-wave-briefs.md)). Ed stopped the recurring loop on 2026-08-19. It does **not** auto-fire: when a fix lands, re-run `/loop` in a fresh Auditor chat off [auditor-brief.md](auditor-brief.md). Independent, read-only on source, writes only [audits.md](../development/audits.md) → collision-safe alongside live workers.
  - **Verdicts land in [audits.md](../development/audits.md)** — I read it each check-in: PASS/NITS → mark done + tick the todo; REWORK → route findings back to the builder (via Ed), not done until re-audit.
  - **Pending queue** (oldest-first): Connect-flow P1 → Erasure P1/P2 → Radar (whole). Seeded in [audits.md](../development/audits.md).
- _A fresh commander must confirm both are up on boot — see [commander-handoff.md](commander-handoff.md) "Standing setup"._

## Recently shipped
- ✅ **Radar upgrade — COMPLETE** (all 7 stages + probe cron + external-DB monitoring + UI panels browser-verified). See [updates.md](../development/updates.md).
- ✅ **Erasure Phase 1/5** — `onEraseClient` hook contract added (gap NOT yet closed — sweep + live scrub still to come).
- The whole documentation system (`docs/`): the map + chapters + reference + [development.md](../development.md) law + this context book.

## Ready to assign (next plans)
Priority + parallelism noted. **Independent** = safe to run alongside others.

> ⭐ **CURRENT FOCUS (Ed, 2026-08-19): [dev-mode-demo-profiles](../development/plans/dev-mode-demo-profiles.md)** — get a worker on it ASAP. Local/dev-only demo-profile POV switcher; **~70% already built** (reuses `demoSeed.ts` + `isDevModeEnabled()` + Showcase-Mode pattern). **Collision-free** with everything in flight (new files; additive `SettingsTabs`/`Topbar`/`types.ts`; ⚠ coordinate the `Topbar` edit with Staff's presence strip). Unlocks safe browser-verification for workers + auditor. ✅ **Worker spun 2026-08-19** — see the Dev-Mode row in Workers-in-flight. → 🆕 **EVOLVED (Ed, 2026-08-19) → [dev-team-hub](../development/plans/dev-team-hub.md):** entering Dev Mode now lands in a **Dev Team** workspace with one **Inspection** sidebar (profiles-as-a-click-list + Dev Docs + launch status). Full hub, cinematic KEPT (→ fix the sticky-overlay bug). **Serialise AFTER the freelancer fix** (shares `dev-mode`/`preview-as-freelancer` routes). Plan written; spin when the freelancer fix clears. OB reuse: `employee-portal/app/showcase/route.ts` + `(preview)` group. → 🆕🆕 **EXPANDED → [dev-team-portal](../development/plans/dev-team-portal.md) (Ed, 2026-08-19) — NOW #1, everything else PAUSED.** Full internal portal (Library·Auditor·Profiles·Working-on·Updates·Notes·Librarian). 4 parallel recon agents mapped it → ~80% reuse (dev-docs=Library, notepad=Notes, clientRadar-sibling=Auditor, real openaiAssistant=Librarian backbone, parseBlockers=Status). Freelancer fix PASSED audit → auth files FREE → **unblocked. Building now as worker-orchestrator:** I own the 7 shared spine files (types/storage/sidebarLayout/operationalAlerts/operationalAttention/releases/businessRadar + dev-mode entry redirect + latent-exit-bug fix), parallel agents build the section islands. Rollback snapshot taken (scratchpad). → ✅ **CORE BUILT + BROWSER-VERIFIED WORKING 2026-08-19** on `:3032` (Home dashboard w/ live blocker strip · Working-on board parsing state.md into In-flight/Shipped/Blocked/Ready lanes · Library · Notes · Profiles · own sidebar · Dev-Mode `enter`→`/portal/dev-team`; all type-clean). Auditor section building. **DEFERRED (high-risk / do supervised):** CC 4th-entry (edits the agency-home `_DashboardCommandCenter` shell) · Updates→Inbox (shared alert engine) · latent dev-mode exit-fix (auth route). **NEEDS ED:** Librarian OpenAI key · Editor scope+write-policy · Dev-Team-Notes own-store? · erasure un-park. Full live tracker: [dev-team-portal.md](../development/plans/dev-team-portal.md).
>
> **Commander-recommended NEXT WAVE (clean parallel, no collision with the 4 in flight):**
> **KPI overhaul** (foundation — unblocks marketing + battle-table; Phase 5 later coordinates w/ Radar evidence vault) · **enquiry-detail-card** (Phase 1 only — inbox UI; its Phase 2 `websiteSources` waits on aqua-tag) · **public-bucket** (small, independent) · **mfa-login** 🔴 (independent; don't also give MFA to a security worker). Optional 5th: **aqua-tag-system** ⭐ (backbone; owns `websiteSources` → forces enquiry-card to stay on Phase 1). **Briefs not yet written — write them from [worker-brief.md](worker-brief.md) when Ed says go.**
| Plan | Priority | Parallel? | Depends on |
|---|---|---|---|
| [dev-mode-demo-profiles](../development/plans/dev-mode-demo-profiles.md) ⭐ | ↳ evolved | substrate — reused by the hub | — (70% built; 3 open browser bugs) |
| [dev-team-hub](../development/plans/dev-team-hub.md) ⭐🆕 | high (post-fix) | **serialise AFTER freelancer fix** (shares `dev-mode`/`preview-as-freelancer` routes) | freelancer fix · reuses dev-mode substrate · absorbs dev-docs + the 3 dev-mode bugs |
| [connect-flow-real-codes](../development/plans/connect-flow-real-codes.md) 🔴 | high (launch) | independent (auth/connect files) | — |
| [rls-enable](../development/plans/rls-enable.md) 🔴 | high (launch) | needs Ed + Supabase dashboard | Ed |
| [plugin-data-erasure](../development/plans/plugin-data-erasure.md) 🔴 | high (launch) | independent (erasure + plugin runtime) | — |
| [runtime-verification](../development/plans/runtime-verification.md) 🔴 | high | needs a free server (blocker below) | server |
| [enquiry-detail-card](../development/plans/enquiry-detail-card.md) | med | independent (inbox UI) | — |
| [meta-inbox-connect](../development/plans/meta-inbox-connect.md) | med | independent (inbox/integrations) | — |
| [aqua-tag-system](../development/plans/aqua-tag-system.md) ⭐ | high | **owns `websiteSources` — serialise vs anything touching routing** | — |
| [kpi-intelligence-overhaul](../development/plans/kpi-intelligence-overhaul.md) | high | owns `commandIntelligence`/KPI UIs + new `kpiRegistry` | (registry is the base for marketing) |
| [marketing-workspace-overhaul](../development/plans/marketing-workspace-overhaul.md) | med | **after** KPI registry + aqua-tag data spine | KPI, aqua-tag |
| [client-health](../development/plans/client-health.md) | med | ties to Radar — **coordinate with Radar worker** | radar |
| [you-deserve-it-upgrade](../development/plans/you-deserve-it-upgrade.md) | med | independent (delight + finance) | client-health (indicators) |
| [staff-team-system](../development/plans/staff-team-system.md) ⭐ | high | independent (people/HR/team) | ready — Ocean Boulevard patterns folded in ✓ |
| [operations-command-surface](../development/plans/operations-command-surface.md) ⭐ (+ compliance-legal, security-hardening) | high | new sidebar; security folds in rls/mfa | — |
| [battle-table-overhaul](../development/plans/battle-table-overhaul.md) | med | consumes Radar + KPI — **after** those land | radar, kpi |
| [mfa-login](../development/plans/mfa-login.md) 🔴, [public-bucket](../development/plans/public-bucket.md) | med | independent | — |
| [advisor-omega-upgrade](../development/plans/advisor-omega-upgrade.md) | — | **awaiting Ed's vision** | Ed |

## Blockers
<!-- PARSED BY THE APP: `parseBlockers()` in src/lib/server/dev/devDocs.ts reads this section and it
     drives the launch-blocker badges in the Dev Console. A bullet counts as RESOLVED if it is
     struck through, carries a ✅, or its LABEL (the text before the em-dash) says
     cleared/resolved/done. Keep it accurate — a wrong line here is visible on screen. -->
- ~~**The 3 "🔴 launch blockers"**~~ ✅ **CLEARED — all three fixed, source-verified 2026-08-20.** Freelancer-preview privilege escalation (`api/auth/preview-as-freelancer/route.ts:49,97-101`) · finance create-surface idempotency (`agency-finance/src/lib/idempotency.ts`) · erasure email-in-log (`leads-pipeline/src/server/contacts.ts:227,252,279`). They were briefed as open for a day after they landed — do not re-open them without reading the code first.
- ~~**Runtime verification / browser**~~ ✅ **CLEARED** — a dev server is up on `:3032` (verified listening 2026-08-20), and every worker can fork a **fully isolated** sandbox (`npm run sandbox:fork -- <name> <port>`) with its own state file, build dir and port. Nobody has to queue behind a shared server any more.
- ~~**RLS**~~ ✅ **CLEARED (the Ed half)** — RLS is ON in the live project, verified 2026-08-20 across 14 tables with the PUBLIC anon key: `brand_enquiries` (35 rows exist, anon sees 0), `profiles`, `app_datastores`, `website_consent_events`, `app_datastore_history` all deny anon; the five `inbox_*` tables are not REST-exposed; `brands`/`shoots`/`shoot_photos` are deliberately public website content. **What remains is ENGINEERING, not an Ed task** — tracked on [rls-enable.md](../development/plans/rls-enable.md): the policies are version-controlled in 16 migrations; pending migrations still need production application. `brand_enquiries` has no `agency_id`, and service-role bypasses need a fresh count before acting.
- ✅ **First git commit — CLEARED 2026-08-21.** The work is committed and pushed to `work/2026-08-20-parallel-session` on github.com/edstorm987/aquacrm. What remains is Ed's call to MERGE that branch to `main`, which is what triggers Vercel → production. Not a blocker on the work; a decision about when to deploy.

## ✅ RESOLVED 2026-08-20 — was "awaiting commander routing" (marketing worker's cross-lane fix)
- ✅ **[issues.md #15](../development/issues.md) — the `?? 0` traffic collapse is FIXED.** Source-verified 2026-08-20: `commandIntelligence.ts:127,131` now compute `trafficMeasured` / `formsMeasured` alongside the values and pass them through (`:146-147`); `commercialIntelligence.ts:34-36,46-47,269` carries them in `lineage`; `_CommercialIntelligenceWorkspace.tsx:114-118` renders **"Not monitored"** instead of an unqualified "Pageviews 0 · Aqua Tag", and the KPI cards display `—` when unmeasured (`commandIntelligence.ts:163,170`). **Nothing to route.** The original request follows for the record:
- ~~**[issues.md #15](../development/issues.md) — the `?? 0` traffic collapse.**~~ An agency with nothing monitored reports **"Pageviews 0 · Aqua Tag"** in the Command Centre's commercial funnel, as measured fact. Runtime-verified (`scripts/verify-marketing-runtime.ts`), not source-guessed. **Ed authorised the marketing worker to fix it (2026-08-20); the full plan + verified 4-file blast radius is in issues #15.** It touches `lib/server/commandIntelligence.ts` + `lib/commercialIntelligence.ts` + the two intelligence workspaces — the **KPI worker's lane**, hence this flag. The marketing surface already defends itself; this closes the trap for every other consumer.

## Decisions Ed owes (per plans)
- Advisor omega — the vision (like the battle table / marketing).
- Battle table — battlefield layout, must-see pulse metrics.
- Operations — sidebar name (Operations/System/Governance); GDPR-first vs HIPAA near-term.
- Marketing — consolidate the 12 views? ; KPI fixed-set vs explorer.
- Staff — owner-as-staff, chat depth, freelancers depth, training-builder choice. (Ocean Boulevard deep-dive **done** — patterns folded into the plan.)

## How to update this file
When you assign/complete/block something: edit the table(s) above. Keep it terse.
This file + [development.md](../development.md) should let a fresh commander pick
up with zero chat history.
<!-- AQUACRM_SOURCE_END path="docs/context/state.md" -->

---

<a id="source-docs-context-worker-brief-md"></a>

## Source document — `docs/context/worker-brief.md`

<!-- AQUACRM_SOURCE_START path="docs/context/worker-brief.md" sha256="995e16442d23ea03f323b68e7e50a2f3c2946e0126064d8db37394fed9efced0" -->
# Worker brief — spin a development worker

← [context/](README.md)

The commander fills this in per assignment; Ed pastes it into a fresh Claude chat
to spin a worker on one plan. `<PLAN>` = the plan file (e.g.
`docs/development/plans/enquiry-detail-card.md`).

## The paste-ready template
```
You're a development worker on AquaCRM (Next.js 16 / React 19 / TypeScript),
working dir: aquaCRM/portal/

ORIENT (read in this order):
1. docs/development.md — the project law (map, discipline, workflow).
2. <PLAN> — YOUR plan. This is your whole job. Build its phases, simple-first.
3. docs/context/worker-brief.md (this file's "Conventions" below) — how workers behave.
4. docs/context/state.md — confirm your assignment + the files you own (don't touch files another
   worker owns). Trust its "Verified ground truth" table; treat its "🗄 HISTORICAL" sections as
   dated belief, not fact — re-read the source before acting on any 🔴 you find there.
5. docs/development/checklist.md — the most reliable current summary of where the project stands.

YOUR JOB: execute <PLAN>'s phases in order, simple-first. Don't re-design the plan;
if it needs a decision Ed hasn't made (the plan flags them), surface it — don't guess.

HARD RULES:
- Reuse before building — the plan names what already exists to reuse. Check
  docs/reference/ (eight consolidated source/symbol volumes) before adding anything new.
- Run the FULL suite before calling a phase done:
  PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts
  Extend the nearest test with your new BEHAVIOUR (not just a source-shape assertion).
- A passing test ≠ working — BROWSER-VERIFY YOUR OWN UI. **You now get a FULLY ISOLATED sandbox, so
  self-verifying can no longer clobber anyone** (fixed 2026-08-19 — this is why older docs told you not to):
  1. **Fork your own sandbox** (once, at the start):
     `npm run sandbox:fork -- <your-worker-name> <port>`   e.g. `npm run sandbox:fork -- alpha 3041`
     It copies the shared state to `.data/portal-state.<name>.json` (so you get REAL seeded data, not an
     empty tenant) and prints your exact run command. It never writes the shared sandbox.
  2. **Run YOUR server** with the printed command:
     `PORTAL_DATA_FILE=.data/portal-state.<name>.json NEXT_DIST_DIR=.next-<name> npm run dev:worker -- -p <port>`
     Own state file · own build dir · own port → cannot collide with the Commander or another worker.
     (Pick a port no one else is using: 3041, 3042, 3043… ask the Commander if unsure.)
  3. **Sign in with NO login** — go to `http://localhost:<port>/dev`: it mints an owner session instantly.
     Append `?client=<slug>` for a client view, or use the **Dev Console** (`/portal/dev-team`)
     → **Tools → Inspector** (`/portal/dev-team/tools?view=inspector`) to become owner / staff /
     customer / freelancer. (Corrected 2026-08-20: "Profiles" was RENAMED to **Inspector** — it
     collided with client/customer/user profiles — and it now lives as a `?view=` of Tools, not as
     its own sidebar item. `/portal/dev-team/inspector` still redirects there.)
     ⚠ Entering the Dev Console is plain navigation and does NOT change who you are. Identity
     changes ONLY via Inspector, and exiting an inspection restores the exact person who started it.
  4. **Drive it** — read_page / computer (click+type) / screenshot to actually exercise your change;
     read_console_messages + preview_logs for errors. Screenshot the working result as proof and record the
     honest level in docs/development/status.md.
  - **Browser-tool gotchas** (save yourself the confusion): your session's browser tools only reach a server
    **you** started — you cannot drive another chat's. If `read_page` returns an empty tree / `Viewport: 0x0`,
    the tab is wedged: open a fresh one (`tabs_create` → `navigate`) instead of fighting it. Click via `ref_N`
    from `read_page`, not raw coordinates (screenshots are scaled). During a heavy recompile you may see
    transient `ERR_CONNECTION_REFUSED` / incomplete-chunk errors — settle, then retry before believing them.
  - **When you finish:** stop your server and delete `.data/portal-state.<name>.json` + `.next-<name>`.
    Next may append two `.next-<name>/types` lines to `tsconfig.json` — harmless; revert them if you like.
- Live Supabase is NOT sandboxed — the admin client hits real data even in dev. Don't write junk.
- Do NOT touch files another worker owns (see state.md). Don't edit shared foundations
  without flagging it to the commander.
- ⛔ **NEVER TOUCH GIT.** Not `commit`, not `push`, not `checkout`, not `restore`. A push triggers
  Vercel → **production**. And the whole tree is uncommitted, so `git checkout <file>` deletes other
  workers' unshipped work — this has actually happened. Rollback = copy the file to the scratchpad
  first, restore with `cp`.

AFTER EACH SHIPPED PHASE (this is the report — nothing lives only in chat):
- Update the relevant chapter in docs/workspace/ if behaviour changed.
- Regenerate the reference if code changed: node scripts/generate-symbol-reference.mjs
  (+ the radar-rules one if you touched the catalogue).
- Tick the item in docs/development/todo.md; add a dated entry at the TOP of
  docs/development/updates.md (stable anchor, don't rewrite others' entries).
- Say: what shipped, tests (pass/fail count), docs updated, what's next / any blocker.

Confirm you've read <PLAN> and outline Phase 1 before writing code.
```

## Check in so Ed can see you (30 seconds, do it)
Ed watches a **live board** at `/portal/dev-team/roadmap?view=now` (corrected 2026-08-20 — the old
`/portal/dev-team/working` route is now a redirect stub to it). Make yourself visible:

```
npm run worker:checkin -- <your-name> "<what you're doing>" --plan <plan-slug> --phase "<phase>"
```

Run it **when you start, after each shipped phase, and when you finish or block** (e.g.
`npm run worker:checkin -- alpha "P2 shipped, suite green — starting P3" --plan enquiry-detail-card --phase P3`).
It writes `.data/workers/<name>.json` (local only) and shows on Ed's board within ~10s.

The board also shows **raw file activity**, so you're visible either way — but a check-in is what turns
"something changed in `src/app/portal`" into "alpha is on phase 2 of the enquiry card, suite green."

## Conventions (the worker contract)
- **One plan, staged.** Build your plan's phases in order; ship + verify each before the next.
- **Own your files.** state.md lists the files/areas you own. Stay in them. Need a shared file? Flag the commander.
- **Docs are part of "done."** A phase isn't done until the tests pass *and* the docs reflect it (chapter, reference, todo tick, updates.md entry). This is how the next chat knows what happened.
- **Honest status — and self-verify now.** Green tests prove shape, not that it works. You can now browser-verify your OWN UI: **`npm run sandbox:fork -- <name> <port>`** (NOT bare `dev:verify` — that shares the sandbox state file with everyone else) → open `<your-server>/dev` (signs you in with **no credentials**) → drive the browser tools → screenshot the proof. Do that before calling a UI phase done — don't just defer it to the Commander. Record the real level in status.md; only say "not browser-verified" if the server was genuinely unreachable/too busy.
- **Surface, don't guess.** A decision the plan flags for Ed → surface it to the commander/Ed, don't invent an answer.
- **Never touch git.** Ever. See the hard rule above — this is not "ask Ed first", it is "don't".

## What the commander fills in per assignment
- `<PLAN>` path.
- Any files/areas this worker **owns** (and any it must **avoid** because another worker owns them).
- Any specific phase to start on (if not Phase 1) or scope limit.
- Any decision already made since the plan was written.
<!-- AQUACRM_SOURCE_END path="docs/context/worker-brief.md" -->

---
