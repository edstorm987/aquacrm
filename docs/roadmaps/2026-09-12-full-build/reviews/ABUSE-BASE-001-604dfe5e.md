# Independent Acceptance Review — ABUSE-BASE-001 @ `604dfe5e`

- **Verdict: REJECT**
- **Counts: P0 0 / P1 1 / P2 0** (1 attributable P1)
- **Exact SHA reviewed:** `604dfe5e7b727d56e8bf5619ba05fad34871e9ea`
  (`ABUSE-BASE-001: durable atomic admission limiter (adapter + migration)`, parent `b5d2cc5d`)
- **Reviewer:** Claude Independent Acceptance + Documentation-Truth Worker
- **Date:** 2026-09-12 (BST)
- **Worktree:** `<TMP>/aquacrm-claude-review-20260912`, detached HEAD at the exact SHA, `git status --porcelain` = 0 lines (clean). `node_modules` was a symlink to the parent repo's (git-ignored; porcelain stayed clean) and was removed after the run.
- **Source repo:** `aquaCRM-sales-workflow-recovered-20260912` (contains the SHA on `overnight/claude-hardening-20260912`).

## Scope (from REVIEW-INBOX)
> Durable limiter infrastructure: determine production backend selection, fail-closed behavior, privacy/cardinality/retention, atomicity and whether zero wired callers means infrastructure-only.

## Files in the commit (3, all additive; +505 lines)
- `portal/src/lib/server/security/admissionLimiter.ts` (new, 261 lines)
- `portal/scripts/smoke-admission-limiter.test.ts` (new, 166 lines)
- `supabase/migrations/20260912140000_abuse_admission_limiter.sql` (new, 78 lines)

---

## Attributable finding

### P1 — Migration version `20260912140000` collides with an already-accepted, already-pushed migration
**File:** `supabase/migrations/20260912140000_abuse_admission_limiter.sql`

The commit ships a migration versioned `20260912140000`. That exact version is **already occupied** on the release line by a *different, accepted* migration:

- `supabase/migrations/20260912140000_aqua_tag_capture_admission_claims.sql` (an ABUSE-003 follow-up), present in:
  - pushed checkpoint `3abd629e` (`checkpoint/full-build-20260912-112701`), and
  - pushed integration branch `43aa898d` (`checkpoint/integration/full-build-20260912`).

Content hashes confirm they are two **distinct** migrations sharing one version:
```
20260912140000_aqua_tag_capture_admission_claims.sql  sha256 25d6be48…f85b77   (accepted, on release line)
20260912140000_abuse_admission_limiter.sql            sha256 b1a09ee8…7cf9d9   (this commit)
```

Occupied versions on the release line around this slot: `…130000` (inbox erasure), **`…140000` (aqua tag)**, `…150000` (durable auth nonces). This commit re-used the taken `140000` slot.

**Why this is attributable, not integration noise.** This is the exact defect class the project has already rejected once and treats as worker-fixable:
- `BRAND-ERASURE-001` Part 1 was **REJECTED** in part because "its migration version collides with durable auth nonces," and QUEUE mandates Part 2 "must use a unique migration."
- EVIDENCE (`ABUSE-001-AUTH-SECOND-FOLLOWUP`) records that the auth-nonce migration "was deliberately renamed from `20260912140000` to `20260912150000` to avoid colliding with the existing Aqua Tag migration version." ABUSE-BASE-001 walked straight into the very slot auth-nonce vacated for that reason.

**Failure scenario.** Supabase keys applied migrations by the version prefix. Two files at `20260912140000` on the integrated tree produce a duplicate-version conflict at `supabase db push` / `migration up`: the apply either errors or silently applies only one and skips the other, leaving `public.abuse_admission_counters` / `public.abuse_admission_check` **uncreated**. The durable adapter then hits a missing RPC and (correctly) fail-closes to DENY on every call — i.e. the entire durable authority this slice exists to provide is non-functional at deploy. At the isolated SHA nothing breaks (its parent predates both other migrations and there are no callers), which is why in-tree `git`/lexical dup-detection at `604dfe5e` shows no duplicate; the collision is intrinsic to the chosen version versus the accepted inventory.

**Smallest corrective requirement (do not fix here).** Renumber the migration to the next free version — `≥ 20260912160000` (130000/140000/150000 are taken) — and update the one test reference `readFileSync("../supabase/migrations/20260912140000_abuse_admission_limiter.sql", …)` in `smoke-admission-limiter.test.ts:158` to match. No logic change required.

---

## What was verified GREEN (evidence is real)

**Gates (worktree @ `604dfe5e`, hermetic, 127.0.0.1/in-process only):**
- Focused suite `smoke-admission-limiter.test.ts` — `node --import tsx --test` — **exit 0, 9/9 pass, 0 skipped / 0 cancelled / 0 todo, 9 subtests registered**, 785 ms (independently rerun; no hang, no zero-subtest suite).
- `node node_modules/typescript/bin/tsc --noEmit` (full project) — **exit 0, 0 diagnostics**.
- `git diff --check 604dfe5e^ 604dfe5e` — **exit 0, clean** (no whitespace/conflict markers).
- Independent hostile probe (reviewer-authored, byte-identical copy sha256 `be53efc4…0b2fd`, driven via `tsx`) — **8/8 pass**:
  1. authority returns `allowed:true` but `hits>max` → DENY (guard `allowed===true && hits<=max`);
  2. authority returns `allowed:"true"` (truthy string) → DENY (strict `=== true`);
  3. fast-local pre-filter passes but authority denies → authority DENY stands, `backend:"durable"` (pre-filter never overrides an authority deny);
  4. `data:undefined` → fail-closed `degraded:true` deny;
  5. missing `reset_at` → finite client fallback + `retryAfterSec ≥ 1`;
  6. `max=0` → first admission denied;
  7. durable next-window admits again (window reset);
  8. exact bound — `max` allowed, `max+1` denied, `remaining` floors at 0 (no off-by-one).

**Design correctness confirmed against source:**
- **Backend selection** (`durableConfigured`): durable when `ABUSE_ADMISSION_BACKEND∈{durable,postgres}`, or (default) `PORTAL_BACKEND==="postgres"` **or** `DATABASE_URL` set; explicit `memory` forces memory. This matches the **accepted** canonical `nonceStore.getNonceStore()` contract (`PORTAL_BACKEND==="postgres" || DATABASE_URL`) and, if anything, leans *more* durable (DATABASE_URL forces durable even when PORTAL_BACKEND is set otherwise). The historical `PORTAL_BACKEND=supabase→memory` rejection was against a superseded nonce version; this aligns with the accepted one. **No defect.**
- **Fail-closed**: every durable failure shape (factory throw, `error`, `data==null`, non-finite `hits`, rpc throw) returns `allowed:false, degraded:true, backend:"durable"`. Verified behaviorally.
- **Fast pre-filter soundness**: per-process count ≤ global count, so a local overflow implies a global overflow; the pre-filter only adds early denials and never grants (verified — probe #3). It is skipped for the memory backend (single counter).
- **Atomicity (memory)**: RMW with no `await` between read and write → atomic on the event loop; 50-way `Promise.all` admits exactly `max`. Verified.
- **Atomicity (SQL)**: single-statement `INSERT … ON CONFLICT (dimension,bucket_key,window_start) DO UPDATE SET hits = hits + 1 RETURNING hits` — row-locked, cannot lose a hit by construction. **Reasoned, not behaviorally proven** (no disposable Postgres; see release gates).
- **Migration hygiene**: additive only (one table + one RPC, nothing altered/dropped); RLS enabled; `REVOKE ALL … FROM public,anon,authenticated`; `GRANT … TO service_role`; `SECURITY DEFINER SET search_path = public`; bounded self-cleanup `DELETE … WHERE window_start < now - GREATEST(window*4, 1h)` (indexed range delete). Input validation rejects null/empty dimension/key, negative max, non-positive window.

## Documentation-truth audit (this slice) — PASS
- **QUEUE.md line 51** ("durable/memory admission abstraction and unapplied atomic RPC migration with 9/9 + TypeScript/diff green. No endpoint was rewired…"): **accurate on every claim** — 9/9 confirmed, tsc/diff green confirmed, and there are **zero wired callers** (`grep` for imports/`admit(`/`resolveAdmissionStore`/`abuse_admission_check` across `portal/src` and `portal/scripts` finds none outside the module + its own test). So "only infrastructure" is the correct reading; it does **not** replace the process-local launch blockers at any admission surface.
- **EVIDENCE.md line 20** (ABUSE-BASE-001 handoff): **accurate** — durable/memory adapter ✓, fast pre-filter ✓, fixed-search-path ✓, service-role-only ✓, atomic counter RPC ✓, four dimensions `ip | subject | tenant-install | provider-budget` ✓ (matches the `AdmissionDimension` union exactly), 9/9 incl. 50-way loopback concurrency (`attempts=50`) and failure-shape refusal ✓, tsc/diff green ✓, no endpoint wired ✓, "infrastructure in VERIFY" framing ✓.
- **Authored docs / semantic registry / reference:** no mention of the admission limiter yet — correct for un-wired infrastructure; **no false/stale/overstated claim** (nothing asserts the durable limiter is wired or that process-local launch blockers are closed).
- **Migration inventory:** the collision above is the one inventory defect (reported as P1).

## Separation of concerns
- **Attributable:** the P1 migration-version collision.
- **Pre-existing:** none relevant to this slice.
- **External / live-only (release gates, truthfully recorded, NOT counted):**
  - SQL RPC atomicity/behavior unproven against a real/disposable Postgres (migration unapplied; no DB contacted, per boundary).
  - Deployed backend selection with a real `DATABASE_URL`/`PORTAL_BACKEND`, real service-role client, provider behavior.
- **Advisory (non-counted, for the future wiring slice):** the `ip` dimension would persist raw IPs as `bucket_key`; the eventual caller must decide hashing/retention for PII (the module already notes `subject` should be a *salted digest*). Bounded self-cleanup (~`max(4×window, 1h)`) limits retention. Not a defect at this un-wired commit.

## Commands run (all local, hermetic)
```
git worktree add --detach <TMP>/aquacrm-claude-review-20260912 604dfe5e…
# focused suite
node --import <tsx>/dist/loader.mjs --test scripts/smoke-admission-limiter.test.ts   # exit 0, 9/9
# full typecheck
node node_modules/typescript/bin/tsc --noEmit                                        # exit 0, 0 diagnostics
# whitespace/conflict-marker gate
git diff --check 604dfe5e^ 604dfe5e                                                  # exit 0, clean
# independent hostile probe (byte-identical copy)
node --import <tsx>/dist/loader.mjs probe.ts                                         # exit 0, 8/8
# migration inventory / collision
git ls-tree -r --name-only {3abd629e,43aa898d} -- supabase/migrations               # 20260912140000_aqua_tag… present
```

## Skipped / hung / unrun gates
- No hung tests; no zero-subtest suites; nothing skipped in the focused suite.
- One authored test ("the migration is additive…") is a **source-string regex** check of the SQL, not behavior — noted, not counted as behavioral proof.
- Disposable-Postgres behavioral run of the RPC: **not run** (boundary; migration unapplied) — release gate.
- No UI in this slice → no browser/axe/responsive checks applicable.

## No-live statement
No source/test/migration/doc was edited. No commit, cherry-pick, merge, push, PR, deploy, or migration apply. No contact with any live/deployed site, Railway, Supabase cloud, DNS, provider, email/SMS/payments. No real credentials or data. All work was local, in-process, or 127.0.0.1-only. The durable adapter was exercised solely through an injected fake RPC client; no database was contacted. Heavy-job lock `<TMP>/aquacrm-heavy-job-20260912.lock` was held for the full-tsc run and released afterward.
