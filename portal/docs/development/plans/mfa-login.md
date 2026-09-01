# Plan — Wire MFA into login

← [todo.md](../TODO.md) · [development.md](../../development.md) · reference: [database dossier](../../workspace/database.md)

**Status: ALL FOUR PHASES BUILT (phases 3 + 4 on 2026-08-20, same day, second lane). Sessions carry the proven `aal`; magic-link + Google OAuth refuse MFA-enrolled accounts (fail-closed — they now REQUIRE `SUPABASE_SERVICE_ROLE_KEY` to mint anything); ten single-use scrypt-hashed recovery codes generate on the first TOTP-gated JSON sign-in, shown once, spendable in the login `code` field. Runtime-verified: `smoke-mfa.test.ts` (83 with `smoke-mfa-doors`) drives the real handlers. Leftovers, honestly: (1) both signup routes still mint sessions with no MFA check — low exposure (they refuse existing portal emails) but outside this lane's map; (2) recovery codes generate at first gated sign-in, not on the enrolment screen — the enrol/verify routes belong to the other lane; (3) recovery method built as backup codes (Ed's "backup codes vs owner-reset" decision was still open — guess made, confirm with Ed).**

> ⚠ Superseded 2026-08-20 (second lane): magic link and Google OAuth are now GATED (they refuse enrolled accounts and fail closed when enrolment cannot be read), and recovery codes exist. What remains true: **both signup routes** still mint `lk_session_v1` with no MFA check — they refuse existing portal emails, so the exposure is an email with an enrolled Supabase identity but no portal user; they are outside this plan's second-lane file map.
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

- ~~**Phase 3 (session assurance)**~~ — ✅ BUILT 2026-08-20 (second lane, which
  was granted the minimal additive edits: `SessionPayload.aal` in
  `server/types.ts` + `aal` passthrough in `lib/server/auth/auth.ts`). Note the
  recovery state deliberately lives ON `ServerUser` (`mfaRecovery`), NOT as a
  new `PortalState` collection — `parseBlob` in `server/storage.ts` is an
  allowlist that silently destroys unknown top-level collections, and
  storage.ts stayed outside the map.
- ~~**Phase 4 (recovery)**~~ — ✅ BUILT 2026-08-20, see phase list above. The
  account panel's "no recovery path" wording is now stale IF it still says so —
  the panel belongs to the other lane; whoever holds it should re-read it.
- ~~**The login screen's code box**~~ — ✅ **BUILT, and this bullet was stale.**
  Re-checked in source 2026-08-20: `LoginForm.tsx` holds `code` +
  `mfaRequired` state (`:54–55`), re-POSTs the same credentials plus `code`
  (`:105`), flips into the code step on `401 { mfaRequired: true }` (`:110`),
  and renders the field at `:197–211` (`autoComplete="one-time-code"`,
  `data-testid="login-mfa-code"`). So an enrolled user **does** have somewhere
  to type the code, and the "nobody is enrolled yet" caveat no longer follows
  from a missing box. Both halves of the gate — server and form — now exist.
- **`docs/workspace/api-reference.md`** wants a row for
  `GET /api/portal/mfa/enrol`; that file is outside the map too.
- ~~⚠️ **The other doors into the same session.**~~ — magic link + Google OAuth
  ✅ CLOSED 2026-08-20 (second lane): both check enrolment through the Supabase
  admin API (`checkSideDoorMfa`) and refuse enrolled accounts with
  `?magic_error|oauth_error=mfa_required`; an unreadable check refuses with
  `mfa_unavailable` (fail-closed — these two doors now REQUIRE
  `SUPABASE_SERVICE_ROLE_KEY` in every environment, which password-reset
  already required; it is in `.env.local`, verify Vercel). Cost note: the check
  is `auth.admin.listUsers` pagination per sign-in — fine pre-launch, replace
  with a direct lookup if user counts grow. **Still open: both signup routes**
  (`api/auth/signup`, `api/auth/end-customer/signup`) mint sessions with no
  check; they refuse existing portal emails, so the hole is an email with an
  enrolled Supabase identity but no portal user. Outside this lane's map.

## Where we are — the 2026-08-19 audit, kept for the record (superseded by "What was built" above)
- **Real Supabase MFA already exists:** `/api/portal/mfa/enrol` (`auth.mfa.enroll/listFactors/unenroll`) + `/api/portal/mfa/verify` (`auth.mfa.challenge/verify`). Tested (`smoke-mfa.test.ts`).
- `lib/server/mfa.ts` **decides *when* aal2 is required** (aal1 vs aal2 assurance) and fails closed. _(This section is the pre-fix audit, kept for the record: the "but it isn't gating login" clause it used to carry was true on 2026-08-19 and false from 2026-08-20 — see "What was built" above.)_
- **The catch:** login (`/api/auth/login`) validates the password via Supabase, cross-checks `profiles.role`, then issues the app's **own** HMAC session cookie (`lk_session_v1`) — Supabase's session is largely discarded. So the MFA step has to gate **that cookie's issuance**, not just Supabase's session.

## The gap (closed 2026-08-20)
Enrolment + verify endpoints existed and `mfa.ts` knew *when* aal2 was needed,
but the **login flow never enforced it** — a user with a factor enrolled could
sign in with just a password. (This is also why the connect flow used `00000` as
an MFA stand-in; that is a separate gate and is unchanged.)

## Phases
1. ✅ **Enrolment surface** — let a user enrol a TOTP factor from account/security settings (the enrol endpoint exists; surface it with a QR + confirm). Show enrolled/disabled state.
2. ✅ **Login gate** — after a valid password, if the user has an MFA factor, **withhold the app session cookie** and require a TOTP challenge → verify (reuse `mfa.ts` + `/api/portal/mfa/verify`) → *then* mint `lk_session_v1`. Rate-limit + lock out attempts (reuse `rateLimit.ts`).
3. ✅ **Session assurance** (2026-08-20) — every session-minting auth route stamps `SessionPayload.aal` ("aal2" only when a second factor was verified); read via `sessionAssurance` / `sessionHasSecondFactor` (`lib/server/auth/mfa.ts`), absence fails closed. Gating individual owner actions on aal2 is now a per-action wiring job for whoever owns each route.
4. ✅ **Recovery** (2026-08-20) — ten single-use recovery codes, scrypt-hashed on `ServerUser.mfaRecovery`, generated on the account's first TOTP-gated JSON sign-in (both factors freshly proven; the enrolment routes belong to the other lane), returned once as `recoveryCodes` on that login response (`LoginForm` holds the redirect until saved), spent via the same login `code` field (any non-six-digit entry), wrong codes rate-limited + counted to lockout. A native form post never triggers generation — it has nowhere to show them.

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
- `src/lib/server/auth/mfa.ts`
- `src/app/api/portal/mfa/enrol/route.ts`
- `src/app/api/portal/mfa/verify/route.ts`
- `src/lib/server/rateLimit.ts`
- `src/app/portal/account/page.tsx`
- `src/app/portal/account/TwoFactorPanel.tsx` _(created 2026-08-20 — page.tsx is
  a server component and cannot hold the panel's state itself; colocated so it
  stays with the page that owns it)_
- `scripts/smoke-mfa.test.ts`
- `docs/development/plans/mfa-login.md`
