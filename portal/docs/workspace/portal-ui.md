# Chapter — Portal UI (`src/app/portal/`)

← Back to [the contents page](../WORKSPACE-FILE-TREE.md)

The authenticated screens. **Convention:** `page.tsx` = the route (server
component, does the data-loading + scope check), co-located `_Component.tsx` =
its UI. `⊕` marks large, load-bearing files — edit with care and run the
smoke suite after.

**Portal root:** `layout.tsx` (requires a session, else `/login`; per-scope
chrome lives one level down), `page.tsx` (role-aware redirect:
agency→`/agency`, client→`/clients/<id>`, end-customer→`/customer`),
`not-found.tsx`.

**Client-creation lifecycle contract (2026-08-26):** the mounted New Client
selector reads the active agency's editable phase rows and sends a stable operation
id to `/api/portal/fulfillment/clients`. The shared server boundary in
`lib/server/clients/clientLifecycle.ts` persists the operation before side effects,
checkpoints the client, then materialises the selected plugins, Website Editor
starter and checklist. Identical retry reuses the client and only unfinished steps;
changed reuse conflicts, a deleted phase is refused before creation and incomplete
work returns the client id plus `retryable:true`. Lead/contact/person conversion and
linked workspaces use the same boundary. Mounted all-stage/failure/reload browser
acceptance remains under [issue #46](../development/issues.md).

**Root pre-paint bootstrap contract (2026-08-26):** `app/layout.tsx` mounts the
colour-mode and sidebar-collapse storage readers as uniquely identified Next
16.3 `Script strategy="beforeInteractive"` components in `<head>`. Do not turn
them back into native inline `<script>` elements: an absent nested client can
call `notFound()` during a client render, and raw root scripts produced React's
“script tag while rendering” error on that transition. The two script bodies
remain in `lib/chrome/colorMode.ts` and
`components/chrome/sidebarCollapseState.ts`; mounted valid/missing/generic-404
console acceptance remains under [issue #152](../development/issues.md).

**Current cross-portal accessibility caveat (2026-08-25):** the source contains
64 `aria-modal="true"` declarations across 50 TSX files, but only three of those
files use [`useFocusTrap`](../../src/lib/a11y/useFocusTrap.ts). Forty-seven modal
files do not contain/restore keyboard focus and only four of those handle Escape;
representative gaps span Actions, New Client, Finance, HR, Marketing and editor
dialogs. The existing `ConfirmDialog`, mobile navigation and Enquiry detail card
show the intended behavior. Tracked as [issue #135](../development/issues.md).
The agency route skeleton separately hides its only live loading status under an
`aria-hidden` root, tracked as [issue #136](../development/issues.md).
Across portal/editor chrome, all 12 files declaring a tablist and nine production
menus omit their role-specific roving/arrow-key behavior; Settings also controls
missing panel ids, and the editor page picker is a listbox without item navigation.
Native buttons remain individually tabbable, but the announced composite semantics
are incomplete. Tracked as [issue #138](../development/issues.md).
At least 13 manually confirmed internal icon actions also have no accessible name,
and the published Contact/Booking/Newsletter/Search/Donation fields rely on
placeholder-only prompts. Tracked as [issue #139](../development/issues.md).
The root `app/error.tsx` is a segment boundary, not the application-wide fallback its comment
claims. No `app/global-error.tsx` exists, so root-layout/App Router failures select Next 16's
built-in generic screen instead of Aqua's recovery/capture path. Tracked as
[issue #141](../development/issues.md).
Customer setup's Chromium Install button also depends on `beforeinstallprompt`, but the live
manifest/public asset set has no required 512px icon. It therefore falls through to manual
instructions instead of becoming promotion-eligible in Chromium. Tracked separately from the
revisit lifecycle as [issue #142](../development/issues.md).

---

## `agency/` — Ed's macro / portfolio view + Command Centre

**Routing & chrome**
- `layout.tsx` — agency-scoped chrome, painted with the agency brand kit; sidebar built from the agency's plugin installs.
- `page.tsx` — `/agency` home: the pipelines hub (every pipeline as a card). **Load-bearing.**
- `[...rest]/page.tsx` — agency catch-all; resolves URL → workspace tool manifest, renders inside agency chrome.
- `command-center/page.tsx` — **re-exports the agency root `page.tsx` (alias).**

**Command Centre / founder-home components**
- `_DashboardCommandCenter.tsx` ⊕ **(2469L)** — the Command Centre dashboard shell.
- `_CommandIntelligenceWorkspace.tsx` (1026L) — command intelligence / KPI workspace (saved views: private in-browser + agency-shared via `/api/portal/kpi-registry/views`, 2026-08-20).
- `_CommercialIntelligenceWorkspace.tsx` — commercial intelligence summary.
- `_CommandCentreKpiTrajectory.tsx`, `_CommandDeckPopup.tsx`, `_CommandStationNav.tsx`.
- `_DayBriefingPanel.tsx` / `_DayCommandSensorPanel.tsx` / `_DayKpiIntelligencePanel.tsx` — daily briefing / sensor / KPI panels.
- `_FounderDashboardKpis.tsx`, `_AgencyActivityFeed.tsx` ("today across the agency").
- `_BattleTableWorkspace.tsx` (840L — war room + P5 station chrome), `_BrandPortfolioInstrument.tsx`, `_CapitalOwnershipWorkspace.tsx`.
- `_ClockOutReviewDialog.tsx`, `_QuarterlyStrategyReview.tsx`, `_WeeklyReviewWorkspace.tsx`.
- `_DynamicRadarConsole.tsx`, `_RadarPolicyPanel.tsx`, `_RadarScanControl.tsx` (radar console / policy / scan trigger).
- `_NewClientButton.tsx` — inline "+ New client" modal.

**Master Inbox — `inbox/`**
- `page.tsx` — the master inbox route. *(Dev/demo sessions load ZERO enquiries here — `session.isDemo ? []`.)*
- `_MasterInbox.tsx` ⊕ **(697L)** — the unified attention inbox.
- `_EnquiryDetailCard.tsx` **[new, 330L]** — the per-enquiry **detail modal**, opened from the inbox for the selected enquiry. Mirrors the submission in two layers — **A)** every `formCapture` field in the form's own submission order + the answers Aqua has no column for (shown in full, not just counted); **B)** Aqua's own contact record (consent-first, then classification, services, source, triage, timeline, linked lead/contact/client) — and reuses `_EnquiryCommunications`. Extracted from `_MasterInbox`'s old inline expand (which took the `FormSubmission`/`Detail`/route-style helpers with it). **Phase 3:** Layer A now mirrors the *whole* real form when its schema is imported — the card fetches `GET /api/portal/website-enquiries/form-template` (→ `resolveFormSchemaForEnquiry`) on open and lays the submission out via the pure `lib/enquiryFormLayout.ts` `mergeFormLayout` (every field in order, blank where skipped), falling back to the raw submission when no template matches. **Phase 4:** Layer B has an editable **"Added by hand"** block (`ManualContactDetails`) — company/job-title/notes/custom fields the form didn't ask — saved to the new file-backed `server/enquiryContactDetails.ts` store via `GET/POST /api/portal/website-enquiries/contact-details` (never the live enquiry row or `people.ts`). **Phase 5 (polish):** genuinely-empty fields render a muted "—" via `Field` (never an invented value); meaningful distinctions kept. **Plan COMPLETE (P1–P5).** Two enhancements remain as commander-coordinated follow-ups beyond the plan: manual details → canonical `Person` on conversion; inline lead/contact/client re-linking.
- `_UnifiedInboxWorkspace.tsx` (442L), `_EnquiryCommunications.tsx`.

> **Capture/playback caveat (source-reviewed 2026-08-25):** the three voice-note surfaces and
> recorded-call path force WebM after testing only one WebM codec. Unsupported construction can
> retain the microphone stream and, for recorded calls, strand the already-created active call
> plus busy UI ([issue #145](../development/issues.md)). Their private playback routes also lack
> byte ranges ([issue #144](../development/issues.md)). Browser record/play/seek proof is pending.

> **Chat/attention ordering caveat (source-reviewed 2026-08-25):** unversioned Team Chat channel
> loads/polls can replace a newer active conversation, and Send reads that overwritten id. The
> shared attention provider can likewise roll an older failure back over a newer action
> ([issue #147](../development/issues.md)). Deferred-response/browser proof is pending.
- `_SocialInboxWorkspace.tsx` — the Meta/IG social conversations + a **Channels** connection block. When Meta creds aren't stored yet it shows a **"Connect now"** form (`MetaConnectForm`) that saves the `meta` integration connection — fields come from `integrationDefinition("meta")`, POST to `/api/portal/settings/integrations`, then `router.refresh()` re-runs readiness and the Instagram/Facebook OAuth buttons replace the form. **Multi-account (one app, many IG/FB):** the OAuth connect result (`?meta=…&connected=N`) surfaces as a dismissible banner (`metaConnectNotice`), the connect buttons read "Add Instagram/Facebook" once ≥1 account is connected, and each account shows in the list with a connected-count + a "Routed" badge (connect-time routing via `meta/start?marketingAssetId=…&companyId=…`). Plan: [meta-inbox-connect](../development/plans/meta-inbox-connect.md).
  **Header-action contract:** the old enabled no-op More ellipsis is removed. Assign and
  Close/Reopen remain native controls backed by real conversation mutations; mounted visual/focus
  confirmation remains under [issue #150](../development/issues.md).
- `_WebsiteSourcesConfig.tsx` **[new]** — website inbox source configuration (routing + master-tag entry point). Also hosts the **"Import forms"** action (enquiry-detail-card plan Phase 2): reads a tagged site's real forms via `server/websiteFormSchemas.ts` → `scanFormSchemasInHtml` (in `lib/server/aquaTagDetection.ts`), stores each form's field schema on `WebsiteSiteConfig.formSchemas`, and shows "N forms found" + a chip per form. The schema then drives the enquiry card's layout (plan Phase 3).
- `activity-inbox/page.tsx` — `/agency/activity-inbox` feed *(overlaps inbox — see hazards).*

**Actions — `actions/`**
- `_ActionsWorkspace.tsx` (1203L), `_ActionsPage.tsx`, `_TodayView.tsx`; `calendar/page.tsx` reuses the actions page.

**Journey — pipelines / leads / contacts / people**
- `pipelines/[slug]/page.tsx` — single-pipeline kanban; `_LeadsPipelineWorkspace.tsx` ⊕ **(2689L — the biggest UI file)**, `_LeadsPipelineWorkspaceServer.tsx` (data loader), `_PipelineBoard.tsx`, `_ScoutingCommand.tsx` (718L), `_FulfilmentProductSwitcher.tsx`.
- `leads-pipeline/` — `_UpcomingMeetings.tsx`, `_WorkflowSteps.tsx`; `campaigns/_CampaignsWorkspace.tsx` (1182L), `_CampaignCreativeStudio.tsx`; **`contacts/_ContactsWorkspace.tsx` (1494L)** — the CSV rolodex *(overlaps agency/contacts — see hazards)*, `_CommercialPackModal.tsx`.
- `contacts/page.tsx` + `_ContactsIndex.tsx` — the canonical people index; `contacts/[personId]/` `_ContactCard.tsx` (797L) + `_Interactions.tsx`; `contacts/companies/[organisationId]/` — single company record.
- `people/page.tsx` + `_PeopleCommand.tsx` — the **Staff Command** console. Tabs: Overview / Recruitment / **Directory** / Access / Time & leave / Onboarding / Pay. The Directory tab (search + department/status filters, a **"who's around"** presence strip) opens a **per-person tabbed staff card** (Overview / Work / Jobs* / Pay / Access / Leave & shifts / Training / Notes) that aggregates identity + assigned work + days-worked + pay + access + leave + training. **Presence** is a 3-state derivation (online/idle/offline) from work-session heartbeat freshness (`presenceFromSessions`, `PRESENCE_ONLINE_MS`/`PRESENCE_IDLE_MS`) — an abandoned open session reads offline, not online. The **Capacity & hiring** tab is a **read-only** surface of the Radar `team` domain via [`server/staffCapacity.ts`](../../src/server/staffCapacity.ts) (`staffCapacitySnapshot`/`shapeStaffCapacity` → health / attention / capacity-by-area / hiring / coverage buckets; no Radar engine edit). The **Jobs** sub-tab (*freelancers/contractors only) drives the freelancer **one-time-job flow** (`listPeopleFreelancerJobs`/`savePeopleFreelancerJob`/`setPeopleFreelancerJobStatus`, `PeopleFreelancerJob` — proposed→active→delivered→paid; Finance stays the authority on money, linked by `paymentRef`) and shares named HTTP(S) deliverables. Received private freelancer submissions are listed there with guarded download links. The Work tab carries a **delegation** panel (reassign owner/unassigned open tasks — `delegatableTasks` — or create-and-assign, via the existing `/api/portal/tasks`). **Recognition** (`PeopleRecognition`, `awardPeopleRecognition`/`currentEmployeeOfMonth`, `award-recognition` action) marks an **employee of the month** (⭐ on the row + card header + Overview banner) and shoutouts. The **Time & leave** tab opens with a **holidays calendar** (`HolidaysCalendar`) — a month grid of approved leave + published shifts across the team. The **Org chart** tab (`staffOrgChart` → `OrgChart`) renders the reporting-line tree from `managerEmployeeId` (owner on top, freelancers as a distinct layer, department composition, cycle-safe `unplaced` list); the card Overview's **"Reports to"** select edits `managerEmployeeId`. **Configurable process** (`PeopleProcessConfig`, `getPeopleProcessConfig`): an onboarding-template editor (Onboarding tab) shapes what new hires get; a hiring-process editor (Recruitment tab) sets each stage's label + guidance — **stage ids stay fixed** so the Radar `team` reads keep working. **Staff contracts** (`PeopleContract`, reuses `contractTemplates`): a **Contracts** tab (all staff contracts grouped by status) + a per-card Contracts sub-tab (draft from template/blank → send for sign-off); the staff member reviews + acknowledges (types their name) in their progression station (`MyContracts`). Distinct from client contracts (`client.metadata.contracts`) and the Legal vault — a unified cross-domain contracts view doesn't exist yet. The **owner** appears as a derived card (synthetic `owner:<userId>`, not a seeded record). Data comes from `peopleSnapshot` → `staffDirectory`/`staffCard` in [`server/people.ts`](../../src/server/people.ts). Canonical staff spine is `PeopleEmployee` (see [hazards](hazards-and-duplication.md): agency-hr's `Staff` is a separate, to-be-reconciled directory). Plan: [staff-team-system](../development/plans/staff-team-system.md).
- `phases/page.tsx` (+ `_AddCustomPhaseForm`, `_PhaseCardActions`), `phases/[phaseId]/` + `_PhaseEditorForm.tsx`.

**Company — `company/`**
- `_CompanyWorkspace.tsx` (704L), `_CompanyConnectionsWorkspace.tsx`, `_TradingCompaniesPanel.tsx`, `_LegalCompliancePanel.tsx`.

**Fulfilment — `fulfilment/`**
- `page.tsx` (services/delivery hub, `products` view redirects to services), `_FulfilmentWorkspace.tsx` (558L).
- ⚠ `technical/{performance,toolkit,vault,workflow,website}/page.tsx` + `technical/projects/[projectId]/page.tsx` **all re-export the matching `development/*` pages (aliases).**

**Development — `development/`**
- `_DevelopmentDashboard.tsx`, `_DevelopmentNav.tsx`, `_DevelopmentPortfolio.tsx`, `_DevelopmentToolkitWorkspace.tsx` (481L) + `_loadDevelopmentData.ts`.
- `code/_CodeWorkspace.tsx`, `website/_WebsiteWorkspace.tsx`, `projects/[projectId]/_FirstPartyProjectWorkspace.tsx` (675L); thin pages `performance/`, `toolkit/`, `vault/`, `workflow/`.

**Marketing / Performance / Aqua-Tags**
- `marketing/page.tsx` (1035L, also serves the `automations` view) + `_marketingViews.ts` (**the view/channel/section resolver — routing lives here, not in the page**), `_MarketingCommandSurfaces.tsx` (463L — pulse / radar / funnel / campaign-attribution / audience-evidence panels), `_FunnelsWorkspace.tsx` (897L), `_MarketingChannelsWorkspace.tsx` (403L), `_CustomerProfilesWorkspace.tsx` (455L).
  **Ten views became five on 2026-08-20:** `pulse` (default; carries the `pulse` + `radar` sections) · `demand` (`funnel` + `campaigns` + `sources`) · `customers` · `channels` (the five channel tabs **plus** the funnel builder, via `?channel=`) · `automations`; `client-services` is demoted to a header link but still addressable. **No retired `?view=` may die** — `RETIRED_MARKETING_VIEWS` (`_marketingViews.ts:87`) maps `overview`/`radar`/`campaigns`/`sources`/`funnels`/`customer-profiles` and the five old channel names onto their new home, and lands the old block *first* so a `?view=sources` bookmark opens on lead sources rather than three screens above them.
- `automations/page.tsx` (→ `marketing?view=automations`) + `_AutomationsWorkspace.tsx` (769L) + `_automationWorkspaceData.ts`.
- `performance/page.tsx` (249L) + `_PerformanceWorkspace.tsx` (533L), `_AquaTagDashboard.tsx`, `_ExperimentsPanel.tsx`.
- `aqua-tags/page.tsx` + `_AquaTagsWorkspace.tsx` **[new]** — master-tag generator + live domain detect/form-scan + the setup wizard *(steps 1–3 live, 4–6 planned; overlaps `performance/_AquaTagDashboard` — see hazards). Full feature dossier: [aqua-tag.md](aqua-tag.md).*

**Portals — `portals/`**
- `page.tsx` (+ `_PortalsWorkspace`, `_portalWorkspaceData`), `editor/page.tsx`, `forms/page.tsx`, `demo/[template]/page.tsx`.
- ⚠ **`editor/page.tsx` is a DOOR, not the editor.** The editor itself is
  [`src/engines/editor/DevEditor.tsx`](../../src/engines/editor/DevEditor.tsx) — **one universal
  editor**, not a client-portal builder. This route is a thin server page: it loads props via
  `loadPortalStudioProps` (`engines/editor/server/portalStudio.ts`) + `loadEditorAssistant`, then
  mounts `<DevEditor>`. The other door is `dev-team/editor/studio/page.tsx`, and it mounts the
  same component. It used to live here as `editor/_ClientPortalStudio.tsx`; it was moved out on
  **2026-08-21** because sitting inside the portals route kept leaking portal-specific copy at
  people editing a repository. **Edit the engine file, not this page** — and do not re-home it here.

**Products — `products/`**
- `page.tsx` (→ `fulfilment?view=services`) + `_ProductsWorkspace.tsx` (635L); `[productId]/` `_ProductDetailWorkspace.tsx` + `_ProductRolloutCentre.tsx`.

**Radar — `radar/`**
- `page.tsx` + `RadarInspectionWorkspace.tsx` (1008L).

**Settings — `settings/`**
- `page.tsx` + `SettingsTabs.tsx` (632L). Panels: `ActivityLogPanel`, `ExternalAiConnectionPanel` (554L), **`IntegrationConnectionsPanel`** (the reply-account config — *also* mounted in the inbox Channels tab), `PortalEditorPanel`, `ShowcaseModePanel`, `TeamUsersPanel`.

**Other agency sections**
- `assistant/AssistantWorkspace.tsx` (880L), `sop-library/_SopLibrary.tsx` (697L, the canonical SOP library), `sops/page.tsx` (**dead redirect to `/agency` — stale**), `notepad/_NotepadWorkspace.tsx` (590L), `tools/page.tsx`, `you-deserve-it/_YouDeserveItWorkspace.tsx` (712L, rewards).

---

## `clients/` — the client internal workspace (Ed's per-client micro view)

**Root (people / journey hub)**
- `layout.tsx`, `page.tsx` (496L people + journey/commercial/meetings hub), `_PeopleHub.tsx` (760L), `_JourneyCommercialWorkspace.tsx`, `_JourneyMeetingsWorkspace.tsx` (446L), `_IdentityReviewWorkspace.tsx` (person reclassification review).

**Per-client — `clients/[clientId]/`**
- `page.tsx` ⊕ **(1414L, load-bearing)** — the canonical per-client record; server-renders every tab.
- `layout.tsx` — per-client chrome painted with the **client's** brand kit.
- `[...rest]/page.tsx` — client-scope plugin catch-all. `_tabs.ts` — tab metadata (server/client bridge). `toolCopy.ts` — copy strings.

*Header / switchers / shared controls:* `_ClientWorkspaceHeader.tsx`, `_ClientLensHeader.tsx`, `_ClientWorkspaceSwitcher.tsx` (switch a buyer's linked workspaces), `_ClientServiceSwitcher.tsx`, `_OverviewTabs.tsx` (tab nav, persists via `?tab=`), `_PhaseTransitionButton.tsx`, `_BuildPortalWizard.tsx`, `_ClientAdvancedControls.tsx`, `_ClientOperationTaskButton.tsx` / `_ClientOperationsControl.tsx`, `_WebsiteBuilderLauncher.tsx`.

*Tabs* (canonical order from `lib/clientWorkspace`), each → its component(s):
- **overview** → `_ClientWorkspaceHeader` + `_ClientSpineOverview.tsx` ⊕ **(700L)**.
- **relationship** → `_ClientLensHeader` + `_ClientOperatingPlan.tsx` (330L); `_ContractsPanel`/`_PaymentPlansPanel` context.
- **delivery** (label "Fulfilment") → `_ClientFulfilmentHub.tsx`, `_ClientServiceAssignment.tsx`, `_ClientDeliveryOverview.tsx`, `_KanbanTabClient.tsx` (per-client task board), `_ClientSopsTab.tsx`, `_FulfilmentPortalPreview.tsx` (743L).
- **marketing** (label "Social & ads") → external `ClientMarketingServiceWorkspace` (in `src/components/marketing/`).
- **systems** → `_ClientSystemsWorkspace.tsx` (412L), **`_ClientTagWorkspace.tsx` [new]** (per-client tag/monitoring), `_PropertiesTabClient.tsx` (808L), `_ToolsPicker.tsx` ("+ Add system").
- **finance** → `_FinanceTabClient.tsx` (704L), `_ContractsPanel.tsx` (459L), `_PaymentPlansPanel.tsx` (498L).
- **communications** → `_ClientRequestsPanel.tsx`, `_CommsRow.tsx` (WhatsApp/mailto/last-contact).
- **files** → `_FilesTabClient.tsx` (352L).
- **portal** → **`_ClientPortalConnections.tsx` [new]** (431L — the client-software connections manager).
- **notes** (label "Record") → `_ClientRecordWorkspace.tsx` ⊕ **(659L, the chronological record ledger)**, `_ClientContactsPanel.tsx`, `_ClientNotesWorkspace.tsx`.
- Also mounted: `_ClientRadarPanel.tsx`, `_OnboardingDashboardPanel.tsx`.

*Settings — `clients/[clientId]/settings/`:* `page.tsx`, `_ClientDomainSettings.tsx`, `_ClientStatusActions.tsx`, **`_ClientDangerZone.tsx` [new]** (the erasure danger zone).

---

## `customer/` — the shared external portal (end-customer view)
- `layout.tsx` — customer chrome painted with the embedding client's brand; `requireRole("end-customer")`.
- `page.tsx` → `CustomerPortalView section="home"`; `[...rest]/page.tsx` — end-customer plugin catch-all; `_subroute.tsx` — shared resolver.
- `_CustomerPortalViews.tsx` ⊕ **(1728L — the portal view renderer)**, `_CustomerPortalActions.tsx` (875L), `_CustomerPortalChrome.tsx` (508L), `_portalData.ts` (724L), `_PortalPageComposition.tsx` (285L), `_PortalInteractionBlocks.tsx`, `_ProductWorkspaceApplication.tsx` (538L), `_PortalCustomExtension.tsx`, `_PortalBuilderSelectionBridge.tsx`.
- Sub-routes (thin, via `CustomerSubroute`): `affiliate/`, `bookings/`, `membership/`, `orders/`, `account/page.tsx` + **`account/_ConnectedApps.tsx` [new]** (self-disconnect).
  **Bookings contract:** Account activity is resolved from registered, exact-client enabled and
  explicitly operational capabilities. Ecommerce can expose Orders; Bookings remains hidden
  because its direct holding page is not a lifecycle, including under stale install claims. The
  direct URL remains honestly unavailable ([issue #149](../development/issues.md)).
- **Current first-run caveat (2026-08-25):** `/setup` marks the whole welcome complete when the password saves, before its install scene is accepted or dismissed. Repeat visits then redirect to the portal, even though the scene promises its install instructions are available later under Support; `SupportView` contains no such help. Tracked as [issue #134](../development/issues.md).

---

## `team/`, `account/`, `preview/`
- `team/` — people-workspace stations: `layout.tsx`, `page.tsx`, `[section]/page.tsx`, `_TeamWorkspace.tsx`, `_data.ts`. Stations: my-day, actions, calendar, onboarding, leave, training, pay, notes, **progression** ("My growth & company" — role + growth path, company mission/vision/values via `getCompanyProfile`, SOPs via `listSops`, and **upward feedback to the owner** via `submit-feedback` → `PeopleFeedback`). Growth path (`targetRole`/`growthPathNote`) is owner-set on the staff card; feedback is read on the card's Feedback section (`set-feedback-status`).
- `account/` — `page.tsx`, `AvatarUploader.tsx`, `permissions/page.tsx`, `preferences/page.tsx` (**compatibility redirect only**).
- `preview/[template]/page.tsx` — portal template preview (26L).

**Current shared-shell caveat (2026-08-25):** the Profile menu/sidebar exposes
`account/` to client owner/staff and agency staff, but Account, Permissions and
the portal-level 404 still hard-code agency home/settings exits for every
non-customer. Redirect gates may bounce those users afterwards; the visible
recovery target is still wrong. Tracked as [issue #133](../development/issues.md).

---

## `dev-team/` — the internal Dev Team workspace (deployment founder only)

Its own portal scope with its own sidebar and chrome, gated twice (`layout.tsx`
**and** every page re-assert `devDocsAccessible(session)`). The predicate is
separate from the demo-persona switch: local Dev Mode fixtures pass for test
and development, while production accepts only the live `FOUNDER_EMAIL`
account after checking the current user record. Entering it **does not change
who you are**: Ed stays signed in as himself, and identity only changes when he
deliberately inspects a persona in **Tools → Inspector**
(`/portal/dev-team/tools`; the section was called "Profiles" in an earlier draft
of this chapter and never existed under that name on disk).

Vercel output tracing explicitly includes the bounded `docs/`, `src/` and
`scripts/` trees for Dev Team, Dev Docs and their APIs, so the Library,
Librarian, source map and audits can read the checked-in deployment snapshot.
The local working-tree and worker-presence panes remain environment-sensitive:
GitHub-backed editor operations work in production, while a local-disk-only
project must be connected to a repository before production can edit it.

- `layout.tsx` — the gate + the nav. **Every item sets its own `NavItem.icon`**
  (a lucide component matching that section's own `PageHeader`). This is
  load-bearing: the shared `SidebarNavLink` falls back to a generic dot
  (`navIcon()` → `Circle`) for ids it doesn't know, and none of the Dev Team ids
  are in that shared map — so an item added without an icon renders as bare
  text. `smoke-dev-team-portal.test.ts` pins both the icon and its agreement
  with the page header.
- `_ui.tsx` — the shared kit every section uses: `PageHeader` / `Panel` /
  `NavCard` / `Pill` / `EmptyState` + the light palette tokens.
- **Sections — SEVEN, with `?view=` tabs (re-shaped 2026-08-20; it was twelve
  sidebar items — Editor became a first-class row 2026-08-21, which is why the
  table below has seven).** The nav items are `layout.tsx:74-89`, in sidebar
  order Home · Roadmap · Findings · Library · Tools · Editor · Notes.
  **Team chat is NOT one of them** — `layout.tsx` contains zero occurrences of
  "chat". `dev-team/chat/page.tsx` still exists and still renders `TeamChat`; it
  is simply unlinked from the nav:

  | Section | Route | Views (`?view=`) | The real code |
  | --- | --- | --- | --- |
  | **Home** | `/portal/dev-team` | — | `page.tsx` (live launch-blocker strip + section cards) |
  | **Roadmap** | `/roadmap` | `plan` (default) · `now` · `tasks` | `roadmap/_RoadmapWorkspace.tsx`, `working/{_Board,_LiveWorkers,_liveWorkerView}.tsx`, `tasks/{_TasksWorkspace,_thoughtMerge}.ts(x)` |
  | **Findings** | `/findings` | `mine` (default) · `auditor` | `findings/{_FindingsWorkspace,_Section}.tsx`, `auditor/_Section.tsx` |
  | **Library** | `/library` | `docs` (default) · `logs` · `updates` | `library/{_LibraryIndex,_LibraryTree,_LibraryDocViewer,_Section,_paths}`, `logs/{_Section,_changesLabel}`, `updates/{_Section,_UpdateComposer}` |
  | **Tools** | `/tools` | `inspector` (default) · `editor` · `api` | `inspector/{_Section,InspectorClient}.tsx`, `editor/{_Section,_AppConfigEditor}.tsx`, `api/{_Section,_MasterTagPanel,_McpConnectPanel}.tsx` |
  | **Notes** | `/notes` | — | reuses the agency notepad wholesale — the one section with no `PageHeader`, because that workspace brings its own `<h1>` |
  | **Editor** | `/editor` | — | `editor/page.tsx` → `setup/_DevEditorSetup.tsx` (the **projects workspace**); `editor/studio/page.tsx` mounts the editor itself. Since 2026-08-22 `_DevEditorSetup.tsx` also exports **`DevEditorProjectSettings`** — the project-scoped, editor-skinned panel the Dev Editor's Settings tab mounts (never the whole workspace screen); shared panels (Aqua Tag / Map report / GitHub connect) take a `skin` prop (`SETUP_SKINS`), do not fork them |

  Plus `plans/new/` (writes a real plan file) and `docs/`.

  ⚠ **`/portal/dev-team/editor` is NOT a redirect stub any more (2026-08-21).** It is the Dev
  Editor **projects workspace** — what you have, what each project points at — and "Open editor"
  goes to `editor/studio?project=<id>`, which mounts
  [`src/engines/editor/DevEditor.tsx`](../../src/engines/editor/DevEditor.tsx): the **one
  universal editor**, the same component the agency `portals/editor` door mounts. There is no
  separate portal editor / website editor / code editor. The **app-config** editor is a different,
  smaller thing and still lives at `tools?view=editor` (`editor/_Section.tsx` +
  `editor/_AppConfigEditor.tsx`, in the same directory — don't confuse the two).

  **The old routes are one-line `redirect()` stubs, kept so every bookmark
  and doc link still lands:** `/auditor`→`findings?view=auditor` ·
  `/logs`→`library?view=logs` · `/updates`→`library?view=updates` ·
  `/inspector`→`tools` · `/api`→`tools?view=api` ·
  `/working`→`roadmap?view=now` · `/tasks`→`roadmap?view=tasks`.
  ⚠ **Only `page.tsx` became a stub** — the `_Section.tsx` and workspace files in
  those directories are still the live implementations, imported by the new
  section pages. Edit those; never "restore" a stub. (There is no `profiles/`
  directory — an earlier version of this chapter listed one; the persona-inspect
  surface is `inspector/`, now the Tools default view.)

**The numbers are one model, not three.** `lib/server/devTeamBoard.ts`
(`scanDevTeamBoard` → `composeLanes`) is the single source for the board's four
lanes, the Command Centre station's lane tiles, and the station's nav badge — so
they cannot disagree. Two accuracy contracts live in it:
- **The workers table reconciles over each plan file's `**Status:` line** — a
  worker in trouble drags its plan into Blocked, a complete worker overrides a
  stale "PLAN (not built)".
- **…except a PARKED worker**, which hands the verdict *back* to the plan file.
  A parked row still reads "✅ Phase N complete" about its own slice, and without
  this it reported a not-built plan as shipped. Trouble (🔴) still wins over parked.
  *(The historical example this rule was written from — "mfa-login reported shipped
  while `/api/auth/login` has no MFA step" — **is no longer true of the code**:
  `login/route.ts:320-360` now runs the MFA gate. The contract stands; only the
  example was stale. Corrected 2026-08-20.)*

**The Auditor separates open from historical on evidence.**
`lib/server/devTeamAuditor.ts` keeps every 🔴 ruling the log ever recorded — the
list of rulings is not the list of live problems — and attaches `supersededBy`
to one **only** when an authored later ✅ names the same subject (a newer ✅ entry,
or a ✅ RESOLVED banner), matched on distinctive tokens with "Phase" and audit
vocabulary excluded so Phase 1 can never close Phase 2. The page renders two
labelled groups, "🔴 rulings with no recorded resolution" and "closed by a later
✅ PASS" (which names its closer). **Nothing is ever hidden** — an unmatched
ruling is labelled unresolved, never dropped, because mislabelling something
closed is the one failure that matters. The banner ledger stays the "open now"
signal.

**Command Centre station** — `agency/_DevTeamStation.tsx` is the dark HUD 4th
station (not a mount of the portal page: that carries its own gate, chrome and
header). `agency/page.tsx` decides visibility server-side (`devDocsAccessible`)
so the node is never constructed for anyone else, and computes the badge from
`composeLanes` — count = the Blocked lane, with the open-launch-blocker subset
passed alongside so the label breaks the number down. `?station=devteam` is
accepted by `commandStationMode` **only when the station is visible**, so Ed can
refresh or bookmark it while a hand-typed URL still can't land anyone else on a
station that isn't there.

---

## ⚠ Aliasing / staleness (edit the source, not the alias)
- `agency/fulfilment/technical/*` **re-export** `agency/development/*` — six alias pages; edit `development/` only.
- `agency/command-center` **re-exports** `agency/page.tsx`.
- **Two contacts UIs:** `agency/contacts/` (canonical `_ContactCard`) vs `leads-pipeline/contacts/_ContactsWorkspace` (1494L).
- **Two inbox surfaces:** `agency/inbox/` vs `agency/activity-inbox/`.
- **Aqua-tag analytics twice:** `aqua-tags/_AquaTagsWorkspace` vs `performance/_AquaTagDashboard`.
- **Redirect-only (no UI):** `agency/automations`→marketing, `agency/products`→fulfilment, `agency/sops`→`/agency` (stale), `account/preferences`, `portal/preview`.
- **Expected macro/micro pairs (not bugs):** SOP library vs `_ClientSopsTab`; agency `_PipelineBoard` vs client `_KanbanTabClient`.

_(Full hazard list: [hazards-and-duplication.md](hazards-and-duplication.md).)_
