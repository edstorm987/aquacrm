# Plan — Runtime verification of the critical flows  🔴 blocker

← [todo.md](../todo.md) · [development.md](../../development.md)

**Status: BUILDING — access/Dev Workspace scope refreshed 2026-08-26.** Phase 1 is
complete (isolated sandboxes). The route sweep was 60/60 at its checkpoint and
the connect handlers were exercised in-process, but the seeded interactive
connect-code journey is still unwalked; only the invalid-link page was rendered
on port 3032. Remaining browser work includes staff/team, freelancer, internal
chat, public bucket, Editor transitions, truthful empty states and the critical
flows below. The first configurable-access kernel, manager UI, exact-project Dev
Workspace, direct Dev API gates and local preview supervisor are now implemented
and focused-tested. Representative mounted proof now covers the access manager at
seven widths, restricted Staff/Fulfilment deep links, missing exact-client denial,
responsive editor panes and preview Start/Restart/Stop with Aqua Tag HTTP 200; their
full grant/request mutation, positive-access, accessibility and failure matrix is not
complete. A clean follow-up additionally proves exact Staff/Fulfilment element sets,
the 390px 2×2/44px selector, mobile People Capacity, all 28 role-template element groups
and a reversible control interaction without submit. The final relevant static gate is
**130/130**, TypeScript/diff pass, and the browser warning/error log was empty. No
persisted role/grant/request journey or complete repository suite was performed. This plan turns
“coded + static-tested” into “verified”, per
[status.md](../status.md). A passing test is not the same as working software.

## Where we are (corrected 2026-08-20)
- **Not "nothing" any more.** The earlier text here said nothing had been runtime-verified and that this plan was blocked on a free port. Both statements are stale: on 2026-08-20 alone, workers browser-verified the Dev Console topbar on `:3047`, the element-block render on `:3043` and finance double-click idempotency on `:3051` — three sandboxes at once.
- **The port blocker is SOLVED, not waiting on Ed.** `npm run sandbox:fork` ([`package.json:85`](../../../package.json) → `scripts/fork-sandbox.mjs`) gives each worker its own state file, build dir and port, so "another session holds 3032" no longer stops anyone. `npm run dev:verify` ([`package.json:9`](../../../package.json)) still exists for a file-backed run.
- **What remains is the walk, not the runway.** Most features are coded + static-source-tested; the named critical flows below are the ones still to be driven by hand.

## Phases
1. ✅ **Server access.** Cleared — `npm run sandbox:fork` gives every worker an isolated sandbox (own `PORTAL_DATA_FILE`, `NEXT_DIST_DIR` and port), so no one waits on 3032. This is no longer a decision for Ed.
2. **Verify the critical flows** (as the real roles):
   - Session revocation matrix: reuse an old cookie after owner→staff downgrade,
     password change and account removal against external-AI key management and
     representative `requireRole()` APIs. Every request must fail before mutation.
   - Client erasure failure/retry: inject a live-table failure, require an
     incomplete response, retry to completion and confirm the permanent audit
     contains no client name or identifiers.
   - Public showcase: prove Google/Meta callbacks and every known mutating `GET`
     are refused, then drive two simultaneous visitors without shared reset.
   - Enquiry ingestion: Aqua Tag / `POST /api/public/brand-enquiry` → dedupe → inbox (⚠ writes live Supabase — use clearly-labelled test data).
   - Customer portal actually loads for an `end-customer`.
   - Connect + setup flows, including a seeded real-code countdown, wrong/retry,
     resend and successful completion — not only handler calls or an invalid link.
   - Aqua Tags **detect** on a real domain (`/api/portal/aqua-tags/detect`).
   - The new Command Centre **infra health panel** renders (radar upgrade Stage 4).
   - File-backend failure paths: unwritable target, corrupt input and restart
     recovery once issues #16–#17 are fixed.
   - Editor transition matrix: unsaved work across hide/mode/lifecycle/refresh/
     project switch and project-isolated AI prefill; reproduce the reported bleed;
     two-instance Editor AI replay once the database contract is fixed.
   - Unknown client references and an agency with no website return truthful
     errors/empty states.
   - Staff capability matrix: compare proxy, navigation, pages and APIs against
     one approved staff policy and walk legitimate staff tasks end to end.
   - Configurable-access matrix for the now-implemented first slice: owner, manager,
     two differently granted staff, client owner/staff, end customer, freelancer,
     Project-A-only developer, AI/service principal at the API boundary and read-only
     share/Sandbox/Showcase identities. Prove no grant, view, edit, AI, preview, PR and
     deploy separation plus pending, narrowed, approved, denied, cancelled, expired and
     revoked requests. Navigation, direct pages, APIs, project lists, data and old
     sessions must agree; Project A must never reveal Project B or the internal Dev Team
     control plane. Include the live-governance/Sandbox-resource boundary: a
     Sandbox-only Project A can be granted and used only in that resource realm, a
     live-only or invented project remains denied, non-governors cannot select a
     writable mode or privileged dataset/persona/reset, every Dev API resolves the
     active resource agency, and live revocation invalidates the old
     Sandbox cookie.
   - Workspace-element matrix: for representative Staff, Fulfilment, client and Dev
     workspaces, configure one registered element at Hidden, View only, Use/Edit and
     Manage. Prove navigation/rendering, direct element data/API calls, mutations,
     request-access and reload all agree, and that an arbitrary DOM/component name
     cannot become a capability. Exact Staff/Fulfilment composition and the unpersisted
     role-template control interaction are already proven; persisted create/grant/request/
     approve/revoke and positive Use/Manage remain in this step.
   - Managed local-preview matrix: exact project status/start/health/logs/stop/restart;
     another project and read-only Sandbox refusal; concurrent start/restart; occupied
     port, dependency/start failure, crash, bounded/redacted logs and production refusal.
     Prove the CSP permits only the returned dynamic loopback preview. Then continue
     through inspect/edit/AI/diff/save/reload/tests/PR with the same grant.
3. **Record real results** in [status.md](../status.md) — move each flow to `runtime-verified` with the date + exactly what was checked.
4. **Close gaps with behavioural tests** — where a flow was broken or fragile, add a test that renders/calls and asserts the *result* (not a source-shape assertion).

## Responsive and visual release matrix

The final access/workspace-parity gate has two layers. First render every shell and
access boundary at all six primary viewports: **375x812 mobile portrait, 812x375
mobile landscape, 768x1024 tablet portrait, 1024x768 tablet landscape, 1280x800
desktop and 1920x1080 wide**. Add a 320x568 minimum-width overflow smoke, 200% desktop
zoom and one-pixel probes around the actual CSS breakpoints. Then execute the
mutation-heavy journeys at mobile portrait, tablet landscape and desktop.

The surface set includes Settings access management and Environment; all People and
Team stations; Agency and client Fulfilment; technical/project portfolios; the Dev
Workspace and all Editor modes; portal creation/preview/access; customer and
freelancer shells; shared desktop/mobile chrome; request-access, loading, empty,
validation, success, 403/404, provider failure and retry states. Use empty, long-label,
dense and failure fixtures. Rotate or resize during forms, boards and unsaved Editor
work without losing input, filters, active project or preview process.

Acceptance requires no document-level horizontal overflow, clipped primary action,
overlapping chrome, inaccessible content or sensitive-content flash. Only deliberate
boards/tables/tab strips/editor canvases may scroll sideways. Primary/icon touch
targets are at least 44x44, dialogs/drawers contain and restore focus, keyboard users
can reach and operate every action, drag/reorder has an alternative, tabs/menus/
listboxes tell the truth, status and errors are announced, and axe reports zero
critical/serious findings. Navigation is absent before interaction when unauthorised,
but every direct route and API must independently refuse access.

For every route/persona/viewport checkpoint retain a full-page screenshot, focused
high-risk screenshot, URL, persona, theme, fixture and viewport/orientation metadata,
overflow and primary-action bounding-box assertions, accessibility-tree/axe output,
console and network summaries, and before/after/reload evidence for mutations. Keep
traces/video for the Staff access change, Staff workday, Fulfilment stage movement,
Dev Workspace edit/publish request, and portal/customer handoff journeys. The gate
fails on unapproved visual drift, lost state, unexpected 4xx/5xx or console errors,
cross-project disclosure, read-only mutation, or disagreement between UI and server
authority.

## Reuse
`npm run dev:verify` (file backend — keeps state off live Supabase), the `.mjs` HTTP harnesses (`smoke.mjs`, `smoke-ux.mjs`), the browser preview tools.

## Decisions (Ed)
- ~~How to free a server (stop the other session, or dedicate one).~~ **Moot — `sandbox:fork` gives each worker its own.**
- Whether a single labelled test enquiry to live Supabase is OK (else verify the validation/negative paths only). **Still open.**

## Done when
The critical-flow rows in [status.md](../status.md) are `runtime-verified` with dates and what was checked — and any breakage found is fixed + covered by a behavioural test.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `docs/development/status.md`
- `docs/context/state.md`
- `docs/development/plans/runtime-verification.md`
- `scripts/smoke.mjs`
- `scripts/smoke-ux.mjs`
- `scripts/smoke-perf.mjs`
- `scripts/post-deploy-smoke.mjs`
- `scripts/fork-sandbox.mjs`
- `package.json`
