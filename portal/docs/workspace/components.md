# Chapter — Shared components (`src/components/`)

← Back to [the contents page](../WORKSPACE-FILE-TREE.md)

68 files of cross-cutting React UI (re-counted 2026-08-20; was 60) — the app shell and reusable pieces the
[portal screens](portal-ui.md) mount. **Reuse from here before writing new
UI** (especially the `ui/` primitives).

## `chrome/` (42 files) — the app shell (busiest edit zone)
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
into is now **eight sidebar sections** (2026-08-21), not twelve screens — see
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

## `editing/` (3 files)
`EditingOverlay`, `EditingNotice`, `RepositoryPanel` (the repo browser) — the
in-page editing chrome the website-editor plugin uses.

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
