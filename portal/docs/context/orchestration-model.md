# Orchestration model

← [context/](README.md)

How AquaCRM development runs across multiple Claude chats without depending on any
one chat's memory.

## The roles
| Role | Who | Job |
|---|---|---|
| **Ed** | the human | Sets direction, spins chats, makes the decisions plans flag, approves commits. |
| **Commander** | one Claude chat (orchestrator) | Assigns plans to workers, tracks [state](state.md), writes worker briefs, keeps docs in sync, reports to Ed. Builds only when asked / for trivial tasks. |
| **Worker** | a Claude chat per plan | Builds **one plan**, staged; runs tests; updates the docs; reports back. Owns its files. |
| **Auditor** | one looping Claude chat | Independently **verifies** shipped work before it's trusted as done — re-runs the suite, runs the app, checks the contracts + tests-are-real + docs-are-true. **Read-only on source** (findings, never fixes); writes only [audits.md](../development/audits.md). Never audits its own build. See [auditor-brief.md](auditor-brief.md). |

## How work flows
```
Ed ── spins ──▶ Commander ── reads state.md + development.md
                    │
                    ├─ picks the next plan(s) from todo.md (priority + no file overlap)
                    ├─ writes a worker-brief  ──▶ Ed spins a Worker with it
                    ├─ logs the assignment in state.md (worker · plan · files owned · status)
                    │
Worker ── reads brief + development.md + its plan
                    ├─ builds it (simple-first phases), runs the full suite
                    ├─ updates docs (updates.md, its chapter, ticks the todo)
                    └─ reports back ──▶ Commander updates state.md (done / blocked / next)
```

## The audit loop (verify before "done")
Builders test their own work; the auditor is the **independent** check that a claim
is real. It runs on a **loop** and self-manages through the docs — no relay until
something fails.
```
Builder ships ─▶ logs the claim in updates.md
                     │
Auditor (looping) ── each tick ─▶ pending = updates.md − audits.md
                     ├─ audits the oldest unaudited: re-runs the suite, runs the app,
                     │   checks contracts / tests-real / reuse / scope / docs
                     └─ writes a verdict to audits.md   (loud line up top if REWORK/🔴)
                     │
Commander reads audits.md ─▶ PASS/NITS → mark done in state.md + todo.md
                             REWORK     → findings back to the builder (via Ed) → re-audit
```
The auditor is **read-only on source and writes only [audits.md](../development/audits.md)**,
so it runs safely alongside any live worker. Full contract: [auditor-brief.md](auditor-brief.md).

## The rules that stop collisions (multiple workers, one repo)
This is the real risk — we've already seen two chats editing the repo at once.
1. **One plan owns its files.** Before assigning, the commander checks [state.md](state.md) for file overlap. Two workers must not own the same files/modules at the same time. Plans that touch shared foundations (e.g. `radarClassification`, `websiteSources`, `types.ts`) are **serialised**, not parallelised.
2. **Prefer independent slices.** Good parallel pairs: a UI plan + an unrelated backend plan. Bad: two plans both editing Radar, or both editing the inbox.
3. **Shared-file changes are announced.** If a worker must touch a shared file another worker owns, it goes through the commander (note in state.md), not silently.
4. **`updates.md` is append-only-ish** — add a new dated entry at the top; don't rewrite others' entries (workers run concurrently and both write it). Use a stable anchor.
5. **The dev server / `.next`** — ✅ **SOLVED (2026-08-19; note corrected 2026-08-20).** `npm run sandbox:fork -- <name> <port>` gives each worker its own **state file** (`PORTAL_DATA_FILE`), **build dir** (`NEXT_DIST_DIR`) and **port**, so concurrent runtime verification cannot clobber anyone. Bare `npm run dev:verify` is NOT safe for this — it writes the shared `.data/portal-state.json`; the shared sandbox now requires an explicit `PORTAL_ALLOW_SHARED_STATE=1` opt-in (`src/server/storage.ts:248`). Commander runs :3032; workers take 3041+.
6. **Tests** — run the full suite (`PORTAL_BACKEND=memory … scripts/*.test.ts`) before "done"; it's safe to run concurrently (memory backend).
7. ⛔ **NEVER TOUCH GIT** — every worker, every time. Not commit, not push, not `checkout`, not `restore`. A push triggers Vercel → **production**; and because the whole tree is uncommitted, `git checkout <file>` silently deletes another worker's unshipped work (this has happened). Rollback = a scratchpad copy, not git. *(Strengthened 2026-08-20 from the old "not without Ed" wording — Ed's standing decision is "never".)*
8. **The auditor is read-only on source.** It never edits source or tests — it writes only [audits.md](../development/audits.md) — so it can verify a worker's files while that worker is still live, with zero collision risk. It uses its own **forked sandbox** (`npm run sandbox:fork -- auditor <port>`), never the shared one. It reports findings; the **builder** does any rework (never the auditor — that would break rule 1).

## What a "plan" is (the unit of work)
A plan in [development/plans/](../development/plans/) is the unit a worker takes:
it has a goal, staged phases, what to reuse, the decisions Ed's already made, and
a runtime-verifiable "done when". A worker's job is to execute its plan's phases,
not to re-design. If a plan needs a decision Ed hasn't made, the worker surfaces
it (doesn't guess).

## Reporting cadence
- **Worker → commander:** after each shipped phase (what shipped, tests green, docs updated, what's next / any blocker). The `updates.md` entry *is* the report.
- **Auditor → commander:** a verdict per audited entry. The [audits.md](../development/audits.md) entry *is* the report; a REWORK/🔴 shouts from the top of that file.
- **Commander → Ed:** a running picture from [state.md](state.md) — what's in flight, what shipped, what's verified, what needs a decision.

## When to parallelise vs serialise
- **Parallelise** independent plans (different areas, no shared files) — that's the point of the multi-chat setup.
- **Serialise** plans that share foundations, or where one is a dependency of another (e.g. the KPI registry before the marketing KPI view; the `websiteSources` company-destination before the Aqua Tag company setup).
- The [state.md](state.md) dependency notes say which is which.
