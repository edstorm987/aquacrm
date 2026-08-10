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
  ExpenseAttachment,
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
    const indexedIds = (await this.storage.get<string[]>(EXP_INDEX_KEY)) ?? [];
    const storedIds = (await this.storage.list("expenses/by-id/"))
      .map(key => key.slice("expenses/by-id/".length))
      .filter(Boolean);
    const ids = [...new Set([...indexedIds, ...storedIds])];
    const out: Expense[] = [];
    for (const id of ids) {
      const row = await this.storage.get<Expense>(expKey(id));
      if (row) out.push(row);
    }
    return out
      .filter(e => !filter?.status || e.status === filter.status)
      .filter(e => !filter?.clientId || e.clientId === filter.clientId)
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

  async create(input: CreateExpenseInput, actor: UserId, defaultCurrency: Currency = "gbp"): Promise<Expense> {
    if (input.amountCents <= 0) throw new Error("amountCents must be > 0.");
    if ((input.taxCents ?? 0) < 0 || (input.taxCents ?? 0) > input.amountCents) {
      throw new Error("taxCents must be between 0 and amountCents.");
    }
    if ((input.businessUsePercent ?? 100) < 0 || (input.businessUsePercent ?? 100) > 100) {
      throw new Error("businessUsePercent must be between 0 and 100.");
    }
    const cat = await this.categories.get(input.categoryId);
    if (!cat) throw new Error(`Category ${input.categoryId} not found.`);
    if (cat.status !== "active") throw new Error(`Category ${cat.name} is archived.`);

    const id = makeId("exp");
    const ts = now();
    const row: Expense = {
      id,
      agencyId: this.agencyId,
      clientId: input.clientId,
      staffId: input.staffId,
      categoryId: input.categoryId,
      vendor: input.vendor?.trim().slice(0, 180) || undefined,
      description: input.description?.trim().slice(0, 2_000) || undefined,
      reason: input.reason?.trim().slice(0, 4_000) || undefined,
      amountCents: input.amountCents,
      netCents: input.amountCents - (input.taxCents ?? 0),
      taxCents: input.taxCents ?? 0,
      taxRateBps: input.taxRateBps,
      taxDeductible: input.taxDeductible ?? true,
      businessUsePercent: input.businessUsePercent ?? 100,
      billableToClient: input.billableToClient ?? false,
      currency: input.currency ?? defaultCurrency,
      incurredAt: input.incurredAt ?? ts,
      status: input.recordAsPaid ? "reimbursed" : "pending",
      receiptUrl: input.receiptUrl,
      attachments: input.attachments?.slice(0, 8).map(attachment => ({
        id: attachment.id.slice(0, 120),
        name: attachment.name.trim().slice(0, 180),
        url: attachment.url.slice(0, 2_000),
        size: Math.max(0, Math.round(attachment.size)),
        contentType: attachment.contentType.slice(0, 180),
        storageProvider: attachment.storageProvider,
        storageKey: attachment.storageKey.slice(0, 2_000),
        uploadedAt: attachment.uploadedAt,
      })),
      paymentMethod: input.paymentMethod,
      reference: input.reference,
      recurrence: input.recurrence,
      nextDueAt: input.recurrence
        ? input.nextDueAt ?? nextOccurrence(input.incurredAt ?? ts, input.recurrence)
        : undefined,
      recurringActive: input.recurrence ? input.recurringActive ?? true : undefined,
      customFields: cleanCustomFields(input.customFields),
      ...(input.recordAsPaid ? { approvedBy: actor, approvedAt: ts, reimbursedAt: ts } : {}),
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
      clientId: input.clientId,
      metadata: {
        expenseId: id,
        categoryId: input.categoryId,
        amountCents: row.amountCents,
        taxCents: row.taxCents,
        clientId: input.clientId,
      },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: input.clientId }, "expense.created", { expenseId: id });
    return row;
  }

  async update(id: string, patch: UpdateExpensePatch, actor: UserId): Promise<Expense | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const amountCents = patch.amountCents ?? existing.amountCents;
    const taxCents = patch.taxCents ?? existing.taxCents ?? 0;
    const businessUsePercent = patch.businessUsePercent ?? existing.businessUsePercent ?? 100;
    if (amountCents <= 0) throw new Error("amountCents must be > 0.");
    if (taxCents < 0 || taxCents > amountCents) {
      throw new Error("taxCents must be between 0 and amountCents.");
    }
    if (businessUsePercent < 0 || businessUsePercent > 100) {
      throw new Error("businessUsePercent must be between 0 and 100.");
    }

    const categoryId = patch.categoryId ?? existing.categoryId;
    if (categoryId !== existing.categoryId) {
      const category = await this.categories.get(categoryId);
      if (!category) throw new Error(`Category ${categoryId} not found.`);
      if (category.status !== "active") throw new Error(`Category ${category.name} is archived.`);
    }

    const recurrence = patch.recurrence === null ? undefined : patch.recurrence ?? existing.recurrence;
    const nextDueAt = recurrence
      ? patch.nextDueAt === null
        ? nextOccurrence(patch.incurredAt ?? existing.incurredAt, recurrence)
        : patch.nextDueAt ?? existing.nextDueAt ?? nextOccurrence(patch.incurredAt ?? existing.incurredAt, recurrence)
      : undefined;
    const nextStaffId = optionalText(patch.staffId, existing.staffId, 180);
    const nextClientId = optionalText(patch.clientId, existing.clientId, 180) as Expense["clientId"];
    const next: Expense = {
      ...existing,
      ...patch,
      clientId: nextClientId,
      staffId: nextStaffId,
      categoryId,
      vendor: optionalText(patch.vendor, existing.vendor, 180),
      description: optionalText(patch.description, existing.description, 2_000),
      reason: optionalText(patch.reason, existing.reason, 4_000),
      amountCents,
      taxCents,
      taxRateBps: patch.taxRateBps === null ? undefined : patch.taxRateBps ?? existing.taxRateBps,
      businessUsePercent,
      receiptUrl: optionalText(patch.receiptUrl, existing.receiptUrl, 2_000),
      attachments: patch.attachments ? cleanAttachments(patch.attachments) : existing.attachments,
      paymentMethod: patch.paymentMethod === null ? undefined : patch.paymentMethod ?? existing.paymentMethod,
      reference: optionalText(patch.reference, existing.reference, 500),
      recurrence,
      nextDueAt,
      recurringActive: recurrence ? patch.recurringActive ?? existing.recurringActive ?? true : undefined,
      customFields: patch.customFields ? cleanCustomFields(patch.customFields) : existing.customFields,
      netCents: amountCents - taxCents,
      updatedAt: now(),
    };
    await this.storage.set(expKey(id), next);

    if (categoryId !== existing.categoryId) {
      await this.removeFromIndex(byCategoryKey(existing.categoryId), id);
      await this.addToIndex(byCategoryKey(categoryId), id);
    }
    if (nextStaffId !== existing.staffId) {
      if (existing.staffId) await this.removeFromIndex(byStaffKey(existing.staffId), id);
      if (nextStaffId) await this.addToIndex(byStaffKey(nextStaffId), id);
    }

    const changedFields = Object.keys(patch).filter(key => {
      const field = key as keyof UpdateExpensePatch;
      return JSON.stringify(patch[field]) !== JSON.stringify(existing[field as keyof Expense]);
    });
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: next.clientId,
      actorUserId: actor,
      category: "finance",
      action: "expense.updated",
      message: `Amended expense ${id}.`,
      metadata: { expenseId: id, changedFields, previousClientId: existing.clientId, clientId: next.clientId },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: next.clientId }, "expense.updated", { expenseId: id, changedFields });
    return next;
  }

  private async addToIndex(key: string, id: string): Promise<void> {
    const ids = (await this.storage.get<string[]>(key)) ?? [];
    if (!ids.includes(id)) await this.storage.set(key, [...ids, id]);
  }

  private async removeFromIndex(key: string, id: string): Promise<void> {
    const ids = (await this.storage.get<string[]>(key)) ?? [];
    if (ids.includes(id)) await this.storage.set(key, ids.filter(existingId => existingId !== id));
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

  async postNextOccurrence(id: string, actor: UserId): Promise<{ source: Expense; expense: Expense } | null> {
    const source = await this.get(id);
    if (!source) return null;
    if (!source.recurrence || source.recurringActive === false) {
      throw new Error("This expense does not have an active recurring schedule.");
    }
    const incurredAt = source.nextDueAt ?? nextOccurrence(source.incurredAt, source.recurrence);
    const expense = await this.create({
      clientId: source.clientId,
      staffId: source.staffId,
      categoryId: source.categoryId,
      vendor: source.vendor,
      description: source.description,
      reason: source.reason,
      amountCents: source.amountCents,
      taxCents: source.taxCents,
      taxRateBps: source.taxRateBps,
      taxDeductible: source.taxDeductible,
      businessUsePercent: source.businessUsePercent,
      billableToClient: source.billableToClient,
      currency: source.currency,
      incurredAt,
      receiptUrl: undefined,
      attachments: undefined,
      paymentMethod: source.paymentMethod,
      reference: source.reference,
      customFields: source.customFields,
      recordAsPaid: false,
    }, actor, source.currency);
    const updatedSource: Expense = {
      ...source,
      nextDueAt: nextOccurrence(incurredAt, source.recurrence),
      updatedAt: now(),
    };
    await this.storage.set(expKey(source.id), updatedSource);
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: source.clientId,
      actorUserId: actor,
      category: "finance",
      action: "expense.recurring.posted",
      message: `Posted the next ${source.recurrence} expense for ${source.vendor || source.description || source.id}.`,
      metadata: { scheduleExpenseId: source.id, expenseId: expense.id, nextDueAt: updatedSource.nextDueAt },
    });
    return { source: updatedSource, expense };
  }
}

function cleanCustomFields(value: unknown): Record<string, string | string[] | boolean> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const cleaned: Record<string, string | string[] | boolean> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
    const key = rawKey.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 80);
    if (!key) continue;
    if (typeof rawValue === "boolean") cleaned[key] = rawValue;
    else if (typeof rawValue === "string") cleaned[key] = rawValue.trim().slice(0, 4_000);
    else if (Array.isArray(rawValue)) {
      cleaned[key] = rawValue.filter((item): item is string => typeof item === "string").map(item => item.trim().slice(0, 200)).filter(Boolean).slice(0, 40);
    }
  }
  return Object.keys(cleaned).length ? cleaned : undefined;
}

function optionalText(value: string | null | undefined, existing: string | undefined, maxLength: number): string | undefined {
  if (value === undefined) return existing;
  if (value === null) return undefined;
  return value.trim().slice(0, maxLength) || undefined;
}

function cleanAttachments(attachments: ExpenseAttachment[]): ExpenseAttachment[] | undefined {
  const cleaned = attachments.slice(0, 8).map(attachment => ({
    id: attachment.id.slice(0, 120),
    name: attachment.name.trim().slice(0, 180),
    url: attachment.url.slice(0, 2_000),
    size: Math.max(0, Math.round(attachment.size)),
    contentType: attachment.contentType.slice(0, 180),
    storageProvider: attachment.storageProvider,
    storageKey: attachment.storageKey.slice(0, 2_000),
    uploadedAt: attachment.uploadedAt,
  }));
  return cleaned.length ? cleaned : undefined;
}

function nextOccurrence(from: number, recurrence: NonNullable<CreateExpenseInput["recurrence"]>): number {
  const date = new Date(from);
  const months = recurrence === "monthly" ? 1 : recurrence === "quarterly" ? 3 : 12;
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.getTime();
}
