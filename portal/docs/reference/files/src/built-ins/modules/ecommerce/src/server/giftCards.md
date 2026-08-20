# `src/built-ins/modules/ecommerce/src/server/giftCards.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** Gift cards — server-side, per-install storage.  Lifted from `02 felicias aqua portal work/src/lib/giftCards.ts` and rewired off localStorage onto the plugin's `StoragePort`.

## Exports (2)

- `interface GiftCard (9 members)`
- `class GiftCardService`
    - `constructor(private storage: StoragePort)`
    - `async issue(input: Omit<GiftCard, "code" | "balance" | "createdAt" | "redemptions">): Promise<GiftCard>`
    - `async getCard(code: string): Promise<GiftCard | null>`
    - `async redeem(code: string, amount: number): Promise<{ ok: true; card: GiftCard; applied: number } | { ok: false; reason: string }>`
    - `async refund(code: string, amount: number): Promise<void>`
    - `async listAll(): Promise<GiftCard[]>`

## Depends on (2)

- [`src/built-ins/modules/ecommerce/src/lib/time.ts`](../lib/time.md)
- [`src/built-ins/modules/ecommerce/src/server/ports.ts`](./ports.md)

## Used by (3)

- [`src/built-ins/modules/ecommerce/src/api/handlers.ts`](../api/handlers.md)
- [`src/built-ins/modules/ecommerce/src/server/discounts.ts`](./discounts.md)
- [`src/built-ins/modules/ecommerce/src/server/index.ts`](./index.md)

