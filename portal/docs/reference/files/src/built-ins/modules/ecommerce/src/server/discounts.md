# `src/built-ins/modules/ecommerce/src/server/discounts.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Discount code resolver — server-side, per-install storage.  Lifted from `02 felicias aqua portal work/src/lib/discounts.ts` + `02/.../lib/admin/marketing.ts` (the discount-code slice). Resolver chain: gift card → referral code → static promo → per-install custom code → (R5) membership benefit. The membership step fires from `resolveForUser` and is keyed on userId (not on a code), so it lives alongside the existing code resolver as a separate entry point that the checkout API calls when no explicit code applies.

## Exports (5)

- `type DiscountType`
- `interface AppliedDiscount (5 members)`
- `interface PromoEntry (4 members)`
- `interface CustomDiscountCode (10 members)`
- `class DiscountService`
    - `constructor(private storage: StoragePort, private giftCards: GiftCardService, private referrals: ReferralCodeService, private membershipBenefits?: MembershipBenefitsPort)`
    - `async listCustomCodes(): Promise<CustomDiscountCode[]>`
    - `async getCustomCode(code: string): Promise<CustomDiscountCode | null>`
    - `async upsertCustomCode(code: CustomDiscountCode): Promise<CustomDiscountCode>`
    - `async deleteCustomCode(code: string): Promise<boolean>`
    - `async incrementCustomUse(code: string): Promise<void>`
    - `async resolveCode(rawCode: string, subtotal: number, alreadyApplied: string[]): Promise<{ ok: true; discount: AppliedDiscount; freeShipping?: boolean } | { ok: false; reason: string }>`
    - `async resolveForUser(args: { agencyId: AgencyId; clientId: ClientId; userId: UserId; subtotal: number; alreadyAppliedTypes?: DiscountType[]; }): Promise<AppliedDiscount | null>`

## Depends on (5)

- [`src/built-ins/modules/ecommerce/src/lib/tenancy.ts`](../lib/tenancy.md)
- [`src/built-ins/modules/ecommerce/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/ecommerce/src/server/giftCards.ts`](./giftCards.md)
- [`src/built-ins/modules/ecommerce/src/server/ports.ts`](./ports.md)
- [`src/built-ins/modules/ecommerce/src/server/referralCodes.ts`](./referralCodes.md)

## Used by (5)

- [`src/built-ins/modules/ecommerce/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/ecommerce/src/components/admin/DiscountsEditor.tsx`](../components/admin/DiscountsEditor.md)
- [`src/built-ins/modules/ecommerce/src/lib/admin/marketing.ts`](../lib/admin/marketing.md)
- [`src/built-ins/modules/ecommerce/src/server/index.ts`](./index.md)
- [`src/built-ins/modules/ecommerce/src/server/orders.ts`](./orders.md)

