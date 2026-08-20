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

---

## `agency/` — Ed's macro / portfolio view + Command Centre

**Routing & chrome**
- `layout.tsx` — agency-scoped chrome, painted with the agency brand kit; sidebar built from the agency's plugin installs.
- `page.tsx` — `/agency` home: the pipelines hub (every pipeline as a card). **Load-bearing.**
- `[...rest]/page.tsx` — agency catch-all; resolves URL → workspace tool manifest, renders inside agency chrome.
- `command-center/page.tsx` — **re-exports the agency root `page.tsx` (alias).**

**Command Centre / founder-home components**
- `_DashboardCommandCenter.tsx` ⊕ **(2469L)** — the Command Centre dashboard shell.
- `_CommandIntelligenceWorkspace.tsx` (875L) — command intelligence / KPI workspace.
- `_CommercialIntelligenceWorkspace.tsx` — commercial intelligence summary.
- `_CommandCentreKpiTrajectory.tsx`, `_CommandDeckPopup.tsx`, `_CommandStationNav.tsx`.
- `_DayBriefingPanel.tsx` / `_DayCommandSensorPanel.tsx` / `_DayKpiIntelligencePanel.tsx` — daily briefing / sensor / KPI panels.
- `_FounderDashboardKpis.tsx`, `_AgencyActivityFeed.tsx` ("today across the agency").
- `_BattleTableWorkspace.tsx` (652L), `_BrandPortfolioInstrument.tsx`, `_CapitalOwnershipWorkspace.tsx`.
- `_ClockOutReviewDialog.tsx`, `_QuarterlyStrategyReview.tsx`, `_WeeklyReviewWorkspace.tsx`.
- `_DynamicRadarConsole.tsx`, `_RadarPolicyPanel.tsx`, `_RadarScanControl.tsx` (radar console / policy / scan trigger).
- `_NewClientButton.tsx` — inline "+ New client" modal.

**Master Inbox — `inbox/`**
- `page.tsx` — the master inbox route. *(Dev/demo sessions load ZERO enquiries here — `session.isDemo ? []`.)*
- `_MasterInbox.tsx` ⊕ **(697L)** — the unified attention inbox.
- `_EnquiryDetailCard.tsx` **[new, 330L]** — the per-enquiry **detail modal**, opened from the inbox for the selected enquiry. Mirrors the submission in two layers — **A)** every `formCapture` field in the form's own submission order + the answers Aqua has no column for (shown in full, not just counted); **B)** Aqua's own contact record (consent-first, then classification, services, source, triage, timeline, linked lead/contact/client) — and reuses `_EnquiryCommunications`. Extracted from `_MasterInbox`'s old inline expand (which took the `FormSubmission`/`Detail`/route-style helpers with it). **Phase 3:** Layer A now mirrors the *whole* real form when its schema is imported — the card fetches `GET /api/portal/website-enquiries/form-template` (→ `resolveFormSchemaForEnquiry`) on open and lays the submission out via the pure `lib/enquiryFormLayout.ts` `mergeFormLayout` (every field in order, blank where skipped), falling back to the raw submission when no template matches. **Phase 4:** Layer B has an editable **"Added by hand"** block (`ManualContactDetails`) — company/job-title/notes/custom fields the form didn't ask — saved to the new file-backed `server/enquiryContactDetails.ts` store via `GET/POST /api/portal/website-enquiries/contact-details` (never the live enquiry row or `people.ts`). **Phase 5 (polish):** genuinely-empty fields render a muted "—" via `Field` (never an invented value); meaningful distinctions kept. **Plan COMPLETE (P1–P5).** Two enhancements remain as commander-coordinated follow-ups beyond the plan: manual details → canonical `Person` on conversion; inline lead/contact/client re-linking.
- `_UnifiedInboxWorkspace.tsx` (442L), `_EnquiryCommunications.tsx`.
- `_SocialInboxWorkspace.tsx` — the Meta/IG social conversations + a **Channels** connection block. When Meta creds aren't stored yet it shows a **"Connect now"** form (`MetaConnectForm`) that saves the `meta` integration connection — fields come from `integrationDefinition("meta")`, POST to `/api/portal/settings/integrations`, then `router.refresh()` re-runs readiness and the Instagram/Facebook OAuth buttons replace the form. **Multi-account (one app, many IG/FB):** the OAuth connect result (`?meta=…&connected=N`) surfaces as a dismissible banner (`metaConnectNotice`), the connect buttons read "Add Instagram/Facebook" once ≥1 account is connected, and each account shows in the list with a connected-count + a "Routed" badge (connect-time routing via `meta/start?marketingAssetId=…&companyId=…`). Plan: [meta-inbox-connect](../development/plans/meta-inbox-connect.md).
- `_WebsiteSourcesConfig.tsx` **[new]** — website inbox source configuration (routing + master-tag entry point). Also hosts the **"Import forms"** action (enquiry-detail-card plan Phase 2): reads a tagged site's real forms via `server/websiteFormSchemas.ts` → `scanFormSchemasInHtml` (in `lib/server/aquaTagDetection.ts`), stores each form's field schema on `WebsiteSiteConfig.formSchemas`, and shows "N forms found" + a chip per form. The schema then drives the enquiry card's layout (plan Phase 3).
- `activity-inbox/page.tsx` — `/agency/activity-inbox` feed *(overlaps inbox — see hazards).*

**Actions — `actions/`**
- `_ActionsWorkspace.tsx` (1203L), `_ActionsPage.tsx`, `_TodayView.tsx`; `calendar/page.tsx` reuses the actions page.

**Journey — pipelines / leads / contacts / people**
- `pipelines/[slug]/page.tsx` — single-pipeline kanban; `_LeadsPipelineWorkspace.tsx` ⊕ **(2689L — the biggest UI file)**, `_LeadsPipelineWorkspaceServer.tsx` (data loader), `_PipelineBoard.tsx`, `_ScoutingCommand.tsx` (718L), `_FulfilmentProductSwitcher.tsx`.
- `leads-pipeline/` — `_UpcomingMeetings.tsx`, `_WorkflowSteps.tsx`; `campaigns/_CampaignsWorkspace.tsx` (1182L), `_CampaignCreativeStudio.tsx`; **`contacts/_ContactsWorkspace.tsx` (1494L)** — the CSV rolodex *(overlaps agency/contacts — see hazards)*, `_CommercialPackModal.tsx`.
- `contacts/page.tsx` + `_ContactsIndex.tsx` — the canonical people index; `contacts/[personId]/` `_ContactCard.tsx` (797L) + `_Interactions.tsx`; `contacts/companies/[organisationId]/` — single company record.
- `people/page.tsx` + `_PeopleCommand.tsx` — the **Staff Command** console. Tabs: Overview / Recruitment / **Directory** / Access / Time & leave / Onboarding / Pay. The Directory tab (search + department/status filters, a **"who's around"** presence strip) opens a **per-person tabbed staff card** (Overview / Work / Jobs* / Pay / Access / Leave & shifts / Training / Notes) that aggregates identity + assigned work + days-worked + pay + access + leave + training. **Presence** is a 3-state derivation (online/idle/offline) from work-session heartbeat freshness (`presenceFromSessions`, `PRESENCE_ONLINE_MS`/`PRESENCE_IDLE_MS`) — an abandoned open session reads offline, not online. The **Capacity & hiring** tab is a **read-only** surface of the Radar `team` domain via [`server/staffCapacity.ts`](../../src/server/staffCapacity.ts) (`staffCapacitySnapshot`/`shapeStaffCapacity` → health / attention / capacity-by-area / hiring / coverage buckets; no Radar engine edit). The **Jobs** sub-tab (*freelancers/contractors only) drives the freelancer **one-time-job flow** (`listPeopleFreelancerJobs`/`savePeopleFreelancerJob`/`setPeopleFreelancerJobStatus`, `PeopleFreelancerJob` — proposed→active→delivered→paid; Finance stays the authority on money, linked by `paymentRef`). The Work tab carries a **delegation** panel (reassign owner/unassigned open tasks — `delegatableTasks` — or create-and-assign, via the existing `/api/portal/tasks`). **Recognition** (`PeopleRecognition`, `awardPeopleRecognition`/`currentEmployeeOfMonth`, `award-recognition` action) marks an **employee of the month** (⭐ on the row + card header + Overview banner) and shoutouts. The **Time & leave** tab opens with a **holidays calendar** (`HolidaysCalendar`) — a month grid of approved leave + published shifts across the team. The **Org chart** tab (`staffOrgChart` → `OrgChart`) renders the reporting-line tree from `managerEmployeeId` (owner on top, freelancers as a distinct layer, department composition, cycle-safe `unplaced` list); the card Overview's **"Reports to"** select edits `managerEmployeeId`. **Configurable process** (`PeopleProcessConfig`, `getPeopleProcessConfig`): an onboarding-template editor (Onboarding tab) shapes what new hires get; a hiring-process editor (Recruitment tab) sets each stage's label + guidance — **stage ids stay fixed** so the Radar `team` reads keep working. **Staff contracts** (`PeopleContract`, reuses `contractTemplates`): a **Contracts** tab (all staff contracts grouped by status) + a per-card Contracts sub-tab (draft from template/blank → send for sign-off); the staff member reviews + acknowledges (types their name) in their progression station (`MyContracts`). Distinct from client contracts (`client.metadata.contracts`) and the Legal vault — a unified cross-domain contracts view is not built. The **owner** appears as a derived card (synthetic `owner:<userId>`, not a seeded record). Data comes from `peopleSnapshot` → `staffDirectory`/`staffCard` in [`server/people.ts`](../../src/server/people.ts). Canonical staff spine is `PeopleEmployee` (see [hazards](hazards-and-duplication.md): agency-hr's `Staff` is a separate, to-be-reconciled directory). Plan: [staff-team-system](../development/plans/staff-team-system.md).
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
- `marketing/page.tsx` (895L, also serves `automations` view) + `_FunnelsWorkspace.tsx` (897L), `_MarketingChannelsWorkspace.tsx`, `_CustomerProfilesWorkspace.tsx`.
- `automations/page.tsx` (→ `marketing?view=automations`) + `_AutomationsWorkspace.tsx` (769L) + `_automationWorkspaceData.ts`.
- `performance/page.tsx` (249L) + `_PerformanceWorkspace.tsx` (533L), `_AquaTagDashboard.tsx`, `_ExperimentsPanel.tsx`.
- `aqua-tags/page.tsx` + `_AquaTagsWorkspace.tsx` **[new]** — master-tag generator + live domain detect/form-scan + the setup wizard *(steps 1–3 live, 4–6 planned; overlaps `performance/_AquaTagDashboard` — see hazards). Full feature dossier: [aqua-tag.md](aqua-tag.md).*

**Portals — `portals/`**
- `page.tsx` (+ `_PortalsWorkspace`, `_portalWorkspaceData`), `editor/_ClientPortalStudio.tsx` (1266L — the client-portal builder), `forms/page.tsx`, `demo/[template]/page.tsx`.

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

---

## `team/`, `account/`, `preview/`
- `team/` — people-workspace stations: `layout.tsx`, `page.tsx`, `[section]/page.tsx`, `_TeamWorkspace.tsx`, `_data.ts`. Stations: my-day, actions, calendar, onboarding, leave, training, pay, notes, **progression** ("My growth & company" — role + growth path, company mission/vision/values via `getCompanyProfile`, SOPs via `listSops`, and **upward feedback to the owner** via `submit-feedback` → `PeopleFeedback`). Growth path (`targetRole`/`growthPathNote`) is owner-set on the staff card; feedback is read on the card's Feedback section (`set-feedback-status`).
- `account/` — `page.tsx`, `AvatarUploader.tsx`, `permissions/page.tsx`, `preferences/page.tsx` (**compatibility redirect only**).
- `preview/[template]/page.tsx` — portal template preview (26L).

---

## `dev-team/` — the internal Dev Team workspace (founder + Dev Mode only)

Its own portal scope with its own sidebar and chrome, gated twice (`layout.tsx`
**and** every page re-assert `devDocsAccessible(session)` — founder + Dev Mode,
so it does not exist in any production-like context). Entering it **does not
change who you are**: Ed stays signed in as himself, and identity only changes
when he deliberately inspects a persona in **Profiles**.

- `layout.tsx` — the gate + the nav. **Every item sets its own `NavItem.icon`**
  (a lucide component matching that section's own `PageHeader`). This is
  load-bearing: the shared `SidebarNavLink` falls back to a generic dot
  (`navIcon()` → `Circle`) for ids it doesn't know, and none of the Dev Team ids
  are in that shared map — so an item added without an icon renders as bare
  text. `smoke-dev-team-portal.test.ts` pins both the icon and its agreement
  with the page header.
- `_ui.tsx` — the shared kit every section uses: `PageHeader` / `Panel` /
  `NavCard` / `Pill` / `EmptyState` + the light palette tokens.
- Sections: `page.tsx` (Home — live launch-blocker strip + section cards) ·
  `findings/` · `working/` (the four-lane board + `_LiveWorkers`) · `library/`
  (reuses the dev-docs backend) · `docs/` · `auditor/` · `profiles/` ·
  `editor/` · `api/` · `updates/` · `notes/` (reuses the agency notepad
  wholesale — the one section with no `PageHeader`, because that workspace
  brings its own `<h1>`) · `plans/new/` (writes a real plan file).

**The numbers are one model, not three.** `lib/server/devTeamBoard.ts`
(`scanDevTeamBoard` → `composeLanes`) is the single source for the board's four
lanes, the Command Centre station's lane tiles, and the station's nav badge — so
they cannot disagree. Two accuracy contracts live in it:
- **The workers table reconciles over each plan file's `**Status:` line** — a
  worker in trouble drags its plan into Blocked, a complete worker overrides a
  stale "PLAN (not built)".
- **…except a PARKED worker**, which hands the verdict *back* to the plan file.
  A parked row still reads "✅ Phase N complete" about its own slice, and without
  this it reported a not-built plan as shipped (mfa-login did exactly that while
  `/api/auth/login` has no MFA step at all). Trouble (🔴) still wins over parked.

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
