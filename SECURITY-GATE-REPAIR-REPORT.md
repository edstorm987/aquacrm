# AquaCRM — Production-Gate Security Repair — FINAL REPORT

**This is the single source of truth.** Where it disagrees with the older
`SECURITY-CONTAINMENT-PROGRAMME.md`, this report wins.

- **Branch:** `security/production-gate-repair-20260908`
- **Base (verified live remote main):** `08670b626b839a439929b006f0f152712a864a9c`
- **Head:** `9ea22f3324fa25dec7abc22683766fdb7bf0fc68`
- **Worktree:** `/private/tmp/aquacrm-gate-repair` (isolated; the developer's
  checkout was never reset, stashed or overwritten).
- **Not merged, not deployed** by this pass. Pushed for independent review only.

## FINAL VERDICT: **NOT READY**

Multiple stop-ship gates remain RED — all owner/infrastructure-gated, none
fixable in code:
- the assume-breach containment migration is **not applied to the live
  database**;
- **no restore drill has been run** (RPO/RTO unmeasured);
- **no AV/CDR scanner, MFA/AAL2, distributed rate limiter, event drain, or edge
  WAF** is connected;
- the apex `aqua-crm.com` **TLS certificate hostname mismatch** is unresolved.

Every code-level issue in the brief is closed and tested; the rest is explicitly
OWNER ACTION below. This report does not claim production-ready or
real-client-ready.

---

## Live production observations (non-mutating probes only)

| Probe | Result |
|---|---|
| `https://www.aqua-crm.com/healthz` | 200, sha `08670b62`, platform railway |
| `https://www.aqua-crm.com/healthz/full` | **503** — honest: `email` + the new security-evidence gates are `needs-setup` |
| `https://aqua-crm.com` (apex) | **TLS certificate hostname mismatch** — OWNER ACTION (DNS/cert; not touched) |
| Canonical host | `www.aqua-crm.com` is the serving origin |

---

## Verification gates (this branch, local)

| Gate | Result |
|---|---|
| `npm run typecheck` | **0 errors** |
| `git diff --check` | clean (no whitespace/conflict markers) |
| Production build (webpack, isolated dist/data) | **GREEN — compiled in 72s** |
| Canonical suite discovery | **631 files** (616 scripts + 15 module smokes) + 49 website-editor, via the new deterministic enumerator |
| Full canonical suite (`smoke:all`) | **6965 pass / 0 fail / 3 skipped (exit 0)**, website-editor gate 49/49 included |
| DB containment suite (real Docker Supabase, real JWTs) | **41/41** |
| `rls-verify.sql` on the migrated local DB | **0 FAIL rows; containment-verified** |
| restore-drill safety (behavioural, mock psql) | **7/7** |
| operator console (dry-run/guards) | **3/3** |
| Migration applied to any REMOTE db | **NO** — local Docker only (no linkage; `DATABASE_URL` unset; no `db push`) |

> The two failures seen mid-pass were both fixed in-branch: the authored-doc
> consolidation digest (regenerated after a required `rls-enable.md` edit) and
> `.env.example` completeness (the new readiness signals are now documented). A
> build-generated `tsconfig.json` include leak (`.next-gate/types`) was reverted,
> not committed.

---

## Findings → disposition

| # | Finding (from the brief) | Disposition | Evidence |
|---|---|---|---|
| 0.1 | Deterministic directory failure: Operations missing `/portal/agency/security` | **VERIFIED → FIXED** | Security Centre card added; `smoke-tools-directory` 8/8 |
| 0.2 | CI canonical suite red: `smoke:all` uses a bash extglob that is a SYNTAX ERROR on the runner | **VERIFIED → FIXED** | Node enumerator `run-canonical-suite.mjs` (fails closed on zero discovery); Node 20→22; NEW required `containment` Docker job; two meta-tests repointed |
| 1 | Migration revokes `authenticated` on `brand_enquiries` but portal routes read/write it via the scoped RLS client → live enquiry management would break | **VERIFIED → FIXED** | Server-mediated `createEnquiryDataClient`; 11 routes converted; corrective migration `20260908220000`; containment 41/41; tenant-isolation 11/11 |
| 1b | (found here) `anon`/`authenticated` still held **TRUNCATE**/REFERENCES/TRIGGER on read-only content tables (base did `revoke insert,update,delete`, not `revoke all`) — anon could TRUNCATE `brands` | **VERIFIED → FIXED** | corrective migration revoke-all+regrant; all-seven-privilege self-verification + `rls-verify.sql` |
| 4 | CSRF gate guarded only `/api/portal` + `/api/auth`; ~35 cookie-authed `/api/tenants` mutations were open | **VERIFIED → FIXED** | `/api/tenants` guarded; exact-origin + Fetch-Metadata (sibling-subdomain) defense; `smoke-platform-hardening` |
| 6a | SMTP test-connection had NO host vetting; both SMTP paths had a DNS-rebinding TOCTOU | **VERIFIED → FIXED** | `pinnedSocketTarget` (vet + IP-pin + TLS servername) on send + test paths |
| 6b | Shopify: unvalidated tenant domain; token header not stripped on redirect; redirects followed | **VERIFIED → FIXED** | `*.myshopify.com` host validation; token added to broker credential set; `followRedirects:false` |
| 6c | AI: `managed.apiKey || process.env.OPENAI_API_KEY` ran every keyless tenant on the founder's key | **VERIFIED → FIXED** | ungated fallback removed; founder-gated resolver only; `smoke-ai-tenant-key-isolation` |
| 8a | `/healthz/full` swallowed a PortalState hydration failure (connectivity-only health) | **VERIFIED → FIXED** | hydration failure forces 503 in every env |
| 8b | `readyForProduction` did not require security evidence | **VERIFIED → FIXED** | 9 required, red-by-default gates (migration/AV/drain/rate-limit/MFA/restore/backup/supply-chain/WAF) |
| 5/7 | `restore-drill.sh` identified safety by hostname only, fail-OPEN on unknown hosts, downgraded verification failures to WARN, generic bypass flag | **VERIFIED → FIXED** | default-deny + on-target disposable marker; FAIL-not-warn; bypass removed; `smoke-restore-drill-safety` 7/7 |
| 5.11 | Runbooks named TypeScript functions an operator cannot run | **FIXED** | NEW `security-console.ts` (dry-run default, actor+reason required); runbooks reference it |
| 2a | Sandbox enforcement used the persona identity, not the live anchor | **VERIFIED → FIXED (suspension+lockdown)** | gate binds `sandbox.returnUserId`/`returnAgencyId`; `smoke-security-lockdown` +2 |
| 2b | The write-freeze bound only `mutate()` (PortalState); storage ingestion ran during a freeze | **VERIFIED → FIXED (storage)** | NEW `assertWritesAllowed` boundary wired at `storePrivateUpload`/`storePublicUpload`; `smoke-write-boundary` 4/4 |
| 2c | Per-user/per-tenant epoch bumps did not bind a sandbox session | **FIXED** | issueSession stamps the live anchor; gate checks the anchor; `smoke-security-lockdown` epoch-sandbox test |
| 3 | Threat-centre high-impact platform switches ran on password-only reauth (no step-up) | **FIXED (AAL2 gate) / PARTIAL (true AAL2 = OWNER)** | global actions require `session.aal==='aal2'` else visibly refuse → operator console; `smoke-threat-centre` 8/8 |
| 5c | A restored older snapshot would silently clear the in-state incident write-freeze at cutover | **FIXED** | out-of-band `PORTAL_WRITES_FROZEN` checked by mutate() + assertWritesAllowed; survives restore; `smoke-write-boundary` |
| 6d | `safeSiteFetch`/Radar probes had a DNS-rebinding TOCTOU (validate host, then fetch re-resolves) | **VERIFIED → FIXED** | connect-time IP pinning via undici Agent; `smoke-safe-site-fetch-toctou` 3/3 |

---

## OWNER ACTIONS (nothing below was done — external systems, out of scope)

1. **Apply the containment chain to the live DB after a fresh backup**:
   `supabase db push` → paste `supabase/rls-verify.sql`, confirm
   `containment-verified` with 0 FAIL → re-check milesymedia login. Then set
   `PORTAL_CONTAINMENT_MIGRATION_VERIFIED=true`. **Migration order:**
   `20260908210000` (base, already in main) then `20260908220000` (corrective).
   Forward-only + idempotent; safe whether or not the base already ran. Rollback:
   a further forward-only migration re-granting the exact narrow privilege — never
   edit a historical migration.
2. **Resolve the apex TLS mismatch** (`aqua-crm.com` cert) and confirm the
   canonical redirect to `www`. DNS/cert — not touched here.
3. **Run an owner-approved restore drill** (`ops/backup/restore-drill.sh` against
   a marked disposable DB), then set `PORTAL_LAST_VERIFIED_RESTORE_AT`; enable
   `BACKUP_ENABLED` + `PORTAL_LAST_BACKUP_AT`. RPO/RTO are UNMEASURED until then.
4. **Connect** an AV/CDR scanner (`PORTAL_AV_SCANNER_URL`), MFA/AAL2
   (`PORTAL_MFA_ENABLED`), a distributed rate-limit store
   (`PORTAL_RATE_LIMIT_STORE_URL`), an off-platform event drain
   (`PORTAL_SECURITY_EVENT_DRAIN_URL`), and an edge WAF (`PORTAL_EDGE_WAF_ENABLED`).
5. **Set `PORTAL_DEPENDENCY_AUDIT_PASSED=true`** on a release whose CI dependency
   audit is green.
6. **Branch protection** on `main`: require the `verify`, `containment`, and
   `browser` CI jobs.

---

## STILL OWED IN CODE (honest, tracked — not done this pass)

- **Phase 2 (breadth):** `assertWritesAllowed` now exists and binds the freeze at
  the STORAGE write choke points (private + public upload) on top of `mutate()`.
  Still to wire it to the remaining surfaces — site-editor filesystem/repo
  writes, cron/background jobs, external provider side-effects, queues — plus a
  full static inventory over every mutating route/adaptor. Per-user/per-tenant
  epoch does not yet bind a *sandbox* session (needs live-anchor epoch stamping
  at issue); security state should live outside sandbox realms' PortalState.
- **Phase 3:** Threat Centre reauth is password-based; true **AAL2/MFA** needs an
  authoritative Supabase MFA ceremony (OWNER). High-impact platform actions
  should stay unavailable until AAL2 exists rather than be described as MFA.
- **Phase 5/7:** per-file manifest-hash + independent-digest enforcement, storage
  bucket enumeration and object-**byte** restore verification, and a guard that a
  restored older snapshot cannot silently clear a live incident write-freeze at
  cutover.
- **Phase 6:** `safeSiteFetch` / Radar synthetic-probe DNS-TOCTOU re-audit; AI
  quota is per-process in-memory (needs the shared store to be authoritative
  multi-instance — the readiness gate now reflects this).

---

## Commits (11)

```
c5da6c46 phase-0  release harness: directory card + deterministic CI discovery
4e77faf9 phase-0  repoint the two harness meta-tests to the enumerator invariant
f73f37b7 phase-1  brand_enquiries server-mediated + TRUNCATE residue removed
414c45fe phase-4  CSRF covers /api/tenants + Fetch Metadata + sibling defense
6844c3d8 phase-6  SMTP IP-pinning, Shopify hardening, per-tenant AI key isolation
d75a517d phase-8  hydration 503; readiness requires security evidence
a5a9c848 phase-5/7 restore-drill fails safe + operator console
8592f2fc phase-2  session gate binds the LIVE identity through sandbox
9ea22f33 phase-8/9 .env.example readiness signals; docs reconciled
(+ phase-9 canonical report, phase-2 write boundary — see git log)
```

## Is GitHub CI green?
Not yet observed on this branch (push pending / owner to run). The CI itself was
repaired here (Node 22, deterministic discovery, new required containment job).
Locally: typecheck 0, build GREEN, containment 41/41, canonical suite
6965 pass / 0 fail.
