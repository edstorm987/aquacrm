# `src/lib/server/advisorSkills.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

_No file-level doc-comment. Purpose inferred from its path (Shared logic — src/lib/) and its exports below._

## Exports (8)

- `listAdvisorSkills(agencyId: string): AdvisorSkill[]`
- `advisorSkillState(agencyId: string)`
- `createAdvisorSkill(input: { agencyId: string; actorUserId: string; name: string; description?: string; recipeId: AdvisorSkillRecipeId; }): AdvisorSkill`
- `setAdvisorSkillEnabled(input: { agencyId: string; actorUserId: string; skillId: string; enabled: boolean; }): AdvisorSkill`
- `deleteAdvisorSkill(input: { agencyId: string; actorUserId: string; skillId: string }): void`
- `resolveAdvisorSkill(agencyId: string, question: string, requestedSkillId?: string): AdvisorSkill`
- `advisorSkillInstruction(skill: AdvisorSkill): string`
- `enabledAdvisorSkillManifest(agencyId: string): string`

## Depends on (4)

- [`src/lib/advisorSkills.ts`](../advisorSkills.md)
- [`src/server/activity.ts`](../../server/activity.md)
- [`src/server/agencySettings.ts`](../../server/agencySettings.md)
- [`src/server/types.ts`](../../server/types.md)

## Used by (3)

- [`src/app/api/assistant/route.ts`](../../app/api/assistant/route.md)
- [`src/app/api/portal/advisor/skills/route.ts`](../../app/api/portal/advisor/skills/route.md)
- [`src/lib/server/openaiAssistant.ts`](./openaiAssistant.md)

