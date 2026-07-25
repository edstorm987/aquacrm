// Expense service. CRUD + approval workflow.
//
// Storage:
//   expenses/by-id/<id>            → Expense
//   expenses/by-category/<catId>   → string[] of expense ids
//   expenses/by-staff/<staffId>    → string[] of expense ids
//   expenses/index                 → string[] of all expense ids

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CreateExpenseInput,
  Currency,
  Expense,
  ExpenseFilter,
  UpdateExpensePatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import type { CategoryService } from "./categories";

const EXP_INDEX_KEY = "expenses/index";
const expKey = (id: string): string => `expenses/by-id/${id}`;
const byCategoryKey = (cat: string): string => `expenses/by-category/${cat}`;
const byStaffKey = (staff: string): string => `expenses/by-staff/${staff}`;

export class ExpenseService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private categories: CategoryService,
  ) {}

  async list(filter?: ExpenseFilter): Promise<Expense[]> {
    const ids = (await this.storage.get<string[]>(EXP_INDEX_KEY)) ?? [];
    const out: Expense[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Expense>(expKey(id));
      if (row) out.push(row);
    }
    return out
      .filter(e => !filter?.status || e.status === filter.status)
      .filter(e => !filter?.categoryId || e.categoryId === filter.categoryId)
      .filter(e => !filter?.staffId || e.staffId === filter.staffId)
      .filter(e => !filter?.fromIncurredAt || e.incurredAt >= filter.fromIncurredAt)
      .filter(e => !filter?.toIncurredAt || e.incurredAt <= filter.toIncurredAt)
      .sort((a, b) => b.incurredAt - a.incurredAt);
  }

  async get(id: string): Promise<Expense | null> {
    const row = await this.storage.get<Expense>(expKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  async listForCategory(categoryId: string): Promise<Expense[]> {
    const ids = (await this.storage.get<string[]>(byCategoryKey(categoryId))) ?? [];
    const out: Expense[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Expense>(expKey(id));
      if (row) out.push(row);
    }
    return out;
  }

  async create(input: CreateExpenseInput, actor: UserId, defaultCurrency: Currency = "usd"): Promise<Expense> {
    if (input.amountCents <= 0) throw new Error("amountCents must be > 0.");
    const cat = await this.categories.get(input.categoryId);
    if (!cat) throw new Error(`Category ${input.categoryId} not found.`);
    if (cat.status !== "active") throw new Error(`Category ${cat.name} is archived.`);

    const id = makeId("exp");
    const ts = now();
    const row: Expense = {
      id,
      agencyId: this.agencyId,
      staffId: input.staffId,
      categoryId: input.categoryId,
      vendor: input.vendor,
      description: input.description,
      amountCents: input.amountCents,
      currency: input.currency ?? defaultCurrency,
      incurredAt: input.incurredAt ?? ts,
      status: "pending",
      receiptUrl: input.receiptUrl,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(expKey(id), row);
    const ix = (await this.storage.get<string[]>(EXP_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(EXP_INDEX_KEY, [...ix, id]);
    }
    const cIx = (await this.storage.get<string[]>(byCategoryKey(input.categoryId))) ?? [];
    if (!cIx.includes(id)) {
      await this.storage.set(byCategoryKey(input.categoryId), [...cIx, id]);
    }
    if (input.staffId) {
      const sIx = (await this.storage.get<string[]>(byStaffKey(input.staffId))) ?? [];
      if (!sIx.includes(id)) {
        await this.storage.set(byStaffKey(input.staffId), [...sIx, id]);
      }
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "finance",
      action: "expense.created",
      message: `Submitted expense (${(row.amountCents / 100).toFixed(2)} ${row.currency}, ${cat.name}).`,
      metadata: { expenseId: id, categoryId: input.categoryId, amountCents: row.amountCents },
    });
    this.events.emit({ agencyId: this.agencyId }, "expense.created", { expenseId: id });
    return row;
  }

  async update(id: string, patch: UpdateExpensePatch, actor: UserId): Promise<Expense | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (existing.status !== "pending") {
      throw new Error(`Cannot edit ${existing.status} expense — only pending expenses are editable.`);
    }
    const next: Expense = {
      ...existing,
      ...patch,
      updatedAt: now(),
    };
    await this.storage.set(expKey(id), next);
    return next;
  }

  async approve(id: string, actor: UserId, decisionNote?: string): Promise<Expense | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (existing.status !== "pending") return existing;             // idempotent on non-pending
    const next: Expense = {
      ...existing,
      status: "approved",
      approvedBy: actor,
      approvedAt: now(),
      decisionNote,
      updatedAt: now(),
    };
    await this.storage.set(expKey(id), next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "finance",
      action: "expense.approved",
      message: `Approved expense ${id}.`,
      metadata: { expenseId: id, amountCents: existing.amountCents },
    });
    this.events.emit({ agencyId: this.agencyId }, "expense.approved", { expenseId: id });
    return next;
  }

  async reject(id: string, actor: UserId, decisionNote?: string): Promise<Expense | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (existing.status !== "pending") return existing;
    const next: Expense = {
      ...existing,
      status: "rejected",
      approvedBy: actor,
      approvedAt: now(),
      decisionNote,
      updatedAt: now(),
    };
    await this.storage.set(expKey(id), next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "finance",
      action: "expense.rejected",
      message: `Rejected expense ${id}${decisionNote ? `: ${decisionNote}` : ""}.`,
      metadata: { expenseId: id, decisionNote },
    });
    this.events.emit({ agencyId: this.agencyId }, "expense.rejected", { expenseId: id });
    return next;
  }

  async reimburse(id: string, actor: UserId): Promise<Expense | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    if (existing.status !== "approved") {
      throw new Error(`Cannot reimburse ${existing.status} expense — must be approved first.`);
    }
    const next: Expense = {
      ...existing,
      status: "reimbursed",
      reimbursedAt: now(),
      updatedAt: now(),
    };
    await this.storage.set(expKey(id), next);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      actorUserId: actor,
      category: "finance",
      action: "expense.reimbursed",
      message: `Reimbursed expense ${id} (${(existing.amountCents / 100).toFixed(2)} ${existing.currency}).`,
      metadata: { expenseId: id, amountCents: existing.amountCents },
    });
    this.events.emit({ agencyId: this.agencyId }, "expense.reimbursed", { expenseId: id });
    return next;
  }
}
