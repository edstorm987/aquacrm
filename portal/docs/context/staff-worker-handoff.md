# Staff & Team system — worker handoff

← [context/](README.md) · plan: [staff-team-system.md](../development/plans/staff-team-system.md) · status: [status.md](../development/status.md)

**From:** the Staff worker · **To:** the Commander (and whoever picks this up next)
**Date:** 2026-08-19 · **State:** ✅ all 10 phases shipped + browser-verified

This is the honest debrief — what got built, how it's tested, where it got hard,
what I actually think, and what's left. Read the [plan](../development/plans/staff-team-system.md)
for the design; read this for the *reality*.

---

## TL;DR

The scattered staff surfaces (agency-hr plugin + people module + team workspace +
battle-table capacity + a 31-family Radar `team` domain) are now **one cohesive
Staff Command** built on `PeopleEmployee`. Ed sees every person (himself included),
knows where the team is stretched, delegates, recognises, runs his own hiring and
onboarding, chats with the team, sends contracts, and authors training — and staff
get their own portal with progression, feedback-up, contract sign-off, chat, and
quiz-gated training.

- **10/10 phases shipped**, server-first, each tested and documented.
- **Full suite green** (last local run **1622**, now higher as peers add tests), **typecheck-clean**.
- **Browser-verified** on `:3032` — both the agency command *and* the staff workspace.
- **Zero Radar-engine edits** (the capacity surface only *reads* the cached radar).

---

## What's done (the 10 phases)

| Phase | What shipped | Key files |
|---|---|---|
| **P1** Directory + cards | Filterable directory → per-person tabbed staff card (Overview/Work/Pay/Access/Leave/Training/Notes). Owner appears as a **derived** card (not seeded — no junk in live data). | `staffDirectory`/`staffCard` in `people.ts`, `_PeopleCommand.tsx` |
| **P2** Presence | Honest 3-state presence (online/idle/offline) from work-session heartbeat freshness — an abandoned open session reads offline, not online. "Who's around" strip. | `presenceFromSessions` |
| **P3** Capacity + hiring | Read-only reshape of the Radar `team` domain — health tiles + "where you're stretched" firing signals + capacity-by-area + hiring/coverage. **No engine edit.** Freelancer one-time-job flow (proposed→paid, Finance stays authoritative). | `server/staffCapacity.ts`, `PeopleFreelancerJob` |
| **P4** Delegation + recognition + calendar | Reassign owner/unassigned tasks to staff (reuses `/api/portal/tasks`); employee-of-month + shoutouts; holidays month-grid calendar. | `delegatableTasks`, `PeopleRecognition` |
| **P5** Staff portal + progression | New staff station "My growth & company": role/growth path, company mission (reused `getCompanyProfile`), SOPs, and **upward feedback** to Ed. | `_TeamWorkspace.tsx` progression, `PeopleFeedback` |
| **P6** Internal chat | Full internal inbox — team + direct channels, membership-gated posting, **"working today" roster** from presence. Own store, never the client inbox. | `peopleChannels`/`peopleMessages`, `components/people/TeamChat.tsx`, `api/portal/team-chat` |
| **P7** Configurable processes | Ed's own onboarding template (new hires seed from it) + hiring-stage labels/guidance. **Stage ids stay fixed** so Radar reads never break. | `PeopleProcessConfig` |
| **P8** Org chart | Reporting-line tree from the existing `managerEmployeeId` edge, freelancer layer, department composition, **cycle-safe** (loops → `unplaced`, never infinite). | `staffOrgChart` |
| **P9** Training + quizzes | Block+quiz module builder (content blocks aligned to the portal block model), pure grading, **pass-gated completion**, answer key never sent to the staff client. | `PeopleTrainingModule`, `gradeTrainingQuiz` |
| **P10** Staff contracts | Offer/employment/NDA/commission/policy, reuses `contractTemplates`; draft→sent→acknowledged staff sign-off (only the owning employee's userId may sign). | `PeopleContract` |

**Decisions Ed made** (this session): `PeopleEmployee` canonical · owner-as-card ·
FULL tabbed card · freelancers = full records + job flow · chat = full inbox ·
training builder = content blocks.

---

## What's tested — and how honestly

**19 behavioural cases** in `scripts/smoke-people-workspace.test.ts` — not shape
assertions, real input→output logic:

- days-worked / logged-ms / holiday maths, task counts, derived-owner synthetic-id path
- 3-state presence (fresh→online, quiet→idle, abandoned→offline, ended→offline+last-seen)
- freelancer job lifecycle (stamping + preservation, finance-ref, guards)
- capacity shaper (synthetic radar checks → area/hiring/coverage/attention buckets)
- recognition (shoutout ≠ EOTM, latest EOTM wins, directory-marked)
- delegatable-task selection (owner/unassigned only)
- upward feedback lifecycle; growth-path persistence
- org chart (owner-on-top, nested reports, freelancer layer separate, **cycle→unplaced guard**)
- configurable processes (defaults, persistence, **stage-id stability for Radar**, new-hire seeding, empty guard)
- staff contracts (draft→sent→acknowledged, **only the right employee may sign**, empty-send guard)
- internal chat (team-channel singleton, direct dedup, non-member rejection, empty guard, working-today roster)
- training modules (authoring + validation-drop, **sanitized view hides the answer key**, grading maths, pass/fail gating, only-assignee-completes)

**Full suite:** green every phase. **Typecheck:** clean every phase (with one
hard-won lesson — see challenges).

**Browser-verified** (`:3032`, via Claude-in-Chrome once the extension connected):
- Agency command: all 10 tabs render, **Capacity shows live Radar data** (100%/37%/78%, 43 firing signals with evidence + Act links), Team chat works, **no console errors**.
- Staff workspace: hopped to demo staff via the Dev Mode POV switcher — progression / training / chat stations all render. Exited Dev Mode cleanly.
- **Found + fixed a live bug**: `TeamChat` sat on an infinite spinner if its first fetch lost the HMR-recompile race (error only rendered inside the loaded view) → now shows the error + a Try-again button. Classic "tests pass, running it doesn't."

---

## Challenges (the real ones)

1. **Two staff systems, no shared key.** `PeopleEmployee` (people module) vs the
   agency-hr plugin's `Staff` (roles/departments/permissions). I owned both, so I
   made `PeopleEmployee` canonical and built everything on it — but **agency-hr is
   now redundant and not yet retired** (see What's left). Logged in
   [hazards-and-duplication.md](../workspace/hazards-and-duplication.md).

2. **"Unify contracts into the agency contracts view" — that view doesn't exist.**
   A focused audit found client contracts live embedded per-client
   (`client.metadata.contracts`), the lifecycle is inlined in one client-scoped
   route, and the Legal vault is a separate file register. Building a true
   cross-domain contracts view would mean overloading heavily-shared code. So I
   unified staff contracts *within the Staff Command* and flagged the cross-domain
   view as separate future work rather than forcing it.

3. **The Radar boundary.** P3/capacity had to *surface* the `team` domain without
   touching the Radar engine (a different worker owned it). A read-only reshape via
   `getCachedBusinessIssueRadar` + a pure `shapeStaffCapacity` did it — confirmed by
   audit that no engine file was edited. The browser verify proved it works against
   real radar data.

4. **Verification was blocked for most of the build.** My session couldn't reach the
   shared `:3032` server (isolation), and the file backend writes a *fixed*
   `.data/portal-state.json` — so I could NOT safely start my own server without
   clobbering the shared sandbox (the orchestrator later confirmed: don't do that).
   So for 10 phases I verified via the full suite + behavioural tests and flagged UI
   for the commander. Only at the end did Claude-in-Chrome (real Chrome → localhost)
   unblock self-verification.

5. **HMR churn during browser verify.** With ~8 workers editing concurrently, the dev
   server recompiles constantly — pages showed transient loading spinners and one
   real HMR console race ("Router action dispatched before initialization"). Had to
   verify in settle windows. (This is also what exposed the TeamChat spinner bug —
   silver lining.)

6. **The stale `tsbuildinfo` trap.** Early on, incremental `tsc` reported 0 errors
   while 2 real errors lurked (the auditor caught them). Lesson, applied every phase
   after: **`rm -f tsconfig.tsbuildinfo` before trusting a clean typecheck** mid-edit.

7. **Concurrent edits to shared files.** `types.ts` and `storage.ts` are touched by
   everyone. Kept all my additions strictly additive (new state slots, new optional
   fields) so nothing conflicted. A teammate even extended my chat in parallel
   (`@mentions`, `ownerChatAttention`, unread-tracking) — additive, clean, no collision.

---

## Real thoughts

- **Server-first + test-the-behaviour was the right discipline.** Every phase: model
  → CRUD → pure logic → test → then UI. It meant the UI was assembling tested data,
  and the only genuine surprises were UI-runtime ones (the spinner bug) — exactly
  where you'd expect them. I'd do it identically again.

- **Reuse paid off repeatedly.** Owner-as-derived-card (no seeding), delegation via
  the *existing* tasks API, capacity as a read-only radar reshape, contracts reusing
  `contractTemplates`, mission reusing `getCompanyProfile`. Each dodged a duplicate
  and kept the blast radius tiny. The one place I built genuinely fresh — quizzes —
  is exactly what Ocean Boulevard said was the gap.

- **"A passing test ≠ working" is real and I kept it honest.** I logged "not
  browser-verified" for ten phases rather than imply more, and it turned out to
  matter (the spinner bug). The status register's honesty culture is worth keeping.

- **The capacity surface is the sleeper hit.** Seeing it light up with *real* radar
  signals in the browser (43 firing, with evidence + act links) was the moment it
  felt like an operating system, not a CRM page. That's the whole product thesis.

- **The plan was excellent to build against.** Phases were genuinely simple-first,
  the Ocean Boulevard "lift vs build fresh" mapping was accurate, and the flagged
  decisions were the *right* decisions to flag. Whoever wrote it — thank you. This
  was a joy to build. 🙌

---

## What's left to do

**None of this blocks the plan being "done" — these are follow-ups, ranked.**

1. **Retire / reconcile agency-hr `Staff`** (medium). `PeopleEmployee` is canonical
   now; the agency-hr plugin's parallel `Staff` directory is redundant. Decide:
   migrate its roles/permissions/departments onto `PeopleEmployee` and retire the
   plugin surface, or keep it for its permission model and link the two. Currently a
   documented duplication, not a bug.

2. **Browser-walk the remaining agency tabs** (small). I verified Overview, Capacity,
   Team chat live; Directory/Org chart/Contracts/Onboarding-module-builder render but
   I didn't click every interaction (the demo agency has 0 staff, so most show empty
   states). Worth a pass with a seeded staff member to exercise the card + builder.

3. **Unified cross-domain contracts view** (larger, needs a decision). A single
   surface for client + staff + supplier contracts doesn't exist. Supplier contracts
   aren't even a lifecycle concept yet. This is its own plan if Ed wants it.

4. **Full `_ClientPortalStudio` embedding for module authoring** (larger). P9 uses a
   purpose-built block+quiz builder *aligned to* the portal block model. Embedding the
   real studio editor would give richer authoring — but it's a heavily-shared
   component; do it deliberately.

5. **P4 "deepen Radar influence" — mostly covered, could go further.** The plan's
   Part 4 (capacity alerts / hire suggestions as *actionable* work) is largely served
   by the read-only capacity surface + the existing team-domain checks. Turning a
   suggested hire into an accept-to-commit action (guess-then-confirm) is the elite
   next step — but needs coordination with whoever owns the actions/Radar wiring.

6. **Recognition → "You Deserve It" tie** (small, when that plan moves). EOTM/shoutouts
   are self-contained today; the richer gift/experience side is the you-deserve-it
   system. A future link, noted in the feature index.

7. **Skills matrix, 1:1s/goals, workload view, offboarding+access-revocation, doc
   vault, announcements, anniversaries** — the "recommended elite adds" from the plan.
   All net-new, none started. Good backlog.

---

*Built across one long session, ten phases, server-first and honest. It's been
great work — thanks for the clean plan and the good orchestration. Over to you.* 🫡
