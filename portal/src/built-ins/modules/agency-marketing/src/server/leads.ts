// Lead service. CRUD + status funnel transitions + assignment + contact log.
//
// Funnel: new → contacted → qualified → converted | unqualified | lost.
// Each transition is one-way except `qualified ↔ contacted` (re-engage)
// and `unqualified → contacted` (give it another shot).

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CreateLeadInput,
  Lead,
  LeadFilter,
  LeadSource,
  LeadStatus,
  UpdateLeadPatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const LEAD_INDEX_KEY = "leads/index";
const leadKey = (id: string): string => `leads/by-id/${id}`;
const byEmailKey = (email: string): string => `leads/by-email/${email.toLowerCase()}`;
const byCampaignKey = (cmpId: string): string => `leads/by-campaign/${cmpId}`;
const byStaffKey = (staffId: string): string => `leads/by-staff/${staffId}`;

// Allowed transitions — same shape as agency-finance's invoice
// state-machine but tuned for sales funnel realities.
const ALLOWED_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ["contacted", "unqualified", "lost"],
  contacted: ["qualified", "unqualified", "lost", "converted"],
  qualified: ["converted", "contacted", "unqualified", "lost"],
  converted: [],
  unqualified: ["contacted"],
  lost: ["contacted"],
};

export class LeadService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(filter?: LeadFilter): Promise<Lead[]> {
    const ids = (await this.storage.get<string[]>(LEAD_INDEX_KEY)) ?? [];
    const out: Lead[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Lead>(leadKey(id));
      if (row) out.push(row);
    }
    const q = filter?.query?.toLowerCase().trim();
    return out
      .filter(l => !filter?.status || l.status === filter.status)
      .filter(l => !filter?.campaignId || l.campaignId === filter.campaignId)
      .filter(l => !filter?.assignedStaffId || l.assignedStaffId === filter.assignedStaffId)
      .filter(l => !q || `${l.email} ${l.name ?? ""} ${l.phone ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<Lead | null> {
    const row = await this.storage.get<Lead>(leadKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  async getByEmail(email: string): Promise<Lead | null> {
    const id = await this.storage.get<string>(byEmailKey(email));
    return id ? this.get(id) : null;
  }

  async listForCampaign(campaignId: string): Promise<Lead[]> {
    const ids = (await this.storage.get<string[]>(byCampaignKey(campaignId))) ?? [];
    const out: Lead[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Lead>(leadKey(id));
      if (row) out.push(row);
    }
    return out;
  }

  async listForStaff(staffId: string): Promise<Lead[]> {
    const ids = (await this.storage.get<string[]>(byStaffKey(staffId))) ?? [];
    const out: Lead[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Lead>(leadKey(id));
      if (row) out.push(row);
    }
    return out;
  }

  async create(input: CreateLeadInput, actor: UserId, sourceDefault: LeadSource = "manual"): Promise<Lead> {
    const email = input.email.trim();
    if (!email) throw new Error("Lead email required.");
    const existing = await this.getByEmail(email);
    if (existing) throw new Error(`Lead with email ${email} already exists.`);

    const id = makeId("lead");
    const ts = now();
    const row: Lead = {
      id,
      agencyId: this.agencyId,
      campaignId: input.campaignId,
      email,
      name: input.name?.trim(),
      phone: input.phone?.trim(),
      source: input.source ?? sourceDefault,
      status: "new",
      assignedStaffId: input.assignedStaffId,
      notes: input.notes,
      contactHistory: [],
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(leadKey(id), row);
    await this.storage.set(byEmailKey(email), id);
    const ix = (await this.storage.get<string[]>(LEAD_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(LEAD_INDEX_KEY, [...ix, id]);
    }
    if (input.campaignId) {
      const cIx = (await this.storage.get<string[]>(byCampaignKey(input.campaignId))) ?? [];
      if (!cIx.includes(id)) {
        await this.storage.set(byCampaignKey(input.campaignId), [...cIx, id]);
      }
    }
    if (input.assignedStaffId) {
      const sIx = (await this.storage.get<string[]>(byStaffKey(input.assignedStaffId))) ?? [];
      if (!sIx.includes(id)) {
        await this.storage.set(byStaffKey(input.assignedStaffId), [...sIx, id]);
      }
    }

    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "marketing",
      action: "lead.created",
      // No address/name in the message: this install is agency-scoped, so its
      // entries carry no `clientId` and the erasure sweep (clientId-only) could
      // never scrub them. The metadata carries `leadId`.
      message: `New lead ${id}.`,
      metadata: { leadId: id, campaignId: input.campaignId, source: row.source },
    });
    this.events.emit({ agencyId: this.agencyId }, "lead.created", { leadId: id });
    return row;
  }

  // Right-to-be-forgotten: delete every marketing lead captured at one of
  // `addresses`, plus the `leads/by-email/<email>` pointer whose KEY NAME holds
  // the address, and each index entry. Called by `onEraseClient`.
  //
  // DELETE, not anonymise: a marketing lead is marketing PII — the policy's
  // clearest delete category. The row carries NO `clientId` (it predates the
  // person being a client), so the address is the only link back to them.
  //
  // Idempotent: a second run finds nothing and returns 0.
  async eraseForAddresses(addresses: readonly string[]): Promise<number> {
    let erased = 0;
    for (const address of new Set(addresses.map(a => a.trim().toLowerCase()).filter(Boolean))) {
      const existing = await this.getByEmail(address);
      await this.storage.del(byEmailKey(address));
      if (!existing) continue;
      await this.storage.del(leadKey(existing.id));
      const ix = (await this.storage.get<string[]>(LEAD_INDEX_KEY)) ?? [];
      await this.storage.set(LEAD_INDEX_KEY, ix.filter(value => value !== existing.id));
      if (existing.campaignId) {
        const cIx = (await this.storage.get<string[]>(byCampaignKey(existing.campaignId))) ?? [];
        await this.storage.set(byCampaignKey(existing.campaignId), cIx.filter(value => value !== existing.id));
      }
      if (existing.assignedStaffId) {
        const sIx = (await this.storage.get<string[]>(byStaffKey(existing.assignedStaffId))) ?? [];
        await this.storage.set(byStaffKey(existing.assignedStaffId), sIx.filter(value => value !== existing.id));
      }
      erased++;
    }
    if (erased) {
      await this.activity.logActivity({
        agencyId: this.agencyId,
        category: "marketing",
        action: "lead.erased",
        message: `Erased ${erased} marketing lead${erased === 1 ? "" : "s"} for a client erasure.`,
        metadata: { erased },
      });
    }
    return erased;
  }

  async update(id: string, patch: UpdateLeadPatch, actor: UserId): Promise<Lead | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    if (patch.status && patch.status !== existing.status) {
      if (!ALLOWED_TRANSITIONS[existing.status].includes(patch.status)) {
        throw new Error(`Cannot transition lead ${existing.email} from ${existing.status} → ${patch.status}.`);
      }
    }

    // Email change → re-key the by-email index.
    if (patch.email && patch.email.toLowerCase() !== existing.email.toLowerCase()) {
      const dup = await this.getByEmail(patch.email);
      if (dup) throw new Error(`Email ${patch.email} already in use.`);
      await this.storage.del(byEmailKey(existing.email));
      await this.storage.set(byEmailKey(patch.email), id);
    }

    // Campaign re-key.
    if (patch.campaignId !== undefined && patch.campaignId !== existing.campaignId) {
      if (existing.campaignId) {
        const oldIx = (await this.storage.get<string[]>(byCampaignKey(existing.campaignId))) ?? [];
        await this.storage.set(byCampaignKey(existing.campaignId), oldIx.filter(x => x !== id));
      }
      if (patch.campaignId) {
        const newIx = (await this.storage.get<string[]>(byCampaignKey(patch.campaignId))) ?? [];
        if (!newIx.includes(id)) {
          await this.storage.set(byCampaignKey(patch.campaignId), [...newIx, id]);
        }
      }
    }

    // Staff re-key.
    if (patch.assignedStaffId !== undefined && patch.assignedStaffId !== existing.assignedStaffId) {
      if (existing.assignedStaffId) {
        const oldIx = (await this.storage.get<string[]>(byStaffKey(existing.assignedStaffId))) ?? [];
        await this.storage.set(byStaffKey(existing.assignedStaffId), oldIx.filter(x => x !== id));
      }
      if (patch.assignedStaffId) {
        const newIx = (await this.storage.get<string[]>(byStaffKey(patch.assignedStaffId))) ?? [];
        if (!newIx.includes(id)) {
          await this.storage.set(byStaffKey(patch.assignedStaffId), [...newIx, id]);
        }
      }
    }

    const next: Lead = {
      ...existing,
      ...patch,
      campaignId: patch.campaignId === null ? undefined : patch.campaignId ?? existing.campaignId,
      assignedStaffId: patch.assignedStaffId === null ? undefined : patch.assignedStaffId ?? existing.assignedStaffId,
      email: patch.email?.trim() ?? existing.email,
      name: patch.name?.trim() ?? existing.name,
      phone: patch.phone?.trim() ?? existing.phone,
      updatedAt: now(),
    };
    await this.storage.set(leadKey(id), next);

    if (patch.status && patch.status !== existing.status) {
      const action = patch.status === "converted" ? "lead.converted" : "lead.status_changed";
      await this.activity.logActivity({
        agencyId: this.agencyId,
        actorUserId: actor,
        category: "marketing",
        action,
        message: `Lead ${id}: ${existing.status} → ${patch.status}.`,
        metadata: { leadId: id, fromStatus: existing.status, toStatus: patch.status },
      });
      this.events.emit({ agencyId: this.agencyId }, action, { leadId: id, status: patch.status });
    }
    return next;
  }

  async assignTo(id: string, staffId: string, actor: UserId): Promise<Lead | null> {
    return this.update(id, { assignedStaffId: staffId }, actor);
  }

  async recordContact(id: string, note: string, actor: UserId): Promise<Lead | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const ts = now();
    const updated: Lead = {
      ...existing,
      contactHistory: [...existing.contactHistory, { at: ts, by: actor, note }],
      lastContactedAt: ts,
      updatedAt: ts,
      // First contact bumps status: new → contacted.
      status: existing.status === "new" ? "contacted" : existing.status,
    };
    await this.storage.set(leadKey(id), updated);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "marketing",
      action: "lead.contacted",
      message: `Contacted lead ${id}.`,
      metadata: { leadId: id, note },
    });
    this.events.emit({ agencyId: this.agencyId }, "lead.contacted", { leadId: id });
    return updated;
  }
}
