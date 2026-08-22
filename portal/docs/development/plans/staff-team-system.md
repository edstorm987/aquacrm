# Plan — Staff & Team system (multi-omega)

← [todo.md](../todo.md) · [development.md](../../development.md) · reference: [Advisor](../../workspace/advisor.md), [Radar](../../workspace/radar.md)

**Status: ✅ COMPLETE — all 10 phases shipped 2026-08-19** (logic-tested throughout,
full suite green, typecheck-clean; browser verification owed to the commander).
See [updates.md](../updates.md) for each phase. Future enhancements noted: a unified
cross-domain client+staff+supplier contracts view (none exists to merge into today),
and embedding the full block editor — `src/engines/editor/DevEditor.tsx` (the one universal
editor; it was called `_ClientPortalStudio` and lived under `agency/portals/editor/` until
2026-08-21) — for module authoring.

**Original brief — Ed:** staff/capacity is scattered and half-there —
he needs to *know* where the team's strong, where **he's** strong (owner
included), see every person in detail, know when/what to hire, feel his staff are
part of the mission, and run it all in one place. Big — structured as one system,
several parts.

## Audit — where we are (verified, it's more than it feels)
- **agency-hr plugin** — Staff / Departments / Leave / Roles pages + backend (`staff`, `departments`, `leave`, `roles`).
- **people module** (`server/people.ts`) — **PeopleEmployees** with **station-based access** (`peopleStationAccess` / `canUsePeopleStation`), a hiring **applications** pipeline, **leave**, **shifts**, **training assignments**.
- **team workspace** (`portal/team/` — `_TeamWorkspace`, `[section]`) — staff get access to workspace stations.
- **Presence signal exists** — `dashboardPlanning` work-sessions + `heartbeatDashboardWorkSession` (clock-in/out/heartbeat) → can drive **online / last-seen** (not surfaced yet).
- **Radar `team` domain = 31 families** — team-size, owner/staff/**freelancer**-coverage, task-ownership, workload-balance, **capacity-plan/-pressure**, **hiring-trigger**, capacity-growth/-sales/-client-success/-delivery/-operations/-finance/-systems, **people-payments**, role-integrity, **candidate-backlog**, employee-portal-coverage, onboarding-readiness, leave-decisions/-entitlement, shift-coverage, training-overdue/-completion, workspace-composition, commission-governance, employment-terms. **The capacity/hiring intelligence is already largely computed** — just not surfaced as a command.
- **Battle-table capacity section** (CapacityWorkspace) — ranks hire decisions by area.
- **External reference:** the **Ocean Boulevard `employee-portal`** (Ed's build) — a full staff-ops / portal / POS / auth app; a pattern-source to mine (see the mining note).

**So the gaps are cohesion + surfacing + the human/portal side**, not missing engines.

## Part 1 — Staff Command (agency-side, for Ed)
One home replacing the scattered surfaces:
- **Capacity map** — where the team (and **Ed himself**) is strong/stretched, by area (reuse the battle-table capacity + Radar `team` domain). *Red areas = a problem → problem → solution → hire/freelancer.* This is the "where am I blind / when do I hire / what for" — **Radar-driven.**
- **Staff directory + cards** — every person (incl. the **owner**). A **staff card** in detail: **tasks/actions** (assigned work), **days worked** (work-sessions), **payments** to them (finance people-payments), **feedback/thoughts**, **workspaces/stations** they can access, **presence** (online / last-seen), **leave/holidays**, **role**, **progression**, **notes**.
- **Hiring & freelancers** — the hiring queue (Radar `hiring-trigger` + `candidate-backlog` + applications pipeline); **freelancers** for one-time project jobs (Radar `freelancer-coverage`).
- **Delegation** — reassign **Ed's** tasks to staff from here.
- **Employee of the month** — recognition (ties to [You Deserve It](you-deserve-it-upgrade.md)).
- **Holidays / calendar** — leave + shifts on a calendar view.

## Part 2 — Staff-facing Portal & progression (for staff)
Staff get access (station-based already exists) to *their* side:
- **Their workspace** — the stations/tools they're granted, their tasks/actions.
- **Progression** — a sidebar item: their **role**, growth path, their data, **"my company"** (mission, where everything is, **SOPs**) — so they **feel part of the mission**.
- **Their pay / leave / shifts** — self-serve view + leave requests (exists).
- **Feedback / notes up** — send thoughts/feedback to Ed.

## Part 3 — Staff internal chat
"Like the inbox but with ourselves" — an **internal chat** (staff ↔ Ed ↔ staff), reusing the inbox/conversation model. Delegation + feedback can flow through it.

## Part 4 — Radar wiring (the influence)
The Radar `team` domain drives Part 1: capacity pressure, hiring triggers, workload imbalance, onboarding/leave/training gaps → **capacity alerts + hire suggestions** ("area X in red often → a problem → hire Y / freelancer"). Already computed — surface it as actionable (guess-then-confirm; a suggested hire is never committed work until Ed accepts). Presence (online/last-seen) from work-sessions feeds the "who's around" view.

## Part 5 — Training & Learning (modules + quizzes) — "the foundations"
Ed authors, staff complete — *"we make them together"* via a builder. **No AI —
Ed curates the content.**
- **Module builder** — Ed **adds videos, adds questions (quizzes)**, text + resources into a module. Reuse the website-editor content blocks (or a simple block builder); `resourceType:"video"` already exists.
- **Assign + gate** — assign modules to people/roles; **gate completion** (must watch + pass the quiz). A station/tool can require a module first. Reuse `PeopleTrainingAssignment` + Radar `training-overdue`/`training-completion`.
- **Track** — completion, scores, overdue → on the staff card + Radar.

## Part 6 — Staff contracts, unified with agency contracts
- **Staff/employment contracts** as real documents (offer letters, employment terms, NDAs, commission agreements) — reuse `contractTemplates` + the client-contract send/accept/sign flow. `employmentType` already exists on people.
- **One contracts surface** — staff contracts **appear in the agency contracts view** alongside client + supplier contracts, so Ed **finds everything in one place**. Ties to the compliance [evidence vault](compliance-legal.md).

## Part 7 — Configurable onboarding + hiring processes (elite)
- **Onboarding** — extend `PeopleOnboardingItem` (already on employees, `/portal/team/onboarding` exists) into a **configurable onboarding template** Ed defines: steps, required training/contracts/evidence, first-week progress. Radar `onboarding-readiness`/`-age` watches it.
- **Hiring** — extend the `PeopleApplication` **stage pipeline** into a **process Ed configures** (his own stages, screening, evidence, decisions) — "elite" = *his* process, not a fixed one. Radar `candidate-backlog`/`hiring-trigger` feed it.
- Both reuse the same **configurable-process pattern** the app already uses for client phases.

## Part 8 — Team structure, hierarchy & org (Ed's ask)
- **Org chart** — a visual hierarchy: **reporting lines** (who reports to whom), departments, teams. Reuse the agency-hr **departments** + **roles** (both exist); add a **manager/reports-to** relationship per person to render the tree.
- **Team composition** — per department/team: headcount, roles filled vs. open, capacity/health at a glance (ties to the capacity map).
- **Owner at the top; freelancers as a distinct layer** — the tree shows the whole shape of the org.

## Recommended additions (my picks — the elite bits)
Beyond what you named, these fit what's already here and lift it to elite:
1. **Skills matrix** — per person: skills + proficiency, so you see **where the team (and you) are strong *by capability*, not just capacity** — directly answers "where am I / is my team strong". Skill gaps → *hire for X*. **(High value — recommend.)**
2. **1:1s / check-ins + per-staff goals & progression** — a recurring 1:1 cadence (notes + action items) and **objectives per person** (staff-scoped, like the battle-table objectives) → the growth staff feel. Ties to feedback + the progression sidebar.
3. **Workload / utilisation** — who's overloaded vs. free — Radar **`workload-balance`** already computes it. Balance the team, spot burnout, inform delegation.
4. **Offboarding + access revocation** — an offboarding checklist that **revokes stations/access** when someone leaves. Often forgotten, and a real **security** gap → ties to [security-hardening](security-hardening.md).
5. **Staff document vault** — right-to-work, IDs, certifications, DBS/insurance, with expiry → ties to [compliance](compliance-legal.md).
6. **Announcements** — company updates broadcast to staff (mission / where things are) — reuse the chat/inbox.
7. **Work anniversaries + milestones** — auto from start dates → recognition, ties to [You Deserve It](you-deserve-it-upgrade.md).

## Mining the Ocean Boulevard employee-portal — FINDINGS (audited)
A mature staff-ops portal: one shell, role-switched **`/user`** (staff) + **`/admin`**
(manager); ~160 Supabase tables. **A lot is directly liftable** — patterns, not
code (it's a client codebase). Mapped to our wants:

**Lift wholesale (they've built it well):**
- **Staff cards** → `EmployeeManagement` + `EmployeeDirectoryRecord`: a directory + per-person **tabbed card** (Overview / Details incl. a **medical card** / Shifts / Wages / Holiday / Performance / Comms). That *is* our staff card — lift the shape.
- **Staff command shell** → `PortalShell`: one shell, **role-driven permission-filtered nav** (filtered in 3 coordinated places — sidebar + route-map + server gate), a global **SearchPalette**, aggregated **notification/attention badges**. Our staff command surface pattern.
- **Payments / days / feedback on the card** → timesheets → payroll → payslips (+bonus), attendance %, `staff_performance_comments` — all already hang off the employee record.
- **Internal chat (Part 3)** → `staff_conversation_*`: **team / today / direct** channels, **area audiences**, moderation, and **"working today" targeting** (message whoever's scheduled, no name-picking). Strong — lift it.
- **Training (Part 5)** → module model: video + written + docs + **required** + **renewal cadence** + immutable **completion history** (recertification, not a boolean) + team progress. Lift it — **our quizzes are their gap, add them.**
- **Staff contracts (Part 6)** → `workforce_documents` (versioned contract/policy) + **acknowledgements** = a contracts + sign-off system. Lift it.
- **Staff portal + SOPs (Part 2)** → the `(portal)/user` surface + **SOP routines with deep links** (opening/closing checklists whose steps link into the matching training guide). Lift it.
- **Hiring (Part 7)** → `career_applications` pipeline (new→reviewing→interview→offered→hired, CV + notes). Lift it.
- **Gated onboarding** → a checklist that won't let you "go live" until real data exists — lift the *pattern* for staff onboarding.

**Build fresh (our wants they don't have):** **quizzes** (add to training), **progression/mission** (gap), **org chart/hierarchy** (roles are flat — add a `manager_id`/reports-to edge), **skills matrix** (gap — key off training), **workload view** (derive from tasks/shifts), **offboarding + access revocation** (only active/inactive today), **capacity planning** (build on shifts + availability + role counts), **real-time presence** (they *derive* it from clock-in + "working today" — add an explicit presence field).

**Bonus patterns worth stealing (not on the original list):**
- **Convergent Actions pipeline** — observations/incidents/maintenance/refill/assistance all normalise into one `staff_tasks` with `sourceType/sourceId` + an "accept to own" claim. **Maps beautifully onto our Radar → actions.**
- **Role-preview / act-as** — admins preview any role's exact portal (support/QA gold). We have `preview-as-client-at-phase` — extend to staff roles.
- **Private per-user activity log** (RLS read-own) — trust/transparency for staff.
- **Employee-vote announcements** — ties to employee-of-month / [You Deserve It](you-deserve-it-upgrade.md).
- **Live / Demo / Dev data-mode** switch (fail-closed live) — a good showcase/dev pattern.

## Phases (simple-first)
1. ✅ **Staff cards + directory** — one surface, every person (incl. owner): tasks, days worked, payments, role, stations, notes. Reuse people module + finance + tasks.
2. ✅ **Presence** — online / last-seen from work-sessions/heartbeat.
3. ✅ **Capacity + hiring command** — surface the Radar `team` domain + battle-table capacity as the "where strong/weak, when to hire, freelancer vs hire" command.
4. ✅ **Delegation + employee-of-month + holidays calendar.**
5. ✅ **Staff-facing portal + progression** (Part 2) — mining Ocean Boulevard patterns.
6. ✅ **Internal chat** (Part 3).
7. ✅ **Deepen Radar influence** (Part 4) — capacity alerts/hire suggestions as actionable.
8. ✅ **Configurable onboarding + hiring processes** (Part 7) — Ed defines his own.
9. ✅ **Training modules + quizzes** (Part 5) — the builder + assign/gate/track.
10. ✅ **Staff contracts unified** (Part 6) — into the agency contracts surface.

> **Ed flags Parts 5–7 (training, contracts, onboarding, hiring) as the
> "foundations of real stuff… so important… elite."** They can reprioritise up —
> the phase order is simple-first, not importance-first.

## Reuse
`people` module (employees/stations/leave/shifts/**training assignments**/**applications**/**onboarding items**) · agency-hr plugin · Radar `team` domain (31 families — capacity/hiring/training/onboarding engine) · battle-table capacity · `dashboardPlanning` work-sessions (presence) · agency-finance people-payments · tasks (delegation) · the inbox model (chat) · [You Deserve It](you-deserve-it-upgrade.md) (employee-of-month) · **`contractTemplates` + client-contract flow** (staff contracts) · the **website-editor content blocks** (training module builder) · the **configurable-phase/process pattern** (onboarding + hiring) · SOP library · **Ocean Boulevard employee-portal** (patterns).

## Decisions (Ed)
- **Owner-as-staff** — Ed appears as a staff card too (capacity includes him) — confirm.
- **Chat** — a full internal inbox, or lightweight notes/threads to start?
- **Staff portal scope** — how much do staff see (their data + SOPs + progression) vs. more?
- **Freelancers** — full records + one-time job flow, or lightweight for now?
- **Training builder** — reuse the **website-editor blocks** (rich/powerful) or a **simple video+quiz builder** (faster) for authoring modules?
- **Onboarding/hiring config** — fixed templates you tweak, or a fully custom **process builder** (more elite, more work)?
- Want me to do the **focused Ocean Boulevard deep-dive** to extract patterns before Parts 2/5/7?

## Non-goals (v1)
- Not payroll processing — surfacing payments/obligations (finance owns money).
- No AI hire decisions — Radar *suggests*, Ed decides (guess-then-confirm).

## Ties
Radar `team` domain (capacity/hiring), battle-table capacity, finance
(payments), [You Deserve It](you-deserve-it-upgrade.md) (recognition/employee-of-month),
the inbox (chat), SOP library (mission/where-everything-is), the Ocean Boulevard
employee-portal (patterns).

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/server/people.ts`
- `src/server/types.ts`
- `src/server/storage.ts`
- `src/server/contractTemplates.ts`
- `src/app/portal/agency/people/page.tsx`
- `src/app/portal/agency/people/_PeopleCommand.tsx`
- `src/app/portal/team/page.tsx`
- `src/app/portal/team/layout.tsx`
- `src/app/portal/team/_TeamWorkspace.tsx`
- `src/app/portal/team/_data.ts`
- `src/app/portal/team/[section]/page.tsx`
- `src/app/api/portal/people/route.ts`
- `src/app/api/portal/team-chat/route.ts`
- `src/components/people/TeamChat.tsx`
- `src/built-ins/modules/agency-hr/src/server/staff.ts`
- `src/built-ins/modules/agency-hr/src/api/handlers.ts`
- `src/built-ins/modules/agency-hr/src/lib/domain.ts`
- `scripts/smoke-people-workspace.test.ts`
- `src/lib/chrome/sidebarLayout.ts`
- `docs/development/plans/staff-team-system.md`
