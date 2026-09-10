# AquaCRM — Assume-Breach Containment Programme

**Branch:** `security/containment-and-recovery`
**Base (remote main):** `c89e7959f9a46f952adcbfd14c2be7226fb374b7`
**Worktree:** `/private/tmp/aquacrm-security` (the developer's checkout was never touched)
**Historical code status:** Phase 0 (immediate exposure) IMPLEMENTED. Phase 1 (control plane +
lockdown switches), Phase 2 (content trust gateway), Phase 3 (AI containment)
the first Phase-4 tranche, and the Phase-6 threat centre were implemented — each
with its honest PARTIAL list inline. Phase 5 runbooks are written against the
REAL shipped controls (`docs/security/incident-runbooks.md`). All six phases
landed as source code and local tests on the dated branch; this does **not** mean
their database/provider portions are enforced live. Owner-gated work remains
(live migration, restore drill, AV/MFA/WAF providers).

> **STATUS UPDATE (2026-09-09).** This branch was **MERGED to `main` as
> `08670b62` and is deployed live on Railway** (superseding the earlier "never
> merged" note above). A follow-up production-gate repair pass then hardened it
> further on branch `security/production-gate-repair-20260908` — see the
> canonical, current ledger in **`SECURITY-GATE-REPAIR-REPORT.md`**, which is
> the single source of truth for findings, dispositions, the live SHA, the
> (red) readiness verdict, and OWNER ACTIONS. Where this older document and the
> gate-repair report disagree, the gate-repair report wins.

> **PUBLIC-UPLOAD SCOPE CORRECTION (2026-09-10).** The Phase-2 record below is
> historical evidence for `storePrivateUpload`; it did not cover the distinct
> `storePublicUpload` path to the public CDN bucket. A prospective correction is
> on the local, unmerged and undeployed branch
> `security/public-upload-byte-inspection-20260910`, based on
> `72acac904ba6af88cb1a3d84483b4a4359d03747`. It adds byte/type inspection,
> strict size and tenant-path bounds, recursive media discovery and fail-closed
> publication errors. Its final adversarial pass also proved the current
> upload-before-page-commit flow cannot safely create production public objects:
> shared content-addressed keys and the absence of a durable ownership/refcount
> ledger make both orphan cleanup and compensating deletion unsafe. The branch
> therefore refuses every configured **app-server write through
> `storePublicUpload`** before scanner or provider I/O; the dormant provider
> implementation has been removed. This does not block direct authenticated,
> dashboard or other service-role access to Supabase Storage: the containment
> migration must be applied and verified separately. Local development remains
> available and existing public URLs can
> still be published/rendered. Production enablement requires a durable
> operation-owned publication saga, atomic page-generation commit and an
> ownership-proven recovery/recall worker. The scanner's audited egress path is
> also capped at 1 MiB, below the 8 MiB media contract, pending an explicit
> data-egress decision. Existing public objects and already-published inline
> payloads require a post-merge inventory, scan and safe republish/removal job.
> The canonical verdict remains **NOT READY** in
> `SECURITY-GATE-REPAIR-REPORT.md`.

> **BUCKET-ZONE FOLLOW-ON (2026-09-10).** The same local correction pins the
> private/public Supabase bucket names to `aquacrm-uploads` and
> `aquacrm-public`. Startup, readiness and every service-role private Storage
> operation fail closed if those zones are renamed, swapped or shared. Its
> forward-only migration
> `20260910010000_harden_aquacrm_public_media_bucket.sql` is local, unmerged and
> unapplied; it also rejects every effective browser-role `storage.objects`
> write policy by command and role rather than trusting policy names. It
> requires a fresh backup, explicit owner approval and independent live
> verification after the containment chain.

This document is the historical Phase-0…6 ledger — every item carries VERIFIED /
PARTIAL / BLOCKED / NOT TESTED / OWNER ACTION.

> This is a security *architecture* programme, not a dashboard. Everything in
> Phase 0 is an enforceable, tested control. Nothing here says "production
> ready": that verdict is reserved until live tenant-isolation, provider edge,
> monitoring, backup/restore and incident-response gates are independently
> exercised (they have not been).

---

## Verified findings (first-hand + an 8-agent evidence pass, all file:line)

`FIXED` in this historical table means fixed in the named source lane. It does
not override the current red verdict, prove deployment, or attest that an
owner-gated migration/provider control is live.

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

1. **Reconcile, then apply the four expected pending migrations to LIVE** only
   after a fresh backup and explicit owner approval. First run the read-only
   `supabase migration list --linked` and
   `supabase db push --linked --dry-run`. The delta must be exactly, in order,
   `20260903130000`, `20260908210000`, `20260908220000`, and
   `20260910010000`; abort on any missing, extra, reordered or remote-only
   version. Only after that preflight, backup and approval may the real
   `supabase db push --linked` run. Then paste `supabase/rls-verify.sql` in the SQL editor and
   confirm the containment-invariants result set is all-INFO. Do NOT deploy the
   new app build until all four are recorded, the live bucket flags/limits are
   independently checked, and `rls-verify.sql` proves there is no anon,
   authenticated or PUBLIC storage write policy. The app is already service-role-only, so the
   containment chain removes attacker surface, but verify rather than infer.
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
7. Optionally set **`PORTAL_HEALTH_TOKEN`** (≥32 random chars) and put it in
   the uptime monitor's Authorization header if you want the DETAILED
   /healthz/full body in production; without it the monitor still gets the
   correct 200/503.
8. If more than one trusted proxy fronts the app (CDN in front of Railway),
   set **`PORTAL_TRUSTED_PROXY_HOPS`** to the hop count (default 1 = Railway).
9. Backup lane (R7): run `ops/backup/keygen.sh`, store the key off-platform,
   set the GitHub secrets, enable `BACKUP_ENABLED`, and run
   `ops/backup/restore-drill.sh` once against staging — RPO/RTO are unmeasured
   until this drill has been done.
10. Connect an AV/CDR engine to `setContentScanner` when one is available;
   until then upload verdicts are content-signature-based only.

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

## Phases 1–5 — what shipped after Phase 0 (all committed + pushed, tested locally)

### Phase 1 — lockdown switches  (`ea980563`)
- **Global read-only kill switch** enforced at `mutate()` — the single write
  path for all 100 PortalState collections — BEFORE the mutation callback runs
  (nothing partially applies); reads keep serving; the control plane's own
  writes stay allowed (liftable mid-incident, suspension/revocation keep
  working). Typed `SecurityLockdownError`.
- **Tenant lockdown** enforced at the central session gate; REVERSIBLE
  (lifting restores existing sessions — no re-login storm), other tenants
  untouched.
- Every flip is a SecurityEvent. `smoke-security-lockdown` **6/6**.
- **PARTIAL:** security storage still lives in PortalState (`securityControl`
  singleton) rather than a dedicated store with a WORM drain; the drain HOOK
  exists (`setSecurityEventDrain`). Signed directives + AAL2 dual-confirm are
  Phase-6-fronted work.

### Phase 2 — content trust gateway  (`c68ffdbd`)
- Every stored upload judged by its BYTES at `storePrivateUpload` — the one
  function all 11 upload routes (public careers intake included) store
  through — before any provider I/O. sha256 identity; executables refused
  everywhere; media-declared HTML (polyglots) refused; signature/declaration
  mismatch refused; SVG refused BY CONTENT; NUL-in-text refused. Refusals are
  digest+types security events — never contents, never filenames.
- Explicit `setContentScanner` seam for a real AV/CDR engine (OWNER ACTION);
  verdicts stay clean/unverified/blocked — never "scanned" — until one is
  connected. `smoke-content-trust` **10/10**; upload-adjacent suites 70/70.
- **PARTIAL:** no malware scanning until an engine is connected; no
  quarantine-then-release lifecycle; trust records live in the event spine +
  returned `contentTrust` field, not yet a durable per-artifact ledger.

### Phase 3 — AI containment  (`e5c03637`)
- **AI kill switch** (`disableAi`/`enableAi`) + **per-tenant sliding-hour
  quota** (`PORTAL_AI_CALLS_PER_HOUR`, default 500) enforced at
  `requestOpenAiResponse` — the ONE adapter every assistant/editor generation
  passes through — before provider I/O. Prompt contents never reach the event
  spine (canary-pinned). The OpenAI endpoint is a hardcoded constant (no SSRF
  surface on this path).
- **Human-in-the-loop pinned as a contract:** external assistant proposals are
  pending records; only an explicit accept by a real `actorUserId` creates a
  task; the submit path must never reach `createAgencyTask`.
  `smoke-ai-containment` **5/5**.
- **PARTIAL/BLOCKED:** microVM/sandbox isolation for dev-project preview
  execution needs infrastructure (OWNER ACTION); prompt-injection lineage
  tagging on AI-derived records not built; quota is in-memory (single-instance
  honest — multi-instance needs the shared counter).

### Phase 4 — platform tranche  (`5e6a087a`)
- **/healthz/full recon gate:** anonymous production callers get `{ ok, ts }`
  only; sha/platform/plugins/readiness-item detail requires an internal
  session or the `PORTAL_HEALTH_TOKEN` bearer (timing-safe). Status code
  unchanged — no monitor breaks. `smoke-platform-hardening` **5/5**.
- **X-Forwarded-For unspoofed:** the rate limiter/attribution now uses the
  proxy-APPENDED entry (last, or `PORTAL_TRUSTED_PROXY_HOPS` from the end),
  not the client-chosen first entry.
- **Deliberately NOT shipped, tracked:** CSRF origin gate (cookies are
  SameSite=lax — the standing mitigation; a blanket Origin check would break
  legitimate cross-origin intakes like brand-enquiry embeds; needs per-route
  classification), vault per-tenant DEKs, distributed rate limiter,
  supply-chain CI, edge WAF (provider console = OWNER ACTION).

### Phase 5 — incident response  (`docs/security/incident-runbooks.md`)
Eight runbooks (compromised account, tenant breach, mass-write freeze, global
session compromise, malicious upload, AI incident, restore, ecosystem
incident) — every action in them is a REAL function shipped on this branch,
named verbatim, with the tests that verify it. Restore capability is honestly
marked UNPROVEN: the encrypted backup lane exists but keygen/secrets/drill are
OWNER ACTIONS, and **RPO/RTO are UNMEASURED** until the drill runs.

### Phase 6 — Governance threat centre  (SHIPPED)
`/portal/agency/security` (owner-only page) + `/api/portal/security/overview`
+ `/api/portal/security/actions`. The overview reports every control's real
state and — critically — declares what the platform CANNOT see: BLIND items
(no malware scanner, no off-platform event drain) render as loudly as
incidents, and owner-action items (backup drill, DB migration) never show as
"enforced". Every containment action is behind FOUR server-side gates: owner
role, FRESH password re-verification (a stolen cookie cannot flip a switch),
DUAL confirmation (typed CONTAIN + a written reason that lands in the durable
record), and tenant scope (an owner acts only on their own tenant's people;
platform-wide switches are the operator's only). Tenant lockdown exempts the
tenant's own owners so the locksmith is never locked out (a compromised owner
is contained with suspension/user-epoch instead).
- **Proof:** `smoke-threat-centre` **8/8** (guards, re-auth, dual-confirm,
  tenant-scope-no-id-oracle, operator-only, the working click-path with
  durable-record + actor, honest BLIND overview, cross-tenant read isolation);
  `smoke-security-lockdown` **8/8** incl. the owner exemption;
  `smoke-portal-destinations` (the page is findable in nav). **LIVE acceptance
  on the production build** (isolated build + seeded file state + real
  local-Supabase login cookie): fail-closed boot proven (server refused to
  start until all prod env was set), `/healthz/full` returns status-only to
  anonymous callers, and the FULL action click-path ran end-to-end over HTTP —
  wrong-password refused (403), missing-confirm refused (400), operator-only
  global switch refused to a normal owner (403), a fully-confirmed own-tenant
  suspend succeeded (200), showed in the overview + durable record stamped with
  the acting owner, and unsuspend restored clean state. Same-origin POST passed
  the new CSRF gate; the auth redirect (307 anon / 200 owner) held.
- **PARTIAL:** AAL2 here is password re-verification, not a second factor (no
  MFA provider is wired — MFA-Phone was disabled for cost); a true second
  factor is an owner action. The panel's client hydration did not complete
  under the isolated symlinked prod-build lane (cosmetic — the component
  typechecks and the API loop it drives is proven live + 8/8 in tests).


---

## Mandatory acceptance gates (final run, this branch)

| Gate | Result |
|---|---|
| Typecheck (`npm run typecheck`) | **0 errors** |
| Full canonical suite (`smoke:all`) | **6,934 / 6,939 pass, 3 skipped** after all six phases; the only red across runs is `smoke-product-workspace-lease-fencing`, a KNOWN timing-sensitive pin that flips under parallel-suite CPU contention (documented pre-programme) and passes **3/3 in isolation** on this branch |
| Production build (webpack, the real bundler) | **GREEN** with all six phases in (rebuilt clean at each phase; ~73–76s) |
| LIVE threat-centre click-path (isolated prod build + seeded state + real Supabase login) | **PASS** — fail-closed boot, anon `/healthz/full` status-only, and the full action loop through all four gates end-to-end over HTTP (see Phase 6) |
| Local DB containment suite (37 tests, real JWTs vs PostgREST+Storage) | **37/37** (unchanged since 0-A — later phases did not touch the migration) |
| `rls-verify.sql` containment invariants on migrated local DB | **all-INFO** |
| Migration never run remotely | **verified** — no project linkage in the worktree, `DATABASE_URL` unset, `db push` never invoked |
| Developer checkout untouched | **verified** — all work in `/private/tmp/aquacrm-security` |

## FINAL VERDICT

**SAFE TO INDEPENDENTLY REVIEW.** Not merged; never will be by this
programme's author — merge is the owner's call after independent review.

**NOT production-ready, and this report does not claim it.** The live gates
that would justify that phrase have NOT been exercised: the containment
migration has not been applied to the production database, no restore drill
has been run (RPO/RTO unmeasured), no AV engine is connected, the WAF/edge
work is provider-console territory, and the Phase-6 threat centre that fronts
the response actions with AAL2 + dual confirmation does not exist yet.
Every one of those is listed with its owner above.
