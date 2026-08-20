# Plan — Security hardening + a security operations surface

← [todo.md](../todo.md) · [operations-command-surface.md](operations-command-surface.md) · [development.md](../../development.md)

**Status: PLAN.** Tighten security to the maximum and give it a **dedicated
surface** — posture at a glance, attack monitoring/prevention, access management,
incident response. Today the primitives exist but have **no home** and some
aren't even switched on.

## Where we are (verified)
- **Real primitives exist:** `auth.ts`, `csrf.ts`, `mfa.ts`, `rateLimit.ts` (+ login lockout), `nonceStore.ts` (single-use tokens), `secrets.ts`, SSRF-guarded fetch, encrypted-at-rest Meta tokens, consent-gated telemetry, a fail-closed env self-check.
- **But there are real gaps:**
  - 🔴 **DB Row-Level Security is NOT in the repo** — service-role bypasses it; tenant isolation is app-code only. ([rls-enable](rls-enable.md))
  - 🔴 **MFA is built but not gating login.** ([mfa-login](mfa-login.md))
  - **No security surface** — nothing shows posture, failed logins, lockouts, active sessions, or attacks.
  - No access review, session/device management, secret-rotation tracking, or security-event audit/alerting.

## The security operations surface (the new home)
A dedicated view (under [Operations/System](operations-command-surface.md)):
- **Posture at a glance** — RLS on? MFA enforced? secrets rotated? env self-check green? encryption on? — **green only on real evidence**, red/blind otherwise.
- **Attack monitoring** — rate-limit hits, login lockouts, failed-auth spikes, SSRF/blocked-fetch attempts, suspicious activity → **operational alerts** (reuse the Radar/alert model). "Was someone trying?"
- **Access management** — who has access, what role/scope, last active; **access review** (stale accounts, over-privileged), and the ability to revoke.
- **Sessions & devices** — active sessions, force-logout, session policy.
- **Incident response** — record a security incident + evidence (ties to the compliance breach register).
- **Secrets & subprocessors** — which secrets exist (names only), rotation status, and the vendor register.

## Hardening (close the gaps)
- **Enforce RLS** ([rls-enable](rls-enable.md)) and **wire MFA into login** ([mfa-login](mfa-login.md)) — these two are the biggest wins and already have plans.
- **Security headers/CSP** — audit + tighten (some exist in `next.config.ts`).
- **Rate-limit + lockout coverage** — ensure every sensitive endpoint is covered; surface the hits.
- **Audit logging of security events** — auth, role changes, erasures, access grants → the activity log, surfaced here.
- **Dependency + secret hygiene** — rotation reminders, secret-scanning, dependency alerts.

## Phases
1. **Security posture dashboard** — the surface + honest posture (RLS/MFA/encryption/env), pulling real state; **green only on evidence.**
2. **Attack monitoring + alerts** — surface rate-limit/lockout/failed-auth/SSRF events → alerts.
3. **Enforce the two big controls** — RLS + MFA-into-login (their own plans, tracked here).
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

- `src/lib/server/auth.ts`
- `src/lib/server/csrf.ts`
- `src/lib/server/mfa.ts`
- `src/lib/server/rateLimit.ts`
- `src/lib/server/nonceStore.ts`
- `src/lib/server/secrets.ts`
- `src/lib/server/safeSiteFetch.ts`
- `src/app/api/auth/login/route.ts`
- `src/lib/server/operationalAlerts.ts`
- `src/lib/server/productionReadiness.ts`
- `src/lib/chrome/sidebarLayout.ts`
- `next.config.ts`
- `scripts/smoke-production-readiness.test.ts`
- `docs/development/plans/security-hardening.md`
