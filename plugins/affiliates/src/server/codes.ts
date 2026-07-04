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

const CODE_INDEX_KEY = "codes/index";
const codeKey = (id: string): string => `codes/by-id/${id}`;
const codeLookupKey = (raw: string): string => `codes/by-code/${raw.toUpperCase()}`;

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
    const affiliate = await this.affiliates.get(input.affiliateId);
    if (!affiliate) throw new Error(`Affiliate ${input.affiliateId} not found.`);
    if (affiliate.status !== "active" && affiliate.status !== "pending") {
      throw new Error(`Cannot create codes for a ${affiliate.status} affiliate.`);
    }

    const proposed = (input.code ?? makeReferralCode(affiliate.displayName)).toUpperCase();
    const existing = await this.storage.get<string>(codeLookupKey(proposed));
    if (existing) {
      throw new Error(`Code "${proposed}" already exists. Pick a different one.`);
    }

    const id = makeId("code");
    const ts = now();
    const row: ReferralCode = {
      id,
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
    await this.storage.set(codeKey(id), row);
    await this.storage.set(codeLookupKey(proposed), id);
    const ix = (await this.storage.get<string[]>(CODE_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(CODE_INDEX_KEY, [...ix, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: this.clientId,
      actorUserId: actor,
      category: "affiliates",
      action: "affiliate.code_created",
      message: `Created referral code ${proposed} for ${affiliate.displayName}.`,
      metadata: { codeId: id, affiliateId: input.affiliateId, code: proposed },
    });
    this.events.emit(
      { agencyId: this.agencyId, clientId: this.clientId },
      "affiliate.code_created",
      { codeId: id, affiliateId: input.affiliateId, code: proposed },
    );
    return row;
  }

  async update(id: string, patch: UpdateReferralCodePatch, actor: UserId): Promise<ReferralCode | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const next: ReferralCode = {
      ...existing,
      ...patch,
    };
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
  async _incrementRedemption(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing) return;
    await this.storage.set(codeKey(id), {
      ...existing,
      redemptionCount: existing.redemptionCount + 1,
    });
  }
}
