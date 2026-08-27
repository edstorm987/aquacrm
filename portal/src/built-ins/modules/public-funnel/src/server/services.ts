// Public-funnel service.
//
// Storage layout (single agency-scoped install — gated to the master
// "Milesy Media" agencyId until `scopePolicy: "global"` lands):
//   captures/by-id/<id>        → authoritative LeadCapture
//
// Legacy installs can also contain `captures/index` and
// `captures/by-email/<email>`. Reads derive from the authoritative rows so an
// interrupted or racing index update cannot hide an accepted completion;
// erasure still removes the old pointers.

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

function operationCaptureId(source: LeadSource, completionId?: string): string {
  if (!completionId) return makeId("lc");
  const clean = completionId.trim();
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(clean)) {
    throw new FunnelInputError("invalid_completion_id");
  }
  return `lc_${source}_${clean}`;
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
      completionId: input.completionId,
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
      completionId: input.completionId,
    });
  }

  private async doCapture(
    source: LeadSource,
    email: string,
    args: { sourceMeta: Record<string, unknown>; hcSlot?: HCSlot; completionId?: string },
  ): Promise<CaptureResult> {
    const captureId = operationCaptureId(source, args.completionId);
    const previous = await this.storage.get<LeadCapture>(captureKey(captureId));
    if (previous) {
      if (previous.email !== email || previous.source !== source) {
        throw new FunnelInputError("completion_id_conflict");
      }
      const previousSession = this.sessions
        ? await Promise.resolve(this.sessions.issueSession(previous.leadUserId))
        : undefined;
      return {
        capture: previous,
        leadUserId: previous.leadUserId,
        created: false,
        ...(previousSession !== undefined ? { session: previousSession } : {}),
      };
    }

    const t = now();
    const upsert = await Promise.resolve(this.leadUsers.upsertLeadByEmail(email));
    const leadUserId = upsert.user.id;

    const capture: LeadCapture = {
      id: captureId,
      source,
      leadUserId,
      email,
      capturedAt: t,
      sourceMeta: args.sourceMeta,
      ...(args.hcSlot !== undefined ? { hcSlot: args.hcSlot } : {}),
    };
    const inserted = this.storage.setIfAbsent
      ? await this.storage.setIfAbsent(captureKey(capture.id), capture)
      : await (async () => {
          const raced = await this.storage.get<LeadCapture>(captureKey(capture.id));
          if (raced) return false;
          await this.storage.set(captureKey(capture.id), capture);
          return true;
        })();

    if (!inserted) {
      const raced = await this.storage.get<LeadCapture>(captureKey(capture.id));
      if (!raced || raced.email !== email || raced.source !== source) {
        throw new FunnelInputError("completion_id_conflict");
      }
      const racedSession = this.sessions
        ? await Promise.resolve(this.sessions.issueSession(raced.leadUserId))
        : undefined;
      return {
        capture: raced,
        leadUserId: raced.leadUserId,
        created: false,
        ...(racedSession !== undefined ? { session: racedSession } : {}),
      };
    }

    if (upsert.created) {
      this.activity.logActivity({
        // `actorEmail` is deliberately NOT set: it is a PII FIELD on every
        // activity entry, not just the message, and these entries carry no
        // `clientId` for the erasure sweep to match. `actorUserId` identifies
        // the lead user without naming them.
        agencyId: this.agencyId, actorUserId: leadUserId,
        category: "public-funnel", action: "public-funnel.lead.captured",
        // No address in the message: this install is agency-scoped, so its
        // entries carry no `clientId` and the erasure sweep (clientId-only)
        // could never scrub them. The metadata carries the capture id.
        message: `Lead captured (${source}).`,
        metadata: { captureId: capture.id, source, leadUserId },
      });
      this.events.emit({ agencyId: this.agencyId },
        "public-funnel.lead.captured",
        { id: capture.id, leadUserId, email, source });
    }

    if (source === "hc") {
      const bucket = bucketHcSlot(args.hcSlot);
      this.activity.logActivity({
        // `actorEmail` is deliberately NOT set: it is a PII FIELD on every
        // activity entry, not just the message, and these entries carry no
        // `clientId` for the erasure sweep to match. `actorUserId` identifies
        // the lead user without naming them.
        agencyId: this.agencyId, actorUserId: leadUserId,
        category: "public-funnel", action: "public-funnel.hc.completed",
        message: `Health Check completed${bucket ? ` (${bucket})` : ""}.`,
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

  // Right-to-be-forgotten: delete every capture made by one of `addresses`,
  // plus the `captures/by-email/<email>` pointer whose KEY NAME holds the
  // address (no value-scan can reach that). Called by `onEraseClient`.
  //
  // DELETE, not anonymise: a funnel capture is marketing PII — the policy's
  // clearest delete category. A capture carries NO `clientId` (it is made long
  // before the person is a client), so the address is the only link.
  //
  // Idempotent: a second run finds nothing and returns 0.
  async eraseForAddresses(addresses: readonly string[]): Promise<number> {
    let erased = 0;
    for (const address of new Set(addresses.map(a => canonEmail(a)).filter(Boolean))) {
      const captures = await this.listByEmail(address);
      for (const capture of captures) {
        await this.storage.del(captureKey(capture.id));
        // Legacy installs kept unlocked global/email indexes. Reads no longer
        // trust them, but erasure still cleans them when present.
        const index = (await this.storage.get<string[]>(CAPTURE_INDEX)) ?? [];
        await this.storage.set(CAPTURE_INDEX, index.filter(value => value !== capture.id));
        erased++;
      }
      await this.storage.del(captureEmailKey(address));
    }
    if (erased) {
      await this.activity.logActivity({
        agencyId: this.agencyId,
        category: "public-funnel",
        action: "public-funnel.captures.erased",
        message: `Erased ${erased} funnel capture${erased === 1 ? "" : "s"} for a client erasure.`,
        metadata: { erased },
      });
    }
    return erased;
  }

  // ── Reads ───────────────────────────────────────────────────

  async listByEmail(email: string): Promise<LeadCapture[]> {
    const canonical = canonEmail(email);
    return (await this.list()).filter(capture => capture.email === canonical);
  }

  async list(filter: { source?: LeadSource } = {}): Promise<LeadCapture[]> {
    const keys = await this.storage.list("captures/by-id/");
    const out: LeadCapture[] = [];
    for (const key of keys) {
      const c = await this.storage.get<LeadCapture>(key);
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
