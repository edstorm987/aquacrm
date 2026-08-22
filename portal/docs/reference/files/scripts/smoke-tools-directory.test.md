# `scripts/smoke-tools-directory.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Tools directory completeness smoke.  Ed asked for the agency Tools page to list EVERY agency workspace directory so it works as one scannable launcher ("not all directories are listed, we should get them all in"). The risk this guards is silent omission: a future agency section is added to the sidebar assembly (or a plugin workspace) and nobody remembers to add it here, so it quietly falls out of the directory.  The source of truth is the sidebar assembly (src/lib/chrome/sidebarLayout.ts). This test rebuilds the real agency-owner sidebar and asserts every reachable destination it produces appears on the Tools page — plus the plugin workspaces that the AquaOasis agency override deliberately parks OUT of the sidebar (People records / Email operations / Marketing operations), which are otherwise only reachable from Tools, and the core rows the override also drops (Freelancers). If any of those go missing, this fails.

_No exported symbols (side-effect / internal module)._

## Depends on (4)

- [`src/built-ins/modules/agency-hr/index.ts`](../src/built-ins/modules/agency-hr/index.md)
- [`src/built-ins/modules/agency-marketing/index.ts`](../src/built-ins/modules/agency-marketing/index.md)
- [`src/built-ins/modules/email-sender/index.ts`](../src/built-ins/modules/email-sender/index.md)
- [`src/lib/chrome/sidebarLayout.ts`](../src/lib/chrome/sidebarLayout.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

