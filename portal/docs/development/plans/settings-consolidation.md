# Settings consolidation — an index, not a second copy of the app

**Horizon:** Next · **Status:** planning · **Size:** S · **Added:** 2026-08-29
· **Source:** Ed, live

> Ed, 2026-08-29: *"we've got a lot of settings all over the place, each
> workspace having their own — I think we should compile them all into the main
> settings as well so we can do either. E.g. Staff instead of saying Freelancer
> access."*

## ⚠ The first version of this plan was mostly wrong — read this first

Written and corrected the same day. The original claimed integrations were
unreachable from Settings and made a "Connections tab" its headline phase. That
was built, and `smoke-company-connections` failed within one suite run:

> **"removes the duplicate Settings integration tab and points work to Company"**

A Settings integrations tab **existed and was deliberately removed.** Company →
Connections is canonical, and Settings, the performance dashboard, project
workspaces and client properties all link to it. The tab was re-added and
reverted the same hour.

Two things follow, and they matter more than the remaining work:

1. **The deep-link tabs are the design, not a defect.** `account`, `freelancer`
   and `launch` being "a paragraph and a button" was read as sprawl. It is the
   hub doing exactly what it says: *"read-mostly info + deep-link buttons…
   reusing the canonical surfaces for real editing."*
2. **A hub that mounts every editor is not a hub — it is a second copy of the
   app**, and the copies drift silently because each looks correct on its own
   screen.

So the honest scope is much smaller than "revamp".

## What is genuinely still worth doing

**Access is spread across five surfaces** — Settings → Roles & access, Settings
→ Team, Settings → Freelancer access, People → Access, and
`/portal/account/permissions`. Some of that is legitimate (a person's own
permissions are not the agency's roles), but three people-shaped tabs in one hub
is the naming problem Ed named.

**Eight module settings pages have no index.** finance, client-crm, affiliates,
agency-hr, agency-marketing, ecommerce, email-sender and memberships each have a
settings page reachable only by navigating into that module. This is the real
*"each workspace having their own"*, and the only genuine gap the sweep found.

## Phase 1 — Modules index

A tab listing every installed module that declares `settings.groups`, each row
linking to that module's own settings page. Derived from the plugin registry so
a new module appears without an edit here.

An INDEX, not a mount — the same rule that the Connections mistake taught. Each
module keeps its own page; Settings gains a way to find them. That is Ed's *"so
we can do either"*, done the way the hub already works.

## Phase 2 — Merge and rename the people tabs

`Team`, `Roles & access` and `Freelancer access` become one **People & access**
tab that links onward to Staff Command, keeping the old ids as aliases the way
`LEGACY_TAB_ALIASES` does for the client workspace, so external links survive.

## What is deliberately NOT done

- **No Connections tab.** Removed on purpose; Company → Connections is canonical.
- **`/portal/clients/[clientId]/settings` stays.** Different tenant scope.
- **No editor is mounted twice.** `smoke-settings-hub` pins this.

## Related

- `scripts/smoke-company-connections.test.ts` — the decision this plan first
  contradicted; read it before proposing any integrations change.
- `src/lib/clients/clientWorkspace.ts` — `LEGACY_TAB_ALIASES`, the proven rename
  pattern for phase 2.
