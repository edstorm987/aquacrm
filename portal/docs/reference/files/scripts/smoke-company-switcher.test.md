# `scripts/smoke-company-switcher.test.ts`

← [File index](../../files-index.md) · Area: Scripts — scripts/

**What it is:** Company switching — one app, one deploy, several companies.  Ed: "it still runs on one server one app, I just get a company switcher that loads me in, and each of my company websites — if I login it goes to my AquaCRM but as whatever company I am coming from."  A "company" is an AGENCY. Switching is re-minting the session cookie with a different `activeAgencyId`; there is no parallel notion of current company.  The part worth testing is the boundary, not the happy path. This codebase has already shipped one privilege escalation of exactly this shape (the freelancer preview let a manager exit as an owner), so the negative paths below are the point of the file:  • a body `agencyId` is a request, never proof of membership; • a refusal must not reveal whether the agency exists; • a switch may NARROW a session's memberships, never widen them; • a borrowed identity (demo / Dev Mode / preview / showcase) cannot switch; • `?brand=` picks between companies you are already in — it never grants one.  Everything in the "switch endpoint" section drives the real route handler in-process (issueSession + NextRequest), so it fails against behaviour rather than against source text.

_No exported symbols (side-effect / internal module)._

## Depends on (8)

- [`src/app/api/auth/switch-agency/route.ts`](../src/app/api/auth/switch-agency/route.md)
- [`src/lib/brands/authBrand.ts`](../src/lib/brands/authBrand.md)
- [`src/lib/server/auth/auth.ts`](../src/lib/server/auth/auth.md)
- [`src/lib/server/seeds/aquaOasisSeed.ts`](../src/lib/server/seeds/aquaOasisSeed.md)
- [`src/server/storage.ts`](../src/server/storage.md)
- [`src/server/tenants.ts`](../src/server/tenants.md)
- [`src/server/types.ts`](../src/server/types.md)
- [`src/server/users.ts`](../src/server/users.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

