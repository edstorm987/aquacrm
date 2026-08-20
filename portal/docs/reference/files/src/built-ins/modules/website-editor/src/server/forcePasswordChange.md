# `src/built-ins/modules/website-editor/src/server/forcePasswordChange.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R007 — Force-password-change registry (editor side).  Persists a per-agency, per-user "must change password on next login" flag. The login flow itself is foundation/T1 territory; the editor surfaces the toggle and the storage layer here so the foundation can `if (getRequirePasswordChange(agencyId, userId))` when wiring the redirect (Q-ASSUMED — see chapter §5).  Storage layout: t/<agencyId>/_agency/website-editor/force-password/<userId> → { setBy, setAt } Agency-wide "force on next login for all users" lives at t/<agencyId>/_agency/website-editor/force-password/_all → { setBy, setAt }

## Exports (7)

- `interface ForcePasswordRecord (2 members)`
- `async getRequirePasswordChange(storage: PluginStorage, agencyId: string, userId: string): Promise<boolean>`
- `async setRequirePasswordChange(storage: PluginStorage, agencyId: string, userId: string, setBy: string): Promise<ForcePasswordRecord>`
- `async clearRequirePasswordChange(storage: PluginStorage, agencyId: string, userId: string): Promise<boolean>`
- `async setRequirePasswordChangeForAgency(storage: PluginStorage, agencyId: string, setBy: string): Promise<ForcePasswordRecord>`
- `async clearRequirePasswordChangeForAgency(storage: PluginStorage, agencyId: string): Promise<boolean>`
- `async listRequirePasswordChangeUsers(storage: PluginStorage, agencyId: string): Promise<{ userId: string; setBy: string; setAt: string }[]>`

## Depends on (1)

- [`src/built-ins/modules/website-editor/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)

## Used by (2)

- [`src/built-ins/modules/website-editor/src/__smoke__/r007-cookie-force-password.test.ts`](../__smoke__/r007-cookie-force-password.test.md)
- [`src/built-ins/modules/website-editor/src/api/handlers/forcePassword.ts`](../api/handlers/forcePassword.md)

