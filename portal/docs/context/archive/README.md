# archive/ — the history shelf

← [context/](../README.md) · [development.md](../../development.md) (the law)

**Everything in this folder was true on the day it was written, and is kept for
exactly that reason.** Nothing here is current. Nothing here should be used to
brief a worker, and no claim in it should be acted on without re-checking the
source.

> **Why archive instead of delete?** A dated record is the only place some facts
> survive — why a thing was built the way it was, what broke on the way, an
> archive tarball's checksum, a production prerequisite nobody has hit yet. We
> lose those permanently if we delete, and we lose nothing by shelving them.
> **The rule is: archive dated records, never delete them.**

## Where to look instead

| If you want… | Read |
|---|---|
| **Where we stand right now** | **[checklist.md](../../development/checklist.md)** — the one answer. |
| **What changed, and when** | **[updates.md](../../development/updates.md)** — the one log, newest first, append-only. |
| What systems exist | [CURRENT-IMPLEMENTATION.md](../../CURRENT-IMPLEMENTATION.md) |
| What is coming | [roadmap.md](../../development/roadmap.md) |
| Whether a claim was verified | [audits.md](../../development/audits.md) |
| Whether a feature actually works | [status.md](../../development/status.md) |
| Local setup, commands, persistence | [DEVELOPMENT-HANDOFF.md](../../DEVELOPMENT-HANDOFF.md) |
| Who is working on what | [state.md](../state.md) |

## What is on the shelf

**Superseded "where we stand" files** — there used to be three of these competing
with `checklist.md`. Now there are none.
- [WHERE-WE-ARE-2026-08-18.md](WHERE-WE-ARE-2026-08-18.md) — the 18 Aug full read-through.
- [WHERE-WE-STAND-2026-08-20.md](WHERE-WE-STAND-2026-08-20.md) — the 20 Aug session record.

**Dated session records** — these are session handoffs, *not* the environment
runbook. That is [DEVELOPMENT-HANDOFF.md](../../DEVELOPMENT-HANDOFF.md), which is live.
- [session-handoff-2026-08-18.md](session-handoff-2026-08-18.md)
- [session-handoff-2026-08-19.md](session-handoff-2026-08-19.md)
- [session-changelog-2026-08.md](session-changelog-2026-08.md) — the 18–19 Aug narrative.

**Superseded planning**
- [phases.md](phases.md) — the old roadmap, superseded by [roadmap.md](../../development/roadmap.md).
- [website-editor-and-migration.md](website-editor-and-migration.md) — design notes overtaken by the shipped Dev Editor; kept for the rationale.

**Worker debriefs** — the honest "what broke and why" records. Each one's *plan*
is the authority on status; the debrief is the story.
- [connect-flow-real-codes-handoff.md](connect-flow-real-codes-handoff.md)
- [erasure-worker-handoff.md](erasure-worker-handoff.md)
- [finance-command-surface-handoff.md](finance-command-surface-handoff.md)
- [handoff-inbox-chat-2026-08-19.md](handoff-inbox-chat-2026-08-19.md)
- [kpi-worker-handoff.md](kpi-worker-handoff.md)
- [radar-handoff.md](radar-handoff.md) — the complete Radar pick-up read.
- [radar-update-notes.md](radar-update-notes.md) — a subset of the above.
- [staff-worker-handoff.md](staff-worker-handoff.md)

## Adding to the shelf

1. Move the file here. Keep its existing banner and prose **intact** — annotate,
   never overwrite. Rewriting history to match the present is how a record stops
   being worth reading.
2. Add a `> 🗄 **ARCHIVED <date>.**` line under its H1 saying what superseded it.
3. Fix the relative links (this folder is three deep: `../../` reaches `docs/`).
4. Repoint anything that still linked to it, and list it above.

**Do not archive a *plan* here.** Shipped plans go to
[development/plans/archive/](../../development/plans/archive/) instead — the
roadmap resolves plan names in that folder, and it would not find them here.
