// Public-funnel service.
//
// Storage layout (single agency-scoped install — gated to the master
// "Milesy Media" agencyId until `scopePolicy: "global"` lands):
//   captures/index             → string[] of capture ids
//   captures/by-id/<id>        → LeadCapture
//   captures/by-email/<email>  → string[] of capture ids
//                                (canonical lowercased email key)

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CaptureHcInput,
  CaptureResult,
  CaptureToolInput,
  HCSlot,
  LeadCapture,
  LeadSource,
  MeContext,
} from "../lib/domain";
import { bucketHcSlot, canonEmail, isPlausibleEmail } from "../lib/domain";
import type {
  ActivityLogPort,
  EventBusPort,
  LeadUserPort,
  SessionPort,
  StoragePort,
} from "./ports";

const CAPTURE_INDEX = "captures/index";
const captureKey = (id: string): string => `captures/by-id/${id}`;
const captureEmailKey = (email: string): string => `captures/by-email/${canonEmail(email)}`;

export class FunnelInputError extends Error {
  constructor(message: string) { super(message); this.name = "FunnelInputError"; }
}

async function pushIndex(storage: StoragePort, key: string, id: string): Promise<void> {
  const ids = (await storage.get<string[]>(key)) ?? [];
  if (!ids.includes(id)) await storage.set(key, [...ids, id]);
}

export interface FunnelDeps {
  agencyId: AgencyId;
  storage: StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  leadUsers: LeadUserPort;
  sessions?: SessionPort;
}

export class FunnelService {
  private readonly agencyId: AgencyId;
  private readonly storage: StoragePort;
  private readonly activity: ActivityLogPort;
  private readonly events: EventBusPort;
  private readonly leadUsers: LeadUserPort;
  private readonly sessions?: SessionPort;

  constructor(deps: FunnelDeps) {
    this.agencyId = deps.agencyId;
    this.storage = deps.storage;
    this.activity = deps.activity;
    this.events = deps.events;
    this.leadUsers = deps.leadUsers;
    if (deps.sessions) this.sessions = deps.sessions;
  }

  // ── Captures ─────────────────────────────────────────────────

  async captureHcCompletion(input: CaptureHcInput): Promise<CaptureResult> {
    if (!isPlausibleEmail(input.email)) throw new FunnelInputError("invalid_email");
    return this.doCapture("hc", canonEmail(input.email), {
      sourceMeta: { ...(input.sourceMeta ?? {}), hcSlot: input.slot },
      hcSlot: input.slot,
    });
  }

  async captureToolCompletion(input: CaptureToolInput): Promise<CaptureResult> {
    if (!isPlausibleEmail(input.email)) throw new FunnelInputError("invalid_email");
    if (!input.toolId) throw new FunnelInputError("toolId_required");
    return this.doCapture("tool", canonEmail(input.email), {
      sourceMeta: {
        ...(input.sourceMeta ?? {}),
        toolId: input.toolId,
        ...(input.input !== undefined ? { input: input.input } : {}),
        ...(input.output !== undefined ? { output: input.output } : {}),
      },
    });
  }

  private async doCapture(
    source: LeadSource,
    email: string,
    args: { sourceMeta: Record<string, unknown>; hcSlot?: HCSlot },
  ): Promise<CaptureResult> {
    const t = now();
    const upsert = await Promise.resolve(this.leadUsers.upsertLeadByEmail(email));
    const leadUserId = upsert.user.id;

    const capture: LeadCapture = {
      id: makeId("lc"),
      source,
      leadUserId,
      email,
      capturedAt: t,
      sourceMeta: args.sourceMeta,
      ...(args.hcSlot !== undefined ? { hcSlot: args.hcSlot } : {}),
    };
    await this.storage.set(captureKey(capture.id), capture);
    await pushIndex(this.storage, CAPTURE_INDEX, capture.id);
    await pushIndex(this.storage, captureEmailKey(email), capture.id);

    if (upsert.created) {
      this.activity.logActivity({
        agencyId: this.agencyId, actorUserId: leadUserId, actorEmail: email,
        category: "public-funnel", action: "public-funnel.lead.captured",
        message: `Lead captured (${source}): ${email}`,
        metadata: { captureId: capture.id, source, leadUserId },
      });
      this.events.emit({ agencyId: this.agencyId },
        "public-funnel.lead.captured",
        { id: capture.id, leadUserId, email, source });
    }

    if (source === "hc") {
      const bucket = bucketHcSlot(args.hcSlot);
      this.activity.logActivity({
        agencyId: this.agencyId, actorUserId: leadUserId, actorEmail: email,
        category: "public-funnel", action: "public-funnel.hc.completed",
        message: `Health Check completed: ${email}${bucket ? ` (${bucket})` : ""}`,
        metadata: { captureId: capture.id, leadUserId, bucket, slot: args.hcSlot?.slot },
      });
      this.events.emit({ agencyId: this.agencyId },
        "public-funnel.hc.completed",
        { id: capture.id, leadUserId, email, bucket, slot: args.hcSlot });
    } else if (source === "tool") {
      this.events.emit({ agencyId: this.agencyId },
        "public-funnel.tool.completed",
        { id: capture.id, leadUserId, email, toolId: args.sourceMeta.toolId });
    }

    let session: string | undefined;
    if (this.sessions) {
      session = await Promise.resolve(this.sessions.issueSession(leadUserId));
    }

    const result: CaptureResult = {
      capture, leadUserId, created: upsert.created,
      ...(session !== undefined ? { session } : {}),
    };
    return result;
  }

  // ── Reads ───────────────────────────────────────────────────

  async listByEmail(email: string): Promise<LeadCapture[]> {
    const ids = (await this.storage.get<string[]>(captureEmailKey(email))) ?? [];
    const out: LeadCapture[] = [];
    for (const id of ids) {
      const c = await this.storage.get<LeadCapture>(captureKey(id));
      if (c) out.push(c);
    }
    return out.sort((a, b) => b.capturedAt - a.capturedAt);
  }

  async list(filter: { source?: LeadSource } = {}): Promise<LeadCapture[]> {
    const ids = (await this.storage.get<string[]>(CAPTURE_INDEX)) ?? [];
    const out: LeadCapture[] = [];
    for (const id of ids) {
      const c = await this.storage.get<LeadCapture>(captureKey(id));
      if (!c) continue;
      if (filter.source && c.source !== filter.source) continue;
      out.push(c);
    }
    return out.sort((a, b) => b.capturedAt - a.capturedAt);
  }

  async meContext(leadUserId: UserId): Promise<MeContext | null> {
    const all = await this.list();
    const own = all.filter(c => c.leadUserId === leadUserId);
    if (own.length === 0) return null;
    const newestHc = own.find(c => c.source === "hc" && c.hcSlot);
    const first = own[0]!;
    const ctx: MeContext = {
      leadUserId,
      email: first.email,
      captures: own,
      ...(newestHc?.hcSlot ? { hcSlot: newestHc.hcSlot } : {}),
    };
    return ctx;
  }
}
