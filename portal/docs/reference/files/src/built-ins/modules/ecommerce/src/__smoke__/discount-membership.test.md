# `src/built-ins/modules/ecommerce/src/__smoke__/discount-membership.test.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** R5 — ecommerce ↔ memberships discount integration smoke.  Covers DiscountService.resolveForUser. Mocks all four ports + a MembershipBenefitsPort, walks the discount path with and without the port wired, and asserts the AppliedDiscount + persisted order shape.  Run from `04-the-final-portal/plugins/ecommerce/`: npm run smoke

_No exported symbols (side-effect / internal module)._

## Depends on (3)

- [`src/built-ins/modules/ecommerce/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/ecommerce/src/server/index.ts`](../server/index.md)
- [`src/built-ins/modules/ecommerce/src/server/ports.ts`](../server/ports.md)

## Used by

_No internal importers found (an entry point — route/page/test/script — or dynamically loaded)._

