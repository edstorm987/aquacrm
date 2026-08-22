# `src/components/editing/NetworkThrottleControl.tsx`

← [File index](../../../../files-index.md) · Area: Components — src/components/

_No file-level doc-comment. Purpose inferred from its path (Components — src/components/) and its exports below._

## Exports (5)

- `interface ThrottlePreset (4 members)`
- `THROTTLE_PRESETS: ThrottlePreset[]`
- `THROTTLE_SCOPE_NOTE`
- `throttleProfileLabel(profile: AquaTagThrottleProfile | null): string`
- `NetworkThrottleControl({ send, active, onChange, }: { /** DevEditor's `sendToTag`: posts one message to the tagged page, or returns false. */ send: (payload: object) => boolean; /** The profile the TAG confirmed is in force (from `throttle…`

## Depends on (1)

- [`src/engines/editor/editing/aquaTagBridge.ts`](../../engines/editor/editing/aquaTagBridge.md)

## Used by (1)

- [`src/engines/editor/DevEditor.tsx`](../../engines/editor/DevEditor.md)

