// Leave-request service. Persists `LeaveRequest` rows under
// `leave:<id>` keys + a `leave/index` list. Per-staff filtering walks
// the index — fine for v1 volumes (≤ a few thousand rows per agency).

import { makeId } from "../lib/ids";
import { daysBetween, now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CreateLeaveInput,
  DecideLeaveInput,
  LeaveFilter,
  LeaveRequest,
} from "../lib/domain";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort } from "./ports";
import type { StaffService } from "./staff";

const LEAVE_INDEX_KEY = "leave/index";
const leaveKey = (id: string): string => `leave:${id}`;

export class LeaveService {
  constructor(
    private agencyId: AgencyId,
    private storage: PluginStorage,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private staff: StaffService,
  ) {}

  async list(filter?: LeaveFilter): Promise<LeaveRequest[]> {
    const index = (await this.storage.get<string[]>(LEAVE_INDEX_KEY)) ?? [];
    const rows: LeaveRequest[] = [];
    for (const id of index) {
      const row = await this.storage.get<LeaveRequest>(leaveKey(id));
      if (row) rows.push(row);
    }
    return rows
      .filter(r => !filter?.status || r.status === filter.status)
      .filter(r => !filter?.staffId || r.staffId === filter.staffId)
      .filter(r => !filter?.type || r.type === filter.type)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<LeaveRequest | null> {
    const row = await this.storage.get<LeaveRequest>(leaveKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  async request(input: CreateLeaveInput, actor: UserId): Promise<LeaveRequest> {
    const member = await this.staff.get(input.staffId);
    if (!member) throw new Error(`Staff ${input.staffId} not found.`);
    if (!input.startDate.match(/^\d{4}-\d{2}-\d{2}$/) || !input.endDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      throw new Error("startDate and endDate must be YYYY-MM-DD.");
    }
    if (input.endDate < input.startDate) throw new Error("endDate must be on or after startDate.");

    const days = daysBetween(input.startDate, input.endDate);
    const id = makeId("lv");
    const ts = now();
    const row: LeaveRequest = {
      id,
      agencyId: this.agencyId,
      staffId: input.staffId,
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
      days,
      status: "pending",
      reason: input.reason,
      createdAt: ts,
    };
    await this.storage.set(leaveKey(id), row);
    const index = (await this.storage.get<string[]>(LEAVE_INDEX_KEY)) ?? [];
    if (!index.includes(id)) {
      await this.storage.set(LEAVE_INDEX_KEY, [...index, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "hr",
      action: "hr.leave.requested",
      message: `${member.name} requested ${input.type} (${days} day${days === 1 ? "" : "s"}).`,
      metadata: { leaveId: id, staffId: member.id, type: input.type, days },
    });
    this.events.emit({ agencyId: this.agencyId }, "hr.leave.requested", { leaveId: id });
    return row;
  }

  async decide(id: string, decision: DecideLeaveInput): Promise<LeaveRequest | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (existing.status !== "pending") {
      throw new Error(`Leave request ${id} already ${existing.status}.`);
    }
    const member = await this.staff.get(existing.staffId);
    const updated: LeaveRequest = {
      ...existing,
      status: decision.status,
      approvedBy: decision.approvedBy,
      approvedAt: now(),
      decisionNote: decision.decisionNote,
    };
    await this.storage.set(leaveKey(id), updated);
    const action = decision.status === "approved" ? "hr.leave.approved" : "hr.leave.rejected";
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: decision.approvedBy,
      category: "hr",
      action,
      message: `${decision.status === "approved" ? "Approved" : "Rejected"} ${member?.name ?? "staff"}'s ${existing.type} request.`,
      metadata: { leaveId: id, staffId: existing.staffId, decisionNote: decision.decisionNote },
    });
    this.events.emit({ agencyId: this.agencyId }, action, { leaveId: id });

    // If approved, flip the staff member to on-leave for the duration.
    // (v1 doesn't auto-restore on the end date — that needs a scheduler.)
    if (decision.status === "approved") {
      await this.staff.update(existing.staffId, { status: "on-leave" }, decision.approvedBy);
    }
    return updated;
  }

  async cancel(id: string, actor: UserId): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;
    await this.storage.del(leaveKey(id));
    const index = (await this.storage.get<string[]>(LEAVE_INDEX_KEY)) ?? [];
    await this.storage.set(LEAVE_INDEX_KEY, index.filter(x => x !== id));
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "hr",
      action: "hr.leave.cancelled",
      message: `Cancelled leave request ${id}.`,
      metadata: { leaveId: id, staffId: existing.staffId },
    });
    return true;
  }
}
