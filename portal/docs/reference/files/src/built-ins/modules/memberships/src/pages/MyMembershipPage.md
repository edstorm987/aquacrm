# `src/built-ins/modules/memberships/src/pages/MyMembershipPage.tsx`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Customer-facing membership page. `panelId: "customer"` so it lands on the end-customer surface T1 R5 builds out.  `props.actor` is the end-customer's userId (the foundation's session cookie carries it). Non-end-customer roles can still hit the URL but the data they see is their own subscription record — agency-side users won't have memberships rows so they get the "become a member" prompt, which is harmless.

## Exports (2)

- `API_BASE`
- `default async MyMembershipPage(props: PluginPageProps)`

## Depends on (3)

- [`src/built-ins/modules/memberships/src/components/MyMembershipPanel.tsx`](../components/MyMembershipPanel.md)
- [`src/built-ins/modules/memberships/src/lib/aquaPluginTypes.ts`](../lib/aquaPluginTypes.md)
- [`src/built-ins/modules/memberships/src/server/foundationAdapter.ts`](../server/foundationAdapter.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

