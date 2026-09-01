/** The only success shape the anonymous contact component accepts. */
export interface VisitorContactReceipt {
  ok: true;
  receiptId: string;
}

export function parseVisitorContactReceipt(value: unknown): VisitorContactReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.ok !== true || typeof row.receiptId !== "string") return null;
  const receiptId = row.receiptId.trim();
  if (!receiptId || receiptId.length > 200) return null;
  return { ok: true, receiptId };
}
