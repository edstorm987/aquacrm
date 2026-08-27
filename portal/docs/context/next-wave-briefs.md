# Next wave — ready-to-spin briefs + launch checklist

← [state.md](state.md) · Written 2026-08-19 · **P0/P1 queue corrected against source/runtime evidence 2026-08-24.**

> 🛑 **READ THIS BEFORE YOU PASTE ANYTHING FROM THIS FILE.**
> This file holds paste-ready worker briefs. **A stale brief is worse than a stale doc** — it sends a
> real worker to "fix" code that is already fixed and hardened. That happened: on 2026-08-20 the
> three 🔴 briefs below were still live here, and one of them would have sent a worker back into a
> hardened auth route. **They are struck through now. Do not resurrect them.**
>
> **Rule for this file from now on: the moment a fix lands, strike its brief out with the file:line
> that proves it.** Before pasting any brief, open the files it names and confirm the bug is still
> there.
>
> **What is actually left (2026-08-24):** P0 central session revocation first;
> then P1 erasure completion/retry/audit truth and capability-based showcase
> read-only/isolation. The remaining engineering queue is file persistence/recovery,
> Editor AI distributed contract/proof, Editor transition/prefill guards, staff
> policy, unresolved references/truthful empty states, read-path performance and
> browser acceptance. External/live-account work remains separate in
> [checklist.md](../development/checklist.md).

---

> ⚠ **RE-AUDITS ARE NOW ON-REQUEST** — the recurring auditor loop was **stopped by Ed (2026-08-19)**. The auditor does NOT auto-fire anymore. When a 🔴 fix lands, whoever's driving must **re-run `/loop` in the Auditor chat** (or point it at the changed files) to get the re-verify — do NOT wait for an automatic tick. All existing verdicts + the 3 🔴s carry over in [audits.md](../development/audits.md).

## ✅ ~~The 3 blocker-fixes~~ — ALL THREE ARE FIXED. DO NOT SPIN THESE. (verified 2026-08-20)

> **Current override:** those three historical fixes remain fixed, but they no
> longer mean there are no launch blockers. Issues #22 (P0 session revocation),
> #23 (showcase mutation bypass) and #24 (erasure false-success/retry/audit PII)
> were found on 2026-08-24. In particular, the old erasure brief below closed a
> plugin-log leak, not the new end-to-end erasure failure.

| Was | Now | Proof in source |
|---|---|---|
| Fix 1 — freelancer preview privilege escalation | ✅ **FIXED** | `src/app/api/auth/preview-as-freelancer/route.ts` — `enter` stashes `previewReturnUserId: session.userId` (`:97-101`), `exit` restores **that exact user** with no owner fallback (`:43-49`). A MANAGER→MANAGER regression test exists (`scripts/smoke-dev-mode.test.ts`). |
| Fix 2 — erasure email-in-LOG (GDPR) | ✅ **FIXED** | `leads-pipeline/src/server/contacts.ts` — the three activity messages log a contact **id**, not an email (`:227` Promoted · `:252` Updated · `:279` Archived). And the deeper bug the auditor found is closed too: `onEraseClient` no longer matches on the never-set `contact.clientId`; it resolves the subject's emails and matches those (`leads-pipeline/index.ts:168-180`). |
| Fix 3 — finance create-surface idempotency | ✅ **FIXED** | `src/built-ins/modules/agency-finance/src/lib/idempotency.ts` — one shared mechanism, wired into six create surfaces plus expenses. |

<details>
<summary>The original three briefs, kept only as a record of what the bugs were. ⛔ Do not paste.</summary>

### ~~Fix 1 — Freelancer preview privilege escalation (SECURITY — most urgent)~~ ⛔ ALREADY FIXED
**Route to:** the freelancer-workspace worker (it owns the code). **File:** `src/app/api/auth/preview-as-freelancer/route.ts`.
> The preview `enter` admits owner **and** manager (~:47), but `exit` re-mints as *"an agency-owner it finds"* (~:31) regardless of who entered — the preview session stores only `previewReturnAgencyId`, not the enterer's identity. **So any MANAGER can: POST {employeeId} (enter) → POST {action:"exit"} → and hold a full OWNER session. 2 requests, manager → owner.** Tests miss it (they use an owner enterer).
> **Fix:** stash the ENTERER's exact identity (userId) on the preview session at enter, and on exit restore THAT specific user — never "an owner it finds." (Fast fallback: owner/founder-only enter, but that drops manager-preview.) **Test (must add):** a MANAGER enters then exits → restored to the MANAGER session, NOT owner. Also confirm the additive `api/auth/dev-mode/route.ts` edit didn't weaken Dev Mode's founder-only gate. Full suite + browser-verify. Re-audit after.

### ~~Fix 2 — Erasure email-in-LOG (GDPR launch blocker)~~ ⛔ ALREADY FIXED
**Route to:** the erasure worker. **Files:** `built-ins/modules/leads-pipeline/.../contacts.ts` (`ContactService.delete`, ~:272) + `server/clientErasure.ts`.
> `ContactService.delete` logs `"Archived contact <email>"` with **no clientId**; `clientErasure` sweeps activity by `clientId` only (no content scrub) → **the email survives in the activity log after a client erase.** Phase 2b fixed the email-in-KEY (pointer) — a *different* thing. Auditor **confirmed** the RETAIN classification + `brand_enquiries` split are SOUND — only this log line is open.
> **Fix:** don't log the email (redact/omit) in that log path during a client erasure. **Test (must add):** after erasing a leads-pipeline client, assert the email is ABSENT from the activity log. Re-audit → un-hold launch-safe when both land.

### ~~Fix 3 — Finance create-surface idempotency (money launch blocker)~~ ⛔ ALREADY FIXED
**Route to:** a fresh Finance worker (files free). **Files:** `built-ins/modules/agency-finance/` — `payments.record`, `createInvoice`, `createIncome`, `createPlan`, compensationPayments + `lib/server/closeDeal.ts`.
> The create-surface has **no dedup** → recording a manual bank/cash payment twice **double-counts money-in** (aggregation shows 2×); a double-click on "Close the deal" **double-bills**. (The Stripe webhook + delight wire ARE idempotent; the create-surface is not — the "idempotent" in payments.ts is only a comment about the Stripe externalRef.)
> **Fix:** ONE shared idempotency mechanism (client-supplied idempotency key server-checked, or same-actor/same-amount/short-window dedup) across all finance money-create paths. REUSE the existing stable-reference pattern (Stripe PaymentIntent / delight `delight:<id>` reference). **PRESERVE the nuance:** multiple payments per invoice ARE legitimate (partial payments) — dedup ACCIDENTAL dupes, never block intentional multiples. **Test (must prove both):** two rapid identical submits → exactly one record; a genuine second/partial payment → still allowed. **Safety invariant:** app never holds funds; Stripe keys are Ed's, never logged; TEST mode. Re-audit → un-hold money-safe after.

</details>

---

## ✅ CLOSED 2026-08-23 — published-site signup form transport

`src/app/api/auth/signup/route.ts` now accepts both native form posts and JSON,
returns the form flow with a 303 redirect, and preserves rate limiting. The real
form-encoding regression is in `scripts/smoke-auth-form-encoding.test.ts`. Do not
dispatch this brief again.

<details>
<summary>Historical brief — kept only to explain the fix</summary>

**Narrowed 2026-08-20.** The original finding covered **both** the login and signup blocks. The
**login half has since been fixed** — `src/app/api/auth/login/route.ts:124` now reads `req.formData()`
and 303-redirects, and [checklist.md](../development/checklist.md) lists "published-site login" as
shipped. **Do not touch the login route.** What is still broken is signup only:
`src/app/api/auth/signup/route.ts:53` parses `req.json()` only — the file contains **zero**
`formData` references — so `SignupFormBlock.tsx:8`'s native `<form method="POST">` to
`/api/auth/signup` still navigates a real visitor onto a raw
`{"ok":false,"error":"Invalid JSON."}`. Full write-up: [issues.md #14](../development/issues.md).

**Before pasting:** re-open `src/app/api/auth/signup/route.ts` and confirm it still has no
`formData()`. If it does, this brief is done — strike it out.

**Paste-ready:**
```
You're a development worker on AquaCRM, working dir: aquaCRM/portal/

ORIENT: docs/development.md → docs/development/issues.md #14 → docs/context/worker-brief.md

THE BUG: a visitor to a client's PUBLISHED website cannot SIGN UP.
`website-editor/src/components/blocks/SignupFormBlock.tsx:8` renders a native
`<form action={action} method="POST">` defaulting to `/api/auth/signup`. A native submit sends
form-encoded and does a full-page navigation; `src/app/api/auth/signup/route.ts:53` parses with
`req.json()` only and catches the throw into a 400 JSON body — so the visitor lands on a raw
`{"ok":false,"error":"Invalid JSON."}` with no way back.

SCOPE: SIGNUP ONLY. `/api/auth/login` was ALREADY FIXED (it accepts formData and 303-redirects at
login/route.ts:124). Read it first — it is your in-repo reference for this exact change on this
exact pair of routes. Do NOT modify the login route.

YOUR JOB: fix signup, and prove it end-to-end (a real form-encoded POST, not just a unit test).
Copy the shape already used by `src/app/api/auth/login/route.ts` (and originally by
`src/app/api/auth/profile/update/route.ts`): `req.json().catch(() => ({}))` → `req.formData()` →
`NextResponse.redirect(..., 303)`. It keeps the block working without JS.

CARE: this is the real sign-up route. Do NOT weaken the rate limiter, the error messages (they must
not leak whether an account exists), the email-verification token, or the session/cookie handling.
Adding an encoding is the whole change. On a redirect, do not put credentials or errors in the
query string. Check whether the block is actually reachable in a shipped template — this was
source-verified only, never confirmed against a live published site; if it is unreachable, say so
and fix the route anyway (cheap, and the block exists).

TESTS: a form-encoded POST creates an account and 303s to a page (not a 400 JSON blob); a JSON POST
still works unchanged; a duplicate email still 409s the same way it does today.

HARD RULES: full suite before done (PORTAL_BACKEND=memory NODE_OPTIONS='--conditions react-server'
npx tsx --test scripts/*.test.ts — the full `scripts/*.test.ts` glob, NOT smoke:all) · own sandbox
(npm run sandbox:fork -- <name> <port>) · npm run worker:checkin · NEVER TOUCH GIT (the tree is
all-uncommitted — a push triggers Vercel → production, and `git checkout <file>` deletes other
workers' unshipped work; back up to the scratchpad and restore with cp).
```

</details>

## Ready non-security work — source-verified 2026-08-24

1. **Storage reliability (issues #16–#17).** Make persistence acknowledgement
   await the real write, make `flush()` truthful, write the blob atomically, and
   fail into an explicit recovery state when JSON is malformed. Add failure-path
   tests that reproduce an unwritable target and corrupt input before changing code.
2. **Editor completion (issues #18–#19).** Treat local replay as already built.
   The migration, adapters, coordinator, project dirty-state reporting and AI
   project remount are now built and focused-tested. Add the claim DDL to the
   optional direct-Postgres schema, refresh state after the provider wait, apply
   and live-prove the migration, then cover browser hide, surface, lifecycle,
   refresh and project switching in one browser matrix.
3. **Truthful data and fast reads (issues #20–#21).** Reject or resolve orphan
   client references, remove fabricated website defaults, inventory `GET` routes
   that mutate, profile the whole-state rewrite cost, and isolate the showcase
   fixture. The broader showcase purge regression is green; visitor isolation is not.

These are independent workstreams only where their file ownership does not
overlap. Re-read [state.md](state.md) before dispatching because workers are active.

## 🧑‍💼 Launch checklist — Ed's external bits (not code)
- [x] ~~**Connect an email sender**~~ ✅ **ALREADY DONE — corrected 2026-08-20.** Resend is configured (`RESEND_API_KEY` is set) and `inspectProductionReadiness()` reports email READY. This sat unticked here for days while it was already live.
- [ ] **Create a Meta Developer app** + HTTPS deploy + register the webhook (`/api/webhooks/meta`) + verify token — to test the Meta inbox live (localhost can't complete OAuth by design).
- [x] ~~**Enable RLS** in the Supabase dashboard~~ ✅ **ALREADY ON — corrected 2026-08-23.** Verified across 14 live tables with the public anon key on 2026-08-20. The RLS policies are version-controlled in 16 migrations under `aquaCRM/supabase/migrations/`; the newest pending migrations still need to be applied before production rollout. Open engineering residue: `brand_enquiries` has no `agency_id`, and service-role call sites bypass RLS — measure the current count before acting. See [rls-enable](../development/plans/rls-enable.md).
- [ ] **Live-Stripe verify** — `stripe@22.5.0` is now installed and the in-app Finance settings/vault path is wired. What remains is live-account proof: confirm or replace the real keys in Finance settings, point a signed HTTPS webhook at `…/api/portal/agency-finance/stripe/webhook?agencyId=<id>`, then test Checkout, payment reconciliation and a refund. Never copy key values into this brief.
- [ ] **Erasure:** staged live run vs a throwaway seeded client (dev/staging Supabase) + **DPO/solicitor sign-off** on the retention schedule, then wire retained-data expiry.
- [x] ~~**First git commit**~~ ✅ **DONE 2026-08-21.** The branch was committed and pushed; merging it to `main` remains Ed's deployment decision.
- [ ] **`PORTAL_SESSION_SECRET`** set in every environment (prod especially) — the connect codes are signed with it. *(It IS set in local `.env.local`; the open part is prod.)*
- [ ] **Walk the onboarding chain once** on your own data — client → connection link → they sign in → they see their portal. Everything is built; **the code step has never been clicked.** ([checklist.md](../development/checklist.md) calls this the thing standing between you and the waiting clients.)
- [x] ~~**Decide: is a "company" an Agency or a TradingCompany?**~~ **SETTLED
  2026-08-20:** agency is the holding group; trading companies remain companies
  and receive portals. Company-promotion phases 1–3 use this model.

---

## ⚙️ ~~Infra blocker~~ → RESOLVED — and the shared-file hazard below is **also** solved now
> **Corrected 2026-08-20:** the warning at the end of this section ("route UI checks through the
> Commander server") is **retired**. Every worker forks a fully isolated sandbox with
> `npm run sandbox:fork -- <name> <port>` — own state file, own build dir, own port — so concurrent
> verification cannot clobber anything. The shared sandbox now additionally requires an explicit
> `PORTAL_ALLOW_SHARED_STATE=1` opt-in (`src/server/storage.ts:248`), pinned by
> `scripts/smoke-sandbox-protection.test.ts`. Workers browser-verify their own work.

### The original 2026-08-19 note — `:3032` FREED, Commander verify server RUNNING
✅ `:3032` is **free and serving** — the dead lock cleared when its owning chat closed; the Commander verify server is back up (`aquacrm-verify` = file backend + `milesymedia` seed + dev-mode; `/dev` mints an owner session; browser-verified — Contacts renders, no console errors). The **browser-verify sweep can proceed.** ⚠ Shared file backend (`.data/portal-state.json`): concurrent worker `dev:verify` runs can clobber it → route UI checks through the Commander server, or commit → git worktrees (own checkout/port/`.data` per worker). The **Commander runs the browser-verify sweep:**
- Freelancer (after its fix — incl. the manager-exit-doesn't-become-owner test)
- Finance UIs (pay-by-card, close-the-deal, AR/AP aging)
- Public-bucket **live CDN** — ⚠ writes 1 test image to the **LIVE** `aquacrm-public` bucket (no local Supabase sandbox) → **needs Ed's explicit OK**; delete the object after.
- Dev-docs · connect-flow code-step · enquiry-card real-data · KPI custom-builder + customer-intel

---

## 📝 Held / parked
- **Radar §9 continuation** — a brief exists but its invariant is STALE: it says keep **2,040 rules / 170 families**. ✅ **Re-verified 2026-08-20: the real figure is 2,064 / 172** — `src/engines/data/radar/radarRuleCatalog.ts` defines **172** family entries and `RADAR_RULE_LENSES` has **12** lenses (172 × 12 = 2,064). **Correct the brief to 2,064 / 172 before spinning** or the worker's first suite run fails. Feature-extension → park behind the blockers.
- **Small follow-ups:** kpiViews server-persisted saved views (Ed said "both", built local-only) · public-bucket refcount-aware unpublish cleanup · aqua-tag remainders (P5 flagging findings need the radar probe pipeline; company enquiry surface; per-client injection keys) · Staff's agency-hr `Staff` retirement (cleanup) · enquiry-card's Person-on-conversion + leads-pipeline re-linking.

## 🤔 Decisions Ed owes (unblock parked plans) — pruned 2026-08-20
Advisor Omega **vision** · Operations **sidebar name + GDPR-first vs HIPAA** · Marketing **fixed KPIs vs explorer** · **kpiViews** park-or-build · **You-Deserve-It** when.
~~Marketing **consolidate 12 views?**~~ ✅ **DECIDED AND DONE** — marketing consolidated **10 views → 5**, every old `?view=` still resolving.

---

## The one-line status (corrected 2026-08-24, P0/P1 scope)
**Last whole-suite proof (2026-08-23): 3,621 pass · 0 fail · 1 live-Postgres skip · typecheck clean.**
The product is broadly built; P0 session revocation is first, followed by P1
erasure/showcase truth and the remaining runtime reliability work (storage,
Editor, staff policy, data truth and slow read paths), then the unwalked browser
journeys and external setup owned by
[checklist.md](../development/checklist.md).

~~Engine built + auditor-verified. 3 narrow fixes + Ed's external bits + a verify sweep = launch-ready.~~
