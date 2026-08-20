# Plan — Advisor omega upgrade

← [todo.md](../todo.md) · [development.md](../../development.md) · reference: [Advisor dossier](../../workspace/advisor.md)

**Status: PLAN — awaiting Ed's vision.** Ed: *"advisor needs omega level upgrade,
we've got too much to do with it."* Big, known, not-yet-specced — this captures
the current state + the directions, to be filled once Ed paints the picture.

## Where we are (verified — [Advisor dossier](../../workspace/advisor.md))
The Advisor is already substantial:
- **8 skill recipes** (executive-radar, lead-triage, client-health, finance-guard, delivery-blockers, reply-drafter, priority-task-proposal, single-task-create) — the only mutating one needs explicit approval.
- **Action suggestions** — a deterministic radar floor + an AI layer (OpenAI, strict schema, max 5); every suggestion needs human acceptance.
- **Context** — skill-scoped business snapshots; external assistant API + MCP tools; custom-AI registry.
- **Model** `gpt-5-mini` via the Responses API, non-streaming, 45s, read-only + propose + human-accept.

So it's honest and safe, but **rigid**: fixed skills, one model, reactive (you ask
→ it answers), no memory/learning of what worked, no proactivity.

## Likely directions for "omega" (needs Ed to pick/paint)
1. **Proactive/agentic** — the Advisor initiates ("3 clients slipping, here's the plan") rather than only answering; scheduled briefings; watches Radar and acts (still human-accept).
2. **Deeper, wider context** — beyond skill-scoped snapshots; cross-business reasoning; more history.
3. **Learning/memory** — remembers decisions, what worked, your preferences; adapts suggestions over time.
4. **More/complex skills** — beyond the 8; multi-step workflows; richer mutations (still gated).
5. **Better actions** — one finding → a full plan of concrete tasks (ties to Radar [issues→actions](radar-upgrade.md)).
6. **Model/interface** — bigger model for hard reasoning; voice; streaming; a real "assistant you talk to".

## Open questions (decide the plan)
- **What's the #1 thing the Advisor should do that it can't?** (be proactive? remember? go deeper? act more?)
- Keep the **read-only + human-accept** safety contract (recommended), or loosen for some agentic actions?
- One flagship upgrade first, or several?

## (To fill once Ed answers) — goals · target shape · phases · reuse · decisions.

## Ties
Radar (its deterministic action floor + [issues→actions](radar-upgrade.md)), the
[KPI overhaul](kpi-intelligence-overhaul.md) (context), client-health (signals).
Keep the guess-then-confirm / human-acceptance contract throughout.

## File map — what this plan owns

_Derived and existence-checked 2026-08-20. This is the collision contract: with Claude and
Codex workers in ONE uncommitted tree, two agents in the same file destroys work and there is
no git to recover from. Before assigning this plan, check these paths against every other
plan in flight._

- `src/lib/advisor/advisorSkills.ts`
- `src/lib/advisor/advisorActions.ts`
- `src/lib/server/assistants/advisorSkillsService.ts`
- `src/lib/server/assistants/advisorSkillContext.ts`
- `src/lib/server/assistants/openaiAssistant.ts`
- `src/app/api/portal/advisor/skills/route.ts`
- `src/app/api/assistant/route.ts`
- `src/app/portal/agency/assistant/AssistantWorkspace.tsx`
- `src/components/chrome/GlobalAdvisorDrawer.tsx`
- `src/server/customAIs.ts`
- `scripts/smoke-advisor-skills.test.ts`
- `scripts/smoke-advisor-actions.test.ts`
- `docs/workspace/advisor.md`
- `docs/development/plans/advisor-omega-upgrade.md`
