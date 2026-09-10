# AquaCRM — Incident Response Runbooks

Phase 5 of the assume-breach containment programme. Actions described in the
present tense below map to real, tested code on this branch. Steps explicitly
conditioned on a future deployment, live migration, provider connection or
owner drill are prospective and remain release gates; they are not current
production capabilities. Control-plane functions live in
`portal/src/lib/server/auth/securityControl.ts`.
Two invocation paths exist:

- **The threat centre** — `/portal/agency/security` (owner-only). Every action
  re-verifies the owner's password, requires the typed CONTAIN phrase plus a
  written reason, is tenant-scoped, and lands in the durable record. Platform-
  wide switches (global freeze, global sign-out, AI kill) are refused for
  everyone but the operator's own owner account.
- **The operator console** (Railway → service → shell, with production env) —
  the RUNNABLE cross-tenant path, and the fallback when the UI itself is
  unavailable mid-incident. It is a real command, not a TypeScript function name:

  ```
  node --import tsx scripts/security-console.ts <command> [args] --actor <you> [--reason "..."] --commit
  ```

  Every mutating command is DRY-RUN by default (prints what it would do); add
  `--commit` to apply, and it requires `--actor` and (for mutations) `--reason`.
  The command names below are the console's; the underlying functions live in
  `portal/src/lib/server/auth/securityControl.ts`.

Every action below records a SecurityEvent (`lib/server/security/securityEvents.ts`)
and a structured `[security-control]` log line. Events are secret-free by
construction; logs never carry prompts, file contents or credentials.

> **Public-upload status (2026-09-10):** the public-CDN byte-inspection changes
> on `security/public-upload-byte-inspection-20260910` are local, unmerged and
> undeployed. That branch now refuses every configured app-server write through
> `storePublicUpload` before scanner/provider I/O because atomic publication
> ownership and recall do not exist, and its dormant provider upload/delete code
> has been removed or hard-disabled. This is not a Supabase-wide firewall:
> direct authenticated, dashboard and other service-role access remains governed
> by the unapplied/unverified containment migration. Treat every enablement or
> cleanup step below as prospective until the exact branch is reviewed and the
> later lifecycle is independently proved.

> **The one rule:** contain FIRST with the reversible switch, investigate
> second, restore third. Every switch here is reversible — flipping one on
> suspicion is cheap; hesitating is not.

---

## R1 — Compromised operator / staff account

Signals: logins from unexpected addresses, security events you didn't action,
data exports you didn't run.

1. **Suspend the account** (bites on the NEXT request, everywhere — and through
   a sandbox session, via the live-identity anchor):
   `security-console.ts suspend-user <userId> --actor <you> --reason <why> --commit`
2. **Revoke every session for the user**:
   `security-console.ts revoke-all <userId> --actor <you> --reason <why> --commit`
   — or one device only: `security-console.ts sessions <userId>` →
   `security-console.ts revoke-session <sid> --actor <you> --reason <why> --commit`.
3. **Rotate their credential**: force a password reset (the reset token family
   fails closed on the production signing secret — Phase 0-B).
4. If the account had owner scope, **bump the tenant epoch** so anything minted
   while compromised dies:
   `security-console.ts bump-tenant-epoch <agencyId> --actor <you> --reason <why> --commit`.
5. Investigate with the audit trail + security events, then
   `security-console.ts unsuspend-user <userId> --actor <you> --commit` once
   re-credentialed.

Verified by: `smoke-auth-fail-closed` (suspension/epoch/registry enforcement on
every request), `smoke-session-revocation`.

## R2 — Tenant-level breach (one agency compromised)

1. **Lock the tenant**: `security-console.ts lockdown-tenant <agencyId> --actor <you> --reason <why> --commit` — every
   session of that tenant except its OWNERS fails the central gate immediately
   (owners keep the keys so they can investigate and lift; a compromised owner
   is contained with suspension/user-epoch instead); other tenants are
   untouched. REVERSIBLE: lifting restores existing sessions, so flipping it
   on suspicion costs one tenant minutes, not a re-login storm.
2. Investigate. If sessions themselves are suspect, ALSO
   `bumpTenantSecurityEpoch(agencyId, ...)` (forces re-login on lift).
3. **Lift**: `security-console.ts lift-tenant <agencyId> --actor <you> --commit`.

Verified by: `smoke-security-lockdown` (tenant isolation, lift-restores-sessions).

## R3 — Active data corruption / mass-write incident

1. **Freeze writes, keep serving reads**: `security-console.ts freeze --actor <you> --reason <why> --commit`
   — every write through `mutate()` (the single write path for all
   collections) is refused BEFORE it applies. The control plane itself stays
   writable: you can still suspend users and revoke sessions mid-freeze.
2. Identify the writer (security events, activity log, outbox).
3. Suspend/revoke the source (R1) or lock its tenant (R2).
4. **Thaw**: `security-console.ts thaw --actor <you> --commit`.
5. If state was corrupted, restore per R7.

Verified by: `smoke-security-lockdown` (no partial application, control plane
live during freeze, liftable).

## R4 — Global session compromise (signing secret suspected leaked)

1. **Kill every session everywhere**: `security-console.ts bump-global-epoch --actor <you> --reason <why> --commit`
   — includes legacy cookies (no epoch stamp reads as 0; one bump kills all).
2. **Rotate `PORTAL_SESSION_SECRET`** on the deployment. The app REFUSES to
   boot in production without a real secret (Phase 0-B) — a botched rotation
   fails loudly at startup, not silently with the dev fallback.
3. Remember the same resolver signs all 11 token families (CSRF, magic links,
   password reset, email verification, OAuth state, connection confirmations,
   inbox media) — rotating the secret invalidates those tokens too. That is
   the point.

## R5 — Malicious upload discovered

1. **Contain by location.** For a private object, remove the referencing record
   and delete it through the private-upload delete path. For an already-public
   object, freeze further app writes and unpublish/remove references, but do
   **not** call `deleteSupabasePublicUpload`: the compatibility helper is
   deliberately ownership-blocked and a shared legacy content-addressed key may
   still serve another page. Provider-admin deletion is an owner-approved
   emergency action only after an independent tenant/site-wide reference
   inventory, explicit object-scope sign-off and a durable incident/audit
   checkpoint. For a published inline `data:` payload, remove it from the page
   record and republish a known-safe replacement.
2. Pull the `content-trust` digest and verdict from the stored record or
   SecurityEvent where one exists. Historic public objects and already-published
   inline payloads may have neither; inventory them instead of assuming a
   missing trust record means clean.
3. "Quarantined" currently means **refused/held by policy**, not retained in a
   durable quarantine store. There is no release, rescan or purge lifecycle, so
   do not tell responders that a suspicious object can be recovered from an
   isolation vault.
4. Search the available event tail and durable control-action record for the
   same digest across the authorized scope. There is no configured durable
   off-platform event drain yet; process-local telemetry alone is not complete
   forensic evidence.
5. **After the public-upload follow-on is deployed**, configured app-server
   writes through `storePublicUpload` are disabled before scanner/provider I/O.
   Local development still applies byte/type inspection and every content-trust,
   policy, traversal or provider failure aborts publication for recursively
   inspected block-tree data URLs; no provider-error marker may retain one of
   those values inline. This does not cover CSS/head/foot stored-code fields and
   does not stop direct Supabase access. Existing public URLs can continue rendering.
6. After that deployment, run an explicit inventory + scan + safe
   republish/removal job for pre-existing public objects and published inline
   payloads. The new request-time gate is not retroactive.
7. If the local gateway missed a class of file, add its signature to
   `contentTrust.ts` and add a regression to `smoke-content-trust`. Connect and
   live-prove the AV/CDR adapter before treating malware scanning as enforced.
   The present outbound broker caps scanner request bodies at 1 MiB, below the
   public-media 8 MiB ceiling; larger files fail closed until the owner approves
   a bounded scanner-data egress increase or the product limit is reduced.
8. Do not re-enable remote writes with a feature flag or "best effort" delete.
   The enabling design needs durable intent before provider I/O,
   operation-owned immutable keys, an atomic page-generation commit, exact
   ownership/refcount lineage and an idempotent recovery/recall worker. Legacy
   shared keys must never be automatically deleted. Until that exists, treat
   any historic failed multi-object publish as a possible unlinked-public-object
   incident and reconcile by tenant/site.

## R6 — AI incident (prompt injection, runaway generation, key abuse)

1. **Kill AI**: `security-console.ts disable-ai --actor <you> --reason <why> --commit` — the single adapter every
   assistant/editor generation passes through refuses before provider I/O.
2. External-assistant write attempts are already inert: proposals are
   human-decided (pinned by `smoke-ai-containment`); nothing an assistant
   submits executes without an explicit accept by a real user.
3. Rotate the OpenAI key(s) in the affected tenant's integration settings.
4. **Restore**: `security-console.ts enable-ai --actor <you> --commit`. Quotas (`PORTAL_AI_CALLS_PER_HOUR`)
   bound the blast radius between detection and response.

## R7 — Restore from backup (data loss / corruption)

The encrypted off-Supabase snapshot lane exists (`ops/backup`, GitHub Action,
`BACKUP_ENABLED` gate) but is NOT yet operationally verified — key generation,
secrets and a restore drill are OWNER ACTIONS. Until the drill has been run,
treat restore capability as UNPROVEN and say so in any incident comms.

1. `security-console.ts freeze --actor <you> --reason "restore" --commit` first — never restore under live writes.
   Also set the OUT-OF-BAND env freeze `PORTAL_WRITES_FROZEN=1` on the app for
   the cutover — the in-state freeze lives in the database, so restoring an
   older snapshot would silently clear it; the env freeze survives the restore.
   Clear it only after the restored state is verified.
2. Restore the snapshot per `ops/backup/README` into a STAGING database.
3. Verify: `supabase/rls-verify.sql` (containment invariants must be all-INFO),
   then the containment test suite against the restored DB.
4. Repoint the app; `security-console.ts thaw --actor <you> --commit`; monitor the event spine.

> **Restore-drill safety (Phase 5/7):** `ops/backup/restore-drill.sh` is
> default-DENY. It runs against a loopback DB, or a non-local target ONLY when
> that DB carries the on-target marker `aquacrm.restore_drill_disposable=yes`
> AND you pass `--allow-nonlocal-disposable`. A live Supabase host is refused
> unconditionally; the old `--i-know-this-is-a-branch` bypass is gone. A missing
> manifest, a public.* row-count mismatch, a missing/failed rls-verify, or a
> missing ensure_rls trigger all FAIL the drill (non-zero).

**RPO/RTO: UNMEASURED.** They can only be measured by the owner's drill.

## R8 — Cross-application / ecosystem incident

The local Phase 0-A migration is designed and locally tested to seal cross-app
reach (datastore service-role-only; storage policies per-app; profiles own-row).
It has **not** been applied to the live database. After the owner applies and
verifies the full migration chain, the intended sibling-app blast radius is
public-read content plus that app's own user's profile row — nothing
tenant-scoped. Verify with `supabase/tests/run-containment-tests.sh` against an
authorised non-production target and run `rls-verify.sql` on live. Until live
attestation exists, assume the OLD reach (everything) and treat any sibling
compromise as R4.

---

## Standing rules

- Do not edit or weaken a shipped control to "get past" an incident — every
  control here fails closed by design and has a lift/clear action.
- Never write secrets, prompts, file contents or raw bodies into tickets,
  logs or events while investigating.
- After ANY incident: write the timeline while it's fresh, then add the
  regression test that would have caught it earlier.
