# development.md — the law

**This is the master catalogue and build map for AquaCRM. Use it to find the
owning document, and update that document after every change.** The current
answer to “where do we stand?” is [development/TODO.md](development/TODO.md);
source remains authoritative when prose and implementation disagree.
Whether you're an AI or a human, on day one or day one thousand: start here and
you have the whole project. Nothing is lost because everything is written down
and linked from this one place.

> **2026-08-24 documentation scope correction:** the first reconciliation was
> non-security-only. A later read-only review added a live-proven P0 session-
> revocation failure and source-proven P1 showcase/erasure findings. The current
> checklist and issues register supersede the earlier deferral.

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

> **2026-08-26 consolidation:** the founder-facing Dev Docs/Library now exposes
> exactly **20 canonical Markdown volumes**: nine authored subject volumes at
> `docs/00-START-HERE.md` through `docs/08-HISTORY-AND-ARCHIVE.md`, plus the
> eleven generated documents under `docs/reference/`. The nine authored volumes
> contain **all 126 non-reference Markdown sources / 435,282 words**, verbatim,
> with original path and SHA-256 provenance. Runtime-backed plan, finding,
> roadmap, checklist and update fragments remain at their compatibility paths
> for now so consolidation cannot break Dev Team behaviour; they are hidden
> from the Library index, not discarded. Regenerate and verify with
> `node scripts/consolidate-authored-docs.mjs` and
> `scripts/smoke-authored-doc-consolidation.test.ts`.

```
development.md  ← the catalogue (you are here) — the law, tying it all together
│
├── BOOKS (the top-level docs)
│   ├── goals.md ......... why we're building this and what "done" is
│   ├── roadmap.md ....... the roadmap — what's next, in order
│   ├── TODO.md ......... ★ THE ONE TASK LIST — "where do we stand", the only one
│   ├── checklist.md ..... RETIRED 2026-08-31 → merged into TODO.md (kept for history)
│   ├── todo.md .......... RETIRED 2026-08-31 → merged into TODO.md (kept for history)
│   ├── issues.md ........ known issues, verified findings, risks
│   ├── status.md ........ does it actually WORK / can it be USED (≠ "is it coded")
│   ├── notes.md ......... decisions & context (the "why")
│   ├── tests.md ......... how to test + what's covered
│   ├── updates.md ....... ★ THE LOG — every change, newest first (append-only)
│   ├── audits.md ........ the independent auditor's verdicts (what's *verified*)
│   ├── plans/ ........... one phased plan per substantial item (archive/ for shipped)
│   └── WORKSPACE-FILE-TREE.md  ← the map of the code (its own book of books)
│       │
│       ├── CHAPTERS (docs/workspace/) — what each area/subsystem does
│       │   ├── state-layer · shared-logic · portal-ui · api-and-routes
│       │   ├── plugins · components · scripts-config-docs
│       │   ├── feature-index · hazards-and-duplication
│       │   └── DOSSIERS: radar · advisor · kpi-intelligence · aqua-tag · database
│       │
│       └── PAGES (docs/reference/) — the exhaustive, generated detail
│           ├── server/lib/app/built-ins/components/scripts .md  (every function)
│           ├── api-reference (every endpoint)  ← in workspace/
│           └── radar-rules.md  (every one of the 2,064 Radar rules)
│
└── HISTORY (docs/context/archive/) — dated records, kept, never current
    └── superseded summaries · session records · worker debriefs
```

Chapters explain the *mechanism*; pages enumerate *everything*. Look a specific
function or rule up in the pages; understand how it works in the chapters.

### One question, one file

Docs rot when two files claim the same job. These four claims are exclusive — if
you find a second file answering one of them, it is stale and belongs on the
[history shelf](context/archive/README.md).

| Question | The one file | Not anywhere else |
|---|---|---|
| **What changed, and when?** | **[updates.md](development/updates.md)** | It is the log. Append a dated entry after every meaningful change; **never edit an existing entry** — that is the point of a changelog, and the file says so in its own banner. It is also parsed by the Dev Console, so a second log would be invisible as well as redundant. |
| **Where do we stand?** | **[TODO.md](development/TODO.md)** | Five files have answered this over time. `TODO.md` is the only one now — `checklist.md` and `todo.md` were merged into it on 2026-08-31 after they drifted into disagreeing about which issues were done. `scripts/smoke-one-task-list.test.ts` fails if a second list appears. |
| **What systems exist?** | **[CURRENT-IMPLEMENTATION.md](CURRENT-IMPLEMENTATION.md)** | An inventory, not a status report. Status lives in TODO.md. |
| **How do I run it locally?** | **[DEVELOPMENT-HANDOFF.md](DEVELOPMENT-HANDOFF.md)** | Despite the name it is the environment runbook, **not** a session handoff. Session handoffs are dated and archived. |

Everything dated — old summaries, session records, worker debriefs — lives on the
[history shelf](context/archive/README.md) and is never current.

---

## The books

| Book | What it's for |
|---|---|
| **[goals.md](development/goals.md)** | Why AquaCRM exists, who Ed is, the operating model, current strategic goals, and the principles that shape how we build. Read first to understand *what* we're doing. |
| **[roadmap.md](development/roadmap.md)** | **The roadmap — the outer view.** Every outcome that is coming, its horizon (Now / Next / Later / Someday / Shipped), its target date, and the plans that deliver it. Progress is COMPUTED from those plans' phases, never typed. Written and edited from the Dev Console (`/portal/dev-team/roadmap`); this supersedes phases.md. |
| **[TODO.md](development/TODO.md)** | **The one task list.** Blocked-on-Ed first, then P0/P1/P2, each row pointing at its `issues.md` entry for the detail. If you read one thing before working, read this. |
| **[architecture-noobie.md](architecture-noobie.md)** | The whole system explained in **plain English**, no jargon. Start here if you're new (human or agent) and the catalogue below is too dense. |
| **[development/plans/fulfilment-template-system.md](development/plans/fulfilment-template-system.md)** | **The template system** — portal/product templates edited once and seeded into every client instance, owned by Fulfilment (Ed's direction, 2026-08-27). Most of the spine already exists; the new idea is a cross-tenant *origin* template. |
| **[development/plans/dev-editor-finish.md](development/plans/dev-editor-finish.md)** | **Current Dev Editor plan.** The 22 Aug session handoff is preserved on the [history shelf](context/archive/dev-editor-handoff-2026-08-22.md), but it is no longer a current brief. |
| **[context/archive/](context/archive/README.md)** | 🗄 **The history shelf.** Dated records — superseded summaries, session handoffs, worker debriefs — kept because they are the only place some facts survive, and **never current**. `phases.md` (the old roadmap) lives here now. Nothing on this shelf should brief a worker. |
| **[plans/](development/plans/)** | One **phased plan per substantial item** (e.g. [radar-upgrade.md](development/plans/radar-upgrade.md), [mfa-login.md](development/plans/mfa-login.md)). Each plan's own `**Status:**` line is the authority on that item. Shipped plans may be moved to [plans/archive/](development/plans/archive/). |
| **[audits.md](development/audits.md)** | The **independent auditor's verdicts** — the record of what has been *verified*, not just claimed. A 🔴 finding gets a loud banner at the top of that file. Read before trusting a "complete" claim. |
| ~~checklist.md~~ · ~~todo.md~~ | **Retired 2026-08-31** into `TODO.md`. Kept for their written reasoning, which `TODO.md` deliberately does not duplicate. Do not add to them. |
| **[issues.md](development/issues.md)** | Known issues, **verified security/compliance findings** (DB RLS not in repo, Aqua Tag consent, …), duplication, and the live-data hazard. Check before assuming you found a new bug. |
| **[status.md](development/status.md)** | The honest **"does it actually work / can it be used?"** register — kept separate from "is it coded" and "do tests pass". **A passing test ≠ working ≠ usable.** Read before trusting a green suite. |
| **[notes.md](development/notes.md)** | Durable decisions and non-obvious context — the "why", so nothing is re-litigated or re-tripped-over. |
| **[tests.md](development/tests.md)** | The canonical full-suite command, the test convention, the gotchas, and where coverage lives. **Run the full suite before calling a change done.** |
| **[updates.md](development/updates.md)** | The running changelog — every meaningful change, newest first. **This is the memory. Add to it after every change.** |
| **[compliance/erasure-dpo-pack.md](compliance/erasure-dpo-pack.md)** | The **DPO / solicitor review pack** for right-to-erasure: what the system actually does when a client is erased, per data category, what is proven by test vs. unverified, the limits of that evidence, and the **8 decisions we need a DPO to rule on**. Hand this to a reviewer; update it whenever erasure behaviour changes. |
| **[WORKSPACE-FILE-TREE.md](WORKSPACE-FILE-TREE.md)** | The map of the code: every file and what it does, its chapters (`docs/workspace/`) and its generated reference pages (`docs/reference/`). This is where "where does X live?" is answered. |
| **[PRODUCT-ARCHITECTURE.md](PRODUCT-ARCHITECTURE.md)** | The **product** shape — engines, modules, workspaces, surfaces and how they compose. `CLAUDE.md` names this required reading. |
| **[DEVELOPMENT-HANDOFF.md](DEVELOPMENT-HANDOFF.md)** | The **environment runbook** — repo layout, ports, persistence, backends. How to run it, not what changed. |
| **[portal-tiers-and-fractal-fulfilment.md](portal-tiers-and-fractal-fulfilment.md)** | The portal tier model and the fractal-fulfilment idea — why a client portal and an agency portal are the same shape at different scales. |
| **[meta-master-inbox.md](meta-master-inbox.md)** | The master-inbox concept — one place every inbound signal lands, across channels. |
| **[zimante-brand-architecture.md](zimante-brand-architecture.md)** | Brand architecture for Zimante — naming, positioning and how the brands relate. |
| **[development-workspace-cleanup.md](development-workspace-cleanup.md)** | The six workspace roots `scanWorkspace` walks behind the live `catalogue:development` npm script — the only human documentation of what that script actually sees. |

### The subsystem dossiers (verified, deep)
Inside the file-map's chapters, these five are read-from-source deep dives —
reach for them when working on that system:
[Radar](workspace/radar.md) · [Advisor & AI](workspace/advisor.md) ·
[KPI & Intelligence](workspace/kpi-intelligence.md) ·
[Aqua Tag](workspace/aqua-tag.md) · [Database](workspace/database.md).

### The generated reference pages (exhaustive, consolidated)
- **[Source-file index](reference/files-index.md)** — every source path linked to its anchored entry inside one of eight large area volumes. Each entry retains purpose, full exported API, **what it depends on and who uses it** without creating thousands of tiny Markdown files.
- **[Consolidated source/symbol map](reference/00-index.md)** — every source file and exported symbol across `src/` and `scripts/`, held in eight grep-able volumes plus the master index. Current generated count: **2,163 files / 7,557 symbols** after this documentation consolidation.
- **[Full API reference](workspace/api-reference.md)** — every route file (**201**: 192 under `api/**` + 9 top-level) with method, purpose, scope, live-data flag. ⚠ **Hand-maintained — nothing generates or verifies it**; last reconciled 2026-08-20.
- **[Every Radar rule](reference/radar-rules.md)** — the complete 2,064-rule enumeration.
- Regenerate all: `node scripts/generate-symbol-reference.mjs`, then `npx tsx scripts/generate-radar-rules-reference.ts` when Radar changes. The legacy `generate-file-docs.mjs` command remains as a compatibility alias for the unified source-reference generator.
  The unified generator rewrites every volume and removes the retired
  `docs/reference/files/` stub tree, so moved/deleted source paths cannot survive
  as orphaned per-file pages.

### The authored documentation volumes (complete, consolidated)

- **[Start here](00-START-HERE.md)** — catalogues, runbooks and entry instructions.
- **[Product and architecture](01-PRODUCT-AND-ARCHITECTURE.md)** — product shape,
  portals, brand architecture and plain-English explanations.
- **[Current state and work](02-CURRENT-STATE-AND-WORK.md)** — checklist, status,
  roadmap, goals, decisions and queue.
- **[Issues, audits and tests](03-ISSUES-AUDITS-AND-TESTS.md)** — findings,
  independent reviews, browser audits and test evidence.
- **[Development plans](04-DEVELOPMENT-PLANS.md)** — every plan and handoff.
- **[Workspace engineering](05-WORKSPACE-ENGINEERING.md)** — maps, dossiers,
  routes, state, components and module notes.
- **[Dev Team operations](06-DEV-TEAM-OPERATIONS.md)** — orchestration, briefs and
  live operational state.
- **[Integrations, compliance and brands](07-INTEGRATIONS-COMPLIANCE-AND-BRANDS.md)**.
- **[History and archive](08-HISTORY-AND-ARCHIVE.md)** — changelog, dated handoffs
  and superseded summaries.

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
1. Read [TODO.md](development/TODO.md) (where we actually stand), then [goals.md](development/goals.md) (if you don't know the direction) and [roadmap.md](development/roadmap.md) (what's actually next). **Nothing in [context/archive/](context/archive/README.md)** — that shelf is history.
2. Find the concern in the [file map](WORKSPACE-FILE-TREE.md) / [feature index](workspace/feature-index.md), and search the [symbol reference](reference/00-index.md) for what already exists. **Reuse → repurpose → simplify before adding new.**
3. Check [issues.md](development/issues.md) and [hazards-and-duplication.md](workspace/hazards-and-duplication.md) so you edit the canonical copy and don't trip a known risk.

**After you build anything:**
1. **Run the full test suite** ([tests.md](development/tests.md)) and extend the nearest test with your new contract. **But a green suite only proves code *shape*, not that the feature runs or is usable** — most tests are static-source contract tests. **Actually run the thing** (click the flow, hit the endpoint against a live server) before claiming it works, and record the real status in [status.md](development/status.md). *A passing test ≠ working ≠ usable.*
2. **Update the docs that changed:** the relevant [chapter](workspace/), the [feature index](workspace/feature-index.md) if it's a new cross-layer concern, [api-reference](workspace/api-reference.md) if you added an endpoint, [issues.md](development/issues.md) if you found **or fixed** a risk (mark it RESOLVED with evidence — don't delete it), your item's [plan](development/plans/) `**Status:**` line, and [roadmap.md](development/roadmap.md) if you finished or reprioritised an outcome.
3. **Regenerate the reference** if code changed:
   `node scripts/generate-symbol-reference.mjs` (and the Radar generator if you
   touched the catalogue). It rewrites the eight consolidated volumes, rebuilds
   the master file index and removes the retired per-source stub tree.
4. **Log it in [updates.md](development/updates.md).**

That loop is the whole point: the project can never drift away from its own
documentation, because updating the docs *is* part of finishing the work.

---

## Status snapshot (current P0/P1 refresh 2026-08-24)
- **Pre-launch, solo founder, clients waiting for onboarding.** Do not assume all
  records are disposable: file-backed state and configured live Supabase tables
  are separate concerns.
- **Last documented whole-suite run: 3,621 passing / 0 failing / 1 skipped;
  `tsc` clean** (2026-08-23). The skip is the live Postgres check without
  `DATABASE_URL`; this 2026-08-24 docs pass did not rerun the whole suite. A green
  suite proves substantial shape and logic coverage, not complete usability. The
  honest per-feature reality is in **[status.md](development/status.md)**; the
  verified record is in **[audits.md](development/audits.md)**.
- **P0 session revocation: RESOLVED 2026-08-27.** Every authenticated cookie
  read now crosses one central fresh-session boundary (`resolveFreshSessionUser`
  in `auth.ts`) enforcing existence, `sessionRev`, current role and live
  membership; the stale-owner-cookie exploit replay returns 403 with no token
  (`smoke-session-revocation`, 16/16). ⚠ The same day's whole-suite reruns show
  **the full suite is NOT currently green** (~74 pre-existing failures on the
  current tree) — see the truth note at the top of
  [TODO.md](development/TODO.md).
- **P1:** showcase GET/OAuth mutations bypass the read-only proxy assumption;
  erasure can report live failures as success, strand retry and retain the client
  name in its audit; Editor AI's database coordination remains incomplete;
  editor transitions/prefill and staff capability policy remain uneven.
- **Other reliability queue:** file persistence/corrupt-state recovery, invalid
  client references, truthful website empty states, read-path performance and
  critical browser journeys. The exact order is
  [TODO.md](development/TODO.md).
- **The three former 🔴 launch blockers are all FIXED** (source-verified 2026-08-20): freelancer preview escalation (`api/auth/preview-as-freelancer/route.ts:49,101` stashes/restores `previewReturnUserId`), finance create-surface idempotency (`agency-finance/src/lib/idempotency.ts`, wired into invoices · plans · operations · expenses · payments · income), and erasure email-in-log (`leads-pipeline/src/server/contacts.ts:168,227,252,279` log an **id**, never an address).
- **RLS is ON in live Supabase** (verified across 14 tables with the public anon key, 2026-08-20). What remains is **engineering, not an Ed decision**: the RLS policies ARE version-controlled — 14 migrations in `aquaCRM/supabase/migrations/`, 13 of them predating 2026-08-20. An earlier note here said there were none; that was wrong, written by looking inside `portal/` only, `brand_enquiries` has no `agency_id`, ~37 service-role refs bypass it — see [rls-enable](development/plans/rls-enable.md).
- **MFA on login is BUILT — all four phases** (verified 2026-08-21). The server gate is `api/auth/login/route.ts:320` (`loginMfaStep`), session assurance is `raisedToSecondFactor` at `:399`, and RECOVERY CODES are built too: `consumeRecoveryCode` (`lib/server/auth/mfa.ts:500`) called from the `check-recovery` branch (`login/route.ts:338,353,358`), with the login form's code step at `app/login/LoginForm.tsx:253-272`. Native form posts carry the code through (`login/route.ts:151`). See [mfa-login](development/plans/mfa-login.md) for what genuinely remains.
- **Real emailed connect codes are SHIPPED** (`lib/server/connectionConfirmation.ts` — 6-digit, HMAC-hashed, 15-min TTL, single-use; `00000` is dev-mode-gated only). A Resend sender is configured and `inspectProductionReadiness()` reports email READY. Only the code-step **browser walk** is unwalked.
- **Standard portal = one Website product**; Aqua Tags setup steps **1, 2, 3 and 6 are done**, step 4 (link the repo) is next, step 5 (seed into the editor) is planned — `agency/fulfilment/_AquaTagsWorkspace.tsx:85-90`.
- **Open decisions** (genuinely Ed's): **Aqua Tag form-capture consent**, and **when to merge `work/2026-08-20-parallel-session` to `main`** (the merge is what deploys production). The first commit is DONE, and Agency-vs-TradingCompany was SETTLED — the three-tier model is stated in code at `src/app/api/portal/agency/companies/[companyId]/portal/route.ts:24-29`. See [TODO.md](development/TODO.md) and [issues.md](development/issues.md).
- **The DEV EDITOR is the one editor** (2026-08-21). There is no separate portal
  editor, website editor or code editor any more: one surface that adapts to
  what it is pointed at. `/portal/dev-team/editor` is the PROJECTS workspace
  (add / configure / disconnect, then "Open editor"); the editor itself is
  `./studio?project=<id>` and exiting returns to the list.
  - **Real editing**: CodeMirror 6 with the genuine VS Code Dark+ theme and
    language grammars; file-type icon tints; multiple files open at once with
    per-file buffers; session resume per project.
  - **Reading was broken and is fixed**: `readable` and `editable` were the same
    question, so anything outside a narrow web-stack list rendered BLANK. Now
    ~50 extensions plus extensionless names, big files read (truncation
    flagged), images preview, and only genuine binaries refuse — with a reason.
  - **Writing exists and is hardened.** An adversarial review found five real
    defects, all fixed and pinned in `smoke-editor-write-path` (21 tests):
    a TOCTOU race where two saves both won, a truncate-in-place write that
    destroyed files on failure, a fingerprint not bound to its path (this repo
    has byte-identical files), `.data/` being writable, and a symlink escape.
    Creating files and folders goes through the same guards.
  - **Presence** marks files that moved under you, reusing the Dev Team's
    existing check-ins + mtime scan. Advisory; the fingerprint is the real guard.
  - **Aqua Editor AI** has a dedicated project-scoped provider/configuration and
    history path. It proposes; a person applies. Stored replay and same-process
    dedup exist, but its cross-instance claim/RPC/database coordination is
    incomplete and must not be called production-wide single execution.
  - **PR management**: the engine commits to a branch, then `openPullRequest()`
    and `mergePullRequest()` — two steps on purpose, so a preview exists before
    anything reaches main.
  - Plans: [dev-editor-checklist](development/plans/dev-editor-checklist.md) (what
    is left, including the funnel/client-side convergence as its Phase 6) and
    [dev-editor-inspector](development/plans/dev-editor-inspector.md).
    *(A separate `super-editor.md` convergence map was referenced from three
    places but never written — the checklist's Phase 6 is the record.)*
- **`src/engines/` is real**: `editor/`, `sop/`, `data/` (Radar + KPI) all moved
  in, imports rewritten, suite-guarded — see [STRUCTURE](development/STRUCTURE.md).
- **IA v2**: Operations and Tools are single flat sidebar rows onto hub pages;
  pinned pages (topbar or sidebar) ship as chrome.
- Full current-state detail: **[TODO.md](development/TODO.md)** — the *only* live task list. `checklist.md` and `todo.md` were merged into it on 2026-08-31; older competitors are on the [history shelf](context/archive/README.md).

---

*This document is the entry point named by `CLAUDE.md`. If you change how the
project is documented, change this page too — it is the one thing everything
else hangs from.*
