# Plan — Wire MFA into login

← [todo.md](../todo.md) · [development.md](../../development.md) · reference: [database dossier](../../workspace/database.md)

**Status: Phases 1 + 2 BUILT (2026-08-20). Phases 3 + 4 blocked — see below.**
This is the last outstanding piece of **security-hardening**, not a separate
feature: the 2026-08-20 audit found that hardening was incomplete for exactly
one reason, that `login/route.ts` had no MFA step.

It has one now. `/api/auth/login` reads the verified factors off the user
Supabase returns from the password grant and, when there is one, **withholds
`lk_session_v1`** until a TOTP code has been challenged, verified, and
confirmed by the `aal` claim on the token Supabase hands back. The account page
now has somewhere to switch it on from, and an honest on/off/unknown indicator.

Original problem statement, for the record: MFA was built on Supabase but did
not gate sign-in — `/api/auth/login` minted `lk_session_v1` with no MFA step
(verified against the route, 2026-08-19). The MFA worker's state.md row reading
"✅ Phase 4 complete" was about its own enrolment work, **not** this plan's
login gate.

### What was built (2026-08-20)

- `lib/server/mfa.ts` — `loginMfaStep()` (the decision: not-required /
  code-required / check-code / unavailable), `verifiedFactors()`,
  `readTokenAssurance()`, `raisedToSecondFactor()`. All pure, all unit-tested.
  A missing, blank, whitespace-only or non-string `code` lands on
  `code-required`; it can never land on `not-required`.
- `api/auth/login/route.ts` — the gate, placed **after** every existing check
  so no error message or ordering moved (nothing new reveals whether an account
  exists). Refusals deliberately skip `applyCookies`, so the half-finished
  Supabase session never reaches the browser — stronger than signing out
  afterwards, and it cannot revoke the person's sessions on other devices.
  A dedicated 5-codes-per-minute limiter on `{ip, email}` sits in front of
  Supabase; a wrong code also counts towards the existing R021 lockout, while
  the code *prompt* deliberately does not.
- `api/portal/mfa/enrol/route.ts` — a `GET` that answers "is it on?" without
  the enrolment POST's side effects. `verified` factors only, matching the gate.
- `portal/account/page.tsx` + `TwoFactorPanel.tsx` — the enrolment surface,
  reusing the existing `TwoFactorSetup` component rather than a second copy.
- `scripts/smoke-mfa.test.ts` — grew from 26 to 57 tests, most of them
  driving the real `POST` handler in-process against a stub Supabase. Nine
  mutations of the fix were each confirmed to turn the suite red.

### Still open

- **Phase 3 (session assurance)** — needs an `aal` field on `SessionPayload`
  (`server/types.ts`) and on `issueSession` (`lib/server/auth.ts`). Both are
  outside this plan's file map. Until then the app session records *that* two
  factors were satisfied only implicitly, by having been issued at all.
- **Phase 4 (recovery)** — backup codes need persisted state
  (`server/storage.ts` / `server/types.ts`), also outside the map. There is no
  recovery path today; the account panel says so plainly rather than pretending.
- **The login screen's code box** — `src/app/login/LoginForm.tsx` is outside
  the map. The server contract is ready for it: a first POST answers
  `401 { ok: false, mfaRequired: true, error }`, and the form should then
  re-POST the same credentials plus `code`. Until that lands, an enrolled user
  can be refused with nowhere to type the code — which is why enrolment stays
  opt-in and nobody is enrolled yet.
- **`docs/workspace/api-reference.md`** wants a row for
  `GET /api/portal/mfa/enrol`; that file is outside the map too.
- ⚠️ **The other doors into the same session.** `signInWithPassword` lives in
  exactly one route, so the *password* door is now gated — but `lk_session_v1`
  is also minted, with no MFA step at all, by:
  `api/auth/magic/verify/route.ts` (magic link),
  `api/auth/oauth/google/callback/route.ts` (Google),
  `api/auth/signup/route.ts` and `api/auth/end-customer/signup/route.ts`.
  For a user who has enrolled a factor, a magic link or a Google sign-in is
  today a way around the TOTP challenge. All four are outside this plan's file
  map and were **not** touched. Whoever holds them should apply the same shape:
  read the verified factors, withhold the cookie, require the code. Until then,
  "MFA on login" means the password login specifically.

## Where we are (verified)
- **Real Supabase MFA already exists:** `/api/portal/mfa/enrol` (`auth.mfa.enroll/listFactors/unenroll`) + `/api/portal/mfa/verify` (`auth.mfa.challenge/verify`). Tested (`smoke-mfa.test.ts`).
- `lib/server/mfa.ts` **decides *when* aal2 is required** (aal1 vs aal2 assurance) and fails closed — but it isn't gating login. Its own comment: "Aqua does not implement 2FA — Supabase Auth already has it."
- **The catch:** login (`/api/auth/login`) validates the password via Supabase, cross-checks `profiles.role`, then issues the app's **own** HMAC session cookie (`lk_session_v1`) — Supabase's session is largely discarded. So the MFA step has to gate **that cookie's issuance**, not just Supabase's session.

## The gap (closed 2026-08-20)
Enrolment + verify endpoints existed and `mfa.ts` knew *when* aal2 was needed,
but the **login flow never enforced it** — a user with a factor enrolled could
sign in with just a password. (This is also why the connect flow used `00000` as
an MFA stand-in; that is a separate gate and is unchanged.)

## Phases
1. ✅ **Enrolment surface** — let a user enrol a TOTP factor from account/security settings (the enrol endpoint exists; surface it with a QR + confirm). Show enrolled/disabled state.
2. ✅ **Login gate** — after a valid password, if the user has an MFA factor, **withhold the app session cookie** and require a TOTP challenge → verify (reuse `mfa.ts` + `/api/portal/mfa/verify`) → *then* mint `lk_session_v1`. Rate-limit + lock out attempts (reuse `rateLimit.ts`).
3. ⛔ **Session assurance** — record the aal level on the session; `mfa.ts` gates sensitive actions to aal2 (owner actions, erasure, etc.).
4. ⛔ **Recovery** — a recovery path (backup codes / admin reset) so a lost authenticator doesn't lock an owner out permanently.

## Reuse
`lib/server/mfa.ts`, `/api/portal/mfa/{enrol,verify}`, Supabase `auth.mfa.*`, the login route (`/api/auth/login`), `rateLimit.ts`, `smoke-mfa.test.ts` (extend).

## Decisions (Ed)
- **Mandatory or opt-in?** — built as **opt-in** for now (the gate only fires
  for accounts that have actually enrolled), because the login screen has no
  code box yet. Making it mandatory is a one-line change once it does. All users, or opt-in, or mandatory for agency owners/managers only (they hold the keys)?
- Recovery method — backup codes, or owner-can-reset-staff?
- Does the connect flow's `00000` get replaced by real MFA, or stay a separate emailed code (see [connect-flow-real-codes](connect-flow-real-codes.md))? (They're related but distinct — MFA gates *login*, the connect code confirms *a connection*.)

## Done when (runtime-verified)
A user with a TOTP factor enrolled **cannot** get a session with password alone —
they must pass the TOTP challenge; wrong/replayed codes are rejected; lockout
holds; recovery works. Behavioural test on the gated cookie issuance.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/app/api/auth/login/route.ts`
- `src/lib/server/mfa.ts`
- `src/app/api/portal/mfa/enrol/route.ts`
- `src/app/api/portal/mfa/verify/route.ts`
- `src/lib/server/rateLimit.ts`
- `src/app/portal/account/page.tsx`
- `src/app/portal/account/TwoFactorPanel.tsx` _(created 2026-08-20 — page.tsx is
  a server component and cannot hold the panel's state itself; colocated so it
  stays with the page that owns it)_
- `scripts/smoke-mfa.test.ts`
- `docs/development/plans/mfa-login.md`
