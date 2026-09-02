// The only success shape the anonymous newsletter component accepts. It is
// the same allowlisted receipt the contact facade answers with, kept behind a
// newsletter-named door so a caller cannot mistake one facade for the other.

import { parseVisitorContactReceipt, type VisitorContactReceipt } from "./visitorContactReceipt";

export type VisitorNewsletterReceipt = VisitorContactReceipt;

export function parseVisitorNewsletterReceipt(value: unknown): VisitorNewsletterReceipt | null {
  return parseVisitorContactReceipt(value);
}
