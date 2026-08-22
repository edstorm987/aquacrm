# Plan — Finish the Dev Editor (Ed's 2026-08-21 pass)

← [development.md](../../development.md) · map: [aqua dev.md](../../../aqua%20dev.md) · engine plan: [dev-editor-engine.md](dev-editor-engine.md) · inspector: [dev-editor-inspector.md](dev-editor-inspector.md)

**Status: in progress — refreshed against the tree on 2026-08-22. Fourteen of the
eighteen phases are source-complete; phase 8 is partial (project family done,
navigator missing), phase 9 is open, phase 17's complete browser acceptance walk is
open, and phase 18 is open.** The architecture is right (one universal editor,
shared strict tag protocol). The Aqua Tag itself has been browser-walked on a real
client site, but the full edit → persist → publish lifecycle has not. Phase 18 is the
point of the whole exercise: clients editing their own websites.

---

## Why now

Ed spent an evening in the editor and found the same disease repeatedly: **the
thing was already built and never mounted**. Five separate times in one session —
the studio itself, the element explorer in the Aqua Tag, the 78 block components,
the 26 device presets, and `devProjectVisualEditorUnlocked()` (a function whose
own comment states Ed's rule, with zero callers).

So the default assumption for every item below is **check whether it exists before
building it**. It usually does.

The second theme is Ed's rule, stated four different ways in one session and now
recorded in memory as *everything editor-wise lives in the editor*:

> "connect github in company is wrong you should be connecting github in the
> editor please keep it in the editor for everything editorwise please"

Sending someone out of the editor to configure the editor is the failure mode.

## The end state (what "done" means)

Ed, 2026-08-21: *"hopefully we should have a full editor for anything i could want —
i can go code, i can use an ai for edits, i can use a visual builder like
squarespace... and i can finally just add it into a client portal, the editor, so
clients can start editing their own websites."*

That is the acceptance test for this plan. Not "the phases are ticked" — **a client
who is not Ed opens their own portal and safely edits their own website.** Every
phase below either moves toward that or is not worth doing.


## Where we are today (verified against the tree, 2026-08-21)

- **The editor is one component**, `src/engines/editor/DevEditor.tsx`, mounted by two
  doors. The portal studio is gone as a separate thing.
- **The Aqua Tag protocol is shared and strict** — `aquaTagBridge.ts`, exact-origin
  comparison, parser validates rather than casts, drift guard mutation-tested.
- **The tag empty state is correct** and says Ed's rule back to the user: no tag →
  no browser → Dev works anyway.
- ~~**Settings inside the editor is the whole Projects screen.**~~ **FIXED
  2026-08-22:** the editor now mounts `<DevEditorProjectSettings projectId=…/>` —
  a project-scoped, editor-native panel (repo/ref/connections, GitHub connect,
  Aqua Tag snippet+check, Map, AI-key pointer; no creation, no other projects,
  no "Open editor", no `--dt-*`). The Projects workspace keeps the full
  `DevEditorSetup` screen; shared panels take a `skin` instead of forking.
  Pinned by `smoke-dev-editor-walkthrough.test.ts`.
- ~~**The project switcher had `w-full`** and rendered *after* the mode switch, so
  it ate the header.~~ **FIXED 2026-08-22:** compact (`w-40`, `min-h-9`), leads
  the bar, and now renders the door-anchored family through
  `devProjectDoorFamily`: top-level door + direct children, or one child only
  when the door itself is a child. "This workspace" remains recoverable and
  unrelated agency projects stay behind "All projects". A switch also clears
  project-bound source/tag/AI context.
- **Mode clicks white-flashed the browser for seconds** (walkthrough 2026-08-22).
  **FIXED + measured:** the iframe never remounted — driving the real `DevEditor`
  in a browser showed one load event and one element identity across every mode
  click. The flash was the mode CUTSCENE: a full-screen wash + `backdrop-blur-md`
  card over the cross-origin iframe forces Chromium to re-raster the
  out-of-process frame (white while it does). The cutscene is now a compact
  opaque toast under the top bar — no wash, no backdrop-filter, page untouched.
- **The browser is a slave to its pane** — `maxWidth: "100%"` means a device preset
  is "as much of 393px as the pane allows", not 393px.
- **The 78 blocks never register** in the editor bundle; `PORTAL_ONLY_TABS` then
  hides the Builder tab on a software project, hiding the evidence.
- **Word edits are preview-only.** They rewrite the loaded page through the tag and
  vanish on reload. `patch.ts` → `publish.ts` has no caller.
- **Dev-mode publish does not commit to git**, despite Ed's "it just goes to git".
- **The editor AI is a reskin of the agency Advisor** — confirmed visually: the
  business radar ("12 need attention", client retention) renders inside the code
  editor.

## Phasing

1. ✅ **Nest projects, and rebuild Editor Settings as an editor-native panel.**
   *(SHIPPED in two passes. 2026-08-22 morning: the Settings split —
   `DevEditorProjectSettings` in `_DevEditorSetup.tsx`, mounted by the editor
   with the project id, editor vocabulary; pinned by
   `smoke-dev-editor-walkthrough.test.ts`. 2026-08-22 evening: the NESTING —
   `parentProjectId` on `DevProject`, the two-level rule enforced BOTH WAYS in
   `saveDevProject` (a child can't be named as a parent, a project with
   children can't become a child, nothing contains itself — together those
   make a cycle inexpressible, proven in the tests), tenant checked first with
   a foreign parent id answering word-for-word like an invented one,
   `deleteDevProject`/`devProjectDeleteRefusal` refusing a parent delete and
   NAMING the children, the route refusing BEFORE its destructive AI cleanup,
   omission-carries semantics so a rename can never flatten a child, the
   workspace grouping children indented under their parent via
   `groupDevProjects` (`src/lib/shared/devProjectGrouping.ts`) with an
   "Inside" select + per-card "Add a project inside", and the editor panel's
   "Add a project inside this one" pre-parented to the open project. A child
   is a FULL project — own repo/tag/AI/history; delete cleans up identically.
   Pinned by `smoke-dev-project-nesting.test.ts`. **The remaining in-editor
   family switcher landed on 2026-08-22 as `devProjectDoorFamily`, including
   child-door non-escalation and missing-door fail-closed tests.**)*

   **The model (Ed, 2026-08-21):** a project can contain projects — "one project
   could be a website they might have a software going on with it too". From inside a
   project you *can* create another, but it is **a child of the project you are in**,
   never a new top-level one.

   **Exactly TWO levels — "project → inner projects and that's it" (Ed).** A flat
   parent/child pair, NOT a tree. An inner project can never itself be a parent.
   Enforce it in the store, not just the UI: reject a create whose intended parent
   already has a parent. Two levels means no recursion, no breadcrumbs, no cycle
   detection beyond that one rule, and a switcher that is always a flat list. Do not
   build for arbitrary depth "in case" — the constraint is the feature.

   Add `parentProjectId?: string` to `DevProject`. Guard it: tenant checked first
   (the order `devProjects.ts` already uses), the two-level rule, and a parent that
   still has children may not be deleted — refuse and name the children in the way
   rather than cascading a silent delete. `storage.ts` `empty()`/`parseBlob` must
   handle it.

   Then split the in-editor Settings tab away from the Projects screen: it configures
   **only the project you are in**, and anything it creates is parented to that
   project. Top-level projects are still made in the Projects workspace. Pass the
   panel the project id — today it receives nothing, which is the root of both the
   creation bug and the styling bug. Restyle in the editor's vocabulary
   (`border-white/10`, `text-white/58`, `bg-black/30`, `--mode-accent`); **no `--dt-*`
   tokens**. Unblocks 2, 3, 4 and 8.

2. ✅ **Aqua Tag, made and verified in the editor** *(shipped 2026-08-21; browser-walked on a real client site 2026-08-22)*. Generate the tag, show the snippet
   with a copy control, bind it to the project (`aquaTagId` — the field nothing
   currently writes), verify with Map. Reuse `ensureAgencyMasterSiteKey` /
   `masterTagSnippet` / `detectAquaTag` / `mapProject`; do not mint a key format or
   write a second detector. The site key comes from the session's agency, never the
   request body.

3. ✅ **Connect GitHub in the editor** *(shipped 2026-08-21/22 — inline GitHubConnectPanel in the projects screen AND the editor's project-scoped Settings; save + auth-check on the spot; one vault, no fork)*. Surface `saveIntegrationConnection` /
   `testIntegrationConnection` / `revokeIntegrationConnection` in Settings and bind
   the result to the project. **Do not fork a second connection store** — the editor
   and the Company panel write the same vault, or you get two GitHub connections that
   disagree. Tokens resolve server-side per request and never reach the client.

4. ✅ **Aqua Editor AI token, per project, in the editor** *(shipped 2026-08-22 with phase 12 — the Key panel in the editor's AI tab; value never rendered)*. The configuration surface
   for phase 12's credential. Shows only whether a key is set — never the value.

5. ✅ **Collapse four modes to three: "Just the words" merges into Visual**
   *(shipped 2026-08-22 — `EDITING_MODES` is Just tell it / Visual builder /
   Dev; the `simple` routing destination is deleted (visual off a portal
   already routed to the element panel with the words editable — the styling
   now rides along); `editingMode()` migrates a saved `"simple"` to
   `"visual"` by name; the skin, cutscene copy and every four-mode test pin
   rewritten. NO capability model was added — see the decision below.)* Ed:
   *"id want to actually just combine it into visual mode as its the same you select
   element change type it add it in"*. He is right — it is one interaction at two
   depths. `EDITING_MODES` becomes **Just tell it / Visual builder / Dev**, and
   `selectionRouting.ts` loses the `simple` destination (text editing becomes part of
   the visual destination). Update the tests that pin four modes and the mode-skin
   map, and delete the `element`-vs-`builder` split where it only existed to serve
   `simple`.

   **No capability model. Ed decided this explicitly (2026-08-21).** I raised the
   concern that `simple` existed so *"nothing here can break the layout"*, and that
   phase 15 puts this in front of clients. Ed's answer: *"clients get the exact thing
   now that weve got — they can do vs code thing if they want, they can type it into
   ai, whatever they want, i dont care, its up to them, hence why i built it."*
   So do NOT build a text-only capability, a reduced visual mode, or a role-gated
   feature set. A client gets the whole editor. The boundary is the PROJECT they are
   connected to (phase 16), not the features they are shown.

6. ✅ **Mount the 78 blocks** *(shipped 2026-08-21 — 70 palette entries + 8 plugin renderers, lazy-split; element library seen live in the editor)*. `blockRegistry.ts` registers all 78 into the shared
   registry at `elements/registry.ts`; the editor never imports it, so its bundle's
   registry is empty. Drive the Add menu off `listElementDefinitions(surface)` rather
   than the portal-only list, and un-gate Builder/content from `portalTarget` while
   keeping genuinely portal-only machinery (portal pages, lifecycle stage, portal
   publish) gated — two different questions. Watch the bundle cost: a bare
   side-effect import pulls all 78 in; check `lazyBlock.tsx` first.

7. ✅ **A real component library that inserts real code** *(shipped 2026-08-22 —
   emit → place → preview → confirm → draft-branch commit; pinned by
   `scripts/smoke-element-insert.test.ts`; not browser-walked, like everything
   pre-16)*. Ed: *"the visual editor has
   like a component library like adding in a section or something will actually add
   the correct code it all gets put in right"*. Phase 6 makes the blocks *available*;
   this makes inserting one **write correct source** into the project rather than
   only mutating a preview. Browsable by category (the registry already carries
   `category` and `surface`), with the saved-components idea Ed asked for earlier
   living in the same `+`. Depends on 6 and on 13's write path.

   *As built:* a portal target keeps its document mutation untouched; a
   repository target now has the full write path. **EMIT** —
   `src/engines/editor/elements/emit.ts` renders a definition as plain
   structural JSX/HTML from what the registry declares (defaults + field
   types): text fields become `<h2>`/`<p>`, `ctaHref`+`ctaLabel` one anchor,
   images `<img>`, styling knobs/array defaults deliberately nothing, root
   marked `data-aqua-element="<type>"`. No imports, no identifiers — compiles
   in any page file; NOT a templating system. **PLACE** —
   `server/sourceInsert.ts` takes "after line N" or "end of file" and asks
   `sourceMatch.contextAt` at the anchor's end: `unknown` REFUSES (statement
   lines, blank lines in components, unclosed strings), a .tsx END refuses
   (`no-safe-end`), markdown/MDX pad with blank lines, HTML ends before
   `</body>`. **COMMIT** — `repoWrite.insertElementIntoRepo`: the preview call
   writes nothing and returns the exact `insertedLines` + the file's
   fingerprint; confirm carries the fingerprint back (the route 400s a confirm
   without one) and commits THROUGH `saveRepoFile` — same draft branch,
   branch-first read, stale-fingerprint refusal, branch lock. **UI** —
   `ElementInsertPanel` in the library's Selected-element section: file picker
   from `action:"insert-targets"` (branch-first), the selection's
   `sourceFocus` file:line as the suggested spot, diff-style preview, honest
   copy ("the site itself has not changed"). `elementLibrarySentence` rewritten
   — the "not wired yet" pin is gone, and the tag half is unchanged: the
   protocol still carries selections and text patches, not inserts.

   **Saved components: NOT built, deliberately.** Checked 2026-08-22 — no
   per-agency saved-components store exists (`website-editor`'s `sections.ts`
   is a localStorage page-section visibility toggle; `pageTemplates.ts` is
   full-page templates; neither is a component store), and building one means
   touching `types.ts`/`storage.ts`, which the nesting pass owns today. The
   "Saved" group in the `+` is the follow-up once a store exists.

8. **Three switcher bars in the header, and the navigator.** Ed: *"i suppose 2 of
   them in total projects selector and the navigation selector"*, then *"maybe its
   worth having a 3rd switcher to switch what it is"*. So:

   - ✅ **Project switcher** *(shipped 2026-08-22)* — scoped to the project you are
     in: this project and its children, nothing else. Moves **before** the mode
     switch, much smaller — drop `w-full`, fixed width, truncation, height matched
     to the mode buttons. *(As built: this project + "This workspace" when the door
     is not client-locked, plus an "All projects" link out; children join the list
     when phase 1's `parentProjectId` exists.)*

     **✅ FAMILY LIST SHIPPED 2026-08-22.** The list is anchored to the DOOR —
     the project the editor was
     opened on — not to whichever project is currently showing:
     `[doorProject, ...projects.filter(p => p.parentProjectId === doorProject.id)]`,
     flat by construction (the two-level rule is store-enforced, so one filter
     is exhaustive — no recursion). Standing in the parent that reads
     [this project, …its children]; switch into a child and the SAME list now
     reads [parent, this project, …siblings], because the door did not move.
     Why door-anchored is the right reading of Ed's "switch to the projects
     inside that workspace": the workspace is the one you were let INTO —
     phase 17 has Ed "connect a project and add it in", and the client "gets
     everything inside that project and can never reach another", so the
     connected (door) project defines the family. Anchoring to the CURRENT
     project instead would either strand you one click deep (enter a child →
     the parent vanishes from the list — the get-stuck defect again) or, read
     as "current + its family", let a client connected to a child walk UP to
     the parent — the phase 17 breach. Door-anchored never widens as you move
     and never strands you; a door locked to a child offers exactly that
     child. Implementation: the options render from the projects the editor
     already fetched (children arrive in the same GET, and
     `DEV_PROJECTS_CHANGED_EVENT` already re-fetches, so a child created in
     Settings joins the list without a reload); selection keeps the existing
     `setBrowserUrl(aquaTagBrowserUrl(project))` repoint; "This workspace"
     (when `!lockToClient`) and the "All projects" link stay exactly as they
     are. Then rewrite the walkthrough pin "lists THIS project and the
     workspace — never the whole agency" to expect the family and still ban
     `projects.map(` over the whole agency. That implementation and the
     rewritten walkthrough pin are now in the tree.
   - **Navigator** — the missing one. *"if i put in a website id get stuck"*: today
     the browser loads one address and there is no way to reach the site's other
     pages. List the project's pages/routes and jump between them. Source it from
     what is actually known — a portal's pages, a repo's routes, or the tag
     reporting the links it can see on the page — and say which. Not a URL bar:
     a list you can pick from.
   - **Surface switcher** — "what this is", which **adapts the editor** (phase 9).

   ✅ Also add the `+` to the right-hand inspector rail
   (`<nav aria-label="Inspector tools">`) as well as the canvas header.
   *(shipped 2026-08-22 — same `AddMenu`, same options, `align="end"` so the
   panel opens into the canvas.)*

9. **Surface modes: Website vs Normal.** Ed: *"website mode im going to need a
   specialied thing to do the seo and tags and everything like that per page... dont
   need a portal mode and then normal mode can do portal and software or whatever as
   its just universal"*. Two surfaces only:

   - **Website** — adds the per-page specialist work: SEO title/description, social
     /OG tags, canonical, robots, structured data, per page.
   - **Normal** — the universal one. Portals, software, anything else.

   This is **orthogonal to the editing modes** (phase 5): surface = *what you are
   working on*, mode = *how deep you want to go*. Do not conflate them, and do not
   resurrect `projectKind` — that was deleted for good reason. Derive the default
   from what is connected (a tag + a site → website) and let the switcher override.

10. ✅ **Real device sizing for the browser** *(shipped 2026-08-22 — pinned by
    `scripts/smoke-editor-device-sizing.test.ts`; not yet browser-walked, like
    everything else pre-phase-16)*. Mount the existing `DevicePreview`
    toolbar and `effectiveViewport()` (26 presets — 10 phones, 6 tablets, 4 laptops,
    5 desktops, plus custom W×H, rotate, zoom, bezel, localStorage) in place of the
    lesser `BreakpointControl`. Drop `maxWidth: "100%"` so an exact dimension is
    exact, and let the pane scroll or zoom when the device is larger than it. **Then
    build the drag handles** — `devicePresets.ts` claims Responsive mode "lets the
    operator drag the canvas edges to any size" and no consumer implements it; that
    comment describes an intention, not code.

    *As built:* `src/components/editing/DeviceControl.tsx` replaces
    `BreakpointControl` (deleted) — the maths (`effectiveViewport`, presets,
    persistence) imported from the module's `devicePresets.ts`, the CHROME
    editor-native rather than mounting `DevicePreview` itself, which wears the
    module's skin and spans that module's canvas. The iframe lays out at true
    device pixels inside a zoom transform (layout = what the page sees; the
    transform = what the operator sees); a too-big device SCROLLS at 1:1 —
    auto-zoom would misstate legibility, so zoom stays the operator's explicit
    toolbar choice. The Responsive BOX has right/bottom/corner drag handles:
    pointer-captured, iframe pointer-events dropped mid-drag, clamped 240–4000
    × 320–4000 via one `clampDeviceSize`, live W×H readout, keyboard nudges;
    the dragged size becomes the custom dimensions, so `devicePresets.ts`'s
    comment now names its consumer. Device choice persists per project
    (`lk_editor_device_v1:<projectId>`, `:portal` on the portals door), with
    the save gated on the loaded scope so Strict Mode/project switches cannot
    overwrite a stored device. The iframe key stays `${frameKey}:${url}` —
    resize never remounts, so the tag bridge survives it. Bezel drawing
    (`showChrome`) deliberately not surfaced: decorative, and the editor's
    frame draws no device chrome.

11. ✅ **Fix the redirect-origin bug and the portal-door false alarm** *(shipped 2026-08-21; confirmed by a jsdom mount pressing the real Check-it button)*. In flight at the
    time of writing. A site that redirects (apex → www) silently kills the whole tag
    bridge because the editor trusts the pre-redirect origin while MAP verified the
    post-redirect one. Trust the mapped `finalUrl`. Do **not** widen the origin
    policy to achieve it.

12. ✅ **Aqua Editor AI as its own assistant** *(shipped 2026-08-22 — own vault provider, per-project config+history, own UI, AND the reply path on the project's own key; double-CONFIRMED, no fallback exists in the code path at all)*. Its own token, its own per-project
    configuration, chat history scoped to one project and nothing else, and its own
    UI rather than a reskin of `AssistantWorkspace`. Confirmed visually on
    2026-08-21: the agency business radar (client retention, "12 need attention")
    renders inside the code editor. This deliberately reverses the "one brain, three
    skins" decision recorded in `editorAssistant.ts` — update that comment and
    rewrite the tests pinning the old reuse contract. History needs a cap and an
    eviction rule: `PortalState` is one JSON document and every write rewrites it.

    *2026-08-22 hardening:* the `DevEditor` mount now passes the currently
    selected project instead of the original door project's id. Config, history,
    attachments and captured element context clear/reload on a switch. Replies
    name the exact saved user message with `replyToMessageId`; sequential replay
    returns the stored answer, same-process concurrent replay shares one provider
    call, and a reply that becomes stale behind a newer user message is discarded.
    **Still open for production:** an atomic distributed claim/unique append
    across parallel server instances.

13. ✅ **Make word edits persist, and publish to git** *(shipped 2026-08-22, triple-CONFIRMED — words commit via source-edit with the branch-tip lost-update guard; code files save/create through repo-write onto the draft branch; Publish opens/reuses the PR; the tree reads draft-first so your own edits are what you see)*. Today an edit changes the page
    on screen and loses it on reload — half the feature. Wire `patch.ts` →
    `publish.ts` so an edit reaches the project's source, and make publish commit
    through the project's GitHub connection. Until it does, the UI must say plainly
    what it does and does not save. **A preview-only edit that presents itself as
    saved is the worst available outcome.**

14. ✅ **The work lifecycle on the right side: drafts, version control, notes, logs**
    *(shipped 2026-08-22 — three Dev-mode inspector tabs, pinned by
    `scripts/smoke-work-lifecycle.test.ts`; not browser-walked, like everything
    pre-16)*.
    Ed: *"in the right side we also need notes and drafts version control logs for the
    project in dev mode — they are all built just need throwing in"* and *"saving
    changes publishing drafts need some ui to do that please"*. He is right that the
    parts exist — verified 2026-08-21:

    - **Version control**: `publish.ts` already commits to a branch (never the
      default) and has `openPullRequest()`; `sourceEdit.ts` has `editBranchName()`
      per project; the `source-edit` route wires find → human-confirm → commit.
      **Drafts ARE branches** — Ed: *"saved drafts creates a branch or draft pr or
      something so it can be resumed"*. So a draft is the project's edit branch, a
      resume is reopening it, and publish is opening/merging the PR. Do not invent a
      second draft store; the repository is the draft store.
    - **Git status UI**: `GitStatusPage.tsx` + `gitOps.ts` in the website-editor
      module (stage/unstage/commit/push/open-PR) — built, unmounted here. Reuse the
      shape; route through the project's GitHub connection.
    - **Notes**: `devTeamThoughts.ts` (`addThought`/`listThoughts`) — scope to the
      project.
    - **Logs**: the `editor-activity` route already reads worker check-ins; a
      project-scoped activity feed rides it.

    Build them as inspector tabs in **Dev mode**: Drafts (the branch: what changed,
    resume, publish → PR), History/Logs (commits on the edit branch + activity),
    Notes (per project). One SAVE/PUBLISH control surface, honest about state:
    unsaved → on the draft branch → PR open → merged. **Merge happens INSIDE the
    editor** (Ed, 2026-08-22: "no everything inside the editor thats the whole
    point of it") — the Drafts tab carries Merge with a confirm (`mergePullRequest`
    in publish.ts, dry-run unless confirmed), never a link out to GitHub, and a
    revert control for a merged draft completes the loop. Never say "saved" for
    something that is only in the page.

    *As built (2026-08-22):* three Dev-only tabs on the ladder + rail
    (`drafts`/`history`/`notes` in `editing/modes.ts`, offered on every
    developer target like the Librarian; a repo-less project is told IN the
    panel). READ side: `engines/editor/server/workLifecycle.ts` —
    `readDraftStatus` (none / commits / pr-open #N / merged / empty, ONE
    server-written sentence per state that never says "saved";
    **merged-vs-commits decided by WHEN**, since a squash-merged branch
    compares ahead forever) over two new `githubSource.ts` reads
    (`compareRepoRefs` incl. the fork point, `listBranchPullRequests`
    `state=all`), and `readWorkHistory` (draft commits + Dev Team check-ins,
    one newest-first feed, each source NAMED; the commits half degrades to a
    sentence with no repo/token). Door: `/api/portal/dev/lifecycle` (POST
    only, founder+DevMode, tenant-before-project). WRITE side is repo-write,
    extended not duplicated: `action:"merge"` → `mergeProjectPullRequest`
    (finds the OPEN PR itself, confirm passed through untouched, no-PR/
    GitHub-refusal 409s) and `action:"revert"` → `revertMergedDraft` — the
    fork-point contents recommitted onto the DRAFT branch via `saveRepoFile`
    (**the revert is itself a draft**; dry-run plan first, added files
    skipped WITH a note because the publish machinery cannot delete). UI:
    `WorkLifecyclePanel.tsx` (DraftsPanel with the page → branch → PR →
    merged ladder, `status.line` verbatim, per-file Open = resume via the
    editor's `onOpenFile` seam — also finally wired into the Librarian mount
    — Publish/Merge/Revert all in-panel, merge two-step, no GitHub link-out;
    HistoryPanel; NotesPanel). NOTES ride `devTeamThoughts` via a
    first-class `projectId` tag + `listThoughtsForProject` — excluded from
    `unreadFor`/`unacknowledgedCount`/`worker-thoughts.mjs`, so a project
    note is never delivered to a worker as an instruction. The website-editor
    module's `GitStatusPage`/`gitOps` were REVIEWED and their SHAPE reused
    (a status surface + explicit commit/PR controls), not their code: that
    pair is a client wrapper over a `GitOpsPort` HTTP proxy the foundation
    never wired (its own header says every call degrades to "not wired
    yet"), and its stage/unstage working-tree model presumes a local
    checkout — a GitHub-backed project has none. The lifecycle reads GitHub
    through the project token instead. Pinned by
    `scripts/smoke-work-lifecycle.test.ts` (41 tests, stateful-fake GitHub
    with real compare/pulls/merge endpoints).

15. ✅ **The Librarian: its own thing, inside Dev mode, and file-finding as a shared
    skill** *(shipped 2026-08-22 — findFiles() built once in lib/server/dev/fileFinding.ts, the Librarian rebriefed onto it (business context gone), and the panel mounted as a Dev-mode inspector tab; ranking hardened after adversarial verify)*.** Ed: *"the librarian also needs its own thing like what weve done for the
    aqua editor ui and the librarian needs to be inside dev mode in the editor as
    well its different from the editor since librarian is for files finding make it a
    skill they can all use as well"*.

    Today the Librarian (`LibrarianDrawerControl.tsx`) is a reskin of the agency
    Advisor in the Dev Team topbar, and its own header comment is honest about the
    gap: v1 reuses the *business* context, and the codebase/docs retrieval bridge —
    answering "where does X live / what can I reuse" from the repo — is a follow-up
    that was never built (`dev-team-librarian-and-assistants.md`). Ed is now calling
    that follow-up due, with a better architecture than the plan had:

    - **File-finding is a SKILL, built once.** A retrieval capability over the
      project's mapped tree (`DevProjectRepoMap` already records the walk) plus the
      docs library (`scanDocIndex` already indexes every doc). One module, callable
      by ANY assistant — the Librarian, the Aqua Editor AI, and whatever comes next.
      Do not build it inside the Librarian; the Librarian is a *consumer*.

      **✅ BUILT 2026-08-22 — `src/lib/server/dev/fileFinding.ts`.** `findFiles()`
      searches the repo (full tree via the engine's own `readRepoTree` /
      `readWorkspaceFiles` when reachable, the recorded map's directories
      otherwise — never the network unless a token resolves), the docs library
      (`scanDevDocs`) and the generated `docs/reference` (symbol + path grep).
      Ranked + capped; every hit says WHY (`path`/`symbol`/`doc-title`/`content`)
      and `searched` says what was and was NOT looked at. Tenant → project guard
      in the `devProjects` order; `fileFindingBrief()` is the one plain-text
      render for prompts. Pinned by `scripts/smoke-file-finding-skill.test.ts`.

      **✅ CONSUMED 2026-08-22 — the Librarian rebuild (bullet two) and the
      panel (bullet three's surface) are BUILT; only the DevEditor mount line
      remains.** `LibrarianDrawerControl` briefs from the skill's own
      `fileFindingWorld()` — `buildAssistantBusinessContext`, the radar and the
      Advisor chat are GONE from it; the drawer keeps its UX through
      `GlobalAdvisorDrawer`'s new `body` seam. The surface both hosts share is
      `src/components/editing/LibrarianPanel.tsx` (+ `librarianClient.ts`) over
      the new founder+Dev-Mode `/api/portal/dev/librarian` (session agency,
      POST only): ranked hits with their WHY, the `searched` report, copy
      controls, and an `onOpenFile` seam for the editor's sourceFocus. The
      `librarian` tab is declared on the developer ladder in
      `editing/modes.ts` but held out of `INSPECTOR_TABS` — that insertion is
      one compile unit with `DevEditor.tsx`'s exhaustive TAB_META (excluded
      this pass), so the mount pass lands: INSPECTOR_TABS entry between
      "repository" and "versions" + TAB_META row (`BookOpenText`) +
      `<LibrarianPanel projectId=… onOpenFile=…/>` beside the repository
      branch, then flips the held-off assertions in
      `scripts/smoke-librarian.test.ts` and the tab-count pins. Pinned by
      `scripts/smoke-librarian.test.ts` + the Librarian block of
      `smoke-dev-team-shell.test.ts`.
    - **The Librarian gets the same standalone treatment as the editor AI**
      (phase 12's pattern): its own identity and scope rather than the Advisor's
      business context. Where phase 12 lands per-project config/history, follow its
      shapes rather than inventing parallel ones.
    - **Mounted inside Dev mode in the editor** — an inspector presence alongside
      phase 14's tabs, scoped to the current project's files. It is NOT the editor
      AI: the editor AI edits, the Librarian FINDS. Two assistants, one file-finding
      skill under both.

16. ✅ **Network throttling from the editor** *(source-complete 2026-08-22;
    `smoke-aqua-tag-throttle.test.ts` passes; browser acceptance remains phase 17).* Ed: *"have a wifi sign icon with a modal
    so i can simulate throttling"*. A wifi icon in the editor header opens a modal:
    Offline / Slow 3G / Fast 3G / 4G / custom latency+bandwidth, applied to the
    previewed page THROUGH THE TAG — a new `throttle` message wraps the page's
    fetch/XHR with real delay, pacing and offline rejection. HONESTY LIMIT, stated
    in the modal: a parent page cannot throttle a cross-origin iframe's document/
    image loads (only DevTools can); this throttles what the page's SCRIPTS request.
    Implemented through `NetworkThrottleControl`, `aquaTagThrottle`, the tag's
    fetch/XHR wrappers and the protocol drift guards. The UI states the browser
    limitation rather than pretending document/image loads are throttled.

17. **Verify it in a browser.** Nothing built on 2026-08-21 has ever run in one. The
    full round trip — ping, ready, click, exact text in the right menu, edit, persist,
    publish — is unproven. Drive it against a real tagged page and a real repository
    project. This turns "the logic is right" into "it works", and no phase above
    should be called done without it.

18. **Put the WHOLE editor in a client portal.** Ed's end state, and he was precise
    about it: *"the entry point is the whole dev editor — i just connect a project and
    add it in, they get the editor exactly what weve got now, but just ill configure
    it. clients get the exact thing now that weve got, they can do vs code thing if
    they want, they can type it into ai, whatever they want, i dont care, its up to
    them, hence why i built it."*

    So this is **not** a cut-down client editor. It is the same `DevEditor`, the same
    three modes, the same code surface, the same AI, the same visual builder. Do not
    fork a client variant and do not hide features by role — that is the "second
    editor" mistake this whole plan exists to undo.

    **The one thing that IS enforced is the boundary, and it is a security boundary,
    not a feature one.** Ed connects a project and adds the editor to that client's
    portal; the client gets everything *inside that project* and can never reach
    another. Tenant checked first, then project, on every read and every mutation —
    the order `devProjects.ts` already uses. A client must not be able to switch to a
    project that is not theirs (phase 8's switcher must respect this), must not reach
    another agency's repository or tag, and must not read another project's AI
    history (phase 12).

    **Do not start before 17.** Not for permissions — for correctness. Putting an
    editor that has never run in a browser in front of somebody who is not Ed is how
    a client discovers a bug on their own website.

Ship in order where it matters: **1 before 2–4 and 8** (they live inside it),
**6 before 7**, **13 before 7's insert path and before 14** (the lifecycle UI shows
the branch 13 writes), **12 before 15** (the Librarian follows the editor AI's
standalone shapes), **16 before 17** (never put an unverified editor in front of a
client). 5, 10 and 11 were independent and are all done.

## Open questions / decisions for Ed

- **The browser gate.** Ed's rule is "no Aqua Tag, no browser". Applied literally it
  deletes the portal builder's browser, because `/aqua-tag.js` is injected only by
  `src/app/(website)/layout.tsx` and never on `/client-preview/*` — the portal
  preview reports selections through the first-party block protocol instead. Current
  behaviour is `portalTarget || tagMapped`. **To get the literal rule, inject the tag
  into `/client-preview` and drop the `portalTarget ||`.** Ed's call.
- **Click-to-select is on by default** once the tag connects, and the tag's click
  handler calls `preventDefault()` — so links in the preview cannot be followed until
  you toggle selection off. Correct for editing, annoying for browsing. Keep, or
  default it off?
- **Element → source cannot work cross-origin.** `elementSource.ts` reads React
  fibers inside the previewed document; a browser will not expose those across
  origins. So Dev's "which file rendered this?" answers on a same-origin Aqua portal
  and never on a tagged client website. Accept the limit, or find another mechanism?

## Guard rails (these have already bitten once today)

- **A repository-backed project must never be written to this server's disk.** The
  backstop is in `src/app/api/portal/site-editor/files/route.ts`; it exists because
  the `+` button was creating files in AquaCRM's own working tree while telling the
  operator they had gone into the project. Do not weaken it, and always send
  `project` on a create.
- **Never widen the tag's origin policy.** Exact string comparison against exactly
  one origin. A redirecting site is fixed by trusting the *mapped* `finalUrl`, not by
  accepting a set of origins or matching by prefix.
- **Secrets stay in the encrypted integrations vault**, resolved server-side per
  request, never on the `DevProject` record — that record is returned to the browser
  by the projects GET.
- **Run the full suite**, never a subset: contract tests in unrelated files pin
  editor behaviour, and several pin editor *strings*.
- **Build the inputs; Ed fills in real credentials.** Never enter a real key.
