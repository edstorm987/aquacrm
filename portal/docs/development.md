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
│   ├── phases.md ........ the roadmap — what's next, in order
│   ├── issues.md ........ known issues, verified findings, risks
│   ├── notes.md ......... decisions & context (the "why")
│   ├── tests.md ......... how to test + what's covered
│   ├── updates.md ....... the running changelog (update after everything)
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
| **[phases.md](development/phases.md)** | _Superseded by roadmap.md._ The old hand-kept queue: what's done, what's next (in priority order), the backlog, and the decisions that are Ed's to make. Pull the top of "Next" unless redirected. Design plans for bigger items live in **[development/plans/](development/plans/)** (e.g. [radar-upgrade.md](development/plans/radar-upgrade.md)). |
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
- **[File-by-file reference](reference/files-index.md)** — **one doc per source file** (1,650 of them, in `reference/files/` mirroring the tree). Each says what the file is, its full API, **what it depends on, and who uses it** — so anything in the app is findable and traceable. This is the omega layer.
- **[Function-by-function symbol map](reference/00-index.md)** — every exported function/class/type in all 1,649 files (6,352 symbols) in a few grep-able files.
- **[Full API reference](workspace/api-reference.md)** — every one of the 175 endpoints (method, purpose, scope, live-data flag).
- **[Every Radar rule](reference/radar-rules.md)** — the complete 2,064-rule enumeration.
- Regenerate all: `node scripts/generate-file-docs.mjs`, `node scripts/generate-symbol-reference.mjs`, `npx tsx scripts/generate-radar-rules-reference.ts`.

---

## The workflow (the law in practice)

**Before you build anything:**
1. Read [goals.md](development/goals.md) (if you don't know the direction) and [phases.md](development/phases.md) (what's actually next).
2. Find the concern in the [file map](WORKSPACE-FILE-TREE.md) / [feature index](workspace/feature-index.md), and search the [symbol reference](reference/00-index.md) for what already exists. **Reuse → repurpose → simplify before adding new.**
3. Check [issues.md](development/issues.md) and [hazards-and-duplication.md](workspace/hazards-and-duplication.md) so you edit the canonical copy and don't trip a known risk.

**After you build anything:**
1. **Run the full test suite** ([tests.md](development/tests.md)) and extend the nearest test with your new contract. **But a green suite only proves code *shape*, not that the feature runs or is usable** — most tests are static-source contract tests. **Actually run the thing** (click the flow, hit the endpoint against a live server) before claiming it works, and record the real status in [status.md](development/status.md). *A passing test ≠ working ≠ usable.*
2. **Update the docs that changed:** the relevant [chapter](workspace/), the [feature index](workspace/feature-index.md) if it's a new cross-layer concern, [api-reference](workspace/api-reference.md) if you added an endpoint, [issues.md](development/issues.md) if you found or fixed a risk, [phases.md](development/phases.md) if you finished or reprioritised a phase.
3. **Regenerate the reference** if code changed: `node scripts/generate-symbol-reference.mjs` (and the radar one if you touched the catalogue).
4. **Log it in [updates.md](development/updates.md).**

That loop is the whole point: the project can never drift away from its own
documentation, because updating the docs *is* part of finishing the work.

---

## Status snapshot (keep current)
- **Pre-launch, solo founder, no real clients** — all test data. Nothing committed to git.
- **~1,419 tests passing, typecheck clean** (last known) — but that proves code *shape* + pure-logic, **not** that features run or are usable. The honest per-feature reality is in **[status.md](development/status.md)** (this doc pass read the code, it did not run the app).
- **Standard portal = one Website product**; Aqua Tags wizard steps 1–3 live (4–6 not built).
- **Open decisions** (Ed's): DB RLS, Aqua Tag form-capture consent, first git commit — see [issues.md](development/issues.md).
- Full current-state detail: [WHERE-WE-ARE.md](WHERE-WE-ARE.md) and the [session changelog](workspace/session-changelog-2026-08.md).

---

*This document is the entry point named by `CLAUDE.md`. If you change how the
project is documented, change this page too — it is the one thing everything
else hangs from.*
