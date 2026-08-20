# `scripts/smoke-dev-console-topbar.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Dev Console in the topbar — the ambient half of the Dev Team workspace.  Ed's ask: don't make me navigate somewhere to record a thought. An icon sits beside Radar and notifications on every page, shows true live status, and captures a finding in place.  Two kinds of coverage here, deliberately: 1. BEHAVIOUR over the real repo — `devConsoleBadge()` / `devConsoleStatus()` compose only from readers that already exist, and every number they report is re-derivable from those readers. A console that invents a number is worse than one that shows nothing. 2. WIRING pins — the gate is server-decided in every layout that mounts a Topbar, the route re-asserts it, and the panel stays lazily loaded (a closed console must cost nothing on a surface that renders everywhere).

_No exported symbols (side-effect / internal module)._

## Depends on (3)

- [`src/lib/server/dev/devConsoleStatus.ts`](../src/lib/server/dev/devConsoleStatus.md)
- [`src/lib/server/dev/devDocs.ts`](../src/lib/server/dev/devDocs.md)
- [`src/lib/server/dev/devTeamFindings.ts`](../src/lib/server/dev/devTeamFindings.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

