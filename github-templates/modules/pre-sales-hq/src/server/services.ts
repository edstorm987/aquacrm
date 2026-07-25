// Pre-sales-hq services: Discovery + Proposal + Nurture.
//
// Storage layout:
//   calls/index             → string[] of call ids
//   calls/by-id/<id>        → DiscoveryCall
//   calls/by-lead/<leadId>  → string[] of call ids
//   proposals/index         → string[] of proposal ids
//   proposals/by-id/<id>    → Proposal
//   proposals/by-lead/<id>  → string[] of proposal ids
//   nurture/index           → string[] of nurture-touch ids
//   nurture/by-id/<id>      → NurtureTouch
//   nurture/by-lead/<id>    → string[] of nurture-touch ids

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CreateDiscoveryCallInput,
  CreateNurtureTouchInput,
  CreateProposalInput,
  DiscoveryCall,
  DiscoveryOutcome,
  LeadStatusChangedEvent,
  NurtureTouch,
  NurtureType,
  OverdueNurture,
  Proposal,
  ProposalStatus,
  UpdateDiscoveryCallPatch,
} from "../lib/domain";
import {
  DEFAULT_NURTURE_CADENCE_DAYS,
  PROPOSAL_TRANSITIONS,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const CALL_INDEX = "calls/index";
const PROP_INDEX = "proposals/index";
const NURT_INDEX = "nurture/index";

const callKey = (id: string): string => `calls/by-id/${id}`;
const callLeadKey = (lid: string): string => `calls/by-lead/${lid}`;
const propKey = (id: string): string => `proposals/by-id/${id}`;
const propLeadKey = (lid: string): string => `proposals/by-lead/${lid}`;
const nurtKey = (id: string): string => `nurture/by-id/${id}`;
const nurtLeadKey = (lid: string): string => `nurture/by-lead/${lid}`;

const DAY_MS = 86_400_000;

export class PreSalesNotFoundError extends Error {
  constructor(message = "pre-sales: not found") { super(message); this.name = "PreSalesNotFoundError"; }
}
export class InvalidProposalTransitionError extends Error {
  constructor(public from: ProposalStatus, public to: ProposalStatus) {
    super(`pre-sales: cannot transition proposal ${from} → ${to}`);
    this.name = "InvalidProposalTransitionError";
  }
}

async function pushIndex(storage: StoragePort, key: string, id: string): Promise<void> {
  const ids = (await storage.get<string[]>(key)) ?? [];
  if (!ids.includes(id)) await storage.set(key, [...ids, id]);
}

// ───────────────────────────────────────────────────────────────────

export class DiscoveryCallService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  private inScope(c: DiscoveryCall): boolean { return c.agencyId === this.agencyId; }

  async list(filter: { leadId?: string; outcome?: DiscoveryOutcome } = {}): Promise<DiscoveryCall[]> {
    const ids = (await this.storage.get<string[]>(CALL_INDEX)) ?? [];
    const out: DiscoveryCall[] = [];
    for (const id of ids) {
      const c = await this.storage.get<DiscoveryCall>(callKey(id));
      if (!c || !this.inScope(c)) continue;
      if (filter.leadId && c.leadId !== filter.leadId) continue;
      if (filter.outcome && c.outcome !== filter.outcome) continue;
      out.push(c);
    }
    return out.sort((a, b) => b.scheduledAt - a.scheduledAt);
  }

  async get(id: string): Promise<DiscoveryCall | null> {
    const c = await this.storage.get<DiscoveryCall>(callKey(id));
    return c && this.inScope(c) ? c : null;
  }

  async schedule(actor: UserId, input: CreateDiscoveryCallInput): Promise<DiscoveryCall> {
    if (!input.leadId) throw new Error("pre-sales: leadId required");
    if (input.scheduledAt <= 0) throw new Error("pre-sales: scheduledAt required");
    const t = now();
    const call: DiscoveryCall = {
      id: makeId("dc"),
      agencyId: this.agencyId,
      leadId: input.leadId,
      scheduledAt: input.scheduledAt,
      outcome: "scheduled",
      notes: input.notes,
      createdBy: actor,
      createdAt: t, updatedAt: t,
    };
    await this.storage.set(callKey(call.id), call);
    await pushIndex(this.storage, CALL_INDEX, call.id);
    await pushIndex(this.storage, callLeadKey(call.leadId), call.id);
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "settings", action: "pre-sales.call.scheduled",
      message: `Discovery call scheduled for lead ${input.leadId} at ${new Date(input.scheduledAt).toISOString()}`,
      metadata: { callId: call.id, leadId: input.leadId },
    });
    this.events.emit({ agencyId: this.agencyId }, "pre-sales.call.scheduled",
      { id: call.id, leadId: input.leadId });
    return call;
  }

  async update(actor: UserId, id: string, patch: UpdateDiscoveryCallPatch): Promise<DiscoveryCall> {
    const cur = await this.get(id);
    if (!cur) throw new PreSalesNotFoundError();
    const wasComplete = cur.outcome === "completed";
    const next: DiscoveryCall = {
      ...cur,
      scheduledAt: patch.scheduledAt ?? cur.scheduledAt,
      notes: patch.notes ?? cur.notes,
      completedAt: patch.completedAt ?? cur.completedAt,
      outcome: patch.outcome ?? cur.outcome,
      updatedAt: now(),
    };
    await this.storage.set(callKey(id), next);
    if (!wasComplete && next.outcome === "completed") {
      this.activity.logActivity({
        agencyId: this.agencyId, actorUserId: actor,
        category: "settings", action: "pre-sales.call.completed",
        message: `Discovery call completed for lead ${cur.leadId}`,
        metadata: { callId: id, leadId: cur.leadId },
      });
      this.events.emit({ agencyId: this.agencyId }, "pre-sales.call.completed",
        { id, leadId: cur.leadId });
    }
    return next;
  }
}

// ───────────────────────────────────────────────────────────────────

export class ProposalService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  private inScope(p: Proposal): boolean { return p.agencyId === this.agencyId; }

  async list(filter: { leadId?: string; status?: ProposalStatus } = {}): Promise<Proposal[]> {
    const ids = (await this.storage.get<string[]>(PROP_INDEX)) ?? [];
    const out: Proposal[] = [];
    for (const id of ids) {
      const p = await this.storage.get<Proposal>(propKey(id));
      if (!p || !this.inScope(p)) continue;
      if (filter.leadId && p.leadId !== filter.leadId) continue;
      if (filter.status && p.status !== filter.status) continue;
      out.push(p);
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<Proposal | null> {
    const p = await this.storage.get<Proposal>(propKey(id));
    return p && this.inScope(p) ? p : null;
  }

  async create(actor: UserId, input: CreateProposalInput): Promise<Proposal> {
    if (!input.leadId) throw new Error("pre-sales: leadId required");
    if (input.amountCents < 0) throw new Error("pre-sales: amountCents must be >= 0");
    const t = now();
    const p: Proposal = {
      id: makeId("prop"),
      agencyId: this.agencyId,
      leadId: input.leadId,
      amountCents: input.amountCents,
      currency: input.currency ?? "gbp",
      status: "draft",
      notes: input.notes,
      createdBy: actor,
      createdAt: t, updatedAt: t,
    };
    await this.storage.set(propKey(p.id), p);
    await pushIndex(this.storage, PROP_INDEX, p.id);
    await pushIndex(this.storage, propLeadKey(p.leadId), p.id);
    return p;
  }

  async transition(actor: UserId, id: string, to: ProposalStatus, notes?: string): Promise<Proposal> {
    const cur = await this.get(id);
    if (!cur) throw new PreSalesNotFoundError();
    const allowed = PROPOSAL_TRANSITIONS[cur.status];
    if (!allowed.includes(to)) throw new InvalidProposalTransitionError(cur.status, to);
    const t = now();
    const next: Proposal = {
      ...cur,
      status: to,
      sentAt: to === "sent" ? (cur.sentAt ?? t) : cur.sentAt,
      decidedAt: (to === "accepted" || to === "rejected") ? t : cur.decidedAt,
      notes: notes ?? cur.notes,
      updatedAt: t,
    };
    await this.storage.set(propKey(id), next);
    if (cur.status !== "sent" && to === "sent") {
      this.activity.logActivity({
        agencyId: this.agencyId, actorUserId: actor,
        category: "settings", action: "pre-sales.proposal-sent",
        message: `Proposal sent for lead ${cur.leadId} (${cur.amountCents} ${cur.currency.toUpperCase()})`,
        metadata: { proposalId: id, leadId: cur.leadId, amountCents: cur.amountCents },
      });
      this.events.emit({ agencyId: this.agencyId }, "pre-sales.proposal-sent",
        { id, leadId: cur.leadId, amountCents: cur.amountCents });
    }
    if (to === "accepted" || to === "rejected") {
      this.events.emit({ agencyId: this.agencyId }, "pre-sales.proposal-decided",
        { id, leadId: cur.leadId, status: to });
    }
    return next;
  }
}

// ───────────────────────────────────────────────────────────────────

export interface NurtureDeps {
  cadenceDays?: number;
}

export class NurtureService {
  private readonly cadenceDays: number;

  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    deps: NurtureDeps = {},
  ) {
    this.cadenceDays = deps.cadenceDays ?? DEFAULT_NURTURE_CADENCE_DAYS;
  }

  private inScope(n: NurtureTouch): boolean { return n.agencyId === this.agencyId; }

  async list(filter: { leadId?: string; type?: NurtureType } = {}): Promise<NurtureTouch[]> {
    const ids = (await this.storage.get<string[]>(NURT_INDEX)) ?? [];
    const out: NurtureTouch[] = [];
    for (const id of ids) {
      const n = await this.storage.get<NurtureTouch>(nurtKey(id));
      if (!n || !this.inScope(n)) continue;
      if (filter.leadId && n.leadId !== filter.leadId) continue;
      if (filter.type && n.type !== filter.type) continue;
      out.push(n);
    }
    return out.sort((a, b) => b.sentAt - a.sentAt);
  }

  async record(actor: UserId, input: CreateNurtureTouchInput): Promise<NurtureTouch> {
    if (!input.leadId) throw new Error("pre-sales: leadId required");
    const t = now();
    const n: NurtureTouch = {
      id: makeId("nt"),
      agencyId: this.agencyId,
      leadId: input.leadId,
      type: input.type,
      sentAt: input.sentAt ?? t,
      response: input.response,
      notes: input.notes,
      createdBy: actor,
      createdAt: t,
    };
    await this.storage.set(nurtKey(n.id), n);
    await pushIndex(this.storage, NURT_INDEX, n.id);
    await pushIndex(this.storage, nurtLeadKey(n.leadId), n.id);
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "settings", action: "pre-sales.nurture.touched",
      message: `Nurture ${n.type} → lead ${n.leadId}${n.response ? ` (${n.response})` : ""}`,
      metadata: { touchId: n.id, leadId: n.leadId, type: n.type },
    });
    this.events.emit({ agencyId: this.agencyId }, "pre-sales.nurture.touched",
      { id: n.id, leadId: n.leadId });
    return n;
  }

  // Identify leads whose last non-replied touch is older than the
  // cadence threshold. `leadIds` is the candidate pool — typically
  // pulled from the CRM's open-leads list and passed in. Leads with
  // a recent reply are excluded (the conversation is "live"); leads
  // never touched are returned with `daysSinceLastTouch: Infinity`
  // expressed as a large sentinel so the UI can sort them to the top.
  async overdue(leadIds: string[], refNow: number = now()): Promise<OverdueNurture[]> {
    const all = await this.list();
    const byLead = new Map<string, NurtureTouch>();
    for (const t of all) {
      const cur = byLead.get(t.leadId);
      if (!cur || t.sentAt > cur.sentAt) byLead.set(t.leadId, t);
    }
    const cadenceMs = this.cadenceDays * DAY_MS;
    const out: OverdueNurture[] = [];
    for (const leadId of leadIds) {
      const last = byLead.get(leadId);
      if (last && last.response === "replied") continue;
      if (!last) {
        out.push({ leadId, daysSinceLastTouch: Number.MAX_SAFE_INTEGER });
        continue;
      }
      const elapsed = refNow - last.sentAt;
      if (elapsed >= cadenceMs) {
        out.push({
          leadId,
          daysSinceLastTouch: Math.floor(elapsed / DAY_MS),
          lastTouchAt: last.sentAt,
          lastTouchType: last.type,
        });
      }
    }
    out.sort((a, b) => b.daysSinceLastTouch - a.daysSinceLastTouch);
    return out;
  }

  // Subscriber-style helper for client-crm `lead.status_changed`.
  // Logs a lightweight "other"-channel touch with metadata.source so
  // the timeline reflects status flips alongside outbound touches.
  async onCrmLeadStatusChanged(args: LeadStatusChangedEvent, actor: UserId = "system"): Promise<NurtureTouch> {
    return this.record(actor, {
      leadId: args.leadId,
      type: "other",
      notes: `Lead status: ${args.fromStatus ?? "(none)"} → ${args.toStatus}`,
    });
  }
}
