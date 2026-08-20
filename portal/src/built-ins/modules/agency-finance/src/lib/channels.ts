// The canonical payment channels — the "how the money arrived" axis.
//
// Money always flows client → Ed's own Stripe / bank / cash DIRECTLY. AquaCRM
// records, surfaces, and reconciles; it NEVER holds or moves funds. Stripe is
// the automated channel (wired in Phase 3); the rest are recorded + reconciled
// by hand (manual-first, per the finance plan).
//
// This is the single source for channel identity — labels, whether a channel
// settles itself, and what its "receipt" reference is called. Both the money-in
// view and the record forms read it, so a channel is described in exactly one
// place. Pure data (no runtime imports) so it is safe everywhere; icons live
// with the renderer, the same way FINANCE_SECTIONS keeps them out of sections.ts.

import type { PaymentMethod } from "./domain";

export type PaymentChannel = "stripe" | "bank-transfer" | "cash" | "other";

export interface PaymentChannelMeta {
  channel: PaymentChannel;
  label: string;
  // `automated` settles itself (the Stripe webhook, Phase 3); `manual` is
  // recorded + reconciled by hand.
  kind: "automated" | "manual";
  // What the record's reference field holds for this channel — its "receipt".
  referenceLabel: string;
  // One line on how money arrives on this channel.
  blurb: string;
}

// Display + iteration order — Stripe first as the automated one, then the
// manual channels, "Other" last as the catch-all.
export const PAYMENT_CHANNELS: readonly PaymentChannelMeta[] = [
  { channel: "stripe",        label: "Stripe",        kind: "automated", referenceLabel: "Stripe charge ID", blurb: "Card + online payments — settle automatically once Stripe is wired (Phase 3)." },
  { channel: "bank-transfer", label: "Bank transfer", kind: "manual",    referenceLabel: "Bank reference",   blurb: "Client pays into your bank; you reconcile and mark it received." },
  { channel: "cash",          label: "Cash",          kind: "manual",    referenceLabel: "Receipt no.",      blurb: "Cash in hand, recorded against a receipt." },
  { channel: "other",         label: "Other",         kind: "manual",    referenceLabel: "Reference",        blurb: "Any other channel — recorded and reconciled by hand." },
];

const BY_CHANNEL = new Map<PaymentChannel, PaymentChannelMeta>(PAYMENT_CHANNELS.map(meta => [meta.channel, meta]));

// Fold any stored PaymentMethod onto a canonical channel. The legacy "manual"
// value is a recording method, not a real channel, so it maps to "other" —
// as does anything unrecognised (honest catch-all, never a wrong channel).
export function normaliseChannel(method: PaymentMethod | null | undefined): PaymentChannel {
  switch (method) {
    case "stripe": return "stripe";
    case "bank-transfer": return "bank-transfer";
    case "cash": return "cash";
    default: return "other";
  }
}

export function channelMeta(channel: PaymentChannel): PaymentChannelMeta {
  return BY_CHANNEL.get(channel) ?? PAYMENT_CHANNELS[PAYMENT_CHANNELS.length - 1];
}

// The display label for a stored method (normalises first).
export function channelLabel(method: PaymentMethod | null | undefined): string {
  return channelMeta(normaliseChannel(method)).label;
}
