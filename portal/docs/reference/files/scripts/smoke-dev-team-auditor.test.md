# `scripts/smoke-dev-team-auditor.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Dev Team → Auditor smoke — the section that must never mislabel a live problem as closed.  The auditor view is the one screen whose entire job is to surface what a green suite hides. Three ways it was lying, each pinned here:  1. RECENCY — the ✅ RESOLVED banner ledger at the top of audits.md is permanent, carries no position in the timeline, and was closing ANY 🔴 about the same subject, including ones written after it. A regression re-opened next month rendered as "Historical — closed by a later ✅ PASS". 2. TITLES — the auditor's house style puts em-dashes inside the bold label (`**RESOLVED (2026-08-19, auditor — tick 16)**`), so splitting on the first em-dash leaked the label into the headline and swallowed the whole evidence paragraph as the "title" — which also handed the subject matcher a vocabulary wide enough to match almost any related rework. 3. COUNTS — the header pill counted the banner ledger only, so it read a green "All clear" above a red list of unresolved 🔴 rulings.  Plus the layered founder gate on every Dev Team section body, and the fact that launch readiness must be judged on the same inputs Settings uses (env vars AND providers connected through the credential vault).

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

