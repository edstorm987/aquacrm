# Goals

← Back to [development.md](../development.md) (the law)

Why AquaCRM exists and what "done" looks like. Update when the direction moves.

## The one-liner
AquaCRM is **Ed's business operating system** — a single solo-founder platform
that runs an agency and every client it serves, and gives each client (and their
end-customers) their own portal. Not a collection of CRM pages: one operating
surface for the whole business.

## Who / where it stands
- **Solo founder, pre-launch, with clients waiting for onboarding.** Do not assume
  every record is disposable test data: local file state and the configured
  Supabase project are separate, and development paths can still reach live
  tables. Use an isolated sandbox and clearly labelled fixtures.
- Next.js 16 App Router, React 19, TypeScript strict, at `aquaCRM/portal/`.
- **The first commit and push are complete** on
  `work/2026-08-20-parallel-session`; it is not merged to `main`. The working
  tree continues to carry active uncommitted work, so never discard files to
  “clean up” another worker's changes.

## The operating model (the non-negotiable shape)
- **Agency workspace** = the macro/portfolio view (Ed's whole business).
- **Client workspace** = the *same* capabilities at a single-client micro level.
- **Customer portal** = only the deliberately-shared surface for end-customers.
- Four spines: **Journey** (people/sales/enquiries), **Fulfilment** (delivery),
  **Finance** (money), **Command Centre** (Ed's day + monitoring/Radar), tied by
  the **Master Inbox** (communication + actionable attention).

## Current strategic goals
1. **Ship the standard portal.** One **Website** product, phases Onboarding → Design → Develop → Published. Rebuild the rest of the catalogue one product at a time (deliberate scope-down — don't re-sprawl).
2. **Get enquiries + websites flowing in cleanly** via the Aqua Tag → inbox, with correct routing (agency vs client).
3. **The Aqua Tag as the spine of acquisition + a consent-gated tag manager** — one tag that captures forms, tracks telemetry, respects consent, and injects configured GA/PostHog/Meta only after consent. Dogfood on Ed's own sites first; production routing values still need re-entry.
4. **Trustworthy monitoring** — Radar tells the truth (health vs evidence vs readiness; missing evidence is a visible blind spot, never a pass).
5. **Compliance-grade data handling** — real erasure, consent, audit trails.
6. **Launch** to real clients.

## Immediate finish line (source/runtime-reviewed 2026-08-24)

Before “launch” means reliable rather than merely broad, close P0 central session
revocation, then P1 erasure false-success/retry/audit and showcase mutation/
isolation. After those, close storage/recovery, the Editor AI distributed
contract, editor transition/prefill and staff-policy drift, data truth and
read-path performance; then complete the named browser journeys.
[checklist.md](checklist.md) owns the live order.

## Principles that shape how we build
- **Guess, then human-confirm** — matching/classification suggests; a human accepts. Never auto-commit suggested work.
- **Honesty over vanity** — no fabricated numbers; missing data shows "—"/"Learning"/"blind", never a fake healthy value.
- **Reuse → repurpose → simplify** before building new — the codebase already duplicates several features; don't add a third.
- **Plain and simple** — Ed's been at this for months; short, honest, no walls.

_Related: [roadmap.md](roadmap.md) (the roadmap), [notes.md](notes.md) (decisions),
and the memory notes `aquacrm-project-shape`, `portal-products-scope-down`,
`aqua-tag-as-consent-tag-manager`._
