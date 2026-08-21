# `src/components/chrome/pinnedTabsStore.ts`

← [File index](../../../../files-index.md) · Area: Components — src/components/

_No file-level doc-comment. Purpose inferred from its path (Components — src/components/) and its exports below._

## Exports (12)

- `type PinLocation`
- `interface PinnedTab (3 members)`
- `MAX_PINS_PER_LOCATION`
- `findPin(pins: PinnedTab[], href: string): PinnedTab | undefined`
- `isPinned(pins: PinnedTab[], href: string): boolean`
- `pinsAt(pins: PinnedTab[], location: PinLocation): PinnedTab[]`
- `setPin(pins: PinnedTab[], entry: { href: string; label: string }, location: PinLocation): PinnedTab[]`
- `removePin(pins: PinnedTab[], href: string): PinnedTab[]`
- `togglePin(pins: PinnedTab[], entry: { href: string; label: string }, location: PinLocation): PinnedTab[]`
- `clearAll(): PinnedTab[]`
- `normalizePins(value: unknown): PinnedTab[]`
- `usePinnedTabs(): { pins: PinnedTab[]; pin: (entry: { href: string; label: string }, location: PinLocation) => void; toggle: (entry: { href: string; label: string }, location: PinLocation) => void; remove: (href: string) => void; clear: () …`

## Used by (2)

- [`scripts/smoke-pinned-tabs.test.ts`](../../../scripts/smoke-pinned-tabs.test.md)
- [`src/components/chrome/PinnedTabs.tsx`](./PinnedTabs.md)

