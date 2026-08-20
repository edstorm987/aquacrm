# Freelancer Workspace + Management — Handoff & Current-State Record

← [freelancer-workspace.md](freelancer-workspace.md) (the plan) · [todo.md](../todo.md) ·
[status.md](../status.md) · [issues.md](issues.md) #8 · [updates.md](../updates.md)

Written at the end of the freelancer build so the next session/Commander starts from
facts, not a summary of a summary. Everything here is **uncommitted working tree** (standing
rule: no commit/push unless Ed asks). Nothing below is browser-verified yet — that's the one
outstanding hand-off (→ Commander, on `:3032`).

---

## 1. Status at a glance

| Piece | Level | Note |
|---|---|---|
| Freelancer's own workspace (`/portal/freelancer`) | **Logic-tested** | Own chrome, assigned jobs only, fields gated by config |
| Configurable access policy (`FreelancerAccessConfig`) | **Logic-tested** | Privacy-first defaults + agency-wide + **per-job** overrides |
| Mark-submitted action | **Logic-tested** | active→delivered, gated on ownership + policy + active |
| **Create a freelancer** (`createFreelancer`) | **Logic-tested** | Real `role:"freelancer"` login + `PeopleEmployee`, idempotent on email |
| **Manage** (list + jobs) | **Logic-tested** | Staff-sidebar **Freelancers** entry (owner/manager only) |
| **Preview a freelancer's workspace** | **Logic-tested** | isDemo session mint → their view → exit back to owner |
| Dev Mode **Freelancer** POV | **Logic-tested** | Seeded demo freelancer `sky@aqua.freelance` + a demo job |
| **Everything above, in a browser** | **NOT verified** | → Commander walk on `:3032` |
| Real-freelancer **remote** login (they sign in themselves) | **NOT built** | Out of brief — auth/Supabase domain |
| Upload / message actions | **NOT built** | Separate file-storage / messaging subsystems |

**Tests:** dev-mode suite **43/43** · full suite **1704 pass / 0 fail** · `tsc` **0 errors**.
(Levels use [status.md](../status.md)'s vocabulary: Coded → Static-tested → **Logic-tested** →
Runtime-verified → User-reachable. We're at Logic-tested; the next rung is the browser walk.)

---

## 2. What shipped, by phase

The plan ran P1→P5. P1–P4 + per-job overrides shipped earlier this day; **P5 (the real
management + preview system) is this session's work** and is the headline.

### P1 — the freelancer's own workspace (the gap Dev Mode exposed)
A `freelancer` role had **no landing** — it fell through the client-role branch to
`/portal/clients/<id>`, the **agency-side** per-client workspace, over-exposing internal client
records to a one-time contractor. Now `/portal` dispatches `role === "freelancer"` →
`/portal/freelancer`, a **minimal own-chrome** surface (`layout.tsx` + `page.tsx`) that resolves
their `PeopleEmployee` and lists only **their** `PeopleFreelancerJob`s. No agency Topbar/Sidebar,
no Radar/finance, no client record. `server/freelancerWorkspace.ts` is the read model.

### P2 — the configurable access policy ("all configurable", Ed)
Nothing hardcoded: a **`FreelancerAccessConfig`** decides per job what a freelancer sees
(brief · dates · **fee** · deliverables · **client identity: named vs anonymised** · notes) and
which **actions** they can take. **Privacy-first defaults** (`DEFAULT_FREELANCER_ACCESS`: client
**anonymised**, fee visible, **read-only**). Persisted in `PortalState.freelancerAccessConfig`;
editor at `/portal/agency/freelancer-access` + a **Settings → Freelancer access** tab.

### P3 — mark-submitted + per-job overrides
`submitFreelancerJob` moves an active job → **delivered**, gated on ownership + policy + still-active
(agency still owns `paid`). Per-job overrides fold over the agency default via
`resolveFreelancerAccess(agencyId, employeeId, jobId)` — an override **wins**, and clears back.

### P4 — Dev Mode Freelancer POV
`demoSeed.ts` seeds a demo freelancer (`sky@aqua.freelance` + a `PeopleEmployee` + one demo job
"Landing page illustration set"); the `DevModeSwitcher` offers **Freelancer**, and the dev-mode
route's `resolvePersona` lands it on `/portal/freelancer`.

### P5 — the REAL management + preview system ⭐ (this session)
Ed: *"like dev mode just add demo freelancer and then in the staff sidebar for agency make sure
youve got some ui to create one and preview freelancer manage them and make it a real system."*

- **Create** — `createFreelancer(agencyId, actor, {name,email,title})` (`server/freelancerAdmin.ts`)
  mints a **real `role:"freelancer"` login** (random password — they reach the workspace via
  preview / a later invite, never a guessed password) + a `PeopleEmployee` (employmentType
  freelancer). **Validated** (name required; email regex) and **idempotent on email** (agency-scoped;
  an email owned by another agency → `email_in_use`). Email is lower-cased.
- **Manage** — `listAgencyFreelancers(agencyId)` returns each freelancer with their jobs. Surfaced
  at `/portal/agency/freelancers` (`page.tsx` + `_FreelancerManager.tsx`): an add form + the list,
  each with a **Preview workspace** button. Deep-links to the **Access policy** editor.
- **Preview** — `api/auth/preview-as-freelancer` works like Dev Mode's session-minting but on its
  **own** channel. Owner/manager `POST {employeeId}` mints an **isDemo** session **as the
  freelancer** and redirects to `/portal/freelancer`; `POST {action:"exit"}` re-mints the owner and
  redirects to `/portal/agency/freelancers`. The freelancer layout swaps **Sign out** for **←
  Exit preview** while previewing (`_ExitPreview.tsx`).
- **Discoverable** — a staff-sidebar **Freelancers** entry (`lib/chrome/sidebarLayout.ts`), inside
  the `agency-owner || agency-manager` block, so client-scoped staff never see it.

**The key design move:** preview mints **`isDemo: true`**. `getSession()` cross-checks a live
session's identity against Supabase; a freelancer who has **never logged in** has no Supabase
identity, so a normal mint would fail that check. `isDemo` **bypasses** it — which is exactly how
Dev Mode previews a demo owner. So the owner sees the real freelancer's real workspace **without the
freelancer ever having to log in.**

**Why its own return markers (not Dev Mode's):** the preview session carries
**`previewReturnAgencyId` / `previewReturnWasDemo`**, *distinct* from Dev Mode's
`devReturnAgencyId`. That distinction is load-bearing: the Dev Mode switcher renders when
`devReturnAgencyId` is set, so using a separate marker means **the Dev Mode switcher does NOT show
on a real-freelancer preview** (you get "Exit preview" instead). `previewReturnWasDemo` records
whether the owner was *already* a demo session (e.g. previewing from inside Dev Mode) so `exit`
restores the right session type — the same trap that once sent exit → `/login`.

---

## 3. Verification — what's actually been proven

**Logic-tested, in-process** (the runtime-verify convention: drive the real route handlers with
`issueSession` + `NextRequest`, memory backend — no dev server). In
[`scripts/smoke-dev-mode.test.ts`](../../scripts/smoke-dev-mode.test.ts), the new
**"Freelancer management — create + preview (real system)"** block (+7 tests):

1. `createFreelancer` — validation (name_required, email_invalid), role/email-normalise/agency-scope,
   **idempotent on email** (same employee + login), listed by `listAgencyFreelancers`.
2. Cross-agency email clash → `email_in_use`.
3. **Preview enter→exit round-trip** — enter: role freelancer, `isDemo`, `previewReturnAgencyId`,
   redirect `/portal/freelancer`, and **NOT** a Dev Mode session (`devReturnAgencyId` absent). Exit:
   back to the real owner, markers cleared, redirect `/portal/agency/freelancers`.
4. **Demo-owner round-trip** — a preview started from an isDemo owner restores an isDemo owner on
   exit (guards the `previewReturnWasDemo` path that otherwise bounces the local `/dev` founder to
   `/login`).
5. Staff **forbidden** (403), no session minted.
6. Unknown employee → **404**; exit with no marker → **409**.
7. Full wiring: page · manager · create route · preview route · sidebar · freelancer-layout exit ·
   session-type fields.

Plus the pre-existing freelancer blocks (access config, mark-submitted, per-job overrides) still
green. **What is NOT proven: anything in a browser.** No pixel, no click, no live nav has been
walked. That's the single outstanding item.

---

## 4. Decisions (resolved by Ed + adopted defaults)

- **All configurable** (Ed, 2026-08-19) — every product choice (what shows per job, client
  named/anonymised, fee visibility, allowed actions, which jobs, whether a login exists) is
  agency-configurable via `FreelancerAccessConfig`, not hardcoded. Privacy-first defaults.
- **"Make it a real system"** (Ed) — not just the demo: owners create their **own** real
  freelancers. Done.
- **Preview over login** (builder call) — agency-side viewing is solved by minting an isDemo
  session; a freelancer logging in *themselves* is deliberately deferred (see §5).
- **Random password on create** (builder call) — a created freelancer can't be logged into by
  guessing; they're reached by preview now, and by an invite link later.
- **Collision-safe** (standing constraint) — all new logic in owned files that **read**
  `server/people.ts` via its exports; never edit `people.ts` / `_PeopleCommand.tsx` (Staff worker's).

---

## 5. Problems, gaps & watch-outs (the honest issues)

- **Not browser-verified.** The whole feature is Logic-tested only. Needs the create → preview →
  exit round-trip walked on `:3032`, plus the freelancer workspace actually rendering. → Commander.
- **Real-freelancer remote login is NOT built.** A freelancer signing in *themselves* needs
  auth/Supabase provisioning (magic-link / invite → a real Supabase identity), which is the auth
  owner's domain and outside this brief. **Today the created login has a random password and no
  invite path** — so a real freelancer can't yet reach their workspace unaided. **Preview covers
  agency-side viewing; it does not replace freelancer self-serve access.** This is the biggest gap
  between "built" and "a freelancer uses it."
- **`isDemo` is doing double duty.** It means both "Dev Mode demo persona" and "agency previewing a
  real freelancer." They're kept apart by the *return marker* (`devReturnAgencyId` vs
  `previewReturnAgencyId`), not by `isDemo` itself. If anything keys behaviour off `isDemo` alone,
  check it doesn't conflate the two. (The switcher correctly keys off `devReturnAgencyId`.)
- **Preview writes are possible in principle.** The preview session is a real freelancer session, so
  the mark-submitted action *would* work under preview. That's arguably fine (it's the owner acting
  as them), but if you want preview to be strictly read-only, gate the freelancer actions on the
  absence of `previewReturnAgencyId`. Not currently gated — flagged, not fixed.
- **Upload / message actions unbuilt** — the config exposes the toggles, but the file-storage and
  messaging subsystems don't exist yet.
- **`false` isn't stored in the token.** `previewReturnWasDemo: false` round-trips as `undefined`
  (falsy fields aren't persisted) — harmless (both read as "not demo"), but don't assert `=== false`
  on it; assert falsiness. (One test learned this.)

---

## 6. Coordination & shared-file notes

**New/owned files** (safe to edit freely): `server/freelancerAdmin.ts`,
`server/freelancerWorkspace.ts`, everything under `app/portal/{freelancer,agency/freelancers,
agency/freelancer-access}/`, and the three routes `api/auth/preview-as-freelancer`,
`api/portal/freelancers`, `api/portal/freelancer/submit`, `api/portal/freelancer-access`.

**Additive edits to shared files** (coordinate — additive only, no reshape):
- `server/types.ts` — `FreelancerAccessConfig`, `PortalState.freelancerAccessConfig` /
  `freelancerJobOverride`, and `SessionPayload.previewReturnAgencyId` / `previewReturnWasDemo`.
- `lib/server/auth.ts` — `issueSession` passes the two preview-return fields through.
- `storage.ts` — `empty()` + parse defaults for the two config slots.
- `lib/chrome/sidebarLayout.ts` — the **Freelancers** entry (owner/manager block).
- `demoSeed.ts` + `api/auth/dev-mode/route.ts` — the demo freelancer + Freelancer POV.

**Never touched:** `server/people.ts`, `_PeopleCommand.tsx` (Staff worker owns them). We call
`createPeopleEmployee`, `getPeopleEmployeeByUserId`, `listPeopleEmployees`,
`listPeopleFreelancerJobs`, `setPeopleFreelancerJobStatus` via their exports.

---

## 7. File map

```
server/
  freelancerAdmin.ts        NEW  listAgencyFreelancers · createFreelancer · freelancerLoginUserId
  freelancerWorkspace.ts    NEW  freelancerWorkspace · resolveFreelancerAccess · submitFreelancerJob
                                 · get/save/normaliseFreelancerAccess · get/set/clearFreelancerJobOverride
                                 · listFreelancerJobsForConfig · DEFAULT_FREELANCER_ACCESS
app/api/
  auth/preview-as-freelancer/route.ts   NEW  POST {employeeId} enter · POST {action:"exit"} exit
  portal/freelancers/route.ts           NEW  GET list · POST create (owner/manager)
  portal/freelancer/submit/route.ts     NEW  POST {jobId} mark-submitted (freelancer only)
  portal/freelancer-access/route.ts     NEW  GET {config,jobs} · POST default / per-job override / clear
app/portal/
  freelancer/layout.tsx                 NEW  own chrome; Exit preview vs Sign out
  freelancer/page.tsx                   NEW  their jobs (config-gated fields)
  freelancer/_FreelancerJobActions.tsx  NEW  "Mark submitted"
  freelancer/_ExitPreview.tsx           NEW  "← Exit preview" (amber)
  agency/freelancers/page.tsx           NEW  management surface (owner/manager)
  agency/freelancers/_FreelancerManager.tsx  NEW  create form + list + Preview workspace
  agency/freelancer-access/page.tsx + _FreelancerAccessConfigPanel.tsx  NEW  policy editor
ADDITIVE: server/types.ts · lib/server/auth.ts · server/storage.ts ·
          lib/chrome/sidebarLayout.ts · lib/server/demoSeed.ts · app/api/auth/dev-mode/route.ts
TEST: scripts/smoke-dev-mode.test.ts   (freelancer blocks; +7 for P5)
```

---

## 8. How to re-verify / extend (recipes)

**Run the tests** (memory backend — does NOT touch the shared sandbox):
```bash
PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/smoke-dev-mode.test.ts
PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts   # full
```

**Browser walk (the outstanding hand-off, on `:3032`):**
1. `/dev` → become the agency owner (or enter Dev Mode → Owner).
2. Sidebar → **Freelancers**. Add one (name + email) → it appears in the list.
3. Click **Preview workspace** → lands on `/portal/freelancer` showing only that freelancer's jobs,
   with **← Exit preview** in place of Sign out, and **no** Dev Mode switcher.
4. **Exit preview** → back on `/portal/agency/freelancers` as the owner.
5. Confirm a client-scoped staff session does **not** see the Freelancers sidebar entry.

**Extend — give freelancers real self-serve access (the next real piece):** reuse the
connect/magic-link invite pattern (see `api/auth/magic/*`) to mint a real Supabase identity for a
created freelancer, so they log in themselves instead of relying on preview. Coordinate with the
auth owner.

---

## 9. What's next / ideas

- **Real-freelancer remote login** (biggest gap) — invite link → Supabase identity → they sign in.
- **Upload work / message the agency** — wire the two remaining action toggles to real subsystems
  (file store; messaging). Both already have config switches waiting.
- **Read-only preview** — optionally gate freelancer mutations when `previewReturnAgencyId` is set.
- **Assign jobs from the management surface** — today jobs are assigned on the staff card
  (`_PeopleCommand.tsx`, Staff worker's); a shortcut from `/portal/agency/freelancers` would close
  the loop (coordinate — it's their file).

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `docs/development/plans/freelancer-workspace-HANDOFF.md`
