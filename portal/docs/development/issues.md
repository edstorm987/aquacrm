# Issues & risks

← Back to [development.md](../development.md) (the law)

Known issues, verified findings, and risks — the things not to forget. Add here
when you find something out of scope; check here before assuming something is a
new bug. Severity: 🔴 needs a decision/fix · 🟠 worth addressing · ⚪ known/by-design.

> **The register was refreshed against source on 2026-08-24, continued in the browser on
> 2026-08-25 and reconciled through the 2026-09-01 implementation checkpoints.** Fixed items
> are marked **✅ RESOLVED** with the file:line that proves it, and **kept, not
> deleted** — history is useful, a false open item costs a worker a day. Item
> numbers are **permanent** (other docs link to `issues #N`); a resolved item
> keeps its number.
>
> **When a doc and the code disagree, the code wins.** Read the source, then fix
> this file.
>
> **Scope correction:** the first same-day pass excluded security. A later
> read-only review added issues #22–#25 after a live stale-session exploit and
> source verification. Those entries supersede the earlier deferral note.

## 🔴 Security / compliance (from verified source reads)
1. **Database RLS — live and version-controlled; engineering residue remains.** **CORRECTED 2026-08-23:** RLS is ON in the live project (verified 2026-08-20 across 14 tables with the public anon key), and its policies exist in 16 migrations under `aquaCRM/supabase/migrations/`. Pending migrations still need production application. The real gaps are narrower: `brand_enquiries` has no `agency_id`, and admin/service-role paths bypass RLS, so their current count and app-code tenant scoping must be audited before claiming database-enforced isolation. See [rls-enable](plans/rls-enable.md) and [database.md](../workspace/database.md).
2. **Aqua Tag form-content capture is NOT consent-gated.** Telemetry is double-gated on cookie consent; the field-value POST to `/api/public/form-capture` is not (and the server route has no consent check). A visitor who declined cookies still has their submitted enquiry fields captured. **Action: a deliberate compliance decision** — legitimate-interest (they submitted a form) vs. gate it. (See [aqua-tag.md](../workspace/aqua-tag.md) finding A.)
3. **Consent flags are self-reported** — the telemetry server trusts the `consent*` booleans the tag sends; no server-side source of truth ties them to the stored preference.
22. **✅ RESOLVED 2026-08-27 — central session revocation is enforced on every
    authenticated request.** One central primitive, `resolveFreshSessionUser()`
    (`src/lib/server/auth/auth.ts:185`), now runs inside `sessionFromToken()`,
    which both `getSession()` and `getSessionFromRequest()` call — so
    `requireSession()`, `requireRole()`, `requireRoleForClient()` and every
    direct cookie reader inherit it. Before any role/scope decision it
    re-validates the CURRENT authoritative user record: existence (account
    removal revokes), `sessionRev` (password/role rotation revokes),
    current-role equality (belt-and-braces for a writer that skips the rev
    bump) and live agency membership for real sessions. Sandbox sessions
    anchor to the live account in the signed `sandbox.returnUserId` (looked up
    in the live realm with a fresh hydrate, mirroring
    `requireCurrentAccessActor`); the public showcase visitor is validated
    inside its fixture realm (legacy showcase cookies without a realm fall
    back to the live blob); fenced Dev Mode/Showcase Mode/preview `isDemo`
    sessions skip only the live-membership check — never existence, rotation
    or role. `requireCurrentAccessActor` still answers `401 stale_session`
    when a cookie verifies but fails the boundary
    (`src/server/accessControl.ts:371`). The exploit is behaviourally dead:
    `scripts/smoke-session-revocation.test.ts` (**16/16**) replays the real
    old owner cookie against `POST /api/portal/settings/external-ai` after
    owner→staff downgrade (403, no token), password rotation, explicit
    rotation and account deletion, proves `requireRole()` surfaces
    (team-management GET, Notepad create) refuse the same cookies at 401, and
    pins the sandbox/demo/showcase anchoring semantics. Nine existing smoke
    harnesses that minted cookies for never-created users were re-seeded with
    real user records — the strictness they tripped over is the fix working.

    _Original finding (2026-08-24), kept for context:_ a live regression
    downgraded an owner to staff, then reused the old owner cookie against
    `POST /api/portal/settings/external-ai`; it returned **201** and issued a
    working API token. `getSessionFromRequest()` only called `verifyToken()`,
    `getSession()` did not load the current local user, and `requireRole()`
    trusted the role embedded in the cookie. Only callers that separately used
    `getCurrentUser()` or manually called `isSessionFresh()` enforced
    `sessionRev`.
23. **✅ RESOLVED 2026-08-26 — public and private showcase data is physically
    isolated and audited read-only paths are blocked by capability.** `src/proxy.ts` now
    rejects the known Google/Meta OAuth callbacks, cron/internal sweeps, v1 API,
    Radar/attention/automation/notification reads, team chat, products,
    development, website/source/design materialisers and client telemetry for a
    public-showcase session before those handlers run. The regression covers the
    capability list as well as ordinary non-GET blocking. Public showcase now
    uses a fixed physical data realm rather than merely a special tenant in the
    live blob. Private Empty, Demo and Production snapshot modes use server-minted
    per-operator realm keys; read-only private sandbox requests share the mutating-
    GET policy and shared provider adapters block outbound side effects. Any new
    mutating-GET route or provider adapter must be classified in the same policy;
    the broader render/read-mutation inventory remains separately open in #21.

161. **⚪ NOT A DEFECT — corrected 2026-08-27, same day it was raised. The editor's
    local working-tree path is already owner + local-Dev-Mode gated.** I raised this as
    a 🔴 after seeing AquaCRM's own 2,598 files in the Dev Workspace file canvas and
    reading only `devWorkspaceFiles.ts:18` (`DEV_WORKSPACE_ROOT = resolve(process.cwd())`).
    That constant is **not** the editor canvas's root — it belongs to the Dev Team
    docs/plans/roadmap routes. Tracing the actual route disproves the finding:
    - **Write** (`src/app/api/portal/site-editor/files/route.ts:363`) calls
      `requireWholeWorkingTreeFounderAccess()` before anything else — `agency-owner` **and**
      `devDocsAccessible(session)` **and** `canUseDevMode()`
      (`src/lib/server/dev/devProjectAccess.ts:85-98`) — then checks origin, confines the
      resolved path to ROOT, requires a matching fingerprint, and **refuses a
      repository-backed project outright with 409** (`:382`), because that path commits
      through repo-write instead.
    - **Read** of a repository-less project takes the same founder gate (`:170-172`),
      explicitly so "a repository-less project must not become a capability tunnel".
    So a granted client, a staff member, or anyone on a deployment (where `canUseDevMode()`
    is false) can neither list nor write AquaCRM's checkout through this route. What I
    actually observed was the founder-in-local-Dev-Mode case the route is designed for —
    Aqua editing itself. **What remains true and unchanged:** a code-canvas save on the
    blank "this workspace" project does mutate Ed's real working tree, which is why the
    2026-08-27 browser session deliberately did not press Save; and the plan's "managed
    isolated workspace" guard rail describes a *future* state for repository-backed
    projects, which today refuse local writes and commit instead. Phase 17's authoring
    walk is therefore blocked on **Ed's GitHub credentials**, not on a security hole.
    Kept, not deleted, so the mistaken severity cannot be re-derived from the browser
    symptom.


162. **⚪ In-pane browser blocks Next's dev HMR websocket, stalling the SECOND full load
    in a tab (observed 2026-08-27; environment, not product).** With the preview pane
    driving a `next dev` server, `ws://…/_next/hmr` fails repeatedly; the first full page
    load in a fresh tab always renders, and a subsequent full load of another
    `/portal/dev-workspace/[projectId]` route stays on the "Preparing your workspace…"
    Suspense fallback even though the route returns 200 in ~70–220ms server-side and every
    chunk loads. A fresh tab clears it. Recorded so a future session does not misread it as
    a route or loader defect; it does mean browser matrices should open a fresh tab per
    navigation, or run against a production build where HMR is absent.

163. **🟠 A client-scoped identity can tell "exists in this agency" from "does not exist"
    (found 2026-08-27 while building the phase-18 client suite).** The Dev routes use a
    deliberate, widely-asserted convention: an ungranted project **inside your own agency**
    answers **403** (a capability refusal), while another agency's project or an invented id
    answers **404** — proven for the tenant boundary in `smoke-dev-project-api-access`
    ("404s another agency's project — same words as an invented one"). For an AGENCY identity
    that is honest. For a **client** identity it means Bright Coffee can learn that a project
    id belongs to *someone* in the agency, because Rival Coffee's project returns 403 where an
    invented id returns 404. **Bounded, not urgent:** project ids are opaque
    (`devproj_<20 hex>`), so nothing is enumerable, and neither answer leaks the sibling's name
    or repository — pinned by `smoke-client-dev-workspace` ("is refused a SIBLING client's
    project…"). **Not changed unilaterally:** flipping same-agency refusals to 404 would
    contradict 15+ existing assertions that deliberately expect 403, so this is a decision
    about whether a *cross-client* refusal should be indistinguishable the way a cross-tenant
    one already is. Decide before the editor is offered to two clients of the same agency.

164. **✅ FIXED 2026-08-27 — exiting Dev/Sandbox Mode left the operator flagged
    demo, which suppressed the Supabase identity cross-check.**
    `liveIdentityFor` (`src/lib/server/sandbox/sandboxEnvironment.ts:139`) computed
    the origin's demo-ness as `session.sandbox?.returnWasDemo ?? session.isDemo === true`.
    `mintSandboxSession` stores a `false` **as absent** (`|| undefined`), so that
    `??` fell through to the sandbox session's own `isDemo` — which is always
    true. Entering from a live workspace and exiting therefore returned a session
    still marked demo. **Not cosmetic:** the chrome renders the demo banner from
    that flag, and `getSession()` deliberately returns early for a demo session,
    skipping the Supabase identity cross-check — so a wrongly-demo session
    weakened that check for its whole life. With an envelope present the envelope
    is now the authority; the plain `isDemo` reading is only for legacy cookies
    that have no envelope. Found during suite triage, hiding among failures
    everyone assumed were stale test pins.

165. **✅ FIXED 2026-08-27 — a freelancer preview taken DURING a Dev Mode
    inspection destroyed the way out (the 2026-08-19 blocker, returned).**
    `preview-as-freelancer` carries the inspection's return path through both of
    its mints, and its own comment describes precisely what happens when that is
    dropped: *"the founder came out as the demo owner inside the fenced demo
    tenant with no POV bar, `dev-mode` exit answering 409… Only a logout
    escaped."* Since the 26 August consolidation Dev Mode enters through
    `enterSandboxEnvironment`, so the return path lives in the **signed sandbox
    envelope** — and this route carried the legacy `devReturn*` fields faithfully
    while the envelope fell on the floor. Same blocker, new coat. Both mints now
    carry `sandbox: session.sandbox`. Pinned by
    `smoke-dev-mode-identity` (5/5), whose assertions moved from the legacy fields
    to the envelope while keeping the guarantee they exist for: exit restores the
    EXACT founder, and a way home renders.

166. **✅ FIXED 2026-08-27 — a client-element ceiling REFUSAL was answered with
    legacy `manage`, including for another agency's client.**
    Found while triaging the Finance cluster. `clientCommercialGate` asks the
    kernel whether the caller may touch a client's `client.commercial` element.
    Probing it with three client ids showed the shape of the hole:

    | client id asked about | `ceilingFailure` | answer |
    |---|---|---|
    | the caller's own client | none | `manage` — right |
    | an id that does not exist | `resource_ownership` | **`manage`** |
    | ANOTHER agency's client | `resource_ownership` | **`manage`** |

    `resolveActorClientWorkspaceElementAccess` read only "no capabilities and no
    grants" and concluded *this identity has not been migrated to canonical
    governance yet*, falling through to `legacyLevels` — which answers `manage`
    for every agency role. So the element layer was overruling the very refusal
    the kernel had just handed it.

    **What makes the fix safe is that the two cases are distinguishable.** An
    un-migrated identity CAN reach the client, so `ceilingFailure` is unset and
    the legacy fallback is correct for it; a refusal sets `ceilingFailure`.
    `clientWorkspaceElementAccess.ts:145-166` now returns a fully hidden,
    `source: "ceiling-denied"` result on any ceiling failure and never reaches
    the legacy path.

    **Scope, stated honestly:** this is a FLOOR beneath route-level tenancy, not
    a replacement for it. The direct tenant routes and the plugin catch-all
    resolve the tenant first, so a cross-tenant id rarely reached this gate with
    an effect. But a floor that answers `manage` for another agency's client is
    not a floor, and anywhere it was the only client check it was load-bearing.
    Pinned by `smoke-client-element-ceiling` (6/6) — 4 of those 6 fail with the
    guard removed, and the 2 that still pass are the deliberate controls: the
    owner keeps `manage` on their own client, and the un-migrated legacy identity
    is untouched.

    One consequence recorded rather than hidden: `plans/assign` now answers
    **403 `client_workspace_element_manage_required`** where it once answered
    404 `client_not_found`, because the gate runs before the service is asked
    whether the client exists and must not distinguish "no such client" from
    "not yours". Elsewhere the house answers 404 for both (see the note at
    `src/server/phaseApplier.ts:51`); those routes make their own tenancy check
    first and so never reach this gate with an unreachable id. Nothing in the app
    calls `plans/assign`, so the divergence costs no message.

180. **✅ DONE 2026-08-27 (Ed) — the editor exposed the WHOLE repository;
    both project- and grant-level path scoping now exist, are enforced on all four
    read/write paths, and are settable on screen — the project's surface in the
    editor, the per-person narrowing in the access panel.**
    Ed: *"the internal editor needs to be ever so slightly different, with aquaCRM
    repo locked down to this portal's files as we can't expose the whole repo in
    Fulfilment … I'd love to just give a dev staff access to one folder, or maybe
    even one file, or even multiple files in folders."*

    `site-editor/files` served from `process.cwd()` and confined only against
    traversal, so a project pointed at a large shared repository handed the whole
    thing to anyone who could open the editor.

    **Two scopes, and they INTERSECT** — the same rule `_pageScope.ts` uses for
    surfaces and roles, so widening always means touching the thing an owner
    reviews:
    - the PROJECT declares its maximum surface (`DevProject.allowedPaths`);
    - a GRANT may narrow further within it, never past it.

    **Built and pinned:**
    - `lib/server/dev/devPathScope.ts` — the matcher, with `intersectPathScopes`
      ready for the grant half. `smoke-dev-path-scope` **22/22**.
    - `DevProject.allowedPaths`, normalised on write, and **carried through an
      unrelated save** — `saveDevProject` rebuilds field by field with no spread,
      so an omitted field is dropped, and for this one that would silently
      unlock the whole repository during a rename.
    - Enforcement on `site-editor/files`: the single-file read, the WRITE, and
      **both** tree listings. `smoke-dev-path-scope-routes` **8/8**.

    **The rules worth knowing.** A folder matches on SEGMENT boundaries, so
    `src/app` never covers `src/application.ts` — a naive `startsWith` says yes
    to both, and that is the classic way an allowlist leaks its neighbours.
    Traversal is REFUSED rather than sanitised. Listing has its own rule so
    ancestors of an allowed path stay navigable without becoming readable. An
    empty scope means unrestricted, so nothing changes until a scope is set —
    a default-deny would have locked every existing project out on deploy — and
    an empty INTERSECTION deliberately does not reuse that representation,
    because it would invert the answer.

    **The grant half is now built too.** `AccessGrant.allowedPaths` narrows a
    person within the project's surface, and `requireDevProjectAccess` resolves
    ONE effective answer — `pathScope` — that every file boundary reads, rather
    than each recomputing it.

    **The two operations are different, deliberately.** A person's own grants
    UNION with each other (two grants, two folders); that union INTERSECTS the
    project's surface. Getting them the same way round would either hand
    somebody one of their two folders or let a grant reach past what the project
    exposes — swapping intersect for union breaks eight assertions, which is how
    that is kept honest. An unscoped grant contributes no limit, so the ordinary
    case is unchanged; `ownerBaseline` skips the grant half but still obeys the
    PROJECT's surface, because "this project is the portal files" is a statement
    about the project rather than about who is asking.

    One detail worth keeping: the duplicate-grant fingerprint now includes
    `allowedPaths`. Without it a second, differently-scoped grant looked like a
    duplicate of the first and was silently returned — so granting somebody a
    second folder would have appeared to work while changing nothing.
    `smoke-dev-path-scope-grants` **9/9**.

    **All four doors are now closed.** `site-editor/files` (read, write, both
    listings), `dev/repo-write` (every action naming a path, guarded once BEFORE
    the dispatch so the next one is not born unguarded), `dev/source-edit` and
    the librarian.

    The two search surfaces mattered more than the writes. `source-edit`'s
    fall-through is a repository-wide TEXT search returning matched lines with
    their paths, and the librarian answers questions WITH file paths — so
    guarding only the file reads would have left a scoped person able to search
    for a secret's name and read it out of the results without opening a single
    file they were allowed to open. Both filter now, and both SAY the answer is
    partial, because a trimmed result that stays quiet reads as "it is not
    there" and sends the reader hunting a bug instead of asking for access.

    **The UI and the last read path are done too.** The editor's project
    Settings tab has an **Exposed files** control (one path per line — a
    comma-separated box would split a path containing a comma in half), and
    `mapProject` now reports the project's own surface rather than the whole
    repository's file count and top directories. That last one is a correctness
    fix more than a leak fix: MAP needs `project.manage`, but a project declared
    as "the portal files" that answers with the whole repository is describing
    something other than itself, and its number is the one somebody quotes.

    **Widening is gated, narrowing is free.** Adding paths outside the current
    scope — or clearing the box, which exposes everything — requires
    `project.connection.manage`, the same capability as pointing the project at
    a different repository. Narrowing costs nothing, because somebody tightening
    a scope in a hurry must never be stopped by a permission check.

    **The grant control is on screen too (added last).** The project half went
    first because that is where the "can't expose the whole repo" risk lived, and
    for a while the per-person narrowing was API-only — which in practice means
    nobody uses it. `AccessControlPanel` now offers **Limit to these files**
    beside the capability picker, one path per line, and only on a **project**
    scope: an agency or client scope has no files, and a box that invites paths
    which silently do nothing is worse than no box. Blank is labelled explicitly
    as *"everything the project exposes"*, because the permissive default is the
    one that must never be inferred from an empty field. An empty array
    normalises to `undefined` on the way into the store, so a new unrestricted
    grant fingerprints identically to every grant made before this existed.

    **Browser-verified on an isolated lane.** A project scoped to
    `src/app/portal` + `src/lib/portal` shows **332 files instead of 2,631**,
    every one inside the scope; an out-of-scope read answers
    `403 path_out_of_scope` naming the path.

    That walk also caught a real trap: paths are relative to the EDITOR's root
    (`portal/`), not the git repository's, so the first scope set through the
    real API used `portal/src/...`, matched nothing, and produced an **empty
    file tree with no error** — indistinguishable from a broken editor. The
    form's placeholder and a note in the module now show the correct form.

179. **✅ FIXED 2026-08-27 (Ed) — a template could not be drafted until a real
    client existed.** Ed: *"The editor needs a client record to supply preview data
    for this project … all the products ones should just use a demo … this way I
    can make draft things."*

    Template preview is not a separate renderer: the studio previews a template
    by loading `/client-preview/<clientId>?scope=template&templateId=…`, rendering
    it THROUGH a client so the layout is seen with real shapes in it. Right
    design, one consequence — an agency with no clients gave `DevEditor` an empty
    list, it hit `!clients.length && portalTarget`, and refused to open at all. A
    PRODUCT portal template, which belongs to a product and to no client, could
    not be drafted until somebody created a real client first.

    `loadPortalStudioProps` now always offers a stand-in, and the preview route
    resolves its reserved id. A built client is still the default when one exists
    — the sample is a floor, not a preference — and it is always offered last.

    **Nothing is created.** The obvious fix is to make a client record; that
    would also put a fake client into the client list, counts, KPIs, Radar and
    finance, with every one of those then needing to learn to exclude it. The
    stand-in is synthesised for the length of one render, named "Sample Client
    (preview only)" so nobody reads its numbers as real, and carries portal
    metadata so the preview shows a populated layout rather than an empty shell.

    **Worth recording — the first attempt 404'd.** The reserved id used a colon,
    and Next hands a dynamic route segment through **without decoding it**, so
    `/client-preview/sample-preview:milesymedia` arrived as
    `sample-preview%3Amilesymedia` and matched nothing. Found by instrumenting the
    route rather than guessing. The separator is now `__`, which needs no
    encoding, and the reader tolerates an encoded id anyway. Both halves are
    pinned.

    Browser-verified on an isolated lane with **zero clients**: the editor opens,
    the preview renders "PREPARED FOR Sample Client (preview only)" with Home /
    Project / Results / Files / Billing / Support / Resources, and switching to
    Template scope previews Master · Stunning Standard against the same stand-in.
    `smoke-template-preview-sample` 11/11.

    **Production correction, 2026-09-02.** A later exact production probe found a
    second edge: when the stand-in was the initial selection, the editor still
    defaulted the design scope to Client and truthfully received a 404 for the
    intentionally nonexistent client row. The sample now carries `previewOnly`,
    initial and later sample selection force Template scope, the Client override
    control is disabled with an explanation, and the mutation route independently
    refuses the reserved id with 403. Tests prove neither a client nor a portal
    instance is persisted: focused sample/update-route proof is **29/29** and the
    wider editor/tenancy/access gate is **111/111**. The final production browser at
    **390×844, 1024×768 and 1440×900** issued only template-scope sample API 200s,
    kept Publish inside the viewport, matched the viewport width and recorded no
    console, page, request or HTTP error.

178. **🟠 CODE/BEHAVIOUR RESOLVED 2026-09-02; mounted/live-provider acceptance
    remains — a Membership plan cannot be deleted while any subscription or
    in-flight subscription command still depends on it.** Hard delete now uses
    RESTRICT under the module's durable graph lock. The service boundary and the
    mounted handler share the same dependency inventory; the handler returns 422
    with the billable/unreachable detail and leaves the complete graph unchanged.
    `PlanService.archive` remains the documented ordinary retirement path.

    The guard is deliberately stronger than checking the visible member list:
    interrupted enrolment commands and identity claims count before their final
    subscription row exists, and a concurrent subscriber creation serialises with
    deletion before the delete re-reads and refuses. An unreferenced plan still
    deletes, so RESTRICT is not a blanket ban. The focused Membership/Affiliate
    retirement and recovery run passes **32/32**. Live Stripe cancellation/migration
    is not invented as an automatic purge; mounted and live-provider refusal/archive
    acceptance remain before issue #63 can close completely.

177. **🟠 CODE/BEHAVIOUR RESOLVED 2026-09-02; mounted/live-provider acceptance
    remains — an Affiliate cannot be deleted while codes, attributions, payouts or
    in-flight identity claims still depend on it.** The parent delete now uses
    RESTRICT under the same durable graph lock as every child writer. The shared
    inventory distinguishes active referral codes and financial dependants, the
    service boundary cannot bypass it, and the mounted handler returns 422 without
    changing the affiliate or any child row.

    A child created concurrently with deletion wins the shared lane and makes the
    subsequent delete refuse; an interrupted referral-code claim also fences the
    parent before its final row exists. An affiliate with no dependants still
    deletes, while the existing removed/archive lifecycle remains the ordinary
    retirement path. The combined focused retirement/recovery run passes **32/32**.
    Live Stripe Connect/payout acceptance and an explicitly designed exceptional
    financial purge remain separate; ordinary hard delete no longer orphans money.

176. **🟠 CODE/BEHAVIOUR RESOLVED 2026-09-02; historical repair and mounted
    acceptance remain — SOP deletion and every current incoming reference writer
    now enforce one tenant-safe RESTRICT relationship.** Nine reference sites
    across seven owning types are covered:

    | site | shape |
    |---|---|
    | `AgencyTask.sopIds[]` | collection |
    | `AgencyTask.checklist[].sopId` | **nested** |
    | `AgencyTaskTemplate.steps[].sopId` | **nested** |
    | `SopGuide.sopIds[]` | collection |
    | `AgencyProduct.sopIds[]` | collection |
    | `AgencyProduct.internalWorkspace.processSteps[].sopIds[]` | **nested** |
    | `ClientProductVariation.sopIds[]` | **nested, in client metadata** |
    | `DevelopmentResource.sopIds[]` | collection |
    | `PeopleTrainingAssignment.sopId` | collection |

    The direct service delete and provider-backed mounted delete both assert the
    inventory beside the owner-row removal. The library previews that same
    inventory, removes the unsafe “delete anyway” path and tells the operator to
    remove or reassign links. Every current mounted/background writer uses the
    same agency lifecycle lane and validates missing or cross-agency ids from the
    exact state snapshot it writes; invalid API input returns structured 422 rather
    than silently dropping the reference. Client product variations validate both
    their top-level list and nested process-step lists.

    Deterministic delete-versus-guide creation proves the stale writer waits,
    re-reads the post-delete state and fails without recreating a dangling id. The
    focused SOP/dependent-domain run passes **52/52**. Existing stored dangling ids
    predate this boundary and still need an explicit audit/repair migration; mounted
    browser acceptance across representative owner surfaces also remains.

175. **✅ FIXED 2026-08-27 — client erasure left behind records naming the erased
    client, INCLUDING free text that named them by name.** Item 6's *"unresolved
    references … including nested assignments … and parent deletion"* class,
    measured on the operation where a leftover reference is a broken promise
    rather than untidiness.

    `eraseClientCompletely` sweeps every collection and deletes any record
    carrying a **top-level `clientId`**. Two do not have one: an access GRANT and
    an access REQUEST name the client through `scope: { kind: "client", id }`.
    Both survived — and both carry a free-text `reason` written by a person,
    which is precisely where a client gets named:

    ```
    grant.reason   = "Granted for Doomed Ltd onboarding"
    request.reason = "I need access to Doomed Ltd's files for the March audit"
    ```

    A dangling id would have been untidy. **Surviving prose naming the erased
    client makes the operation's own audit line untrue** — it records that the
    erasure "Names no personal data", and the erasure code comments state that
    "only the random clientId token survives, never the person".

    Fixed with ONE shared predicate, `recordNamesClient`, used by all three
    passes — arrays, records, and the retained count — so they cannot drift
    apart. It matches `clientId`, `scope.clientId`, and
    `scope.kind === "client" && scope.id`.

    `smoke-client-erasure-references` (5/5) pins it, and the assertion that would
    have caught this without anyone guessing which collection to inspect is the
    blunt one: **after an erasure, the client's NAME must not appear anywhere in
    serialised state.** A fifth test proves the fix did not become "delete more
    than asked" — another client's grant survives untouched.

174. **🟠 OPEN — Ed's decision: revoking someone's LAST grant WIDENS their access.**
    Surfaced by the release access matrix, 2026-08-27, and proven end-to-end
    through a real gated route rather than inferred from the code.

    Canonical client access is opt-in per identity, for migration safety: an
    identity holding no agency/workspace/client grant is treated as un-migrated
    and keeps its legacy behaviour, which for any agency role is `manage` on every
    client element. Governance begins at the first such grant, after which absence
    becomes meaningful (`clientWorkspaceElementAccess.ts`, `governed`).

    Followed to its conclusion, that means:

    | Ben (agency-staff) | `client.record` on client one |
    |---|---|
    | no grants at all | **manage** (un-migrated, legacy) |
    | granted elsewhere, nothing here | hidden ✓ |
    | granted `view` here | view ✓ |
    | granted `use` here | use ✓ |
    | that grant revoked, still governed | hidden ✓ |
    | **his LAST grant revoked** | **manage again** |

    Every row is asserted, including the last: a real `POST` to
    `api/tenants/client-notes` answers **403 while governed and 200 once the last
    grant is gone**.

    This is the documented rule working, not a defect — but "revoke" widening
    access is the opposite of what the word suggests, and an operator removing
    someone's final grant to lock them down would achieve the reverse. Three ways
    to settle it, all Ed's call:
    - leave it, and make the UI say so when revoking a last grant;
    - keep a `governed` marker on the identity once set, so revocation cannot
      un-migrate them;
    - retire the legacy fallback entirely on a date, once every identity is
      migrated.

    The matrix pins the CURRENT behaviour exactly, so whichever is chosen has to
    come here and change the recorded rule deliberately.

173. **✅ CONVERGED 2026-08-27 — three agency HR routes were still deciding access
    on a broad role while the rest of People decided on elements.** The other half
    of the checklist's parity item: *"HR custom-role/client-assignment records and
    freelancer job policies have not all converged."*

    **Most of that wording had gone stale, and saying so matters.** People itself
    consumes the evaluator thoroughly — `staff.people`, `staff.pay`,
    `staff.schedule`, `staff.training`, `workspace.settings` — and there are no
    `customRole` or client-assignment records left to converge. Sweeping every
    HR/freelancer/customer route for "decides access without the evaluator"
    returned twelve, of which nine are legitimate: public signup has no session;
    the client portal's own routes act on the caller's own account scoped by their
    session's `clientId`; and the contractor's surfaces answer to
    `FreelancerAccessConfig`, the named alternative authority.

    Three were genuinely competing, all agency-side:
    - `portal/freelancers` — the contractor roster and identity provisioning →
      `staff.people` at view / manage;
    - `portal/freelancer-access` — the policy deciding what every contractor sees,
      including whether a client is named to them → view / **manage**;
    - `portal/people/cv` — an applicant's CV, which every sibling application
      action already gated on `staff.people` → view.

    Each joined the element map People already used rather than inventing a
    parallel vocabulary, which is how competing policies start in the first place.

    `smoke-hr-policy-convergence` pins both halves — what must consume the
    evaluator, and what must deliberately not — plus a sweep so a NEW route under
    these folders either names an element or is added to the alternative-authority
    list with a reason. **The sweep was weaker than it looked on the first
    attempt:** it matched the `import` line, so deleting a gate and leaving the
    import behind kept it green. It now requires a CALL, and the stale-exemption
    check makes the list itself unable to rot. 7/7.

172. **✅ CLASSIFIED + ENFORCED 2026-08-27 — the three agency records that name a
    client had no client rule.** The checklist's remaining application-wide
    parity gap: *"freelancer-job and generic task/task-template client
    associations remain genuinely unclassified."*

    | surface | was gated by | client rule |
    |---|---|---|
    | `api/portal/tasks` | `workspace.actions` (agency-staff only) | none |
    | `api/portal/tasks/templates` | an agency role, and nothing else | **none at all** |
    | `people` → `save-freelancer-job` | role + `routeTenantScope` | tenancy only |

    All three are agency work that merely NAMES a client, and all three were
    gated as agency work. None had a rule about the field that crosses the
    boundary. A governed identity restricted away from a client could read that
    client's Actions, instantiate a whole task sequence against them, and place
    a freelancer on their delivery work.

    **Why it stayed open, and what settles it.** A GENERIC task belongs to no
    single client element — it might be about money, delivery or a conversation
    — and guessing one would look enforced while guarding the wrong thing. The
    resolution is that a generic association does not need the element owning the
    SUBJECT; it needs the one that says *may you see this client at all*. That is
    `client.overview`, the client workspace's landing tab. A freelancer job is
    not generic: it is delivery work for a named client, so `client.fulfilment`.

    `src/lib/server/access/clientAssociationElement.ts` holds the classification
    with its reasoning, and — mirroring `pluginClientElement.ts` — an explicit
    **alternative-authority** list so "governed elsewhere" cannot be mistaken for
    "nobody looked". The named one the checklist asks to preserve is the
    contractor's own view of their job, which stays with `FreelancerAccessConfig`;
    a freelancer is not an agency identity and must not be evaluated as one.

    Details worth keeping: PATCH checks BOTH the client an Action is currently on
    and the one it is moving to, or someone could detach a task from a client they
    cannot see. The list endpoint filters rather than throws, resolving the actor
    **once** rather than per row. The freelancer job keeps tenancy first and the
    element second, so a cross-tenant id still answers not-found rather than 403.
    `smoke-client-association-element` 13/13; full suite 4,495/4,493/0/2.

171. **✅ FIXED 2026-08-27 — an infinite redirect loop locked a new client out of
    their own portal. Found by the browser walk, not by any test.**

    Phase 18 sent `client-owner`/`client-staff` to `/portal/customer`. Driving a
    real client session on a `sandbox:fork` lane, the browser sat on "Preparing
    your workspace…" for ever and the dev log showed this repeating at roughly
    three requests a second:

    ```
    GET /portal          200
    GET /portal/customer 200
    GET /setup           307
    GET /portal          200   ← and round again
    ```

    Three gates, each correct on its own:
    - `/portal` sends a client role to their portal;
    - the portal LAYOUT sends an account with no `welcomeCompletedAt` to `/setup`;
    - `/setup` (`page.tsx:28`) sent everything that was not `end-customer` back
      to `/portal`.

    Only the round trip was wrong, which is exactly why the unit tests missed it:
    two of the three gates had already been widened and pass their own
    assertions. `/setup` now names `CUSTOMER_PORTAL_ROLES`, and its original
    purpose survives — an agency role is still bounced to `/portal`, and that
    bounce terminates because `/portal` sends agency roles elsewhere.

    **The regression walks the redirect graph rather than asserting per gate**,
    from both entry points (`/portal` and the welcome link's `/setup`), and it
    drives the customer LAYOUT — leaving the layout out is what made an earlier
    version of the test pass against the live bug. With the fix reverted it
    prints the chain: `/portal → /portal/customer → /setup → /portal`.
    `smoke-client-portal-placement`, 17/17.

    Worth stating plainly: three gates individually green added up to a product
    nobody could log into. Per-gate assertions cannot catch that class.

170. **🟠 OPEN — Ed's decision: Radar's probe cron is now DAILY, and no surface
    says the evidence may be a day old.** Found by triage 2026-08-27.

    `vercel.json` schedules `/api/cron/radar-probes` at `15 6 * * *` — once a
    day. It used to be `*/10 * * * *`, and the sweep's own argument for existing
    was that *"the cheap Pulse now reads genuinely fresh probe data"*. The likely
    reason for the change is already recorded in the docs — **"a Vercel plan
    allowing sub-daily crons (Hobby is daily-only)"** — so this reads as making
    the config deployable, not as a slip. `vercel.json` was left alone: the
    cadence is a hosting decision and an outward-facing one.

    **The gap is not the schedule, it is the silence.** On a daily cron, Radar's
    Deep and Infra evidence can be up to 24 hours stale while the UI presents it
    the same way it presents fresh evidence — and this repo's own rule is that
    *missing or unconfident evidence is a visible blind spot, never a healthy
    pass*. Two honest resolutions, both Ed's call:
    - a plan with sub-daily crons, restore `*/10 * * * *`; or
    - keep daily, and have the Radar surfaces state the evidence age.

    `smoke-radar-sweeps` now pins the exact schedule rather than loosening to
    "any cadence", so whoever changes it next has to come here and say which of
    the two they mean.

169. **✅ FIXED 2026-08-27 — a MISSING date rendered as TODAY, including on the
    invoice export.** Found by triage: `smoke-date-resilience` asserts that every
    malformed or absent value formats to empty, and it was returning `2026-08-27`.

    `dateInputValue(value)` delegates to `businessCalendarDate(value, tz)`, whose
    `value` parameter **defaults to `Date.now()`**. That default is right for its
    own callers — `addBusinessCalendarDays(7)` should mean "seven days from
    today" — but a JavaScript default fires on `undefined`, and `dateInputValue`
    formats a value that is supposed to already exist. So every absent date came
    back as the current date.

    Not cosmetic. Of its 34 call sites most are Finance:
    - an `<input type="date">` with no value silently pre-filled **today**, so the
      next save wrote a date nobody chose (`BudgetPotsWorkspace.tsx:224` passes an
      explicitly optional `value?: number`);
    - `invoices.ts:459` — the invoice **HTML export** — printed today as the
      "Issued" date for an invoice that had never been issued.

    `dateInputValue` now returns `""` for `undefined`/`null` and delegates
    otherwise. The test that caught it was right and the product was wrong, which
    is worth saying plainly: it had been dismissed along with the rest of the red
    suite. Finance invoice-identity, aging, accounting-semantics and
    recurring-occurrence all stay green.

168. **🟠 OPEN, low severity — 29 client routes now answer a cross-tenant id with
    403 where the house convention is 404.** A direct and expected consequence of
    #166, recorded rather than left to be rediscovered.

    The house convention is stated at `src/server/phaseApplier.ts:51`: *a client
    outside the caller's agency answers `client_not_found`* — the same as one that
    does not exist, so the answer discloses nothing and reads sensibly in the UI.
    A route gets that right by checking TENANCY first (`getClientForAgency` → 404)
    and PERMISSION second (the element gate → 403). While the element gate fell
    back to legacy `manage` for an unreachable client, gate-first routes reached
    their 404 anyway. Now the gate refuses first, so they answer 403.

    **Nothing is disclosed and nothing is opened** — 403 is returned identically
    for a nonexistent id, and both answers are refusals. This is a consistency
    and message-quality item, not a security one.

    `src/app/api/tenants/close-deal/route.ts` is fixed (tenancy first, then
    permission — the UI behind it is real and `smoke-close-deal-route` pins the
    404). **28 routes remain gate-first**, all under `api/tenants/client-*`,
    `api/tenants/customer-*`, `api/tenants/product-workspaces`,
    `api/portal/contracts/templates` and `api/portal/performance/*`. Reordering
    them is a mechanical sweep, but it changes the answer on 28 live surfaces at
    once, so it wants its own pass and its own suite run rather than riding along
    with a security fix. Get the order from the sweep in this file's history:
    the gate must sit AFTER the route's own `getClientForAgency` check.

167. **✅ FIXED 2026-08-27 — an internal fault inside the Finance access gate was
    reported to the caller as `400` with the internal message in the body.**
    `clientCommercialGate` (three copies: `handlers.ts`, `handlers-r007.ts`,
    `handlers-stripe.ts`) caught everything and passed it to `authErrorResponse`,
    which **rethrows** anything that is not an `AuthError`. Several handlers run
    that gate INSIDE their own `try`, whose tail is `badRequest(e.message)` — so
    an unexpected failure in the access kernel surfaced as a 400 carrying an
    internal string, the wrong status class and a small information leak. The
    gate now answers at the point where the distinction is still known: an
    `AuthError` becomes its own 401/403, anything else is logged and returns
    `500 access_check_failed`.

    Placement was inconsistent, which is what made it easy to miss: the same gate
    sits OUTSIDE the try in `listPaymentsHandler` and `createIncomeHandler`
    (correctly 500-ing) and INSIDE it in `createPaymentHandler` and
    `assignPlanHandler`. Fixing it at the gate covers both placements.

## 🟠 Config / correctness
4. **`.env.example` is missing the 3 required Supabase credentials** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) — all prod-required and enforced by the boot self-check, so a dev copying the example gets a build that fails to start. **Trivial fix.**
5. **`00000` connect code is a dev-only bypass** — ✅ **RESOLVED 2026-08-20 (source-verified).** Real emailed codes shipped: `lib/server/connectionConfirmation.ts` mints a 6-digit code (`CONFIRMATION_CODE_LENGTH`), HMAC-hashes it (`hashConfirmationCode`, `:129`), stores only the hash with a **15-minute TTL** (`CONFIRMATION_CODE_TTL_MS`, `:50`) and single-use semantics, verifies in constant time and **fails closed in every direction that is not an explicit unexpired match** (`:147`), and emails the raw code (`:221-267`). `DEV_CONFIRMATION_CODE` (`:53`) is accepted **only** when `input.bypassEnabled` (`:177`), which requires dev mode. A Resend sender is configured and `inspectProductionReadiness()` reports email READY. **Only remaining gate: the code-step browser walk** — see [connect-flow-real-codes](plans/connect-flow-real-codes.md). *(This item previously pointed at `phases.md #3`, which is superseded history — use [roadmap.md](roadmap.md).)*
6. **Two blob backends use different tables AND row keys** (`portal_kv."__portal_state__"` vs `app_datastores.app_key='aquacrm-portal-state'`) — fine as long as you don't switch backends expecting the data to follow.
7. **Erasure doesn't sweep nested plugin data** — ✅ **RESOLVED** (2026-08-19, [plugin-data-erasure](plans/plugin-data-erasure.md), all phases, runtime-verified in memory). The nested/plugin disposition coverage remains implemented. **Do not read this as “erasure is complete”:** operational false-success, retry and audit-PII defects are open separately as **#24**.
8. **`freelancer` role had no dedicated landing → over-exposure** (found via Dev Mode) — ✅ **RESOLVED 2026-08-19** (Phase 1). `/portal` now branches `role === "freelancer"` → `/portal/freelancer` **before** the client-role fall-through, so a freelancer sees their **own** limited workspace (`server/freelancerWorkspace.ts` — assigned jobs only, fields gated by a **configurable** `FreelancerAccessConfig`, privacy-first defaults) — never the agency-side client workspace. **Current correction, 2026-08-25:** config, per-job overrides, management/preview, resumable direct setup, shared deliverables, private upload/download, owner messaging and submit are all shipped. The former direct-access/capability gap is resolved separately in **#112**. See [freelancer-workspace](plans/freelancer-workspace.md).
14. **✅ RESOLVED 2026-08-23 — published-site Login / Signup native form transport.**
    Both auth routes now accept native form posts as well as JSON and return the browser flow with a 303 redirect. The dedicated `scripts/smoke-auth-form-encoding.test.ts` regression covers the real encoding boundary and rate-limiter path.
    - ✅ **Login: FIXED, and by fix (a), the recommended one.** `api/auth/login/route.ts` now branches on content-type — `POST` dispatches `isFormPost(req) ? handleFormLogin : handleJsonLogin` (`:195-197`); `handleFormLogin` reads `req.formData()` (`:121-126`), re-enters the *same* JSON handler so there is exactly one copy of the sign-in logic (`:133-158`), and answers a browser with `NextResponse.redirect(destination, { status: 303 })` (`:169`). It even carries `code` through so an MFA-enrolled visitor can finish the second factor from a published site (`:151`), forwards the real IP for rate-limiting (`:137-139`), and the error cookie is scrubbed so it can never carry the submitted email or password (`safeErrorMessage`, `:115-119`). The header comment names `api/auth/profile/update/route.ts` as the pattern it copied (`:51-52`) — exactly the reference this issue recommended.
    - ✅ **Signup: FIXED.** `api/auth/signup/route.ts` now distinguishes native form posts by content type, reads `req.formData()`, keeps JSON requests on `req.json()`, and sends the browser path through a 303 redirect. Rate limiting still runs for both encodings.
    - ⚠ **Live published-site acceptance remains unwalked.** Source and route-level behaviour are proven; this is no longer an open transport defect.

    _Original finding (2026-08-19), kept for context:_ found while sweeping the class after the same bug was fixed in Finance's Plans page. `LoginFormBlock` and `SignupFormBlock` (`built-ins/modules/website-editor/src/components/blocks/`) render `<form action={action} method="POST">` **defaulting to `/api/auth/login` and `/api/auth/signup`**. A native submit sends `application/x-www-form-urlencoded` and does a **full-page navigation**; both routes parse the body with `req.json()` only (`login/route.ts:46`, `signup/route.ts:52`) and catch the throw into `NextResponse.json(…, 400)`. So a **visitor to a client's published website** who tries to sign in is navigated off the page onto a **raw JSON blob** — `{"ok":false,"error":"Invalid request."}` — with no way back. Public-facing, and worse than the Plans instance because a real end customer sees it. **Not verified against a live published site** (source-verified only; the blocks may not yet be reachable in a shipped template). **Two clean fixes, both already patterned in this repo:** (a) make the routes accept either encoding and 303-redirect for browser posts — `api/auth/profile/update/route.ts` **already does exactly this** (`req.json().catch(() => ({}))` → `req.formData()` → `NextResponse.redirect(..., 303)`) and is the reference; or (b) make the blocks submit via `fetch` like every other form in the app (`agency-finance/src/components/NewPlanForm.tsx` is the reference shape). **(a) is better here** — it keeps the blocks working without JS. **NOT fixed: both areas are outside the finance lane** — `/api/auth/*` is shared security-sensitive foundation (rate-limited sign-in) and `website-editor` is another worker's plugin. **Needs routing by the commander.** The rest of the sweep was clean: the 3 logout forms ignore their body, the 2 account-page forms hit the already-correct `profile/update`, and `FormBlock` defaults to an empty action (a config gap for the site owner, not broken code). The general trap is written up in [hazards](../workspace/hazards-and-duplication.md).

15. ✅ **FULLY RESOLVED 2026-08-20 (evening) — the `number | null` widening from the proposed fix below is now SHIPPED, on top of the earlier boolean-companion fallback.** `commandIntelligenceService.ts` drops both `?? 0` (`measuredCheckValue` returns `number | null`); `CommandDemandFlow.pageviews/forms`, `CommercialIntelligenceSnapshot.lineage.pageviews/forms` and `BuildCommercialIntelligenceInput.pageviews/forms` are all `number | null`, so a consumer **cannot** read a fabricated zero — the flags remain only as derived display conveniences. Pinned by `smoke-commercial-intelligence` (lineage/demandFlow/KPI value stay `null` for an unmonitored agency; a measured zero stays 0) and re-proved by `scripts/verify-marketing-runtime.ts` (29/29). The earlier note below is kept as history.

    _Earlier resolution note (2026-08-20, superseded):_ **RESOLVED — but by the FALLBACK approach, not the proposed one.**
    The user-visible bug is gone: `_CommercialIntelligenceWorkspace.tsx` now carries `pageviewsMeasured`/`formsMeasured` (`:38-39`, `:114-115`), the funnel row's evidence reads **"Not monitored"** instead of "Aqua Tag" when nothing is tracked (`:117-118`), the number renders **`—` in dimmed text** rather than a confident `0` (`:139`), the detail line says **"Not measured — no Aqua Tag reading"** / "Nothing monitored yet" / "Prior stage not monitored" (`:133-137`), and a ratio is only computed when **both** adjacent stages are measured (`:132`). So an unmonitored agency can no longer be mistaken for a quiet one.
    **What was actually built:** the **boolean-companion fallback** described at the end of the plan below — `checkMeasured(radar, "marketing", "traffic-7d")` alongside the value (`commandIntelligence.ts:126-133`) — **not** the `number | null` widening. Both `?? 0` are still there (`:126`, `:132`). That was the smaller-blast-radius option and it works, **but it leaves the trap the plan warned about open**: a future consumer that reads `lineage.pageviews` and ignores `pageviewsMeasured` gets a confident `0` again. That is the third time this class would bite. **If you touch this file, prefer widening to `number | null` then** — do not treat the plan below as unstarted work.

    _Original finding (2026-08-19), kept for context:_ **An untracked agency's Command Centre reports "0 pageviews" as if the site had no visitors** (found 2026-08-19 by the marketing worker, **runtime-verified**, not source-guessed — `scripts/verify-marketing-runtime.ts`). The Radar emits `value: 0` on `blind`/`learning`/`inactive` checks, so an agency with **zero monitored properties** is indistinguishable from a monitored-but-quiet one. `lib/server/commandIntelligence.ts:126-129` then collapses the distinction permanently: `const traffic7d = checkValue(radar, "marketing", "traffic-7d") ?? 0` (same for `form-submissions`), and passes those into `buildCommercialIntelligence({ pageviews, forms })`. **Two visible consequences, both outside the marketing lane:** (a) `_CommercialIntelligenceWorkspace.tsx:103-104` renders the funnel row **"Pageviews 0 · evidence: Aqua Tag"** with *no* qualifier — it reads as a measured fact that nobody visited; (b) the `traffic-7d` / `forms-7d` KPI cards display **"0"** (carrying a "Learning" badge, which is at least a partial qualifier — arguably acceptable, the funnel row is not). **Reproduce:** `PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx scripts/verify-marketing-runtime.ts` — a fresh agency yields `traffic-7d status=learning value=0`, `monitoredProperties=0`. **The marketing workspace is already immune** (`marketingIntelligence.ts`: only a lens whose own status is `pass`/`critical`/`warning`/`watch` may supply a reading; the pulse additionally drops any `learning`/`blind` KPI's number to "—"), but it can only defend its own surface — the `?? 0` happens upstream, so by the time any other consumer sees the KPI the null is gone. **The clean fix is one line in the owner's file:** keep the null (`checkValue(...)` without `?? 0`) and let `CommercialIntelligenceSnapshot.lineage.pageviews`/`forms` be `number | null`, so the Command Centre funnel can render "—". **NOT fixed — `commandIntelligence.ts` is the KPI/command-intelligence owner's file and the marketing worker's brief is to consume it read-only. Needs routing by the commander.** The general trap ("a Radar `value: 0` is not automatically a measurement") is written up in [hazards](../workspace/hazards-and-duplication.md).

    **📋 PROPOSED FIX — ⚠ SUPERSEDED BY WHAT SHIPPED (see the RESOLVED note above). The user-visible bug is fixed via the boolean-companion fallback; the `number | null` widening described here was NOT done. Kept as the design record for anyone hardening this properly.** _(Marketing worker's plan, published for the commander; Ed authorised the work 2026-08-20; flagged here first per the worker contract, because `commandIntelligence.ts` is the KPI owner's file.)_
    **Verified blast radius — 4 files, not a sprawl** (grepped, not assumed): `lineage.pageviews/forms` is consumed by **only** `_CommercialIntelligenceWorkspace.tsx` (rows 103-104) and the marketing funnel (already null-safe); `demandFlow.pageviews/forms` by **only** `_CommandIntelligenceWorkspace.tsx` (rows 797-798). The three `smoke-commercial-intelligence` assertions are on `leads`/`won`/`activeClients`, untouched.
    **Approach — make the absence unrepresentable rather than flagged.** This bug class has now slipped through twice (the Radar path and the pre-collapsed-KPI path), so a `boolean` companion flag that a consumer can ignore is not enough; the type should force handling:
    1. `commandIntelligence.ts:126,129` — drop both `?? 0`, so `traffic7d`/`forms7d` are `number | null`.
    2. Types → `number | null`: `CommandDemandFlow.pageviews/forms` (`lib/commandIntelligence.ts`), `CommercialIntelligenceSnapshot.lineage.pageviews/forms`, and `BuildCommercialIntelligenceInput.pageviews/forms` (`lib/commercialIntelligence.ts`).
    3. `commercialIntelligence.ts` formulas — `pageview-to-form` / `form-to-lead` already degrade correctly (`percent()` returns `null` on a zero denominator); they need null-input guards so a missing reading yields `value: null` + `status: "learning"` rather than a divide-by-null.
    4. KPI displays — `traffic-7d` / `forms-7d` render `"Learning"` when null, exactly as `campaign-roas` already does (`display: portfolioRoas === null ? "Learning" : …`). No new display convention is introduced.
    5. `trafficBaseline` (line 133) currently `trafficPrevious7d ?? traffic7d`; must not become `null` for the plan target — falls back to `null` target, which `KpiDescriptor.target` already allows.
    6. The two workspaces render `—` for a null instead of `0`.
    **Test plan:** extend `smoke-commercial-intelligence` with a null-input case (lineage stays null, formulas go `learning`); extend the command-intelligence suite to pin `traffic-7d` displaying "Learning" rather than "0" when unmeasured; re-run `scripts/verify-marketing-runtime.ts`, which reproduces the original bug and must still pass 29/29.
    **Rollback:** every change is a widening (`number` → `number | null`) plus display handling — revert by restoring the two `?? 0`.
    **Not started until the commander sees this.** If a smaller blast radius is wanted while other workers are mid-flight, the fallback is a `trafficMeasured`/`formsMeasured` boolean alongside the numbers (additive, nothing breaks) — but it leaves the trap open for the next consumer who ignores the flag, which is precisely how this reached two surfaces.


## 🔴 Open reliability and correctness findings (2026-08-24)

16. **✅ RESOLVED 2026-08-25 — file writes are acknowledged truthfully and
    committed atomically.** `src/server/storage.ts` writes a same-directory
    temporary file, fsyncs it and renames it over the target. File-backed
    `mutate()` does not advance persistence state before that commit succeeds;
    a failed save is surfaced and marks the backend unwritable. The dedicated
    recovery smoke forces the old invalid-target failure and proves that neither
    `mutate()` nor `flushPendingWrites()` can report a false durable success.

17. **✅ RESOLVED 2026-08-25 — malformed file state fails closed.** Invalid JSON
    is preserved and hydration enters a visible unwritable/recovery-required state;
    it is no longer converted into an empty CRM that the next mutation can
    overwrite. `scripts/smoke-file-storage-recovery.test.ts` pins malformed input,
    failed writes and the atomic commit contract.

18. **🟠 IMPLEMENTED 2026-08-25; live database deployment proof remains.**
    Sequential replay, same-process deduplication and the durable claim coordinator
    are implemented. `scripts/schema.sql` now creates the same claim table and
    claim/complete/release functions used by both database adapters; successful
    empty Supabase RPC responses are handled correctly; and the post-provider
    stale-message decision explicitly rehydrates fresh shared state. The 2026-08-27
    hardening routes generation through the shared fenced/deadlined OpenAI adapter;
    makes in-process request deduplication and local claims realm-scoped; rechecks
    fresh durable state before trusting a cached reply; and retains the bounded claim
    after an ambiguous provider/persistence/completion outcome instead of risking a
    duplicate generation. Writable snapshot traffic with live-looking credentials
    makes zero network calls, identical ids in live/Sandbox realms do not coalesce,
    and a warm reply after a simulated flush failure is not reported as durable.
    Focused proof passes **35 tests with 1 optional live-Postgres skip**, plus
    TypeScript/diff. Applying the DDL/migration and running the independent-process
    claim test against the actual production database remains an operational release
    gate, not an unimplemented code path.

19. **✅ SOURCE/REGRESSION RESOLVED 2026-08-25; extended 2026-08-27; destructive-
    transition browser acceptance remains.** *(2026-08-27 addition: the stale-preview
    sibling of this class is now closed too — the pure preview state machine drops any
    status/response snapshot naming a different project, so a poll in flight across a
    project switch cannot hand the new project the old one's lifecycle state or its
    loopback `previewUrl`. Pinned by `smoke-local-repository-preview-ui` 8/8.)* `PageSeoPanel` now aborts prior reads and binds every
    read/write result to the current target. `ElementInsertPanel` binds targets,
    preview and commit results to the current project/element/file context. Mode,
    surface, lifecycle, browser-hide, split-view and refresh transitions now pass
    through the applicable SEO/repository/page-preview discard guards. Editor AI
    state is keyed and reset at the project boundary. The focused editor chain is
    **154/154** and the live editor renders on port 3032 with “All saved.” The
    remaining acceptance task is a deliberate dirty-state browser matrix (type a
    change, exercise every transition, then discard without saving); it is not a
    known source bypass.

    *2026-09-03 acceptance:* the dirty-transition browser gate (`browser-dev-editor-dirty-transitions.mjs`, commit 28fc767) was re-run on a fresh Dev Mode lane built from the integrated `main`: 191 passed / 2 failed / 13 explained N/A rows / 47 observations on the full matrix; the two failures were one timing-sensitive held-reply step that passed on an uncontended rerun of the AI scenario (14/14) and one dev-mode hydration-mismatch console warning raised only inside the AI scenario, recorded as an open residual. The three defects it found are repaired; the recorded, unrepaired items (SEO-field over-asking on lifecycle/refresh/depth prompts, silent SEO draft discard when the phone inspector drawer closes, one colour-contrast and one aria-required-attr pattern on the editor doors) remain open here.

20. **Entity references and website empty states are not consistently truthful.**
    Identity Resolution, Inbox, People and Dev Projects route request ids through the
    shared tenant scope, which rejects a real client owned elsewhere but deliberately
    permits an id that resolves to no client; their write paths can therefore persist
    orphan references. Read/filter callers may legitimately tolerate no match, so the
    write handlers need to require the helper's `.client` rather than changing the
    global helper and breaking deliberate synthetic-id readers.
    Performance Experiments has a method-specific bypass: GET scopes its query id,
    while POST passes `body.clientId` directly to `createPerformanceExperiment()`.
    An isolated memory-backend route probe as an agency-A owner supplied agency B's
    real client id; POST returned **201** and stored an agency-A experiment whose
    `clientId` is agency B's client. Generic Plugin Settings is also unscoped: its
    `scopeFrom()` combines the session agency with a raw request client id, and secret
    fields pass that scope into `saveIntegrationConnection()`. A second isolated
    memory-route probe against an agency-level Finance install supplied agency B's
    client id; POST returned **200** and created an agency-A Stripe connection tagged
    with B's id. Both probes used test-only values. `smoke-app-route-tenancy` misses
    these because its file-level regex accepts any route file containing
    `routeTenantScope(session,` or `session.agencyId`; it does not verify each
    handler/field dataflow.
    The problem is broader than client ids. Isolated memory-store probes persisted
    an unknown task `assigneeUserId`; an unknown checklist-item `sopId`; product
    `companyIds`, `includedProductIds` and `sopIds` that name no records; a KPI target
    in `byCompany["missing-company"]`; and a freelancer access override keyed by
    `missing-job`. The same task probe correctly removed an unknown client and
    top-level SOP, proving validation differs by field rather than being wholly
    absent. In source, Inbox Connection PATCH likewise passes cleaned-but-unresolved
    company and marketing-asset ids straight into `updateInboxConnection()`.
    Mounted Agency Finance writes repeat the field-level gap. The expense service
    validates category and budget pot but stores unresolved `clientId` and `staffId`;
    budget pots, obligations and compensation profiles trim and store company ids;
    obligations also accept an unresolved legal-document id; compensation profiles
    accept unresolved staff and department ids; income accepts an unresolved client;
    and invoices validate their client but not their separate company id. The HTTP
    handlers forward those fields directly. The isolated Finance operation/budget
    suites pass **5/5** while fixtures persist unseeded legal-document and department
    ids.
    A fresh-process service probe widened the behavioral evidence without touching
    shared state. Agency HR stored missing user, department, manager and custom-role
    ids on staff, missing client/role ids inside staff assignments, and a missing
    department parent on update. Agency Marketing stored missing campaign-owner staff,
    lead campaign/assignee, content campaign and touchpoint lead/campaign ids; its
    mounted asset/profile handlers also accepted missing company ids, and a funnel
    asset accepted a missing Development project id. Leads Pipeline stored missing
    campaign company, customer-profile, budget-pot and audience-company ids. Its lead
    conversion then copies an unresolved lead company id into `createClient()`, whose
    core implementation stores that id without resolution. Client CRM accepted a
    missing end-customer user and missing segment ids; Memberships accepted missing
    benefit ids on a plan. Email Sender stored a missing client on both an identity
    and queued message; Team Chat created a direct channel containing a missing user;
    and Task Templates copied a missing step SOP into the created task. The focused
    HR/Marketing/Leads/Email suites still pass **82/82**; several fixtures themselves
    use arbitrary lead or budget references.
    The same fresh-process setup also proved deletion is not referentially safe:
    deleting an HR department and custom role left staff plus a child department
    pointing at the removed rows, deleting a draft Marketing campaign left its lead,
    content and touchpoint records carrying the removed campaign id, deleting a Client
    CRM segment left that id on its contact, and deleting a Membership benefit left
    the id on its plan. Marketing customer-profile deletion similarly does not clean
    Leads Pipeline campaign audience ids, while Marketing asset deletion does not
    clear Inbox connection routing. The more operationally destructive Membership
    plan and Affiliate parent-deletion behavior is separated as issue #63.
    An earlier isolated probe also persisted missing custom-KPI operands, a Custom AI
    owner, Development resource workflow-stage/SOP/company ids, and People manager/
    training-SOP ids. Writes must validate every semantic reference against the
    caller's agency and define whether a missing reference is rejected, explicitly
    cleared, or deliberately retained as a documented stale-reference policy.
    **Current correction, 2026-08-25:** the concrete route slice that opened this
    issue is fixed. Identity Resolution, Inbox, People, Dev Projects, Performance
    Experiments and generic Plugin Settings now require a resolved client before a
    client-scoped write and use the resolved tenant scope; the focused route chain
    passes **55/55**. `readAgencyWebsite()` now returns `null` when no website exists,
    and Marketing renders an explicit “Website not configured” state. The broader
    unresolved field/reference and parent-deletion matrix above remains open.

182. **🔴 FIXED 2026-08-27 (Ed, urgent) — the in-app AI gated on a ROLE and then
    told the model everything.** The other half of *"same for all AI scopes
    actually."* #181 bound the external assistant API to its principal; this is
    the surface Ed uses himself.

    **What was true.** `/api/assistant` gated on
    `requireRole(["agency-owner","agency-manager"])` and then built a context
    containing the agency, **every user with their name, email and role**, every
    client, end customers, pipelines, pipeline cards, 150 activity entries, and
    up to **500 raw entries from EVERY installed module** — `agency-finance`,
    `agency-hr` pay included. The Advisor radar, evidence, sources and skills
    routes and Custom AIs gated the same way.

    So a manager whose element access had been narrowed could not open Finance
    in the UI and **could ask the Assistant instead**. The role check said
    "manager" and stopped.

    **A stricter gate would not have fixed it.** The question is not *may you
    call this endpoint*, it is *what may this endpoint know about you*, and that
    has to be assembled per person. `assistantContextScope.ts` maps every
    section of the context to an element, and `buildAssistantBusinessContext`
    now takes a scope. Its `scope` parameter is **required, not defaulted** —
    a default would mean any future caller that forgot it silently got the
    firehose back, which is how this happened the first time; the compiler named
    all four callers.

    **An unclassified module contributes NOTHING**, which is the reverse of the
    old behaviour: an installed module nobody had thought about had its raw data
    sent because nothing excluded it. The module→element map went into
    `pluginClientElement.ts`, beside the client-scope map that was already
    there, because "which element owns this module" must have one answer — and
    the judgements match `externalAssistantDelegation.ts` deliberately, so an
    assistant inside the app and one over the API cannot disagree about who may
    see finance.

    **The context says what it was NOT given.** `withheld` names the omitted
    sections, so a model can say "I was not given Finance" rather than answering
    confidently from the gap — and a support conversation can tell "there is no
    such client" from "you may not see it".

    **Five routes moved off roles onto elements**, and configuration now costs
    more than reading: writing the Radar policy, editing an Advisor skill and
    creating a Custom AI need `workspace.settings.manage`, not a `view`.

    **One architectural guard fired and was right.** The first cut imported the
    access kernel statically, and `smoke-shared-graph-split` refused it — the
    healthy owner shell must not reach `accessControl.ts` through the Advisor
    drawer. The scope builder is pure and takes resolved capabilities; every
    kernel value is pulled in dynamically.

    `npm run smoke:ai-actor-binding` **27/27**. Probed by breaking it: a builder
    that ignores the scope fails, an unfiltered plugin loop fails, an
    unclassified module allowed through fails, a missing map entry fails.
    **One probe initially passed against a broken build** — the plugin-data
    assertion was vacuous because the fixture had no modules installed. It
    installs `agency-hr` with pay data now, and asserts both that a
    `client.overview` holder does not get it and that a `staff.people` holder
    does, so the filter cannot pass by being a wall.

181. **🔴 FIXED 2026-08-27 (Ed, urgent) — an AI key acted on its own authority,
    and kept it after the person behind it lost theirs.** Ed: *"Aqua AI editor
    must be bound to the user's permissions to prevent unauthorised changes in
    areas!!! same for all AI scopes actually."*

    **What was true.** `ExternalAssistantAuth` had **no user in it at all**. A
    managed key carried its own list of modules and permissions, chosen at
    creation and checked against nothing afterwards, so the access kernel never
    ran on an external assistant request. Three consequences:

    1. a key could be minted with reach its creator did not have — nothing
       intersected the two;
    2. narrowing somebody's access did nothing to keys they had already made, so
       an element hidden from a person stayed readable through their assistant;
    3. **revoking or removing that person left the key working.** Issue #22 made
       revocation immediate for sessions; AI had no equivalent, which is the
       door somebody would actually use.

    The classic confused deputy: a component acting for somebody with more
    authority than they have.

    **What is true now.** A managed key is a DELEGATE.
    `externalAssistantDelegation.ts` resolves the creator's live access at the
    AGENCY scope per request and hands the gateway the intersection of what the
    key was granted and what that person can still do. Re-derived every time —
    caching it into the key would reintroduce the defect one indirection later.
    A key whose principal is gone, has left the tenant, or holds nothing is
    refused `403 assistant_principal_revoked` and the refusal is logged. Every
    one of the 15 modules and 6 permissions is mapped to an element, enforced by
    the type, because an unmapped one would be the one that answers unchecked.
    `actions:propose` — the only WRITING permission — requires `use`, not
    `view`.

    **The near-miss worth recording.** The first cut read `key.createdBy` as a
    user id. It holds an **email** — it was named before there was an access
    kernel, and the activity log renders it as `actorEmail` — so that version
    would have refused **every key ever minted**. A change that looks like a
    security fix and is actually an outage is worse than the hole it closes.
    Keys now also record `createdByUserId` (durable across an email change) and
    resolution prefers it, falling back to a case-insensitive email lookup for
    everything older. Both paths are pinned.

    **The legacy environment token is refused in production.** It predates
    users: no creator, nothing to intersect, and revoking somebody does nothing
    to it, so it carries every module and cannot be narrowed by anything. Local
    keeps it. The error names the fix rather than just saying no. **→ Ed: if
    `AQUACRM_ASSISTANT_API_TOKEN` is in use anywhere live, mint a managed key in
    Settings before deploying — that key will carry your own access.**

    **The Dev Editor AI was already bound** and is now pinned so it cannot come
    loose: `editor-ai`, `editor-ai/reply`, `source-edit`, `repo-write` and
    `librarian` all resolve the actor through `requireDevProjectAccess`
    (capability + element + path scope, #180), and the reply builds its answer
    from the conversation and client-sent context rather than reading the
    repository itself — a test asserts it stays that way, because the moment it
    reads files it needs the path scope or the librarian hole returns by another
    door.

    `npm run smoke:ai-actor-binding` **20/20**, driven through the real gateway
    rather than grepped — an earlier version of these assertions passed while
    the refusal was disabled, because it only matched source text.

    **The in-app half is now done too — see #182.** Ed settled the environment
    token at the same time: *"get it all completed"*, so the production refusal
    stands.

21. **🟠 Read paths cause hidden mutations and shared-fixture races — now
    ENUMERATED, RULED and GUARDED rather than described.**

    **2026-08-27.** The inventory was a paragraph of prose with two numbers in
    it, written 2026-08-24, and prose cannot notice when the code moves under
    it. It is now re-derived from source on every test run and compared against
    a declared list: `scripts/read-path-mutations.ts` (the analyser),
    `scripts/read-path-mutation-inventory.ts` (the declaration and the rulings),
    `npm run smoke:read-path-mutations` **10/10**.

    **Re-derived today: 19 GET-only routes and 38 rendered files**, against the
    original 28 and 26. Not a like-for-like comparison — this pass counts only
    routes that export GET and *nothing else*, and it follows `await import`,
    which the original may not have.

    **The instrument had to be rebuilt to be worth anything.** Asking "can this
    route's import graph reach a module that calls `mutate()`" answered **46 of
    49** routes and **94 of 124** renders — which is not an inventory, it is the
    observation that everything imports `@/server/tenants` eventually, and it
    would have become a large allowlist nobody reads. The unit is now the
    FUNCTION: `listClients` and `createClient` share a module, and importing the
    first does not implicate the second. Four separate over-reaches had to be
    closed to get there, each of which alone flattened the answer — storage
    hydration counted as a write; TypeScript's inline `import("./types")` TYPE
    syntax counted as a dynamic import; a module's dynamic imports attributed to
    every function in it; and type declarations treated as code. The test keeps
    three canaries (`getAgency`, `listClients`, `getClientForAgency`) that every
    broken version flagged.

    **The rulings.** 16 of 37 causes are settled — 6 callbacks where the GET
    *is* the effect (magic link, Google/Meta/Calendar returns, embed consume),
    3 cron sweeps behind an HTTP door, 1 audit stamp
    (`authenticateExternalAssistant` writes the API key's last-used time on
    every one of five external READS — deliberate, and worth knowing), and 6
    genuinely open: `ensureDefaultAgencyProducts` (seven renders **and**
    `/api/portal/search`), `ensureAgencyWebsite` / `ensurePrimaryAgencyWebsite`
    (including the PUBLIC website layout), `makePluginStorage`, `installPlugin`
    (a module installed on ordinary navigation) and `listOperationalAlerts`.
    Every one of those six was named in the original prose, which is the
    strongest evidence the new pass is measuring the same thing.

    **All 21 remaining causes were then read, and the backlog is at ZERO** — the
    pin is `UNRULED_CAUSE_CEILING = 0` and the test refuses a pin higher than the
    truth. Reading them changed both the size and the substance of the finding.

    **Six hand-overs were the noise.** A static pass cannot tell
    `register({ activity: activityPort })` from `activityPort.logActivity(…)`,
    nor a factory that RETURNS a handle whose `set` writes from one that writes
    now. Four foundation adapters, `makePluginStorage` and `appConfigEditAdapter`
    were carrying a write claim up through a dozen callers — the whole customer
    portal, the public proposal page, the company-health and staff-capacity
    snapshots and the agency LAYOUT were "writes" because an adapter three levels
    down hands a logging port to a plugin registry. They are declared in
    `PASS_THROUGH`, each with a justification the test requires. Suppressing the
    hand-over rather than its callers matters: everything downstream is
    **re-derived**, so a caller that reaches a writer another way keeps its
    entry and shows the chain that really applies.

    **That is not theoretical — it is how the most important finding surfaced.**
    With the six removed the Radar chain did not disappear. It re-resolved onto
    a real write the noise had been hiding:

        getCachedBusinessIssueRadar → listOperationalAlerts → ownerChatAttention
          → chatAttentionForUser → listPeopleChannels → ensureTeamChannel

    `listPeopleChannels` called `ensureTeamChannel` **unconditionally**, and that
    creates the Team channel when it is missing. #21 recorded this as something
    alert construction can do; it is wider than that. The Radar reaches it, and
    the Radar is mounted by `RadarQuickLookControl` **on the agency layout** — so
    on ordinary agency navigation, plus the Assistant, Calendar and People pages,
    plus `/api/portal/attention/plan`, an EXPLAIN endpoint.

    **✅ FIXED 2026-08-27.** The team channel now has a **deterministic
    per-agency id** (`channel_team_<agencyId>`), a read gets it **unsaved** via
    `teamChannelFor`, and the first `postPeopleMessage` persists it under that
    same id. The determinism is what makes the fix safe rather than clever: the
    channel a reader sees, selects and marks read carries the id it will have
    once it is real, so nothing the UI holds goes stale at the moment it becomes
    real. Agencies created earlier keep their generated id — the lookup is still
    by `kind` and runs first — so nothing migrates and no channel is duplicated.
    `npm run smoke:people-workspace` 23/23, with the read-only guarantee and the
    legacy-id case both pinned and both probed by reverting the fix.

    **What the chain resolves to now** is one hop further along:
    `listExternalAssistantActionProposals` → `releaseExpiredParks`, which returns
    parked assistant proposals to pending at their due time. Guarded by
    `if (!expired.length) return`, so it writes only when something has actually
    expired — a bounded lazy expiry rather than a first-load creation. Whether a
    park should release when nobody is looking is a product question, so it is
    ruled and left rather than changed unilaterally. That peeling is the
    inventory working: fix one, the next one behind it becomes visible instead of
    staying hidden behind it.

    **After the re-derivation: 16 GET-only routes and 27 renders** (from 19 and
    38). 10 causes are deliberate — 6 callbacks, 3 cron, 1 audit stamp. 15 are
    open, and they are mostly ONE KIND of thing, which is worth being exact
    about: **idempotent first-touch seeders**. `ensureDefaultAgencyProducts`
    (eight surfaces plus `/api/portal/search`), `ensureAgencyWebsite`,
    `ensurePrimaryAgencyWebsite`, `ensureTeamChannel`. Not "every page load
    writes" — "the first page load that reaches this writes, once". That still
    matters: on the file backend one write rewrites the whole state blob, so
    that request pays for all of it; and a GET that writes cannot be cached,
    served from a replica, retried blindly, or run read-only.

    **Two are not seeding, and are sharper.** `installPlugin` provisions a whole
    module from the agency catch-all during navigation. And the Marketing render
    reaches `processAutomationSweep` — the same function `/api/internal/sweep`
    exists to run on a schedule. `loadDevelopmentData` is a third: three
    Development pages reach `migrateLegacyStageRefs`, so a render can run a data
    MIGRATION.

    **Still triggerable by a stranger:** exactly one —
    `ensurePrimaryAgencyWebsite`, from the public website layout.

    Probed by breaking it: a read route given a hidden write fails; a deleted
    declaration fails; a cause whose ruling disappears fails twice; a REMOVED
    suppression fails (so the six are load-bearing and visible, not a quiet
    filter); and a suppression naming a function that no longer exists fails.

    _Original finding (2026-08-24), kept for context:_ A TypeScript
    call-graph pass, excluding ordinary hydration and the auth routes, found **28 API
    `GET` handlers** and **26 rendered page/layout files** with a reachable
    `mutate()` path. Some are deliberate effects exposed as GET for cron or OAuth
    callbacks. Others create/migrate products and
    workflows; materialise portal designs, websites, telemetry and master keys;
    release expired proposals or process automation; create the first Team Chat
    channel and mark it read; or touch external-API-key last-used time. Representative
    routes include `/api/portal/products`, `/api/portal/search`,
    `/api/portal/development`, `/api/portal/client-portal-design`,
    `/api/portal/dev/projects`, `/api/portal/website-sources`,
    `/api/portal/website`, `/api/tenants/client-telemetry`,
    `/api/portal/team-chat`, `/api/portal/automations`, the Radar/attention/
    notifications reads, Meta/Google callbacks, cron handlers and the external API.
    Render-time examples are broader still: the agency layout can install or re-enable
    Leads Pipeline on ordinary navigation; the plugin catch-all provisions selected
    modules; Marketing's Automations view processes due runs; the demo Inbox clears
    identity reviews; alert construction can create the team channel, release expired
    proposals and materialise enquiry people; and the public website layout can create
    the primary website record. These are reachable paths, not a claim that every
    render writes after state has already been initialized.
    On the file backend, actual mutations can trigger a whole-state rewrite and
    contribute directly to slow navigation. **Current correction, 2026-08-25:**
    public `/showcase` now uses a separate seed-once tenant and no longer resets the
    owner's shared demo fixture on every visit. The Finance default-currency resolver
    is now pure and no longer patches install config while rendering. The rest of the
    28-GET/26-render-path inventory still needs classification and removal or
    deliberate mutation semantics. The Command Centre compounds
    this: with no opt-in performance cookie it runs the Radar, operational alerts,
    company health, portfolio and client-attention stage, then a separate intelligence
    build; a founder also triggers the Dev Team disk scan. The Radar cache is only
    30 seconds. The 2026-08-25 browser continuation behaviorally confirmed the
    original render-time class when opening demo Finance persisted
    `install.config.ukDefaultCurrencyV1 = true` to the fenced copy; that specific
    path is now closed, while the wider class remains open.

24. **✅ RESOLVED 2026-08-25 — client erasure is failure-aware and retryable.**
    Live hosted-table scrubs and plugin hooks complete before local deletion. A live
    or plugin failure preserves the local client and records de-identified durable
    failure outcomes so the normal route can retry; the HTTP route returns **502**
    with `ok:false` and `retryable:true`. Only a complete run deletes local records
    and returns success. The permanent audit says “a client” and does not retain the
    erased name. The behavioural regression forces all three live deletes to fail,
    proves the client/records remain, retries successfully, and then proves removal;
    the erasure/governance chain passes **53/53**.

25. **🟠 SOURCE AND ISOLATED-BROWSER REPAIRED 2026-09-02; provider-backed live-
    persona/shared-credential acceptance remains — staff workspace authority now
    comes from one canonical capability policy.** Proxy
    routing, staff navigation, workspace pages and the tested API families share
    `staffWorkspacePolicy.ts` instead of maintaining independent route allowlists.
    A staff member can be Hidden, View or Manage per workspace; View admits reads
    but rejects mutations, Manage admits the declared operations, and a downgrade
    takes effect on the next request. Portal Studio follows that same exact rule:
    Manage can load/save/publish, View can load and inspect an update plan, and
    Hidden can do neither. Foreign-client scope is refused, while owner/manager
    behaviour is unchanged and manager-only AI configuration, project rebinding and
    Developer mode remain separately restricted. The staff policy/Portal Studio
    focused gate passes **35/35**. A 2026-09-02 production-browser roundtrip created
    one reusable role, saved Projects at Manage, reloaded it, downgraded to View,
    reloaded again and archived it; the 1280px document stayed exact-width with no
    console or network error. The final Fulfilment probe at 390px and 1280px exposes
    **11** element radiogroups and 11 each Hidden/View/Use/Manage plus Projects,
    Portals and Aqua Tags, again exact-width and error-free. A separate isolated-
    production Staff Technical run then passed **50/50** across six same-cookie
    Hidden → View → Use → Manage → View → Hidden transitions with zero failures,
    errors or overflow. Hidden routes render valid streamed Next not-found content
    (document HTTP 200 or 404), and the exact API was refused with 403 after the
    downgrade. Source and isolated-browser enforcement are therefore proven; only a
    provider-backed live-persona/shared-credential acceptance walk remains before
    closing the item completely.

26. **✅ RESOLVED 2026-09-01 — Stripe refund and dispute webhook effects are durably
    idempotent across processes.** The module-level `processedEventIds` set is only a
    warm-process shortcut. Refund rows use provider refund/event identities, dispute
    rows use the provider dispute identity, and their deterministic storage writes own
    the cross-process correctness boundary. The focused ledger suite starts independent
    file-backed processes, races the same refund and dispute deliveries, reloads fresh
    state and proves one row plus exactly one emitted side effect for each event family.
    `scripts/smoke-finance-refund-ledger.test.ts` passes **4/4** on current `main`.

27. **✅ RESOLVED 2026-08-25 — the Next.js route contract and production build
    pass.** The Dev Projects handler now requires `NextRequest`; direct test callers
    supply one, and `scripts/smoke-next-route-contracts.test.ts` prevents optional
    route parameters from returning. `npm run build` completes optimized compilation,
    type checking and **268/268** static-generation entries. A checked-in CI gate is
    still a process improvement, not a current source build failure.

28. **P1 PARTLY RESOLVED 2026-09-01 — exact-scope install state now gates optional
    AI controls without the guaranteed `/ai-builder/status` 404, the Ecommerce
    variants contract is present and every retired local admin route redirects.** The
    prior Sites island and its thirteen calls are gone; this pass removes two more dead
    endpoint expectations and lowers the explicit ratchet from sixteen to **fourteen**.
    Focused contract/navigation coverage passes **32/32** and the Website Editor suite
    passes **49/49 files**. Funnels, split tests, visitor backends and optional AI action
    routes remain real work; the ratchet prevents their absence being called green.

    _Original finding, retained for context:_ The website-editor surfaces advertised operations whose API routes did
    not exist at the paths they called. `EditorPage` mounts a visible Funnels
    section and `NewFunnelModal`, but `lib/funnels.ts` calls
    `/api/portal/website-editor/funnels`; the plugin registers no funnel routes, so
    create can only return “Failed to create funnel.” The selected-block **Split**
    tab similarly calls an unregistered `split-tests` family. The publish modal
    first calls the nonexistent top-level `/api/portal/content/<site>/publish`,
    then `promoteSiteToGitHub()` calls
    `/api/portal/website-editor/promote/<site>` even though the registered route is
    exactly `/api/portal/website-editor/promote` and expects `siteId` in JSON.
    `SitesPage.tsx` contains ten legacy top-level families—`heartbeats`, `domains`,
    `config`, `embeds`, `content`, `promote`, `schema`, `discoveries`, `embed-theme`
    and `chatbot`—while the implemented config/embed/content/discovery handlers live
    under the `website-editor` module namespace. Some panels show an error; others
    silently degrade to empty data or optimistic browser-local state. The optional
    AI capability probe also requests `/api/portal/ai-builder/status`, but no
    `ai-builder` module is registered, producing a 404 before correctly hiding the
    button. A focused route-table check confirms `funnels`, `split-tests`,
    `settings` and `promote/<site>` are missing while `promote`, `content/publish`,
    `content/preview-token`, `embeds`, `embed-theme` and `discoveries` are registered.
    The registered `promote` route is not a hidden working alternative: its handler
    is explicitly a Round-1 shim that returns `{pending:true}` with a note and never
    reads GitHub credentials, writes files, creates a branch or opens a pull request.
    Both visible promote surfaces promise a real PR and require a `prUrl`, so merely
    correcting their paths would still end in failure. The AI availability probe is
    also applied only to the top-bar Generate control. When an image is selected,
    `EditorPropertiesSidebar` still always shows **Generate variations** and **Edit
    with mask**; those modals POST to the same absent `ai-builder/image/variations`
    and `ai-builder/image/inpaint` families even after the status probe has established
    that no AI Builder is mounted.
    Repoint the UI to one canonical route contract, implement or honestly remove
    unfinished controls, and add a test that resolves every literal editor API call
    through the actual plugin/app route table.

    *2026-09-03 acceptance:* the newsletter block's facade (commit d245e51) is browser-proven on an isolated production build: the editor preview mount is inert (submit disabled, "Available when published", zero facade requests), the facade answers 201 with a receipt, replays the same operation 200, refuses drifted reuse 409, a wrong consent version 400, a honeypot 200 "accepted" without persisting, and a missing Origin 403; the operator read is session- and tenant-gated (release gate W1–W3). The dead-call ratchet is 13.

29. **P1 PARTLY REPAIRED 2026-09-02 — Contact capture, Blog summaries/detail and
    Ecommerce now have narrow tenant-scoped visitor facades, and published page
    content is snapshot-stable; the other visitor backends remain open.** Published
    sites now carry their exact agency/client scope into separate public catalogue,
    product-detail, quote, checkout and opaque-session receipt routes. Operator routes
    stay session-gated, hidden/archived catalogue rows stay private, prices are
    server-authoritative, browser-supplied customer identity is refused, provider
    failures are generic and retryable, and the public Stripe webhook remains
    signature-authorised. Product Search now uses that facade and is no longer falsely
    disabled as “Not connected yet”. The dispatcher-level storefront proof passes
    **6/6**, the visitor-backend ratchet passes **11/11**, and the wider checkout/order/
    tenancy slice passes **51/51**. Website Editor also exposes a strict exact-install
    Contact command plus published-summary and single-post Blog reads. Contact requires affirmative
    versioned consent whose exact displayed statement is digest-bound to the submission;
    it persists one atomic receipt/submission record without returning operator data.
    Blog Post uses the public allowlisted detail facade, renders the returned body
    through the host child renderer and no longer exposes a raw-JSON/global fallback.
    Blog bodies are bounded to 250 blocks, 12 nested levels and 250,000 JSON
    characters, and a body cannot recursively mount another Blog Post block.
    Publishing now records an immutable versioned visitor snapshot: blocks; slug,
    title, description and homepage status; portal classification; privacy/password;
    the exact theme record; CSS/head/foot injections; layout, SEO, redirects and
    locales. Later editor saves remain preview-only until republish, revert restores
    the complete published view, and legacy rows migrate on first edit without
    replacing what visitors already saw. Focused public visitor/publication proof
    passes **20/20** and the complete Website Editor gate passes **49/49 files**.

    This does **not** close the issue. Contact submissions still need their intended
    operator inbox/notification workflow. Forms, Bookings/Reservations, Newsletter and
    Theme remain absent or deliberately labelled unavailable; the Affiliate promises
    and the Donation recurrence contract remain incomplete.
    They are tracked here and in **#184/#185**. Mounted anonymous Contact/Blog/Ecommerce
    acceptance, published-site search → quote → checkout → receipt and a real
    Stripe/custom-domain run also remain.

    _Historical pre-repair finding, retained to identify the still-open block classes;
    its Contact, Blog Feed/Post and Ecommerce route/host statements are superseded by the current
    evidence above:_
    The built-in **Contact** page template and generic `form` block default to a
    native POST at `/api/contact`; that route does not exist (the real public ingest
    is `/api/public/contact`). The separate `contact-form` block fetches
    `/api/portal/forms/submit`; `form-embed`, `form-render` and the form picker call
    `/api/portal/forms/*`; there is no registered `forms` module. Website Editor
    does register `/api/portal/website-editor/forms/submit`, but it is a different
    path/contract and is not declared public, so it is not a drop-in anonymous
    storefront endpoint. `booking-widget` calls four absent `reservations` routes,
    and `newsletter-signup` calls an absent `newsletter/subscribe` route. The class
    is broader than forms: visitor-facing Blog Feed/Post fetch registered
    `website-editor/blog/*` routes that are not marked public, Product Search,
    product loaders, donation/checkout and the ecommerce bridge call authenticated
    ecommerce routes, and Theme Selector calls absent `/api/portal/themes/<site>`.
    The Membership pricing blocks likewise read role-gated portal endpoints and
    collapse anonymous/API failures into “No tiers available.” Affiliates compounds
    that pattern: its Leaderboard calls a route the plugin does not register and
    translates the resulting 404 into “No data yet,” while successful Signup only
    creates a pending affiliate row but promises that a unique referral link will
    be emailed within minutes; no code or email action follows enrolment. Donation
    also offers “Make this monthly,” although its own implementation sends the same
    one-off checkout in either state and the checkout handler ignores its recurring
    fields.
    All of these blocks are registered in the palette; Contact is also emitted by a
    first-party page template. Two promised host globals are also never assigned
    anywhere in source: `BlogPostBlock` falls back to a visible JSON dump when
    `window.__aquaRenderBlocks` is absent, and `ThemeSelectorBlock` returns early
    when `window.__PORTAL_SITE_ID__` is absent. Existing smoke tests assert
    registration, fields and SSR markup, so they pass without one successful
    anonymous request or a real host integration. The static
    export README admits forms/booking will not work without backend wiring, but the
    live palette/template does not carry that acceptance gate. `crm-contact-form`'s
    no-`formId` branch already demonstrates the correct pattern by using
    `/api/public/contact` and requiring both HTTP success and `{ok:true}`. Give every
    functional block a real public, tenant-aware endpoint or label/remove it from
    publishable surfaces; then test the actual anonymous request and stored result.

    *2026-09-03 acceptance:* the newsletter visitor facade joins Contact, Blog and Ecommerce as a browser-proven visitor backend (see #28 note). Forms, Reservations and Themes promises remain.

30. **✅ RESOLVED 2026-09-01 — website export is reachable, honest and mounted.**
    Editor settings selects a tenant-scoped site and downloads through the
    registered `/api/portal/website-editor/export` handler; the dead admin route is
    gone. The exporter faithfully renders the representative first-party Homepage
    vocabulary, refuses empty-shell output, marks unsupported dynamic blocks in both
    HTML and README, reports their count/types in safe response headers, preserves
    connected forms and visibly disables unconnected ones, and never exports the
    private half of a Supabase connection. Focused route/UI/export proof passes
    **18/18** plus the static-export behavioural script at **68/68**. Mounted demo-owner
    acceptance selected and published the representative `Client website` homepage,
    downloaded the canonical **4,020-byte ZIP** with HTML, brand CSS, sitemap, robots
    and README, and compared its hero, CTA, three testimonials and final CTA with the
    published route. The one dynamic `product-grid` difference is visible in exported
    HTML and named in the README. Settings and published output had no horizontal
    overflow at **375×812, 768×1024, 812×375 and 1440×900**; a cream-on-white settings
    contrast defect found during that pass was repaired and visually rechecked. The
    Website Editor gate passes **49/49 files**. Production-host and repository-promotion
    acceptance remain release gates, not a missing local export contract.

    _Original finding, retained for context:_ The visible Customise → Export & repo control requests
    `/api/admin/export-code`, but no app or plugin route implements that path.
    A separate `handleExportSite()` exists, yet `api/routes.ts` neither imports nor
    registers it, so `/api/portal/website-editor/export` is absent too. Even if that
    handler were registered, its static renderer understands only the small generic
    set `heading`, `text`, `button`, `image`, `spacer`, `divider`, `section`,
    `container`, `row`, `column`, `grid` and `html`; every other registered block
    becomes a generic shell with only `props.text`, if present. Running the current
    renderer against the first-party Homepage template produced an empty Hero, an
    empty Product Grid, an empty Testimonials block and an empty CTA; only the
    nested Featured products heading survived. The bundled README warns that live
    forms/commerce will not work on a third-party static host, but it does not warn
    that ordinary visual content is discarded. The export smoke covers only the
    narrow supported primitives, so it passes without testing a first-party
    template or the visible button's route. Define one real export product and
    route, render every publishable content block faithfully (or reject unsupported
    blocks visibly), and compare a representative published page with its exported
    HTML before calling export usable.

31. **✅ RESOLVED 2026-09-01 — every visible browser-only Website Editor admin
    island is retired or replaced.** Sections, Popups and legacy Page Detail are gone
    from the manifest, navigation, tabs and source; old bookmarks execute redirects to
    the canonical Editor/Pages routes. Customise is now an honest Editor settings page:
    browser-local editor-mode preference plus tenant-scoped site selection and export,
    with unsupported blocks named before export. The unconsumed branding, login,
    sidebar, section and popup stores are deleted. Focused proof passes **32/32**, the
    Website Editor suite passes **49/49 files**, and the change removes roughly 2,789
    lines of unreachable local-authority code rather than preserving a second model.

32. **✅ RESOLVED 2026-09-01 — Campaign delivery state follows the provider, not the queue.**
    `CampaignService.send()` now uses the delivery-capable port, counts and stamps a
    lead only after confirmed provider delivery, and records queued, failed and
    partially-sent outcomes without inventing a sent date. Unfinished lead ids remain
    retryable and already-delivered recipients are not sent twice. The foundation
    adapter performs enqueue → deliver, resets terminal failed rows through the same
    retry path as Outbox, and carries the provider result back to Campaigns. Provider
    readiness now checks an active configured provider plus an active sender identity;
    merely installing/enabling email-sender no longer hides the warning. The UI says
    “delivered” and exposes queued/failed counts and retry state. Focused behavioural
    proof passes **73/73** across the campaign domain (**64/64**) and email-sender
    foundation (**9/9**), including happy delivery, unconfigured provider, enqueue-only
    adapter, partial refusal, retry, empty audience and duplicate-recipient protection.

33. **P1 — paid Memberships is code/behaviour repaired; live Stripe acceptance
    remains.** The foundation now resolves the enabled Ecommerce install in the same
    agency/client scope, reads its vaulted Stripe credentials and creates a real SDK
    adapter for every Memberships Stripe operation. Missing credentials return null,
    so availability and health are false before a paid flow starts. Partial default
    seeding now names Silver/Gold failures instead of silently leaving only Bronze.
    Provider commands carry durable identities, Stripe metadata is scope-complete,
    concurrent delivery has one owner and the mounted signed-webhook route returns
    503 for retryable processing failures. The current checkout command additionally
    fingerprints every provider-affecting input (mode, price, trial, return targets
    and existing subscription identity), rejects same-operation intent drift and
    lets a new operation replace only an expired Checkout result. Stripe expiry is
    retained, provider destinations must be credential-free HTTPS, and mounted
    customer controls refuse malformed or wrong-plan/cadence 2xx responses before
    navigation or reload. Focused lifecycle, webhook-inbox and module proof passed
    **21/21** on 2026-09-01; record the post-review Memberships aggregate before the
    next release checkpoint. Remaining acceptance needs a real Stripe
    test account: paid plan creation → hosted checkout → signed webhook → portal
    change/pause/resume/cancel → reload/reconciliation. Do not close this from an
    injected SDK client alone.

34. **✅ RESOLVED 2026-08-26 — Email Sender's no-provider contract is truthful.**
    Provider `none` now returns `provider_unconfigured` before the queued row enters
    `sending`; it creates no external reference, `sentAt` or `email.sent` event and
    never promotes the provider to active. The defensive `NoopDriver` also returns
    failure if invoked directly. Provider configuration changes reset readiness;
    only a successful Postmark/SMTP delivery can set `active`/`testedAt`. Test-send
    and retry map disabled delivery to HTTP 409, the outbox explains that rows remain
    queued, and health is false until a capable provider is active with an active
    identity. Behavioral coverage proves normal delivery, direct-driver use,
    test-send API response, persisted row/provider state and health; the Email Sender
    module passes **23/23** tests plus its package typecheck. Consumer-specific false
    milestone defects remain separately tracked in **#32** and **#39** rather than
    being hidden by this engine-level resolution.

35. **✅ RESOLVED 2026-09-01 — plugin health is periodically measured, persisted and
    interpreted honestly by Radar.** The shared runner bounds every hook, isolates
    throws, runs enabled installs concurrently and hands module checks read-only
    storage. The Radar cadence calls a persistent agency-wide sweep, recording the
    module's own verdict and check time through a host-only writer; module-facing
    patches cannot forge health. Unsupported, never-run and stale checks remain
    absent evidence rather than green, while current failures remain visible even
    beside an unchecked install. The live GET route uses the same runner without
    mutating state. Focused route/sweep/Radar/read-path proof passes **65/65**, covering
    healthy, failing, throwing, unsupported, never-checked, stale, cadence, force-run,
    tenant scope, timeout/concurrency contract and read-only enforcement.

36. **P1 CODE/PATH RESOLVED 2026-09-01; mounted provision/reload acceptance remains.**
    The client header no longer mounts the unregistered `portal-export` wizard. “Build custom
    portal” now lands on the canonical Systems → Properties and deployments workspace, whose
    provision action is backed by `/api/tenants/client-projects/provision`; the unused wizard and
    its dead preset/export calls were removed. The navigation and route-truth regressions pass in
    the focused **57/57** set. Still browser-prove provision → durable property → reload and the
    subsequent publish/deploy journey with configured providers.

    _Original finding, retained for context:_ On a manageable client with an assigned product and no
    materialised portal folder, the overview mounts `BuildPortalWizard` as the main
    portal action. Opening it requests `/api/portal/portal-export/presets`; the 404
    is deliberately swallowed and three static templates remain, so the missing
    backend is invisible. Submit then POSTs
    `/api/portal/portal-export/clients/export` and promises “Creates a separate
    client portal workspace.” No app route, built-in manifest, package or runtime
    registration for `portal-export` exists in the current repository. The wizard's
    plugin selections are also documented as informational and would not be honoured
    even by the expected v1 contract. Current tests assert that the CTA is driven by
    `customPortalExists()` but do not resolve either endpoint or create a folder.
    Implement/register the materialisation service or replace this path with the
    working canonical portal provisioner; expose unavailable state before the modal,
    honour the selected systems/templates, and browser-prove submit → durable portal
    → reload → “Open live experience.”

37. **✅ RESOLVED 2026-09-01 — client project provision, GitHub publish and Vercel
    preview deploy recover across the recorded partial-success boundaries without
    duplicates or stale-array loss.** Every request carries an immutable request hash;
    retrying the same operation key with changed intent is a **409**, never an excuse
    to adopt earlier side effects. Provisioning uses a recovery-token staging folder
    and atomic final rename, cleans only its own failed staging work, and can adopt an
    exact matching Git checkout byte-for-byte without deleting the directory or its
    uncommitted edits. It validates `aqua.config.json` ownership before reuse and
    preserves a concurrent claimant by stepping aside.

    GitHub records the repository before push and bridges the create-to-checkpoint
    window with an exact provider-visible recovery token; arbitrary same-name repos are
    refused and the clean description is restored after checkpoint. Vercel similarly
    tags and records the exact preview so retry finds it rather than stacking another.
    Provision, publish and deploy all share one per-client transaction, keep its remote
    lease alive during slow provider I/O, rehydrate durable state afterwards and merge
    only the target property id. Focused provisioning/recovery passes **20/20** and the
    cross-process coordinator set passes **4/4**; app-route/Next contracts pass
    **30/30**, with TypeScript and diff checks clean. These are mocked-provider and
    service proofs: configured GitHub/Vercel plus mounted provision → publish → deploy
    acceptance remains under **#36**, and has not been claimed here.

    _Original finding, retained for context:_ Local provisioning copies and tokenises a starter,
    creates a Git repository and commits it before saving the client property. If
    that save fails, the folder remains untracked; retry's `uniqueProjectPath()`
    deliberately creates a `-2` sibling, and the existing test proves only that it
    never overwrites. `publishProjectToGitHub()` creates the private repository before
    configuring/pushing the local remote. A later Git or client-state failure leaves
    the remote untracked, while retry repeats repository creation and can collide.
    `deployProjectPreviewToVercel()` uploads files and creates a deployment before
    recording its id/URL; a later local failure leaves an untracked preview and retry
    creates another. There is no operation id, pending/external-success state,
    lookup/reconcile path or compensating cleanup. Tests cover successful
    provisioning/provider calls but no failure/retry transition. Persist intent
    first, retain the local path/provider ids as soon as they exist, use stable
    idempotency/reuse where possible, and reconcile or safely clean partial results.
    Prove failures after folder creation, initial commit, repository creation, push,
    deployment creation and client persistence, then retry without duplicates.

38. **P1 PARTLY REPAIRED 2026-09-02 — final owner writes, staged abandonment,
    exact replay/claim binding, recoverable deletion and mounted batch retry now
    preserve explicit truth; live/distributed acceptance remains.** State-backed final uploads flush their owner
    row inside a shared attach boundary, roll the exact row/audit back on a refused
    flush, durably confirm that rollback before compensating the binary, and keep
    the binary when rollback cannot be proved. Call recordings use the same boundary
    around their scoped database update.

    Client upload correctness now lives after binary storage inside a fresh durable
    per-client `files` transaction. That transaction rehydrates current state,
    rechecks the operation key against exact workspace scope and server SHA-256, and
    merges the new row by immutable id. A concurrent matching replay returns the
    durable winner and compensates only this request's uniquely keyed losing binary;
    a changed-body retry conflicts. If persistence fails, rollback takes another
    fresh lock and subtracts only its id rather than restoring a request-start array,
    so concurrent uploads, renames and deletion-recovery fields survive.

    Client-file deletion persists `deleting` before provider I/O, retains refusal as
    `delete-failed`, treats an already-absent object as converged and merges its result
    into the latest collection. Product-workspace retries retain exact accepted/
    completed counts across reload and reset attachment completion when an asset is
    removed. Anonymous Careers failures log provider/database detail server-side under
    an opaque incident id but expose only one stable generic DTO—never `storageKey`,
    `attached.detail` or raw failure text. The focused private-object lifecycle set
    passes **33/33**.

    Inbox, expense and campaign staging now persist lifecycle intent before provider
    I/O and confirm the exact returned key. Claim and commit validate the complete
    expected binding set—provider, storage key and cardinality—and a claim id fences
    unrelated callers while allowing only the same explicit replay. Inbox replies,
    enquiry replies, client requests, expense create/update and campaign create/update
    claim staged objects before owner commit and complete ownership inside the shared
    lifecycle lane. A deterministic refusal before any owner write releases that exact
    claim; ambiguous storage/post-write outcomes retain it for reconciliation. The
    scheduled sweep serialises with adoption, persists `sweeping` before destructive
    provider I/O, adopts already-persisted PortalState owners and marks an expired
    ambiguous claim for recovery instead of renewing or deleting it. Legal, SOP
    and Development deletion use durable sanitised recovery checkpoints; ordinary
    readers hide pending deletes and dedicated retry-only UI exposes failures. The
    authoritative Legal/SOP/Development update and bulk-rewrite siblings now share
    the same agency deletion lane, including SOP category retirement and Development
    workflow/reference migration. Focused gates pass **33/33 private lifecycle,
    21/21 Legal and 18/18 SOP**.

    Social reply retries now bind one stable operation id to the exact conversation,
    text and attachment-token payload. Both mounted inbox implementations rotate the
    operation id when that payload changes; server preflight and the atomic store check
    reject a mismatched replay. A durable matching social owner can recover its staged
    object to `ready`, including a later connection-readiness refusal, without creating
    another message. Expense create uses an exact durable intent, derives canonical
    attachment URLs from server-owned provider/key metadata and makes persisted
    attachments authoritative on replay; create/update validation refusals release
    only their exact claims. Campaign create/update similarly bind exact asset identity,
    fence ready-object reuse and release definite pre-write refusals. Website enquiry
    and client-request routes reject malformed or duplicate upload tokens and require
    exact signed provider/key binding; client workspace-busy refusal also releases the
    just-acquired exact claim. Focused Finance and Meta gates pass **39/39** and **6/6**;
    the complete changed-surface gate passes **85/85**.

    Finance obligation create/update and Company governance PUT now perform their final
    legal-document availability checks and complete persistence in the same agency
    lifecycle lane used by legal deletion. A purge therefore cannot cross an accepted-
    but-not-yet-persisted citation or be followed by a stale governance resurrection.
    The earlier widened Finance/legal checkpoint passes **167/167** and the final
    legal-dependency suite, including the governance and update/delete races, passes
    **21/21**. Generic Postgres whole-state transactions are now reentrant only inside
    the active backend/realm/key-owning async scope; the authenticated attachment
    path, unrelated-caller exclusion and escaped-work drain pass **7/7**.

    This issue is **not closed**. No live Supabase/Vercel Blob/local-production provider
    exercise, real process-kill/multi-process database-lease run or mounted forced-
    failure/retry walk has been completed. Retained cross-store claims still need
    automatic owner reconciliation and operator UI, the direct call-recording database
    update still needs an ambiguity-safe reconcile/rollback contract, and the separate
    SOP-retirement policy can strand references. The focused lifecycle, Finance and
    Meta proofs are not substitutes for deployed multi-instance/provider acceptance.

    _Original finding, retained for the remaining scope:_ All nine private-upload routes write Supabase,
    Vercel Blob or local storage before the durable record or final user action.
    Client files, careers CVs, legal documents, SOPs, development resources and call
    recordings can therefore leave an untracked object if the following CRM/database
    write fails. Inbox media, expense attachments and campaign assets return a staged
    storage reference to the browser but provide no abandonment cleanup if the user
    cancels or the later save/send fails. Client-file, legal, SOP and development
    deletes remove the record first and catch/discard every provider or local deletion
    failure, still returning success with an unreachable retained object; client-file
    deletion can also remove the binary before a failed metadata update leaves a
    durable broken link. The mounted product-workspace batch flow adds another
    visible failure boundary on top of the client-file route: it silently processes
    only the first 30 selected files but reports the full selection count as added.
    If a later file or collection attach fails, earlier files/attachments are already
    durable while no partial progress reaches component state; selecting the batch
    again creates new random file records for those completed items. The normal UI
    then lacks enough state to reconcile either side. Current upload coverage is
    mainly happy-path/source wiring and does not force record/attach failure,
    abandonment, provider deletion failure or batch retry. Introduce
    a shared durable object lifecycle (`uploading` / `ready` / `deleting` /
    `delete-failed`), retain provider errors and storage keys, expire abandoned staged
    objects, reconcile or compensate partial operations, report exact accepted/
    completed counts, and report deletion only after both record and binary converge.
    Test every provider and mounted batch boundary plus retry/reload.

39. **P1 — “Close the deal” is code/behaviour repaired; mounted journey acceptance
    remains.** A close without written terms or a reviewable document now creates an
    honest draft that cannot be accepted. A reviewable agreement uses the canonical
    delivery path and distinguishes portal publication from provider-confirmed email;
    refusal is retained and never described as sent. Acceptance revalidates terms and
    binds the exact version shown. Route/service proof covers draft, body, document,
    refused delivery, customer acceptance, concurrency, idempotency, tenancy and
    authorization. Complete the mounted agency close → customer review → exact-version
    accept/reload journey, including a refused email, before closing.

40. **P1 — commercial proposal/receipt delivery is code/behaviour repaired; live
    provider acceptance remains.** Proposal send and payment receipts now record the
    durable message id, queued/failed outcome and provider reason separately. Neither
    invoice/agreement sent milestones nor `receiptSentAt` advance until delivery is
    confirmed; stable references make retries reuse the same message and preserve
    already-delivered work. The UI names queued/refused state instead of claiming
    success. Complete one mounted refusal → retry → provider delivery for both a
    proposal and receipt with a configured Email Sender before closing.

41. **P1 — commercial proposal versioning is code/behaviour repaired; mounted public
    acceptance remains.** Acceptance now requires the current sent version and records
    its version/hash. Identical saves keep the accepted pack stable; material edits
    create a new unsent draft while retaining the prior acceptance evidence. Financial
    changes detach the old Stripe Checkout session, so a stale price cannot survive an
    amendment. Draft acceptance, exact-version acceptance, replay, post-acceptance
    amendment and stale-session invalidation are covered. Browser-prove draft refusal,
    sent acceptance, agency amendment and the public page showing the new draft rather
    than inheriting the old acceptance.

42. **P1 — installment Checkout is code/behaviour repaired; live Stripe acceptance
    remains.** The schedule allocates the promised total exactly, including the final
    remainder. Only canonical subscription invoice ids count, redelivery deduplicates,
    manual Stripe rows cannot advance the plan and a foreign subscription cannot stop
    it. Cancellation requests persist requested/refused/confirmed state; refusal makes
    the webhook retryable and only Stripe confirmation closes the stop condition.
    The 2026-09-01 focused commercial/contract/close-deal gate passes **92/92** across
    #39–#42. Finish a test-mode subscription through every advertised installment,
    force one cancellation refusal/retry, then prove no further invoice is collectible.

43. **P1 — Email Sender's code and behaviour are repaired; live-provider browser
    acceptance remains.** The mounted Settings page now writes provider credentials,
    private webhook secrets, SMTP configuration and sender identities to the same
    private store the delivery path reads. Secrets are write-only and returned only
    as masked tails. Postmark sender verification calls the provider's account API
    and records its evidence/refusal instead of locally stamping an address active;
    test sends and webhooks preserve and display the provider outcome. SMTP is now a
    real production path too: the server-only foundation injects Nodemailer with TLS,
    STARTTLS, authentication and bounded connection/greeting/socket deadlines, while
    keeping Node socket dependencies out of the browser graph. SendGrid and Resend
    remain deliberately non-operational and are labelled “no driver yet” in the
    selector rather than claiming support. `scripts/smoke-email-sender-foundation`
    plus the module smoke suite pass **47/47**, and TypeScript is clean on 2026-09-01.
    Remaining acceptance needs real Postmark or SMTP credentials: fresh install →
    save provider → provider-confirmed identity → accepted test message → signed
    delivery webhook visible in Logs. Do not mark this complete from mocks alone.

44. **P2 PARTLY REPAIRED 2026-09-02 — the shared settings product is reachable
    across registered families, and Marketing, Website Editor, Fulfillment and
    Memberships now have truthful operational settings.** The
    agency hub exposes Finance, HR, Marketing and Email settings; the client settings
    surface exposes CRM, Affiliates, Ecommerce and Memberships. Marketing's own
    Settings page also mounts the canonical panel, retains only `defaultCurrency`,
    and proves save → reload → campaign creation uses the changed GBP value. Its
    persisted-but-unused lead-assignee and auto-send declarations are removed.
    Website Editor consumes its default theme and starter template when an omitted
    create request needs them and removes two GitHub controls whose transport does
    not exist. Fulfillment consumes its omitted-client starting phase and enforces
    its checklist-advance gate under the same client mutation lane as checklist
    ticks; it removes two notification toggles with no delivery port. Invalid
    configured/explicit phases are rejected before client creation, and a disabled
    checklist gate records the override and open-item count.

    Memberships now consumes all four declarations that were previously labelled
    unwired. `defaultTrialDays` is bounded to whole days 0–365 and reaches plan
    creation before its durable intent fingerprint; `billingPortalReturnUrl` is
    resolved to an absolute same-origin HTTP(S) provider return target;
    `memberPortalHeading` reaches the customer page; and `showAnnualToggle` joins
    the installed annual-billing feature and a genuinely eligible active plan before
    annual cadence appears or can be submitted. The settings writer and runtime use
    one exact numeric grid, so near-integer values cannot save and later normalise to
    a different result.

    The keyed source-derived inventory is now **12 registered manifests / 43 fields**:
    **27 have runtime consumers and 16 do not**. Remaining unconsumed declarations
    are HR (3), Leads Pipeline (3), Public Funnel (2), Ecommerce (2), Affiliates
    (2), Client CRM (3) and Finance (1). `client-crm/defaultTags` was restored to
    this list after the old repository-wide field-name match confused it with an
    unrelated Leads CSV FormData key; host readers are now keyed to the full plugin/
    field identity and exact access path. Wire or remove every
    remaining declaration and behaviour-prove each retained field;
    `bos-auth-gate/loginPath` is separately dormant and outside this registered
    surface. Dedicated settings/runtime coverage now exercises the Memberships
    consumers, numeric boundary, exact annual gate, provider return target and
    actual handler/page wiring. Focused Memberships passes **65/65**, adjacent
    Memberships/company/Ecommerce **90/90** and the complete changed-surface gate
    **145/145**. Exact production build `bcNH7NEvlzmp6z1VXtmch` browser-proves the
    Memberships settings save/reload/default-trial/annual-gate, exact two-POST stable
    operation/provider binding and billing refusal/success stories across four
    viewports with zero unexpected diagnostics or overflow. The issue remains partial
    because the 16 declarations named above are still unconsumed.

    **Later on 2026-09-02 — three of those declarations resolved.** Finance's
    `expenseApprovalThresholdCents` (help text admitted it was "stored, not yet
    enforced") and Ecommerce's `stripePublishableKey` (no client-side Stripe.js
    reader exists; checkout is a server-side session redirect) are removed from their
    manifests, setup wizard, README and Stripe config type rather than kept as
    promises. Ecommerce's `lowStockThreshold` is now consumed: the inventory
    adjustment handler uses it as the default low-stock level for a row that does
    not set its own (explicit and existing levels still win), and a malformed saved
    value falls back to the manifest default of 5 instead of poisoning every SKU.
    The keyed inventory is now **12 manifests / 41 fields: 28 consumed, 13
    unwired** — HR (3), Leads Pipeline (3), Public Funnel (2), Affiliates (2),
    Client CRM (3). `smoke-ecommerce-low-stock-default` (**3/3**) pins the default,
    the fallbacks and the removals; the derived inventory, settings-surface,
    product-lifecycle, tenancy/host-gate and Ecommerce/Finance module suites pass
    **164/164** together. The issue stays partial for the remaining 13.

    **Later still on 2026-09-02 — Leads Pipeline's three resolved.** `defaultLeadSource`
    now applies to CSV lead imports that give no override (its manifest default is
    blank, which keeps the import's own `csv:<filename>` provenance; a set value is the
    source; an explicit import override still wins). `newColumnLabel` now places fresh
    captures in the leads-pipeline column whose label matches, resolved inside the
    pipeline port next to the existing id override and falling back to "New" when no
    such column exists, so a renamed column can never strand a card. `fromName` is
    removed: the email sender requires a verified name+address identity, so a bare
    display name could never be honoured, and the field's own help text already
    deferred to that identity. The keyed inventory is now **12 manifests / 40 fields:
    30 consumed, 10 unwired** — HR (3), Public Funnel (2), Affiliates (2), Client CRM
    (3). `smoke-leads-pipeline-settings-consumers` (**4/4**, real pipeline port and real
    import handler) pins the reader, the label placement and fallback, the CSV source
    rules and the removal; the derived-inventory guard's floor is restated to 40 with
    every removal named. The agency Settings hub now lists a "Leads pipeline" door,
    since a module that reads its settings must offer somewhere to edit them, and the
    targeted install-repair mirror of the manifest defaults matches the new manifest.

    **Final pass on 2026-09-02 — seven more resolved; three remain by design.** Five
    declarations whose own help text admitted "value stored, not enforced" are removed
    rather than kept as promises: HR's `leaveAutoRestoreDays` and `defaultPtoDaysPerYear`
    (the HR "General" group with them), Affiliates' `payoutCadence` (nothing schedules
    payouts) and `autoApproveAfterDays` (never enforced), and Client CRM's freeform
    `customAttributeSchema` (nothing reads it). Client CRM's two retained fields now
    have real consumers, read from `install.config` into the module container:
    `defaultTags` is applied to a Contact created without tags of its own (manual,
    signup or order; explicit tags win; blank applies none) and `autoCreateOnSignup`
    gates whether the customer profile page creates a Contact for a signed-in customer
    who has none (off still links an existing Contact). The keyed inventory is now
    **12 manifests / 35 fields: 32 consumed, 3 unwired**. The three that remain —
    `agency-hr/canStaffEdit`, `public-funnel/redirectAfterCapture` and
    `public-funnel/issueSessionCookie` — are safety-shaped access/session controls
    whose honest wiring is a security decision, so they stay labelled "Not
    connected" rather than being wired or removed here. `smoke-client-crm-settings-
    consumers` (**4/4**) pins the reader, the tag and signup behaviour, the removals
    and the exact remaining list; the derived-inventory sweep's negative anchor flips
    to prove the module's own reader is what consumes `defaultTags`, and its floor is
    restated to 35 with every removal named.

    _Original finding, retained for context:_ Twelve built-ins declare **51** fields in `settings.groups`, and the
    generic `PluginSettingsPanel` plus validated `/api/portal/plugins/settings`
    endpoint exist, but only Agency Finance imports and mounts that panel. HR,
    Marketing, Client CRM, Email Sender, Memberships and Affiliates expose custom
    Settings pages that only report values; HR's source even says editable settings
    flow through the manifest schema although no such editor is rendered. Fulfillment,
    Ecommerce, Leads Pipeline, Public Funnel and Website Editor declare settings but
    expose no equivalent generic settings page. Some values are operational yet
    stuck at defaults (for example affiliate commission/payout method and Marketing
    currency); others are dead declarations with no non-manifest consumer, including
    all four Fulfillment fields, all three HR fields, Client CRM's signup/default-tag
    controls, Marketing assignment/auto-send, Leads' default source/column label and
    Public Funnel's redirect/session-cookie fields. Email Sender additionally persists
    `defaultFromIdentityId`, but delivery ignores it and independently resolves the
    identity row marked `isDefault`, creating a second dead/split setting rather than
    a working default-sender relation. A direct API call is not a
    user-reachable setup flow, and presenting dead fields as supported configuration
    creates additional false documentation. Provide one common settings mount for
    every scoped install or deliberately custom forms, wire each retained field to
    runtime behavior, remove dead declarations, and regression/browser-prove save →
    reload → changed behavior for each plugin/scope.

45. **P1 — Affiliate Stripe Connect is code/behaviour wired and locally durable;
    live Stripe acceptance remains.** The live foundation now resolves the enabled Ecommerce install and its
    vaulted Stripe keys in the exact agency/client scope, then supplies a real Connect
    SDK adapter for account creation, Account Links, account reads, transfers and
    signed webhooks. Missing keys return null, so onboarding is hidden/refused rather
    than advertised falsely. Money-moving controls separately require a webhook
    secret: a secret key can enable onboarding, but cannot start a transfer that the
    application would be unable to reconcile to completed; manual mark-paid remains
    available. Focused payout ownership, currency/refund and module coverage passed
    **26/26** on 2026-09-01, including scope isolation, capability gating, SDK method
    mapping, webhook completion and idempotent ownership. The current module plus
    onboarding/dependency gate passes **32/32**. Onboarding account creation
    now persists a recoverable intent before provider I/O, uses a stable provider key,
    adopts the result on retry and validates the target again before returning a link.
    Status refreshes are sequence-fenced so a delayed older provider response cannot
    overwrite a newer observation. Because Stripe webhook delivery is unordered, a
    signed `account.updated` event is treated as a wake-up signal and re-reads current
    provider state rather than trusting the potentially stale embedded object.
    Remaining acceptance needs
    a real Stripe test account: account creation → hosted onboarding → account status
    webhook → transfer → transfer webhook → completed payout and reload.

46. **Code/behaviour resolved 2026-08-26; mounted browser acceptance remains —
    client creation now materialises the selected agency lifecycle.**
    `src/lib/server/clients/clientLifecycle.ts` is the shared boundary for the agency
    modal, lead/contact conversion, person-card conversion and linked-client workspace
    creation. It persists an agency-scoped operation before the base client write,
    checkpoints the client before plugin/variant work, replays an identical request to
    the same client, rejects changed reuse, and resumes only failed installs/variant/
    checklist steps. Partial work returns `client_lifecycle_incomplete` with the client
    id and `retryable:true`; a later portal failure no longer erases durable client work.
    The exact clients route restores GET, both preset endpoints read agency phase rows,
    the mounted modal has no hard-coded fallback, deleted selections are rejected before
    creation and custom rows remain visible. Epic Intro now installs Website Editor and
    applies the real `aqua-incubator` starter; only the exact retired default signature
    is migrated, preserving agency customisation. Linked workspaces inherit a valid
    current phase rather than retired `discovery`, and welcome-pack/activity side effects
    use stable operation identities. Dedicated runtime proof is **4/4**; the wider
    lifecycle/lead/navigation/relationship gate is **75/75**, and TypeScript is clean.
    Before full closure, browser-submit every starting stage plus custom/deleted phase,
    force failure/retry/reload, and confirm the reloaded installs/checklist/variant and
    incomplete UI on the mounted server.

47. **P2 PARTLY REPAIRED 2026-09-02 — checked response contracts now cover the
    first broad cohort plus Finance, Dev Team, Governance, Fulfilment and Actions
    writes; remaining cohorts/acceptance stay open.** A focused UI scan found **13** direct `await fetch(...)` calls
    whose response is never inspected. These are not harmless telemetry calls: they
    include HR leave approval/rejection, Membership admin and customer cancellation,
    Affiliate approval/attribution/manual-payout/referral-code actions, Ecommerce
    inventory changes, Finance invoice mark-paid, staff task delegation, task-template
    deletion and Inbox read-state. Several immediately reload or refresh, so a 4xx,
    5xx or persistence 503 looks like an action that simply did nothing. Finance's
    New Invoice flow also validates the initial create but ignores the second PATCH
    used by “Issue now,” so it can return to the list with a draft after promising
    issuance. A later Actions/Calendar pass raised the class to 16: task patch and
    delete have no refusal UI, while “mark attention done” ignores a failed
    dismissal and removes the card locally anyway. A further mounted-surface pass
    raised the known class to **at least 34 failure paths**. The 18 additions cover
    Team workspace task create/toggle, onboarding, leave, training/module,
    note-create/save, feedback and contract responses; product visibility; client
    milestone create/update/delete; Client Delight update/delete/package visibility;
    and legal-record editing. These handlers either discard the response, test only
    success with no refusal UI, refresh after an unchecked request, or clear/reset
    context before success is known. A customer-plugin pass raised the verified lower
    bound to **at least 39**: Membership billing management silently does nothing on
    a refused/malformed response, while Membership subscribe and Affiliate enrol,
    Stripe onboarding and Stripe refresh have no `catch`, leaving transport/JSON
    failures as unhandled promises with no message. The freelancer “Exit preview”
    control then raised the lower bound to 40: it never checks
    response status or an `ok` field and navigates to its fallback route even when
    session restoration is refused. KPI Intelligence brings the current lower bound
    to 43: create custom KPI, delete custom KPI and delete shared view all retain the
    form/row but provide no refusal message. A shared-shell/settings/Aqua Tag pass
    brings the current lower bound to **at least 52**: task-checklist template save
    marks any response saved; completed-register delete exposes no failure; portal-
    field save/delete can strand their saving status on transport failure; freelancer
    override save/clear hide refusal; and Aqua Tag site unlink plus injection toggle/
    remove silently retain or revert state. Freelancer preview entry raises the
    current lower bound to **at least 53**: its handler detects HTTP, response and
    exception failure, but only clears “Opening…” and gives the operator no visible
    diagnostic. A later non-security pass across mounted Development, phase,
    Identity Review, Company, Performance, SOP and communications screens adds
    **at least 47 more handler families**, bringing the conservative lower bound to
    **at least 100**. These include technical-resource/workflow/catalogue/upload and
    project/website status actions; phase add/edit/delete; identity rescan/decision;
    company, trading-brand, website-connection and legal upload/delete; Search
    Console/report/experiment actions; ten SOP/category/guide handlers; and sixteen
    social/client/enquiry/master-inbox send, attachment, routing and status handlers.
    Each validates an HTTP response in some cases but leaves rejected `fetch()` or
    parse execution uncaught, so busy state can persist and input/context can be
    stranded. A focused Finance pass adds **13 previously uncounted handler
    families**, bringing the conservative lower bound to **at least 113** without
    recounting the already-known invoice mark-paid or second “Issue now” PATCH.
    Plan creation and both income forms can remain busy indefinitely after transport
    rejection. Invoice detail amendment/issue and pay-link creation, list-level
    issue, recurring-expense posting, invoice-template save, budget-pot save,
    obligation/profile/payment save and obligation quick-complete either clear or
    omit pending state without a usable failure diagnostic. A mounted Client Centre
    pass adds **15 more handler families**, bringing the lower bound to **at least
    128**. File add/remove/visibility; direct-client invoice create/status/mark-paid/
    payment-request delivery and client-cost entry; legacy onboarding tick/advance;
    phase-transition commit; and property add/status/edit/delete all expose an HTTP
    error branch but let rejected transport or response parsing escape without a
    visible diagnostic. Stronger neighbouring service, operations, request, contact,
    note, portal-connection and record-ledger handlers were excluded because they
    already catch and report those failures. Four more mounted relationship/
    commercial handlers raise the lower bound to **at least 132**: commercial-pack
    save, send/checkout action and payment recording plus People Hub contact create
    all lack transport/parse failure feedback. A built-in plugin pass adds **eight**
    more, bringing the conservative class to **at least 140**: affiliate code
    creation; ecommerce discount and product deletion; customer/internal checklist
    ticks and phase deletion; and Membership benefit/plan creation. The checklist
    wrapper rolls optimistic state back but does so silently, while the other
    handlers clear pending state, remain unchanged or throw without explaining why.
    A refined Actions/Governance pass adds **six** more, taking the lower bound to
    **at least 146**: calendar-source toggle/disconnect, calendar-entry delete,
    task/calendar completion, task-modal create and governance legal-record create.
    Source toggle changes the visible selection before persistence and does not roll
    it back after refusal; disconnect/delete/task creation can strand busy state,
    while completion remains a silent no-op.
    Dev Team roadmap create/edit/delete share an unprotected writer that can strand
    the form/card, and storefront discount apply can reject before returning its
    `{ok, reason}` contract. Those two raise the lower bound to **at least 148**.
    This is
    distinct from #16's backend acknowledgement bug: even a
    truthful server error is thrown away at the mounted client. Centralise a small
    mutation-response helper or enforce an equivalent component contract, retain
    busy state safely, show actionable HTTP/transport/parse errors, and add forced-
    non-2xx plus rejected/malformed-response browser/
    component coverage for financial, cancellation, approval and ordinary edits.

    **Partial implementation — 2026-08-26.** `checkedJsonMutation()` now makes
    transport, unreadable/malformed JSON, non-2xx, `{ok:false}` and invalid success
    payloads explicit. The first cohort moves **46 mutation calls across 17 mounted
    components** onto that boundary: HR leave; Membership admin/customer actions;
    Affiliate administration, enrolment, Connect and codes; Ecommerce inventory,
    discounts and product archive; Finance invoice create/issue/pay; Task Templates;
    Master Inbox; and all Team Workspace mutations. These surfaces retain form,
    draft or row context on refusal, settle pending state, expose a safe inline
    diagnostic and avoid success refresh/navigation when the mutation is refused.
    Dedicated helper/guard **5/5**, affected Team/People/Task/Notepad/Dashboard
    **109/109**, earlier HR/Membership/Affiliate **49/49**, Ecommerce/Finance
    **88/88**, Master Inbox **20/20**, TypeScript and diff pass. The issue remains
    open: the rest of the 148-family inventory and literal forced-failure mounted
    browser coverage are not yet complete.

    **Second implementation cohort — 2026-09-01.** Every mounted Agency Finance
    mutation now uses the shared checked JSON contract: plans, income, invoices,
    templates, pay links, expenses/uploads/categories, recurring expenses, budgets,
    obligations and compensation all reject transport, unreadable JSON, non-2xx,
    `{ok:false}` and invalid-success responses without performing their success
    continuation. No raw Finance-component mutation fetch remains. All 22 checked
    calls across the ten mounted Finance components require strict acknowledgement,
    nonblank-id entity, multi-entity or absolute-HTTPS success shapes. Every mounted
    Dev Team write is likewise checked across
    Roadmap, document editing, plan creation, Findings, Updates, thoughts, app config,
    Editor project/integration setup and Inspector Dev Mode. Exactly four raw Dev Team
    fetches remain and are inventory-pinned as GET reads. Project save, delete, map and
    connect-tag success is action-specific and expected-id aware. The hardened shared
    helper makes 5xx response bodies opaque and unretained while bounding and filtering
    rendered 4xx/domain copy. The focused checked-mutation gate passes **25/25**, and the
    independent combined behaviour rerun passes **267/267**. These cohorts settle busy state in `finally`, keep
    drafts/cards/selections/tokens on refusal and gate refresh/reset/navigation/events
    behind validated success. The wider mounted inventory and literal browser-forced
    failure/recovery matrix still keep #47 partial rather than resolved.

    **Third implementation cohort — 2026-09-02.** Governance and Fulfilment now use
    the checked mutation contract for the repaired cohort. Fulfilment received literal
    forced-failure browser acceptance at both **390px and 1280px**: an injected
    refusal produced a visible alert, did not reload or run the success continuation,
    rolled back or retained the affected state as appropriate, and a retry succeeded.
    This closed that representative source/browser cohort, not issue #47 as a whole:
    at that checkpoint Actions remained open, as did the remaining unconverted families and their complete
    forced-failure/transport/malformed-response browser matrix.

    **Fourth implementation cohort — 2026-09-02.** Actions is source/behaviour
    complete for the audited mutation family. Task completion is bound to the exact
    task revision; task deletion, alert Mark Done and notification read/unread/park/
    dismiss use deterministic operation receipts and return authoritative filtered
    snapshots. Alert mutations bind the semantic source occurrence plus a per-user
    causal version, serialise competing decisions and reject stale successors. Task,
    completion-register, preference and receipt writes share an atomic transaction,
    so an injected commit failure rolls the whole decision back and a lost success
    can replay without duplicating completed work. Mounted Actions, Today, Calendar,
    Dashboard, Team and notification controls validate the exact success shape, keep
    refused work visible, prevent duplicate clicks and expose retryable busy/error
    state. The final focused Actions gate is **54/54**; the complete Actions+
    Memberships changed-surface gate is **145/145**, TypeScript and diff checks pass,
    and independent review found no remaining source defect. Exact production build
    `bcNH7NEvlzmp6z1VXtmch` passes all **40/40** Actions+Memberships stories at
    **390×844, 768×1024, 1024×768 and 1280×800**, including malformed/lost-success/
    stale retry and settled-busy paths, with zero unexpected console, page, network,
    HTTP or overflow failures. The wider issue remains partial.
    **Fifth implementation cohort — 2026-09-02 (Performance).** Split-test experiments,
    monthly client reports and client milestones now use the checked contract with
    parent-owned authoritative collections applied in per-client sequence order, exact
    receipt validators (identity, expected version, every variant, month/property/
    status, withdrawal reason), retained work on refusal, settled action-specific busy
    state and one shared route classifier (auth 401/403, not-found 404, typed
    validation 400, conflict 409, captured generic 500). Focused gate **38/38**,
    adjacent gate **74/74**. Exact production build `H-vbnKm_hrkDkN8fgxwqF` passed **119/119**
    Playwright stories at **375×812, 390×844, 812×375, 768×1024, 1024×768, 1280×800 and 1920×1080** — forced 500/503/400/409, rejected fetch,
    malformed JSON and wrong-identity 200 receipts on every family, two-tab stale
    conflicts, lost-response replay and reload — with zero unexpected console, page,
    request or HTTP failures and zero overflow.
    Issue #47 remains partial because Client Centre, phase, SOP, Company and other
    unconverted families still need the same source and complete forced-failure/
    transport/malformed-response browser treatment.

    *2026-09-03 acceptance:* the Phase Admin cohort (commit 0078567) was re-run on a production lane: 10/10 stories across 390×844 and 1280×800, 2 recorded N/A (production preview refusal), 0 unexpected console/page/request/HTTP failures; create/edit/delete refusals (500/503/rejected/malformed/wrong-identity/live 400/404) keep typed work, settle busy state, announce alerts and succeed on retry. "Preview as demo client" is refused 404 "Not available." on a production build by the dev-mode switch (`canUseDevMode`) and is recorded as an explicit N/A; its navigation is proven on the dev lane only. Client Centre, SOP, Company and the remaining families stay open.

48. **✅ RESOLVED 2026-08-26 — Health Check result sharing carries the completed
    state.** Progress-save and final result actions now use one testable seven-day
    serializer containing the exact Health Check state and optional captured email.
    “Open email draft” includes the real result URL and expiry; “Copy result link”
    announces success, while clipboard denial reveals and selects the URL for manual
    copy. “Print / save as PDF” accurately names the browser print flow. Serializer,
    email, refusal, mounted-control and existing public-funnel proof pass **12/12**.
    The real localhost flow reaches Results, reports a successful link copy, restores
    Results from the generated payload in a new direct tab, and records zero console
    errors on both pages. A distinct clean browser profile was not available in this
    pass and remains acceptance residue rather than a known implementation defect.

49. **✅ RESOLVED 2026-08-26 — manual automation feedback follows the persisted
    run outcome.** Execution failures remain durable domain outcomes in the successful
    HTTP envelope, while a shared client-safe mapper now gives `failed`, `skipped`,
    `waiting`, `running` and `succeeded` distinct feedback. Both Test and Run now put
    a failed run's final stored error into the visible error channel; only a succeeded
    live run says “Live flow completed.” A real live-mode workflow with an invalid
    webhook URL persists `failed`, returns “Live flow failed: The webhook action needs
    a valid URL,” and contains no completion claim. Focused Automation proof passes
    **5/5**, the widened Action/Activity/Email gate passes **23/23**, and TypeScript is
    clean. Mounted visual acceptance remains a follow-up, not a correctness gap.

50. **✅ RESOLVED 2026-08-26 — Business OS emits only current destinations.**
    The Toolbox now lists the three features that are actually live—Health Check,
    My Diagnostic and Quick Wins—instead of unlocking five absent `/resources/*`
    tools. The scripted assistant openly explains that the old public phases were
    retired and maps every phase, bridge, company, recommendation and fallback
    action onto a current BOS page, Health Check or Client Centre. The mounted BOS
    widget now renders those suggested actions instead of discarding them. Every
    human action uses the real `447707020250` WhatsApp recipient or the existing
    email route. A full catalogue guard exercises every reply across all four
    legacy phase states, Health Check recommendations and the rendered Toolbox;
    the focused/middleware/funnel gate passes **8/8** and JS syntax checks are clean.
    Live `:3032` acceptance followed Toolbox → Diagnostic, Toolbox → Health Check,
    a retired Blueprint prompt → Quick Wins, the Health Check recommendation → BOS
    home and the human response's populated WhatsApp/email actions.

51. **✅ RESOLVED 2026-08-26 — the public homepage no longer promises an absent
    founder film.** The platform proof remains useful, but its copy no longer calls
    itself a film and the player now fails closed with an HTML `hidden` baseline.
    Startup validates the configured `data-youtube-url`/`AQUACRM_VSL_URL` through
    `youtubeId()` and reveals the player only when that produces a real video id.
    With the current empty source, visitors cannot reach the dead play control,
    video controls or internal “add the approved URL” instruction. A live `:3032`
    browser check found zero film buttons/instructions, confirmed the platform copy
    remains visible and confirmed the player computes to `display:none`; **2/2**
    contract checks pass. Playback acceptance becomes a release condition if an
    approved source is configured later, rather than a false current capability.

52. **✅ RESOLVED 2026-08-26 — the Ocean Boulevard POS tour completes an honest
    simulated checkout.** “Take payment” remains disabled for an empty basket. A
    populated basket now records the displayed demo amount/item count, clears the
    basket, disables payment again and announces an accessible approval result that
    explicitly says no card was charged. “Start another demo sale” clears the result,
    while the idle state always says no real payment details are collected. A live
    `:3032` browser walk proved the empty state, a three-item **£14.00** checkout,
    cleared basket/zero total/disabled control and reset; the source contract adds
    **2/2** regression checks. This remains intentionally simulated case-study UI,
    not a payment-collection feature.

53. **✅ RESOLVED 2026-08-26 — Milesymedia navigation keeps its brand boundary.**
    `/milesymedia` is now an explicit studio hub with mounted services and contact
    sections; `/milesymedia/contact` is the canonical contact destination with real
    email and telephone actions. The shared Tools, Health Check and Portfolio shell,
    Client Centre, page-updating state, portfolio CTAs and every current Business OS
    handoff use the same route constants/destinations instead of AquaCRM's `/` and
    `/#contact`. AquaCRM's root rewrite remains unchanged and explicitly separate.
    The route/link inventory passes **4/4** and the widened public destination set
    passes **10/10**; TypeScript is clean. Live `:3032` acceptance clicked the shared
    logo, Home, What we do, Contact and Let's talk routes, Portfolio CTA, Client
    Centre logo/back, Tools → Health Check, Business OS back and its visible Become
    a client action; each arrived at the promised Milesymedia or feature route.

54. **🟠 CODE/BEHAVIOUR RESOLVED 2026-08-26; forced browser-failure acceptance
    remains — Notepad now retains and retries the newest edit.** Every edit is
    mirrored immediately to a per-note browser draft until the server confirms it.
    Selection, folder/view and mobile-back transitions flush the prior note; status
    changes first await pending content. `pagehide` and unmount issue keepalive
    updates, `beforeunload` warns while a timer/draft remains, and reload recovers a
    newer local draft while clearing one already superseded by server truth. Failed
    saves retain the draft and mount an explicit “Retry save” action. The mounted
    page opens at `:3032`; TypeScript and the Notepad suite pass **3/3** with lifecycle
    guards. Before full closure, browser-force route change, tab exit and refused/
    offline save, then prove retry plus reload converges to the exact latest content.

    *2026-09-03 acceptance:* re-proven on a fresh exact build of the integrated `main` (`browser-notepad-finance-acceptance.mjs` attach mode): notepad 17/17, finance 16/16, layout 42/42, loader 2/2 (77/77, 0 missing). Two builds now agree; only a Supabase-backed rerun would add evidence.

55. **🟠 CODE/BEHAVIOUR RESOLVED 2026-08-26; live visual acceptance is waiting
    on the currently broken client-list route — phase transitions now converge.**
    Each request carries a stable operation id, serialises through fulfillment
    storage and checkpoints target plugins, required variant, old-plugin disable,
    checklist, client stage and idempotent activity. Target plugins and variant are
    prepared while the old stage remains active; the new stage is published only
    after its checklist exists. Missing preset plugins and failed variants now return
    `status:"incomplete"`, the exact step/partial state and `retryable:true` instead
    of hidden `ok:true`. All three mounted controls keep the operation id for retry
    and render the saved incomplete details. Forced enable, variant, disable, client,
    checklist and log failures each survived a fresh service instance, converged on
    retry and replayed without duplicate checklist/activity/event effects; focused
    lifecycle proof passes **21/21**, the widened set passes **67/68** with only an
    unrelated stale 312-vs-313 plugin-route count, and TypeScript is clean. Live
    `:3032` acceptance could not be completed because `/portal/clients` currently
    renders its error boundary and the previously observed client URL now 404s while
    other workers are changing the app; do not claim mounted visual acceptance yet.

56. **✅ RESOLVED 2026-08-26 — the Fulfillment lifecycle smoke follows the
    current Aqua catalogue and is part of the canonical gate.** The nested suite now
    seeds seven Aqua/churned rows, creates at Epic Intro, walks all five active hops,
    verifies the current plugin catalogue, account starter trail, checklist and
    transition incompleteness classification. Required missing plugins keep the old
    stage active and return a retryable incomplete result. Direct-jump proof remains in
    `scripts/smoke-stage-jump.test.ts`; partial creation retry is exercised by
    `scripts/smoke-client-lifecycle-creation.test.ts`. `smoke:all` explicitly includes
    the nested suite. The focused lifecycle/navigation set passes **43/43** and the
    wider client-creation gate passes **75/75**.

57. **P1 SOURCE/BEHAVIOUR RESOLVED 2026-09-02; mounted/live acceptance
    remains — consequential checked-read coverage now includes Portal Editor
    configuration, attention plan/explanation/evidence,
    Finance expense fields, KPI custom/shared views, completed history and both
    Fulfillment phase catalogues.** Independent checked reads distinguish confirmed
    absence from failure, retain last-confirmed snapshots, expose retry and lock writes
    whose source is unavailable. Alert-local state cannot cross alert ids; exact
    enquiry-source failures reach plan, explanation and evidence; stale phase targets
    re-resolve through the newest confirmed catalogue. Completed-register deletes use
    stable operation ids and safely replay a lost success without resurrecting rows;
    custom-KPI creation is likewise deterministic, conflict-checked and duplicate-safe
    after an ambiguous response. Focused proof passes **22/22**, the selected widened
    attention/KPI/lifecycle/operational run passes **61/61**, and TypeScript plus diff
    checks are clean.

    **Second checked-read cohort — 2026-09-01.** Agency and exact-client website routing
    now share one strict complete-payload reader, retain a labelled last-confirmed
    snapshot, expose retry and lock every dependent mutation until a current read
    succeeds. Portal Search and Development resource search treat debounce/loading/
    failure as pending or unavailable rather than empty; retained Development rows and
    counts are explicitly stale and cannot be edited, uploaded to, catalogued or deleted.
    Email/call sender catalogues distinguish confirmed-empty from failure, clear removed
    persisted identities before becoming ready and keep outreach locked until current.
    Unified Inbox withholds combined counts and ordinary empty copy when a source failed.
    The focused availability/failure regression passes **9/9** and the final
    interactive-read/utility gate passes **14/14**.

    **Third checked-read cohort — 2026-09-02.** The mounted client Finance tab now
    settles invoices, expenses and categories independently as loading, ready or
    unavailable; it retains clearly labelled last-confirmed snapshots and withholds
    derived totals, payment-plan reconciliation and dependent mutations until the
    current source is confirmed. The customer portal carries the same state through
    its request aggregate: failed Finance reads no longer become zero invoices,
    completed/paid plans, a false missing-deposit warning or a healthy attention
    footer, while confirmed-empty results still render the ordinary empty state.
    Aqua Health, Client Radar and the Fulfillment hub/readiness surfaces likewise
    expose Finance blindness, reject delayed stale generations and cannot derive a
    strong/ready/zero result from unread evidence. The widened Finance family passes
    **326/326**, customer-portal availability/attention passes **54/54** plus **4/4**
    HTML parity, and the Health/Radar/Fulfillment cohort passes **66/66**; TypeScript
    and focused diff checks are clean.

    **Fourth checked-read cohort — 2026-09-02.** Contact cards/interactions, Meta
    connection/catalogue reads, commercial-pack and manual-contact detail, Identity
    Review queue changes and governance company-scope reloads now use first-class
    loading/ready/unavailable state. They retain only explicitly labelled confirmed
    snapshots, fence delayed generations, lock dependent writes and never relabel a
    previous scope as the new one. The exact remaining-source regression passes
    **54/54**.

    The named source-level fallback class is now repaired. Mounted forced
    rejection → retry, lost-response, multi-tab and live persistence-provider recovery
    remain acceptance work; any newly discovered consequential empty-on-failure path
    must join the same checked-read contract rather than reopening a silent fallback.

    _Original finding, retained to identify the remaining scope:_ The original audit found
    at least twenty-eight product paths that caught a rejected read and
    substituted `[]` or an empty inbox snapshot: agency and per-client website-source
    panels, customer-portal inbox and website enquiries, direct customer Finance
    invoices, the client-record inbox and enquiries, sibling-workspace Finance
    invoices, contact interactions, Marketing's Meta connections, and KPI
    Intelligence's custom definitions and shared comparison views. The wider shell
    adds completed-action history, alert evidence, Portal Editor configuration (repaired
    for the slice above), Finance expense custom fields, the commercial-pack/product-catalogue load and
    manual enquiry contact details.
    Their consumers
    then render ordinary empty copy such as “No sites routed,” “Nothing recorded
    yet” or “No invoices yet.” The direct customer Finance path can also claim that
    the plan and invoices are up to date, while the sibling Finance path turns a read
    failure into zero outstanding and feeds the account overview, which can show
    “Operations clear” and omit the payment-warning badge. Marketing can offer
    connection actions as though no account exists, customer or staff record views
    can omit real communications, and the KPI explorer can omit agency-wide
    definitions/views. Settings can omit configured fields/categories, expense forms
    can drop required custom inputs, and a commercial modal can remain on new/default
    terms when an existing pack or product catalogue was unavailable. The failed
    manual-contact read is particularly destructive: the card presents a valid blank
    editor, while Save replaces the complete stored company, title, notes and custom-
    field record, so an operator can erase unseen details. Six further mounted read
    paths were confirmed: the attention route independently converts failed plan and
    explanation builders to `null`; workspace search reports “No matches” after a
    rejected record search; Development Toolkit search can say nothing matches from
    its stale first page; Identity Review changes the selected queue before its read
    succeeds and can show an empty wrong queue; and Fulfillment phase-catalogue
    failure silently removes transition controls. Governance company-scope reload
    adds another stale case: the selector changes first, while a rejected request
    leaves the previous company's snapshot labelled under the new scope and keeps
    loading active. Preserve a first-class
    `available/error` state through every aggregate, do not compute health/clear
    status from unavailable evidence, expose retry, and add rejected-read browser/
    server-component coverage for each consequential empty-state family.

58. ✅ **RESOLVED 2026-08-26 — contract-plus-template retries now converge on one
    contract and one template.** Contract creation requires a stable operation id,
    derives a deterministic contract id, fingerprints the submitted terms and
    returns the persisted contract immediately. Exact replays return the original;
    reusing an operation with different terms returns 409. The editor adopts that
    contract before template I/O, turns a failed optional second step into a
    template-only retry, and offers the same recovery from the written contract card
    after reload. Source-contract templates use a stable source operation and
    deterministic template id, so their own retries also replay instead of
    duplicating. A real route-handler fault test forces the template request to fail,
    hydrates fresh persistence between attempts and proves exactly one contract, one
    template and one activity event for each operation. The focused contract/client
    regression set passes **13/13**, TypeScript and focused diff checks are clean,
    and the mounted editor/finance surface renders the recovery controls. Uploaded-
    binary failure boundaries remain in #38 rather than being duplicated here.

59. ✅ **RESOLVED 2026-08-26 — built-in customer-portal chrome and body share one
    request snapshot.** A no-argument React request cache now resolves the signed-in
    customer identity, client, provider and canonical contact fallback once, then
    builds one `CustomerPortalData` aggregate for both the nested layout and
    `CustomerPortalView`. The cache lifetime belongs to the Server Component request,
    so later requests remain fresh; embedded mode still performs one aggregate load.
    A real concurrent RSC render proves two sibling consumers trigger exactly one
    loader call and receive the same object identity. The widened customer portal,
    studio, products, billing, relationship, navigation and analytics gate passes
    **98/98**, TypeScript and focused diff checks are clean, and three authenticated
    mounted `:3032` renders returned the full 94,491-byte portal in **557 ms, 502 ms
    and 641 ms**. Explicit unavailable-state work remains tracked in #57 rather than
    being hidden by this cache.

60. ✅ **RESOLVED 2026-08-26 — KPI target planning has one acknowledged agency
    truth.** The comparison workspace no longer stores plan overrides in browser
    storage or promotes an edit before persistence. Every edit, reset and accepted
    suggestion carries a stable operation id plus the agency config version into a
    fresh, serialised route transaction; the response is adopted only after the
    durable store flushes. Exact replay is idempotent, conflicting operation reuse is
    rejected, and a stale second session receives the current config rather than
    overwriting it. Failed intent remains visibly pending with retry/discard controls
    while charts continue to use the last confirmed agency plan; initial load failure
    has an explicit unavailable/retry state. Forced file-write failure, edit/reset/
    suggestion replay, fresh hydration and two-session conflict/retry pass **34/34**;
    TypeScript and focused diff checks are clean. Mounted `:3032` acceptance confirms
    the visible planning section, “Agency plan confirmed” state and explicit agency-
    store authority copy without mutating a target.

61. ⚠️ **CODE COMPLETE 2026-08-26; mounted rejection acceptance pending —
    utility controls now settle truthfully after failure.** Task Template loading,
    Development search/pagination and credential reveal, and Performance Search
    Console loading/sync now use checked requests, retain explicit unavailable copy
    with retry controls and clear pending state in `finally`. Client Systems makes
    exactly one awaited clipboard write, shows “Copied” only after success and
    exposes manual-copy guidance after refusal. A forced rejected checked request
    plus component wiring assertions and the widened Task Templates/Development/
    Performance/truthful-surfaces/checked-mutation gate pass **94/94**; TypeScript
    and focused diff checks are clean. The code defect is removed. Keep this item
    open only for mounted forced-rejection acceptance: port `:3032` currently accepts
    TCP but returned no response bytes within 12 seconds, so a browser claim would
    be weaker than the evidence and is not recorded as complete.

62. **✅ FIXED 2026-08-27 — “Archive lead” permanently deleted the lead and left
    its pipeline card behind.** Three verbs now, each doing what its name says.

    - **`archive`** — off the board, still here. Keeps the row, the index entry
      and the email/phone POINTERS; removes the pipeline card; remembers which
      column it came from. Idempotent.
    - **`restore`** — back on the board, in the column it LEFT rather than the
      board's default. Both moves are recorded in the journey.
    - **`purge`** — the old hard delete under a name that admits it. The route
      refuses unless the lead is archived first, so permanent deletion is the
      second of two deliberate acts and never one click from the same button.

    **The pointers are deliberately KEPT on archive.** Dropping them would let
    the same person enquire again and become a SECOND lead while their history
    sat invisible. Keeping them means `upsert` finds the archived lead and
    revives it — which is also the answer to the sharper version of the
    question: an archived lead that quietly absorbed a new enquiry would be a
    real enquiry disappearing.

    **Archived leads are excluded by DEFAULT**, before the `!filter` shortcut,
    because `resolveAudience()` and every count call `list()` with no argument —
    and an archived lead in a campaign audience is the failure that sends a real
    person a real email.

    **The card half.** `PipelinePort` gained `removeLeadCards` and
    `columnIdForLead`; the adapter sweeps by the stored `pipelineCardId` AND by
    the stamped `leadId`, because every lead captured before the foundation was
    wired has no stored id. `addLeadCard` now validates a requested `columnId`
    against the pipeline's actual columns — a restore into a since-deleted
    column would otherwise park the card where nothing renders it, which is the
    same shape of bug as the one being fixed.

    **Browser-accepted on an isolated lane** (port 3051; 3032 untouched). A real
    lead moved to Meeting → Archive → the board empties and every count reads 0
    → **full reload** → Archived 1 → the Archived view shows the record →
    Restore → back in **Meeting**, not New, with its card re-created there. The
    forked state file confirms **zero lead cards while archived** — the orphan
    that used to survive with the lead's name, email and phone. Purge refuses
    with *"Archive this lead before deleting it permanently."* (HTTP 400) and,
    once archived, removes lead and card together. A re-enquiry from the same
    address restored the same lead id and gave it a fresh card. Mobile 375×812:
    zero horizontal overflow, Restore 125×44, clean console.

    `smoke-lead-archive` **16/16**, every assertion probed by reverting the
    behaviour it guards (archive keeps the card → 4 fail; list stops excluding →
    2; upsert stops reviving → 1; restore forgets the column → 1; purge keeps
    the card → 1).

    _Original finding, kept for context:_ The mounted workspace confirms that the lead will be archived and
    removed from the active board, then POSTs to `leads/archive`. The handler calls
    `LeadService.delete()`, which hard-deletes the lead row, email/phone pointers and
    index entry; there is no archived status, recovery list or restore path. It also
    does not call the existing foundation `deleteCard()`, so the linked pipeline-card
    snapshot survives invisibly with the deleted lead id and contact details. A
    fresh-process memory probe created a lead and linked foundation card, ran the same
    service deletion, and observed `leadExists:false` while the exact card id remained
    in `listCards()`. Keep an archived lead record with explicit restore/purge policy,
    or label a genuinely permanent delete honestly; atomically remove or archive the
    linked card and prove archive → reload → archived view/restore plus failure retry.

63. **P1 CODE/BEHAVIOUR RESOLVED 2026-09-02; mounted/live-provider acceptance
    remains — Membership and Affiliate parent deletion is dependency-safe.** Both
    hard-delete boundaries enforce RESTRICT under the same durable graph lane used by
    every child writer. Membership plans cannot disappear while subscription rows,
    interrupted subscription claims or pending provider-price changes target them;
    Affiliate rows cannot disappear while codes, attributions, payouts or interrupted
    identity claims target them. Each mounted handler returns a structured refusal and
    leaves the graph unchanged. Concurrent child creation serialises before deletion,
    forces a fresh inventory and makes the delete refuse; genuinely unreferenced
    parents still delete. Archive/removed remains the ordinary retirement path, so no
    automatic billing cancellation or financial-history purge is invented. Focused
    retirement/recovery and race proof is green. Mounted refusal/archive/reload and
    live Stripe/Connect acceptance remain; an exceptional purge would require an
    explicit product and financial-reconciliation design.

64. **P1 CODE/BEHAVIOUR RESOLVED 2026-09-02; historical repair and mounted
    acceptance remain — SOP deletion and reference creation share one tenant-safe
    lifecycle boundary.** The direct service delete and provider-backed mounted
    delete calculate the complete incoming-reference inventory beside the owner-row
    removal and enforce RESTRICT. The Library previews that same inventory, removes
    the unsafe “delete anyway” path and directs the operator to remove or reassign
    links. Every current mounted/background writer validates missing and cross-agency
    SOP ids in the exact state snapshot it writes; client product variations validate
    both top-level and nested process-step lists. A deterministic delete-versus-guide
    creation race proves the stale writer waits, re-reads and fails without restoring
    a dangling id. The focused SOP/dependent-domain gate passes **52/52**. Existing
    stored dangling ids that predate this boundary still require an explicit audit/
    repair migration, and representative mounted refusal/reassignment/reload remains.

65. **P1 CODE/BEHAVIOUR RESOLVED 2026-09-01; mounted acceptance remains.** The
    capital plan is validated as one graph: identity/reference, allocation, paid-value and
    vote invariants refuse the whole write with actionable conflicts, and hard deletes that
    strand ledger links are blocked. The current capital/Battle/legal/governance/role focused
    gate passes **103/103**. Browser-prove representative create/edit/refusal/reload flows.

    _Original finding, retained for context:_ The “authoritative” Company capital and governance register persisted
    internally impossible and dangling records. `updateCompanyProfile()` sends the
    complete nested capital plan through independent array cleaners. Those cleaners
    sanitize shapes and ranges but do not enforce unique record ids, resolve owners or
    share classes, resolve approval decisions/documents, reconcile allocations with a
    declaration, keep paid value within declared value, or require vote totals to fit
    within 100%. A fresh memory-backend round-trip retained duplicate share-class ids,
    duplicate shareholder ids, an active shareholder assigned to a missing class, a
    completed movement linked to a missing shareholder/class/approval, a paid £100
    dividend carrying £250 paid and one £300 allocation to a missing shareholder, and
    an approved decision with 80% for plus 70% against and missing evidence links.
    This is not merely a direct-API oddity: the mounted register calls itself the
    authoritative cap table, calculates ownership/control and approval coverage from
    the retained values, treats any non-empty approval string as linked, and exposes
    hard owner/decision delete controls. Simulating those exact filtered-array saves
    removed the owner and decision while the capital movement and dividend retained
    their ids. Validate the capital plan atomically as a graph with server-owned unique
    ids, real internal references and explicit monetary/voting invariants; preserve or
    migrate historical links when records retire; return actionable conflicts; and
    prove create/edit/delete, reload and every dependent summary through the mounted
    API and browser.

66. **P1 CODE/BEHAVIOUR RESOLVED 2026-09-01; mounted two-tab acceptance remains.**
    Writes require a revision and stale saves return the current state with 409. Locked reviews
    are immutable; numbered amendments retain the original evidence. Conflict rebase uses the
    last server-confirmed plan. The combined focused gate passes **103/103**. Browser-prove two
    tabs, lock, amendment, history and reload.

    _Original finding, retained for context:_ Battle Table's whole-profile last-write-wins contract could erase executive
    work, and its “locked” quarterly history was not retained. All ten planning
    stations receive one `CompanyProfile` snapshot and PUT that complete object to the
    same endpoint. The service stamps a new `updatedAt`, but neither the route nor
    `updateCompanyProfile()` compares the client version, exposes an ETag, merges a
    focused field patch or rejects a stale document. A fresh memory probe took two
    copies of the same profile: tab A saved a mission, then tab B saved a vision from
    the older copy. Both calls succeeded and the final profile kept the vision while
    silently reverting the mission to blank. Quarterly Review compounds the history
    risk. Its button says “Lock review” and its history says completed evidence and
    reasoning remain inspectable, but every field stays editable; `change()` explicitly
    sets the completed review back to draft and clears `completedAt`. The server accepts
    the replacement. A second round-trip changed the retained decision, replaced the
    captured revenue evidence and removed completion without preserving a prior
    version. Use station-scoped commands or compare-and-swap on a required version;
    surface conflicts with deliberate merge/retry; make completed reviews immutable
    snapshots with explicit amendments/superseding versions; and browser-prove two-tab
    edits, out-of-order responses, lock, amendment, history and reload.

67. **P1 CODE/BEHAVIOUR RESOLVED 2026-09-01; mounted/provider acceptance remains.**
    One dependency inventory powers preview and deletion. Cited documents refuse permanent
    removal with 409; archive preserves references; explicit detach clears all citations and
    the row transactionally; provider deletion failure restores the row. The combined focused
    gate passes **103/103**. Finance obligation create/update and Company governance PUT
    now share the same agency lifecycle lane as deletion for their final availability
    checks and persistence, closing accepted-but-not-yet-persisted and stale-resurrection
    citation races. The earlier widened related checkpoint passes **167/167**; the final
    legal-dependency suite including governance and update/delete races passes
    **21/21**.
    Browser- and provider-prove the full refusal/archive/detach path.

    _Original finding, retained for context:_ Permanent legal-document deletion broke retained obligations and
    governance evidence without a dependency decision. Legal & Compliance describes
    itself as a controlled register and exposes an `archived` status, but the mounted
    record dialog still offers permanent Delete. Its confirmation mentions only the
    document and stored file. The route calls `deleteLegalDocument()` first, which
    removes only the register row, then suppresses every provider-file deletion error;
    the binary half is also covered by #38, but the missing dependency transaction is
    independent. Finance obligations carry `linkedLegalDocumentId`, and Company
    governance decisions carry `documentId`; neither is resolved or reconciled at
    delete time. A fresh memory/plugin-service probe created one legal record, linked
    it to both an obligation and an approved decision, deleted the record, and observed
    `legalExists:false` while both exact ids remained. The mounted Finance card derives
    its Open-document link by finding the current legal row, so the evidence action
    silently disappears. Governance continues rendering “document <id>,” making the
    missing evidence look linked. Use archive/tombstone as the normal legal lifecycle;
    inventory and show all dependants; require reassignment or an explicit auditable
    detach/purge under the chosen retention policy; coordinate record and binary state;
    and browser-prove Finance, governance, search/posture/alerts, reload and every
    partial-failure boundary.

68. **P1 CODE/BEHAVIOUR RESOLVED 2026-09-01; mounted switching acceptance remains.**
    Legal evidence, declarations, vendor agreement evidence, breach rows and erasure targets
    now share the selected-company scope; deliberately group-wide sections label that fact.
    Cross-company isolation and destructive-target coverage pass in the combined **103/103**
    focused gate. Browser-prove agency/Alpha/Beta switching, failure/retry and reload.

    _Original finding, retained for context:_ Governance's selected-company label did not scope its legal evidence,
    vendor agreement flags or erasure targets. The workspace places one Scope
    selector in its page header and reloads a snapshot carrying the selected
    `companyId`/name. `buildGovernanceSnapshot()` passes that id to the compliance-
    posture builder and HIPAA lookup, but maps every agency legal document and every
    declaration without `recordBelongsToCompany()`, derives every sub-processor's
    `hasAgreementRecord` from that unfiltered set, and lists every agency client—
    archived included—for DPO erasure. The Legal form itself writes the selected
    company id, making the mixed read especially misleading. A fresh memory probe
    created Alpha and Beta, one client under each, and only a Beta-scoped Supabase DPA.
    The snapshot labelled Alpha returned the Beta document, both client ids, and
    `hasAgreementRecord:true` with “Beta Supabase DPA” as Alpha's match. This can make
    one brand look documented because another brand holds paperwork and presents a
    destructive target from outside the selected operating context. Define which
    Governance views are genuinely holding-group-wide and label/disable the selector
    there. For company views, include only that company plus explicitly shared records,
    scope declarations, derive vendor flags from the same set and restrict erasure
    candidates to that company's clients. Browser-prove agency/Alpha/Beta switching,
    shared records, record creation, reload, failed reload (#57) and the erasure target
    list without cross-scope carry-over.

69. **🟠 PUBLIC AUTHORITY + LOCAL END-TO-END RESOLVED 2026-09-01; real Stripe and
    custom-domain acceptance remain.** Checkout retains its strict server-authoritative
    versioned quote, reservation and settlement model. Ecommerce exposes a deliberately
    narrow anonymous facade for published catalogue/detail, quote, checkout and receipt-
    by-opaque-session only; operator list/detail and mutations stay session-gated. The
    mounted storefront carries the exact enabled agency/client install scope.

    Public products cross an explicit recursive allowlist rather than a subtractive
    spread. It removes digital download URLs and licence keys, stock and variant SKUs,
    weight, hidden/archive flags, timestamps/version, Shopify/provider ids and unknown
    nested admin fields, while authenticated internal product reads retain their full
    model. Hidden/archived products are denied. Public receipts similarly omit provider,
    operator, referral, fulfilment and payment-only order fields. Browser identity fields
    are refused; authenticated operator checkout derives identity from its server actor,
    while public-facade requests remain identity-free even if a session cookie is present.

    Catalogue, quote, checkout and receipt use a shared durable per-install/IP limiter
    that fails closed when exclusive storage is unavailable, and public provider/storage
    errors return generic responses. The real catch-all dispatcher proves anonymous
    catalogue → authoritative quote → exact-zero checkout → replay → confirmed redacted
    receipt without Stripe credentials; the public Stripe webhook remains signature-
    authorised. The combined public-checkout/rate-limit/tenancy/internal-product run
    passes **52/52**. This P0 remains **partial**: custom-domain E2E, real Stripe hosted
    checkout/webhook/settlement and digital-delivery acceptance, plus deployed multi-
    instance proof against the production DB lease function, are still required.

70. **🟠 CODE + BEHAVIOUR RESOLVED 2026-08-26; mounted/live-provider acceptance remains.**
    Discount lookup is quote-only. Gift-card redemption, custom-code capacity and pending gift-card
    issuance are now reservations owned by the durable checkout operation; they commit exactly once
    on paid settlement and release on expiry/cancel/failure. Custom `maxUses` is coordinated under
    the checkout collection lock, a purchase cannot expose spendable value before payment, exact-
    zero gift-card checkout settles without Stripe credentials, and the defined full-refund policy
    restores redeemed balance once. Concurrent capacity, replay, pending issuance, zero-balance and
    refund restoration are in the passing focused suite. A literal mounted/provider journey remains.

71. **🟠 CODE + BEHAVIOUR RESOLVED 2026-08-26; mounted lifecycle acceptance remains.** The
    ordinary Products action is now Archive, not permanent Delete. Retirement keeps the stable
    product row/id, collection membership, SKU inventory/reservations and historical order truth;
    authoritative checkout rejects archived or stale catalogue lines. No exceptional permanent-
    purge UI is exposed. Server-owned identity and the recoverable slug operation also preserve
    collections and inventory through rename failure/retry. Source/service proof covers archive,
    stale checkout and partial rename; archive/restore, stale-tab and reload still need a browser walk.

72. **🟠 NON-SECURITY CORE RESOLVED 2026-08-26; public-route and two-store browser acceptance
    remain.** Website Editor now consumes `{products}`, the real `optionValues`/variant model and
    minor-unit `unitAmount`; Product Card/Grid/Variant Picker call the actual cart, Product Search
    sends server-enforced `q`/`limit`, and catalogue cache entries are keyed by tenant/store/version.
    Checkout uses stable ids, Checkout Summary requests the authoritative quote, and the registered
    by-session order route returns intentional `202 pending`/`200 ready` semantics before Order
    Success clears the cart. Mounted-source contracts pass. The guest/end-customer authorization
    decision shared with #29/#69 remains deliberately deferred, as does the literal two-store browse
    → search → variant → cart → checkout → confirmed-order journey.

73. **🟠 CODE + BEHAVIOUR RESOLVED 2026-08-26; mounted acceptance remains.** Inventory rows
    retain per-checkout operation markers. Reservation atomically checks available capacity, resumes
    a partially written multi-SKU operation without double-counting, releases once on expiry/cancel
    and converts reserved to on-hand sale once at paid settlement. The old whole-cart global reserve
    route now refuses with 409. Admin edits carry `expectedVersion`, preserve reservation/threshold/
    operation state and refuse a stale edit or on-hand below active reservations under the same
    checkout coordination. Concurrency, failure recovery, expiry and source contracts pass; a
    literal two-cart/admin browser walk remains.

74. **🟠 CODE + BEHAVIOUR RESOLVED 2026-08-26; mounted/live-provider acceptance remains.**
    One server quote now resolves configured zones and fixed/weight/free rates, shipping country,
    product weight, store currency and inclusive/exclusive tax using the configured default rate.
    Unsupported countries refuse, and configuration changes cannot rewrite an existing operation.
    Checkout Summary requests that quote, Stripe receives its exact lines with provider-side tax/
    promotion repricing disabled, and the same subtotal/shipping/tax/total snapshot is persisted on
    the order. Fixed/weight/free, inclusive tax, unsupported country and immutability proof passes;
    real Stripe and mounted display/reload acceptance remain.

75. **🟠 CODE + BEHAVIOUR RESOLVED 2026-08-26; live-provider/mounted acceptance remains.**
    Provider delivery uses a durable processing/failed/completed inbox and resumes state-first work
    after interrupted order/activity/event stages. Paid completion requires the authoritative
    checkout operation and settles its stored items/totals/currency before committing stock/value;
    provider expiry releases the operation. Refund accounting is cumulative/replay-safe, full gift-
    card restoration is exact once, and operational edits are constrained fulfilment commands with
    durable transition audit rather than arbitrary payment-fact rewrites. Fresh-container retries,
    out-of-order refunds, expiry, pending confirmation and allowed/blocked transitions pass; signed
    real Stripe delivery and mounted editing remain.

76. **Resolved 2026-08-26 — Ecommerce reporting is state- and currency-aware.** Dashboard
    accounting partitions gross, refunds, net, cancelled and pending money by source currency;
    customer spend is net settled money per currency. Mounted Orders/Customers summaries label the
    grouped values instead of inventing a GBP aggregate. Mixed paid/refunded/cancelled GBP/USD rows
    and customer totals pass dedicated **3/3** coverage within the focused **39/39** set.

77. **🟠 CODE + BEHAVIOUR RESOLVED 2026-08-26; mounted two-tab acceptance remains.** New
    products receive a server-owned stable id. Details and variants are separate compare-and-swap
    commands with visible HTTP 409 conflicts, so one editor cannot silently replace the other's
    fields. Variant commands validate option/value references, complete combinations, unique ids/
    SKUs, prices and availability. Slug rename is a durable recoverable operation that migrates
    collections and retains identity/inventory, while structured option/variant editing preserves
    hex, modifier, availability, image and sale-price metadata. Failure/retry, stale commands and
    lossless metadata pass source/service tests; literal two-tab conflict/rename/reload remains.

78. **✅ RESOLVED 2026-08-25 — the mounted Health Check now persists one
    email-backed Public Funnel journey and BOS restores that server context.**
    `/api/public/health-check/complete` resolves the founder install, records the exact
    result under a stable completion id, flushes before success and issues the real lead
    session cookie. `/api/public/business-os/context` validates the current lead and
    returns its saved slot; `public/business-os/bos.js` hydrates the local display from
    it. A resume link derives the same completion id across browsers. No-email use stays
    intentionally browser-only and the visible copy says so. The real route journey and
    plugin regressions pass **21/21**; the live port-3032 iframe exposes the corrected
    sync/browser-only copy and no longer claims account creation.

    _Original finding, retained for history:_ The Public Funnel manifest said
    `public/health-check/` POSTs the completed slot to `hc-complete`, receives a lead
    session and redirects into Business OS. The live 3032 asset does none of that. Its
    only `fetch()` sends optional progress/follow-up contact details to
    `/api/public/brand-enquiry`; completion stores the assessment in same-browser
    `localStorage` and both prominent CTAs link directly to
    `/business-os/app.html`. That static app is live at HTTP 200 without a funnel handoff,
    reads the assessment only from `localStorage`, and its auth synchronizer calls only
    `/api/auth/me`—not Public Funnel `me-context` or BOS Auth Gate `me`. A fresh anonymous
    request to `/api/auth/me` returned 401 while the Business OS asset still returned
    200. Repository-wide caller search found no production caller for `hc-complete`,
    `tool-complete` or the two context routes. More fundamentally, `bos-auth-gate` is
    absent from the shipped plugin registry, has no live foundation registration, and
    middleware/proxy match only Portal/API paths; the dedicated regression explicitly
    requires `/business-os` to stay outside the proxy. Its manifest advertises
    `/api/portal/business-os/me`, although catch-all registration by its actual plugin id
    would mount `/api/portal/bos-auth-gate/me`. The focused **54/54** chain remains green
    because the tests exercise isolated services/ports/source markers and preserve this
    separated, unmounted architecture.
    Decide the actual product boundary, then implement one mounted completion operation:
    capture the exact state-bearing result, create/reuse the lead, issue or deliberately
    omit identity, acknowledge durable persistence, and land in a BOS that reads that
    same server context. Remove or rewrite the current “results plugged in,” free account
    and auto-sign-in claims until the contract exists. Browser-prove first completion,
    optional contact skip, repeat completion, clean browser/device, refresh, failure and
    return-to-BOS behavior against port 3032.

79. **🟠 PARTIALLY RESOLVED 2026-08-25 — capture visibility, stable retry and HTTP
    failure truth are fixed; cross-process exactly-once side effects are not proven.**
    `captures/by-id/*` is now authoritative, so corrupt/missing legacy indexes cannot
    hide rows. Stable completion ids and process-atomic `setIfAbsent` collapse ordinary
    and concurrent retries; a failed session resumes the saved capture without a second
    HC event. Infrastructure failures are retryable 503s and the legacy endpoint uses
    the real cookie. Tests cover those boundaries. Remaining work is a database-backed
    conditional insert plus a durable activity/event outbox or equivalent: a crash or
    second process between the capture row and event/activity delivery is not yet
    exactly-once.

    _Original finding, retained for history:_ `doCapture()` wrote the by-id row, global index
    and email index separately, emits activity/events, and only then issues the session.
    Every index append is an unlocked read-modify-write. In a fresh service probe, a
    forced global-index write failure left the by-id row stored while both `list()` and
    `listByEmail()` returned zero. A deterministic two-capture concurrency probe stored
    two by-id rows and two correct email indexes but the shared global index retained
    only one id, so `list()` and `meContext()` lost one completion. A forced session
    failure through the mounted handler returned HTTP **400** `session-down` after the
    capture, both indexes and lead/HC events were already committed; retry succeeded but
    produced two captures and emitted the HC completion twice. Internal failures are
    therefore also misclassified as bad client requests. Persist an idempotency key and
    durable capture operation before side effects; commit record/indexes atomically or
    derive/query one authoritative store; make event/session delivery resumable and
    exactly-once at the operation boundary; classify validation as 4xx and infrastructure
    failure as retryable 5xx; and fault/concurrency-test every write, activity, event and
    session boundary across same/new instances and retries.

80. **P1 PARTLY RESOLVED 2026-09-02 — canonical lead identity and every current
    journey writer are cross-process and crash-atomic on the file backend.** The shared
    durable `runExclusive` lane rehydrates the latest state, stages each row, identity
    pointer, index and activity mutation in an isolated working tree, and publishes the
    complete diff with one recoverable file replacement. Writers fail closed when their
    storage cannot provide that boundary. Real competing processes now elect one
    canonical identity and preserve enquiry, contact, stage, meeting and conversion
    mutations across retry and reload; a failed commit publishes neither partial rows nor
    ghost events. The module core passes **88/88**, durable/process coverage passes
    **11/11**, and the storage transaction seam passes **1/1**. Native database uniqueness,
    a non-cooperating direct writer, live Supabase/Postgres acceptance and durable
    post-commit event delivery still remain before this can be called fully resolved.

81. **P1 — PARTIALLY RESOLVED 2026-08-25: opportunity money survives same-process
    concurrency; cross-process/provider delivery remains.** Invoice allocation now scans
    and conditionally reserves a unique agency/year slot and binds it to the party.
    Commercial mutations share an agency process lock, while every new payment is first
    stored in an independently keyed ledger row and merged into the pack projection.
    Manual/provider references are required and canonicalised for identity: whitespace/
    case retries return the same payment, different money on the same reference returns a
    visible **409**, and the modal cannot submit without a reference. Receipt, activity
    and event completion stamps let ordinary retries resume incomplete side effects with
    one stable payment id. The focused commercial/handler/UI gate passes **8/8**, including
    two simultaneous proposals, two simultaneous payments and a save-vs-payment race.
    The current file-backed `setIfAbsent` and module lock do not coordinate separate
    server processes, and marker-after-side-effect crashes still need a durable outbox/
    idempotent Finance, Stripe, email, activity and event consumer. Add database-native
    constraints and fault/race those boundaries before resolving this issue completely.

    **Later on 2026-09-02 — cross-process ownership on the file backend.** Every
    commercial mutation now runs inside the storage port's exclusive lane
    (`withCommercialLock` → `storage.runExclusive`, the same primitive the Marketing
    lead identity work adopted): on the file backend that is a cross-process
    transaction that re-hydrates before the work runs, on Supabase/Postgres a remote
    lease, so the payment-ledger and invoice-number `setIfAbsent` claims are judged
    against fresh state in every process. `smoke-commercial-durable-processes`
    (**3/3**, real child processes on one shared state file behind a filesystem
    barrier) proves two processes recording the same reference — even with different
    casing and whitespace — converge on one ledger payment id, a different amount on
    that reference is refused with the visible conflict, two parties saved at the same
    instant never share an invoice number, and a process that dies after claiming the
    ledger row (the write after the claim is forced to throw) leaves no half-written
    payment while the retry resumes the ledger's own payment id exactly once. Verified
    two-sided: against the previous in-process-only lock the same suite fails 2/3
    (duplicate payment ids across processes; a half-written payment after the crash).
    Still open: native Supabase/Postgres constraints exercised live, provider (Stripe/
    email) side-effect delivery across processes, and lost-acknowledgement browser
    coverage of the payment modal on an exact build.

82. **P1 — PARTIALLY RESOLVED 2026-08-25: mounted Marketing records no longer replace
    one another inside one application process; distributed CAS remains.** Channel/funnel
    assets and customer profiles now write independent by-id rows instead of replacing a
    shared array. Reads merge legacy arrays with new rows, new rows win, and deletion writes
    a tombstone so an old legacy copy cannot reappear. Mutations serialise per agency and
    collection. All three mounted editors send the `updatedAt` version they opened;
    edit/status/delete compare it to the latest row and return a visible **409** on stale
    work, using a monotonic next version even inside one millisecond. The focused package,
    handler-race and UI-contract gate passes **25/25**: two simultaneous asset creates and
    two simultaneous profile creates all survive; two edits of one version yield one 200
    plus one 409; and stale deletion is refused. The module lock and current file-backed
    plugin storage do not provide atomic compare-and-set across server processes. Add a
    database-native version constraint and repeat create/edit/status/delete/reload across
    separate processes before resolving this issue completely.

    **Later on 2026-09-02 — proven across real processes on the file backend.** The
    record lock already hands its work to the storage port's exclusive lane (a
    cross-process, re-hydrating transaction on the file backend), so the remaining
    file-backend gap was proof, not code. `smoke-marketing-records-durable-processes`
    (**3/3**, separate Node processes on one shared state file behind a filesystem
    barrier) drives the real asset and customer-profile handlers: four simultaneous
    creates from separate processes all survive and a fresh process lists them; two
    processes editing the same asset or profile version yield exactly one 200 and one
    visible 409 with the stored row being the winner's and the version advanced once;
    a delete raised on the pre-edit version from another process is refused and the
    fresh-version delete succeeds; every list is a fresh-process reload. Still open:
    a database-native version constraint exercised on live Supabase/Postgres.

83. **P1 PARTLY RESOLVED 2026-09-02 — Agency Marketing lead identity, re-keying,
    erasure and contact history are cross-process and crash-atomic on the file backend.**
    Create, lookup, pointer keys and stored rows share one canonical address and one
    durable agency mutation lane. Competing processes elect one owner; a re-key cannot
    delete another owner's pointer; erasure removes the owned pointer and indexes; and a
    concurrent contact-history append survives retry/reload without replacing the lead.
    Row, pointer, index and activity changes publish atomically, and a forced commit
    failure leaves no partial identity or event. The combined module gate passes
    **88/88**, durable/process coverage passes **11/11**, and the transaction seam passes
    **1/1**. Native Supabase/Postgres uniqueness and conditional ownership constraints,
    non-cooperating direct writers, live-provider acceptance and durable post-commit
    event delivery remain.

84. **P2 PARTLY RESOLVED 2026-09-02 — Agency Marketing campaign rows, channel indexes
    and reports are cross-process and crash-atomic on the file backend.** Complete
    campaign records are validated before mutation, and create/update/delete plus channel
    moves now execute in the shared durable agency lane. Real competing processes preserve
    both rows and the correct old/new channel indexes across reload; forced commit failure
    exposes neither half of a move nor a ghost event. Reporting continues to separate
    currencies and unlike KPIs. The combined module gate passes **88/88**, durable/process
    coverage passes **11/11**, and the transaction seam passes **1/1**. Native database
    constraints, non-cooperating direct writers, live Supabase/Postgres acceptance and
    durable post-commit event delivery remain.

85. **P1 — PARTIALLY RESOLVED 2026-08-25: Aqua Tags stop-routing now preserves the site
    and every dependency; isolated mounted click acceptance remains.** The agency-company
    and client controls now post a dedicated `route-to-inbox` action, use an inbox icon and
    explicitly say that the registered site and tools remain. The route clears the client/
    company destination through `updateWebsiteSourceRouting()`, logs the reroute and leaves
    the source, injections and imported form schemas intact. Full `remove` remains available
    only from the website-sources control, which now asks for confirmation naming the
    registration, tool injections and imported form schemas before removing its optimistic
    row; cancel returns before any state change. The focused **68/68** gate proves preserved
    reroute, cascading deletion, both mounted action contracts and confirmation/cancel.
    Port 3032 renders the live Tags workspace, but its current fixture has no routed-company
    row, so no shared-data stop/delete click was performed. Complete an isolated mounted
    reroute → reload plus delete-cancel/delete-confirm walk before resolving completely.

    *2026-09-03 acceptance:* `browser-aqua-tag-routing-acceptance.mjs` (commit 0578ddb) re-run on a fresh dev lane built from the integrated tree: 220/220 checks (0 failed) at 390×844 and 1280×800. Live database ingestion (#87) is the remaining half.

86. **P2 — RESOLVED 2026-08-25: Aqua Tag tool pause/removal now promises and delivers
    future-page-load control.** The public config route now returns `no-store, max-age=0`
    plus `pragma:no-cache`, so a fresh document fetches the latest enabled set instead of a
    five-minute/one-hour stale response. The tag intentionally fetches once per document:
    provider SDKs already executed are not falsely described as remotely unloadable. The
    workspace explains that on/off/removal applies immediately to new page loads while an
    already-open page may continue until refresh; `paused` is replaced by “off for new
    loads,” checkbox labels name the scope and removal repeats it before confirmation.
    Failed mutations now surface an error rather than silently reloading. The focused
    behavioral/route/UI gate passes **33/33**: an open VM document retains its one config,
    a fresh document receives the empty latest config, and the next real route request sees
    a disable. Port 3032 renders the copy and returns the verified no-store headers.

87. **P1 — PARTIALLY RESOLVED 2026-08-25: Aqua Tag form ingestion is now stable-id,
    truthful and order-independent inside one server process.** The capture-phase listener
    creates one `aqua_sub_*` id, adds it to the host form before its own handler reads
    `FormData`, sends it to `/form-capture` and retries a rejected response twice with the
    same id. `LaunchGateForm` forwards it to `/brand-enquiry`. Both handlers share a keyed
    process queue and persist the id: tag-first rows are promoted in place and continue
    through lead/identity/activity/notification/automation work; brand-first rows retain the
    later `formCapture`; a completed replay returns deduped. Insert, attachment, promotion,
    reload and completion errors are checked and return retryable failure rather than false
    HTTP 200. Activity and automation dispatch have stable replay keys. A **5/5** real-handler
    fake-Supabase gate proves both arrival orders, simultaneous requests, insert recovery,
    promotion recovery and one downstream effect set; the wider focused gate passes
    **120/120**. Remaining: metadata identity has no database unique constraint, the queue
    is process-local and side effects are not committed through a durable outbox. Add a
    database-native submission claim and crash-safe idempotent consumers, then race separate
    instances and faults at every side-effect boundary before calling it exactly-once.

    *2026-09-03 acceptance:* commit 0578ddb added the database-native claim boundary (`enquirySubmissionClaims.ts`, `enquirySubmissionDelivery.ts`) and migration `20260902093000_aqua_tag_submission_delivery.sql`. Source-verified; the migration is unapplied to live PostgreSQL, so cross-process claim acceptance there is NOT TESTED.

88. **PARTIALLY RESOLVED 2026-09-01 — Dev Team cross-process accepted writes and
    document/ledger process-death recovery now survive; one direct-writer race remains.**
    A shared `devFileTransaction` uses a
    filesystem-visible lock directory and same-directory temp+fsync+rename replacement.
    Roadmap, Updates, thoughts and Findings re-read while holding that lock; the standalone
    thoughts worker honours the same lock, and same-title finding creation finishes with
    exclusive `wx`. The document editor now sends an exact SHA-256 version token, serialises
    document and ledger work, rejects the stale contender and stores the winning content
    hash beside its author; history declares later unmatched bytes an outside edit. A real
    separate-Node-process gate preserves two accepted roadmap items, Updates entries and
    thoughts, allocates two finding files, permits exactly one same-base document save and
    matches the surviving bytes to the winning ledger author/hash. A direct-writer CAS
    regression preserves externally changed bytes and no lock/temp artifacts remain; the
    focused gate passes **104/104**, TypeScript and diff checks are clean. `createPlan()`
    remains excluded because its `writeFile(..., {flag:"wx"})` path was already safe.
    A later Inbox concurrency run exposed an ABA race in shared lock cleanup: recursively
    removing the canonical lock directory could outlive release, overlap a successor's
    recreation and delete its new `owner.json`. Release and stale reaping now atomically
    rename the canonical directory to a unique tombstone before removing only that detached
    path; the reaper coordinator uses atomic empty `rmdir`. Repeated concurrent Inbox writes
    and the Dev cross-process suite **7/7** pass, with a source assertion pinning the detach-
    before-remove contract.
    Local document saves now persist a recoverable batch journal containing the intended
    document and attribution bytes, checksums and exact expected versions before either
    rename. Recovery accepts only the already-committed desired bytes or the exact expected
    predecessor; an outside edit is never overwritten and leaves the journal for explicit
    resolution. Recovery also requires the caller's exact ordered canonical target set,
    so a forged schema-valid journal cannot write outside its document/ledger pair.
    Fault injection covers death between the two renames, death after both renames but
    before cleanup, an outside edit before recovery and a forged outside target. The
    widened Dev doc/cross-process gate passes **29/29**. An unreadable, malformed or
    shape-invalid local or durable attribution ledger now fails closed and remains
    untouched rather than being silently replaced with an empty history.

    Remaining: a non-cooperating direct writer can still land inside the final per-file
    version-check/rename interval. Production's durable workspace uses one database batch
    transaction, but the local file boundary must close or explicitly constrain that final
    direct-writer window before #88 is called fully resolved.

89. **P1 — RESOLVED 2026-08-25: managed integration activation is explicit, stable and
    scope-correct.** Connections now carry active state selected by provider plus exact
    client/workspace scope. A new generic save is inactive; a test does not change ordering;
    the first passing connection can establish the default; later passing alternatives stay
    inactive until deliberate activation; and a failed active test deactivates it. Generic
    activation requires a passing test, while specialised validated plugin settings perform
    an explicit internal activation. Legacy tested rows retain the former newest default
    until the first explicit selection, avoiding a migration outage. Client-aware consumers
    use an exact client connection with workspace fallback, and enquiry email/SMS/call paths
    carry and validate their target client before resolving credentials. Unsupported generic
    client scopes, including Meta and Aqua Editor AI, are hidden and rejected. The focused
    matrix proves good-to-bad replacement, retest order, manual activation, target-client
    isolation and provider consumers across **160/160** checks; TypeScript is clean. The
    mounted port-3032 Connections page shows exactly one active legacy GitHub row, an older
    inactive row with “Make active,” and the active OpenAI row without mutating live data.

90. **P1 — RESOLVED 2026-08-25: every advertised form has one mounted schema authority
    and guarded operator write boundary.** Clients, Leads, Actions and Products now load
    Portal Editor definitions into their real create/edit screens; existing Clients have a
    dedicated settings editor; Expenses validates on the server; and Lead CSV mapping/import
    reads the Lead schema. Contacts intentionally keep their richer Leads Pipeline contract,
    but Portal Editor reads and writes that same contract, labels the delegation, and the
    generic editor service refuses a second disconnected Contacts document. One validator
    normalises all nine Portal field types and rejects unknown/inactive fields, bad options,
    impossible dates, invalid email/HTTP URLs and missing required values. Deleting a
    definition hides it without erasing historical values; unchanged history survives normal
    edits while changed writes to the deleted key are refused. Real Lead/Contact handlers and
    Client/Action/Product/Expense writers pass **8/8**, the surrounding editor/import/
    recurrence/finance/catalogue gate passes **118/118**, TypeScript and diff checks are
    clean, and read-only port-3032 proof mounted all six configuration tabs, their working
    screens and the nine-type Product field editor without changing live data.

91. **P2 — RESOLVED 2026-08-25: Agency Settings now control the named outcome or state
    their stored-only limitation.** `portalAccessDays` drives the real unsent portal-access
    follow-up threshold and copy; the UI separately states that one-time confirmation codes
    expire after 15 minutes. Saved legal/contact identity is used as fallback invoice
    identity/details and transactional email sender/reply identity, while invoice-template
    and sender-connection overrides are named precisely. Digest frequency and timezone do
    not yet have schedulers, so both surfaces now say they are stored for future scheduling
    rather than promising delivery or date shifting. The outcome-level gate passes **3/3**,
    the widened Settings/Finance/notifications gate passes **143/143**, and read-only
    port-3032 proof mounted Account, Defaults and Notifications with the exact copy without
    submitting either form.

92. **RESOLVED 2026-08-25 — Agency Settings and its APIs now share one role-capability
    contract.** Owners and managers retain Team creation/assignment, Activity Log/export and
    External AI management; staff receive none of those capabilities. Current middleware
    redirects staff to `/portal/team` before Agency Settings mounts, while defensive Settings
    branches still hide the actions and provide explicit permission copy. Staff Account and
    Permissions now return to Team and describe owner/manager-controlled access without linking
    back into blocked Settings. The focused role/API/source gate passes **5/5**, the surrounding
    Team/Activity/External-AI/multi-agency/showcase gate passes **68/68**, TypeScript and the
    **271/271** production build pass, and an isolated production browser proved the owner and
    manager controls plus the staff redirect/account/permissions path.

93. **RESOLVED 2026-08-25 — Google Calendar event creation is retry-safe across remote
    success, refresh failure and local persistence loss.** The mounted editor retains one
    operation id while the submitted payload is unchanged. Aqua durably records that operation
    before the provider call and derives a Google-compatible client event id from it. A 2xx is
    normalised into the local event cache immediately; a 409 reads that exact provider event
    back instead of recreating it. The wider source/event refresh is now best-effort: failure
    returns `ok: true` with `refreshStatus: "stale"` and a warning, while the adopted event stays
    visible. Activity uses the same idempotency key, and API failures distinguish whether the
    remote event exists and whether retry is safe. The **7/7** focused matrix proves pre-provider
    persistence refusal, post-provider/final-flush failure, remote-success-plus-refresh-503,
    unchanged replay, changed-payload rejection, 409 recovery and recovery after all local state
    is discarded with exactly one successful remote create. The surrounding Calendar/state/
    company/actions gate passes **87/87**, TypeScript and production build **271/271** pass. This
    used an isolated fake Google provider; no live Google account or shared port-3032 data changed.

94. **RESOLVED 2026-08-25 — Contact Add, Edit and sync now use one identity-ownership
    contract.** `addPersonEmail()`/`addPersonPhone()` perform the same canonical,
    agency-scoped ownership check as Edit. Both PATCH paths return 409 with
    `conflictingPersonId`; the mounted card retains its draft and offers “Open existing
    contact”, so the operator reviews the owner instead of silently merging people. Upsert
    refuses a split email/phone identity between compatible cards and validates every value
    before its one mutation, preventing partial changes. A company switchboard shared by
    clearly different names stays contactable on both cards but is marked `shared` and cannot
    identify anyone by number alone; repeated named sync still reconnects to one colleague.
    Legacy duplicate emails resolve oldest-first rather than by recent edit, while ambiguous
    duplicate phones resolve to nobody. The focused gate passes **31/31**, the wider Person/
    enquiry/history gate **114/114**, TypeScript/diff and production build **271/271** pass.
    An isolated mounted browser proved real email and phone PATCH 409s, visible owner links,
    retained drafts and clean reload. A read-only shared-state count found zero duplicate
    emails and two legacy repeated-phone groups (4 and 5 cards) that require human review;
    no shared port-3032 data was rewritten.

95. **RESOLVED 2026-08-25 — claimed Meta webhook deliveries now recover after a worker
    exits.** Local claims and the checked-in Supabase RPC use bounded owner/expiry leases,
    atomically reclaim expired or legacy-unleased `processing` rows and fence complete/fail
    by the current unexpired owner. An expired eighth attempt is terminally failed instead of
    remaining stuck. The behavioral proof uses separate Node processes against one isolated
    Inbox file: process A claims and exits, process B reclaims the same event at attempt two
    and completes it, and stale-owner settlement is refused. Focused **11/11**, wider Inbox/
    integration/policy **60/60**, TypeScript and production build **271/271** pass. Both the
    fresh-install and upgrade SQL contracts are checked in and source-verified; this run did
    not apply or execute them against a live Supabase database. Conversation ordering and
    duplicate-message side-effect gating are closed by #97 and multipart provider delivery
    by #98. Queue leasing remains a separate ownership boundary.

96. **RESOLVED 2026-08-25 — the local Master Inbox store now fails closed and commits
    atomically across processes.** Malformed JSON or any present non-array/non-record
    collection raises `InboxLocalRecoveryRequiredError`; read and attempted write leave the
    source byte-identical. All connection, identity, conversation, message and webhook
    mutations run as read-modify-write transactions under a filesystem-visible lock, then
    write a same-directory 0600 temp, fsync the bytes, atomically rename and fsync the parent
    directory. Dead lock owners are reaped and their abandoned temp is removed before the
    next transaction. Injected write and rename failure preserve the last good snapshot; a
    real SIGKILL after temp fsync leaves the old target intact and a fresh process recovers.
    Twelve simultaneous child-process connection/message/webhook writes all survived, while
    two simultaneous claimers produced one owner. Focused **6/6**, wider Inbox **62/62**,
    TypeScript and production build **271/271** pass. Every destructive test used isolated
    temporary files; shared port-3032 state was neither read nor changed.

97. **RESOLVED 2026-08-25 — Meta provider-message append and conversation advancement are
    atomic, idempotent and order-independent.** `appendInboxProviderMessage()` performs one
    locked local transaction or one service-role Supabase RPC. The external provider id is
    the idempotency fact; only a newly inserted inbound row increments unread state, and a
    duplicate returns the actual retained message/conversation before activity or automation
    effects. Conversation clocks are re-derived from authoritative provider messages: first
    inbound uses the minimum timestamp, last inbound/outbound/message use maxima, first
    response is the earliest outbound at or after first inbound, and the reply deadline follows
    the latest inbound. Delayed older referrals cannot replace newer source/campaign facts.
    Focused **7/7** covers concurrent inbound +2, newer-then-older delivery, outbound-before-
    arrival ordering, duplicate ids, delete/read replay, a true two-process local race and the
    checked-in SQL contract. The wider Inbox/integration/Dev gate passes **80/80**, TypeScript
    and diff checks are clean, and the production build completes **271/271**. The upgrade
    migration `20260825100000_atomic_meta_conversation_ingestion.sql` is source-verified but
    was not applied or executed against a live Supabase database in this run. Multipart
    outbound provider delivery is now separately resolved as #98.

98. **RESOLVED 2026-08-25 — multipart Meta replies retain per-part truth and resume only
    missing delivery.** A deterministic client operation maps to one logical Inbox message;
    its metadata contains a child delivery record for text and every attachment, including
    status, attempts, lease owner/expiry, provider message id and error. A per-part local
    transaction or service-role RPC claims pending/failed work before provider contact and
    conditionally settles only its owner. Confirmed parts are skipped by all later retries;
    simultaneous contenders see busy. If a worker stops after provider contact but before
    settlement, expiry changes that part to `uncertain` and Aqua refuses to auto-resend an
    outcome Meta may already have accepted. The Social Inbox renders sent/failed/waiting
    attachment state, “Partially sent” progress, an explicit review-required outcome and a
    “Retry remaining” action. An isolated fake Meta probe now needs **three calls**, not four:
    text succeeds once, attachment fails once, reconnect/retry sends only the attachment.
    Completed replay performs zero calls, the same operation rejects changed content, active
    leases fence a second worker, and expired work becomes uncertain. Focused **4/4**, wider
    Inbox/Meta **54/54**, TypeScript/diff and an isolated production build **271/271** pass.
    `20260825110000_resumable_meta_reply_parts.sql` is checked in and source-verified but was
    not deployed or executed against a live Supabase database in this run.

99. **RESOLVED 2026-08-25 — Actions rejects impossible task state at the shared service
    boundary.** Creation now validates a non-empty title, supported priority, recurrence and
    source plus safe positive timestamps and coherent start/due/reminder ordering before
    duplicate-source lookup or mutation. PATCH constructs and validates the complete resulting
    task instead of spreading request JSON: unknown status/priority/recurrence, negative or
    non-finite time and reversed chronology return a field-specific HTTP 400 and leave storage
    unchanged. Explicit `undefined` keys from the staff allow-list preserve existing dates;
    `reminderAt:0` remains the intentional clear contract. The same service guard covers direct
    import, automation, template and assistant callers. Focused real-route/service proof passes
    **7/7**, including malformed legacy-row refusal/correction and monthly recurrence; the wider
    Actions/task/Aqua+Google Calendar gate passes **136/136**, TypeScript/diff is clean and an
    isolated production build completes **271/271**. UI source coverage confirms create/edit and
    Calendar surface API errors are rendered; no shared port-3032 state was changed.

100. **RESOLVED 2026-08-25 — lead conversion is single-owner, replayable and resumable.**
    A durable operation keyed by agency plus canonical email (lead id fallback) claims one
    owner before client creation, binds materially identical request options and replays the
    saved result. Failed/expired work resumes while stale holders are fenced. Client,
    relationship, contact, portal, lead-card and Finance effects converge; deterministic
    Finance intents adopt an invoice/payment created before a simulated interruption. A real
    simultaneous handler race returns one 201 creation and one 200 replay with the same client
    id, one persisted client, one contact promotion and one portal instance. Independent Node
    processes sharing the local sidecar elect one owner and later replay its durable result.
    Focused proof passes **6/6**; the wider gate reports **87 passed, 0 failed and 2 expected
    live-database skips** across 18 suites. TypeScript/diff is clean and an isolated production
    build completes **271/271**. The generic/Supabase schema and adapters are source-verified;
    deploy and execute `20260825120000_lead_conversion_operations.sql` before live database
    acceptance. No mounted browser acceptance or shared port-3032 mutation was claimed.

101. **RESOLVED 2026-08-25 — Fulfilment product stages now share one transition and read
    contract.** `clientProductProcess` is authoritative; old board and portal fields are
    migration fallbacks only. One synchronous transition updates the process entry,
    `productPipelineStages` mirror, retained product workspace, aggregate programme portal
    mode and account lifecycle in one client mutation. Agency board drag, client operating
    plan and portal workspace stage routes all call it, while agency pipeline/Fulfilment,
    client and customer readers use the same resolver. Existing checklist progress survives;
    open stage history supplies a stable activity identity, so identical retries emit no
    duplicate transition. With multiple products, account/portal advance only when every
    assigned product reaches that mode. Focused real-route proof passes **5/5**, the wider
    fulfilment/client/customer gate **114/114**, TypeScript/diff is clean and isolated build
    **271/271** passes. Port 3032 was not running and the sandbox refused both wildcard and
    loopback isolated listeners with `EPERM`; mounted browser acceptance therefore remains an
    operational follow-up and no shared CRM state was changed.

102. **RESOLVED 2026-08-25 — client product-workspace writes are versioned, coordinated and
    cross-model atomic.** Each workspace carries a monotonic revision. Agency board, client
    process and portal workspace writers submit that revision; stale writers receive 409 plus
    the current workspace/stage and can retry only after reviewing it. One client mutation
    commits process, board mirror, product workspace, programme/account stage and related file
    visibility, so a refused write changes none of them. A durable coordinator reloads while
    holding a filesystem-visible lock locally or a checked-in database lease on Supabase/
    Postgres. Independent Node processes preloaded at the same revision prove exactly one
    winner/one conflict and lossless retry for edits and stages; a separate collision proves
    collection status never splits from file visibility. The request, approval, payment-plan
    and record ledgers now re-read and merge under the same durable client-ledger transaction;
    duplicate approvals conflict and payment-plan edits also carry a per-plan revision.
    Focused real-route proof passes **8/8**, separate-process proof **4/4**, the wider focused
    gate **77/77**, TypeScript/diff is clean and isolated production build **271/271** passes.
    Deploy and execute `20260825130000_product_workspace_leases.sql` before live database
    acceptance. Mounted browser acceptance remains; no shared port-3032 state was changed.

103. **RESOLVED 2026-08-25 — client payment and invoice headlines preserve currency and
    collectible status.** `ClientPaymentPosition` now exposes ordered `currencyPositions`
    instead of one currency plus cross-currency minor-unit totals. Plan milestones and
    unlinked paid/collectible invoices are grouped without double-counting linked invoices;
    per-currency agreed, collected, outstanding, open, missed and next-due evidence stays
    attached to its currency. Payment Plans, client commercial gaps/overview, relationship
    workspace badges, Radar and the Finance founder table all consume that grouped contract.
    Built-in Customer Billing and configurable billing metrics use the shared
    `summariseInvoicesByCurrency()` rule: only `sent` and `overdue` are outstanding, while
    draft, void, refunded and cancelled records cannot be presented as collectible. A direct
    £100 GBP plus $200 USD regression returns two positions; the status matrix leaves only
    its issued USD invoice outstanding. Focused dependent coverage passes **62/62**,
    TypeScript/diff is clean and isolated production build **271/271** passes. No shared
    port-3032 state was changed; mounted mixed-currency/refund browser acceptance remains a
    verification follow-up rather than a claimed pass.

104. **RESOLVED 2026-08-25 — Advanced Fulfilment uses shared canonical Actions tasks.**
    `_KanbanTabClient` now loads canonical `AgencyTask` records through
    `/api/tenants/client-tasks`; create, move and delete run inside the durable per-client
    metadata-ledger transaction and flush before success. Board columns map explicitly to
    Actions statuses, ordinary Actions status edits map back to a valid board column, and
    monotonic task revisions make stale moves/deletes return 409 plus current shared state.
    Existing task activity records cover create/update/delete. The former
    `milesymedia-client-tasks:${clientId}` value is read once for an idempotent import and is
    deleted only after the server accepts it; no client task is written to localStorage.
    Focused real-route create/reload/move/conflict/delete and migration/retry proof passes
    **3/3**, the wider Actions/client-workspace gate **136/136**, TypeScript/diff is clean and
    isolated production build **272/272** passes. Mounted two-profile and storage-loss browser
    acceptance remains a verification follow-up, not claimed evidence.

105. **RESOLVED 2026-08-25 — payment-plan invoice retries adopt one durable Finance result.**
    A milestone now retains `invoiceOperationId` plus its start time. The route persists and
    flushes that intent before calling Finance, supplies a deterministic key namespaced by
    agency/client/plan/milestone/operation, and only issues an adopted invoice while it is
    still draft. Finance state is flushed before the route durably attaches the invoice;
    payment-plan/invoice ledger rows and an idempotent activity entry reconcile afterward.
    Any later failure therefore leaves a recoverable stage, not an anonymous invoice.
    Real-handler proof covers normal create plus stale HTTP replay, a pre-created issued
    invoice with no milestone link, and deletion/recovery of link-adjacent ledger/activity
    projections. A separate file-backed child process persists the pre-link crash state and
    a fresh process adopts the same id/number, leaving exactly one £1,250 invoice, one link and
    one activity row. Focused **4/4**, wider Finance/client **119/119**, TypeScript/diff and
    isolated build **272/272** pass. The recovery identity is stripped from customer payloads;
    pending milestones are edit/delete locked and visibly retryable. Mounted acceptance is
    retained without claiming any shared port-3032 mutation. **Regression closed 2026-08-26:**
    the later 422 was traced to nested file-backed PortalState transactions, where the outer
    payment-plan ledger command and inner Finance idempotency command tried to acquire the same
    non-reentrant whole-state lock. `withDevFileTransaction` now carries async-local ownership:
    the owning request can compose a nested transaction, while an unrelated async caller still
    waits for the filesystem mutex. Fresh-process adoption is restored to **4/4**; the widened
    Finance/client/product-workspace gate passes **65/65**, the cross-process/re-entrancy lock
    gate passes **8/8**, TypeScript is clean and the isolated production build reaches
    **275/275**. Mounted fault/retry acceptance remains an operational follow-up.

106. **RESOLVED 2026-08-25 — one discovery runner executes and gates every nested Website
    Editor smoke file.** `run-website-editor-smoke.mjs` discovers the suite instead of
    maintaining a 49-command chain, runs every file even after an earlier failure, pins the
    portal TypeScript path map and removes an inherited React server condition for the
    client-capable module process. Both the module's `npm test` and root
    `smoke:website-editor` use that runner; root `smoke:all` includes the nested gate. A real
    fail-through fixture proves file two executes after file one fails while the aggregate
    exits non-zero and names the failed file. The actual suite reaches assertions in
    **49/49 files (1,527 assertions)**, the runner contract passes **2/2**, TypeScript is clean
    and the isolated production build passes **272/272**. A later current runner passes
    **49/49 files in 11.8s**. The later final canonical Node phase executed **6,417
    tests across 1,093 suites: 6,415 passed / 0 failed / 2 skipped**, replacing the
    old unrelated-failure state with current repository-wide green evidence.
    Mounted editor behaviour remains a separate browser-acceptance responsibility.

107. **RESOLVED 2026-08-25 — customer Billing renders the canonical relationship state.**
    The account-status panel now receives `client.status` and maps active, suspended and
    archived states to explicit provider-labelled copy plus a state-appropriate Support
    action. Suspended copy says the service is suspended/paused while explaining that billing
    history and existing payment options remain available; it can no longer claim “Active.”
    Existing secure-billing and invoice-pay actions were left intact. Fresh-memory linked-
    workspace proof confirms both active and suspended workspaces remain accessible across
    repeated reads while archived workspaces remain excluded, preserving the prior access
    contract. Focused status/access/source coverage passes **3/3**, the wider customer/
    relationship/billing gate **43/43**, TypeScript is clean and isolated build **272/272**
    passes. No suspended fixture exists in current local state, so mounted switching/direct-
    entry/reload acceptance remains explicitly unclaimed rather than mutating port 3032.

108. **RESOLVED 2026-08-25 — People validates complete records and canonical live employee
    identity before mutation.** The service boundary now validates create and full post-patch
    employee state rather than trusting route casts. Supported employment/status/pay/currency,
    leave decision/type, shift and training states are explicit; weekly hours, holiday,
    minor-unit pay, scores and dates are bounded; employment/commission date ranges must be
    coherent; and commission/onboarding arrays are cleaned and structurally validated. The
    route preserves every omitted field on partial updates. Email is trimmed/lowercased and
    exactly one non-alumni People record may own the canonical value; a retired alumni email
    can be reused under that explicit policy. Identity conflicts return 409, domain failures
    return field-specific 400s and the real-route tests prove rejected writes leave the stored
    record unchanged. Focused domain/workspace coverage passes **26/26**, the separate Agency
    HR smoke remains **6/6**, TypeScript is clean and isolated production build **272/272**
    passes. Mounted form/conflict/reload acceptance remains, as does database-native uniqueness
    if People writes must become safe across independent instances. Missing semantic references
    remain tracked by #20; the parallel Agency HR ledger was resolved by #109.

109. **RESOLVED 2026-08-25 — mounted Agency HR employees and leave now project the canonical
    People workforce.** The original isolated reproduction created unrelated same-email staff
    and leave ids because each mounted service owned a private ledger. The real Agency HR
    foundation now requires a `WorkforcePort`: its staff and leave services delegate every
    mounted read/write to `PeopleEmployee` and People leave, while an HR-only sidecar retains
    department, role, custom-role, assignment and location metadata against the People id.
    Finance no longer merges legacy Agency HR staff; it consumes People employees only while
    retaining HR departments. People leave approval updates the decision and employee `leave`
    status in one mutation. The current retained portal state contains no `staff/index` or
    `leave/index` rows requiring migration. Compatible email-matched legacy metadata projects
    onto the canonical People id; unmatched legacy identity rows do not become a second live
    truth and would require explicit offline migration before importing such an old backup.
    Real mounted-handler convergence passes **3/3**, the wider People/Finance/API/page gate
    passes **97/97**, standalone Agency HR remains **6/6**, TypeScript is clean and isolated
    production build **272/272** passes. Mounted browser mutation/reload acceptance remains;
    shared port 3032 and its state were not mutated.

110. **RESOLVED 2026-08-25 — People is the authoritative linked-staff compensation and
    commission contract.** The original probe proved People and Finance could retain different
    pay for one `staffId`. The real Finance foundation now requires a compensation-terms port.
    Linked profiles project the current People name/title, pay basis, base amount, currency,
    employment dates/hourly units and active commission plan facts on every read; predictable
    monthly/quarterly fixed commission becomes Finance's scheduled annual target, while variable
    or per-event commission remains a separately evidenced payment. Finance retains only its
    accounting controls: budget/cost centre, employer overhead, payment cadence/date, company
    scope, notes, status and payment ledger. Independent suppliers remain fully Finance-owned.
    Duplicate People links are refused, a missing People link blocks payments, the mounted forms
    label canonical fields read-only and monthly payment drafts use the same cost projection.
    The current retained portal state contains no Finance compensation index requiring migration.
    Real mounted-handler convergence passes **3/3**, focused People/Finance **32/32**, the wider
    non-security Finance/People/API/page gate **158/158**, standalone Agency Finance **23/23**,
    TypeScript and isolated production build **272/272** pass. Mounted browser save/reload
    acceptance remains; shared port 3032 and its state were not mutated.

111. **RESOLVED 2026-08-25 — staff account provisioning has one durable, resumable operation.**
    `hire-candidate`, `provision-employee` and Agency Users now delegate to
    `runStaffProvisioning()`. A password-free, agency/email-scoped record binds the exact intent
    and preallocates stable local user/employee ids before any provider call. Provider adoption
    is limited to a Supabase identity carrying that exact operation marker; unrelated identities
    keep the hard refusal. Provider, local user, People target and completion checkpoints are
    durably flushed, discovered idempotently on retry and surfaced as retryable stage-specific
    503 outcomes after a partial failure. The temporary password is never persisted.

    The dedicated fake-provider/fault-store matrix passes **14/14** across provider create,
    provider-profile partial success, local-user creation, employee linking and every
    post-provider durable boundary, including fresh-runtime retry. A real PortalState adapter
    test covers all three mounted call paths and converges on one provider identity, one local
    user and one target. Wider People, Settings, customer-setup, company-disposition and state
    round-trip coverage passes **109/109** and final TypeScript passes. The isolated build reached
    **272/272** before the final retry-error response wrapper; a later complete production build
    generated **245/245** pages. Real Supabase staging and mounted form failure/retry/reload remain
    acceptance work.
    Legacy provider identities without the new marker are deliberately not auto-adopted and need
    explicit operator reconciliation. Shared port 3032 and its retained state were not mutated.

112. **RESOLVED 2026-08-25 — freelancer provisioning and the advertised shared-work
    capabilities are implemented.** `/api/portal/freelancers` now calls `inviteFreelancer()`,
    which reuses the durable provisioning coordinator for one provider identity, local
    `role:"freelancer"` user and linked People record, then issues a real password-reset setup
    link and transactional email. Exact replay preserves its original intent and does not create
    another provider/local identity. When production mail is unavailable, the authenticated
    owner/manager receives the setup link instead of being left with an unreachable account.

    `PeopleFreelancerJob` now owns agency-shared deliverable links and private freelancer
    submissions. The workspace projects only policy-permitted deliverables and safe submission
    metadata; upload and message routes enforce freelancer ownership plus the same per-job policy.
    Messages enter a direct People/Team Chat channel with the agency owner, and both the owning
    freelancer and same-agency operator can download submitted work through the guarded content
    route. The mounted in-process journey passes **3/3**, including legacy-local adoption and
    replay; surrounding freelancer, People, upload, redirect and provisioning coverage passes
    **105/105**, with TypeScript clean. A later complete production build generated **245/245**
    pages. Still to accept, without reopening this implementation finding: real
    Supabase/email delivery, password reset and login in a browser, plus cross-process/reload
    persistence. Port 3032 was not mutated.

113. **RESOLVED 2026-08-26 — Finance invoice identity is atomic and mounted creates are
    retry-idempotent.** `PluginStorage.runExclusive()` now refreshes state, serialises the
    logical mutation across file/Postgres/Supabase application processes through the existing
    durable transaction/lease boundary, and flushes before release. `InvoiceService.create()`
    performs deterministic-id adoption, agency/year sequence reservation, row/index persistence
    and creation side effects inside that boundary; storage ports without the mounted adapter use
    a process-local serialiser. `NewInvoiceForm` retains one idempotency key for its mounted
    lifetime, so double-click/network retry adopts the first row and optional issue follows that
    returned invoice id. A real separate-process file-backend test gives distinct intents distinct
    numbers, makes simultaneous same-key retries share one id/number, then reloads from a third
    process and sees three rows, three numbers and sequence three. Dedicated **2/2**, widened
    Finance/product-transaction **91/91**, TypeScript and `git diff --check` pass. The shared
    port-3032 state was not read or mutated. “Issue now” failure recovery remains issue #47.

114. **RESOLVED 2026-08-26 — Finance payment allocation is collectible-state bound and
    atomically capped to the live outstanding balance.** One shared helper defines `sent` and
    `overdue` as collectible and derives paid/outstanding cents from canonical payment rows.
    `PaymentService.record()` now adopts an exact idempotent retry first, then validates the
    current invoice, positive integer amount, currency, collectible state and remaining balance
    inside a per-invoice cross-process plugin-storage transaction. It refuses overpayment and
    settles only when the accepted allocation exactly clears the balance. The mounted Income
    selector/amount cap and Stripe Checkout use the same rule and remaining amount. Independent
    file-backed processes racing £70/£70 against £100 persist one £70 row and reject the other;
    £30 then settles, while racing £40/£60 preserves both and settles exactly. Fresh reloads
    prove draft, void, paid, refunded and £100.01 attempts leave state unchanged, and the capped
    ledger agrees with P&L and settled-invoice reporting. Dedicated **3/3**, complete Finance
    gate **108/108**, TypeScript and `git diff --check` pass; port 3032 was not touched. Refund
    reversal rows remain the distinct accounting problem in #119, and signed live Stripe
    acceptance remains external verification rather than part of this source fix.

115. **✅ RESOLVED 2026-08-26 — Agency Finance now validates complete records at the service
    boundary.** Shared `runtimeValidation.ts` guards exact object fields, supported currencies/
    statuses/types/methods, safe whole-cent money, finite bounded percentages and quantities,
    non-negative timestamps, coherent invoice/budget/coverage/contract/recurrence timelines,
    nested line items and private expense attachments. Invoice templates, categories, plans,
    income, payments, expenses, budgets, obligations and compensation create/post-patch paths
    validate before storage; Operations no longer rounds or silently drops invalid values, and
    mounted handler errors remain field-specific. `smoke-finance-runtime-validation.test.ts`
    drives invalid service/import-shaped values across every family plus real Invoice and
    Operations handlers and compares the entire plugin Map before/after each refusal: dedicated
    **115/115**, complete Finance **223/223**, TypeScript and `git diff --check` pass. The deal
    closer now supplies its injected `issuedAt`, and obsolete fixtures were corrected to obey the
    same date/domain contract. Plan assignment, recurring posting, reporting and refunds are now
    resolved under #116–#119; settings #120 and commercial-plan convergence #121 are now
    code/behaviour-complete with mounted browser acceptance pending.

116. **✅ RESOLVED 2026-08-26 — Finance plan assignment validates first and converges both
    lookup directions through one recoverable cross-process operation.** `PlanService` now checks
    the client in the agency and the requested target plan before writing. All assignments for an
    agency share the plugin-storage transaction lock, preventing both competing moves and two
    clients racing onto one plan from losing membership. A durable, versioned per-client marker is
    written before the old/new membership and reverse pointer; any interrupted operation is
    replayed idempotently by the next plan read, which also removes duplicate forward membership.
    The mounted handler requires an explicit `planId`, rejects unsupported fields and distinguishes
    missing clients from missing plans. `smoke-finance-plan-assignment.test.ts` faults every write
    boundary for assign, move and unassign, proves invalid client/stale-plan requests write nothing,
    and races assign/move/unassign/shared-target/stale-target actions in independent file-backed
    processes before a fresh reload checks both directions. Dedicated **18/18**, complete Finance
    **241/241**, TypeScript and `git diff --check` pass; port 3032 and its retained state were not
    touched. Recurring posting is now resolved under #117; the commercial-plan lifecycle was
    subsequently converged under #121, with only mounted browser acceptance remaining.

117. **✅ RESOLVED 2026-08-26 — recurring Finance posting is one recoverable operation per
    schedule and due timestamp.** The mounted UI/handler now carries the visible `nextDueAt` as
    the occurrence identity; direct package double calls infer that intent before either mutates.
    `ExpenseService` serialises each schedule across processes, writes a versioned operation marker,
    creates one deterministic child, persists a durable result before advancing the source, then
    writes an idempotent recurring audit entry and clears the marker. Any unfinished operation is
    resumed before a newer request, and permanent result rows make HTTP/double-click replay return
    the same child without advancing again. Expense retries also repair a missed advisory index,
    and the UI de-duplicates replayed child rows. `smoke-finance-recurring-occurrence.test.ts`
    faults all six marker/child/index/result/source/clear writes, fails creation and recurring logs
    both before and after their write, tests direct double calls plus the real handler/UI contract,
    and races two independent file-backed processes through two consecutive periods and reload.
    Dedicated **15/15**, complete Finance **256/256**, TypeScript and `git diff --check` pass;
    exactly one child exists per due occurrence, the schedule advances once per real period and
    port 3032 was not touched.

118. **✅ RESOLVED 2026-08-26 — Finance reporting now uses one selected-currency cash/accrual
    book across every mounted headline and API.** `AccountingService` derives receipt cash from
    Payment rows (plus the explicit legacy-paid compatibility path), cash costs from reimbursed
    expenses, committed/accrual costs from approved plus reimbursed expenses, pending costs as a
    separate state, partial-aware receivables and proportional receipt tax. It never sums currencies
    or performs implicit FX. Overview, Reports, Budgets, Planning, P&L and both mounted report APIs
    consume those named fields; each UI exposes its active currency and currencies present in the
    books. Founder MRR/ARR, churn, active clients and top-client cash are selected-currency too.
    `smoke-finance-accounting-semantics.test.ts` proves GBP/USD isolation, partial/full/status-only
    refunded receipts, pending/approved/reimbursed costs, MRR partitioning, mounted API responses
    and every UI consumer: dedicated **5/5**, complete Finance **261/261**, TypeScript and
    `git diff --check` pass. The distinct refund ledger was then completed under #119; port 3032
    and retained data were not touched.

119. **✅ RESOLVED 2026-08-26 — Finance refunds are durable negative allocations, not invoice-
    status guesses.** Each settled reversal is an immutable `Refund` tied to its Payment, invoice,
    client, amount, currency, provider refund id/event and occurrence time. Stripe's cumulative
    `amount_refunded` is reconciled to the unrecorded delta; provider ids make repeated and racing
    webhooks converge across processes. Partial and full refund states derive from gross receipts
    minus refund rows, while disputes persist separately and do not impersonate settled cash.
    The manual endpoint requires a stable request identity, forwards it to Stripe, records a
    successful provider result immediately and lets a later webhook adopt the same row. Accounting,
    P&L, Reports, Overview, Income, aging, Checkout and client payment summaries expose gross,
    refunds and net allocation consistently; receipt tax reverses proportionally. The dedicated
    `smoke-finance-refund-ledger.test.ts` covers partial/multiple/full cumulative events, provider
    replay, an interrupted post-row write and retry, independent-process refund/dispute races plus
    fresh reload, and mounted/UI contracts: **4/4**. Complete Finance **265/265**, TypeScript and
    `git diff --check` pass; live signed Stripe acceptance remains external and port 3032 was not
    touched.

120. **🟠 CODE + BEHAVIOUR RESOLVED 2026-08-26; mounted browser acceptance remains.** Workspace
    Settings is now the sole owner of invoice payment terms, default tax rate and business/tax
    identity. The duplicate `defaultPaymentTermsDays` and inert `agencyTaxId` declarations were
    removed from Finance install settings, and the workspace settings route no longer copies
    terms/tax/prefix into hidden Finance config. Terms are stored as bounded whole days; the
    invoice page receives the canonical terms/tax defaults, no longer hard-codes 14/20, and the
    service derives a missing due date from those terms. Every new invoice captures an immutable
    issuer identity snapshot, so later legal/tax changes affect only later exports; legacy rows
    retain the former live fallback because their original identity cannot be recovered. The
    settings-to-outcome gate changes 10-day/old-tax to 45-day/new-tax and proves the first invoice
    and HTML export remain unchanged: dedicated **3/3**, current complete Finance **271/271**, plugin/
    settings outcome set **27/27**, TypeScript and diff pass. An isolated browser sandbox was
    created without touching port 3032, but this environment refused the new listener with
    `EPERM`; the isolated state was removed. Complete the literal Settings → invoice create →
    export click-through before upgrading this item to fully resolved.

    *2026-09-03 acceptance:* re-proven on a fresh exact build (Finance stories F1–F8 at 390×844 and 1280×800 within notepad 17/17, finance 16/16, layout 42/42, loader 2/2 (77/77, 0 missing)): settings drive the next invoice, an older invoice keeps its immutable seller snapshot in both the preview and the download.

121. **🟠 CODE + BEHAVIOUR RESOLVED 2026-08-26; mounted browser acceptance remains.** Client
    Payment Plans are now the canonical per-client commercial schedule; Agency Finance Plans are
    reusable pricing templates only. Mounted Finance Plans can create/edit multi-currency
    templates and assign, move or cancel clients. Assignment snapshots the template's recurring,
    term, deposit and currency terms into one active client schedule; later template edits affect
    future assignments only. The client Finance screen retains milestone invoicing but routes a
    linked schedule's lifecycle back to Finance Plans. MRR/ARR, Planning, brand portfolio and
    Deposits read active linked schedules instead of the legacy `Plan.clientIds` mirror; Deposits
    use the schedule's explicit deposit invoice id rather than note/reference guesses. The unused
    production `/plans/assign` route is retired. Moves cancel the old schedule and create the new
    snapshot without changing historic invoices; cancellation records a durable operation id so
    an old retry cannot cancel a later reassignment. Read-only retained-state inspection found no
    existing Finance plan assignments requiring migration. The focused convergence gate proves
    GBP→USD schedule, invoice/payment/deposit, MRR/ARR, move/cancel, retry marker and fresh
    container reload plus mounted source contracts: **3/3**. The corrected package cases and full
    Finance suite pass **271/271**; TypeScript and diff checks pass. The environment already denied
    the isolated Finance listener with `EPERM`, so no click-through or shared port-3032 mutation is
    claimed. Complete create → assign → invoice/pay → move/cancel → reload in an isolated mounted
    browser before upgrading this item to fully accepted.

122. **🟠 CODE + BEHAVIOUR RESOLVED 2026-09-02; full mounted/live-provider acceptance remains.**
    Membership subscription changes run under one per-user cross-process command. The command
    is persisted before provider work, carries stable customer/Checkout/change/cancel idempotency
    identities, records accepted provider results before local adoption and resumes the same
    intent after storage failure or a fresh container. Paid→free cancels the live provider
    subscription before replacing local access; paid→paid changes the existing provider object;
    free→paid replays one hosted Checkout; free end-of-period cancellation is normalised to an
    immediate terminal row because no provider period/webhook exists. The customer portal exposes
    plan-switch actions, customer/admin requests carry operation ids, and provider failures return
    retryable 503 without optimistic reload. Every mounted operation id is durably bound to its
    archived canonical command rather than whichever command is active later, so historical retries
    replay their original exact result and incomplete legacy history fails closed. Subscription rows
    retain every retired Stripe subscription id, preventing an old Checkout or webhook generation
    from replacing a resumed or newer provider generation. Provider-backed paid plan changes and
    cancellations acquire the shared per-user provider lane before provider I/O and retain it through
    dependency-graph adoption or final cancellation. Pause/resume maps provider collection state;
    the cancellation finalizer sequence-fences the current generation and publishes one terminal
    activity/event even when an at-period-end request returns terminal immediately. The original
    dedicated gate proves paid→free provider failure leaves both sides unchanged, retry/replay
    cancels once, free cancellation terminates, Checkout replay returns one session, provider-success/
    local-write failure is adopted after reload, and two concurrent paid changes call the provider
    once. Plan creation and price-changing updates use the same durable-
    command pattern: the intent owns the plan id and exact base/candidate snapshots,
    monthly and annual Stripe Price outcomes checkpoint separately with stable per-
    cadence provider keys, and provider I/O runs outside the PortalState transaction.
    A rebuilt container resumes without duplicating a successful price; final commit
    revalidates the exact target and benefit references, stale targets become terminal
    conflicts without overwriting intervening edits, and a pending update blocks plan
    deletion. The real foundation adapter forwards those keys to Stripe. The dedicated
    plan-price provisioning gate passes **11/11**, and the expanded subscription lifecycle itself
    passes **16/16**. The final focused Memberships aggregate is
    **65/65**, the adjacent Memberships/company/Ecommerce gate is **90/90**, and the complete
    changed-surface gate is **145/145**; TypeScript/diff pass and independent review is clean. A provider
    success made stale by a legitimate intervening edit is retained for reconciliation
    rather than automatically deactivated; mounted/live Stripe acceptance remains.

123. **🟠 CODE + BEHAVIOUR RESOLVED 2026-09-02; live-provider acceptance remains.** The old
    pre-work seen flag is now a durable per-event inbox row with processing/failed/completed state
    and attempt count, serialised by the plugin storage's cross-process transaction. A completed row
    is checked before Stripe retrieval, so exact redelivery performs no provider call; failed,
    interrupted and legacy pre-seen rows run again. Subscription events require agency, client,
    customer, plan and valid billing metadata, refuse cross-install scope and re-read current Stripe
    state inside the same per-user provider lane as UI lifecycle commands. A legacy event may
    discover its user only to choose that lane; its discovery snapshot is never applied. Late
    provider generations cannot replace the current subscriber. Invoice paid/failed events validate
    scope/identity/amount and use one paid-dominant per-invoice ledger: failed may advance to paid,
    paid cannot regress, and the durable row's event owns idempotent activity/event effects plus their
    completion marker. The HTTP route maps verified processing failures to retryable 503 while bad
    signatures remain 400. The expanded webhook gate passes **9/9**. The final focused Memberships
    aggregate is **65/65**, adjacent
    Memberships/company/Ecommerce is **90/90**, and the complete changed-surface gate is **145/145**;
    TypeScript/diff pass and independent review is clean. No signed live-provider delivery is claimed.

124. **🟠 CODE + BEHAVIOUR RESOLVED 2026-08-26; mounted/live-Connect acceptance remains.**
    Scheduling now runs under one affiliate-scoped cross-process transaction and persists a
    recoverable operation before mutation. Approved unclaimed attributions receive one payout id;
    a competing payout is refused, partial claim/row/index work resumes the same payout, and an
    explicit mounted operation id replays its result. Manual and Stripe webhook completion share
    one payout-scoped staged operation: only owned attributions can become paid, the payout row is
    adopted, and lifetime earnings are set from the canonical sum of paid attributions rather than
    incremented. This makes every completion stage retry-safe and prevents a legacy duplicate
    payout from changing earnings. The Payouts page now exposes affiliate selection plus Schedule
    approved, handles refused scheduling visibly and sends a stable operation id. The dedicated
    gate faults scheduling after claims, reloads/resumes, races two schedules, faults earnings
    after attribution/payout completion, retries concurrently and attempts a legacy duplicate:
    **3/3**. Package+focused passes **17/17**; combined Membership/Affiliate **70/70**; TypeScript
    and diff checks pass. Production Stripe Connect is still unwired under #45 and no mounted
    browser/live-transfer acceptance is claimed.

125. **🟠 CODE + BEHAVIOUR RESOLVED 2026-08-26; mounted/live-provider acceptance remains.**
    New attributions persist normalised currency plus immutable order amount/subtotal/status/paid
    snapshots, and only paid/fulfilled/shipped/delivered source orders are admitted. Payout
    scheduling partitions by currency, requires an explicit selection when more than one balance
    exists, stores gross/reversal/net composition and refuses legacy currency-less provider work;
    Stripe always receives the payout's locked currency and rejects caller overrides. Ecommerce
    now projects status/refund facts and Affiliate subscribers consume paid, refunded and cancelled
    lifecycle events. Cumulative partial/full refund or cancellation reconciliation is replay-safe:
    pre-transfer commission is reduced/reversed, while already-settled commission creates an
    auditable same-currency future offset that is claimed and applied by a later payout. Earnings
    projections and mounted admin/affiliate views are currency-partitioned and expose reversals.
    The dedicated mixed-currency/eligibility/cancel/refund/replay/UI gate passes **3/3**;
    Affiliate package+focused passes **20/20** and the widened Membership/Affiliate/Ecommerce gate
    passes **79/79**; TypeScript/diff pass. Production Connect #45 and literal mounted/live-provider
    acceptance remain, so this is not marked fully accepted.

126. **🟠 CODE + BEHAVIOUR RESOLVED 2026-08-26; mounted browser acceptance remains.** Membership
    plans, benefits and subscription commands now validate allowlisted input plus the complete
    candidate row before Stripe or storage mutation. Validation covers nonblank/scoped identities,
    supported enum/currency values, safe bounded integer money/order/trial/date values, unique real
    benefit references, category-specific discount/content fields, URLs and projected provider
    subscription values. Affiliate enrolment, post-patch rows, referral codes, source orders,
    commission rates, payout scheduling/method/currency/composition and completion inputs use the
    same service-boundary discipline; supported commerce currencies and 0–100% commission bounds
    replace browser-only constraints. Errors name their field. The dedicated matrix rejects blank/
    unknown/NaN/negative/out-of-range/extra-field cases and compares the full plugin store before
    and after every refusal: **3/3**. The widened Membership/Affiliate/Ecommerce gate passes
    **82/82**; TypeScript/diff pass. Literal mounted form/API refusal and reload proof remains.

127. **Resolved 2026-08-26 — Affiliate identities and referral counters are atomically
    claimable.** The original real-container probe demonstrated duplicate same-user Affiliate rows,
    duplicate literal code rows and last-writer pointers/indexes. Enrolment, normalised referral-code
    creation and order attribution now store an install-scoped durable claim containing the complete
    chosen row before writing the row, lookup or collection index. Identical retries adopt and repair
    that row; conflicting user/code payloads are refused. Collection-wide durable storage locks make
    Affiliate, code, attribution and payout indexes lossless across service instances, while stable
    per-attribution operation markers reconcile both referral counters exactly once without nesting
    the production state-file transaction. The dedicated delayed/fault store races same and distinct
    users, codes, orders and payouts across two containers, interrupts enrolment/code/attribution at
    partial-write boundaries, rebuilds the container and proves one visible/resolvable identity, no
    orphan and exact counters: **4/4**. Focused Affiliate proof passes **27/27** and the widened
    Membership/Affiliate/Ecommerce gate passes **86/86**; TypeScript/diff pass.

128. **✅ RESOLVED 2026-09-02 — published Performance report history is immutable,
    explicitly retired and browser-accepted on an exact isolated build.** *(Originally:
    code/behaviour repaired 2026-08-26; mounted browser acceptance remained.)* Generation now always creates
    a fresh id and monotonic revision. Publishing a newer draft retains the earlier analytics
    snapshot as `superseded`; an explicit reasoned `withdraw` retains its audit fields, and Delete
    refuses every non-draft. The agency UI confirms draft deletion and requires a withdrawal reason.
    The complete metadata array is re-read and written under the durable per-client
    `performance-reports` transaction, removing the stale whole-array replacement path. The focused
    publish→regenerate→republish→withdraw/delete regression plus route coordination assertions pass
    **4/4**. **Closed 2026-09-02:** on exact production build `H-vbnKm_hrkDkN8fgxwqF` served in
    isolation, Playwright Chromium drove generate → publish → regenerate → republish
    (superseded) → a second tab's publish racing a stale first-tab publish (409) → withdraw
    with a reason → draft delete, checked the agency history and the customer portal's
    Results page in a separate client-owner session after each step, reloaded both, and
    forced 503/409/malformed-JSON/wrong-identity-200 and rejected-fetch receipts that kept
    the draft and settled busy state, at 375×812, 390×844, 812×375, 768×1024, 1024×768, 1280×800 and 1920×1080 — 7/7 viewports clean. The route now
    validates the report id and property type up front and captures unexpected failures
    server-side behind the generic 500.

129. **✅ RESOLVED 2026-09-02 — Performance experiment evidence is validated, versioned and
    browser-accepted on an exact isolated build.** *(Originally: code/behaviour repaired
    2026-08-26; mounted browser acceptance remained.)* Creation is draft-only; variants require
    unique stable ids, safe whole-number counts and conversions no greater than visitors. Updates
    require the current optimistic version and follow draft→running→paused/complete transitions
    with coherent start/end timestamps. Completed counts are immutable; explicit Amend creates a
    new numbered draft with preserved ids and reset evidence, while only drafts can be deleted.
    Live-event aggregation now joins only the stable variant id. Direct invalid creation, stale
    update, complete/reopen refusal, amendment, retained evidence and delete proof pass **2/2**.
    **Closed 2026-09-02:** on exact production build `H-vbnKm_hrkDkN8fgxwqF` served in isolation,
    Playwright Chromium created a draft, edited it to running with manual evidence, posted
    live Aqua Tag events through `/api/telemetry/collect` and saw them join by experiment
    id and stable variant id after reload (11 of 102 → 10.8%), raced a stale second-tab
    edit into a 409, completed and amended (numbered revision-2 draft, source marked
    Amended), refused a forced delete and then deleted the amendment (source regained
    Amend), replayed a lost response after reload, and forced 500/400/rejected/malformed/
    wrong-identity receipts on save — at 375×812, 390×844, 812×375, 768×1024, 1024×768, 1280×800 and 1920×1080, 7/7 clean. The route classifies
    validation 400 / conflict 409 / not-found 404 / generic 500 through the shared
    Performance classifier, and the lookup plus client element gate run inside the
    refreshed transaction.

130. **Code/domain-behaviour repaired 2026-08-26; mounted provider acceptance remains — Aqua
    Advisor turns have a durable retry identity and atomic visible commit.** The composer creates
    one operation id and retains it across provider failure, unreadable/network response and
    reload. Under a durable per-user transaction, the server stores intent plus stable thread/
    message/memory ids and claims a bounded attempt lease without creating visible history. A
    successful answer is persisted as `provider-complete` before one atomic commit adds exactly one
    user/assistant pair and the deduplicated `remember...` memory; completion activity has the same
    idempotency key. Failed attempts retain no one-sided thread/memory, completed/provider-ready
    retries bypass provider generation, stale attempt results cannot overwrite the current answer,
    and deleting a thread cancels unfinished operations rather than resurrecting it. Reload restores
    the unfinished draft/id in the mounted composer. Dedicated failure/retry/replay/lease/cancel
    proof plus source contract passes **7/7**; widened Advisor/health proof passes **15/15**.
    Still required before full closure: force timeout/non-2xx/parse and storage/activity failures
    through the literal route and browser (first/existing thread, response loss and reload), and
    quantify the provider's unknown-outcome retry/cost behavior when no answer reached local
    persistence.

131. **✅ RESOLVED 2026-09-01 — Radar scheduling now matches its typed taxonomy and
    isolates app-wide probes from tenant sweeps.** Infra runs once per tick, Evidence has
    the declared schedule, one probe failure cannot suppress healthy tenant evidence, and
    overlapping/retried sweeps keep their idempotent boundary. Current focused proof covers
    zero/one/many agencies, call counts, declared-versus-delivered cadence, Infra failure,
    partial tenant failure and overlap; the Radar scheduler suite passes **8/8**, with the
    wider current data-contract run also green.

    _Original finding, retained for context:_ The taxonomy declared Evidence rollup hourly and Infra app-wide,
    and the ten-minute probe cron correctly runs Infra once before its per-agency loop. Evidence
    is actually invoked only by a manual full scan or the daily 06:00 `cron/inbox` path. That
    daily path calls `runRadarScheduledSweep()` for every active agency, while the helper itself
    runs `runRadarInfraSweep()` inside each tenant call. With N agencies this repeats the same
    database/storage round-trips N times; more importantly, one transient app-wide probe failure
    makes each tenant sweep return before building and recording its daily memory/evidence, with
    no scheduled retry until the next day. Existing source-contract tests pin the per-agency
    helper call but never assert call count, cadence or failure isolation. Split app-wide Infra
    from tenant Deep/Pulse/Evidence orchestration, give Evidence a real hourly (or honestly
    relabelled) schedule and make its rollup independent of a fresh Infra success. Add a fake-
    clock/call-count cron regression for zero/one/many agencies plus Infra failure, partial tenant
    failure, retry and overlap; require at most one Infra probe per tick and the intended evidence
    sample per healthy tenant.

132. **P1 CODE PARTLY RESOLVED 2026-09-01 — server error capture is mounted,
    readiness is capability-based and the cross-runtime probe no longer breaks the Next
    compile graph; a production client sink and live delivery proof remain.**
    `src/instrumentation.ts` now receives Next's request-error hook, derives request/tenant
    context and reports through `captureError()`. The capability probe refuses to report
    ready when a DSN exists without an installed SDK. Its SDK resolution no longer statically
    imports `node:module` or `node:path` into the instrumentation graph: it uses Node's guarded
    `process.getBuiltinModule()` resolver, while `observability.ts` no longer statically
    imports/re-exports that capability module. Both error boundaries also describe
    browser-only failures honestly. Focused observability/readiness proof passes **50/50**.
    A clean isolated webpack server now compiles `/dev`, Contacts, Settings and the client
    Editor without the former `UnhandledSchemeError`; the mounted pages have no browser
    warning/error log. The latest completed production webpack build also compiles, type-checks
    and generates **245/245** pages without the former scheme error or false
    `DYNAMIC_SERVER_USAGE` incident capture. Still required: installation and configuration of the chosen client capture sink,
    then a real production browser and API fault proving request/tenant context, delivery and
    flush/recovery.

    _Original finding, retained for context:_ `observability.ts` said `withApiObservability` records
    every API route and exposes `captureError()`, while `requestLog.ts` supplies the parallel
    request wrapper. Repository-wide caller searches found zero production callers of either
    wrapper or capture/log function outside their own definitions. `@sentry/nextjs` is also
    absent from both the installed dependency tree and package manifests, so setting a DSN
    makes the lazy import warn and return `null`. Despite that, `inspectProductionReadiness()`
    marks monitoring `ready` from the presence of `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` alone,
    and the global client boundary tells a user “We've logged the issue” after only
    `console.error`. The green observability smoke asserts helper source markers, not a mounted
    caller, dependency or captured event. Install and configure one real client/server capture
    path, instrument the global and route/server boundaries (or remove the claims), make
    readiness verify capability rather than an environment string, and prove a synthetic
    browser render error plus API exception reaches the configured sink with request/tenant
    context and flush behavior.

133. **CODE/BEHAVIOUR RESOLVED 2026-09-01; mounted all-role acceptance remains.**
    Account and the portal 404 now share the canonical role destination, including client,
    freelancer, lead and signed-out handling. Every role is rendered by the focused placement
    coverage, which passes within the combined **103/103** gate. Browser-prove profile/back,
    permissions guidance and a bad deep link for each role without a middleware bounce.

    _Original finding, retained for context:_ Shared account and portal escape navigation was not
    yet role-complete. Issue #92 corrected the agency-staff Account destination to `/portal/team`
    and removed owner/manager Settings links from both Account and Permissions; an isolated
    production browser proved those exact surfaces. Client owner/staff and freelancer routing
    still need one canonical role/client-aware destination, and the portal-wide 404 still offers
    only “Agency dashboard”. Centralise that resolver across Account, Permissions, Profile menu
    and 404 (including client id/slug where required), then browser-prove profile → back,
    permissions guidance and a bad deep link for every role without a middleware bounce.

134. **P2 CODE/BEHAVIOUR RESOLVED 2026-09-01; mounted install/revisit acceptance remains.**
    Support now exposes the same shared install guidance used by setup, so dismissing or leaving
    onboarding no longer removes the promised route back. One source owns iOS/manual and browser-
    prompt instructions, and the prompt lifecycle does not leave a spent install button active.
    The customer-setup suite passes **18/18**, including Support revisit and single-source guards.
    Still browser-prove iOS manual guidance, eligible accept/decline, close/reopen and installed mode.

    _Original finding, retained for context:_ The install scene said “You can do this later — it is in
    your portal under Support.” Repository-wide search found its Add-to-Home-Screen/install
    prompt and instructions only in `_CustomerSetup.tsx`; `SupportView` contains request,
    email, phone and WhatsApp contact options but no install help. The password POST marks
    `welcomeCompletedAt` before the install scene is seen or completed, and `/setup` redirects
    any completed user straight to `/portal/customer`. Closing the tab, declining the browser
    prompt or choosing “Go to my portal” therefore removes the only route back to the promised
    help. Persist welcome/password/install progress separately or keep install explicitly
    revisitable from Support/account, and make prompt dismissal/user-choice state honest.
    Browser-prove iOS manual instructions, Android/desktop prompt accept/decline, close/reopen
    after password save and later revisit from the promised portal destination.

135. **P1 CODE/BEHAVIOUR RESOLVED 2026-09-01; representative mounted keyboard acceptance
    remains.** Every current TSX file that declares `aria-modal="true"` now uses the shared
    `useFocusTrap()` contract. The hook owns forward/backward wrapping, outside-focus recovery,
    deliberate initial focus, stacked-dialog precedence, optional Escape and return focus.
    Repository inventory prevents a new modal from bypassing it. The focused modal contract
    passes **18/18** (within the combined 29/29 accessibility run). Still browser-walk representative
    nested, destructive and form dialogs before closing mounted acceptance.

    _Original finding, retained for context:_ The source contained 64 `aria-modal="true"` declarations across 50
    TSX files, but only three of those files use the existing `useFocusTrap()` hook. Forty-seven
    modal files have no focus containment or focus restoration; only four of those handle
    Escape, and `autoFocus` in 14 files moves focus initially without keeping it inside or
    returning it on close. Representative affected mounted surfaces include Task Templates,
    Actions/Calendar forms, New Client, Finance invoices/expenses, Agency HR, Marketing and
    multiple Dev Editor dialogs. The shared hook already traps Tab/Shift+Tab and restores the
    previously focused element, while `ConfirmDialog`, Mobile Navigation and the Enquiry detail
    card demonstrate the intended pattern. Consolidate true modals on one accessible dialog
    primitive (or consistently apply the hook), provide an accessible name and deliberate
    initial focus, handle Escape where dismissal is safe, restore focus, and prevent background
    interaction. Add a component-level keyboard contract plus a browser sweep that tabs forward/
    backward through representative nested, destructive and form dialogs.

136. **P2 CODE/BEHAVIOUR RESOLVED 2026-09-01; mounted assistive-technology acceptance
    remains.** The shared viewport loader exposes exactly one root `role="status"` with polite,
    atomic live copy; only decorative spinner/brand geometry is hidden. Agency and major route
    boundaries use the shared component; Visual Builder boot implements the same status, themed
    palette and curtain contract. Workspace/route scope, cinematic layering and reduced motion
    stay separate. The focused loader suite passes **7/7**. A mounted Editor boot showed the
    dark-blue loader beneath persistent client chrome, then the two-half curtain handoff without
    the hydration race or browser warnings/errors. Still verify actual screen-reader
    announcement/removal and focus continuity.

    _Original finding, retained for context:_ The old route-level portal loading boundary, `src/app/portal/agency/loading.tsx`, placed
    `aria-hidden` on its root and then nests its sole `role="status" aria-live="polite"`
    “Loading Command Centre…” message inside that hidden subtree. The visual skeleton appears,
    but a screen reader receives no progress status during the same potentially long route
    transition. Keep decorative skeleton geometry hidden separately, leave one named live status
    exposed, and verify it is announced once, removed when content resolves and does not leave
    focus stranded on navigation/retry.

    *2026-09-03 acceptance:* loader evidence re-taken on a fresh exact build (loader 2/2 within notepad 17/17, finance 16/16, layout 42/42, loader 2/2 (77/77, 0 missing), reduced motion included). Screen-reader announcement/removal/focus is still not driven by any gate.

137. **P2 — the UX smoke's three reported “viewports” do not exercise responsive or browser
    behaviour.** `smoke-ux.mjs` loops over 375, 768 and 1280, but the number is used only in a
    custom User-Agent string; every pass is an HTTP fetch of server HTML followed by substring
    checks for landmarks and error words. It never creates a browser viewport, applies CSS,
    evaluates client code, inspects overflow, tabs through controls, runs an accessibility tree
    check or observes console errors. It can therefore report three green widths for identical
    markup while responsive layout and interaction remain broken, and it does not detect the
    hidden loading status in #136. Keep the HTTP harness as a markup/route smoke but stop treating
    its labels as responsive evidence; add a real browser matrix at the three widths with keyboard,
    focus, overflow, loading/error and console assertions, and make that matrix part of the
    acceptance gate. The 2026-08-25 real-browser continuation supplies broad 375/768/1280
    render evidence and found an eight-pixel Freelancer desktop overflow. **✅ Concrete overflow
    resolved 2026-08-25:** the global canvas rule no longer overrides the shell's intentional
    width constraint, and the body overflow regression is browser-verified.

    **✅ RESOLVED 2026-08-31 — the gate exists, is repeatable, and is green.**
    `npm run browser:matrix` (`scripts/browser-matrix.mjs`) launches real Chromium over 13 pages ×
    17 viewports: the six required primaries, 320×568, 200% zoom on desktop and mobile, and both
    sides of every Tailwind breakpoint. Per page it measures document and `#main-content` overflow,
    walks the keyboard with focus-indicator checks, runs axe across wcag2a/aa + wcag21a/aa +
    best-practice, and reads the console and network logs. `smoke-ux.mjs` stays as markup smoke and
    its labels are no longer treated as responsive evidence.
    **`1,308 passed · 0 failed · 18 observations`**, from an opening 352 failures. Every
    observation is named dev-server recompilation and is downgraded only when the target proves
    itself a dev server through its own HMR socket — against a production target each one fails.
    Three structural safeguards make a green run mean something: a MISSING required check fails the
    run rather than being absent from it, `axeVerdict(null)` fails ("did not look" is not "found
    nothing"), and a page that never navigated fails its console and network checks rather than
    scoring an empty log as clean.
    **208 of the original 352 failures were the gate itself measuring wrong** — a 0.14s CSS
    transition sampled in the same task as the Tab press, a trap detector comparing description
    strings rather than node identity, an instrumentation attribute written into React-owned DOM,
    and the dev-server flag proven one page too late. All four fixed, each pinned by a test proven
    two-sided. See `CAMPAIGN-LEDGER.md`, which also corrects three earlier entries that reported
    those false failures as app defects.
    **Still out of scope, deliberately:** the walk visits pages without opening dialogs or menus,
    so modal containment and composite-widget keyboard models are untouched — that is #138. Keyboard
    ACTIVATION is not provable this way either. Evidence label: **local-browser**, not deployed-live.

    **Final production-target rerun — 2026-09-01.** Chromium **151.0.7922.34**
    completed every required check across the same 13 pages × 17 viewports:
    **1,326 required = 1,175 passed / 0 failed / 151 observations / 0 missing**.
    Every observation was an explicitly proven aborted speculative Next RSC prefetch:
    null status, `net::ERR_ABORTED`, same-origin non-navigation GET, exact `_rsc` query,
    `rsc: 1` and an explicit Next/purpose prefetch signal. Ordinary request failures
    remain failures. The separate Settings six-primary slice is **36/36** with none.
    Dialog/menu activation, screen-reader output, installability, forced errors, date
    boundaries and mutation journeys remain separate acceptance work.

    **Current production-target rerun — 2026-09-02.** The same Chromium version
    accounted for all **1,326** broad checks as **1,177 passed / 0 failed / 149
    observations / 0 missing**. The harness now bootstraps authentication once and
    reuses isolated storage state instead of consuming one login attempt per viewport;
    no application rate limit was weakened. The post-fix Settings run covers all 17
    viewports and accounts for **102 = 92 passed / 0 failed / 10 observations /
    0 missing**. Every observation retains the exact speculative-RSC proof above.

138. **P2 CODE/BEHAVIOUR RESOLVED 2026-09-01; representative mounted keyboard acceptance
    remains.** Specialised roles now either implement the promised shared keyboard model or were
    replaced with honest native navigation carrying `aria-current`. Every current tab, menu and
    listbox role is inventory-guarded; arrow/Home/End, Escape/return-focus and reachable options
    are covered by the shared contracts. The composite-widget suite passes **23/23**. Still
    browser-walk Settings, People, file tabs, Profile/Company menus and the page picker.

    _Original finding, retained for context:_ All 12 TSX files containing `role="tablist"` left every
    tab in the ordinary Tab order, provide no tab-specific arrow/Home/End handling and render no
    associated `tabpanel`; Settings additionally points `aria-controls` at `settings-pane-*` ids
    that do not exist. Nine non-archived `role="menu"` components likewise have no arrow-key,
    Home/End or roving-tabindex behavior, and the Website Editor page-picker declares a listbox/
    options without either active-descendant or item-focus navigation. Native buttons/links remain
    reachable one by one, so this is not a total keyboard lockout, but assistive technology is told
    to expect composite-widget behavior that is absent and long sets require excessive repeated
    Tab presses. `useArrowNav()` already implements part of the roving pattern but has zero
    production callers. Either remove the specialised roles and keep honest native controls, or
    adopt a shared tabs/menu/listbox primitive with selected/current focus, arrow/Home/End,
    activation, Escape/return-focus and real controlled panel relationships. Component-test each
    primitive and browser-walk Settings, People, file tabs, Profile/Company menus and page picker.

139. **P1 CODE/BEHAVIOUR RESOLVED 2026-09-01; mounted accessibility-tree acceptance
    remains.** The named internal action, modal-close, Automation-row, Command-region and
    published-form families now expose stable contextual names; placeholders are not accepted as
    labels, decorative icons stay hidden, and published status/error changes are announced. The
    inventory guard proves the owned workspaces contain no unnamed icon-only action and passes
    **11/11**. Still inspect the mounted accessibility tree on representative Team, Development,
    Automation, modal and published-form journeys.

    _Original finding, retained for context:_ A conservative AST pass returned 23 icon/toggle-only button candidates;
    after excluding an intentionally hidden control and manually checking context, at least 13
    visible mounted actions are definitely unnamed. They include Team add-task, task-completion
    and add-note buttons; People onboarding move-up/down; Development reveal/copy-password;
    Automation run-detail close; and close buttons in Company, Legal, SOP and Actions dialogs.
    Separately, the published Contact form's name/email/phone/message fields, Booking's four
    customer-detail fields, Newsletter email, Product Search and custom Donation amount have no
    label, `aria-label` or `aria-labelledby`; placeholder text is their only prompt and disappears
    during entry. Three Command Intelligence sections also reference `aria-labelledby` ids that
    are never rendered, so those regions lose their intended “Decision compass”, “Demand flow”
    and “Highest-signal KPIs” names. Automation Run History compounds the class by making the
    table row's mouse `onClick` the only way to open detail; the trailing ellipsis is not a button
    and the row is neither focusable nor keyboard-activated. A screen reader therefore announces
    generic “button”/“edit” controls or unnamed regions, and a keyboard user cannot open that
    run detail, on central work and conversion journeys.
    Require visible
    `<label>`/`htmlFor` or an equivalent stable accessible name for every input and icon action,
    include state/row context where the action repeats, mark decorative icons hidden and expose
    validation/status changes. Add an AST lint/inventory guard plus browser accessibility-tree and
    screen-reader-name checks on Team, Development, modal close controls and representative
    published forms. The 2026-08-25 browser continuation also found the shared Account avatar
    input unnamed. **✅ Avatar slice resolved 2026-08-25:** the shared `AvatarUploader` now exposes
    `aria-label="Upload profile photo"`, browser-verified on owner Account. The other internal and
    published controls above remain open.

140. **P1 code/domain-behaviour repaired — mounted browser acceptance remains for date-only
    business records.** One explicit `Europe/London` calendar contract now converts instants,
    preserves valid `YYYY-MM-DD` records losslessly, rejects impossible dates and adds whole
    calendar days without treating 23/25-hour DST days as 24 hours. New Client plus lead/contact
    conversion, client and agency expenses, Finance income/invoice/payment/commercial plans,
    Leads commercial packs, HR staff records, People today/month and shared date-input reads use
    it. UTC provider windows and export filename stamps remain explicitly UTC. Focused midnight,
    both-DST, remote-zone, payment-term and save/reload/export proof passes **5/5**; affected
    People/Finance/HR coverage passes **56/56**, adjacent client-plan/Leads coverage **61/61** and
    TypeScript passes. Browser-save each representative form around a controlled boundary and
    reload/export it before calling the mounted acceptance complete.

141. **P2 CODE/BEHAVIOUR RESOLVED 2026-09-01; production root-fault acceptance remains.**
    `src/app/global-error.tsx` now owns the required self-contained `html`/`body`, carries the
    digest, offers retry plus a hard document escape, and does not depend on a possibly failed
    layout/style/provider. The segment boundary no longer claims to be global, and both surfaces
    make only truthful reporting claims. The current observability suite proves the convention and
    recovery wiring. Still fault both a child segment and root-layout initialization in a
    production browser, then verify fallback selection, capture and successful recovery.

    _Original finding, retained for context:_ `src/app/error.tsx` called itself the top-level boundary, but the project had no
    `src/app/global-error.tsx`. The installed Next 16.3 loader explicitly chooses its built-in
    global-error module when that convention file is absent, so a root-layout/App Router failure
    bypasses Aqua's branded Try again/homepage screen and any future capture added only there.
    This was distinct from #132's then-unmounted monitoring: even after a sink is installed,
    root failures remain outside the claimed boundary unless the real global fallback participates.
    Add a valid client `global-error.tsx` that owns its required `html`/`body`, reports through the
    same proven capture path and offers safe reload/back recovery; keep route-segment recovery
    appropriately scoped. Fault both a child segment and root-layout initialization in a production
    browser build and verify the correct fallback, one captured event and a successful recovery.

142. **P2 CODE/ASSET RESOLVED 2026-09-01; mounted PWA lifecycle acceptance remains.**
    The manifest now serves genuine 192×192 and 512×512 `any` plus safe-zone-tested maskable PNGs,
    and the setup prompt tracks one-use, dismissed and already-installed states without leaving a
    spent action enabled. The customer-setup suite passes **18/18**, including dimensions, opaque
    maskable background and safe-zone checks. Still validate the served manifest and eligible,
    dismissed, accepted, installed and ineligible flows in Chromium under installable conditions.

    _Original finding, retained for context:_ Customer setup listened for `beforeinstallprompt` and showed its real “Install the
    app” button only after receiving that event. The live manifest on port 3032 declares 192,
    180 and 32 pixel icons; the repository has no 512 pixel icon, and the referenced 192 asset is
    genuinely 192×192. [Current Chromium install criteria](https://web.dev/articles/install-criteria)
    require both 192px and 512px icons before the browser fires `beforeinstallprompt` and shows
    install promotion. Chromium users therefore remain on fallback instructions even after the
    engagement/HTTPS conditions are met, while `smoke-customer-setup.test.ts` passes because it
    asserts only `standalone`, the start URL and the word `maskable`. Add a genuine safe-zone-tested
    512 icon (and keep the 192 fallback), validate the served manifest in Chromium, await and clear
    the one-use prompt/result, and browser-prove eligible, dismissed, accepted, already-installed
    and ineligible states. Issue #134 still separately tracks making that help revisitable.

143. **P2 CODE/SSR-BEHAVIOUR RESOLVED 2026-09-01; mounted navigation acceptance remains.**
    Share Buttons and automatic Breadcrumb no longer branch on `window` during render. Their server
    and first client trees are byte-identical; pending share targets are visibly/semantically inert,
    explicit targets remain window-independent, and post-hydration path derivation is isolated.
    The focused block-library suite passes **50/50**, including both documented default modes.
    Still browser-prove post-hydration current-path/social/copy behavior across navigation with zero
    recoverable hydration warnings.

    _Original finding, retained for context:_ Share Buttons documented a blank URL as
    “current page,” but its server render encodes an empty target into Twitter, LinkedIn and
    Facebook links; the first browser render uses `window.location.href`. A real static render
    of the default block produced `twitter...?url=`, `linkedin...?url=` and `facebook...?u=`.
    React 19's installed hydration runtime explicitly says attributes from a server/client branch
    such as `typeof window !== "undefined"` “won't be patched up,” so those anchors can retain the
    empty target even though Copy Link's client handler sees the browser URL. Auto Breadcrumb uses
    the same render-time branch more visibly: it returns `null` on the server, then a complete nav
    on the first client render. The R017 smoke stays green because it supplies explicit breadcrumb
    items and an explicit share URL, never exercising either documented default. Pass the request
    URL/path into published block context or defer both derived values through a hydration-stable
    placeholder/effect without leaving stale interactive attributes. Add server→hydrate tests for
    default and explicit modes, zero recoverable hydration errors and working social/copy/current-
    path behavior after navigation.

144. **P2 CODE/PROVIDER-BEHAVIOUR RESOLVED 2026-09-01; mounted playback acceptance remains.**
    One `privateMediaResponse()` contract now validates single byte ranges and emits exact
    `200`/`206`/`416`, `Accept-Ranges`, `Content-Range` and `Content-Length` behavior. Local reads
    open only the requested file window; Supabase forwards a range; Vercel passes through a proven
    partial stream or slices an ignored-range stream without buffering the whole object. All private
    media routes use it. The focused provider/range suite passes **8/8**. Still browser-prove metadata
    load, immediate playback and seeking for inbox, call and large SOP media.

    _Original finding, retained for context:_ The call-recording and inbox attachment views mounted
    `<audio controls preload="metadata">`, while uploads accept 100 MB call recordings and 20 MB
    inbox media. Their content routes never read `Range`, never return `206 Partial Content`, and
    never emit `Accept-Ranges` or `Content-Range`; `readInboxMedia()` additionally converts the
    complete Vercel stream into a `Blob`, while Supabase/local paths also materialise the complete
    object. The SOP route has the same all-or-nothing contract for training media accepted up to
    250 MB. Current smoke tests assert that upload/storage/token source markers exist but do not
    make a range request or exercise playback. Add one shared provider-aware private-media
    response contract: validate a single byte range, return exact `206` headers/body (and `416`
    for unsatisfiable ranges), preserve normal full responses and avoid buffering remote objects
    when streaming is possible. Exercise start/middle/end/open-ended/invalid ranges against local,
    Supabase and Vercel adapters, then browser-prove metadata load, immediate playback and seeking
    for inbox voice notes, call recordings and large SOP media without downloading the whole file.

145. **P1 CODE/BEHAVIOUR RESOLVED 2026-09-01; mounted cross-browser acceptance remains.**
    A shared recorder lifecycle negotiates Opus WebM, plain WebM, MP4 and browser-default in order;
    derives the upload type/extension from the actual recorder; distinguishes capability,
    permission, device, constructor and start failures; and always releases acquired tracks when
    start cannot complete. Website voice notes, both Unified Inbox composers and recorded calls use
    the same contract. The focused lifecycle suite passes **10/10**. Still browser-test real WebM,
    MP4/default and unsupported environments plus call compensation through upload/navigation faults.

    _Original finding, retained for context:_ `_EnquiryCommunications` and both
    Unified Inbox composers test only `audio/webm;codecs=opus`; when false they still force
    `audio/webm` instead of testing it, trying MP4 or allowing the browser to select a format.
    The [MediaRecorder constructor contract](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/MediaRecorder)
    permits `NotSupportedError` for an unsupported requested MIME, while
    [WebKit's own guidance](https://webkit.org/blog/11353/mediarecorder-api/) explicitly requires
    format feature detection and documents MP4 as the older Safari recording format. Ordinary
    voice-note construction failures are mislabeled as denied microphone permission and do not
    stop the stream obtained immediately beforehand. The recorded-call path is worse: it obtains
    the stream, POSTs and persists the active call, then calls `startRecorder()` outside any
    recovery boundary. A constructor/start failure skips `setBusy(false)`, leaves the call active
    and does not stop the tracks. All produced files are also named `.webm` even when the actual
    recorder MIME should drive the extension. Centralise capability negotiation and recorder
    lifecycle, distinguish unsupported/permission/device/runtime errors, and guarantee stream/
    recorder/call compensation on constructor, start, API, upload, stop, navigation and unmount
    failures. Component/browser-test WebM Opus, plain WebM, MP4, browser-default and no-supported-
    recorder branches across website, social and client threads plus recorded calls.

146. **Code/service-behaviour repaired 2026-08-26; mounted clock/browser acceptance remains —
    published relative Countdown Timer deadlines are stable.** A dependency-free deadline helper
    validates all documented units and writes hidden relative-source plus absolute-deadline props.
    `createBlock()`, page create/update and both publication paths stabilise recursively; unchanged
    targets retain their deadline, a changed target resets it once at save/publish, and legacy
    published/draft reads derive a deterministic deadline from stored `publishedAt`/`updatedAt`
    rather than visitor time. Absolute targets remain absolute; blank/malformed targets expire
    instead of receiving a moving invented day. The client component no longer reads `Date.now()`
    during render: server and first client render the same inert cells, then one effect owns the
    clock and one-mount fallback for an unpersisted legacy preview. Unit/page-store proof covers
    days/hours/minutes, decrement/expiry, absolute/invalid, nested idempotence, edit, publish and
    legacy reload: **5/5**; draft/publish compatibility is **25/25** and the full Website Editor
    gate passes **49/49 files**. Still required for full
    closure: mount the actual effect with a fake clock across rerender/remount and browser-prove a
    published relative timer reaches `expiredText` with zero hydration warnings.

147. **P1 acceptance residue — Team Chat and notification response ordering are repaired in
    code; mounted deferred-response proof remains.** Team Chat now keeps explicit selection,
    load, poll and send generations, so an older channel response cannot replace the current
    recipient. Notification attention now generation-checks refreshes, coordinates mutations per
    alert, merges only the response's target alert, rebases pending optimistic actions and exposes
    busy state independently for every alert. A failed action recomputes only its own alert from
    its confirmed base instead of restoring a captured whole array; an older same-alert response
    cannot overwrite newer intent. The dedicated pure coordinator matrix deliberately reverses
    refreshes, refresh-versus-PATCH, independent actions, same-alert actions, failures and prop
    rebases: **8/8**. The full attention/People gate passes **80/80**, and TypeScript is
    clean. This is not yet mounted acceptance: component-test both real providers with deferred
    fetches, then browser-prove rapid channel switching cannot change the recipient and overlapping
    notification actions cannot resurrect resolved attention.

    *2026-09-03 acceptance:* `browser-chat-notification-order.mjs` (commit bb6119a) re-run against the integrated build on its own lane (3202): stories 22/22; matrix 72 passed / 0 failed / 9 evidenced observations of 81 at seven viewports. Seed caveat, not a defect: with a richer seed (two clients → check-in and setup alerts) the Attention Shield's five-item window holds the sixth alert, so the gate's task alert never reaches Attention; give it its minimal seed.

148. **P1 acceptance residue — the named storage/provider calls are bounded; mounted and live-
    provider recovery is not yet accepted.** One shared operation primitive now gives storage
    reads/writes and provider reads/writes explicit budgets, composes request cancellation, aborts
    the adapter and still settles when an adapter ignores its signal. Supabase load/save/patch and
    Editor AI RPC, Twilio message/call, Resend email, Vercel domain, Leads Pipeline Stripe and
    Shopify now use it. Typed failures distinguish safe read retry, same-operation-key retry for
    idempotent writes and reconcile-first recovery for an unknown non-idempotent outcome. Resend
    and Stripe carry durable keys; Vercel delete treats an already-absent domain as success;
    Supabase keyed patches/RPCs retain same-key recovery while stale full-state replay is correctly
    reconcile-first; Twilio sends and Shopify cart mutations refuse blind retry. Shared deadline
    proof passes **7/7**, provider stall/abort/late-accept/key proof **7/7**, the focused provider
    foundation **37/37**, remote storage plus Editor AI **7 passed / 1 live-Postgres skip**, and the
    widened route/provider gate **169 passed / 1 skipped**; TypeScript is clean. Still mount every
    real caller with a never-settling/late provider and
    browser-prove busy state exits with the typed recovery action. Then run real Supabase and
    provider acceptance/reconciliation; no live provider or port-3032 mutation was performed.

149. **Code/behaviour resolved 2026-08-26; mounted browser acceptance remains.** The product
    decision is to hide Bookings until Aqua has a real booking lifecycle. Account activity now
    comes from an explicit operational-capability contract resolved on the server from the
    first-party registry and exact-client enabled installs. Ecommerce can expose Orders;
    Bookings is non-operational and absent even if stale state claims a registered and enabled
    `bookings` install. The legacy direct URL remains as an honest “not available yet” card rather
    than fabricating an enabled system. Capability and stale-install proof passes **4/4**, the
    focused nav assertions **2/2**, surrounding customer/plugin-host checks **34/34**, and
    TypeScript is clean. Browser-prove an ordinary customer with no ecommerce sees no Account
    activity section, an ecommerce customer sees Orders only, and direct `/bookings` remains
    honest. A future booking lifecycle must flip the operational contract only with real
    create/reschedule/cancel, failure/retry, reload and cross-account acceptance.

150. **Code/behaviour resolved 2026-08-26; mounted visual acceptance remains.** There were no
    additional conversation outcomes behind “More conversation actions,” so the enabled ellipsis
    was removed rather than replaced with a decorative menu. Assign and Close/Reopen remain native
    buttons backed by the real conversation PATCH path; their pointer, Enter and Space behavior
    follows the native control contract. The dedicated absence/action regression passes **2/2**,
    the focused header/reply/search set **15/15**, the wider Inbox/Search gate **53/53**, and
    TypeScript is clean. Browser-open an active social conversation once to confirm only the two
    operational header actions remain at desktop/mobile widths and focus order is unchanged. Any
    future overflow menu must ship only with explicit checked outcomes, visible refusal/retry,
    Escape/focus return and pointer/keyboard acceptance.

151. **✅ RESOLVED 2026-08-27 for bounded local live-file navigation and isolated production
    runtime.** The generation-safe readers retain explicit freshness/invalidation and `.next-*`
    exclusion; every dev entry still refuses startup below 2 GiB without deleting anything. Home
    no longer enters `scanWorkerSignals()` recursively through roadmap/task construction. Library
    scans only the 20 canonical documents, dynamically loads just the selected query view and does
    not prefetch sibling views. Logs streams before the scanner/edit-ledger graph and uses one
    compact, exact-count, coalesced snapshot. Library measured **4.428→3.290s cold / 146→142ms
    warm**. Logs measured **3.182→0.857s first**, **2.702→0.868s post-TTL** and later
    **109ms TTFB / 252ms total** warm; its eager graph fell **47 modules / 469,232 bytes → 3 /
    15,433**. The canonical Library and Logs scans measured **67.6→1.0ms** and
    **95.4→38.5ms**. In the isolated production benchmark, Library was **693.0/26.4ms** and Logs
    **741.0/29.0ms** fresh-process first/repeat-max, both 200 and inside payload/time budgets.
    Browser evidence has settled Library/Logs at 1280px and Logs at 390px without overflow.
    Deployed geo/CDN/provider latency remains an operational measurement, not an unresolved
    live-file indexing defect. The separate `scan=1` replay tradeoff is tracked as #186.

    **Current isolated measurement — 2026-09-02.** A fresh-process-per-route run
    measured Library **803.6/30.4ms** and Logs **892.8/30.7ms** first/repeat-max,
    with all responses 200 and failure lists empty. A separate fresh cacheless,
    service-worker-blocked Chromium context per station passed **8/8** first-load
    transfer probes: Day was **674,535B** of JS/CSS and the largest extra station
    boundary was Calendar/Actions at **42,174B** above Day. These are transfer bytes,
    not execution or paint budgets. Build/host caches remained shared and real
    provider/deployed geography timings remain outside this local evidence.

152. **Code/behaviour resolved 2026-08-26; mounted console acceptance remains.** The old clean-
    browser evidence remains the reproduction: a nonexistent client Website Editor deep link
    rendered the intended 404 but React rejected raw script elements during the client render. The
    root colour-mode and sidebar-collapse bootstraps now use uniquely identified Next 16.3
    `Script strategy="beforeInteractive"` components in `<head>`; no raw script or
    `dangerouslySetInnerHTML` remains in the root layout. Their synchronous storage behavior is
    unchanged, and the absent-client guard still aborts before ThemeInjector, Sidebar, Topbar or
    preview code is constructed. Dedicated proof passes **4/4**, focused bootstrap/theme/sidebar
    proof **23/23**, the wider client/navigation/editor-layout gate **125/125**, TypeScript and a
    later complete **245/245** production build pass. Browser-prove direct load and client
    navigation between valid, missing-client/editor and generic-404 controls with zero script/
    hydration console errors and unchanged colour/sidebar state before closing the mounted residue.
    Port 3032 and its build directory were untouched.

153. **✅ RESOLVED 2026-08-25 — Website Editor client pages no longer receive
    server-only function-bearing ports.** Plugin page metadata now identifies client
    components and the shared catch-all branches before constructing/spreading
    server services or storage. All eleven formerly failing management routes—pages,
    page detail, portals, customise, sites, themes, theme detail, sections, assets,
    popups and git status—were browser-rendered through their real manifest paths
    without the plugin error boundary. Separate operational defects inside some
    controls remain under #28 and related Website Editor issues; the RSC boundary
    crash itself is closed.

154. **✅ RESOLVED 2026-08-26 — the Sandbox compiler contract no longer makes
    `smoke:all` deterministically contradict itself.** `dev:sandbox` intentionally uses its
    isolated Turbopack output, while `dev:sandbox:webpack` and `dev:sandbox:real` remain explicit
    isolated Webpack fallbacks. Sandbox protection now asserts that same contract instead of
    requiring Webpack while the bundler test required Turbopack. The settled relevant gate includes
    **12/12** Sandbox environment/protection checks; the full repository suite was not rerun.

155. **✅ RESOLVED 2026-08-26 — Fulfilment client list/create is no longer auth-only.**
    `GET /api/portal/fulfillment/clients` requires `fulfilment.services.view`; `POST` requires
    `fulfilment.services.manage`; both derive the resource agency from the canonical current actor.
    A signed client role can no longer list every agency client or create one merely by holding a
    session. Focused/adjacent access proof is part of the final **130/130** relevant gate.

156. **✅ RESOLVED 2026-08-26 — hidden Staff elements no longer receive the complete
    People graph.** Agency People page/API responses are projected by the exact visible Staff
    element. Identities, directory, cards and organisation data require `staff.people`; schedule,
    training, pay and access receive minimal matching projections; Capacity retains its explicit
    stable `staff.people` dependency. Hidden Overview/Capacity cards do not keep dead links into
    hidden tabs. The clean browser loaded People Capacity at 390px without overflow or alert.

157. **✅ RESOLVED 2026-08-26 — the access manager no longer advertises an inert generic
    Development workspace scope.** Development capabilities are exact-project capabilities, so
    the unsupported workspace choice was removed while real project scopes remain. Exact Staff
    and Fulfilment choices now filter by workspace id, prune stale selections when scope changes
    and sanitise grant/request/review payloads again at submit time. Exact-scope proof passes
    **11/11**.

158. **✅ RESOLVED 2026-08-26 — governed client/end-customer collaboration actions enforce
    canonical client elements.** Contracts use Commercial, file reads/writes use Files, requests
    use Communications and project briefs use Record, on top of their existing relationship,
    role and action ceilings. Entirely ungoverned identities retain the documented compatibility
    fallback during migration; governed users cannot use it to bypass a hidden element. The stale
    source-regex smoke was reconciled to the real `client.communications.use` boundary.

159. **✅ RESOLVED 2026-08-26 — exact workspace scopes expose only their own element
    families.** On a clean restarted Turbopack browser, Staff rendered six base Workspace plus six
    Staff keys and zero Fulfilment/Development keys; Fulfilment rendered six base Workspace plus
    five Fulfilment keys and zero Staff/Development keys. At 390px the selector was 2×2 with 44px
    targets and no overflow. The Role template composer exposed Agency/Workspace/Client/Project,
    Live/Sandbox and all 28 stable groups; `staff.pay` Hidden→View was restored without submit, so
    no role/grant persistence is claimed. The warning/error log was empty.

160. **✅ RESOLVED 2026-08-26 — `/dev` cannot inherit an old Sandbox realm when minting the
    local owner session.** Provisioning and session minting now explicitly use the live realm.
    Focused **32/32** proves access templates/grants/requests remain 200 after an access-revision
    change, while a session-revision rotation returns `401 stale_session`. This fixes the local
    entry bug; it does not close application-wide legacy `requireRole()` revocation issue #22.

161. **✅ RESOLVED 2026-08-27 — module-global performance caches no longer cross realms or
    preserve hidden Search families after access changes.** Portal Search captures the active
    realm before awaiting candidate builders and keys its 15-second cache by realm, agency,
    identity, role/client, `accessRev` and an effective workspace/client element fingerprint.
    Candidate families are filtered before indexing, so restricted Staff cannot discover hidden
    Finance, People, contact, message or Radar results; owners and deliberately ungoverned legacy
    identities retain their compatibility behavior. Dev Console core/status caches are realm-keyed
    slots with explicit current-realm/all-realm invalidation. Radar result and raw-source caches
    follow the same rule. Deterministic live→empty/demo→live regressions use identical agency/user
    ids and prove distinct clients, contacts, messages, finance, Radar candidates and Dev Console
    titles/counts/findings/blockers; access revocation changes the Search key immediately. Every
    new module-global data cache must preserve this realm/access rule.

186. **✅ RESOLVED 2026-09-01 — Radar station navigation carries one bounded,
    non-replayable result.** The expensive Radar/KPI graph has one authenticated,
    same-origin, CSRF-protected POST execution door; legacy `scan=1` GETs are inert.
    Issuance requires `workspace.overview.use` and consumption separately requires
    `.view`. The POST returns only an opaque UUID. Supabase/Postgres persist one
    short-lived sidecar row per hashed realm/agency/user principal, with a matching
    local/test repository; realm, agency, user, session revision and access revision
    must all match. A newer result replaces the old handle without capacity eviction,
    and the two-minute TTL starts only after heavy computation finishes.

    GET/RSC reads never rerun the graph. Missing, expired, mismatched and provider-
    unavailable results render one consistent paused state, so stale full Radar/KPI
    evidence cannot remain under paused chrome. Day→Battle retains the same handle and
    Next history state. Focused behavior passes **24/24**, widened command/app-route/
    Next coverage passes **54/54**, and TypeScript is clean. Mounted desktop and
    **375×812** acceptance observed exactly one scan POST, the same handle across
    Day→Battle, a bogus-handle fail-closed state with no stale critical totals, and an
    empty browser warning/error log. Deployed geography/CDN/provider timing remains a
    separate operational measurement, not unfinished result-handle behavior.

## 🔴 Website editor — dead visitor surfaces (2026-08-27)

**#183 — CODE/BEHAVIOUR RESOLVED 2026-09-01; mounted tenant/browser acceptance
remains.** The editor route now resolves enabled plugin IDs from
`services.pluginInstalls.listInstalledFor()` for the exact agency/client scope,
filters disabled records, deduplicates and sorts the serialisable IDs, then threads
them into both creation surfaces. `Sidebar` and `BlockCatalog` share the same
`listAvailableBlockDefinitions()` gate, whose empty/default state is deliberately
restrictive. Existing saved blocks are not filtered from page rendering, so disabling
a plugin hides new palette offerings without deleting existing content. Focused proof
passes **4/4**: three selector/render assertions cover hidden and enabled Ecommerce
blocks across both palettes, and one store assertion pins enabled-only exact-scope
resolution. The seeded Ecommerce-enabled tenant is also mounted in a real client
editor: the Commerce palette renders and the browser log remains clean.

Still required: mount the Ecommerce-disabled comparison scope and browser-prove the
palette difference, then disable Ecommerce and prove an existing
saved block still renders and survives reload. A failed install-state provider read
must also be accepted as a closed/unavailable editor state rather than exposing
plugin-backed blocks.

_Original finding, retained for context:_ `BlockDefinition.requiresPlugin` exists in
`src/engines/editor/elements/definition.ts:125`, and twelve Ecommerce blocks set it.
Before this repair `listBlockDefinitions()` handed the palette everything and the
palette filtered only on the search box, so a block declaring
`requiresPlugin: "ecommerce"` was offered whether or not Ecommerce was installed.
That is how `product-search` reached this audit: its declaration was correct, but its
creation surface ignored it while its endpoint required a session the visitor did not
have. `BLOCK_BACKEND_GAPS` treated that symptom; the tenant install gate now fixes the
palette contract itself.

**#184 — PARTLY RESOLVED 2026-09-02: consent-aware contact capture and published
Blog summaries/detail now have narrow visitor backends; the wider absent-module class remains.**

Website Editor now exposes an exact enabled-install `visitor/contact` command and
allowlisted published-blog summary/detail reads. Contact capture requires a versioned DTO,
affirmative versioned consent, a registered origin and a live site/published page/contact
block. The exact displayed consent statement is digest-bound to the accepted version and
submission, preventing valid-version replay against changed wording. It stores one atomic
operation/receipt record, keeps contact PII single-copy, hashes
replay and abuse-control identities, rate-limits per visitor and install, and returns no
operator data. The authenticated contact-submission read remains private. The contact UI
accepts only a parsed success receipt and neither it nor Blog calls a live facade from
the editor or a draft preview. The feed DTO contains summaries only; the detail DTO
adds exactly one published body without internal ids, draft state or tenant metadata.
Blog Post renders through the host child-renderer contract rather than a raw JSON dump.
Focused public-boundary/snapshot proof passes **13/13** and Website Editor passes
**49/49 files**.

This is not full visitor-module closure. Contact submissions still need their intended
operator inbox/notification workflow and a real anonymous custom-domain/live-backend walk.
Forms, Reservations, Newsletter and Themes remain absent product modules; they must be
implemented with their own public DTOs or removed/labelled rather than routed through an
operator endpoint.

_Original finding, retained for the remaining scope:_ `/api/portal/forms/*`,
`/reservations/*`, `/newsletter/*` and `/themes/*` had no module behind them.

Not "absent paths" in the sense of a typo — there is no `forms`, `reservations`,
`newsletter` or `themes` module in `src/built-ins/modules` at all, so nothing can
install them. Verified live: every one answers 401 anonymously and **404 with an
owner session**, which is the tell — the 401 is the dispatcher's auth gate firing
before the 404, so an anonymous probe alone would have made these look like a
permissions problem.

The still-absent modules are fenced by `lib/blockBackends.ts` plus its smoke so a
template cannot silently seed an unusable control. Contact, Blog Feed and Blog Post have now been
removed from that dead-backend inventory because their dedicated visitor facades exist.

*2026-09-03 acceptance:* newsletter facade browser-proven (see #28 note); operator inbox connection and the Forms/Reservations/Themes promises remain.

**#185 — PARTLY RESOLVED 2026-09-02: sixteen routes are deliberately public, but
visitor-safe operations still need classification one command at a time.**

The seven original webhook/funnel routes were later joined by Ecommerce's public Stripe
webhook, five allowlisted storefront operations and now three Website Editor visitor
facades. Public catalogue/detail,
quote/checkout/receipt, contact capture and blog summaries/detail therefore no longer depend on a
portal session. Each route is an explicit public declaration with a narrow DTO; no generic
operator route was widened; the Contact facade additionally binds the accepted consent
version to the digest of the exact displayed statement. The executable registry now pins **342 total / 145
undeclared / 16 public routes**; focused route/visitor checks are green. The
rest of the inventory remains intentionally closed until it
has the same scope, rate-limit, redaction, consent and durable-side-effect proof.

_Original finding, retained for context:_ the earlier prose audit reported nine routes,
but the later executable registry baseline corrected the pre-storefront set to seven.

`[module]/[...rest]/route.ts` calls `requireSession()` unless the resolved route
sets `public: true`. The current sixteen are the exact webhook/funnel/storefront/
visitor allowlist above. Every other module route therefore requires a
session, which is correct for the portal and is the whole problem for a
published website, where the visitor has none. Worth knowing before anybody
"fixes" a visitor-facing 401 by widening a route: `plans` is arguably fine
public, `me/subscribe` absolutely is not.

*2026-09-03 acceptance:* the public `visitor/newsletter` route is the seventeenth classified public route and its refusals (400/403/409, honeypot) are browser-proven; anonymous operator reads are refused.

## ⚪ Known / by-design (don't mistake for bugs)

> ⚠ **Numbering note (2026-08-20):** this section historically restarted at `8`,
> colliding with the freelancer item `#8` above. The collision is preserved
> because `status.md` and `todo.md` link to both — **`issues #8` means the
> freelancer item**; the duplication entry below is now **`8-dup`**.

8-dup. **Confirmed duplication** — the full list is in [hazards-and-duplication.md](../workspace/hazards-and-duplication.md): the `fulfilment`/`fulfillment` three-spelling split, two contacts systems, two inbox surfaces, drift-prone `lib/` vs `lib/server/` twins, dead `editing/adapters.ts`, alias routes.
9. **Radar watchdog `correlation-engine` check is a hardcoded `pass`** — a nominal execution marker, does no real assertion (the one genuine placeholder in the Radar engine). (See [radar.md §12](../workspace/radar.md).)
9b. **Radar `systems:storage-activity` is mislabeled + no real DB/storage health** — ✅ **RESOLVED 2026-08-20 (source-verified).** Both halves are closed. **(a)** The check now **says what it is**: `lib/server/radarObservations.ts:360` labels it "Recorded workspace activity rows (**write-volume proxy** — real DB/storage health rides the Infra sweep)". **(b)** Real database + storage health now exists and is surfaced — `lib/radarInfraChecks.ts` (the Infra sweep) plus the `_InfraHealthPanel.tsx` card ("Database & storage health", radar-upgrade Stage 4 Part D §3), which shows real connectivity/latency with tone bands (`:21-24`) and **renders an un-probed backend as "untested", never a fake green** (`:5-8`, `:43`). ⚪ The residual by-design point stands: the `storage-activity` **number** is still a write-volume proxy, so don't read it as bytes stored.
10. **MFA is built but not wired into login** — ✅ **RESOLVED 2026-08-20; ALL FOUR PHASES BUILT.** This was the most expensive stale claim in the tree: an audit correctly caught MFA absent, then the claim outlived the fix. MFA now gates password sign-in, stamps and re-checks session assurance, makes magic-link/OAuth doors fail closed for enrolled accounts, and supplies ten single-use recovery codes; the login form carries the real code step. Honest residuals are not unfinished MFA phases: signup-session assurance sits outside this plan's route map, recovery codes are shown at first gated sign-in rather than enrolment, and Ed still needs to confirm backup codes versus owner reset. See [mfa-login](plans/mfa-login.md) and its runtime smoke evidence.
11. **Meta/Instagram inbox** — full pipeline built, switched off (no creds).
12. **Dev/demo sessions load ZERO website enquiries** (`inbox/page.tsx`: `session.isDemo ? []`) — so the enquiry-delete button and master-tag ingestion only show in a *real* (non-demo) inbox. Not a bug.

## 🔴 Live-data hazard (operational, always applies)
13. **Live Supabase is not sandboxed.** `PORTAL_BACKEND=file` guards the local state file only; the admin client hits the *real* auth/enquiry project even in dev. The env safety classifier **blocks scripts that hard-delete live rows** — those must be run by Ed (e.g. `scripts/cleanup-junk-enquiries.mjs`). (Memory: `aquacrm-local-writes-to-live-supabase`, `aquacrm-local-dev-hazards`.)

---

## ✅ Still open and still true
Checked so nobody re-investigates them, and so this file is trusted when it says
something *is* a problem:
- **#2 Aqua Tag form-capture is still not consent-gated** — `api/public/form-capture/route.ts:245` writes `consent: false` and the route has no consent check. Still Ed's call.
- **#4 ✅ FIXED 2026-08-27 — `.env.example` named the two Supabase BUCKETS and none of the three credentials**, which is exactly why it survived: the section looked finished. All three are documented now, with the service-role key called out as server-only (a `NEXT_PUBLIC_` prefix would publish a key that bypasses row-level security). Closed **by construction** rather than by hand: `npm run smoke:env-example` derives the required list from `productionReadiness.ts` and fails when any variable it checks is undocumented — which immediately caught two MORE that nobody had noticed (`AQUACRM_ASSISTANT_API_TOKEN` / `_AGENCY_ID`), now documented alongside their production refusal (#181). It also refuses a real-looking secret committed into the example file.
- **#6 two blob backends, different tables and row keys** — `storagePostgres.ts:24` (`portal_kv."__portal_state__"`) vs `storageSupabase.ts:5` (`app_datastores` / `aquacrm-portal-state`).
- **#9 Radar `correlation-engine` is still a hardcoded `pass`** — `lib/radarSentinels.ts:104` (`status: "pass"`, no assertion).
- **#12 dev/demo sessions still load zero website enquiries** — `agency/inbox/page.tsx:60,67` (`session.isDemo ? Promise.resolve([])`). By design.
- **#13 the live-data hazard still applies in full.**
- **#16–#162 is the numbered reliability/correctness ledger, not a claim that every item remains
  open.** Current status lives on each issue and in TODO.md. #69/#72 retain P0 public-route/
  browser acceptance after their non-security core repair; #78 is resolved. The earlier full-suite
  result by itself closed none of the findings.

_When you fix one of these: note it in [updates.md](updates.md), then mark the
item **✅ RESOLVED here with the `file:line` that proves it** — **do not delete
it**. A deleted item gets rediscovered; a resolved one with evidence does not.
Keep the item's number, other docs link to it._
