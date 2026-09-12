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
  PendingCapturePromotion,
  PromotePendingCaptureInput,
  PromotePendingCaptureResult,
} from "../lib/domain";
import { bucketHcSlot, canonEmail, isPlausibleEmail } from "../lib/domain";
import type {
  ActivityLogPort,
  EventBusPort,
  LeadUserPort,
  PendingCapturePromotionAuthorityPort,
  PendingCapturePromotionPort,
  StoragePort,
} from "./ports";

const CAPTURE_INDEX = "captures/index";
const captureKey = (id: string): string => `captures/by-id/${id}`;
const captureEmailKey = (email: string): string => `captures/by-email/${canonEmail(email)}`;

export interface FunnelErasureResult {
  erased: number;
  reviewRequired: {
    legacyUnscoped: number;
    sharedIdentity: number;
  };
}

export interface FunnelErasureSubject {
  clientId: string;
  personId?: string;
  personShared: boolean;
  emails: readonly string[];
  sharedEmails: readonly string[];
}

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

function assertHcSlot(slot: HCSlot): void {
  if (!slot || typeof slot !== "object" || Array.isArray(slot)) {
    throw new FunnelInputError("invalid_hc_slot");
  }
  if (!Number.isInteger(slot.slot) || Number(slot.slot) < 1 || Number(slot.slot) > 5) {
    throw new FunnelInputError("invalid_hc_slot");
  }
  let encoded: string;
  try {
    encoded = JSON.stringify(slot);
  } catch {
    throw new FunnelInputError("invalid_hc_slot");
  }
  if (encoded.length > 64 * 1024) throw new FunnelInputError("invalid_hc_slot");
}

export interface FunnelDeps {
  agencyId: AgencyId;
  installId: string;
  storage: StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  leadUsers: LeadUserPort;
  promotionAuthority: PendingCapturePromotionAuthorityPort;
  promotions: PendingCapturePromotionPort;
}

export class FunnelService {
  private readonly agencyId: AgencyId;
  private readonly installId: string;
  private readonly storage: StoragePort;
  private readonly activity: ActivityLogPort;
  private readonly events: EventBusPort;
  private readonly leadUsers: LeadUserPort;
  private readonly promotionAuthority: PendingCapturePromotionAuthorityPort;
  private readonly promotions: PendingCapturePromotionPort;

  constructor(deps: FunnelDeps) {
    this.agencyId = deps.agencyId;
    this.installId = deps.installId;
    this.storage = deps.storage;
    this.activity = deps.activity;
    this.events = deps.events;
    this.leadUsers = deps.leadUsers;
    this.promotionAuthority = deps.promotionAuthority;
    this.promotions = deps.promotions;
  }

  // ── Captures ─────────────────────────────────────────────────

  async captureHcCompletion(input: CaptureHcInput): Promise<CaptureResult> {
    if (!isPlausibleEmail(input.email)) throw new FunnelInputError("invalid_email");
    assertHcSlot(input.slot);
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
    // Cheap deterministic replay/conflict refusal before identity lookup. The
    // same check is repeated inside the durable foundation transaction below.
    const previous = await this.storage.get<LeadCapture>(captureKey(captureId));
    if (previous) {
      throw new FunnelInputError(
        previous.email === email && previous.source === source
          ? "completion_id_replayed"
          : "completion_id_conflict",
      );
    }
    const registration = await this.leadUsers.withPendingLeadByEmail(
      email,
      createPendingLead => this.doCaptureExclusive(source, email, captureId, args, createPendingLead),
    );
    if (!registration.created) {
      // This includes existing leads. Only a separately verified mailbox flow
      // may authenticate or append to an existing identity.
      throw new FunnelInputError("identity_unavailable");
    }
    return registration.value;
  }

  private async doCaptureExclusive(
    source: LeadSource,
    email: string,
    captureId: string,
    args: { sourceMeta: Record<string, unknown>; hcSlot?: HCSlot },
    createPendingLead: () => { id: string },
  ): Promise<CaptureResult> {
    const previous = await this.storage.get<LeadCapture>(captureKey(captureId));
    if (previous) {
      if (previous.email !== email || previous.source !== source) {
        throw new FunnelInputError("completion_id_conflict");
      }
      // A caller-chosen operation id is not authentication. Never return a
      // prior lead id or revive authority for a replayed anonymous request.
      throw new FunnelInputError("completion_id_replayed");
    }

    // Preserve the old canonical-address create-only semantics without
    // reserving the global login namespace. This executes inside the
    // foundation transaction, so a racing canonical spelling cannot append a
    // second pending capture.
    if ((await this.listByEmail(email)).length > 0) {
      throw new FunnelInputError("identity_unavailable");
    }

    const t = now();
    const pendingLeadId = createPendingLead().id;

    const capture: LeadCapture = {
      id: captureId,
      source,
      pendingLeadId,
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
      throw new FunnelInputError("completion_id_replayed");
    }

    this.activity.logActivity({
        // No actor identity: a pending lead is capture data, never a User.
        agencyId: this.agencyId,
        category: "public-funnel", action: "public-funnel.capture.pending",
        // No address in the message: this install is agency-scoped, so its
        // entries carry no `clientId` and the erasure sweep (clientId-only)
        // could never scrub them. The metadata carries the capture id.
        message: `Lead captured (${source}).`,
        metadata: { captureId: capture.id, source },
    });
    const bucket = source === "hc" ? bucketHcSlot(args.hcSlot) : undefined;
    this.events.emit(
      { agencyId: this.agencyId },
      "public-funnel.capture.pending",
      {
        captureId: capture.id,
        source,
        ...(bucket ? { bucket } : {}),
        ...(source === "tool" && typeof args.sourceMeta.toolId === "string"
          ? { toolId: args.sourceMeta.toolId }
          : {}),
      },
    );

    if (source === "hc") {
      this.activity.logActivity({
        agencyId: this.agencyId,
        category: "public-funnel", action: "public-funnel.hc.completed",
        message: `Health Check completed${bucket ? ` (${bucket})` : ""}.`,
        metadata: { captureId: capture.id, bucket, slot: args.hcSlot?.slot },
      });
    }

    const result: CaptureResult = {
      capture, pendingLeadId, created: true,
    };
    return result;
  }

  /**
   * Convert one exact pending row into CRM lineage after a trusted caller has
   * established mailbox ownership or authenticated operator authority. There
   * is deliberately no anonymous route to this command.
   */
  async promotePendingCapture(input: PromotePendingCaptureInput): Promise<PromotePendingCaptureResult> {
    const captureId = input.captureId.trim();
    if (!captureId || !this.storage.runExclusive) {
      throw new FunnelInputError("promotion_unavailable");
    }
    if (!input.credential
      || (input.credential.kind !== "mailbox-proof"
        && input.credential.kind !== "authenticated")) {
      throw new FunnelInputError("promotion_authority_refused");
    }
    const candidate = await this.storage.get<LeadCapture>(captureKey(captureId));
    if (!candidate) throw new FunnelInputError("capture_not_found");
    const authority = await this.promotionAuthority.verify({
      agencyId: this.agencyId,
      installId: this.installId,
      captureId: candidate.id,
      captureEmail: candidate.email,
      credential: input.credential,
    });
    if (!authority || authority.kind !== input.credential.kind) {
      throw new FunnelInputError("promotion_authority_refused");
    }
    const operationId = authority.operationId.trim();
    if (!/^[a-zA-Z0-9:_-]{8,160}$/.test(operationId)) {
      throw new FunnelInputError("invalid_promotion_operation");
    }

    return this.storage.runExclusive(`capture-promotion:${captureId}`, async () => {
      const capture = await this.storage.get<LeadCapture>(captureKey(captureId));
      if (!capture) throw new FunnelInputError("capture_not_found");
      if (capture.email !== candidate.email) throw new FunnelInputError("capture_authority_changed");
      const authorityOperationId = `${authority.kind}:${operationId}`;
      if (capture.promotion) {
        if (capture.promotion.operationId !== authorityOperationId) {
          throw new FunnelInputError("capture_already_promoted");
        }
        return { capture, promotion: capture.promotion, promoted: false };
      }
      if (!capture.pendingLeadId) throw new FunnelInputError("capture_not_pending");
      if (authority.kind === "mailbox-proof"
        && canonEmail(authority.verifiedEmail ?? "") !== capture.email) {
        throw new FunnelInputError("mailbox_proof_mismatch");
      }
      const actorUserId = authority.actorUserId.trim();
      if (!actorUserId) throw new FunnelInputError("promotion_actor_required");

      const lineage = await this.promotions.promote({
        agencyId: this.agencyId,
        captureId: capture.id,
        email: capture.email,
        source: capture.source,
        actorUserId,
        profile: input.profile,
      });
      const promotion: PendingCapturePromotion = {
        operationId: authorityOperationId,
        authorityKind: authority.kind,
        promotedAt: now(),
        leadId: lineage.leadId,
        personId: lineage.personId,
        prospectId: lineage.prospectId,
        pipelineCardId: lineage.pipelineCardId,
      };
      const { pendingLeadId: _retiredPendingId, ...captureWithoutPending } = capture;
      const promotedCapture: LeadCapture = {
        ...captureWithoutPending,
        personId: lineage.personId,
        promotion,
      };
      await this.storage.set(captureKey(capture.id), promotedCapture);
      await this.activity.logActivity({
        agencyId: this.agencyId,
        actorUserId: authority.kind === "authenticated" ? actorUserId : undefined,
        category: "public-funnel",
        action: "public-funnel.capture.promoted",
        message: "Pending capture promoted into the CRM.",
        metadata: {
          captureId: capture.id,
          leadId: lineage.leadId,
          personId: lineage.personId,
          prospectId: lineage.prospectId,
        },
      });
      this.events.emit(
        { agencyId: this.agencyId },
        "public-funnel.capture.promoted",
        {
          captureId: capture.id,
          source: capture.source,
          leadId: lineage.leadId,
          personId: lineage.personId,
          ...(lineage.prospectId ? { prospectId: lineage.prospectId } : {}),
          ...(lineage.pipelineCardId ? { pipelineCardId: lineage.pipelineCardId } : {}),
          authorityKind: authority.kind,
        },
      );
      return { capture: promotedCapture, promotion, promoted: true };
    });
  }

  /**
   * Delete one exact pending capture and every durable derivative linked by
   * its id. Promoted rows fail closed into the linked CRM erasure workflow;
   * deleting only their capture would discard the ownership linkage while
   * leaving the Person/Lead behind.
   * The caller must establish erasure authority before invoking this server-
   * only command; there is deliberately no address-selected public route.
   */
  async eraseExactCapture(captureIdInput: string): Promise<{ erased: boolean; recordsErased: number }> {
    const captureId = captureIdInput.trim();
    if (!captureId || !this.storage.runExclusive) {
      throw new FunnelInputError("capture_erasure_unavailable");
    }
    return this.storage.runExclusive(`capture-erasure:${captureId}`, async () => {
      const capture = await this.storage.get<LeadCapture>(captureKey(captureId));
      if (!capture) return { erased: false, recordsErased: 0 };
      if (capture.promotion || capture.personId || !capture.pendingLeadId) {
        throw new FunnelInputError("capture_erasure_requires_promoted_lineage");
      }
      await this.storage.del(captureKey(capture.id));
      const index = (await this.storage.get<string[]>(CAPTURE_INDEX)) ?? [];
      await this.storage.set(CAPTURE_INDEX, index.filter(value => value !== capture.id));
      if (!(await this.listByEmail(capture.email)).length) {
        await this.storage.del(captureEmailKey(capture.email));
      }
      const artifacts = await this.leadUsers.eraseCaptureArtifacts({
        agencyId: this.agencyId,
        captureIds: [capture.id],
      });
      return { erased: true, recordsErased: 1 + artifacts.recordsErased };
    });
  }

  // Right-to-be-forgotten. Historical captures are pre-client and therefore
  // unscoped; matching their email is not ownership. Preserve those rows for
  // review and delete only a future/backfilled exact client or exclusive
  // reciprocal-Person stamp.
  async eraseForClient(subject: FunnelErasureSubject): Promise<FunnelErasureResult> {
    const wanted = new Set(subject.emails.map(canonEmail).filter(Boolean));
    const shared = new Set(subject.sharedEmails.map(canonEmail).filter(Boolean));
    const captures = await this.list();
    const reviewRequired = { legacyUnscoped: 0, sharedIdentity: 0 };
    const erasedAddresses = new Set<string>();
    const erasedCaptureIds: string[] = [];
    const erasedCapturesByUser = new Map<string, { emails: Set<string> }>();
    const legacyUserReviews = new Set<string>();
    const sharedUserReviews = new Set<string>();
    let erased = 0;
    for (const capture of captures) {
      const conflictingPerson = Boolean(subject.personId && capture.personId && capture.personId !== subject.personId);
      const exactClient = capture.clientId === subject.clientId && !conflictingPerson;
      const exactExclusivePerson = Boolean(subject.personId && !subject.personShared
        && capture.personId === subject.personId
        && (!capture.clientId || capture.clientId === subject.clientId));
      if (!exactClient && !exactExclusivePerson) {
        const matchingAddress = wanted.has(canonEmail(capture.email));
        const sharedPerson = Boolean(subject.personShared && subject.personId
          && capture.personId === subject.personId);
        if (!matchingAddress && !sharedPerson && capture.clientId !== subject.clientId) continue;
        const sharedIdentity = Boolean(sharedPerson
          || conflictingPerson
          || shared.has(canonEmail(capture.email))
          || (capture.clientId && capture.clientId !== subject.clientId)
          || (capture.personId && capture.personId !== subject.personId));
        if (sharedIdentity) {
          reviewRequired.sharedIdentity++;
          if (capture.leadUserId) {
            legacyUserReviews.delete(capture.leadUserId);
            sharedUserReviews.add(capture.leadUserId);
          }
        } else {
          reviewRequired.legacyUnscoped++;
          if (capture.leadUserId && !sharedUserReviews.has(capture.leadUserId)) {
            legacyUserReviews.add(capture.leadUserId);
          }
        }
        continue;
      }
      await this.storage.del(captureKey(capture.id));
      erasedCaptureIds.push(capture.id);
      erasedAddresses.add(canonEmail(capture.email));
      if (capture.leadUserId) {
        const group = erasedCapturesByUser.get(capture.leadUserId) ?? { emails: new Set<string>() };
        group.emails.add(canonEmail(capture.email));
        erasedCapturesByUser.set(capture.leadUserId, group);
      }
      const index = (await this.storage.get<string[]>(CAPTURE_INDEX)) ?? [];
      await this.storage.set(CAPTURE_INDEX, index.filter(value => value !== capture.id));
      erased++;
    }
    for (const address of erasedAddresses) {
      if (!(await this.listByEmail(address)).length) await this.storage.del(captureEmailKey(address));
    }
    if (erasedCaptureIds.length) {
      await this.leadUsers.eraseCaptureArtifacts({
        agencyId: this.agencyId,
        captureIds: erasedCaptureIds,
      });
    }
    for (const [userId, group] of erasedCapturesByUser) {
      const cleanup = await this.leadUsers.eraseIfUnreferenced({
        userId,
        // Multiple addresses claiming the same user are corrupt ownership
        // evidence. An empty value makes the adapter preserve for review.
        email: group.emails.size === 1 ? [...group.emails][0]! : "",
      });
      if (cleanup.status === "preserved") {
        legacyUserReviews.delete(userId);
        sharedUserReviews.add(userId);
      }
    }
    reviewRequired.legacyUnscoped += legacyUserReviews.size;
    reviewRequired.sharedIdentity += sharedUserReviews.size;
    if (erased) {
      await this.activity.logActivity({
        agencyId: this.agencyId,
        category: "public-funnel",
        action: "public-funnel.captures.erased",
        message: `Erased ${erased} funnel capture${erased === 1 ? "" : "s"} for a client erasure.`,
        metadata: { erased },
      });
    }
    return { erased, reviewRequired };
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
