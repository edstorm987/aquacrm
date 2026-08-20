# Where We Stand

**Written 2026-08-20. Every claim below was checked against the source code, not against another document.**

---

## Reading order

1. **This file** — the honest summary, two minutes.
2. **`docs/development/checklist.md`** — the live launch checklist.
3. **`docs/development/roadmap.md`** — what's queued next.
4. **`docs/architecture-noobie.md`** — how the system actually works, in plain English.

**A warning about everything else.** Four groups corrected the docs today. Anything not touched in that pass was written before 2026-08-20 and may describe a world that no longer exists. If a doc tells you something is broken or unbuilt, **read the source file before you believe it**. That rule is not a formality — today three "🔴 launch blockers" were briefed as open when all three had already been fixed, and one of those briefs would have sent a worker back into a hardened auth route to "fix" it.

---

## 1. The honest state

The system is in far better shape than the documents said it was. The suite is green, the type checker is clean, and the three things that were being called launch blockers are all fixed and have been for a day or more. Security is real, not aspirational: MFA gates sign-in, connect codes are genuine emailed six-digit codes, and row-level security is switched on in the live database with the policies in the repo. What is left is not a wall — it is a short list of accounts and decisions only you can make, one genuinely public-facing bug, and a real gap in **walking the product in a browser** rather than proving it with tests. The documents, not the code, were the thing holding this back.

---

## 2. What is actually done

### The three "launch blockers" — all fixed
You have been carrying these as open. They are not.

- **Freelancer preview escalation.** `src/app/api/auth/preview-as-freelancer/route.ts:97-101` saves who entered preview; `:43-49` puts back that exact person on exit, with no fallback to an owner. Fails closed.
- **Finance duplicate-charge safety.** `src/built-ins/modules/agency-finance/src/lib/idempotency.ts` exists and is wired into invoices, plans, operations, expenses, payments and income.
- **Erasure leaking an email into the log.** `src/built-ins/modules/leads-pipeline/src/server/contacts.ts:227,252,279` now log a contact id, never an address. The deeper follow-up (the hook matching a field nobody set) is also closed — `leads-pipeline/index.ts:168-180`.

### Security
- **MFA gates login.** Server side: `src/app/api/auth/login/route.ts:312-320` refuses a session for an enrolled account with no code; `:329` rate-limits attempts to 5/min; `:340-345` runs the real Supabase challenge/verify; `:355` re-reads the returned token and rejects a success that did not actually raise assurance. Browser side: the code box is at `src/app/login/LoginForm.tsx:197-211`. This claim was stale in **four documents at once** — it was the single most expensive wrong line in the tree.
- **Row-level security is ON** in the live database, verified across 14 tables using the public key. **And the SQL is in the repo** — 14 migrations in `aquaCRM/supabase/migrations/`, plus `rls-verify.sql` and a coverage test. Earlier briefs said "the RLS policies ARE version-controlled — 14 migrations in `aquaCRM/supabase/migrations/`, 13 of them predating 2026-08-20. An earlier note here said there were none; that was wrong, written by looking inside `portal/` only"; that was only true if you looked inside `portal/` and stopped there.
- **Connect codes are real.** Generated 6-digit code, hashed, 15-minute expiry, single-use, constant-time compare, 5-attempt lockout, emailed for real (`src/lib/server/connectionConfirmation.ts`). The `000000` dev code only works in dev mode.
- **Email sending is live.** Resend is configured and the readiness check reports email READY.

### Product
- **Marketing** consolidated ten views into five, and every old link still resolves.
- **Dev Console** is six sections with tabs, not twelve sidebar items. Eight old routes are redirect stubs.
- **Company switcher** shipped, with brand-aware sign-in.
- **Element engine** P1+P2 landed; the block vocabulary now lives in `src/lib/elements/`.
- **Database & storage health** is a real panel with real latency bands that shows "untested" rather than a fake green.
- **The "0 pageviews" lie is fixed** — an unmonitored agency now shows "—" and "Not monitored", not a confident zero.
- **Client health, Aqua Tag manager, Dev Console topbar, KPI overhaul** — all shipped and mounted.
- **The codebase is organised (2026-08-20, evening).** `src/lib` → 15 domain folders; `src/lib/server` → 12 families; six twin filenames renamed `*Service.ts`. Every layer now has one home and a decision table says where new code goes. Verified: tsc 0, full suite 2,458/0.
- **The editor has ONE name: Aqua Engine (2026-08-20, evening).** Every "Website editor" / "Portal editor" / "Studio" label in the product now reads Aqua Engine. Plugin id and URLs unchanged by design.

### Proof
- Suite **2382 pass / 0 fail**; typecheck **0 errors**. (One caveat — see section 4.)
- Doc-parsing suites re-run after today's edits: green.
- The verification bottleneck is solved: `npm run sandbox:fork` gives each worker its own port, state file and build folder. Three workers verified in a real browser today on separate ports.

---

## 3. What is genuinely open

### Needs you — decisions or accounts nobody else can make

| Item | Size |
|---|---|
| **First git commit.** The whole tree is uncommitted. This is the one real launch blocker left. | Your call, then one careful session |
| **Meta app** for the Instagram/Facebook inbox — needs your account and an HTTPS deploy | An afternoon of admin |
| **`npm i stripe`.** The keys are already in `.env.local`; the package is simply not installed | Two minutes, but it's your account to verify against |
| **Aqua Tag form-capture consent** — form captures currently write `consent:false` with no gate. Genuinely your call | A decision |
| **Is a "company" an Agency or a Trading Company?** Blocks the rest of promotion | A decision |
| **DPO sign-off + one staged live erasure run** before you handle real client data | An hour with someone |
| **Walk the onboarding chain** end to end yourself | An hour |
| **Five open Radar questions** (`plans/radar-upgrade.md:129-134`) — placement, scope, probe cadence | Ten minutes with a coffee |

### Needs engineering — no decision required

- **Company promotion: phases 1–3 BUILT (2026-08-20, evening).** `src/server/companyPortal/` holds the disposition map (all 78 collections classified, tsc-enforced) and the zero-write preview; the endpoint has its security shell. Phases 4–10 (the actual move + plugin `onPromoteCompany` hooks + UI) are open. The model is settled: agency = holding group, companies stay companies and gain portals.
- **Element engine P3 LANDED (2026-08-20, evening).** The portal's 16 block types are expressed in the shared vocabulary (`src/lib/elements/portalElements.ts`): 14 as aliases of existing elements, 2 as portal-only definitions. A parity harness pins every portal block's rendered HTML byte-for-byte (`scripts/smoke-portal-element-parity.test.ts`) — it has already caught its first real diff (the deliberate Aqua Engine copy change) and demanded it be declared.

- ~~Signup is publicly broken~~ **FIXED 2026-08-20 (later the same day).** A form post now creates a WEBSITE LEAD (never an agency, never a user, no password read), answers with a 303 back to the page, and the visitor sees a real confirmation. 25 tests pin it. The same lane found and fixed a worse cousin: `CrmContactFormBlock` posted to an endpoint that never existed and showed a fake "thanks" while dropping every enquiry — it now posts to `/api/public/contact` and only confirms a real write.
- **RLS residue.** `brand_enquiries` has no agency id, and roughly 27-36 places still use the service key that bypasses RLS. Medium, and it is engineering, not your decision.
- ~~One stale test~~ Resolved — the suite runs fully green (2,458 / 0).
- **MFA phases 3-4** — per-request assurance and recovery codes. Right now assurance is proven once at sign-in and never re-checked. Also: magic link, Google sign-in and both signup routes mint a session with **zero** MFA. Medium, and worth doing before real clients.
- **Shared saved KPI views.** You decided private *and* shared; only private (browser-local) was built. Small.
- **A type trap left open.** `commandIntelligence.ts:126,132` still say `?? 0` behind a separate "was it measured?" flag. The display is fixed, but the next person who reads that number gets a confident zero again. This class of bug has bitten twice. Small, worth doing while it's fresh.
- **Cleanup:** the `fulfilment`/`fulfillment` spelling split, two contacts systems, two inbox surfaces, no nav link to Aqua Tags.

---

## 4. What we do not know

Being straight with you about the edges.

- **UPDATE (2026-08-20, late evening): the walk happened.** All 60 portal routes
  served on an isolated sandbox: **54 clean 200s, 6 correct role-scope redirects,
  zero error boundaries** (the one logged 403 digest is `requireRole` refusing a
  cross-role page — the fence working). **The connect-code chain was clicked end
  to end in a real browser for the first time**: connect link → recipient sign-in
  → 6-digit code step (real code emailed; dev bypass in sandbox) → "Already
  connected" → customer portal onboarding renders. The Aqua Engine rename was
  also verified rendered. Still unwalked: staff team, freelancer workspace,
  internal chat, public bucket, Meta inbox (needs Ed's Meta app).
- **The original caveat, kept for honesty:** Almost everything above is proved by tests and by reading the code. Tests are strong evidence that logic is right; they are weak evidence that a real person can complete a journey. Specifically unwalked: the **connect code step**, staff team, freelancer workspace, internal chat, public bucket, and the Meta inbox. This is the biggest honest gap in this document. It is not "probably fine" — it is untested in the way that matters most. The tooling to fix it exists now (`sandbox:fork`), so this is time, not a blocker.
- ~~The suite count is disputed~~ Settled by repeated full runs on 2026-08-20 (evening): **2,458 tests / 0 fail / 1 skip**, stable across four runs — including after the codebase reorganisation and the Aqua Engine rename.
- ~~Two "how many" numbers don't agree~~ **Measured 2026-08-20 (evening), method stated:** `createSupabaseAdminClient(` call sites in `src/`, excluding its definition — **23 call sites in 18 files**. Use this number and this method; re-measure the same way after any reduction. Same for the claim that the two block registries share "14 of 16" types — measured by name it is 4. **Do not plan a deletion against the 14.**
- **We do not know whether Radar's shipped work already answers its own open questions.** It might. It couldn't be proved from source, so it stays on the board rather than being quietly closed.
- **Three plan docs are stuck.** They are finished and should be archived, but contract tests pin them by their exact file path, so moving them turns the suite red. They are marked in place.
- **Some old docs elsewhere still call RLS a 🔴 blocker.** Roughly twelve of them. None are in the folders corrected today, but they are out there.

---

## 5. The next three things (refreshed, evening)

1. ~~Fix signup~~ **Done.** 2. is in progress: a full route sweep + the critical
   journeys are being walked in a browser on an isolated sandbox right now.
2. **Walk the onboarding chain yourself** — client → connect link → code → their
   portal. The commander walks it first in the sandbox; your walk on your own
   data is the sign-off that matters.
3. **Make the first git commit.** Still the one true launch blocker. Commit ≠
   push: nothing reaches Vercel until a push, so the commit itself is safe.

---

*If a document contradicts this file, check the source and then fix the document. A doc records what someone believed on the day they wrote it. The code records what is true.*
