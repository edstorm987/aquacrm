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
> unbuilt is phases 8, 9, 17 and 18 — the navigator, surface modes, the browser walk and
> the client-portal mount. The list below is kept for the parts still true.

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
