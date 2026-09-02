# Issues, audits and tests

> Verified findings, independent reviews, browser audits and the testing record.
>
> Consolidated 2026-09-02 from **11** source documents / **117,622 words**. Each source is retained verbatim between provenance markers. The original path remains alongside it because relative links and runtime-backed Dev Team records still resolve from that location during the compatibility phase.

## Source map

- [`docs/context/auditor-brief.md`](#source-docs-context-auditor-brief-md) — 1,437 words · `360272738775`
- [`docs/development/AUDIT-2026-08-30.md`](#source-docs-development-audit-2026-08-30-md) — 670 words · `32afb89f6627`
- [`docs/development/audits.md`](#source-docs-development-audits-md) — 36,747 words · `a2883afd9cc4`
- [`docs/development/findings/2026-08-22-agency-staff-can-read-salaries.md`](#source-docs-development-findings-2026-08-22-agency-staff-can-read-salaries-md) — 502 words · `7c087bfecb74`
- [`docs/development/findings/2026-08-22-app-audit-salvage.md`](#source-docs-development-findings-2026-08-22-app-audit-salvage-md) — 1,294 words · `16f6f10e5bc4`
- [`docs/development/findings/2026-08-22-stripe-can-never-be-configured.md`](#source-docs-development-findings-2026-08-22-stripe-can-never-be-configured-md) — 466 words · `e91f13c8620f`
- [`docs/development/findings/2026-08-22-surfaces-that-state-a-falsehood.md`](#source-docs-development-findings-2026-08-22-surfaces-that-state-a-falsehood-md) — 892 words · `dfeb4a6302c1`
- [`docs/development/issues.md`](#source-docs-development-issues-md) — 42,059 words · `6378e18532ac`
- [`docs/development/tests.md`](#source-docs-development-tests-md) — 14,470 words · `ff95a4f0ff65`
- [`docs/development/ultra-review-2026-08-24.md`](#source-docs-development-ultra-review-2026-08-24-md) — 15,503 words · `6725e738af21`
- [`docs/development/visual-browser-audit-2026-08-23.md`](#source-docs-development-visual-browser-audit-2026-08-23-md) — 3,582 words · `3ee9b61d74e3`

---

<a id="source-docs-context-auditor-brief-md"></a>

## Source document — `docs/context/auditor-brief.md`

<!-- AQUACRM_SOURCE_START path="docs/context/auditor-brief.md" sha256="360272738775b7050d292e9d0a9db74655454b75be88e221688e7a3d396613ca" -->
# Auditor brief — spin the looping auditor

← [context/](README.md)

The **independent auditor** verifies shipped work before it's trusted as done.
It is a **different chat from every builder** (never self-audits), it is
**read-only on source** (reports findings, never fixes — that's how it can never
collide with a worker), and it writes **only** to
[audits.md](../development/audits.md).

The recurring loop is currently stopped. Ed starts an audit on request; the
auditor uses the docs to find shipped-but-unaudited work, audits it and logs a
verdict. The template still supports a one-sweep-per-tick loop if Ed explicitly
re-enables one later.

> ⏸ **The recurring loop is currently STOPPED (Ed, 2026-08-19) — re-audits are ON-REQUEST.**
> It does not auto-fire. When a fix lands, someone must re-run `/loop` in a fresh Auditor chat.
> Verdicts also surface in the Dev Console at **Findings → `?view=auditor`** (the Findings and
> Auditor sections were combined on Ed's call — "same thing, one manual one automated").

## The paste-ready template
```
You're the AUDITOR for AquaCRM (Next.js 16 / React 19 / TypeScript),
working dir: aquaCRM/portal/. You run on a loop — each run is ONE audit sweep.

You are INDEPENDENT. You did not build any of this. Your job is to try to prove
"done" is a lie, from the diff + the docs + actually running it — not to trust
the builder's self-report.

ORIENT (read in this order):
1. docs/development.md — the project law (esp. the CLAUDE.md non-negotiable contracts).
2. docs/development/updates.md — what builders CLAIM shipped (newest first).
3. docs/development/audits.md — what you've already ruled on (so you don't re-audit).
4. docs/context/auditor-brief.md (the "Conventions" + "Audit checklist" below).

EACH TICK (one sweep):
1. Build the PENDING QUEUE: every updates.md entry claiming a phase/plan shipped
   that has NO matching verdict in audits.md. Key it by the entry's date + title.
2. Queue empty? → append a one-line "✓ nothing pending" note is NOT needed; just
   say "clean — all shipped work audited" and END the tick. (a no-op tick)
3. Else take the OLDEST unaudited entry (audit in ship-order) and audit it against
   the checklist below. Drain more if you have time; one per tick is fine.
4. Write a verdict block to the TOP of docs/development/audits.md
   (PASS / PASS WITH NITS / REWORK + ranked findings, each with file:line + the fix).
5. If REWORK or any 🔴 finding → put a loud line at the very top of audits.md so the
   commander routes it back to the builder. END the tick.

HARD RULES:
- READ-ONLY on source. You NEVER edit source or tests. You run tests + the app to
  verify, and you write ONLY to docs/development/audits.md. (This is what keeps you
  from colliding with a live builder.)
- Re-run the FULL suite yourself — don't trust the reported count:
  PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx --test scripts/*.test.ts
- A green suite ≠ working. Actually run it in the app on YOUR OWN ISOLATED server:
  npm run sandbox:fork -- auditor <port>   (then run the command it prints)
  That gives you your own state file + build dir + port. Do NOT use bare `dev:verify` —
  it writes the SHARED sandbox and clobbers whoever else is running. Never assume :3032.
  Sign in with no credentials at http://localhost:<port>/dev .
- Live Supabase is NOT sandboxed. If you verify anything against the admin client,
  read-only — never write junk.
- Report findings; do NOT fix them. The builder reworks. You only write audits.md.
- NEVER TOUCH GIT. Not commit, not push, not checkout, not restore. The tree is entirely
  uncommitted, so a `git checkout <file>` deletes a live worker's unshipped work; a push
  triggers Vercel -> production. There is no git step in your job.

Confirm you've read the law + the checklist, then run your first sweep.
```

## Audit checklist (what "verified" means)
Run these against the entry you're auditing. Any **No** is a finding.

- **A · The claim is true.** It says X shipped — did X actually ship *and work*?
  Re-run the full suite (confirm the count, zero fails), then run it in the app
  where it's user-reachable. Move it up the maturity ladder in
  [status.md](../development/status.md) honestly (coded → static-tested →
  runtime-verified → user-reachable).
- **B · Tests are real, not gamed.** New test asserts **behaviour**, not just
  source-shape / string-match? Check the diff for any existing contract test that
  was **weakened, skipped, or deleted** to go green — that's a red flag.
- **C · The non-negotiable contracts held** (from CLAUDE.md): multi-company/
  multi-workspace preserved · internal stays internal unless explicitly
  client-visible · Radar distinguishes **health vs confidence vs readiness**
  (missing evidence = a visible blind spot, never a healthy pass) · suggested work
  needs **human acceptance** before it's committed · **role + agency scope**
  enforced on every server mutation · reclassifying a `Person` **keeps their
  facets** (changing what someone IS never deletes what they DID) · every action
  states its **kind** (in-app/off-system/judgement) + **what clears it** (no
  Resolve for off-system work) · live enquiry/erasure/inbox paths guarded.
- **C1 · Session revocation is behavioural, not decorative.** Reuse the exact old
  cookie after downgrade, password change and removal against the changed route
  and representative central `requireRole()`/request-cookie paths. A stamped
  `sessionRev` field or an isolated `isSessionFresh()` caller is not proof.
- **C2 · Read-only means operation, not verb.** For showcase work enumerate
  mutating `GET` handlers and OAuth callbacks; prove they are refused and that
  concurrent visitors do not share/reset one fixture.
- **C3 · Erasure failure is a first-class outcome.** Inject hosted-table failure;
  require an incomplete response, a durable retry path after local deletion and a
  permanent audit with no client name/identifier. Successful fake-client coverage
  alone is insufficient.
- **D · Reuse, not a third copy.** Did they build something that already exists?
  Cross-check [hazards-and-duplication.md](../workspace/hazards-and-duplication.md)
  + [feature-index.md](../workspace/feature-index.md).
- **E · Scope + safety.** Stayed inside their **owned files** ([state.md](state.md))?
  Touched a shared foundation (radar / `websiteSources` / `types.ts` / `kpiRegistry`)
  without flagging? Junk written to live Supabase? Any git commit/push slip (there
  must be none)?
- **F · Docs are true.** Docs match what shipped — chapter updated, symbol
  reference regenerated if code changed (`node scripts/generate-symbol-reference.mjs`),
  updates.md entry honest (no "done" that's only static-tested)?

## The three verdicts
- ✅ **PASS** — claim verified, contracts held, tests real + green, ran it, docs true. → commander marks the item done.
- 🟡 **PASS WITH NITS** — works; minor non-blocking findings logged as follow-ups. → commander marks done, logs the nits.
- 🔴 **REWORK** — a contract broken · a test that's shape-only / weakened / deleted · a doc overclaim · a real bug · or a "done" you couldn't verify. Each finding gets **file:line + the fix**. → commander routes it back to the builder.

Finding severity: 🔴 blocker (contract broken / launch-blocker regressed / data risk) · 🟠 major (real bug, weakened test, overclaim) · 🟡 minor (nit, doc gap).

## Conventions (the auditor contract)
- **Independent, always.** A different chat from the builder; audits from the diff
  + docs + a real run, not from anyone's say-so.
- **Read-only on source.** Findings, never fixes. Writes only [audits.md](../development/audits.md).
  This is the anti-collision rule — a read-only auditor can run alongside any live worker.
- **The docs are the queue.** `updates.md` (claims) minus `audits.md` (verdicts) =
  what's pending. State lives in files, so the loop survives a re-spin.
- **Loud on failure.** A REWORK or 🔴 goes to the top of audits.md so the commander
  sees it and routes it — the auditor can't relay to the builder itself (Ed is the bus).
- **Own server.** Fork your own isolated sandbox (`npm run sandbox:fork -- auditor <port>`) for
  runtime checks — never the shared one, never someone else's port.
- **Never touch git.** Ever — not even `checkout`.
- **Doc claims are audit-able too.** A doc that says a blocker is open when the source shows it
  fixed is a 🟠 finding: on 2026-08-20 three already-fixed "🔴 launch blockers" were still briefed
  as open and one would have sent a worker back into a hardened auth route. Check claim ↔ source
  both ways.

## The handoff loop
```
Builder ships a phase ─▶ logs the claim in updates.md
                              │
Auditor (looping) ── each tick ─▶ pending = updates.md − audits.md
                              ├─ audits the oldest unaudited (re-runs suite, runs the app,
                              │   checks contracts / tests-real / reuse / scope / docs)
                              └─ writes a verdict to audits.md  (loud if REWORK/🔴)
                              │
Commander reads audits.md ──▶ PASS/NITS → mark done in state.md + todo.md (+ log nits)
                              REWORK     → findings back to the builder (via Ed) → fix → re-audit
```
```
<!-- AQUACRM_SOURCE_END path="docs/context/auditor-brief.md" -->

---

<a id="source-docs-development-audit-2026-08-30-md"></a>

## Source document — `docs/development/AUDIT-2026-08-30.md`

<!-- AQUACRM_SOURCE_START path="docs/development/AUDIT-2026-08-30.md" sha256="32afb89f6627314039f21b2e14f98a253326093e8cdefe839c9e43280a79f321" -->
# Ed's audit — 2026-08-30 (second wave)

Live queue. Every item verified against source before fixing; status updated as
each lands. Severity order, not arrival order.

## Critical — being fixed now

| # | Finding | Status |
|---|---|---|
| A2 | Scouting opt-out not truly server-enforced: resolveCaller gathers contacts+leads, NOT prospects — the records carrying doNotContact. sms/wa.me links bypass inspection+suppression+logging | fixing |
| A4 | Resend idempotency key `outreach:${contactId ?? to}` identifies the RECIPIENT, so distinct follow-ups dedupe/reject. Reset + magic-link emails have similar fixed keys | fixing |
| A7 | Reset flow: ambiguous Supabase failure restores the single-use nonce even if Supabase committed; success-then-portal-failure leaves nonce spent with old sessions alive; duplicate full user scans | fixing |
| A3 | EmailButton keeps open/subject/body state across prospect switches — a draft for A silently readdresses to B | fixing |
| A5 | Delivery and journey logging are two requests; nav/network failure loses history+quota. Device (tel:) calls fire onCalled before any call happens → never meaningfully counted | fixing |
| A-quota | "Personal" quotas count agency-wide records for prospects-scouted / leads-qualified / clients-converted (no per-actor attribution exists on those records) | fixing — label honestly + only offer per-user metrics as personal |
| A-css | resetUserChromeOrder omits customCss → sidebar reset erases the stylesheet | fixing |
| A-tools | My Tools can save before initial load completes; unordered full-record PUTs clobber newer changes | fixing — ready gate |
| A6 | Non-founder agencies with their own Resend key still inherit founder MILESYMEDIA_FROM_NAME / REPLY_TO | fixing |

## Large / architectural — planned, not this tick

| # | Finding | Plan |
|---|---|---|
| A1 | Proxy vs access kernel | **PLAN COMPLETE (2026-08-30, Plan agent).** Key verdicts: the proxy CANNOT consult the kernel (Edge runtime, storage unreachable, and it reads the cookie payload UNVERIFIED — it is a fast optimistic boundary, not the boundary; note its header comment claiming HMAC verification is stale). Target model: kernel projection `resolveActorWorkspaceElementAccess` is the ONE decider; proxy keeps a deny-by-default containment list extracted to a new edge-safe `src/lib/access/staffSurfaceRoots.ts` guarded by an hr-policy-convergence-style tripwire (a root may join only when its leaves provably call the kernel). Stages: 0 extract-don't-change (repoint smoke-next-route-contracts:39-41 + smoke-workspace-element-runtime:226-227); 1 open my-radar + chrome/department API roots for staff AND element-gate /portal/agency/my-radar page FIRST (order matters); 2 telephony onto growth.outreach view/use (keep role belts; census unchanged); 3 settings resolver — canonical agency-scope grants first, getAgencySettingsCapabilities as documented legacy fallback, ADD the missing capReadOnlySession parity; 4 growth nav row in agencyBasePanels so sales hats work (gated on Ed decision); 5 the proxy list dissolves family-by-family, NEVER deleted (it contains requireRole([AGENCY_ROLES]) routes that admit staff). ED DECISIONS: manageTeam→staff.people.manage vs workspace.settings.manage; may staff be GRANTED into settings at all; where staff growth surfaces live; #174 legacy-widening extends to settings. Also: buildAgencyAccessScopeChoices lacks the growth workspace scope choice — add alongside. |
| A8 | Perf: getSession not request-memoized (repeat Supabase getUser); Journey eagerly imports Scouting station; Inbox ships hidden workspaces + serial waterfalls; Settings static-imports every pane + serializes all data; SMTP lacks deadline; provider outcome metadata discarded | Dedicated perf tick: memoize getSession (React cache()), dynamic-import stations, defer hidden-tab data. Each lands with the graph-split smoke |
| A-log | Activity Log: stale-response races, 50k-row "All" render, repeated client lookups, CSV formula injection | CSV injection fix goes in the critical wave (prefix guard); races + windowed All next |
| A-inbox-url | Inbox URL view/thread/form state does not resync on navigation | With the inbox agent's pass (its file) — queued after it reports |
| A-search | Pipeline search maps pipelines to fulfilment.services not growth.leads | One-line after the growth workspace lands (this session added it) |
| A-quota-race | Quota form allows duplicate targets during slow submissions | Disable-while-submitting + server-side same-metric+recurrence upsert |
| A-untracked | Essential new modules untracked — tracked diff cannot reproduce checkout | ED-QUESTIONS: needs Ed's go-ahead to commit (standing rule: never commit unasked) |
<!-- AQUACRM_SOURCE_END path="docs/development/AUDIT-2026-08-30.md" -->

---

<a id="source-docs-development-audits-md"></a>

## Source document — `docs/development/audits.md`

<!-- AQUACRM_SOURCE_START path="docs/development/audits.md" sha256="a2883afd9cc42eddc43c8c563d7d47aa72e5cf613cd33950363c6f08846864b4" -->
# Audit log

← Back to [development.md](../development.md) (the law) · Auditor how-to: [auditor-brief.md](../context/auditor-brief.md)

> ## 🚨 CURRENT CHECKPOINT — P0/P1 source + runtime review 2026-08-24
> The authoritative current position is [checklist.md](checklist.md). The last
> documented whole-suite run remains **3,621 pass / 0 fail / 1 skip on
> 2026-08-23**; it was not rerun by this documentation pass. The 2026-08-24
> review now has a **P0:** a stale owner cookie created a working external-AI API
> token after the live user was downgraded to staff because central role helpers
> do not enforce current `sessionRev`/role. P1s: mutating showcase GET/OAuth paths;
> erasure false-success/non-retry/audit-name; Editor AI distributed coordination;
> unsafe file persistence; editor transitions/prefill; staff-policy drift; data
> truth and browser acceptance. See issues #16–#25. The same-day **98/98** focused
> run remains useful source/memory evidence but closes none of these runtime
> boundaries by itself.
> Every verdict below is preserved dated evidence, including claims later
> narrowed or superseded.

> ## 🟡 SUITE effectively green — 2382 pass / 0 fail · `tsc` 0 errors (2026-08-20, commander-verified) — **but one red observed since**
> **No open 🔴 findings.** The three items that were briefed as
> "🔴 launch blockers" are all **fixed in source** — freelancer preview escalation
> (`api/auth/preview-as-freelancer/route.ts:49,101`), finance create-surface
> idempotency (`agency-finance/src/lib/idempotency.ts`, wired into six surfaces),
> and the erasure email-in-log (`leads-pipeline/src/server/contacts.ts:168,227,252,279`
> log an id, never an address).
>
> ⚠ **One red was observed during the 2026-08-20 docs pass, after that count was
> taken:** `smoke-dev-tasks-parse.test.ts:65` fails in isolation (12 pass / 1 fail)
> — "the three real plans that rendered as finished are not finished". This is the
> same churning internal dev-tooling the auditor flagged at tick 53, but the cause
> is now the **opposite** of a product defect: the test still asserts
> `/BLOCKED on Ed/i` against the marketing plan's "Cohere" phase, which has
> legitimately since become **"✅ Cohere — SHIPPED"** (Ed's call was made;
> ten views → five landed 2026-08-20). **The plan is right and the test is stale** —
> it pins a doc state that was supposed to change. Routing note: the fixture at
> `smoke-dev-tasks-parse.test.ts:49` needs re-pointing at a still-blocked phase, or
> the assertion needs to stop depending on live plan prose. Not fixed here — this
> was a docs-only pass and the test is source.
>
> ⚠ **How to read this file.** Everything below this banner is a **dated verdict —
> a record of what was true when it was written, not a status board.** Several
> verdicts below correctly report reds and 🔴s that have since been fixed; the
> banner is the only line here that claims to be current. For current state read
> [checklist.md](checklist.md); for whether a specific thing is done, read the
> **source**, then that item's plan `**Status:**` line.
>
> _Superseded by the above (kept for the record):_ tick 53 reported
> "2408 pass / 1 fail / 1 skip" with `smoke-dev-tasks-parse` red, after resolving
> Meta security (5/5), the roadmap dangling-ref and the `seventyNinthCollection`
> state-collection data-loss gap (wired into `parseBlob`/`empty()`,
> `smoke-state-roundtrip` 3/3).

> ✅ **RESOLVED (2026-08-20, docs-correction pass — source-verified, not an auditor re-run)** — the `mfa-login` "Phase 4 complete" claim and the MFA-at-login gap are **both closed**. The tick-~40 ruling below was correct **when written**: `/api/auth/login` genuinely had zero MFA. It has since been built, and the ruling outlived the fix in four documents at once — which is exactly the drift this pass exists to stop. **Evidence:** `api/auth/login/route.ts` imports `loginMfaStep`/`raisedToSecondFactor` (`:19-22`), refuses a session for an enrolled account with no code (`:312-320`), rate-limits code attempts (`:329`), runs the real Supabase `mfa.challenge`/`mfa.verify` (`:340-345`), and **re-reads the returned token's own `aal` claim, rejecting a 200 that did not actually raise assurance** (`:355`); `app/login/LoginForm.tsx` handles `401 { mfaRequired: true }` (`:110-115`) and renders the code field (`:197-211`); native form posts carry `code` through (`:151`). **Still genuinely open:** mfa-login Phases 3–4 (session assurance, recovery codes) — see that plan's `**Status:**` line. `issues.md #10`, `todo.md` and `development.md` corrected to match.

> ✅ **RESOLVED (2026-08-19, auditor)** — Freelancer preview MANAGER → OWNER escalation is **closed** and behaviourally regression-tested (`exit` restores the exact enterer, no owner fallback). Was a 🔴; verdict in the body.

> ✅ **RESOLVED (2026-08-19, auditor — tick 16)** — client erasure PII hole is **closed**. The hook was in fact a total no-op (it filtered on `Contact.clientId`, which nothing writes) — the builder fixed it to resolve the client's people via the real links + strip/anonymise all PII, made every log message id-only, and added a test that drives the real `upsert→convert→promote→update` flow and asserts **zero trace of email/phone in any value or key** (fails on the old code). 18/18 isolated. Was the LAST launch blocker; verdict in the body. **→ Commander: un-hold the gate; final clean full-run once the worker settles.**

The independent auditor's verdicts, newest first. **This is the record of what's
been *verified*, not just claimed.** The auditor writes here; the commander reads
here to mark work done or route rework.

**The pending queue = [updates.md](updates.md) entries with no verdict here yet.**
Key each verdict by the updates.md entry it covers (its date + title) so the loop
knows what's already ruled on.

Format per audit:
```
## YYYY-MM-DD — VERDICT — <the updates.md entry title it covers>
**Verdict:** ✅ PASS | 🟡 PASS WITH NITS | 🔴 REWORK
**Audited:** what you actually did (suite re-run + count, ran-in-app y/n, contracts checked).
**Findings:** (none | ranked list, each: 🔴/🟠/🟡 · file:line · the problem · the fix)
**→ Commander:** the one-line action (mark done / log nits / route rework to <worker>).
```
A REWORK or any 🔴 finding also gets a **loud one-liner at the very top of this
file** so the commander can't miss it.

---

## Pending queue at auditor start (2026-08-19)
Shipped-but-not-yet-audited, oldest first (audit in this order):
1. **Connect-flow Phase 1** — real emailed codes, generate+store+verify (`00000` behind dev gate). 🔴 launch blocker — audit every phase.
2. **Erasure Phase 1/5** — `onEraseClient` hook contract (additive). 🔴 launch blocker + touches live data — audit every phase.
3. **Radar upgrade — COMPLETE** (7 stages + probe cron + external-DB monitoring + UI panels). Large; audit the plan as a whole, spot-check the live-data + contract-heavy stages (infra health, actionable tasks, coverage).

_Verdicts below, newest first (insert new ones directly under the pending-queue snapshot above)._

## 2026-08-22 — ✅ PASS (verified source + EXECUTION, applying the corrective) — "The API behind the closed pages + client-record workspace"

Audited the API-level access-control fix — the counterpart to tick-180's page fix, closing **exactly the gap I flagged at tick 183** ("these API routes do not yet have such a guard"). This time I applied the tick-182 corrective in full: whole-class + trust-boundary + ran-the-guard.
- **The hole (real, severe):** the plugin API dispatcher (`api/portal/[module]/[...rest]/route.ts`) had NO surface rule — its only gate was `route.visibleToRoles ?? route.roles`, and **undefined = "anyone with a session" for 133 of 312 routes**. A gated page whose API still answers is not gated. Plus the **client-record workspace** (`/portal/clients/[clientId]`) gated on `requireRoleForClient([...ALL_ROLES])` (tenancy, not ownership) → an `end-customer` attached to the client opened finance/contracts/notes.
- **Fix [1] — API ceiling, source-verified:** `_pageScope.ts:227-233` extends the same ceiling model to routes — "a route must never be wider than the page it backs," undeclared inherits the ceiling, declared intersects, `public:true` untouched. The 133 undeclared routes now capped. end-customer reachability 146→20 (public webhooks + `me/*`), lead 134→7. ✓
- **Fix [2] — client workspace, source-verified:** `layout.tsx:65` now `requireRoleForClient([...SURFACE_ROLE_CEILING.client], clientId)` (was ALL_ROLES) + `redirect("/portal")` (`:67`), both page + layout; `requireRoleForClient` still enforces tenancy on top. end-customer/lead excluded. ✓
- **Fix [3] — the default-allow bug (`:124`), source-verified:** `scopePolicySurfaces` (`:153`) is now exhaustive with `const unreachable: never = policy` (`:161`) — an unknown `scopePolicy` resolves to **no surface** (default-deny) instead of the old `["agency","client"]` (default-allow in a default-deny file); tsc catches unhandled union members. ✓
- **Execution evidence (my corrective, not just trusting the guard):** `smoke-plugin-api-host-gates.test.ts` uses `issueSession` for REAL sessions (`:56`), drives the REAL dispatcher over every route × method × all 8 roles (`:21-29`) + synthetic-manifest mutation checks + negative control — **ran it in isolation: 22/22 pass.** ✓

**Verdict: ✅ PASS.** The access-control class is now closed the durable way in all three places it lived (pages tick-180, API + workspace here), each execution-tested with a negative control. **Note:** my tick-183 proactive flag ("API routes lack the page guard") was correct and is now closed — the concern was real, the fix landed the next tick. This is the corrective working end-to-end: I flagged the class gap, and verified the closure by source + execution.

## 2026-08-22 — 🟢 Proactive class-level re-check (applying the tick-182 corrective) — governance/compliance routes all gated

Quiet tick; applied corrective #1 (enumerate the WHOLE class, not the named cases) to my own tick-79 governance audit — where I'd named only four routes. Enumerated **every** governance/compliance/erasure API route (6 total) and gate-checked each:
- `governance/route.ts`, `hipaa`, `legal`, `erasure/preview` — the four I named at tick 79 (all `requireRole` agency-roles + `session.agencyId`). ✓
- **`compliance/frameworks`** and **`compliance/posture`** — **two I never named**, found by enumeration: frameworks (POST, mutates) `requireRole(["agency-owner","agency-manager"])` admin-only + agency-scoped; posture (GET, read-only) agency-roles-incl-staff + agency-scoped. Sensible read/mutate split. ✓

No ungated route in the class; none reachable by client/customer/lead. **Clean** — but the point is I found the 2 un-named routes by grepping the class, not by trusting my earlier list. This is the corrective working. (Note: still grep-level, not execution-level; a full application would drive each as an untrusted role — the plugin-page host-gates guard already does this for pages, these API routes do not yet have such a guard.)

## 2026-08-22 — ✅ PASS (+ honest accounting of MY blind spots) — "Eleven verifier-proven defects across phases 8/9 + truthfulness"

Audited the second-pass fix of 11 defects. Verified the fixes are real — and **three of them were in areas I PASSED**, which is worth recording plainly.
- **Navigator origin (my tick-176 PASS):** I verified the *tag's* same-origin filter and passed it. The defect: the editor **trusted the tag** (code running inside an untrusted page) to filter, and picking a row moved the frame's trusted `src`. Fixed: `pageNavigator.ts:285` `pageLinkDestinations(links, allowedOrigin)` enforces origin **in the editor**, **fails closed** with no origin (`:300`), `navigatorHref` refuses again at use. I checked one layer; the trust boundary was the bug. ✓ now closed.
- **SEO "bytes outside markers unchanged" (my tick-178 PASS):** I took it as pinned by the 73-test suite. It was **false for CRLF files** — split `/\r?\n/` + join `"\n"` rewrote every line (170→233 bytes, a whole-file diff). Fixed: terminators travel beside the text (`pageSeo.ts:606-608`). The suite didn't cover CRLF; I trusted the coverage. ✓ now closed.
- **Truthful surfaces (my tick-174 PASS):** I verified the helper + the *named* surfaces. Left live: the tax clamp on **Overview** (`FounderDashboardPage.tsx:75` now `taxPosition()`), a **3rd** ungated sibling (`_ClientSystemsWorkspace`), and a **4th** no report had named. Fixed + pins made **class-level** — "that is what found the fourth." ✓ now closed.
- Other fixes verified in passing: twitter:card inert-field rule, `.js/.mjs` App Router heads, `governingLayout` reachable, `public/*.html` extension, SEO-discard confirm, and `portalTarget` no longer reading `projectKind` (now `!projectId`).

**Verdict: ✅ PASS.** But the pattern across ticks 174/176/178 (and 180) is now unmistakable and it is MINE: **I verify the mechanism and the named cases; the defects live in the un-named consumers, the edge inputs, and the trust boundary.** The team's independent verifiers — execution-based, class-level, adversarial — keep finding what inspection of the declared cases misses. **Corrective I'm adopting:** when auditing a "fixed X" claim, (1) grep/enumerate the WHOLE class of X, not the named instances; (2) test the edge input (CRLF, empty, legacy record), not the happy path; (3) drive the trust boundary as the untrusted side, don't assume a lower layer's filter. Credit where due: this build's verifier discipline is genuinely strong.

## 2026-08-22 — ✅ PASS — "Client/customer-portal access hole closed STRUCTURALLY" — the most important security fix of the session

Audited the client-portal-hole claim. This is a **critical, broad** access-control hole — worse than the tick-174 finance one — and it's fixed **structurally** (safe-by-default), verified hard in source.

**The hole (real, severe):** an `end-customer` (a shopper) could open `/portal/clients/<id>/agency-hr/staff`, `/…/contacts`, and on the customer host `/portal/customer/memberships/subscribers`, `affiliates/payouts`, `client-crm/contacts`, `agency-hr/staff`. Root cause: the client host gate was `requireRoleForClient(ALL_ROLES, clientId)` (tenancy, not surface ownership) and `pluginPageAllowedRoles` was **undefined for 69 of 90 pages** → fell back to the wide-open door. Violates CLAUDE.md "internal records stay internal."

**The fix is the right kind — structural, not per-page declaration:**
- **Surface role ceiling no manifest can widen** (`_pageScope.ts:77-81`): `agency: AGENCY_ROLES`, `client: AGENCY_ROLES ∪ CLIENT_ROLES`, `customer: ["end-customer"]`. The client ceiling **excludes `end-customer`/`lead`**.
- **`effectivePageRoles` (`:146-152`) is the whole gate**, called by all three hosts (single source of truth): wrong surface → `[]`; **undeclared page → inherits the ceiling** (`[...ceiling]`, NOT the door); declared → `ceiling.filter(r => declared.includes(r))` — **intersect, never union**, so a declaration can only narrow. Even the 69 undeclared pages are now safe, and a shopper reaches **zero** client-host pages by construction.
- The comment (`:69-75`) correctly separates **tenancy** (the host `requireRoleForClient` gate) from **surface ownership** (the ceiling) — the exact conceptual bug. `resolveCustomerPluginPage`'s relative-prefix branch (the customer leak, which also shadowed real customer pages) is removed.
- **Guard proven by EXECUTION:** `smoke-plugin-page-host-gates.test.ts` drives REAL host routes with REAL signed sessions for all 8 roles across every URL, vs `effectivePageRoles`; mutation checks register **synthetic manifests declaring nothing** (proving the rule on the 91st page, not just existing ones); negative control (revert → hundreds of violations). Reachability client 856→372, customer 52→3, end-customer/lead → **0** on the client host.

**Verdict: ✅ PASS** — a critical hole closed the durable way (safe-by-default ceiling + single gate + execution-proven), superseding the fragile "every page must declare" model.

**↳ Honest note on my tick-174 verdict:** I passed the finance/agency access-control fix (correct for what it covered — the agency host + nav-narrowing guard), but this **broader client/customer-host class** (undeclared pages + wrong-surface resolution + `pickInstall` agency fallback) was a separate, larger hole my tick-174 audit did **not** surface. The team's execution-based sweep (all roles × all hosts × all URLs) found what inspection of the declared cases missed. Lesson logged: for access control, drive the real routes as the untrusted role — don't verify only that the declared pages declare.

## 2026-08-22 — ✅ PASS (source/test; browser-unverified per team's note) — "Phase 9: surface modes + per-page SEO in source"

Audited the phase-9 claim (the SEO/surfaces work whose landing caused ticks 177's 6 reds — now settled green + logged). The higher-risk part is **writing SEO into page source**; verified it's built on the audited-safe write path:
- **SEO-write reuses the repo-write safety:** `seo-read`/`seo-write` are actions on the **existing** `/api/portal/dev/repo-write` (`route.ts:56,290,300`) — no new endpoint, no SEO store. `seo-write` is preview-first → confirm-with-**fingerprint** ("a page that changed in between refuses instead of writing") → `saveRepoFile` → draft branch → PR. Same lost-update/traversal guards I verified tick 161. ✓
- **"Own a marked block, refuse everything else":** `repoWrite.ts:89-90` makes "this file has no head I can write" and "this page **already writes its own head**" distinct refusals — it won't clobber a page with `generateMetadata`/existing `metadata`/a hand-written `<title>`/`"use client"`. `read(emit(x))===x` both ways + bytes-outside-markers-unchanged pinned by the 73-test suite. ✓
- **Conservative surface derivation:** `surfaces.ts` defaults to **Normal**; promotes to **Website** only on evidence (tag answering AND http(s) address), else Normal *with a sentence naming the missing half*. `projectKind` deliberately **excluded** from the logic (only in the "AND NOT projectKind" comment `:25-27`) — a derivation that invents "puts an SEO panel over somebody's game." Operator's explicit choice always wins + persists; only explicit choices stored. ✓
- **`inspectorTabsFor` now takes a REQUIRED `surface`** — tsc-enforced so the SEO tab can't be "built and never mounted"; gated on `surface === "website"` before the ladder, orthogonal to depth. (This required-arg change is what surfaced ticks 168/177's transient inspectorTabsFor reds as the feature landed.) ✓

Full suite green (3516 / 0). **Verdict: ✅ PASS on what's source-verifiable** — SEO-in-source rides the safe write path with real "don't clobber existing SEO" refusals; the surface default is honest (Normal unless proven Website). **Caveat (team's own):** not browser-rendered. **↳ tick-177's 6 reds RESOLVED** — heavy-landing churn (5/6 phantoms + 1 that also settled), green at stable 3516.

## 2026-08-22 — ✅ PASS (source/test; browser-unverified per team's note) — "Phase 8: the navigator + tag reports its links"

Audited the navigator claim (fixes Ed's "if i put in a website id get stuck" — the browser could load one address but reach no other page). Honestly flagged "not verified in a browser" + phase-9 switcher not built. Verified the source-checkable logic:
- **Route-derivation safety** (`pageNavigator.ts`): a dynamic route (`[slug]`) is **listed but not openable** (`:20,:57-59`) — you can't blindly open a route needing a value; private/slot/intercept routes handled (`:131`); static `.html` at root/`public/` (`:112-117`). ✓
- **Tag link protocol is well-scoped:** `aquaTagSource.ts:375` `if (url.origin !== location.origin) continue` — **same-origin filter** (won't surface arbitrary cross-origin links the page happens to contain), `:376` strips query/hash, `:378` deduplicates. New `aqua-explorer:links`/`links-found` pair, cap 60 + 2s timeout per the entry. ✓
- **Portal-only select replaced:** `PageNavigator.tsx` mounted in `DevEditor.tsx` (grep = 2); `aria-label="Portal page"` **gone** (grep = 0). The stale pin in `smoke-client-portal-studio.test.ts` was rewritten to assert the navigator is mounted + the old label absent (not just text-match, which a leftover comment would have satisfied). ✓
- **No new endpoint** — reuses repo-write `insert-targets`; drift guard 27/27.

Full suite green (3443 / 0). **Verdict: ✅ PASS on what's source-verifiable** — careful route logic, good same-origin scoping. **Caveat (team's own, echoed):** nothing has rendered; the navigator UX + link-picking need a live-browser pass. Queue clean.

## 2026-08-22 — ✅ PASS — "Three app-audit findings closed at the class level" — incl. a HIGH access-control fix, verified

Audited the closure of three findings from the 22-Aug app audit. Security-significant, so I verified each in source; **all genuinely fixed, and the HIGH one is generalized:**
- **Finding 1 — HIGH access control, CLOSED + class-level:** `agency-staff` could open finance `/budgets,/operations,/planning,/settings` by URL (Operations shipped compensation + payments in SSR props) because the manifest declared no roles → host gate fell back to all of `AGENCY_ROLES`. Now every finance page declares `visibleToRoles: financePageRoles(path)` (`agency-finance/index.ts:55-59`), derived from `FINANCE_SECTIONS`; the four sensitive pages are `FINANCE_ADMIN_ROLES` = owner/manager only (`sections.ts:47-52`), **staff excluded** (`:31`), host **404s before importing the component** (fail-closed). **The sweep closed 4 more instances of the same hole** — verified agency-hr "Employees" now `AGENCY_ADMINS` (`agency-hr/index.ts:66`) — and added a **generic guard over EVERY plugin** (`smoke-finance-section-gates.test.ts`, with a mutation check + real host route driven as staff → 404). ✓
- **Finding 2 — Stripe secret handling, CLOSED:** password fields → encrypted integrations vault via `secretVault`; **a password field with no vault target is refused by both the settings surface and the registry validator** (`pluginSettingsSurface.ts:22`) — secrets can't reach the browser-visible `install.config`, aren't echoed, aren't logged. Generic surface (`pluginSettingsSurface.ts` + `PluginSettingsPanel.tsx` + `api/portal/plugins/settings`). ✓
- **Finding 3 — truthful surfaces, CLOSED:** `telemetryDisplay.ts:20` `UNMEASURED = "—"`, gated on the telemetry watermark (`:25`) — unmeasured shows "—", never a fabricated 0; `taxPosition()` replaces `Math.max(0, …)` so a reclaim reads as a reclaim; currency + client-name/`cli_…` formatting fixed. The exact "unmeasured → null, never 0" honesty contract. ✓

Full suite green (3402 / 0). **Verdict: ✅ PASS** — a real HIGH privilege-escalation hole (staff → compensation/payments) closed **at the class level** with a plugin-wide guard, plus a secret-leak-prevention and an honesty fix. This is exactly how a finding should be closed: fix the class, not the instance, and leave a guard that catches the next one.

## 2026-08-22 — ✅ PASS — "Dev Editor writes, publishes and merges; 13/18 phases" — milestone roll-up; new merge path is safe

Audited the milestone claim. Most of it summarizes work I've **independently audited & passed** over the burst (dead-snippet · repo-write · AI-reply · throttle · nesting · device-sizing · modes; and the lost-update / `sk-proj-` scrubber / apostrophe / editor-AI-isolation fixes it lists as verifier-found) — the summary matches my prior verdicts. Focused on the **new** capability + the honesty:
- **Merge + revert (phase 14) is safe:** `publish.ts:146` squash-merge via GitHub's API (**not force**); `repoWrite.ts:485` requires `confirm === true` (not coerced); `:501` a conflict/branch-protection → refusal (never forced); merging is a **separate** decision from save/publish (`:387`) and the code is explicit "merging here IS the production deploy" (`sourceEdit.ts:367`). Scoped to the **client** repo — the "`+` writing into AquaCRM's own tree" defect was fixed, so this is not a risk to AquaCRM's own production. ✓
- **Honest "not done":** phases 8/9/17/18 explicitly unshipped; **Ed's live client tag still points at localhost** (needs `NEXT_PUBLIC_PORTAL_BASE_URL` + re-paste) — the same localhost issue from the dead-snippet audit, correctly flagged as still open, not hidden. ✓
- **External claim (taken on report, not independently verifiable):** real commits `780eb08`/`4da8b29` + PR #1 on the live repo `edstorm987/Beast-marks`. I can't verify external GitHub state from here, but it's consistent with the write path I verified at tick 161 (branch-tip reads, fingerprint guard).

Full suite green (3361 / 0). **Verdict: ✅ PASS** — accurate milestone; the new merge path carries the same safety discipline as the write path (explicit confirm, no force, respects protections), and the incomplete phases + the outstanding localhost tag are disclosed honestly. **13/18 shipped, cross-confirmed against my own burst of verdicts.**

## 2026-08-22 — ✅ PASS (partial delivery, honestly scoped) — "Network throttling: tag wraps fetch/XHR + wifi control"

Audited the throttle claim (deferred from tick 169 while I investigated a suite red — see the resolution note below). Verified the core; **all holds, and the honesty is the standout:**
- **Tag wraps fetch/XHR — lazy + exact restore:** `aquaTagSource.ts:358-361` saves `throttleOriginalFetch`/`throttleOriginalXhrSend`; wrap engages only when throttled (native untouched otherwise), clear restores the saved originals. Real latency + bandwidth pacing (chunk-proportional stream delay, `:377-387`) + offline (`TypeError("Failed to fetch")`, `:364`). ✓
- **No overclaim (in the code itself):** `:354` — "only DevTools can throttle those [cross-origin iframe resource loads] — so it never pretends to." The feature throttles the page's own fetch/XHR, and says so. ✓
- **Capabilities `networkThrottle`:** advertised (`aquaTagBridge.ts:307`), **lenient parse** `=== true` (`:535`) so a cached pre-throttle tag still handshakes. ✓
- **Honest partial delivery:** `NetworkThrottleControl.tsx` exists + is tested, but is **NOT mounted in DevEditor** (`grep -c` = 0) — held back because a concurrent workflow owns `DevEditor.tsx`, exactly as the entry states. So the control isn't reachable in the editor yet; that's disclosed, not hidden.
- Test VM-executes the real tag source (sandboxing the fetch-wrap from the runner's own globals) — good isolation.

Full suite green (3355 / 0). **Verdict: ✅ PASS** — careful, honestly-scoped work; the lazy-wrap/exact-restore design is right, and the "can't throttle the iframe, only page fetch/XHR" + "not yet mounted" caveats are stated plainly. When the control is mounted, a browser pass would confirm the end-to-end UX.

**↳ Resolution of the tick-169 "the endpoint" red:** RESOLVED. It was a **full-suite-only cross-file/concurrency artifact** of that tick's heavy +56 landing — the endpoint code passed in isolation (repo-write 44/0, words-publish 64/0) and co-run with the throttle files (123/0); it failed only in the full concurrent suite, and cleared to green (3355/0) once the landing settled. **Not a code defect.** (If a green-alone-red-in-suite endpoint recurs when the tree is quiet, that's a real test-isolation weakness to bisect — noted, not currently reproducing.)

## 2026-08-22 — ✅ PASS (source/test only; browser-unverified by the team's own note) — "Real device sizing in the editor (phase 10)"

Audited the device-sizing claim (lower-risk UI/preview). The entry itself flags "NOT verified in a live browser" — honest, and I can't browser-verify either (spinning a dev server would clobber the shared sandbox, which the brief forbids). So I verified the **source-checkable** structural + anti-duplication claims; all hold:
- **`BreakpointControl.tsx` deleted; `DeviceControl.tsx` present.** ✓
- **Device maths reused, not forked** (the codebase's "don't build it twice" rule): `DeviceControl.tsx:15` imports from `@built-ins/…/website-editor/src/lib/devicePresets`; `:32` "The MATHS is imported, never forked." ✓
- **Engine boundary held:** `DevEditor.tsx` has **zero** built-ins imports (grep empty) — `DeviceControl` is the single door isolating that dependency. ✓
- **Exact pixels:** `PreviewFrame` lost `maxWidth:100%` and the silent `1440` cap (grep empty). ✓
- **Drag clamp** `clampDeviceSize` with min 240×320 (`DeviceControl.tsx:58-59,:63`), used in the drag handler (`:117`). ✓

21-test suite pins the logic; full suite green (3297 / 0). **Verdict: ✅ PASS on what's source-verifiable** — clean, reuses shared maths, respects the engine/built-ins boundary. **Caveat (the team's own, echoed):** pixel-exactness + drag behaviour are **not** browser-confirmed; that verification stays open for a live-browser pass. Queue clean.

## 2026-08-22 — ✅ PASS — "Nested projects: two levels, enforced in the store" — cycle inexpressible, tenant-safe, delete-safe

Audited the nesting claim (higher-risk: store invariants + tenant scope + cascade delete). Verified the integrity/tenant/safety core at source; **all correct:**
- **`parentProjectId?` optional** (`types.ts:2900`) → old records parse as top-level. ✓
- **Tenant-first parent validation, no existence oracle:** `devProjects.ts:224` `getDevProject(input.agencyId, requested)` (agency-scoped) → `:225` throws `parent_project_not_found` if absent. A foreign parent id (another agency's) returns null → **same error an invented id gets** — you can't probe another agency's projects by trying to nest under one. ✓
- **Cycle made *inexpressible*, not just forbidden:** self-containment `:222` (`project_cannot_contain_itself`), parent-can't-be-a-child `:226` (no 3rd level down), project-with-children-can't-nest `:227-228` (no 3rd level up). The comment's proof (`:208-210`) is sound: any ≥2 cycle needs a parent that's also a child (refused by 2&3); the length-1 cycle is rule 4. ✓
- **Omission carries the parent** `:217-219` (a rename can't silently flatten a child); explicit clear via ""/null. ✓
- **Delete refuses BEFORE destructive cleanup (safety ordering):** `route.ts:139-140` `devProjectDeleteRefusal` → 400 naming the children, **before** `forgetEditorAiHistoryForProject` (`:155`). A refused parent-delete leaves the AI history intact — the comment states exactly this reasoning. Agency-scoped throughout. ✓

33-case test covers the rule from every direction (store + route), tenant isolation, old-record tolerance. Full suite green (3264 / 0). **Verdict: ✅ PASS** — careful data-model work; the cycle-inexpressibility argument and the refuse-before-destroy ordering are the standouts. _Still pending in queue: "Real device sizing (phase 10)" — next tick._

## 2026-08-22 — ✅ PASS — "Four editing modes become three: 'Just the words' merged into Visual" — clean, migration correct

Audited the mode-merge claim (Ed's call: "combine it into visual mode as it's the same"). Low-risk UI consolidation; verified the core:
- **`EDITING_MODES` is now 3** (`modes.ts`): `assist`/"Just tell it", `visual`/"Visual builder", `developer`/"Dev". The `simple` id is deleted from the ladder. ✓
- **Migration is explicit & correct (the part that could bite):** `modes.ts:190` `if (id === "simple") id = "visual"` — a stale "simple" (old URL / stored pref) is mapped to visual **by name, ahead of** the unknown-id default, so it lands on the intended depth, not a fallback. ✓
- **`selectionRouting.ts` simple branch removed** (grep empty) — as claimed, pure deletion since visual already routed to the element panel with words editable. ✓
- **No capability-gating rode in** (consistent with Ed's 2026-08-21 "clients get the whole editor" decision) — the merge deletes a rung, adds no gate; suite green.

Full suite green (3209 / 0). **Verdict: ✅ PASS** — reconciles the mode-ladder churn I tracked at ticks 132/140: the `simple` rung is now deliberately gone, with stale-value migration handled by name. Queue clean.

## 2026-08-22 — ✅ PASS — "Aqua Editor AI replies now — model call on the project's own key" — key isolation genuinely enforced

Audited the AI-reply wiring (the pending queue item from tick 161). Focused on the isolation/injection edges; **confirmed at source:**
- **No-fallback key resolution (the standout, decisive):** `editorAiReply.ts` uses **only** `resolveEditorAiToken(agencyId, projectId)` — the project's own vault key. The negative proof: grepping the module for `getIntegrationConnection` / `agencyOpenai` / `OPENAI_API_KEY` / an agency-openai path returns **empty** — there is no code path to the agency `openai` connection or env. A keyless project → `not_configured` sentence, **zero model calls** (`:38-40,:92`). A project's AI genuinely can't spend agency-wide credentials or cross the tenant boundary. ✓
- **Untrusted-framing (prompt-injection defense):** the client's editor context (clicked words / source focus) is documented and handled as "UNTRUSTED page text: handed to the model as data," not instructions (`:142-146`). ✓
- **Route gate:** `requireRole` founder/manager (`route.ts:78`) → Dev-Mode 403 (`:79`) → CSRF origin (`:82`) → tenant-scoped 404s with no existence oracle (`:56,:59`); status map not_configured→409 / timeout→504 / upstream→502. ✓
- **Coheres with the tick-157 audits:** this is the server-side author the history route's `role:"assistant"` refusal defers to (assistant reply appended server-side, never from a browser body), and it reuses the `scrubSecrets` scrubber for provider error text with the exact key removed — one coherent security design across the editor-AI subsystem (project-scoped keys · no forged assistant messages · secrets scrubbed · cross-project isolation).

Also confirmed: ≤24-message char-capped context with newest-never-dropped (`:118-130`), reuses the Advisor transport (`:4`), test tripwire throws on any real network call. Full suite green (3189 / 0). **Verdict: ✅ PASS.** Queue clean — both tick-161 claims now audited.

## 2026-08-22 — ✅ PASS — "Repo write path: create/save/publish for repo-backed projects" — git-write safety verified

Audited the repo-write-path claim (fixes Ed's live blocker: "not letting me add new files… publishing [doesn't] work"). This is the **highest-risk claim of the burst** — it *writes to GitHub repos* — so I focused on the data-loss and secret-leak edges. **All handled correctly:**
- **Lost-update prevention (the critical one):** `repoWrite.ts:199-203` re-hashes the current branch-tip contents at save time and compares to the read-time `fingerprint`; mismatch → `stale-fingerprint` refusal ("someone else changed this"), **never a silent overwrite**. ✓
- **No force-push:** zero `force:true` in `repoWrite.ts`; reuses the words-editor `publishEdits`/`openPullRequest` machinery (whose `force:false` I verified tick 156) — a non-fast-forward becomes a refusal, not a clobber. Draft branch `aqua-editor/<projectId>`, never the default branch. ✓
- **Dry-run default:** commits only when `confirm === true` (`:143`); per-branch in-process write lock for the check-then-commit window (`:102-107`). ✓
- **Traversal/secret refusals:** `normalizeRepoPath` + `.env`/hidden-path refusals, same as the local write path (`:85`). ✓
- **Secret never in the body (security):** route reads repo/ref/**token** only off the agency-scoped `DevProject` record + encrypted vault (`route.ts:34-37`), never the request body, never echoed. Full gate: `requireRole` founder/manager (`:95`) → Dev-Mode 403 (`:96`) → CSRF origin 403 (`:99`) → `getDevProject(session.agencyId, …)` (`:109`). POST-only. ✓
- Test design is sound: `smoke-repo-write.test.ts` (44) uses a stateful fake that tracks **contents-per-commit** (so it can catch a silent revert) + fast-forward enforcement + PR reuse.

Verified the git-write **safety core + route security**; did not individually re-verify `createRepoPath`/PR-reuse/draft-first GET/UI (covered by the 44-test green suite). Full suite green (3184 / 0). **Verdict: ✅ PASS** — safe git writes done right (the hard part — lost-update + force-push — is correct). _Still pending in queue: "Aqua Editor AI replies now" (next tick)._

## 2026-08-22 — ✅ PASS — "Dead-snippet tag state + file-tree re-fetch" — a real trust bug (tag 'verified' but dead for visitors), fixed correctly

Audited the two-phase claim. This one matters: **Phase 1a fixes a real correctness/trust bug** found testing the tag on a real page — the snippet pointed at `http://localhost:3032/aqua-tag.js` (present, right key, **dead in every visitor's browser**) yet "Check It" reported **verified** because it read the HTML server-side. Verified the fix at source:
- **The semantic of "verified" is corrected** — `aquaTagIdFromCheck:377`: `verified = tagPresent && keyMatches && detectedSiteKey && **!scriptUnloadableReason**`. A tag is no longer verified just for being in the HTML; if its script won't load for a visitor, it isn't verified. ✓
- **`dead-snippet` = proper 8th state:** union member (`types.ts:2768`), derived from `scriptUnloadableReason` (`devProjects.ts:260`), evidence prints the reason verbatim (`:330`), UI warning tone (`_DevEditorSetup.tsx:475`). ✓
- **Definitive-negative revoke:** a dead-snippet is reachable-but-unverified → `:381 if (tag?.reachable) return undefined` → earned id **revoked** on re-check. (Extends the revoke logic I verified tick 156 — it now catches dead snippets too.) ✓
- **Backward-compat:** both new fields optional (`types.ts:2726,2736`) → old records parse as *unassessed*, never dead. ✓
- **Phase 1b (the file-tree/GitHub-connect fix — this resolved the code-mode red I flagged tick 159):** old "Company → Connections" wording **gone**; `RepositoryPanel`/`EditorCodeCanvas` listen for `DEV_PROJECTS_CHANGED_EVENT` to re-fetch; `smoke-code-mode.test.ts:254-260` deliberately flipped to assert `/Connect GitHub in the editor's Settings tab/`. That was the mid-flip test I watched go red → now green. ✓

Full suite green (3125 / 0). **Verdict: ✅ PASS** — a genuinely important trust fix (a tag falsely reporting "live" is exactly the kind of thing that burns an agency), implemented thoroughly with backward-compat. Retro-confirms my tick-159 in-flight read.

## 2026-08-21 — ✅ PASS — "Aqua Editor AI hardening: six defects from the own-assistant split" — incl. a real plaintext-key-leak fix

Audited the six-defect fix-pass. Verified **4 of 6 at source**, prioritising the three security-relevant ones; all confirmed real, not test-weakening:
- **Defect 1 — SECURITY, plaintext API-key leak (the big one), CONFIRMED FIXED:** `integrationConnections.ts` `safeTestMessage` — the scrubber was underscore-only (`sk_`), so an OpenAI `sk-proj-…` key echoed in a provider 401 reached `lastTestMessage` → state blob → integrations GET → settings panel **in plaintext**. Now `:474` `/(?:sk|rk)[-_][A-Za-z0-9_-]+/` (**hyphen OR underscore** — the precise fix), plus PEM blocks (`:469`), `re_/whsec_/github_pat_/gh[opsur]_` (`:477`), long bare hex (`:479`), AND exact-removal of the connection's own decrypted secret values (`:465`) as the net for prefix-less secrets (Vercel/SMTP). Thorough. ✓
- **Defect 4 — history route refuses a forged `assistant` role (security), CONFIRMED:** `editor-ai/history/route.ts:123-128` refuses `body.role !== "user"` with 400 "Only your own messages can be added here" — "a request body claiming to be the assistant is a forged transcript line, refused out loud rather than coerced quietly." Route also role-gated (`:86`), Dev-Mode-gated (`:87`), CSRF origin-checked (`:90`), agency-scoped with **no existence oracle** (`:106-108`, foreign project → 404 "same answer an invented id gets"). ✓
- **Defect 6 — cross-project credential isolation (security), CONFIRMED:** real render harness `smoke-aqua-editor-ai-stale-key-panel.harness.tsx` exists; `AquaEditorAIKey.tsx:79` `unread = status?.projectId !== projectId` gates model/instructions/`configured`/render (`:82,:83,:117,:152`) — project B never wears project A's credential facts. ✓
- **Defect 2 — history writes key on the cleaned agency/project id:** `editorAiHistory.ts:132-133` cleans both; write paths thread `project.id` (`:369,:418`). ✓
- (Defects 3 "delete on never-chatted project mints no record" and 5 "60-msg cap counts evictions" — lower-risk correctness, not source-verified individually; covered by the green suite.)

Full suite green (3057 / 0), `tsc` clean per the entry. **Verdict: ✅ PASS** — a genuine security-hardening pass; the plaintext-key-leak fix is real and comprehensive. Queue clean.

## 2026-08-21 — ✅ PASS — "Dev Editor fix pass: four tag/words defects + save-body tag unlock" — fixes real in source, not test-weakening

Audited the fix-pass claim (the DevEditor tag/words build I watched go red→green over ticks 153-154, now logged). Verified **at the source** that each fix is genuinely implemented — the key test being whether they fixed the code or just made tests green. **Confirmed real:**
- **Defect 1 (editor learns a just-verified tag):** `DEV_PROJECTS_CHANGED_EVENT = "aqua:dev-projects-changed"` dispatched by `_DevEditorSetup.tsx:33`, listened + cleaned up in `DevEditor.tsx:462/465`. ✓
- **Defect 2 (revoke a dead tag):** `aquaTagIdFromCheck` (`engines/editor/server/devProjects.ts`) — not-verified + `tag?.reachable` → `return undefined` (definitive absent/foreign → **revoke**); else `return existing` (unreachable → **keep**). Matches the claimed "revoke on definitive negative, keep on indeterminate" exactly. ✓
- **Defect 4 (apostrophe context inversion):** `contextAt(lineText, at, file)` (`sourceMatch.ts:268`) derives context from file type and **refuses with `unknown-context`** (`:423`) rather than guessing. ✓
- **Defect 6 (save-body tag unlock) — security-relevant, CONFIRMED:** the projects route **refuses a body-supplied `aquaTagId` with 400** (`route.ts:274-276`, "connected by Map or Check it, never by a save") and preserves the **earned** id server-side via `getDevProject(session.agencyId, body.id)` (`:292`, agency-scoped). A save genuinely can't self-grant the browser gate — real privilege-escalation prevention. ✓
- (Defect 3, words-publish 422 → build from edit-branch tip: not source-verified individually; covered by the now-stateful `smoke-editor-words-publish` in the green suite.)

**Test rewrites are legitimate, not weakening:** the old "never revoke" and "a save carries the value through" pins were rewritten to pin the *opposite* — but the new rules (revoke a definitively-dead tag; a save can't plant the gate) are the **correct** ones; the old pins were the bug. Full suite green (3048 / 0). **Verdict: ✅ PASS.** Queue clean.

## 2026-08-21 — ✅ PASS — "Doc prune: 11 records archived, three 'where we stand' files → one" — moves real, nothing lost

Audited the newly-logged doc-prune claim. Verified the load-bearing, most-falsifiable points; **all hold:**
- **11 records genuinely moved** to `docs/context/archive/` (present + README). The dir has 15 files, but 4 (`staff-worker-handoff`, `erasure-worker-handoff`, `kpi-worker-handoff`, `handoff-inbox-chat`) are **pre-existing** archive residents (the tick-142 editor-move entry already cited `archive/staff-worker-handoff.md`) — the 11 *new* moves reconcile exactly.
- **Moved, not copied** — all 5 sampled old paths (`WHERE-WE-ARE.md`, `development/WHERE-WE-STAND.md`, `SESSION-HANDOFF-2026-08-18.md`, `development/phases.md`, `website-editor-and-migration.md`) are **gone** from source. No duplication left behind, which was the stated goal. ✓
- **`development/handoffs/` dir removed** (held only the one moved file), as claimed. ✓
- **`super-editor.md` confirmed never existed** (`find` empty) — the dangling ref cited from 3 places was resolved honestly, not by inventing the file. ✓
- **Nothing load-bearing broke:** full suite green (2765 / 0) — validates the claim's "no test needed editing" and the in-process parser re-runs (roadmap %s unchanged). ✓
- **Honesty:** the entry *disclosed* its one suite fail (`smoke-editor-write-path`, another agent editing `dev/files/route.ts`) rather than hiding it; my current run is green, so it has since resolved — confirming it was unrelated to the prune.

**Scope note:** did not independently reproduce the full "68 links repointed / 9→10 broken" link-check (disproportionate for a doc pass with the integrity checks all green); verified the structural moves + no-loss + no-test-breakage instead. **Verdict: ✅ PASS** — an archive-not-delete pass that keeps every dated record and collapses the three "where do we stand" files to one, exactly as claimed. Queue clean.

## 2026-08-21 — ✅ PASS — "Dev Team editor split + universal-editor copy fix + nine doc defects" — verified, unusually accurate

Audited the second newly-logged editor claim (the split I flagged unlogged at tick 132, now logged — honestly marked "logged late"). Tested its most falsifiable assertions; **every one holds, including the subtle traps:**
- **The split:** `editor/page.tsx` is a real page (`DevEditorProjectsPage`, `:27`) rendering the projects workspace; only `redirect()` is the auth branch (`:33`) — **not a stub**. `editor/studio/page.tsx` mounts `DevEditor.tsx` (verified tick 133). ✓
- **Sidebar = exactly SEVEN** (`layout.tsx:74-89`): Home · Roadmap · Findings · Library · Tools · Editor · Notes, exact order. **Zero `chat`** in `layout.tsx`; `dev-team/chat/page.tsx` still exists + renders `TeamChat` (`:8,:23`), unlinked. ✓
- **Six portal→universal copy strings** in `DevEditor.tsx`: all six OLD strings **gone**; new ones present (`Loading...` `:364`, "…before opening the editor on this project" `:463`, `Inspector` FAB). ✓
- **The honesty trap passes:** `"Loading portal design"` remains **exactly once** (`grep -c` = 1) — the ungated notice became "Loading…", but the portal-design-*fetch* point keeps it, precisely as the entry claims. Portal-doc-branch copy (`Portal template`/`Publish portal`/`Portal CSS`/`Add a portal component`) kept. ✓
- **Doc defects (spot-checked 2 of 9):** `portal-ui.md:162` now "Sections — SEVEN" (was SIX); `components/editing/` is **exactly 10 files** (claim: "10, not 3"). ✓
- **Suite green:** 2709 pass / 0 fail / 1 skip — matches the claimed baseline exactly.

**Verdict: ✅ PASS.** A model entry — specific, self-aware about being logged late (the process gap I'd flagged for ~10 ticks, now owned), explicit about what was deliberately kept and why, and it even documents **restoring** dated prose the doc-sweep had overwritten (rejecting "rewrite history to match the present"). Both editor claims now audited & cleared; queue clean.

## 2026-08-21 — ✅ PASS — "Editor moved out of the portals route (`_ClientPortalStudio` → `DevEditor.tsx`)" — verified clean

Audited the newly-**logged** claim (top of `updates.md` — the editor's move out of the portals route). It's the first new claim in a long while, and after ~30 ticks of the underlying work shipping unlogged, it landed as a clear, confident entry. **It holds on every checkable point:**
- **Move done:** `src/app/portal/agency/portals/editor/_ClientPortalStudio.tsx` is **gone**; `src/engines/editor/DevEditor.tsx` exists and exports `DevEditor` (`:136`). Component `ClientPortalStudio` → `DevEditor` as claimed.
- **Grepped clean (code):** **zero functional references** to the old name/path anywhere in `src/` + `scripts/` — the only hits are two self-documenting provenance comments inside the new file (`DevEditor.tsx:11,20`). All 7 named tests are clean. (I watched the last three test files' old-name refs disappear **mid-audit** — the worker was finishing the cleanup live; a re-grep confirmed clean. Live-tree reminder.)
- **"Deliberately NOT renamed" items intact:** `src/engines/editor/server/portalStudio.ts` + `loadPortalStudioProps` / `PortalStudioClient` / `PortalStudioTemplate` all present, exactly as the entry says.
- **Suite green:** 2710 tests, **2709 pass / 0 fail / 1 skip** — matches the claimed count exactly. Behaviour-preservation is covered by the editor contract tests (mode ladder, assistant wiring, both doors, target-awareness, client-portal-studio) all passing.
- **Docs:** `docs/reference/` regenerated **grep-clean**. Sampled 4 of the 7 prose docs that still name the old path (`CURRENT-IMPLEMENTATION.md`, `portal-ui.md`, `website-editor-and-migration.md`, plan `dev-editor-engine.md`) — each names it only as an honest **dated migration note** ("used to live at X … moved out 2026-08-21 → DevEditor.tsx"), not a stale current-fact. Correct practice, matching the entry's own stated philosophy about dated records.

**Verdict: ✅ PASS.** A clean, thorough, honestly-documented structural move — no dangling references, contracts preserved, counts truthful, docs migration-aware. This also retro-confirms my tick-132/140 reads: those earlier editor reds were exactly this refactor landing in stages, each self-resolving as the worker finished + updated tests.

## 2026-08-21 — 🟡 SUITE RED (2 fails) — stale tests after an unlogged dev-editor split; behavior PRESERVED, tests need re-pointing

> **✅ RESOLVED next tick (2026-08-21):** both tests were **re-pointed to the `studio/` route** (now reference `studio` — 9× in `smoke-dev-editor-engine`, 3× in `smoke-aqua-editor-ai`); both files pass **15/15**, full suite **green again (2686 / 0)**. Fix matched the routing note exactly. Left below as the record.

**Full suite is red: 2685 tests, 2 fail** (both reproduce in isolation — not phantoms). Traced both to **one root cause**: the **dev-team editor was split (unlogged) into two routes**, and two source tests still pin the pre-split file.

**The refactor:**
- `src/app/portal/dev-team/editor/page.tsx` → now a **project-picker / setup** screen (`DevEditorSetup`), with an "Open editor" link.
- `src/app/portal/dev-team/editor/studio/page.tsx` (**new**) → the **real editor**: imports `ClientPortalStudio` from `_ClientPortalStudio` (`:11`), mounts it (`:50`), loads `loadEditorAssistant` (`:8,:47`), passes `assistant={assistant}` (`:61`).

**The two reds — both stale:**
- `smoke-dev-editor-engine.test.ts:29-33` ("mounts the full Portal Studio…") greps **`dev-team/editor/page.tsx`** for the `ClientPortalStudio` import — which legitimately **moved to `studio/page.tsx`**.
- `smoke-aqua-editor-ai.test.ts:75-84` ("is wired into both editor doors") greps **`dev-team/editor/page.tsx`** for `loadEditorAssistant` + `assistant={assistant}` — both **moved to `studio/page.tsx`**. (Editing-mode order `assist/simple/visual/developer` is unchanged — those subtests pass.)

**Verdict: behavior PRESERVED, tests STALE.** Verified both guarded contracts still hold at the new studio route — the dev door still mounts the real engine and still wires the assistant. Neither is a product defect. This is the same class as the cinematicMode / dev-tasks-parse stale-pins.

**⚠ → Commander:** **the suite is RED again** (banner's "green" is now stale). Fix is source (I'm read-only): re-point both assertions from `…/dev-team/editor/page.tsx` to `…/dev-team/editor/studio/page.tsx` (for the "both doors" loop, either swap the dev entry to the `studio/` path or add it). Also: **the dev-editor split is unlogged** — please add the `updates.md` entry. Watching next tick; if it clears (tests re-pointed) I'll confirm green.

## 2026-08-21 — 🟢 Banner's one "observed red" is RESOLVED — `smoke-dev-tasks-parse.test.ts` now 13/13

The top banner (written 2026-08-20) flags one red observed after its count was taken: `smoke-dev-tasks-parse.test.ts` failing **12 pass / 1 fail** in isolation, from a stale `/BLOCKED on Ed/i` assertion pinning a plan phase that had since shipped ("✅ Cohere — SHIPPED"). **That red no longer reproduces.** Re-ran the file alone today: the same **13 tests → 13 pass / 0 fail** (the one stale assertion was corrected, not deleted — count unchanged, the fail is gone), and it's likewise clean in the full suite.

**→ Commander:** the banner's ⚠ "one red observed since" can be **cleared** — the dev-tasks-parse test is green in both isolation (13/13) and suite. **No open reds.** (Banner's headline pass count `2382` is also stale now — live full-suite is **2631 / 0**, `tsc` last verified clean.)

## 2026-08-20 — 🟢 Light security spot-check of the (still-unlogged) SOPs feature — access control is SOUND

Companion to the governance spot-check below. The SOPs feature has also shipped **unlogged ~12 ticks**; it's the other client/agency-facing surface, so I checked its access control without waiting for a claim. **Sound — same clean pattern as governance:**
- **Clients can't read SOPs at all** — `assertSopsAccess` (`sopsAccess.ts:43-46`) 403s every non-agency role. The "SOPs client tab" is an *agency operator's* per-client stage filter (`familiesForStage`), **not** a customer-portal surface — so no client-facing exposure by construction.
- **Role-gated routes** — `api/portal/sops/*` refuse a non-agency session (401, fail-closed; `sops/route.ts:15-20`).
- **Agency-scoped end to end** — `listSops(session.agencyId)`, and create/update/delete all take `agencyId` from the **session**, never the body. The engine filters by `agencyId` (`sops.ts:12`) and **`getSop` returns `null` for a foreign id** (`:67`), so `updateSop`/`deleteSopRecord` gate through it (`:212-213`, `:236-237`) → a cross-agency id yields **404, not a cross-tenant edit/delete**. No existence oracle.
- Bonus: path-traversal guard on the local-file delete (`sops/route.ts:127`).

**→ Commander:** Both still-unlogged features (governance + SOPs) now have their **access control confirmed sound** (role-gated, agency-scoped, no cross-agency or read-oracle leak) — **neither is an open security hole**. The **functional** audits (what each actually computes/serves — compliance-snapshot accuracy, SOP content correctness) still need the features **logged** in `updates.md`. Suite green (2619/0).

## 2026-08-20 — 🟢 Light security spot-check of the (still-unlogged) governance feature — access control is SOUND

Given the governance feature has shipped **unlogged for ~9 ticks** (client/agency-facing, compliance data), I did a **light proactive security spot-check** of its access control — the highest risk for a compliance surface — without waiting for a claim. **It's sound:**
- **Role-gated + agency-scoped on every route** (`api/portal/governance/*`): the main + `legal` routes `requireRole(["agency-owner","agency-manager"])`; **`hipaa` is owner-only** (`requireRole("agency-owner")` — appropriate for the most sensitive compliance data); `erasure/preview` owner/manager. All use `session.agencyId`, never a body-supplied agency.
- **Company-scoping validated** — the `legal` route refuses a `companyId` not in the caller's agency (`:48`); all use the agency-scoped helpers (`listTradingCompanies(session.agencyId)`, `getClientForAgency(session.agencyId, …)`, `previewClientErasure(session.agencyId)`).
- So **no cross-agency exposure** in the governance access layer.

**→ Commander:** The unlogged governance feature's **access control is sound** (role-gated, agency-scoped, HIPAA owner-only, company-ownership validated) — **not an open security hole**. A **full** audit (what the compliance snapshot computes, HIPAA/legal accuracy, the "external AI proposals → Actions" behaviour) still needs the feature **logged** — please add the `updates.md` entry. Suite green as of tick 78 (2605/0). (The SOPs tab is likewise still unlogged.)

## 2026-08-20 — 🟡 Update — unlogged governance work: tick-73 red RESOLVED; new trivial completeness gap; still unlogged

**Rolling reds from the mid-flight, unlogged governance feature.** Re-checked this tick (isolating each):
- ✅ The tick-73 operational-notifications / Actions-attention red is **RESOLVED** — `smoke-operational-notifications` **15/0** in isolation (the counts were reconciled).
- 🟡 **New (real, trivial) red:** `smoke-tools-directory` (**5/1** isolated) — "Tools directory is missing reachable sidebar destinations: **`/portal/agency/governance`**. Add a card for each so navigation stays complete." The new governance page is in the sidebar but not yet in the agency Tools directory (a completeness guard doing its job). **Fix:** add a Tools-directory card for `/portal/agency/governance`.
- (phantom, not real) `smoke-client-erasure` "Promotion disposition map — exhaustiveness" passes **27/0 in isolation** — a concurrent-run transient, not an erasure regression.

**→ Commander:** The unlogged governance feature is still mid-flight (rolling completeness reds as its pages get wired). Trivial fix outstanding: add the `/portal/agency/governance` card to the agency Tools directory. **And — still — please log the governance + SOPs features** so they enter the audit queue (two unlogged product features now). The tick-73 count red is fixed; erasure is fine (that red was a phantom). Launch blockers resolved.

## 2026-08-20 — 🟠 RED (real, unlogged) — operational-alerts / Actions-attention counts broke; new governance / "external AI proposals" work

**Caught by the periodic full-suite check.** Suite **2576 pass / 3 fail** — and unlike the recent phantoms, these are **REAL** (reproduce in isolation: `smoke-operational-notifications` **12/3**, not a flake). Three count-mismatch failures in the **sidebar-attention / Actions** contract:
- "live alerts mark the relevant sidebar destination without making every area noisy" (expected 2)
- "pending external AI proposals feed Actions attention and parked proposals stay quiet" (expected 1)
- "open Actions keep a sidebar count until the underlying task is resolved"

**Source:** the growth (+16 tests) + recent unlogged source (`agency/governance/_GovernanceWorkspace.tsx`, marketing changes) points at a **new, unlogged governance / "external AI proposals → Actions attention" feature** that changed the operational-alerts counting so these behavioural contracts no longer hold. `updates.md` has no entry for it.

**Findings:**
- 🟠 **Real red: the Actions/sidebar-attention counts no longer match their contracts** (`smoke-operational-notifications:8-10`, isolated 12/3). Either a **regression** (the new governance wiring broke live-alert marking / proposal-feeds-Actions / open-Actions counting) or **unfinished mid-work** (tests + code not yet aligned). Can't tell which — the work is unlogged and mid-flight. **Route:** reconcile the Actions-attention counting with these contracts (fix the code, or if the contract changed deliberately, update the tests + say why), and **log the governance/proposals feature** so it can be audited.

**→ Commander:** Suite has a **real red** (not a phantom this time) — 3 sidebar-attention/Actions count mismatches in `smoke-operational-notifications`, from **unlogged governance / "external AI proposals → Actions" work** (new `agency/governance/` workspace, no `updates.md` entry). Reconcile the counts (regression fix, or a deliberate contract change with updated tests) + **log the feature**. This is now **two** unlogged product features in flight (governance/proposals + the SOPs tab from tick 70) — both need logging to be audited. Launch blockers otherwise resolved.

## 2026-08-20 — 📋 UNLOGGED product feature landed (SOPs) — green, but not in the queue; please log for audit

**Caught by the periodic full-suite check** (+28 tests → 2553, **green**; `updates.md` top unchanged). Most of the growth is internal dev-team tooling (`smoke-dev-team-perf`/`-ui`, `DevTeamTransition.tsx`, the churning `dev-tasks-parse`) — low product risk, actively iterated. **But it includes a new client-facing product feature with no `updates.md` entry:** **SOPs (Standard Operating Procedures)** — `src/app/portal/clients/[clientId]/_ClientSopsTab.tsx` + `smoke-sop-interactive.test.ts` (interactive SOPs on a client tab). It's green/tested, but **invisible to the docs-driven audit queue** — I can't verify a feature I have no claim for.

**→ Commander:** A real **client-facing SOPs feature** shipped **unlogged**. Please add an `updates.md` entry (what it does + its contracts — especially client-scoping / who may view + edit SOPs) so it enters the audit queue; I'll then audit it against that claim. I'm **not** reverse-engineering it from tests this tick (no claim to verify against, and that's error-prone). Suite green; the rest of the +28 is internal tooling. Recurring theme: substantial work keeps landing unlogged — the periodic full-suite run is the only thing surfacing it.

## 2026-08-20 — ✅ PASS — Three profile-menu toggles: Cinematic mode · real Performance mode · dev-icon toggle (closes my tick-67 stale-pin red)

**Verdict:** ✅ PASS. The `performanceMode → cinematicMode` rename I flagged at tick 67 is now **logged + its stale test pins updated** (suite green — my tick-67 red is resolved). All three toggles are sound: **cinematic mode** renames + migrates the old value (default plays; old perf=1 → cinematic off); **real performance mode** is a new server-readable cookie that gates two heavy fetches, **default OFF = byte-for-byte today**; the **dev-icon toggle** is correctly **ANDed with the founder gate** — a non-founder can't summon the Dev Console icon via the cookie — and it fixes a profile-menu nav bug.

**Audited:**
- **Ran the test myself:** `smoke-profile-toggles` **15/0** (cinematic default + migration, perf/dev-icon cookie parsers, skip-path markers, no-navigate assertion). Full suite green (2525/0); the tick-67 stale pins (`smoke-dev-mode`/`-console`/`-transition`) are updated to the new names.
- **Dev-icon toggle stays founder-gated — VERIFIED (the one security-relevant part).** `agency/layout.tsx:144` computes `devConsole = devDocsAccessible(session) && devIconVisible` — the founder gate **AND** the icon preference. Topbar renders the Dev Console only when `devConsole && !publicShowcase && !showcaseMode` (`:89`). So a non-founder (`devDocsAccessible` false) never sees the icon regardless of the `aqua_dev_icon` cookie; the toggle is a founder *preference* on the gate, not a replacement. The nav bug is fixed (the "Dev Mode" row no longer `window.location.assign`s; entering the workspace is the popover CTA).
- **Cinematic = behaviour-preserving rename + migration.** `cinematicMode.ts` `cinematicModeEnabled()` defaults **true** (cutscenes play), migrates the old `aqua-performance-mode` value (perf on → cinematic off) on first read; the 3 transition consumers skip when disabled; CSS re-keyed to `data-cinematic-mode`.
- **Real performance mode — default-safe + honest.** New `aqua_perf_mode` cookie (server-read `performanceModePreference()`, **default false**); when ON, `agency/layout` + `page` skip the `getRequestOperationalAlerts` Supabase sweep + keep `scanDevTeamBoard` off the landing critical path. **Off = no behaviour change.** Honestly caveated: only the two heaviest repeated costs are gated; radar/intelligence panels are a documented larger follow-up.

**Findings:** none. UI-preference toggles, correctly gated (dev-icon ANDed with the founder gate), behaviour-preserving rename with migration, perf-mode default-safe, nav bug fixed.

**→ Commander:** Mark **three profile toggles done** — cinematic rename+migration (behaviour-preserving), real perf-mode (server-read, default-off = byte-for-byte, two heavy fetches gated with an honest follow-up caveat), dev-icon toggle correctly founder-gated (`devDocsAccessible && devIconVisible` — no non-founder bypass) + nav bug fixed. Suite green; **my tick-67 stale-pin red is resolved** (rename logged + pins updated).

## 2026-08-20 — 🟡 RED (stale test pins from an unlogged rename) — `performanceMode → cinematicMode`; not a behavioural regression

**Caught by the periodic full-suite check** (unlogged: `updates.md` top unchanged, count stable 2507). Suite is **RED — 6 fail** (was 0 last tick), but they're **stale source-shape test pins from an unlogged rename**, not product regressions — verified by reading the failing assertions:
- **`performanceMode` → `cinematicMode` rename.** `smoke-dev-mode` (isolated **46/2**, so real-in-isolation but stale, not a flake) fails "reuses the command-transition CSS system and respects performance mode" because it asserts the source contains `/performanceModeEnabled\(\)/`, but the component now imports **`cinematicModeEnabled` from `@/lib/chrome/cinematicMode`** — the "skip cinematic loading screens" toggle was renamed. Same cause for "Dev Mode — cinematic load-in (Phase 3)" and "Dev Console — topbar wiring". The toggle behaviour is preserved under the new name; only the test string is stale.
- **Churning dev-tasks tooling** — `only the plans that genuinely have no phases yield none` (the same actively-iterated plan-parser).

**Findings:**
- 🟡 **Stale source-shape test pins after an unlogged `performanceMode → cinematicMode` rename.** The rename (source: `chrome/cinematicMode.ts` / `cinematicModeEnabled()`) wasn't reflected in the `smoke-dev-mode` / `smoke-dev-console` pins that still assert `performanceModeEnabled()`. Not a behavioural regression (the cinematic-skip toggle still gates the load-in + reduced-motion still respected) — but it red-lines the suite. **Fix (test + log):** update the pins to `cinematicModeEnabled()`, and log the rename in `updates.md`. Same recurring pattern as the roadmap/dev-team stale-test reds — a rename ahead of its test pins.

**→ Commander:** Suite red (6 fail) is **stale test pins from an unlogged `performanceMode → cinematicMode` rename** + the churning dev-tasks tooling — **not a product regression** (the skip-cinematic toggle still works, just renamed; the source uses `cinematicModeEnabled()`). Update the stale `performanceModeEnabled()` pins and log the rename. Launch state otherwise green; blockers resolved.

## 2026-08-20 — ✅ PASS — Website-enquiry tenant isolation: app-level ownership guard on brand_enquiries (a real HIGH cross-tenant hole, closed)

**Verdict:** ✅ PASS — a comprehensive, defense-in-depth fix for a **real HIGH multi-tenant hole** the worker found: `brand_enquiries` RLS was degraded to a no-op (null-tolerant policy + `profiles.agency_id` never populated → `current_profile_agency_id()` null → "any internal user manages EVERY agency's enquiries"), and the routes addressed rows by **enumerable id**, so an agency owner could **read / reply / erase another agency's enquiries.** The new app-level ownership guard closes it on every `brand_enquiries` route, is column-authoritative (no metadata spoof), has **no existence oracle**, and works before + after the pending migration. Tested. **(Honest note: my tick-64 RLS audit verified the scoped client *applies* RLS but did not catch that the *policy itself* wasn't isolating pre-migration — the worker did. Verifying "the code uses RLS" ≠ verifying "RLS actually isolates.")**

**Audited:**
- **Ran the test myself:** `smoke-enquiry-tenant-isolation` **11/0** (guard predicate, foreign-id-looks-like-missing pre+post migration, form-capture cross-tenant).
- **Guard is column-authoritative + no oracle (`ownedEnquiry.ts`).** `loadOwnedEnquiry` returns a row only if owned: `agency_id` column equals the caller's agency, OR (column absent pre-migration) `metadata.agencyId` equals it — **a row whose column names a DIFFERENT agency is never owned via metadata** (`:41-46`, the column is authoritative → no metadata spoof). A foreign row and a missing row **both return `null` identically** (`:26-27`) — no existence oracle, so ids can't be enumerated across tenants. Projects `agency_id`, retries without it on the pre-migration `42703`.
- **Wired into EVERY brand_enquiries route — VERIFIED.** All 7 that read/mutate the table load through the guard with `session.agencyId`: `erase`, `classification`, `status`, `reply`, `lead`, `communications`, `calls` (+ recording). I confirmed each is GUARDED, and that the only two website-enquiries routes NOT using it (`contact-details`, `form-template`) **don't touch `brand_enquiries`** (their own agency-scoped stores, verified tick 1) — correctly out of scope, not a missed route. `form-capture` (admin-client ingestion) now scopes its email/phone match to the resolved agency — holds the capture rather than attaching to a stranger.
- **Root cause addressed.** `provisionSupabaseIdentity` now stamps `profiles.agency_id` (retries pre-migration); the agency-aware callers pass it — so once Ed applies the migration, RLS scopes the table itself with no code change. Defense-in-depth: the app guard holds regardless.

**Findings:** none. A thorough closure of a real HIGH cross-tenant hole — app guard on every route + root-cause profile stamping, column-authoritative, no existence oracle, tested.

**→ Commander:** Mark **website-enquiry tenant isolation done** — a real HIGH hole (cross-agency enquiry read/reply/erase via enumerable ids over a degraded RLS policy) is closed at the app layer on every `brand_enquiries` route (column-authoritative ownership, no existence oracle), form-capture cross-tenant attach closed, and the root cause (unstamped `profiles.agency_id`) fixed so RLS will isolate once the migration lands. **This raises the priority of applying the `brand_enquiries` migration** (`supabase db push`) — the app guard is the belt; the migration is the braces (DB-enforced). Suite green.

## 2026-08-20 — ✅ PASS — The finish list: `?? 0` trap closed · shared KPI views · battle-table P5 · Aqua Tags nav

**Verdict:** ✅ PASS on all four. The two with substance hold: the **`?? 0` fabricated-zero trap is genuinely closed** (an unmeasured reading is `null`, never a fabricated 0; a measured zero stays 0), and **shared KPI views are agency-scoped + role-gated** (no cross-agency leak). Battle-table P5 is look/feel only; the Aqua Tags nav is one additive row. All test-pinned.

**Audited:**
- **Ran the suites myself:** commercial-intelligence **10/0**, kpi-shared-views **6/0**, battle-table **18/0**, nav-audit **29/0**.
- **`?? 0` trap closed — the honesty contract (issues #15).** `commandIntelligenceService.ts`: KPI `value: number | null` (`:65`); `traffic7d`/`forms7d` come from `measuredCheckValue` (nullable) and render `null → "—"` not 0 (`:162,169`), with evidence that literally says "No pageview reading yet — **not a measured zero**". Behaviourally pinned: an unmonitored agency → `lineage.pageviews === null` / `pageviewsMeasured === false` ("a consumer cannot see a fabricated 0", `test:96-99`), and a *measured* zero (pageviews:0) → derived roas/conversion stay `null` (zero-denominator, not a fake value, `:81-87`). Same fabricated-zero honesty verified across Marketing/KPI/Client-Health, now on the commercial-intelligence funnel.
- **Shared KPI views — agency-scoped, role-gated.** `kpi-registry/views/route.ts` GET/POST/DELETE all `requireRole([...AGENCY_ROLES])` and scope to **`session.agencyId`** (never a body-supplied agency) via `kpiSavedViews.ts` (same pattern as `kpiTargets`) — a shared view can't cross agencies. `saveSharedKpiView` logs `actorUserId`; same-name replaces (matches the browser-local half).
- **Battle Table P5 (cosmetic)** — a command-rail drill-in strip + war-room accent on the 10 planning stations; a Phase-5 shape test pins it, no logic/data change. **Aqua Tags nav** — one additive `sidebarLayout.ts` row → `?view=tags` (+ allow-list id), pinned by `smoke-nav-audit`. Both trivial + additive.

**Findings:** none. Four small items, all clean; the two substantive ones (fabricated-zero honesty, agency-scoped shared views) verified.

**→ Commander:** Mark **the finish list done** — `?? 0` trap closed (unmeasured → null, not fabricated 0; measured zero stays 0 — issues #15 resolved), shared KPI views agency-scoped + role-gated, battle-table P5 cosmetic, Aqua Tags nav additive; all test-pinned, suite green. **This clears the recent logged backlog** — MFA 3+4, RLS residue, Aqua Engine, and this are all now audited; the queue is back to clean.

## 2026-08-20 — ✅ PASS — RLS residue: service-role 23→13 (scoped client respects RLS) + brand_enquiries tenant column (resolves my tick-62 red)

**Verdict:** ✅ PASS. A real tenant-isolation improvement: 10 website-inbox routes moved off the RLS-bypassing admin key onto a **scoped client** (anon key + the caller's Supabase cookies → RLS applies as the signed-in user), so a **demo/showcase session now 401s instead of mutating real enquiries via the admin key.** Service-role sites cut 23→13, each now pinned + documented — this **resolves my tick-62 RLS-docs red**. The `brand_enquiries` agency-column migration is honestly flagged as **not yet applied** (Ed runs it). Suite green.

**Audited:**
- **Ran the tests myself:** `smoke-service-role-usage` **3/0** (was RED at tick 62 — now green, the 13 survivors documented) and `smoke-rls-policy-coverage` **9/0** (brand_enquiries tenancy contract). Full suite green (2495/0).
- **Scoped client genuinely respects RLS (`supabase/scoped.ts`).** It builds the "signed-in user's OWN Supabase client — **anon key** plus the caller's session cookies, so every query runs under row-level [security]" (`:9-10`) — **not** the service-role/admin key that bypasses RLS. It **throws `AuthError(401)` when no live Supabase user backs the request** (`:37`) — so a demo/showcase session (cookie-only, no Supabase identity) gets a loud 401 instead of reading/mutating real data. The 10 `website-enquiries/*` + `inbox/media` routes use it. The load-bearing tenant-isolation fix, and it's real.
- **Service-role reduction measured + guarded.** 23 sites/18 files → **13 sites/8 files**; `smoke-service-role-usage` pins the 13-set **and** requires each survivor justified in `rls-enable.md` (the guard whose docs-gap I flagged tick 62 — now satisfied). Enquiry hard-delete is `.select("id")`-verified so an RLS-filtered delete can't silently no-op. The remaining 13 are legitimate (public ingestion, storage, health).
- **Graceful pre-migration.** Public insert paths stamp `agency_id` + `metadata.agencyId` with a `PGRST204` retry-without-column, so enquiry capture survives the window before the migration lands.

**Findings:**
- (note, not a defect) **The `brand_enquiries` agency-column migration is not applied yet** — honestly flagged; **Ed runs `supabase db push` from `aquaCRM/supabase/`, then `rls-verify.sql`.** Until then, DB-level tenant scoping of `brand_enquiries` by `agency_id` is pending (the app-code changes — scoped client, demo-401, insert stamping — are already live; the migration's shape is pinned by `smoke-rls-policy-coverage`). I can't apply/verify a live migration; its structure (column + backfill + keep-filled trigger + agency-matched policy, null-tolerant ratchet) reads sound and is test-pinned.

**→ Commander:** Mark **RLS residue done (code)** — service-role cut 23→13 with the movers now on an RLS-respecting scoped client (demo sessions 401 instead of admin-key-mutating real enquiries), the 13 survivors pinned + documented (**resolves my tick-62 red**), hard-delete no-silent-no-op. **Action for Ed:** apply the `brand_enquiries` agency-column migration (`supabase db push` + `rls-verify.sql`) to land the DB-level tenant column. Suite green; launch blockers resolved.

## 2026-08-20 — ✅ PASS — MFA Phases 3+4: session assurance · side doors closed · recovery codes

**Verdict:** ✅ PASS. The security-critical part — **"side doors closed"** — genuinely holds: neither magic-link nor Google-OAuth can mint a session for an MFA-enrolled account; both call the gate **before** minting, refuse an enrolled account, and **fail closed** when enrolment can't be read. Session assurance stamps `aal` honestly, and recovery codes are scrypt-hashed + single-use-by-deletion + rate-limited + post-password. Behaviourally tested (the doors test asserts *no cookie is minted*). One honestly-flagged, low-exposure residual.

**Audited:**
- **Ran the suites myself:** `smoke-mfa` **70/0**, `smoke-mfa-doors` **13/0**; full suite green (2495/0, tick 63).
- **Side doors closed — VERIFIED (the crux).** Both `auth/magic/verify` (`:58-59`) and `auth/oauth/google/callback` (`:60-61`) call `checkSideDoorMfa(email)` **before** any `issueSession`, and `return err(…)`/403 when the decision is `refuse` — a refused sign-in never mints. `gateSideDoorSession` (`mfa.ts`): `unavailable → refuse` (fail-closed — "nothing confirmed, nothing minted"), `absent → clear`, `found → hasVerifiedFactor ? refuse : clear`; `hasVerifiedFactor` keys on `status === "verified"` (an un-confirmed enrolment doesn't falsely block). The OAuth gate "sits before BOTH paths, the first-run bootstrap included." So MFA cannot be bypassed via magic link or Google.
- **Session assurance — honest.** Every session-minting route stamps `aal` — `aal2` **only** when a second factor (TOTP/recovery) was actually verified by the minting flow; password/magic/Google → `aal1`; absence fails closed. Read via `sessionAssurance`/`sessionHasSecondFactor`.
- **Recovery codes — secure.** Ten single-use codes, **scrypt-hashed** at rest (same format as passwords), **spent by deleting the hash** (single-use by absence, not bookkeeping), same 5/min limiter + lockout as TOTP, and only reachable **after a correct password** (not a standalone bypass). Shown once; native form-posts never trigger generation.
- **Tests behavioural (B).** `smoke-mfa-doors` imports the **real** `magicVerify`/`oauthCallback` GET handlers and asserts the security property directly — *no session cookie comes back* for an enrolled account, and refuse-on-unavailable ("an open-on-failure door is not closed"). `smoke-mfa` adds the recovery loop, aal stamps, shown-once, form-post suppression — "all red before the wiring."

**Findings:**
- 🟡 (honestly pre-flagged, low exposure, verified) **The two signup routes don't run `checkSideDoorMfa`** — but both **refuse existing emails** (`end-customer/signup:97-101` → 409; `auth/signup` → account-existence message), so signup can only create a **new** account (no MFA to bypass), not sign into an existing enrolled one. Exposure ≈ nil for the MFA-bypass concern. **Optional:** add the gate for defense-in-depth, or document the reliance on the existing-email refusal. (Also builder-flagged, non-security: recovery generation isn't on the enrolment screen yet; "backup codes" was a guess pending Ed's confirm.)

**→ Commander:** Mark **MFA Phases 3+4 done** — the side-door closure is real and verified (magic + OAuth refuse enrolled accounts before minting, fail-closed), session assurance stamps aal honestly, recovery codes are scrypt-hashed + single-use + post-password, all behaviourally tested (the doors test proves *no cookie minted*). **With the Phase 1–2 login gate (verified tick 58), MFA is now a complete, non-bypassable feature.** ⚠ Ops note (builder-flagged): the two doors now **require `SUPABASE_SERVICE_ROLE_KEY`** to mint (fail-closed by design) — confirm it's set in Vercel, or magic/OAuth sign-in returns `mfa_unavailable`.

## 2026-08-20 — 🟡 RED (docs-completeness, security-governance) — 8 service-role (RLS-bypass) files undocumented in the RLS plan

**Caught by the periodic full-suite check** (unlogged: count grew +6 → 2463, top of `updates.md` unchanged). One real red (reproduces in isolation), and it's a **governance/audit-trail gap, not a code bug:** `smoke-service-role-usage.test.ts` — its call-site **count is stable (13 sites / 8 files — that subtest passes)**, but a second subtest fails: **8 service-role files are not documented in `docs/development/plans/rls-enable.md`** — `clients/[clientId]/erase/route.ts`, `public/brand-enquiry`, `public/form-capture`, `telemetry/collect`, `databaseStorageHealth.ts`, `privateUploadStorage.ts`, `publicUploadStorage.ts`, `websiteEnquiries.ts`.

**Why it matters (mildly):** each service-role call **bypasses Supabase RLS**, so tenant isolation there rests on code, not the DB. The guard requires the RLS plan's phase-4 table to justify *why* each remaining site keeps the service role — otherwise the "we reduced service-role usage" claim can't be audited. The 8 sites look **legitimate** (public ingestion endpoints, storage, a DB-health probe — places that genuinely run without a user session or must cross tenants), so the fix is to **document/justify them**, not remove them.

**Findings:**
- 🟡 **The RLS plan doesn't document 8 of the 13 service-role sites.** A governance guard (likely newly-added, hence unlogged) is red until each RLS-bypass is justified in `rls-enable.md`. **Fix (docs, route to whoever owns RLS):** add the 8 files to the phase-4 table with a one-line "why this keeps the service role" each. Not a code regression — the count is stable and the sites are legitimate.

**→ Commander:** Suite has 1 red — a **docs-completeness governance gap**, not a bug: 8 RLS-bypass (service-role) files aren't justified in `rls-enable.md`, so the "service-role reduction" can't be fully audited. Finish the phase-4 table (one line per file). Likely mid-work (the guard was just added). Launch state otherwise green; blockers resolved.

## 2026-08-20 — ✅ PASS — Editor renamed to "Aqua Engine" (user-facing labels only)

**Verdict:** ✅ PASS. A safe cosmetic rebrand — the display name a user sees ("Website Editor" / "Portal editor" / "Open Studio" → **Aqua Engine**) across labels, tabs, buttons, hints, aria-labels. Correctly **did not** touch the load-bearing identifiers: the `website-editor` plugin id (keys installed state), URLs, and internal code identifiers are unchanged — so no persistence/routing/code break. `tsc` 0, suite green (2457/0, my run); 2 test pins updated. Nothing to flag.

**→ Commander:** Mark done — labels-only rename, identifiers preserved (no state/URL/code impact), verified green.

## 2026-08-20 — ✅ PASS — Codebase reorganised into domain folders (pure move, verified clean)

**Verdict:** ✅ PASS. A pure structural move — `src/lib/` (71 loose → 15 domain folders) and `src/lib/server/` (89 files → 12 families) reorganised, every reference form rewritten (aliases, relative imports, literal path strings, `join()` builds — 1,700+ touches). No logic changed, and I independently confirmed it's clean: **`tsc --noEmit` 0 errors**, suite at the **exact pre-move baseline** (2458 tests, 0 fail), and **no dangling old flat-path references**. Reduces duplication (six twin filenames resolved) as a bonus.

**Audited:**
- **`tsc --noEmit`: 0 errors (ran it myself)** — the authoritative check for a move: every import across the entire graph (including files no test exercises) resolves to its new location. Conclusive that no reference was left dangling.
- **Suite at the exact pre-move baseline — 2458 tests / 0 fail** (my run) — no test lost, no behaviour changed; the count matches the claim's pre-move baseline, so the move is behaviour-neutral.
- **No dangling old paths** — spot-grepped four files I'd cited at their old flat paths in prior audits (`@/lib/businessRadar`, `clientRadar`, `kpiRegistry`, `marketingIntelligence`) → **zero** old-path references remain; they're now under `radar/`, `clients/`, `kpi/`, `intelligence/` with all refs rewritten. The literal-path-string + `join()` rewrites (the classic move-refactor miss, invisible to `tsc`) were handled, and a `doesNotMatch` test guard was fixed so it didn't go trivially green.
- **Scope + hygiene.** Deliberately did NOT move what shouldn't move (`scripts/*.test.ts` — the glob is law; `src/app/` — paths are URLs; `built-ins/`, `components/`, `src/server/`). Six twin `*Service.ts` filenames resolved (logged in hazards-and-duplication.md); pre-move `src/` snapshot kept; workspace tree + symbol reference regenerated.

**Findings:** none. A rigorous, behaviour-neutral move — `tsc`-clean, suite at baseline, no dangling references, duplication reduced.

**→ Commander:** Mark **codebase reorg done** — verified a pure move: `tsc` 0 errors (whole graph resolves), suite at the exact pre-move baseline (2458/0), no dangling old-path references, duplication reduced, nothing changed behaviourally. (Heads-up: prior audits' `file:line` references to `src/lib/*` files now point at their *old* flat paths — the domain-folder locations are in the regenerated symbol reference / WORKSPACE-FILE-TREE.md.) Launch state unchanged: green, blockers resolved.

## 2026-08-20 — ✅ PASS — Docs-accuracy pass, and my tick-24 MFA finding is RESOLVED: login 2FA is now genuinely BUILT

**Verdict:** ✅ PASS on the load-bearing claim. The pass reconciles stale docs to source with `file:line` evidence, and the one I most needed to check — because it **contradicted my tick-24 finding** — holds: **MFA at login is now genuinely BUILT** (it was *absent* when I grepped this route at tick 24). So my tick-24 "MFA Phase 4 complete is false / login has zero MFA" finding is **RESOLVED** — the feature was subsequently built (unlogged), and this pass honestly corrected the docs.

**Audited:**
- **Re-verified the MFA claim in source (`api/auth/login/route.ts`).** At tick 24 I grepped this exact route → **zero** mfa/aal/factor/totp. **Now it has a real second-factor gate:** imports `loginMfaStep`/`raisedToSecondFactor` from `@/lib/server/auth/mfa` (`:19-22`); `loginMfaStep({user, code})` (`:312`) → `mfaRequired: true` refuses the session without a code (`:320`); rate-limited code attempts (`:329`); real `supabase.auth.mfa.challenge`/`verify` (`:340-344`); and the load-bearing check — **`if (!verified || !raisedToSecondFactor(verified.access_token))`** (`:355`) refuses unless the returned session's **`aal` claim actually rose** (a 200 that didn't raise assurance is rejected). A correct gate, not a rubber-stamp. Phases 3–4 (session assurance, recovery codes) remain honestly open per the pass.
- **The pass's method is sound (checklist F).** It read the source for each claim and marked fixed items **RESOLVED with `file:line` evidence rather than deleting them** — connect codes shipped (matches my Connect-flow audits), RLS on in live Supabase, radar infra health, issues #9b/#15. It also honestly re-scopes an earlier wrong "no RLS migrations" note (they exist — 14 migrations in `aquaCRM/supabase/migrations/`, only visible outside `portal/`). Corrections, not overclaims.

**Findings:** none. An honest source-verified reconciliation that closes a real gap I'd flagged.

**→ Commander / Ed:** **My tick-24 MFA finding is RESOLVED** — sign-in 2FA is now genuinely built with a proper `aal`-raise gate (not just claimed). The "is 2FA a launch requirement / it doesn't exist today" question I raised is now **moot for the login gate** — it exists; only MFA Phases 3–4 (session-assurance, recovery codes) remain open. Docs-accuracy pass is honest (source-verified). Suite green (2457/0, tick 57). The one standing decision still on Ed: the **data-retention time-limit** (DPO pack Q1).

## 2026-08-20 — ✅ SUITE GREEN again (tick 55) — every recent red resolved

**Verdict:** ✅ Re-ran the full suite: **2413 pass / 0 fail / 1 skip.** The active-development burst (ticks 47–53) has fully settled; **every red I flagged is now resolved:**
- ✅ Meta "fail closed" security regression → `smoke-meta-master-inbox` 5/5.
- ✅ Roadmap dangling-plan reference (`roadmap.md:121`).
- ✅ `seventyNinthCollection` state-collection **data-loss gap** → wired into `parseBlob`/`empty()`, `smoke-state-roundtrip` 3/3.
- ✅ The churning `smoke-dev-tasks-parse` red → now green (the commander's banner diagnosed it as a **stale test** pinning the marketing plan's "BLOCKED on Ed" prose after that phase legitimately became "✅ SHIPPED" — plan right, test stale).

Closes the loop on the commander's banner ("one red observed since"). Standing process point still holds: much of that burst landed **unlogged** and was caught only via periodic full-suite runs.

**→ Commander:** Confirming **suite fully green (2413/0)** — all recent reds cleared, launch blockers remain resolved. Nothing open on my side.

## 2026-08-20 — 🟠 SUITE RED BURST (unlogged, mid-flight) — a new PortalState collection isn't wired into persistence (data-loss gap)

**Caught by the periodic full-suite check.** A burst of unlogged work landed (~+55 tests → **2410**; the docs-queue still shows nothing new), and the suite went from 1 red to **~9 fails** (that run also reported an anomalous exit-0, and the machine is under heavy load — workers actively mid-flight, suite >2min). I verified the clearest, most concrete failure directly in isolation:

- 🟠 **A new `PortalState` collection is not persisted — `smoke-state-roundtrip.test.ts` (isolated 2 fail, real, not a flake).** The state-roundtrip integrity guard reports **"parseBlob spreads parsed but still omits: `seventyNinthCollection`"** + a second failure that it has **no `empty()` default**. So a `seventyNinthCollection` field was added to `PortalState` (`types.ts`) but **not wired into `storage.ts`'s `parseBlob` (rebuild-from-blob) or `empty()` (default)** — it would **not survive a save/load round-trip (data loss)** and has no default (undefined-access risk). The guard is doing its job. **Fix (trivial):** add `seventyNinthCollection` to `parseBlob`'s rebuild + `empty()`'s defaults, the pattern every other collection follows. *(Placeholder-ish name → likely WIP, but the type + guard are live, so the tree is red until it's wired.)*

**The other ~7 fails** are in the still-churning `dev-tasks`/roadmap tooling + likely cascade from this mid-flight burst; I did **not** enumerate each against a rapidly-changing tree (they'll shift next tick). The state-integrity gap above is the concrete, non-churning one.

**→ Commander:** **Suite is RED again (~9 fails) from a fresh burst of unlogged work.** The one to fix now regardless of the churn: **wire `seventyNinthCollection` into `parseBlob` + `empty()`** (`storage.ts`) — a new state collection currently can't persist. And (recurring) **LOG this work in `updates.md`** — a +55-test burst with 9 fails is entirely invisible to the docs-queue. I'll re-assess the full fail-set once the active work settles. Launch blockers otherwise clear.

## 2026-08-20 — 🟠 SECOND SUITE RED (regression, unlogged) — Meta "fail closed" security test broken at readiness; its security assertions no longer run

**Caught by the periodic full-suite check** (the queue still shows nothing new). A **second** red has appeared since tick 35: `smoke-meta-master-inbox.test.ts` "Meta readiness, OAuth state and webhook signatures fail closed" now **fails**, and it's a **real regression** — fails in isolation (4/1), not a flake. It was **5/5 green when I audited it at tick 14**. Suite is now **2343 pass / 2 fail** (roadmap + this).

**The failure is at readiness (`test:26`), which aborts the security checks below it.** `metaInboxReadiness("agn_test").configured` returns **false** where the test expects **true**, even though the test sets the full standard env (`META_APP_ID`/`APP_SECRET`/`WEBHOOK_VERIFY_TOKEN`/`GRAPH_API_VERSION` + an https base URL). The env→values mapping (`integrationConnections.ts:301-306`) and readiness's required fields (`metaMessaging.ts:57-74`) both *look* intact on inspection, so the break is subtler — consistent with **unlogged Meta/Instagram work** (the same test now asserts `www.instagram.com` + `instagram_business_manage_messages`, added with no `updates.md` entry). Whoever made that change must diagnose the readiness regression.

**Why it matters:** the test aborts at line 26, so the **fail-closed security assertions never run** — the OAuth-state-tamper check (`verifyMetaOAuthState(state+"tampered").ok === false`, `:39`) and the webhook-signature-tamper check (`verifyMetaWebhookSignature(raw+"x", …) === false`, `:51`) are now **unverified, not proven broken**. So this is **not** a demonstrated fail-open — but the Meta webhook/OAuth fail-closed guarantees (sound at tick 14) are **no longer test-protected** while it's red, and the regression itself is real and unexplained.

**Findings:**
- 🟠 **Real unlogged regression red-lines the Meta security test.** `metaInboxReadiness` reads not-configured with the standard env (`smoke-meta-master-inbox.test.ts:26`), aborting the fail-closed OAuth/webhook assertions. **Fix (route to whoever did the Meta/Instagram change):** diagnose why readiness returns false with the standard `META_*` env, restore it, and confirm the OAuth-state + webhook-signature fail-closed assertions still pass.
- 🟠 **(process, recurring) More unlogged work.** The Meta/Instagram change has no `updates.md` entry — same as the dev-roadmap feature (tick 35). **Two** unlogged changes have now each produced a suite red the queue couldn't see.

**→ Commander:** **The suite has a SECOND red** — a real (isolation-confirmed) regression broke the Meta readiness/security test (`smoke-meta-master-inbox.test.ts:26`), which stops its fail-closed OAuth/webhook checks from running. Route to whoever made the unlogged Meta/Instagram change: fix readiness + re-confirm the security assertions pass. And **log Meta/Instagram + dev-roadmap in `updates.md`** — the queue is now demonstrably blind to real regressions. (Not a confirmed security hole — the security assertions are unverified, not shown fail-open. Launch blockers otherwise clear.)

## 2026-08-20 — 🟠 SUITE RED (caught by a periodic health check) — dev-roadmap integrity test fails on a dangling plan reference (+ unlogged work)

**How this surfaced:** after ~11 quiet ticks where the docs-queue showed nothing new, I ran the **full suite** as a periodic health check (not just the header scan) — and it's **RED**. The tree has grown to **2346 tests** (was ~1817–1874 when last fully run) but `updates.md` still shows only the 2 already-audited 2026-08-20 entries. So substantial work — including a whole **`dev-roadmap` feature** (`smoke-dev-roadmap.test.ts`, 31 cases) — landed with **no `updates.md` entry**, invisible to the docs-driven queue.

**The failure — real, reproduces in isolation (30/1, not a flake).** `smoke-dev-roadmap.test.ts:163` ("the real roadmap loads, and progress is COMPUTED from tasks not typed") fails: `stages-carry-what-the-client-sees-retire-the-four-mode-enum names a plan that does not exist: portal-products-scope-down`. Confirmed: **`docs/development/roadmap.md:121`** declares `**Plans:** portal-products-scope-down`, but **`docs/development/plans/portal-products-scope-down.md` does not exist** — `portal-products-scope-down` is a *memory-note* name, not a plan file. The integrity test (every roadmap `**Plans:**` must name a real plan) is working correctly; the roadmap data is wrong. **Sole red** in the suite (otherwise 2344 pass / 1 skip).

**Findings:**
- 🟠 **The full suite is RED on a dangling plan reference — it breaks the green-suite gate for everyone.** "Run the full smoke suite green before done" is a CLAUDE.md non-negotiable; right now it can't be met. **Fix (trivial; auditor is read-only, so routing, not editing):** at `roadmap.md:121` either drop/correct `**Plans:** portal-products-scope-down` (it's a memory note, not a plan) or create `docs/development/plans/portal-products-scope-down.md`. Then green is restored.
- 🟠 **(process) Substantial unlogged work — the docs-queue is out of sync with the tree.** ~+470 tests and at least a whole `dev-roadmap` feature landed with **no `updates.md` entry**. The auditor works from `updates.md` (docs-are-the-queue), so unlogged work is never queued for audit — exactly the pattern that hid earlier issues. Log substantial changes so they enter the queue.

**→ Commander:** **The suite is currently RED** — fix the one-line dangling reference at `roadmap.md:121` (a memory-note name masquerading as a plan) to restore the green-suite gate. **And log the unlogged `dev-roadmap` work** (+ whatever else drove +470 tests) in `updates.md` so I can audit it — right now it's shipped but invisible to the queue. **Process note for me:** header-only scans miss unlogged work; I'll run the full suite periodically on quiet ticks, not just check the queue. Launch blockers otherwise all-clear (this is a doc-integrity red, not a product defect).

## 2026-08-20 — ✅ PASS — Dev Team portal (icons · accuracy · Command Centre wiring) — the board that refuses to overclaim

**Verdict:** ✅ PASS. This internal founder tool is well-built and, more importantly, **honest by design** — its "accuracy" half is the auditor's own mission applied to the dev-team board: it stops a worker row overclaiming completion over its plan's real state, keeps the badge/station/board one number by construction, and matches my 🔴 rulings to their ✅ resolutions without hiding anything. I verified its central catch is correct (MFA is genuinely absent from login). Founder-gated, URL-guard on the station, behaviourally tested. One real finding to route — the MFA overclaim still lives in the shared brain.

**Audited:**
- **Suite:** `smoke-dev-team-portal` **8/8** (this portal went from zero coverage to a guarded contract).
- **P2 accuracy — the board doesn't overclaim (I verified the central catch).** The builder found `mfa-login`'s worker row ("✅ Phase 4 complete — PARKED") was dragging the plan into **Shipped** while the login route has **no MFA**. **Verified independently:** `grep -niE "mfa|aal|factor|totp|otp" src/app/api/auth/login/route.ts` → **zero hits**. So the "complete" claim is genuinely false and the new `isParked()` demotion (Shipped → Ready-next, verdict handed back to the plan) is correct. Same for `connect-flow-real-codes` self-classifying SHIPPED with open gates → now "🔴 NOT LAUNCH-DONE". The board reflects reality, not the rosiest row.
- **The badge is one number with the board.** `agency/page.tsx` computes it from the **same** `composeLanes(scanDevTeamBoard())` the station renders — badge, station "Blocked" tile and board Blocked lane equal **by construction** (an open launch blocker reads `critical`). Same consistency discipline as the other Command-Centre surfaces.
- **The auditor page reads MY log honestly.** `devTeamAuditor.ts` `supersededBy` is set **only on authored evidence** (a newer ✅ / a ✅ RESOLVED banner naming the same subject), with "Phase" excluded so Phase 1 can't close Phase 2 — an unmatched ruling is labelled **unresolved, never dropped**. (This is what makes my audits.md discipline — ✅ RESOLVED banners naming the closer — machine-checkable.)
- **P3 station gating — verified.** `commandStationMode(value, devTeamVisible)` returns the devteam station **only when `devTeamVisible`** (`_DashboardCommandCenter.tsx:2393`); a hand-typed `?station=devteam` can't land a non-founder there. Founder gate is the same `devDocsAccessible` used by Dev Docs / Dev Console.
- **Tests behavioural (B).** 8 cases drive the real `parseWorkers`/`composeLanes` (parked-vs-shipped, trouble-wins-over-parked) and the real `parseAuditFindings` supersede matcher (incl. "an older ✅ must not close a newer 🔴", "same plan, different phase ≠ same subject") + the icon contract (proven to guard) + the station wiring.

**Findings:**
- 🟠 **(route to the commander — verified real) The `mfa-login` "Phase 4 complete" claim is FALSE, and the shared brain still carries it.** `/api/auth/login` has **zero** MFA (confirmed — no mfa/aal/factor/totp/otp), yet `state.md`'s MFA worker row still reads "✅ Phase 4 complete" (the builder flagged this at updates line 215 — not their row to edit; the *board* no longer believes it). So a security feature is documented as done while absent. **Two actions:** (1) correct the `state.md` MFA row to match reality; (2) **decide whether sign-in MFA (2FA on login) is a launch requirement** — if so it's an **open gap**, not a complete feature (the connect-flow email code is a *connection* proof, not login 2FA). Not a defect in *this* work — this work is what *surfaced* it — but a real "done-that-isn't" to resolve.

**→ Commander:** Mark **Dev Team portal done** — icons complete, the board is honest (demotes overclaimed rows, badge=board by construction, my rulings matched to resolutions without hiding), the station is founder-gated + URL-guarded, tests behavioural. **Act on the verified MFA finding:** fix the false "MFA complete" row in `state.md` and rule on whether sign-in MFA is required for launch (it does not exist today). Launch blockers otherwise all-clear.

## 2026-08-20 — ✅ PASS — Internal chat → the owner's "Needs attention" (unread-chat operational alert)

**Verdict:** ✅ PASS. The wire surfacing unread team-chat into the owner's Command Centre alert is correct and safe: the count is computed **only over the owner's accessible channels** (reusing the Staff-Phase-6 read-gate), counts **only what's waiting on them** (unread DMs from others + @mentions, not all chatter), and returns **counts only — never message content**, so the alert can't leak a DM. Correctly classified (in-app, clears on reading), agency-scoped, behaviourally tested. No findings.

**Audited:**
- **Ran the suites myself:** `smoke-people-workspace` **21/21**, `smoke-operational-notifications` **15/15**.
- **Access-control respected — no channel leak (`people.ts:1041-1058`).** `chatAttentionForUser` iterates **`listPeopleChannels(agencyId, userId)`** (`:1045`) — the same read-gate verified in Staff Phase 6 that returns only `[team, ...the user's own DMs]`. So the count can never include a channel/DM the user isn't in. Per channel it uses `lastReadAt` and **skips read + self-authored messages** (`:1048`), counting only a **direct** message (`channel.kind==="direct"`) or an **@mention** (`message.mentions.includes(userId)`) — `if (!isDirect && !mentioned) continue` (`:1051`). "What's waiting on *you*", not every team message.
- **No content leak.** The function returns **`{directCount, mentionCount, total, latestAt}`** (`:1057`) — counts + a timestamp, never message text. The alert (`operationalAlerts.ts:79`) shows the total + a breakdown ("N direct + M mentions") + a link to `?view=chat` — a count with a specific reason and a direct path, not a vague number.
- **Contract + scope.** `kind:"in-app"` with `clearsWhen:"You open Team chat and read the messages waiting for you"` — honest (an in-app action, cleared by reading). `ownerChatAttention` scopes to the agency owner (found by role); the computation is agency-scoped.
- **Behaviourally tested (B).** `smoke-people-workspace:60-71` drives the real `ownerChatAttention` — `directCount===1` + `mentionCount===1`, and **null when nothing is waiting** (no alert). `smoke-operational-notifications:540-560` drives the real `listOperationalAlerts` — the `people:chat-attention` alert is present with unread, and **cleared after the chat is read**. No test weakened; no `.skip`.

**Findings:** none. A small wire done correctly — respects the chat read-gate, leaks no content, honest classification, tested.

**→ Commander:** Mark **Internal chat → Needs attention done** — the owner's unread-chat alert counts only their accessible channels (no channel leak), only what's genuinely waiting on them (DMs + mentions), returns counts-only (no DM content), is correctly classified in-app, and is behaviourally tested. Launch blockers remain all-clear. **This drains the last meaningful straggler — the audit queue is effectively clear**; the only remaining unaudited entries are trivial onboarding-UI prompts.

## 2026-08-20 — ✅ PASS — Freelancer workspace P1–P3: access-control (what a freelancer sees + can do)

**Verdict:** ✅ PASS. The freelancer access layer is secure and privacy-first: a freelancer sees **only their own jobs**, and for each only the **policy-permitted fields** — the client is "Confidential client project" (the real id/name *omitted from the payload*) unless the agency sets "named", the fee/notes/brief/dates are gated, and the mark-submitted action is role + ownership + policy + state gated. Server-side filtering (not UI-hiding), fail-safe defaults, behaviourally tested. Completes the freelancer feature alongside the earlier preview audit.

**Audited:**
- **Ran the suite myself:** `smoke-dev-mode` **48/48** (covers the freelancer POV + P2/P3).
- **P1 — view filters server-side, jobs scoped to the freelancer (`freelancerWorkspace.ts`).** `freelancerWorkspace(agencyId, userId)` resolves the freelancer's employee (`getPeopleEmployeeByUserId`; **null → empty state, no leak**) and lists **only their jobs** (`listPeopleFreelancerJobs(agencyId, employee.id)`, `:171`). `toJobView` (`:143-160`) adds a field **only if the policy allows** — `brief/dates/feeLabel/notes` each gated — and `clientLabel` is the real `client.name` **only** when `clientIdentity==="named"`, else the neutral `"Confidential client project"` (`:155-158`). The view interface has **no `clientId` field and no raw fee** — a hidden client/fee is *absent from the payload*, not merely UI-hidden.
- **P2 — agency policy, fail-safe (`:23-62`).** Defaults privacy-first (`clientIdentity:"anonymised"`, read-only). `normaliseFreelancerAccess` coerces any non-`"named"` value to `"anonymised"` (`:42`) — an untrusted/partial config can't reveal the client (tested: `clientIdentity:"wat"` → anonymised, `:463-465`). `resolveFreelancerAccess` returns the **per-job override ?? agency default** (`:110`).
- **P3 — mark-submitted, fully gated (`submitFreelancerJob` + route).** The helper returns `no_freelancer` / **`not_your_job`** (the jobId must be in *their* scoped list) / **`not_allowed`** (policy `markSubmitted`) / **`not_active`** before flipping status. The route 401s without a session, **403s unless `session.role==="freelancer"`**, and calls with `session.agencyId`/`session.userId` (never the body). A freelancer can only submit **their own active job, if policy allows, as themselves**.
- **Behaviourally tested (B) — the policy drives the view.** `smoke-dev-mode`: anonymised by default (`clientLabel==="Confidential client project"`, `:238`); **flip to `"named"` → the real `client.name` appears** (`:477-479`, driving the real `freelancerWorkspace`); read-only by default (`:240`); mark-submitted `not_allowed`/`not_your_job` until enabled (`:510-512`); per-job override wins then clears (`:523-533`); normalise fails safe (`:463-465`). No test weakened; no `.skip`.

**Findings:** none. Privacy-first, server-side-filtered, per-freelancer-scoped, fully-gated action — the "all configurable" access-control Ed wanted, done securely and tested against the real read model.

**→ Commander:** Mark **Freelancer workspace P1–P3 done** — a freelancer sees only their own jobs and only policy-permitted fields (client/fee omitted from the payload, not UI-hidden), defaults are anonymised + read-only + fail-safe, per-job overrides win, and mark-submitted is role/ownership/policy/state/session gated. With the earlier preview audit (session-minting escalation, resolved), the **freelancer feature is now fully audited**. Launch blockers remain all-clear.

## 2026-08-20 — ✅ PASS — Dev Console in the topbar (founder tool) + the standing `devteam` sidebar red is now CLEARED

**Verdict:** ✅ PASS. The ambient Dev Console (capture a finding from any page) is a founder-only internal tool, correctly gated at both the UI and the endpoint, reusing the existing findings API (not a second system) with no session-minting. Well-tested (badge honest + consistent). And the `devteam` sidebar-icons contract that stood red from tick 14 is **now green** (8/8) — the worker updated it; the "plan COMPLETE" claim is no longer contradicted by a red test.

**Audited:**
- **Ran the suites myself:** `smoke-dev-console-topbar` **19/19**, `smoke-dev-team-portal` **8/8** (the sidebar-icons red is resolved).
- **Gated at every layer.** UI: `Topbar.tsx:89` renders it only when `devConsole && !publicShowcase && !showcaseMode` — hidden for non-founders **and** in demo/showcase. The boolean is `devDocsAccessible(session)` (founder + Dev Mode — the gate audited in Dev Docs). Endpoint: `/api/portal/dev-team/findings` uses `requireRole([...AGENCY_ROLES])` **+** `if (!devDocsAccessible(session)) return null` (`route.ts:24-25`) — founder-gated **server-side**, so even a leaked icon couldn't POST. Absent for a normal owner/staff/client.
- **Reuse, not a second system.** The composer POSTs the **existing** findings `action:"create"` — a faster front-end, not a new backend. Reuses the `RadarQuickLookButton`/`NotificationCentreButton` shape (36px, `role="dialog"`, Escape/outside-click), `next/dynamic` lazy-mount (costs nothing unopened), and the audited `DEV_MODE_LOADIN_KEY`. **Never mints a session** — identity unchanged (the P3 copy correctly says "Still signed in as you · Your real data", distinct from the demo-fenced overlay).
- **Honest badge (tested behaviourally).** The badge counts **only open** findings + blockers (resolved/fixed excluded, `:133`), the badge and the panel read the **same** numbers ("the icon can never disagree with what it opens", `:69`), cached-and-invalidated (`:78`), the popover caps display but counts the whole truth (`:105`). Same honesty/consistency discipline as the other Command-Centre surfaces.

**Findings:** none. A well-gated, reuse-based founder tool with an honest, tested badge.

**→ Commander:** Mark **Dev Console done** — founder+DevMode-gated at UI and endpoint, reuses the existing findings system, no session-minting, badge honest + consistent, tests green. **And the standing `devteam` sidebar-icons red is now CLEARED** (8/8) — the worker updated the contract, so the Dev-Team-portal "plan COMPLETE" claim is no longer contradicted. The devteam area is settled + green; the last-known standing suite red is gone. Launch blockers remain all-clear.

## 2026-08-20 — ✅ PASS — Aqua Tag Phase 3: workspace moved into Fulfilment (as a view)

**Verdict:** ✅ PASS. A clean, faithful relocation — the Aqua Tags workspace moved from its standalone `agency/aqua-tags/` route into a Fulfilment **"tags" view**, wired exactly like the existing "technical" view (a server-rendered node passed as a prop). The old route is fully removed with **no dangling references**, the inbound links all point to `?view=tags`, and the routing logic (unchanged) still tests green. No findings.

**Audited:**
- **Old route removed, no dead duplicate.** `src/app/portal/agency/aqua-tags/` no longer exists; a grep for the old route path across `src/` returns **zero dangling references** (the only `aqua-tags` hits are the unchanged `api/portal/aqua-tags/detect` endpoint + the new fulfilment home). Addresses the hazards "no third copy / dead path" concern.
- **New "tags" view wired like "technical" (the established pattern).** `fulfilment/page.tsx` builds `tagsWorkspace = <AquaTagsWorkspace snippet/siteKey>` when `view==="tags"` (`:82-86`) and passes it down (`:112`) — the same server-rendered-node-as-prop shape the `technical` view uses (`:106`). `VALID_VIEWS` includes `"tags"` (`:44`); `_FulfilmentWorkspace` adds the `FulfilmentView` "tags" + a view-tab (`{id:"tags", label:"Aqua tags", icon:Radio}`, `:114`) + the `tagsWorkspace?` prop (`:161`).
- **Inbound links updated.** The company-card "Set up Aqua tag →" (`_TradingCompaniesPanel.tsx:123`) and the inbox-Channels "Master tags →" (`_WebsiteSourcesConfig.tsx:192`) both point to `/portal/agency/fulfilment?view=tags` (+ the dev-team API panel, consistent).
- **Logic unchanged — routing tests green.** `smoke-website-sources` **24/24** (the routing lives in `websiteSources.ts`, untouched by the UI move; the workspace component's logic was verified in the Phase 1 + Phase 3-start audits). Only the file location + the mount changed.

**Findings:** none. A relocation done correctly — no dead code, no broken links, faithful wiring, tests green. Only the purely-visual browser walk (Fulfilment → Aqua tags tab renders; the two "→ tags" links land) is left, as the builder flagged.

**→ Commander:** Mark **Aqua Tag Phase 3 (Fulfilment move) done** — the workspace is a clean Fulfilment view, the old route is gone with no dangling links, routing logic unchanged + green. This clears the oldest straggler in the queue. (Note: the `devteam` sidebar-icons contract is **still red** — 7 pass / 1 fail, unchanged since tick 14 — and the `devteam` area is actively churning (a new "Dev Console" just landed), so I'll audit it once it settles. Launch blockers remain all-clear.)

## 2026-08-20 — ✅ PASS — Erasure: 4th bug-class instance (`identityResolutionReviews`) + DPO review pack

**Verdict:** ✅ PASS on both. The 4th instance is a real PII gap — `identityResolutionReviews` holds enquirer PII but links via `selectedClientId` (not `clientId`), so the sweep missed email/phone/explanation-prose on erasure — fixed with the established split (always unlink; strip only when resolved AS the erased client; a separate party kept), tested both ways. And the **DPO pack is exemplary honest compliance documentation** — it explicitly disclaims compliance, marks each item verified-by-test-or-not, lists every evidence limit, and surfaces the weakest point (RETAIN has no expiry) as a DPO question rather than hiding it. This is the auditor's own standard.

**Audited:**
- **Erasure suite (isolated): 27/27 pass.** Full suite this run: **1 fail** — `dev team portal — sidebar icons` (the standing unrelated `devteam` contract; the builder's "4 fail" was a snapshot while the marketing worker was also mid-edit — those have since cleared). No erasure regression.
- **4th instance — real gap, correctly fixed (`clientErasure.ts:318-348`).** `identityResolutionReviews` is now a dedicated collection (`:60`). The fix processes only reviews that name this client (`:324`), **always drops the link** (`selectedClientId=undefined` + clears the resolution's `clientId/clientName/clientContactId` and filters candidates, `:327-338`), and **strips the enquirer's PII only when `resolvedAsClient`** (`:341`) — `name/email/phone/company/decisionNote` **and** `resolution.explanation` (the generated prose quoting the matched address) + candidates (`:342-347`). A separate party merely matched keeps their record; audit is counts-only. Same split as `brand_enquiries`/`persons`. The systematic "classify all 70+ collections for the bug shape (holds PII vs carries a matchable clientId)" is exactly how to find the class — and it cleared ~20 as genuinely unaffected, with reasons.
- **DPO pack — HONEST (`docs/compliance/erasure-dpo-pack.md`, 261 lines).** The core auditor check on a compliance doc is that it doesn't overclaim, and it doesn't: **"It is not a claim of compliance … the software cannot make anyone compliant — it can provide controls and evidence"** (`:17-18`). The per-category data map marks each row verified-by-test (✅) or **against a fake DB, not a live run** (⚠️, `:112`) or unverified. §6 "Limits of the evidence" honestly lists them all — **live scrub never run on the real DB, backups/PITR unaddressed, pre-fix log entries, sub-processor copies, and the org-link rationale residue** (`:163-182`; the last is the exact 🟡 I flagged tick 17), plus the unpublish-media residue from tick 8 (`:228`). §8 poses **8 questions a DPO must rule on**, chief being **Q1: RETAIN has no expiry — "indefinite retention is the weakest point in this design"** (`:193`) — surfaced, not hidden.

**Findings:** none — both clean. One item to route to Ed (already surfaced honestly in the pack, not a code defect):
- 📋 **RETAIN has no expiry (DPO pack Q1) — the design's weakest point, a real pre-real-client decision.** Finance/contracts/deliverables/erasure-audit are retained indefinitely; GDPR wants a justified period + eventual purge. Not a bug (retention is lawful); a policy/time-box decision Ed + the DPO must make before real client data. The pack correctly frames it as a question.

**→ Commander:** Mark **the 4th erasure instance + the DPO pack done** — the `identityResolutionReviews` PII gap is closed with the same verified split, and the DPO pack is honest compliance evidence (disclaims compliance, marks verified/unverified, states every limit, surfaces RETAIN-no-expiry as the key open question). This is the honesty standard the whole fleet should match. **To Ed/DPO:** rule on the pack's 8 questions before real client data — especially Q1 (a retention time-box). (Launch blockers all-clear; the `devteam` sidebar red still stands separately.)

## 2026-08-20 — ✅ PASS — Marketing overhaul (Phases 1–4): data spine · pulse · marketing radar · live funnel

**Verdict:** ✅ PASS. Marketing is a **read model** over already-computed data (the Radar `marketing` domain, the KPI registry, `commercialIntelligence.lineage`) — no engine rebuilt, consumed read-only, one cached radar build feeding all three views. The honesty contract is the risk here and it's **enforced at the type level and behaviourally tested**: an unmeasured family is `null`/`"unmeasured"` (never a fabricated `0`), enquiries a demo session didn't read report `available: false` (never "zero enquiries"), the worst lens wins a family's status, and a blind spot is never a false "attention". No findings.

**Audited:**
- **Ran the marketing suites myself:** `smoke-marketing-intelligence` **35/35**, `smoke-marketing-customer-profiles` **2/2**, `client-marketing-service` **2/2** — all green.
- **Read-only, no engine edit (`marketingIntelligence.ts`).** Every dependency is a read: `getCachedBusinessIssueRadar` (the **cached** radar — one build), `describeCommandKpis` (the KPI registry projection, already audited), `inspectRadarEvidence`, `listWebsiteSources`, `brand_enquiries`. No `mutate`/`storage.set`/`writeFile`/`logActivity`; the `.set()` calls are on local `Map`s. `marketingCommandModel()` feeds spine + pulse + funnel off one radar read (the efficiency claim holds).
- **Honesty rule — enforced by types + tested (the radar blind-spot contract).** Measures are typed `value: number | null` with a distinct `"unmeasured"` status (`:57-79`) and `available: boolean` for enquiries (`:126`) — never defaulted to 0. Tests pin it behaviourally: "a family the tag never reported is unmeasured — **null, never a fabricated zero**" (`:84-96` — asserts `value===null`, `value!==0`, `status==="unmeasured"`, and that unmeasured is **not** "attention"); "enquiries not read report **unavailable** — never 'zero enquiries'" (`:130-132` — `available===false`, "a demo session supplies none; that is not evidence of none"); worst-lens-wins the family status. The CLAUDE.md "missing evidence is a visible blind spot, never a healthy pass / never a fabricated reading" contract, correctly applied.
- **Reuse + scope.** Same read-model pattern as `staffCapacity.ts` (over the Radar `team` domain); agency-scoped by construction (built from `agencyId`-scoped radar + enquiries). The duplicate agency-only `websiteViews` counter was retired — one traffic number, not two competing ones.

**Findings:** none. A large surface, but a disciplined read-only projection with the honesty contract enforced in the type system and behaviourally tested — the same rigor as KPI Phase 1 and Client Health.

**→ Commander:** Mark **Marketing overhaul Phases 1–4 done** — spine/pulse/radar/funnel are a read-only projection over the existing radar + KPI + lineage (no engine touched, one cached build), and the honesty rule (unmeasured → null/unavailable, never a fabricated 0, never a false alarm) is enforced by types and behaviourally tested. Only the purely-visual browser walk of the new views is left. (Launch blockers all-clear; `devteam` sidebar red still stands separately.)

## 2026-08-19 — ✅ PASS — Erasure: Person records anonymise-if-orphaned (facet-retention + right-to-be-forgotten)

**Verdict:** ✅ PASS. Closes a **new** PII gap — the canonical `Person` carries no `clientId`, so an enquiry-originated client's email/phone survived erasure on the Person. The rule honors several contracts at once: **always unlink**, **strip identity only when orphaned** (no other client workspace AND not a standalone role), **keep facets/classification/history** (the CLAUDE.md "changing what someone IS never destroys what they DID"), and **don't over-strip** a supplier/partner or multi-workspace person (their own lawful basis). Tested **both directions** via the real API + mutation-checked. One honestly pre-flagged 🟡 residual.

**Audited:**
- **Erasure suite (isolated): 23/23 pass** (stable — the worker has settled).
- **The rule — correct + guarded (`clientErasure.ts:234-283`).** Only persons who actually held the erased client (or its relationship) are processed — **`if (!heldThisClient && !heldThisRelationship) continue`** (`:249`), so no unrelated person is touched. **Always unlink** (`:252-256`): drop the clientId from `facets.clientIds`, clear `relationshipId` if held. **Strip only if orphaned** (`:259-261`): `remaining.length === 0 && !STANDALONE_PERSON_CLASSIFICATIONS.has(classification)` (supplier/partnership/marketer excluded). Strip clears `emails/phones/name/company/jobTitle/notes/customFields` and blanks the free text in each `record[]` entry while **keeping its `kind`+`at`** (`:263-278`) — a de-identified fact, PII gone. Keeps facets/classification/classificationHistory/timestamps. Audit records **counts only** (`unlinked:persons`/`anonymised:persons`, `:283`), never a name. `persons` is a dedicated collection, skipped by the generic pass + excluded from `previewClientErasure` (anonymise-in-place, not delete).
- **Contracts honored.** Right-to-be-forgotten (orphan → all identity + free text stripped; the state-walk probe finds **0 survivors** for email/phone/name/company). Facet-retention (facets/classification kept). Lawful-basis / no-over-strip (supplier + multi-workspace intact). No PII in the audit log.
- **Tests real + BOTH directions (B — the rigor the original bug lacked).** `smoke-client-erasure.test.ts:632` seeds through the real `upsertPerson`/`addPersonRecord` API (no raw writes): orphaned enquirer → email+phone absent from the whole state (the `walk`, `:330`); **supplier intact** (`primaryEmail === EMAIL`, "must NOT be collateral damage", `:706`); second-workspace holder intact; record entries keep `kind`+`at` with free text cleared. Mutation-checked both ways (pass removed → orphan cases red; naive strip-always → supplier + second-workspace red). No `.skip`; no test weakened.

**Findings:**
- 🟡 (minor, honestly pre-flagged by the builder — Ed's call) **`PersonOrganisationLink.reason` free text can retain an email DOMAIN after orphan-anonymise.** `types.ts:629` — the reason is free text like "Shares the domain acme.example", so an orphaned person's own email domain can persist in a link rationale (the state-walk for the *full* email won't catch a domain-only trace). Usually low-identifying (a shared domain), but a personal/sole-trader domain can identify the person — a genuine residual RTBF trace. The link itself is a fact worth keeping; **Ed to decide** whether to clear or domain-redact `reason` on orphan-anonymise.

**→ Commander:** Mark **Person anonymise-if-orphaned done** — closes a real new PII gap (enquiry-originated clients' Person PII surviving erasure), strips only when orphaned while keeping facets + a supplier's/multi-workspace person's lawful details, tested both directions via the real API + mutation-checked. **Surface the one flagged residual to Ed:** whether `PersonOrganisationLink.reason` (can hold an email domain) should be cleared/redacted on orphan-anonymise. (Launch blockers remain all-clear; the `devteam` sidebar red still stands, separately.)

## 2026-08-19 — ✅ PASS (re-audit) — Erasure: the hook that erased NOTHING — real fix + real-flow test (🔴 RESOLVED — the LAST launch blocker)

**Verdict:** ✅ PASS — the erasure 🔴 is **RESOLVED**, and it was the sole remaining launch blocker. The builder found the hole was **bigger** than my tick-5 finding (the hook was a total no-op) and fixed it properly: the hook now actually resolves the client's people via the real links and deletes/anonymises them, every PII log site is id-only, and the new test **drives the real `upsert→convert→promote→update` flow** and asserts **zero trace of the email or phone in any value OR key** — and fails on the old code. Verified 18/18 in isolation, stable.

**Audited:**
- **Erasure suite (isolated): 18/18 pass, stable across repeats.** *(The worker is actively extending the file — 16→18 during this audit — and a full-suite run mid-edit showed a transient red on one erasure subtest that clears to 18/18 in isolation: a live-edit/load artifact, not a defect. Per the corrected flake note above: memory backend shares no state-file and files are separate processes, so isolated-green is authoritative here.)*
- **Root cause worse than tick-5 said — CONFIRMED.** `leads-pipeline` `onEraseClient` filtered `contact.clientId === clientId`, but **nothing writes `Contact.clientId`** — so the hook matched **nothing**, deleted nothing, and (since `clientErasure` skips a hook-owned slice) nothing else swept it. 8 traces survived (contact + lead rows/keys incl. **phone**, + 4 activity messages). My tick-5 finding was right but understated — the whole hook was inert.
- **The hook now actually erases (`leads-pipeline/index.ts:168-203`).** Resolves the client's people through the links the app really maintains — `Lead.convertedClientId` (stamped by `recordConversion`), the **reused** `clientMatchesLead`/`clientMatchesContact` matchers (the same the conversion handlers use — reaches a client converted straight from a contact with no back-link), `promotedFromLeadId`. Reads the client via `getClientForAgency` before `eraseClientCompletely` deletes it. Dispositions: **contacts DELETE**, **leads ANONYMISE**.
- **Anonymise strips ALL identity + drops the key pointers (`leads.ts:531`).** `anonymiseForErasure` deletes `emailPtrKey` + `phonePtrKey` (the `leads/email/…`, `leads/phone/…` pointers) and sets `email:""`, `name/phone/company/personId/notes/customFields: undefined` — a complete identity strip, funnel record kept; the log message is id-only. Contacts are deleted (row + email key + index).
- **The test proves ZERO trace via the REAL flow (`smoke-client-erasure.test.ts`).** Seeds through `leads.upsert → recordConversion → promoteLead → update` (**no raw `pluginData` writes**), erases, then a recursive `walk` over `storage.getState()` checks **every string value** (`:319`) **and every storage-key name** (`:325`) for a unique email + phone → asserts **none found**. Verified to **fail on the old code** (the old raw-seeded test passed while these fail — exactly the gap I named tick 5). This is the test I asked for.

**Findings:** none on erasure — the 🔴 is genuinely closed. Two adjacent notes:
- 🟠 **(route to `devteam`, unrelated) "Dev Team portal FINISHED / plan COMPLETE" (updates.md:14) is contradicted by a still-RED contract test.** `smoke-dev-team-portal.test.ts` "sidebar icons" still fails ("the Dev Team sidebar sections changed — update this contract deliberately") — the same red I flagged tick 14, now doubled-down as "complete." A plan is not complete while its own contract test is red. Route to `devteam`.
- (note) The full suite is currently **1842/2** — the 2 reds are (a) the erasure live-edit transient (clears isolated) and (b) the devteam contract. No product regression from the erasure fix.

**→ Commander: UN-HOLD the erasure launch gate — the 🔴 is RESOLVED.** The hook now actually erases (it was inert), all PII log sites are id-only, leads anonymise + contacts delete + PII-key-pointers drop, and the real-flow test proves zero trace of email/phone anywhere in state (and fails on the old code). **This clears the last of the original three launch blockers.** 🎉 Do a final clean full-suite run once the erasure worker settles (still adding tests), and route the unrelated `devteam` sidebar-icons red.

## 2026-08-19 — ✅ PASS (re-audit) — Pre-launch hardening: three auditor 🟡s closed (public uploads · Aqua Tag consent · Meta webhook)

**Verdict:** ✅ PASS — all three of my flagged 🟡 hardening items are **genuinely closed**, each verified in source + a passing behavioural test (the builder even mutation-tested the consent gate). Exemplary follow-through. Separately: the suite's currently-reported **1 fail is confirmed unrelated** (a `devteam` sidebar-nav contract, not this work) — routed below.

**Audited:**
- **Ran the three fix suites + the failing one myself (targeted — stronger than a full-count for a fixes re-audit):** public-upload **20/20**, consent-injection **5/5**, meta-master-inbox **5/5**; `smoke-dev-team-portal` 1 pass / **1 fail** (the unrelated devteam item). Last full run was 1786/0/1 + the builder's 1777/1 (the 1 = dev-team).
- **① Public upload content-type + path guard — CLOSED (`publicUploadStorage.ts`).** `ALLOWED_PUBLIC_UPLOAD_CONTENT_TYPES` = raster image + video only; `image/svg+xml`/`text/html`/everything-else rejected by omission with a typed `PublicUploadContentTypeError`. The gate throws at `:134` — **before the provider branch**, so it holds on the Supabase path too — on the **normalised** type (`;`-params stripped + lowercased, `:83-84`), so a decorated header can't smuggle a type. `svg` also dropped from `publicMediaAdapter`'s `EXT_BY_MIME`. Path guard: `startsWith(publicRoot + sep)` (`:165-166`) rejects traversal, absolute keys, **and** the `uploads-public-evil` sibling-prefix; `publicUrl` derived from the path actually written. Fail-open promotion means a rejected SVG stays inline (publish never breaks). Closes both parts of my Public-upload 🟡.
- **② Aqua Tag consent fail-OPEN → fail-CLOSED + the behavioural test — CLOSED (`aquaTagSource.ts`).** The `|| "necessary"` default is gone: `if (!permitted(item.consentCategory)) continue` (`:164`), so an unlabelled/unknown category is **held even under full consent** (comment `:160-161`). And the test I asked for **twice** now exists and is real: `smoke-aqua-tag-consent-injection.test.ts` **`vm.runInNewContext(AQUA_TAG_SOURCE, …)`** (`:107`) executes the **real shipped tag** against a fake DOM and asserts what reaches `document.head` — analytics seeded, no consent → **NOT injected** (`configRequests===1`, a real gate) → `applyPreferences` → injected retroactively, no re-fetch; rejection / marketing-separation / necessary / unlabelled all covered. **Mutation-checked** (restore the default → 2 fail; remove the gate → 5 fail), so the tests genuinely bite. Closes the Aqua Tag consent 🟡s.
- **③ Meta verify-token constant-time — CLOSED (`metaMessaging.ts`).** `constantTimeSecretMatch` (`:381-388`) SHA-256-digests **both** sides (always 32 bytes → `timingSafeEqual` unconditional, no length-guard leak) and compares **every** candidate with **no early return** (`:386` sets `matched` but keeps looping) — so neither the token length nor which candidate matched leaks via timing. `metaWebhookVerifyTokenAccepted` now returns it (`:404`); the old `candidates.has(...)` is gone. The POST HMAC is still the real gate. Closes my Meta 🟡.
- **Posture unchanged, depth added.** All three are defense-in-depth on already-PASS surfaces; no behaviour widened, prod fail-closed unchanged; the "no browser (no UI surface)" caveat is correct.

**Findings:**
- 🟠 **(unrelated, route to `devteam`) The suite is currently RED on 1 real failure — but NOT from this work.** `smoke-dev-team-portal.test.ts` "sidebar icons" fails: *"the Dev Team sidebar sections changed — update this contract deliberately"* (`+ 'findings'` in actual). The `devteam` worker added a nav item to `src/app/portal/dev-team/layout.tsx` without updating that contract list — its own guardrail firing correctly, left unfixed. Both files are `devteam`'s; the three hardening files are untouched by it. **Also unlogged** — the `dev-team/*` changes have no updates.md entry. Deterministic (not the tick-11 flake). Route to `devteam`: update the sidebar-icon contract deliberately + log the nav change.

**→ Commander:** **Mark the three hardening 🟡s CLOSED** — public-upload content-type/path guard, Aqua Tag consent fail-closed (+ the real VM behavioural test, mutation-checked), Meta constant-time verify-token are all verified. Exemplary follow-through on audit findings. Separately, **route the RED `smoke-dev-team-portal` "sidebar icons" to `devteam`** (their nav change vs their own contract test — unrelated to this work, and unlogged). Launch gates unchanged: erasure 🔴 the sole open blocker; the 🟠 dev-mode `process.env` flake stands (separate from this deterministic dev-team red).

## 2026-08-19 — ✅ PASS — Dev Mode Phases 3 + 4: cinematic load-in + isolation hardening (plan COMPLETE)

**Verdict:** ✅ PASS on both. **Phase 4 (the one that matters)** genuinely proves the fencing: a demo persona is minted **only** into the demo agency, and the mutation gate `assertTenantScope` **refuses** it on any real tenant — behaviourally, against the real gate. So a demo/dev-mode session can never mutate real data (critical, since dev mode writes to live Supabase locally). **Phase 3** is a cosmetic demo-gated load-in — inert for real users, respects reduced-motion + the performance toggle, reuses the existing transition CSS. No findings.

**Audited:**
- **Re-ran the FULL suite myself: 1787 · 1786 pass · 0 fail · 1 skip** (green; the dev-mode `process.env` flake didn't fire this run). **`smoke-dev-mode` ISOLATED: 47/47** (the file holding every Phase 3 + 4 test) — clean. *(Note: the total jumped 1751→1787 (+36) since the prior tick with no new updates.md entry — active unlogged test-authoring by the workers; green, but the docs-queue is lagging the tree.)*
- **Phase 4 isolation — VERIFIED BEHAVIOURALLY (the security contract).** `assertTenantScope` (`auth.ts:290-294`) throws `403 tenant_scope_mismatch` when the target agency isn't in `getSessionAgencyIds(session)`. The tests drive the **real** gate against a **real** minted demo session:
  - `smoke-dev-mode.test.ts:334` — every persona mint (enter + switch owner/staff/client) is fenced: `agencyId` = the demo agency, never the real one (also `:132` `agencyId !== the real agency`).
  - `:354-364` — **`assert.throws(() => assertTenantScope(demo, realAgency.id), /tenant_scope_mismatch/)`** (a demo write can't reach a real tenant) **and** `doesNotThrow` for the demo's own agency. Physical isolation at the scope layer, proven against the gate every mutation runs through.
  - `:275` the demo inspection is fenced (`isDemo`); the agency inbox's `session.isDemo ? Promise.resolve([])` guard means a demo POV shows no live data. Phase 4 ships **no new source** — it's verification, and the verification is real (not source-shape).
- **Phase 3 load-in — demo-gated + accessible, zero real-user impact.** Mounted `{session.isDemo ? <DevModeLoadIn/> : null}` (`portal/layout.tsx:29`) — real users never render it. `DevModeLoadIn` bails on `performanceModeEnabled() || reducedMotionPreferred()` (`:45`), plays once via a sessionStorage flag it removes (`:40-42`), reuses the `mm-command-transition` CSS (no new keyframes). The 3 tests are source-shape pins (the UI norm). Additive shared edits (layout mount, one z-index rule, two flag-arms) all flagged + demo-gated.

**Findings:** none. Phase 4's fencing is the right guarantee, proven against the real mutation gate; Phase 3 is a safe, accessible, demo-only cosmetic.

**→ Commander:** Mark **Dev Mode Phases 3 + 4 done — plan COMPLETE** — the isolation hardening genuinely proves a demo persona is fenced to the demo agency and refused on any real tenant (behavioural, against `assertTenantScope`); the cinematic is demo-gated + reduced-motion-safe. Only the live browser click-through is left, as the builder flagged. Launch gates unchanged: erasure 🔴 the sole open blocker; the 🟠 suite-flake finding stands.

## 2026-08-19 — ✅ PASS — Aqua Tag Phase 3 (start): the agency routing registry is company-aware

**Verdict:** ✅ PASS. Closes the company-blindness gap Phase 1 opened in the inbox routing manager (`_WebsiteSourcesConfig`): a company-routed site now displays as its company (not "your inbox"), and — the real fix — re-routing sends the **kind-specific field** so editing a company-routed site no longer **silently clears the company**. Verified end-to-end (display + the server POST); server-side routing was behaviourally verified in the Phase 1 audit. Suite green this run.

**Audited:**
- **Re-ran the FULL suite myself:** **1751 · 1750 pass · 0 fail · 1 skip** (green — the dev-mode isolation flake didn't fire this run; it remains intermittent per the cross-cutting finding below).
- **The silent-clear bug — FIXED end-to-end (`_WebsiteSourcesConfig.tsx`).** The dropdown value encodes the destination kind (`decodeDestination`: `company:X` → `{destinationCompanyId:X}`, `client:X` → `{destinationClientId:X}`, inbox → `{}`, `:57-60`); `encodeDestination` shows a company route as `company:X` so the row no longer reads "your inbox" (`:62-64`). `reroute` POSTs `{action:"update", id, ...routing}` with that kind-specific field (`:130`) — so a company reroute sends **`destinationCompanyId`**, not the old client-only body. Combined with the server's reassign-both-with-`||undefined` (`websiteSources.ts:165-166`, verified tick 11), the company is set and the client cleared — no silent wipe. Optimistic update with rollback on a failed save (`:134`).
- **Display — all three homes.** A company route shows the company name + a `Building2` badge (`:247`), a client route its client link (`:262-264`); the add + reroute dropdowns offer Your inbox · Clients · Your companies optgroups (`:210-218`).
- **Tests (B).** The panel contract (`smoke-website-sources.test.ts:140-165`) is source-shape (asserts the panel references `destinationCompanyId` + encodes `company:${…}`) — the repo norm for a UI component (no DOM renderer); I verified the decode/encode/reroute logic directly. The behavioural coverage is the server routing (Phase 1, 24/24). No test weakened; no `.skip`.
- **Scope + reuse.** Edits only `_WebsiteSourcesConfig` (the inbox routing manager); reads the `companies` the routing API already returns; `_ClientTagWorkspace` (client-scoped) correctly untouched. The Fulfilment-relocation of the workspace is explicitly **deferred + flagged for a commander decision** (touches shared nav) — honestly not done here.

**Findings:** none. A precise fix to a real bug Phase 1 opened (a company-blind panel silently clearing the company on edit), correct end-to-end. *(Observation, not a finding: the test total rose 1748→1751 with no matching updates.md entry and `smoke-dev-mode.test.ts` is the most-recently-touched test file — someone is editing tests underneath the queue, possibly the flake; green this run, but the 🟠 flake finding stands until it's consistently green or the env-injection fix lands + is logged.)*

**→ Commander:** Mark **Aqua Tag Phase 3 (start) done** — the inbox routing panel is now company-complete: company routes display correctly and re-route without wiping the company (the Phase-1 silent-clear is closed). Only the browser walk + the flagged Fulfilment-relocation decision remain. Launch gates unchanged: erasure 🔴 the sole open blocker; the 🟠 suite-flake finding stands (green this run, but intermittent).

## 2026-08-19 — 🟡 Cross-cutting (CORRECTED tick 15) — dev-mode flake: my earlier "`process.env` isolation race" mechanism was WRONG

**CORRECTION — I got the mechanism wrong and am retracting it.** **Verified this tick:** node's `--test` runs each file in its **own child process** (proved directly — two test files printed PIDs 63004 vs 63005), so **`process.env` does NOT leak across test files**; the "culprit" I named (`smoke-dev-docs.test.ts:65` setting `PORTAL_DEV_MODE`) **cannot** affect `smoke-dev-mode` — different process. And the suite runs `PORTAL_BACKEND=memory`, whose backend is a pure in-process `memoryBlob` (`storage.ts:142-147`) — it never touches `.data/portal-state.json`. So **neither `process.env` nor the state-file is shared** across these memory-backend unit files. The env-race story is false.

**What's actually true:** the *observation* stands — `smoke-dev-mode` failed 2 subtests **once** (tick 11), under heavy multi-worker load (the suite was observably slow that run), passes **47/47 in isolation**, and has been **green in every full run since** (ticks 12 · 13 · 14). So it is a **rare load-induced transient**, not a systematic isolation defect. The genuine cross-file hazards here are the filesystem (`.data/portal-state.json`), ports, and live Supabase — none of which these memory-backend unit tests share — which points at load/timing, not shared mutable state. **Downgraded 🟠 → 🟡.** The "inject env / make it hermetic" fix I recommended would NOT fix a load transient — retracted.

**Still valid — the diagnostic:** when the suite is red, **re-run the failing file alone** (`npx tsx --test scripts/smoke-dev-mode.test.ts` → 47/47) to tell a real regression from a transient, *before* trusting or dismissing a red run. That guidance holds; only the mechanism was wrong.

**→ Commander:** Treat this as a **rare load-induced flake** (mechanism unknown, likely CPU-starvation timing; seen once, not reproduced) — **no hermetic-env work needed** (files are already process-isolated). Prior verdicts that referenced "the process.env flake" (ticks 11–14) are unaffected in their PASS/FAIL conclusions — the flake was always noted as *unrelated* to the audited work; only this note's mechanism is corrected. *(Original tick-11 text retracted; kept this brief for the record rather than preserving the wrong analysis.)*

## 2026-08-19 — ✅ PASS — Aqua Tag Phase 1: tagged sites route to your own companies (routing keystone)

**Verdict:** ✅ PASS. The routing keystone is correct and multi-tenant-safe: company + client destinations are **agency-scoped** (a foreign company/client is refused), **client-XOR-company** is enforced at add + update (one home per site; a re-point clears the other), a company route is **recorded on the enquiry, not misfiled onto a client**, and an unregistered/no-destination site safely defaults to the inbox (old behaviour preserved). Behaviourally tested against the real store. (Suite caveat: the full run was red on 2 UNRELATED dev-mode isolation flakes — the cross-cutting finding above; Aqua Tag's own tests are 24/24 green in isolation and were not among the failures.)

**Audited:**
- **Re-ran the FULL suite myself:** 1748 · 1745 pass · **2 fail** · 1 skip — but **both failures are the dev-mode `process.env` isolation flake** (unrelated; 47/47 in isolation; cross-cutting entry above). **Aqua Tag's own suite is 24/24 green in isolation** and `smoke-website-sources` was not among the failures — so this feature is verified.
- **Agency scoping — VERIFIED (multi-tenant boundary).** `addWebsiteSource` (`websiteSources.ts:115-119`) and `updateWebsiteSourceRouting` (`:153-158`) validate a client via `getClientForAgency(agencyId, …)` and a company via `getTradingCompany(agencyId, …)` — **both agency-scoped**, so a site can't route to another agency's client or company (`assert.throws` on a foreign company, `smoke-website-sources.test.ts:102-105`). `update` also refuses a source not in the caller's agency (`:149`).
- **client-XOR-company — VERIFIED.** Both setters throw on `destinationClientId && destinationCompanyId` (`:110-112`, `:150-152`); `update` reassigns **both** fields from the input with `|| undefined` (`:165-166`), so a client→company re-point **clears the client** — one home (or inbox) only. `resolveWebsiteSourceRouting` returns the discriminated `{kind: inbox|client|company}` with a safe inbox default (`:88-95`).
- **No misfiling — VERIFIED.** The live paths branch on the destination kind: `routedClientId = kind==="client" ? … : undefined`, `routedCompanyId = kind==="company" ? … : undefined` (`form-capture/route.ts:166-167`); a company route stamps `routedCompanyId` on the enquiry and does **not** fire the client ledger (comment `:164-165`: "a company is not a client"). Inbox/client routing byte-for-byte unchanged.
- **Tests real + not weakened (B).** The resolver contract was retargeted to the union but still asserts substantive routing (inbox default `:41-42`, client routing incl. URL-normalisation `:47-48`, foreign-client refused `:64`, re-point+remove `:67-72`), plus a real company block (routes to company `:97-99`, foreign-company refused `:102-105`). Behavioural against the real store. No test deleted/`.skip`'d.
- **Reuse + scope.** Additive `destinationCompanyId` + a new `WebsiteSourceDestination` union on shared `types.ts` (flagged, localized); reuses `getTradingCompany`. No duplicate routing system; no git; memory store. Honest status: unit-verified, NOT browser/runtime-verified (headers-`getSession` route, no in-process rig) → commander browser-walk pending.

**Findings:** none specific to Aqua Tag Phase 1. (The red suite is the unrelated dev-mode isolation flake — filed as the cross-cutting finding above.)

**→ Commander:** Mark **Aqua Tag Phase 1 done** — routing is agency-scoped (no cross-tenant route), one-home client-XOR-company enforced, a company route is correctly attributed (not misfiled onto a client), inbox default preserved; behaviourally tested. Only the browser walk is left (route a company's site → confirm it lists). Launch gates unchanged: erasure 🔴 remains the sole open blocker; and see the new 🟠 suite-flake finding above.

## 2026-08-19 — ✅ PASS — Enquiry detail card Phase 1: the submission mirrored (modal)

**Verdict:** ✅ PASS. The modal is accessible and honors the consent-first contract — it distinguishes consent **given / declined / not-recorded** honestly (a decline is never a yes; an unasked form never assumes consent), mirrors every submitted field + the full `additional` answers (evidence, not a count), reuses the `ConfirmDialog` shell + the one `EnquiryCommunications` composer, and stays agency-internal. One nit: the "new behavioural smoke" is actually source-shape (the repo norm for UI), so a UI-logic slip wouldn't be caught by the suite — I verified the consent honesty in source directly.

**Audited:**
- **Re-ran the FULL suite myself:** **1748 · 1747 pass · 0 fail · 1 skip** (green; the claim's 1574 is stale drift).
- **Consent-first — HONEST (verified in source, `_EnquiryDetailCard.tsx:406-422`).** `ConsentRow` resolves three distinct states — `item.consent === true` → "Consent given" (+ purpose/version/date), `=== false` → "Consent not given", else → "Consent not recorded" ("This form did not record a consent answer. Confirm before contacting."). The source comment states the discipline: "a form that never asked is not the same as a visitor who declined, and neither is the same as a yes." No fabricated consent — the AquaCRM consent-first principle done right.
- **Layers + reuse.** Layer A mirrors every `formCapture` field in order + shows the `additional` answers **in full** (previously only counted). Layer B is read-only (consent-led, then classification, services, source, triage, timeline, linked lead/contact/client). Reuses `ConfirmDialog`'s shell (`useFocusTrap`, Escape/backdrop, `role="dialog"`/`aria-modal`) and the unchanged `EnquiryCommunications` composer. Agency-inbox path — internal stays internal.
- **The refactor preserved its contracts (B).** `_MasterInbox` extracted the inline block into the card (803→697L); row triage actions unchanged. The 5 retargeted contracts genuinely **moved, not weakened** — spot-checked: the "one contact-aware composer per enquiry view" contract still asserts the card hosts `<EnquiryCommunications>` with all four channels (`smoke-master-inbox-communications.test.ts:9-20`); the public-contact ingestion-route contract is intact. No test deleted or `.skip`'d.

**Findings:**
- 🟡 (minor) **The new test is source-shape, not "behavioural" as the update states.** `smoke-enquiry-detail-card.test.ts` regex-matches the `.tsx` (its own header admits "these are source-shape contracts") — modal a11y strings, `capture.fields.map`, the three `item.consent ===` branches, etc. Acceptable (the smoke suite has no DOM renderer — the norm for every UI component here), but a logic slip in the card's rendering (e.g., the consent-state branching) wouldn't be caught by a string match; I verified the consent honesty by reading the source. **Also a doc nit:** the update calls it "behavioural" — it isn't.

**→ Commander:** Mark **Enquiry detail card Phase 1 done** — the modal is accessible, mirrors the real submission, and surfaces consent honestly (given/declined/not-recorded, never assumed), reusing the shell + composer; the refactor kept its contracts. Only the purely-visual browser walk is left, as the builder flagged. (Coverage is source-shape, the UI norm here — a behavioural render test would harden the consent-state logic.) Launch gates unchanged: erasure 🔴 remains the sole open blocker.

## 2026-08-19 — ✅ PASS — KPI Intelligence Phase 1: KPI Registry + explorer upgrade (repurpose)

**Verdict:** ✅ PASS. The registry is a faithful pure projection — it **wraps, never recomputes** (value/target/baseline/series lifted verbatim off the built KPI), preserves **honest nulls** (no fabricated value where the source has none), and copies the series (no shared mutation). The explorer is a genuine repurpose of the existing comparison workspace, not a parallel build. Behaviourally tested. Low-risk, clean. No findings.

**Audited:**
- **Re-ran the FULL suite myself:** **1748 · 1747 pass · 0 fail · 1 skip** (green; the claim's 1574 is stale drift).
- **Faithful wrap, no recompute (`kpiRegistry.ts:104-138`).** `describeCommandKpi` lifts every field directly off the built `CommandKpi` — `value: kpi.value`, `target: kpi.plan.targetValue`, `baseline: kpi.plan.baselineValue`, `status`, `display` — with **no defaulting** (`?? 0`) and no separate computation, so a descriptor can never disagree with the KPI it wraps. `series` is a fresh `history.map(...)` copy (mutating the descriptor can't corrupt the source). `describeCommandKpis` preserves the snapshot's rank order.
- **Honest-null discipline preserved (the Radar/Client-Health contract).** A learning KPI's null target/baseline/value and empty series pass through untouched — the projection never manufactures a number where evidence is missing.
- **Reuse, not a third copy (D).** Repurposes `_CommandIntelligenceWorkspace` (registry-backed instrument selector + line/area/bar switching) rather than a parallel `_KpiExplorer`; the registry wraps the existing `CommandKpi`. Exactly the reuse the checklist wants.
- **Tests real + behavioural (B).** `smoke-kpi-registry.test.ts` — 7 input→output cases: field projection (`:51-63`), **series is a copy** (deepEqual values + notEqual the reference, `:66-70`), **honest nulls survive** (null target/baseline, empty series, `:73-81`), ordering (`:84-88`), search by label/category/unit. No test weakened; no `.skip`.
- **Scope + status.** Client-safe pure module; the shared `_CommandIntelligenceWorkspace.tsx` edit is additive (flagged); no git, no live data. Honestly logged as "logic-tested, NOT browser-verified by me" → commander browser-verify pending (Explore all KPIs → line/area/bar → search).

**Findings:** none. A faithful wrapping projection with honest nulls, a genuine repurpose, and behavioural tests — the foundation done right.

**→ Commander:** Mark **KPI Phase 1 done** (logic-verified) — the registry faithfully wraps each KPI without recomputing or fabricating, honest nulls survive, and it's a genuine repurpose of the comparison workspace. Only the purely-visual explorer walk is left, as the builder flagged. Launch gates unchanged: erasure 🔴 remains the sole open blocker.

## 2026-08-19 — ✅ PASS — Public bucket Phases 3–4: gate + renderers (plan COMPLETE)

**Verdict:** ✅ PASS. Mostly a verify-and-codify pass over P2's design, and it holds: media is promoted to the public CDN bucket **only on publish** (drafts keep inline `data:` URLs — nothing private leaks by default), the renderers serve the promoted CDN URL, and a real end-to-end capstone proves upload→publish→render drops the `data:` and emits the CDN URL. Behaviourally tested. One honestly-deferred follow-up (unpublish doesn't retract already-public media).

**Audited:**
- **Re-ran the FULL suite myself:** **1748 · 1747 pass · 0 fail · 1 skip** (green; the claim's 1607 is stale drift).
- **P3 gate — "nothing private leaks by default" VERIFIED.** The promotion walker `promoteBlockTreeMedia` has **exactly one caller** — `publishPage` (`pages.ts:140`), fed the `publicMedia` port from the publish handler (`handlers/pages.ts:129`). `publishPage` promotes `draftBlocks ?? blocks` to CDN URLs and clears `draftBlocks` at the moment of publish (`pages.ts:124-147`). No draft-save path promotes — so an unpublished draft's media stays inline `data:` and never lands in the public bucket. The module comment is accurate: "nothing public by default; only the published copy is promoted."
- **P4 renderers — CDN URL, no `data:` leak.** The end-to-end capstone (`smoke-public-media-promotion.test.ts:147-160`) seeds a draft with an inline `data:` PNG → drives the **real** `publishPage` (fake port → CDN URL) → the **real** `renderPageHtml` → asserts the rendered HTML `includes src="<cdnUrl>"` **and** `doesNotMatch /data:image\//`. The plan's "Done when," proven in memory.
- **Tests real + behavioural (B).** The promotion walker (data: only, dedup, recurse variants, **fail-open on a storage error so publish never blocks**), `publishPage` integration (port wired → published block carries the CDN URL; no port → inline, backward-compat), and the render capstone all drive the real functions. The foundation-wiring case is source-shape (a registration contract — acceptable). No test weakened; no `.skip`.
- **Reuse + scope.** Promotion rides the Phase-1 `storePublicUpload` (already audited) via the additive `publicMedia` port (flagged + Ed-approved in P2). No duplicate storage; memory backend, no live-Supabase junk, no git.

**Findings:**
- 🟡 (deferred, flagged by the builder — track it) **Unpublishing does not retract already-public media.** Content-addressed keys are shared across pages, so safe deletion needs refcounting; the builder deferred active deletion and left `deleteSupabasePublicUpload` in place for a refcount-aware cleanup. Reasonable — the bytes were already public when published, so an orphan at an unguessable CDN URL isn't a *new* exposure. But it means "unpublish" (or deleting a page) does **not** take the media down from the bucket — relevant if a client ever needs published media genuinely *removed* (the same right-to-be-forgotten angle as the erasure blocker: if promoted media carried personal data, unpublish wouldn't erase it). Not a defect in what shipped; a tracked follow-up before that guarantee is needed.
- (note) The **live Supabase-CDN upload path is source-shape-pinned, not exercised against a live bucket** (the storage boundary + prod fail-closed were verified in the Public-upload-storage audit). Honestly flagged as a non-code remainder; not a defect.

**→ Commander:** Mark **Public bucket Phases 3–4 done — plan COMPLETE** — promotion is publish-gated (drafts never go public), the renderers serve the CDN URL with the `data:` gone (end-to-end capstone), behaviourally tested. Track the deferred **unpublish/delete → retract-from-bucket** cleanup (refcount-aware) before any "take this media down" guarantee is promised. Launch gates unchanged: erasure 🔴 remains the sole open blocker.

## 2026-08-19 — ✅ PASS — Client Health Phases 3–4 (+ mount): "clients needing attention" panel

**Verdict:** ✅ PASS. Phase 3 rides the canonical client-radar fleet (no second source of truth); Phase 4's `listClientsNeedingAttention` returns which client / how bad / the top reason / a Fulfilment link — never a bare count — agency-scoped, and only ever lists **risk/watch** (a thin-data `learning` client is never surfaced, so no crying wolf). Behaviourally tested; the mount is wired and browser-verified by the builder. One optional naming nit.

**Audited:**
- **Re-ran the FULL suite myself:** green (exit 0 this tick; standing baseline **1747 pass · 0 fail · 1 skip** holds — nothing shipped since). Attention suite 3/3. (The claims' 1604/1639 are stale drift.)
- **Rides the fleet, agency-scoped (`clientAttention.ts:29-48`).** `listClients(agencyId)` filtered to active/non-churned → `buildClientRadarFleet(agencyId, {now, clients})` (the canonical rollup that folds in the Phase-1 factors) → keeps only `healthState` risk|watch → maps to {clientId, clientName, state, headline=summary, score, href}, risk-before-watch, worst-score-first. No parallel health computation, and a `learning`/`strong` client is excluded — thin-data honesty preserved.
- **Not a bare count.** The panel (`_ClientsNeedingAttention.tsx`) lists per client: state dot, name, state badge, the top reason (`headline`), score/100, and an arrow linking into `/portal/clients/<id>` (Fulfilment). The header chip ("N to review · M at risk") is a summary *above* the actionable list, with an honest empty state ("No active client is currently in a risk or watch state"). Which/how-bad/why/way-in.
- **Mount present + correct.** `page.tsx` fetches `listClientsNeedingAttention(agency.id, …)` in the parallel load (agency-scoped) and passes it through (`:51,78,356`); `_DashboardCommandCenter.tsx` renders `<ClientsNeedingAttention items={…}>` in the Day Command station (`:68,167,1262`). Builder browser-verified on :3032 (specific: "1 to review → Northlight Studio · WATCH · … · 91/100 · → Fulfilment"). I couldn't independently re-drive the shared server (preview-lock), but the data path is behaviourally tested and the wiring is verified-present + tsc-clean.
- **Tests real + behavioural (B).** `smoke-client-attention.test.ts` drives the real `listClientsNeedingAttention`: enquiry-none client → `risk` + `/Enquir/i` headline + correct href; a **churned client is never listed**; only risk/watch appear; empty agency → `[]`; risk-before-watch ordering. No test weakened; no `.skip`.

**Findings:**
- 🟡 (minor, optional — **not a bug**) **Field-name collision on the dashboard payload.** `payload.clientsNeedingAttention` is the new **array** (`ClientAttentionItem[]`, the panel prop) while `payload.actuals.clientsNeedingAttention` is a pre-existing **count** (a number fed to `calculateCompanyHealth`; compared `> 0` at `_DashboardCommandCenter.tsx:2347`). Different paths, correctly typed, tsc-clean — no defect (I traced it specifically to rule out an array-compared-`>0` bug). But the shared name is a maintenance trap where a future editor could grab the wrong one. **Optional:** rename the array (e.g. `clientAttentionItems`) or the count for clarity.

**→ Commander:** Mark **Client Health Phases 3–4 + mount done** — the panel rides the canonical fleet, names which/how-bad/why with a Fulfilment link (not a bare count), only surfaces data-backed risk/watch, is behaviourally tested and browser-verified. The Client Health plan is complete. (Optional: disambiguate the `clientsNeedingAttention` array-vs-count name on the dashboard payload.) Launch gates unchanged: erasure 🔴 remains the sole open blocker.

## 2026-08-19 — ✅ PASS — Client Health Phase 2: enquiry/traffic → Command Centre alerts

**Verdict:** ✅ PASS — exemplary, like Phase 1. A firing enquiry/traffic risk factor becomes a specific operational alert that carries the **exact baseline evidence** and a **direct resolution path** (never a bare count), is correctly classified **off-system** with an observable `clearsWhen` (no Resolve button for off-system work), fires **only when data-backed** (thin data stays `learning` — no crying wolf), and derives from the **same verdicts** as the health chip so the two can't disagree. Behaviourally tested against the real alert engine. No findings.

**Audited:**
- **Re-ran the FULL suite myself:** **1748 tests · 1747 pass · 0 fail · 1 skip** (green; the claim's 1588 is stale drift).
- **The operational-alert contract — HELD (`operationalAlerts.ts:294-311`).** Each alert carries `detail` = the verdict's exact evidence ("No enquiries in the last 30 days, against a baseline of X per month") + `href: /portal/clients/<id>?tab=systems` (a direct Fulfilment resolution path) + `clientId`/`clientName`. Not a vague count with nowhere to act. Severity `traffic-silent → critical`, else warning; gated by `notifications.clientAlerts`.
- **Thin-data honesty — PRESERVED through the refactor.** `clientTelemetryRiskSignals` (`clientAquaHealth.ts:282`) only emits a signal when the verdict's `risk` is set, and each verdict returns `risk: null` whenever `ratio===null || baseline===null` (no established baseline → learning, `:183/226`). So an alert fires only against an evolving, above-floor baseline — never from thin data. The same verdicts feed the health factor, so alert and chip can't disagree (single source of truth).
- **Action-kind contract — HELD.** `kind: "off-system"` + a concrete `clearsWhen` (the metric returns to baseline) — an observable clearance, not a judgement and not a Resolve button. The `client-health-` family is registered in **both** classification tables (`resolutionExplain.ts:108` off-system + `resolutionFocus.ts:48` → "evidence"), so the "every action classified" guarantee test stays green; the cross-lane edits are additive lookup rows only.
- **Tests real + behavioural (B).** `smoke-operational-notifications.test.ts:222` drives the **real** `listOperationalAlerts` against a seeded memory store (a client with ~80% traffic drop + no enquiries) and asserts the exact alert: `kind==="off-system"`, title "…no enquiries this month", **`detail` matches "baseline of 4.5 per month"** (the evidence, not a count), `href` startsWith `?tab=systems`, `clearsWhen`, `clientId`. Plus 3 signal cases in `client-aqua-health.test.ts`. No test weakened; no `.skip`.

**Findings:** none. Evidence + resolution path + honest off-system classification + fires-only-when-data-backed + a behavioural test — the operational-alert contract done exactly right. The Phase-1 rigor sustained.

**→ Commander:** Mark **Client Health Phase 2 done** — the enquiry/traffic alerts identify exact evidence and a direct path, never cry wolf from thin data, are correctly classified off-system with a real clearance, and are behaviourally tested against the live engine. (Launch gates unchanged: erasure 🔴 remains the sole open blocker.)

## 2026-08-19 — ✅ PASS (re-audit) — Finance: one shared idempotency guard across the money-CREATE surface

**Verdict:** ✅ PASS — the money double-count 🟠 cross-cutting finding is **resolved**, and correctly. One shared primitive (`deriveRecordId`) derives a record's id from a client-supplied per-intent key, so a resubmit lands on the same slot and can't become a duplicate — the exact "stable reference" idea I asked to generalise, one mechanism not five patches. Money-in is safe on both the sequential double-click **and** a parallel race; genuine partial payments still record. Behaviourally tested, including the parallel race. One minor **non-money** nit remains.

**Audited:**
- **Re-ran the FULL suite myself:** **1748 tests · 1747 pass · 0 fail · 1 skip** (green).
- **Mechanism — sound.** `deriveRecordId(prefix, key)` (`idempotency.ts:59`) = `${prefix}_${cyrb128("prefix:key")}` — deterministic 128-bit id, **namespaced by prefix** so a close-deal contract and its invoice from the same key don't collide; no key → old random `makeId` (backward-compatible). Key trimmed/bounded (`normaliseIdempotencyKey`, empty→absent).
- **payments.record — money-safe (`payments.ts:120-186`).** With a key, `get(id)` short-circuits **before** any write/log/emit/settle, returning the first payment with `deduped:true` (`:130-134`). Sequential resubmit → one row, no double side-effect. Parallel race → same derived id overwrites one slot → **one payment row** (and the index is set-to-computed-array, so it holds the id once); money-in reads rows (Finance Phase 2) → counted once. New key → new id → recorded (partials legal).
- **invoices.create — no burned number (`invoices.ts:131-136`).** The existence short-circuit returns **before** the sequential invoice-number allocation (`:140-141`), so a resubmit doesn't consume a number.
- **close-deal — no double-bill (`closeDeal.ts:81-99`).** Contract id derived from the key; fast-return when `priorInvoice && priorContract` both exist → `deduped:true`, **no second pay-link, no duplicate deal.closed log**. Off the fast path, `invoices.create(key)` still dedups the invoice and the contract save replaces by id (`filter(id!==contractId)`).
- **income/plans/payroll** all route through `deriveRecordId` (`income.ts:41`, `plans.ts:65`, `operations.ts:246`) with the same short-circuit shape.
- **Tests real + behavioural (checklist B).** `smoke-finance-idempotency.test.ts` drives the **real container**: sequential double-submit → `deduped`, one payment, "money-in counted once" (`:110-117`); **parallel `Promise.all` → one payment** (`:126-130`); two distinct-key partials → two payments + settles (`:137-148`); no-key → two, unchanged (`:153-156`); `deriveRecordId` determinism + prefix-namespacing (`:93-101`). `smoke-finance-close-deal.test.ts` +2 (same key → one invoice+contract; new key → two). No existing finance test weakened; no `.skip`.

**Findings:**
- 🟡 (minor, **not money**) **A true parallel race can still double-log / double-emit the side-effects.** In `payments.record` (and sibling creates) two simultaneous same-key submits can both pass the `get(id)` check before either writes; the **row is deduped (money safe** — one payment, and **nothing money-aggregating subscribes to `agency-finance.payment.recorded`** — verified by grep), but the activity-log entry + event emit at `:160-167` can run twice. Cosmetic (a duplicate log line) — the common sequential double-click is fully clean via the short-circuit. **Optional hardening:** re-check existence immediately before the side-effects, or gate them on a post-write "first writer" check.
- (scope note, not this claim) The separate **Stripe webhook drop-on-transient-retry** 🟠 (Finance Phase 3 verdict — `handlers-stripe.ts` marks an event processed *before* reconcile succeeds) is a different bug (a *drop*, not a double-count) and this create-surface fix does not touch it. Still open as its own item — track before enabling LIVE Stripe.

**→ Commander:** Mark the **finance money-idempotency launch gate RESOLVED** — the create-surface double-billing is fixed with one shared, reused mechanism, money-in is safe on sequential **and** parallel double-submits, partial payments still work, and it's behaviourally tested (incl. the parallel race). This is the test-rigor the money paths owed. Neither of the two remaining items is part of this claim: the **erasure 🔴** (still HELD, re-audited tick 5) and the separate **Stripe drop-on-retry 🟠** (before LIVE Stripe). After this tick, **erasure is the sole remaining launch blocker** of the original three.

## 2026-08-19 — ✅ PASS (re-audit) — Freelancer preview MANAGER → OWNER escalation: CLOSED

**Verdict:** ✅ PASS — the 🔴 privilege escalation is **resolved**. `exit` now restores the exact enterer stashed at `enter` (not "an owner it finds"), derived from the live record and fail-closed on every missing/invalid case. Manager→manager, owner→owner; no owner fallback remains, and no new escalation is introduced. Behaviourally regression-tested against the real handler with the owner present in the agency (so the old bug would fail the test). Clears the loud line.

**Audited:**
- **Re-ran the FULL suite myself:** **1748 tests · 1747 pass · 0 fail · 1 skip** (green; all three blocker-fixes now in the tree).
- **The escalation is closed (`preview-as-freelancer/route.ts`).** `enter` stashes `previewReturnUserId: session.userId` (`:88`). `exit` restores that **exact** user via `getUserById(session.previewReturnUserId)` (`:44`), taking role/email/agencyIds/sessionRev from the **live** record (`:52-61`) and re-scoping to the return agency. **The old owner-find is gone** — no `listUsersForAgency`, no `find(role==="agency-owner")`.
- **Fail-closed, no owner fallback.** A legacy cookie without `previewReturnUserId` → `enterer` null → **409** (`:44-45`); a deleted enterer → 409; an enterer no longer in the return agency → **409** (`:46-51`). None fall back to an owner.
- **No new escalation (adversarial).** `previewReturnUserId` is written server-side into the **signed** session at enter, so a manager can't forge it to the owner's id; re-calling `enter` from inside the freelancer preview hits the `:66-68` role gate (freelancer ≠ owner/manager → 403); cross-agency is blocked by the `entererAgencyIds.includes(returnAgency.id)` check. Exit only ever restores the caller's own stashed identity.
- **Behaviourally tested — real regression guard (checklist B).** `smoke-dev-mode.test.ts:698` imports the **real** `POST` handler (`:21`), creates a genuine `agency-manager` **with the owner also present in the agency** (so the old owner-find would have had an owner to grab and the test would fail on the old code), drives enter→exit, and asserts the restored session is `agency-manager` / the manager's email and **NOT** `agency-owner` / the owner's email (`:725-731`), plus `previewReturnUserId === manager.id` at enter. The owner + demo-owner round-trips (`:667-696`) are preserved; nothing weakened; no `.skip`.

**Findings:** none. The fix is exactly what the REWORK asked for (stash + restore the exact enterer, fail-closed), guarded by a behavioural test that would catch a regression.

**→ Commander:** Mark the **Freelancer preview escalation RESOLVED** — the manager→owner 🔴 is closed and behaviourally regression-tested. Loud line cleared. (Remaining launch gates: erasure 🔴 still HELD — re-audited last tick; finance money-idempotency fix claimed and pending re-audit next tick.)

## 2026-08-19 — 🔴 REWORK (re-audit) — Erasure "close the last PII hole": only the delete path was fixed; create/promote/update still leak the email

**Verdict:** 🔴 REWORK — the gate stays **HELD**. The delete-path fix is real and correct (`contacts.ts:277` now logs `Archived contact <id>`, no email), but "the **LAST** PII hole" is an overclaim: **three sibling log sites still write the raw email with no `clientId`**, and the clientId-only sweep can't reach any of them. The `Added` entry exists for **every** contact (it's how one is created), so a real erased contact's email survives in `state.activity`. The new test passes only because it seeds the contact by a **raw `state.pluginData` write**, never calling `ContactService.add()` — so the `Added … email` entry that leaks in production is never created in the test.

**Audited:**
- **Re-ran the FULL suite myself:** **1739 pass / 0 fail / 1 skip** (green — but green here does not prove the hole closed; see the test gap below).
- **The fix — VERIFIED as far as it goes.** `contacts.ts:260-279` `delete()` now logs `message: \`Archived contact ${id}.\`` with metadata `{contactId, type}` — no email. Correct; the guard comment (`:272-276`) is accurate about *that one* path.
- **The hole — STILL OPEN (three more sites).** The same file's other three activity writes still embed the email and pass **no `clientId`** (metadata is `{contactId,…}` only): `add()` `:156-163` → `Added … ${contact.email}`; `promoteLead()` `:215-222` → `Promoted lead ${lead.email}`; `update()` `:240-247` → `Updated contact ${updated.email}`. `logActivity` stores `clientId` verbatim → these are `clientId: undefined`; `clientErasure`'s sweep drops activity only where `entry.clientId === clientId` (no content scrub — confirmed by the test's own comment `smoke-client-erasure.test.ts:208-210` and by the update entry). So each survives erasure with the raw email. This is exactly what my tick-3 finding named ("`Added … ${email}` :161, `Promoted … ${email}` :220 … none pass a clientId … survive erasure") — only `:272/277` was addressed. The builder's own note "the delete path is the only one erasure exercises" is the reasoning error: the leak isn't what erasure *exercises*, it's the **pre-existing** create/promote entries that erasure *fails to sweep*.
- **The test seeds around the gap.** `smoke-client-erasure.test.ts:165-168` writes the leads contact straight into `state.pluginData[leads.id]` (`"contact:l1": {…, email:"lead@x.com"}`), so **no `Added … lead@x.com` entry is ever produced**. The only email-bearing log entry the test can create is the delete entry (now clean), so the "email absent from `state.activity`" assertion (`:211-212`) passes without touching the real leak. Seed the same contact via `ContactService.add()` and that assertion fails on the surviving `Added` entry. Same class as the original miss: the test proves the fixed path, not the real surface. *(Proven by code-inspection + the test's own seeding path; a plugin-runtime repro wasn't built this tick — the deduction is airtight: three sites embed the email, none carry clientId, sweep is clientId-only.)*

**Findings:**
- 🔴 **The erased contact's email still survives erasure via the create/promote/update activity entries** (`contacts.ts:161,220,245` — raw email, no `clientId`; sweep is clientId-only). The `Added` entry is guaranteed for any real contact. "Closed the last PII hole" is false. **Fix (complete this time — my prior "don't log PII *during* erasure" guidance was too narrow, and the builder followed it literally):** either (a) remove the email from **all four** contact log messages (`add`/`promote`/`update`/`delete`), using contactId + metadata as the delete path now does; or (b) stamp contact activity with the contact's `clientId` at write time **and** purge the pre-existing entries during erasure; or (c) add a content-scrub to the erasure activity sweep that redacts the known-erased email across `state.activity`.
- 🟠 **(test) The regression test bypasses the API it is meant to protect.** Seeding `state.pluginData` directly means it can never observe the create-path leak. A right-to-be-forgotten test must drive the real **create → erase** lifecycle: seed via `ContactService.add({email})`, erase the client, assert the email is absent from `state.activity`.

**→ Commander: KEEP the erasure launch gate 🔴 HELD.** The builder closed the delete-path leak (real progress) but "last hole closed" overclaims — the create/promote/update log entries still carry the email past erasure, and the new test seeds around them. Route back to the erasure builder: strip the email from all four contact log messages (or purge/scrub the pre-existing entries), and re-seed the test via `ContactService.add()`. Do not un-hold until the email is absent from `state.activity` after a contact created through the **real** API is erased.

## 2026-08-19 — ✅ PASS — Connect flow Phase 4: expiry countdown + error UX

**Verdict:** ✅ PASS. Every Phase 4 claim is real and correct — a self-expiring M:SS countdown, a plain "expired, send a new one" once it lapses, Confirm disabled on a spent (expired/locked) code with the resend promoted to primary, and a confirm handler that reads the accept `confirmation` status to branch retry-vs-fresh-code and clears a dead code. Pure client-side UX with the server as the real gate; no contract surface, nothing gamed to go green.

**Audited** (`_ConnectFlow.tsx`, its own file):
- **Re-ran the FULL suite myself:** **1739 tests · 1738 pass · 0 fail · 1 skip** (green; the 1 skip is the standing `smoke-postgres-backend-wired` memory-backend skip, unrelated).
- **A — claim VERIFIED by reading the source.** Countdown (`:191-192,226-228`) with `formatCountdown` rounding up (`:329-334`); `codeExpired`/`needsFreshCode` derived from the server outcome *or* the clock (`:192-193`); Confirm disabled on spent (`:241` `disabled={busy || !code.trim() || needsFreshCode}`); resend promoted to primary text+style when spent (`:249-258`); confirm reads `result.confirmation` to set `lastOutcome` and clears the box on expired/locked (`:171-175`); a fresh code resets clock+outcome+input (`:101-104`); the recipient line uses `sentTo` (`:70,98,205-207`). `expiresAt` is wired end-to-end — `request-code` returns it (`route.ts:115,120`), the component consumes it.
- **No React 19 Strict-Mode timer trap.** The two concerns my memory flags are already split: the one-shot auto-send guard (`requestedRef`, `:117-121`, no cleanup → fires once even under dev double-invoke) and the 1s countdown interval (`:125-129`, idempotent with a `clearInterval` cleanup, gated on `step==="code" && expiresAt!=null`). No stranded state, no leaked timer; the interval clears on unmount / step-change / resend.
- **C/D/E — no risk.** Client-side only: no server mutation, no role/scope/internal-visibility/radar surface. The real gate for expired/locked is the already-audited server (`checkConfirmationCode` + accept route, Phase 1/3). Edits only its own file plus the already-audited `expiresAt` return; no duplication; no live-Supabase write; connect-flow files remain untracked (no git commit).
- **B — no test gamed.** No `.skip` in `smoke-mfa`/`smoke-portal-connections`; the Phase 4 assertions are additive `it()` blocks, no prior contract weakened or deleted.

**Findings:**
- 🟡 (minor) **The Phase 4 UI contracts are source-matched, not behavioural** — `smoke-mfa.test.ts:176-200` regex the `.tsx` text (`/needsFreshCode/`, the exact `disabled={…}` string, `/formatCountdown/`). Acceptable here (the smoke suite has no DOM renderer, so this is the established norm for every UI component incl. `TwoFactorSetup.tsx`, and Phase 4 is presentation-only), but a logic slip in the `codeExpired`/`needsFreshCode` derivation wouldn't be caught by tests — I inspected it and it's correct, and the server refuses spent codes regardless.
- 🟡 (trivial, optional) **The countdown interval keeps ticking after the code lapses** — its effect guard (`step==="code" && expiresAt!=null`) stays satisfied post-expiry, so `nowTick` updates every second with nothing left to change. Negligible; gate it on `remainingMs > 0` to stop the idle timer.
- (note) The update's suite count (1517) is stale vs the current 1738 — expected drift as later phases landed; not a defect. The update honestly states the interactive code-step browser walk wasn't driven.

**→ Commander:** Mark **Connect flow Phase 4 done** — the expiry/countdown/spent-code UX is correct, the timer effects are Strict-Mode-safe, suite green, server remains the real gate. UI contracts are source-matched (fine for presentation), so the browser click-through of the code step is the only thing left to move it fully user-reachable — as the builder already flagged. Connect flow stays off the current launch-gate list; the 3 open 🔴s are unchanged this tick.

## 2026-08-19 — 🟡 PASS WITH NITS — Connect flow Phase 2: email the code + issue/resend endpoint

**Verdict:** 🟡 PASS WITH NITS. The Phase 2 claims are **true and the behaviour is correct** — the code is emailed **only** to `session.email` (a request cannot redirect it), no code is minted that can't be delivered outside dev (503 fail-closed), dev logs the code, and the email builder never carries the hash. The one real gap: the endpoint's **security contract is source-match-tested, not behavioural** — the "14/14 in-process harness" the update cites was a **throwaway scratch harness**, not committed, so the recipient-binding + fail-closed guarantees have no durable regression test (the same scratch-harness pattern the erasure 🔴s were caught by).

**Audited:**
- **Re-ran the FULL suite myself:** **1739 tests · 1738 pass · 0 fail · 1 skip** (green; matches the current baseline).
- **A — recipient binding VERIFIED (the core claim).** `request-code/route.ts` parses the body for **`connectionId` only** (`:36-37`) and sends with **`to: session.email`** (`:89`) — the recipient comes from the authenticated session, never the request. The transport honours it: `sendTransactionalEmail` sets `to: input.to` on both the Resend (`transactionalEmail.ts:66`) and SMTP (`:96`) paths — only FROM/apiKey come from tenant config, so **agency/client config cannot override the recipient**. A caller cannot redirect the code.
- **A — fail-closed delivery VERIFIED.** Outside dev the route checks `transactionalEmailReadiness(agencyId, clientId)` and returns **503 `confirmation:"unavailable"`** when no sender is configured (`:55-65`), so it won't mint an undeliverable code; the readiness expression (`transactionalEmail.ts:35-36`) matches the send-path guard for the no-`sender` caller (`:63-84`), so there's no "readiness passes but send is unconfigured" mismatch. In dev it's exempt and logs the code to console like magic-link (`:106-107`).
- **C/E — the mint is viewer-scoped.** `issuePortalConnectionCode` gates the write through `canCompleteConnection(viewerClientId, viewerUserId)` — the same authz as completing the connection — and hashes the code to `viewerUserId` (`portalConnectionStore.ts:126-145`). So the code is bound to, and sent only to, the entitled viewer. No junk to live Supabase (store/memory only); connect-flow files remain untracked working-tree work (no git commit).
- **D — reuse, not a third copy.** Uses the one transport (`sendTransactionalEmail`), `rateLimit` (Phase 3), and the pure `connectionCodeEmail` builder; the email mirrors magic-link's styling deliberately, not a duplicated transport.
- **B — email builder behaviourally tested; endpoint only source-matched.** The `connectionCodeEmail` tests are real (`smoke-portal-connections.test.ts:765-787`): they derive the actual hash and assert the email does **not** contain it, plus code-present / expiry / single-use. **But the endpoint tests (`:790-833`) read the route file as text and string-match it** — `assert.match(route(), /to: session\.email/)`, `/transactionalEmailReadiness/`, etc. No committed test drives the `request-code` POST handler; the `issueSession + NextRequest` in-process pattern exists in 9 other suites but **not** here.

**Findings:**
- 🟠 **The endpoint's security contract has no behavioural test — the "14/14" harness was throwaway.** "Sends to `session.email`, never a body address" and "503 without a sender outside dev" are asserted only by string-matching the route source (`smoke-portal-connections.test.ts:811-823`). Source-matching `to: session.email` is brittle both ways (a benign rename to a local var fails it; a real regression via a differently-named body field passes it) and cannot prove the *behaviour* that a request carrying an `email` can't redirect the code. The behavioural in-process harness the update cites (`updates.md:695`, "14/14") is **not in the repo** — the same scratch-harness pattern the erasure Phase 2/2b 🔴s were caught by. **Fix:** add a committed in-process handler test (the `issueSession + NextRequest` pattern already in `smoke-dev-mode`/`smoke-signup-flow`): (a) POST a body carrying a *different* `email` → assert the send still targets `session.email`; (b) drive the no-sender path with dev-mode off → assert 503 + `confirmation:"unavailable"`.
- 🟡 (minor, optional) **Readiness is probed before viewer-authorization**, so any signed-in user who knows a `connectionId` they're not party to can distinguish "this agency has no email sender" (503) from the authz refusal (403) — a very low-value signal about an agency's email config (not PII; needs a valid connectionId). **Fix (optional):** run the readiness check after `issuePortalConnectionCode` succeeds, so only entitled viewers reach it.

**→ Commander:** Mark **Connect flow Phase 2 done for TEST mode** — recipient-binding and fail-closed delivery are verified correct, the mint is viewer-scoped, the transport honours `to`, suite green. **Before launch:** commit a behavioural in-process test for the endpoint's two security guarantees (recipient-binding + 503-without-sender) — today they're source-matched only and the runtime harness was throwaway; the same durable-test gap the erasure and finance paths still owe. (Connect flow is not on the current launch-gate list — the 3 open 🔴s stand unchanged this tick.)

## 2026-08-19 — ✅ PASS — Enquiry card: import-forms SSRF + "Added by hand" internal-stays-internal (Orchestrator request)

**Verdict:** ✅ PASS on both. The import-forms fetch is genuinely SSRF-hardened — it can't be pointed at cloud-metadata/internal endpoints even if a registered host resolves internal, and every redirect is re-validated. The "Added by hand" store writes only its own slot, never the live enquiry or the Person model.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- **Q1 — Import-forms SSRF: SAFE.** `importFormSchemasForSite` (`websiteFormSchemas.ts:44-80`) fetches **`https://${source.host}`** where `source` is the agency's **registered** website source (`:50`) — the URL is **not user-supplied** (input is a `websiteSourceId`), scheme hardcoded https. The fetch goes through `fetchPublicSiteHtml` (`safeSiteFetch.ts`), comprehensively SSRF-hardened:
  - **Blocks private/reserved/metadata addresses** via `isUnsafeSyntheticAddress` — incl. **`169.254.169.254`** (`a===169 && b===254`, the cloud-metadata endpoint), `127/8`, `10/8`, `172.16/12`, `192.168/16`, CGNAT, multicast, IPv6 `::1`/ULA/link-local. Applied to **IP literals AND every DNS-resolved address** (`:96-113`) — a registered host that *resolves* to an internal IP is blocked.
  - **Re-validates the destination on EVERY redirect hop** (`assertPublicDestination` at loop top `:188`; `redirect:"manual"` `:123`) — the classic redirect-to-metadata SSRF is closed.
  - Non-http schemes + URL credentials rejected (`:81-86`); redirect cap 5, 8s timeout, 512KB body cap. Blocklist **shared with Radar's synthetic probes** (no drift).
- **Q2 — "Added by hand" internal-stays-internal: SOUND.** `saveEnquiryContactDetails` (`enquiryContactDetails.ts:66-79`) writes **only** to `state.enquiryContactDetails[enquiryId]` — never `brand_enquiries` (the live enquiry) or `people`/`Person` (the doc-comment `:11-19` states this deliberately; a Person is created only on conversion). Agency-scoped (`:55`), bounded inputs. Dedicated test: `smoke-enquiry-contact-details.test.ts`.

**Findings:** none. Import-forms SSRF hardening is textbook (registered host + guarded fetch + per-redirect re-validation + comprehensive blocklist incl. the metadata endpoint); the hand-added store is correctly isolated.

**→ Orchestrator / Commander:** **Both CONFIRMED.** Import-forms is SSRF-safe (can't reach localhost / 169.254.169.254 / internal ranges / non-http, even via a redirect or a malicious registered host), and the "Added by hand" layer stays internal (writes only its own slot). Ship it.

## 2026-08-19 — ✅ PASS — Dev Docs in-app markdown viewer: XSS-safe (new-work spot-check)

**Verdict:** ✅ PASS. The new in-app markdown viewer renders via **react-markdown without `rehype-raw`** — raw HTML in the markdown is escaped, not rendered — so there's no XSS surface. (Content is the project's own docs, owner + dev-mode gated, so the input is trusted too.)

**Audited** (`dev-docs/_DocMarkdown.tsx`; full suite green at tick 25, this is a static config review):
- **No raw-HTML injection.** `ReactMarkdown` + `remarkGfm` only (`:8-9,72`); **no `rehype-raw`**, so raw `<script>`/HTML in the markdown is escaped by default (the comment `:2-6` states this posture). **No `dangerouslySetInnerHTML`** anywhere in the docs components. Every element renders via the `components` map as React JSX (children auto-escaped).
- **Link + image safety.** External links get `rel="noopener noreferrer" target="_blank"` (`:31-38`) — no tabnabbing; relative doc links render as inert text (`:44`). The `img` renderer reads only `{src, alt}` (`:64-67`) — no arbitrary attributes, so no `onerror` injection.

**Findings:** none — a correctly-built markdown viewer (escape-by-default, no rehype-raw, link noopener).

**→ Commander:** Dev Docs markdown viewer verified XSS-safe. (The 3 open 🔴s — erasure log, freelancer escalation, finance idempotency — remain the launch gates; unchanged this tick.)

## 2026-08-19 — ✅ PASS — KPI Intelligence overhaul: formula engine + targets scoping + evidence-vault edit (Orchestrator request)

**Verdict:** ✅ PASS on all three. The custom-KPI "formula engine" is a **structured allow-listed builder, not an eval surface** — a malicious formula is structurally impossible. The targets endpoint is agency-scoped (no cross-tenant leak). The evidence-vault edit is additive, summary-only, and thin-data-honest — no radar contract weakened.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip** (all radar golden/classification/evidence tests pass → the radar contract holds under the vault edit).
- **Q1 — Formula-engine injection surface: SAFE (no eval).** A custom KPI is a **structured `CustomKpiDefinition`** — `{label, numeratorId, denominatorId?, op}` (`customKpis.ts`), **not** a formula string. `op` must be one of the allow-list `["ratio","rate","sum","diff"]`, enforced at `createCustomKpi:36` (throws otherwise). `computeCustomKpi` (`kpiRegistry.ts:303-306`) is a `switch(op)` over **pure arithmetic** (`÷0 → null`; an unknown metric id → the KPI drops to null `:373` — **no crash**). There is **no `eval`/`new Function`** and no formula-code path — the store comment is accurate: *"they carry no formula code."* A user can only pick existing metric ids + 4 ops → nothing to inject/exfiltrate.
- **Q3 — Targets endpoint agency-scoped: SOUND.** `kpi-registry/targets/route.ts` GET/POST both bind to **`session.agencyId`** (`getKpiTargetsConfig(session.agencyId)` / `setKpiTarget(session.agencyId, …)`) — the agency is never taken from the body, so **agency A cannot read or write agency B's targets**. Role-gated to `AGENCY_ROLES`.
- **Q2 — `radarEvidenceVault` edit: additive, summary-only, honest.** `git diff`: **+21/-1** — adds `rollingBaseline: rollingValues.length >= 3 ? median(...) : undefined` to the vault **summary**. Thin-data-honest (a baseline only once ≥3 points; else undefined — no manufactured baseline, consistent with tick-6 zero-blindness / tick-16 Client-Health honesty). The anomaly path is untouched; the suite's radar tests (golden 2064/2959, classification, evidence) all pass → **no contract weakened**, co-exists with the 2,064 catalogue.

**Findings:**
- 🟡 (minor, targets) `setKpiTarget` receives a body `companyId` without the route verifying it belongs to `session.agencyId` — a target could carry a foreign `companyId` scope key. **No leak** (stored under the actor's own agency; a foreign key is an unused scope, not a read of B's data), so cosmetic/data-integrity. **Fix (optional):** validate `companyId ∈ agency`.

**→ Orchestrator / Commander:** **All three CONFIRMED clean.** The formula engine is a safe structured builder (no eval — the highest-risk item is a non-issue by design), targets are agency-scoped, the evidence-vault edit is additive + honest with no radar regression. Ship it. (Optional targets nit: validate `companyId ∈ agency`.)

## 2026-08-19 — 🔴 HELD (re-audit of "plan COMPLETE") — Erasure: email-in-LOG still open; RETAIN + brand_enquiries sound

**Verdict:** 🔴 HELD. The worker's "plan COMPLETE" does **not** address the email-in-LOG 🔴 (my tick-3 finding) — confirmed unchanged. The two items the worker asked me to scrutinize (RETAIN classification, `brand_enquiries` split) are **actually sound**. So erasure is **one narrow fix from complete** — but "complete/launch-safe" is an overclaim by exactly the log hole.

**Audited (re-verify on the "complete" claim):**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- 🔴 **email-in-LOG — STILL OPEN.** `ContactService.delete` (`contacts.ts:272`) still logs `Archived contact ${existing.email}` with metadata `{contactId,type}` — **no clientId**; `clientErasure` still sweeps `state.activity` **by clientId only** (`:463`, no content scrub); **no log-absent test** exists. Phase 2b fixed the email-in-**KEY** (`contacts/email/<email>` pointer) — a *different* thing. The delete op still writes the email into the activity log, un-scrubbed. Unchanged from tick 3.
- ✅ **RETAIN classification — sound (scrutiny #1).** **retain + strip-hook** for PII-embedding plugins (ecommerce, affiliates, **memberships** — now HAS a hook, an improvement since tick 4) → PII stripped, de-identified record kept; **retain-wholesale** only for legal-hold records that reference `clientId` — `agency-finance` (its `name` fields are template/attachment names, not client PII; Invoice/Payment/Expense reference `clientId`) and `fulfillment` (no PII fields) → no silent PII keep; **delete** (default) for comms/marketing/CRM/funnel/email-sender. No plugin wrongly `delete` (no legal-hold breach) or wrongly `retain` (no silent PII keep). *(Scoped: sampled finance's name-bearing types, not all 6 — but the pattern is clearly clientId-referencing + non-PII names.)*
- ✅ **`brand_enquiries` split — correct + matches the recording (scrutiny #2).** `clientErasure.ts:382-410`: **always** drops the client link (`metadata.clientId`, `clientLinkedAt`, `ir.clientId`, `ir.clientName`); strips PII (`name/email/phone/contact_method/message/source_url` + `replies/calls/formCapture`) **only** when `ir.status==="resolved" && clientId matches` (`:392`) — the enquirer IS the erased client. A separate party merely tagged is unlinked but kept. The split reads the same `identityResolution.status/clientId` fields the recording writes — consistent. *(Minor: confirm no other PII column on `brand_enquiries` beyond those stripped.)*

**→ Commander / Orchestrator:** **HOLD launch-safe.** Erasure is genuinely close — RETAIN + live-scrub + brand_enquiries are all correct — but the **email-in-LOG 🔴 stands**; "complete" overstates by exactly that. Un-hold when the delete stops writing the email to the activity log (a silent/PII-free delete path for the erase hook, or a `clientId`-stamped + swept entry) **AND** a test asserts the erased email is absent from `state.activity` after an erase.

## 2026-08-19 — 🔴 REWORK — Freelancer preview: MANAGER → OWNER privilege escalation (session-minting)

**Verdict:** 🔴 REWORK. The preview-as-freelancer session-minting is otherwise well-built — owner/manager-gated, agency-scoped, cleanly isolated from the Dev Mode channel, crypto-random freelancer password. But `exit` re-mints "an agency-owner" regardless of who entered, and `enter` admits managers — so **any agency-manager can preview a freelancer and exit as the OWNER.** A trivial 2-request RBAC escalation.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- **What's sound:** `enter` is owner/manager-only (staff/others → 403, `preview-as-freelancer/route.ts:47`); the target freelancer resolves **agency-scoped** (`freelancerLoginUserId(session.agencyId, employeeId)`, `:53`); the minted preview is **fenced** (role `"freelancer"`, `agencyIds:[session.agencyId]`, `isDemo`, `:57-68`); **channel isolation is correct** — it stamps `previewReturnAgencyId` (not `devReturnAgencyId`), so Dev Mode's `isActiveDevSession` (needs `devReturnAgencyId`) rejects it (switcher hidden), and the freelancer `exit` needs `previewReturnAgencyId` so a Dev Mode session can't use it. `createFreelancer` mints a **crypto-random** password (`crypto.randomBytes(24)`, `freelancerAdmin.ts:65` — unguessable) and is agency-scoped (cross-agency email → `email_in_use`, `:58`).

**Findings:**
- 🔴 **Privilege escalation: manager → owner.** `enter` admits `agency-manager` (`route.ts:47`), but `exit` re-mints as **whatever agency-owner it finds** (`:31` `listUsersForAgency(...).find(role==="agency-owner")` → `:33-42` `role: owner.role`), because the preview session records only `previewReturnAgencyId`/`previewReturnWasDemo`, **not the enterer's identity**. So a manager: `POST {employeeId}` (enter, authorized) → `POST {action:"exit"}` → re-minted as the **agency owner** (owner.id, role agency-owner) → holds a full owner session. Breaks the role-scope contract. (Dev Mode avoids this only because *its* enter is founder-only.) **Untested** — the enter→exit tests use an owner enterer. **Fix:** stash the enterer's `userId` (+ role) at `enter` and restore **exactly** on `exit`; or restrict `enter` to owner-only.

**→ Commander:** **Route to the freelancer builder — 🔴 privilege escalation.** A manager becomes the agency owner via a freelancer-preview enter→exit round-trip (exit restores "an owner," not the enterer). Fix by restoring the exact enterer (or owner-only enter), and add a test: a *manager* who previews → exits is restored as a **manager**. Everything else in the feature is sound.

## 2026-08-19 — ✅ PASS — Aqua Tag consent enforcement (re-verify) + Radar catalogue growth (Orchestrator request)

**Verdict:** ✅ PASS on both. Tag-side consent gating genuinely holds analytics/marketing until consent, is idempotent, and isn't bypassable (endpoint didn't widen). The Radar catalogue growth (2,040→2,064) is guarded, drift-locked, and the 2 new families are real signals, not placeholders. One carry-over nit: the injection gate still isn't behaviourally VM-tested.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- **Q1 — Tag-side consent enforcement (`aquaTagSource.ts`).** `permitted` (`:93`): `necessary` always; `analytics`/`marketing` only when `preferences` grants → **held until consent**. `runInjections` (`:154-160`) injects **only if `permitted`**, is **idempotent** (`injectedKeys[key]` set *before* inject, `:158-160`), and retroactive on opt-in (`applyPreferences → runInjections`, `:449`). **Not bypassable**: `consentCategory` is server-set from the allow-listed store, and the public endpoint still returns only `{kind,value,consentCategory}` (`aqua-tag-config/route.ts:38-41`) — no widening.
- **Q2 — Radar catalogue growth.** The 2 new families are **named + real**: `sales:enquiry-routing` (fed by a real `websiteSources` routing-destination observation) and `development:injection-coverage` (fed by a real `websiteSiteConfigs` enabled-injection observation) — both **informational + connected-at-zero** (a zero reading is a baseline, never a false blind spot/alarm — the tick-6 zero-blindness contract, correctly applied). **Guarded**: exact-count invariants updated deliberately in **both** `smoke-radar-golden-sweep` (`catalogChecks===2064`, `totalChecks===2959`) and `smoke-radar-classification` (`catalogue.length===2064`) — so any silent drift fails the suite. **+16/family** invariant holds (12 catalogue lenses + 4 evidence-layer × 2 = 32). Reference regenerated.
- **Q3 — Public endpoint didn't widen.** ✓ still `{kind,value,consentCategory}` only.

**Findings:**
- 🟡 (carry-over from tick 11) **The injection-specific consent gate still isn't behaviourally VM-tested.** `smoke-consent-capture` VM-executes the tag but its `appendChild` is a no-op stub (`:45`) that doesn't observe injection — it only asserts the *telemetry* gate (`:91-97`). The injection gate is verified by code + browser + a source-match wiring contract, but not by a repeatable "analytics tool held without consent → injected after `applyPreferences`" VM test. Confidence stays high (shared `permitted()` is VM-tested via telemetry; browser-verified), but that one test would fully close it.
- (minor, tick 11) `runInjections` defaults a category-less config item to `"necessary"` (`:159`) — fail-open-to-necessary. Dead-defensive (the store always sets a category), but holding an unknown category would be safer.

**→ Orchestrator / Commander:** **Both CONFIRMED.** Consent enforcement is sound (held-until-consent, idempotent, unbypassable, endpoint unchanged); the Radar growth is guarded and the 2 families are real signals honoring zero-blindness. Only optional hardening: the one behavioural VM test for the injection gate, and fail-closed the category-less default.

## 2026-08-19 — 🟡 INHERITS P4a — Finance Phase 4b: one-button close for a lead (UI reuse)

**Verdict:** 🟡 Inherits the P4a verdict; **no new server risk**. Phase 4b is a **UI-only** edit — a "Close the deal" button on the post-convert banner in `_LeadsPipelineWorkspace.tsx` that runs the **same `/api/tenants/close-deal` route + `closeDealForClient` engine** I audited in tick 19, on the just-converted client.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- **Confirmed UI-only reuse.** The close-deal route imports only `closeDealForClient` — no new `closeDealForLead` endpoint; lead→client is the existing `convert-to-client` flow, and 4b appends the close as an optional second step.
- **Leads-pipeline coordination respected.** No leads-pipeline **server** change (the flagged hazard) — it's a Journey UI edit reusing a live, tested Finance endpoint, and it did **not** disturb the erasure 🔴 that lives in leads-pipeline. Good.

**Findings (all inherited from P4a — still open):**
- 🟠 **The double-bill reaches the pipeline too** — the "Close the deal" modal hits the same unguarded close-deal route, so a double-click on a just-converted lead double-bills. Part of the systemic money-idempotency gap (re-checked this tick: **still unfixed** — the `payments.ts` "idempotent" grep hit was only a comment, line 68).
- 🟡 non-atomic close ordering (contract before invoice) — inherited.

**→ Commander:** **4b is a clean UI reuse** — no new risk, leads-pipeline correctly untouched. It only extends the reach of the already-flagged close-deal double-bill to the pipeline; the single money-idempotency fix (cross-cutting finding below) covers 4a + 4b together.

## 2026-08-19 — 🟠 Cross-cutting — money-layer idempotency gap is systemic across the finance create-surface (Orchestrator follow-up)

Per the Orchestrator's ask to watch the idempotency theme across finance — the gap is **systemic, not two isolated bugs**. Every money-*creating* path is a thin handler that mints a fresh record with **no server-side double-submit / idempotency guard**:
- `payments.record` (`server/payments.ts:114+`) mints `makeId("pay")` on every call, no dedup on (invoice, amount, externalRef); `createPaymentHandler` (`api/handlers-r007.ts:46-58`) is a bare passthrough → a double-click / retry records a **duplicate payment → silently double-counts money-in** (the tick-12 aggregation shows 2×).
- Same shape: `createInvoiceHandler`, `createIncomeHandler`, `createPlanHandler`, `compensationPaymentsHandler`.
- Already filed individually: **close-deal** (🟠 tick-19 — dup contract + invoice) and the **Stripe webhook** in-process cache (🟠 tick-14 — *drops* a payment on transient-failure retry).

So a double-submit anywhere on the finance surface duplicates money records (or, for the Stripe webhook, drops one). Nuance: recording *multiple* payments per invoice is legitimately allowed (partial payments), so the fix isn't blocking them — it's deduping *accidental* dupes.

**→ Commander / Finance worker:** treat this as **one launch task, not five patches** — give the finance create-surface a shared idempotency mechanism (a client-supplied idempotency key checked server-side, or a same-actor/same-amount/short-window dedup) + a test — before real client money. Individually each is a small nit; together, an unguarded money surface is launch-blocking.

## 2026-08-19 — ✅ PASS — Meta webhook multi-tenant HMAC gate (security review — Orchestrator request)

**Verdict:** ✅ PASS — the builder's claim holds. HMAC is genuinely the sole gate; env is only ever a candidate; empty candidates are filtered and a no-candidate request fails closed; no cross-tenant path accepts a forgery; the signature compare is constant-time. One minor nit: the GET verify-token handshake compare isn't constant-time (low-value token).

**Audited** (independent review of `webhooks/meta/route.ts`, `verifyMetaWebhookRequest`/`verifyMetaWebhookSignature`, the account→agency resolver, `metaWebhookVerifyTokenAccepted`):
- **Full suite green this session** (tick 19: 0 fail / 1 skip).
- **Q1 — Can a forged/unsigned request ever be accepted? NO.** POST rejects a missing signature (`metaMessaging.ts:396`) and accepts only if the signature matches `HMAC(secret, body)` for **≥1** candidate (`:408`). Candidates are **filtered to non-empty** — stored `if (secret)` (`:404`), env `if (envSecret)` (`:407`) — so there's **no empty-key candidate** (an empty secret would make `HMAC("", body)` forgeable; it's excluded). No resolvable account + no env secret → `secrets` empty → `[].some() === false` → **401, fail-closed** (route `:34-35`). Adding candidates only adds *real* secrets to match against. Body-parse is explicitly for secret *selection*, not trust (route comment `:32-33`).
- **Q2 — Cross-tenant confusion? NO.** Candidate secrets resolve by **account ownership** (`entry.id` → `findPrivateConnectionByExternalAccount` → that agency's secret, `:398-404`). An attacker can't sign with a secret they don't hold: a forged payload naming agency B's account adds B's secret as a candidate but can't produce `HMAC(B's secret, body)` → rejected; an agency can only validly sign for accounts whose secret they hold (**their own**). Even a *resolver error* **fails closed** (wrong secret → HMAC mismatch → 401). Security rests on the HMAC, not the lookup — as claimed.
- **Q3 — Timing-safe?** Signature: **YES** — `verifyMetaWebhookSignature` uses `crypto.timingSafeEqual` + length guard (`:364`). GET verify-token: **NO** — `metaWebhookVerifyTokenAccepted` uses `candidates.has(suppliedToken)` (`:386`), a Set lookup.

**Findings:**
- 🟡 (minor) **GET verify-token handshake compare isn't constant-time** (`metaMessaging.ts:386`). **Low impact:** the verify token is a low-value handshake secret — passing the GET handshake only echoes Meta's `challenge` (no data access; Meta still delivers only to the configured URL), and the POST HMAC is the real gate. **Fix (optional):** compare against each candidate with `crypto.timingSafeEqual` to match the signature path.

**→ Orchestrator / Commander:** **Claim CONFIRMED** — the session-less multi-tenant Meta webhook is safe: HMAC-sole-gate, empty-candidate-filtered, no-candidate fail-closed, no cross-tenant forgery path, constant-time signature. Ship it. Only optional hardening: make the GET verify-token compare constant-time too.

## 2026-08-19 — 🟡 PASS WITH NITS — Finance Phase 4a: one-button "close the deal" (contract + invoice + payment)

**Verdict:** 🟡 PASS WITH NITS. Auth/scoping and the happy-path orchestration are sound (pay-link failure correctly non-fatal). Two money-adjacent correctness gaps: no double-submit guard (→ duplicate invoice/contract, a double-bill risk) and a non-atomic order that can leave a dangling contract on a mid-way failure.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- **Auth + scoping — sound.** `close-deal/route.ts`: `requireRoleForClient([...AGENCY_ROLES], clientId)` (`:54`) + `getClientForAgency(session.agencyId, clientId)` (`:57`) — role + agency-scoped; finance container built for `session.agencyId`; validation (client + title + positive amount, `:49`). App never holds funds (record + route only).
- **Happy path correct.** `closeDealForClient` (`closeDeal.ts:64-116`): sent contract → `invoices.create` → `invoices.update(status:"sent")` → route payment (Stripe pay-link or manual intent). A pay-link failure is **non-fatal** (`:101-107`) — the contract + invoice still land, with an honest "check Stripe" instruction. Tested (per-channel routing, non-fatal payLink, validation).

**Findings:**
- 🟠 **No double-submit / idempotency guard → duplicate invoice + contract (double-bill risk).** Nothing (route or engine) dedups a repeated close. A double-click or network retry on "Close the deal" runs the orchestration twice → **two contracts + two invoices + two pay-links** for one deal (the client could be billed / pay twice). Money action, no server guard. **Fix (before live money):** an idempotency key (client-generated, checked server-side) or a short dedup window so a retry returns the first result. (Same class as the tick-14 Stripe idempotency gap — the money layer is thin on idempotency.)
- 🟡 **Non-atomic ordering: the contract is saved *before* the invoice, no rollback** (`closeDeal.ts:83` then `:86`). If `invoices.create` throws after the contract is persisted, a dangling "sent" contract remains (each retry adds another). Not a double-bill (the invoice is the billing artifact), but a data-integrity mess. **Fix:** create + issue the invoice first, then save the contract; or roll the contract back if the invoice step fails.
- 🟡 (test-gap) Neither the double-submit nor the invoice-creation-failure path is tested — the 6 tests are happy-path routing + payLink-failure + validation. Fits the recurring test-lag on safety-critical (here money) paths.

**→ Commander:** Mark **Finance Phase 4a done for TEST mode** — auth/scoping sound, happy path correct, pay-link failure handled. **Before real client money:** add a double-submit idempotency guard (a double-click currently bills twice) and reorder so a failed invoice can't leave a dangling contract — plus tests for both. Same idempotency theme as the Stripe finding; the money layer needs a consistent idempotency story before launch.

## 2026-08-19 — ✅ PASS — Client Health Phase 1: the "don't cry wolf from thin data" honesty contract

**Verdict:** ✅ PASS — exemplary. Client Health genuinely stays `learning` on thin data and raises risk only when it's data-backed, mirroring the Radar blind-spot principle. Well-designed AND well-tested. No findings.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- **Aggregation gate — VERIFIED.** `clientAquaHealth.ts:86-95`: `confidence < 50 → "learning"` (confidence = the weight of factors that actually have data), so a client with thin data resolves to **learning, never risk**. The final `else → "risk"` fires only when `confidence >= 50` AND the score is genuinely low — risk is always **data-backed**. `severeKnownRisk` (`:86`) requires `score !== null`, so a learning factor can't trigger it.
- **Factor floor gate — VERIFIED.** `signalBaseline` returns `baseline: null, ratio: null` when there's no prior month (`maxBucket < 1`) or the baseline is below the floor (`baseline < floor`) — so a thin trickle of enquiries stays `learning`, never manufacturing a risk. Risk only ever computes against an established, above-floor baseline.
- **Behaviourally tested — the honesty contract is pinned** (`client-aqua-health.test.ts`): no evidence → `learning`, score null, confidence 0 (`:18-29`); a missing factor is a **visible blind spot** (confidence capped at 70, not a free pass) (`:61-63`); risk fires **only against an established evolving baseline** — enquiries-to-none (`:66-84`), sharp traffic drop (`:88-106`); a soft >10% dip stays **informational (`watch`)**, not risk (`:109-125`).

**Findings:** none. The evidence-confidence / blind-spot honesty is the CLAUDE.md Radar-contract principle applied to client health, and it's genuinely tested.

**→ Commander:** Mark **Client Health Phase 1 verified** — it won't cry wolf from thin data, risk is always data-backed, and the honesty contract is behaviourally tested. This is the test-rigor the money/erasure paths still owe — the fleet clearly *can* do it, so the recurring test-lag elsewhere is inconsistency, not capability.

## 2026-08-19 — ✅ PASS — Public upload storage (path safety + prod fail-closed)

**Verdict:** ✅ PASS. The design is safe — prod fails closed to Supabase (the filesystem-write branch never runs live), keys are content-addressed + per-agency namespaced (no user-filename traversal), extensions allow-listed. Two defense-in-depth hardenings before launch: allow-list the served content-type, and self-guard the local write path.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- **Prod fail-closed — VERIFIED.** `storePublicUpload` (`publicUploadStorage.ts:76-105`): Supabase branch if configured; else `durablePublicUploadsRequired` (NODE_ENV=production || VERCEL) → **throws `PublicUploadStorageError`** (`:96`) before the local `writeFile`. The filesystem write is **dev-only** — never in production.
- **No filename traversal from the real caller — VERIFIED.** The only caller, `publicMediaAdapter.store`, builds the path via `publicMediaKey` (`publicMediaAdapter.ts:53-69`): `website-media/<agencyId>/<clientId>/<siteId>/<sha256(bytes)>.<ext>` — filename is a **content hash** (not a user filename), extension is **allow-listed** (`EXT_BY_MIME`, `:19-29`, else "bin"), directory segments are **server-derived ids**. No `../`, no user-controlled path component. Content-addressing gives a stable URL across re-publishes (with `upsert:true`); per-agency namespacing prevents cross-agency overwrite.

**Findings:**
- 🟡 **Content-type isn't allow-listed at the storage boundary** — `storePublicUpload` stores + serves the caller's `contentType` verbatim, and the mime map includes `image/svg+xml` (an SVG can carry script); a `data:text/html` URI would store + serve as HTML. **Bounded** (the uploader is a trusted agency user publishing to *their own* site — where they can already inject script — and prod serves from a separate CDN origin, per-agency namespaced), so **not an active escalation**, but "approved website media" being executable is a hardening gap. **Fix (before launch):** allow-list `contentType` to safe image/video types at the boundary (reject `text/html`, sanitize or drop SVG, or serve public media with a restrictive `Content-Disposition`/CSP).
- 🟡 (defense-in-depth) **The local-dev write doesn't verify the resolved path stays within `public/uploads-public/`** (`:101` joins caller `localDirectory`/`localKey`). Not currently exploitable — the one caller passes safe values — but a future caller with user-controlled inputs would traverse (dev-only; prod is fail-closed). **Fix:** `path.resolve` + a `startsWith(publicRoot)` guard so the boundary self-defends.

**→ Commander:** Mark **public upload storage safe for now** — prod fail-closed, content-addressed, per-agency namespaced, no traversal from the real caller. Two pre-launch hardenings (both defense-in-depth, neither an active exploit): allow-list the served content-type (so website media can't be executable HTML/SVG), and add a path-within-dir guard to the local-write boundary.

## 2026-08-19 — 🟡 PASS WITH NITS — Finance Phase 3: Stripe (webhook + reconcile + refunds)

**Verdict:** 🟡 PASS WITH NITS. The security gate is right (fail-closed signature verification, per-agency secret) and reconciliation is correct + durably idempotent. But a real 🟠 money-correctness edge case: the in-process idempotency cache marks an event "processed" *before* reconcile succeeds, so a transient failure + a same-process retry can silently drop a payment.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- **Webhook signature gate — FAIL-CLOSED (verified).** `stripeWebhookHandler` (`handlers-stripe.ts:78-97`): no `stripe-signature` header → 400 (`:81`); `verifyStripeWebhook` (`stripe.ts:103-112`) throws if the webhook secret is unset (`:109`) and uses Stripe's canonical `constructEvent` (throws on mismatch); the handler `catch` returns 400 and **never reconciles** an unverified event (`:93-95`). Keys come from **the `?agencyId=`'s own install config** (`:85`), so a forged agencyId verifies against the wrong secret → mismatch → 400 (per-agency, no cross-tenant forgery). Keys never logged/returned.
- **Reconciliation correct + durably idempotent.** `reconcileStripeEvent` (`stripeReconcile.ts`): `checkout.session.completed` → `findByExternalRef(paymentIntent)` returns **`deduped`** on redelivery (`:45-48`) → no double-settle; matches the invoice by `metadata.invoiceId`; records payment + settles. Refund/dispute keyed by PaymentIntent; unknown events ignored. invoiceId is stamped into both session + PaymentIntent metadata (`stripe.ts:92-93`) — the load-bearing link.
- **Handlers agency-scoped.** Checkout refuses an already-paid invoice (`:50`); refund on the agency-scoped container; both 502 on Stripe errors. **App never holds funds** (pay-link + verify + refund only).

**Findings:**
- 🟠 **In-process idempotency marks an event processed BEFORE reconcile succeeds → a transient failure can drop a payment.** `handlers-stripe.ts:90` (`processedEventIds.add(event.id)`) runs *before* `reconcileStripeEvent` (`:91`). If reconcile throws (e.g. a storage blip) and Stripe **retries to the same warm process**, `:89` sees the id cached → returns `deduped` (200) → Stripe stops retrying → **the payment is never recorded; the invoice stays unpaid though the customer paid.** The durable `findByExternalRef` would have recovered a retry, but the in-process cache short-circuits before reaching it. **Fix (before live Stripe):** add to `processedEventIds` only *after* reconcile succeeds, or drop the in-process cache and rely solely on the durable `findByExternalRef`.
- 🟡 (test-gap) The **failure-then-retry** path isn't tested — the "idempotent redelivery" test is happy-path (reconcile succeeds, 2nd delivery deduped); it wouldn't catch the drop above. Fits the recurring test-lag pattern. **Fix:** a test where the first reconcile throws and the retry still records the payment.
- 🟡 (tiny, optional) The webhook error text distinguishes "not configured" vs "verification failed", letting someone enumerate which agencies have Stripe configured. Very low impact.

**→ Commander:** Mark **Finance Phase 3 done for TEST mode** — the signature gate is fail-closed + per-agency, reconciliation is correct. **Before enabling LIVE Stripe:** fix the idempotency ordering (`handlers-stripe.ts:90`) so a transient webhook-processing failure can't drop a real payment, and add the failure-retry test. (Also queued: the builder flagged a `finance:refund`/`chargeback` operational alert belongs in `operationalAlerts.ts` — the client-health worker's file — route that.)

## 2026-08-19 — ✅ PASS — Staff Phase 6: internal chat (message/channel access control)

**Verdict:** ✅ PASS. A staff member can't read another pair's DM or post to a channel they're not in, and it's agency-scoped throughout. Two low nits.

**Audited:**
- **Re-ran the FULL suite myself:** green — **0 fail / 1 skip**.
- **Route** (`team-chat/route.ts`): `agencyId = getActiveAgencyId(session)` (from the session, never the body), actor always `session.userId`, role-gated to agency roles (owner/manager/staff).
- **Read gate — sound.** `listPeopleChannels` (`people.ts:938-943`) returns `[team, ...the user's own direct channels]` — accessible channels only. `teamChatSnapshot` (`:1003`) picks `active` via `.find` over *that* list, so passing an `activeChannelId` for a DM you're not in is ignored (falls back to the team channel), and `listPeopleMessages` is only ever called for an accessible channel. **Can't read another pair's DM.**
- **Send gate — sound + tested.** `postPeopleMessage` (`:970-972`) throws unless the channel is in the agency AND `canAccessChannel` (team OR member). Behaviourally tested: a non-member can't post to a direct channel (`smoke-people-workspace.test.ts:262`); anyone posts to team (`:258`).
- **Cross-agency — held.** All reads/sends filter by the session `agencyId`; `userDisplayName` resolves only within the agency (a foreign id → "Team member", no name leak).

**Findings:**
- 🟡 (low) **`ensureDirectChannel` doesn't validate `withUserId` is an agency member** (`people.ts:946-956`; the `open-direct` action guards only `withUserId === self`). A staff member could open a DM against an arbitrary userId → a junk one-sided channel in their agency. **No leak** (agency-scoped reads keep the target from seeing it; the foreign name resolves to "Team member"), so it's cosmetic / data-integrity. **Fix:** validate `withUserId ∈ agency` before creating the channel.
- 🟡 (minor test-gap) The **read gate isn't behaviourally tested** — the send gate is (`:262`), but nothing pins "a non-member's `teamChatSnapshot(…, someoneElsesDmId)` returns the team channel, not the DM's messages." Inspection-verified only; fits the recurring test-lag pattern (code sound, safety-critical path under-tested). **Fix:** add that read-gate assertion.

**→ Commander:** Mark **Staff Phase 6 chat done** — DM read/send access is correctly membership-gated and agency-scoped. Two low-priority cleanups: validate the `open-direct` `withUserId` is an agency member, and add a behavioural read-gate test.

## 2026-08-19 — 🟡 PASS WITH NITS — Finance Phase 2: "money in across everything" (channel aggregation)

**Verdict:** 🟡 PASS WITH NITS. The money-in aggregation is **arithmetically correct** — each payment counted once (no double-count), totals per currency (never summed across), all four channels always shown. The nit: the correctness-critical double-count dedup lives in the React component and has no behavioural test.

**Audited:**
- **Re-ran the FULL suite myself:** **1642 pass · 0 fail · 1 skip** (green).
- **Aggregator correct + tested.** `summariseMoneyInByChannel` (`agency-finance/src/lib/moneyIn.ts:40-61`) counts each record once, keeps `totalsByCurrency` per (channel, currency) — never summing GBP+USD (`smoke-finance-channels.test.ts:67` asserts `other = [["gbp",1000],["usd",4000]]`) — returns all four channels in catalogue order, folds legacy `"manual"`→`"other"` (`:38`). Pure, real-input→output tested.
- **No double-count — the upstream dedup VERIFIED (by inspection).** The three money-in shapes unify in `IncomeSheet.tsx`: `paymentInvoiceIds = new Set(payments.map(p => p.invoiceId))` (`:50`); rows = every payment + paid invoices **`&& !paymentInvoiceIds.has(invoice.id)`** (`:70`) + non-invoice income. So a paid invoice that *has* a payment is counted **once** (via the payment; the invoice is excluded); one settled via `paidVia` with no payment counts once (via the invoice); non-invoice income once. Each pound counted exactly once.
- **Browser-verified** (builder, `:3032`): the by-channel view renders (four channels, per-channel reference labels, filter). *Caveat the builder noted:* the dev tenant has **no income**, so the aggregation + dedup weren't exercised with real data in the browser — only unit-proven (aggregator) / inspection-proven (dedup).

**Findings:**
- 🟡 **The double-count dedup — the most correctness-critical part — has no behavioural test.** The Phase 2 tests feed `summariseMoneyInByChannel` pre-built records; they never exercise the payment-vs-paid-invoice unification (`IncomeSheet.tsx:50,70`), which lives in a React component and wasn't browser-exercised (no dev income). A regression removing the `!paymentInvoiceIds.has(...)` filter would **double-count revenue** with nothing to catch it. **Fix:** extract the three-shapes→`MoneyInRecord[]` gathering into a pure function and test it (paid-invoice-with-payment counts once, without counts once, other-income once).
- (Note, not a defect) `summariseMoneyInByChannel` is pure and doesn't self-scope — money-in is only as agency/client-scoped as the `payments`/`invoices` the finance page feeds it. Consistent with the codebase pattern, but worth confirming the page scopes to the tenant (an unscoped feed would sum across tenants).

**→ Commander:** Mark **Finance Phase 2 done** — money-in is correctly channel-grouped, per-currency, and (by inspection) double-count-free. Before real client money flows: add a behavioural test for the payment-vs-paid-invoice dedup (revenue accuracy is high-impact and currently only inspection-proven), and confirm the finance page scopes its payments/invoices to the tenant.

## 2026-08-19 — 🟡 PASS WITH NITS — Aqua Tag: tag-side consent enforcement (closes the tick-9 pending finding)

**Verdict:** 🟡 PASS WITH NITS. The consent *enforcement* my tick-9 verdict flagged as pending has shipped and is **correct** — the tag holds analytics/marketing tools until consent, injects `necessary` immediately, and injects retroactively on opt-in. Browser-verified. One real nit: the injection-specific gate is source-matched, not the behavioural VM test I asked for.

**Audited:**
- **Re-ran the FULL suite myself:** **1635 pass · 0 fail · 1 skip** (green).
- **Consent gate — logic VERIFIED.** `aquaTagSource.ts` `permitted` (:93-96): `necessary` always; `analytics`/`marketing` only when `preferences.analytics`/`.marketing`. `runInjections` (:155-159) injects a tool **only when `permitted(item.consentCategory)`**, skipping already-injected (`injectedKeys`). With `preferences` null (no consent yet) the `&&` short-circuits false → **analytics/marketing held by default** (GDPR-correct opt-in), `necessary` still fires. `runInjections` re-runs from `applyPreferences` → **retroactive** injection on opt-in.
- **Gate function behaviourally tested (shared path).** `smoke-consent-capture.test.ts` **VM-executes** the real `AQUA_TAG_SOURCE` and proves the same `permitted()` gate for telemetry: consent rejected → analytics/marketing beacons blocked (`:91-95`); analytics granted, marketing not → marketing still blocked (`:97-99`). So the gate function `runInjections` calls is behaviourally proven.
- **Browser-verified** (builder, `:3032`): served `/aqua-tag.js` parses in real V8 (`new Function`), injection + consent-gate + config-fetch present, form-capture intact, no `${` leak; endpoint returns the safe `{injections:[]}` default. Robustness: every tool try/catch-wrapped, fetch `typeof fetch`-guarded — a failing tool can't break the host site.

**Findings:**
- 🟡 **The injection-specific gate is source-matched, not VM-executed** — the behavioural test I asked for in tick 9. `smoke-aqua-tag-injections.test.ts:156` asserts the source *contains* `if (!permitted(item.consentCategory`; it does not seed an analytics injection, run the tag without consent, assert it's NOT injected, then grant consent and assert it IS. Confidence stays high (the shared `permitted()` is VM-tested via telemetry + the tag is browser-verified), but the dedicated test would fully close it. **Fix:** VM-execute — analytics tool held without consent → injected after `applyPreferences`.
- 🟡 (tiny, optional) `runInjections` defaults a missing `consentCategory` to `"necessary"` (`:159` — `item.consentCategory || "necessary"`), i.e. **fail-open** (inject immediately) rather than fail-closed (hold). The store always sets a category so it's effectively dead-defensive, but holding an unknown category would be safer.
- (Not a defect) The **workspace UI** to populate a site's injections is still builder-flagged as pending, so end-to-end "GA4 loads on a real page" isn't reachable yet.

**→ Commander:** The **consent-gating enforcement is done and correct** — resolves the "enforcement pending" nit from the tick-9 Aqua Tag verdict; the tag genuinely holds analytics/marketing until consent (GDPR opt-in default), browser-verified. Before ticking the old "form-capture not consent-gated" issue fully closed: add the one behavioural injection test (held-without / injected-after) so the gate is regression-proof, and land the config UI for true end-to-end.

## 2026-08-19 — ✅ PASS — Staff & Team Phase 9: training modules (answer-key protection + grading integrity)

**Verdict:** ✅ PASS. Staff can't cheat and can't complete someone else's module — the quiz answer key is stripped from the staff-facing view, grading is server-side, and completion is bound to the assignee. Behaviourally tested.

**Audited:**
- **Re-ran the FULL suite myself:** **1629 pass · 1 fail · 1 skip.** The one fail — `smoke-consent-capture` "Aqua Tag sends only consented telemetry" — is **`fetch is not defined`** (`:58`), a **test-isolation race** (a concurrent test nulled `globalThis.fetch`), **not** an Aqua Tag consent regression (tick-9 PASS holds). This is a concrete second root cause for the standing red-suite finding — global-state races, not just source-shape churn.
- **Answer-key stripped — VERIFIED.** `sanitizeModuleForStaff` (`people.ts:1405-1413`) returns each quiz option as `{id, text}` only — the `correct` flag is dropped — and `employeePeopleSnapshot` serves staff the sanitized modules (`:1424`). Test: `!JSON.stringify(staffView.quiz).includes("correct")` (`smoke-people-workspace.test.ts:232`). The staff client never receives which option is right.
- **Grading server-side — VERIFIED.** `gradeTrainingQuiz` (`:597-608`) matches answers against the correct option **on the server**; the key never leaves it. Pure + tested.
- **Only-assignee + agency-scoped — VERIFIED.** `completeModuleAssignment` (`:614-618`) returns `null` unless the assignment is in the actor's agency AND `getPeopleEmployee(...).userId === input.userId`. Test: a stranger gets `null` (`:247`); fail → in-progress, pass → completed (`:240-243`).

**Findings:** none for Phase 9. (Standing: the red-suite flakiness now confirmed to include global-`fetch`/`env` isolation races — this tick's `fetch is not defined` — on top of the source-shape churn; fix is hermetic tests / injected fetch.)

**→ Commander:** Mark **Staff Phase 9 done** — answer-key server-only, grading server-authoritative, completion bound to the assignee. Staff plan is now audited across its security contracts (role/scope in the Phases-1–10 verdict; answer-key here).

## 2026-08-19 — 📋 Calibration — Dev Mode browser review (Commander, 4 fixes) vs my tick-5 static PASS

The Commander browser-verified Dev Mode on `:3032` and fixed 4 issues. Checked against my tick-5 static PASS — **none are security holes**, so the PASS stands; browser verification added a runtime layer, as its caveat anticipated:
- 🔴 `DevModeLoadIn` Strict-Mode overlay click-trap — in the **Phase 3** cinematic load-in, which shipped *after* my tick-5 audit of the route/gate (outside the scope I verified). A React-19 Strict-Mode double-invoke timing bug — the runtime class static reading is weakest at.
- 🟠 demo-staff dead-end (missing `PeopleEmployee`) · ➕ exit→/login (a `/dev` founder's `isDemo` session dropped on exit) — runtime/auth-plumbing integration bugs; a deep static trace *might* have reached them, but they surface naturally on a click-through.
- 🟡 caption — not a real bug (looked stuck only because of the trap).

The gate / fencing / authority I actually audited in tick 5 held (Phase 4 later *proved* the fencing throws at the scope layer). **Takeaway:** static + browser passes are complementary — my security contract verification is sound, and browser verification is where runtime UX/auth bugs surface. Reinforces that browser-level verification (blocked for me by the `:3032` lock) is worth unblocking via per-session isolation.

## 2026-08-19 — ✅ PASS — Aqua Tag Phase 4: consent-aware tag manager (config store + public endpoint)

**Verdict:** ✅ PASS. The security-critical parts are solid and behaviourally tested — the injected value can't become script (anchored allow-list patterns, no raw-snippet path), the public endpoint leaks nothing, and everything is agency-scoped. Honest scope: this is the **config + delivery** half; the actual consent *enforcement* (tag-side) is a later slice, not yet shipped.

**Audited:**
- **Re-ran the FULL suite myself:** **1622 pass · 0 fail · 1 skip** — green this run. (Caveat: the suite is **flaky run-to-run** per the builders' own notes — isolation races + source-shape churn; see my standing cross-cutting finding. A single green run isn't proof of stability.)
- **XSS guard — VERIFIED (the critical one).** The value becomes markup on the client's live site, so it *is* the XSS surface. Every `valuePattern` (`websiteInjections.ts:39-47`) is **anchored** (`^…$`) and admits only `[A-Za-z0-9_-]` + fixed prefixes — no `<`, `>`, `"`, `'`, `/`, spaces. With a strict **allow-list** (no raw `<script>` path; unknown provider → error, :82) and pattern-check **before** mutate (:84), a crafted value can never reach the markup. Behaviourally tested: `addInjection(ga4, "G-1\"><script>…")` **throws** (`smoke-aqua-tag-injections.test.ts:48`), as do malformed ids (:49-50) and unknown providers (:43).
- **Public endpoint — no leak, correctly scoped.** `aqua-tag-config/route.ts` returns **only** `{kind, value, consentCategory}` (:38-42) — no internal id/label/owner/agency; resolves the **master key → agency** and filters to that agency's host, so agency A's key can't read agency B's sites; unknown key/host → `[]` (safe default). Served values are public provider ids that already ship in the page HTML — nothing secret. CORS-open + cached is appropriate for a public config fetch.
- **Agency-scope — VERIFIED + tested.** All CRUD gates on `getWebsiteSource(agencyId, …)`; the test proves a foreign agency can't add to another's site (`:66` → "not found"). Dedupe, per-site cap (25), consent default-vs-override, disabled-withheld all covered.

**Findings:**
- 🟡 **Consent *enforcement* is not yet live — config-complete, gating pending.** The injections carry a `consentCategory` and the endpoint serves it, but the piece that actually **holds** an analytics/marketing tag until consent is granted is the tag-side injection in `lib/aquaTagSource.ts` — the **next slice, not shipped** (honestly flagged by the builder). So the known "Aqua Tag form-capture not consent-gated" gap (issues.md) is **not fully closed** until that lands. **→ Commander:** don't mark the consent-gating issue resolved until the tag-side gating ships (with a behavioural test that a tag stays out until consent).

**→ Commander:** Mark **Aqua Tag Phase 4 (config + delivery) done** — the allow-list XSS guard is strong and behaviourally tested, the public endpoint is scoped + leak-free, agency-scoping holds. The remaining slice (tag-side consent enforcement) is where the actual gating lives — audit that when it ships.

## 2026-08-19 — ✅ PASS — Staff & Team (Phases 1–10): role + agency-scope on every server mutation

**Verdict:** ✅ PASS. The CLAUDE.md non-negotiable — *"respect role and agency scope on every server mutation"* — holds across the People API and its server functions. Scope: I audited the authorization contract (route dispatch + a representative sample of `people.ts` mutations), not each of the ~25 actions individually. (Separately: the full suite is red again from unrelated parallel-worker refactors — recurring cross-cutting finding.)

**Audited:**
- **Re-ran the FULL suite myself:** **1615 pass · 2 fail · 1 skip.** Both failures are **non-Staff** (`smoke-finance-operations` #307, `smoke-nav-audit` #412) — see the finding. Staff's own tests pass.
- **Route dispatch — sound** (`api/portal/people/route.ts`): `agencyId` is always taken from the **session** (`getActiveAgencyId`, :91), **never** the request body — so a caller cannot act on another agency. Staff (`agency-staff`) get a limited self-action set, each **station-gated** (`canUsePeopleStation`, e.g. :101) and scoped to `session.userId`, and fall through to **403** for anything else (:157). Manager actions are re-gated by a second `requireRole([...MANAGERS])` (:160).
- **Functions scope the target entity to the agency — verified across a sample.** `getPeopleEmployee` is agency-scoped (`:279` — `employee?.agencyId === agencyId ? … : null`), and the mutations that take a raw `employeeId` all guard on it: `savePeopleShift`, `savePeopleTraining`, `awardPeopleRecognition` (`:637`), `savePeopleFreelancerJob` (`:542` + an existing-job agency check `:547`) each `throw` if the employee isn't in the actor's agency — so a manager can't award/schedule/hire against a **foreign** employee id.
- **Phase-10 "only the owning employee may sign" — verified.** `acknowledgePeopleContract` checks the contract is in the actor's agency **and** `getPeopleEmployee(agencyId, contract.employeeId).userId === session.userId` — a colleague (or another agency) gets `null` → 404 ("not yours to sign").

**Findings:**
- 🟠 **Cross-cutting (recurring — 3rd sweep): the full suite is red again, and nobody owns it.** 2 fails this run, both **brittle source-shape tests** broken by parallel refactors: `smoke-finance-operations` expects `/Operations/` in a Finance component that was refactored to pull `FINANCE_SECTIONS` from a new `../lib/sections` module; `smoke-nav-audit` is a nav-structure assertion. This is the **third sweep** (also tick 5's `smoke-lead-wait-tracing`, tick 5's inbox churn) where the suite is red from unrelated workers' refactors breaking source-shape tests, and everyone ships anyway. The "green baseline" the whole audit trust model leans on is **chronically unstable**. **→ Commander:** assign an owner to keep the suite green as refactors land, and consider migrating the brittle source-string tests to behavioural/structured assertions so a component refactor stops turning the suite red.

**→ Commander:** Mark the **Staff role/agency-scope contract verified** — every server mutation takes its agency from the session and scopes its target entity, staff are confined to station-gated self-actions, and contract sign-off is bound to the owning employee. (Scope: the auth contract + a representative sample of mutations, not all ~25 individually — but the pattern is consistent.) Please act on the recurring red-suite finding — it now spans three sweeps.

## 2026-08-19 — ✅ PASS — Meta social inbox Phases 1–3: credential secret-handling

**Verdict:** ✅ PASS. Secret hygiene is genuinely solid — AES-256-GCM at rest, production requires a real vault key, secrets never reach persisted state or the browser, stored-then-env resolution — verified by a strong behavioural test. The webhook fails **closed**. The builder's own flagged deferral (webhook uses env, not stored) is confirmed + characterized; three minor nits.

**Audited:**
- **Re-ran the FULL suite myself:** **1600 pass · 0 fail · 1 skip** (green).
- Read the store (`integrationConnections.ts`), its test (`smoke-integration-connections.test.ts`), and the webhook route (`webhooks/meta/route.ts`).
- **Encrypted at rest — VERIFIED.** `encryptSecret` (`integrationConnections.ts:392-397`): AES-256-GCM, per-secret random IV + auth tag; `vaultKey()` **throws `vault_not_configured` in production without `PORTAL_VAULT_ENCRYPTION_KEY`** (:384-386). Secret fields → `encryptedSecrets` (encrypted); non-secrets → `config` (plaintext) (:75-83).
- **Never to the browser — VERIFIED.** `publicIntegrationConnection` exposes only `configuredSecretFields` (the *names*, sorted), never values or ciphertext (:234-250); decryption (`privateValues`) is server-only. The test asserts `"encryptedSecrets" in saved === false` and that **neither `storage.getState()` nor the returned record contains the plaintext secret** (`smoke-integration-connections.test.ts:129-130,212-213`).
- **Stored-then-env + blank-preserves-secret — VERIFIED** behaviourally (:155-167, :235-240). Test-without-leak (:260) and store-driven readiness (:277-291) verified. The test drives the real store + injected `fetch` end-to-end — a strong contrast to the erasure scratch harnesses.
- **Webhook fails CLOSED — VERIFIED.** `webhooks/meta/route.ts`: GET returns **503** when the verify token is unset (:15), 403 on mismatch (:16-18); POST returns **503** when the app secret is unset (:24) and **401** on an invalid `x-hub-signature-256` (:26). Never accepts an unsigned/unverified webhook — no fail-open.

**Findings:**
- 🟡 **Confirmed the flagged deferral — self-serve is incomplete for *inbound*.** The webhook reads `META_WEBHOOK_VERIFY_TOKEN` (:14) + `META_APP_SECRET` (:23) from **env**, not the stored connection — so an agency that configures Meta only via the in-app form (Phases 1-3) **won't receive Meta messages** until the `META_*` env vars are also set (the webhook 503s). No security hole (fails closed). The fix is non-trivial: the webhook is a **single global endpoint** while stored Meta connections are **per-agency** (each its own app secret), so it must resolve the right agency's secret per event. **Fix:** per-agency stored-secret resolution in the webhook, or document that Meta needs env config until then. (Builder flagged this honestly — awaiting Ed's call.)
- 🟡 (minor) GET verify-token compare is a plain `!==` (`route.ts:16`), not constant-time. Low risk for a handshake token; `crypto.timingSafeEqual` would match the connect-code verify pattern. Optional.
- 🟡 (minor) `safeTestMessage` (`integrationConnections.ts:421`) redacts only `sk_/re_/whsec_/github_pat_` prefixes from stored/returned error messages — not Meta app secrets (hex) or Twilio tokens. Low probability + truncated to 300 chars, but incomplete. Optional.

**→ Commander:** Mark **Meta Phases 1–3 done** — credential secret-handling is solid, behaviourally tested, and the webhook fails closed. One item to track before launch: inbound webhooks still need `META_*` **env** config (self-serve drives outbound, not inbound), non-trivial to close because the webhook is global while stored connections are per-agency — the Ed decision the builder already flagged.

## 2026-08-19 — ✅ PASS — Radar upgrade: the health / confidence / readiness contract (spot-audit)

**Verdict:** ✅ PASS. The CLAUDE.md non-negotiable — *"distinguish health, evidence confidence, and setup/readiness; missing evidence is a visible blind spot, never a healthy pass"* — holds in **both the implementation and a real behavioural test**. Scope: I verified the core contract + classification + infra behaviour, **not** all 7 stages / 2,040 rules individually (the builder browser-verified the UI panels earlier; the seed queue said spot-check).

**Audited:**
- **Re-ran the FULL suite myself:** **1574 pass · 0 fail · 1 skip** — green; the tick-5 red-suite failure (`smoke-lead-wait-tracing`) has **cleared** (the `websiteSources` restructure settled).
- **Contract holds in code** (`businessIssueRadar.ts:505-532`): `RadarCheckStatus` distinguishes `pass | critical | warning | blind | learning | inactive` (`businessRadar.ts:26`); **`assuredChecks = passedChecks + firingChecks` only** (:511) — blind/learning/inactive are excluded from "assured," so a check with no evidence can **never** count as a healthy pass; `assurancePercent` divides assured by *applicable* (:532), so a blind spot drags assurance **down**, never inflates it. Domains with `blindChecks > 0` raise a visible *"N checks cannot prove health"* incident (:468-475).
- **Contract is behaviourally tested** (`smoke-radar-golden-sweep.test.ts`) — runs the **real** `buildBusinessIssueRadar` end-to-end on a fresh fixture and asserts: every check partitions into exactly one status bucket; **`assured === passed + firing`** ("a blind check is never counted as assured — the core blind-spot contract", :57); an uninstrumented agency **must** surface `blindChecks > 0` + the `coverage:business-blind-spots` incident ("never a false pass", :72-82); an un-probed infra check is `status:"learning"`, never a fake pass (:47); deterministic across builds. A genuine behavioural golden test, not source-shape.
- **Classification (Stage 2)** (`radarClassification.ts`): `tier` (instant/probe/rollup → which sweep) + `dataDependency` (in-state/derived/external, so *"why is this blind?"* is answerable) — additive over the 2,040-rule catalogue, clean.

**Findings:**
- 🟡 **(minor) Finding-group bucketing is regex-on-id** (`radarClassification.ts:100-134`) — `INFRASTRUCTURE_ID`/`RELIABILITY_ID`/etc. match substrings of a finding's id, first-match-wins. A future check whose id merely *contains* e.g. `integration`/`storage` would be forced into Infrastructure even in a commercial context. It's a **display grouping** (the FindingGroupBar), not the blind-spot contract, and the domain default backstops it — low impact. **Fix (optional):** classify off a structured field rather than an id regex if the buckets ever drive more than display.

**→ Commander:** Mark the **Radar core contract verified** — health/confidence/readiness is distinguished and missing-evidence-is-a-blind-spot holds in code **and** a real behavioural test. (Scope: core contract + classification + infra behaviour spot-checked; per-stage UI panels were browser-verified by the builder earlier, not re-driven here.) Optional next: the Stage-7 "suggested work needs human acceptance" contract is a separate non-negotiable worth its own spot-check.

## 2026-08-19 — ✅ PASS — Dev Mode Phase 1 + 2: demo-persona POV switcher (mint route + gate)

**Verdict:** ✅ PASS. A new **session-minting** feature done *right* — a strong four-guard availability gate, sound fencing, and genuinely behavioural + durable tests. One minor nit. (Separately surfaced: the full suite is currently **red** from an unrelated parallel-worker edit — flagged below; not Dev Mode's fault.)

**Audited:**
- **Re-ran the FULL suite myself:** **1562 tests · 1560 pass · 1 fail · 1 skip.** The one failure is `smoke-lead-wait-tracing` (a leads/inbox **source-shape** test), **not Dev Mode** (cross-cutting finding below). Dev Mode's own 16 tests pass.
- Read the mint route (`api/auth/dev-mode/route.ts`), the gate (`devModeAccess.ts` → `devMode.ts`), and the test (`smoke-dev-mode.test.ts`).
- **#1 security contract — VERIFIED.** `canUseDevMode()` → `isDevModeEnabled()` requires **all four**: `PORTAL_DEV_MODE==="true"` · `NODE_ENV!=="production"` · no `VERCEL_ENV` · **file/memory backend** (`devMode.ts:55-73`). Guard 4 is defense-in-depth — even with the env flags wrong it can't reach a durable backend, so it "physically cannot mint against real data." The route checks it **first** → 404 before touching session/state (`route.ts:114-120`); in production guards 2/3/4 all fail. Behaviourally tested: refuse → 404, **no cookie minted** (`smoke-dev-mode.test.ts:98-111`).
- **Authority + fencing — VERIFIED.** `enter` is founder-only (`agency-owner` + `isFounder`, `route.ts:187-189`); `switch`/`exit` require an active demo session — the HMAC-signed `devReturnAgencyId` capability, unforgeable (correct: the demo *client* isn't a founder, so an `isFounder` gate would trap you). Every mint is fenced to the demo agency (`agencyIds:[demoAgencyId]`, `route.ts:91-104`), so a demo session can't reach a real tenant. Same-origin enforced. All behaviourally tested (fences on enter, restores on exit, foreign origin 403, non-founder 403, persona hops, client-can-still-exit).
- **Tests real (B):** `smoke-dev-mode.test.ts` drives the **real handler in-process** (`issueSession` + `NextRequest`) — 16 durable behavioural tests, a marked contrast to the erasure scratch harnesses. UI wiring is source-shape (fine). Reuse: `issueSession`/`effectiveRole`/`demoSeed`/Showcase pattern — no third copy.

**Findings:**
- 🟠 **Cross-cutting (NOT Dev Mode): the full suite is red right now.** My run: **1 fail — `smoke-lead-wait-tracing` › "wires the timing ledger into Journey, Inbox…"** — a **source-shape** test that reads an agency settings/inbox component expecting `/Elapsed since enquiry/`, but the component was restructured by a parallel worker (now imports `IntegrationConnectionsPanel` + `WebsiteSourcesConfig` — the Meta/websiteSources work). The Dev Mode P2 builder separately reported **6** failures (inbox/enquiry domain); the count shifts as workers edit shared components. **Multiple builders are shipping against a red suite, each attributing it elsewhere** — so the "green suite" baseline the audit trust model relies on is currently unreliable. **→ Someone must OWN this:** confirm whether the leads-timing wiring actually regressed or the test is merely stale against the inbox/settings restructure, then fix it. (And brittle source-shape tests coupled to shared components will keep breaking on every unrelated refactor.)
- 🟡 **`exit` restores "an" owner, not necessarily the enterer.** `route.ts:151` recovers the founder as `listUsersForAgency(returnAgency.id).find(u => u.role === "agency-owner")` — the first owner. The demo session doesn't retain the real userId, so in a multi-owner agency `exit` could land you as a different (equally-privileged) owner of the agency you entered from. Not a security issue; harmless for the single-owner norm. **Fix (optional):** stash the real userId alongside `devReturnAgencyId` at `enter` and restore exactly.

**→ Commander:** Mark **Dev Mode Phase 1 + 2 done** — prod gate solid, fencing sound, tests real + behavioural. Two non-blocking items: (1) 🟠 the **full suite is red** from a parallel worker's edit — assign an owner to resolve `smoke-lead-wait-tracing` (real regression vs stale test) so "green" means something again; (2) 🟡 optional: make `exit` restore the exact entering owner.

## 2026-08-19 — 🔴 REWORK — Plugin-data erasure Phase 3–5: live scrub + per-disposition test ("plan COMPLETE")

**Verdict:** 🔴 REWORK — but *one narrow hole from a genuine PASS*. Excellent, responsive work: the retain-PII 🔴 (Phase 2) is fixed and the sweep finally has a real test. But the claim "plan COMPLETE / GDPR gap closed" is premature — the leads-pipeline contact's **email still survives in the activity log** (the Phase 2b 🔴, unaddressed), and the new test doesn't check for it.

**Audited:**
- **Re-ran the FULL suite myself:** **1535 pass · 0 fail · 1 skip** (green).
- Read the new per-disposition test (`smoke-client-erasure.test.ts:143-252`), the three module manifests, the leads-pipeline hook, `ContactService`, and `clientErasure.ts`'s activity handling.
- **Verified FIXED (credit):** ecommerce now has a real `onEraseClient` that **strips `customerEmail`, keeps `paymentIntentId`** (test :200-203); affiliates likewise (`affiliates/index.ts:221`); memberships is now a deliberate `retain` (legal-defence record, comment corrected — no more phantom hook). The leads email-in-**key** is erased (test :206). The live scrub (inbox delete + no-PII stub; `brand_enquiries` anonymise split by identity resolution) is covered by a **faithful fake Supabase** test (:174-235), and the builder is honest it's "not a live run — needs a staged run + DPO sign-off." **The "no durable test" 🟠 is resolved** — this is a genuine behavioural regression test.

**Findings:**
- 🔴 **The leads-pipeline contact's EMAIL still survives erasure, in the activity log** (unchanged from the Phase 2b verdict). The hook (`leads-pipeline/index.ts:138-151`) calls `ContactService.delete`, which logs `Archived contact ${existing.email}` (`contacts.ts:272`) with **no `clientId`**; `clientErasure.ts` sweeps `state.activity` only by `clientId` and adds **no content-based PII scrub**. So after an erase, `state.activity` still contains the email. The new test **seeds this exact contact** (`lead@x.com`, test :167), asserts the storage **key** is gone (:206) — but makes **no assertion the email is absent from the log**, so it passes while the PII survives. This is why "GDPR gap closed" is not yet true. **Fix:** don't re-log PII during erasure — a silent/PII-free delete path on `ContactService` for the erase hook (or stamp contact-activity with `clientId` so the sweep reaches it) — then add a test assertion: after erase, **no activity entry contains the erased email**.
- 🟡 **Doc overclaim.** The updates entry + plan say "plan COMPLETE / launch-blocker gap closed." One PII leak remains, so it isn't. **Fix:** downgrade to "built, one PII-log gap open" until the above lands.

**→ Commander:** Huge progress — erasure is ~one fix from done. **Route the single remaining item to the erasure builder** (email-in-activity-log + a test assertion). Do **not** mark the launch blocker complete until an erase leaves **zero** trace of the contact's email, the activity log included. The Phase 2 retain-PII 🔴 is **resolved**; the Phase 2b activity-log 🔴 **remains**.

## 2026-08-19 — ✅ PASS — Connect flow Phase 3: lockout + rate-limits

**Verdict:** ✅ PASS. The per-code lockout is correct and behaviourally tested, the rate-limits are wired on both endpoints, and this **closes the missing-lockout nit** from the Connect Phase 1 audit.

**Audited:**
- **Re-ran the FULL suite myself:** **1535 pass / 0 fail / 1 skip** (green).
- **Lockout (verified correct):** `MAX_CODE_ATTEMPTS = 5` (`connectionConfirmation.ts:63`); the `locked` branch (`:190-195`) sits **after** the dev bypass but **before** the hash compare — so once `attempts >= 5` even the correct code returns `locked` (defeats guess-to-limit-then-try-real), while dev `00000` stays usable (`:177`). A resend mints a fresh code with `attempts: 0`, so a lock is never permanent.
- **Rate-limits (wired):** accept caps verify at **20 / 15 min per ip+user** (`accept/route.ts:18,42-51`) and counts a guess **only** on `wrong-code` (`:74-78` — never on locked/throttled); request-code caps sends at **5 / 15 min per connection** (`request-code/route.ts:15,41-48`); both 429 with `retryAfterSec`.
- **Durable tests (not a scratch harness):** `smoke-portal-connections.test.ts` behaviourally tests the lockout (:495-497 locks after MAX incl. correct-code-refused; :500-502 dev bypass through when locked) and pins "never count a locked/throttled guess" (:848) + `rateLimit(` wiring on both routes (:830,:844).

**Findings:**
- 🟡 The 429 **throttle** behaviour is source-matched in the durable suite (the behavioural 5-sends→429 run was the builder's in-process harness); the security-critical **per-code lockout** is behaviourally covered, so this is minor. End-to-end browser click-through still pending (shared `:3032`).
- 🟡 (carry-over) **Connect Phase 2 is still unlogged** — the `request-code` endpoint that Phase 3 rate-limits has no `updates.md` entry. Log it for the record.

**→ Commander:** Mark **Connect Phase 3 done** — lockout correct, rate-limits wired, durable tests; clears the lockout follow-up from the Phase 1 audit. Still owed: an `updates.md` entry for the (shipped, load-bearing) Phase 2 request-code endpoint.

## 2026-08-19 — 🔴 REWORK — Plugin-data erasure Phase 2b: leads-pipeline `onEraseClient` (key-PII)

**Verdict:** 🔴 REWORK. The claimed mechanism is real and verified — but erasing a leads-pipeline client **leaves the contact's email in the activity log**, so the feature still fails "no identifying PII remains."

**Audited:**
- **Re-ran the FULL suite myself:** **1521 tests · 1520 pass · 0 fail · 1 skip** (green).
- Read the hook (`built-ins/modules/leads-pipeline/index.ts:138-151`), `ContactService` (`.../src/server/contacts.ts`), the activity wiring (`foundationAdapter.ts` → `leadsPipelineFoundation.ts` → `_foundationPorts.ts`), and `logActivity` (`src/server/activity.ts`).
- **Claim A — TRUE (verified):** `ContactService.delete` (`contacts.ts:260-277`) removes the row (`contact:<id>`, :263), **the `contacts/email/<email>` pointer key (:264)** — the key-name email Phase 2b exists to kill — and the index entry (:266); idempotent (:262). The hook filters by `clientId` correctly (`index.ts:147`). So the specific claim shipped and works.

**Findings:**
- 🔴 **The erased contact's EMAIL survives in the app-wide activity log.** Every `leads.contact.*` write names the email in its message — `Added … ${contact.email}` (`contacts.ts:161`), `Promoted lead ${lead.email}` (:220), `Archived contact ${existing.email}` (:272) — and **none pass a `clientId`**. `logActivity` stores `clientId: input.clientId` verbatim (`activity.ts:31`) → these entries are `clientId: undefined`. The erasure sweep only drops activity where `entry.clientId === clientId` (`clientErasure.ts:315-316`), and `onEraseClient` deletes only the row/pointer/index — so the email-bearing log entries **survive erasure**. The hook kills the email in the storage key but leaves it in the log. **Fix:** during erasure, delete contacts without re-logging PII (a silent / PII-free delete path), or stamp contact-activity with `clientId` at write time so the sweep reaches it (and purge the pre-existing ones). *(Mitigation: pre-launch test data; it's the email in internal log messages, not the whole record — but it is identifying PII surviving a right-to-be-forgotten erasure. Also check `appendActivityToClientRecordLedger` as a second sink.)*
- 🟠 **No durable test for the hook — same gap as Phase 2.** `onEraseClient` appears in **0** test files and `contacts/email` in **0**; the leads-pipeline module smoke never touches erase. The "10/10 runtime-verified" was a scratch harness, not in the repo — which is exactly why the activity-log leak went unseen. **Fix:** a behavioural test that seeds a client's contacts, erases, and asserts **zero trace of the email anywhere** — row, pointer key, index, **and the activity log**.

**→ Commander:** **Route to the erasure builder** (same owner as the Phase 2 🔴). The deletion mechanism is sound and verified; the gap is PII completeness — the email survives in the activity log and no test would catch it. Don't mark erasure done until a test proves the email is gone from *every* surface, the log included.

## 2026-08-19 — 🔴 REWORK — Plugin-data erasure Phase 2: the runtime sweep

**Verdict:** 🔴 REWORK. The sweep *code* is well-structured, but as the tree stands the erasure **fails its own done-criteria** — customer PII in three plugins survives a right-to-be-forgotten erasure — and the entire plugin-sweep path has **no durable test**. Phase 2's own claim ("ecommerce/affiliates/memberships … whole slice dropped wholesale") is now contradicted by the tree.

**Audited:**
- **Re-ran the FULL suite myself:** **1518 tests · 1517 pass · 0 fail · 1 skip** (green; grew +10 since tick 1 — a builder is live in parallel).
- Read the sweep (`src/server/clientErasure.ts`, untracked/new), the disposition types (`_types.ts`), all four module manifests, and the erasure test.
- **Ran it: partial.** The defect is proven by code-inspection with exact file:line (below); I did not build a plugin-runtime repro this tick (read-only on repo tests; the harness is non-trivial). The fix must ship the missing runtime test.

**Findings:**
- 🔴 **ecommerce / affiliates / memberships retain full client PII on erasure.** Each sets `dataDisposition: "retain"` (`built-ins/modules/ecommerce/index.ts:108`, `affiliates/index.ts:39`, `memberships/index.ts:45`) under a comment claiming "a bespoke `onEraseClient` (below) … strips PII, keeps the de-identified record" — **but no such hook exists** (grep: only `leads-pipeline` implements `onEraseClient`). Per `clientErasure.ts:191-192` + `:222-226`, `retain` **excludes the slice from the sweep**, so the data survives *untouched* — including PII (ecommerce is `scopePolicy:"client"` and stores Orders + **Customers**). Fails the plan's "Done when: no identifying PII remains for that clientId in pluginData" and contradicts Phase 2's "dropped wholesale" claim. **Fix:** implement the promised `onEraseClient` on each (strip PII, keep the de-identified record — the anonymise disposition the plan intends); or, if wholesale legal-hold retention is genuinely intended, say so (DPO sign-off) and delete the false "strips PII" comment. *(Mitigation: all data is Ed's test data pre-launch — fix-before-launch, not a live breach.)*
- 🟠 **The plugin-data sweep has no durable test — this is why the 🔴 slipped through.** `smoke-client-erasure.test.ts` seeds only a connection + an activity entry (`pluginData` refs: **0**); it never installs a plugin or seeds a slice, so `sweepPluginData` / `resolveDispositionsAndRunHooks` / the hook·retain·delete paths / `pruneClientId` are **entirely uncovered**. Phase 2's "11/11" and Phase 2b's "10/10" were **scratch harnesses** (the updates say so) — throwaway, not repeatable. **Fix:** seed `pluginData` for a delete-plugin, a retain-plugin, and a hook-plugin, then assert the disposition each got — deleted / **PII-stripped** / retained — not "zero rows."
- 🟠 **Unlogged work drove the regression.** The `dataDisposition:"retain"` flags on the three modules appear in **no updates.md entry** (Phase 2b logged only leads-pipeline), so the change that flipped them from "deleted" to "retained-with-PII" is invisible to this queue — same pattern as Connect Phase 2 last sweep. **Fix:** log the disposition-policy wiring so it's auditable.

**→ Commander:** **Route to the erasure builder.** Fix = the missing `onEraseClient` hooks (or an honest disposition + comment) **plus** a durable plugin-sweep test. Do **not** mark the erasure launch blocker done until PII-strip is proven by a repeatable test. Also log the module `dataDisposition` changes in updates.md.

## 2026-08-19 — ✅ PASS — Plugin-data erasure Phase 1: `onEraseClient` hook contract

**Verdict:** ✅ PASS. The additive hook contract is exactly as claimed — clean, optional, correctly shaped.

**Audited:** `built-ins/runtime/_types.ts:528` — `onEraseClient?: (ctx: PluginCtx, clientId: string) => Promise<void>`. Optional (absent → no runtime change), `clientId` passed **explicitly** (not via `ctx.clientId` — correct for agency-scoped installs holding many clients' data), idempotency contract documented (`:517-527`). Additive only; the claim's "nothing implements it yet, nothing changes at runtime" held at ship time. Full suite green.

**Findings:** none for Phase 1. The defects are in how the *consumers* wired disposition — see the Phase 2 REWORK above.

**→ Commander:** Mark **Erasure Phase 1 done** — the hook seam is sound; the launch-blocker risk is in Phase 2, not the contract.

## 2026-08-19 — 🟡 PASS WITH NITS — Connect flow Phase 1: real code — generate + store + verify

**Verdict:** 🟡 PASS WITH NITS. Phase 1's claim (mint + hash-at-rest + verify, `00000` behind the dev gate) is **verified** — source matches, security-critical logic is behaviourally tested and green, no contract broken. The findings are doc/queue drift, not Phase 1 defects.

**Audited:**
- **Re-ran the FULL suite myself** (memory backend, `scripts/*.test.ts`): **1508 tests · 1507 pass · 0 fail · 1 skip.** (The update claimed 1497 — stale; more work has landed since. Still green, no flake this run.)
- Read the shipped source (all **untracked/new** files): `src/lib/server/connectionConfirmation.ts`, `accept/route.ts`, and the tests. Matches the claim exactly: `crypto.randomInt` uniform 6-digit code · HMAC-SHA256 bound to `connect-code:{connectionId}:{userId}:{code}` · 15-min TTL · `crypto.timingSafeEqual` constant-time compare (length-guarded) · single-use clear on accept · `expired` distinct from `wrong-code` · `00000` honoured **only** when `bypassEnabled` (the real stored path still runs in dev).
- **Tests are real (checklist B).** The security logic is exercised behaviourally against the real store — issue → hash-only-at-rest → verify → user-binding → connection-binding → expiry → single-use clear → resend-replaces → attempt-count (`smoke-portal-connections.test.ts:402-597`). The "stale smoke-mfa contract test" was **re-pointed, not weakened**: it pins the same "nothing bound unproven" contract on the new emailed-code gate (`smoke-mfa.test.ts:62-127`); the old `unavailable` status still exists in the type. No test gamed, skipped, or deleted.
- **Contracts held (C/E).** Accept route re-checks rules against stored state *before* binding, binds to `session.userId`, refuses wrong-client (tested), single-use enforced. Shared-file touches (`PortalConnection.pendingCode` + two store fns) were flagged in the update and are strictly additive. No junk to live Supabase (memory backend). **No git commits — HEAD still `b46d8ae`; every connect-flow file is untracked working-tree work.**
- **Ran in app: NO (end-to-end).** The `/connect/[id]` flow needs a seeded connection + signed-in client session to reach; deferred this tick. Matches the builder's own "not runtime-verified end-to-end" caveat. The behavioural suite already runs the security-critical paths, so Phase 1's *logic* is verified even without the browser walk.

**Findings:**
- 🟠 **Phase 2 is shipped but unlogged — it escapes this audit queue.** `src/app/api/portal/connections/request-code/route.ts` (untracked) is a real, wired endpoint that mints a code and emails it (`issuePortalConnectionCode` → `connectionCodeEmail` → `sendTransactionalEmail`, `to: session.email`, dev-gated), and `_ConnectFlow.tsx` (untracked) wires the request/resend/`sentTo` UI — both covered by passing tests. But `plans/connect-flow-real-codes.md:20` marks Phase 2 `⬜ next` and there is **no Phase 2 entry in `updates.md`**. A live code-emailing endpoint is therefore invisible to the docs-driven queue and will never be audited. **Fix:** add a Phase 2 entry to `updates.md` + tick the plan's Phase 2 box (or, if deliberately mid-build, mark the route/UI as in-progress and not wired) so it enters the queue for its own audit.
- 🟡 **The live (unlogged) endpoint has no verify-attempt lockout yet** (Phase 3 `⬜`). `accept/route.ts:55-57` counts wrong guesses but nothing enforces a cap, so the verify path currently accepts unlimited attempts on a 6-digit code. **Largely self-mitigating:** the code is HMAC-bound to `userId`, so a caller can only ever brute-force a code issued for their *own* (userId, connectionId) — which they could simply email themselves; a colleague's guesses hash with the wrong userId and never match. Low severity, but close before launch. **Fix:** enforce a max-attempts cap in the accept route (Phase 3).
- 🟡 **Stale suite count** in the Phase 1 update (says 1497). Current green baseline is **1507 pass / 0 fail / 1 skip**. Expected drift as later work landed — noting for the record.

**→ Commander:** Mark **Connect-flow Phase 1 done** (claim verified, contracts held, tests real + green, dev gate sound). THEN log the already-shipped **Phase 2** (request-code email endpoint + resend UI) in `updates.md` + tick the plan, so it enters the queue for its own audit — it is live and unaudited today, and ships without the Phase 3 verify-lockout (low risk due to userId-binding, but close before launch).
<!-- AQUACRM_SOURCE_END path="docs/development/audits.md" -->

---

<a id="source-docs-development-findings-2026-08-22-agency-staff-can-read-salaries-md"></a>

## Source document — `docs/development/findings/2026-08-22-agency-staff-can-read-salaries.md`

<!-- AQUACRM_SOURCE_START path="docs/development/findings/2026-08-22-agency-staff-can-read-salaries.md" sha256="7c087bfecb744644dbecc93e6d88324d0e251d95468f4816e7a3d7da1d2ba30c" -->
# Finding — agency-staff can read FINANCE_ADMIN pages, including salaries, by URL

- **Status:** fixed
- **Closed by:** the manifest now gates the pages, not just the tabs — `agency-finance`'s
  `pages[]` declare `visibleToRoles` derived from the same `FINANCE_SECTIONS` list as the
  nav (`financePageRoles()` in `src/lib/sections.ts`), so the host 404s `agency-staff`
  before `OperationsPage` is even imported; `routes.ts` `GET budgets` moved to
  `AGENCY_ADMINS` to agree with `sections.ts`; the same hole was found and closed in
  `agency-hr` (Employees), `affiliates`, `client-crm`, `memberships` (Settings) and
  `fulfillment` (Phases); and `scripts/smoke-finance-section-gates.test.ts` drives the real
  host route as staff **and** carries a generic guard over every registered plugin —
  a page behind a nav entry narrower than its scope's widest must declare roles at least
  as narrow — with a mutation check proving the guard can see a hole.
- **Severity:** high
- **Where:** `/portal/agency/agency-finance/{budgets,operations,planning,settings}`
- **Found:** 22 Aug 2026

## What I saw
A member of staff who is not a finance admin can open the finance admin pages by typing
the URL, and the Operations page hands them compensation data before any client-side
check runs.

**The gate that is missing.** The plugin manifest pages in
`src/built-ins/modules/agency-finance/index.ts` declare no `visibleToRoles`/`roles`, so
`pluginPageAllowedRoles(page)` returns `undefined`, and the host's only remaining gate is
`requireRole(AGENCY_ROLES)` at `src/app/portal/agency/[...rest]/page.tsx:134`. The
navigation hides these tabs via `sections.ts` `FINANCE_ADMIN_ROLES` — but hiding a link
is not access control.

**Why Operations is the worst of the four.** `OperationsPage.tsx` calls
`listCompensationProfiles` and `listPayments` **server-side** and ships the result as
initial props. The admin-only 403 on `/api/portal/agency-finance/operations` therefore
blocks a client-side refresh, not the payload that already rendered. Salaries and bonuses
are in the HTML.

**A second, smaller disagreement.** As staff, `GET budgets` returns **200** — `routes.ts`
declares it `AGENCY_VIEWERS` — while `GET pnl` and `operations/*` correctly return 403.
`routes.ts` and `sections.ts` disagree about who may read budgets. The documented
contract says budgets/operations/planning/settings are FINANCE_ADMIN only; `routes.ts`
is the one that is wrong.

**Verified how:** by driving the real resolver and the real host gate function in-process
(`withSession` + demo-agency identities) over an isolated copy of live state. Not
inferred from reading — executed. All four sections returned
`allowedRoles=undefined — staff passes`.

**This is a class, not an incident.** Any plugin page that relies on nav visibility for
its access control has the same hole. The fix belongs on the manifest so the host gate
enforces it in one place, and it needs a generic test so the class cannot reopen when the
next plugin is written.

**Tests to pin it**
- New `scripts/smoke-finance-section-gates.test.ts`: for every FINANCE_ADMIN section in
  `FINANCE_SECTIONS`, assert `pluginPageAllowedRoles(resolveAgencyPluginPage(...).page)`
  excludes `agency-staff`; drive the dispatcher `GET budgets` as staff expecting 403; and
  assert the Operations SSR payload contains no compensation data for a non-admin.
- A generic guard in the same file: every plugin page whose nav entry is admin-only must
  declare `visibleToRoles`. This is the test that stops the class recurring.

---
_Captured from the Dev Team portal. Findings are the input side: review them, turn them into a plan, hand the plan to a worker._
<!-- AQUACRM_SOURCE_END path="docs/development/findings/2026-08-22-agency-staff-can-read-salaries.md" -->

---

<a id="source-docs-development-findings-2026-08-22-app-audit-salvage-md"></a>

## Source document — `docs/development/findings/2026-08-22-app-audit-salvage.md`

<!-- AQUACRM_SOURCE_START path="docs/development/findings/2026-08-22-app-audit-salvage.md" sha256="16f6f10e5bc438db5dcd9deb3bc57607259eb61d32c05ef6d1c0f4840f73aac9" -->
# App audit — salvaged findings, 22 August 2026

**Status: PARTIAL. 2 of 8 clusters reported; 6 walkers died.** The audit sent eight
agents to walk the app in the browser; the shared pane sits at a 9-tab cap and the
surviving two could never open a tab, so **there is no visual evidence anywhere in this
report** — no screenshots, no console/network capture, no dark-mode or mobile checks.

What follows was verified the hard way instead: by driving the **real route handlers and
page components in-process** (`scripts/dev-console-request-scope.ts` `withSession` +
`renderToStaticMarkup`) over an **isolated copy** of live state. Ed's real
`.data/portal-state.json` was verified untouched (mtime and size unchanged).

**Clusters covered:** Finance · Marketing-and-Operations.
**Clusters with NO findings at all:** Command Centre · Inbox-and-People ·
Fulfilment-and-clients · Company-Tools-Account · Dev-Team-and-docs · Customer-and-public.

**Re-run design note:** do NOT give each walker its own tab. Have them share ONE tab
sequentially, or run the browser layer as a single walker over all clusters.

---

## 🔴 BROKEN

### 1. `agency-staff` can read FINANCE_ADMIN pages — including salaries — by typing the URL

**Severity: highest in this report. Access control.**

- **Where:** `/portal/agency/agency-finance/{budgets,operations,planning,settings}`
- **Cause:** the manifest `pages` entries in
  `src/built-ins/modules/agency-finance/index.ts` carry no `visibleToRoles`/`roles`, so
  `pluginPageAllowedRoles(page)` returns `undefined` and the host's only gate is
  `requireRole(AGENCY_ROLES)` (`src/app/portal/agency/[...rest]/page.tsx:134`).
  The nav *hides* the tabs (`sections.ts` `FINANCE_ADMIN_ROLES`) — the pages do not.
- **Worst case:** `OperationsPage.tsx` loads `listCompensationProfiles` / `listPayments`
  (salaries, bonuses) server-side and ships them as **initial props**. The admin-only 403
  on `/api/portal/agency-finance/operations` blocks a client-side refresh, not the SSR
  payload.
- **Also inconsistent:** as staff, `GET budgets` → **200** (`routes.ts` declares it
  `AGENCY_VIEWERS`) while `GET pnl` and `operations/*` → 403.
- **Contract violated:** "budgets/operations/planning/settings are FINANCE_ADMIN only".
- **Test to pin:** new `scripts/smoke-finance-section-gates.test.ts` — for every
  FINANCE_ADMIN section in `FINANCE_SECTIONS`, assert
  `pluginPageAllowedRoles(resolveAgencyPluginPage(...).page)` excludes `agency-staff`;
  and drive the dispatcher `GET budgets` as staff expecting 403.

### 2. Stripe can never be configured — the whole card-payment leg is dead, and the error messages point at a surface that does not exist

- **Where:** `/portal/agency/agency-finance/settings`; invoice "take card"; close-deal
  stripe channel.
- **Cause:** the manifest declares `stripeSecretKey` / `stripeWebhookSecret`, but **no
  component renders plugin `settings.groups`**, and the only `patchInstall` caller in
  `src/app` (`/api/portal/settings/route.ts`) writes just currency/terms/tax/prefix.
  `readStripeKeysFromInstall` reads only `install.config.stripeSecretKey`; the vault's
  stripe mapping (`integrationConnections.ts:311`) is never consulted by agency-finance.
- **Effect:** `stripeConfigured()` is permanently false → no pay-links,
  `invoices/checkout` and `payments/refund` unreachable, and the user is told
  *"Set up Stripe in Finance settings"* (`closeDeal.ts:64`, `stripe.ts:132`) — a dead end.
- **Test to pin:** extend `src/built-ins/modules/agency-finance/src/__smoke__/finance.test.ts`
  — every field declared in manifest `settings.groups` must be writable through a real
  settings write path (currently red for both stripe fields).

### 3. Deposits page: unformatted money and raw client ids

- **Where:** `/portal/agency/agency-finance/lock-in`
- **Evidence:** `LockInPage.tsx` prints `(cents/100).toFixed(2)` with no currency symbol
  — rendered header reads *"0 clients with deposits · 0.00 / 0.00 collected"*. The Client
  column prints the raw `cli_…` id instead of the client name. Every other finance
  surface uses Intl currency formatting.
- **Test to pin:** render assertion in the finance plugin smoke — deposit rows must carry
  Intl-formatted currency and the client display name, never a `cli_` id.

---

## 🟠 CONTRACT VIOLATIONS (runtime-proven; latent on Ed's data today)

### 4. The website channel prints a measured "0" for a site that has never reported

- **Where:** `/portal/agency/marketing?view=channels&channel=website`
- **Evidence:** on an agency whose Aqua Tag has never reported —
  `Views today = "0" | Tag = "Waiting"`. The panel *knows* the tag is waiting and prints
  a measured-looking zero one tile away. `page.tsx:479` renders
  `String(ownWebsiteSummary.pageviews24h)` unguarded; `summarizeAgencyWebsite`
  (`src/server/agencyWebsite.ts:244`) returns raw counts with no unmeasured channel.
- **Why it is invisible to Ed:** his tag IS connected, so his zero is truthful. It lies
  for every new brand and every future agency buyer pre-tag.
- **Violates:** the standing rule that unmeasured is "—", never 0 — the same rule Radar
  is held to.
- **Test to pin:** `scripts/smoke-marketing-view-consolidation.test.ts` — render the
  website channel with `telemetryLastSeenAt: null`; assert "Views today" is "—"/"Waiting".

### 5. A real founder is told "not read in a demo session" when the enquiry read fails

- **Where:** `/portal/agency/marketing?view=demand` and `?view=customers`
- **Evidence:** with a genuine non-demo owner session whose `listWebsiteEnquiries` failed
  (Supabase unreachable — exactly what a production outage produces), both panels
  rendered *"Website enquiries are not read in a demo session…"*. The copy asserts a
  false cause. The pulse tile handles the same state honestly ("Not read in this
  session"). Cause: `_MarketingCommandSurfaces.tsx:295` and `:366` hardcode the demo
  explanation for `available: false`, which `marketingIntelligence.ts:121` defines as
  "the caller did not read them" — any reason.
- **Test to pin:** `scripts/smoke-marketing-intelligence.test.ts` — render both panels
  with `enquiries.available=false` and a non-demo session; assert the copy never claims
  a demo session.

### 6. Funnel Results renders hand-typed figures as measured metrics, including "Rate 0%"

- **Where:** `/portal/agency/marketing?view=funnels` → Results
- **Evidence:** `_FunnelsWorkspace.tsx:698-711` — `rate = leads ? … : 0`, then headline
  tiles `Spend / Leads / Conversions / Rate ${rate}%`. An empty funnel shows "Rate 0%".
  The "manual until the tag supplies them" admission sits *below* the tiles, not on them.
- **Test to pin:** `scripts/smoke-marketing-funnel-builder.test.ts` — render `ResultsView`
  with an empty draft; assert Rate shows "—" and hand-typed tiles carry a manual marker.

---

## 🟡 IMPROVE

7. **Viewer roles see admin-only controls that will 403.** `InvoicesList` renders "Create
   invoice"/"Mark paid" for all viewers; NewPlanForm and budget-pot creation likewise,
   while the POST/PATCH routes are `AGENCY_ADMINS`. Security holds at the API; the UX is
   a dead button and an error toast. Plumb the session role into the plugin pages.
8. **Reports "Tax balance" clamps a reclaim to £0.00.** `ReportsPage.tsx` uses
   `Math.max(0, outputTax - inputTax)` — when recoverable tax exceeds charged tax, money
   owed *back* displays as zero.
9. **Overview pins every total to the currency of whatever record sorts first.**
   `FounderDashboardPage.tsx:38` — `invoices[0]?.currency ?? … ?? "gbp"`, then filters to
   it and silently drops the rest. ReportsPage does this honestly with a per-currency
   switcher; Overview ignores `resolveFinanceDefaultCurrency`.
10. **Payables aging overstates.** Aging uses `dueAt: expense.incurredAt`
    (`ReportsPage.tsx:56`), so a cost incurred yesterday lands in "1–30 days overdue".
11. **Operations hub cards carry no attention state.** The sidebar aggregates
    finance+fulfilment+marketing attention, but `operations/page.tsx` has zero attention
    imports — Ed sees "Operations · 3", clicks through, and finds ten unlit cards.
    Extend `scripts/smoke-operations-attention-rollup.test.ts`.

---

## ✅ VERIFIED HEALTHY (honest negatives — real handlers, isolated state)

**Finance.** Close-deal idempotency holds (same key twice → one contract, one invoice, no
duplicated money). Macro/micro integrity holds — the same invoice `INV-2026-0001` appears
identically in the agency ledger and the `?clientId=` scope. Totals reconcile across
Overview, Reports aging, Invoices and Planning. Bank transfer correctly records *no*
payment until money lands. The Plans native-form bug stays fixed (form-encoded POST → 400
`invalid_body`). Exactly one Finance sidebar entry. No NaN/undefined/Infinity rendered
anywhere. No secret material rendered — Stripe surfaces receive a boolean.

**Marketing/Operations.** No broken routes: all 6 live views, the demoted
`client-services`, every retired `?view=` value and junk fallbacks render, with the old
block landing first (anchor order verified at runtime). `/portal/agency/automations`
redirects correctly. The Operations hub has exactly 10 cards in delegation order, all
hrefs resolving. Pulse renders "—" plus "Nothing is connected to measure this yet" for
unmeasured KPIs and never recomputes numbers on-page. Attribution is genuinely
guess-then-confirm ("Matched on source key" vs "Suggested match — confirm"). The
data-source roster separates "Reading back" from "Sending only" — it states its own
blindness. Governance holds: non-owner/manager redirected; GDPR has no off-switch. No
stale copy ("portal studio", "Team chat", "four modes") anywhere in the cluster.

---

## What still needs a browser

Everything visual, for every cluster: console and network cleanliness, hydration
warnings, dark-mode contrast, mobile-width overflow, focus states, and the six clusters
that produced no report at all. Re-run with a **single** browser walker.
<!-- AQUACRM_SOURCE_END path="docs/development/findings/2026-08-22-app-audit-salvage.md" -->

---

<a id="source-docs-development-findings-2026-08-22-stripe-can-never-be-configured-md"></a>

## Source document — `docs/development/findings/2026-08-22-stripe-can-never-be-configured.md`

<!-- AQUACRM_SOURCE_START path="docs/development/findings/2026-08-22-stripe-can-never-be-configured.md" sha256="e91f13c8620f1d2bc27e189935b14c2a06f74c25ffc675096070b8b3909e227a" -->
# Finding — Stripe can never be configured; the error message points at a surface that does not exist

- **Status:** fixed
- **Closed by:** a GENERIC settings surface that renders whatever a manifest declares —
  `describePluginSettings` / `writePluginSettings`
  (`src/lib/server/plugins/pluginSettingsSurface.ts`), the
  `/api/portal/plugins/settings` endpoint, and `PluginSettingsPanel`
  (`src/components/workspaces/PluginSettingsPanel.tsx`), mounted on the finance Settings
  page. Password fields declare `secretVault: { provider, field }` and are written to the
  encrypted integrations vault, never to `install.config` (which reaches the browser
  through page props) and never echoed back; the registry validator now REFUSES a password
  field without a vault target. `installConfigWithSecrets`
  (`src/lib/server/plugins/pluginSecretConfig.ts`) merges the vault's values back under
  their manifest ids, so `stripeConfigured` / `readStripeKeysFromInstall` see them — wired
  through the finance stripe handlers, `InvoiceDetailPage`, `close-deal`, and the same
  three readers in `ecommerce`. Pinned by
  `scripts/smoke-plugin-settings-surface.test.ts`, whose first case is the contract this
  finding asked for, run over every registered plugin.
- **Severity:** high
- **Where:** `/portal/agency/agency-finance/settings`
- **Found:** 22 Aug 2026

## What I saw
The entire card-payment leg of finance is unreachable, and the two places that tell you
how to fix it send you somewhere that was never built.

**The chain.** The manifest declares `stripeSecretKey` and `stripeWebhookSecret` as
password fields in its `online-payments` settings group
(`src/built-ins/modules/agency-finance/index.ts`). But **no component anywhere renders a
plugin's `settings.groups`** — only `_validate.ts` and `_runtime.ts` reference them. The
sole `patchInstall` caller in `src/app` (`/api/portal/settings/route.ts`) writes only
currency, terms, tax and prefix. The finance Settings page renders install-state counts
and nothing else — verified by rendering it: *"Categories 6 · Draft invoices 0 · Plugin
id · Enabled"*.

**So `stripeConfigured()` is permanently false.** No pay-links. `invoices/checkout` and
`payments/refund` are unreachable by construction. And `readStripeKeysFromInstall` reads
only `install.config.stripeSecretKey` — it never consults the integrations vault's own
stripe mapping at `integrationConnections.ts:311`, so even a vault-connected Stripe does
not help.

**The dead end is user-visible.** `closeDeal.ts:64` and `stripe.ts:132` both tell the
operator to *"Set up Stripe in Finance settings"*. There is no such control. The docs
claim "Keys are Ed's (install config)" — there is no path to put them there.

**The fix, in shape.** Build the settings surface that renders whatever a plugin declares
in `settings.groups` and writes it. Secrets go through the encrypted vault path this
codebase already uses — never onto a record that reaches the client, and never echoed
back. Doing it generically means the next plugin's declared settings work for free
instead of repeating this.

**Test to pin it**
- Extend `src/built-ins/modules/agency-finance/src/__smoke__/finance.test.ts`, or add a
  settings-surface contract test: **every field id declared in a manifest's
  `settings.groups` must be writable through a real settings write path.** Today that
  test is red for both stripe fields — which is the point.

---
_Captured from the Dev Team portal. Findings are the input side: review them, turn them into a plan, hand the plan to a worker._
<!-- AQUACRM_SOURCE_END path="docs/development/findings/2026-08-22-stripe-can-never-be-configured.md" -->

---

<a id="source-docs-development-findings-2026-08-22-surfaces-that-state-a-falsehood-md"></a>

## Source document — `docs/development/findings/2026-08-22-surfaces-that-state-a-falsehood.md`

<!-- AQUACRM_SOURCE_START path="docs/development/findings/2026-08-22-surfaces-that-state-a-falsehood.md" sha256="dfeb4a6302c1e8feb092b99abe324a16107a2710eca6fd3ab104f699b3e3c133" -->
# Finding — four surfaces state something untrue: a measured zero, a demo session, a clamped reclaim, a guessed currency

- **Status:** fixed — **but it was reported fixed once while two of it were still live.**
  See "What was still live after the first close" below; both are now closed and pinned.
- **Closed by:** (1) `measuredCountLabel` (`src/lib/performance/telemetryDisplay.ts`) gates
  every count on the telemetry watermark, so a tag that has never reported renders "—" —
  applied to marketing's Views-today tile, to the two sibling surfaces telling the same
  lie (`_WebsiteWorkspace`, `_PerformanceWorkspace`), and (2026-08-22, second pass) to the
  **third and fourth**: the client workspace's monitoring tiles
  (`src/app/portal/clients/[clientId]/_ClientSystemsWorkspace.tsx`) and
  `_PerformanceWorkspace`'s own "Live errors" tile; (2) all THREE "not read in a demo
  session" claims now say "were not read in this session … a demo session or a failed read
  — not zero enquiries" (the third was `marketing/page.tsx:907`, not in the original
  report); (3) `taxPosition()` replaces `Math.max(0, outputTax - inputTax)` and labels a
  reclaim as a reclaim — **in `ReportsPage` AND, since 2026-08-22, in `FounderDashboardPage`
  (Overview), which the first pass missed**; (4) `FounderDashboardPage` resolves currency
  through `resolveFinanceDefaultCurrency`. Deposits (1c) also formats through `formatMoney`
  and names the client. Pinned by `scripts/smoke-truthful-surfaces.test.ts`.

- **Severity:** medium
- **Where:** `marketing?view=channels&channel=website · marketing?view=demand · agency-finance (Overview, Reports)`
- **Found:** 22 Aug 2026

## What was still live after the first close

Written down rather than quietly amended, because a findings board that says "fixed"
when it is not is worse than one that is behind. A regression verifier drove both.

- **The tax clamp was fixed on Reports and left on Overview.**
  `agency-finance/src/pages/FounderDashboardPage.tsx:253` still rendered
  `Math.max(0, outputTaxCents - inputTaxCents)` — the same two inputs, the same row, on
  the screen that gets looked at most. **Why it survived:** item 3 above named
  `ReportsPage.tsx` and the fix was applied to the file the finding named.
- **A THIRD unmeasured-count sibling was never gated.**
  `src/app/portal/clients/[clientId]/_ClientSystemsWorkspace.tsx:224` rendered
  `summary.pageviews24h` raw, three lines below its own "Waiting for first signal"
  banner. **Why it survived:** the same habit — item 1 named two siblings, so two were
  fixed. Closing it turned up a **fourth**, `_PerformanceWorkspace`'s "Live errors" tile,
  which no report had ever named.

**What changed so it does not happen a third time.** The pins are no longer
file-by-file. `smoke-truthful-surfaces.test.ts` now asserts the CLASS: no finance page
may contain a `Math.max(0, output… - input…)` of any spelling, and no surface in the
telemetry list may render `pageviews24h` / `errors24h` into a value slot ungated. The
fourth sibling was found by that check, not by a person reading the file.

## What I saw
Four separate places where the screen asserts something the system does not know, or
knows to be false. Grouped because they are one habit, not four bugs: **a value that was
never measured is being rendered as if it were.**

**1. A measured "0" for a site that has never reported.**
`marketing/page.tsx:479` renders `String(ownWebsiteSummary.pageviews24h)` unguarded.
On an agency whose Aqua Tag has never reported, the panel renders
`Views today = "0"` directly beside `Tag = "Waiting"` — it *knows* the tag is waiting and
still prints a measured-looking zero. `summarizeAgencyWebsite`
(`src/server/agencyWebsite.ts:244`) returns raw counts with no unmeasured channel.
Invisible on Ed's own data (his tag is connected, so his zero is truthful) — it lies to
every new brand and every future agency buyer before their tag is live. This is the same
rule Radar is held to: **unmeasured is "—", never 0.**

**2. A real founder told they are "in a demo session".**
`_MarketingCommandSurfaces.tsx:295` and `:366` hardcode the demo explanation for
`available: false` — but `marketingIntelligence.ts:121` defines that flag as "the caller
did not read them", for *any* reason. Confirmed at runtime with a genuine non-demo owner
session whose `listWebsiteEnquiries` call failed (Supabase unreachable — precisely what a
production outage looks like): both panels rendered *"Website enquiries are not read in a
demo session…"*. The copy asserts a false cause and sends the operator hunting for the
wrong problem. The pulse spine tile already handles this state honestly with "Not read in
this session" — copy that wording.

**3. A tax reclaim displayed as £0.00.**
`ReportsPage.tsx` uses `Math.max(0, outputTax - inputTax)` in both the metric and the
"Recorded tax balance" row. When recoverable tax exceeds charged tax — money owed *back*
— the truthful state is clamped to zero. Show the reclaim.

**4. Every total pinned to the currency of whatever record sorts first.**
`FounderDashboardPage.tsx:38`:
`invoices[0]?.currency ?? expenses[0]?.currency ?? plans[0]?.currency ?? "gbp"`, then
every aggregate filters to that currency and silently drops the rest. One stray USD
invoice sorting first flips the whole dashboard to USD and hides all GBP money with no
indicator. ReportsPage already does this honestly with a per-currency switcher, and
`resolveFinanceDefaultCurrency` exists — Overview just ignores it.

**Tests to pin them**
- `scripts/smoke-marketing-view-consolidation.test.ts` — render the website channel with
  `telemetryLastSeenAt: null`; assert "Views today" renders "—"/"Waiting", never "0".
- `scripts/smoke-marketing-intelligence.test.ts` — render both panels with
  `enquiries.available=false` and a **non-demo** session; assert the copy never claims a
  demo session.
- Finance smoke — a reports unit with `inputTax > outputTax` asserting the rendered value
  is not £0.00; and a mixed-currency fixture asserting Overview aggregates on the
  configured default, not on `invoices[0]`.

---
_Captured from the Dev Team portal. Findings are the input side: review them, turn them into a plan, hand the plan to a worker._
<!-- AQUACRM_SOURCE_END path="docs/development/findings/2026-08-22-surfaces-that-state-a-falsehood.md" -->

---

<a id="source-docs-development-issues-md"></a>

## Source document — `docs/development/issues.md`

<!-- AQUACRM_SOURCE_START path="docs/development/issues.md" sha256="6378e18532ac7d26f2f910307eb01dc2233d86b0012411014c907b0849e16f85" -->
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
<!-- AQUACRM_SOURCE_END path="docs/development/issues.md" -->

---

<a id="source-docs-development-tests-md"></a>

## Source document — `docs/development/tests.md`

<!-- AQUACRM_SOURCE_START path="docs/development/tests.md" sha256="ff95a4f0ff655a45acc4cf855e971cd4f106b6deb711d4d92c74c273bc8c93d0" -->
# Tests

← Back to [development.md](../development.md) (the law)

How testing works here, and what's covered. **Run the full suite before calling
any behaviour change done** (CLAUDE.md contract — adjacent suites miss contract
tests that pin old behaviour).

## The canonical command
```bash
npm run smoke:all
```

Its pinned expansion is:

```bash
PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' \
  node --import tsx --test scripts/*.test.ts \
  'src/built-ins/modules/!(website-editor)/src/__smoke__/*.test.ts' && \
  npm run smoke:website-editor
```

The first process covers every script test and every non-Website-Editor module
suite. The separate Website Editor runner deliberately uses client-capable React
conditions. `PORTAL_BACKEND=memory` keeps stateful tests off the live sandbox.

> The final canonical `npm run smoke:all` Node phase executed **6,474 tests across
> 1,096 suites: 6,472 passed / 0 failed / 2 skipped in 84,567.504209ms**; the
> subsequent Website Editor gate passed **49/49 files in 9.3s**. The browser/build
> evidence below is local or isolated-production evidence, not deployed-provider,
> cold-machine or broad mounted-human acceptance.

## 2026-09-02 current source-freeze focused evidence

- PortalState atomicity, post-commit ordering and lease fencing pass **17/17**.
- Canonical Staff policy plus Portal Studio update-route proof passes **18/18** in
  the direct rerun; the wider authored Staff policy gate remains **35/35**.
- The sample-preview correction passes **29/29** focused and **111/111** across
  editor, tenancy and access: the sample loads only through template scope, every
  client mutation is refused and no client or portal-instance row is created.
- Website Editor public visitor/publication proof passes **20/20**. The exact
  settings/lifecycle slice passes **26/26** and the full Website Editor runner is
  tracked separately as **49/49 files**.
- Affiliate module plus onboarding/dependency proof passes **32/32**; Membership
  plan-price provisioning passes **11/11**.
- The final Actions gate passes **54/54**. The post-review Memberships aggregate
  passes **65/65**, the adjacent Memberships/company/Ecommerce gate is **90/90**
  and their complete changed-surface gate is **145/145**. TypeScript/diff pass and
  the independent review found no remaining source defect.
- The final named checked-read source cohort passes **54/54**. Membership/Affiliate
  parent dependency proof passes **28/28**; the dedicated SOP dependency/writer gate
  passes **22/22**, within the documented wider SOP/dependent-domain **52/52** gate.
- The transactional owned-sidecar RPC, one-statement hydration snapshot, receipt
  replay/reconciliation and malformed-envelope boundaries are source/mocked verified.
  The migrations have not been applied to live PostgreSQL, so this is not remote-
  database concurrency acceptance.
- These focused gates are supplemented by the final browser evidence below and the
  final canonical repository aggregate recorded above.

## 2026-09-02 Actions and Memberships exact-build browser evidence

- Production build `bcNH7NEvlzmp6z1VXtmch` compiled with webpack in **79s**,
  completed TypeScript in **41s** and generated **245/245** static pages in **416ms**.
- Playwright Chromium 151.0.7922.34 passed **40/40** acceptance stories, **10/10**
  at each of **390×844, 768×1024, 1024×768 and 1280×800**. Actions covered
  malformed responses, lost-success replay, stale retries, deterministic receipts,
  retained failed work and settled busy state. Memberships covered settings save/
  reload, default trial, annual disablement, exact stable-operation/provider binding
  across two POSTs, and billing refusal then success.
- Unexpected console errors, page errors, request failures and HTTP failures were
  all **0**. The four intentionally stale task retries returned their expected 400s
  and were consumed by the harness. Document overflow was **0** at every viewport;
  document widths were exactly 390/768/1024/1280 and the Actions/settings content
  widths were exactly 390/528/784/1040. The 768px Actions card was polished to keep
  the full long title on one line with controls beneath, then rebuilt and rerun.
- The before/after source hash stayed
  `48faed5626dca1e6b4be93a3d8351af9419843c496e0e7edadc5839415819511`;
  all 37 retained `.data` files stayed
  `ceee5d10a6b0fbc4e6a9a784719534bb64e698fe59351ee40212756cd1a04cfa`,
  and the canonical state file stayed
  `da5a5d8d17d0243e8afe302ad07d15d14dffcab244a544b7e79bdf8f49b8913d`.
  This is exact local production-build evidence, not live Stripe acceptance.

## 2026-09-02 private-upload replay and ownership evidence

- Private-object lifecycle **33/33** proves exact provider/key/cardinality binding,
  explicit claim-id fencing, same-claim replay, safe exact release and ambiguous-claim
  retention/recovery marking.
- Agency Finance **39/39** proves exact expense create intents, server-derived canonical
  attachment URLs, authoritative replayed attachments and exact claim release when a
  deterministic create/update refusal occurs before the owner write.
- Meta reply **6/6** proves payload-bound operation ids across both mounted inbox
  implementations, server/store replay checks and known-owner lifecycle recovery.
- Dedicated owner-binding and route regressions cover campaign exact asset identity and
  pre-write refusal handling, website/client malformed and duplicate token rejection,
  exact signed provider/key matching and client workspace-busy claim release.
- The complete changed-surface gate is **85/85**. At that private-upload checkpoint
  the repository run was
  **6,243 tests across 1,074 suites: 6,241 passed / 0 failed / 2 skipped**;
  Website Editor is **49/49**, and the production build generated **245/245** pages
  after a **43s** compile and **11.4s** TypeScript phase.
- These are focused local proofs. Live Supabase/Vercel Blob/local-production providers,
  real process-kill/multi-process database leases, mounted forced-failure/retry,
  automatic retained-claim operator reconciliation, direct call-recording ambiguity
  and the separate SOP-retirement policy remain open under issue #38.

## 2026-09-02 local production speed and browser evidence

- `perf:production` built a fresh isolated webpack output in **158,476.1ms**
  (**1,584,943,643 bytes**) and started a new Node/Next process for every target.
  Readiness was TCP-only (**304.3–309.1ms**), so each named route was that process's
  first HTTP request before three immediate repeats:

  | Target | Fresh-process first HTTP | Repeat max |
  |---|---:|---:|
  | `/api/auth/me` | 765.9ms | 9.2ms |
  | public home | 641.4ms | 6.0ms |
  | Agency | 949.4ms | 53.1ms |
  | Dev Team | 869.2ms | 38.9ms |
  | Library | 803.6ms | 30.4ms |
  | Logs | 892.8ms | 30.7ms |

  Every response was 200 and every failure list was empty. Build and host
  filesystem/page caches were shared: this is fresh-process evidence, not a cold
  machine, deployed CDN/edge or live-provider result.
- `perf:station-chunks` authenticated once, then used a fresh cacheless,
  service-worker-blocked Chromium context per station and passed **8/8**. Agency
  Day transferred **674,535B** of first-navigation JS/CSS. Extra transfer versus
  Day was Executive **4,473B**, Battle **36,102B**, Calendar and Actions
  **42,174B** each, Advisor **12,528B**, Dev Team **21,059B** and Radar Inspector
  **34,731B**. These are network transfer bytes, not JavaScript execution or paint
  budgets. The corrected filesystem baseline reports **8,258,688B** of static
  chunks with an **862kB** largest chunk; its path-with-spaces regression prevents
  the former false zero.
- The broad production-target browser matrix used Chromium **151.0.7922.34** over
  13 pages × 17 viewports and accounted for **1,326** checks as **1,177 passed /
  0 failed / 149 observations / 0 missing**. The post-authentication-fix Settings
  run accounts for **102** checks across 17 viewports as **92 / 0 / 10 / 0**.
  Authentication is bootstrapped once and isolated storage state is reused; the
  app's login limiter was not weakened. Every observation is an evidenced aborted
  speculative Next RSC prefetch.
- The exact final browser probe is **6/6**: Settings Environment at 768px, Portal
  Studio at 390/1024/1440, and Fulfilment Roles at 390/1280 all return 200, match
  the viewport width and have no console, page, request or HTTP error. Studio sends
  only a template-scope sample API 200 and keeps Publish in view. Fulfilment exposes
  **11** element radiogroups and 11 each Hidden/View/Use/Manage plus Projects,
  Portals and Aqua Tags. The probe's recorded source hash was unchanged.
- A separate browser roundtrip created a reusable role, saved Projects as Manage,
  reloaded, downgraded it to View, reloaded and archived it without browser errors.
- The isolated-production Staff Technical matrix passed **50/50** through six same-
  cookie Hidden → View → Use → Manage → View → Hidden transitions with zero failures,
  errors or overflow. Hidden pages render valid streamed Next not-found content and
  may therefore carry document HTTP 200 or 404; the exact downgraded API returned 403.
- Fulfilment checked-mutation acceptance passed at **390px and 1280px**: an injected
  refusal showed an alert, avoided reload and false success, rolled back or retained
  the affected state as appropriate, and succeeded on retry.
- Provider deadline/outcome contracts are deterministic local adapter proof. Real
  provider credentials were deliberately not used; live provider, deployed
  geography/CDN and production telemetry timings remain operational acceptance.
- The final primary production webpack build compiled in **47s**, completed
  TypeScript in **5.1s** and generated **245/245** pages in **489ms**.

## 2026-09-01 final hardening evidence

- Final focused gates are green: private-object lifecycle **31/31**, Legal
  dependencies **21/21**, SOP dependencies **18/18**, checked mutations **25/25**,
  Dev document/cross-process recovery **29/29**, durable Dev production workspace
  **7/7**, client/workspace/Postgres composition **7/7**, interactive reads **14/14**,
  Website Editor visitor proof **27/27**, and public-route host/tenancy proof
  **50/50**.
- The shared checked-mutation helper makes 5xx bodies opaque, filters unsafe
  client-facing diagnostics and requires strict action-specific Finance/Dev
  success payloads. Lifecycle tests cover sweep/adoption exclusion, persisted
  destructive intent, claim-before-owner ordering, unflushed owner survival,
  sanitised delete checkpoints and retry-only reads.
- A fresh Agency Settings pass across the six primary viewports is **36/36**
  with zero failures or observations: no overflow, clean console/network,
  visible keyboard focus and no serious/critical axe finding. This is a visual
  slice, not the outstanding cross-persona mutation/failure/screen-reader walk.
- The final production matrix used Chromium **151.0.7922.34** across 13 pages ×
  17 viewports and accounted for all **1,326** required checks: **1,175 passed,
  0 failed, 151 observations and 0 missing**. Every observation was an explicitly
  proven aborted speculative Next RSC prefetch, not an ordinary request failure.
- The final deterministic local production build compiled in **51s**, completed
  TypeScript in **17.3s**, generated **245/245** static pages and took **96.47s**
  wall time. This is local build evidence, not a Vercel deployment.

New preview suite (2026-08-27): `scripts/smoke-local-preview-worktree.test.ts`
(`npm run smoke:preview-worktree`, **21/21**) — drives real `git` and real
install processes against real temporary repositories to pin the phase-17
lifecycle head: worktree create, resume-with-uncommitted-edit-retained,
two-project isolation, prune recovery, the refusals that must never delete an
operator's files, install-once-then-skip with lockfile fingerprinting, install
failure/timeout/missing-runtime fail-closed behaviour, and the refusal to run a
dependency install into the shared checkout.

New security suite (2026-08-27): `scripts/smoke-session-revocation.test.ts`
(`npm run smoke:session-revocation`, **16/16**) — replays old cookies against
the real external-AI exploit route and `requireRole()` surfaces after
downgrade / password rotation / explicit rotation / deletion, and pins the
sandbox/demo/showcase anchoring semantics of the central fresh-session
boundary (issue #22).

Latest broad **non-security** checkpoint, 2026-08-24: the 13 files explicitly
centred on authentication, MFA, sessions and their direct gates were excluded;
the remaining smoke set ran with the memory backend and passed **3,428 / 3,428
executed tests across 620 suites**, with the same one missing-`DATABASE_URL`
Postgres skip. This is not labelled a whole-suite result and is not browser
acceptance. The exact scope is in
[ultra-review-2026-08-24.md](ultra-review-2026-08-24.md).

Latest real-browser checkpoint, 2026-08-25: an isolated pass reconciled all 110 page files and
rendered the broad public, agency, client/plugin, customer, editor, Dev Team, seeded staff and
freelancer route sets plus a representative 1280/768/375 viewport matrix without changing shared
CRM state. It found #151–#153 and browser-proved the then-existing staff Chat failure (#25),
avatar-name gap (#139), Freelancer desktop overflow (#137) and Finance render mutation (#21).
Those four concrete defects plus the #153 route crash were repaired later that day. The pass did
not submit forms, save, delete, call
providers or prove a true client-owner/client-staff persona, so it supplements rather than replaces
behavioural and end-to-end tests. Exact routes and limits are in the ultra-review ledger.
The #151 bounded-index code was repaired on 2026-08-26; its then-pending Home re-timing was
completed by the 2026-08-27 checkpoint immediately below, while the wider Dev route matrix remains.
The documentation reconciliation that recorded it passed **238/238** focused documentation/Dev-Team
tests, including the byte-identical real-roadmap round-trip.

Latest completed speed-engineering checkpoint, 2026-08-27: this is a focused source/runtime/
browser evidence set, not a new whole-suite result and not one interchangeable clock.

**Isolated production benchmark.** `scripts/benchmark-production.mjs` built with Webpack into a
unique dist and disposable file realm, then started a separate Node/Next process for each target.
Readiness was TCP-only and sent no HTTP; the named target was that process's first HTTP request,
followed by three repeats. The build and host filesystem/page caches were shared and not flushed.

| Target | Fresh-process first HTTP | Repeat max |
|---|---:|---:|
| `/api/auth/me` | 619.1ms | 7.7ms |
| public home | 593.1ms | 9.8ms |
| Agency | 727.8ms | 28.3ms |
| Dev Team | 726.4ms | 31.2ms |
| Library | 693.0ms | 26.4ms |
| Logs | 741.0ms | 29.0ms |

Webpack built **281 pages in 135,196.3ms** and the output tree occupied
**1,479,314,365 bytes**. Process readiness ranged **205–308ms**. Every listed response was 200
and within the configured payload budget. The dist size is filesystem footprint, not response
transfer. The harness restores/deletes `next-env.d.ts` only if the current file exactly matches
the bytes its own build generated; otherwise it preserves the concurrent edit. Cleanup validates
the benchmark dist prefix and removes only its disposable dist/data/config unless `--keep` is set.
The three deterministic next-env ownership cases cover exact restore, previously absent file and
concurrent modification.

**Local development runtime.** The retained Agency baseline was about **3.8s compiler + 315ms
application work cold** and **784ms warm**. Its final static proxy import closure later measured
**1,139,995→255,050 bytes (-77.6%)**, but a concurrent external `tsconfig` alias blocked a clean
post-change runtime sample; that delta is static evidence only. Library measured
**4.428→3.290s cold / 146→142ms warm**. Logs measured **3.182→0.857s first** and
**2.702→0.868s after TTL**, with a later warm **109ms TTFB / 252ms total** versus the earlier
216ms sample. Its eager graph changed **47 modules / 469,232 bytes → 3 / 15,433**. The canonical
Library scan changed **67.6→1.0ms** and Logs activity scan **95.4→38.5ms**.

**Focused behavior and source contracts.** Library loads only the selected query view, streams an
explicit fallback, scans only the 20 canonical documents and coalesces concurrent cold reads.
Logs streams before scanner/edit-ledger imports, retains exact totals in a compact DTO and
coalesces its activity index. Provider tests exercise never-settling and late-accepting adapters,
caller cancellation, credential-free telemetry, Sandbox zero-network fences and safe/same-key/
reconcile-first recovery for `outcomeUnknown`. Alternating live→empty/demo→live cache regressions
cover Radar sources/results, Portal Search candidate families and Dev Console core/status slots;
Search additionally proves access-revision/effective-element filtering for restricted Staff.
The selected production-harness, Library/Logs, provider/deadline, Radar/Search/Dev cache and
adjacent Radar/KPI gate passes **76/76** with the inherited React server condition. This focused
total is not the full repository suite.

The adjacent Editor AI provider/realm gate passes **35 tests with 1 optional live-Postgres skip**.
It exercises realm-separated ids/dedup/claims, zero-network writable Sandbox generation,
never-settling/ambiguous provider outcomes, fresh durable-state reconciliation and a simulated
post-provider flush failure that must not make a warm reply look durable. The skip is still the
independent-process database contract without `DATABASE_URL`; these deterministic cases do not
replace deployed OpenAI or Postgres acceptance.

The final combined code release gate passes **335 / 0 fail / 1 expected live-database skip** and
the full TypeScript check passes. It is the closing selected gate for this speed/reliability wave,
not a rerun of every repository test. At that speed checkpoint, the prior complete-suite record
was 2026-08-23; see the top of this file for the current whole-suite result.

**Mounted browser.** At 1280px, a fresh Agency Day settled with no loading/overflow and visibly
showed `RADAR PAUSED`, `NOT SCANNED` and two `UNKNOWN` values; `BUSINESS WATCH CLEAR`, `ALL CLEAR`
and deterministic-fallback copy were absent. Battle settled at `?station=battle` with its content
region visible. Library rendered its heading. Logs rendered the shell heading first, then
`Where work is happening` streamed into view within five seconds. At **390×844**, Logs, Agency Day
and Battle matched the 390px document width, rendered content and had no loading/overflow. The
browser warning/error log remained empty throughout. This mounts the **49/49 + TypeScript** paused
Radar/KPI/Advisor/client-attention correction: no completed scan stays unknown/not scanned, while a
completed loaded zero remains zero. Deployed geo/CDN/provider latency, full roles and accessibility
remain separate acceptance. Completed station links currently retain `scan=1`, which can rerun
until a safe server-issued result token replaces it. The 2026-08-23 whole-suite result above
was the prior complete-suite proof at that speed checkpoint; see the top of this file for the
current whole-suite result.

**Portal loading presentation.** The Agency boundary and major streamed dashboard, Library/Logs,
Actions, Advisor and Automations fallbacks now use one accessible `role="status"`, polite-live
loading surface instead of placeholder blocks. Route-scoped loads occupy only the content viewport
and preserve the sidebar/topbar; a full workspace change uses the fixed viewport underlay. The
same structure changes palette only: normal luxury navy, Command cyan/near-black, Dev Team
gold/midnight and client/customer marine. The 110ms threshold suppresses fast-navigation flashes;
a loader that was genuinely visible exits through a 460ms split curtain. Reduced-motion mode
disables both spinner rotation and the curtain, and cinematic layers at `z-index` 10000+ stay above
the loader/curtain.

The final relevant gate passes **127/127**: **53** normal-runtime loader, Command, customer and
theme checks plus **74** React-server Dev performance/Library, customer snapshot, navigation,
route-contract and shared-graph checks. Full TypeScript passes. This remains a focused gate, not a
whole-suite result. Mounted browser evidence at 1440×900 measured the Dev Team content loader at
`x=240, y=60, 1200×840`, preserving the surrounding chrome without overflow. At 390×844 the
full-workspace underlay measured exactly 390×844 without overflow. The two curtain halves reached
`translateX(-102%)` and `translateX(102%)`, the curtain then unmounted, and the browser
warning/error log stayed empty.

Latest non-security documentation checkpoint, 2026-08-26: focused Ecommerce source/service/package
proof passes **39/39** and the widened Membership/Affiliate/Ecommerce set passes **81/81**.
Documentation/Dev-Team parsers pass **231/231**. Regenerated source references now cover **2,158
files / 7,543 symbols**, and a fresh local-link scan checks **20,277 relative links across 2,295
Markdown files with 0 missing targets**. This is not a whole-suite, real-Stripe or browser-journey
claim; later focused Advisor, Performance and Countdown evidence is recorded in the rows below.

Latest product-workspace concurrency checkpoint, 2026-08-25: real agency-board, client-process
and portal-workspace handlers pass **8/8** for convergence, stale 409s, lossless retry and atomic
collection/file visibility. A separate **4/4** suite launches independent Node processes against
one isolated file backend after both preload the same stale revision; it proves one edit/stage
winner, one explicit conflict, lossless retry, unsplit file visibility and fresh-state behavior
for request, approval, payment-plan and record ledgers. The wider focused gate passes **77/77**,
TypeScript/diff is clean and an isolated build generates **271/271** entries. Database lease
adapters and migration are source/type/build verified but still require deployed Supabase/
Postgres acceptance; no mounted browser or shared-state mutation is claimed.

## ⚠ What a green suite proves — and what it does NOT (read this)
**A passing test ≠ a working feature ≠ a usable feature.** Most tests here are
**static-source contract tests**: they `readFileSync` a module and assert on its
*content/shape* (a function exists, a string is present, a wiring is declared).

A green suite proves:
- ✅ the code has the expected **shape** and hasn't structurally regressed;
- ✅ **pure logic with real unit tests** computes correctly (e.g. `company-health` scoring → overall 34, radar lens evaluation, resolution classification).

It does **NOT** prove:
- ❌ the feature actually **runs** at runtime — a static test passes even if the component throws when rendered;
- ❌ the feature is **wired end-to-end** — that API ↔ state ↔ UI actually connect;
- ❌ a real user can **reach and use** it — it may sit behind a dev flag, need missing credentials, or be a half-built wizard.

Runtime proof comes only from **running it**: the `.mjs` HTTP harnesses (need a
live server) or clicking through the app. The honest per-feature reality —
what's actually usable vs. coded-and-static-tested — is in **[status.md](status.md)**.
The generated docs (symbol map, file docs) share this limit: **they were parsed
from source, not run.**

## The convention
- `node:test` run through **tsx** (no Jest/Vitest). `scripts/` is excluded from tsconfig — tests only run under tsx.
- Most are static-source contract tests (above). They pin structure, so a refactor that changes a literal can fail a test that's really still correct — read the assertion before "fixing".
- **308** top-level `scripts/*.test.ts` files as of 2026-08-24, grouped by domain
  (radar, inbox, attention, products, connections, auth, finance, enquiries,
  people, command-centre, assistant, website/editor, fulfilment, platform).

## ⚠ Gotchas
- **7 files omit the `smoke-` prefix**, so `npm run smoke:all`'s narrow glob misses them (the `*.test.ts` full-suite glob catches them): `company-health`, `client-aqua-health`, `client-marketing-service`, `client-workspace-navigation`, `hiring-capacity`, `attention-protection`, `inbox-attention-thread`. **Always run the full `scripts/*.test.ts` glob**, not `smoke:all`.
- `audit-*.ts` files (e.g. `audit-alert-families.ts`, `audit-judgement-evidence.ts`) are **read-only diagnostics** — run manually (`npx tsx scripts/audit-*.ts`), print tables, are not pass/fail tests.
- **`verify-marketing-runtime.ts` is an in-process runtime harness**, not a suite test: `PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server' npx tsx scripts/verify-marketing-runtime.ts` (29 documented checks). It builds a fresh agency + a **real** Radar and command-intelligence snapshot, so it proves the marketing spine *runs*, not just that it is shaped right — it caught a fabricated-zero bug the synthetic-fixture tests structurally could not. It stays out of the suite because it calls `ensureHydrated({ fresh: true })` and the suite runs files **concurrently in one process**, where a state wipe pollutes other files. **This is a good pattern to copy** when a module's real path is only exercised at render time.
- HTTP/e2e `.mjs` harnesses (`smoke.mjs`, `post-deploy-smoke.mjs`, `smoke-perf.mjs`, `smoke-postgres.mjs`) need a live server.

## ⚠ Writing a CONCURRENCY test (read before you trust one)
`await Promise.all([handler(req), handler(req)])` **does not actually race** in one Node process.
`req.json()` is a macrotask and everything after it (in-memory storage `get`/`set`) is microtasks,
which drain fully before the next macrotask — so the first call runs start-to-finish before the
second resumes, the check-then-write window never opens, and **the test passes on the broken code.**
This bit for real: the first version of the finance double-click test passed with the fix reverted.

Wrap the storage so every op awaits a macrotask (`await new Promise(r => setTimeout(r, 0))`) before
delegating — that restores the read→write window a real server has. Reference: `racingWorld()` in
[`smoke-finance-idempotency.test.ts`](../../scripts/smoke-finance-idempotency.test.ts).

**Always mutation-check a safety test:** revert the fix and confirm the test fails, and fails for the
right reason. If it still passes, you haven't reproduced the bug — you've written a test that agrees
with whatever the code does.

**Test files DO run in separate processes** (`node --test` spawns one per file), so `process.env` and
other process globals do **not** leak between them — registering a module-level singleton in a test
file is safe. What genuinely crosses files is the **filesystem** (`.data/portal-state.json`,
`.next-*`) and ports.

## What's covered where (verified inventories)
- **Radar / attention / resolution** — the most heavily tested area; every radar/attention/action-classification/evidence test and exactly what it asserts is inventoried in the [Radar dossier §11](../workspace/radar.md).
- **Aqua Tag** — `smoke-aqua-tag-detection`, `smoke-consent-capture`, `smoke-website-sources`, `smoke-enquiry-dedupe`.
- **This session's new features** — `smoke-portal-connections`, `smoke-customer-setup`, `smoke-client-erasure`, `smoke-enquiry-dedupe`, `smoke-website-sources`.
- **Full per-file list** — every test file with its exported symbols is in the [scripts symbol reference](../reference/scripts.md).

## Current gaps that a green suite does not close

- The broad 2026-08-24 non-security result still does not establish browser
  acceptance. Its current matrix is in
  [ultra-review-2026-08-24.md](ultra-review-2026-08-24.md).
- Production build is now an independently passing gate. The Dev Projects `GET`
  requires `NextRequest`, direct callers supply one, the route-contract smoke pins
  the signature, and the final primary deterministic local build compiled in
  **47s**, completed TypeScript in **5.1s** and generated **245/245** static
  pages in **489ms**. Keep this local-only gate separate from ordinary
  `tsc`/smoke checks and from deployment acceptance. → issue #27.
- Staff Team Chat now passes `src/proxy.ts`, and selection/poll/send results are
  bound to the latest operator intent. The broader Staff policy now has one
  systematic proxy/navigation/page/API/Portal Studio regression: direct **18/18**
  and wider **35/35**. Role create/Manage-save/reload/View-downgrade/reload/archive
  is browser-proven. Staff Technical enforcement and same-cookie downgrade are
  isolated-production-browser proven **50/50**; only provider-backed live-persona/
  shared-credential acceptance remains under #25, while the separate Team Chat
  response-order acceptance remains under #147.
  → issues #25 and #147.
- The Command Centre performance test asserts that performance mode OFF runs the
  expensive path and ON pauses it; it is a policy/shape test, not a response-time
  acceptance result. → issues #21.
- Read/render purity now has a source-derived declared-and-ruled regression rather
  than an unmaintained prose count. It classifies callbacks, cron work, audit stamps,
  first-touch seeders and the remaining operational writes and refuses new unruled
  causes. The remaining classified causes are still product/performance debt; the
  guard is not evidence that they were removed. A prior pass found **28 non-auth API
  GET handlers and 26 rendered page/layout files** that could reach `mutate()`, spanning
  intentional callbacks/cron work and incidental
  plugin provisioning, automation execution, materialisation, sweeps, read-state and
  tracking writes. Opening demo Finance in the fenced browser persisted
  `ukDefaultCurrencyV1`, proving this is not only call-graph theory. Tests should
  classify intended exceptions and fail new unclassified read/render mutation paths.
  → issues #21.
- `smoke-app-route-tenancy` checks each whole file for any occurrence of the scope
  helper or `session.agencyId`; it does not prove each method and client-id field is
  validated. Performance Experiments GET uses the helper while POST stores the raw
  body id. An isolated memory-route probe supplied another agency's real client id;
  POST returned **201** and persisted the foreign reference. Generic Plugin Settings
  also combines `session.agencyId` with a raw body/query client id; a second isolated
  probe returned **200** and created a Stripe connection carrying the foreign id.
  A broader isolated memory-store probe persisted an unknown task assignee,
  checklist SOP, product company/included-product/SOP ids, KPI company bucket and
  freelancer job override; task client/top-level SOP ids were correctly removed,
  confirming field-specific gaps. Add route-level behavioural tests for every
  semantic reference using missing, same-agency and foreign ids, including Inbox
  Connection company/marketing-asset fields. Agency Finance needs the same coverage
  for expense/income client ids, expense staff ids, invoice/budget/obligation/profile
  company ids, obligation legal-document ids and compensation staff/department ids.
  Its existing isolated Finance suites pass **5/5** while operation fixtures store
  unseeded legal-document and department ids. A fresh-process service probe also
  persisted missing HR staff/department and nested assignment relations; Marketing
  campaign/lead/content/touchpoint plus asset/profile company and funnel-project
  relations; Leads Pipeline campaign company/profile/budget/audience relations;
  Client CRM end-customer/segment, Membership plan-benefit and Email Sender client
  links; a Team Chat member and a Task Template SOP. Source also carries an unresolved
  lead company through conversion into the new client;
  the focused four-module suites pass **82/82**, including fixtures with arbitrary
  lead/budget references. Add the same missing/same-agency/foreign matrix for custom-
  KPI operands, Custom AI owners, Development resource references and People manager/
  training-SOP fields already reproduced in isolation. Current tests preserve rather
  than reject or explicitly define this behavior. Extend the matrix through deletion:
  the same probe removed an HR department/role, Marketing campaign, Client CRM segment
  and Membership benefit while staff, child-department, lead, content, touchpoint,
  contact and plan rows retained the deleted ids. Add cross-plugin deletion cases for
  Marketing profile → Leads campaign and Marketing asset → Inbox routing as well.
  → issues #20.
- Stripe refund/dispute delivery now has independent file-process race and fresh-
  reload proof. Deterministic provider identities leave one row and one side effect
  for each event family (**4/4**); live signed Stripe acceptance remains separate.
  → issue #26 resolved.

- Whole-class session revocation is now behaviourally pinned: old real cookies are
  replayed after downgrade, password/session rotation and deletion across central
  session/role consumers, with Sandbox/demo/showcase anchoring included (**16/16**).
  Live mounted downgrade acceptance remains. → issue #22 resolved.
- Showcase coverage now pins the known mutating GET/OAuth/materialisation capability
  list, ordinary mutations and physical public/private realm isolation. Every new
  read-side mutation still needs classification, and the broader read/render debt is
  tracked separately under #21. → issue #23 resolved.
- Erasure failure coverage now forces all three hosted deletes to fail, proves the
  local client/records remain, checks retryable HTTP 502 plus de-identified durable
  audit, then retries to completion; the wider erasure/governance chain is **53/53**.
  Provider-backed acceptance remains. → issue #24 resolved.
- File persistence acknowledgement, corrupt-state recovery and atomicity lack
  regressions. Isolated probes now prove both failures: `EISDIR` was detached while
  flush resolved/backend stayed writable, and malformed JSON hydrated empty then was
  overwritten by the next mutation. Convert those probes into permanent tests. →
  issues #16–#17.
- Editor AI needs a genuine two-instance database test. The focused **56/56**
  suite plus the newer distributed-claim regression prove stored replay,
  same-process behaviour and the in-memory lease state machine, not the live
  production database contract described in issues #18.
- Website-editor tests do not reconcile client request URLs with the registered
  route table. The visible Funnels and Split controls target missing families;
  publish/promote and ten `SitesPage` endpoint families use legacy or mismatched
  paths, while several implemented handlers sit under the module namespace. The
  registered promote handler is itself a pending stub, and no test requires a real
  branch/commit/PR or `prUrl`. The AI status probe hides the top-bar action but no test
  notices that image variations/inpaint remain visible and call absent routes. Add a
  class-level route-resolution/capability test plus durable
  handler outcomes, then browser-prove create/save/publish/promote/reload. → issues
  #28.
- Published functional-block coverage now includes narrow anonymous backend proof
  for Contact, Blog Feed/detail and Ecommerce. Contact binds affirmative consent to
  the digest of the exact displayed statement and persists one exact-install
  receipt/submission. Blog Feed/detail return published allowlist DTOs, and Blog Post
  renders the body through the host child renderer with finite depth/node/JSON limits
  and no recursive Blog Post mount. Ecommerce exposes allowlisted catalogue/detail/
  quote/checkout/receipt operations. Publication proof freezes the complete visitor
  view — blocks, page metadata/classification/privacy, exact theme, custom code,
  layout, SEO, redirects and locales — until republish, including legacy migration
  and revert. The dedicated visitor/publication gate passes **20/20**, the complete
  Website Editor runner passes **49/49 files**, and the executable registry now pins
  **342 total / 145 undeclared / 16 public routes**.
  This still does not provide Forms, Booking/Reservations, Newsletter or Theme
  backends, connect Contact submissions to their intended operator workflow, resolve
  Affiliate Leaderboard/Signup promises, distinguish Membership API failure from a
  genuinely empty plan list, or prove Donation's monthly choice creates a
  subscription rather than the same one-off checkout. Add mounted anonymous and
  custom-domain/provider proof for every retained published promise. → issue #29.
- Website export coverage exercises the narrow static renderer directly with
  heading/button/image primitives and calls `handleExportSite()` in isolation. It
  never resolves the visible Customise button's `/api/admin/export-code` request,
  never proves the separate handler is registered, and never exports a first-party
  template. A direct Homepage-template run produced empty Hero, Product Grid,
  Testimonials and CTA shells. Add route-table coverage and live-vs-exported
  content/visual parity across representative publishable blocks. → issue #30.
- There is no integration coverage for the Website Editor's browser-local admin
  stations. No test proves that a site created or marked live in the main Sites page
  enters the server store, routes by its chosen hostname, or survives into another
  browser: those operations use `lk_sites_v1` while host APIs use `server/sites.ts`.
  No test proves Sections changes a storefront, Popup ever mounts, Customise
  branding/sidebar/tabs/login values reach a shell or public form, or the registered
  Page Detail route resolves and publishes a page. Source also shows a
  `[pageId]`/`params.id` mismatch and no `/p/[slug]` route. Add server-store contract,
  reload, second-session, hostname and visible-effect browser tests only after these
  surfaces use the canonical model. → issue #31.
- Leads-pipeline campaign tests inject a recording `EmailEnqueuePort` and count
  enqueue calls as success. They do not run the real email-sender delivery service,
  and UI coverage does not distinguish an enabled install from an active provider.
  Thus the suite passes while Campaigns marks queued rows sent with no dispatcher.
  Add a real-container test covering unconfigured, successful provider, failure and
  retry, and assert campaign/lead/outbox states at each milestone. → issue #32.
- Memberships now exercises the real scoped Stripe foundation adapter and truthful
  unavailable state, while lifecycle/webhook tests retain injected clients for
  deterministic provider failures. Subscription transitions pass their dedicated
  **2/2** gate and plan-price provisioning passes **11/11**, including stable cadence
  identities, provider-success/local-write recovery, stale-target refusal and an
  unlocked unrelated-plan lane. New settings/runtime coverage pins full provider-
  affecting Checkout fingerprints, same-key changed-intent conflict, exact valid
  replay, expired-session replacement by a new operation, credential-free HTTPS
  destinations and strict wrong-plan/cadence success rejection. Record its final
  post-review aggregate. A real Stripe test-mode checkout/webhook/change/
  cancel/reconciliation run remains. → issues #33 and #122.
- Affiliates now exercises the real client-scoped Connect foundation, capability
  gating and every adapter method. Onboarding persists intent before provider I/O,
  uses a stable provider identity, revalidates its target and fences delayed status;
  `account.updated` re-reads current provider state rather than trusting an old event
  body. Module plus onboarding/dependency proof passes **32/32**. Complete the hosted
  onboarding/status/transfer/webhook/reload lifecycle with a real Stripe test account.
  → issue #45.
- Canonical client-creation proof now executes the real shared operation against
  memory storage: default Epic Intro creates once, installs Website Editor, applies
  `aqua-incubator`, initialises its checklist and replays to the same client; changed
  operation reuse conflicts, the exact retired default is repaired, and a deleted
  agency phase is refused before client creation. A faulted two-plugin service retry
  proves successful install/variant/checklist steps are not repeated. Source contracts
  pin the mounted modal, exact route, linked workspace, lead/contact and person-card
  callers to the canonical boundary. Dedicated **4/4**; combined lifecycle/navigation/
  lead/relationship **75/75**. Remaining acceptance is literal mounted-browser submit/
  reload for every built-in/custom stage and forced install/variant/portal refusal.
  → issue #46 code/behaviour resolved; browser acceptance remains.
- Checked-mutation unit/source coverage now protects the first broad cohort, every
  mounted Agency Finance mutation, every mounted Dev Team write and the audited
  Actions mutation family. The original
  cohort covers **46 calls across 17 mounted components**. All **22** Finance calls
  across ten mounted components now require strict acknowledgement, entity,
  multi-entity or absolute-HTTPS success shapes, and Dev project save/delete/map/
  connect success is action- and expected-id-specific; exactly four remaining raw
  Dev fetches are inventory-pinned GET reads. The shared helper rejects transport,
  unreadable/malformed JSON, non-2xx, `{ok:false}` and invalid success, makes 5xx
  bodies opaque, bounds rendered domain diagnostics and gates refresh/reset/
  navigation behind validated success. Focused proof is **25/25** and the independent
  combined behaviour rerun is **267/267**. Actions adds strict, authoritative
  response validators plus receipt-bound task completion/delete, alert Mark Done and
  notification decisions. Its authenticated route recovery covers competing alert
  decisions, exact lost-response replay, stale semantic successors, more-than-200
  completion receipts, cross-actor deduplication and atomic commit rollback; mounted
  Actions/Today/Calendar/Dashboard/Team controls retain state, settle busy indicators
  and gate their success continuation on that exact response. The final Actions gate
  is **54/54** and the complete Actions+Memberships changed-surface gate is **145/145**;
  TypeScript/diff pass and independent review is clean. The exact-build responsive
  failure/replay result is recorded in the current release checkpoint.
  The wider 148-family non-Finance/non-Dev/non-Actions inventory remains open. Add a class-level
  guard plus forced 400/422/500/503, rejected-fetch and malformed-response mounted
  cases for Client Centre, phase, SOP, Company and related controls; assert retained
  input/context, visible safe failure and no success continuation. → issue #47.
- Performance (2026-09-02, fifth #47 cohort): `smoke-performance-experiments-checked-mutations`,
  `smoke-performance-milestone-mutations` and `smoke-performance-report-checked-mutations`
  (**38/38**) pin exact receipt validators, parent-sequenced apply order, the shared route
  classifier (400/404/409/generic 500, no echoed exception text), client-scoped element
  gating inside the refreshed transaction, cap-on-space normalisation and real-route
  receipts through the browser validators. Exact build `H-vbnKm_hrkDkN8fgxwqF` browser evidence
  (**119/119** stories, seven viewports) is recorded in the update log and issues
  #47/#128/#129.
- Health Check coverage proves question/scoring structure and the progress-save
  resume serializer, but not the three visible final-result controls. Add a browser
  case that completes a check, obtains the final share link, opens it in a clean
  context and compares restored answers/results; assert email contains that same
  URL and that denied clipboard writes do not display a false copied success.
  → issue #48.
- Automation service coverage can assert a failed run and its history while still
  missing the mounted feedback defect. Add a component/browser case in which “Run
  now” reaches an unavailable email transport or rejecting webhook, receives the
  current 200/`ok:true` envelope with `run.status:"failed"`, and must render the
  final diagnostic rather than “Live flow completed.” → issue #49.
- Business OS coverage does not resolve action URLs emitted at runtime by the
  mounted scripted assistant or its unlocked Toolbox. Add a catalogue/render test
  that asks representative phase, recommendation, stuck and human prompts and
  renders the post-Health-Check tool cards, then require each same-origin destination
  to exist and each WhatsApp/contact target to contain a real configured recipient.
  Follow with browser clicks from the current `/business-os/app.html` and
  `/business-os/tools.html`.
  → issue #50.
- Public-site source coverage proves the AquaCRM VSL shell and controls exist, but
  the mounted homepage supplies no YouTube URL and clicking currently reaches only
  its internal setup notice. Add configuration and missing/invalid/provider-error
  cases, then browser-prove start, pause/restart, seek, mute, fullscreen and close
  against the actual root rewrite.
  → issue #51.
- Portfolio rendering exercises the case-study structure but does not interact with
  every control. Add a component/browser case that starts with Ocean Boulevard's
  disabled empty-cart payment action, adds/removes quantities, invokes the enabled
  action and requires a clearly simulated result plus reset.
  → issue #52.
- Public route tests do not assert brand continuity through shared navigation. Add
  a generated link inventory for every AquaCRM/Milesymedia public shell and resolve
  `/` rewrites before comparing the visible brand plus enquiry payload. Follow with
  browser clicks for header logo, Home, Contact and primary CTA on Tools, Health
  Check, Portfolio and Client Centre.
  → issue #53.
- Notepad service tests prove scoped CRUD and its source test only asserts that an
  autosave timer exists. Add component/browser tests for the actual lifecycle: edit
  then navigate before 650 ms, switch notes, close/restore, force a rejected/offline
  request, invoke explicit retry and reload to compare the last revision.
  → issue #54.
- Email-sender smoke coverage deliberately asserts that the `none` provider marks
  a message sent while making zero network calls. It does not distinguish a local
  sink/dry run from external delivery, and health coverage accepts an unconfigured
  non-error provider. Replace that expectation with explicit sink semantics and
  add service/API/consumer tests proving sent, active and healthy require a capable
  configured provider. → issue #34.
- Email-sender service tests bypass the product setup surface: they call
  `provider.update()` and the stub `identities.verifyDomain()` directly. No test
  resolves a user-reachable control that can save the Postmark key, manage the
  default identity, perform provider-backed verification or run test delivery.
  Add route/UI reachability and canonical-config tests, reject unverifiable sender
  activation, then browser-walk a fresh install through delivery and a signed
  webhook status update. → issue #43.
- Plugin-settings coverage now derives the registered inventory from source and
  fails if the declared consumer list drifts. Twelve manifests declare **43 fields**:
  **27 are consumed and 16 remain unwired**. Host readers are keyed to a full
  plugin/field identity plus an exact file/access expression, so the unrelated
  Leads CSV `defaultTags` FormData key can no longer mask Client CRM's unused
  setting. Marketing, Website Editor and
  Fulfillment have save/reload or changed-outcome proof. Memberships now consumes
  all four formerly-unwired values across plan trial creation, safe billing return,
  member-page heading and the setting+feature+eligible-plan annual gate. Its focused
  runtime coverage also pins exact numeric-step validation and strict provider/
  subscription success envelopes. Removed inert declarations
  cannot persist through the generic writer, and unwired controls are labelled at
  the input. Focused Memberships passes **65/65**, adjacent Memberships/company/
  Ecommerce **90/90**, and complete changed-surface **145/145**; the exact-build
  mounted settings/controls result is recorded in the current release checkpoint.
  Wire or remove the
  remaining HR (3), Leads Pipeline (3), Public Funnel (2),
  Ecommerce (2), Affiliates (2), Client CRM (3) and Finance (1) declarations, then
  mounted-prove every retained setting. → issue #44.
- Manifest and registry tests can load healthcheck functions, but no test proves the
  product ever invokes one or persists `health`/`healthCheckedAt`; the patch contract
  cannot currently carry those fields. Radar tests likewise do not reject an enabled
  never-checked install, so missing health becomes a healthy measured zero. Add a
  runtime runner test for pass/false/throw/timeout plus Radar tests for never-run,
  stale, partially covered and recently covered fleets. → issue #35.
- Client service-workspace coverage pins that portal readiness is based on
  `customPortalExists()`, but it does not resolve the visible wizard's preset/export
  URLs. Both point at an absent `portal-export` module; preset failure is swallowed
  and no test submits the wizard, observes filesystem/materialised state, reloads
  and opens the result. Add route-resolution plus isolated materialisation and real
  browser acceptance for the full state transition. → issue #36.
- Client-project tests prove successful local folder/Git creation, deliberately
  suffix a repeated project path, then prove private GitHub repo creation/push and
  Vercel upload/deployment. They never fail after the local folder or initial commit,
  after repository/deployment creation, during push, or during client metadata
  persistence. Add deterministic fault injection at every boundary and assert
  reconciliation/idempotent recovery rather than an orphan or duplicate. → issue #37.
- Private-object lifecycle coverage is now behavioural rather than source-only.
  **31/31** proves persisted staging/destructive intent, claim-before-owner ordering,
  sweep/adoption serialization, already-persisted owner adoption, ambiguous-claim
  retention, sanitised Legal/SOP/Development delete checkpoints and retry-only reads;
  authoritative owner updates and bulk rewrites share the deletion lane. Finance
  obligation citation creation/update and Company governance PUT also share the legal-
  delete agency lane, closing accepted-but-not-persisted and stale-resurrection races.
  The earlier widened Finance/legal checkpoint is **167/167**; final Legal and SOP
  dependency suites are **21/21** and **18/18**, and Postgres/client transaction
  composition is **7/7**. Still add payload-bound replay/claim rollback,
  live Supabase/Blob/local-production providers, real process-kill/multi-process DB
  leases, mounted batch/delete failure and reload, automatic retained-claim
  reconciliation, direct call-recording ambiguity recovery and the chosen SOP
  retirement policy. → issue #38.
- Close-deal route/orchestrator tests prove idempotent contract/invoice creation and
  intentionally assert `status:"sent"`; they do not require terms/document, inspect
  a delivery result or drive customer acceptance. Add a title-only refusal, canonical
  delivery result tests, and browser acceptance proving the reviewed version is the
  version accepted. → issue #39.
- Commercial-pack tests inject an email recorder that returns a message id and then
  assert sent/receipt state. They never return `{delivered:false,error}` from the
  real adapter contract. Add failure and retry cases for proposal delivery and
  payment receipt, asserting no sent timestamp/status before delivery. → issue #40.
- Commercial-pack tests amend only before send, then accept once. They do not try to
  accept a draft token, edit an accepted pack, compare accepted content/version, or
  change total/cadence after Checkout creation. Add immutable-version/hash tests,
  draft refusal, amendment reset and stale-Checkout invalidation, then browser-drive
  the public proposal before and after acceptance. → issue #41.
- No test invokes the commercial Stripe webhook for an installment subscription.
  Add signed checkout/invoice fixtures for exact allocation, provider-invoice
  deduplication, manual-payment isolation, cancellation refusal, retry/reconciliation
  and confirmation that no charge remains after the promised count. → issue #42.
- The 2026-08-24 targeted non-security set is **98/98**. It covers named dirty
  buffers, project-keyed panels, code-canvas stale-read aborts, AI capture/prefill
  clearing and comprehensive showcase reset shape. It does not mount Page SEO or
  Element Insert and release an old response after a page/layout/project/element
  change; both panels can currently repaint the reset target. Add controlled
  slow-old/fast-new response tests and assert stale values, file targets, fingerprints
  and errors never cross the boundary. The suite also does not close reported
  cross-project prefill bleed. Editor hide/surface/lifecycle/refresh timing and
  showcase concurrency still need behavioural browser/multi-session coverage.
- The account-creation/source semantics set is **35/35**: standalone `/signup` is
  intentionally absent; JSON keeps the agency-bootstrap contract; native published-
  site signup creates a lead without a password; and its form response returns by
  303. This does not visually prove the published-site result banner or the
  client-scoped end-customer signup embed.
- Staff proxy, navigation, pages and tested API families now consume one canonical
  Hidden/View/Manage capability policy. Portal Studio separately proves View can
  inspect but not mutate, Manage can save/publish, Hidden is refused, downgrades are
  re-read and foreign-client scope stays closed. The direct policy/update-route rerun
  passes **18/18** and the wider authored Staff policy gate is **35/35**. A browser
  role-authoring roundtrip persisted Manage, then View, across reload and archived
  the role. The isolated-production Staff Technical matrix then passed **50/50**
  across six same-cookie Hidden → View → Use → Manage → View → Hidden transitions;
  hidden routes used valid streamed Next not-found content and the exact API downgrade
  returned 403. Provider-backed live-persona/shared-credential acceptance remains.
  → issue #25.
- Invalid client-reference handling, website empty-state truth, read-time
  mutations, slow-page profiling and showcase concurrency require direct
  behavioural checks.
- The nested Fulfillment lifecycle smoke now seeds the seven Aqua/churned stages,
  creates at Epic Intro, drives every active hop and checks current plugins, account
  starter trail, checklist and transition soft-fail classification. Direct jump and
  partial creation retry have focused companion tests, and `smoke:all` explicitly
  includes the nested suite. Focused lifecycle/navigation **43/43** and wider
  creation **75/75** pass. → issue #56 resolved.
- Checked-read coverage now distinguishes unavailable from confirmed empty across the
  original editor/attention/KPI/history/phase/search/sender/inbox cohort and the later
  client/customer Finance, Health/Radar/Fulfillment, contact/interactions, Meta,
  commercial/manual detail, Identity and governance-scope families. Labelled snapshots
  never authorise a dependent write, delayed generations are fenced and partial reads
  cannot produce healthy totals or ordinary empty copy. The exact final named-source
  regression passes **54/54**; the earlier interactive-read/utility gate remains
  **14/14**. The named source-level fallback class is repaired. Mounted forced
  rejection/retry, lost-response, multi-tab and live-provider recovery remain. → issue #57.
- Client-contract smoke coverage is source-pattern only. It does not force the
  optional template request to fail after a random-id contract create, retry the
  retained editor or count drafts/templates after reload. Add that composite failure
  path and assert one contract plus one intended template. → issue #58.
- Customer-portal tests assert routes, source strings and pure attention logic, but
  do not count aggregate or backend calls. Add a server-render regression proving
  layout chrome and the built-in body share one request snapshot and that Finance,
  inbox and enquiry reads execute once; retain explicit failed-read state. Measure
  the live route separately rather than calling source deduplication a latency win.
  → issue #59.
- `smoke-kpi-targets` proves successful store mutation and source-matches the route;
  it never mounts the editor or rejects/drops a target POST. Add component/browser
  cases for edit, reset and accepted suggestion where the request is 500, rejected,
  malformed and falsely acknowledged by the file backend. After reload and in a
  second session, only one explicit confirmed or visible pending version may exist.
  → issues #16 and #60.
- Existing Task Template, Development Toolkit, Performance and Client Systems tests
  do not reject their mounted utility requests. Add component/browser cases for the
  initial template read, “Show 36 more,” credential reveal, Search Console connection
  check and clipboard refusal; assert every pending state settles, one clipboard
  write occurs and retry remains available. → issue #61.
- No mounted test proves “Archive lead” retains a recoverable record or reconciles its
  linked foundation card. Add a real handler/service test that creates and links both,
  archives, reloads, restores or purges, and injects failure on each side. The isolated
  probe currently observes a deleted lead plus the exact surviving card id. → issue #62.
- Membership and Affiliate parent deletes now enforce RESTRICT under the same durable
  graph lanes as child creation. Service bypass, mounted 422 shape, unchanged graph,
  interrupted claims, concurrent child creation, ordinary archive/removed state and
  genuinely unreferenced deletion are covered. The dedicated parent-dependency gate
  passes **28/28**; adding the Affiliate identity-recovery file gives the documented
  **32/32** retirement/recovery gate. Mounted refusal/archive/reload and live provider
  acceptance remain. → issue #63.
- SOP deletion and every current incoming-reference writer now share one tenant-safe
  lifecycle lane. The dependency preview, service/mounted RESTRICT, all nine reference
  shapes, nested client process steps, missing/cross-agency refusal and deterministic
  delete-versus-guide race are covered. The dedicated SOP dependency/writer gate
  passes **22/22**, within the wider documented **52/52** dependent-domain gate.
  Historical dangling-row repair and representative mounted reassignment/refusal/
  reload acceptance remain. → issue #64.
- Company capital/governance adversarial coverage now refuses duplicate/missing graph
  identities and references, over-allocation/paid values, voting contradictions and
  hard deletes that would strand ledger links. Company governance legal citations also
  share the legal-delete lifecycle lane. Combined capital/Battle/legal/governance/role
  proof is **103/103** and the final legal-dependency suite is **21/21**. Still browser-
  prove representative create/edit/refusal/delete/reload flows. → issue #65.
- Battle Table writes now require a revision, stale saves return the current plan with
  409, locked reviews are immutable and numbered amendments preserve their original
  evidence; conflict rebase uses the last server-confirmed plan. Combined focused proof
  is **103/103**. Still browser-prove two tabs, conflict recovery, lock, amendment,
  history and reload. → issue #66.
- Legal-register dependency retirement now has one inventory for preview and deletion:
  cited purge refuses, archive retains references, explicit detach clears all citations
  with the row, and provider refusal restores it. Finance obligation create/update and
  Company governance PUT also serialise their final document checks and persistence with
  deletion. Existing dependency proof is **103/103**, the earlier widened Finance/legal
  checkpoint is **167/167**, and the final legal-dependency suite is **21/21**. Still drive the
  mounted Delete/archive/detach choice and inject live provider/reload failures across
  Finance, governance, search/posture and alerts. → issues #38 and #67.
- Governance cross-company isolation now covers selected/shared legal evidence,
  declarations, vendor agreement matches, breach rows and erasure targets; deliberately
  group-wide sections are labelled. Destructive-target coverage passes in the combined
  **103/103** gate. Still browser-prove agency/Alpha/Beta switching, a scoped create,
  rejected-read retry and reload without cross-scope carry-over. → issues #57 and #68.
- Ecommerce issues #69–#77 now have a focused **39/39** source/service/package gate:
  `smoke-ecommerce-authoritative-checkout.test.ts` (9),
  `smoke-ecommerce-order-lifecycle.test.ts` (8),
  `smoke-ecommerce-product-lifecycle.test.ts` (6),
  `smoke-ecommerce-financial-reporting.test.ts` (3), plus the existing Membership-discount
  and order-created package suites (13). TypeScript also passes.
- The authoritative-checkout gate rejects browser money/unknown fields, resolves real
  variant price/currency/discount/shipping/tax, reserves and settles once, recovers a
  partial multi-SKU operation, enforces concurrent gift-card capacity, prevents pre-paid
  issuance, restores a full-refund redemption once, supports exact-zero settlement,
  proves fixed/weight/free and inclusive-tax quotes, rejects unsupported zones, freezes
  configuration and releases expiry. It also pins the mounted ids/minor-unit/route DTOs.
  → issues #69, #70, #73 and #74.
- The order-lifecycle gate faults durable order/activity work, rebuilds a fresh container,
  retries cumulative/out-of-order refunds, constrains manual transitions, returns
  by-session pending then ready, releases provider expiry and settles a gift-card-only
  zero balance. Real signed Stripe delivery and mounted transition acceptance remain. →
  issue #75.
- The product-lifecycle gate proves compare-and-swap details/variants, server-owned ids,
  recoverable slug/collection migration, archive-in-place with stale-checkout refusal,
  mounted command/archive source contracts and lossless rich option metadata. Literal
  two-tab archive/rename/conflict/reload acceptance remains. → issues #71 and #77.
- The reporting gate proves currency-partitioned gross/refund/net/cancelled/pending money,
  customer net spend and mounted grouped labels without fabricated GBP consolidation:
  dedicated **3/3**. → issue #76.
- The remaining P0 browser matrix is deliberately narrow: after guest/end-customer route
  authorization is decided, drive two stores through browse, search, rich variant, cart,
  authoritative quote, real Stripe success/cancel/reload and pending→confirmed order;
  tamper the browser request and verify no cross-store cache state. → issues #29, #69 and #72.
- The mounted Health Check/Public Funnel/BOS path now has a real **21/21** route/plugin
  journey gate in addition to the older focused chain. It proves flushed capture, stable
  retry, lead cookie, no-store server context, exact HC-slot restoration, anonymous
  isolation, validation failure, corrupted-index visibility and same-process concurrency.
  Port 3032 also renders the corrected email-sync/browser-only claims. A mutating human
  completion was deliberately not submitted against the shared live dataset. → issue #78.
- Public Funnel fault/concurrency coverage now pins authoritative by-id reads, stable
  completion retry, session-failure resume, handler 4xx/503 semantics and one capture/event
  under a same-process race. Still add a database-backed two-process test and fault durable
  activity/event delivery before/after each outbox boundary; those are the remaining
  exactly-once claims, not the repaired index/session cases. → issue #79.
- Lead identity now has a focused **46/46** gate: the plugin suite covers canonical
  email/phone conflicts, pointer preservation, simultaneous edits and simultaneous
  upserts; `smoke-lead-identity-conflict.test.ts` drives the real PATCH handler to a
  field-specific 409, verifies both owners remain intact and pins the sales-record
  keep-draft/inline-error contract. Still add a two-process storage/database race across
  edit, CSV import and prospect qualification plus retry/reload; the module-scoped lock is
  not distributed coordination. → issue #80.
- Opportunity money now has a focused **8/8** commercial/route/UI gate. It proves distinct
  invoice numbers for simultaneous proposals, preservation of two simultaneous payments,
  payment survival during an invoice edit, canonical whitespace/case retry, required
  references, mismatch refusal, real-handler 409 and the mounted reference-required
  contract. Still add database-backed separate-process and crash tests around the invoice/
  ledger claims and every receipt, Finance, Stripe, activity and event outbox boundary.
  → issue #81.
- Mounted Marketing record persistence now has a focused **25/25** package/handler/UI
  gate. It proves every simultaneous asset/profile create survives, same-version asset and
  profile edits yield one 200 plus one visible 409, stale delete is refused, and Channels,
  Funnels and Customer Profiles send the version they opened. The older broad Marketing
  chain remains useful, but database-backed separate-process CAS plus mounted reload still
  needs proof. → issue #82.
- Agency Marketing lead identity now has six focused service/handler cases: whitespace/
  case create/edit stays canonical and reachable, another owner's address returns 409
  without moving either pointer, simultaneous create/edit leaves one owner, and a
  contact/edit race preserves both changes. The package passes **24/24** and the real
  handler boundary **2/2**. Still add database-backed separate-process create/edit/import/
  contact races plus retry/reload; the module lock is not distributed. → issue #83.
- Agency Marketing campaign truth now has a focused package/handler/UI gate: complete-row
  PATCH rejects blank name, retained-date inversion, negative/fractional/non-finite values
  and invalid runtime enums without changing storage; simultaneous same-process creates
  survive; report windows are validated; and same-channel GBP/USD budgets plus unlike KPI
  results stay separately labelled. The package passes **24/24**, the real handler/report/
  UI contract **3/3**, and live 3032 renders the new window/currency/budget/result headers.
  Still add database-backed separate-process create/update/delete and reload coverage. →
  issue #84.
- The focused Aqua Tag routing/dependency chain now passes **68/68**, including a dedicated
  stop-routing regression: company→inbox preserves the source, injections and imported
  forms; full deletion still cascades; both agency/client controls use `route-to-inbox`;
  and dependency confirmation/cancel precedes permanent removal. Live 3032 Tags renders,
  but add an isolated mounted click/reload walk because the shared fixture had no safe row
  to mutate. → issue #85.
- Aqua Tag delivery semantics now pass **33/33** focused checks. The real config handler is
  no-store and its next request sees a disable; the real tag source runs in a VM to prove an
  already-open document keeps its single fetched/executed provider while a fresh document
  receives the current empty config; source/UI checks pin “off for new loads,” the open-page
  warning, scoped checkbox labels, removal confirmation and surfaced errors. Live 3032
  confirms the wording and response headers. → issue #86 resolved.
- Aqua Tag ingestion now has a **5/5** real-handler fake-Supabase gate: capture→brand,
  brand→capture, simultaneous delivery, rejected insert/recovery and rejected promotion/
  recovery all retain one complete row, the rich capture and one downstream effect set.
  Tag VM tests prove capture-phase hidden-id stamping and bounded retry with the same id;
  the wider focused gate passes **120/120**, TypeScript and diff checks are clean. Add a
  real database unique claim, separate-instance races and crash/outbox fault injection for
  distributed exactly-once acceptance. → issue #87.
- Dev Team source-of-truth mutation retains the earlier **104/104** cross-process
  coverage and now passes a widened **29/29** document/cross-process gate. A fsynced
  batch journal recovers document and attribution bytes after death between renames or
  after both renames before cleanup, but refuses and retains the journal over an outside
  edit. Recovery is bound to the caller's exact ordered canonical target set, so a
  forged schema-valid journal cannot write outside the intended document/ledger pair.
  Unreadable, malformed or shape-invalid local and durable attribution ledgers fail
  closed and remain untouched. The remaining #88 boundary is the final check/rename interval for a
  non-cooperating direct writer; production's durable workspace uses one database batch
  transaction and plan creation retains its atomic `wx` path.
- Managed integration activation and scope pass **160/160** across the widened provider and
  consumer gate. The matrix saves good then bad credentials, fails the replacement, retests
  without reordering, explicitly activates a passing alternative and verifies exact-client
  isolation plus workspace fallback. Communication UI/API/call paths carry the enquiry
  client; unsupported Meta client scope is rejected. Stripe plugin settings, transactional
  email, Editor AI, GitHub/Vercel provisioning, Search Console, Performance Analytics and
  Finance consumers remain green. Port 3032 renders one active legacy GitHub connection,
  one inactive “Make active” alternative and active OpenAI without a live mutation. → issue
  #89 resolved.
- Portal Editor authority now has a focused behavioral gate. It normalises all nine field
  types; refuses unknown/inactive keys, invalid options/dates/email/HTTP URLs and missing
  required values; retains deleted-field history while refusing changed writes; exercises
  real Lead/Contact handlers and Client/Action/Product/Expense writers; and pins every
  mounted consumer plus the explicit Contacts delegation. Result: **8/8** focused and
  **118/118** surrounding editor/import/recurrence/finance/catalogue checks, with clean
  TypeScript/diff checks. Read-only port-3032 proof mounted all six configuration tabs,
  all six working screens and the nine-type Product field editor; live data was not changed.
  → issue #90 resolved.
- Agency Settings outcome coverage is now implemented. The **3/3** focused gate changes
  `portalAccessDays` and observes the real alert boundary/copy, renders an invoice with the
  saved legal/contact identity and pins the honest 15-minute confirmation-code, pending
  digest-scheduler and pending timezone-scheduling copy. Transactional-email coverage also
  proves the saved legal name/reply address fallback. The widened Settings/Finance/
  notifications run passes **143/143**, and read-only port-3032 Account, Defaults and
  Notifications proof mounted the same contract without saving. → issue #91 resolved.
- Agency Settings role coverage now passes **5/5** against one owner/manager/staff capability
  map, Team branch, real Activity Log/External AI route statuses and staff-safe Account/
  Permissions source. The surrounding role/settings gate passes **68/68**, the production
  build generates **271/271** pages and an isolated production browser proves owner/manager
  controls plus the staff Settings redirect and truthful Account/Permissions copy. → issue
  #92 resolved.
- Google Calendar creation now has a **7/7** focused fake-provider/persistence matrix. It proves
  the operation flush happens before POST; remote success is adopted before refresh; refresh
  503 returns created/stale; unchanged retry does not POST; changed payload cannot reuse a key;
  post-provider and final-status flush failures report `remoteCreated`; and discarded local state
  recovers through deterministic-id 409/read-back with one successful remote create. The
  surrounding Calendar/state/company/actions gate passes **87/87** and production build
  **271/271**. A live Google account remains deliberately untouched. → issue #93 resolved.
- Contact identity ownership now passes **31/31** focused and **114/114** across the wider
  Person/enquiry/history gate. Behavior tests cover canonical Add/Edit conflicts, stable
  oldest-owner email lookup for legacy data, ambiguous-phone refusal, shared switchboards,
  repeated named sync, split email/phone ownership, validation-before-mutation and competing
  Add/Edit/sync arrival orders. The isolated mounted card returned real 409s for duplicate
  email and phone, showed the owner link, retained both drafts and reloaded with one owner.
  TypeScript/diff and the production build **271/271** pass. Read-only shared-state inspection
  found zero duplicate emails and two legacy repeated-phone groups requiring review; it made
  no data changes. → issue #94 resolved.
- Meta webhook lease recovery now has a real separate-process local proof: process A claims
  and exits, process B starts fresh after expiry, reclaims the same id at attempt two and
  completes it. The matrix also pins active-lease exclusion, stale-owner fencing, retry
  backoff, legacy unleased-row recovery and terminal settlement of an expired eighth attempt;
  both fresh-install and upgrade SQL are source-checked for atomic reclaim and conditional
  complete/fail. Focused **11/11** and wider Inbox/integration/policy **60/60** pass. A live
  Supabase RPC execution remains deployment acceptance, and crash/replay behavior between
  provider sends remains outside the queue lease. Conversation ordering and multipart delivery
  are closed separately by #97/#98. → issue #95 resolved.
- Local Master Inbox durability now has an independent **6/6** destructive temporary-file
  matrix. It proves malformed syntax and malformed collection shapes fail recovery-required
  without changing a byte; injected write/rename failures keep the last good target; SIGKILL
  after temp fsync leaves the old snapshot and a new process reaps the dead lock/temp; 12
  simultaneous child processes retain all connection/message/webhook writes; and two fresh
  claimers cannot both own one event. The wider Inbox gate passes **62/62**, TypeScript and
  build **271/271** pass. No shared port-3032 state participates. → issue #96 resolved.
- Meta conversation atomicity now has a focused **7/7** matrix: two simultaneous inbound
  events retain both rows and unread +2; newer-then-older delivery preserves clocks/referral
  facts; outbound arriving first is still selected as the first response when its event time
  follows inbound; duplicate provider ids return one insertion and stop before side effects;
  delete/read replay cannot regress facts; and two independent Node processes converge on one
  thread with unread +2. The SQL/source contract pins row locking, conflict handling, min/max,
  deadline and service-role-only execution. Wider related coverage passes **80/80**, TypeScript/
  diff and build **271/271** pass. Execute the checked-in RPC against live Supabase separately. →
  issue #97 resolved.
- Multipart Meta reply delivery has a focused **4/4** behavior/source matrix. The fake provider
  accepts text, rejects the attachment, then after reconnect receives only that attachment:
  **three calls**, no duplicate text, one stable message and both retained provider ids.
  Completed replay makes zero calls; changed content under the same operation is refused;
  an active per-part lease fences a contender; expiry becomes `uncertain`, never an automatic
  duplicate; and API/UI/SQL assertions pin retry-only requests, partial progress, conditional
  settlement and service-role execution. Wider Inbox/Meta **54/54**, TypeScript/diff and an
  isolated production build **271/271** pass. Execute the migration against live Supabase as
  separate deployment acceptance. → issue #98 resolved.
- Runtime Actions validation now runs through the real route and shared service in
  `smoke-actions-task-validity.test.ts`. It refuses unknown status/priority/recurrence,
  non-finite/non-positive times, due-before-start, late reminders and invalid titles with
  field-specific 400s and unchanged storage; direct callers cannot bypass it. Legacy-row
  correction, staff-style undefined keys, reminder clearing, month-end recurrence and UI/
  Calendar source contracts pass focused **7/7**. The wider Actions/task/Aqua+Google Calendar
  gate passes **136/136**, TypeScript/diff and isolated build **271/271**. → issue #99 resolved.
- A historical Journey/Fulfilment checkpoint ran **200 tests across 26 suites: 189
  passed and 11 failed** because the nested lifecycle smoke still asserted the retired
  catalogue. That result is superseded: issue #56 is resolved and the current focused
  lifecycle/navigation gate is **43/43**; the wider canonical client-creation gate is
  **75/75**.
- Lead-conversion idempotency now has real-handler race and crash-resume proof. Simultaneous
  requests return one 201 creation and one 200 replay with the same single client, contact and
  portal. A forced interruption after Finance invoice creation resumes with one invoice and
  one payment; independent Node processes sharing the file sidecar elect one owner and replay
  its durable result. Focused **6/6** and the wider gate reports **87 passed, 0 failed and 2
  expected live-database skips** across 18 suites. Generic/Supabase SQL is source-verified but
  still needs live migration execution; mounted browser acceptance remains. → issue #100
  resolved.
- Product-stage convergence now drives the real agency board, client process and portal
  workspace handlers. Each produces the same process, board mirror, product workspace,
  programme portal and aggregate account stage; identical retry keeps one activity, existing
  checklist completion survives and two-product accounts wait for the lagging product.
  Focused **5/5**, wider fulfilment/client/customer **114/114**, TypeScript/diff and isolated
  build **271/271** pass. Mounted acceptance could not run because port 3032 was down and the
  sandbox denied an isolated listener; that limitation is not reported as a browser pass. →
  issue #101 resolved at the real-route/store boundary.
- Add version/conflict and partial-side-effect tests for product workspaces. Two writers from
  one version must merge or one must receive a visible conflict; never acknowledge both and
  lose an update. Force failure between process/workspace and workspace/file visibility
  writes, then reconcile on retry. Apply equivalent race probes to client requests,
  approvals, payment plans and records before assuming their whole-array writers are safe.
  → issue #102.
- Mixed-currency client payment coverage is now implemented. The pure summary proves £100 GBP
  and $200 USD plans remain two positions, linked invoices are not double-counted, and a paid/
  sent/refunded/void/draft/cancelled matrix leaves only the sent currency outstanding. Source
  contracts require Payment Plans, client overview/Radar, Finance founder, built-in Billing
  and configurable metrics to consume currency groups and forbid first-invoice formatting.
  The focused dependent gate passes **62/62**, TypeScript/diff and isolated build **271/271**.
  A mounted mixed-currency/refund browser walk remains operational acceptance. → issue #103
  resolved.
- Advanced Fulfilment shared-task implementation is covered by a real-route **3/3** gate:
  create persists into the canonical Actions ledger and a fresh GET sees it; move advances
  status/revision, stale move/delete return 409 with current tasks and the winning revision
  deletes; legacy local cards import once with column/status retained and retry imports zero.
  Source assertions forbid browser writes, require removal only after successful migration,
  fresh-state coordination and Actions capability gating. The wider Actions/client-task set
  passes **136/136**, TypeScript/diff and isolated production build **272/272**. Add mounted
  browser A/browser B plus storage-loss acceptance without changing the shared 3032 dataset.
  → issue #104 resolved.
- Payment-plan invoice recovery ships with a real-handler/file-process **4/4** gate. A normal create
  plus stale HTTP replay retains one invoice and one revision; a pre-created issued invoice
  with only the durable milestone operation is adopted without another number; removed
  invoice/payment-plan ledger and activity projections reconcile exactly once on replay; and
  a file-backed child persists that pre-link crash state for a different fresh process to
  recover. Source/visibility checks require intent flush before Finance, separate link flush,
  deterministic create, idempotent activity, a visible retry state and removal of operation
  fields from customer payloads. Wider Finance/client coverage passed **119/119**, TypeScript/
  diff and isolated build **272/272**. The later **3/4** regression was traced to a
  non-reentrant nested file transaction and fixed; fresh-process adoption is restored
  to **4/4**, widened Finance/client/product-workspace is **65/65**, and the lock gate
  is **8/8**. Retain mounted failure/retry acceptance.
  → issue #105
  resolved.
- Website Editor nested verification now uses one discovery runner from module `npm test` and
  root `smoke:website-editor`; canonical `smoke:all` includes it. The runner fixes the portal
  tsconfig/path-alias boundary, removes an inherited React server condition for client-capable
  tests, discovers new files automatically and attempts every file before failing. A two-file
  fixture proves an initial failure does not prevent the later file executing and the aggregate
  still exits non-zero with the failed filename (**2/2**). The actual suite reaches **1,527
  assertions across 49/49 files**; TypeScript and isolated build **272/272** pass. The later final
  Website Editor runner passes **49/49 files in 11.8s**, following a green canonical Node phase
  of **6,417 tests / 1,093 suites: 6,415 passed / 0 failed / 2 skipped**. Mounted editor behavior
  remains separate browser acceptance. → issue #106 resolved.
- Customer relationship-status proof runs the real presentation mapping for active, suspended
  and archived values, inspects the rendered status element/support destination and exercises
  fresh-memory linked workspaces twice. Active and suspended remain accessible after the fresh
  read; archived remains excluded; Billing consumes `client.status` while existing secure-
  billing/invoice-pay conditions remain wired. Focused **3/3**, wider customer/relationship/
  billing **43/43**, TypeScript and isolated build **272/272** pass. Retain mounted switching,
  direct-entry and reload acceptance because current local state has no suspended fixture and
  shared port 3032 was not mutated. → issue #107 resolved.
- People domain validity now has a real-route regression layered over the existing workspace
  suite. It rejects unsupported employee/pay/currency/leave/shift/training values, negative or
  out-of-range numbers, incoherent dates and malformed commission/onboarding rows; every
  refusal is checked against unchanged stored state. It also proves partial employee patches
  retain omitted fields and whitespace/case email variants receive 409 while one live owner
  exists, with explicit reuse after alumni. Focused domain/workspace coverage passes **26/26**,
  Agency HR remains **6/6**, TypeScript is clean and isolated build **272/272** passes. Keep
  mounted form/conflict/reload and database-native cross-process uniqueness as follow-ups.
  → issue #108 resolved.
- Cross-surface workforce convergence now has a real mounted-handler proof. HR creates and
  edits the canonical People employee with the same id; People- and HR-originated leave share
  ids, status and decisions; approval changes employee status in the same People mutation;
  HR metadata projects onto that id; Finance excludes legacy staff while retaining departments;
  and neither mounted path creates the old private indexes. Convergence passes **3/3**, the
  wider People/Finance/API/page gate **97/97**, standalone HR **6/6**, TypeScript and isolated
  build **272/272**. Add the mounted browser create/edit/approve/reload walk without using the
  shared fixture. → issue #109 resolved.
- Compensation ownership now has a mounted Finance-handler proof. A linked profile ignores a
  deliberately stale Finance name/pay/currency/bonus payload and projects People; later People
  pay/hour/currency/commission edits immediately drive Finance reads, cost projections and the
  monthly payment draft; Finance-only overhead/cadence survive; duplicate links and wrong payment
  currency are refused. Convergence passes **3/3**, focused People/Finance **32/32**, wider
  non-security Finance/People/API/page coverage **158/158**, standalone Finance **23/23**,
  TypeScript and isolated build **272/272**. Add the mounted two-tab save/reload walk without
  changing the shared fixture. → issue #110 resolved.
- Staff provisioning now has a fake-provider/fault-store matrix plus the real PortalState adapter.
  It covers normal replay, provider create, remote-profile partial success/adoption, local-user
  creation, People target linking, intent conflict and every post-provider durable flush; same-
  runtime and fresh-runtime retries converge on one provider identity, one stable local user and
  one target. All three mounted routes are pinned to the shared coordinator, retryable errors
  expose the last stage, and serialized operations contain no password. Dedicated **14/14**,
  wider People/Settings/customer-setup/company-disposition/state **109/109** and final TypeScript
  pass. A later complete production build generated **245/245** pages. Add real-Supabase staging
  and mounted failure/retry/reload
  without changing the shared fixture. → issue #111 resolved.
- Freelancer implementation journey added in `smoke-freelancer-real-journey.test.ts`. It drives
  the real PortalState provisioning adapter with a fake provider/email boundary, proves exact
  replay creates one identity, validates the production mail fallback setup link, shares a
  deliverable, posts through the mounted freelancer message route into owner Team Chat, uploads
  and downloads a private file through both freelancer and agency sessions, then submits the job.
  It also adopts/replays a pre-existing local-only freelancer without duplicating its user or
  People record, and pins every rendered/API capability. Dedicated **3/3**, surrounding **105/105**,
  TypeScript and the later **245/245** production build pass. Add a real
  Supabase/email/password-reset/login browser journey
  and a cross-process/reload pass before calling external acceptance complete. → issue #112 resolved.
- Finance invoice identity now has a real separate-process file-backend gate in
  `smoke-finance-invoice-identity.test.ts`: distinct intents receive distinct agency/year
  numbers; two workers retrying one key adopt one id/number; a third process reload sees one
  row per intent and no burned sequence. The mounted-form contract pins one key in the POST.
  Dedicated **2/2**, `smoke-finance-idempotency` **32/32**, widened Finance/product transaction
  **91/91**, TypeScript and diff pass. Optional issue-step recovery remains #47. → issue #113 resolved.
- Finance payment allocation now has a separate-process file-backend gate in
  `smoke-finance-payment-allocation.test.ts`. Two workers racing £70/£70 against £100 can
  persist only one row; £30 settles afterward, while racing valid £40/£60 partials preserves
  both. Fresh reload proves draft, void, paid, refunded and over-limit attempts leave invoice
  and ledger unchanged, retry adoption survives settlement, and P&L/settled-invoice reporting
  agree with the capped ledger. Source contracts pin Income filtering/input max and Checkout's
  outstanding amount. Dedicated **3/3**, complete Finance **108/108**, TypeScript/diff pass.
  Refund reversal behavior remains separately tested/fixed under issue #119. → issue #114 resolved.
- Finance runtime validation is now covered by `smoke-finance-runtime-validation.test.ts` across
  invoice/template, expense/category, budget, plan, obligation, compensation, payment and income
  create/post-patch paths. It exercises exact-field refusal, supported enums/currency, safe money,
  bounded rates/quantities, coherent dates, recurrence, nested line items and attachment evidence;
  mounted Invoice/Operations JSON handlers are included. Every rejection compares the entire
  plugin Map byte-for-byte before/after. Dedicated **115/115**, complete Finance **223/223**,
  TypeScript/diff pass. → issue #115 resolved.
- Finance plan assignment now has `smoke-finance-plan-assignment.test.ts`. It faults every
  version-marker, old/new membership, pointer and marker-clear boundary for assign/move/unassign;
  invalid clients, stale plans and malformed mounted requests are no-write failures. Independent
  file-backed processes race competing targets, two clients onto one target, move vs unassign and
  a valid vs stale target, then a fresh process checks `getForClient()` against every `clientIds`
  collection. Dedicated **18/18**, complete Finance **241/241**, TypeScript/diff pass.
  → issue #116 resolved.
- Finance recurring posting now has `smoke-finance-recurring-occurrence.test.ts`. It faults the
  marker, deterministic child, advisory index, durable result, source advance and marker clear,
  plus creation/recurring audit failures both before and after logging. Direct double calls and the
  real mounted handler/UI replay one child; independent file processes race the same due date over
  two consecutive periods, reload with two children/results and no marker, and reject an unknown
  stale timestamp unchanged. Dedicated **15/15**, complete Finance **256/256**, TypeScript/diff
  pass. → issue #117 resolved.
- Finance reporting now has `smoke-finance-accounting-semantics.test.ts`. One isolated book holds
  GBP/USD plans, partial/full/status-only-refunded receipt rows and pending/approved/reimbursed
  expenses. It proves selected-currency cash, commitment/accrual, partial receivable and MRR fields;
  the Report/P&L services and mounted APIs agree; source contracts pin Overview, Reports, Budgets and
  Planning to the same named fields and currency control. Dedicated **5/5**, complete Finance
  **261/261**, TypeScript/diff pass. The refund ledger was then completed under issue #119.
  → issue #118 resolved.
- Finance refunds now have `smoke-finance-refund-ledger.test.ts`. It drives partial, multiple and
  full cumulative Stripe events; provider-id replay; an interruption after the durable row and
  retry; independent-process refund/dispute races; fresh reload; gross/refund/net cash, receipt
  tax, receivables, Report/P&L agreement and mounted/UI source contracts. Dedicated **4/4**,
  complete Finance **265/265**, TypeScript/diff pass. → issue #119 resolved.
- Finance settings now have `smoke-finance-settings-convergence.test.ts`. It changes canonical
  Workspace Settings from 10-day/old-tax identity to 45-day/new-tax, creates invoices without an
  explicit due date, renders both HTML exports and proves the first due date/identity remain
  unchanged. Source contracts pin removal of duplicate/inert Finance declarations and the mounted
  form's canonical terms/default-tax inputs. Dedicated **3/3**, current complete Finance **271/271**,
  plugin/settings outcomes **27/27**, TypeScript/diff pass. The isolated browser listener was
  denied `EPERM`; the literal mounted click-through remains. → issue #120 partial acceptance.
- Finance commercial plans now have `smoke-finance-commercial-plan-convergence.test.ts`. It proves
  linked client schedules drive currency-partitioned MRR/ARR and explicit deposit-invoice payment,
  GBP→USD moves cancel the old schedule without changing its invoice, cancellation survives a new
  container and retains a durable retry marker, and mounted source contracts expose template
  currency/edit plus assign/move/cancel while retiring `/plans/assign`. The package MRR/deposit
  cases now seed the canonical client schedule too. Focused **3/3**, complete Finance **271/271**,
  TypeScript/diff pass. The literal isolated mounted lifecycle remains because listener binding was
  denied `EPERM`; port 3032 was untouched. → issue #121 partial acceptance.
- Membership transition issue #122 now has `smoke-membership-subscription-lifecycle.test.ts`.
  It starts from real stored/provider identities and proves provider failure/refusal, exact replay,
  fresh-container adoption and same-target concurrency across paid/free/paid transitions. Every
  mounted operation id remains bound to its archived canonical command after newer work; every
  retired provider generation is retained; old Checkout/webhook generations cannot overwrite the
  current subscriber; and paid plan changes/cancellations keep one provider lane through final
  authoritative state adoption. Pause/resume maps collection state, while immediate and provider-
  terminal period-end cancellation publish one terminal activity/event across retries and contenders.
  The lifecycle gate is **16/16**. The production Stripe foundation is real and truthfully unavailable
  without scoped credentials; full mounted/live-provider acceptance remains. The command fingerprint binds mode,
  provider subscription/price, trial and return URLs; a same-operation mismatch is a
  conflict, while a new operation may replace an expired Checkout result. Provider
  destinations and mounted 2xx envelopes are validated before navigation/reload.
  `smoke-membership-plan-price-provisioning.test.ts` adds
  **11/11** for durable plan create/update intent, per-cadence provider identities, retry after a
  partial provider result, rebuilt-container adoption, stale-target/reference refusal, delete
  fencing and the proof that unrelated plan work is not held behind slow provider I/O. The final
  focused Memberships aggregate is **65/65**, adjacent Memberships/company/Ecommerce is **90/90**
  and the complete changed-surface gate is **145/145**; TypeScript/diff pass and independent review
  is clean.
- Membership webhook issue #123 now has `smoke-membership-webhook-inbox.test.ts`. It faults
  subscriber persistence and payment activity, retries through a fresh container, races duplicate
  delivery, reprocesses legacy pre-work seen markers, rejects missing/cross-scope metadata and
  verifies the mounted 503 contract. Completed redelivery is rejected before any Stripe read;
  signed Checkout expiry releases only its exact session; subscription delivery re-reads authoritative
  provider state inside the same user lane as UI lifecycle commands, and its legacy discovery snapshot
  is never applied. Late generations cannot replace the current subscriber. The scoped per-invoice
  ledger is paid-dominant, cannot regress paid to failed, and completes idempotent activity/event effects
  once. The webhook gate is **9/9** and is included in focused Memberships **65/65**, adjacent **90/90**
  and changed-surface **145/145**. Signed live-provider acceptance remains pending a real Stripe test
  account and credentials; the production foundation itself is implemented.
- Affiliate payout issue #124 now has `smoke-affiliate-payout-ownership.test.ts`. It faults
  scheduling after attribution claims and earnings after attribution/payout completion, resumes
  through a fresh container, races two schedule calls, replays completion concurrently and proves
  a legacy duplicate payout cannot take ownership or alter earnings. It also asserts the mounted
  Schedule approved action and operation id. Focused **3/3**; package+focused **17/17**; combined
  Membership/Affiliate **70/70**; TypeScript/diff pass. Production Connect #45 and browser/live
  transfer acceptance remain.
- Affiliate currency/refund issue #125 now has `smoke-affiliate-currency-refund.test.ts`.
  Mixed GBP/USD, pending-order exclusion, pre-payout cancellation, post-payout partial/full
  cumulative refund, replay-safe offsets, locked provider currency and admin/affiliate source
  proof pass **3/3**. Affiliate package+focused passes **20/20**; widened Membership/Affiliate/
  Ecommerce passes **79/79**; TypeScript/diff pass. Production Connect/browser proof remains.
- Membership/Affiliate runtime validation issue #126 now has
  `smoke-membership-affiliate-runtime-validation.test.ts`. It rejects blank identities, unknown
  fields/enums/currencies, NaN/negative/out-of-range money/trials/dates/rates, missing references,
  500% discounts, 250% commissions and malformed payout inputs, comparing the complete plugin
  store before/after every refusal. Focused **3/3**, widened **82/82**, TypeScript/diff pass.
- Affiliate atomic-claim proof now uses a delayed/fault store and two independently constructed
  service containers. Same-user enrolment, same-normalised-code creation and same-order attribution
  converge on one claimed row; distinct concurrent work remains in every shared index; conflicting
  code ownership rejects; payout indexes remain lossless; interrupted enrolment/code/attribution
  writes recover from a fresh container with exact Affiliate/code counters and no orphan. Dedicated
  **4/4**, focused Affiliate **27/27**, widened Membership/Affiliate/Ecommerce **86/86**. → issue #127.
- The Company/Governance/Performance focused chain passes **221/221 across 33 suites**. The new
  report-history regression proves publish → regenerate → republish → withdraw/delete preserves
  every snapshot and monotonic revision; route-source proof requires the durable fresh-state
  metadata transaction and withdrawal audit: **4/4**. Still add literal route/browser two-tab,
  customer visibility and reload acceptance. → issue #128.
- Performance experiment boundary/lifecycle proof now rejects direct completion, duplicate ids,
  conversions above visitors and stale updates; it proves timestamped completion, immutable
  evidence, explicit amendment and draft-only delete: **2/2**. Stable-id-only live-event joining is
  implemented. Still add mounted API/browser join, completion/amend/delete and reload acceptance.
  → issue #129.
- The focused Command Centre/Radar, Advisor/Assistant, attention/notifications, universal-search,
  Notepad, Portals, SOP, Automation and Tools chain passes **199/199 across 26 suites**. Advisor
  turn operation proof now adds **7/7**: rejected generation leaves no visible thread/memory;
  retry/replay reuses stable ids and commits one pair/memory; provider-ready recovery, stale lease,
  overlapping turn and deletion cancellation converge. Widened Advisor/health proof is **15/15**.
- Still add the literal Assistant route/browser fault matrix: timeout/non-2xx/parse, provider-result
  persistence, atomic completion/activity, unreadable/lost response and reload for first and
  existing threads. Require one visible pair/memory and report provider unknown-outcome retry/cost
  separately from user-visible idempotency. → issue #130.
- Add fake-clock/call-count coverage around both Radar cron routes. Run zero, one and many active
  agencies; force Infra and one tenant to fail; overlap/retry ticks; require no more than one app-
  wide Infra probe, the declared (or explicitly revised) Evidence cadence and one evidence sample
  per healthy tenant independent of fresh Infra success. Current source tests pin the per-agency
  call that causes the mismatch and never execute this topology. → issue #131.
- The focused portal landing/role-shell, account/profile, customer setup, connection handoff,
  navigation, theme and transition chain passes **211/211 across 45 suites**. This is source and
  service evidence; the browser remained unavailable, and the tests do not establish role-correct
  escape links, a mounted error sink or a revisitable install journey.
- Replace the observability source-marker test with an integration capability test as well as
  keeping its pure formatter assertions. Require at least one real production entry point, an
  installed/configured client and server sink, a synthetic browser render error and API exception
  reaching a fake capture transport with route/tenant context, plus truthful readiness when the
  dependency or initialization is absent. Current caller count is zero and a fake DSN alone
  reports monitoring `ready`. → issue #132.
- Extend the new agency-staff Account/Permissions proof into a complete role-destination table
  for owner, manager, client owner/staff, freelancer and end customer. Exercise Profile menu →
  Account → Back, Permissions guidance and a bad `/portal/*` deep link; require every target to
  remain in the caller's legitimate shell without a middleware bounce. Staff Account and
  Permissions are proven; client/freelancer routing and portal 404 remain. → issue #133.
- Add first-run installation lifecycle tests across password completion, prompt accept/decline,
  tab close/reopen and later revisit. Exercise iOS manual instructions and Android/desktop
  `beforeinstallprompt`/`userChoice`; require the promised Support/account destination to expose
  the same help until explicitly completed or dismissed. The current setup smoke source-matches
  iPhone copy but never follows “do this later.” → issue #134.
- The modal contract and inventory now pass **18/18** within the combined **29/29**
  accessibility gate: every declared modal uses the shared stacked focus/restore model. Still
  browser-tab representative ordinary, destructive and nested dialogs. → issue #135.
- The shared themed loader now exposes one polite atomic status outside its hidden decorative
  geometry; focused proof is **7/7** and mounted Editor boot is visually clean. Still verify
  actual screen-reader announcement/removal and focus continuity. → issue #136.
- Keep `smoke-ux.mjs` in the HTTP/SSR layer. The repeatable real-browser gate now exists:
  `browser-matrix.mjs` drives 13 pages at 17 viewports—the six primaries, 320×568, 200% zoom
  and both sides of every Tailwind breakpoint—and requires render, overflow, console, network,
  keyboard-focus and axe evidence. Chromium **151.0.7922.34** completed every current broad
  production-target check: **1,326 required = 1,177 passed / 0 failed / 149 observations /
  0 missing**. Every observation is an explicitly proven aborted speculative Next RSC prefetch,
  not an ordinary request failure. The corrected one-login Settings 17-viewport slice accounts
  for **102 checks = 92 passed / 0 failed / 10 observations / 0 missing**.
  Dialog/menu activation, screen-reader output, wider cross-persona enforcement,
  remaining forced failures, date boundaries and installability remain separate
  acceptance work. Staff Technical enforcement is separately proven **50/50**. → issue #137.
- Shared tab/menu/listbox contracts now inventory every specialised role and pass **23/23** for
  arrow/Home/End, activation, Escape/return focus and reachable options; other surfaces use honest
  native navigation. Still browser-walk Settings, People, file tabs, Profile/Company menus and
  the page picker. → issue #138.
- The accessible-name inventory now covers internal actions, modal closes, Automation rows,
  Command regions and published forms; placeholders do not count as labels and status/error copy
  announces. It passes **11/11**. Still inspect representative mounted accessibility trees. →
  issue #139.
- Date-only source/domain proof now passes **5/5**: London summer midnight, both DST transitions,
  remote browser zones, calendar-day payment terms, impossible input and lossless date-only
  save/reload/export values. Mounted New Client/conversion, expense, Finance, HR, People and Leads
  defaults use the shared contract while UTC provider/export stamps remain explicit. Affected
  People/Finance/HR coverage passes **56/56**, adjacent client-plan/Leads **61/61** and TypeScript
  passes. Retain a controlled-boundary browser form save/reload/export matrix. → issue #140.
- The self-contained root `global-error.tsx` and segment boundary are source/observability-pinned.
  Still production-browser fault child and root-layout paths through capture/recovery. → issues
  #132 and #141.
- Customer setup now proves genuine 192×192/512×512 any + maskable assets and prompt lifecycle
  source behaviour **18/18**. Still run the installable Chromium eligibility/accept/dismiss/
  installed/ineligible matrix. → issues #134 and #142.
- Share Buttons and automatic Breadcrumb now have hydration-stable default and explicit modes;
  block-library proof is **50/50**. Still browser-navigate and exercise social/copy/current-path
  behaviour with zero recoverable hydration errors. → issue #143.
- Executable private-media range proof now covers local, Supabase and Vercel adapters with exact
  `200`/`206`/`416` contracts **8/8**. For inbox media, calls and SOP video/audio, still browser
  request start, middle, end,
  suffix, open-ended and unsatisfiable ranges; require exact bytes, `206`, `Content-Range`,
  `Accept-Ranges`, honest lengths and `416` where appropriate. Browser-prove `<audio
  preload="metadata">`, immediate play and seeking do not transfer the full 20/100/250 MB object.
  → issue #144.
- Shared MediaRecorder lifecycle coverage now passes **10/10** across Opus-WebM, WebM, MP4,
  browser-default, unsupported and failure cleanup/compensation. Website, social/client voice and
  recorded calls use the same contract. Still run real Safari/Chromium capture and navigation/
  upload fault acceptance. → issue #145.
- Countdown deadline/page-store proof now covers all documented units, decrement/expiry math,
  absolute/blank/malformed behavior, recursive/idempotent anchoring, edit reset, create/publish and
  deterministic legacy reload: **5/5**. Draft/publish compatibility remains **25/25**. Still mount
  the actual component effect with a fake clock through rerender/remount and server→hydrate a
  published timer in a browser; require `expiredText` and zero recoverable warnings. → issue #146.
- Pure notification coordination now deliberately reverses refreshes, refresh-versus-PATCH,
  independent rows, same-alert mutations, failures and prop rebases (**8/8**); the full attention/
  People gate passes **80/80**. Still mount Team Chat with deferred fetches: release A after a newer B
  selection/poll, submit and assert the recipient remains B, including direct-channel creation.
  Mount `NotificationAttentionProvider` with delayed refresh, overlapping rows and an older
  rejected PATCH after newer success; require no resurrected alert. → issue #147.
- Shared deadline/cancellation proof now passes **7/7**; provider never-settle, pre-abort,
  late-accept, operation-key and reconcile-first proof passes **7/7**; the focused provider
  foundation passes **37/37**. The widened route/provider gate passes **169 tests with 1 live-
  Postgres skip** under the required `react-server` condition, and TypeScript is clean.
  Still component/browser-test every mounted caller so stalled/late responses exit loading with a
  truthful safe/same-key/reconcile-first action, then run live-provider reconciliation. → issue #148.
- Capability behavior now proves **4/4** that registered+enabled exact-client ecommerce can expose
  Orders, disabled capabilities stay hidden, and even stale registered+enabled booking state cannot
  turn a holding page into account functionality. Focused navigation assertions pass **2/2**;
  surrounding customer/plugin-host checks pass **34/34**. Still browser-prove no Account activity,
  Orders-only and direct unavailable-Bookings states. If Bookings is later implemented, require
  create/reschedule/cancel, failure/retry, reload and tenant isolation before exposure. → issue #149.
- The dedicated header regression passes **2/2**: no More label/icon/control remains, while native
  Assign and Close/Reopen buttons retain their real mutation handlers. Focused reply/search proof
  passes **15/15** and the wider Inbox/Search gate **53/53**. Still browser-open an active thread
  at desktop/mobile widths and confirm the visible controls and focus order. → issue #150.
- The exact-client access wave passes **62/62**, including six direct boundary tests, and the
  separate product-workspace cross-process proof passes **4/4**; full TypeScript and the focused
  diff check are clean. A source contract pins 28 mapped route families, and 35 of 36 tenant
  `route.ts` files containing `clientId` now use the canonical client-element evaluator. The sole
  tenant exception is the development-only empty-store seeder. This is source/runtime proof, not
  a mounted-browser claim: the API worker performed no browser actions. Dynamic plugin modules,
  dynamic plugin and freelancer-job/task/task-template associations are classified and enforced,
  while the
  documented customer/session/relationship, Dev-project, workspace-create, website-source and
  output/derived routes intentionally retain different authority.
- The final access closure adds canonical Fulfilment Services View/Manage to client list/create,
  element-specific Staff People projections, canonical client elements for governed customer/
  client contracts/files/requests/project briefs, exact workspace-family filtering and removal of
  the inert generic Development scope. `/dev` now explicitly mints against the live realm. The
  settled relevant gate is **130/130**: **86/86** core access/Dev/workspace/client/People,
  **11/11** exact Access UI, **21/21** Dev Team performance and **12/12** Sandbox environment/
  protection. Full TypeScript and diff checks pass. This is a focused combined gate; the complete
  access wave itself did not rerun the repository suite; use the current whole-suite result at
  the top of this file rather than that wave's historical scope note.
- The Dev live-index regression still passes **16/16** and the earlier wider Dev Docs/edit/worker/
  performance gate passed **73/73**. The later 120.006-second zero-byte Dev Team request was caused
  by filesystem exhaustion—Next build outputs left 1.3 GiB free on a 100%-used volume and the
  compiler logged `ENOSPC`—not by Markdown computation. With approval, 15 exact generated outputs
  (~18 GiB) were removed without touching source/state/uploads/docs. Every dev entry now runs a
  non-destructive preflight that refuses startup below 2 GiB, and narrowed TypeScript inclusion
  reduces parsed files from 6,869 to 1,796. The updated Dev performance gate passes **21/21** and
  full TypeScript passes. Isolated full-source HTTP measures Turbopack **6.875s cold / 0.208s
  warm** and Webpack **9.423s cold / 0.200s warm**. Still browser-prime and re-time
  Library/Logs and Dev Docs on the mounted runtime, prove an outside edit appears inside the
  15-second bound and reduce cold compile below the 3–5-second target. A later clean browser made
  Home visibly ready on mobile in **3.897s** and completed a warm 1280px navigation in **367ms**,
  so only the wider route/freshness matrix remains unperformed. Exact Editor/Findings links now
  disable prefetch while preserving click navigation; the new **3/3** contract and a clean >9-second
  Home network window prove zero background request to either route. → issue #151.
- The new missing-client bootstrap regression passes **4/4**: the root contains only identified
  Next `beforeInteractive` bootstraps, their colour/sidebar storage behavior is executed in a VM,
  and absent clients abort before chrome/preview construction. Focused bootstrap/theme/sidebar proof
  passes **23/23**, the wider client/navigation/editor-layout gate **125/125**, TypeScript and the
  later **245/245** production build pass.
  Still directly load and client-navigate between valid, missing client/editor and generic portal
  404 controls; require the intended state, zero script/hydration console errors and preserved
  colour/sidebar bootstrap state. → issue #152.
- Keep the resolver/client-boundary regression for every Website Editor manifest
  page. The host now branches before constructing server-only ports, and all eleven
  formerly failing routes were repeated in the live browser without the plugin error
  boundary. Operational control/API flows remain separate acceptance work. → issue #153.
- The focused Development/phase/Identity/Performance/SOP/inbox/Finance-adjacent and
  documentation set is **250/250** across 54 suites. It confirms successful service
  and source contracts only; none of those tests forces the mounted rejected-fetch,
  malformed-response or clipboard cases tracked in #47 and #61.

## The rule (from CLAUDE.md)
> Run the FULL smoke suite before calling a behaviour change done. Find the
> nearest smoke test and **extend it with the behavioural contract** you're
> adding. A contract test may be pinning the exact behaviour you just changed.

_The doc-generators (`generate-symbol-reference.mjs`,
`generate-radar-rules-reference.ts`) are not tests — they regenerate
`docs/reference/`. Re-run them after code changes (see [development.md](../development.md))._
<!-- AQUACRM_SOURCE_END path="docs/development/tests.md" -->

---

<a id="source-docs-development-ultra-review-2026-08-24-md"></a>

## Source document — `docs/development/ultra-review-2026-08-24.md`

<!-- AQUACRM_SOURCE_START path="docs/development/ultra-review-2026-08-24.md" sha256="6725e738af21210dcf9cff8b60060ddbf1a1a7810b63b889fa7f32ef262ddaf5" -->
# Ultra review — 2026-08-24 non-security acceptance checkpoint

This is the evidence ledger for the current comprehensive review. It deliberately
excludes authentication, session, MFA and other security findings. It does not
replace [checklist.md](checklist.md), which remains the one current answer to
“where do we stand”. Findings graduate into [issues.md](issues.md) and work into
[todo.md](TODO.md); this file records what was actually inspected and what was not.

> **Current override — 2026-08-25:** this dated ledger remains accurate history,
> but several findings below are now closed. The production build passes **268/268**;
> file persistence is atomic/failure-aware and corrupt state fails closed; the
> audited showcase capability paths are blocked and its public fixture is isolated;
> client erasure is retryable and de-identified; staff Team Chat works through the
> proxy and rejects stale responses; all eleven Website Editor management routes
> render across the corrected client/server boundary; Page SEO/Element Insert and
> editor transitions are target/discard guarded; the named client-bearing API slice
> and fabricated website default are fixed; Finance no longer writes currency state
> during render; the avatar input is named; and the Freelancer overflow is repaired.
> Editor AI's code/database schema contract is implemented, but a real deployed-DB
> two-process run remains pending because this environment has no `DATABASE_URL`.
> Current proof is **3,433 pass / 0 fail / 2 skipped across 3,435 selected
> non-security tests**, plus a green production build and live Account/Editor/erasure-
> gate checks. Use [checklist.md](checklist.md) for current status.
>
> **2026-08-26 Ecommerce correction:** issues #70, #71 and #73–#77 are now code- and
> behaviour-resolved; #69 and #72 have their non-security core complete. The strict
> server-authoritative checkout, transactional value/inventory, configured quote, durable
> order ledger, truthful reporting, archive lifecycle, versioned product authoring and unified
> Website Editor contracts pass a focused **39/39** gate with TypeScript clean. Guest/end-
> customer authorization and literal mounted/live-Stripe acceptance remain, so #69/#72 are
> partial rather than closed. Port 3032 was untouched.
>
> **2026-08-26 client-lifecycle correction:** issue #46 is code/behaviour repaired.
> One persisted, replay-safe operation now owns New Client, lead/contact/person
> conversion and linked-workspace creation from agency phase rows; incomplete setup
> is explicit and resumable, Epic Intro uses Website Editor plus the real Aqua
> starter, and the exact clients GET is restored. Dedicated proof is **4/4**, the
> wider gate **75/75**, and TypeScript is clean. Issue #56 is resolved: the nested
> lifecycle smoke follows current Aqua phases and `smoke:all` includes it. Literal
> mounted all-stage/failure/retry/reload acceptance for #46 remains. Port 3032 was
> not used or changed.

## Scope and live target

- Source root: `aquaCRM/portal`.
- Live target requested for browser acceptance: `http://localhost:3032`.
- The listener was confirmed as `next-server (v16.3.0)`, PID 70088, with this
  portal as its working directory.
- Route inventory at the checkpoint: **110 page files** and **222 route-handler
  files**. This includes canonical pages, role-specific shells, detail routes,
  previews, legacy aliases and redirects; browser evidence must distinguish them.
- Workers were editing concurrently. Every result below is a checkpoint, not a
  claim about later edits.

## Automated evidence

On 2026-08-24 the broad smoke run excluded the 13 files explicitly centred on
authentication, MFA, sessions or their supporting security gates. It ran with
`PORTAL_BACKEND=memory` and `NODE_OPTIONS='--conditions react-server'`.

- **3,428 passed**
- **0 failed**
- **1 skipped**
- **620 suites**
- Skip: the live Postgres backend check, because `DATABASE_URL` is not set.
- TypeScript: `tsc --noEmit` passed.
- Production build: **failed** at Next 16's generated route-contract validation.
  `src/app/api/portal/dev/projects/route.ts` exports an optional request parameter;
  the generated type requires a `Request`/`NextRequest`. A temporary-copy-only
  required-parameter correction made `next build --webpack` finish, including
  **268/268** static-generation entries. The workspace source was not changed.
  Vercel's checked-in build command would reject the current deployment, but there
  is no checked-in GitHub workflow providing an earlier production-build gate.
- `git diff --check`: clean at the source-review checkpoint.
- Post-documentation parser regression: the original focused set passed **67/67**;
  after the later stale-history reconciliation, a broader documentation/Dev-Team
  parser set passed **148/148**. The previous full local Markdown-link scan remains
  the latest link proof; this checkpoint did not promote it into a new run.
- Focused account-creation/source semantics: **35/35 passed**. This proves the
  intentional absence of standalone signup, the JSON agency-bootstrap contract and
  the published-site lead branch; it is not visual acceptance of a reachable form.
- Radar sweep-isolation recheck: **5/5 passed**. The Pulse performs no network I/O
  and writes none of the Radar state collections; the Deep sweep with no live target
  writes nothing. A duplicate roadmap item still claiming both tests fail was stale
  and was removed; the shipped Radar plan and dated update remain the evidence.
- Canonical non-security status history was reconciled against current source and
  focused evidence. The Command Centre `ClientsNeedingAttention` panel is mounted;
  the You-Deserve-It expense bridge is built and behavior-tested; `stripe@22.5.0`
  is installed; and the Plans create UI now sends JSON plus an idempotency key.
  Contradictory dated wording in `status.md` and `todo.md` is now explicitly marked
  as a historical checkpoint instead of reading like a current blocker.
- Aqua Tag documentation was reconciled across its plan, dossier and current
  workspace/API source. The management UI and core wizard slices are shipped;
  the separate remainder list now names the five real edges instead of calling
  the UI, repo/editor link and company routing “not built”.
- Focused Leads Pipeline, Scouting, Health Check integration, Journey meeting and
  feature-walkthrough coverage passed **81/81**. The run exercises happy-path service
  behavior and source contracts; it does not cover the identity or financial races
  reproduced below.
- Focused Agency Marketing module, funnel-asset, customer-profile, intelligence, date,
  journey and consolidated-view coverage passed **114/114**. It covers happy paths but
  not whole-array concurrency, email re-key canonicalisation or mixed-currency reports.
- Focused Agency Settings, managed integrations, production readiness, activity,
  Showcase, Calendar/Google OAuth, transactional email, Portal Editor and client-service
  coverage passed **134/134 across 20 suites**. It proves current happy-path/source
  contracts but does not cover connection activation/scope, mounted form consumption,
  settings-to-outcome behavior, staff control/API coherence or post-create Calendar faults.
- Isolated memory/fake-provider probes, not shared CRM data, reproduced those gaps: a
  failed Resend replacement became selected, one client's SMTP sender resolved without
  client context, client-scoped Meta did not configure Inbox, a saved 30-day portal value
  still produced a three-day alert, and two retries after remote Calendar success plus
  refresh failure issued two Google event creates.
- Focused Inbox, Actions, Calendar and Contacts coverage passed **248/248 across 49
  suites**. The green chain covers the ordinary service and source contracts, but not the
  identity collision, webhook recovery, local-file durability, concurrent/out-of-order
  inbound delivery or multipart partial retry originally reproduced below. Invalid task state
  is now closed at finding 84.
- Fresh isolated memory, temp-file and fake-provider probes accepted one person's email
  on another Contact and redirected later lookup/enrichment; left a claimed Meta event
  permanently `processing`; replaced malformed local Inbox state with an empty store;
  undercounted concurrent inbound unread state and regressed timestamps on late delivery;
  redelivered successful text after a later attachment failed; and persisted an impossible
  Actions status, priority and date ordering. Finding 84 records the completed repair. No shared
  CRM file or provider was changed.
- Focused Journey, Fulfilment and client-lifecycle coverage ran **200 tests across 26
  suites: 189 passed and 11 failed**. The ordinary script chain is 189/189. All 11 failures
  come from the already-recorded nested Fulfillment lifecycle suite asserting its retired
  six-stage model, re-confirming issue #56. Isolated memory/route probes then reproduced six
  additional gaps hidden by the green happy paths: concurrent conversion created two
  clients for one lead; product-stage board and client workspace diverged; two acknowledged
  workspace writers lost one update; mixed-currency plans became one GBP total; Advanced
  Fulfilment tasks were browser-local only; and payment-plan invoice retry double-billed one
  milestone. The invoice fault run used the real handler/Finance container and produced two
  invoices totalling £2,500 for a £1,250 milestone. No application source, shared CRM file
  or real provider was changed.
- Focused customer-facing portal coverage ran **355 tests across 55 suites: 354 passed and
  one file failed before assertions**. The failure was not a customer-data assertion; it was
  one instance of the Website Editor package boundary. Running all 49 nested Website Editor
  smoke files directly passed 17 file processes and stopped 32 before assertions on root
  named exports, React server-condition exports or `react-dom/server`. The package's own test
  command aborts on its first file and the root smoke gate excludes the directory, so issue
  #106 records a verification-gate defect rather than claiming a mounted runtime failure.
  Source review also widened issue #103 to the customer Billing invoice headline and added
  issue #107 because suspended relationships are always labelled active. No application
  source, shared CRM file or real provider was changed.
- Focused People, staff and Agency HR coverage passed **60/60 across four suites**. Isolated
  route/service probes then persisted impossible employee/pay/leave/shift/training state and
  two employee ids with one canonical email; created independent same-person employee/leave
  records in People and Agency HR; and proved a People pay edit never reaches its linked
  Finance compensation profile nor vice versa. Source sequencing also proves staff identity
  provisioning is remote-first without a durable provider-result adoption step. Freelancer
  review confirmed the agency can preview the workspace, but the person receives no usable
  setup path and enabled Deliverables/Upload/Message capabilities have no rendered consumer.
  These are issues #108–#112. Probes used memory/test-only identities; no app source, shared
  CRM file, Supabase account or provider was changed.
- Focused non-security Agency Finance coverage passed **92/92 across two suites**. Fresh
  container/barrier and fake-event probes then reproduced duplicate invoice numbers; draft and
  paid-invoice payment acceptance/overpayment; invalid money-domain values; split plan
  assignment; duplicate recurring occurrences; incompatible MRR/income/expense reports; and a
  partial refund that marked the full invoice refunded without reversing its payment. Mounted-
  source tracing also confirmed invoice create omits its idempotency key, Finance settings do
  not control the promised invoice defaults/output, and client payment schedules are separate
  from the unassignable Finance Plan model. These are issues #113–#121. Probes used isolated
  memory and fake Stripe-shaped events; no app source, shared CRM file or provider was changed.
- The Memberships, Affiliates and Ecommerce built-in package suites passed **36/36 across
  six suites** on 2026-08-25. Fresh real-service probes then reproduced a paid→free local
  Membership overwrite with provider billing left live, a pre-seen webhook retry drop, two
  payouts owning the same commissions, mixed-currency/unrefundable Affiliate accounting,
  invalid commercial rows and concurrent duplicate affiliate/code identities. Mounted source
  also has no Affiliate payout-schedule caller. These are issues #122–#127; Ecommerce's prior
  #69–#77 were open at that checkpoint. All probes were isolated in memory and changed no app source, shared
  CRM file, browser state or provider.
  **2026-08-26 correction:** #122 and #123 are now code- and behaviour-complete under durable
  subscription commands and a scoped retryable webhook inbox. Dedicated proof passes **6/6** and
  the widened gate **53/53**. #124 is also code- and behaviour-complete: exclusive recoverable
  payout scheduling/completion and mounted-source proof pass **3/3**, with the combined Membership/
  Affiliate gate **70/70**. #125 is now code/behaviour resolved with currency-bound payout and
  refund-offset proof **3/3** (widened **79/79**). Production Stripe/Connect #33/#45 and mounted/
  live-provider acceptance remain. #126 is code/behaviour resolved by byte-identical refusal proof
  **3/3** (widened **82/82**). #127 is resolved by durable identity-first claims, collection locks
  and replay-safe counters; multi-container fault/race proof passes **4/4**, focused **27/27** and
  widened **86/86**. **2026-08-26 Ecommerce correction:** #70, #71 and #73–#77 are
  code/behaviour resolved; #69/#72 have their non-security core complete but retain public-route
  and mounted/live-provider acceptance. Focused proof passes **39/39**.
- The Company, Governance and Performance focused source chain passed **221/221 across 33
  suites** on 2026-08-25. An isolated real report-route sequence then proved that generating
  the same month after publish reused the id, reset the row to draft and removed it from the
  customer-visible history (#128). A separate real-service probe retained duplicate experiment
  variant ids, a 250% result and incoherent complete→running timestamps (#129). **2026-08-26
  continuation:** both code/behaviour boundaries are repaired with dedicated **6/6** proof;
  mounted two-tab/live-event/reload acceptance remains. Company portal
  phases 1–3 remain honestly planned/incomplete rather than a newly discovered regression. No
  shared state, provider, browser or application source was changed by the probes.
- The Command Centre/Radar, Advisor/Assistant, attention/notifications, universal-search,
  Notepad, Portals, SOP, Automation and Tools focused chain passed **199/199 across 26 suites**
  on 2026-08-25. An isolated real Assistant route with a fake provider returned 500 only after
  persisting a one-sided user turn and its `remember...` memory; normal first-message retry then
  created a second conversation (#130). **2026-08-26 continuation:** client-stable leased turn
  operations, stored provider result and atomic visible pair+memory commit repair the code/domain
  boundary with dedicated **7/7** proof; literal provider/browser fault acceptance remains.
  Scheduler/source tracing also proved that Radar Evidence
  declares an hourly cadence but runs only on manual or daily sweeps, while the daily multi-agency
  loop repeats app-wide Infra per agency and makes each evidence rollup depend on its success
  (#131). Existing Automation #49 and Notepad #54 remain open rather than duplicated. No shared
  state, browser, provider or application source was changed.
- The portal landing/role-shell, account/profile, customer setup, connection handoff,
  navigation, theme and transition chain passed **211/211 across 45 suites** on 2026-08-25.
  Repository-wide caller and dependency checks then proved that the advertised monitoring and
  request-log wrappers are mounted nowhere, Sentry is not installed and a DSN string alone still
  marks readiness ready (#132). Agency-staff Account/Permissions exits are now repaired, while
  client/freelancer destinations and the portal 404 remain agency-biased (#133); first-run setup
  permanently removes its install scene after password completion and points later users to absent
  Support guidance (#134). The connect cutscene/code/handoff source remained coherent; browser
  acceptance is still pending. No application source, shared state, browser or provider changed.
- A source-wide responsive/accessibility/loading-state pass found **64** true modal declarations
  across **50** TSX files. Only three of those files use the existing focus-containment/
  restoration hook; 47 modal files remain untrapped and only four of those handle Escape (#135).
  The sole Command Centre route-loading status is nested below an `aria-hidden` root (#136).
  `smoke-ux.mjs` also uses 375/768/1280 only as User-Agent labels around repeated HTTP/HTML
  checks, not browser viewports, so it cannot prove responsive layout or interaction (#137).
  All 12 declared tablist files and nine production menus omit their composite arrow/roving
  keyboard model; Settings targets missing panels, the editor page picker has no listbox item
  navigation and `useArrowNav` has zero production callers (#138).
  A conservative AST pass and manual review then confirmed at least 13 visible internal icon
  actions without a name plus placeholder-only visitor fields in published Contact, Booking,
  Newsletter, Product Search and custom Donation blocks (#139).
  A controlled Europe/London clock then reproduced UTC-derived previous-day defaults at 00:30
  BST across mounted client, Finance, HR and People flows (#140). Next 16 package/source tracing
  also proved the custom `app/error.tsx` is not the root fallback: without a project
  `app/global-error.tsx`, root-layout/App Router failures use the framework's built-in screen
  (#141). Port 3032 answered the manifest in 0.16s and an unauthenticated agency redirect in
  1.03s during this checkpoint; these HTTP timings are not an authenticated browser pass. The
  served manifest and asset inventory also stop at 192px, below Chromium's 192px-plus-512px
  requirement for the `beforeinstallprompt` event that setup depends on (#142).
  Default Share Buttons and auto Breadcrumb then produced divergent static/client first renders:
  empty social URLs and no breadcrumb on the server, followed by `window`-derived client values
  that React 19 does not safely patch during hydration (#143).
  No application source, shared state, browser or provider changed.

The shared file-backend state did not change during the source/test pass:

`2d48e30b76d880fce52829f7257a58f74178d04b05f18df2e3f5519cb98654c8`

These tests include substantial behavioural coverage, but many UI assertions
read source or render functions in isolation. They are not browser acceptance.

### Client-id dataflow review

All **22 concrete portal route files** pinned by `smoke-app-route-tenancy` as
accepting a request client id were reviewed handler by handler.

- Client Portal Design, erasure, client Radar, portal connections, erasure preview,
  payment requests, performance reports and Search Console require a real scoped
  client where they write client state.
- Customer workspace switching uses an explicit accessible-portal allowlist. Phase
  application, pipeline moves, product rollout, direct integration settings and task
  creation validate ownership in their service/store layer.
- Activity Inbox, Connections GET and Performance Experiments GET tolerate a missing
  match only as a read/filter result.
- Identity Resolution, Inbox identity linking, People freelancer jobs and Dev Projects
  take the helper's `.clientId` without requiring `.client`, so a nonexistent id can
  be persisted.
- Performance Experiment POST and generic Plugin Settings are the two confirmed
  foreign-real-id bypasses. The isolated probes returned **201** and **200** and
  persisted the supplied foreign references under the caller's agency.

This is why the current whole-file regex is insufficient even though it stays green.

## Browser acceptance matrix — continued 2026-08-25

The failed-tab blocker from the first checkpoint was cleared with an isolated local server. It
used `.data/portal-state.ultra-review-20260825.json` and `.next-ultra-review-20260825` on port 3032;
the shared CRM file remained byte-identical. The pass was deliberately read-only: no form was
submitted and no record, provider, save, delete or erasure action was invoked.

| Area | Browser evidence now held | Still not proven |
|---|---|---|
| Public site and public tools | `/`, Business OS, Client Centre, Health Check, Portfolio and its two case studies, Resources/Tools and Careers rendered on desktop; root, Login, Forgot Password, Careers and the iframe-based Health Check were also visually checked at 375px. No route-specific console error or page overflow was found. | Visitor form submission, download/action outcomes and published lead capture remain unexercised. |
| Login and recovery | A real sign-out exposed Login and Forgot Password; Magic Link without a token returned an honest login error, Reset without a token showed its missing-token state, and signed-out `/setup` and `/portal` redirected to Login. | Security mechanics remain excluded. A successful real recovery, password change and role landing were not performed. |
| Account creation | The absence of standalone `/signup` remains intentional and source-tested. Public lead/embed entry surfaces rendered where reachable. | No lead or end-customer account was created because that would mutate state; enabled form submit, email and reload acceptance remain. |
| First-run onboarding | Signed-out setup routing was checked. | Password/install completion, prompt accept/decline, close/reopen and later revisit remain unproven because they require lifecycle mutation; issues #134 and #142 remain. |
| Portal entry and global shell | Owner/agency plus seeded staff, end-customer and freelancer personas were opened through their real shells. All ten Team stations, the complete customer navigation/plugin set and the freelancer job view rendered. Representative shell routes passed at 1280×720, 768×1024 and 375×812 except for the eight-pixel desktop Freelancer overflow recorded under #137. Agency-staff Account/Permissions exits are now separately browser-proven. | A true client-owner/client-staff persona remains unproven. Client/freelancer and portal-404 role-aware exits in #133 remain. |
| Agency Command Centre and command platform | Agency home, Command Centre, Performance, Radar alias, Assistant, Portals, Portal Editor, Forms, Notepad, Activity Inbox, You Deserve It and product/phase/detail aliases rendered and navigated. | Battle/provider outcomes, saved mutations and reload semantics remain. Existing issues are not closed by render evidence. |
| Inbox, Actions, Calendar and Contacts | Inbox, Actions alias, Contacts list/detail, Calendar and related agency views rendered without route-specific console errors. An Add task dialog was opened and closed without submission; its visible naming was coherent. | Create/edit/delete/filter persistence, deferred-order behavior and provider delivery remain. Demo Inbox contains no live enquiries/social conversation, so #150 remains source-proven rather than browser-activated. |
| Journey, Fulfilment and client lifecycle | Fulfilment, clients list, a client detail, every visible client tab and Client Settings rendered. Phase, product and technical-project detail routes were also followed through actual UI targets. | Client creation/conversion, phase movement, editor save/reload and cross-tab write behavior remain unexercised. |
| Client portal and customer workspace | Agency client preview plus the existing customer Overview, Files, Billing, Support, Details, Project, Orders, Bookings, Account and three service routes rendered. Optional Membership and Affiliate routes also rendered their current states. | Data-changing upload, support, payment, membership and service actions remain. Suspended/alternate-account fixtures were not switched. |
| People, staff and freelancer workspaces | Owner-side People, Freelancers and Freelancer Access rendered; the seeded staff persona rendered My Day, Actions, Calendar, Onboarding, Leave, Training, Pay, Notes, Progression and Chat, and the seeded freelancer rendered their assigned job. | At this checkpoint Staff Chat's API was refused by the proxy (#25); that blocker was repaired on 2026-08-25. People validity #108, People/Agency HR ownership #109, linked compensation #110, resumable staff provisioning #111 and real freelancer setup/shared work #112 are resolved at their documented service/handler boundaries. Mounted provider/browser mutation and reload acceptance remains. |
| Finance | Every Agency Finance page and invalid invoice detail rendered; representative desktop, tablet and phone layouts stayed within the viewport. Opening the demo overview persisted the lazy `ukDefaultCurrencyV1` flag to the fenced copy, behaviorally proving the hidden render-write class in #21. | Invoice/payment/plan mutations, double-submit/reload and real Stripe Checkout/webhook/refund remain unproven. |
| Memberships, Affiliates and Ecommerce | Every installed admin page rendered for the fenced demo client, including Memberships and Affiliates; their customer destinations also rendered the free-plan/enrolment states. Every Ecommerce admin path plus honest invalid product/order/customer details rendered for the active client. | Paid membership, affiliate payout/Connect, checkout, order and other data-changing/provider lifecycles remain pending. |
| Company and Performance | Agency company-adjacent routes, Performance and experiments-facing navigation rendered where present. | Governance was intentionally skipped with security. Report publish/regenerate and experiment mutations remain unexercised. |
| Marketing and Aqua Tags | Agency Marketing, Marketing, Inbox/config-adjacent and Development website surfaces rendered. | Campaign delivery, source routing and tag/provider mutation outcomes remain. |
| Development and Dev Team | Development, Website, Workflow, Code, Performance, Toolkit, Vault and their technical aliases rendered. Dev Team home, Roadmap/Tasks, Findings/Auditor, Docs/Editor, Chat, Logs/Library/Updates, Notes, Tools/API/Inspector, Working and New Plan rendered or redirected to their canonical views. | The pass recorded the old 5–9-second warm baseline. #151's code now coalesces both live indexes behind a generation-safe 15-second bound, invalidates in-app doc saves immediately and excludes `.next-*`; browser route re-timing and outside-edit visibility acceptance remain. No plan/doc was saved in this browser pass. |
| Dev Editor | The real Website Editor for the active client rendered after its initial cold load at desktop and 390×844; its horizontally scrollable toolbar stayed within its own container. Portal Editor and template preview/editor routes also rendered. | At this checkpoint all eleven management routes failed at the Server-to-Client boundary; that #153 crash was repaired and browser-rechecked on 2026-08-25. Save/reload, deliberate dirty-state transitions, provider results and secondary effects remain. |
| Settings and integrations | Agency Settings, Portal Editor and connection/handoff routes rendered without exposing secrets. | Credential activation, scope, provider delivery and settings-to-outcome behavior remain. |
| Showcase | Not opened. | At this checkpoint `/showcase` reset a shared fixture on GET, so the read-only pass did not visit it. Public showcase now uses a separate seed-once tenant and the audited mutating capabilities are blocked; the broader #21 read-mutation inventory remains. |
| Responsive, accessibility and console | A genuine viewport matrix ran representative public, agency, client, customer, editor, Dev Team, staff and freelancer surfaces at 1280×720, 768×1024 and 375×812 (editor additionally 390×844). Phone/tablet layouts were coherent. The customer and owner Account trees corroborated #139's unnamed shared avatar input. | Freelancer alone overflowed the desktop viewport by eight pixels because its 24px shell padding meets the global 32px negative canvas margin (#137). Keyboard focus trapping, composite navigation, screen-reader announcements, installability, date boundaries, forced errors and automated axe/tree coverage remain. |
| Client-workspace not-found | A clean invalid client Website Editor deep link rendered the expected custom 404. Current code replaces both raw root bootstraps with identified Next 16.3 `beforeInteractive` components while preserving their storage behavior and the pre-chrome missing-client guard. | Dedicated **4/4**, focused **23/23**, wider **125/125** and TypeScript pass. Browser-repeat valid, missing client/editor and generic-404 direct/client transitions with zero console errors before closing #152. |
| Private media, countdown, response ordering and provider stalls | #146 countdown and #147 response-order code/service behaviour are repaired. #148's named storage/provider paths now have typed budgets, cancellation and safe/same-key/reconcile-first recovery; focused provider proof is **37/37** and the widened gate **169 passed / 1 skipped**. #144–#145 remain. | Record/play/seek, mounted timer expiry/hydration, mounted reversed responses and mounted/live-provider stall/reconciliation still need controlled acceptance. |
| Customer Bookings | The 2026-08-25 browser proved the old unconditional link/holding card. Current code now derives Account activity from registered, exact-client enabled operational capabilities; Bookings stays hidden even under stale install claims, while its direct URL remains honest. Focused proof is **4/4 + 2/2**, surrounding **34/34**. | Re-run the customer browser for no-capability, Orders-only and direct-Bookings states before #149 is Shipped. No enabled booking behavior is claimed. |
| Social Inbox header actions | Current source removes the no-op More ellipsis; Assign and Close/Reopen remain native buttons with real mutations. Dedicated proof is **2/2**, focused **15/15**, wider Inbox/Search **53/53**. | No active social conversation exists in the isolated demo fixture, so desktop/mobile appearance and focus order remain the #150 acceptance residue. |

The continuation reconciled this ledger against all **110 current page files**. Each page-file
surface was reached through a concrete/canonical route or checked with an honest invalid-token/
not-found state; catch-all plugin hosts were expanded across every installed first-party manifest
path rather than counted once. No user form, save, delete, provider or erasure action was submitted.
The shared CRM file stayed byte-identical; the fenced copy recorded the hidden Finance render write
described under #21.

## Findings confirmed at this checkpoint

The numbered list below is retained as 2026-08-24 evidence. Items closed by the
2026-08-25 remediation are identified in the current override at the top.

1. File persistence failure paths are behaviorally reproduced. An isolated invalid
   target raised `EISDIR` while `flushPendingWrites()` resolved and the backend still
   reported writable. A separate malformed JSON fixture hydrated as zero agencies,
   clients and users; the next mutation overwrote it with valid JSON. File saves also
   rewrite the complete blob synchronously and non-atomically.
2. Staff Team Chat is mounted in the employee workspace but blocked by the proxy
   before its staff-permitting API route runs. The seeded staff browser rendered the
   station's explicit proxy-refusal message while the other nine Team stations worked.
3. The Command Centre's expensive Radar/intelligence path is the default; its
   lighter performance path requires an opt-in cookie.
4. A TypeScript call-graph pass found **28 non-auth API GET handlers and 26 rendered
   page/layout files** with a reachable `mutate()` path, excluding hydration. The set
   includes intentional cron/OAuth effects and user-facing plugin provisioning,
   automation execution, materialisation, sweep, read-state and tracking writes;
   method-only or navigation-only read-only assumptions are therefore insufficient.
   `/showcase` also resets its shared fixture from navigation. The browser behaviorally
   proved one render mutation: demo Finance persisted `ukDefaultCurrencyV1` to the
   fenced review copy merely by opening its overview.
5. Stripe payments are durably idempotent, but refund/dispute event deduplication
   is process-local.
6. Production readiness is a configuration-presence indicator, not a live service
   probe, and optional features may remain offline while the headline says ready.
7. `.env.example` selects Supabase but omits the URL, anonymous key and service-role
   key required by a fresh Supabase setup.
8. The source at this checkpoint did not pass a production build. Ordinary `tsc` and smoke
   tests miss the generated route-handler contract because two tests directly call
   the Dev Projects `GET()` with no request. The temporary-copy proof isolates the
   required-parameter signature as the blocker in this checkpoint; issue #27 tracks
   the source/test change and release gate.
9. Performance Experiment POST bypasses the client-scope helper used by its GET.
   An isolated memory-route probe as an agency-A owner supplied agency B's real client
   id; the route returned **201** and persisted the experiment under A with B's id.
   The file-level tenancy smoke test remains green because it cannot distinguish the
   scoped GET from the unscoped POST. Generic Plugin Settings also accepts the raw
   request client id: a second memory-route probe returned **200** and created an
   agency-A Stripe connection tagged with agency B's id. Both probes used test-only
   data. Issue #20 records the behavioural proof.
10. Client erasure failure handling is behaviorally reproduced. An isolated fake
   Supabase client forced the inbox, `inbox_contact_identities` and
   `brand_enquiries` deletes to fail. `eraseClientCompletely()` returned all three
   failures only after deleting the local client; a second call returned no result,
   so the normal path could not retry. The permanent activity message retained the
   test client's name. The route source then unconditionally serializes any returned
   erasure result as `{ok:true}`. Shared state was not used. Issue #24 records the
   required durable, retryable and de-identified completion contract.
11. Referential-integrity gaps extend beyond client ids. An isolated memory-store
   probe persisted: `assigneeUserId:"missing-user"` on a task; `sopId:"missing-sop"`
   on a task checklist item; missing company, included-product and SOP ids on a
   product; a KPI target under `byCompany["missing-company"]`; and a freelancer
   access override under `missing-job`. The same task creation discarded a missing
   client and top-level SOP id, so behavior varies by field. Source review also found
   Inbox Connection PATCH forwarding unresolved company and marketing-asset ids to
   its store. The probe used only memory state; issue #20 now tracks entity references
   rather than client ids alone.
12. Mounted agency endpoints also accept unresolved semantic references. Finance
   expense writes validate category/budget but not client or staff; income accepts an
   unchecked client; invoices validate the client but not their separate company; and
   budget/obligation/profile writes retain unchecked company, legal-document, staff or
   department ids. The isolated Finance suites passed **5/5** with unseeded references.
   A fresh-process service probe then persisted missing HR user/department/manager/
   custom-role, nested assignment client/role and department-parent ids; Marketing
   campaign-owner, lead, content, touchpoint, asset/profile company and funnel-project
   links; Leads Pipeline campaign company/profile/budget/audience links; Client CRM
   end-customer/segment and Membership plan-benefit links; Email Sender identity/
   message client links; a Team Chat member; and a Task Template SOP copied into a
   created task. Source also carries an unresolved lead company into a converted
   client. The four focused built-in suites passed **82/82**.
   Earlier memory proof also retained missing custom-KPI operands, Custom AI ownership,
   Development resource workflow-stage/SOP/company links and People manager/training-
   SOP links. The same probe removed an HR department/role, Marketing campaign,
   Client CRM segment and Membership benefit while their staff, child-department,
   lead, content, touchpoint, contact and plan rows retained deleted ids; source shows
   Marketing profile/asset deletion also leaving Leads audience and Inbox-routing
   references. Issue #20 now requires each relation to be resolved, explicitly cleared, or
   covered by a deliberate stale-reference policy. Shared state was not used.
13. The website editor's client/API contract is incomplete. `EditorPage` exposes a
   funnel creator whose entire route family is absent; the block **Split** tab does
   the same for split tests. Publish/promote uses two different nonexistent paths,
   while the registered promote handler is at the exact module path and expects
   `siteId` in the body. `SitesPage` calls ten legacy top-level families, including
   config/embed/content/discovery paths whose implementations are registered under
   `website-editor`, plus absent schema/chatbot families. A direct route-table check
   confirmed the missing and registered contracts; the one registered promote
   handler is also only a deterministic pending stub and never opens a GitHub PR.
   The AI readiness probe gates only the top-bar Generate control: selecting an image
   still exposes variations and mask editing, which POST to absent `ai-builder` routes.
   Issue #28 tracks route plus durable-outcome repair and the class-level/browser
   regressions needed.
14. Published functional blocks can render while their business action is dead. The
   first-party Contact page template posts to missing `/api/contact`; Forms,
   Booking, Newsletter and Theme use absent families/paths; Blog and ecommerce
   blocks call authenticated portal APIs from visitor surfaces. These are
   palette/template surfaces, not unused helper ideas. Blog Post and Theme Selector
   also rely on host globals that no source assigns, leaving a JSON debug fallback
   and no theme site id. Membership failures become “no tiers”; Affiliate
   Leaderboard hides its missing route as “No data yet”; Affiliate Signup promises
   an emailed referral link although it only creates a pending row; and Donation's
   monthly option still submits the one-off checkout contract. Current tests stop
   at registration/markup. Issue #29 tracks public tenant-aware endpoints or honest
   removal/labeling plus visitor-to-durable-result acceptance.
15. Website export is not a working backup or migration path. The visible
   Customise control requests absent `/api/admin/export-code`; the separate static
   handler is not registered in the plugin route table. Calling its renderer
   directly on the first-party Homepage yields empty Hero, Product Grid,
   Testimonials and CTA shells, with only the nested heading preserved. The
   existing export smoke uses supported primitives and therefore misses both route
   reachability and representative content parity. Issue #30 tracks one honest
   export contract plus live-vs-exported acceptance.
16. Website Editor administration is split across disconnected stores. The main
   Sites station writes site creation, live/draft state, domains, primary selection,
   branding and custom code to browser-global `lk_sites_v1`, while server host
   routing uses a separate tenant store; its Vercel attach action also targets an
   absent `/api/portal/domains` route. Sections promises live homepage changes and
   Popup promises a storefront popup, yet neither has a runtime consumer. Customise
   branding, custom tabs, sidebar and login values are likewise read only within
   Customise. The registered Page Detail route uses a separate local page store,
   reads `params.id` despite a `[pageId]` manifest route, is not linked from the
   server-backed Pages list and has no `/p/[slug]` renderer. Issue #31 tracks one
   canonical tenant/site/page model or honest removal.
17. Campaign email delivery stops at the outbox. The Campaign service calls
   `enqueue()`, then marks the campaign sent and leads contacted; the adapter never
   invokes `DeliveryService.deliver()` and no worker drains queued messages. The UI
   reports “Sent X/Y emails,” while its readiness input is merely the enabled install
   that the page auto-creates, not provider readiness. Existing tests inject an
   enqueue recorder and therefore validate the false milestone. Issue #32 tracks a
   real delivery/queue contract and end-to-end provider-state proof.
18. Paid Memberships cannot reach Stripe in production code. Its foundation adapter
   always returns a throwing no-op Stripe object, which makes availability true;
   paid default-plan failures are swallowed, every paid lifecycle method fails and
   webhook verification returns null. The healthcheck still reports success from
   row counts. Tests inject a functional fake port and therefore miss the production
   adapter gap. Issue #33 tracks the real scoped adapter and test-mode lifecycle.
19. Email Sender treats its explicit disabled provider as successful delivery.
   Provider `none` is labelled “disable real send,” but the no-op driver returns a
   synthetic success; delivery marks the row sent, emits the normal event and
   promotes the provider active. Health accepts any non-error provider, so the
   resulting system can look green without one network request. Existing smoke
   coverage asserts that exact synthetic-sent result. Issue #34 tracks a distinct
   sink/dry-run state and capable-provider readiness semantics.
20. Plugin health is declared but not operational. Eleven built-in manifests expose
   healthcheck hooks, but no runtime path invokes them and the install patch contract
   cannot persist health fields. Radar counts only stored explicit failures, so the
   never-populated fleet becomes zero failures/healthy; it also substitutes install
   time for absent check time. Issue #35 tracks a real bounded runner, persisted
   freshness and no-false-green Radar semantics.
21. The client overview's Build custom portal wizard has no materialisation backend.
   It is the primary action for a product-assigned client whose portal folder is
   absent, but both requested `portal-export` routes belong to no current app route,
   package or registered module. Preset failure is swallowed, leaving plausible
   static choices before submit fails. Issue #36 tracks a real canonical builder
   and create/reload/open browser acceptance.
22. The client project lifecycle is real but not partial-failure safe. Provisioning
   creates and commits a local project before client metadata, so a later save failure
   leaves an untracked folder and retry creates a suffixed duplicate. GitHub creates
   its repository before remote setup/push/client metadata, and Vercel creates its
   deployment before metadata. Any later failure leaves an untracked result. Happy-
   path tests do not exercise those boundaries. Issue #37 tracks durable operation
   state, reconciliation and convergent retry across all three stages.
23. Private uploads have no convergent cross-store lifecycle across the platform.
   Nine routes write storage before the owning record or final user action; staged
   inbox/expense/campaign objects are not expired, and client-file/legal/SOP/
   development deletes suppress provider/local failures after record removal. A
   later record failure can also preserve a broken reference to a deleted object.
   The mounted product-workspace batch also processes only 30 files while claiming
   the full selected count, and late failure hides durable partial progress so retry
   can duplicate completed files. Current tests do not drive those failures or
   abandonment. Issue #38 tracks shared pending/error state, exact batch accounting,
   expiry, reconciliation and provider-specific retry acceptance.
24. Close Deal bypasses the contract workflow's minimum reviewability rule. Its two
   forms can create a title-only contract directly as sent; the customer portal then
   offers Accept despite no terms/document. No transactional delivery runs, but both
   success screens and the activity log say the contract was sent. Existing tests
   assert that state instead of customer-visible content/delivery. Issue #39 tracks a
   canonical reviewable version, truthful delivery and close-to-acceptance proof.
25. Commercial proposal delivery ignores the adapter's explicit result. The real
   Leads Pipeline adapter can return `delivered:false` after provider failure, but
   `CommercialService` still marks invoice/agreement sent and logs success; payment
   receipt handling similarly stamps `receiptSentAt`. Tests return only a message id
   and never exercise the failure result. Issue #40 tracks durable delivery states
   and failure/retry proof independent of the disabled-provider defect.
26. Commercial proposal acceptance is mutable and not send-gated. Saving a draft
   exposes its stable public token and public acceptance does not require sent state.
   After acceptance, the agency can overwrite agreement text, lines, totals and
   cadence while `accepted`/`acceptedAt` and an older Stripe Checkout URL survive.
   Tests amend only before send. Issue #41 tracks immutable sent versions, accepted
   content hashes, amendment resets and payment-session invalidation.
27. Commercial installments do not have a reliable stop contract. The final
   invoice webhook asks Stripe to cancel at period end but ignores the response and
   returns success, so Stripe will not retry a refused cancellation. Completion
   counts manual Stripe records too, while identical ceiling-rounded charges can
   exceed the proposal total. No webhook test covers this. Issue #42 tracks exact
   scheduling, durable cancellation state and provider reconciliation.
28. Email Sender cannot be configured for real delivery from its mounted product
   surfaces. Settings only reports state; the manifest omits the API key its help
   text requires; Postmark is not a shared integration; and no UI calls the provider
   or identity mutation routes. Its verify service immediately marks any identity
   active with no provider/DNS evidence, while tests call that stub directly before
   sending. Issue #43 tracks one canonical encrypted setup, real verification and a
   fresh-install browser walk through test delivery and webhook status.
29. Manifest settings are not a platform-wide usable contract. Twelve built-ins
   declare 51 fields, but only Finance mounts the generic editor; several custom
   Settings pages are read-only, other modules expose none and multiple declared
   fields have no runtime consumer. Email Sender also persists
   `defaultFromIdentityId`, while delivery ignores it and independently selects the
   row marked `isDefault`. Existing tests exercise the generic form only
   for Finance. Issue #44 tracks a reachable scoped editor or deliberate removal,
   consumer coverage and save/reload/behavior proof.
30. Affiliate Stripe Connect is implemented only behind an injected port that the
   live foundation never supplies. The customer page offers onboarding, but its
   route always returns not configured; refresh/webhook processing cannot run and
   no affiliate can satisfy the admin transfer button's readiness checks. Manual
   mark-paid is the only live payout path. Issue #45 tracks truthful capability
   gating plus a real client-scoped Connect adapter and test-mode round trip.
31. **Superseded 2026-08-26 — code/behaviour repaired; browser acceptance remains.**
   The original review found that the visible New Client modal bypassed the tested
   Fulfillment lifecycle, the exact presets route copied hard-coded defaults and
   setup failures could still be reported as successful creation. Agency phase rows
   now feed one persisted, replay-safe operation used by every mounted creation and
   conversion path; incomplete work is explicit and resumable. Issue #46 retains
   only the mounted all-stage/failure/retry/reload acceptance boundary.
32. Mutation failure handling is inconsistent across mounted product surfaces. A
   focused scan found 13 direct mutation fetches whose response is discarded,
   including Finance/affiliate mark-paid, subscription cancellation, inventory,
   leave approval and staff delegation. Several reload immediately; Finance “Issue
   now” also ignores its second status request. The later Actions/Calendar review
   found at least three more silent failure paths: task patch/delete do not expose
   refusal, and “mark attention done” removes the card locally even when its
   follow-up dismissal fails. A subsequent Team workspace, Products, Performance,
   Client Delight and legal-register pass found 18 more: staff task create/toggle,
   onboarding, leave, training/module, note-create/save, feedback and contract
   responses; product visibility; milestone create/update/delete; Client Delight
   update/delete/package visibility; and legal-record editing. That first raised the
   class to 34. The customer Membership/Affiliate pass added five distinct silent
   exception paths: billing-management refusal plus subscribe, enrol, Stripe-
   onboarding and Stripe-refresh transport/parse errors. Freelancer “Exit preview”
   adds another unchecked navigation after a possible refusal. KPI custom-definition
   create/delete and shared-view delete add three silent no-ops. Task-checklist
   template save, completed-register delete, portal-field save/delete, freelancer
   override save/clear and Aqua Tag unlink/injection toggle/remove add nine more.
   Freelancer preview entry adds one more path: detected failure only clears the
   “Opening…” state and displays no diagnostic. A later non-security pass found 47
   more mounted handler families across Development, phases, Identity Review,
   Company, Performance, SOPs and communications. A focused Finance pass adds 13
   previously uncounted handler families covering plans, income, invoice detail,
   pay-link/template/list issuing, recurring expenses, budgets, obligations and
   compensation records. A mounted Client Centre pass adds 15 file, direct-finance,
   onboarding, phase-transition and property handlers with the same rejected-
   request/parse gap. Commercial-pack save/action/payment, People Hub contact create,
   affiliate-code creation, ecommerce discount/product delete, two fulfillment
   checklist contexts, phase delete and Membership benefit/plan creation add twelve
   more. Calendar source/disconnect/delete/completion, task-modal create and
   governance legal-create add six more; Dev Team roadmap writing and storefront
   discount apply add two. Issue #47 therefore tracks at least 148
   paths, checked response envelopes, caught exceptions and forced-failure UI
   acceptance across the class.
33. Health Check scoring and its sample professional metrics are labelled honestly,
   but its final sharing controls do not hand off the result they promise. “Email
   me a copy” opens a blank-recipient draft containing a literal results-URL
   placeholder; “Get a shareable link” copies the unchanged page URL even though
   the completed state is not encoded there. A separate progress-save flow already
   generates and restores a seven-day `?resume=` payload, so issue #48 tracks
   connecting that real state-bearing link to the visible result actions and
   proving it in a clean browser session. PDF correctly uses the print flow.
34. Automation execution performs real email, task, activity and webhook actions
   and records action failures accurately in run history. Its mounted manual-run
   feedback does not: the API returns `ok:true` with a `failed` run and `runNow()`
   treats every non-waiting status as “Live flow completed.” Issue #49 tracks
   status-aware immediate feedback and a forced live-action failure regression.
35. The public Business OS assistant truthfully describes itself as scripted, but
   its mounted action catalogue still points at the retired public Incubator. Phase,
   bridge, company and recommendation chips target seven absent HTML files, while
   its human-assistance chips and footer use bare `https://wa.me/` with no recipient.
   Its visible Toolbox also unlocks five `/resources/*` tools after Health Check even
   though none of those routes exists. Issue #50 tracks the current mounted replies
   and cards plus a rendered-link acceptance pass; unused legacy helper scripts are
   not counted as live defects.
36. The rewritten public AquaCRM site is the actual mounted root, and its enquiry
   forms correctly wait for the real capture API before claiming success. Its
   homepage founder-film CTA is not complete: the visible “Watch the system at
   work” control has an empty `data-youtube-url`, no source assigns
   `window.AQUACRM_VSL_URL`, and activation reveals the internal setup message
   “Add the approved YouTube URL” instead of playing a film. Issue #51 tracks either
   connecting the approved media or making the unfinished control non-public, plus
   browser playback/fallback acceptance.
37. The newer React portfolio case studies clearly frame their mutable screens as
   interactive project tours, so their browser-local order, stock, shift and safety
   state is not represented as durable production data. One visible POS action is
   still dead: after products are added in the Ocean Boulevard tour, “Take payment”
   becomes enabled but has no click handler or outcome. Issue #52 tracks a truthful
   simulated result or removal. The separate AquaCRM static Projects page also
   chooses ports 3042 and 3043 for Ocean/Beast when viewed on localhost; neither
   companion server was listening at this checkpoint, so those two cross-project
   demos remain environment-dependent rather than browser-accepted here.
38. The public route family currently crosses visitor-facing brands without a
   deliberate handoff. `/tools`, `/health-check`, `/portfolio` and
   `/client-centre` render Milesymedia names, navigation and legal copy, but their
   shared Home and Contact links use `/` and `/#contact`; Next rewrites both onto
   AquaCRM's static homepage and enquiry form. The runtime public-site registry
   treats AquaCRM and Milesymedia as different sites and origins, so the internal
   note that old code identifiers share a tenant does not explain this visitor
   journey. Issue #53 tracks an explicit brand-aware route map or an honest
   co-branded handoff.
39. Notepad notes are agency/user scoped and the API flushes accepted edits, but the
   mounted editor's autosave lifecycle is not exit-safe. Each change waits 650 ms in
   a component-owned timer; only title/body blur forces an asynchronous save, with
   no unmount, `pagehide` or before-unload policy. A failed request shows “Retry
   needed” but offers no retry control. Issue #54 tracks a browser-proven navigation,
   tab-close and failure/recovery contract so the last edit cannot silently remain
   only in React state.
40. Existing-client phase movement is not a single reliable transition. The service
   mutates plugin installs, starter variant, client stage, checklist and activity in
   sequence without a persisted operation or rollback. A read-only isolated probe
   forced the final activity write to throw and observed `stage:"new"` plus the new
   plugin already installed despite rejection. Its intentional soft-fails are also
   invisible in the mounted controls: skipped preset plugins and failed starter
   variants can accompany `ok:true`, after which both controls simply refresh.
   Issue #55 tracks idempotent convergence and full partial-outcome acceptance.
41. The most relevant lifecycle smoke is not part of the green scripts-only gate and
   no longer matches production source. Current presets contain seven Aqua/churned
   stages, while the nested suite asserts six legacy stages and drives retired
   discovery/design/development/onboarding/live names. A direct run failed the seed,
   creation, hop, final-state, catalogue and soft-fail chain. Issue #56 tracks making
   the current lifecycle test truthful and canonical.
42. At least twenty-eight mounted read paths replace failure with empty/default/stale data: both website-
   source panels; customer and staff client-record inbox/enquiry reads; direct-
   customer and sibling-workspace invoices; contact interactions; and Marketing Meta
   connections, KPI custom definitions/shared comparison views, completed history,
   alert evidence, three Portal Editor configuration reads, Finance expense custom
   fields, the commercial pack/product catalogue and manual enquiry-contact details. The
   resulting panels state “none,” omit agency-wide registry content or otherwise
   continue rather than saying “unavailable.” Direct-
   customer invoice failure can claim the plan and invoices are current; sibling
   invoice failure becomes zero outstanding and can contribute to the visible
   “Operations clear” account state. A failed manual-detail load presents a valid
   blank editor, while its Save replaces the whole stored company/title/notes/custom-
   field record. Failed resolution-plan/explanation reads become `null`; workspace
   and Development search can claim no matches; Identity Review can show the newly
   selected queue against stale data; and phase-catalogue failure removes transition
   controls; governance scope change can label the previous company's snapshot as
   the newly selected company and leave loading active. Issue #57 tracks first-class availability,
   retry and a ban on health/clear derivation from failed evidence.
43. Client contract capture is checked and reports its optional template failure,
   but the two-step retry is not convergent. The first request has already created a
   random-id draft; the second template request can fail; the still-open editor has
   no returned contract id and retries the first request as another create. Issue
   #58 tracks independently retrying/coordinate-idempotently and proving one draft
   plus one template after failure, retry and reload. Binary-orphan handling remains
   in the broader private-upload issue #38.
44. Every built-in customer-portal page builds the complete aggregate twice: once
   in `layout.tsx` for chrome/stage/attention and again in
   `CustomerPortalView.context()` for the body. The loader is not request-memoized,
   and the two calls use different fallback-name arguments. In production each run
   can issue the Finance invoice list, raw website-enquiry query and four-query inbox
   snapshot, so one screen can fan out to 12 backend reads and independently timed
   chrome/body state. Issue #59 tracks one shared request snapshot, query call-count
   coverage and actual browser latency evidence.
45. KPI Intelligence calls its Phase-4 targets server-persisted, but edit, reset and
   suggested-target acceptance update React/localStorage first and discard the
   canonical POST result. Initial server-load failure is also suppressed. The same
   browser can therefore preserve the new plan while the server and a second session
   retain the old one; #16 means the file route can also acknowledge a detached failed
   write. Issue #60 tracks authoritative acknowledgement, visible pending/failure and
   two-session convergence across edit/reset/suggestion retry.
46. Five non-mutating utilities have a separate settle-state defect. Task Template
   load, Development “Show 36 more”/credential reveal and Performance Search Console
   checking can remain permanently busy after a rejected request. Client Systems'
   Copy Tag action writes the same snippet twice, so the first clipboard write can
   succeed before the second failure suppresses the copied state. Issue #61 tracks
   one checked attempt, guaranteed cleanup and visible retry/error acceptance.
47. The visible Leads board says “Archive” but the mounted operation permanently
   deletes the lead row, email/phone pointers and index entry. It has no archived list
   or restore path and never calls the foundation's existing `deleteCard()`. A fresh-
   process memory probe created a lead plus linked card, ran the deletion and observed
   the lead absent while `listCards()` still returned the exact card id and snapshot.
   Issue #62 tracks honest recoverable/archive semantics and one convergent lead/card
   lifecycle across reload and partial failure.
48. Membership and Affiliate destructive parent deletion can silently break active
   operations. An isolated Membership probe deleted a plan while its subscription
   row retained the plan id; the admin subscriber list fell from one to zero and
   benefit access fell from one to zero. The route does not reconcile external
   billing despite a separate soft-archive service method. A second probe deleted an
   Affiliate while its active code, approved attribution and scheduled payout all
   retained the missing parent id. Issue #63 tracks archive/removed semantics or one
   explicit dependency-safe retention/cascade operation, with billing/payout, reload
   and retry acceptance.
49. SOP deletion is similarly destructive but reaches core operating knowledge. The
   mounted library shows a permanent-delete confirmation with no dependency preview;
   `deleteSopRecord()` removes only the source row. A fresh memory probe left one
   guide, task and product holding the deleted id. Guides show a missing step, while
   task badges, product/process counts and client delivery silently filter it out.
   Issue #64 tracks dependency inventory plus archive/reassign/transactional-detach
   semantics and downstream reload/failure acceptance.
50. Company Capital calls itself an authoritative cap table and governance register,
   but its server cleaner validates nested rows independently rather than validating
   the register. A fresh memory round-trip retained duplicate share-class and owner
   ids, an owner assigned to a missing class, completed movement and dividend links to
   missing owners/approvals, £250 paid and £300 allocated against a £100 declaration,
   and a decision with 80% for plus 70% against. Simulating the mounted owner/decision
   delete controls then left the movement and dividend references behind. Issue #65
   tracks unique ids, referential and arithmetic invariants, dependency-safe retirement
   and mounted API/browser acceptance for this financial/governance source of truth.
51. The wider Battle Table persists every executive station through one unversioned
   whole-`CompanyProfile` replacement. `updatedAt` is returned but never compared, so
   a fresh two-snapshot probe saved tab A's mission and then tab B's vision from the
   older snapshot; the second accepted save silently restored the mission to blank.
   The same contract undermines the quarterly “Lock review” promise: the mounted
   editor deliberately turns a completed record back into a draft on change, and a
   fresh round-trip rewrote its decision and captured revenue while removing its
   completion timestamp. Issue #66 tracks focused/version-checked writes, immutable
   completed evidence versions and conflict/revision acceptance.
52. Legal & Compliance calls itself a controlled register and already has an archived
   state, but its mounted Delete permanently removes the register row before best-
   effort file cleanup and shows no dependency impact. A fresh process created one
   legal document, linked it to a Finance obligation and an approved Company governance
   decision, then deleted it; both dependants retained the missing id. Finance silently
   removes its Open-document link because it joins only current rows, while governance
   continues printing the raw document id as if evidence were linked. Issue #67 tracks
   archive-first/legal-retention semantics, dependency preview and explicit blocked,
   reassigned or transactionally detached outcomes across every consuming surface.
53. Governance's page-level company selector scopes the compliance-posture and HIPAA
   calculations but not the other views. `buildGovernanceSnapshot()` returns every
   agency legal row and declaration, derives sub-processor agreement flags from that
   unfiltered register and returns every agency client to the erasure picker. A fresh
   Alpha-scope probe with only a Beta Supabase DPA returned that Beta document, both
   brands' clients and `hasAgreementRecord:true` for Supabase. Issue #68 tracks explicit
   agency-wide versus company-scoped view contracts, shared-record rules and a browser
   scope walk that never borrows another brand's evidence or destructive target list.
54. Ecommerce's mounted Website Editor payment block and its Stripe handler do not share
   one checkout contract. The block submits product/variant ids, `priceCents` and per-call
   return URLs from a localStorage cart; the handler checks only that `lineItems` is a
   non-empty array, expects `amount`/`currency`, ignores those return URLs and forwards
   the resulting fields directly into Stripe. The checkout route also declares no
   shopper audience, so its effective runtime roles cover workspaces but not the guests
   or end-customers that the published block says it serves. A second Cart implementation
   sends the handler's expected shape but still supplies price, currency, quantity,
   product copy and coupon value entirely from the browser, with no catalogue, variant,
   stock or discount re-resolution. Issue #69 is therefore a P0 launch blocker covering
   one versioned storefront contract, the intended audience, server-authoritative totals,
   atomic inventory reservation, durable checkout operations and paid-webhook matching.
55. Ecommerce discount application spends value before any payment exists. A fresh
   isolated service probe applied £70 of a £100 gift card without creating an order,
   then a direct replay spent the remaining £30; the stored card ended at zero with two
   redemptions. Removing the code, abandoning Stripe or failing payment has no correlated
   release. The same probe applied a custom `maxUses:1` code twice while its stored use
   count remained zero because `incrementCustomUse()` has no caller. The storefront
   gift-card form also calls Issue before adding the card to the unpaid cart, so the
   recipient gets spendable value even if Checkout is abandoned. Issue #70 tracks a
   reservation/commit/release and issuance ledger tied idempotently to paid order state.
56. Ecommerce product retirement bypasses its existing archive state. The mounted list
   loads archived products but also offers permanent Delete; `deleteProduct()` removes
   only the product and override. A fresh isolated probe deleted an archived product
   while its SKU inventory (`onHand:8`, `reserved:3`) and collection membership both
   survived. Combined with #69, a stale browser cart can still describe the missing item
   to Checkout. Issue #71 tracks archive-first retirement, dependency preview and an
   explicit transactional purge/tombstone policy preserving order history.
57. The Website Editor commerce-block bridge is contract-fragmented independently of
   the visitor route gate already tracked in #29. Its catalogue hook expects `{items}`
   while Ecommerce returns `{products}`, so Product Grid/Card resolve an empty catalogue.
   Add-to-cart buttons only render `data-portal-add-to-cart`; no listener exists. The
   Variant block casts Ecommerce's `optionValues` model to a different `options` shape,
   and Order Success calls an unregistered by-session route then expects item `price`
   where stored orders use `unitAmount`. Search is the lone block accepting `products`,
   but its server ignores `q` and `limit`. Issue #72 treats the advertised storefront as
   P0-incomplete even after #29/#69 are fixed and requires one tenant-aware block contract.
58. Ecommerce inventory is one mutable SKU counter, not a reservation ledger. A fresh
   handler probe set five units on hand: cart A set reserved to three, cart B overwrote it
   to two instead of five, an empty map left two reserved, and a request reserved 99.
   A missing SKU was silently accepted with an empty errors array. An ordinary on-hand
   edit then reset reserved from 99 to zero and `lowAt` from two to five. The existing
   reserve/release/commit service methods have no callers, and paid order handling does
   not decrement stock. Issue #73 tracks per-operation atomic reservations, expiry,
   commit/release and admin adjustment semantics.
59. Shipping and tax configuration does not reach the charge. The Shipping page stores
   zones/rates and a pure calculator exists, but it has no caller; Stripe always uses six
   hard-coded countries, automatic tax and no configured shipping option. Meanwhile the
   published Checkout Summary advertises a hard-coded £3.50 and 20%, mixing major-unit
   shipping with a cart documented/stored in pence. Free-shipping codes and product tax
   behavior never reach the provider. Issue #74 tracks one quoted and charged breakdown.
60. Ecommerce orders are not a durable provider-backed state machine. Webhook event ids
   live in a process-local set and are marked processed before storage/side effects, so a
   failed first attempt can be acknowledged as deduped on retry. Checkout completion is
   marked paid without verifying payment state, optional absent line items become an
   empty order, and refund events ignore refunded amount. The mounted editor can move an
   order between any statuses without a Stripe refund or transition policy; a fresh
   service probe reopened a refunded order as paid while retaining `refundedAt`. Issue
   #75 tracks durable inbox processing, immutable provider facts and explicit operations.
61. Ecommerce reporting presents gross, cross-currency order face values as revenue and
   customer spend. A fresh service probe created £10 paid, £5 refunded and $20 cancelled
   orders. The dashboard reported 3,500 minor units revenue and a 1,167 average; Customers
   reported the buyer at 1,500 spent and the cancelled USD buyer at 2,000, while both
   mounted screens format aggregates as GBP. Issue #76 tracks status-aware, currency-
   partitioned gross/net/refund reporting with provider reconciliation.
62. Product authoring has unversioned whole-record writers and unstable identity. A fresh
   two-snapshot probe saved a £12 price in Product Editor, then a stale Variants save
   added a variant and silently restored £10. Renaming the slug created `original` and
   `renamed` products rather than moving identity/dependants. The mounted option-label
   edit also rebuilds values from labels only; the probe showed hex colour, £2.50 modifier
   and unavailable state disappear. Issue #77 tracks stable ids, explicit rename/migration,
   field/version-checked saves and lossless structured variant editing.
63. **RESOLVED 2026-08-25.** Public Funnel was not the mounted Health Check→BOS path its manifest described. The live
   3032 Health Check returned 200, but its only fetch posts optional contact details to the
   generic brand-enquiry API. Completion and BOS personalisation stay in same-browser
   localStorage, and every visible handoff is a direct link to the static BOS asset. That
   asset also returned 200 anonymously; its only identity fetch is `/api/auth/me`, which
   returned 401 in the same fresh probe. Repository-wide caller search found no production
   caller for `hc-complete`, `tool-complete`, Public Funnel `me-context` or BOS Auth Gate
   `me`. A direct registry probe returned `registered:false` for `bos-auth-gate`; no live
   foundation file exists, and middleware/proxy match only Portal/API paths. The manifest's
   claimed `/api/portal/business-os/me` also disagrees with the catch-all's plugin-id mount.
   The focused funnel/adapter/gate/BOS tests still pass **54/54** because they exercise
   isolated services/source markers and explicitly assert that this portal does not gate
   `/business-os`. Issue #78 now records the shipped state-bearing completion, real lead
   cookie, server-restored BOS context and truthful browser-only no-contact path.
64. **PARTIALLY RESOLVED 2026-08-25.** Public Funnel's isolated service was also not safe to retry or run concurrently. A forced
   second write left one by-id capture that neither index exposed. A deterministic two-call
   race stored two by-id rows and two email indexes but retained only one global id. A
   mounted-handler probe then forced session issuance to fail: it returned HTTP 400 after
   capture/index/event completion, and retry created a second capture and HC event. Issue
   #79 now records the shipped authoritative-row/stable-id/session-retry/503 repair and
   same-process concurrency proof. Database-native cross-process insertion and durable
   activity/event outbox delivery remain open.
65. **PARTIALLY RESOLVED 2026-08-25.** Leads Pipeline now refuses another live lead's
   canonical email/phone under an agency-scoped process lock, preserves pointer ownership,
   serialises same-process edit/upsert races and avoids ambiguous legacy email-card
   recovery. The real PATCH boundary returns 409 and the sales-record code retains the
   draft/dialog with an inline refusal; the focused service/boundary gate passes **46/46**.
   Issue #80 remains open only for database/storage-native ownership and two-process
   edit/import/qualification retry/reload proof.
66. **PARTIALLY RESOLVED 2026-08-25.** Opportunity invoices now reserve unique slots;
   payments persist as independent ledger rows under canonical required references; all
   commercial mutations serialise within the process; mismatched reference reuse returns
   409; and receipt/activity/event progress is stamped for retry. The focused **8/8** gate
   covers simultaneous proposals, simultaneous payments, save-vs-payment, canonical retry
   and the real handler/UI contract. Issue #81 remains open for database-native cross-
   process constraints and a durable Finance/Stripe/email/activity/event outbox.
67. **PARTIALLY RESOLVED 2026-08-25.** Primary Marketing assets/funnels and customer
   profiles now persist as independent by-id rows with legacy merge/tombstones. Mutations
   serialise in-process; mounted editors send `updatedAt`; stale edit/status/delete returns
   409. The focused **25/25** gate preserves all simultaneous creates and proves one
   success/one conflict for same-version edits plus stale-delete refusal. Issue #82 remains
   open for database-native cross-process CAS and separate-process mounted reload proof.
68. **PARTIALLY RESOLVED 2026-08-25.** Agency Marketing lead create/lookup/edit now share
   one trimmed lowercase email. Mutations serialise per agency, old-pointer cleanup checks
   ownership and another owner's address returns 409 without moving either row. The six
   focused identity cases cover whitespace/case, conflict, simultaneous create/edit and
   contact/edit survival; the package passes **24/24** and real-handler boundary **2/2**.
   Issue #83 remains open for database-native cross-process identity claims plus separate-
   process import/contact/retry/reload proof.
69. **PARTIALLY RESOLVED 2026-08-25.** Campaign create/PATCH now validates the complete
   record and runtime values before mutation; invalid API/report windows are refused, and
   same-process mutations serialise so acknowledged creates survive. Reports declare a
   `createdAt` window, separate budgets by channel/currency and results by KPI; live 3032
   renders those labels. The package passes **24/24** and handler/report/UI gate **3/3**.
   Issue #84 remains open for database-native cross-process campaign index coordination
   and separate-process create/update/delete/reload proof.
70. **PARTIALLY RESOLVED 2026-08-25.** Agency/company and client stop controls now post a
   dedicated route-to-inbox action and preserve the registration, injection config and
   imported forms. Permanent deletion separately confirms all cascading dependencies and
   supports cancel. The focused **68/68** gate proves both storage outcomes and mounted
   source contracts; live Tags renders. Issue #85 remains open only for an isolated mounted
   reroute/reload and delete-cancel/delete-confirm browser walk.
71. **RESOLVED 2026-08-25.** Aqua Tag tool controls now use an explicit future-page-load
   contract: config is no-store, a new document receives current enabled tools, and the UI
   says already-open provider code may continue until refresh rather than calling it
   remotely stopped. “Off for new loads,” scoped controls, removal confirmation and visible
   errors match that promise. Behavioral/API/UI **33/33** and live 3032 headers/copy pass.
72. **PARTIALLY RESOLVED 2026-08-25.** Aqua Tag now stamps one stable submission id in
   capture phase so the tag and host form share it; rejected capture is retried twice with
   the same id. The real routes serialise that id in-process, promote a tag-first row,
   preserve later capture on a completed brand row, check every persistence result and
   return retryable 503 instead of false success. Activity/automation replay keys are
   stable. A 5/5 real-handler fake-Supabase gate covers both orders, simultaneous delivery,
   insert/update failure and recovery with one row/effect set; wider focused 120/120 passes.
   Issue #87 remains open for database uniqueness, separate-instance races and a durable
   crash-safe side-effect outbox.
73. **PARTIALLY RESOLVED 2026-08-25.** Dev Team roadmap, Updates, thoughts and Findings
   now mutate under a filesystem-visible lock and atomic replacement; worker-thoughts uses
   the same protocol and finding create is exclusive. Document editing carries an exact
   content SHA, rejects the stale process and records the winning hash with its author. Real
   separate-process races preserve both acknowledged writes, two same-title findings get
   distinct files, exactly one same-base document save succeeds and attribution matches its
   bytes; direct-writer CAS and artifact cleanup also pass. Focused 104/104, TypeScript and
   diff checks are clean. A later concurrent Inbox run exposed and repaired a shared lock ABA:
   release/reaping now atomically renames the canonical lock directory to a unique tombstone
   before removal, so an old remover cannot delete a successor's owner file. Repeated Inbox
   concurrency and Dev cross-process **7/7** pass. Issue #88 remains open only for crash
   coherence between the document and separate ledger rename and the residual final compare/
   rename window for writers that ignore Aqua's lock. Plan creation's existing `wx` path
   remains excluded.
74. **RESOLVED 2026-08-25.** Managed integration activation is explicit per provider and
   scope. New saves are inactive, tests do not reorder selection, a failed active test
   deactivates it, and a passing alternative needs deliberate activation unless it is the
   first healthy default. Client-aware consumers resolve exact-client then workspace values;
   communication paths validate and carry the enquiry client, while unsupported generic
   client scopes are hidden and rejected. The widened provider/consumer gate passes
   **160/160**, TypeScript is clean and mounted port 3032 shows the expected active and
   “Make active” states. Issue #89 is resolved.
75. **RESOLVED 2026-08-25.** Portal Editor's six advertised forms now reach their real
   mounted create/edit screens and guarded operator/API writers. Clients, Leads, Actions,
   Products and Expenses use Portal Editor state. Contacts explicitly uses the one Leads
   Pipeline schema shared by settings, records, imports and promotions; the generic editor
   refuses a disconnected Contacts document. Nine field types, invalid/required/active/
   option cases, definition deletion/reload and historical retention pass **8/8** focused
   and **118/118** surrounding checks. Read-only port-3032 proof mounted all six tabs,
   working screens and the Product field editor without changing live data. Issue #90 is
   resolved.
76. **RESOLVED 2026-08-25.** Agency Settings now either affect the named behavior or say
   they are stored for future scheduling. `portalAccessDays` controls the unsent-access
   follow-up while one-time confirmation codes remain an explicitly separate 15-minute
   credential. Saved Business identity supplies invoice and transactional-email fallbacks;
   template/connection precedence is stated. Digest and timezone scheduling remain pending
   and are labelled accordingly. Focused outcome **3/3**, widened **143/143**, and read-only
   port-3032 Account/Defaults/Notifications proof pass. Issue #91 is resolved.
77. **RESOLVED 2026-08-25.** One owner/manager capability map now governs Team, Activity
   Log and External AI in both UI and APIs. Middleware keeps staff in Team and defensive
   Settings branches expose no refused action; Account/Permissions no longer link staff into
   blocked Settings. Focused **5/5**, surrounding **68/68**, production build **271/271** and
   isolated owner/manager/staff browser proof pass. Issue #92 is resolved.
78. **RESOLVED 2026-08-25.** Google creation now persists one operation before POST, uses a
   deterministic provider event id, adopts remote success immediately and treats the broader
   refresh as best-effort. 409/read-back and discarded-local-state recovery preserve one remote
   event; persistence faults report whether it exists and unchanged retries reuse the operation.
   Focused **7/7**, surrounding **87/87** and build **271/271** pass against an isolated fake
   provider. No live Google account was mutated. Issue #93 is resolved.
79. **RESOLVED 2026-08-25.** Contact Add and Edit now use one canonical agency-wide
   ownership check and return 409 plus the owning card; the mounted draft stays open with an
   owner link. Upsert refuses split compatible identity before mutation, explicitly marks
   different-name switchboards shared/non-identifying, reconnects repeated named sync and
   refuses ambiguous legacy phone lookup. Focused **31/31**, widened **114/114**, build
   **271/271** and isolated mounted email/phone/reload proof pass. Read-only shared-state
   inspection found zero duplicate emails and two repeated-phone groups needing human review;
   no shared data was changed. Issue #94 is resolved at the application boundary.
80. **RESOLVED 2026-08-25.** Meta webhook claims now carry bounded owner/expiry leases in
   local storage and both checked-in Supabase migration paths. Expired and legacy-unleased
   processing rows are reclaimable, an expired final attempt becomes terminal, and stale
   owners cannot complete or fail replacement work. A real child process claimed and exited;
   a fresh process reclaimed the same id at attempt two and completed it. Focused **11/11**,
   wider Inbox/integration/policy **60/60** and build **271/271** pass. The upgrade SQL was
   source-verified but not applied to a live Supabase instance here. Issue #97 now closes
   conversation ordering/duplicate-effect gating and issue #98 now closes multipart delivery.
81. **RESOLVED 2026-08-25.** The ordinary local Master Inbox backend now rejects malformed
   JSON and malformed collection shapes as recovery-required while preserving exact bytes.
   Every mutation re-reads inside a filesystem-visible inter-process lock and commits through
   a 0600 same-directory temp, file fsync, atomic rename and directory fsync. A SIGKILL after
   temp fsync leaves the old target, and the next process reaps the dead lock/temp. Injected
   write/rename failures, 12 concurrent writers and a two-claimer race pass **6/6**; wider
   Inbox **62/62** and build **271/271** pass. All destructive proof used isolated files and
   did not touch the shared port-3032 Inbox.
82. **RESOLVED 2026-08-25.** Inbound Meta provider-message append and conversation advance now
   form one idempotent local transaction or service-role Supabase RPC. Only a newly inserted
   inbound row increments unread; thread clocks/first response/deadline are re-derived with
   min/max rules, delayed referrals cannot replace newer facts and duplicate ids stop before
   activity/automation. Focused **7/7** covers concurrency, reorder, outbound-before-arrival,
   replay/delete/read and a true two-process local race; wider **80/80** and build **271/271**
   pass. The upgrade RPC is checked in and source-verified but still requires live Supabase
   deployment/execution. Issue #98 separately resolves multipart outbound delivery.
83. **RESOLVED 2026-08-25.** One deterministic Meta reply operation now retains leased child
   state and provider ids for text and every attachment. Retry skips confirmed parts, active
   contenders are fenced and an expired in-flight result becomes review-required `uncertain`
   instead of being resent after a possible crash-after-provider-acceptance. History renders
   partial progress and “Retry remaining.” The fake-provider failure/reconnect path now sends
   text once and the attachment twice (failure then success): **three total calls**, not four;
   replay makes none and changed content is refused. Focused **4/4**, wider Inbox/Meta **54/54**,
   TypeScript/diff and isolated build **271/271** pass. The claim/settle RPC migration is
   source-verified but still requires live Supabase deployment/execution.
84. **RESOLVED 2026-08-25.** Actions validates runtime task state before mutation at the shared
   service boundary. Create and the complete PATCH candidate require supported status/priority/
   recurrence/source, a real title, safe positive timestamps and coherent start/due/reminder
   ordering. Invalid real-route writes return field-specific 400s with unchanged storage;
   internal import/automation/template/assistant callers share the same guard. Explicit
   `undefined` staff patch keys no longer erase dates, while zero remains the deliberate
   reminder-clear value. Focused **7/7**, wider Actions/task/Aqua+Google Calendar **136/136**,
   TypeScript/diff and isolated build **271/271** pass. UI source coverage pins surfaced create/
   edit/Calendar errors; shared port-3032 state was not changed.
85. **RESOLVED 2026-08-25.** Lead conversion now claims one durable operation by agency plus
   canonical identity before creation, binds request options, fences stale holders, resumes
   failed/expired work and replays completion. The real-handler race returns one 201 and one
   200 for one client/contact/portal; a crash-style Finance retry adopts one invoice/payment,
   and independent file workers elect one owner. Focused **6/6**, wider **87 pass / 0 fail /
   2 expected DB skips**, TypeScript/diff and build **271/271** pass. Deploy/execute the
   checked-in database migration before live DB acceptance; mounted browser acceptance and
   shared port-3032 mutation were not claimed. Issue #100 records the full evidence.
86. **RESOLVED 2026-08-25.** Product process is now canonical, old board/portal fields are
   migration fallbacks and one synchronous transition converges process, board mirror,
   retained workspace, programme portal and aggregate account lifecycle from all three write
   surfaces. Checklist progress survives, repeated moves dedupe activity and multi-product
   accounts wait for the lagging service. Focused **5/5**, wider **114/114**, TypeScript/diff
   and build **271/271** pass. Port 3032 was down and isolated listeners were denied with
   `EPERM`, so mounted browser acceptance was not claimed. Issue #101 records full evidence.
87. **RESOLVED 2026-08-25.** Client product workspaces now carry monotonic revisions; stale
   edit/stage/process/file requests receive current-state 409s and one client mutation commits
   process, board, workspace, portal/account and file-visibility projections. A filesystem or
   database lease reloads durable state before compare-and-swap. Independent Node workers prove
   one winner/one conflict plus lossless retry for edit/stage/file collisions. Request,
   approval, payment-plan and record ledgers now merge inside the same fresh-state coordinator;
   payment plans add per-plan versions. Real-route **8/8**, cross-process **4/4**, wider
   **77/77**, TypeScript/diff and build **271/271** pass. Deploy the checked-in database lease
   migration before live DB acceptance; mounted browser acceptance remains. Issue #102 records
   the full evidence.
88. **RESOLVED 2026-08-25.** Client payment summaries now expose ordered per-currency
   positions rather than one first-record currency and a fabricated total. Payment Plans,
   client overview/Radar and Finance founder render those positions; built-in Billing and
   configurable metrics share one invoice grouping helper where only `sent`/`overdue` are
   collectible and draft/void/refunded/cancelled are not outstanding. Direct GBP/USD and
   status-matrix regressions plus the dependent source suites pass **62/62**; TypeScript/diff
   and isolated build **271/271** pass. Mounted browser acceptance remains unclaimed. Issue
   #103 records the complete source/test boundary.
89. **RESOLVED 2026-08-25.** Advanced Fulfilment now uses canonical `AgencyTask` records
   through a fresh-state, durable per-client ledger transaction. Board columns map to Actions
   status; task create/update/delete activity remains canonical; revision-checked moves and
   deletes reject stale sessions with current state. The former localStorage cards are read
   only for a one-time idempotent import and removed only after server success. Focused route/
   migration **3/3**, wider Actions/client-task **136/136**, TypeScript/diff and isolated build
   **272/272** pass. Mounted two-session/storage-loss acceptance remains unclaimed. Issue #104
   records the complete evidence boundary.
90. **RESOLVED 2026-08-25.** Payment-plan milestones persist a private recovery identity
   before Finance create; that identity deterministically selects one invoice. Finance state,
   milestone attachment and idempotent ledger/activity projections flush as separate recovery
   stages. Real-handler stale replay, pre-link invoice adoption and projection repair plus a
   file-backed fresh-process crash/resume gate pass **4/4**; the wider Finance/client set passes
   **119/119**, TypeScript/diff and isolated build **272/272**. Customer payloads omit recovery
   fields and pending work is locked but retryable. Mounted fault acceptance remains unclaimed.
   Issue #105 records the complete evidence boundary.
91. **RESOLVED 2026-08-25.** Website Editor module and root verification now share one
   discovery runner. It pins portal path aliases, removes the inherited React server condition,
   attempts every file before aggregate failure and names failures. A real two-file fixture
   proves fail-through behavior; the actual nested suite reaches **1,527 assertions in 49/49
   files**, TypeScript and isolated build **272/272** pass, and root `smoke:all` includes the
   gate. The full root suite currently has unrelated concurrent failures, so no whole-suite
   green claim is made. Mounted browser behavior remains separate. Issue #106 records the
   evidence boundary.
92. **RESOLVED 2026-08-25.** Customer Billing now maps canonical active, suspended and archived
   relationship states to explicit provider-labelled copy plus a Support action. Suspended
   service is named truthfully while existing billing/payment actions and active+suspended
   portal access remain unchanged. Focused **3/3**, wider customer/relationship/billing
   **43/43**, TypeScript and isolated build **272/272** pass. Current local state contains no
   suspended fixture, so mounted switching/direct-entry/reload acceptance remains unclaimed
   without mutating shared port 3032. Issue #107 records the evidence boundary.
93. **RESOLVED 2026-08-25.** People create and post-patch now validate the complete employee
   record plus nested commission/onboarding structures before mutation. Runtime enums,
   bounded money/hours/allowance/scores, coherent dates and leave/shift/training states fail
   closed; partial route patches preserve omitted fields. Canonical email permits one non-
   alumni owner, returning 409 on conflict, and rejected domain writes are proven state-
   preserving. Focused route/workspace **26/26**, Agency HR **6/6**, TypeScript and isolated
   build **272/272** pass. Mounted form/conflict/reload and database-native cross-process
   uniqueness remain explicit follow-ups. Issue #108 records the evidence boundary.
94. **RESOLVED 2026-08-25.** The mounted Agency HR foundation now delegates staff and leave
   operations to canonical People records through its workforce port. HR-only department,
   role and assignment metadata projects onto the People id; Finance consumes People employees
   only; and leave approval changes the canonical decision plus employee status atomically.
   Current retained state has no legacy HR staff/leave index requiring migration. Convergence
   **3/3**, wider **97/97**, standalone HR **6/6**, TypeScript and isolated build **272/272**
   pass. Mounted browser mutation/reload acceptance remains. Issue #109 records the boundary.
95. **RESOLVED 2026-08-25.** People now owns linked identity, pay, currency, dates/hours and
   commission plans; Finance projects them on every read and retains only accounting controls
   plus payment evidence. Predictable fixed commission feeds the scheduled target, variable
   commission stays separately evidenced, independent suppliers remain Finance-owned and
   duplicate/missing People links fail closed. Convergence **3/3**, focused **32/32**, wider
   **158/158**, standalone Finance **23/23**, TypeScript and isolated build **272/272** pass.
   Mounted two-tab save/reload acceptance remains. Issue #110 records the evidence boundary.
96. **RESOLVED 2026-08-25.** Agency Users, candidate hire and employee activation now share
   one password-free agency/email operation that flushes intent and stable local ids before
   Supabase, then checkpoints provider, local-user, People-link and completion stages. Only an
   identity carrying the exact operation marker can be adopted; retryable failures expose the
   last stage. Provider/local/flush recovery passes dedicated **14/14**, wider **109/109** and
   final TypeScript. A pre-wrapper isolated build reached **272/272**; two exact rebuilds were
   environment-killed during compilation. Exact build, real-Supabase and mounted retry/reload acceptance
   remain; unmarked legacy provider orphans need manual reconciliation. Issue #111 records the
   evidence boundary.
97. **RESOLVED 2026-08-25.** Freelancer creation now uses the resumable provider/local/People
   operation and sends a password-setup invitation, with an authenticated operator fallback link
   when mail is unavailable. Deliverables, private upload/download, owner Team Chat and submit are
   mounted and gated by ownership plus the effective per-job policy. The end-to-end in-process
   journey passes **3/3**, including legacy-local adoption/replay; surrounding coverage **105/105**
   and TypeScript. The isolated build was
   environment-killed during webpack compile without a code diagnostic. Exact build, real
   Supabase/email/password-reset login plus browser/cross-process reload remain acceptance work.
   Issue #112 records the evidence boundary.
98. **RESOLVED 2026-08-26.** Finance invoice create now refreshes and serialises deterministic-id
   adoption, agency/year number reservation and persistence through the cross-process plugin
   storage transaction. The mounted form retains one operation key. Separate file workers prove
   distinct intents receive distinct numbers and same-key retries converge; a third-process reload
   sees exactly one row/number per intent. Dedicated 2/2, widened 91/91 and TypeScript/diff pass.
   Optional issue-step failure recovery remains separately tracked by issue #47; issue #113 records
   the completed evidence boundary.
99. **RESOLVED 2026-08-26.** Payment recording now adopts exact retries first and otherwise
   accepts only sent/overdue invoices, under one refreshed per-invoice transaction that caps the
   write to live outstanding and settles only on exact clearance. Income and Checkout use the
   same status/balance helper. Separate file workers prove £70/£70 cannot over-allocate while
   £40/£60 both persist; non-collectible and over-limit attempts survive reload unchanged, and
   P&L/report totals agree. Dedicated 3/3, all Finance 108/108 and TypeScript/diff pass. Issue
   #114 records the boundary; refund reversal accounting remains issue #119.
100. **RESOLVED 2026-08-26.** Finance now applies one shared exact-field/value validation layer
   before invoice/template, expense/category, budget, plan, obligation, compensation, payment and
   income create/post-patch storage. It rejects invented currency/status/type/method/recurrence/
   provider values, unsafe money, invalid quantities/rates, incoherent dates and malformed nested
   evidence. A dedicated service/import and mounted-handler matrix proves every refusal leaves the
   whole plugin store byte-identical: 115/115; complete Finance 223/223 and TypeScript/diff pass.
   Issue #115 records the completed boundary; issues #116–#121 remain distinct at this checkpoint.
101. **RESOLVED 2026-08-26.** Plan assignment now validates the agency client and target before
   mutation, serialises every agency assignment across processes and writes a versioned recovery
   marker before reconciling all forward memberships and the reverse pointer. Plan reads replay
   interruptions. Faults across every assign/move/unassign write plus independent-process shared-
   target, competing-target, unassign and stale-target races converge after reload: 18/18; complete
   Finance 241/241 and TypeScript/diff pass. Issue #116 records the completed boundary.
102. **RESOLVED 2026-08-26.** Recurring posting now keys one durable operation/result/child by
   schedule and due timestamp, serialises it across processes, persists the child result before
   advancing once and resumes any pending work before a newer request. Stable-id audit logging and
   UI replay de-duplication close failure/retry residue. Every write, before/after log fault, direct
   double call, mounted handler/UI replay and two-process/two-period reload passes 15/15; complete
   Finance 256/256 and TypeScript/diff pass. Issue #117 records the completed boundary.
103. **RESOLVED 2026-08-26.** One selected-currency accounting snapshot now separates receipt
   cash, reimbursed cash costs, invoiced/accrual revenue, approved+reimbursed commitments, pending
   costs, partial-aware receivables and tax. Overview, Reports, Budgets, Planning, P&L and mounted
   APIs consume those named fields without implicit FX; MRR and client metrics are partitioned too.
   Mixed GBP/USD plans, receipt/status cases and all expense states pass 5/5; complete Finance
   261/261 and TypeScript/diff pass. Issue #118 records the completed boundary; durable reversals
   were then completed under #119.
104. **RESOLVED 2026-08-26.** Refunds are immutable provider-identified negative allocations;
   cumulative Stripe delivery writes only the missing delta, partial/full invoice and receivable
   state derives from gross minus refunds, and every cash/tax/report/client consumer uses that net
   allocation. Disputes persist separately. Partial/multiple/full, replay, interrupted-write retry,
   two-process race and fresh reload pass 4/4; complete Finance 265/265 and TypeScript/diff pass.
   Issue #119 records the completed boundary.
105. **CODE + BEHAVIOUR RESOLVED 2026-08-26; browser acceptance pending.** Workspace Settings now
   owns bounded invoice terms/default tax and seller/tax identity; duplicate/inert Finance fields
   are removed, form/service defaults converge, and each new invoice snapshots issuer identity.
   Changing 10-day/old-tax to 45-day/new-tax changes only the next invoice/export: 3/3; complete
   Finance 268/268, TypeScript/diff pass. The isolated browser listener was denied `EPERM`, so
   issue #120 retains only the literal mounted click-through.
106. **CODE + BEHAVIOUR RESOLVED 2026-08-26; browser acceptance pending.** Client Payment Plans
   now hold the canonical per-client schedule and Finance Plans are multi-currency templates.
   Mounted Plans controls edit templates and assign/move/cancel clients; assignments snapshot
   terms, MRR/Planning/portfolio/Deposits read active linked schedules, deposits use explicit
   invoice identity, and the unused `/plans/assign` production route is retired. Moves preserve
   historic invoices and cancellation retries are durably fenced from later reassignments.
   GBP→USD invoice/payment/deposit, MRR/ARR, move/cancel/reload and source contracts pass 3/3;
   complete Finance 271/271 and TypeScript/diff pass. Issue #121 retains only the isolated mounted
   lifecycle because listener binding was denied `EPERM`; port 3032 was untouched.
107. **CODE + BEHAVIOUR RESOLVED 2026-08-26; mounted/live-provider acceptance pending.** One
   per-user cross-process command now persists Membership change/cancel intent, forwards stable
   provider identities, records accepted results before local adoption and resumes after storage
   failure/reload. Paid→free cancels provider state first, paid→paid changes it in place,
   free→paid replays one Checkout and free cancellation terminates immediately. Failure/retry/
   concurrency and mounted-source proof passes 2/2; widened Membership/customer/discount 49/49,
   package+lifecycle 11/11 and TypeScript/diff pass. Issue #33 still tracks the throwing production
   Stripe foundation, so issue #122 retains mounted/live-provider acceptance only.
108. **CODE + BEHAVIOUR RESOLVED 2026-08-26; signed live-provider acceptance pending.** A scoped
   per-event inbox now retries failed/interrupted/legacy work and completes only after subscriber/
   payment state plus synchronous effects. Subscription metadata is complete and scope-matched;
   invoice events persist payment rows, write idempotent activity and emit under the real install.
   Processing failure maps to 503. Fault/retry/fresh-container/concurrency/scope proof passes 4/4;
   combined Membership dedicated 6/6 and widened 53/53. Issue #33 still blocks live Stripe proof.
109. **CODE + BEHAVIOUR RESOLVED 2026-08-26; mounted/live-Connect acceptance pending.**
   Affiliate-scoped scheduling now persists a recoverable operation and claims each approved
   attribution into one payout before exposure. Manual/Stripe completion shares staged recovery,
   enforces ownership and reconciles earnings from paid rows rather than incrementing. The mounted
   Payouts page has affiliate selection plus Schedule approved with an operation id. Fault/reload/
   concurrency/legacy duplicate proof passes 3/3; package+focused 17/17 and combined Membership/
   Affiliate 70/70. Production Connect remains #45.
110. **Code/behaviour resolved 2026-08-26; mounted/live-provider acceptance remains.** Affiliate
   money rows now snapshot currency/order settlement, admit eligible paid states, batch and transfer
   under a locked currency and reconcile cumulative cancellation/refund state before payout or as a
   replay-safe future offset after settlement. Mixed-currency/refund/UI proof passes **3/3**;
   package+focused **20/20**, widened **79/79**. Issue #125 retains Connect/browser acceptance.
111. **Code/behaviour resolved 2026-08-26; mounted acceptance remains.** Membership/Affiliate
   services now validate allowlisted inputs and complete candidates for identity, enum/currency,
   bounded money/rates/dates, references, category/provider relationships and payout composition
   before mutation. Full-store byte-identical refusal proof passes **3/3**, widened **82/82**.
112. **Resolved 2026-08-26.** Affiliate enrolment, normalised-code creation and order attribution
   now persist a durable install-scoped claim containing the selected complete row before secondary
   writes. Identical retries repair/return it, conflicting code ownership rejects, collection locks
   preserve shared indexes and stable per-attribution markers make both referral counters exact.
   Two-container same/distinct identity races plus interrupted-write/fresh-container recovery pass
   **4/4**; focused **27/27**, widened Membership/Affiliate/Ecommerce **86/86**. Issue #127 closed.
113. **Code/behaviour repaired 2026-08-26; mounted acceptance remains.** Published Performance
   reports now retain numbered immutable snapshots; newer publication explicitly supersedes,
   withdrawal retains actor/reason, only confirmed drafts delete, and one durable fresh-state
   transaction protects the full ledger. Dedicated proof passes **4/4**. Issue #128 retains the
   two-tab/reload and both-portal browser acceptance.
114. **Code/behaviour repaired 2026-08-26; mounted acceptance remains.** Performance experiments
   now reject duplicate stable ids and impossible counts, require optimistic versions and coherent
   transitions/timestamps, preserve completion and create an explicit numbered amendment. Dedicated
   proof passes **2/2**. Issue #129 retains mounted API/live-event/amend/delete/reload acceptance.
115. **Code/domain-behaviour repaired 2026-08-26; mounted provider acceptance remains.** Aqua
   Advisor now persists a client-stable turn intent/lease and provider result before atomically
   exposing one user/assistant pair plus intended memory. Failure/reload reuses the same ids;
   stale results, replay and deletion converge without duplicate/resurrected history. Dedicated
   proof passes **7/7**, widened Advisor/health **15/15**. Issue #130 retains literal route/provider/
   storage/activity/response-loss and browser reload acceptance.
116. Radar's typed scheduler is descriptive rather than enforced at two important boundaries.
   Evidence declares an hourly cadence but is invoked only manually or by the daily 06:00 job;
   that job calls a helper per agency which reruns the explicitly app-wide Infra probe and aborts
   the tenant's evidence rollup when Infra fails. Issue #131 tracks split app-wide/tenant
   orchestration, real cadence and fake-clock/call-count/failure proof.
117. Application observability is a library-shaped promise with no production entry point. The
   repository has zero callers of `withApiObservability`, `captureError`, `withRequestLog` or
   `logRequest` outside their definitions, and `@sentry/nextjs` is absent. A direct readiness
   probe with only a fake DSN still returned `monitoring: ready`, while the client error page says
   the issue was logged after only `console.error`. Issue #132 tracks a real mounted client/server
   capture path, capability-based readiness and synthetic end-to-end delivery proof.
118. **PARTIALLY REPAIRED 2026-08-25.** Agency-staff Account now returns to Team, and Account/
   Permissions no longer expose owner/manager Settings links; isolated browser proof passes.
   Client owner/staff and freelancer destinations plus the agency-only portal 404 remain. Issue
   #133 tracks one shared resolver and browser proof across every role.
119. Customer installation help is one-shot despite copy promising otherwise. The password route
   marks `welcomeCompletedAt`, `/setup` rejects completed users, and the only install prompt/manual
   instructions live in that setup component; Support contains none. Issue #134 tracks independent
   progress/revisitable help and prompt accept/decline/close/reopen proof across platforms.
120. True modal semantics are present without the keyboard behavior they promise. The current
   source declares 64 `aria-modal="true"` dialogs across 50 TSX files, but only three files use
   `useFocusTrap`; 47 files remain untrapped and only four of those handle Escape. The existing
   hook already contains Tab/Shift+Tab and restores prior focus, so issue #135 tracks consolidation
   on that contract plus representative component/browser keyboard proof.
121. The Command Centre loading boundary silences its own progress announcement. Its root carries
   `aria-hidden`, and the only `role="status" aria-live="polite"` node is nested inside that hidden
   subtree. Issue #136 tracks separating decorative skeleton markup from the exposed live status
   and verifying announcement/removal/focus behavior.
122. The UX smoke does not create the viewports printed in its result labels. It loops three width
   numbers but uses each only in a custom User-Agent before fetching server HTML and looking for
   substrings. It never applies CSS, executes browser interaction, inspects focus/overflow/the
   accessibility tree or captures a browser console. Issue #137 keeps that useful markup smoke
   while requiring a genuine responsive browser acceptance gate.
123. Composite roles are applied without the composite keyboard contract. Every one of the 12
   tablist files leaves all tabs in the normal Tab sequence, supplies no tab arrow/Home/End model
   and renders no associated tabpanel; Settings' aria-controls targets are absent. Nine production
   menus and the editor page-picker listbox also lack their role-specific item navigation, while
   the partial `useArrowNav` helper has no caller. Issue #138 tracks honest native roles or shared
   accessible primitives plus component and browser keyboard proof.
124. Important controls can be reached but not identified by assistive technology. Manual review
   of a conservative source inventory confirmed at least 13 visible icon-only internal actions
   with no accessible name, including task/note creation, task completion, onboarding reorder,
   credential reveal/copy and modal close actions. Published Contact, Booking, Newsletter,
   Product Search and custom Donation fields also use placeholders without a stable label. Issue
   #139 tracks programmatic naming, row/state context, announced errors and accessibility-tree
   proof rather than relying on the raw heuristic count.
125. Date-only business values are sometimes derived from UTC instants. At a controlled 00:30
   BST, `new Date().toISOString().slice(0, 10)` returned the prior calendar day. That exact form
   supplies mounted New Client onboarding, expense, Finance income/payment, HR joined-date and
   People-calendar defaults; due-date addition can inherit it. **2026-08-26 correction:** the
   source/domain defect is repaired through one explicit Europe/London calendar contract and
   calendar-day arithmetic. Focused 5/5, affected wider 56/56 and 61/61 plus TypeScript pass;
   controlled-boundary mounted browser save/reload/export acceptance remains under issue #140.
126. The custom error page does not cover the root boundary its comment claims. The repository
   has `app/error.tsx` but no `app/global-error.tsx`; installed Next 16's loader therefore selects
   the built-in global module for root-layout/App Router failures. Issue #141 tracks the real
   required global fallback plus production-browser root/child fault, capture and recovery proof.
127. Customer setup waits for `beforeinstallprompt`, but the served manifest declares only
   192/180/32px icons and the repository has no 512px asset. Current Chromium criteria require
   both 192px and 512px icons before firing that event, so the real Install button is not eligible
   as shipped; the source smoke checks only words in the manifest. Issue #142 tracks real assets,
   manifest validation and browser proof across eligibility and prompt outcomes.
128. Current-page website blocks are not hydration-stable in their documented default modes.
   Share Buttons static output contains empty Twitter/LinkedIn/Facebook targets while auto
   Breadcrumb static output is empty; each reads `window.location` on the first client render.
   React 19's installed runtime says such server/client branch attributes will not be patched.
   Issue #143 tracks a request-context or stable-defer contract and real hydration/navigation
   tests; R017 currently proves only explicit URL/items.
129. Private media content has no byte-range delivery contract. Mounted inbox and call-recording
   `<audio preload="metadata">` players point at handlers that ignore `Range` and always return
   `200`; SOP media does the same for files accepted up to 250 MB. Supabase/local reads materialise
   the object and inbox Vercel delivery explicitly converts the whole stream into a Blob. Issue
   #144 tracks shared provider-aware `206`/`416` behavior plus real metadata/play/seek proof; the
   current smokes assert only source markers for upload, storage, token and route presence.
130. Private media capture has no browser-capability or atomic call lifecycle. All three mounted
   voice-note implementations test only Opus-in-WebM and otherwise still force WebM. The website
   call flow persists the active call before constructing/starting that recorder; an unsupported
   MIME failure then bypasses busy reset and track cleanup. Ordinary voice-note failures similarly
   retain the just-opened stream and incorrectly say permission was denied. Issue #145 tracks one
   negotiated recorder/filename contract, exact failure cleanup and Safari/Chromium capture proof.
131. **Code/service-behaviour repaired 2026-08-26; mounted acceptance remains.** Relative
   Countdown Timer units now receive one stored deadline at create/save/publish, legacy reads use
   stored page timestamps, edits reset once, invalid targets expire and server/first-client markup
   is deterministic. Dedicated lifecycle proof passes **5/5**, draft/publish **25/25**. Issue #146
   retains mounted-effect and published-browser expiry/hydration acceptance.
132. Team Chat and global attention accept asynchronous snapshots in arrival order. A channel
   button and its old poll can overlap without abort/generation checking; the older result replaces
   `activeChannelId`, which the composer then uses as the Send destination. Notification refresh
   and PATCH paths likewise replace whole arrays, and an older failed action restores its captured
   pre-action array over any newer success. Issue #147 tracks explicit selection/revisions,
   narrow rollback and reversed-response component/browser proof.
133. **Code/behaviour repaired 2026-08-26; mounted/live-provider acceptance remains.** Supabase
   load/save/patch/RPC, Twilio message/call, Resend, Vercel-domain, direct Stripe and Shopify now
   share typed operation budgets and caller cancellation. The local race settles even if an
   adapter ignores abort; failures preserve safe read retry, same-operation-key idempotent retry
   or reconcile-first unknown-write recovery. Shared proof passes **7/7**, provider proof **7/7**,
   the focused provider foundation **37/37**, and the widened route/provider gate **169 passed / 1
   live-Postgres skip**. Issue #148 retains mounted stalled/late-response and live reconciliation acceptance.
   Port 3032 was not used or changed.
134. **Code/behaviour resolved 2026-08-26; mounted acceptance remains.** Customer Account
   activity now requires a registered, exact-client enabled, operational capability. Ecommerce
   can expose Orders; Bookings is explicitly non-operational and hidden even if stale state claims
   a registered/enabled install. The direct route keeps its honest unavailable card. Focused
   capability/nav proof is **4/4 + 2/2**, surrounding customer/plugin-host checks **34/34** and
   TypeScript is clean. Issue #149 retains the three-state customer browser walk.
135. **Code/behaviour resolved 2026-08-26; mounted visual acceptance remains.** The action-shaped
   no-op is removed. Assign and Close/Reopen remain native buttons with real mutation handlers, so
   the Social Inbox header advertises only operational outcomes. Dedicated proof passes **2/2**,
   focused header/reply/search **15/15**, wider Inbox/Search **53/53** and TypeScript is clean.
   Issue #150 retains the active-thread desktop/mobile and focus-order browser check.
136. **Code/behaviour resolved 2026-08-26; mounted warm-route acceptance remains.** The isolated
   browser baseline was 9.2 seconds for `/portal/dev-team` (7.9 application), Logs 4.7 seconds
   server-side and Dev Docs 6.4/5.1 seconds. Dev Docs and worker activity now use one generation-
   safe coalesced refresh contract: concurrent cold requests share a scan, warm reads reuse it for
   15 seconds, explicit fresh reads and immediate in-app-save invalidation are available, stale
   in-flight results cannot republish, and `.next-*` builds are excluded. Dedicated proof is
   **16/16**, the wider gate **73/73**, and TypeScript is clean. Issue #151 retains browser
   re-timing plus outside-edit visibility within the bound; this is not a filesystem-watcher claim.
137. **Code/behaviour resolved 2026-08-26; mounted console acceptance remains.** The clean-browser
   reproduction rendered the custom missing-client 404 but rejected raw scripts during the client
   render. Both root bootstraps now use uniquely identified Next 16.3 `beforeInteractive`
   components, retain synchronous colour/sidebar storage behavior and leave no raw root script;
   the client guard still aborts before chrome/preview construction. Dedicated proof is **4/4**,
   focused proof **23/23**, wider client/navigation/editor-layout proof **125/125**, and TypeScript
   is clean. The isolated build was killed without a compiler diagnostic and is not counted. Issue
   #152 retains direct/client browser transitions across valid, missing and generic-404 controls
   with zero script/hydration console errors and preserved state.
138. The Website Editor's management route family is not renderable. The main editor and its
   `edit-website` alias work, but all eleven sibling pages fall into the plugin error boundary with
   React's Server-to-Client function-serialization error. Each failed page is a client component,
   while the shared server catch-all passes the function-bearing foundation services and plugin
   storage objects to every resolved page. Ecommerce, Memberships, Affiliates and Client CRM
   server-rendered plugin pages passed the same host. Issue #153 tracks a serializable boundary and
   complete manifest-path browser regression.

## Acceptance rule

No row becomes “passed” from a source marker or unit test alone. A browser row needs
the actual visible route, the expected interaction or honest empty state, a reload
where persistence matters, and a console check. External-provider rows must remain
“not live-proven” until the real provider completes the round trip.
<!-- AQUACRM_SOURCE_END path="docs/development/ultra-review-2026-08-24.md" -->

---

<a id="source-docs-development-visual-browser-audit-2026-08-23-md"></a>

## Source document — `docs/development/visual-browser-audit-2026-08-23.md`

<!-- AQUACRM_SOURCE_START path="docs/development/visual-browser-audit-2026-08-23.md" sha256="3ee9b61d74e317c98f16ed33f6d9c3ba51001f5785c81128d58f6a33550cd341" -->
# AquaCRM full browser walkthrough audit — 2026-08-23

> **Current correction, 2026-08-24:** this report passed the browser paths it
> exercised, but its “public showcase is read-only” conclusion was too broad.
> The proxy exempts `GET`; Google Calendar/Meta OAuth callbacks and other hidden
> GET-side mutations can write. The fixture is also shared/reset per visit. See
> current issues #21/#23; the dated observations below remain browser evidence,
> not a security acceptance result.

## Remediation re-audit — 2026-08-23 02:41 BST

**PASS for the nine findings in this browser audit; the broader application is
still not release-ready.** The original observations below are retained as
pre-remediation evidence, not as a description of the current runtime.

| Finding | Current status | Reproducible evidence |
| --- | --- | --- |
| AUD-01 | Fixed | The public session is now a visitor with read-only effective permissions. Mutation controls are absent or disabled on the audited agency and client surfaces. With the real showcase cookie, `POST`, `PATCH`, and `DELETE /api/portal/tasks` each returned `403`. The root `middleware.ts` now delegates to `src/proxy.ts`, so that boundary is active in the running app rather than existing only in tests. |
| AUD-02 | Fixed | Public requests for `/portal/dev-team`, `/portal/agency/settings`, Actions, and Email Sender redirect to `/portal/agency`; internal Dev/source APIs are denied. The public portal editor is visual-only and does not expose source, assistant, save, add, or publish controls. |
| AUD-03 | Fixed | `/showcase` now purges and recreates one fixed showcase tenant with fictional `.example` identities. Agency and client chrome agree on fictional showcase branding, and the re-audited client hub contained neither the previously observed personal data nor the offensive fixtures. |
| AUD-04 | Fixed | Battle Table tolerates scope-less intelligence items and reached its final UI in the browser. The Battle Table and Command Centre regression suites pass. |
| AUD-05 | Fixed in the current local development environment | The 20–40 second outliers were not reproducible after remediation. Warm real-cookie requests were: agency `0.342s`, clients `0.081s`, Battle `0.078s`, SOP library `0.069s`, and preferences → permissions `0.113s`; a repeated showcase reset was `1.752s`. This is not a production cold-start guarantee. |
| AUD-06 | Fixed | The in-app Auditor aggregates source findings, document blockers, and readiness prerequisites. It now says “Source checks clear”, never “All clear”, and explicitly states that source checks do not replace browser, authorization, tenant-isolation, crash, public-flow, or performance audits. |
| AUD-07 | Fixed | Preferences resolves to `/portal/account/permissions`; SOPs resolves to `/portal/agency/sop-library`; client `?tab=systems` remains on the Systems view. |
| AUD-08 | Fixed | The editor toolbar is bounded and horizontally scrollable instead of clipping controls; browser checks passed at 360, 390, and 430 CSS pixels. |
| AUD-09 | Fixed | The Health Check loads the complete question pack before rendering. Its source regression proves five topics with Beginner, Dabbler, and Pro choices, and `/health-check` loads the real diagnostic app. |

The focused remediation suite passed **76/76 tests** with zero failures, and
typecheck passed at the remediation checkpoint. A completed full-suite snapshot
then reported **3,591 pass / 27 fail / 1 skipped out of 3,619 tests** while other
workers were changing the checkout. Those failures include stale source-shape
assertions. One initially appeared to flag six non-plugin API routes, but the
routes already use the shared session-derived `routeTenantScope` guard; the audit
matcher was updated to recognise that safe form and now passes. The remaining
broader blockers are recorded in the authoritative [checklist](checklist.md), so
this finding-level pass must not be read as a release pass.

## Original verdict (pre-remediation)

**FAIL — the localhost build is not release-ready.**

The breadth is real: every one of the 110 App Router page templates was exercised in a browser, and most tested desktop and representative mobile screens render without broken images, root-level horizontal overflow, or a visible error boundary. The release verdict is still a clear failure because the unauthenticated public showcase becomes an account owner, exposes internal source and Dev Team surfaces, and does not reliably stay inside the promised sanitised fixture dataset. The Battle Table does not load successfully, and the public Health Check cannot be answered.

This report records the behaviour of the running application, not an inference from stale documentation.

## Target, timing, and method

- Runtime: `http://localhost:3032`
- Runtime process at audit time: `next-server` 16.3.0
- Confirmed process working directory: `/Users/eds/Desktop/Projects/Web Development/Personal EcoSystem/aquaCRM/portal`
- Audit date: 2026-08-23; continuation and final blocker recheck completed at approximately 01:38 BST
- Persona: unauthenticated visitor entering through `/showcase`, then identified by the UI as `Demo visitor`
- Source inventory: 110 App Router `page.*` files
- Template coverage: **110/110 page templates exercised** using a valid fixture where one existed and a safe invalid/empty state where no valid token or record existed
- Navigation coverage: at least 140 distinct route, redirect, query-view, tab, and dynamic-record states
- Interaction coverage: public and app mobile menus, Health Check journey, workspace search, Command Centre station switching, all Settings tabs, all principal client workspace tabs, all Marketing views, all Fulfilment views, all client-preview sections, and all three portal-editor modes
- Viewports: desktop at 1680 × 920 and 1280 × 720; verified responsive pass at 390 × 844
- Safety: read-only walkthrough. No Save, Add, Delete, Generate, Run, Clock in, Send, upload, provider connection, publication, external submission, or showcase-exit action was executed.

Other workers changed the application while this review was running. Where an initial and continuation observation differ, this report calls out the split instead of pretending the runtime was static. The latest observation is the best description of the current localhost state.

The structured measurements captured during the first automated route pass are in [route-results.jsonl](./visual-audit-2026-08-23/route-results.jsonl). Later interactive and dynamic-route evidence is recorded below.

## Release blockers

### AUD-01 — P0 — The public demo is an account owner, not a read-only visitor

Entry through `/showcase` requires no supplied credential and the global banner says `Interactive demo · Fictional data · Read-only`. However, `/portal/account/permissions` identifies the same `Demo visitor` as:

- Role: **Business owner**
- Badge: **Account owner**
- Allowed: Clients Create, Edit and Delete
- Allowed: Finance Edit
- Allowed: Employees Edit and Roles Edit
- Allowed: work-board and playbook management

Agency Settings also exposes enabled editable fields and a `Save settings` button. The audit did not submit a mutation, so backend write enforcement is not proven either way; the authorization and UI contract are already unsafe.

![Public demo owner permissions](./visual-audit-2026-08-23/04-public-showcase-business-owner-permissions.png)

**Required outcome:** the public demo must use a separately enforced, non-owner role; every mutation must be rejected server-side as well as hidden or disabled in the UI.

### AUD-02 — P0 — The public demo reaches the internal development control plane

The same public session reached all of the following:

- `/portal/agency/dev-docs` — marked `DEV ONLY`, exposing an index of 2,186 internal files
- `/portal/agency/development/code` — repository browser exposing 3,514 files and root names including environment, agent, and package files
- `/portal/dev-team` and every Dev Team page template
- `/portal/dev-team/docs` — copy says edits save straight back
- `/portal/dev-team/plans/new` — an exposed plan-authoring screen
- Dev Team findings, roadmap, editor studio, library, API/MCP, chat, logs, tasks, updates, notes, working view, and inspector

The portal editor's Dev mode also exposes the workspace tree to the public owner session. This is an access-control failure, not merely a navigation issue. No document, code, or plan edit control was used.

![Public Dev Docs exposure](./visual-audit-2026-08-23/03-public-showcase-dev-docs-exposure.png)

**Required outcome:** public-demo authorization must fail closed before internal page data is loaded. Internal docs, source browsing, Dev Team tools, editor Dev mode, and editing APIs must never be available to this session.

### AUD-03 — P0 — The promised fictional showcase dataset is not isolated reliably

The public banner says the data is fictional and read-only. Settings > Showcase says Showcase Mode uses a fixed isolated dataset and copies no real clients, finances, messages, or contacts.

Observed contradictions:

- `/portal/agency/contacts` displayed real-looking personal contact patterns, including a full name, email, and UK phone number. Exact values are deliberately redacted from this report.
- The same list contained multiple offensive racial-slur test records. The terms are deliberately not reproduced here.
- While the header said `Interactive demo`, Settings > Showcase still offered `Enter Showcase Mode`, indicating the public demo and the app's isolated Showcase Mode are not the same state.
- Agency pages use `AquaOasis-Web` as the internal workspace while client pages use `Milesymedia Showcase`, making the active tenant/data boundary unclear.

No screenshot of the contact list was retained, to avoid duplicating sensitive or offensive content.

![Showcase state contradiction](./visual-audit-2026-08-23/08-showcase-state-contradiction.png)

**Required outcome:** the public route must always enter one fixed tenant, one fixed role, and one sanitised fixture dataset. Purge offensive fixtures and prevent any live or file-backend tenant records from joining the session.

### AUD-04 — P1 — Battle Table does not load successfully from the real control

The initial pass reproduced a hard failure both through `/portal/agency/company` and by clicking the `Battle Table` station button in Command Centre.

Visible error:

```text
Something went wrong loading agency workspace.
Cannot read properties of undefined (reading 'kind')
```

The captured stack identified `applyIntelligenceScope` in `CommandIntelligenceWorkspace`, reached from `BattleTableWorkspace`.

Because workers were editing the runtime, the final recheck changed shape: a fresh tab remained on `Loading Command Centre…` for more than 40 seconds instead of reaching either the Battle Table or the earlier error boundary. The exact failure is moving, but the user outcome is unchanged: the Battle Table is not usable in the current audit window.

![Battle Table crash](./visual-audit-2026-08-23/02-battle-table-crash-desktop.png)

![Battle Table final recheck stuck on loading skeleton](./visual-audit-2026-08-23/15-battle-table-final-stuck-loading.png)

**Required outcome:** tolerate missing or malformed intelligence items, prevent an indefinite loading state, then add a browser regression that switches into Battle Table from Command Centre and waits for the final station UI.

### AUD-05 — P1 — Cold navigation remains outside a usable performance envelope

The editor is no longer accurately described as permanently unusable: once warm, its base route became controllable in roughly 1.4–8 seconds and all three modes responded. The cold path is still severe.

Observed cold or slow paths included:

- `/showcase` took about 33.6 seconds before the agency UI was fully available.
- `/portal/agency/pipelines/leads` exceeded 30 seconds before eventually rendering a healthy pipeline.
- `/portal/agency/portals/demo/stunning-standard` needed roughly 37 seconds to reach a usable editor on the first pass.
- The first direct editor attempts exceeded 30 seconds and destabilised browser control; warmed editor navigation later took about 1.4–8 seconds.
- A final cold recheck of `/portal/account/permissions` exceeded 30 seconds before eventually rendering the same owner permissions.
- An invalid development-project route took roughly 35–40 seconds to reach its safe not-found state.
- An invalid connection route took more than 27 seconds before showing a safe refusal.
- `/portal/agency/portals` took 24.1 seconds; the technical project alias took 23.0 seconds; the phase detail took 20.6 seconds.
- Technical workflow and website aliases took approximately 16.5–19.9 seconds.
- `/portal/dev-team/docs` took about 22.8 seconds; `/portal/dev-team` about 19.2 seconds; `/portal/agency/dev-docs` 15–16 seconds; Governance and Dev Team logs about 14.2 seconds.
- Each warmed Settings tab still took approximately 3.5 seconds to settle.

The pipeline did eventually render rather than remaining stuck.

![Pipeline after a greater-than-30-second cold transition](./visual-audit-2026-08-23/09-pipeline-after-over-30s.png)

**Required outcome:** define a user-visible loading budget, profile the shared workspace hydration path, cache or defer heavyweight repository/project work, and make route shells interactive independently of slow secondary data.

### AUD-06 — P1 — The built-in launch status is falsely green

The public owner session can open `/portal/dev-team/findings?view=auditor`. That screen says `No open blockers`, sourced from `state.md` and the launch-readiness checks.

That statement is contradicted by AUD-01 through AUD-05 and AUD-09, as well as defects already listed in `checklist.md`. A release decision based on the in-app Auditor would be unsafe.

**Required outcome:** the in-app status must include browser authorization, isolation, hard-crash, critical public-flow, and performance gates, or clearly say those gates have not run.

### AUD-09 — P1 — The public Health Check cannot be answered

The landing page and start button work. After selecting `Service business`, the next transition briefly displays `Topic 1 of 0` with an empty topic description. Continuing reaches `Topic 1 of 5 · Visibility & Search`, but the intended Beginner, Dabbler, and Pro answer choices are absent. Only `Skip this topic` remains.

Skipping goes straight to a result that says there is not enough information. That fallback renders, but the main diagnostic and lead journey cannot be completed as designed.

![Health Check invalid topic count](./visual-audit-2026-08-23/10-health-check-topic-1-of-0.png)

![Health Check missing answer choices](./visual-audit-2026-08-23/11-health-check-missing-level-choices.png)

**Required outcome:** restore the topic definition and answer-choice data, reject a zero-topic state before rendering it, and add a browser test that completes all five topics without relying on Skip.

## Important lower-severity findings

### AUD-07 — P2 — Some compatibility and deep links land on the wrong screen

- `/portal/agency/sops` redirects to Command Centre, not `/portal/agency/sop-library`.
- `/portal/account/preferences` redirects to the generic account profile.
- Live alert links to `/portal/clients/:id?tab=systems` redirect to the client's Fulfilment tab. The Command Centre presents these links as the source for telemetry and availability findings, so the user lands somewhere unrelated to the promised evidence.
- `/resources` redirects to `/tools`, which appears intentional but should remain covered as a compatibility contract.
- `/portal/agency/products` correctly redirects to Fulfilment services.
- `/portal/agency/actions` correctly redirects to Inbox actions.
- `/portal/agency/automations` correctly redirects to Marketing automations.

The first three cases feel like lost navigation and can break bookmarks or operational investigation.

### AUD-08 — P2 — Mobile is broadly responsive, but the portal editor clips controls

A verified 390 × 844 pass succeeded across the public homepage, Health Check, Command Centre, Marketing Automations, Fulfilment Technical, client overview, client preview, and portal editor. These screens had no root-level horizontal overflow or broken images. The public mobile menu and app navigation drawer opened and closed correctly.

The portal editor is the exception: its header contains about 569 pixels of controls inside a 390-pixel container with horizontal overflow hidden. The `Two browsers side by side` control extends beyond the right edge, and custom-size inputs are partly off-screen. The preview canvas itself is horizontally scrollable by design, but the clipped toolbar controls are not all reachable in the visible header.

![Verified mobile editor at 390 by 844](./visual-audit-2026-08-23/12-mobile-editor-390x844.png)

![Verified mobile Command Centre at 390 by 844](./visual-audit-2026-08-23/13-mobile-agency-390x844.png)

![Verified mobile public homepage at 390 by 844](./visual-audit-2026-08-23/14-mobile-home-390x844.png)

**Required outcome:** wrap, collapse, or horizontally scroll the editor toolbar without clipping interactive controls, then test editor mode and device controls at 360, 390, and 430 pixels.

## What worked

- All 110 App Router page templates reached a rendered, redirect, refusal, not-found, or role-gated state in the browser.
- Public homepage, Business OS, Client Centre, portfolio, case studies, tools, careers, login, reset, recovery, invalid magic-link, invalid proposal, invalid career-status, and connection-refusal states rendered safely.
- Command Centre, Inbox, Operations, Tools, Calendar, Settings, Activity Inbox, Assistant, Marketing, Fulfilment, People, Performance, Phases, SOP Library, Notepad, and the development workspaces rendered their main desktop views.
- Marketing Pulse, Demand, Funnels, Customers, Channels, and Automations all rendered without a visible error, broken image, or root overflow.
- Fulfilment Overview, Stage Board, Services, Technical, Aqua Tags, Client Workspaces, and Portals all rendered without a visible error, broken image, or root overflow.
- Client Overview, Relationship, Communications, Fulfilment, Commercial, Client Record, Portal, Files, and Settings rendered. The `systems` deep link is the exception documented in AUD-07.
- All eight private client-preview sections rendered: Home, Project, Results, Files, Billing, Support, Resources, and Your details.
- Portal-editor `Just tell it`, `Visual builder`, and `Dev` mode buttons all responded after warm-up. The audit returned the editor to Visual Builder and did not save or publish.
- Workspace search opened, accepted `clients`, exposed filters, and returned ranked results.
- Command Centre switched to its executive overview successfully; switching to Battle Table then reproduced AUD-04.
- All ten Settings tabs selected correctly: Account, Team, Workspace, Showcase, Freelancer access, Defaults, Notifications, What's new, Activity log, and Launch.
- Valid person, product, phase, pipeline, and development-project detail templates rendered. Organisation detail, proposal, career-status, and website-preview templates produced safe empty/not-found states because no suitable valid fixture existed.
- Customer, team, and freelancer role routes failed closed back to the agency workspace for this owner session instead of cross-opening another role's shell.
- Representative verified mobile screens had no root overflow or broken images, and both mobile menu systems worked.
- Measured desktop routes showed no duplicate IDs, basic unlabeled-button failures, or root-level horizontal overflow in the automated heuristics.
- The recurring Chrome-extension message-channel console error was excluded because it is browser-extension noise, not an AquaCRM application error.

This is a visual, route, and interaction audit with basic accessibility heuristics. It is not a WCAG conformance audit, penetration test, or proof of backend mutation enforcement.

## Coverage by application area

| Area | Browser coverage | Result |
|---|---|---|
| Agency core | Command Centre, Inbox, Operations, Tools, Settings, Calendar, Actions, Activity Inbox, Assistant, Company/Battle, Contacts, catch-all | **Fail:** Battle crash, public-owner access, and data exposure |
| Delivery and growth | All Fulfilment and Marketing views, Performance, People, Phases, Products, Pipeline, Radar, SOP Library, Notepad, You Deserve It | Main views render; severe cold-route outliers remain |
| Development | Hub, project detail, code, performance, website, toolkit, vault, workflow, technical aliases, Dev Docs | **Fail:** internal exposure; several slow routes |
| Portals | Portal list, forms, demo redirect, preview redirect, editor modes, client preview sections, website-preview empty state | Warm editor works; cold start and mobile toolbar fail quality bar |
| Clients | Journey, directory, overview, all principal tabs, settings, catch-all, customer preview | Main fixture renders; `systems` deep link misroutes |
| Account and role gates | Portal router, profile, permissions, preferences alias, team, freelancer, all customer children, customer catch-all, admin not-found | **Fail:** public session is Business owner / Account owner |
| Dev Team | Every page template, including plans/new | **Fail:** entire internal workspace exposed |
| Public website | Every page template plus Health Check interaction | **Fail:** Health Check answering flow is broken |
| Authentication and token states | Login, forgot, reset, magic fallback, setup, embed, connection, proposal, career status | Safe tested states; no real token or external submission used |
| Responsive | Eight representative screens plus both mobile menus at 390 × 844 | Broad pass; editor toolbar clipping remains |

## Page-template coverage manifest

Every route below represents a `page.*` template exercised at least once. `:id`, `:slug`, and `:token` denote dynamic templates, not guessed production identifiers.

```text
Public and authentication
/, /business-os, /client-centre, /health-check,
/portfolio, /portfolio/beast-commerce, /portfolio/ocean-boulevard,
/resources, /tools, /careers, /careers/status/:token,
/client-preview/:clientId, /client-website-preview/:clientId/:siteId/:pageId,
/connect/:connectionId, /embed/account,
/login, /login/forgot, /login/magic, /login/reset,
/proposal/:token, /setup

Portal, account, and role shells
/portal, /portal/account, /portal/account/permissions,
/portal/account/preferences,
/portal/customer, /portal/customer/account, /portal/customer/affiliate,
/portal/customer/bookings, /portal/customer/membership,
/portal/customer/orders, /portal/customer/:rest,
/portal/freelancer, /portal/team, /portal/team/:section

Agency core and workspaces
/portal/agency, /portal/agency/:rest,
/portal/agency/actions, /activity-inbox, /assistant, /automations,
/calendar, /command-center, /company, /contacts,
/contacts/:personId, /contacts/companies/:organisationId,
/inbox, /operations, /tools, /settings,
/freelancer-access, /freelancers, /governance,
/marketing, /notepad, /people, /performance,
/phases, /phases/:phaseId, /pipelines/:slug,
/products, /products/:productId, /radar,
/sop-library, /sops, /you-deserve-it

Development and fulfilment
/portal/agency/development, /development/code,
/development/performance, /development/projects/:projectId,
/development/toolkit, /development/vault,
/development/website, /development/workflow, /dev-docs,
/portal/agency/fulfilment,
/fulfilment/technical/performance,
/fulfilment/technical/projects/:projectId,
/fulfilment/technical/toolkit, /fulfilment/technical/vault,
/fulfilment/technical/website, /fulfilment/technical/workflow

Portals and clients
/portal/agency/portals, /portals/forms, /portals/editor,
/portals/demo/:template, /portal/preview/:template,
/portal/clients, /portal/clients/:clientId,
/portal/clients/:clientId/settings, /portal/clients/:clientId/:rest

Dev Team
/portal/dev-team, /api, /auditor, /chat, /docs,
/editor, /editor/studio, /findings, /inspector,
/library, /logs, /notes, /plans/new, /roadmap,
/tasks, /tools, /updates, /working
```

## Principal query and interaction coverage

```text
Marketing views
pulse, demand, funnels, customers, channels, automations

Fulfilment views
overview, stages, services, technical, tags, clients, portals

Client workspace tabs
overview, relationship, communications, delivery, finance,
notes, portal, files, systems redirect, settings

Client-preview sections
home, project, results, files, billing, support, resources, details

Settings tabs
account, team, workspace, showcase, freelancer access,
defaults, notifications, what's new, activity log, launch

Portal-editor modes
Just tell it, Visual builder, Dev

Mobile interactions
public Menu open/close, app navigation drawer open/close
```

## Explicit limitations

- No destructive or write-capable action was clicked. The audit proves that owner capabilities and write UI are exposed; it does not claim a successful backend write.
- Proposal, career-status, reset-completion, organisation-detail, and website-preview success states could not be exercised without valid tokens or records. Their invalid or empty states were tested instead.
- Customer, staff/team, and freelancer content was not tested as those personas because no credentials were supplied and changing session identity would exceed a read-only public-showcase audit. Their gates and redirects were tested from the current owner session.
- External OAuth, email, Stripe, Meta, GitHub publication, uploads, password-reset completion, and real client sign-in were not submitted.
- The 390 × 844 pass covered representative shells and the two mobile navigation systems, not every one of the 110 templates at every mobile breakpoint.
- Workers were editing the app during the audit. A later change can invalidate an earlier observation; every fix should be rerun against the same route and interaction rather than inferred from source.

## Recommended order

1. Remove owner authorization from the public showcase and enforce a server-side read-only role.
2. Block all Dev Team, Dev Docs, repository, editor Dev mode, and Settings write surfaces for that role.
3. Guarantee one sanitised fixed tenant/dataset and remove the exposed contact fixtures.
4. Fix the Battle Table `kind` crash or stuck-loading path and regression-test the final rendered station.
5. Restore the full Health Check answer flow and test a complete five-topic journey.
6. Reduce cold showcase, pipeline, portal, project, and development hydration time to a defined budget.
7. Fix the emitted `?tab=systems` deep link and other lost compatibility routes.
8. Make the portal-editor toolbar usable at mobile widths.
9. Update the in-app Auditor/checklist only after these browser gates pass.
10. Rerun this exact template and interaction matrix after the active worker changes settle.
<!-- AQUACRM_SOURCE_END path="docs/development/visual-browser-audit-2026-08-23.md" -->

---
