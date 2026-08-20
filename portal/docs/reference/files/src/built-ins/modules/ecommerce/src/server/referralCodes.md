# `src/built-ins/modules/ecommerce/src/server/referralCodes.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Per-user referral DISCOUNT CODE store, server-side.  Lifted from `02 felicias aqua portal work/src/lib/referralCodes.ts` and rewired off localStorage onto the plugin's `StoragePort`.

## Exports (2)

- `interface ReferralCode (4 members)`
- `class ReferralCodeService`
    - `constructor(private storage: StoragePort)`
    - `async getOrCreateForUser(email: string): Promise<ReferralCode>`
    - `async findCode(code: string): Promise<ReferralCode | null>`
    - `async incrementUse(code: string): Promise<void>`

## Depends on (2)

- [`src/built-ins/modules/ecommerce/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/ecommerce/src/server/ports.ts`](./ports.md)

## Used by (2)

- [`src/built-ins/modules/ecommerce/src/server/discounts.ts`](./discounts.md)
- [`src/built-ins/modules/ecommerce/src/server/index.ts`](./index.md)

