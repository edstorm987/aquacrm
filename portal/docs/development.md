# development.md — the law

**This is the master document for AquaCRM. Treat it as the source of truth, use
it for everything, and update it (or the doc it points to) after every change.**
Whether you're an AI or a human, on day one or day one thousand: start here and
you have the whole project. Nothing is lost because everything is written down
and linked from this one place.

> **The rule, in one line:** before you work, read down from here to what you
> need. After you work, walk back up and update what changed — then log it in
> [updates.md](development/updates.md). If the docs don't reflect it, the work
> isn't finished.

> **Running development across multiple chats?** The orchestration layer —
> commander + worker chats, the live state, how to spin a worker — is its own
> book: **[docs/context/](context/README.md)**. `development.md` is *what* to
> build; `context/` is *how we run the chats*.

---

## How this is organised (the library)

Think of it as a library. This page is the **catalogue**. It lists the **books**.
Each book has its own **chapters**, and chapters have **pages**. You never read
the whole library — you walk down to exactly what you need.

```
development.md  ← the catalogue (you are here) — the law, tying it all together
│
├── BOOKS (the top-level docs)
│   ├── goals.md ......... why we're building this and what "done" is
│   ├── roadmap.md ....... the roadmap — what's next, in order (supersedes phases.md)
│   ├── checklist.md ..... the most reliable current summary — read this for "where we stand"
│   ├── todo.md .......... the working cleanup/finishing checklist
│   ├── issues.md ........ known issues, verified findings, risks
│   ├── status.md ........ does it actually WORK / can it be USED (≠ "is it coded")
│   ├── notes.md ......... decisions & context (the "why")
│   ├── tests.md ......... how to test + what's covered
│   ├── updates.md ....... the running changelog (update after everything)
│   ├── audits.md ........ the independent auditor's verdicts (what's *verified*)
│   ├── plans/ ........... one phased plan per substantial item (archive/ for shipped)
│   └── WORKSPACE-FILE-TREE.md  ← the map of the code (its own book of books)
│       │
│       ├── CHAPTERS (docs/workspace/) — what each area/subsystem does
│       │   ├── state-layer · shared-logic · portal-ui · api-and-routes
│       │   ├── plugins · components · scripts-config-docs
│       │   ├── feature-index · hazards-and-duplication · session-changelog
│       │   └── DOSSIERS: radar · advisor · kpi-intelligence · aqua-tag · database
│       │
│       └── PAGES (docs/reference/) — the exhaustive, generated detail
│           ├── server/lib/app/built-ins/components/scripts .md  (every function)
│           ├── api-reference (every endpoint)  ← in workspace/
│           └── radar-rules.md  (every one of the 2,064 Radar rules)
```

Chapters explain the *mechanism*; pages enumerate *everything*. Look a specific
function or rule up in the pages; understand how it works in the chapters.

---

## The books

| Book | What it's for |
|---|---|
| **[goals.md](development/goals.md)** | Why AquaCRM exists, who Ed is, the operating model, current strategic goals, and the principles that shape how we build. Read first to understand *what* we're doing. |
| **[roadmap.md](development/roadmap.md)** | **The roadmap — the outer view.** Every outcome that is coming, its horizon (Now / Next / Later / Someday / Shipped), its target date, and the plans that deliver it. Progress is COMPUTED from those plans' phases, never typed. Written and edited from the Dev Console (`/portal/dev-team/roadmap`); this supersedes phases.md. |
| **[checklist.md](development/checklist.md)** | **The single most reliable "where do we stand" summary** — what's yours (Ed's) vs mine, in order, generated at the end of a session. If you read one thing before working, read this. |
| **[architecture-noobie.md](architecture-noobie.md)** | The whole system explained in **plain English**, no jargon. Start here if you're new (human or agent) and the catalogue below is too dense. |
| **[phases.md](development/phases.md)** | ⚠ **SUPERSEDED by roadmap.md — kept for history only. Do not add items, and do not read its open items as current** (most of its "Next" list has since shipped; see the correction block at the top of that file). |
| **[plans/](development/plans/)** | One **phased plan per substantial item** (e.g. [radar-upgrade.md](development/plans/radar-upgrade.md), [mfa-login.md](development/plans/mfa-login.md)). Each plan's own `**Status:**` line is the authority on that item. Shipped plans may be moved to [plans/archive/](development/plans/archive/). |
| **[audits.md](development/audits.md)** | The **independent auditor's verdicts** — the record of what has been *verified*, not just claimed. A 🔴 finding gets a loud banner at the top of that file. Read before trusting a "complete" claim. |
| **[todo.md](development/todo.md)** | The working **checklist** of cleanup & finishing work — Finish / Clean up / Decide / Prove, with launch-blockers flagged. Tick items off as they land. |
| **[issues.md](development/issues.md)** | Known issues, **verified security/compliance findings** (DB RLS not in repo, Aqua Tag consent, …), duplication, and the live-data hazard. Check before assuming you found a new bug. |
| **[status.md](development/status.md)** | The honest **"does it actually work / can it be used?"** register — kept separate from "is it coded" and "do tests pass". **A passing test ≠ working ≠ usable.** Read before trusting a green suite. |
| **[notes.md](development/notes.md)** | Durable decisions and non-obvious context — the "why", so nothing is re-litigated or re-tripped-over. |
| **[tests.md](development/tests.md)** | The canonical full-suite command, the test convention, the gotchas, and where coverage lives. **Run the full suite before calling a change done.** |
| **[updates.md](development/updates.md)** | The running changelog — every meaningful change, newest first. **This is the memory. Add to it after every change.** |
| **[compliance/erasure-dpo-pack.md](compliance/erasure-dpo-pack.md)** | The **DPO / solicitor review pack** for right-to-erasure: what the system actually does when a client is erased, per data category, what is proven by test vs. unverified, the limits of that evidence, and the **8 decisions we need a DPO to rule on**. Hand this to a reviewer; update it whenever erasure behaviour changes. |
| **[WORKSPACE-FILE-TREE.md](WORKSPACE-FILE-TREE.md)** | The map of the code: every file and what it does, its chapters (`docs/workspace/`) and its generated reference pages (`docs/reference/`). This is where "where does X live?" is answered. |

### The subsystem dossiers (verified, deep)
Inside the file-map's chapters, these five are read-from-source deep dives —
reach for them when working on that system:
[Radar](workspace/radar.md) · [Advisor & AI](workspace/advisor.md) ·
[KPI & Intelligence](workspace/kpi-intelligence.md) ·
[Aqua Tag](workspace/aqua-tag.md) · [Database](workspace/database.md).

### The generated reference pages (exhaustive — one entry per thing)
- **[File-by-file reference](reference/files-index.md)** — **one doc per source file** (**1,816** of them, in `reference/files/` mirroring the tree). Each says what the file is, its full API, **what it depends on, and who uses it** — so anything in the app is findable and traceable. This is the omega layer.
- **[Function-by-function symbol map](reference/00-index.md)** — every exported symbol across **1,869** files (**6,516** symbols) in a few grep-able files.
- **[Full API reference](workspace/api-reference.md)** — every route file (**201**: 192 under `api/**` + 9 top-level) with method, purpose, scope, live-data flag. ⚠ **Hand-maintained — nothing generates or verifies it**; last reconciled 2026-08-20.
- **[Every Radar rule](reference/radar-rules.md)** — the complete 2,064-rule enumeration.
- Regenerate all: `node scripts/generate-file-docs.mjs`, `node scripts/generate-symbol-reference.mjs`, `npx tsx scripts/generate-radar-rules-reference.ts`.

---

## The workflow (the law in practice)

> ### 🔍 Rule zero: the SOURCE is the truth
> A doc is evidence of what someone believed **on the day they wrote it**. Where a
> doc and the code disagree, **read the code, then fix the doc — never the other
> way round.** On 2026-08-20 three "🔴 launch blockers" were briefed as open when
> all three were already fixed, and one of those briefs would have sent a worker to
> "fix" a hardened auth route. Before you act on any claim on these pages, open the
> file it names.
>
> When you find a stale claim: **correct it in place with the `file:line` that
> proves you're right, and mark it RESOLVED rather than deleting it.** History is
> useful; a false open item is not.

**Before you build anything:**
1. Read [checklist.md](development/checklist.md) (where we actually stand), then [goals.md](development/goals.md) (if you don't know the direction) and [roadmap.md](development/roadmap.md) (what's actually next). **Not `phases.md`** — it is superseded history.
2. Find the concern in the [file map](WORKSPACE-FILE-TREE.md) / [feature index](workspace/feature-index.md), and search the [symbol reference](reference/00-index.md) for what already exists. **Reuse → repurpose → simplify before adding new.**
3. Check [issues.md](development/issues.md) and [hazards-and-duplication.md](workspace/hazards-and-duplication.md) so you edit the canonical copy and don't trip a known risk.

**After you build anything:**
1. **Run the full test suite** ([tests.md](development/tests.md)) and extend the nearest test with your new contract. **But a green suite only proves code *shape*, not that the feature runs or is usable** — most tests are static-source contract tests. **Actually run the thing** (click the flow, hit the endpoint against a live server) before claiming it works, and record the real status in [status.md](development/status.md). *A passing test ≠ working ≠ usable.*
2. **Update the docs that changed:** the relevant [chapter](workspace/), the [feature index](workspace/feature-index.md) if it's a new cross-layer concern, [api-reference](workspace/api-reference.md) if you added an endpoint, [issues.md](development/issues.md) if you found **or fixed** a risk (mark it RESOLVED with evidence — don't delete it), your item's [plan](development/plans/) `**Status:**` line, and [roadmap.md](development/roadmap.md) if you finished or reprioritised an outcome.
3. **Regenerate the reference** if code changed: `node scripts/generate-symbol-reference.mjs` (and the radar one if you touched the catalogue).
4. **Log it in [updates.md](development/updates.md).**

That loop is the whole point: the project can never drift away from its own
documentation, because updating the docs *is* part of finishing the work.

---

## Status snapshot (verified 2026-08-20 — keep current)
- **Pre-launch, solo founder, no real clients** — all test data. Nothing committed to git.
- **2,382 tests passing / 0 failing · `tsc` 0 errors.** That proves code *shape* + pure-logic, **not** that features run or are usable. The honest per-feature reality is in **[status.md](development/status.md)**; the verified record is in **[audits.md](development/audits.md)**.
  - ⚠ **One red observed after that count** (2026-08-20 docs pass): `smoke-dev-tasks-parse.test.ts:65` fails in isolation because it asserts `/BLOCKED on Ed/i` against the marketing plan's "Cohere" phase, which has legitimately become **"✅ Cohere — SHIPPED"**. **The plan is right; the test is stale.** Details and routing in [audits.md](development/audits.md).
- **The three former 🔴 launch blockers are all FIXED** (source-verified 2026-08-20): freelancer preview escalation (`api/auth/preview-as-freelancer/route.ts:49,101` stashes/restores `previewReturnUserId`), finance create-surface idempotency (`agency-finance/src/lib/idempotency.ts`, wired into invoices · plans · operations · expenses · payments · income), and erasure email-in-log (`leads-pipeline/src/server/contacts.ts:168,227,252,279` log an **id**, never an address).
- **RLS is ON in live Supabase** (verified across 14 tables with the public anon key, 2026-08-20). What remains is **engineering, not an Ed decision**: the RLS policies ARE version-controlled — 14 migrations in `aquaCRM/supabase/migrations/`, 13 of them predating 2026-08-20. An earlier note here said there were none; that was wrong, written by looking inside `portal/` only, `brand_enquiries` has no `agency_id`, ~37 service-role refs bypass it — see [rls-enable](development/plans/rls-enable.md).
- **MFA on login is BUILT** — the server gate (`api/auth/login/route.ts:312`, `raisedToSecondFactor` at `:355`) and the login form's code step (`app/login/LoginForm.tsx:197`) both exist, and native form posts carry the code through (`login/route.ts:151`). Phases 3–4 (session assurance, recovery codes) are not built — see [mfa-login](development/plans/mfa-login.md).
- **Real emailed connect codes are SHIPPED** (`lib/server/connectionConfirmation.ts` — 6-digit, HMAC-hashed, 15-min TTL, single-use; `00000` is dev-mode-gated only). A Resend sender is configured and `inspectProductionReadiness()` reports email READY. Only the code-step **browser walk** is unwalked.
- **Standard portal = one Website product**; Aqua Tags setup steps **1, 2, 3 and 6 are done**, step 4 (link the repo) is next, step 5 (seed into the editor) is planned — `agency/fulfilment/_AquaTagsWorkspace.tsx:85-90`.
- **Open decisions** (genuinely Ed's, and only these): **first git commit**, **Aqua Tag form-capture consent**, and whether a "company" is an Agency or a TradingCompany — see [checklist.md](development/checklist.md) and [issues.md](development/issues.md).
- Full current-state detail: **[checklist.md](development/checklist.md)** first, then [WHERE-WE-ARE.md](WHERE-WE-ARE.md) and the [session changelog](workspace/session-changelog-2026-08.md).

---

*This document is the entry point named by `CLAUDE.md`. If you change how the
project is documented, change this page too — it is the one thing everything
else hangs from.*
