# context/ — the orchestration book

**This book exists so we stop relying on the chat context window.** It holds the
*orchestration* layer — how we run AquaCRM development across multiple Claude
chats: one **commander** (orchestrator) + several **worker** chats. Everything an
orchestrator or a worker needs to pick up cold lives here or is linked from here.

> **Two books, two jobs:**
> - **[PRODUCTION-READINESS.md](../development/PRODUCTION-READINESS.md)** = the current launch assessment.
> - **[TODO.md](../development/TODO.md)** = the one current task list.
> - **[development.md](../development.md)** = the build map (plans, todos and code map), not a competing status summary.
> - **context/** (this) = the historical orchestration model and compatibility state used by parts of the Dev Console. It is not current product truth.
>
> A worker reads `development.md` + its assigned plan. The commander reads this
> book + `development.md`. Nothing important lives only in a chat window.

## The model in one line
**You (Ed) spin a commander chat (me). I assign plans to worker chats, track
state, keep the docs current, and coordinate. Workers build one plan each, report
back, and update the docs. State lives in files, so any chat can be re-spun.**

## The book
1. **[orchestration-model.md](orchestration-model.md)** — the commander + workers model: roles, how work flows, and the rules that stop two workers colliding on one repo.
2. **[worker-brief.md](worker-brief.md)** — the paste-ready template to spin a worker chat on a plan, plus the conventions every worker follows.
3. **[auditor-brief.md](auditor-brief.md)** — the paste-ready template for the
   independent auditor that verifies shipped work before it is trusted as done
   (writes verdicts to [audits.md](../development/audits.md)). The recurring loop
   is stopped; audits are currently started on request.
4. **[state.md](state.md)** — a mostly historical orchestration log. No current
   worker ownership should be inferred from its old tables. Its `## Blockers`
   section remains a compatibility input parsed by the Dev Console and is kept
   aligned with the current readiness assessment.
4b. **[next-wave-briefs.md](next-wave-briefs.md)** — paste-ready worker briefs + Ed's launch checklist. ⚠ **Strike a brief out the moment its fix lands**, with the `file:line` that proves it; a stale brief sends a worker to re-break working code.
4c. **[archive/](archive/README.md)** — 🗄 **the history shelf**: finished worker debriefs, superseded "where we stand" summaries, dated session records. Kept for the record, **never current** — nothing here should brief a worker. It has its own index saying what each file was superseded by.
5. **[commander-handoff.md](commander-handoff.md)** — how to re-spin **me** (the commander) with full context, so orchestration survives a fresh chat.

## How to use it (the loop)
- **Ed** → spins a commander (me) with [commander-handoff.md](commander-handoff.md); spins workers when I hand you a [worker-brief](worker-brief.md).
- **Commander (me)** → reads [PRODUCTION-READINESS.md](../development/PRODUCTION-READINESS.md), [TODO.md](../development/TODO.md) and [development.md](../development.md) before using any historical orchestration material.
- **Worker** → reads its brief + `development.md` + its plan → builds it (staged) → runs tests → updates the docs ([updates.md](../development/updates.md), its chapter, ticks the todo) → reports back.
- **Auditor** (on request) → reads `updates.md` − [audits.md](../development/audits.md) → independently verifies an unaudited claim (re-runs the suite, runs the app, checks contracts) → logs a verdict to [audits.md](../development/audits.md). PASS → I mark it done; REWORK → back to the builder.

## The golden rules (so the multi-chat setup doesn't melt down)
1. **One plan owns its files.** Assign non-overlapping areas to avoid two workers editing the same files. Confirm live ownership directly; `state.md` is not current unless explicitly refreshed. `TODO.md` owns tasks and `PRODUCTION-READINESS.md` owns the launch verdict.
2. **State is written, not remembered.** Every assignment, completion, and blocker goes in [state.md](state.md) — never only in a chat.
3. **The development.md discipline still holds** — run the full suite, update the docs after every change, and do not commit, push or deploy without Ed's explicit instruction. Production currently deploys through Railway, not Vercel. (See [development.md](../development.md).)
3b. **The SOURCE is the truth.** A doc records what someone believed the day they wrote it. When a doc and the code disagree, read the code, then fix the doc — never the other way round.
4. **The commander doesn't have to build.** My default job is orchestration; I build only when Ed asks or a task is too small to spin a worker for.
5. **Verify before "done".** A builder's green suite is a claim, not proof. The independent [auditor](auditor-brief.md) confirms it (or sends it back) — and it's read-only on source, so it never collides with a live worker.
