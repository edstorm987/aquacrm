# `src/app/portal/customer/_subroute.tsx`

← [File index](../../../../../files-index.md) · Area: App routes & UI — src/app/

**What it is:** R019 Goal C — shared resolver for foundation customer sub-routes.  Each of /portal/customer/{orders,account,bookings,membership,affiliate} renders this same helper with a distinct config. Behaviour: 1. Resolve the install for `pluginId`. 2. When active + has a canonical customer route → redirect there. 3. When active + no customer surface yet → "coming soon" card. 4. When missing → "not available yet — ask your provider" friendly card.

## Exports (2)

- `interface SubrouteConfig (6 members)`
- `async CustomerSubroute({ cfg }: { cfg: SubrouteConfig })`

## Depends on (3)

- [`src/lib/server/auth/auth.ts`](../../../lib/server/auth/auth.md)
- [`src/server/pluginInstalls.ts`](../../../server/pluginInstalls.md)
- [`src/server/storage.ts`](../../../server/storage.md)

## Used by (3)

- [`src/app/portal/customer/affiliate/page.tsx`](./affiliate/page.md)
- [`src/app/portal/customer/bookings/page.tsx`](./bookings/page.md)
- [`src/app/portal/customer/membership/page.tsx`](./membership/page.md)

