# `src/built-ins/modules/agency-finance/src/lib/channels.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** The canonical payment channels — the "how the money arrived" axis.  Money always flows client → Ed's own Stripe / bank / cash DIRECTLY. AquaCRM records, surfaces, and reconciles; it NEVER holds or moves funds. Stripe is the automated channel (wired in Phase 3); the rest are recorded + reconciled by hand (manual-first, per the finance plan).  This is the single source for channel identity — labels, whether a channel settles itself, and what its "receipt" reference is called. Both the money-in view and the record forms read it, so a channel is described in exactly one place. Pure data (no runtime imports) so it is safe everywhere; icons live with the renderer, the same way FINANCE_SECTIONS keeps them out of sections.ts.

## Exports (6)

- `type PaymentChannel`
- `interface PaymentChannelMeta (5 members)`
- `PAYMENT_CHANNELS: readonly PaymentChannelMeta[]`
- `normaliseChannel(method: PaymentMethod | null | undefined): PaymentChannel`
- `channelMeta(channel: PaymentChannel): PaymentChannelMeta`
- `channelLabel(method: PaymentMethod | null | undefined): string`

## Depends on (1)

- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](./domain.md)

## Used by (5)

- [`scripts/smoke-finance-channels.test.ts`](../../../../../../scripts/smoke-finance-channels.test.md)
- [`src/app/api/tenants/close-deal/route.ts`](../../../../../app/api/tenants/close-deal/route.md)
- [`src/built-ins/modules/agency-finance/src/components/IncomeSheet.tsx`](../components/IncomeSheet.md)
- [`src/built-ins/modules/agency-finance/src/lib/moneyIn.ts`](./moneyIn.md)
- [`src/lib/server/closeDeal.ts`](../../../../../lib/server/closeDeal.md)

