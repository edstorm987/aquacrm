// TicketService — per-client helpdesk CRUD + status transitions +
// reply threading + auto-assign + cross-plugin subscriber.
//
// Storage layout (per-client install):
//   support/index             → string[] of ticket ids
//   support/by-id/<id>        → Ticket
//   support/seq               → number (monotonic counter for ref)
//
// scopePolicy: "client" — agencyId AND clientId must match for a row
// to be in scope. Tickets cannot leak across clients of the same
// agency.

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  AutoAssignRule,
  CreateTicketInput,
  Ticket,
  TicketFilter,
  TicketMessage,
  TicketMessageAttachment,
  UpdateTicketPatch,
} from "../lib/domain";
import {
  STATUS_TRANSITIONS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  nextRef,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const INDEX_KEY = "support/index";
const SEQ_KEY = "support/seq";
const ticketKey = (id: string): string => `support/by-id/${id}`;

export class TicketNotFoundError extends Error {
  constructor(message = "support: ticket not found") { super(message); this.name = "TicketNotFoundError"; }
}
export class InvalidStatusTransitionError extends Error {
  constructor(public from: string, public to: string) {
    super(`support: invalid transition ${from} → ${to}`);
    this.name = "InvalidStatusTransitionError";
  }
}
export class HoneypotTriggeredError extends Error {
  constructor(message = "support: honeypot triggered") { super(message); this.name = "HoneypotTriggeredError"; }
}

export interface TicketServiceDeps {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  autoAssignRules?: AutoAssignRule[];
}

export class TicketService {
  private agencyId: AgencyId;
  private clientId: ClientId;
  private storage: StoragePort;
  private activity: ActivityLogPort;
  private events: EventBusPort;
  private rules: AutoAssignRule[];

  constructor(deps: TicketServiceDeps) {
    this.agencyId = deps.agencyId;
    this.clientId = deps.clientId;
    this.storage = deps.storage;
    this.activity = deps.activity;
    this.events = deps.events;
    this.rules = deps.autoAssignRules ?? [];
  }

  setAutoAssignRules(rules: AutoAssignRule[]): void {
    this.rules = rules;
  }

  private inScope(t: Ticket): boolean {
    return t.agencyId === this.agencyId && t.clientId === this.clientId;
  }

  private scope(): { agencyId: AgencyId; clientId: ClientId } {
    return { agencyId: this.agencyId, clientId: this.clientId };
  }

  private async nextSeq(): Promise<number> {
    const cur = (await this.storage.get<number>(SEQ_KEY)) ?? 0;
    const next = cur + 1;
    await this.storage.set(SEQ_KEY, next);
    return next;
  }

  private autoAssignFor(tags: string[]): UserId | undefined {
    for (const rule of this.rules) {
      if (tags.includes(rule.tag)) return rule.userId;
    }
    return undefined;
  }

  async create(input: CreateTicketInput): Promise<Ticket> {
    if (!input.subject.trim()) throw new Error("support: subject required");
    if (!input.body.trim()) throw new Error("support: body required");
    if (!input.customerEmail.trim()) throw new Error("support: customerEmail required");
    const priority = input.priority ?? "normal";
    if (!TICKET_PRIORITIES.includes(priority)) throw new Error("support: invalid priority");
    const tags = dedupe(input.tags ?? []);
    const t = now();
    const seq = await this.nextSeq();
    const initialMessage: TicketMessage = {
      id: makeId("msg"),
      fromKind: "customer",
      authorEmail: input.customerEmail,
      body: input.body,
      sentAt: t,
      attachments: [],
    };
    const ticket: Ticket = {
      id: makeId("tkt"),
      agencyId: this.agencyId,
      clientId: this.clientId,
      ref: nextRef(seq),
      subject: input.subject.trim(),
      body: input.body,
      customerEmail: input.customerEmail.trim(),
      customerName: input.customerName?.trim(),
      status: "new",
      priority,
      tags,
      assignedTo: this.autoAssignFor(tags),
      messages: [initialMessage],
      createdAt: t,
      updatedAt: t,
    };
    await this.storage.set(ticketKey(ticket.id), ticket);
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    if (!ids.includes(ticket.id)) await this.storage.set(INDEX_KEY, [...ids, ticket.id]);
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId,
      category: "settings", action: "support.ticket.opened",
      message: `Ticket ${ticket.ref} opened: ${ticket.subject}`,
      metadata: { ticketId: ticket.id, ref: ticket.ref, customerEmail: ticket.customerEmail, tags },
    });
    this.events.emit(this.scope(), "support.ticket.opened",
      { id: ticket.id, ref: ticket.ref, customerEmail: ticket.customerEmail, tags });
    if (ticket.assignedTo) {
      this.events.emit(this.scope(), "support.ticket.assigned",
        { id: ticket.id, assignedTo: ticket.assignedTo, auto: true });
    }
    return ticket;
  }

  async get(id: string): Promise<Ticket | null> {
    const t = await this.storage.get<Ticket>(ticketKey(id));
    return t && this.inScope(t) ? t : null;
  }

  async list(filter: TicketFilter = {}): Promise<Ticket[]> {
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    const out: Ticket[] = [];
    for (const id of ids) {
      const t = await this.storage.get<Ticket>(ticketKey(id));
      if (!t || !this.inScope(t)) continue;
      if (filter.status && t.status !== filter.status) continue;
      if (filter.priority && t.priority !== filter.priority) continue;
      if (filter.tag && !t.tags.includes(filter.tag)) continue;
      if (filter.assignedTo && t.assignedTo !== filter.assignedTo) continue;
      if (filter.unassigned && t.assignedTo) continue;
      if (filter.query) {
        const q = filter.query.toLowerCase();
        const hay = `${t.subject} ${t.body} ${t.customerEmail} ${t.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      out.push(t);
    }
    // Newest-first by updatedAt — Inbox UX expects most-recently-touched on top.
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async update(actor: UserId, id: string, patch: UpdateTicketPatch): Promise<Ticket> {
    const cur = await this.storage.get<Ticket>(ticketKey(id));
    if (!cur || !this.inScope(cur)) throw new TicketNotFoundError();
    if (patch.priority && !TICKET_PRIORITIES.includes(patch.priority)) {
      throw new Error("support: invalid priority");
    }
    if (patch.status) {
      if (!TICKET_STATUSES.includes(patch.status)) throw new Error("support: invalid status");
      if (patch.status !== cur.status) {
        const allowed = STATUS_TRANSITIONS[cur.status];
        if (!allowed.includes(patch.status)) {
          throw new InvalidStatusTransitionError(cur.status, patch.status);
        }
      }
    }
    let assignedTo = cur.assignedTo;
    let assigneeChanged = false;
    if (patch.assignedTo === null) {
      if (cur.assignedTo) { assignedTo = undefined; assigneeChanged = true; }
    } else if (patch.assignedTo !== undefined && patch.assignedTo !== cur.assignedTo) {
      assignedTo = patch.assignedTo;
      assigneeChanged = true;
    }
    const t = now();
    const next: Ticket = {
      ...cur,
      subject: patch.subject?.trim() || cur.subject,
      status: patch.status ?? cur.status,
      priority: patch.priority ?? cur.priority,
      tags: patch.tags ? dedupe(patch.tags) : cur.tags,
      assignedTo,
      updatedAt: t,
      resolvedAt: patch.status === "resolved" && cur.status !== "resolved" ? t : cur.resolvedAt,
      closedAt:   patch.status === "closed"   && cur.status !== "closed"   ? t : cur.closedAt,
    };
    await this.storage.set(ticketKey(id), next);
    if (assigneeChanged) {
      this.activity.logActivity({
        agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
        category: "settings", action: "support.ticket.assigned",
        message: assignedTo
          ? `Ticket ${cur.ref} assigned to ${assignedTo}`
          : `Ticket ${cur.ref} unassigned`,
        metadata: { ticketId: id, assignedTo: assignedTo ?? null },
      });
      this.events.emit(this.scope(), "support.ticket.assigned",
        { id, assignedTo: assignedTo ?? null, auto: false });
    }
    if (patch.status && patch.status !== cur.status) {
      this.activity.logActivity({
        agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
        category: "settings", action: "support.ticket.status-changed",
        message: `Ticket ${cur.ref}: ${cur.status} → ${patch.status}`,
        metadata: { ticketId: id, from: cur.status, to: patch.status },
      });
      this.events.emit(this.scope(), "support.ticket.status-changed",
        { id, from: cur.status, to: patch.status });
      if (patch.status === "resolved") {
        this.events.emit(this.scope(), "support.ticket.resolved", { id });
      } else if (patch.status === "closed") {
        this.events.emit(this.scope(), "support.ticket.closed", { id });
      } else if ((cur.status === "resolved" || cur.status === "closed") &&
                 (patch.status === "in-progress" || patch.status === "new")) {
        this.events.emit(this.scope(), "support.ticket.reopened", { id });
      }
    }
    return next;
  }

  async reply(actor: { fromKind: "customer" | "agent"; userId?: UserId; email?: string },
              id: string, body: string,
              attachments: TicketMessageAttachment[] = []): Promise<Ticket> {
    const cur = await this.storage.get<Ticket>(ticketKey(id));
    if (!cur || !this.inScope(cur)) throw new TicketNotFoundError();
    if (!body.trim()) throw new Error("support: reply body required");
    const t = now();
    const msg: TicketMessage = {
      id: makeId("msg"),
      fromKind: actor.fromKind,
      authorId: actor.userId,
      authorEmail: actor.email,
      body,
      sentAt: t,
      attachments,
    };
    // Customer reply on a "waiting-customer" ticket auto-flips back
    // to "in-progress". Agent reply on "new" auto-flips to
    // "in-progress" (operator picked it up). Otherwise status holds.
    let nextStatus = cur.status;
    if (actor.fromKind === "customer" && cur.status === "waiting-customer") {
      nextStatus = "in-progress";
    } else if (actor.fromKind === "agent" && cur.status === "new") {
      nextStatus = "in-progress";
    }
    const next: Ticket = {
      ...cur,
      messages: [...cur.messages, msg],
      status: nextStatus,
      updatedAt: t,
    };
    await this.storage.set(ticketKey(id), next);
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId,
      actorUserId: actor.userId,
      category: "settings", action: "support.ticket.replied",
      message: `Ticket ${cur.ref} replied by ${actor.fromKind}`,
      metadata: { ticketId: id, fromKind: actor.fromKind, messageId: msg.id },
    });
    this.events.emit(this.scope(), "support.ticket.replied",
      { id, fromKind: actor.fromKind, messageId: msg.id });
    if (nextStatus !== cur.status) {
      this.events.emit(this.scope(), "support.ticket.status-changed",
        { id, from: cur.status, to: nextStatus });
    }
    return next;
  }

  // Subscriber for ecommerce `order.shipped`. Posts a low-noise
  // agent-side follow-up message on every OPEN ticket whose
  // customerEmail matches the order. Open == not resolved/closed.
  async onOrderShipped(orderEmail: string, orderRef: string): Promise<number> {
    const list = await this.list();
    let touched = 0;
    for (const t of list) {
      if (t.customerEmail.toLowerCase() !== orderEmail.toLowerCase()) continue;
      if (t.status === "resolved" || t.status === "closed") continue;
      await this.reply(
        { fromKind: "agent", email: "system@support" },
        t.id,
        `Heads-up: order ${orderRef} for ${orderEmail} just shipped — closing the loop on this ticket.`,
      );
      touched += 1;
    }
    return touched;
  }
}

function dedupe<T>(xs: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of xs) { if (!seen.has(x)) { seen.add(x); out.push(x); } }
  return out;
}
