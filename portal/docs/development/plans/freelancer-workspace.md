# Plan — Freelancer-facing workspace (the freelancer's own limited view)

← [todo.md](../todo.md) · [issues.md](../issues.md) #8 · [dev-mode-demo-profiles.md](dev-mode-demo-profiles.md)

**Status: P1–P6 ✅ shipped; issue #112 resolved 2026-08-25.** P5 is agency-side management
and preview. P6 adds resumable Supabase/local/People provisioning, password-setup invitation,
shared deliverables, private work upload/download and owner Team Chat. Dedicated journey **3/3**
(including legacy-local adoption/replay), surrounding **105/105** and TypeScript pass. The isolated build was environment-killed during
webpack compilation without a code diagnostic. Exact build, real provider/email/reset/login and
browser plus cross-process reload remain acceptance, not missing implementation.
Found via Dev Mode: a `freelancer` role had **no landing** — it fell through to
`/portal/clients/<id>`, the *agency-side* per-client workspace, over-exposing internal client
records to a one-time contracted worker. Now a freelancer gets their **own** minimal view: only
their assigned jobs, fields gated by a **configurable** policy. The Dev Mode Freelancer POV is
wired. Its seeded read layout was browser-rendered; P6 mutations have only mounted in-process
proof so far.

## The spine already exists — REUSE (don't rebuild)
The Staff/people system already models freelancers + their work:
- **A freelancer is a `PeopleEmployee`** with `employmentType: "freelancer"` (not a new
  entity). `createPeopleEmployee({ userId })` already links an employee to a login user;
  `getPeopleEmployeeByUserId(agencyId, userId)` resolves it.
- **`PeopleFreelancerJob`** (`server/types.ts`) is the unit of work: `employeeId`, `title`,
  `brief`, optional `clientId`, `status`, `feeMinor`/`currency`, `startsOn`/`dueOn`,
  `deliveredAt`, `paidAt`, `notes`, shared `deliverables` and private `submissions`. Read via `listPeopleFreelancerJobs(agencyId, employeeId)`
  (`server/people.ts`); status transitions via `setPeopleFreelancerJobStatus`.
- **The resolver chain is therefore:** freelancer's `userId` → `getPeopleEmployeeByUserId`
  → their `PeopleEmployee` → `listPeopleFreelancerJobs(agencyId, employee.id)` → their jobs.
  The same job now owns the shared-work records instead of a parallel freelancer store.

## Original gap — resolved
1. `/portal` now routes `freelancer` to its dedicated landing before client roles.
2. `inviteFreelancer()` provisions/adopts the provider identity through the durable shared
   coordinator, links the local user and People record, then issues a password-setup invitation.
3. `/portal/freelancer` has its own minimal chrome and only the policy-projected job data/actions.

## Design — a self-contained surface driven by a CONFIGURABLE policy (Ed: "all configurable")
A freelancer sees **only what they need to do the job**, and **the agency decides exactly what
that is** — nothing is hardcoded. Mirror how the **customer portal** is a self-contained,
deliberately-narrow surface (own chrome, `requireRole` at the layout, only shared info) — but
what it exposes is read from a **`FreelancerAccessConfig`** the agency sets, with **safe
privacy-first defaults** and **per-job overrides**. This matches the app's existing configurable
patterns — `PeopleProcessConfig` (onboarding/hiring steps Ed defines once) and per-employee
`workspaceAccess` (station-level view/edit) — so it extends the people-config system, not a new
paradigm.

**What's configurable (agency-level default + per-job override):**
- **Field visibility** per job — brief · dates · **fee** (their own pay) · deliverables/files ·
  **client identity** (real name/brand **vs** an anonymised project label) · notes.
- **Allowed actions** — read-only · mark-submitted · upload work · message the agency (each a
  toggle; anything the freelancer submits still needs agency **human-accept**).
- **Access itself** — whether a given freelancer gets a login at all, and to which jobs.

**Defaults (safe, overridable):** client **anonymised**, **fee visible** (they're being paid),
**read-only**, only the brief + dates + explicitly-shared deliverables. The agency opens up more
per policy or per job.

## Phases (simple-first)
1. ✅ **Config model + landing driven by defaults (shipped 2026-08-19).** Define `FreelancerAccessConfig` (schema +
   safe defaults + resolver `resolveFreelancerAccess(agencyId, employeeId, jobId)` folding
   agency default ← per-job override). `/portal` dispatches `role === "freelancer"` →
   `/portal/freelancer`; new minimal layout (own chrome) + page: `requireRole("freelancer")` →
   resolve their `PeopleEmployee` → list **their** `PeopleFreelancerJob`s, **rendering only the
   fields the resolved config permits** (defaults apply even before any UI to edit them). No
   agency controls, no client record.
2. ✅ **Agency config surface (agency-wide default shipped 2026-08-19).** Persisted
   `freelancerAccessConfig` slot + `get/save/normaliseFreelancerAccess` (`resolveFreelancerAccess`
   reads it) + `api/portal/freelancer-access` (owner/manager) + editor at
   `/portal/agency/freelancer-access` (visibility toggles · client named/anonymised · actions).
   **Discoverable:** agency **Settings → Freelancer access** tab deep-links to the editor.
   Per-job overrides are shipped and win over the agency default.
3. ✅ **Freelancer actions — mark-submitted shipped 2026-08-19.** `submitFreelancerJob`
   (active→**delivered**, gated on ownership + policy + active; agency still owns `paid`) +
   freelancer API `api/portal/freelancer/submit` + a "Mark submitted" button.
4. ✅ **Dev Mode Freelancer POV (shipped 2026-08-19).** Seed a demo freelancer (`PeopleEmployee` + `role: "freelancer"`
   user + one demo `PeopleFreelancerJob` + a demo config exercising a couple of toggles) in
   `demoSeed.ts`; add **Freelancer** to `DevModeSwitcher` (`PERSONAS` + `currentPersona`) and
   the route's `resolvePersona` → lands on `/portal/freelancer`. One-line-per-file addition.
5. ✅ **Agency-side management + preview — the real system (shipped 2026-08-19).** A staff-sidebar
   **Freelancers** entry (`/portal/agency/freelancers`) where an owner/manager **creates** a
   freelancer (`createFreelancer` → a `role: "freelancer"` login with a random password + a
   `PeopleEmployee`, idempotent on email, agency-scoped), **manages** the list (each with their
   jobs), and **previews** any freelancer's own workspace. Preview works exactly like Dev Mode's
   session-minting but on its **own** channel: `api/auth/preview-as-freelancer` mints an **isDemo**
   session **as the freelancer** (isDemo bypasses the Supabase identity check, so a freelancer who
   has never logged in can still be previewed) stamped with **`previewReturnAgencyId` /
   `previewReturnWasDemo`** (distinct from Dev Mode's `devReturnAgencyId`, so the Dev Mode switcher
   does **not** show on a real-freelancer preview); the freelancer layout swaps **Sign out** for
   **← Exit preview**, and `exit` re-mints the owner (restoring their demo-ness). All in NEW/owned
   files reading `server/people.ts` via exports.
6. ✅ **Real setup + shared work (shipped 2026-08-25).** Mounted creation calls
   `inviteFreelancer()` and the resumable staff-provisioning coordinator, then sends a signed
   password-reset setup link. Agency staff share validated HTTP(S) deliverables from People;
   freelancer upload uses the shared private-storage boundary and guarded content route; messages
   use an existing direct People/Team Chat channel with the agency owner. Upload, message and
   submit all enforce job ownership and the effective policy server-side.

## Decisions — ✅ RESOLVED: **all configurable** (Ed, 2026-08-19)
Every product choice — what a freelancer sees per job, client **named vs anonymised**, whether
their **fee** shows, which **actions** they can take, which **jobs** they access, and whether a
freelancer gets a login at all — is **agency-configurable** via `FreelancerAccessConfig`, not
hardcoded. Safe **privacy-first defaults**, overridable **agency-wide + per job**. Because access
is configurable, freelancers **do** get logins (per policy).

**Implementation decisions now fixed:** deliverable links and submission metadata live on
`PeopleFreelancerJob`; bytes use the shared durable private-upload provider; messaging reuses the
People direct-channel store; setup reuses the password-reset link after provider provisioning.

## Files (for whoever builds — Staff/people domain)
- **NEW:** `app/portal/freelancer/{layout.tsx,page.tsx}` (+ its chrome); in `server/people.ts` a
  `FreelancerAccessConfig` type + store (agency default + per-job override) with
  `resolveFreelancerAccess(...)` and a `freelancerWorkspace(userId)` resolver that returns only
  config-permitted fields.
- **ADDITIVE:** `app/portal/page.tsx` (the `freelancer` dispatch branch), the staff-card
  freelancer section (the config UI), `demoSeed.ts` (demo freelancer + job + config),
  `DevModeSwitcher.tsx` + `api/auth/dev-mode/route.ts` (the POV, Phase 4).
- **Owner:** the **Staff worker** owns `server/people.ts` / the people domain — coordinate.

## P5 files (agency-side management + preview — NEW/owned, collision-safe)
- **NEW:** `server/freelancerAdmin.ts` (`listAgencyFreelancers` · `createFreelancer` ·
  `freelancerLoginUserId` — all reading `server/people.ts` + `server/users.ts` via exports);
  `app/api/portal/freelancers/route.ts` (GET list · POST create, owner/manager);
  `app/api/auth/preview-as-freelancer/route.ts` (enter/exit preview minting);
  `app/portal/agency/freelancers/{page.tsx,_FreelancerManager.tsx}` (management surface);
  `app/portal/freelancer/_ExitPreview.tsx` (the exit-preview button).
- **ADDITIVE:** `server/types.ts` + `lib/server/auth.ts` (`previewReturnAgencyId` /
  `previewReturnWasDemo` on the session); `lib/chrome/sidebarLayout.ts` (the **Freelancers**
  entry for agency owner/manager); `app/portal/freelancer/layout.tsx` (Exit preview vs Sign out).

## P6 files (real setup + shared work)
- `server/freelancerAdmin.ts` (`inviteFreelancer`) and `server/staffProvisioning.ts` (resumable
  provider/local/People operation); mounted `api/portal/freelancers` uses this path.
- `server/people.ts` (`addPeopleFreelancerDeliverable`, `recordPeopleFreelancerSubmission`) and
  `server/freelancerWorkspace.ts` (safe projection, ownership/policy gates, owner conversation).
- `api/portal/freelancer/{message,work,work/content}` plus `_FreelancerMessages.tsx`, expanded
  `_FreelancerJobActions.tsx` and the agency People deliverable action.
- `scripts/smoke-freelancer-real-journey.test.ts` is the mounted implementation contract.

## Done when
A `freelancer` signs in and lands on `/portal/freelancer` showing **only their own** assigned
jobs (brief/dates/deliverables) — never the agency-side client workspace or any client
internal record — and the Dev Mode **Freelancer** POV hops straight into that view. **P5:** an
owner/manager can **create** a freelancer, **manage** them, and **preview** their exact workspace
from the staff sidebar (**Freelancers**), then **exit** back — without the freelancer ever having
to log in. **P6:** creation provides setup, and allowed deliverable/upload/message/submit actions
produce data visible to the correct freelancer and agency side. This is implementation-complete;
real provider/email/reset/login and browser/cross-process reload are the outstanding acceptance.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/server/freelancerWorkspace.ts`
- `src/server/freelancerAdmin.ts`
- `src/app/portal/freelancer/layout.tsx`
- `src/app/portal/freelancer/page.tsx`
- `src/app/portal/freelancer/_FreelancerJobActions.tsx`
- `src/app/portal/freelancer/_FreelancerMessages.tsx`
- `src/app/portal/freelancer/_ExitPreview.tsx`
- `src/app/portal/agency/freelancers/page.tsx`
- `src/app/portal/agency/freelancers/_FreelancerManager.tsx`
- `src/app/portal/agency/freelancer-access/page.tsx`
- `src/app/portal/agency/freelancer-access/_FreelancerAccessConfigPanel.tsx`
- `src/app/api/auth/preview-as-freelancer/route.ts`
- `src/app/api/portal/freelancers/route.ts`
- `src/app/api/portal/freelancer/submit/route.ts`
- `src/app/api/portal/freelancer/message/route.ts`
- `src/app/api/portal/freelancer/work/route.ts`
- `src/app/api/portal/freelancer/work/content/route.ts`
- `src/app/api/portal/freelancer-access/route.ts`
- `src/app/portal/page.tsx`
- `src/server/types.ts`
- `src/server/storage.ts`
- `src/lib/server/auth/auth.ts`
- `src/lib/server/seeds/demoSeed.ts`
- `src/app/api/auth/dev-mode/route.ts`
- `src/lib/chrome/sidebarLayout.ts`
- `scripts/smoke-dev-mode.test.ts`
- `scripts/smoke-people-workspace.test.ts`
- `scripts/smoke-post-login-redirect.test.ts`
- `scripts/smoke-freelancer-real-journey.test.ts`
- `docs/development/plans/freelancer-workspace.md`
- `docs/development/plans/freelancer-workspace-HANDOFF.md`
