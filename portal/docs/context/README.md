# context/ — the orchestration book

**This book exists so we stop relying on the chat context window.** It holds the
*orchestration* layer — how we run AquaCRM development across multiple Claude
chats: one **commander** (orchestrator) + several **worker** chats. Everything an
orchestrator or a worker needs to pick up cold lives here or is linked from here.

> **Two books, two jobs:**
> - **[development.md](../development.md)** = *what* to build (the law: plans, todos, the code map). The project.
> - **context/** (this) = *how we run it* (the orchestration: who's doing what, how to spin a worker, the live state). The meta.
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
3. **[auditor-brief.md](auditor-brief.md)** — the paste-ready template for the **looping auditor** that independently verifies shipped work before it's trusted as done (writes verdicts to [audits.md](../development/audits.md)).
4. **[state.md](state.md)** — the **live work log**: what's in flight, who's on what, what's done, what's next. *This is the thing that replaces the context window — keep it current.*
5. **[commander-handoff.md](commander-handoff.md)** — how to re-spin **me** (the commander) with full context, so orchestration survives a fresh chat.

## How to use it (the loop)
- **Ed** → spins a commander (me) with [commander-handoff.md](commander-handoff.md); spins workers when I hand you a [worker-brief](worker-brief.md).
- **Commander (me)** → reads [state.md](state.md) + [development.md](../development.md) → assigns the next plan(s) → writes you a worker brief → updates [state.md](state.md) → tracks progress → keeps everything in sync.
- **Worker** → reads its brief + `development.md` + its plan → builds it (staged) → runs tests → updates the docs ([updates.md](../development/updates.md), its chapter, ticks the todo) → reports back.
- **Auditor** (looping) → each tick reads `updates.md` − [audits.md](../development/audits.md) → independently verifies the oldest unaudited claim (re-runs the suite, runs the app, checks contracts) → logs a verdict to [audits.md](../development/audits.md). PASS → I mark it done; REWORK → back to the builder.

## The golden rules (so the multi-chat setup doesn't melt down)
1. **One plan owns its files.** Assign non-overlapping areas to avoid two workers editing the same files. [state.md](state.md) is the source of truth for who owns what.
2. **State is written, not remembered.** Every assignment, completion, and blocker goes in [state.md](state.md) — never only in a chat.
3. **The development.md discipline still holds** — run the full suite, update the docs after every change, don't commit/deploy without Ed. (See [development.md](../development.md).)
4. **The commander doesn't have to build.** My default job is orchestration; I build only when Ed asks or a task is too small to spin a worker for.
5. **Verify before "done".** A builder's green suite is a claim, not proof. The independent [auditor](auditor-brief.md) confirms it (or sends it back) — and it's read-only on source, so it never collides with a live worker.
