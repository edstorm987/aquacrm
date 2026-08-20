# `src/built-ins/modules/ecommerce/src/lib/admin/marketing.ts`

← [File index](../../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Admin-side discount-code editor types.  Lifted from the discount-code slice of `02 felicias aqua portal work/src/lib/admin/marketing.ts`. The 02 module also carried UTM-attribution + funnel helpers — those belong in a future marketing plugin (see chapter §"Cross-team handoff").

## Exports (3)

- `interface DiscountListFilter (2 members)`
- `filterDiscounts(codes: CustomDiscountCode[], filter: DiscountListFilter): CustomDiscountCode[]`
- `describeDiscount(c: CustomDiscountCode): string`

## Depends on (1)

- [`src/built-ins/modules/ecommerce/src/server/discounts.ts`](../../server/discounts.md)

## Used by (1)

- [`src/built-ins/modules/ecommerce/src/components/admin/DiscountsEditor.tsx`](../../components/admin/DiscountsEditor.md)

