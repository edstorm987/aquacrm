// PlanService — recurring plan tiers + per-client assignment.
// R007 addition.
//
// Storage layout:
//   plans/index               → string[] of plan ids
//   plans/by-id/<id>          → Plan
//   plans/by-client/<cid>     → string (single plan id)  // v1: 1 plan/client

import { deriveRecordId, normaliseIdempotencyKey } from "../lib/idempotency";
import { listRowIds } from "./rowIndex";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  CommercialPlanAssignment,
  CreatePlanInput,
  Plan,
  UpdatePlanPatch,
} from "../lib/domain";
import { normaliseCurrency } from "../lib/currencies";
import { cleanClientPaymentPlans } from "@/lib/clients/clientPaymentPlans";
import type { ActivityLogPort, EventBusPort, StoragePort, TenantPort } from "./ports";
import {
  assertAllowedValue,
  assertBoolean,
  assertCurrency,
  assertKnownFields,
  assertNonEmptyText,
  assertOptionalText,
  assertSafeInteger,
} from "../lib/runtimeValidation";

const INDEX_KEY = "plans/index";
const planKey = (id: string): string => `plans/by-id/${id}`;
const byClientKey = (cid: ClientId): string => `plans/by-client/${cid}`;
const assignmentOperationKey = (cid: ClientId): string => `plans/assignment-operations/${cid}`;
const ASSIGNMENT_OPERATION_PREFIX = "plans/assignment-operations/";
const PLAN_TIERS = ["starter", "growth", "scale", "custom"] as const;

interface PlanAssignmentOperation {
  version: 1;
  agencyId: AgencyId;
  clientId: ClientId;
  previousPlanId: string | null;
  targetPlanId: string | null;
  createdAt: number;
}

const assignmentTails = new Map<string, Promise<void>>();

async function withLocalAssignmentLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = assignmentTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  assignmentTails.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (assignmentTails.get(key) === tail) assignmentTails.delete(key);
  }
}

export class PlanService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private tenant: TenantPort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  private inScope(p: Plan): boolean {
    return p.agencyId === this.agencyId;
  }

  private async withAssignmentLock<T>(operation: () => Promise<T>): Promise<T> {
    const key = `plan-assignments:${this.agencyId}`;
    return this.storage.runExclusive
      ? this.storage.runExclusive(key, operation)
      : withLocalAssignmentLock(key, operation);
  }

  private async listRaw(includeInactive = false): Promise<Plan[]> {
    const ids = await listRowIds(this.storage, INDEX_KEY, "plans/by-id/");
    const out: Plan[] = [];
    for (const id of ids) {
      const p = await this.storage.get<Plan>(planKey(id));
      if (!p || !this.inScope(p)) continue;
      if (!includeInactive && !p.active) continue;
      out.push(p);
    }
    return out.sort((a, b) => b.monthlyAmountCents - a.monthlyAmountCents);
  }

  private async getRaw(id: string): Promise<Plan | null> {
    const p = await this.storage.get<Plan>(planKey(id));
    return p && this.inScope(p) ? p : null;
  }

  private async getForClientRaw(clientId: ClientId): Promise<Plan | null> {
    const id = await this.storage.get<string>(byClientKey(clientId));
    if (!id) return null;
    return this.getRaw(id);
  }

  private async applyAssignmentOperation(operation: PlanAssignmentOperation): Promise<void> {
    if (operation.version !== 1 || operation.agencyId !== this.agencyId) {
      throw new Error("agency-finance: plan assignment operation is invalid");
    }

    const client = await this.tenant.getClientForAgency(this.agencyId, operation.clientId);
    const requestedTarget = operation.targetPlanId
      ? await this.getRaw(operation.targetPlanId)
      : null;
    const previousTarget = operation.previousPlanId
      ? await this.getRaw(operation.previousPlanId)
      : null;
    // A client can disappear after a valid assignment was claimed. Likewise,
    // a damaged target row must not leave a pointer to nowhere. In either case
    // recovery converges to an existing, valid side (or fully unassigned).
    const targetPlanId = !client
      ? null
      : operation.targetPlanId === null
        ? null
        : requestedTarget?.id ?? previousTarget?.id ?? null;

    for (const plan of await this.listRaw(true)) {
      const withoutClient = plan.clientIds.filter(id => id !== operation.clientId);
      const clientIds = plan.id === targetPlanId
        ? [...withoutClient, operation.clientId]
        : withoutClient;
      if (
        clientIds.length === plan.clientIds.length
        && clientIds.every((id, index) => id === plan.clientIds[index])
      ) continue;
      await this.storage.set(planKey(plan.id), { ...plan, clientIds, updatedAt: now() });
    }

    const currentPointer = await this.storage.get<string>(byClientKey(operation.clientId));
    if (targetPlanId) {
      if (currentPointer !== targetPlanId) {
        await this.storage.set(byClientKey(operation.clientId), targetPlanId);
      }
    } else if (currentPointer !== undefined) {
      await this.storage.del(byClientKey(operation.clientId));
    }
    await this.storage.del(assignmentOperationKey(operation.clientId));
  }

  private async recoverPendingAssignments(): Promise<void> {
    const keys = await this.storage.list(ASSIGNMENT_OPERATION_PREFIX);
    for (const key of keys.sort()) {
      const operation = await this.storage.get<PlanAssignmentOperation>(key);
      if (!operation) continue;
      await this.applyAssignmentOperation(operation);
    }
  }

  // Index + row scan (see server/rowIndex.ts). Reads also finish any durable
  // assignment operation left by a failed/crashed writer before returning.
  async list(includeInactive = false, options: { recover?: boolean } = {}): Promise<Plan[]> {
    // Recovering interrupted plan-assignment writes belongs to the write path and
    // to callers that must observe the very latest applied assignment. A
    // read-only aggregation — above all the company-health / founder P&L snapshot
    // that the inbox, Actions and Calendar renders build — must NOT pay for it:
    // on the single persistent instance each recovered operation is a write
    // against the ~2.9 MB state row (2–6 s apiece), so running recovery on every
    // render made those pages take ~8 s (a stuck operation re-applied on each
    // read). `recover: false` reads the committed plans directly; a genuinely
    // pending assignment still applies on the next assignment write.
    if (options.recover === false) return this.listRaw(includeInactive);
    // Even for recovering callers, skip the exclusive remote lock when there is
    // nothing to recover, so the ordinary read stays lock-free and fast.
    const pending = await this.storage.list(ASSIGNMENT_OPERATION_PREFIX);
    if (pending.length === 0) return this.listRaw(includeInactive);
    return this.withAssignmentLock(async () => {
      await this.recoverPendingAssignments();
      return this.listRaw(includeInactive);
    });
  }

  async get(id: string): Promise<Plan | null> {
    return this.withAssignmentLock(async () => {
      await this.recoverPendingAssignments();
      return this.getRaw(id);
    });
  }

  async getForClient(clientId: ClientId): Promise<Plan | null> {
    return this.withAssignmentLock(async () => {
      await this.recoverPendingAssignments();
      return this.getForClientRaw(clientId);
    });
  }

  /** Canonical commercial assignments are client payment schedules. Finance
   * catalogue rows are reusable templates and their legacy clientIds arrays
   * are no longer an MRR/deposit source. */
  async listCommercialAssignments(includeInactive = false): Promise<CommercialPlanAssignment[]> {
    const clients = await this.tenant.listClients?.(this.agencyId) ?? [];
    return clients.flatMap(client => {
      const linked = cleanClientPaymentPlans(client.metadata?.clientPaymentPlans)
        .filter(plan => Boolean(plan.financePlanId))
        .filter(plan => includeInactive ? plan.status !== "draft" : plan.status === "active")
        .sort((left, right) => (right.commercialAssignedAt ?? right.createdAt) - (left.commercialAssignedAt ?? left.createdAt));
      // Normal writes cancel the old schedule atomically. If damaged/legacy
      // metadata still contains two active rows, the newest snapshot is the
      // one commercial truth rather than double-counting the client.
      const retained = includeInactive ? linked : linked.slice(0, 1);
      return retained.map(plan => ({
        clientId: client.id,
        clientName: client.name,
        financePlanId: plan.financePlanId as string,
        clientPaymentPlanId: plan.id,
        title: plan.title,
        currency: normaliseCurrency(plan.currency),
        monthlyAmountCents: plan.monthlyAmountCents ?? 0,
        lockInMonths: plan.lockInMonths ?? 0,
        lockInFeeCents: plan.lockInFeeCents ?? 0,
        assignedAt: plan.commercialAssignedAt ?? plan.createdAt,
        status: plan.status as CommercialPlanAssignment["status"],
        depositInvoiceId: plan.milestones.find(milestone => milestone.kind === "deposit")?.invoiceId,
      }));
    })
      .sort((left, right) => right.assignedAt - left.assignedAt || left.clientName.localeCompare(right.clientName));
  }

  // Idempotent on `input.idempotencyKey`: a resubmit of the same intent returns
  // the first plan instead of creating a duplicate. See lib/idempotency.ts.
  async create(actor: UserId, input: CreatePlanInput): Promise<Plan> {
    assertKnownFields(input, ["tier", "label", "monthlyAmountCents", "currency", "lockInMonths", "lockInFeeCents", "active", "idempotencyKey"]);
    assertAllowedValue(input.tier, PLAN_TIERS, "tier");
    assertNonEmptyText(input.label, "label");
    assertSafeInteger(input.monthlyAmountCents, "monthlyAmountCents", { min: 0 });
    assertSafeInteger(input.lockInMonths ?? 0, "lockInMonths", { min: 0, max: 36 });
    assertSafeInteger(input.lockInFeeCents ?? 0, "lockInFeeCents", { min: 0 });
    assertCurrency(input.currency ?? "gbp");
    if (input.active !== undefined) assertBoolean(input.active, "active");
    assertOptionalText(input.idempotencyKey, "idempotencyKey");

    const key = normaliseIdempotencyKey(input.idempotencyKey);
    const id = deriveRecordId("plan", key);
    if (key) {
      const existing = await this.get(id);
      if (existing) return existing;
    }

    const t = now();
    const plan: Plan = {
      id,
      agencyId: this.agencyId,
      tier: input.tier,
      label: input.label.trim(),
      monthlyAmountCents: input.monthlyAmountCents,
      currency: input.currency ?? "gbp",
      lockInMonths: input.lockInMonths ?? 0,
      lockInFeeCents: input.lockInFeeCents ?? 0,
      clientIds: [],
      active: input.active ?? true,
      createdAt: t,
      updatedAt: t,
    };
    await this.storage.set(planKey(plan.id), plan);
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    if (!ids.includes(plan.id)) await this.storage.set(INDEX_KEY, [...ids, plan.id]);
    this.activity.logActivity({
      agencyId: this.agencyId, actorUserId: actor,
      category: "finance", action: "plan.created",
      message: `Plan "${plan.label}" created (${plan.tier}, ${plan.monthlyAmountCents}/mo)`,
      metadata: { planId: plan.id, tier: plan.tier },
    });
    this.events.emit({ agencyId: this.agencyId }, "agency-finance.plan.created", { planId: plan.id });
    return plan;
  }

  async update(actor: UserId, id: string, patch: UpdatePlanPatch): Promise<Plan> {
    assertKnownFields(patch, ["label", "monthlyAmountCents", "currency", "lockInMonths", "lockInFeeCents", "active"]);
    const next = await this.withAssignmentLock(async () => {
      await this.recoverPendingAssignments();
      const cur = await this.getRaw(id);
      if (!cur) throw new Error("agency-finance: plan not found");
      if (patch.label !== undefined) assertNonEmptyText(patch.label, "label");
      assertSafeInteger(patch.monthlyAmountCents ?? cur.monthlyAmountCents, "monthlyAmountCents", { min: 0 });
      assertSafeInteger(patch.lockInMonths ?? cur.lockInMonths, "lockInMonths", { min: 0, max: 36 });
      assertSafeInteger(patch.lockInFeeCents ?? cur.lockInFeeCents, "lockInFeeCents", { min: 0 });
      assertCurrency(patch.currency ?? cur.currency);
      if (patch.active !== undefined) assertBoolean(patch.active, "active");
      const value: Plan = {
        ...cur,
        label: patch.label === undefined ? cur.label : patch.label.trim(),
        monthlyAmountCents: patch.monthlyAmountCents ?? cur.monthlyAmountCents,
        currency: patch.currency ?? cur.currency,
        lockInMonths: patch.lockInMonths ?? cur.lockInMonths,
        lockInFeeCents: patch.lockInFeeCents ?? cur.lockInFeeCents,
        active: patch.active ?? cur.active,
        updatedAt: now(),
      };
      await this.storage.set(planKey(id), value);
      return value;
    });
    this.events.emit({ agencyId: this.agencyId }, "agency-finance.plan.updated", { planId: id });
    return next;
  }

  // Move a client to this plan (or unassign if planId === null).
  // v1: a client can only be on one plan at a time.
  async assignClient(actor: UserId, clientId: ClientId, planId: string | null): Promise<void> {
    assertNonEmptyText(clientId, "clientId");
    if (planId !== null) assertNonEmptyText(planId, "planId");
    let previousPlanId: string | null = null;
    await this.withAssignmentLock(async () => {
      await this.recoverPendingAssignments();

      // Validate every requested record against the freshly hydrated world
      // before the recovery marker or either assignment direction is written.
      const client = await this.tenant.getClientForAgency(this.agencyId, clientId);
      if (!client) throw new Error("agency-finance: client not found");
      if (planId && !(await this.getRaw(planId))) {
        throw new Error("agency-finance: plan not found");
      }

      const previous = await this.getForClientRaw(clientId);
      previousPlanId = previous?.id ?? null;
      const operation: PlanAssignmentOperation = {
        version: 1,
        agencyId: this.agencyId,
        clientId,
        previousPlanId,
        targetPlanId: planId,
        createdAt: now(),
      };
      // This marker is deliberately first. If any later write fails, a retry
      // or the next plan read replays the same desired state idempotently.
      await this.storage.set(assignmentOperationKey(clientId), operation);
      await this.applyAssignmentOperation(operation);
    });
    this.activity.logActivity({
      agencyId: this.agencyId, clientId, actorUserId: actor,
      category: "finance", action: "plan.assigned",
      message: planId
        ? `Client ${clientId} assigned to plan ${planId}`
        : `Client ${clientId} unassigned from plan ${previousPlanId ?? "(none)"}`,
      metadata: { planId, prevPlanId: previousPlanId },
    });
    this.events.emit({ agencyId: this.agencyId, clientId },
      "agency-finance.plan.assigned", { clientId, planId, prevPlanId: previousPlanId });
  }
}
