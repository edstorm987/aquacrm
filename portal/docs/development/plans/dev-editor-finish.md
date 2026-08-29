# Plan — Finish the Dev Editor (Ed's 2026-08-21 pass)

← [development.md](../../development.md) · map: [aqua dev.md](../../../aqua%20dev.md) · engine plan: [dev-editor-engine.md](dev-editor-engine.md) · inspector: [dev-editor-inspector.md](dev-editor-inspector.md)

**Status: in progress — implementation boundary refreshed against the tree on 2026-08-26.**
Sixteen original phases remain source-complete. Since the older checkpoint, the trusted
manifest-driven local preview supervisor/control, canonical human grant/request kernel,
stable workspace-element levels, exact-project Dev Workspace and direct Dev API gates have
also landed. Phase 17 now has mounted Start/Restart/Stop, responsive-pane and
`/aqua-tag.js`-200 proof; its authoring, publication and failure paths remain open. Phase 18
now has a reusable exact-project Dev Workspace and eligible portal links, but the complete
client-owner/client-staff placement and edit/reload matrix remains open. A second pass on
2026-08-22 closed eleven verifier-proven defects
across phases 8 and 9 — line endings, the card size, `.js` heads, the layout's
reachability, the tag-link origin policy, `public/*.html` routes, the unsaved-SEO
prompt, and `portalTarget`'s last read of `projectKind` — see
[updates.md](../updates.md). The architecture is right (one universal editor,
shared strict tag protocol). The Aqua Tag itself has been browser-walked on a real
client site, but the full edit → persist → publish lifecycle has not. Phase 18 is the
point of the whole exercise: clients editing their own websites. Two reliability
findings now sit inside the open acceptance work: the cross-instance Editor AI
claim/RPC/database contract is incomplete and not proven against a live
two-instance database
([issues #18](../issues.md)), and project-bound dirty/prefill handling has improved
while browser-hide/surface/lifecycle/refresh transitions and reported cross-
project prefill bleed remain open
([issues #19](../issues.md)).

Focused access, exact-project API and preview-lifecycle tests are not a substitute
for phase 17/18 browser acceptance. Representative restricted-role, responsive-pane
and process-lifecycle slices have passed, but this plan does not claim the complete
role/grant mutation, positive exact-client, two-project, accessibility or failure
matrix has passed.

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

## Launch direction update — 2026-08-26

The editor remains one `DevEditor`, but its primary preview/source path is now a
**repository-backed Dev Workspace** rather than production-page mutation. For each
explicitly authorised project AquaCRM connects or creates a repository, opens an
isolated branch/worktree, starts the project's declared local development command
under supervision, embeds that loopback preview, maps selections to source, records
human/visual/AI changes as a diff, runs checks, and publishes through commit and pull
request. GitHub stores code; AquaCRM owns the controlled workspace, preview lifecycle
and audit trail. Production remains unchanged until a separately authorised merge and
deploy.

An owned or explicitly authorised site without a repository can enter a migration
flow: capture observable frontend/assets/routes, inventory forms/auth/data/providers,
create a repository, reconstruct with AI assistance, and prove parity. “Exactly as it
is” cannot include private backend logic that a public page does not expose; those
parts must be named and reimplemented deliberately.

Aqua Tag is optional for a repository preview. It stays the consented
marketing/telemetry/tag-injection system and the remote-inspection bridge for sites
whose code is unavailable; it is not the repository source of truth.

The first configurable-access slice is now implemented for human users. Global labels
such as developer, staff, freelancer or customer remain personas/templates on migrated
paths. Effective authority is default-deny and intersects current live membership,
workspace/project/client scope, active live/Sandbox resource realm and explicit
capabilities. The implemented vocabulary separates workspace/project view and manage,
edit, AI, preview, local preview control/logs, PR/publish/deploy, access governance and
stable `element.<key>.view|use|manage` levels. The shared management UI is mounted in
Settings, People and Fulfilment. Staff/Fulfilment runtime projections and the broad
11-element exact-client route wave also consume it. AI/service principals and
expiring share links remain follow-up consumers of this evaluator; the human UI does
not implement them implicitly.

The final access closure removed the inert generic Development workspace choice:
Development capabilities remain available only on an exact project scope. Exact Staff
and Fulfilment scopes now expose only their own element family plus the base Workspace
family, prune stale selections on scope change and sanitise submission. The settled
relevant access/Dev/workspace/client/People/performance/Sandbox gate is **130/130** with
TypeScript/diff clean. A clean browser proved the exact sets, 390px layout/targets and
all 28 role-template groups, but no role/grant was submitted; the full persisted access
journey remains outside this Editor checkpoint.

The trusted local preview foundation is also implemented for an already-configured
repository: requests cannot supply the root, command, arguments, port, environment or
shell; the local/test-only supervisor binds loopback, bounds/redacts logs, caps processes,
locks the physical worktree and serialises start/restart ownership. The mounted browser
completed Start, Restart and Stop, responsive Preview/Code switching and HTTP 200 for
`/aqua-tag.js`. **Per-project isolated branch/worktree create-or-resume landed
2026-08-27** (opt-in through the trusted record's `isolatedWorktrees`), so an
uncommitted edit now survives stop/restart without touching the shared checkout.
This still does not complete clone-from-remote or declared dependency-install
automation, nor the full edit/check/PR/failure browser journey.


## Where we are today (refreshed against the tree, 2026-08-26)

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
- ~~**The browser was a slave to its pane.**~~ **FIXED in phase 10:** exact
  device pixels, zoom/scroll behaviour, responsive drag sizing and per-project
  persistence are source-tested; the visual browser walk remains phase 17.
- ~~**The 78 blocks never registered.**~~ **FIXED in phase 6:** the complete
  palette/renderer set is mounted through the shared registry and was seen live.
- ~~**Word edits were preview-only and publish did not reach git.**~~ **FIXED in
  phase 13:** source edits and code-file changes commit to the draft branch;
  publish opens/reuses the pull request. The complete edit→merge acceptance walk
  is still phase 17.
- ~~**The editor AI was a reskin of the agency Advisor.**~~ **FIXED in phase 12:**
  it has its own per-project key, config, history, UI and server reply path. A
  durable database claim path now exists; live two-instance proof remains issue #18.

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

   **Capability decision superseded on 2026-08-26.** Keep the original product rule:
   do not fork a text-only/client editor and never gate the component from a global
   job title. The same `DevEditor` mounts everywhere. However, the mounted project and
   workspace grant now decides which actions are available. One person may receive
   visual editing and preview while another may also edit source, apply AI changes,
   run tests, create commits/PRs or publish. No global role grants the whole editor,
   every repository, the wider CRM or all Dev Team surfaces.

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

8. ✅ **Three switcher bars in the header, and the navigator.** *(ALL THREE shipped
   2026-08-22 — the project switcher, the navigator, and the surface switcher, which
   shipped alongside phase 9 and is ticked in its own bullet below. This parenthetical
   used to say the surface switcher was "still to build", contradicting both the status
   block at the top of this plan and the ✅ on that bullet twenty lines down; corrected
   2026-08-22.)* Ed: *"i suppose 2 of
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
   - ✅ **Navigator** *(shipped 2026-08-22)* — *"if i put in a website id get
     stuck"*: the browser loaded one address and there was no way to reach the
     site's other pages, because the header's only page control was a
     portal-only `aria-label="Portal page"` select. **That select is gone.**
     One `PageNavigator` now serves every target, in the same place, grouped BY
     SOURCE and always saying which source answered — the rule the whole thing
     is built around, because a page list with no provenance is worse than no
     page list.

     *As built:* `engines/editor/editing/pageNavigator.ts` is pure and does the
     thinking. `repositoryRoutes(paths)` derives routes from paths alone — App
     Router (`app/…/page.tsx`; route groups dropped, `_private`, `@slot` and
     `(.)intercept` refused because none of them has a URL), Pages Router
     (`index` dropped, `api` and `_app`/`_document` refused) and plain `.html`
     at the root or under `public/`. Both router patterns are ANCHORED at the
     repository root — a folder merely named `pages` deeper in a tree is not a
     router, and unanchored this repo's own
     `built-ins/modules/agency-finance/src/pages/ActivityPage.tsx` read as the
     route `/ActivityPage` (181 rows, a third of them 404s the navigator had
     promised were pages). A route it MISSES is a gap the sentence admits to; a
     route it INVENTS is a lie. A dynamic route is LISTED and NOT openable
     — `/blog/[slug]` exists and you should see that it exists, but opening it
     without a real value is a 404 with the editor's name on it.
     `navigatorPlan()` groups the three sources, counts them and writes the one
     sentence under the control, including every way of failing to answer: a
     truncated GitHub tree, routes needing a value, a repository that could not
     be read, a tag build too old to reply, and "nothing here can list this
     project's pages yet". `navigatorHref()` joins a route onto the address the
     browser is on and drops its query and hash — `?ref=email` belonged to the
     previous page. Picking a portal page changes `section`/`customPageId`;
     picking anything else sets `browserUrl`, which changes `previewSrc`, which
     remounts the frame, whose `onLoad` pings — so **the tag re-handshakes by
     itself** and nothing races the load.

     **The repo half checked first, and reused.** No new endpoint: repo-write
     `action: "insert-targets"` already answers "this repository's files,
     branch-first" with the tenant-then-project lookup and the per-request
     vault token. One honest consequence, **stated precisely after a verifier
     found the loose version half wrong (2026-08-22)**: that list is filtered by
     `isMappableFile` (`.tsx/.jsx/.html/.md/.mdx`), so a page written as plain
     `page.js` never reaches the navigator. The DERIVATION does handle it —
     `repositoryRoutes(["app/page.js"])` really does answer `/` — but until
     2026-08-22 `seoMechanismFor` accepted only `.tsx`/`.jsx`, so had the filter
     ever let one through, the navigator would have offered a route the SEO
     panel then refused BY NAME. Both rules now take the same extension list
     (`tsx|jsx|js|mjs`, `.mdx` deliberately excluded, because an MDX page's head
     is built by whatever renders it) and `smoke-editor-surface-modes`
     cross-pins them in BOTH directions.

     **The tag half needed a protocol message, and the explorer did NOT already
     report links** — it only ever COUNTED them (`counts.links`), and a number
     is not something you can pick from. So `aqua-explorer:links` /
     `aqua-explorer:links-found {requestId, links:[{href,label}]}` was added,
     same-origin filtered IN THE TAG (the editor trusts exactly one origin),
     hash/query stripped, deduplicated, capped at 60. The drift guard was
     extended in BOTH directions — the reply envelope and one link literal — and
     five new single-side mutations added: it now detects **27/27**, up from
     22/22.
   - ✅ **Surface switcher** *(shipped 2026-08-22 with phase 9)* — "what this is",
     which **adapts the editor**. `components/editing/SurfaceSwitch.tsx`, in the
     header's second row beside the navigator (NOT the top bar, which is `xl:`
     and up — a switcher that decides whether the SEO panel is reachable cannot
     be one that disappears at 1279px). Two buttons rather than a select,
     because with exactly two options a select hides one of them behind a click
     and this choice changes what the editor OFFERS.

   ✅ Also add the `+` to the right-hand inspector rail
   (`<nav aria-label="Inspector tools">`) as well as the canvas header.
   *(shipped 2026-08-22 — same `AddMenu`, same options, `align="end"` so the
   panel opens into the canvas.)*

9. ✅ **Surface modes: Website vs Normal** *(shipped 2026-08-22; never browser-walked,
   like everything after phase 16)*. Ed: *"website mode im going to need a
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

   *As built:*

   - **`engines/editor/editing/surfaces.ts`** is pure and holds the two surfaces,
     a tolerant resolver that migrates BY NAME (`site`→website, `portal`/`software`
     →normal, the same rule `editingMode` learned from "simple"), and
     `derivedSurface()`. **ONE rule promotes to Website and it is Ed's — tag +
     site**: an Aqua Tag answering AND an `http(s)` address. Every other
     combination is Normal *with a sentence naming the missing half*, so a
     derivation that misses costs one click on a switcher that is right there,
     while a derivation that INVENTS puts an SEO panel over somebody's game. It
     never reads `projectKind`, and a test asserts the function cannot even
     mention it. `resolveSurface()` lets the operator's choice always win —
     including when it disagrees, in which case the line says BOTH halves — and
     the choice persists per project (`lk_editor_surface_v1:<projectId>`) with
     the device's scope-ready guard. **Only an explicit choice is ever written**:
     storing the derivation would turn a guess into a choice, and a project that
     later got a tag would stay Normal for ever.
   - **ORTHOGONALITY IS ENFORCED, not just intended.** `"seo"` is in
     `INSPECTOR_TABS` and on **no mode's ladder**; `inspectorTabsFor` gates it
     with one rule (`surface === "website"`) that returns *before* the ladder is
     consulted, so it is offered at every depth. There is no shallower or deeper
     way to give a page a title, and telling somebody in "Just tell it" to
     change mode to find a meta description would be the depth axis answering a
     question that was never about depth. `tabForMode` keeps a surface-owned tab
     across a depth change; `tabForSurface` is its mirror for the other axis. A
     test walks all 3 modes × 2 targets × 2 tags × 2 surfaces and asserts that
     stripping `seo` gives back *exactly* the pre-phase-9 answer — a new axis
     must not quietly move an old rule.
   - **WHERE THE VALUES LIVE.** A repository page keeps them IN SOURCE and they
     ride the SAME path as every other write: `seo-read` / `seo-write` on
     `/api/portal/dev/repo-write` → preview (no `confirm`, writes nothing) →
     confirm with the preview's fingerprint → `saveRepoFile` → the draft branch
     → the pull request. **No SEO store, no second write mechanism, no new
     endpoint.** A portal page keeps them in the portal document (`seo?` on
     `ClientPortalPagePresentation` and `ClientPortalCustomPage`, **optional and
     omitted when empty** so an untouched document normalises to the JSON it
     always did) and rides the existing Save draft → Publish.
   - **`engines/editor/editing/pageSeo.ts`** is the pure planner, and it lives by
     one rule: **own a marked block, refuse everything else.** Two mechanisms —
     meta tags in an `.html` `<head>` (inserted after the charset, because the
     encoding has to stay in the first 1024 bytes), and a plain-JSON
     `export const metadata` in an App Router `page.tsx`/`layout.tsx` (JSON is a
     subset of a TS object literal, so the read-back is `JSON.parse` rather than
     parsing TypeScript). Both patterns are **anchored at the repository root**,
     cross-pinned against the navigator's, because unanchored is how
     `built-ins/.../src/pages/ActivityPage.tsx` became a route. A page that
     already writes its own head — a hand-written `<title>`, a duplicate
     description, `generateMetadata`, an existing `metadata` export, or a
     `"use client"` directive Next would refuse a metadata export from — is
     **refused by name with the reason**, never rewritten. A Pages Router page,
     Markdown, and a file with no `<head>` each get their own sentence. Clearing
     every field REMOVES the block rather than leaving one that says nothing.
     `read(emit(x)) === x` is pinned both ways, and so is "every byte outside
     the two markers is unchanged".
   - **Honest limits, stated rather than discovered.** Next's metadata export
     has nowhere to put JSON-LD, so `structuredData` is disabled on that
     mechanism *with the reason in the field's own hint* rather than silently
     dropped. And an Aqua-hosted portal is behind a login: the panel says in as
     many words that nothing public renders those tags today, they are simply
     stored on the page and published with it.

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
    **Still open for production (reconfirmed 2026-08-24):** an atomic distributed
    claim/unique append across parallel server instances. The focused **56/56**
    result proves local replay/same-process behaviour, not the generic Postgres
    function contract or a forced-fresh post-provider state read.

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

17. 🟡 **Preview lifecycle browser-proven; isolated worktrees landed 2026-08-27;
    finish managed authoring/failure acceptance.**
    The trusted supervisor/control, exact-project route and direct project/element
    gates are implemented and focused-tested. A real mounted repository preview now
    proves Start, Restart with a replacement loopback process, Stop, responsive Preview/
    Code panes and `/aqua-tag.js` HTTP 200.

    **✅ The lifecycle head — isolated branch/worktree — is now implemented**
    (`src/lib/server/dev/localRepositoryPreviewWorktree.ts`). A trusted record
    that sets `isolatedWorktrees: true` makes the supervisor create — or resume —
    a git worktree per project on the SAME draft branch the repo-write publish
    path uses (`aqua-editor/<projectId>`), under
    `<trusted worktree>/.aqua-preview-worktrees/<projectId>` so nothing is ever
    written outside the configured safe roots. The preview command then runs
    there instead of the shared checkout, which is what makes an uncommitted
    visual/source/AI edit survive stop/restart. The request still supplies no
    path, branch or git argument; git is spawned directly (no shell) with a
    minimal environment and `GIT_TERMINAL_PROMPT=0`. **Resume never destroys:**
    a directory that is not a worktree, or is parked on another branch, is a
    `worktree-conflict` refusal surfaced as `configuration-error` with an
    operator sentence — never a delete or a checkout over somebody's work. A
    hand-deleted worktree is recovered by `git worktree prune` + re-add, and the
    branch's committed draft work comes back with it. `node_modules` is linked
    from the trusted checkout for runtime readiness; env files deliberately are
    NOT. Records without the flag keep the previous shared-checkout behaviour
    exactly. Pinned by `scripts/smoke-local-preview-worktree.test.ts`
    (**21/21**, `npm run smoke:preview-worktree`) against real temporary git
    repositories, alongside the existing preview suites (**50/50** combined).

    **✅ Dependency/start readiness also landed 2026-08-27.** A record may declare
    `installCommand`/`installArgs`/`installTimeoutMs`. The supervisor then reports
    a new `installing` lifecycle state, runs that command in the project's OWN
    worktree, streams its output into the operator-visible log, and records a
    readiness marker fingerprinted over the lockfiles plus `package.json` — so a
    resumed preview skips a multi-minute install while a changed lockfile always
    reinstalls. A failed, timed-out or missing-runtime install is `install-failed`
    with the reason and its own output, records nothing, retries next start, and
    never reaches port allocation or spawn. The install command passes the same
    allowlist as the launch command (a `/bin/sh -c` install is `untrusted-command`),
    and **declaring an install without `isolatedWorktrees` is refused outright**
    (`install-requires-isolation`): dependency work must never rewrite the shared
    checkout somebody is using. AquaCRM's own committed manifest therefore stays
    install-free, pinned by a test. Clone-from-remote remains open.

    **✅ Two more named failure paths are closed in source (2026-08-27).**
    *Stale preview:* the pure preview state machine now drops any status or
    response snapshot that names a different project, so a poll still in flight
    when the operator switches project cannot hand the new project the old
    one's lifecycle state or its loopback `previewUrl` — which the editor would
    otherwise load into its frame. The component already aborted those
    requests; the rule is now enforced where it is provable without a browser
    (`smoke-local-repository-preview-ui` **8/8**). *Rejected AI change:* Aqua
    Editor AI has no write path at all — a contract test asserts that no
    Editor-AI module or route references `repoWrite`/`sourceEdit`/`publishEdits`
    or their exported writers (and that the detector catches the real write
    route, so it cannot pass vacuously), and a behavioural test proves a reply
    proposing an edit leaves every record except the conversation
    byte-identical. A suggestion nobody accepts has nothing to undo
    (`smoke-aqua-editor-ai-reply` **22/22**).

    The remaining acceptance path is:
    select an authorised project → ~~create/resume its isolated branch/worktree~~ →
    ~~dependency/start readiness and logs~~ → prepare its supervised preview →
    health/logs ready → inspect an element →
    visual/source/AI change → diff → save/reload → tests → commit/PR → stop/restart →
    exact change retained. ~~Prove dependency/start failure, occupied port, crashed
    process, dynamic-loopback CSP, stale preview, rejected AI change~~ and
    unauthorised cross-project attempts — all now source/focused-test proven.
    **✅ The mounted lifecycle is now browser-accepted (2026-08-27, isolated
    `sandbox:fork` lane on 3047; 3032 untouched).** Against a fixture repository
    registered with `isolatedWorktrees`, a real Dev Workspace drove Start →
    Preview ready on loopback → an uncommitted worktree edit → Restart onto a
    NEW port with the edit retained and `/aqua-tag.js` 200 → Logs showing
    *"uncommitted edits are retained"* → Stop, with the edit still on disk as
    `M index.html`. A second project proved exact-project binding and
    stale-preview isolation (Not running, no iframe, no trace of A's ports;
    Start refused *"no trusted local preview record"* without disturbing A).
    No overflow at 320/375/812/768/1024/1280/1920 or at 200% zoom; 44px targets
    at 320px; no application console errors. Ed's repository ended with the same
    HEAD, zero `aqua-editor/*` branches and one worktree; the shared state file
    was byte-identical.

    What genuinely remains is the rest of the MOUNTED matrix: **the authoring
    walk, which is blocked on Ed's GitHub credentials.** A repository-backed
    project does not write to local disk at all — `site-editor/files` POST
    refuses it with 409 (`:382`) and the edit commits through `repo-write` to
    the draft branch — so edit → save → diff → commit → PR needs a real
    connection. The blank "this workspace" project does write locally, but that
    path is owner + local-Dev-Mode only
    (`requireWholeWorkingTreeFounderAccess`, `:363`) and mutates Ed's own
    checkout, which is why the 2026-08-27 browser session did not press Save.
    *(A 🔴 raised in that session, claiming this was an ungated route into
    AquaCRM's tree, was wrong and is retracted — see [issues #161](../issues.md).
    Pointing repository-backed saves at the managed worktree instead of a
    per-save commit remains a genuine design evolution this plan describes, but
    it is not an open hole.)* Also remaining: the dirty
    project/mode/surface/refresh transitions (issue #19's browser half),
    commit/PR/merge (needs Ed's GitHub credentials), and clone-from-remote. Run
    the remote tagged-site
    bridge as a separate optional matrix, not as a prerequisite for repo preview.

18. 🟡 **Finish putting the WHOLE editor in a client portal.** Ed's end state, and he was precise
    about it: *"the entry point is the whole dev editor — i just connect a project and
    add it in, they get the editor exactly what weve got now, but just ill configure
    it. clients get the exact thing now that weve got, they can do vs code thing if
    they want, they can type it into ai, whatever they want, i dont care, its up to
    them, hence why i built it."*

    So this is **not** a second client editor. It is the same `DevEditor` and the same
    three interaction modes. Do not fork a client variant or gate it from a global
    role. The selected workspace grant controls whether that mounting can inspect,
    edit files, prompt/apply AI, run tests, commit, open a PR or publish.

    **The boundary and every action are enforced.** Ed connects one project/workspace
    and grants an explicit capability set; the client can never reach another project
    or inherit unrelated CRM/Dev Team access. Tenant and membership are checked first,
    then project/workspace, environment, resource and capability on every read and
    mutation. A client cannot switch to an ungranted project, reach another agency's
    repository/tag, read another project's AI history, reveal secrets or publish
    merely because a template calls them a developer.

    **Access dependency:** the minimum project-grant kernel in
    `PRODUCT-ARCHITECTURE.md` now exists: fresh live identity, exact project/environment,
    separate view/edit/AI/preview/PR/deploy capabilities, direct Dev route/API enforcement
    and immediate access-revision invalidation on migrated paths. The first role-template,
    person-grant, element-level and permission-request manager is also mounted in Settings,
    People and Fulfilment. Phase 18 consumes that evaluator and must not create a
    client-only permission system. Staff/Fulfilment and the broad 11-element internal
    client route wave now consume it, including missing-client denial; dynamic module,
    freelancer-job and task associations plus customer/freelancer adoption stay open. The complete
    cross-role grant/request mutation and accessibility gate also remains open.

    The reusable `/portal/dev-workspace` and eligible staff/freelancer/client/customer
    links are now the first shared mount. That is not final client acceptance: decide the
    intended in-portal placement and browser-prove a real client owner/staff can see only
    their project, use only granted editor elements, retain edits across reload and request
    extra access without seeing internal Dev Team.

    **✅ The client-identity boundary is now proven at the route level (2026-08-27),
    `scripts/smoke-client-dev-workspace.test.ts` (8/8, `npm run smoke:client-dev-workspace`).**
    A real `client-owner` — not a staff member wearing a label — with an exact project grant
    lists **only** that project (a sibling client's repository appears nowhere in the payload),
    reads its own project's source through the grant, is refused the sibling's project and its
    preview in every lifecycle action, and cannot reach Aqua's working tree even under
    `withDevMode`. The client role **by itself** grants nothing (no grant → no projects, no
    preview), and holding a project grant discloses neither the agency master tag nor the
    connection catalogue. A rotated live record refuses the client's cookie, so issue #22's
    boundary reaches this surface too.

    **Two things that audit found, both recorded rather than assumed:** the access ceiling
    only lets a client role reach a project whose `clientId` is their own
    (`userCanReachScope`) — so **Ed must attach the project to the client record**, and a
    grant on an unattached project is inert by design; and a client can currently distinguish
    "ungranted but exists in this agency" (403) from "does not exist" (404), which is the
    established agency convention but a cross-client disclosure worth a decision
    (→ [issues #163](../issues.md)).

    **✅ The client's portal is the EXISTING customer portal** (Ed, 2026-08-27:
    *"existing customer portal actually meant to be"*). So phase 18 does not build a
    second portal — it re-points `client-owner`/`client-staff` at
    `/portal/customer` and widens that layout's `requireRole("end-customer")` gate
    to the client roles it was always for, taking care not to disturb the
    end-customer journeys (orders, membership, bookings) sharing the surface.

    **✅ Placement DECIDED by Ed, 2026-08-27** (recorded in full with his words in
    [notes.md](../notes.md)). The line is drawn by audience, not by feature:
    `/portal/clients/<clientId>` is the **internal** workspace for Ed and his
    employees, and the editor mounts there anyway for internal work; **a client's own
    portal is where a client touches anything**, with the editor **optionally toggled
    on per client** when that client has a website or software project. Off by default —
    having a project does not hand the client an editor. The toggle decides whether the
    surface is offered; the exact project grant still decides what it can do.

    **The concrete build this implies, and the blocker to clear first**
    *(deliberately bulleted, not numbered: a numbered list inside a phase is parsed as
    another task by `devTeamTasks.parsePhases`, and a second "1." in this section would
    collide with phase 1's id):*
    - 🟠 **A client role lands in the INTERNAL workspace — but cannot act there.**
      `src/app/portal/page.tsx:20` sends `client-owner`/`client-staff` to
      `/portal/clients/<clientId>`. Investigated 2026-08-27: the internal mutation
      routes already refuse a client role **by role, before any grant** —
      `client-properties` is `requireRoleForClient([...AGENCY_ROLES])` (`:144`),
      `customer-portal-control` 401s a non-agency role (`:100`) — and a client is
      refused even holding `client.portal.manage` on its own client. Pinned by
      `scripts/smoke-client-role-workspace-boundary.test.ts` (**6/6**), which also
      proves an agency identity still works. So this is a **product/UX separation,
      not an exposure**, and can be done deliberately rather than urgently.
      **The destination does not exist yet:** `/portal/customer` is
      `requireRole("end-customer")` (the client's own customers) and
      `/client-preview/<id>` is an agency-side preview of it, so there is no
      client-facing portal for a `client-owner`. Moving the redirect means building
      one — or deliberately re-designating the customer portal as the client's. That
      is the real content of "decide the actual client-portal placement", and it is
      Ed's call.
    - **The toggle mechanism already exists** and should be reused rather than invented:
      per-client capability is `getInstall({ agencyId, clientId }, pluginId)` with
      `enabled` (`src/server/pluginInstalls.ts`), which is exactly how the customer
      portal already decides whether Finance/Orders appear
      (`app/portal/customer/_portalData.ts:319`). The editor toggle belongs there — **not**
      in `ClientPortalDesignDocument`, which is presentation (theme/chrome/pages/blocks)
      and would be the wrong home for authority.
    - Then: surface the editor inside the client's portal behind toggle **and** grant,
      and browser-prove a real client session — sees only its project, uses only granted
      elements, retains edits across reload, can request more access, and never sees
      internal Dev Team material.

    **✅ The provisioning rule is now built and pinned (2026-08-27).**
    `src/server/clientProjectAccess.ts` is the ONE place that decides what a client
    receives when a website/software product is attached (or the toggle goes on):
    `grantClientProjectAccess()` gives the client's **own** people — `client-owner`
    and `client-staff`, never their end-customers — a grant whose scope is
    **always** `{ kind: "project", id }` and never agency, client or workspace.
    It **refuses** a project that is not attached to that client
    (`project_not_attached_to_client`, 409) rather than writing a grant the access
    ceiling would silently render inert — which is what a grant on AquaCRM's own
    internal project, or on another client's site, would be. A foreign project id
    answers exactly like an invented one. The default hands over the editor, the
    code and the preview, and deliberately **withholds** publish, PR, deploy, AI,
    connection management and the local process controls — each stays a separate,
    deliberate decision. `revokeClientProjectAccess()` takes it back immediately and
    leaves the project attached; what survives is `access.request` alone, because
    asking grants nothing and the right to ask is never withdrawn — that is the
    request-access half of the journey. Pinned by
    `scripts/smoke-client-project-access.test.ts` (12/12) plus the client-identity
    route suite (8/8): **20/20** through `npm run smoke:client-dev-workspace`.

    Still open for phase 18: the client-redirect decision above, calling this
    provisioning from the product-attach flow and a per-client toggle
    (`portalTemplateKey` is already `website` / `custom-software`, and
    `getInstall(...).enabled` is the toggle mechanism), the portal mount itself, the
    mounted browser walk with a real client session, and retaining edits across reload.

    **Do not call complete before 17.** Putting an
    editor that has never run in a browser in front of somebody who is not Ed is how
    a client discovers a bug on their own website.

Ship in order where it matters: **1 before 2–4 and 8** (they live inside it),
**6 before 7**, **13 before 7's insert path and before 14** (the lifecycle UI shows
the branch 13 writes), **12 before 15** (the Librarian follows the editor AI's
standalone shapes), **16 and the minimum grant kernel before 17**, **17 before 18**
(the reusable route may exist, but never present it as accepted to a client before
the lifecycle works), and the full role/permission/Fulfilment responsive matrix is
the final release gate. 5, 10 and 11 were independent
and are all done.

## Open questions / decisions for Ed

- **Resolved browser gate (2026-08-26).** A repository-backed supervised local preview
  is a first-class browser source and does not require Aqua Tag. A remote site without
  repository/source access uses the Tag when installed, or remains view-only when it
  cannot provide a trusted selection bridge.
- **Click-to-select is on by default** once the tag connects, and the tag's click
  handler calls `preventDefault()` — so links in the preview cannot be followed until
  you toggle selection off. Correct for editing, annoying for browsing. Keep, or
  default it off?
- **Element → source cannot work cross-origin.** `elementSource.ts` reads React
  fibers inside the previewed document; a browser will not expose those across
  origins. So Dev's "which file rendered this?" answers on a same-origin Aqua portal
  and never on a tagged client website. Accept the limit, or find another mechanism?

## Guard rails (these have already bitten once today)

- **A repository-backed project may be written only inside its managed isolated
  workspace.** Never write into AquaCRM's own working tree or an arbitrary server
  path. Resolve the selected project to its bounded branch/worktree/container,
  validate the relative path, retain the diff/audit, and always send `project` on a
  create. The existing site-editor backstop must evolve to recognise only this
  managed root; it must not be weakened into generic filesystem access.
- **Never widen the tag's origin policy.** Exact string comparison against exactly
  one origin. A redirecting site is fixed by trusting the *mapped* `finalUrl`, not by
  accepting a set of origins or matching by prefix.
- **Secrets stay in the encrypted integrations vault**, resolved server-side per
  request, never on the `DevProject` record — that record is returned to the browser
  by the projects GET.
- **Run the full suite**, never a subset: contract tests in unrelated files pin
  editor behaviour, and several pin editor *strings*.
- **Build the inputs; Ed fills in real credentials.** Never enter a real key.
