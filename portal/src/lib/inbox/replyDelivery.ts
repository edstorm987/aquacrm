import type { InboxMessage, InboxReplyDeliveryPart, InboxReplyOperation } from "@/lib/inbox/types";

export const META_REPLY_OPERATION_KEY = "metaReplyOperation";

export function readInboxReplyOperation(
  value: InboxMessage | Record<string, unknown> | null | undefined,
): InboxReplyOperation | null {
  const metadata = value && "metadata" in value
    ? (value as InboxMessage).metadata
    : value;
  const candidate = metadata?.[META_REPLY_OPERATION_KEY];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const operation = candidate as Record<string, unknown>;
  if (operation.version !== 1 || typeof operation.operationId !== "string" || typeof operation.payloadHash !== "string" || !Array.isArray(operation.parts)) return null;
  const parts = operation.parts.flatMap<InboxReplyDeliveryPart>(partValue => {
    if (!partValue || typeof partValue !== "object" || Array.isArray(partValue)) return [];
    const part = partValue as Record<string, unknown>;
    if (typeof part.id !== "string" || (part.kind !== "text" && part.kind !== "attachment")) return [];
    if (!(["pending", "sending", "sent", "failed", "uncertain"] as const).includes(part.status as InboxReplyDeliveryPart["status"])) return [];
    return [{
      id: part.id,
      kind: part.kind,
      ...(Number.isInteger(part.attachmentIndex) ? { attachmentIndex: Number(part.attachmentIndex) } : {}),
      status: part.status as InboxReplyDeliveryPart["status"],
      attempts: Number.isInteger(part.attempts) && Number(part.attempts) >= 0 ? Number(part.attempts) : 0,
      ...(typeof part.providerMessageId === "string" && part.providerMessageId ? { providerMessageId: part.providerMessageId } : {}),
      ...(typeof part.error === "string" && part.error ? { error: part.error } : {}),
      ...(typeof part.leaseOwner === "string" && part.leaseOwner ? { leaseOwner: part.leaseOwner } : {}),
      ...(typeof part.leaseExpiresAt === "number" && Number.isFinite(part.leaseExpiresAt) ? { leaseExpiresAt: part.leaseExpiresAt } : {}),
      updatedAt: typeof part.updatedAt === "number" && Number.isFinite(part.updatedAt) ? part.updatedAt : 0,
    }];
  });
  if (parts.length !== operation.parts.length || parts.length === 0) return null;
  return {
    version: 1,
    operationId: operation.operationId,
    payloadHash: operation.payloadHash,
    parts,
    ...(typeof operation.completedAt === "number" && Number.isFinite(operation.completedAt) ? { completedAt: operation.completedAt } : {}),
  };
}

export function inboxReplyProgress(value: InboxMessage | Record<string, unknown>): {
  operation: InboxReplyOperation;
  sent: number;
  total: number;
  retryable: boolean;
  uncertain: boolean;
} | null {
  const operation = readInboxReplyOperation(value);
  if (!operation) return null;
  const sent = operation.parts.filter(part => part.status === "sent").length;
  return {
    operation,
    sent,
    total: operation.parts.length,
    retryable: operation.parts.some(part => part.status === "pending" || part.status === "failed"),
    uncertain: operation.parts.some(part => part.status === "uncertain" || part.status === "sending"),
  };
}
