# AquaCRM — Incident Response Runbooks

Phase 5 of the assume-breach containment programme. Every action named here is
a REAL, TESTED control that exists on this branch — nothing aspirational. All
control-plane functions live in `portal/src/lib/server/auth/securityControl.ts`.
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

1. Uploads are content-judged at the storage choke point (Phase 2): pull the
   file's `content-trust` digest from the stored record / event spine.
2. **Delete the object** via `deletePrivateUpload(...)` for its provider, and
   the referencing record.
3. Search the event spine for the same digest across tenants (the digest IS
   the artifact identity).
4. If the gateway missed a class of file, add its signature to
   `contentTrust.ts` and add the regression to `smoke-content-trust` — the
   gateway is one module, one policy, everywhere.
5. If an AV/CDR engine is available, connect it via `setContentScanner` —
   config, not redesign.

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

The Phase 0-A migration sealed cross-app reach (datastore service-role-only;
storage policies per-app; profiles own-row). If a sibling app (aquaoasis,
milesymedia, zimante) is compromised, its blast radius into AquaCRM is now:
public-read content and its own user's profile row — nothing tenant-scoped.
Verify with `supabase/tests/run-containment-tests.sh` against the live schema
(after the owner applies the migration). Until the migration is applied in
production, assume the OLD reach (everything) and treat any sibling compromise
as R4.

---

## Standing rules

- Do not edit or weaken a shipped control to "get past" an incident — every
  control here fails closed by design and has a lift/clear action.
- Never write secrets, prompts, file contents or raw bodies into tickets,
  logs or events while investigating.
- After ANY incident: write the timeline while it's fresh, then add the
  regression test that would have caught it earlier.
