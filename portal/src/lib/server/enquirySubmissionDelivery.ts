import "server-only";

import { randomBytes } from "node:crypto";
import { hostname } from "node:os";

import {
  checkpointAquaTagSubmissionWork,
  claimAquaTagSubmissionWork,
  safeDeliveryError,
  settleAquaTagSubmissionWork,
  type AquaTagWorkClaim,
  type AquaTagWorkStatus,
  type SubmissionClaimClient,
} from "@/lib/supabase/enquirySubmissionClaims";

/**
 * Downstream delivery for one accepted brand enquiry, orchestrated against the
 * database-native claim in `aqua_tag_submissions` (issues #87).
 *
 * The effects themselves — lead upsert, identity review, client ledger,
 * activity, notification, automation — are implemented where they always
 * were, in `api/public/brand-enquiry/route.ts`, and registered here at module
 * load. That keeps one implementation for both the durable path (this runner,
 * fenced by owner/token, checkpointed per effect) and the older process-local
 * fallback (`runBrandEnquiryEffectsInline`, no checkpoints, used only when the
 * migration is not applied). The scheduled inbox sweep recovers claims whose
 * owner died by importing the route module and calling
 * `processAquaTagSubmissionDeliveries`.
 *
 * Replay rules the runner enforces:
 *   - an effect recorded `done` is skipped and its recorded values reused;
 *   - a non-idempotent effect (the outbound notification) recorded `attempted`
 *     but never `done` is NOT repeated — the crash happened after the send may
 *     have gone out — and is recorded `unknown` instead, which the completion
 *     metadata then reports truthfully;
 *   - every other effect is idempotent by a stable key derived from the
 *     enquiry id, so re-running it after a crash is safe.
 */

export type BrandEnquiryChannel = "form" | "chatbot" | "support";

export interface BrandEnquiryWork {
  agencyId: string;
  founderUserId: string;
  installId: string;
  companyId: string;
  brandSlug: string;
  brandName: string;
  siteKey: string | null;
  siteName: string;
  propertyId: string;
  name: string;
  email: string | null;
  phone: string | null;
  contactMethod: string;
  services: string[];
  message: string;
  sourceUrl: string;
  campaign: string;
  channel: BrandEnquiryChannel;
  pagePath: string;
  routedClientId?: string;
  routedCompanyId?: string;
  capturedAt: string;
}

export type BrandEnquiryEffectName = "lead" | "identity" | "ledger" | "activity" | "notification" | "automation";

export const BRAND_ENQUIRY_EFFECT_ORDER: readonly BrandEnquiryEffectName[] = [
  "lead",
  "identity",
  "ledger",
  "activity",
  "notification",
  "automation",
];

/** Effects that reach outside Aqua and cannot be un-done or safely repeated. */
const NON_IDEMPOTENT_EFFECTS: ReadonlySet<BrandEnquiryEffectName> = new Set(["notification"]);

export type EffectRecord = Record<string, unknown>;
export type EffectRecords = Partial<Record<BrandEnquiryEffectName, EffectRecord>>;

export interface BrandEnquiryEffectContext {
  work: BrandEnquiryWork;
  enquiryId: string;
  /** Records of every effect already done, in order — a replay reads these. */
  effects: EffectRecords;
}

export type BrandEnquiryEffect = (context: BrandEnquiryEffectContext) => Promise<EffectRecord>;
export type BrandEnquiryEffectSet = Record<BrandEnquiryEffectName, BrandEnquiryEffect>;

export interface BrandEnquiryDeliveryRegistration {
  effects: BrandEnquiryEffectSet;
  /**
   * The service-role client factory the public route already owns. Passed as
   * a reference so the documented service-role call-site count is unchanged;
   * the sweep only ever runs work that route accepted.
   */
  adminClient: () => SubmissionClaimClient;
}

let registration: BrandEnquiryDeliveryRegistration | null = null;

export function registerBrandEnquiryDelivery(input: BrandEnquiryDeliveryRegistration): void {
  registration = input;
}

export function registeredBrandEnquiryEffects(): BrandEnquiryEffectSet | null {
  return registration?.effects ?? null;
}

let ownerId: string | null = null;

/** One stable owner per process; every claim this process takes carries it. */
export function deliveryOwnerId(): string {
  if (!ownerId) ownerId = `aqua-tag:${hostname()}:${process.pid}:${randomBytes(4).toString("hex")}`;
  return ownerId;
}

export type DeliveryState = "complete" | "pending" | "failed";

/** What a public receipt may truthfully say about downstream delivery. */
export function deliveryStateFor(workStatus: AquaTagWorkStatus | undefined): DeliveryState {
  if (workStatus === "complete") return "complete";
  if (workStatus === "dead") return "failed";
  return "pending";
}

function stringField(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** The persisted work payload, validated before anything runs on it. */
export function brandEnquiryWorkFrom(value: unknown): BrandEnquiryWork | null {
  const body = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!body) return null;
  const required = ["agencyId", "founderUserId", "installId", "companyId", "brandSlug", "brandName", "name", "contactMethod", "capturedAt"];
  for (const key of required) {
    if (typeof body[key] !== "string" || !(body[key] as string).trim()) return null;
  }
  const channel = body.channel;
  if (channel !== "form" && channel !== "chatbot" && channel !== "support") return null;
  return {
    agencyId: body.agencyId as string,
    founderUserId: body.founderUserId as string,
    installId: body.installId as string,
    companyId: body.companyId as string,
    brandSlug: body.brandSlug as string,
    brandName: body.brandName as string,
    siteKey: typeof body.siteKey === "string" ? body.siteKey : null,
    siteName: stringField(body.siteName, body.brandName as string),
    propertyId: stringField(body.propertyId, body.brandSlug as string),
    name: body.name as string,
    email: typeof body.email === "string" && body.email ? body.email : null,
    phone: typeof body.phone === "string" && body.phone ? body.phone : null,
    contactMethod: body.contactMethod as string,
    services: Array.isArray(body.services) ? body.services.filter((item): item is string => typeof item === "string") : [],
    message: stringField(body.message),
    sourceUrl: stringField(body.sourceUrl),
    campaign: stringField(body.campaign),
    channel,
    pagePath: stringField(body.pagePath, "/"),
    routedClientId: typeof body.routedClientId === "string" && body.routedClientId ? body.routedClientId : undefined,
    routedCompanyId: typeof body.routedCompanyId === "string" && body.routedCompanyId ? body.routedCompanyId : undefined,
    capturedAt: body.capturedAt as string,
  };
}

/**
 * The completion patch for brand_enquiries.metadata, read from the effect
 * records so a replayed delivery reports what actually happened rather than
 * what the first attempt intended.
 */
export function completionMetadataPatch(work: BrandEnquiryWork, effects: EffectRecords, completedAt = new Date().toISOString()): Record<string, unknown> {
  const lead = effects.lead ?? {};
  const identity = effects.identity ?? {};
  const leadId = typeof lead.leadId === "string" ? lead.leadId : null;
  const clientId = typeof identity.clientId === "string" ? identity.clientId : null;
  const resolvedAt = typeof identity.resolvedAt === "string" ? identity.resolvedAt : completedAt;
  return {
    notification: stringField(effects.notification?.notification, effects.notification?.status === "unknown" ? "unknown" : "not-configured"),
    automation: stringField(effects.automation?.automation, "not-configured"),
    source: `website:${work.brandSlug}`,
    leadId,
    leadCreated: Boolean(leadId),
    leadLinkedAt: leadId ? completedAt : null,
    clientId,
    clientLinkedAt: clientId ? resolvedAt : null,
    identityResolution: {
      status: stringField(identity.resolutionStatus, "unmatched"),
      confidence: typeof identity.confidence === "number" ? identity.confidence : 0,
      explanation: stringField(identity.explanation),
      clientId,
      clientName: typeof identity.clientName === "string" ? identity.clientName : null,
      resolvedAt,
    },
    ingestionState: "complete",
    ingestionCompletedAt: completedAt,
    deliveryState: "complete",
  };
}

/**
 * The older path: every effect in order, no checkpoints. Only used when the
 * durable boundary is unavailable; a crash mid-way replays everything on the
 * next retry, which is exactly the weaker guarantee the fallback reports.
 */
export async function runBrandEnquiryEffectsInline(
  effects: BrandEnquiryEffectSet,
  context: { work: BrandEnquiryWork; enquiryId: string },
): Promise<EffectRecords> {
  const records: EffectRecords = {};
  for (const name of BRAND_ENQUIRY_EFFECT_ORDER) {
    records[name] = { ...(await effects[name]({ ...context, effects: records })), status: "done" };
  }
  return records;
}

export type ClaimedWorkResult =
  | { outcome: "complete"; delivery: "complete"; effects: EffectRecords }
  | { outcome: "retry"; delivery: "pending"; error: string; attempts: number }
  | { outcome: "dead"; delivery: "failed"; error: string }
  | { outcome: "lease-lost"; delivery: "pending"; effect?: BrandEnquiryEffectName };

/**
 * Run one claimed delivery to completion, or as far as its lease allows.
 *
 * A checkpoint or settle that answers "lease lost" stops the run immediately:
 * another owner has already reclaimed the row after our lease expired and may
 * be replaying, so continuing would double effects. A transport failure while
 * talking to the database propagates — the claim stays leased and a later
 * sweep recovers it after expiry, which is the crash-recovery contract.
 */
export async function runClaimedAquaTagSubmissionWork(
  client: SubmissionClaimClient,
  claim: AquaTagWorkClaim,
  effects: BrandEnquiryEffectSet,
): Promise<ClaimedWorkResult> {
  const work = brandEnquiryWorkFrom(claim.brand);
  if (!work || !claim.enquiryId) {
    const error = !claim.enquiryId ? "The submission has no canonical enquiry to deliver." : "The stored work payload is malformed.";
    const settled = await settleAquaTagSubmissionWork(client, claim, {
      outcome: "dead",
      error,
      metadataPatch: { ingestionState: "failed", deliveryState: "dead-letter", deliveryError: error },
    });
    return settled.settled ? { outcome: "dead", delivery: "failed", error } : { outcome: "lease-lost", delivery: "pending" };
  }

  const records: EffectRecords = { ...claim.effects };
  for (const name of BRAND_ENQUIRY_EFFECT_ORDER) {
    const existing = records[name];
    if (existing?.status === "done" || existing?.status === "unknown") continue;

    if (NON_IDEMPOTENT_EFFECTS.has(name)) {
      if (existing?.status === "attempted") {
        // The previous owner may have sent this before it died. Never send it
        // twice; say we cannot know.
        const unknown = { status: "unknown", attemptedAt: existing.at ?? null, at: new Date().toISOString() };
        if (!(await checkpointAquaTagSubmissionWork(client, claim, name, unknown))) {
          return { outcome: "lease-lost", delivery: "pending", effect: name };
        }
        records[name] = unknown;
        continue;
      }
      const attempted = { status: "attempted", at: new Date().toISOString() };
      if (!(await checkpointAquaTagSubmissionWork(client, claim, name, attempted))) {
        return { outcome: "lease-lost", delivery: "pending", effect: name };
      }
      records[name] = attempted;
    }

    let outcome: EffectRecord;
    try {
      outcome = await effects[name]({ work, enquiryId: claim.enquiryId, effects: records });
    } catch (cause) {
      const error = `${name}: ${safeDeliveryError(cause)}`;
      // This claim already spent its last attempt: the settle is terminal and
      // the canonical row must say so in the same transaction, never "pending".
      const terminal = claim.attempts >= claim.maxAttempts;
      const settled = await settleAquaTagSubmissionWork(client, claim, {
        outcome: terminal ? "dead" : "retry",
        error,
        effects: records as Record<string, Record<string, unknown>>,
        metadataPatch: terminal
          ? { ingestionState: "failed", deliveryState: "dead-letter", deliveryAttempts: claim.attempts, deliveryError: error }
          : { ingestionState: "processing", deliveryState: "pending", deliveryAttempts: claim.attempts, deliveryError: error },
      });
      if (!settled.settled) return { outcome: "lease-lost", delivery: "pending", effect: name };
      if (settled.workStatus === "dead") return { outcome: "dead", delivery: "failed", error };
      return { outcome: "retry", delivery: "pending", error, attempts: settled.attempts ?? claim.attempts };
    }

    const done = { ...outcome, status: "done", at: new Date().toISOString() };
    if (!(await checkpointAquaTagSubmissionWork(client, claim, name, done))) {
      return { outcome: "lease-lost", delivery: "pending", effect: name };
    }
    records[name] = done;
  }

  const settled = await settleAquaTagSubmissionWork(client, claim, {
    outcome: "complete",
    effects: records as Record<string, Record<string, unknown>>,
    metadataPatch: completionMetadataPatch(work, records),
  });
  if (!settled.settled) return { outcome: "lease-lost", delivery: "pending" };
  return { outcome: "complete", delivery: "complete", effects: records };
}

export interface AquaTagDeliverySweepResult {
  status: "processed" | "not-configured" | "not-registered" | "unavailable";
  claimed: number;
  completed: number;
  retried: number;
  dead: number;
  leaseLost: number;
  errors: string[];
}

function supabaseAdminConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/**
 * The scheduled recovery sweep: claim due or lease-expired work across every
 * tenant and run it. Nothing to do, no database, or no migration are all
 * reported as a status rather than thrown, so the inbox cron keeps its other
 * duties when this boundary is absent.
 */
export async function processAquaTagSubmissionDeliveries(
  options: { limit?: number; leaseMs?: number; client?: SubmissionClaimClient; effects?: BrandEnquiryEffectSet } = {},
): Promise<AquaTagDeliverySweepResult> {
  const result: AquaTagDeliverySweepResult = {
    status: "processed", claimed: 0, completed: 0, retried: 0, dead: 0, leaseLost: 0, errors: [],
  };
  const effects = options.effects ?? registration?.effects ?? null;
  if (!effects) return { ...result, status: "not-registered" };
  let client = options.client ?? null;
  if (!client) {
    if (!registration?.adminClient || !supabaseAdminConfigured()) return { ...result, status: "not-configured" };
    client = registration.adminClient();
  }

  const claims = await claimAquaTagSubmissionWork(client, {
    owner: deliveryOwnerId(),
    leaseMs: options.leaseMs ?? 90_000,
    limit: options.limit ?? 20,
  });
  if (claims === null) return { ...result, status: "unavailable" };
  result.claimed = claims.length;

  for (const claim of claims) {
    try {
      const run = await runClaimedAquaTagSubmissionWork(client, claim, effects);
      if (run.outcome === "complete") result.completed += 1;
      else if (run.outcome === "retry") { result.retried += 1; result.errors.push(run.error); }
      else if (run.outcome === "dead") { result.dead += 1; result.errors.push(run.error); }
      else result.leaseLost += 1;
    } catch (cause) {
      // The claim stays leased; the next sweep after expiry recovers it.
      result.errors.push(`${claim.submissionId}: ${safeDeliveryError(cause)}`);
    }
  }
  return result;
}
