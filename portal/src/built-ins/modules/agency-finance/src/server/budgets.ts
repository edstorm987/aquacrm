import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type { BudgetPot, CreateBudgetPotInput, Currency, UpdateBudgetPotPatch } from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import {
  assertAllowedValue,
  assertCurrency,
  assertDateOrder,
  assertKnownFields,
  assertNonEmptyText,
  assertOptionalAllowedValue,
  assertOptionalStringArray,
  assertOptionalText,
  assertSafeInteger,
} from "../lib/runtimeValidation";

import { listRowIds } from "./rowIndex";

const INDEX_KEY = "budget-pots/index";
const potKey = (id: string): string => `budget-pots/by-id/${id}`;
const BUDGET_PURPOSES = ["growth", "marketing", "gear", "equipment", "expansion", "operations", "team", "tax", "emergency", "client-delivery", "other"] as const;
const BUDGET_PERIODS = ["one-off", "monthly", "quarterly", "annual", "custom"] as const;
const BUDGET_STATUSES = ["active", "paused", "closed"] as const;

export class BudgetService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
  ) {}

  async list(includeClosed = false): Promise<BudgetPot[]> {
    const rows: BudgetPot[] = [];
    for (const id of await listRowIds(this.storage, INDEX_KEY, "budget-pots/by-id/")) {
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
    assertKnownFields(input, ["name", "purpose", "companyIds", "currency", "period", "allocatedCents", "fundedCents", "startAt", "endAt", "notes"]);
    assertNonEmptyText(input.name, "name");
    assertAllowedValue(input.purpose, BUDGET_PURPOSES, "purpose");
    assertOptionalAllowedValue(input.period, BUDGET_PERIODS, "period");
    assertOptionalStringArray(input.companyIds, "companyIds");
    assertOptionalText(input.notes, "notes");
    const currency = input.currency ?? defaultCurrency;
    assertCurrency(currency);
    const name = input.name.trim().slice(0, 160);
    validateAmounts(input.allocatedCents, input.fundedCents ?? 0);
    validateDates(input.startAt, input.endAt);
    const timestamp = now();
    const pot: BudgetPot = {
      id: makeId("budget"),
      agencyId: this.agencyId,
      name,
      purpose: input.purpose,
      companyIds: cleanIds(input.companyIds),
      currency,
      period: input.period ?? "one-off",
      allocatedCents: input.allocatedCents,
      fundedCents: input.fundedCents ?? 0,
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
    assertKnownFields(patch, ["name", "purpose", "companyIds", "period", "allocatedCents", "fundedCents", "startAt", "endAt", "notes", "status"]);
    if (patch.name !== undefined) assertNonEmptyText(patch.name, "name");
    assertOptionalAllowedValue(patch.purpose, BUDGET_PURPOSES, "purpose");
    assertOptionalAllowedValue(patch.period, BUDGET_PERIODS, "period");
    assertOptionalAllowedValue(patch.status, BUDGET_STATUSES, "status");
    assertOptionalStringArray(patch.companyIds, "companyIds");
    if (patch.notes !== null) assertOptionalText(patch.notes, "notes");
    const allocatedCents = patch.allocatedCents ?? current.allocatedCents;
    const fundedCents = patch.fundedCents ?? current.fundedCents;
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
  assertSafeInteger(allocatedCents, "allocatedCents", { min: 0 });
  assertSafeInteger(fundedCents, "fundedCents", { min: 0 });
}

function validateDates(startAt?: number, endAt?: number): void {
  assertDateOrder(startAt, endAt, "startAt", "endAt");
}

function cleanIds(values?: string[]): string[] | undefined {
  const ids = [...new Set((values ?? []).map(value => value.trim().slice(0, 120)).filter(Boolean))].slice(0, 20);
  return ids.length ? ids : undefined;
}
