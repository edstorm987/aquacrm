import type { Invoice, InvoiceStatus, Payment, Refund } from "./domain";

export const COLLECTIBLE_INVOICE_STATUSES = ["sent", "overdue", "partially-refunded"] as const satisfies readonly InvoiceStatus[];

export function isCollectibleInvoiceStatus(status: InvoiceStatus): boolean {
  return (COLLECTIBLE_INVOICE_STATUSES as readonly InvoiceStatus[]).includes(status);
}

export function invoicePaidCents(invoiceId: string, payments: readonly Payment[]): number {
  return payments
    .filter(payment => payment.invoiceId === invoiceId)
    .reduce((sum, payment) => sum + payment.amountCents, 0);
}

export function invoiceRefundedCents(invoiceId: string, refunds: readonly Refund[]): number {
  return refunds
    .filter(refund => refund.invoiceId === invoiceId)
    .reduce((sum, refund) => sum + refund.amountCents, 0);
}

export function invoiceNetPaidCents(invoiceId: string, payments: readonly Payment[], refunds: readonly Refund[] = []): number {
  return Math.max(0, invoicePaidCents(invoiceId, payments) - invoiceRefundedCents(invoiceId, refunds));
}

export function invoiceOutstandingCents(invoice: Invoice, payments: readonly Payment[], refunds: readonly Refund[] = []): number {
  return Math.max(0, invoice.totalCents - invoiceNetPaidCents(invoice.id, payments, refunds));
}
