# Plan — Configurable access and workspace parity

← [checklist.md](../checklist.md) · [roadmap.md](../roadmap.md) · [product architecture](../../PRODUCT-ARCHITECTURE.md) · [runtime verification](runtime-verification.md)

**Status: BUILDING — the governed-access kernel, management surfaces, Staff/
Fulfilment projections, broad exact-client route wave and project-scoped Dev Workspace
are implemented as of 2026-08-26. Representative browser acceptance is recorded
below; release-wide adoption and the full mutation matrix remain open.** This is no
longer a design-only plan. It is also not a claim that every legacy page/API now
consumes the evaluator.

## Product outcome

One person can be given exactly the work they need without receiving a whole broad
role. The grant names one live or Sandbox environment and one exact agency,
workspace, client or project scope. Inside that scope, stable product-owned element
keys can be Hidden, View only, Use/Edit or Manage. A denied person may request a
precise subset; an authorised reviewer may approve that subset, narrow it or deny
it. Revocation and expiry take effect from current server state rather than leaving
old cookies authoritative.

This is one authority model for Settings, Staff/People, Fulfilment, client work and
the reusable Dev Workspace. The internal founder Dev Team control plane remains a
separate surface. A project grant does not reveal another project, finance, secrets,
Roadmap, findings or workers.

## Implemented checkpoint — 2026-08-26

### Canonical server kernel

- `src/server/accessControl.ts` evaluates fresh live identity/membership and the
  active resource realm against exact `agency`, `workspace`, `client` or `project`
  scopes and `live` or `sandbox` environments.
- `AccessRoleTemplate`, `AccessGrant` and `AccessRequest` records live in the
  canonical portal state. Templates and direct grants are additive; grants may
  expire or be revoked. Unknown capability and malformed resource identifiers are
  rejected rather than becoming implicit authority.
- The base vocabulary currently implemented is `workspace.view/manage`, the
  `project.view/manage/edit/ai/preview/pull-request/publish/deploy` family,
  `dev.project.run_local`, `dev.project.logs`, and explicit access-management,
  request-review and audit capabilities.
- Stable element capabilities are `element.<registered-key>.view|use|manage`.
  Registered keys cover Workspace, Staff, Fulfilment, Development, Project and
  **11 client elements**: overview, relationship, fulfilment, marketing, systems,
  commercial, communications, files, portal, record and settings. `manage` implies
  `use` and `view`; `use` implies `view`;
  Hidden is the absence of all three. CSS selectors, routes and arbitrary component
  names cannot be submitted as capabilities.
- The owner baseline is explicit. Non-owners receive only the safe ability to ask
  for access until a valid grant matches their audience ceiling, exact scope,
  environment and resource.
- Template/grant/request writes are attributable and idempotent. A requester cannot
  approve their own request, a reviewer cannot approve more capability or duration
  than requested, and no approver can delegate above their own exact-scope ceiling.
  Approval creates one grant in the same coordinated mutation.
- Access changes advance the affected user's access revision. The governed paths
  resolve current live identity instead of trusting a role frozen in an old cookie.
  This closes stale authority for migrated access-controlled paths; it does **not**
  by itself close the separate application-wide legacy `requireRole()` P0.

### Management and request surfaces

- One `AccessControlPanel` is mounted in Agency Settings, People and Fulfilment.
  It exposes People, Role templates, Requests and My access without creating three
  competing stores.
- Owners can select an exact disclosed agency/workspace/client/project scope and
  configure live or Sandbox authority without entering that data realm.
- A role or person receives each registered element as Hidden, View only, Use/Edit
  or Manage. Controls have stable accessible names and phone-sized touch targets.
- The queue shows requests only from server-disclosed exact scopes. Reviewers may
  choose a narrower capability set, approve, deny or revoke; requesters may cancel.
  Non-managers do not receive the owner project catalogue from this surface.
- This is an operational first UI, not the finished visual/accessibility matrix.
  It has passed document-overflow and control-layout checks at 360, 390, 430, 768,
  1024, 1280 and 1680 pixels, including phone-sized targets. Keyboard/focus, axe/
  screen-reader, forced-error and dense-fixture acceptance remains below.

### Staff, Fulfilment and exact-client runtime projection

- Staff stations and Fulfilment views resolve one canonical workspace projection
  for navigation, direct pages and representative operations. Hidden
  elements are not merely omitted from the menu; direct entry falls back to the
  permitted surface, View is read-only, and Use/Manage are checked separately.
- Staff People page/API results use element-specific DTO projections: identities,
  cards and organisation data require `staff.people`, while schedule, training, pay
  and access receive only their minimal matching projection. Capacity keeps its
  explicit stable `staff.people` dependency. Hidden Overview/Capacity cards do not
  retain dead links into hidden tabs. Fulfilment client list/create requires
  `fulfilment.services.view|manage` through the canonical actor.
- The client workspace maps its ten main tabs plus Settings to the 11 stable
  `client.*` elements. Layout/navigation, the active tab, Settings and the plugin
  catch-all resolve the exact client before returning content. Representative
  mutations use the same client element level.
- Once a person has entered canonical agency/workspace/client governance, an
  unrelated Staff/Fulfilment grant cannot preserve the legacy implicit tunnel into
  every client. An exact-client or explicit agency-wide client-element policy is
  required. Entirely un-migrated identities retain the documented compatibility
  path until their first broader governed assignment.
- All tenant `route.ts` files containing `clientId` are now **35/36** canonical-
  gated through `requireCurrentClientWorkspaceElementAccess`; the sole tenant
  exception is `src/app/api/tenants/seed/route.ts`, the dev-only empty-store seeder.
  A source contract asserts 28 completed route mappings.
- The wave covers contacts, milestones, product process/variations/workspaces,
  record ledger, telemetry, client workspaces, customer project brief/onboarding,
  operation tasks, close-deal, Client Delight, portal Radar, erasure preview,
  performance reports/experiments, Search Console sync, phase/pipeline moves,
  client-filtered activity/inbox/log, client-scoped plugin/integration settings,
  catalogue/template rollout and identity/inbox client linking.
- Focused client boundary proof passes **62/62**, including six new direct tests;
  separate product-workspace cross-process coverage passes **4/4**; full TypeScript
  and diff check pass. The API-inventory worker performed no browser actions, so its
  evidence must not be described as mounted acceptance.
- Several noncanonical routes deliberately use a different authority: access-
  effective introspection; customer setup/workspace/connections; connection accept/
  code; Dev projects; Fulfilment client list/create (canonical Fulfilment workspace
  element rather than an existing-client target); website-source destination
  metadata; and agency company/person/search/enquiry association outputs. These are
  not missing client gates merely because their payload contains `clientId`.
- The genuinely unclassified client associations are the dynamic plugin API catch-
  all for Fulfilment, Client CRM, Ecommerce, Memberships and Affiliates; freelancer-
  job client association; and generic task/task-template client association. Expense
  attachments also lack client identity, while agency/global branches remain agency
  surfaces. Do not claim every client mutation is element-authoritative.
- Governed client/end-customer contract, file, request and project-brief branches now
  intersect their relationship/role/action ceiling with the matching Commercial,
  Files, Communications or Record client element. Entirely ungoverned identities
  keep the documented compatibility fallback during migration.

### Final exact-scope/static closure — 2026-08-26

- The access composer now filters by exact workspace id, not only the broad scope
  kind. `workspace:staff` offers Workspace+Staff only; `workspace:fulfilment` offers
  Workspace+Fulfilment only. Switching scope prunes stale capabilities, and grant,
  request and review-approval payloads are sanitised again at submit time.
- The inert generic Development workspace choice is removed. Development capabilities
  are project capabilities and remain configurable only on an exact project scope.
- `/dev` provisions and mints from the explicit live realm regardless of an incoming
  old Sandbox cookie. Access-revision changes keep the access APIs usable; a real
  session-revision rotation still returns `401 stale_session`.
- The five final static repairs pass **92/92** focused/adjacent checks; the exact-scope
  composer passes **11/11**; `/dev` realm/session behavior passes **32/32**. Full
  TypeScript and diff checks pass. This wave did not rerun the complete repository
  smoke suite.
- A clean restarted `:3032` browser loaded Settings → Access with all access APIs 200
  and no alerts. Staff rendered exactly six base Workspace plus six Staff keys and no
  Fulfilment/Development keys; Fulfilment rendered six base Workspace plus five
  Fulfilment keys and no Staff/Development keys. At 390px the selector was 2×2, targets
  were at least 44px and document width matched the viewport. People Capacity also fit
  at 390px. The new-role composer visibly offered all four scope kinds, Live/Sandbox
  and 28 stable element groups with Hidden/View/Use/Manage; clicking the `staff.pay`
  label changed Hidden→View and was restored without submit. The clean-flow browser
  warning/error log was empty and no role/grant was persisted.
- The settled relevant combined gate is **130/130**: 86 core access/Dev/workspace/
  client/People, 11 exact Access UI, 21 Dev Team performance and 12 Sandbox environment/
  protection checks. This focused combined gate is not the complete repository suite.

### Project-scoped Dev Workspace

- `/portal/dev-workspace` lists only projects for which the current actor resolves
  `project.view`; `/portal/dev-workspace/[projectId]` mounts the shared `DevEditor`
  only when the exact project and editor element are granted.
- The editor projects view-only, code-use, AI, explorer and publish capability
  separately. View-only code is rendered non-editable; a missing PR capability does
  not leave a publish control mounted.
- The Dev project list, lifecycle, repository/source edits, Librarian, Editor AI
  config/history/replies, site-editor files and repository-write/publish operations
  re-check the exact project and required registered element at their direct API
  boundaries. Supplying another project id does not widen a grant.
- Portal chrome may link an eligible staff, freelancer, client or customer to the
  same project-scoped Dev Workspace. The link is discoverability only; the page and
  API remain the authority. This is not a second client editor and does not grant
  the internal `/portal/dev-team` control plane.

### Trusted local repository preview

- `aqua-preview.config.json` is the trusted manifest. Requests provide only an
  action and project id; they cannot choose a filesystem root, command, arguments,
  environment, port or shell.
- The supervisor is local/test only, resolves approved real paths, uses `shell:false`,
  binds loopback on a bounded dynamic port, redacts and bounds logs, keeps private
  process environment out of the child, limits concurrent previews and prevents two
  realms from controlling the same physical worktree.
- Start/restart races are serialised and generation-owned so a stale child cannot
  release a newer process lock. Status, logs, start, stop and restart each require
  the exact project plus their separate preview/element capability. Read-only
  Sandbox sessions cannot mutate the process lifecycle.
- The `RepositoryPreviewControl` is mounted in the existing editor without
  remounting the working document. Production refuses the local process feature.
- A real mounted browser completed Start, Restart and Stop against a repository-
  backed preview. Restart replaced the loopback process, `/aqua-tag.js` returned
  HTTP 200, and the phone Preview/Code selector hid the inactive pane without
  document overflow. This proves that slice only; crash/dependency/occupied-port,
  dirty editor and publish/PR paths remain below.

### Live governance with Sandbox resources

- Role templates, grants, requests and current identities remain in the live
  governance control plane. A signed Sandbox session selects a separate resource
  realm; effective authority is the intersection of the live grant and resources
  that actually exist in that active realm.
- Demo realms are shared per live agency and dataset, not chosen by a browser-sent
  realm id. Non-owner members can enter only the safe Demo dataset, cannot force a
  reset and cannot choose a more privileged persona; their persona is derived from
  current live identity. Owner/manager configuration retains the wider controls.
  Focused governance regressions force non-governors to read-only access and keep
  Sandbox Dev resources on the active resource agency rather than the live
  governance agency.
- Session freshness is anchored to the live return identity, so a live grant or
  membership revocation invalidates an old Sandbox session. A Sandbox-only project
  may be granted from the live governance panel but still must resolve in the active
  Sandbox resource realm; an invented or live-only id remains denied.
- Provider fences and the existing Sandbox read-only proxy remain separate defence
  layers. Sandbox access is not a route around live membership or project ceilings.

## Verification truth

Focused behavioural suites exist for the access kernel, access UI, exact Dev project
boundaries/direct APIs, Staff/Fulfilment projections, exact-client isolation, local
preview route/lifecycle, and live-governance versus Sandbox-resource isolation. They
exercise denial as well as success, including self-approval, narrowing, revocation,
cross-project/client access, process races and read-only Sandbox refusal.

Real-browser evidence is deliberately narrower than those tests:

- the access manager has no global overflow at 360/390/430/768/1024/1280/1680;
- an Overview-only Staff identity saw only My Day, and direct Pay/Actions entry
  returned to the permitted Team surface;
- an Overview-only Fulfilment identity saw no hidden cards/links, and hidden direct
  views returned to Overview at the same seven widths;
- a governed identity without an exact client grant was refused both a client
  workspace tab and its Settings route;
- Freelancer rendered without overflow on phone and desktop; and
- the editor's responsive panes and repository preview Start/Restart/Stop plus
  `/aqua-tag.js` 200 were mounted-browser proven.
- the clean follow-up proved exact Staff/Fulfilment element composition, 390px
  selector/target geometry and mobile People Capacity without overflow or alerts.

The create-role, grant, request, narrow/approve/deny/revoke lifecycle remains
test-only in this checkpoint. The positive exact-client Use/Manage journey, complete
customer/client personas, mutations, failures and accessibility matrix also remain
open; the denial walks above must not be expanded into claims about those unperformed
actions.

The final focused/typecheck results are recorded above and in `checklist.md`; the
complete repository smoke suite was not rerun in this wave. Source tests do not
constitute the release browser gate. At this checkpoint no documentation claim is made that a
real user has completed the full create-role → grant Project A → enter as that
person → edit/reload → request/approve/revoke journey at every viewport.

## Remaining work before this can be called complete

1. **Finish evaluator adoption.** Staff, Team, Fulfilment and the broad canonical
   tenant/client route wave are adopted. Map the dynamic module catch-all plus
   freelancer-job and generic task associations, then migrate the remaining customer,
   freelancer and legacy operations at both data read and mutation boundaries.
   Preserve the named alternative-authority routes. Navigation hiding alone never counts.
2. **Complete legacy-policy convergence.** Treat Team station access, HR custom
   roles/client assignments and freelancer job policy as migration/compatibility
   inputs or retire them. Do not silently union independent authority systems.
3. **Finish portal/workspace projection.** Staff/Fulfilment and exact-client denial
   now project from the evaluator. Finish customer/freelancer eligible surfaces and
   positive client/project entry from one server snapshot, with neutral request-
   access states and no sensitive-content flash.
4. **Finish element enforcement.** Dev, Staff, Fulfilment and the broad 11-element
   client wave have matching runtime gates. Complete the named module/freelancer-job/
   task classification and every remaining loader/mutation offered by the manager;
   otherwise remove or clearly mark the element pending.
5. **Finish delegate entry and persona UX.** Browser-prove safe Demo entry and exit
   for staff, freelancer, client/customer and owner/manager. Non-governors must never
   see or successfully submit writable, privileged persona, reset or snapshot choices.
6. **Add service-principal and share-link contracts if they are still desired.**
   Human grants are implemented. AI/service principals and expiring share links
   must use the same evaluator, issuer ceiling, revocation and audit model; they are
   not implied by the human UI.
7. **Run the two-user/two-project/two-environment direct-boundary matrix.** Prove
   Project A never lists or reads Project B, view does not edit, edit does not PR,
   PR does not deploy, Sandbox does not reach live, request does not self-approve,
   approval is singular and an old live/Sandbox session fails immediately after
   revoke.
8. **Run the real browser and responsive matrix.** Use the exact personas and
   viewports in `runtime-verification.md`; retain URLs, screenshots, overflow and
   target-size assertions, accessibility tree/axe, console/network output and
   before/after/reload evidence. Include Hidden/View/Use/Manage for representative
   Staff, Fulfilment, client and Dev elements.
9. **Complete the managed Dev lifecycle.** Start/Restart/Stop, responsive panes and
   Aqua Tag delivery are browser-proven. Browser-drive inspect/edit/AI/diff/save/
   reload/tests/PR, plus crash, occupied port, dependency/start failure, stale preview
   and dirty-transition paths. The supervisor is implemented; this complete journey
   is not yet accepted.
10. **Keep the release gates separate.** The broader stale-session P0, deployed
    database/Editor-AI proof, durability and provider acceptance remain tracked in
    the checklist. A green access suite does not make the whole application secure
    or production-ready.

## File map

- `src/server/accessControl.ts`
- `src/server/types.ts`
- `src/server/storage.ts`
- `src/app/api/portal/access/`
- `src/components/access/`
- `src/app/portal/agency/settings/SettingsTabs.tsx`
- `src/app/portal/agency/people/_PeopleCommand.tsx`
- `src/app/portal/agency/fulfilment/_FulfilmentWorkspace.tsx`
- `src/lib/server/access/workspaceElementAccess.ts`
- `src/lib/server/access/clientWorkspaceElementAccess.ts`
- `src/app/portal/team/`
- `src/app/portal/clients/[clientId]/`
- `src/app/api/tenants/`
- `src/app/api/portal/clients/`
- `src/app/portal/dev-workspace/`
- `src/lib/server/dev/devProjectAccess.ts`
- `src/app/api/portal/dev/`
- `src/engines/editor/DevEditor.tsx`
- `src/components/editing/RepositoryPreviewControl.tsx`
- `src/lib/server/dev/localRepositoryPreviewConfig.ts`
- `src/lib/server/dev/localRepositoryPreviewSupervisor.ts`
- `src/lib/server/sandbox/sandboxEnvironment.ts`
- `scripts/smoke-access-control-kernel.test.ts`
- `scripts/smoke-access-control-ui.test.ts`
- `scripts/smoke-client-workspace-element-runtime.test.ts`
- `scripts/smoke-client-workspace-remaining-api-access.test.ts`
- `scripts/smoke-fulfilment-clients-access.test.ts`
- `scripts/smoke-dev-access-session.test.ts`
- `scripts/smoke-client-workspace-api-access.test.ts`
- `scripts/smoke-dev-project-access-control.test.ts`
- `scripts/smoke-dev-project-api-access.test.ts`
- `scripts/smoke-dev-editor-project-boundary.test.ts`
- `scripts/smoke-local-repository-preview.test.ts`
- `scripts/smoke-local-repository-preview-route.test.ts`
- `scripts/smoke-sandbox-access-governance.test.ts`

## Done when

The implementation and all ten remaining items above are complete; the final
browser matrix has no cross-scope disclosure, unauthorised mutation, lost editor
state, document-level overflow, inaccessible primary action, serious/critical axe
finding or unexpected console/network failure; and `checklist.md` records the exact
combined automated and browser evidence without relying on source-shape tests.
