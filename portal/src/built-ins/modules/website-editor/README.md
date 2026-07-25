# @aqua/plugin-website-editor

Visual page builder + 58-block library + portal-variant admin for the
Aqua portal. Owned by Terminal 3 of the Round-1 mesh.

## Manifest summary

| Field | Value |
|---|---|
| `id` | `website-editor` |
| `category` | `content` |
| `core` | (no — every client gets it auto-installed by foundation) |
| `requires` | none |
| `navItems` | 8 (Editor / Pages / Portals / Customise / Themes / Assets / Sections / Popups) |
| `pages` | 11 admin routes (full list in `01 development/context/prior research/04-plugin-website-editor.md`) |
| `api` | ~30 handlers under `/api/portal/website-editor/*` |
| `storefront.blocks` | 58 blocks across 6 categories |
| `features` | 8 toggles (simpleEditor, advancedEditor, codeView, templates, versionHistory, customCSS, headInjection, customDomain) |

## What this plugin owns

- **Editor surface** — the Live/Block/Code visual editor with Simple/Full/Pro complexity tiers.
- **58 blocks** — layout (7), content (14), media (7), commerce (11), auth (5), advanced (8), plus 6 internal canvas helpers. See `aqua-blocks.md` for the full table.
- **Portal-variant admin** — Login / Affiliates / Orders / Account tabs that manage `EditorPage` rows scoped by `portalRole` with singleton-enforced `isActivePortal` per `(siteId, role)`.
- **Storefront overlay** — `PortalEditOverlay`, `PortalPageRenderer`, `PreviewBar`, `SiteHead` (meta only), `EditorThemeInjector`.

## Public API surface

`@aqua/plugin-website-editor` exports:

- `default` — the `AquaPlugin` manifest (registered by foundation).
- `./server` — `applyStarterVariant`, `listVariantsForPortal`, `getActivePortalVariant`, `setActivePortalVariant`. T2's fulfillment plugin calls these from phase transitions.
- `./types` — `AquaPlugin`, `PortalRole`, `Block`, `EditorPage`, `Site`, `ThemeRecord`, etc.
- `./components` — `BlockRenderer`, `PortalPageRenderer`, the 58 block components (post step 5).

## `applyStarterVariant` contract

```ts
import { applyStarterVariant } from "@aqua/plugin-website-editor/server";

await applyStarterVariant(
  {
    agencyId: "agency_abc",
    clientId: "client_xyz",
    role: "login", // PortalRole — see contract note below
    variantId: "login-default",
    actor: "user_123", // optional, for activity log
  },
  ctx.storage,
);
// → { ok: true, variantId, pageId, siteId } | { ok: false, error }
```

### Contract note: `role` parameter type

T2's `plugins/fulfillment/src/server/ports.ts:204` types
`PortalVariantPort.applyStarterVariant.role: Role` (the user role —
`"agency-owner" | "client-owner" | …`). The semantically correct type is
`PortalRole` (`"login" | "affiliates" | "orders" | "account"`).

T3 implements with `PortalRole`. Once integrated, T2 swaps:

```ts
import type { PortalRole } from "@aqua/plugin-website-editor/types";
```

This is a one-line refactor T2 owns post-merge.

## Folder layout

```
plugins/website-editor/
├── package.json                # @aqua/plugin-website-editor
├── tsconfig.json               # strict ES2022, @plugin/* alias
├── README.md                   # this file
├── index.ts                    # default-exports the AquaPlugin manifest
└── src/
    ├── lib/                    # vendored AquaPlugin contract, tenancy, ids, portalRole
    ├── types/                  # Block, EditorPage, Site, ThemeRecord, content
    ├── server/                 # ports + portalVariants + (step 6) pages/themes/content/preview/etc.
    ├── api/                    # (step 8) PluginApiRoute[] + handlers
    ├── pages/                  # (step 9) admin page components mounted via PluginPage[]
    ├── components/             # (steps 3–5) editor + 58 blocks + storefront overlay
    ├── starters/               # (step 12) JSON starter trees, one per variantId
    └── __smoke__/              # (step 13) imports every block to force module evaluation
```

## Verification

```sh
cd "04-the-final-portal/plugins/website-editor"
npm install
npm run typecheck           # tsc --noEmit
npm test                    # blocks smoke
```

## Round 1 status

See `01 development/messages/terminal-3/to-orchestrator.md` for live
progress. Track per-step commits in `git log --oneline -- "04-the-final-portal/plugins/website-editor"`.
