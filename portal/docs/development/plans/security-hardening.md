# Plan — Security hardening + a security operations surface

← [todo.md](../todo.md) · [operations-command-surface.md](operations-command-surface.md) · [development.md](../../development.md)

**Status: P0 BUILDING — central session revocation is broken; the dedicated posture surface is unbuilt; MFA and in-repo RLS implementation exist.** _(Corrected 2026-08-24 after a stale owner cookie created a working external-AI token following owner→staff downgrade.)_ Tighten security to the maximum and give it a **dedicated
surface** — posture at a glance, attack monitoring/prevention, access management,
incident response. The primitives exist and are switched on; what is missing is a **home** for them. No security view exists anywhere under `src/app/portal/agency/`, and `sidebarLayout.ts` has no security entry — Phase 1 has not started.

## Where we are (verified)
- **Real primitives exist, but the central session gate is unsafe:** `auth.ts`
  issues `sessionRev`, yet `getSessionFromRequest()`, `getSession()` and
  `requireRole()` do not enforce it against the current user record. Isolated
  callers that use `getCurrentUser()` or manually call `isSessionFresh()` are not
  a whole-application revocation mechanism.
- **Two gaps this plan was written around have CLOSED — do not brief them as open:**
  - ✅ **RLS *is* in the repo, and it is on.** The claim "not in the repo" was an artefact of auditing `portal/` alone: the policies live in `../../../../supabase/migrations/` (16 migrations), beside `portal/`, not inside it. The live project was verified with the anon key on 2026-08-20; pending migrations still need production application. See [rls-enable](rls-enable.md) for the corrected picture. **The honest posture still stands, though:** admin/service-role call sites bypass RLS, so it is defence-in-depth on those paths — **not** tenant isolation, and it must not be sold as such.
  - ✅ **All four MFA phases are built.** Password login performs the real challenge/verify and assurance raise, sessions carry the proven `aal`, magic-link/OAuth doors fail closed for enrolled accounts, and ten single-use recovery codes are supported. The narrower signup/enrolment/backup-method decisions are recorded in [mfa-login](mfa-login.md); they are not unfinished phases 3–4.
- **The gaps that are still real:**
  - **P0 session revocation:** role/password/membership/account changes do not
    reliably invalidate old cookies across sensitive APIs. A stale owner cookie
    created a working external-AI key after downgrade to staff (issues #22).
  - **No security surface** — nothing shows posture, failed logins, lockouts, active sessions, or attacks.
  - No access review, session/device management, secret-rotation tracking, or security-event audit/alerting.
  - `brand_enquiries` has no `agency_id`, so RLS cannot scope it by tenant however the policies are written ([rls-enable](rls-enable.md) gap 3, Ed's decision).

## The security operations surface (the new home)
A dedicated view (under [Operations/System](operations-command-surface.md)):
- **Posture at a glance** — RLS on? MFA enforced? secrets rotated? env self-check green? encryption on? — **green only on real evidence**, red/blind otherwise.
- **Attack monitoring** — rate-limit hits, login lockouts, failed-auth spikes, SSRF/blocked-fetch attempts, suspicious activity → **operational alerts** (reuse the Radar/alert model). "Was someone trying?"
- **Access management** — who has access, what role/scope, last active; **access review** (stale accounts, over-privileged), and the ability to revoke.
- **Sessions & devices** — active sessions, force-logout, session policy.
- **Incident response** — record a security incident + evidence (ties to the compliance breach register).
- **Secrets & subprocessors** — which secrets exist (names only), rotation status, and the vendor register.

## Hardening (close the gaps)
- **P0 central session freshness** — every protected role/scope decision must load
  the current user, reject absence/stale `sessionRev`, and derive current role and
  membership rather than trusting the old cookie. Behaviourally test old-cookie
  downgrade, password rotation and removal across representative sensitive APIs.
- ~~**Enforce RLS** and **wire MFA into login**~~ — **both done** (see above). What is left from those two plans is narrower and lives there: the `brand_enquiries` `agency_id` decision + reducing service-role reliance ([rls-enable](rls-enable.md) phases 3–4), and MFA session assurance + recovery codes ([mfa-login](mfa-login.md) phases 3–4).
- **Security headers/CSP** — audit + tighten (some exist in `next.config.ts`).
- **Rate-limit + lockout coverage** — ensure every sensitive endpoint is covered; surface the hits.
- **Audit logging of security events** — auth, role changes, erasures, access grants → the activity log, surfaced here.
- **Dependency + secret hygiene** — rotation reminders, secret-scanning, dependency alerts.

## Phases
0. 🚨 **Restore central session revocation** — issue #22; blocks relying on any
   cookie role for sensitive production actions.
1. **Security posture dashboard** — the surface + honest posture (RLS/MFA/encryption/env), pulling real state; **green only on evidence.**
2. **Attack monitoring + alerts** — surface rate-limit/lockout/failed-auth/SSRF events → alerts.
3. ✅ **Enforce the two big controls** — RLS + MFA-into-login. Both landed under their own plans; this phase is a tracker, not work. Their *remaining* phases are tracked there, not here.
4. **Access + session management** — review, revoke, force-logout, roles.
5. **Incident response + secret/subprocessor hygiene.**

## Reuse
`auth`/`mfa`/`csrf`/`rateLimit`/`nonceStore`/`secrets`, the login lockout, the Radar/operational-alert model (for attack alerts), the activity log (security audit), `next.config.ts` headers, and the [rls-enable](rls-enable.md) + [mfa-login](mfa-login.md) plans.

## Decisions (Ed)
- How aggressive on **access/session policy** (force-logout, session TTLs, IP allow-lists) — usability vs lockdown?
- Alerting threshold for "an attack" — what's noise vs. worth waking you?
- Client-side security posture too, or agency-first?

## Non-goals
- Not a SIEM/pen-test replacement — a posture + monitoring + response surface over the app's own controls.
- Not claiming "unhackable" — honest posture, maximised controls.

## Ties
[rls-enable](rls-enable.md), [mfa-login](mfa-login.md) (the two gating controls),
the [compliance plan](compliance-legal.md) (breach register / audit), and the
[Operations surface](operations-command-surface.md) (its home).

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/lib/server/auth/auth.ts`
- `src/lib/server/auth/csrf.ts`
- `src/lib/server/auth/mfa.ts`
- `src/lib/server/rateLimit.ts`
- `src/lib/server/auth/nonceStore.ts`
- `src/lib/server/secrets.ts`
- `src/lib/server/safeSiteFetch.ts`
- `src/app/api/auth/login/route.ts`
- `src/lib/server/inbox/operationalAlerts.ts`
- `src/lib/server/productionReadiness.ts`
- `src/lib/chrome/sidebarLayout.ts`
- `next.config.ts`
- `scripts/smoke-production-readiness.test.ts`
- `docs/development/plans/security-hardening.md`
