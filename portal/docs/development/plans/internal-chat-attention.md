# Plan — Internal chat → owner's "Needs attention"

← [todo.md](../todo.md) · [development.md](../../development.md)

**Status: CODE-COMPLETE (2026-08-19)** — all phases shipped; behavioural +
end-to-end (alert-list) tests green; visual browser walk pending → Commander.
Internal team chat (`TeamChat`, `people.ts`
`peopleChannels`/`peopleMessages`) exists but never surfaces to the **Needs
attention** inbox, and messages have **no read-state and no @mentions** — so a
message meant for the owner can slip by. **Decision (Ed): alert on unread direct
messages + @mentions of the owner.**

## Where we are (verified)
- Chat model: `PeopleChannel` (`team` = everyone · `direct` = 1:1) + `PeopleMessage`
  (author + body + time). No read-tracking, no mentions.
- `operationalAlerts.ts` already emits `people:*` alerts (leave/training) that flow
  into the inbox's **Needs attention** tab automatically (it renders
  `listOperationalAlertViews`). An `/portal/agency/people?view=chat` href routes to
  the **people** destination via the existing special case — so **no new alert
  category** is needed (use `task`).
- All touched files are **free** (Staff + client-health workers complete).

## Phases
1. ✅ **Read-tracking.** Add `peopleChannelReads` (per user+channel `lastReadAt`) to
   state; `markChannelRead()`; mark the active channel read on the team-chat GET
   (and on post, for the author). "Unread" = messages after `lastReadAt` not
   authored by the viewer.
2. ✅ **@mentions.** Add `mentions?: string[]` to `PeopleMessage`; parse `@Name`
   against the agency roster (full + first name, word-bounded) on `postPeopleMessage`.
3. ✅ **Owner attention + alert.** `ownerChatAttention(agencyId)` → unread **direct
   messages to the owner** + unread **@mentions of the owner**. `operationalAlerts`
   pushes one `task`/`in-app` alert (`kind:"in-app"`, `clearsWhen:"open Team chat
   and read"`, href `?view=chat`) when total > 0 — so it appears in Needs attention
   and **clears when the owner reads**.
4. ✅ **Discoverability + visibility.** A composer hint that `@name` notifies
   someone, and **@mentions rendered highlighted** in the chat (`renderBody` in
   `TeamChat.tsx`, mirroring the server's roster match) so a mention reads as a
   mention, not plain text.

## Reuse
`operationalAlerts` people-alert pattern, `teamChatSnapshot`, the people-href
destination routing. No `_MasterInbox` edit (attention tab reads alerts generically).

## Done when (verified)
Owner has unread direct/mention chat → a Needs-attention alert with the count +
a link to Team chat; opening the chat clears it. Behavioural tests on read-state,
mention parsing, and the alert. Full suite green.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/server/people.ts`
- `src/lib/server/operationalAlerts.ts`
- `src/components/people/TeamChat.tsx`
- `src/app/api/portal/team-chat/route.ts`
- `src/server/types.ts`
- `src/server/storage.ts`
- `scripts/smoke-people-workspace.test.ts`
- `scripts/smoke-operational-notifications.test.ts`
- `docs/development/plans/internal-chat-attention.md`
