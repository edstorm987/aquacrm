# Information Architecture v2 — the five surfaces (Command · Inbox&Actions · Executive · Operations · Tools)

**Status:** planned — Ed's culminating IA vision 2026-08-20. BIG restructure, phased. Reshapes
the whole sidebar for agency AND staff portals. Needs Ed's sign-off on the taxonomy (below)
before build. Heavily touches sidebarLayout.ts — must run AFTER the inbox+actions + shell lanes.

## Ed's vision (verbatim intent)
> "Merge most things into an Operations sidebar element — business functions — so delegation to
> staff is 10x easier; everything stems from what's inside Operations. (Dev Team is a part of
> Fulfilment btw.) Create a new one called Executive — the directions — extremely high leverage.
> Ed's owner portal becomes: Command Centre, Inbox & Actions, Operations, Tools — super simple,
> highest leverage, impossible to lose. Staff portals follow the same: Command Centre (their
> stuff / employee portal), Inbox & Actions, Operations, Tools. Whatever I select for their
> Operations is what they can access. This becomes very scalable very fast."

## The five surfaces
1. **Command Centre** — NOW / the live operating view. For the owner: your day, monitoring, what
   changed. For staff: their employee portal — their day, tasks, pay/time, their stuff.
2. **Inbox & Actions** — everything that needs attention + doing (the unification already in flight).
3. **Executive** — DIRECTION: where we're going and how we're doing at the top. (NEW surface, but
   the pieces exist as Command Centre stations today.)
4. **Operations** — the DOING: the business functions, **role-configurable**. Whatever a person is
   granted appears in their Operations; that IS their access. This is the delegation engine.
5. **Tools** — utilities.

That is the ENTIRE owner sidebar. Staff get the same five, with Operations scoped to their grants.

## Proposed mapping of today's 13 items → the five (Ed to confirm the Executive/Operations split)
| today | → surface |
|---|---|
| Command Centre | **Command Centre** (stays) |
| Master inbox + Actions | **Inbox & Actions** (merging now) |
| Battle Table · Radar · Command Intelligence · Capital/Ownership · Day briefing | **Executive** (pulled out of Command Centre stations) |
| Journey (sales/pipeline) | **Operations → Journey** |
| Fulfilment (+ **Dev Team** + Aqua tags) | **Operations → Fulfilment** (Dev Team lives here) |
| Finance | **Operations → Finance** (strategic capital/ownership may sit in Executive — decide) |
| Staff · Freelancers | **Operations → People** |
| Marketing | **Operations → Marketing** |
| SOP library / SOP Engine | **Operations → SOPs** |
| Governance (compliance + security — the old "Operations" plan) | **Operations → Governance** |
| You deserve it | **Executive** (owner rewards/motivation) — or its own; decide |
| Tools | **Tools** (stays) |

## The delegation engine (why this is 10x)
Operations contents are driven by **role + grants**, riding the existing plugin `features` map +
roles. To onboard/delegate to a staff member you pick what their Operations contains; that is
their whole access surface. Staff portal = Command Centre (their employee stuff) + Inbox&Actions
+ Operations (scoped) + Tools. Provisioning a new hire becomes "tick the Operations they need".
This also is exactly how the **company builder** ("operational CRM vs marketing — toggle features")
falls out for free: Operations is the toggled set.

## Reconciliations
- **"Operations" name collision:** the existing operations-command-surface.md ("Operations =
  governance") becomes **Governance INSIDE the new Operations**. The big container takes the name;
  governance keeps its KNOW-first design as a section.
- **Command Centre vs Executive:** today's Command Centre bundles daily-operating AND strategic
  (Battle Table, Radar). v2 splits them: daily → Command Centre, strategic/direction → Executive.
- **Dev Team** = Operations → Fulfilment → Dev Team (recontextualises the shipyard workspace as
  fulfilment's build arm).

## Phases
1. **Executive surface** — new top-level; move the strategic stations (Battle Table, Radar,
   Command Intelligence, Capital/Ownership) into it; Command Centre keeps the daily view.
2. **Operations container** — new top-level that nests the business functions as sub-areas
   (Journey, Fulfilment, Finance, People, Marketing, SOPs, Governance). Old top-level items become
   Operations sub-nav; every old route redirects so nothing breaks.
3. **Role-configurable Operations** — grants drive what appears; wire to the plugin features + roles.
4. **Staff portal mirror** — the same five surfaces for staff, Operations scoped to grants.
5. **Retire the flat sidebar** — the sprawl is gone; five surfaces remain.

## Open decisions for Ed (the taxonomy crux — confirm before build)
- **Executive vs Operations line:** is Finance operational (Operations) with only Capital/Ownership
  in Executive, or all Finance in Operations? Where does Marketing's strategy vs execution split?
- Does **"You deserve it"** belong in Executive, Command Centre, or stand alone?
- Is **Executive** owner-only, or do senior staff get a scoped Executive too?

## Files (broad — big restructure)
`src/lib/chrome/sidebarLayout.ts` (the core), `src/app/portal/agency/**` (route nesting +
redirects), new `src/app/portal/agency/executive/**` + `operations/**` shells, the staff portal
layout, roles/grants + plugin features layer. Overlaps many SHARED files — phased, one surface at
a time, never all at once.
