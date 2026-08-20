# Next wave — ready-to-spin briefs + launch checklist

← [state.md](state.md) · **Written 2026-08-19 as the orchestrator neared its context
limit. This is the paste-and-go payload for the next commander/Ed.** The whole
completion batch is BUILT + auditor-verified (see the [state.md](state.md) workers
table + [audits.md](../development/audits.md)). What remains is: **3 narrow fixes,
Ed's external bits, and a verify sweep once `:3032` is freed.**

---

> ⚠ **RE-AUDITS ARE NOW ON-REQUEST** — the recurring auditor loop was **stopped by Ed (2026-08-19)**. The auditor does NOT auto-fire anymore. When a 🔴 fix lands, whoever's driving must **re-run `/loop` in the Auditor chat** (or point it at the changed files) to get the re-verify — do NOT wait for an automatic tick. All existing verdicts + the 3 🔴s carry over in [audits.md](../development/audits.md).

## 🔴 The 3 blocker-fixes (each one focused pass; the hard logic around each is auditor-confirmed sound)

### Fix 1 — Freelancer preview privilege escalation (SECURITY — most urgent)
**Route to:** the freelancer-workspace worker (it owns the code). **File:** `src/app/api/auth/preview-as-freelancer/route.ts`.
> The preview `enter` admits owner **and** manager (~:47), but `exit` re-mints as *"an agency-owner it finds"* (~:31) regardless of who entered — the preview session stores only `previewReturnAgencyId`, not the enterer's identity. **So any MANAGER can: POST {employeeId} (enter) → POST {action:"exit"} → and hold a full OWNER session. 2 requests, manager → owner.** Tests miss it (they use an owner enterer).
> **Fix:** stash the ENTERER's exact identity (userId) on the preview session at enter, and on exit restore THAT specific user — never "an owner it finds." (Fast fallback: owner/founder-only enter, but that drops manager-preview.) **Test (must add):** a MANAGER enters then exits → restored to the MANAGER session, NOT owner. Also confirm the additive `api/auth/dev-mode/route.ts` edit didn't weaken Dev Mode's founder-only gate. Full suite + browser-verify. Re-audit after.

### Fix 2 — Erasure email-in-LOG (GDPR launch blocker)
**Route to:** the erasure worker. **Files:** `built-ins/modules/leads-pipeline/.../contacts.ts` (`ContactService.delete`, ~:272) + `server/clientErasure.ts`.
> `ContactService.delete` logs `"Archived contact <email>"` with **no clientId**; `clientErasure` sweeps activity by `clientId` only (no content scrub) → **the email survives in the activity log after a client erase.** Phase 2b fixed the email-in-KEY (pointer) — a *different* thing. Auditor **confirmed** the RETAIN classification + `brand_enquiries` split are SOUND — only this log line is open.
> **Fix:** don't log the email (redact/omit) in that log path during a client erasure. **Test (must add):** after erasing a leads-pipeline client, assert the email is ABSENT from the activity log. Re-audit → un-hold launch-safe when both land.

### Fix 3 — Finance create-surface idempotency (money launch blocker)
**Route to:** a fresh Finance worker (files free). **Files:** `built-ins/modules/agency-finance/` — `payments.record`, `createInvoice`, `createIncome`, `createPlan`, compensationPayments + `lib/server/closeDeal.ts`.
> The create-surface has **no dedup** → recording a manual bank/cash payment twice **double-counts money-in** (aggregation shows 2×); a double-click on "Close the deal" **double-bills**. (The Stripe webhook + delight wire ARE idempotent; the create-surface is not — the "idempotent" in payments.ts is only a comment about the Stripe externalRef.)
> **Fix:** ONE shared idempotency mechanism (client-supplied idempotency key server-checked, or same-actor/same-amount/short-window dedup) across all finance money-create paths. REUSE the existing stable-reference pattern (Stripe PaymentIntent / delight `delight:<id>` reference). **PRESERVE the nuance:** multiple payments per invoice ARE legitimate (partial payments) — dedup ACCIDENTAL dupes, never block intentional multiples. **Test (must prove both):** two rapid identical submits → exactly one record; a genuine second/partial payment → still allowed. **Safety invariant:** app never holds funds; Stripe keys are Ed's, never logged; TEST mode. Re-audit → un-hold money-safe after.

---

## 🟠 Unrouted finding — published-site Login/Signup blocks are broken (needs an owner)
Found by the `money` worker while sweeping a bug class it had just fixed in Finance. **Not fixed on
purpose:** it spans `/api/auth/*` (shared, security-sensitive, rate-limited) and `website-editor`
(the `bundle` worker's plugin) — neither is the finance lane. Full write-up: [issues.md #14](../development/issues.md).

**Paste-ready:**
```
You're a development worker on AquaCRM, working dir: aquaCRM/portal/

ORIENT: docs/development.md → docs/development/issues.md #14 → docs/context/worker-brief.md

THE BUG: a visitor to a client's PUBLISHED website cannot sign in or sign up.
`website-editor/src/components/blocks/LoginFormBlock.tsx` + `SignupFormBlock.tsx` render a native
`<form action={action} method="POST">` defaulting to `/api/auth/login` and `/api/auth/signup`. A
native submit sends form-encoded and does a full-page navigation; both routes parse with
`req.json()` only (`login/route.ts:46`, `signup/route.ts:52`) and catch the throw into a 400 JSON
body — so the visitor lands on a raw `{"ok":false,"error":"Invalid request."}` with no way back.

YOUR JOB: fix it, and prove it end-to-end (a real form-encoded POST, not just a unit test).
Recommended fix (a): make BOTH routes accept either encoding and 303-redirect for browser posts.
`src/app/api/auth/profile/update/route.ts` ALREADY DOES EXACTLY THIS — copy that shape
(`req.json().catch(() => ({}))` → `req.formData()` → `NextResponse.redirect(..., 303)`). It keeps
the blocks working without JS. Alternative (b): make the blocks submit via `fetch`
(`agency-finance/src/components/NewPlanForm.tsx` is the reference) — worse, it needs JS.

CARE: these are the real sign-in/sign-up routes. Do NOT weaken the rate limiter, the error
messages (they must not leak whether an account exists), or the session/cookie handling. Adding an
encoding is the whole change. On a redirect, do not put credentials or errors in the query string.
Check first whether these blocks are actually reachable in a shipped template — the money worker
source-verified only and did NOT confirm it against a live published site; if they're unreachable,
say so and fix the routes anyway (cheap, and the blocks exist).

TESTS: a form-encoded POST signs in and 303s back (not a 400 JSON blob); a JSON POST still works
unchanged; a bad credential still fails the same way it does today.

HARD RULES: full suite before done · own sandbox (npm run sandbox:fork -- <name> <port>) ·
npm run worker:checkin · NO GIT (the tree is all-uncommitted — `git checkout <file>` deletes other
workers' unshipped work; back up to /tmp and restore with cp).
```

## 🧑‍💼 Launch checklist — Ed's external bits (not code)
- [ ] **Connect an email sender** (Resend/SMTP, Company → Connections) — highest leverage: unblocks connect-codes AND enquiry replies. The meta-inbox "Start here — connect an email sender" callout guides it.
- [ ] **Create a Meta Developer app** + HTTPS deploy + register the webhook (`/api/webhooks/meta`) + verify token — to test the Meta inbox live (localhost can't complete OAuth by design).
- [ ] **Enable RLS** in the Supabase dashboard — tenant isolation (currently app-code only). The big one for real client data. **CORRECTED 2026-08-20:** RLS is **ON** in the live project (verified 2026-08-20 across 14 tables with the public anon key). What remains is engineering, not an Ed task: no RLS SQL in the repo, `brand_enquiries` has no `agency_id`, and ~37 service-role refs bypass it — see [rls-enable](plans/rls-enable.md).
- [ ] **Live-Stripe verify** — `npm i stripe` → TEST keys in Finance settings → point a Stripe webhook at `…/api/portal/agency-finance/stripe/webhook?agencyId=<id>` → test a payment + refund.
- [ ] **Erasure:** staged live run vs a throwaway seeded client (dev/staging Supabase) + **DPO/solicitor sign-off** on the retention schedule, then wire retained-data expiry.
- [ ] **First git commit** — increasingly needed: enables per-worker **worktrees** (fixes the verify bottleneck + clobber risk), lets us bisect the flaky suite. Ed's call.
- [ ] **`PORTAL_SESSION_SECRET`** set in every environment (prod especially) — the connect codes are signed with it.

---

## ⚙️ ~~Infra blocker~~ → RESOLVED 2026-08-19 — `:3032` FREED, Commander verify server RUNNING
✅ `:3032` is **free and serving** — the dead lock cleared when its owning chat closed; the Commander verify server is back up (`aquacrm-verify` = file backend + `milesymedia` seed + dev-mode; `/dev` mints an owner session; browser-verified — Contacts renders, no console errors). The **browser-verify sweep can proceed.** ⚠ Shared file backend (`.data/portal-state.json`): concurrent worker `dev:verify` runs can clobber it → route UI checks through the Commander server, or commit → git worktrees (own checkout/port/`.data` per worker). The **Commander runs the browser-verify sweep:**
- Freelancer (after its fix — incl. the manager-exit-doesn't-become-owner test)
- Finance UIs (pay-by-card, close-the-deal, AR/AP aging)
- Public-bucket **live CDN** — ⚠ writes 1 test image to the **LIVE** `aquacrm-public` bucket (no local Supabase sandbox) → **needs Ed's explicit OK**; delete the object after.
- Dev-docs · connect-flow code-step · enquiry-card real-data · KPI custom-builder + customer-intel

---

## 📝 Held / parked
- **Radar §9 continuation** — a brief exists but its invariant is STALE: it says keep **2,040 rules / 170 families**, but Aqua-Tag grew it to **2,064 / 172** (guarded, auditor-verified). **Correct the brief to 2,064 before spinning** or the worker's first suite run fails. Feature-extension → park behind the blockers.
- **Small follow-ups:** kpiViews server-persisted saved views (Ed said "both", built local-only) · public-bucket refcount-aware unpublish cleanup · aqua-tag remainders (P5 flagging findings need the radar probe pipeline; company enquiry surface; per-client injection keys) · Staff's agency-hr `Staff` retirement (cleanup) · enquiry-card's Person-on-conversion + leads-pipeline re-linking.

## 🤔 Decisions Ed owes (unblock parked plans)
Advisor Omega **vision** · Operations **sidebar name + GDPR-first vs HIPAA** · Marketing **consolidate 12 views? fixed KPIs vs explorer** · **kpiViews** park-or-build · **You-Deserve-It** when.

---

## The one-line status
**Engine built + auditor-verified. 3 narrow fixes + Ed's external bits + a verify sweep = launch-ready.** Not building anymore — finishing.
