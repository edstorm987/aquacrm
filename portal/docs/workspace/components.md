# Chapter — Shared components (`src/components/`)

← Back to [the contents page](../WORKSPACE-FILE-TREE.md)

80 files of cross-cutting React UI (re-counted 2026-08-21 — `find src/components -type f | wc -l`; was written up as 68) — the app shell and reusable pieces the
[portal screens](portal-ui.md) mount. **Reuse from here before writing new
UI** (especially the `ui/` primitives).

## `chrome/` (47 files) — the app shell (busiest edit zone)
The frame every authenticated screen sits in:
- **Nav:** Sidebar, Topbar, MobileNav.
- **Notifications/attention:** `NotificationBell`, `NotificationCentre`, `NotificationAttentionProvider` (the context that feeds the bell).
- **Advisor:** the Advisor drawer + `FloatingChat` + `QuickNote`.
- **Radar:** Radar quick-look buttons.
- **Dev Console:** `DevConsoleControl` (server) → `DevConsoleButton` (client) → `DevConsolePanel` (lazy). The founder-only topbar peek — see below.
- **Theming/branding:** Theme switcher / injector / toggle (binds the `brand` CSS vars per tenant).
- **Modes:** Privacy mode, Showcase mode.
- **Search/profile:** `PortalSearch`, `ProfileMenu`.
- **Transitions:** workspace / command transitions.
- **Session:** `WelcomeGate`, `SmartWorkSessionMonitor`.

### The topbar-peek pattern (three buttons, one shape)
`RadarQuickLookButton`, `NotificationCentreButton` and `DevConsoleButton` are the
same component shape and must stay that way — a 36px chrome button with an
attention badge, a `role="dialog"` popover anchored under it, Escape-to-close and
outside-`mousedown`-to-close. **Copy an existing one before inventing a fourth
shape.** `smoke-dev-console-topbar.test.ts` asserts the shared markers on both
the Dev Console button *and* Radar, so drifting either one fails the suite.

The Dev Console adds two things the other two don't need:
- **A lazy panel.** `DevConsolePanel` is loaded with `next/dynamic` on first
  open (the `GlobalAdvisorDrawer` precedent) — the icon renders on every page a
  founder loads, so a console nobody opened must cost nothing.
- **A draft that outlives the popover.** The half-written finding lives in the
  *button*, not the panel, because the panel unmounts on close. Losing the
  thought is the exact failure the feature exists to prevent.

Visibility is decided SERVER-side (`devDocsAccessible(session)`) and passed to
`Topbar` as one boolean, `devConsole`. It is never a client decision, and Dev
Mode off removes the icon everywhere at once. Mounted by `agency/layout.tsx`,
`dev-team/layout.tsx`, `clients/page.tsx` and `clients/[clientId]/layout.tsx`;
deliberately NOT by `team/layout.tsx` (not a founder surface). The console it peeks
into is now **seven sidebar sections** (counted 2026-08-21 in
`dev-team/layout.tsx:74-89`: Home · Roadmap · Findings · Library · Tools ·
Editor · Notes — "My profile" is the separate Settings panel, and there is no
Team chat row), not twelve screens — see
[portal-ui](portal-ui.md#dev-team--the-internal-dev-team-workspace-founder--dev-mode-only).

**Cost split, and why it matters:** `devConsoleBadge()` (open findings + open
blockers, TTL-cached) is the only thing on the render path. `devConsoleStatus()`
walks the working tree for worker activity and runs *only* when the popover is
opened, via `/api/portal/dev-team/console`. The panel fires `?part=core` and the
full read together so findings/blockers paint immediately and worker rows fill in
behind. Don't move the slow read onto the render path.

## `attention/` (9 files) — the needs-attention surface
`AttentionControls`, `TaskChecklist`, `TaskTemplates`, `CompletedRegister`,
`DeferralNote`, `EvidenceCard`, `ResolutionBanner`, `ResolutionSpotlight`,
`MetricSparkline`. These render the actionable-attention model from
`lib/operationalAttention` + `lib/server/operationalAlerts`.

## `editing/` (10 files) — **corrected 2026-08-21 (was written up as 3)**
The chrome of the **one universal editor**, `src/engines/editor/DevEditor.tsx`.
**Nothing in `src/built-ins/` imports any of it** — the website-editor plugin
does not use these; if anything the arrow runs the other way
(`DeviceControl` reads `built-ins/modules/website-editor/src/lib/devicePresets`).

- **Mounted by `DevEditor.tsx`:** `AddMenu` (the one add affordance) ·
  `ElementInsertPanel` (**NEW 2026-08-22, phase 7** — inside the element
  library's "Selected element" section: emits the selected block's source via
  `engines/editor/elements/emit.ts`, lets the operator pick file + insert
  point (the selection's `sourceFocus` file:line is the suggested spot),
  previews the exact lines from the server's dry run, and commits them to the
  draft branch through `/api/portal/dev/repo-write` `action:"insert"`; shows
  server refusals verbatim and never claims the site changed) ·
  `AquaEditorAI` (the Assistant pane) · `DeviceControl` (the REAL device
  system — 26 presets W×H, rotate, zoom, custom dimensions, per-project
  persistence; replaced the width-only `BreakpointControl` 2026-08-22, phase
  10 — the maths stays in the module's `devicePresets.ts`, this is chrome
  only, and it is the editor's ONE door to that module) ·
  `EditorCodeCanvas` (the code pane) · `EditorModeSwitch` (the depth selector) ·
  `RepositoryPanel` (the repo browser) · `LibrarianPanel` (the Dev-mode
  `librarian` tab — now wired with the editor's `onOpenFile` seam) ·
  `WorkLifecyclePanel.tsx` (**NEW 2026-08-22, phase 14** — THREE exports for
  the three Dev-mode lifecycle tabs: `DraftsPanel` (the project's edit branch
  AS the draft — the state ladder page → branch → PR → merged, the server's
  `status.line` verbatim, changed files with per-file Open = resume into the
  code canvas, and the WHOLE lifecycle driven in-panel through repo-write:
  Publish (`action:"publish"`, the same control the canvas strip presses),
  **Merge** (`action:"merge"`, two-step confirm, dry-run server-side without
  it — never a link out to GitHub, per Ed's "everything inside the editor")
  and **Revert** for a merged draft (`action:"revert"` — the server's dry-run
  plan first, then confirm; the restore commits land on the DRAFT branch, so
  the revert is itself a draft)) · `HistoryPanel` (one feed: draft-branch
  commits + Dev Team check-ins, each labeled with what it is) · `NotesPanel`
  (per-project notes over `/api/portal/dev/lifecycle`). All three read
  `/api/portal/dev/lifecycle`; skin is `editorAiSkin.ts`, never `--dt-*`.
  Pinned by `scripts/smoke-work-lifecycle.test.ts`).
- **Mounted by `EditorCodeCanvas`:** `CodeSurface` (the CodeMirror wrapper) ·
  `codeTheme.ts` (`fileColour`).
- **No importer today:** `EditingOverlay`, `EditingNotice` — the lease/notice
  chrome. Only `scripts/smoke-editing-leases.test.ts` reads them, as source.
  They ride `engines/editor/editing/leases.ts`; check that suite before deleting.

## `resource-tools/` (4 files) — client audit tools
`SeoAuditTool`, `AccessibilityAuditTool`, `SiteSpeedTool` (+ index).

## `ui/` (6 files) — generic primitives (reuse these first)
`ConfirmDialog`, `EmptyState`, `ErrorBoundary`, `LoadingSkeleton`,
`CollapsibleSection`, `SkipToContent`.

## Singletons
- `auth/TwoFactorSetup.tsx` — the TOTP enrolment UI over `api/portal/mfa/{enrol,verify}`. (The *login* code step is not here — it lives in `app/login/LoginForm.tsx`.)
- `people/TeamChat.tsx` — the shared internal-chat component, mounted by **both** the agency "Team chat" tab and the staff `chat` station. Its own store (`server/people.ts` `peopleChannels`/`peopleMessages`), **not** the client inbox.
- `marketing/ClientMarketingServiceWorkspace.tsx` — the client "Social & ads" tab body (mounted by `clients/[clientId]` marketing tab).
- `workspaces/PluginWorkspaceNav.tsx`.
