// The one-button "close the deal" orchestration (existing-client flavour).
//
// In a sale you want ONE action that, in the meeting, produces the whole close:
// a contract, an issued invoice, and a routed payment — stitched and tracked.
// This is the pure orchestration; the route (api/tenants/close-deal) wires the
// real persistence + Stripe, and it's unit-testable with injected deps.
//
// SAFETY: record + route + surface only. The money still flows client → Ed's
// own Stripe/bank/cash directly; the app never holds funds. (Lead → client
// conversion — the leads-pipeline flavour — is a separate, flagged follow-up.)

import "server-only";

import type { AgencyFinanceContainer } from "@/built-ins/modules/agency-finance/src/server";
import type { Currency, Invoice } from "@/built-ins/modules/agency-finance/src/lib/domain";
import type { PaymentChannel } from "@/built-ins/modules/agency-finance/src/lib/channels";
import { deriveRecordId, normaliseIdempotencyKey } from "@/built-ins/modules/agency-finance/src/lib/idempotency";
import type { ClientContract } from "@/lib/clients/clientContracts";

export interface CloseDealInput {
  title: string;
  amountCents: number;
  currency: Currency;
  channel: PaymentChannel;            // stripe | bank-transfer | cash | other
  dueAt: number;
  contractSummary?: string;
  contractBody?: string;
  // One-time key per close intent. A double-clicked / retried close under the
  // same key reuses the first contract + invoice instead of billing twice. A
  // deliberate re-close uses a new key. See lib/idempotency.ts.
  idempotencyKey?: string;
}

export interface CloseDealDeps {
  clientId: string;
  finance: AgencyFinanceContainer;
  existingContracts: ClientContract[];
  // Persist the full contracts list (the route writes it to client.metadata).
  saveContracts: (contracts: ClientContract[]) => void;
  // Generate a Stripe pay-link for the issued invoice — only when the chosen
  // channel is Stripe AND Stripe is configured. Absent otherwise.
  createPayLink?: (invoice: Invoice) => Promise<string>;
  makeId: (prefix: string) => string;
  now: number;
  actor: string;
}

export interface CloseDealResult {
  contract: ClientContract;
  invoice: Invoice;
  channel: PaymentChannel;
  payLink?: string;
  // Plain-English "how the client pays" for this channel — shown after close.
  paymentInstruction: string;
  // True when this call was an accidental resubmit that reused an earlier close
  // (no new contract/invoice/pay-link was created).
  deduped?: boolean;
}

function instructionFor(channel: PaymentChannel, payLink: string | undefined, payLinkFailed: boolean): string {
  if (payLink) return "Send the Stripe pay-link — the client pays by card and it auto-reconciles to paid.";
  if (payLinkFailed) return "Invoice issued, but the Stripe pay-link couldn't be created — check your Stripe setup, then retry or send the invoice and reconcile manually.";
  switch (channel) {
    case "stripe": return "Set up Stripe in Finance settings to generate a card pay-link for this invoice.";
    case "bank-transfer": return "Share your bank details with the invoice; mark it received when it lands.";
    case "cash": return "Cash expected — record it against the invoice when it's in hand.";
    default: return "Record the payment against the invoice when it arrives.";
  }
}

// One action → contract (sent) + invoice (issued) + routed payment.
export async function closeDealForClient(input: CloseDealInput, deps: CloseDealDeps): Promise<CloseDealResult> {
  const title = input.title.trim();
  if (!title) throw new Error("A deal title is required.");
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    throw new Error("The deal amount must be greater than zero.");
  }

  // Idempotency: with a key, the contract + invoice ids are derived from it, so
  // a resubmitted close lands on the same records instead of billing twice.
  const key = normaliseIdempotencyKey(input.idempotencyKey);
  const contractId = key ? deriveRecordId("contract", key) : deps.makeId("contract");

  // Fast path — this exact close already produced its invoice (the billing
  // artifact). Return the first result; create nothing new (no second invoice,
  // no second Stripe pay-link, no duplicate "deal closed" log upstream).
  if (key) {
    const priorInvoice = await deps.finance.invoices.get(deriveRecordId("inv", key));
    const priorContract = deps.existingContracts.find(c => c.id === contractId);
    if (priorInvoice && priorContract) {
      return {
        contract: priorContract,
        invoice: priorInvoice,
        channel: input.channel,
        payLink: undefined,
        paymentInstruction: instructionFor(input.channel, undefined, false),
        deduped: true,
      };
    }
  }

  // 1. Contract — created as "sent" (you agreed it in the meeting). Saved by id
  // (replace-not-append) so a raced resubmit can't leave two copies.
  const contract: ClientContract = {
    id: contractId,
    title,
    summary: input.contractSummary?.trim() || undefined,
    body: input.contractBody?.trim() || undefined,
    status: "sent",
    version: 1,
    createdAt: deps.now,
    updatedAt: deps.now,
    issuedAt: deps.now,
  };
  deps.saveContracts([...deps.existingContracts.filter(c => c.id !== contractId), contract]);

  // 2. Invoice — created then issued (draft → sent), so it can be paid. The key
  // makes the create idempotent: a duplicate close reuses this same invoice.
  const draft = await deps.finance.invoices.create({
    clientId: deps.clientId,
    issuedAt: deps.now,
    dueAt: input.dueAt,
    lineItems: [{ description: title, quantity: 1, unitCents: input.amountCents }],
    currency: input.currency,
    notes: input.contractSummary?.trim() || undefined,
    idempotencyKey: key,
  }, deps.actor);
  const invoice = (await deps.finance.invoices.update(draft.id, { status: "sent" }, deps.actor)) ?? draft;

  // 3. Routed payment — a Stripe pay-link for the online channel; the manual
  // channels record the intent and are reconciled by hand. No custody either way.
  // A pay-link failure is NON-FATAL: the contract + invoice are already created,
  // so the close still succeeds and just tells you the link needs attention.
  let payLink: string | undefined;
  let payLinkFailed = false;
  if (input.channel === "stripe" && deps.createPayLink) {
    try {
      payLink = await deps.createPayLink(invoice);
    } catch {
      payLinkFailed = true;
    }
  }

  return {
    contract,
    invoice,
    channel: input.channel,
    payLink,
    paymentInstruction: instructionFor(input.channel, payLink, payLinkFailed),
  };
}
