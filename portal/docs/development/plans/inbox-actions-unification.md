# Unify Inbox + Actions — one place for "what needs to happen"

**Status:** planned — Ed 2026-08-20: "put actions inside inbox as a tab next to Needs attention,
call it Actions. Sidebar becomes 'Inbox and actions'. Then needs-attention merges with today's
actions (trickier). This is the final piece — a complete gamechanger."

## Why it's mostly straightforward
- The inbox ALREADY has a tab bar (`_MasterInbox.tsx`): Needs attention · All · Social · Enquiries.
- Actions is self-contained: `actions/page.tsx` just renders `<AgencyActionsPage/>` (`_ActionsPage.tsx`).
- So Phase 1 = add an "Actions" tab and drop the Actions workspace into it.

## The one wrinkle
`AgencyActionsPage` is a SERVER component (async, loads its own data); `_MasterInbox` is a CLIENT
component (`"use client"`). So Actions is passed as a server-rendered SLOT: `inbox/page.tsx`
renders `<AgencyActionsPage/>` and passes it as a prop (e.g. `actionsSlot`) to `<MasterInbox/>`,
which renders it when the Actions tab is active. Standard server-in-client pattern.

## Phases
1. **Actions tab (straightforward).**
   - `_MasterInbox.tsx`: add an "Actions" tab in the tab nav, right after "Needs attention";
     render the `actionsSlot` when active. Support `?view=actions` deep-link.
   - `inbox/page.tsx`: render `<AgencyActionsPage/>` and pass it as `actionsSlot`.
   - `sidebarLayout.ts`: merge the two items (lines 83-84, "Master inbox" + "Actions") into ONE
     "Inbox and actions" → `/portal/agency/inbox`; drop the separate `actions` item but keep old
     deep-links working (line 231 allow-list too).
   - `actions/page.tsx`: redirect to `/portal/agency/inbox?view=actions` so existing links + the
     many `/portal/agency/actions` references across the app still land correctly.
2. **Needs-attention ⋈ today's actions (trickier).** — REMAINING (Phase 1 shipped 2026-08-20)
   - The inbox "Needs attention" alerts and the Actions "today" view (`_TodayView.tsx`) are two
     lists of "do this now". Merge them into one combined today/attention view so a single glance
     shows everything that needs the founder — attention alerts + today's actions together.
   - Keep both sources' resolution paths intact (an alert clears its way, an action clears its way).

   **Why it wasn't done in the Phase 1 pass (file-boundary block):** `_TodayView` is rendered by
   `_ActionsWorkspace`, and today only receives `tasks: AgencyTask[]` + `entries:
   CommandCalendarEntry[]`. To surface needs-attention alerts inside Today, `_ActionsWorkspace`
   must pass the alert rows (the `origin:"inbox"` generated actions it already holds, or the raw
   `OperationalAlertView[]`) down to `_TodayView`, AND `_TodayView` must render them with the
   alert's own controls (`AttentionControls`: Resolve / Remind later / Dismiss through the
   operational-alert preference store) rather than the task Complete/Postpone model. That is a
   two-file change (`_ActionsWorkspace.tsx` + `_TodayView.tsx`), and `_ActionsWorkspace` was
   import-only in the Phase 1 lane — so the clean merge was deferred rather than half-built.

   **Design for the Phase 2 lane:**
   - In `_ActionsWorkspace`, take the already-computed `generatedActions` with `origin === "inbox"`
     that are due/overdue today (or all of them, since attention alerts are "now" by nature) and
     pass them to `TodayView` as a new prop, e.g. `attentionActions: GeneratedAction[]`.
   - In `_TodayView`, render an "attention" group above the task list. Each row uses the shared
     `AttentionControls` (same component the inbox `AlertRow` and Actions queue use) so Resolve /
     Remind later / Dismiss go through the identical store — the alert clears its way, the task
     clears its way (Complete/Postpone). Do not convert an alert into a task to show it here.
   - Dedupe against tasks already accepted from an alert (`acceptedSourceIds` /
     `attention:<id>`), which `_ActionsPage` already computes — thread that set down too, or filter
     in `_ActionsWorkspace` before passing.
   - Tests: extend `scripts/smoke-today-view.test.ts` to pin that Today renders attention rows with
     `AttentionControls` and that resolving one goes through the operational-alert store, not the
     task store.

   **Also outstanding (small, out of the Phase 1 lane's file map):** operational alerts whose href
   targets `/portal/agency/actions` no longer light a sidebar attention dot, because the merge
   removed the `actions` nav item and `destinationForOperationalAlert`
   (`src/lib/intelligence/operationalAttention.ts:77`) still maps that href to the id `"actions"`.
   Fix: change that line's `return "actions"` to `return "inbox"` so the merged "Inbox & actions"
   row absorbs those dots. (The alerts themselves are unaffected — they still appear in the Command
   Centre and inside the inbox Actions tab; only the sidebar badge is missing.)

## Files
`src/app/portal/agency/inbox/_MasterInbox.tsx`, `src/app/portal/agency/inbox/page.tsx`,
`src/app/portal/agency/actions/page.tsx`, `src/app/portal/agency/actions/_TodayView.tsx` (Phase 2),
`src/lib/chrome/sidebarLayout.ts` (SHARED — take the lock; merge the two items),
`scripts/smoke-inbox-actions.test.ts`. Import-only: `_ActionsPage.tsx`.
Disjoint from the dev-team shell lane (dev-team/** + Topbar).
