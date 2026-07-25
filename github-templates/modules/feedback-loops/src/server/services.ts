// Feedback-loops services.
//
// Storage layout (per-install — install is per-client):
//   pulses/index             → string[] of pulse ids
//   pulses/by-id/<id>        → Pulse
//   testimonials/index       → string[] of testimonial ids
//   testimonials/by-id/<id>  → TestimonialRequest

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  Pulse,
  PulseMonth,
  PulseSummary,
  ReplyTestimonialInput,
  RequestTestimonialInput,
  RespondPulseInput,
  SendPulseInput,
  TestimonialRequest,
  TestimonialStatus,
} from "../lib/domain";
import {
  DETRACTOR_CUTOFF,
  PROMOTER_CUTOFF,
  TESTIMONIAL_TRANSITIONS,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const PULSE_INDEX = "pulses/index";
const TEST_INDEX = "testimonials/index";
const pulseKey = (id: string): string => `pulses/by-id/${id}`;
const testKey = (id: string): string => `testimonials/by-id/${id}`;

export class FeedbackNotFoundError extends Error {
  constructor(message = "feedback-loops: not found") { super(message); this.name = "FeedbackNotFoundError"; }
}
export class InvalidTestimonialTransitionError extends Error {
  constructor(public from: TestimonialStatus, public to: TestimonialStatus) {
    super(`feedback-loops: cannot transition testimonial ${from} → ${to}`);
    this.name = "InvalidTestimonialTransitionError";
  }
}

async function pushIndex(storage: StoragePort, key: string, id: string): Promise<void> {
  const ids = (await storage.get<string[]>(key)) ?? [];
  if (!ids.includes(id)) await storage.set(key, [...ids, id]);
}
async function removeFromIndex(storage: StoragePort, key: string, id: string): Promise<void> {
  const ids = (await storage.get<string[]>(key)) ?? [];
  const next = ids.filter(x => x !== id);
  if (next.length !== ids.length) await storage.set(key, next);
}

function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ── Pulse ──────────────────────────────────────────────────────

export interface PulseDeps {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
}

export class PulseService {
  private readonly agencyId: AgencyId;
  private readonly clientId: ClientId;
  private readonly storage: StoragePort;
  private readonly activity: ActivityLogPort;
  private readonly events: EventBusPort;

  constructor(deps: PulseDeps) {
    this.agencyId = deps.agencyId;
    this.clientId = deps.clientId;
    this.storage = deps.storage;
    this.activity = deps.activity;
    this.events = deps.events;
  }

  private inScope(p: Pulse): boolean {
    return p.agencyId === this.agencyId && p.clientId === this.clientId;
  }

  async list(filter: { responded?: boolean; respondent?: string } = {}): Promise<Pulse[]> {
    const ids = (await this.storage.get<string[]>(PULSE_INDEX)) ?? [];
    const out: Pulse[] = [];
    for (const id of ids) {
      const p = await this.storage.get<Pulse>(pulseKey(id));
      if (!p || !this.inScope(p)) continue;
      if (filter.responded === true && p.respondedAt === undefined) continue;
      if (filter.responded === false && p.respondedAt !== undefined) continue;
      if (filter.respondent && p.respondent !== filter.respondent) continue;
      out.push(p);
    }
    return out.sort((a, b) => b.sentAt - a.sentAt);
  }

  async get(id: string): Promise<Pulse | null> {
    const p = await this.storage.get<Pulse>(pulseKey(id));
    return p && this.inScope(p) ? p : null;
  }

  async send(actor: UserId, input: SendPulseInput): Promise<Pulse> {
    if (!input.respondent.includes("@")) throw new Error("feedback-loops: respondent email required");
    const t = input.sentAt ?? now();
    const p: Pulse = {
      id: makeId("pul"),
      agencyId: this.agencyId,
      clientId: this.clientId,
      sentAt: t,
      respondent: input.respondent,
      ...(input.comment !== undefined ? { comment: input.comment } : {}),
      createdBy: actor,
    };
    await this.storage.set(pulseKey(p.id), p);
    await pushIndex(this.storage, PULSE_INDEX, p.id);
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "feedback", action: "feedback.pulse.sent",
      message: `Pulse sent to ${input.respondent}`,
      metadata: { pulseId: p.id, respondent: input.respondent },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "feedback.pulse.sent", { id: p.id, respondent: input.respondent });
    return p;
  }

  async respond(id: string, input: RespondPulseInput): Promise<Pulse> {
    const cur = await this.get(id);
    if (!cur) throw new FeedbackNotFoundError();
    const score = Math.round(input.score);
    if (!Number.isFinite(score) || score < 1 || score > 10) {
      throw new Error("feedback-loops: score must be integer 1..10");
    }
    const t = input.respondedAt ?? now();
    const wasOutstanding = cur.respondedAt === undefined;
    const next: Pulse = {
      ...cur,
      score,
      ...(input.comment !== undefined ? { comment: input.comment } : (cur.comment !== undefined ? { comment: cur.comment } : {})),
      respondedAt: t,
    };
    // Honesty contract (chapter #68): later edits to score do NOT
    // overwrite a previously latched detractor flag — the moment of
    // truth is the FIRST response.
    if (wasOutstanding) {
      this.activity.logActivity({
        agencyId: this.agencyId, clientId: this.clientId,
        category: "feedback", action: "feedback.pulse.received",
        message: `Pulse received: ${score}/10 from ${cur.respondent}`,
        metadata: { pulseId: id, score, respondent: cur.respondent },
      });
      this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
        "feedback.pulse.received", { id, score, respondent: cur.respondent });
      if (score < DETRACTOR_CUTOFF) {
        next.detractorEmittedAt = t;
        this.activity.logActivity({
          agencyId: this.agencyId, clientId: this.clientId,
          category: "feedback", action: "feedback.detractor",
          message: `Detractor pulse received: ${score}/10 from ${cur.respondent}`,
          metadata: { pulseId: id, score, severity: "high" },
        });
        this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
          "feedback.detractor", { id, score, respondent: cur.respondent });
      }
    }
    await this.storage.set(pulseKey(id), next);
    return next;
  }

  async summary(refNow: number = now()): Promise<PulseSummary> {
    const pulses = await this.list();
    const totalSent = pulses.length;
    const responded = pulses.filter(p => p.score !== undefined);
    const totalResponded = responded.length;
    const responseRate = totalSent === 0 ? 0 : totalResponded / totalSent;
    const avgScore = totalResponded === 0
      ? undefined
      : responded.reduce((acc, p) => acc + (p.score ?? 0), 0) / totalResponded;
    const detractors = responded.filter(p => (p.score ?? 0) < DETRACTOR_CUTOFF).length;
    const promoters = responded.filter(p => (p.score ?? 0) >= PROMOTER_CUTOFF).length;
    const passives = totalResponded - detractors - promoters;

    // 12-month trailing trendline.
    const months = new Map<string, PulseMonth>();
    for (let m = 0; m < 12; m++) {
      const ts = new Date(refNow);
      ts.setUTCMonth(ts.getUTCMonth() - m);
      const k = monthKey(ts.getTime());
      months.set(k, { month: k, sent: 0, responded: 0 });
    }
    for (const p of pulses) {
      const k = monthKey(p.sentAt);
      const row = months.get(k);
      if (!row) continue;
      row.sent++;
      if (p.score !== undefined) {
        row.responded++;
        // Average rolled in via accumulator at the end.
        row.avgScore = ((row.avgScore ?? 0) * (row.responded - 1) + p.score) / row.responded;
      }
    }
    const byMonth = [...months.values()].sort((a, b) => b.month.localeCompare(a.month));

    const out: PulseSummary = {
      totalSent, totalResponded, responseRate,
      detractors, passives, promoters, byMonth,
    };
    if (avgScore !== undefined) out.avgScore = avgScore;
    return out;
  }
}

// ── Testimonial ───────────────────────────────────────────────

export interface TestimonialDeps {
  agencyId: AgencyId;
  clientId: ClientId;
  storage: StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
}

export class TestimonialService {
  private readonly agencyId: AgencyId;
  private readonly clientId: ClientId;
  private readonly storage: StoragePort;
  private readonly activity: ActivityLogPort;
  private readonly events: EventBusPort;

  constructor(deps: TestimonialDeps) {
    this.agencyId = deps.agencyId;
    this.clientId = deps.clientId;
    this.storage = deps.storage;
    this.activity = deps.activity;
    this.events = deps.events;
  }

  private inScope(t: TestimonialRequest): boolean {
    return t.agencyId === this.agencyId && t.clientId === this.clientId;
  }

  async list(filter: { status?: TestimonialStatus; publicOnly?: boolean } = {}): Promise<TestimonialRequest[]> {
    const ids = (await this.storage.get<string[]>(TEST_INDEX)) ?? [];
    const out: TestimonialRequest[] = [];
    for (const id of ids) {
      const t = await this.storage.get<TestimonialRequest>(testKey(id));
      if (!t || !this.inScope(t)) continue;
      if (filter.status && t.status !== filter.status) continue;
      if (filter.publicOnly && t.status !== "public") continue;
      out.push(t);
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<TestimonialRequest | null> {
    const t = await this.storage.get<TestimonialRequest>(testKey(id));
    return t && this.inScope(t) ? t : null;
  }

  async request(actor: UserId, input: RequestTestimonialInput): Promise<TestimonialRequest> {
    if (!input.prompt.trim()) throw new Error("feedback-loops: prompt required");
    if (!input.respondent.includes("@")) throw new Error("feedback-loops: respondent email required");
    const t = now();
    const tr: TestimonialRequest = {
      id: makeId("test"),
      agencyId: this.agencyId,
      clientId: this.clientId,
      prompt: input.prompt.trim(),
      status: "pending",
      respondent: input.respondent,
      createdBy: actor,
      createdAt: t, updatedAt: t,
    };
    await this.storage.set(testKey(tr.id), tr);
    await pushIndex(this.storage, TEST_INDEX, tr.id);
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "feedback", action: "feedback.testimonial.requested",
      message: `Testimonial requested from ${input.respondent}`,
      metadata: { testimonialId: tr.id, respondent: input.respondent },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "feedback.testimonial.requested", { id: tr.id, respondent: input.respondent });
    return tr;
  }

  async reply(id: string, input: ReplyTestimonialInput): Promise<TestimonialRequest> {
    const cur = await this.get(id);
    if (!cur) throw new FeedbackNotFoundError();
    if (!input.reply.trim()) throw new Error("feedback-loops: reply required");
    if (cur.status !== "pending") {
      throw new InvalidTestimonialTransitionError(cur.status, "replied");
    }
    const t = input.repliedAt ?? now();
    const next: TestimonialRequest = {
      ...cur,
      status: "replied",
      reply: input.reply.trim(),
      repliedAt: t,
      updatedAt: t,
    };
    await this.storage.set(testKey(id), next);
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId,
      category: "feedback", action: "feedback.testimonial.replied",
      message: `Testimonial reply from ${cur.respondent}`,
      metadata: { testimonialId: id, respondent: cur.respondent },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "feedback.testimonial.replied", { id, respondent: cur.respondent });
    return next;
  }

  async transition(actor: UserId, id: string, to: TestimonialStatus): Promise<TestimonialRequest> {
    const cur = await this.get(id);
    if (!cur) throw new FeedbackNotFoundError();
    const allowed = TESTIMONIAL_TRANSITIONS[cur.status];
    if (!allowed.includes(to)) throw new InvalidTestimonialTransitionError(cur.status, to);
    const t = now();
    const next: TestimonialRequest = {
      ...cur,
      status: to,
      approvedAt: to === "approved" && !cur.approvedAt ? t : cur.approvedAt,
      publishedAt: to === "public" && !cur.publishedAt ? t : cur.publishedAt,
      updatedAt: t,
    };
    await this.storage.set(testKey(id), next);
    if (cur.status !== to) {
      const action = `feedback.testimonial.${to}`;
      this.activity.logActivity({
        agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
        category: "feedback", action,
        message: `Testimonial ${cur.respondent}: ${cur.status} → ${to}`,
        metadata: { testimonialId: id, from: cur.status, to },
      });
      this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
        action, { id, respondent: cur.respondent, from: cur.status, to });
    }
    return next;
  }

  async approve(actor: UserId, id: string): Promise<TestimonialRequest> {
    return this.transition(actor, id, "approved");
  }
  async markPublic(actor: UserId, id: string): Promise<TestimonialRequest> {
    return this.transition(actor, id, "public");
  }

  async delete(actor: UserId, id: string): Promise<void> {
    const cur = await this.get(id);
    if (!cur) throw new FeedbackNotFoundError();
    await this.storage.del(testKey(id));
    await removeFromIndex(this.storage, TEST_INDEX, id);
    this.activity.logActivity({
      agencyId: this.agencyId, clientId: this.clientId, actorUserId: actor,
      category: "feedback", action: "feedback.testimonial.deleted",
      message: `Testimonial deleted (${cur.respondent})`,
      metadata: { testimonialId: id },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: this.clientId },
      "feedback.testimonial.deleted", { id });
  }
}
