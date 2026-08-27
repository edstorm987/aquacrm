// Expense service. CRUD + approval workflow.
//
// Storage:
//   expenses/by-id/<id>            → Expense
//   expenses/by-category/<catId>   → string[] of expense ids
//   expenses/by-staff/<staffId>    → string[] of expense ids
//   expenses/index                 → string[] of all expense ids

import { deriveRecordId, normaliseIdempotencyKey } from "../lib/idempotency";
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
import type { BudgetService } from "./budgets";

import { listRowIds } from "./rowIndex";
import { validatePortalEntityFields } from "@/server/portalEditor";
import {
  assertAllowedValue,
  assertCurrency,
  assertDateOrder,
  assertExpenseAttachments,
  assertKnownFields,
  assertNonEmptyText,
  assertOptionalAllowedValue,
  assertOptionalBoolean,
  assertOptionalFiniteRange,
  assertOptionalSafeInteger,
  assertOptionalText,
  assertOptionalTimestamp,
  assertSafeInteger,
  assertTimestamp,
} from "../lib/runtimeValidation";

const EXP_INDEX_KEY = "expenses/index";
const expKey = (id: string): string => `expenses/by-id/${id}`;
const recurringOperationPrefix = (id: string): string => `expenses/recurring-operations/${id}/`;
const recurringOperationKey = (id: string, occurrenceAt: number): string => `${recurringOperationPrefix(id)}${occurrenceAt}`;
const recurringResultKey = (id: string, occurrenceAt: number): string => `expenses/recurring-results/${id}/${occurrenceAt}`;
const EXPENSE_RECURRENCES = ["monthly", "quarterly", "annual"] as const;
const EXPENSE_PAYMENT_METHODS = ["bank-transfer", "card", "cash", "direct-debit", "other"] as const;
// `expenses/by-category/<id>` and `expenses/by-staff/<id>` used to be maintained
// here on every create and every re-category/re-assign. Nothing read by-staff at
// all, and by-category was read only by `listForCategory`, which now filters
// through `list()` like every other query. Two more racy read-modify-writes per
// expense, for indexes no query used. Removed; stragglers in existing stores are
// inert (unread keys in the plugin's own slice).

interface RecurringExpenseOperation {
  version: 1;
  agencyId: AgencyId;
  scheduleExpenseId: string;
  occurrenceAt: number;
  nextDueAt: number;
  childExpenseId: string;
  childInput: CreateExpenseInput;
  actorUserId: UserId;
  createdAt: number;
}

interface RecurringExpenseResult {
  version: 1;
  agencyId: AgencyId;
  scheduleExpenseId: string;
  occurrenceAt: number;
  nextDueAt: number;
  childExpenseId: string;
  completedAt: number;
}

const recurringTails = new Map<string, Promise<void>>();

async function withLocalRecurringLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = recurringTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  recurringTails.set(key, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (recurringTails.get(key) === tail) recurringTails.delete(key);
  }
}

export class ExpenseService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private categories: CategoryService,
    private budgets: BudgetService,
  ) {}

  private async withRecurringLock<T>(scheduleExpenseId: string, operation: () => Promise<T>): Promise<T> {
    const key = `recurring-expense:${this.agencyId}:${scheduleExpenseId}`;
    return this.storage.runExclusive
      ? this.storage.runExclusive(key, operation)
      : withLocalRecurringLock(key, operation);
  }

  async list(filter?: ExpenseFilter): Promise<Expense[]> {
    const ids = await listRowIds(this.storage, EXP_INDEX_KEY, "expenses/by-id/");
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

  // Through `list` rather than a `by-category` array: same filter, and it can't
  // miss an expense whose index slot was lost to a concurrent create.
  async listForCategory(categoryId: string): Promise<Expense[]> {
    return this.list({ categoryId });
  }

  // Record an expense. Idempotent on `input.idempotencyKey`: a resubmit of the
  // SAME intent (a double-clicked "Add expense" / a retry) returns the first
  // expense instead of double-counting money-out through P&L, budget-pot burn
  // and every margin derived from them. A genuinely separate expense is a new
  // intent → a new key → a new id → recorded normally, even at the identical
  // amount (two £50 taxi receipts on one day are both real). Without a key,
  // behaviour is unchanged — a fresh random id every call. See lib/idempotency.ts.
  async create(input: CreateExpenseInput, actor: UserId, defaultCurrency: Currency = "gbp"): Promise<Expense> {
    return (await this.createDetailed(input, actor, defaultCurrency)).expense;
  }

  // Same create, and additionally reports whether this call was an accidental
  // resubmit that reused an existing expense. `create` keeps the plain-`Expense`
  // shape every existing caller expects; the HTTP handler uses this one so the
  // response can say `deduped` honestly.
  async createDetailed(input: CreateExpenseInput, actor: UserId, defaultCurrency: Currency = "gbp"): Promise<{ expense: Expense; deduped: boolean }> {
    assertKnownFields(input, ["clientId", "staffId", "categoryId", "budgetPotId", "vendor", "description", "reason", "amountCents", "taxCents", "taxRateBps", "taxDeductible", "businessUsePercent", "billableToClient", "currency", "incurredAt", "receiptUrl", "attachments", "paymentMethod", "reference", "recurrence", "nextDueAt", "recurringActive", "recordAsPaid", "customFields", "idempotencyKey"]);
    assertOptionalText(input.idempotencyKey, "idempotencyKey");
    const ts = now();
    const currency = input.currency ?? defaultCurrency;
    validateExpenseState({
      ...input,
      currency,
      incurredAt: input.incurredAt ?? ts,
      taxCents: input.taxCents ?? 0,
      businessUsePercent: input.businessUsePercent ?? 100,
    });
    const cat = await this.categories.get(input.categoryId);
    if (!cat) throw new Error(`Category ${input.categoryId} not found.`);
    if (cat.status !== "active") throw new Error(`Category ${cat.name} is archived.`);
    if (input.budgetPotId) await this.assertBudgetPot(input.budgetPotId, currency);
    const customFields = input.customFields === undefined
      ? {}
      : validatePortalEntityFields(this.agencyId, "expenses", input.customFields);

    // The id is DERIVED from the key, so a raced resubmit lands on the same
    // storage slot (an overwrite) rather than becoming a second row — a
    // read-then-check "have I seen this key?" lookup races between its read and
    // its write; a deterministic id does not.
    const key = normaliseIdempotencyKey(input.idempotencyKey);
    const id = deriveRecordId("exp", key);
    if (key) {
      const prior = await this.storage.get<Expense>(expKey(id));
      // Return the first expense; don't re-write, re-log or re-emit.
      if (prior && prior.agencyId === this.agencyId) {
        // A prior attempt can fail after the deterministic row write but before
        // the advisory index. Repair that harmlessly on retry; list() already
        // scans rows, but the fast path should converge too.
        await this.addToIndex(EXP_INDEX_KEY, id);
        return { expense: prior, deduped: true };
      }
    }

    const row: Expense = {
      id,
      agencyId: this.agencyId,
      clientId: input.clientId,
      staffId: input.staffId,
      categoryId: input.categoryId,
      budgetPotId: input.budgetPotId,
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
      currency,
      incurredAt: input.incurredAt ?? ts,
      status: input.recordAsPaid ? "reimbursed" : "pending",
      receiptUrl: input.receiptUrl,
      attachments: input.attachments?.slice(0, 8).map(attachment => ({
        id: attachment.id.slice(0, 120),
        name: attachment.name.trim().slice(0, 180),
        url: attachment.url.slice(0, 2_000),
        size: attachment.size,
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
      customFields,
      ...(input.recordAsPaid ? { approvedBy: actor, approvedAt: ts, reimbursedAt: ts } : {}),
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(expKey(id), row);
    const ix = (await this.storage.get<string[]>(EXP_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(EXP_INDEX_KEY, [...ix, id]);
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
        budgetPotId: input.budgetPotId,
        amountCents: row.amountCents,
        taxCents: row.taxCents,
        clientId: input.clientId,
      },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: input.clientId }, "expense.created", { expenseId: id });
    return { expense: row, deduped: false };
  }

  async update(id: string, patch: UpdateExpensePatch, actor: UserId): Promise<Expense | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    assertKnownFields(patch, ["clientId", "staffId", "categoryId", "budgetPotId", "vendor", "description", "reason", "amountCents", "currency", "taxCents", "taxRateBps", "taxDeductible", "businessUsePercent", "billableToClient", "incurredAt", "receiptUrl", "attachments", "paymentMethod", "reference", "recurrence", "nextDueAt", "recurringActive", "customFields"]);
    if (patch.attachments !== undefined) assertExpenseAttachments(patch.attachments);

    const amountCents = patch.amountCents ?? existing.amountCents;
    const taxCents = patch.taxCents ?? existing.taxCents ?? 0;
    const businessUsePercent = patch.businessUsePercent ?? existing.businessUsePercent ?? 100;

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
    const nextBudgetPotId = optionalText(patch.budgetPotId, existing.budgetPotId, 180);
    const nextCurrency = patch.currency ?? existing.currency;
    if (nextBudgetPotId) await this.assertBudgetPot(nextBudgetPotId, nextCurrency);
    const customFields = patch.customFields === undefined
      ? existing.customFields ?? {}
      : validatePortalEntityFields(this.agencyId, "expenses", patch.customFields, existing.customFields);
    const next: Expense = {
      ...existing,
      ...patch,
      clientId: nextClientId,
      staffId: nextStaffId,
      budgetPotId: nextBudgetPotId,
      categoryId,
      vendor: optionalText(patch.vendor, existing.vendor, 180),
      description: optionalText(patch.description, existing.description, 2_000),
      reason: optionalText(patch.reason, existing.reason, 4_000),
      amountCents,
      taxCents,
      taxRateBps: patch.taxRateBps === null ? undefined : patch.taxRateBps ?? existing.taxRateBps,
      businessUsePercent,
      receiptUrl: optionalText(patch.receiptUrl, existing.receiptUrl, 2_000),
      attachments: patch.attachments === undefined ? existing.attachments : cleanAttachments(patch.attachments),
      paymentMethod: patch.paymentMethod === null ? undefined : patch.paymentMethod ?? existing.paymentMethod,
      reference: optionalText(patch.reference, existing.reference, 500),
      recurrence,
      nextDueAt,
      recurringActive: recurrence ? patch.recurringActive ?? existing.recurringActive ?? true : undefined,
      customFields,
      netCents: amountCents - taxCents,
      updatedAt: now(),
    };
    validateExpenseState(next);
    await this.storage.set(expKey(id), next);

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

  private async assertBudgetPot(id: string, currency: Currency): Promise<void> {
    const pot = await this.budgets.get(id);
    if (!pot) throw new Error(`Budget pot ${id} not found.`);
    if (pot.status !== "active") throw new Error(`Budget pot ${pot.name} is not active.`);
    if (pot.currency !== currency) throw new Error(`Budget pot ${pot.name} uses ${pot.currency.toUpperCase()}, not ${currency.toUpperCase()}.`);
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
    assertOptionalText(decisionNote, "decisionNote");
    if (existing.status !== "pending") return existing;             // idempotent on non-pending
    const next: Expense = {
      ...existing,
      status: "approved",
      approvedBy: actor,
      approvedAt: now(),
      decisionNote: decisionNote?.trim().slice(0, 4_000) || undefined,
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
    assertOptionalText(decisionNote, "decisionNote");
    if (existing.status !== "pending") return existing;
    const next: Expense = {
      ...existing,
      status: "rejected",
      approvedBy: actor,
      approvedAt: now(),
      decisionNote: decisionNote?.trim().slice(0, 4_000) || undefined,
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

  async postNextOccurrence(
    id: string,
    actor: UserId,
    requestedOccurrenceAt?: number,
  ): Promise<{ source: Expense; expense: Expense; replayed: boolean } | null> {
    if (requestedOccurrenceAt !== undefined) assertTimestamp(requestedOccurrenceAt, "occurrenceAt");
    // Preserve the package-level convenience call while giving two concurrent
    // callers the same intent before either enters the mutation lock. Mounted
    // callers send this value explicitly, which also survives HTTP retries and
    // separate processes.
    const sourceBeforeLock = requestedOccurrenceAt === undefined ? await this.get(id) : null;
    const occurrenceIntent = requestedOccurrenceAt
      ?? (sourceBeforeLock?.recurrence
        ? sourceBeforeLock.nextDueAt ?? nextOccurrence(sourceBeforeLock.incurredAt, sourceBeforeLock.recurrence)
        : undefined);
    return this.withRecurringLock(id, async () => {
      // An interrupted prior posting wins over a newer-looking request. This is
      // what makes retry-after-reload safe when the child/source committed but
      // the audit write or final marker cleanup failed.
      const pendingKeys = (await this.storage.list(recurringOperationPrefix(id))).sort();
      if (pendingKeys.length) {
        const pending = await this.storage.get<RecurringExpenseOperation>(pendingKeys[0]);
        if (!pending) throw new Error("agency-finance: recurring expense operation is missing");
        return this.finishRecurringOperation(pending, true);
      }

      if (occurrenceIntent !== undefined) {
        const replay = await this.readRecurringResult(id, occurrenceIntent);
        if (replay) return { ...replay, replayed: true };
      }

      const source = await this.get(id);
      if (!source) return null;
      if (!source.recurrence || source.recurringActive === false) {
        throw new Error("This expense does not have an active recurring schedule.");
      }
      const occurrenceAt = occurrenceIntent
        ?? source.nextDueAt
        ?? nextOccurrence(source.incurredAt, source.recurrence);
      const currentDueAt = source.nextDueAt ?? nextOccurrence(source.incurredAt, source.recurrence);
      if (occurrenceAt !== currentDueAt) {
        throw new Error("agency-finance: recurring occurrence is stale; refresh expenses and try again");
      }
      const occurrenceIdentity = `recurring:${source.id}:${occurrenceAt}`;
      const childInput: CreateExpenseInput = {
        clientId: source.clientId,
        staffId: source.staffId,
        categoryId: source.categoryId,
        budgetPotId: source.budgetPotId,
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
        incurredAt: occurrenceAt,
        receiptUrl: undefined,
        attachments: undefined,
        paymentMethod: source.paymentMethod,
        reference: source.reference,
        customFields: source.customFields,
        recordAsPaid: false,
        idempotencyKey: occurrenceIdentity,
      };
      const operation: RecurringExpenseOperation = {
        version: 1,
        agencyId: this.agencyId,
        scheduleExpenseId: source.id,
        occurrenceAt,
        nextDueAt: nextOccurrence(occurrenceAt, source.recurrence),
        childExpenseId: deriveRecordId("exp", occurrenceIdentity),
        childInput,
        actorUserId: actor,
        createdAt: now(),
      };
      // Marker first: every later partial state has enough durable information
      // for the next request/process to finish this exact occurrence.
      await this.storage.set(recurringOperationKey(id, occurrenceAt), operation);
      return this.finishRecurringOperation(operation, false);
    });
  }

  private async readRecurringResult(
    scheduleExpenseId: string,
    occurrenceAt: number,
  ): Promise<{ source: Expense; expense: Expense } | null> {
    const result = await this.storage.get<RecurringExpenseResult>(recurringResultKey(scheduleExpenseId, occurrenceAt));
    if (!result) return null;
    if (
      result.version !== 1
      || result.agencyId !== this.agencyId
      || result.scheduleExpenseId !== scheduleExpenseId
      || result.occurrenceAt !== occurrenceAt
    ) throw new Error("agency-finance: recurring expense result is invalid");
    const [source, expense] = await Promise.all([
      this.get(scheduleExpenseId),
      this.get(result.childExpenseId),
    ]);
    if (!source || !expense) throw new Error("agency-finance: recurring expense result is incomplete");
    return { source, expense };
  }

  private async finishRecurringOperation(
    operation: RecurringExpenseOperation,
    replayed: boolean,
  ): Promise<{ source: Expense; expense: Expense; replayed: boolean }> {
    if (
      operation.version !== 1
      || operation.agencyId !== this.agencyId
      || !Number.isSafeInteger(operation.occurrenceAt)
      || !Number.isSafeInteger(operation.nextDueAt)
    ) throw new Error("agency-finance: recurring expense operation is invalid");

    const { expense } = await this.createDetailed(
      operation.childInput,
      operation.actorUserId,
      operation.childInput.currency,
    );
    if (expense.id !== operation.childExpenseId) {
      throw new Error("agency-finance: recurring expense child identity is invalid");
    }

    // The result record is intentionally durable before the source advances.
    // A retry can therefore adopt the child rather than minting another row.
    const result: RecurringExpenseResult = {
      version: 1,
      agencyId: this.agencyId,
      scheduleExpenseId: operation.scheduleExpenseId,
      occurrenceAt: operation.occurrenceAt,
      nextDueAt: operation.nextDueAt,
      childExpenseId: operation.childExpenseId,
      completedAt: now(),
    };
    await this.storage.set(recurringResultKey(operation.scheduleExpenseId, operation.occurrenceAt), result);

    const liveSource = await this.get(operation.scheduleExpenseId);
    if (!liveSource) throw new Error("agency-finance: recurring expense schedule is missing");
    const liveDueAt = liveSource.recurrence
      ? liveSource.nextDueAt ?? nextOccurrence(liveSource.incurredAt, liveSource.recurrence)
      : undefined;
    let source = liveSource;
    if (liveDueAt === operation.occurrenceAt) {
      source = { ...liveSource, nextDueAt: operation.nextDueAt, updatedAt: now() };
      await this.storage.set(expKey(source.id), source);
    } else if (liveSource.nextDueAt !== operation.nextDueAt) {
      throw new Error("agency-finance: recurring expense schedule changed during posting");
    }

    await this.activity.logActivity({
      idempotencyKey: `finance:recurring-expense:${operation.scheduleExpenseId}:${operation.occurrenceAt}`,
      agencyId: this.agencyId,
      clientId: source.clientId,
      actorUserId: operation.actorUserId,
      category: "finance",
      action: "expense.recurring.posted",
      message: `Posted the next ${source.recurrence} expense for ${source.vendor || source.description || source.id}.`,
      metadata: {
        scheduleExpenseId: source.id,
        expenseId: expense.id,
        occurrenceAt: operation.occurrenceAt,
        nextDueAt: source.nextDueAt,
      },
    });
    this.events.emit(
      { agencyId: this.agencyId, clientId: source.clientId },
      "agency-finance.expense.recurring.posted",
      { scheduleExpenseId: source.id, expenseId: expense.id, occurrenceAt: operation.occurrenceAt, nextDueAt: source.nextDueAt },
    );
    await this.storage.del(recurringOperationKey(operation.scheduleExpenseId, operation.occurrenceAt));
    return { source, expense, replayed };
  }
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
    size: attachment.size,
    contentType: attachment.contentType.slice(0, 180),
    storageProvider: attachment.storageProvider,
    storageKey: attachment.storageKey.slice(0, 2_000),
    uploadedAt: attachment.uploadedAt,
  }));
  return cleaned.length ? cleaned : undefined;
}

function validateExpenseState(value: {
  categoryId: unknown;
  clientId?: unknown;
  staffId?: unknown;
  budgetPotId?: unknown;
  vendor?: unknown;
  description?: unknown;
  reason?: unknown;
  amountCents: unknown;
  taxCents?: unknown;
  taxRateBps?: unknown;
  taxDeductible?: unknown;
  businessUsePercent?: unknown;
  billableToClient?: unknown;
  currency: unknown;
  incurredAt: unknown;
  receiptUrl?: unknown;
  attachments?: unknown;
  paymentMethod?: unknown;
  reference?: unknown;
  recurrence?: unknown;
  nextDueAt?: unknown;
  recurringActive?: unknown;
  recordAsPaid?: unknown;
}): void {
  assertNonEmptyText(value.categoryId, "categoryId");
  assertOptionalText(value.clientId, "clientId");
  assertOptionalText(value.staffId, "staffId");
  assertOptionalText(value.budgetPotId, "budgetPotId");
  assertOptionalText(value.vendor, "vendor");
  assertOptionalText(value.description, "description");
  assertOptionalText(value.reason, "reason");
  assertSafeInteger(value.amountCents, "amountCents", { min: 1 });
  assertOptionalSafeInteger(value.taxCents, "taxCents", { min: 0 });
  const taxCents = value.taxCents ?? 0;
  if (typeof taxCents === "number" && typeof value.amountCents === "number" && taxCents > value.amountCents) {
    throw new Error("agency-finance: taxCents must not exceed amountCents");
  }
  assertOptionalSafeInteger(value.taxRateBps, "taxRateBps", { min: 0, max: 10_000 });
  assertOptionalBoolean(value.taxDeductible, "taxDeductible");
  assertOptionalFiniteRange(value.businessUsePercent, "businessUsePercent", { min: 0, max: 100 });
  assertOptionalBoolean(value.billableToClient, "billableToClient");
  assertCurrency(value.currency);
  assertTimestamp(value.incurredAt, "incurredAt");
  assertOptionalText(value.receiptUrl, "receiptUrl");
  assertExpenseAttachments(value.attachments);
  assertOptionalAllowedValue(value.paymentMethod, EXPENSE_PAYMENT_METHODS, "paymentMethod");
  assertOptionalText(value.reference, "reference");
  assertOptionalAllowedValue(value.recurrence, EXPENSE_RECURRENCES, "recurrence");
  assertOptionalTimestamp(value.nextDueAt, "nextDueAt");
  assertOptionalBoolean(value.recurringActive, "recurringActive");
  assertOptionalBoolean(value.recordAsPaid, "recordAsPaid");
  if (value.recurrence === undefined && (value.nextDueAt !== undefined || value.recurringActive !== undefined)) {
    throw new Error("agency-finance: nextDueAt/recurringActive require recurrence");
  }
  if (value.recurrence !== undefined) {
    assertAllowedValue(value.recurrence, EXPENSE_RECURRENCES, "recurrence");
    assertDateOrder(value.incurredAt as number, value.nextDueAt as number | undefined, "incurredAt", "nextDueAt");
  }
}

function nextOccurrence(from: number, recurrence: NonNullable<CreateExpenseInput["recurrence"]>): number {
  const date = new Date(from);
  const months = recurrence === "monthly" ? 1 : recurrence === "quarterly" ? 3 : 12;
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.getTime();
}
