# `src/lib/chrome/cinematicMode.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Cinematic mode — the USER-FACING name for whether the app's cutscenes and route transitions play.  • Cinematic mode ON  (DEFAULT) → cutscenes & transitions PLAY. • Cinematic mode OFF          → they are skipped for speed.  This replaces the old "Performance mode" toggle, whose stored key (`aqua-performance-mode`, value "1" = SKIP) carried the inverted meaning. The three transition consumers (ClientWorkspaceTransition, CommandCenterTransition, DevModeLoadIn) now ask `cinematicModeEnabled()` and skip when it returns false.  Migration: an existing `aqua-performance-mode` value is honoured on first read — perfMode "1" (was: skip) → cinematic OFF, perfMode "0" → cinematic ON — so anyone who had switched cutscenes off keeps them off. The setter clears the legacy key once a fresh cinematic preference is written.

## Exports (6)

- `CINEMATIC_MODE_STORAGE_KEY`
- `CINEMATIC_MODE_EVENT`
- `LEGACY_PERFORMANCE_MODE_STORAGE_KEY`
- `resolveCinematicPreference(cinematicRaw: string | null, legacyRaw: string | null): boolean`
- `cinematicModeEnabled(): boolean`
- `setCinematicMode(enabled: boolean): void`

## Used by (7)

- [`scripts/smoke-profile-toggles.test.ts`](../../../scripts/smoke-profile-toggles.test.md)
- [`src/components/chrome/ClientWorkspaceTransition.tsx`](../../components/chrome/ClientWorkspaceTransition.md)
- [`src/components/chrome/CommandCenterTransition.tsx`](../../components/chrome/CommandCenterTransition.md)
- [`src/components/chrome/DevModeLoadIn.tsx`](../../components/chrome/DevModeLoadIn.md)
- [`src/components/chrome/DevTeamTransition.tsx`](../../components/chrome/DevTeamTransition.md)
- [`src/components/chrome/ProfileMenu.tsx`](../../components/chrome/ProfileMenu.md)
- [`src/components/editing/EditorModeSwitch.tsx`](../../components/editing/EditorModeSwitch.md)

