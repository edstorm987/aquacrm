# AquaCRM — Production-Gate Security Repair — FINAL REPORT

**This is the single source of truth.** Where it disagrees with the older
`SECURITY-CONTAINMENT-PROGRAMME.md` or any other doc, this report wins.

- **Report date:** 2026-09-09
- **Branch:** `security/production-gate-repair-20260908`
- **Base (verified live remote main):** `08670b626b839a439929b006f0f152712a864a9c`
- **Head (this report):** `36240b7dd10748898dda50b47c63efc72e61d92d`
- **Worktree:** `/private/tmp/aquacrm-gate-repair` (isolated; the developer's
  primary checkout was never reset, stashed or overwritten).
- **Commits on the branch since base:** 35.
- **Not merged, not deployed** by this pass. Pushed for independent review only.

> **Adversarial verification (2026-09-09).** After the 12 items were closed, an
> independent multi-agent adversarial pass re-checked each "FIXED" claim against
> the actual code AND its test — specifically whether each test proves the
> boundary *behaviourally* or merely matches source. Result: **7 of 9 crown-jewel
> claims cleanly confirmed**; 2 flagged. Neither flag was a live vulnerability
> (production enforcement was intact in both), but both revealed source-regex
> tests standing in for behavioural proof — and, in item 9, the behavioural test
> then written exposed a **real correctness defect the source-regex could not
> see** (the DNS-rebind pin was mis-wired for undici 6 and failed every pinned
> fetch). All findings are fixed; see the item table and "Adversarial
> verification findings" below.

## FINAL VERDICT: **NOT READY / NOT MERGE-READY**

Every code-level defect in the 12-item brief is closed and covered by
behavioural tests. The branch is **not merge-ready** because stop-ship gates
remain that are **owner/infrastructure-gated and cannot be closed in code**:

- the assume-breach containment chain (base `20260908210000` + corrective
  `20260908220000`) is **not applied to the live database** (P0);
- **no restore drill has been run against real infrastructure** — RPO/RTO
  unmeasured (P0);
- **no AV/CDR scanner, authoritative MFA/AAL2, distributed rate limiter,
  off-platform event drain, or edge WAF** is connected (P0/P1);
- the least-privilege blast-radius **infra split is not done** — the client
  portal still holds a full-project service-role key (P1, ADR-001);
- the apex `aqua-crm.com` **TLS certificate hostname mismatch** is unresolved
  (P1, DNS/cert — not touched).

No system here is described as "impenetrable" or "production ready." The gate
stays RED until the owner actions below are attested.

---

## No live state was changed by this pass

Explicitly, this work did **not**:

- merge into `main` or deploy anything;
- apply any migration to the live or any shared Supabase database (no
  `db push`, no linkage; the corrective migration is a file only);
- reset or mutate the shared local Supabase stack;
- change DNS, Railway, Vercel, WAF, provider accounts, secrets, or any
  production environment variable;
- handle or print any secret;
- run the recovery drill against live or shared infrastructure.

All builds and tests ran in the isolated worktree against local/in-memory
backends.

---

## Verification gates run for THIS report (HEAD 36240b7d, isolated worktree)

| Command | Result | Evidence class |
|---|---|---|
| `npx tsc --noEmit` (portal) | **0 errors (exit 0)** | locally-verified |
| Focused security suites (13 files, see below) | **116 tests / 0 fail** | locally-verified |
| `PORTAL_BACKEND=memory` canonical suite | **7001 tests / 6998 pass / 0 fail / 3 skipped (exit 0)** | locally-verified |
| Website-editor gate | **49/49 files passed** | locally-verified |
| `npm run build` (portal, webpack, 6 GB cap) | **compiled, exit 0** | locally-verified |
| `npm run build` (client-portal, webpack) | **compiled, exit 0** | locally-verified |
| `git diff --check` (working tree + base..HEAD) | **clean** — no whitespace/conflict markers | locally-verified |

(The canonical total rose from 6996 to 7001 as behavioural pin/freeze tests were
added during the adversarial pass.)

The 13 focused security files:
`smoke-radar-probe-ssrf`, `smoke-security-control-fail-closed`,
`smoke-write-surface-inventory`, `smoke-session-registry-completeness`,
`smoke-restore-drill-safety`, `smoke-content-trust`,
`smoke-production-readiness`, `smoke-threat-centre`,
`smoke-stored-code-boundary`, `smoke-platform-hardening`,
`smoke-security-console`, `smoke-service-role-usage`,
`smoke-read-path-mutations`.

**Verified earlier this programme, NOT re-run this session** (to respect the
"do not mutate the shared local Supabase stack" boundary): the Docker-backed DB
containment suite (`supabase/tests/containment-isolation.test.mjs`, 41/41 on a
local disposable stack with real JWTs) and `supabase/rls-verify.sql`
(0 FAIL rows). These require a live Postgres and must be re-attested by the
owner against a disposable DB before merge — see OWNER ACTIONS.

---

## The 12 brief items → disposition

| # | Item | Disposition | Evidence (behavioural) |
|---|---|---|---|
| 1 | Authoritative cross-realm containment + fail-closed reads | **FIXED** | `readSecurityControlStrict` throws on read failure; `enforceSessionSecurity`/`assertWritesAllowed` fail CLOSED; `smoke-security-control-fail-closed` proves a protected write is refused when the control plane is unreadable |
| 2 | User-specific platform-operator authority + tenant-scoped actions | **FIXED** | `isPlatformOperator({email})` (founder ∪ `PORTAL_PLATFORM_OPERATOR_EMAILS`) gates operator-only actions; `revokeUserSessionsInTenant` scopes revocation to one agency (no global epoch bump); `smoke-platform-hardening`, `smoke-threat-centre` |
| 3 | Supabase-authoritative reauth + COMPLETE session registry | **FIXED (registry) / PARTIAL (true AAL2 = OWNER)** | every non-ephemeral mint registers via `issueSession`→`recordIssuedSession` with expiry + pruning; `smoke-session-registry-completeness` proves login/magic/oauth all register and expired records drop out; AAL2 step-up gate present, real MFA ceremony is OWNER |
| 4 | One write-side-effect boundary + inventory | **FIXED (storage) / TRACKED (breadth)** | `assertWritesAllowed` at private+public upload store **and delete** (incl. the exported `deleteSupabasePrivateUpload`, guarded during the adversarial pass so a freeze throws rather than returning a silent `false`); `smoke-write-surface-inventory` fails the build if any server module performs an object-store write/delete (Supabase storage upload/remove, Vercel Blob put/del) without the boundary, or a surface string is unclassified/stale; **all four** storage surfaces have behavioural freeze-refusal proof (`smoke-write-boundary`); remaining non-storage surfaces enumerated (P2) |
| 5 | Ecosystem-safe enquiry migration incl. client-portal | **FIXED** | corrective migration `20260908220000` (server-mediated, forward-only, self-verifying); client-portal enquiry route uses the server-mediated admin path behind `rateLimit`; `client-portal` CI job builds it |
| 6 | Reduce shared service-role blast radius | **CODE-PREP + ADR DONE / INFRA = OWNER** | `docs/security/ADR-001`: inventory, target architecture, adversarial model; `smoke-service-role-usage` pins the service-role call-site count; separate project / scoped credential = OWNER |
| 7 | Malware / quarantine / content-trust | **FIXED (fail-closed) / TRACKED (durable ledger)** | full-stream scan to 25 MB; verdict enum incl. `quarantined`/`blocked`; production + scanner-outage/absent + high-risk type → **quarantined**; `contentScannerAdapter` posts bytes via SSRF-safe broker; `smoke-content-trust` proves signature-match ≠ clean and the fail-closed path |
| 8 | Stored-code / XSS boundary | **FIXED (safe-mode default-off) / BLOCKED (AST sanitiser+nonce CSP)** | `mayRenderStoredMarkup()` gates head-injection in `SiteHead` and custom HTML in `staticExport` (held for review by default); `smoke-stored-code-boundary`; full parser/AST sanitiser + nonce CSP is BLOCKED on a dependency decision |
| 9 | Radar SSRF DNS rebinding | **FIXED (corrected during the adversarial pass)** | connect-time IP pinning via `undici Agent` in the REAL probe path (HTTP + TLS), `safeSiteFetch`, and the outbound broker; IPv6-bracket strip in `assertPublicDestination`. **The behavioural pin test exposed that the pin was mis-wired**: undici 6 calls connect `lookup` with `{all:true}` and needs the address-LIST form `[{address,family}]`; all three sites used the plain `(err,address,family)` form, which threw on every pinned fetch (failed CLOSED — no SSRF — but broke Radar HTTP probes, `safeSiteFetch`, and brokered Shopify/webhook calls). Now fixed on all three and proven behaviourally: each drives the real pinned fetch to a loopback server via a never-resolving `.invalid` hostname pinned to 127.0.0.1 (a regression to the broken form fails the test). `smoke-radar-probe-ssrf` also proves `http://[::1]/` is refused as unsafe-url |
| 10 | Restore / backup safety | **FIXED (guards) / BLOCKED E2E (OWNER keygen)** | `restore-drill.sh`: no loopback auto-trust, prod-name denylist, mandatory `--expect-sha`, safe-tar rejection of `..`/absolute/symlink/device entries, `--no-same-owner`; `smoke-restore-drill-safety`; a real end-to-end drill needs owner keys/secrets |
| 11 | Emergency console + mutating GETs + readiness truth | **FIXED** | `security-console.ts` self-re-execs with the right conditions, verifies persistence, exits nonzero on read-back failure; `/api/internal/sweep` GET→POST; CSRF roots include `/api/tenants/` + `/api/internal/`; readiness content-scanner gate requires a wired adapter AND config; `smoke-security-console`, `smoke-read-path-mutations`, `smoke-production-readiness` |
| 12 | Supply chain / CI / browser / docs | **FIXED (CI/supply-chain) / TRACKED (a11y)** | CI actions pinned by SHA, Supabase CLI pinned, NEW `client-portal` typecheck+build job; `smoke-suite-coverage`; browser a11y coverage for the Security Centre is TRACKED (P2) |

---

## Adversarial verification findings (2026-09-09)

An independent multi-agent pass re-checked each claim against code + test. **7/9
cleanly confirmed** (items 1, 2, 3, 7, 8, 10, 11 — behavioural, regression-
catching, no code gap). **2 flagged, both fixed:**

- **Item 9 — the SSRF pin was mis-wired (real defect, now fixed).** Writing the
  behavioural pin test proved the pin never took effect: undici 6 calls the Agent
  connect `lookup` with `{all:true}`, so the callback must return
  `[{address,family}]`; all three sites (`radarSyntheticProbes`, `safeSiteFetch`,
  `outboundBroker`) used the plain `(err,address,family)` form and threw on every
  pinned fetch. It failed **closed** (no SSRF exposure) but broke real
  functionality (Radar HTTP probes, safe site fetch, brokered Shopify/webhook
  calls). SMTP was unaffected (nodemailer connects to the pinned IP directly).
  Fixed on all three; each now has a behavioural loopback-pin test that fails if
  the broken form returns. `0c93f8c6`.
- **Item 4 — test depth, plus one latent gap closed.** Production enforcement was
  intact, but (a) the exported `deleteSupabasePrivateUpload` reached the remove
  primitive without the freeze guard (uncalled today, so not a live bypass) — now
  guarded, mirroring the public side; and (b) the inventory's storage check was a
  filename-scoped presence-anywhere source-regex — now a whole-server-tree
  object-store-primitive net, and all four storage surfaces have behavioural
  freeze-refusal proof. `8c073d06`.

No live vulnerability was found in either flagged item; both production
enforcement paths were confirmed intact before the fixes.

## Migrations created but NOT applied

- `supabase/migrations/20260908220000_brand_enquiries_server_mediated.sql`
  (169 lines). Forward-only, idempotent, transaction-wrapped, ends with a
  privilege audit that RAISES if any browser-role table/sequence/policy/function
  privilege survives (all seven table privileges — incl. TRUNCATE/REFERENCES/
  TRIGGER residue — not CRUD alone). **LOCAL/OWNER-APPLIED ONLY. Not applied to
  any remote or shared database by this pass.** Order: base `20260908210000`
  (already in `main`) then this corrective one.

---

## Files changed by workstream (86 files, +5116 / −396)

**Containment / enquiry server-mediation (items 1, 5):**
`supabase/migrations/20260908220000_brand_enquiries_server_mediated.sql`,
`supabase/rls-verify.sql`, `supabase/tests/containment-isolation.test.mjs`,
`portal/src/lib/supabase/enquiryDataClient.ts`, the 11 `website-enquiries/*`
routes, `client-portal/app/api/public/brand-enquiry/route.ts`,
`client-portal/lib/route-security.ts`.

**Security control plane / sessions / operator authority (items 1, 2, 3):**
`portal/src/lib/server/auth/securityControl.ts`,
`portal/src/lib/server/auth/auth.ts`,
`portal/src/lib/server/auth/founderAgency.ts`,
`portal/src/app/api/auth/login/route.ts`,
`portal/src/app/api/portal/security/actions/route.ts`,
`portal/src/app/api/portal/security/overview/route.ts`,
`portal/src/server/types.ts`.

**Write boundary (item 4):**
`portal/src/lib/server/privateUploadStorage.ts`,
`portal/src/lib/server/publicUploadStorage.ts`,
`portal/src/server/storage.ts`, `portal/scripts/read-path-mutation-inventory.ts`.

**Blast-radius (item 6):**
`docs/security/ADR-001-least-privilege-blast-radius.md`.

**Content trust / malware (item 7):**
`portal/src/lib/server/security/contentTrust.ts`,
`portal/src/lib/server/security/contentScannerAdapter.ts`,
`portal/src/instrumentation.ts`.

**Stored-code boundary (item 8):**
`portal/src/built-ins/modules/website-editor/src/components/storefront/SiteHead.tsx`,
`portal/src/built-ins/modules/website-editor/src/server/staticExport.ts`.

**SSRF / outbound (items 9, 6b):**
`portal/src/engines/data/server/radar/radarSyntheticProbes.ts`,
`portal/src/lib/server/safeSiteFetch.ts`,
`portal/src/lib/server/net/outboundBroker.ts`,
`portal/src/lib/server/email/transactionalEmail.ts`,
`portal/src/lib/server/integrations/integrationConnections.ts`,
`portal/src/built-ins/modules/ecommerce/src/lib/shopify.ts`,
`portal/src/lib/server/assistants/openaiAssistant.ts`,
`portal/src/lib/server/access/inboxMediaTargetAccess.ts`.

**Console / mutating GETs / readiness / CSRF (item 11):**
`portal/scripts/security-console.ts`, `portal/scripts/security-console-impl.ts`,
`portal/src/app/api/internal/sweep/route.ts`, `portal/src/proxy.ts`,
`portal/src/lib/server/productionReadiness.ts`,
`portal/src/app/healthz/full/route.ts`.

**Restore/backup (item 10):**
`ops/backup/restore-drill.sh`, `ops/backup/README.md`.

**CI / supply chain / env (item 12):**
`.github/workflows/ci.yml`, `portal/scripts/run-canonical-suite.mjs`,
`portal/src/lib/server/env.ts`, `portal/.env.example`, `portal/package.json`,
`client-portal/package-lock.json`.

**Docs:** `SECURITY-GATE-REPAIR-REPORT.md`,
`SECURITY-CONTAINMENT-PROGRAMME.md`, `docs/security/incident-runbooks.md`,
`portal/docs/development/PRODUCTION-READINESS.md`,
`portal/docs/development/TODO.md`, `portal/docs/development/issues.md`,
`portal/docs/04-DEVELOPMENT-PLANS.md`,
`portal/docs/development/plans/rls-enable.md`,
`portal/docs/consolidation-manifest.json`.

**Behavioural test files added/updated (prove boundaries, not function names):**
`smoke-radar-probe-ssrf`, `smoke-security-control-fail-closed`,
`smoke-write-surface-inventory`, `smoke-session-registry-completeness`,
`smoke-service-role-usage`, `smoke-content-trust`,
`smoke-stored-code-boundary`, `smoke-restore-drill-safety`,
`smoke-production-readiness`, `smoke-threat-centre`,
`smoke-platform-hardening`, `smoke-security-console`,
`smoke-read-path-mutations`, `smoke-safe-site-fetch-toctou`,
`smoke-outbound-broker-ssrf`, `smoke-ai-tenant-key-isolation`,
`smoke-enquiry-tenant-isolation`, `smoke-rls-policy-coverage`,
`smoke-write-boundary`, `smoke-security-lockdown`, `smoke-healthz-readiness`,
`smoke-suite-coverage`, `smoke-website-editor-runner`.

---

## Commits (35, oldest → newest)

```
c5da6c46 phase-0  release harness: directory card + deterministic CI discovery
4e77faf9 phase-0  repoint the two harness meta-tests to the enumerator invariant
f73f37b7 phase-1  brand_enquiries server-mediated + destructive-privilege residue removed
414c45fe phase-4  CSRF covers /api/tenants + Fetch Metadata + sibling defense
6844c3d8 phase-6  SMTP IP-pinning, Shopify hardening, per-tenant AI key isolation
d75a517d phase-8  hydration 503; readiness requires security evidence
a5a9c848 phase-5/7 restore-drill fails safe + operator console
8592f2fc phase-2  session gate binds the LIVE identity through sandbox
9ea22f33 phase-8/9 .env.example readiness signals; docs reconciled
e09cf0f3 phase-9  canonical gate-repair report + restore README
4b83372c docs     record confirmed full-suite result
dd634107 phase-2  single write boundary the freeze binds across storage
ae40c782 docs     report the phase-2 storage write boundary
9f9d884a phase-6  close safeSiteFetch / Radar-probe DNS-rebinding TOCTOU
148ac25d phase-2  epoch bumps bind sandbox sessions via live-anchor stamping
84b86e8d phase-3  platform-wide switches require AAL2 (visibly unavailable)
b58da795 phase-5  out-of-band write freeze that survives a snapshot restore
88e147e5 docs     record phase 2c/3/5c/6d fixes
809e0523 docs     final green suite numbers
fccc7075 item-9   DNS-rebinding TOCTOU closed in the REAL Radar probe path
03912156 item-1   security-control reads fail CLOSED for protected writes/gate
5fae9e2d item-11  console works without hidden NODE_OPTIONS; sweep GET→POST
5f80fff6 item-4   write boundary over object-store deletes + surface inventory
82b62bd3 item-2   user-specific platform-operator authority + tenant revocation
9135cbab item-12,5 pin CI supply chain; client-portal enquiry survives migration
77184428 item-3   complete session registry (every mint) + expiry + pruning
147c3281 item-10  restore drill: no loopback auto-trust; mandatory digest; safe extraction
bd4c8164 item-7   content trust scans FULL stream, quarantines, fails closed
54215db4 item-8   stored-code safe boundary → SiteHead + static export
8b02318c item-6   ADR + code prep for least-privilege blast-radius reduction
feb9f085 chore    remove stray productionReadiness.ts.bak committed in error
e7cae600 docs     reconcile the canonical gate-repair ledger to HEAD feb9f085
0c93f8c6 item-9   fix the SSRF pin — undici needs the address-list lookup form
8c073d06 item-4   guard exported private-delete + behavioural + broader inventory net
36240b7d docs     regenerate authored-doc consolidation after the readiness edit
```

The last three security commits (`0c93f8c6`, `8c073d06`) landed from the
adversarial verification pass; `36240b7d` regenerates the consolidated-doc digest
the readiness-pointer edit invalidated.

---

## Remaining work — honest ledger

### P0 (stop-ship; OWNER — not fixable in code)
1. Apply the containment chain to the live DB after a fresh backup:
   base `20260908210000` then corrective `20260908220000`; paste
   `rls-verify.sql`, confirm `containment-verified` with 0 FAIL; re-check
   milesymedia login. Then set `PORTAL_CONTAINMENT_MIGRATION_VERIFIED=true`.
2. Run an owner-approved restore drill (`ops/backup/restore-drill.sh` against a
   marked disposable DB) and set `PORTAL_LAST_VERIFIED_RESTORE_AT`; enable
   `BACKUP_ENABLED` + `PORTAL_LAST_BACKUP_AT`. RPO/RTO UNMEASURED until then.
3. Connect an AV/CDR scanner (`PORTAL_AV_SCANNER_URL` + adapter wired) — content
   uploads fail closed (quarantine) without it in production.

### P1 (OWNER / infra)
4. Execute ADR-001: give the client portal its own DB identity (separate Supabase
   project OR scoped gateway/RPC OR non-BYPASSRLS role) and remove its
   full-project service-role key; independent secret rotation per app.
5. Authoritative MFA/AAL2 ceremony (Supabase) so high-impact platform actions
   are truly step-up-gated, not merely refused.
6. Distributed rate-limit store (`PORTAL_RATE_LIMIT_STORE_URL`) and off-platform
   event drain (`PORTAL_SECURITY_EVENT_DRAIN_URL`); edge WAF
   (`PORTAL_EDGE_WAF_ENABLED`).
7. Resolve apex `aqua-crm.com` TLS mismatch + canonical `www` redirect.
8. Branch protection on `main`: require `verify`, `containment`, `client-portal`,
   `browser` CI jobs; set `PORTAL_DEPENDENCY_AUDIT_PASSED=true` on a green audit.

### P2 (code; tracked, not blocking this brief's items)
9. Extend `assertWritesAllowed` to the remaining mutating surfaces (Supabase
   RPC, email, AI, webhooks, cron/queues, site-editor filesystem/repo writes)
   with a full static inventory — storage is done and inventory-enforced.
10. Item 8: full parser/AST HTML sanitiser + nonce-based CSP (BLOCKED on a
    dependency decision) to replace the default-off safe-mode hold.
11. Item 7: durable quarantine ledger + a separate download origin for
    user-supplied files.
12. Browser/a11y automated coverage for the Security Centre.

---

## Is GitHub CI green?
Not observed on this branch yet (owner to run/enable). The CI pipeline itself
was repaired here (Node 22, SHA-pinned actions, deterministic discovery, new
required `containment` and `client-portal` jobs). Locally at HEAD 36240b7d:
typecheck 0, both builds green, canonical suite 6998 pass / 0 fail, focused
security 116/0.
