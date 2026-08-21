# `src/lib/chrome/devModeLoadIn.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** Shared key for the Dev Mode cinematic load-in. The switcher / account toggle set this in sessionStorage right before the hard navigation; DevModeLoadIn reads it on arrival and plays the load-in once. sessionStorage survives the same-tab reload, which a signed-cookie swap forces.

## Exports (2)

- `DEV_MODE_LOADIN_KEY`
- `DEV_MODE_LOADIN_WORKSPACE`

## Used by (4)

- [`src/app/portal/dev-team/inspector/InspectorClient.tsx`](../../app/portal/dev-team/inspector/InspectorClient.md)
- [`src/components/chrome/DevConsolePanel.tsx`](../../components/chrome/DevConsolePanel.md)
- [`src/components/chrome/DevModeLoadIn.tsx`](../../components/chrome/DevModeLoadIn.md)
- [`src/components/chrome/DevModeSwitcher.tsx`](../../components/chrome/DevModeSwitcher.md)

