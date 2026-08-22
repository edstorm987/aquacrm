# `src/lib/integrations/aquaExplorerBridge.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** The Project Explorer's names for the Aqua Tag protocol. This file used to be a SECOND hand-written copy of the message names, the payload shapes and the validators — the tag source had one set of string literals, this had another, and nothing checked that they agreed. That is precisely how the Dev editor ended up listening for a message the tag has never sent. There is now one definition, in `src/engines/editor/editing/aquaTagBridge.ts`, held in agreement with the tag by `scripts/smoke-aqua-tag-bridge.test.ts`. This file keeps the older `AquaExplorer*` spelling so the Project Explorer and its tests carry on working, but it declares nothing of its own. New code should import from the bridge directly. Nothing new should be added here — adding a type here rather than there rebuilds the exact duplication this file was collapsed to remove.

## Exports (13)

- `AQUA_EXPLORER_PROTOCOL_VERSION`
- `AQUA_EXPLORER_MESSAGES`
- `type AquaExplorerCapabilities`
- `type AquaExplorerElement`
- `type AquaExplorerPatch`
- `type AquaExplorerReadyMessage`
- `type AquaExplorerDiagnostics`
- `type AquaExplorerDiagnosticsMessage`
- `type AquaExplorerSelectedMessage`
- `isAquaExplorerReadyMessage(value: unknown): value is AquaExplorerReadyMessage`
- `isAquaExplorerDiagnosticsMessage(value: unknown): value is AquaExplorerDiagnosticsMessage`
- `isAquaExplorerSelectedMessage(value: unknown): value is AquaExplorerSelectedMessage`
- `explorerTargetOrigin(url: string): string`

## Depends on (1)

- [`src/engines/editor/editing/aquaTagBridge.ts`](../../engines/editor/editing/aquaTagBridge.md)

## Used by (2)

- [`scripts/smoke-project-explorer.test.ts`](../../../scripts/smoke-project-explorer.test.md)
- [`src/app/portal/agency/development/projects/[projectId]/_FirstPartyProjectWorkspace.tsx`](../../app/portal/agency/development/projects/[projectId]/_FirstPartyProjectWorkspace.md)

