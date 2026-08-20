# `scripts/smoke-dev-team-portal.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Dev Team portal smoke — the founder-only internal workspace.  Phase 1 (icons) contract: the shared <SidebarNavLink> renders `item.icon` and falls back to a generic dot (`navIcon()` → `Circle`) for ids it doesn't know. The Dev Team ids (working, library, auditor, profiles, editor, updates, exit-dev-team) are NOT in that shared map, so an item without its own `icon` renders as a bare dot — which is exactly what this portal used to do.  Proves: 1. every Dev Team nav item declares its own `icon` (no item may be added without one — the fallback is not acceptable here); 2. each section's sidebar icon is the SAME lucide component that section's own page header uses, so the nav and the page agree; 3. every icon the layout renders is actually imported from lucide-react; 4. no two sections share an icon (each one is distinguishable at a glance, which is the whole point in collapsed mode); 5. the shared SidebarNavLink still prefers `item.icon` over the fallback.

_No exported symbols (side-effect / internal module)._

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

