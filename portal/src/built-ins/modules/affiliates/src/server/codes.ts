// Referral-code service — CRUD + per-affiliate listing + collision
// detection.
//
// Storage:
//   codes/by-id/<id>            → ReferralCode
//   codes/by-code/<CODE>        → codeId  (uppercase index for O(1) lookup)
//   codes/index                 → string[] of all code ids

import { makeId, makeReferralCode } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  CreateReferralCodeInput,
  ReferralCode,
  ReferralCodeFilter,
  UpdateReferralCodePatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import type { AffiliateService } from "./affiliates";
import {
  assertCreateReferralCodeInput,
  assertReferralCode,
  assertUpdateReferralCodePatch,
} from "../lib/runtimeValidation";

const CODE_INDEX_KEY = "codes/index";
const codeKey = (id: string): string => `codes/by-id/${id}`;
const normalizedCode = (raw: string): string => raw.trim().toUpperCase();
const codeLookupKey = (raw: string): string => `codes/by-code/${normalizedCode(raw)}`;
const codeClaimKey = (raw: string): string => `codes/claims/by-code/${encodeURIComponent(normalizedCode(raw))}`;
const redemptionBaselineKey = (id: string): string => `codes/redemption-baseline/${id}`;
const redemptionOperationKey = (id: string, operationId: string): string => `codes/redemption-operation/${id}/${encodeURIComponent(operationId)}`;

interface CodeClaim {
  signature: string;
  row: ReferralCode;
  status: "pending" | "completed";
  updatedAt: number;
}

const localTails = new Map<string, Promise<void>>();

async function localExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = localTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => gate);
  localTails.set(key, tail);
  await previous;
  try { return await operation(); }
  finally {
    release();
    if (localTails.get(key) === tail) localTails.delete(key);
  }
}

function codeSignature(input: {
  affiliateId: string;
  code: string;
  destinationPath?: string;
  commissionPercentOverride?: number;
}): string {
  return JSON.stringify({
    affiliateId: input.affiliateId,
    code: normalizedCode(input.code),
    destinationPath: input.destinationPath ?? "/",
    commissionPercentOverride: input.commissionPercentOverride ?? null,
  });
}

export class ReferralCodeService {
  constructor(
    private agencyId: AgencyId,
    private clientId: ClientId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private affiliates: AffiliateService,
  ) {}

  async list(filter?: ReferralCodeFilter): Promise<ReferralCode[]> {
    const ids = (await this.storage.get<string[]>(CODE_INDEX_KEY)) ?? [];
    const out: ReferralCode[] = [];
    for (const id of ids) {
      const row = await this.storage.get<ReferralCode>(codeKey(id));
      if (row) out.push(row);
    }
    const q = filter?.query?.toUpperCase().trim();
    return out
      .filter(c => !filter?.affiliateId || c.affiliateId === filter.affiliateId)
      .filter(c => !filter?.status || c.status === filter.status)
      .filter(c => !q || c.code.includes(q))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<ReferralCode | null> {
    const row = await this.storage.get<ReferralCode>(codeKey(id));
    return row && row.agencyId === this.agencyId && row.clientId === this.clientId ? row : null;
  }

  // Lookup by raw code string (case-insensitive). Returns the code only
  // if active. Used by AttributionService when an order references a code.
  async findByCode(rawCode: string): Promise<ReferralCode | null> {
    if (!rawCode) return null;
    const id = await this.storage.get<string>(codeLookupKey(rawCode));
    if (!id) return null;
    const row = await this.get(id);
    return row && row.status === "active" ? row : null;
  }

  async create(input: CreateReferralCodeInput, actor: UserId): Promise<ReferralCode> {
    assertCreateReferralCodeInput(input);
    const affiliate = await this.affiliates.get(input.affiliateId);
    if (!affiliate) throw new Error(`Affiliate ${input.affiliateId} not found.`);
    if (affiliate.status !== "active" && affiliate.status !== "pending") {
      throw new Error(`Cannot create codes for a ${affiliate.status} affiliate.`);
    }

    const proposed = normalizedCode(input.code ?? makeReferralCode(affiliate.displayName));
    return this.withLock("code-collection", async () => {
      const signature = codeSignature({ ...input, code: proposed });
      const claimKey = codeClaimKey(proposed);
      let claim = await this.storage.get<CodeClaim>(claimKey);
      const existingId = await this.storage.get<string>(codeLookupKey(proposed));
      const existing = existingId ? await this.get(existingId) : null;
      if (existing) {
        const existingSignature = codeSignature(existing);
        if (claim?.signature === signature && claim.status === "completed") return existing;
        if (!claim && existingSignature === signature) {
          await this.storage.set(claimKey, {
            signature, row: existing, status: "completed", updatedAt: now(),
          } satisfies CodeClaim);
          return existing;
        }
        if (claim?.signature === signature) claim = { ...claim, row: existing };
        else throw new Error(`Code "${proposed}" already exists. Pick a different one.`);
      }
      if (claim && claim.signature !== signature) {
        throw new Error(`Code "${proposed}" is already claimed by another referral-code creation.`);
      }
      if (!claim) {
        const ts = now();
        const row: ReferralCode = {
          id: makeId("code"),
          agencyId: this.agencyId,
          clientId: this.clientId,
          affiliateId: input.affiliateId,
          code: proposed,
          destinationPath: input.destinationPath ?? "/",
          commissionPercentOverride: input.commissionPercentOverride,
          status: "active",
          redemptionCount: 0,
          createdAt: ts,
        };
        assertReferralCode(row);
        claim = { signature, row, status: "pending", updatedAt: ts };
        await this.storage.set(claimKey, claim);
      }
      const row = await this.get(claim.row.id) ?? claim.row;
      await this.storage.set(codeKey(row.id), row);
      await this.storage.set(codeLookupKey(row.code), row.id);
      const index = (await this.storage.get<string[]>(CODE_INDEX_KEY)) ?? [];
      if (!index.includes(row.id)) await this.storage.set(CODE_INDEX_KEY, [...index, row.id]);
      await this.activity.logActivity({
        idempotencyKey: `affiliates:code-create:${row.id}`,
        agencyId: this.agencyId,
        clientId: this.clientId,
        actorUserId: actor,
        category: "affiliates",
        action: "affiliate.code_created",
        message: `Created referral code ${row.code} for ${affiliate.displayName}.`,
        metadata: { codeId: row.id, affiliateId: row.affiliateId, code: row.code },
      });
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "affiliate.code_created",
        { codeId: row.id, affiliateId: row.affiliateId, code: row.code },
      );
      await this.storage.set(claimKey, { ...claim, row, status: "completed", updatedAt: now() });
      return row;
    });
  }

  async update(id: string, patch: UpdateReferralCodePatch, actor: UserId): Promise<ReferralCode | null> {
    assertUpdateReferralCodePatch(patch);
    const existing = await this.get(id);
    if (!existing) return null;
    const next: ReferralCode = {
      ...existing,
      ...patch,
    };
    assertReferralCode(next);
    await this.storage.set(codeKey(id), next);
    if (patch.status === "archived" && existing.status === "active") {
      await this.activity.logActivity({
        agencyId: this.agencyId,
        clientId: this.clientId,
        actorUserId: actor,
        category: "affiliates",
        action: "affiliate.code_archived",
        message: `Archived referral code ${existing.code}.`,
        metadata: { codeId: id, affiliateId: existing.affiliateId },
      });
      this.events.emit(
        { agencyId: this.agencyId, clientId: this.clientId },
        "affiliate.code_archived",
        { codeId: id, affiliateId: existing.affiliateId },
      );
    }
    return next;
  }

  // Internal — bumps redemption count from AttributionService.
  async _incrementRedemption(id: string, operationId?: string, lockHeld = false): Promise<void> {
    const increment = async () => {
      const existing = await this.get(id);
      if (!existing) return;
      let redemptionCount: number;
      if (operationId) {
        let baseline = await this.storage.get<number>(redemptionBaselineKey(id));
        if (baseline === undefined) {
          baseline = existing.redemptionCount;
          await this.storage.set(redemptionBaselineKey(id), baseline);
        }
        const markerKey = redemptionOperationKey(id, operationId);
        if (await this.storage.get<number>(markerKey) === undefined) {
          await this.storage.set(markerKey, 1);
        }
        const markers = await this.storage.list(`codes/redemption-operation/${id}/`);
        redemptionCount = baseline + markers.length;
      } else {
        redemptionCount = existing.redemptionCount + 1;
        const baseline = await this.storage.get<number>(redemptionBaselineKey(id));
        if (baseline !== undefined) await this.storage.set(redemptionBaselineKey(id), baseline + 1);
      }
      const next: ReferralCode = { ...existing, redemptionCount };
      assertReferralCode(next);
      await this.storage.set(codeKey(id), next);
    };
    if (lockHeld) return increment();
    await this.withLock(`redemption:${id}`, increment);
  }

  private async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (this.storage.runExclusive) {
      return this.storage.runExclusive(`affiliate-code:${key}`, operation);
    }
    return localExclusive(`${this.agencyId}:${this.clientId}:${key}`, operation);
  }
}
