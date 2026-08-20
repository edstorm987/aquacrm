// "Money in across everything" — the unified, channel-grouped view of every
// pound received, whatever route it came in by.
//
// Money-in lives in three shapes today: an invoice Payment, a paid Invoice with
// no separate payment record (settled via `paidVia`), and a non-invoice
// IncomeEntry. They already share the fields this needs, so the money-in view
// normalises all three to `MoneyInRecord` and this pure aggregator groups them
// by channel. Record + surface only — the app never holds the funds.

import type { Currency, PaymentMethod } from "./domain";
import { PAYMENT_CHANNELS, normaliseChannel, type PaymentChannel } from "./channels";

// The minimal shape every money-in record shares. Anything with these fields
// (an IncomeSheet row, a raw Payment, an IncomeEntry) can be summarised.
export interface MoneyInRecord {
  amountCents: number;
  currency: Currency;
  method: PaymentMethod;
  paidAt: number;
}

export interface ChannelMoneyIn {
  channel: PaymentChannel;
  label: string;
  kind: "automated" | "manual";
  // Totals are kept per currency — the app is multi-currency and money is
  // never summed across currencies.
  totalsByCurrency: Array<[string, number]>;
  count: number;
}

export interface MoneyInSummary {
  channels: ChannelMoneyIn[];   // always ALL channels, in catalogue order
  totalCount: number;
}

// Group money-in across every channel. Returns ALL four channels even when a
// channel has nothing — the "across everything" view must never hide a zero,
// only ever say "£0.00 via cash", so the picture is honest and complete.
export function summariseMoneyInByChannel(records: readonly MoneyInRecord[]): MoneyInSummary {
  const totals = new Map<PaymentChannel, Map<string, number>>();
  const counts = new Map<PaymentChannel, number>();
  for (const meta of PAYMENT_CHANNELS) {
    totals.set(meta.channel, new Map());
    counts.set(meta.channel, 0);
  }
  for (const record of records) {
    const channel = normaliseChannel(record.method);
    const byCurrency = totals.get(channel)!;
    byCurrency.set(record.currency, (byCurrency.get(record.currency) ?? 0) + record.amountCents);
    counts.set(channel, (counts.get(channel) ?? 0) + 1);
  }
  const channels: ChannelMoneyIn[] = PAYMENT_CHANNELS.map(meta => ({
    channel: meta.channel,
    label: meta.label,
    kind: meta.kind,
    totalsByCurrency: [...totals.get(meta.channel)!.entries()].sort(([a], [b]) => a.localeCompare(b)),
    count: counts.get(meta.channel) ?? 0,
  }));
  return { channels, totalCount: records.length };
}
