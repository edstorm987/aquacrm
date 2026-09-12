# AquaCRM full-build feature gap map — 2026-09-12

Status: current-source map, not acceptance evidence. The recovered integration
tree is changing concurrently. Graphify was used for navigation; every finding
below was checked against direct source. No live service was queried.

Repository root used below: `aquaCRM-sales-workflow-recovered-20260912/portal`.

| Requested capability | Current truth | Primary evidence | Required gate |
| --- | --- | --- | --- |
| Scouting → Researching → Outreach → Meetings → Inbox → Contacts, also exposed as Journey tabs | Implemented locally, not accepted | `src/components/sales/SalesAcquisitionTabs.tsx`; `src/app/portal/agency/{scouting,researching,prospecting,meetings}`; `src/app/portal/agency/_SalesProspectWorkspacePage.tsx` | `SALES-001` |
| Sales staff can operate the flow | Missing: current pages/APIs are owner/manager only | `_SalesProspectWorkspacePage.tsx`; Agency Marketing `src/api/routes.ts`; Meetings and Clients pages | `SALES-STAFF-ACCESS-001` |
| Power dialler plus email, DM/SMS/WhatsApp/in-person and callback plans | Implemented locally as one-recipient operations, not an auto-dial/bulk-send engine; not accepted | `_ScoutingCommand.tsx`; `CallControls.tsx`; `EmailControls.tsx`; `src/server/telephony/prospectOutreach.ts` | `SALES-001`, provider release gates |
| Dynamic scripts/playbooks through canonical SOPs | SOP Library already supports searchable written, interactive and uploaded resources, categories/tags and composed guides, but Sales does not yet reference it | `src/engines/sop/server/{sops,sopReferences,sopGuides}.ts`; `src/app/portal/agency/sop-library/_SopLibrary.tsx`; no `sopId` reference exists in current Sales surfaces | `SOP-WORKFLOW-LINKS-001` |
| Google Maps scouting | Partial and provider-dependent | `_GoogleBusinessScout.tsx`; `_ScoutingWorkspaceServer.tsx`; `docs/google-maps-scouting.md` | `SALES-001`, restricted Maps Embed key later |
| Arbitrary in-app Google/general web browser | Not viable as a raw iframe | `_ScoutingCommand.tsx`; `src/lib/security/contentSecurityPolicy.ts` | Keep supported Maps Embed plus opener-isolated external research tabs. Aqua CSP cannot override a publisher's `X-Frame-Options`/`frame-ancestors`. Do not promise `google.com` iframe support. |
| Claffy/CSV/TSV/XLSX contact import with header mapping | Implemented locally with 5 MiB/500-row bounds, mapping and dedup; not accepted | `_ProspectImportDialog.tsx`; Agency Marketing handlers; `_PeopleHub.tsx` | `SALES-001` |
| Research notes, activity history, actor labels and last-contact context | Mostly implemented | Agency Marketing prospect domain/server; `_ScoutingCommand.tsx`; `meetingsFeed.ts`; `_JourneyMeetingsWorkspace.tsx` | `SALES-001`; `SALES-ATTRIBUTION-001` only for per-worker quota metrics |
| One canonical acquisition history | Functional flow exists, semantic registry contradicts it | persisted Prospect in Agency Marketing `lib/domain.ts` and `server/prospects.ts`; `semanticRegistry.ts` still says Prospect is not separate | `SEMANTICS-SALES-001` |
| Contacts | Canonical People-backed view exists; legacy plugin Rolodex duplicates the concept | `/portal/clients?view=contacts`; `_PeopleHub.tsx`; leads-pipeline `_ContactsWorkspace.tsx` | `CONTACTS-CANON-001` |
| Custom Kanban boards, movement, notes and fields | Substantial partial build: create/delete, drag/move and optional note text exist; later column editing, typed notes/custom fields and concurrency history are missing | `_JourneyKanbansDesk.tsx`; `_CustomBoardWorkspace.tsx`; pipeline board/card APIs | `BOARD-001` finish/harden, not rebuild |
| Unified role-gated Radar | Partial: founder lens exists, My Radar and Business Radar remain separate topbar controls | `sidebarLayout.ts`; `departmentLens.ts`; `focusLockdown.ts`; `Topbar.tsx`; `topbarControls.ts`; `MyRadarQuickLookPanel.tsx` | `CHROME-RADAR-001` |
| Understandable Command Centre workspaces | Existing KPI/Radar/War Room functions exist; requested information architecture does not | `_CommandStationNav.tsx`; `_DashboardCommandCenter.tsx`; `_CommandIntelligenceWorkspace.tsx`; `_ExecutiveCommandWorkspace.tsx`; `_BattleTableWorkspace.tsx` | `COMMAND-001` refactor existing architecture |
| One authorised app-development workspace switch | Partial | `DevConsoleControl.tsx`; `DevConsolePanel.tsx`; `/portal/dev-workspace`; `sidebarLayout.ts` | `DEV-SWITCH-001` |
| Sticky Settings rail and independent settings-pane scroll | Implemented and behaviorally corroborated, but exact slice `1cc13b2d` is rejected P2 for a false evidence comment rather than a CSS defect | `SettingsTabs.tsx`; Agency layout; `reviews/SETTINGS-SCROLL-001-1cc13b2d.md` | `SETTINGS-SCROLL-001` narrow evidence correction/re-review |
| Saved-tab controls survive sidebar placement; Reset restores canonical placement | Partial: row controls exist, reset does not restore placed saved tabs | `SavedRowControls.tsx`; `WorkspaceLayoutPanel.tsx`; `pinnedTabsStore.ts` | `CHROME-SAVED-001` |
| Per-user custom sidebar link/embed/code | Missing. Arbitrary code would be stored XSS | Saved-tool server types/URL validation; `lib/chrome/workspaces.ts` | `CHROME-EMBED-001`: validated HTTPS or opaque-origin sandbox only, never Aqua-origin code/cookies/secrets/CRM bridge |
| Inactivity check-in prompt | Exact decision extraction independently accepted at `7bfe9ffc`; authenticated real-account usability remains human acceptance | `SmartWorkSessionMonitor.tsx`; `workSessionCheckIn.ts`; `reviews/CHECKIN-UX-001-7bfe9ffc.md` | Accepted source slice; final human usability |
| New login background/layout, CAPTCHA and Policies | Visual/contrast correction is accepted in isolation through `d8042433`; combined candidate is rejected while global skip focus and exact tenant/client recovery/OAuth context are corrected. Destination is Privacy because canonical Terms is not always served | Login page/form; `BotChallenge.tsx`; `reviews/LOGIN-ROUTE-INTEGRATION-001-d8dd30bb.md` | `LOGIN-CONTEXT-001`; policy route truth before release |
| Client custom-domain portal and `/aqua` routing | Missing despite settings copy: current route stores only `Client.websiteUrl` | client-domain API/settings UI; middleware/proxy/Next rewrites | `DOMAIN-001` |
| Complete current semantics, search/reference docs, Graphify and duplicate classification | Incomplete and stale until code freezes | semantic contradiction above; recovered tree lacks a current full graph | `SEMANTICS-SALES-001` → `SYSTEM-001` |

## Architecture decisions now pinned

- Prospect is a distinct persisted acquisition dossier linked to canonical
  Person/Lead lineage. The semantic registry must reflect that before final
  regeneration.
- People is the canonical contact/identity system. The legacy leads-pipeline
  Rolodex is migration/compatibility surface, not another source of truth.
- Scripts, playbooks, checklists and training material remain canonical SOP
  Library records or composed SOP Guides. Sales and other workflows store
  tenant-validated references, open them through a searchable picker, and let
  authorised users create a new SOP without leaving the workflow. They do not
  hardcode duplicate script content. Outreach/activity audit records retain the
  selected SOP id and the SOP `updatedAt`/content fingerprint observed when the
  action began so later edits do not rewrite history.
- Research uses the supported Google Maps embed where configured and safe
  external tabs for arbitrary sites. No app can force third-party publishers to
  allow framing.
- User-added code never runs inside the Aqua origin. Future custom tools are
  validated links or opaque-origin sandbox embeds with no CRM secrets/bridge.
- `client-domain` is not a custom-domain implementation until verified host
  ownership, exact tenant resolution, TLS/DNS workflow, cookies/auth callbacks,
  canonical URLs and conflicts are handled.

## De-duplicated implementation order

1. Finish active `SEC-006-PASS4`, `LOGIN-CONTEXT-001` and
   `BRAND-ERASURE-001` with fresh independent acceptance; plugin lineage and the
   isolated login visual/contrast slices are already accepted.
2. Complete `SALES-001` without rebuilding its existing acquisition surfaces.
3. Connect the accepted Sales flow to canonical searchable SOP/Guide references,
   then run Sales-staff and the narrow Settings evidence correction. Check-in's
   source slice is accepted; retain only its final human usability gate.
4. Complete the Radar, saved-tab and Dev-switch chrome children; roll them up
   under `CHROME-001`.
5. Finish/harden boards, then refactor Command Centre workspaces.
6. Implement custom-domain routing and the security-designed custom tool/embed
   model after shared auth/chrome ownership is free.
7. Reconcile Sales semantics and legacy Contacts classification.
8. Freeze source, regenerate authored docs/search/reference/Graphify, classify
   duplicates, then run full verification and the human release gate.

## Known misleading or stale statements to correct at the owning gate

- `client-domain` UI copy currently implies a website URL is used across the
  portal; no host router exists.
- a historical development-status statement says the Dev Team control plane is
  live in production; that is not current-release proof and needs a historical
  banner.
- login speaks of one Policies destination, but the rendered route is Privacy.
- source presence of the inactivity monitor is not proof the check-in appears.
- the older canonical Graphify graph predates this recovered tree and cannot be
  cited as current evidence.
