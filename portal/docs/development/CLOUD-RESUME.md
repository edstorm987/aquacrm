# Cloud resume brief — 2026-08-30

Ed switched to cloud mid-session. This commit is the FULL local state pushed to
main on his explicit instruction ("get all my local onto main, i dont care if
it breaks"). Read this first, then LOOP-PROGRESS.md, AUDIT-2026-08-30.md and
ED-QUESTIONS.md — those three are the live queues.

## State at handoff

- Suite was **5,494 / 0 fail / tsc clean** before the final ~30 minutes of
  work. Since that run: getSession memoization (agent, its own 137/137 pass),
  the Kanbans feature (complete build, tsc clean, its new smoke
  `smoke-journey-kanbans-desk.test.ts` written but NOT yet executed), and the
  route census moved 156→158. **First job on resume: run the canonical suite**
  — `NODE_OPTIONS='--conditions react-server' node --import tsx --test
  scripts/smoke-*.test.ts 'src/built-ins/modules/!(website-editor)/src/__smoke__/*.test.ts'`
  — and fix anything red before new work. Expect possible small failures in
  the kanban smoke (never run) and anything pinning clients/page.tsx or
  [slug]/page.tsx source.
- An in-flight design (Plan agent) for the proxy/access-kernel alignment (audit
  item A1) did not return before handoff — re-derive from
  AUDIT-2026-08-30.md's A1 row if needed.

## What landed today (all in this push)

Settings restructure (16 tabs, aliases, search, editable identity via new
/api/portal/agency/identity), timezone picker, logs pagination, Tools palette
(savedTools + savedToolUrl allow-list), Operations belt + luxury finish,
workspaces→Operations move, My Radar topbar control (+ gated
/api/portal/intelligence/my-radar), inbox merge (3 tabs + cog modal + combined
Needs-you count) + premium messaging redesign, scouting tab + outreach
(server-gated + server-recorded) + quota rings/streak, convert→fulfilment
handoff, growth governed workspace, Kanbans desk + custom boards
(/api/portal/pipelines/boards + /cards), MFA lockout fixes + cold-start
hydrate/flush, password-reset provisioning + scoped nonce restore, founder
email gate closed on the SEND path (name/reply-to too), per-send idempotency
keys, prospect-aware suppression, department stamp gating via
agencyBasePanels, role-filtered search registry, custom CSS actually injected
(?nocss=1 real), CSV formula defusal, realm-runtime LRU cap, getSession
request-memoization.

## Live queues (in priority order)

1. Canonical suite green (above).
2. AUDIT-2026-08-30.md — A1 (proxy↔kernel) and A8 remainder (lazy stations,
   settings pane splits, SMTP deadline, inbox waterfalls), activity-log races +
   windowed All, inbox URL resync, pipeline search → growth.leads.
3. LOOP-PROGRESS.md queue — command-centre regrouping design
   (scratchpad/design-command-centre.md may be gone on cloud; judged flags are
   reproduced in LOOP-PROGRESS), info-icons pass, website demo Stage 1
   (per-visitor realms — see the one-sentence rule in the demo plan: NOTHING
   demo ever in the live realm), performance re-measure.
4. ED-QUESTIONS.md — blocked on Ed (D1 customer passwords, Resend domain,
   Twilio, demo retention, terms).

## Rules that keep this codebase safe (hard-won today)

- Grep scripts/*.test.ts before "fixing" anything absent — tests pin decisions.
- Never run the smoke suite while a file-backend dev server shares .data.
- Browser-verify on a fork lane via 127.0.0.1 ONLY (localhost cookie jar is
  shared across ports and will clobber Ed's live session; allowedDevOrigins
  covers 127.0.0.1; /dev mints the cookie before its redirect hops host).
- docs/0*.md and docs/reference/* are GENERATED — edit sources, re-run
  consolidate-authored-docs.mjs / generate-symbol-reference.mjs.
- website-editor __smoke__ files need OPPOSITE node conditions — never sweep
  them into the main suite glob.
