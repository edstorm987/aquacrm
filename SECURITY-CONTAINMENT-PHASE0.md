# AquaCRM — Assume-Breach Containment Programme

**Branch:** `security/containment-and-recovery`
**Base (remote main):** `c89e7959f9a46f952adcbfd14c2be7226fb374b7`
**Worktree:** `/private/tmp/aquacrm-security` (the developer's checkout was never touched)
**Status of this session:** Phase 0 (close immediate exposure) is complete and
committed. Phases 1–6 are scoped below and NOT yet built. This document is the
honest ledger — every item carries VERIFIED / PARTIAL / BLOCKED / NOT TESTED /
OWNER ACTION.

> This is a security *architecture* programme, not a dashboard. Everything in
> Phase 0 is an enforceable, tested control. Nothing here says "production
> ready": that verdict is reserved until live tenant-isolation, provider edge,
> monitoring, backup/restore and incident-response gates are independently
> exercised (they have not been).

---

## Verified findings (first-hand + an 8-agent evidence pass, all file:line)

| # | Finding | Verdict | Fixed in |
|---|---------|---------|----------|
| P0 | Any authenticated owner/staff of ANY ecosystem app could read AND rewrite every tenant's PortalState via PostgREST (`app_datastores` `FOR ALL` policy + explicit `authenticated` DML grants). Portal itself is service-role-only. | **VERIFIED → FIXED** | Phase 0-A migration |
| P0 | Cross-application storage: one `is_internal_user()` granted `FOR ALL` across all 8 buckets of all 4 apps; every authenticated user could write an own-folder in all four upload buckets. | **VERIFIED → FIXED** | Phase 0-A migration |
| P0 | `profiles` `FOR ALL` policy let any staff account UPDATE any profile — incl. self-promotion `staff → owner`. | **VERIFIED → FIXED** | Phase 0-A migration |
| P0 | `brand_enquiries` tenant "ratchet" policy fails OPEN when either `agency_id` is null (the live steady state) — cross-tenant enquiry read/write. | **VERIFIED → FIXED** | Phase 0-A migration |
| P0 | `audit_events` readable + insertable by any internal user (cross-agency log disclosure + record planting). | **VERIFIED → FIXED** | Phase 0-A migration |
| P0 | Auth fails OPEN: production signed sessions with the public literal `dev-secret-do-not-use-in-prod` when the secret was unset; the startup env check had ZERO callers; the `/portal` gate switched off whenever `NEXT_PUBLIC_PORTAL_SECURITY` ≠ strict — in production too. **The same literal signed 10 other token families** (CSRF, magic links, password reset, email verification, OAuth state ×4, connection confirmations, inbox media). | **VERIFIED → FIXED** | Phase 0-B |
| P0 | Sessions were 30-day, stateless, with no device/session registry and only whole-user rotation; no suspension or lockdown enforced per-request. | **VERIFIED → FIXED (seed)** | Phase 0-B |
| P0 | Stored same-origin code execution: customHead/Foot/HtmlBlock/TextBlock rendered raw into an authenticated same-origin page; editor iframe combined `allow-scripts`+`allow-same-origin`; CSP allowed `unsafe-inline` + broad `https:` script src; validation was regex-based. | **VERIFIED → FIXED (safe mode) / PARTIAL (sanitiser+isolation)** | Phase 0-C |
| P1 | SSRF + credential forwarding: automation webhooks, integration test-connections (incl. user-supplied Supabase `projectUrl`), external form reads, GSC `token_uri` could target private/loopback/metadata addresses and forward stored credentials. `safeSiteFetch` had a DNS-rebinding TOCTOU. | **VERIFIED → FIXED (broker) / PARTIAL (shopify, SMTP, email-sender not yet routed)** | Phase 0-D |
| P1 | Postgres TLS used `rejectUnauthorized:false` for every non-local connection (unverified TLS on the state channel). | **VERIFIED → FIXED** | Phase 0-E |
| — | Claim: anon role reaches `app_datastores`; patch/history/receipt tables reachable; datastore RPCs reachable by browser roles. | **INCORRECT** (already service-role-only / RLS-sealed — proven) | n/a |
| P1 | CSRF not centralised; rate-limit process-local + trusts XFF; `/healthz/full` over-discloses; vault uses one global key. | **VERIFIED — NOT YET FIXED** | Phase 4 (planned) |

---

## Phase 0 — what shipped (all committed, all tested LOCALLY)

### 0-A — Database & storage isolation  (`d9e9918c`)
Forward-only, idempotent migration
`supabase/migrations/20260908210000_assume_breach_containment.sql`:
revokes every browser-role path into `app_datastores` / `audit_events` /
`website_consent_events` / history; `profiles` → own-row read only, no writes;
public content read-only; `brand_enquiries` → consented anon INSERT only;
storage cross-app policies dropped; `ALTER DEFAULT PRIVILEGES` makes future
objects default-deny; SECURITY DEFINER helper EXECUTE revoked from browser
roles; a self-verification `DO` block RAISEs if any broad path survives.
**Not run on any remote DB.**

- **Proof (local Docker only):** `supabase db reset` applies the whole chain +
  the self-verification block; `supabase/tests/containment-isolation.test.mjs`
  **37/37** (two tenants, four authed identities + anon, real password-grant
  JWTs vs PostgREST + Storage API); `supabase/rls-verify.sql` containment
  invariants clean; `smoke-rls-policy-coverage` updated to the negative contract.

### 0-B — Authentication fail-closed + control plane  (`4383db57`, `684edaff`)
Session signing/verification refuses the dev fallback in production; the startup
env check runs at boot (uncaught, first) via `instrumentation.ts`; production
`/portal` gate is always strict; session TTL 30d→7d (tunable). All 11 token
families resolve through one fail-closed `resolveSigningSecret()`. NEW
`securityControl.ts` seeds the control plane: global/tenant/user **security
epochs** stamped into every session, central **suspension**, durable **session
registry** (per-`sid` revocation + revoke-all), enforced in
`resolveFreshSessionUser` on EVERY request.
- **Proof:** `smoke-auth-fail-closed` **20/20**; sibling token suites **42/42**;
  session-revocation/showcase/env **56/56**.

### 0-C — Stored-code boundary  (`87e17da1`)
Production **safe mode** holds raw operator markup out of the authenticated
same-origin render (explicit non-default break-glass); HtmlBlock/TextBlock/
preview gated; editor iframe drops `allow-same-origin`; CSP drops broad `https:`
script src and narrows `frame-ancestors` to `'self'`.
- **Proof:** `smoke-stored-code-boundary` **6/6**; Website Editor gate **49/49**.
- **PARTIAL:** parser-based allowlist sanitiser, separate cookie-less preview
  origin, CSP nonce migration to remove `unsafe-inline`.

### 0-D — Outbound request broker  (`177101d2`)
NEW `lib/server/net/outboundBroker.ts`: scheme/port allowlists, shared
private-address classifier, up-front resolution + **connect-time IP pinning**
(closes the rebinding TOCTOU via an undici Agent), per-hop redirect
revalidation, credential stripping across origin change, strict limits,
per-tenant policy, a secret-free SecurityEvent per block. NEW
`securityEvents.ts` seeds the telemetry spine. Automations webhook, clientForm
reader and integration test-connections (incl. user-supplied Supabase
`projectUrl`) routed through it.
- **Proof:** `smoke-outbound-broker-ssrf` **22/22** (metadata, all RFC1918/
  CGNAT/link-local, IPv4+IPv6+v4-mapped literals, localhost-by-name, schemes/
  ports, URL creds, tenant policy, oversized body, a real loopback-connect
  refusal, credential-never-in-event); affected suites **69/69**.
- **PARTIAL:** shopify.ts, transactionalEmail.ts, email-sender SMTP transport
  not yet routed (lower-risk / hardcoded hosts).

### 0-E — TLS  (`fd6821d9`)
NEW `lib/server/pgTls.ts`: verified TLS for both connectors; `PORTAL_PG_CA_CERT`
provider-CA input; `PORTAL_PG_ALLOW_INSECURE_TLS=1` is a NON-PRODUCTION-only
escape hatch production provably IGNORES.
- **Proof:** `smoke-pg-tls-fail-closed` **7/7** incl. the production-ignores
  proof + a sweep pinning the insecure idiom never returns.

---

## OWNER ACTION — before/at deploy (nothing here was done by the author)

1. **Apply the containment migration to LIVE** after a fresh backup:
   `supabase db push` then paste `supabase/rls-verify.sql` in the SQL editor and
   confirm the containment-invariants result set is all-INFO. Do NOT deploy the
   new app build until the migration is applied — the app is already
   service-role-only, so the migration only removes attacker surface, but verify.
2. **Set `PORTAL_SESSION_SECRET`** to a ≥32-char random value in production (the
   boot now REFUSES to start without it — this is intentional). Rotate away from
   any dev value.
3. **`NEXT_PUBLIC_PORTAL_SECURITY=strict`** (boot enforces it in production).
4. **Postgres TLS:** if the provider cert doesn't chain to a public root, set
   `PORTAL_PG_CA_CERT` to its CA PEM. Do NOT set `PORTAL_PG_ALLOW_INSECURE_TLS`.
5. Leave `STORED_CODE_UNSAFE_RENDER` unset (custom site code stays held).
6. Sibling apps (aquaoasis-web, milesymedia, zimante) were checked and keep
   working; re-verify after the migration that milesymedia login (own-row
   profile read) still resolves.

---

## Rollback / containment

- The whole programme is one branch off `c89e7959`; `git checkout main` restores
  the pre-programme app. Nothing was merged to main.
- The migration is additive and self-verifying; if a sibling app breaks, a
  follow-up forward-only migration can re-grant the exact narrow privilege it
  needs (never a blanket re-open) — do not edit `20260908210000`.
- The auth fail-closed change means a mis-set production secret STOPS boot by
  design; the fix is to set the secret, not to revert the guard.

---

## NOT DONE THIS SESSION (Phases 1–6, honestly outstanding)

- **Phase 1** — dedicated tenant-scoped security storage outside PortalState
  (SecurityEvent/Finding/Incident/Directive/ArtifactTrust/DetectorHealth) with
  WORM drain; signed containment directives; the full response-action set with
  AAL2 + dual-confirm. (0-B/0-D shipped the enforcement SEEDS in PortalState.)
- **Phase 2** — the content-trust gateway (quarantine→scan→clean, lineage,
  recall). Uploads are still filename/MIME-validated and stored before any
  verdict (VERIFIED, unfixed).
- **Phase 3** — AI tool-broker isolation, quotas/kill-switch, prompt-injection
  lineage; microVM sandbox for repo previews (currently host processes).
- **Phase 4** — edge WAF, CSRF centralisation, distributed rate limiter, vault
  per-tenant DEKs, healthz disclosure, supply-chain CI, ecosystem key split.
- **Phase 5** — recovery/IR runbooks + hardened restore + RPO/RTO.
- **Phase 6** — Governance Threat Centre UI (BLIND/STALE/PARTIAL states).

None of the above is claimed done. See each phase in the mission brief.
