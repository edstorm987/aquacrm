# Chapter — State layer (`src/server/`)

← Back to [the contents page](../WORKSPACE-FILE-TREE.md)

The source of truth: the in-memory `PortalState` singleton plus all CRUD/domain
functions that read and `mutate` it. **49 files, all flat** (no subdirs). Nearly
every module is a set of pure functions operating on one `PortalState`
collection, gated by `agencyId`.

> **Editing rule:** state changes go through `getState()` / `mutate(fn)` from
> `storage.ts` — never mutate returned objects directly. Add a new collection?
> Add it to `types.ts` `PortalState`, handle its absence with `?? {}` / `??=`.

## Core state & storage (load-bearing)

| File | Purpose |
| --- | --- |
| `types.ts` | **The `PortalState` shape** (~2800 lines): every persisted collection + all domain interfaces/enums (`Agency`, `Client`, `Person`, `AgencyTask`, Radar types, roles). Everything imports from here. |
| `storage.ts` | **Backend + hydration**: the `PortalState` singleton, `ensureHydrated()`, `getState()`, `mutate(fn)`, `flushPendingWrites()`, `reset()`; selects backend (`file`/`memory`/`kv`/`postgres`/`supabase`). Every other file goes through it. |
| `storagePatch.ts` | JSON diff/patch ops (`diffStorageValue`, `applyStoragePatch`) for incremental persistence. |
| `storagePostgres.ts` | Postgres blob backend: pool, `loadBlob`/`saveBlob` of the single state key. |
| `storageSupabase.ts` | Supabase blob backend: `loadBlob`/`saveBlob`/`applyPatch`. |
| `eventBus.ts` | In-process pub/sub (`on`/`emit`/`subscribeForPlugin`) over `AquaEvent`; no persisted state. |

## Tenancy & agency config
- `tenants.ts` — Owns `agencies`, `clients`, `endCustomers`: create/get/list/update for all three.
- `agencyBootstrap.ts` — Orchestrator: `bootstrapAgency` = `createAgency` + seed pipelines + install core plugins.
- `agencySettings.ts` — Owns `agencySettings` incl. **Radar policy config** + advisor defaults.
- `company.ts` — Owns `companyProfiles` (a company's own profile/branding record).

> **Overlap watch:** `company.ts` (self company profile) vs `organisations.ts` (CRM companies contacts belong to) vs `tradingCompanies.ts` (multi-entity trading arms) — three different "company" concepts.

## Users & auth
- `users.ts` — Owns `users`: password hashing/validation, create/lookup/verify, `updateUser`, session rotation, email/welcome flags.
- `userSchemaMigration.ts` — One-shot migrator bumping the users map to `USER_SCHEMA_V`.

## Trading entities & products
- `tradingCompanies.ts` — Owns `tradingCompanies`: CRUD + `recordBelongsToCompany` scoping helper.
- `zimanteTradingCompanies.ts` — Seed helper: `ensureZimanteTradingCompanies` provisions the fixed Zimante trading brands.
- `agencyProducts.ts` — Owns `agencyProducts`: CRUD + `ensureDefaultAgencyProducts` (seeds the standard Website product), `productStatus`.
- `experiencePackages.ts` — Owns `experiencePackages` (client-facing service packages): CRUD.

## CRM: people & organisations
- `persons.ts` — Owns `persons` (canonical CRM contacts): identity resolution/upsert, emails/phones, facets, org suggestions. Retains facets on reclassify.
- `organisations.ts` — Owns `organisations` (CRM companies): upsert/domain matching, candidate/suggestion batching for persons.
- `people.ts` — Owns the **HR module**: `peopleApplications/Employees/LeaveRequests/Shifts/TrainingAssignments`, station access control.

> **Overlap watch:** `persons.ts` = CRM contacts; `people.ts` = HR/staff employees. Similarly named, entirely separate.

## Pipelines, tasks & lifecycle phases
- `pipelines.ts` — Owns `pipelines`/`pipelineCards` (kanban): CRUD, `moveCard`, seed defaults, fulfilment migration, lead→client promotion.
- `tasks.ts` — Owns `tasks`: CRUD, checklist items, `reconcileAgencyTasksWithRadar` (Radar issues → tasks).
- `taskTemplates.ts` — Owns `taskTemplates`: save/list/apply; `createTaskFromTemplate`, `saveTaskAsTemplate`.
- `completedActions.ts` — Owns `completedActions` (what was actually finished): record/list/completionsFor.
- `phases.ts` — Owns `phases` (client-stage lifecycle definitions): CRUD + `getPhaseForClientStage`.
- `phaseApplier.ts` — Async `applyPhaseToClient` — executes a phase's effects against a client.
- `phaseTokens.ts` — `KNOWN_PHASE_TOKENS` + `resolvePhaseTokens` (template-token substitution for phases).

## Client relationships, milestones & lifecycle
- `clientRelationships.ts` — Linked-client workspaces: create/link/unlink, portal-access email, accessible-portal listing.
- `clientMilestones.ts` — Owns `clientMilestones`: CRUD + `syncClientPerformanceMilestones`.
- `performanceExperiments.ts` — Owns `performanceExperiments` (per-client tests): CRUD.
- `clientDelight.ts` — Owns `clientDelight` records: CRUD.
- `clientErasure.ts` — GDPR erasure with a **disposition policy** (not blanket delete): `eraseClientCompletely` (**async**) + `previewClientErasure`. Per plugin install the sweep resolves **hook › retain › delete**: a plugin's `onEraseClient` hook is authoritative (leads-pipeline erases its `contacts/email/<email>` key-PII); `dataDisposition: "retain"` excludes legal-hold data (agency-finance, fulfillment, and for-now ecommerce/affiliates/memberships) — kept, install record kept; otherwise **delete** (client-scoped slice-drop / agency-scoped `clientId` value-scan). Top-level `RETAIN_COLLECTIONS = {clientMilestones}`. The client record is always deleted, so retained finance keeps only the random `clientId` token. **Live scrub** (optional injected `supabase` param — route passes the real admin client, tests a fake): `inbox_*` deleted + a **no-PII audit stub** (count + date span); `brand_enquiries` **anonymised**, split by identity resolution (resolved-as-client → strip PII; separate party → drop link only). Audit `collections` records disposition per area (`retained:* / deleted:* / anonymised:* / hook:*`) + the stub. Finance/contracts/deliverables confirmed NOT reached. See [plugin-data-erasure plan](../development/plans/plugin-data-erasure.md).

## Client portal & product delivery surface
- `clientPortalDesigns.ts` — Owns `clientPortalTemplates`/`clientPortalInstances`: theme/layout records, draft/publish/checkpoint/restore versions.
- `clientPortalSetup.ts` — Async `setupClientStarterPortal` — provisions a starter portal for a new client.
- `portalEditor.ts` — Owns `portalEditor` (`PortalFormEditorState`): form-field editor get/save/delete.
- `productWorkspaces.ts` — Per-client product workspace list on `Client`: read/save/`reconcile`.
- `portalConnectionStore.ts` — **[new]** Owns `portalConnections` (a client's own software linked to their portal): open/accept/withdraw/reset/delete + `resolveWebsiteSourceRouting` sibling.

> **Overlap watch:** four "portal" files — `Designs` (visual theme/layout), `Setup` (provisioning orchestrator), `Editor` (form fields), `ConnectionStore` (external app links). Distinct concerns.

## Website capture & telemetry
- `agencyWebsite.ts` — Owns `agencyWebsites`: page editing + records/summarizes site **telemetry** (visits, search events).
- `websiteSources.ts` — **[new]** Owns `websiteSources`/`agencyMasterTagKeys`: Aqua-tag submission routing (host → inbox/client), master site-key + `masterTagSnippet`.

## Automations & AI
- `automations.ts` — Owns `automationFolders`/`Workflows`/`Runs`: graph validation, CRUD, `triggerAutomations`, `runAutomationWorkflow`, sweep processor.
- `customAIs.ts` — Owns `customAIs` (saved custom assistant configs): CRUD.

## Command Centre: dashboard, calendar, notes
- `dashboardPlanning.ts` — Owns `dashboardDayPlans`/`WeekPlans`/`WorkSessions`: planning snapshots, clock-in/out, heartbeat, work-accountability.
- `commandCalendar.ts` — Owns `commandCalendarEntries` (+ connections/sources/external events): CRUD.
- `notepad.ts` — Owns `notepadFolders`/`notepadNotes` (per user): folder/note CRUD.

## Content, docs & dev toolkit
- `sops.ts` — Owns `sops`: written/file SOP CRUD + category management.
- `legalDocuments.ts` — Owns `legalDocuments`: CRUD.
- `contractTemplates.ts` — Owns `contractTemplates`: CRUD.
- `developmentToolkit.ts` — Owns `developmentResources`/`developmentWorkflows`: CRUD, password reveal, default workflow seeding.

## Plugins & activity log
- `pluginInstalls.ts` — Owns `pluginInstalls`: install-id keying, scope-based listing, upsert/patch/delete. (Note: the `pluginData` collection is written elsewhere — via `lib/server/pluginStorage.ts`.)
- `activity.ts` — Owns `activity[]` audit log: `logActivity`, `listActivity`/`queryActivity`, value redaction.

## ⚠ Radar has no file here
`PortalState` holds `radarMemory`, `radarSyntheticProbes`, `radarEvidence`, and
`operationalAlertPreferences`, but **no `radar*.ts` module lives in
`src/server/`**. Only `agencySettings.ts` (policy config) and `tasks.ts`
(`reconcileAgencyTasksWithRadar`) touch Radar here; the Radar
evaluation/runtime that writes those collections lives in `src/lib/server/`
(see the [shared-logic chapter](shared-logic.md)). Confirm before editing
anything Radar-related.
