# `src/built-ins/modules/agency-finance/src/lib/moneyIn.ts`

← [File index](../../../../../../../files-index.md) · Area: Plugins — src/built-ins/

**What it is:** "Money in across everything" — the unified, channel-grouped view of every pound received, whatever route it came in by.  Money-in lives in three shapes today: an invoice Payment, a paid Invoice with no separate payment record (settled via `paidVia`), and a non-invoice IncomeEntry. They already share the fields this needs, so the money-in view normalises all three to `MoneyInRecord` and this pure aggregator groups them by channel. Record + surface only — the app never holds the funds.

## Exports (4)

- `interface MoneyInRecord (4 members)`
- `interface ChannelMoneyIn (5 members)`
- `interface MoneyInSummary (2 members)`
- `summariseMoneyInByChannel(records: readonly MoneyInRecord[]): MoneyInSummary`

## Depends on (2)

- [`src/built-ins/modules/agency-finance/src/lib/channels.ts`](./channels.md)
- [`src/built-ins/modules/agency-finance/src/lib/domain.ts`](./domain.md)

## Used by (2)

- [`scripts/smoke-finance-channels.test.ts`](../../../../../../scripts/smoke-finance-channels.test.md)
- [`src/built-ins/modules/agency-finance/src/components/IncomeSheet.tsx`](../components/IncomeSheet.md)

