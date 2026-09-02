export type CustomerPortalReadPhase = "loading" | "ready" | "unavailable";
export type CustomerPortalSettledReadPhase = Exclude<CustomerPortalReadPhase, "loading">;
export type CustomerPortalReadSource = "invoices" | "messages";
export type CustomerDepositState = "received" | "not-recorded" | "unavailable";

export interface CustomerPortalReadProjection {
  reads?: Partial<Record<CustomerPortalReadSource, CustomerPortalSettledReadPhase>>;
  available: Record<CustomerPortalReadSource, boolean>;
}

/**
 * Resolve the checked-read state and fail closed for pre-migration fixtures.
 * `available` remains as a temporary compatibility projection, not a second
 * source of truth.
 */
export function customerPortalReadPhase(
  data: CustomerPortalReadProjection,
  source: CustomerPortalReadSource,
): CustomerPortalSettledReadPhase {
  const phase = data.reads?.[source];
  if (phase === "ready" || phase === "unavailable") return phase;
  return data.available?.[source] === true ? "ready" : "unavailable";
}

export interface CustomerDepositInvoiceEvidence {
  status: string;
  lineItems: readonly { description: string }[];
}

export function resolveCustomerDepositState(input: {
  durablePaid: boolean;
  invoiceRead: CustomerPortalSettledReadPhase;
  invoices: readonly CustomerDepositInvoiceEvidence[];
}): CustomerDepositState {
  if (input.durablePaid) return "received";
  if (input.invoiceRead !== "ready") return "unavailable";
  return input.invoices.some(invoice =>
    invoice.status === "paid"
    && invoice.lineItems.some(item => /\b(deposit|lock[\s-]?in)\b/i.test(item.description)),
  ) ? "received" : "not-recorded";
}
