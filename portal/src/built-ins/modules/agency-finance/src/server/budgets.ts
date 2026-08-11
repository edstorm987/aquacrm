import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type { BudgetPot, CreateBudgetPotInput, Currency, UpdateBudgetPotPatch } from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";

const INDEX_KEY = "budget-pots/index";
const potKey = (id: string): string => `budget-pots/by-id/${id}`;

export class BudgetService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(includeClosed = false): Promise<BudgetPot[]> {
    const indexedIds = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    const storedIds = (await this.storage.list("budget-pots/by-id/"))
      .map(key => key.slice("budget-pots/by-id/".length))
      .filter(Boolean);
    const rows: BudgetPot[] = [];
    for (const id of [...new Set([...indexedIds, ...storedIds])]) {
      const pot = await this.storage.get<BudgetPot>(potKey(id));
      if (!pot || pot.agencyId !== this.agencyId || (!includeClosed && pot.status === "closed")) continue;
      rows.push(pot);
    }
    return rows.sort((left, right) => Number(right.status === "active") - Number(left.status === "active") || right.updatedAt - left.updatedAt);
  }

  async get(id: string): Promise<BudgetPot | null> {
    const pot = await this.storage.get<BudgetPot>(potKey(id));
    return pot?.agencyId === this.agencyId ? pot : null;
  }

  async create(actor: UserId, input: CreateBudgetPotInput, defaultCurrency: Currency = "gbp"): Promise<BudgetPot> {
    const name = input.name.trim().slice(0, 160);
    if (!name) throw new Error("Budget pot name required.");
    validateAmounts(input.allocatedCents, input.fundedCents ?? 0);
    validateDates(input.startAt, input.endAt);
    const timestamp = now();
    const pot: BudgetPot = {
      id: makeId("budget"),
      agencyId: this.agencyId,
      name,
      purpose: input.purpose,
      companyIds: cleanIds(input.companyIds),
      currency: input.currency ?? defaultCurrency,
      period: input.period ?? "one-off",
      allocatedCents: Math.round(input.allocatedCents),
      fundedCents: Math.round(input.fundedCents ?? 0),
      startAt: input.startAt,
      endAt: input.endAt,
      notes: input.notes?.trim().slice(0, 4_000) || undefined,
      status: "active",
      createdBy: actor,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.storage.set(potKey(pot.id), pot);
    const ids = (await this.storage.get<string[]>(INDEX_KEY)) ?? [];
    if (!ids.includes(pot.id)) await this.storage.set(INDEX_KEY, [...ids, pot.id]);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "finance",
      action: "budget.pot.created",
      message: `Created budget pot “${pot.name}”.`,
      metadata: { budgetPotId: pot.id, allocatedCents: pot.allocatedCents, fundedCents: pot.fundedCents, currency: pot.currency },
    });
    this.events.emit({ agencyId: this.agencyId }, "agency-finance.budget.created", { budgetPotId: pot.id });
    return pot;
  }

  async update(actor: UserId, id: string, patch: UpdateBudgetPotPatch): Promise<BudgetPot | null> {
    const current = await this.get(id);
    if (!current) return null;
    const allocatedCents = Math.round(patch.allocatedCents ?? current.allocatedCents);
    const fundedCents = Math.round(patch.fundedCents ?? current.fundedCents);
    validateAmounts(allocatedCents, fundedCents);
    const startAt = patch.startAt === null ? undefined : patch.startAt ?? current.startAt;
    const endAt = patch.endAt === null ? undefined : patch.endAt ?? current.endAt;
    validateDates(startAt, endAt);
    const next: BudgetPot = {
      ...current,
      name: patch.name?.trim().slice(0, 160) || current.name,
      purpose: patch.purpose ?? current.purpose,
      companyIds: patch.companyIds === undefined ? current.companyIds : cleanIds(patch.companyIds),
      period: patch.period ?? current.period,
      allocatedCents,
      fundedCents,
      startAt,
      endAt,
      notes: patch.notes === null ? undefined : patch.notes?.trim().slice(0, 4_000) ?? current.notes,
      status: patch.status ?? current.status,
      updatedAt: now(),
    };
    await this.storage.set(potKey(id), next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "finance",
      action: "budget.pot.updated",
      message: `Updated budget pot “${next.name}”.`,
      metadata: { budgetPotId: id, allocatedCents, fundedCents, status: next.status },
    });
    this.events.emit({ agencyId: this.agencyId }, "agency-finance.budget.updated", { budgetPotId: id });
    return next;
  }
}

function validateAmounts(allocatedCents: number, fundedCents: number): void {
  if (!Number.isFinite(allocatedCents) || allocatedCents < 0) throw new Error("Allocated amount must be zero or more.");
  if (!Number.isFinite(fundedCents) || fundedCents < 0) throw new Error("Funded amount must be zero or more.");
}

function validateDates(startAt?: number, endAt?: number): void {
  if (startAt && endAt && endAt < startAt) throw new Error("Budget end date must be after its start date.");
}

function cleanIds(values?: string[]): string[] | undefined {
  const ids = [...new Set((values ?? []).map(value => value.trim().slice(0, 120)).filter(Boolean))].slice(0, 20);
  return ids.length ? ids : undefined;
}
