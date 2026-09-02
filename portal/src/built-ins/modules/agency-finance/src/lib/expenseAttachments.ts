import type { ExpenseAttachment } from "./domain";

const CONTENT_PATH = "/api/portal/finance/expense-attachments/content";

function canonicalAttachmentName(value: string): string {
  return value.trim().slice(0, 180) || "expense-file";
}

/**
 * Build the only persisted content URL shape from authoritative attachment
 * metadata. Callers never trust a browser-supplied URL, whose provider/key
 * query could otherwise disagree with the staged object being claimed.
 */
export function expenseAttachmentContentUrl(
  attachment: Pick<ExpenseAttachment, "id" | "name" | "contentType" | "size" | "storageProvider" | "storageKey">,
): string {
  const params = new URLSearchParams({
    id: attachment.id,
    name: canonicalAttachmentName(attachment.name),
    type: attachment.contentType,
    size: String(attachment.size),
    provider: attachment.storageProvider,
    key: attachment.storageKey,
  });
  return `${CONTENT_PATH}?${params.toString()}`;
}

export function canonicalExpenseAttachment(attachment: ExpenseAttachment): ExpenseAttachment {
  const canonical: ExpenseAttachment = {
    ...attachment,
    id: attachment.id.slice(0, 120),
    name: canonicalAttachmentName(attachment.name),
    contentType: attachment.contentType.slice(0, 180),
    storageKey: attachment.storageKey.slice(0, 2_000),
  };
  return { ...canonical, url: expenseAttachmentContentUrl(canonical) };
}
