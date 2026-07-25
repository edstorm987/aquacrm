// Support-desk domain.
//
// Per-client (`scopePolicy: "client"`) helpdesk shape. End-customers
// post tickets via the storefront `support-form` block; agency staff
// triage from the Inbox. Threads live as a flat array on the Ticket —
// no per-message storage key (keeps the read path one fetch).

import type { UserId } from "./tenancy";

export type TicketStatus =
  | "new"
  | "in-progress"
  | "waiting-customer"
  | "resolved"
  | "closed";

export const TICKET_STATUSES: readonly TicketStatus[] = [
  "new", "in-progress", "waiting-customer", "resolved", "closed",
] as const;

export const STATUS_LABELS: Record<TicketStatus, string> = {
  "new": "New",
  "in-progress": "In progress",
  "waiting-customer": "Waiting on customer",
  "resolved": "Resolved",
  "closed": "Closed",
};

export type TicketPriority = "low" | "normal" | "high" | "urgent";
export const TICKET_PRIORITIES: readonly TicketPriority[] = ["low", "normal", "high", "urgent"] as const;

export type MessageFromKind = "customer" | "agent";

export interface TicketMessageAttachment {
  id: string;
  filename: string;
  byteCount: number;
  // Reference into client-files external-ref store (R010); plugin
  // does NOT inline attachment bytes.
  fileRef?: string;
}

export interface TicketMessage {
  id: string;
  fromKind: MessageFromKind;
  authorId?: UserId;       // populated when an agent replies
  authorEmail?: string;    // snapshot of customer email at send-time
  body: string;
  sentAt: number;
  attachments: TicketMessageAttachment[];
}

export interface Ticket {
  id: string;
  agencyId: string;
  clientId: string;
  ref: string;             // human-friendly e.g. "T-0042"
  subject: string;
  body: string;            // initial body (also kept as messages[0])
  customerEmail: string;
  customerName?: string;
  status: TicketStatus;
  priority: TicketPriority;
  tags: string[];
  assignedTo?: UserId;     // agency-side staff
  messages: TicketMessage[];
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  closedAt?: number;
}

export interface CreateTicketInput {
  subject: string;
  body: string;
  customerEmail: string;
  customerName?: string;
  priority?: TicketPriority;
  tags?: string[];
}

export interface UpdateTicketPatch {
  subject?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  tags?: string[];
  assignedTo?: UserId | null;   // null = unassign
}

export interface TicketFilter {
  status?: TicketStatus;
  priority?: TicketPriority;
  tag?: string;
  assignedTo?: UserId;
  query?: string;
  unassigned?: boolean;
}

// Auto-assign rules — operator configures `tag → userId` mappings in
// settings; on ticket create the first matching tag wires
// `assignedTo`. Test 7 verifies.
export interface AutoAssignRule {
  tag: string;
  userId: UserId;
}

// Status transition graph. Used to gate manual transitions; not
// strictly enforced (resolved→new is unusual but allowed for re-open).
export const STATUS_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  "new":              ["in-progress", "waiting-customer", "resolved", "closed"],
  "in-progress":      ["waiting-customer", "resolved", "closed", "new"],
  "waiting-customer": ["in-progress", "resolved", "closed"],
  "resolved":         ["closed", "in-progress"],   // re-open path
  "closed":           ["in-progress"],             // re-open path
};

export function nextRef(seq: number): string {
  return `T-${String(seq).padStart(4, "0")}`;
}

// Honeypot field name — storefront form must include this hidden
// input; non-empty value rejects the submission as bot-spam.
export const HONEYPOT_FIELD = "website_url";

export function looksLikeBot(formValues: Record<string, string>): boolean {
  const v = formValues[HONEYPOT_FIELD];
  return v !== undefined && v.trim() !== "";
}
