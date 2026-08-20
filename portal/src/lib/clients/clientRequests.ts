import type {
  ClientRequest,
  ClientRequestReply,
  ClientRequestType,
} from "@/app/api/tenants/client-requests/route";

const REQUEST_TYPES = new Set<ClientRequestType>([
  "suggestion",
  "design-feedback",
  "support-ticket",
  "cancel",
  "move-provider",
]);

const REQUEST_STATUSES = new Set<ClientRequest["status"]>(["open", "reviewed", "closed"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function text(value: unknown, fallback = "", max = 4_000): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function timestamp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function optionalTimestamp(value: unknown): number | undefined {
  const next = timestamp(value);
  return next || undefined;
}

function requestType(value: unknown): ClientRequestType {
  return typeof value === "string" && REQUEST_TYPES.has(value as ClientRequestType)
    ? value as ClientRequestType
    : "suggestion";
}

function requestStatus(value: unknown): ClientRequest["status"] {
  return typeof value === "string" && REQUEST_STATUSES.has(value as ClientRequest["status"])
    ? value as ClientRequest["status"]
    : "open";
}

function cleanReply(value: unknown, index: number): ClientRequestReply | null {
  const source = record(value);
  if (!source) return null;
  return {
    id: text(source.id, `legacy-reply-${index}`, 180),
    message: text(source.message, "No reply text was recorded."),
    from: source.from === "customer" ? "customer" : "milesymedia",
    createdAt: timestamp(source.createdAt),
    attachments: Array.isArray(source.attachments)
      ? source.attachments.filter(attachment => Boolean(record(attachment))) as ClientRequestReply["attachments"]
      : [],
  };
}

export function cleanClientRequests(value: unknown): ClientRequest[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const source = record(item);
    if (!source) return [];
    const replies = Array.isArray(source.replies)
      ? source.replies.flatMap((reply, replyIndex) => cleanReply(reply, replyIndex) ?? [])
      : [];
    return [{
      id: text(source.id, `legacy-request-${index}`, 180),
      type: requestType(source.type),
      message: text(source.message, "No message was recorded."),
      link: text(source.link, "", 500) || undefined,
      propertyId: text(source.propertyId, "", 180) || undefined,
      siteLabel: text(source.siteLabel, "", 180) || undefined,
      siteUrl: text(source.siteUrl, "", 500) || undefined,
      siteKind: text(source.siteKind, "", 80) || undefined,
      priority: source.priority === "urgent" || source.priority === "high" || source.priority === "normal"
        ? source.priority
        : undefined,
      topic: text(source.topic, "", 180) || undefined,
      suggestedAction: text(source.suggestedAction, "", 500) || undefined,
      status: requestStatus(source.status),
      submittedBy: text(source.submittedBy, "Unknown sender", 320),
      submittedAt: timestamp(source.submittedAt),
      reviewedBy: text(source.reviewedBy, "", 320) || undefined,
      reviewedAt: optionalTimestamp(source.reviewedAt),
      closedBy: text(source.closedBy, "", 320) || undefined,
      closedAt: optionalTimestamp(source.closedAt),
      replies,
    }];
  });
}
