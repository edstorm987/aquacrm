# Dev Editor Engine installed into a client workspace (queue #7)

**Status:** PLAN — blocked on Ed's standing tier questions (dev-editor-engine.md: tier count, whose repo a client install commits to, same-routes-vs-separate-mounts). Captured 2026-08-21, autonomous loop.

## Proven current state

**Install machinery (the ride):**
- Install unit = `PluginInstall` keyed `${agencyId}|${clientId ?? "_agency"}|${pluginId}` with `features: Record<string, boolean>`, `config`, `setupAnswers` — `src/server/pluginInstalls.ts:24-26,69-99`. Runtime install with scope policy: `src/built-ins/runtime/_runtime.ts:106-120`; feature defaults from manifest `_runtime.ts:76-80`.
- Feature gate read-side exists — `isFeatureEnabled` `_runtime.ts:293-297` — but grep shows **zero consumers** anywhere outside the runtime file. The features map is currently write-only.
- Tier-bundle machinery exists: `AquaPreset`/`PresetPluginEntry` with per-plugin `features` overrides + rollback `applyPreset` — `src/built-ins/runtime/_types.ts:603-617`, `_runtime.ts:322-345`. Foundation preset list is **empty** (`src/built-ins/runtime/_presets.ts:9-12`); fulfillment phase presets install plugin-id bundles per lifecycle phase, no feature overrides (`src/built-ins/modules/fulfillment/src/server/presets.ts:81-151`).

**How a module is injected into a client workspace today (website-editor is the model):**
- Manifest declares full-URL client pages (`/portal/clients/[clientId]/editor`, `/edit-website`, …) — `src/built-ins/modules/website-editor/index.ts:38-106`; its display name is already "Dev Editor Engine" (`index.ts:14`) and it declares tier-shaped features (`simpleEditor`, `advancedEditor`, `codeView`, … `index.ts:167-176`).
- Mount point: the client catch-all `src/app/portal/clients/[clientId]/[...rest]/page.tsx:30-58` resolves URL→plugin page via `resolveClientPluginPage` (conventions at `src/built-ins/runtime/_routeResolver.ts:4-33`) and renders it with `PluginPageProps` inside the client chrome.
- Install flow model: `_WebsiteBuilderLauncher.tsx:34-43` POSTs `/api/portal/fulfillment/marketplace/install {clientId, pluginId:"website-editor"}` then navigates; marketplace service wraps `runtime.installPlugin` (`src/built-ins/modules/fulfillment/src/server/marketplace.ts:107`, routes `src/built-ins/modules/fulfillment/src/api/routes.ts:50-51`).
- Chrome caveat: the client workspace sidebar is **hardcoded** (`src/app/portal/clients/[clientId]/layout.tsx:73-108`) — plugin `navItems` merge only in agency-scope callers (`src/app/portal/agency/layout.tsx:74`, `src/app/portal/clients/page.tsx:381`; merge loop `src/lib/chrome/sidebarLayout.ts:142-152`). An installed plugin is reachable in a client workspace via catch-all URL + CTAs/phase `sidebarOverride` (`layout.tsx:150-163`), not via auto nav.

**What "Dev Mode in a client workspace" would mount:**
- The engine surfaces already exist as founder-only static routes: Dev Team editor mounts `CodeWorkspace` (`src/app/portal/dev-team/editor/page.tsx:33-47`), gated `devDocsAccessible` = founder AND `canUseDevMode()` which is **dev-env only** (`src/lib/server/dev/devDocs.ts:72-74`, `src/lib/server/dev/devModeAccess.ts:20-23`).
- `CodeWorkspace` is a self-contained client component fetching `/api/portal/dev/projects` (`_CodeWorkspace.tsx:55-77`); site-editor files API resolves the selected DevProject's own token, `requireRole(AGENCY_ROLES)` (`src/app/api/portal/site-editor/files/route.ts:79-111`).
- `DevProject` binds {type software/website/portal, repo, github/vercel connection ids, aquaTagSiteId}, agency-scoped, validated — `src/lib/server/dev/devProjects.ts:25-101`, type `src/server/types.ts:2663`; API roles: list=any agency role, write=owner/manager (`src/app/api/portal/dev/projects/route.ts:38,65`).
- The engine already routes itself INTO client workspaces: `visualEditorDoor` sends website projects to `/portal/clients/{id}/edit-website` with activate-first install, portal projects to Portal Studio (`src/app/portal/agency/development/code/visualEditorDoor.ts:32-44`).

**What the install tiers would ride on:**
- `EDITING_MODES` simple/visual/developer, tab-gated (`src/engines/editor/editing/modes.ts:27-48`) — consumed only by `_ClientPortalStudio.tsx:18,132,147` as ephemeral `useState("visual")`; not persisted, not connected to install features.
- Prior art already written: dev-editor-engine.md phases 3-5 + open tier questions (`docs/development/plans/dev-editor-engine.md:45-47,97-104,112-115`); 4th "Dev Team" editing mode + overlay-IP constraint (`docs/development/plans/aqua-engine-and-dev-team-plugin.md:25-35`); three portal tiers + missing list incl. "tier on client record" and "editor scoped to a client's repository" (`docs/portal-tiers-and-fractal-fulfilment.md:17-35,87-105`).
## What is genuinely missing

1. No installable unit for the engine's code+git side — `CodeWorkspace`/dev-team are static founder+dev-env routes; nothing a marketplace install can put in a client workspace (website-editor plugin ships blocks only).
2. Features map → behavior link: `isFeatureEnabled` unconsumed; declared features (`codeView` etc.) gate nothing; editing modes not driven by install features. The "tier" is currently a UI dropdown anyone can flip.
3. Client-scoped repo permission model: DevProject has no `clientId`; site-editor APIs are agency-wide (portal-tiers doc missing #4) — a client-workspace mount today would expose every agency project.
4. Client-workspace nav/CTA for the engine (sidebar hardcoded; only phase overrides or launcher-style CTAs exist).
5. Tier definitions as presets: `AquaPreset` machinery exists, zero engine presets defined; no per-client hardcodable tier record.
6. The GitHub+AquaTag+Vercel one-shot setup flow: pieces exist separately (`setupAnswers` on install, devProjects binding validation, integration vault) but no install-time wizard composes them.
## Options

**A. Extend the website-editor plugin** (it's already named "Dev Editor Engine"): add full-URL pages mounting `CodeWorkspace` etc.; wire its existing features to modes. Cost: low-medium (one manifest, no new registration). Risk: couples the 70-block editor with git/code surfaces in one install — a non-tech client install carries dormant code surfaces; feature list churn on a stable, widely-installed plugin.

**B. New thin `dev-editor-engine` plugin (14th module)** whose client-scoped pages mount the EXISTING `CodeWorkspace`/doors, `requires: ["website-editor"]` for the visual tier; tiers as `AquaPreset` entries with `featureOverrides`; DevProject gains optional `clientId`. Cost: medium (manifest + registration + API scoping + smoke). Risk: two install units to keep coherent; low mechanical risk — catch-all, resolver, marketplace all handle it unchanged.

**C. Unify first (plan Phase 3)** — blocks+code+app-config behind `engine.ts` adapters with target detection, then install that one engine. Cost: high, multi-sprint, touches SHARED files. Risk: gates client-install value on a deep refactor the plan already phases separately.
## Recommendation

Option B, sequenced so the tier substrate lands first: wire `features → EDITING_MODES` (first real consumer of `isFeatureEnabled`), then the thin manifest reusing `CodeWorkspace` wholesale, then the client-scoped project binding, then presets + setup wizard. Defer C — it stays plan Phase 3 and proceeds independently. Before Phase 2, get Ed's standing open answers (dev-editor-engine.md:112-115): tier count, whose repo a client install commits to, same-routes-vs-separate-mounts.
## Risks

- **Token/scope leak**: exposing site-editor APIs to client scope without a DevProject→client binding hands agency git tokens to client-scoped roles; must use `requireRoleForClient` + project-bound checks, never just widen `requireRole` (files route.ts:79).
- **Prod vanish**: anything gated via `devDocsAccessible`/`canUseDevMode` disappears outside dev env (devModeAccess.ts:20-23) — the client install must gate on the plugin install + features instead.
- **Invisible install**: hardcoded client sidebar means no nav appears without explicit wiring (layout.tsx:73-108).
- **IP constraint**: engine served as overlay from us, never shipped in client source; disconnect = revoke (aqua-engine plan item 3).
- **Feature-default regressions**: first consumers of `isFeatureEnabled` change behavior for existing installs (`codeView` defaults false).
- Docs law: workspace chapters, api-reference, symbol reference, hazards file must track every phase.
## Phases

1. **Wire tiers to reality** — add a features→mode resolver (install features cap the `EditingMode` ceiling) consumed by `_ClientPortalStudio` and future mounts; first consumer of `isFeatureEnabled` (_runtime.ts:293); smoke-test the cap.
2. **Dev Editor Engine module** — new thin `src/built-ins/modules/dev-editor-engine` manifest with client-scoped full-URL pages mounting the existing `CodeWorkspace` + `visualEditorDoor`; register in `_registry.ts`; marketplace card appears for free.
3. **Client-scoped project binding** — optional `clientId` on `DevProject` (devProjects.ts) + site-editor/file APIs accept client scope only for projects bound to that client via `requireRoleForClient`.
4. **Surface in the client workspace** — nav row or launcher-style activate CTA on the client Fulfilment/delivery tab (WebsiteBuilderLauncher pattern, _WebsiteBuilderLauncher.tsx:34-43); tier decides which pages render.
5. **Tier presets, hardcodable per client** — `AquaPreset` entries (e.g. simple-site / studio / full-engine) with `featureOverrides` over website-editor + dev-editor-engine; applied at install/phase time via existing `applyPreset`.
6. **Setup contract wizard** — install-time flow capturing GitHub+AquaTag+Vercel into `setupAnswers`, creating/binding a `DevProject` with existing vault validation, landing on an open `visualEditorDoor`.
7. **Docs + tests** — per-phase smoke tests; update dev-editor-engine.md Phase 4/5 status, workspace chapters, api-reference, symbol reference.
