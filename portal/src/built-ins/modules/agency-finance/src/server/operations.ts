import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, UserId } from "../lib/tenancy";
import type {
  CompensationPayment,
  CompensationProfile,
  CreateCompensationPaymentInput,
  CreateCompensationProfileInput,
  CreateFinanceObligationInput,
  Currency,
  FinanceObligation,
  UpdateCompensationPaymentPatch,
  UpdateCompensationProfilePatch,
  UpdateFinanceObligationPatch,
} from "../lib/domain";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import type { BudgetService } from "./budgets";

const OBLIGATION_INDEX = "operations/obligations/index";
const PROFILE_INDEX = "operations/compensation/index";
const PAYMENT_INDEX = "operations/payments/index";
const obligationKey = (id: string) => `operations/obligations/by-id/${id}`;
const profileKey = (id: string) => `operations/compensation/by-id/${id}`;
const paymentKey = (id: string) => `operations/payments/by-id/${id}`;

export class FinanceOperationsService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private budgets: BudgetService,
  ) {}

  async listObligations(includeArchived = false): Promise<FinanceObligation[]> {
    const rows = await this.listRows<FinanceObligation>(OBLIGATION_INDEX, "operations/obligations/by-id/");
    return rows
      .filter(row => includeArchived || row.status !== "archived")
      .sort((left, right) => (left.nextDueAt ?? Number.MAX_SAFE_INTEGER) - (right.nextDueAt ?? Number.MAX_SAFE_INTEGER) || right.updatedAt - left.updatedAt);
  }

  async getObligation(id: string): Promise<FinanceObligation | null> {
    const row = await this.storage.get<FinanceObligation>(obligationKey(id));
    return row?.agencyId === this.agencyId ? row : null;
  }

  async createObligation(actor: UserId, input: CreateFinanceObligationInput, defaultCurrency: Currency = "gbp"): Promise<FinanceObligation> {
    const name = requiredText(input.name, "Obligation name", 180);
    const currency = input.currency ?? defaultCurrency;
    validateMoney(input.expectedCostCents ?? 0, "Expected cost");
    validateMoney(input.coverageAmountCents ?? 0, "Coverage amount");
    validateDateOrder(input.effectiveAt, input.coverageEndsAt, "Coverage end must be after the effective date.");
    if (input.budgetPotId) await this.assertBudget(input.budgetPotId, currency);
    const timestamp = now();
    const row: FinanceObligation = {
      id: makeId("obligation"),
      agencyId: this.agencyId,
      name,
      type: input.type,
      companyIds: cleanIds(input.companyIds),
      status: input.status ?? "upcoming",
      frequency: input.frequency ?? "annual",
      owner: cleanText(input.owner, 160),
      provider: cleanText(input.provider, 180),
      reference: cleanText(input.reference, 140),
      linkedLegalDocumentId: cleanText(input.linkedLegalDocumentId, 160),
      budgetPotId: cleanText(input.budgetPotId, 160),
      currency,
      expectedCostCents: Math.round(input.expectedCostCents ?? 0),
      coverageAmountCents: positiveOptional(input.coverageAmountCents),
      effectiveAt: positiveOptional(input.effectiveAt),
      nextDueAt: positiveOptional(input.nextDueAt),
      reminderAt: positiveOptional(input.reminderAt),
      coverageEndsAt: positiveOptional(input.coverageEndsAt),
      notes: cleanText(input.notes, 4_000),
      createdBy: actor,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.persist(OBLIGATION_INDEX, obligationKey(row.id), row.id, row);
    await this.log(actor, "finance.obligation.created", `Created finance obligation “${row.name}”.`, { obligationId: row.id, type: row.type, nextDueAt: row.nextDueAt });
    this.events.emit({ agencyId: this.agencyId }, "agency-finance.obligation.created", { obligationId: row.id });
    return row;
  }

  async updateObligation(actor: UserId, id: string, patch: UpdateFinanceObligationPatch): Promise<FinanceObligation | null> {
    const current = await this.getObligation(id);
    if (!current) return null;
    const currency = patch.currency ?? current.currency;
    const budgetPotId = nullableText(patch.budgetPotId, current.budgetPotId, 160);
    if (budgetPotId) await this.assertBudget(budgetPotId, currency);
    const effectiveAt = nullableNumber(patch.effectiveAt, current.effectiveAt);
    const coverageEndsAt = nullableNumber(patch.coverageEndsAt, current.coverageEndsAt);
    validateDateOrder(effectiveAt, coverageEndsAt, "Coverage end must be after the effective date.");
    const expectedCostCents = Math.round(patch.expectedCostCents ?? current.expectedCostCents);
    validateMoney(expectedCostCents, "Expected cost");
    const next: FinanceObligation = {
      ...current,
      ...patch,
      name: patch.name === undefined ? current.name : requiredText(patch.name, "Obligation name", 180),
      companyIds: patch.companyIds === undefined ? current.companyIds : cleanIds(patch.companyIds),
      owner: patch.owner === undefined ? current.owner : cleanText(patch.owner, 160),
      provider: patch.provider === undefined ? current.provider : cleanText(patch.provider, 180),
      reference: patch.reference === undefined ? current.reference : cleanText(patch.reference, 140),
      linkedLegalDocumentId: nullableText(patch.linkedLegalDocumentId, current.linkedLegalDocumentId, 160),
      budgetPotId,
      currency,
      expectedCostCents,
      coverageAmountCents: patch.coverageAmountCents === undefined ? current.coverageAmountCents : positiveOptional(patch.coverageAmountCents),
      effectiveAt,
      nextDueAt: nullableNumber(patch.nextDueAt, current.nextDueAt),
      reminderAt: nullableNumber(patch.reminderAt, current.reminderAt),
      coverageEndsAt,
      lastCompletedAt: patch.lastCompletedAt === undefined
        ? patch.status === "completed" && current.status !== "completed" ? now() : current.lastCompletedAt
        : nullableNumber(patch.lastCompletedAt, current.lastCompletedAt),
      notes: patch.notes === undefined ? current.notes : cleanText(patch.notes, 4_000),
      updatedAt: now(),
    };
    await this.storage.set(obligationKey(id), next);
    await this.log(actor, "finance.obligation.updated", `Updated finance obligation “${next.name}”.`, { obligationId: id, status: next.status });
    return next;
  }

  async listCompensationProfiles(includeArchived = false): Promise<CompensationProfile[]> {
    const rows = await this.listRows<CompensationProfile>(PROFILE_INDEX, "operations/compensation/by-id/");
    return rows.filter(row => includeArchived || row.status !== "archived").sort((left, right) => left.name.localeCompare(right.name));
  }

  async getCompensationProfile(id: string): Promise<CompensationProfile | null> {
    const row = await this.storage.get<CompensationProfile>(profileKey(id));
    return row?.agencyId === this.agencyId ? row : null;
  }

  async createCompensationProfile(actor: UserId, input: CreateCompensationProfileInput, defaultCurrency: Currency = "gbp"): Promise<CompensationProfile> {
    const name = requiredText(input.name, "Payee name", 180);
    const currency = input.currency ?? defaultCurrency;
    validateMoney(input.baseRateCents, "Base rate");
    validateMoney(input.annualBonusTargetCents ?? 0, "Bonus target");
    validatePercent(input.employerCostPercent ?? 0);
    validateUnits(input.unitsPerWeek);
    validateDateOrder(input.contractStartsAt, input.contractEndsAt, "Contract end must be after its start date.");
    if (input.budgetPotId) await this.assertBudget(input.budgetPotId, currency);
    const timestamp = now();
    const row: CompensationProfile = {
      id: makeId("comp"),
      agencyId: this.agencyId,
      staffId: cleanText(input.staffId, 160),
      name,
      email: cleanText(input.email, 220),
      payeeType: input.payeeType,
      departmentId: cleanText(input.departmentId, 160),
      departmentName: cleanText(input.departmentName, 180),
      title: cleanText(input.title, 180),
      companyIds: cleanIds(input.companyIds),
      budgetPotId: cleanText(input.budgetPotId, 160),
      currency,
      rateBasis: input.rateBasis,
      baseRateCents: Math.round(input.baseRateCents),
      unitsPerWeek: input.unitsPerWeek,
      payFrequency: input.payFrequency ?? "monthly",
      employerCostPercent: input.employerCostPercent ?? 0,
      annualBonusTargetCents: Math.round(input.annualBonusTargetCents ?? 0),
      nextPayAt: positiveOptional(input.nextPayAt),
      contractStartsAt: positiveOptional(input.contractStartsAt),
      contractEndsAt: positiveOptional(input.contractEndsAt),
      status: "active",
      notes: cleanText(input.notes, 4_000),
      createdBy: actor,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.persist(PROFILE_INDEX, profileKey(row.id), row.id, row);
    await this.log(actor, "finance.compensation.created", `Created compensation profile for ${row.name}.`, { compensationProfileId: row.id, payeeType: row.payeeType });
    this.events.emit({ agencyId: this.agencyId }, "agency-finance.compensation.created", { compensationProfileId: row.id });
    return row;
  }

  async updateCompensationProfile(actor: UserId, id: string, patch: UpdateCompensationProfilePatch): Promise<CompensationProfile | null> {
    const current = await this.getCompensationProfile(id);
    if (!current) return null;
    const currency = patch.currency ?? current.currency;
    const budgetPotId = nullableText(patch.budgetPotId, current.budgetPotId, 160);
    if (budgetPotId) await this.assertBudget(budgetPotId, currency);
    const baseRateCents = Math.round(patch.baseRateCents ?? current.baseRateCents);
    const annualBonusTargetCents = Math.round(patch.annualBonusTargetCents ?? current.annualBonusTargetCents);
    const employerCostPercent = patch.employerCostPercent ?? current.employerCostPercent;
    validateMoney(baseRateCents, "Base rate");
    validateMoney(annualBonusTargetCents, "Bonus target");
    validatePercent(employerCostPercent);
    validateUnits(patch.unitsPerWeek ?? current.unitsPerWeek);
    const contractStartsAt = nullableNumber(patch.contractStartsAt, current.contractStartsAt);
    const contractEndsAt = nullableNumber(patch.contractEndsAt, current.contractEndsAt);
    validateDateOrder(contractStartsAt, contractEndsAt, "Contract end must be after its start date.");
    const next: CompensationProfile = {
      ...current,
      ...patch,
      name: patch.name === undefined ? current.name : requiredText(patch.name, "Payee name", 180),
      staffId: nullableText(patch.staffId, current.staffId, 160),
      email: patch.email === undefined ? current.email : cleanText(patch.email, 220),
      departmentId: nullableText(patch.departmentId, current.departmentId, 160),
      departmentName: nullableText(patch.departmentName, current.departmentName, 180),
      title: patch.title === undefined ? current.title : cleanText(patch.title, 180),
      companyIds: patch.companyIds === undefined ? current.companyIds : cleanIds(patch.companyIds),
      budgetPotId,
      currency,
      baseRateCents,
      employerCostPercent,
      annualBonusTargetCents,
      nextPayAt: nullableNumber(patch.nextPayAt, current.nextPayAt),
      contractStartsAt,
      contractEndsAt,
      notes: patch.notes === undefined ? current.notes : cleanText(patch.notes, 4_000),
      updatedAt: now(),
    };
    await this.storage.set(profileKey(id), next);
    await this.log(actor, "finance.compensation.updated", `Updated compensation profile for ${next.name}.`, { compensationProfileId: id, status: next.status });
    return next;
  }

  async listCompensationPayments(includeCancelled = false): Promise<CompensationPayment[]> {
    const rows = await this.listRows<CompensationPayment>(PAYMENT_INDEX, "operations/payments/by-id/");
    return rows.filter(row => includeCancelled || row.status !== "cancelled").sort((left, right) => right.dueAt - left.dueAt);
  }

  async getCompensationPayment(id: string): Promise<CompensationPayment | null> {
    const row = await this.storage.get<CompensationPayment>(paymentKey(id));
    return row?.agencyId === this.agencyId ? row : null;
  }

  async createCompensationPayment(actor: UserId, input: CreateCompensationPaymentInput): Promise<CompensationPayment> {
    const profile = await this.getCompensationProfile(input.profileId);
    if (!profile) throw new Error("Compensation profile not found.");
    const currency = input.currency ?? profile.currency;
    if (currency !== profile.currency) throw new Error(`Payment must use ${profile.currency.toUpperCase()} for ${profile.name}.`);
    validateMoney(input.grossCents, "Gross payment");
    validateMoney(input.employerCostCents ?? 0, "Employer cost");
    if (input.grossCents <= 0 && (input.employerCostCents ?? 0) <= 0) throw new Error("Payment amount must be greater than zero.");
    const budgetPotId = cleanText(input.budgetPotId, 160) ?? profile.budgetPotId;
    if (budgetPotId) await this.assertBudget(budgetPotId, currency);
    const timestamp = now();
    const status = input.status ?? "planned";
    const row: CompensationPayment = {
      id: makeId("payroll"),
      agencyId: this.agencyId,
      profileId: profile.id,
      budgetPotId,
      kind: input.kind,
      periodLabel: cleanText(input.periodLabel, 120),
      currency,
      grossCents: Math.round(input.grossCents),
      employerCostCents: Math.round(input.employerCostCents ?? 0),
      status,
      dueAt: positiveOptional(input.dueAt) ?? timestamp,
      paidAt: status === "paid" ? positiveOptional(input.paidAt) ?? timestamp : positiveOptional(input.paidAt),
      reference: cleanText(input.reference, 180),
      notes: cleanText(input.notes, 4_000),
      createdBy: actor,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.persist(PAYMENT_INDEX, paymentKey(row.id), row.id, row);
    await this.log(actor, "finance.compensation.payment.created", `Recorded ${row.kind.replaceAll("-", " ")} for ${profile.name}.`, { compensationPaymentId: row.id, profileId: profile.id, status: row.status, grossCents: row.grossCents });
    this.events.emit({ agencyId: this.agencyId }, "agency-finance.compensation.payment.created", { compensationPaymentId: row.id });
    return row;
  }

  async updateCompensationPayment(actor: UserId, id: string, patch: UpdateCompensationPaymentPatch): Promise<CompensationPayment | null> {
    const current = await this.getCompensationPayment(id);
    if (!current) return null;
    const profile = await this.getCompensationProfile(current.profileId);
    if (!profile) throw new Error("Compensation profile not found.");
    const currency = patch.currency ?? current.currency;
    if (currency !== profile.currency) throw new Error(`Payment must use ${profile.currency.toUpperCase()} for ${profile.name}.`);
    const budgetPotId = nullableText(patch.budgetPotId, current.budgetPotId, 160);
    if (budgetPotId) await this.assertBudget(budgetPotId, currency);
    const grossCents = Math.round(patch.grossCents ?? current.grossCents);
    const employerCostCents = Math.round(patch.employerCostCents ?? current.employerCostCents);
    validateMoney(grossCents, "Gross payment");
    validateMoney(employerCostCents, "Employer cost");
    const status = patch.status ?? current.status;
    const next: CompensationPayment = {
      ...current,
      ...patch,
      budgetPotId,
      currency,
      grossCents,
      employerCostCents,
      periodLabel: patch.periodLabel === undefined ? current.periodLabel : cleanText(patch.periodLabel, 120),
      reference: patch.reference === undefined ? current.reference : cleanText(patch.reference, 180),
      notes: patch.notes === undefined ? current.notes : cleanText(patch.notes, 4_000),
      status,
      dueAt: positiveOptional(patch.dueAt) ?? current.dueAt,
      paidAt: patch.paidAt === null ? undefined : patch.paidAt ?? (status === "paid" && current.status !== "paid" ? now() : current.paidAt),
      updatedAt: now(),
    };
    await this.storage.set(paymentKey(id), next);
    await this.log(actor, "finance.compensation.payment.updated", `Updated ${next.kind.replaceAll("-", " ")} for ${profile.name}.`, { compensationPaymentId: id, status: next.status });
    return next;
  }

  private async assertBudget(id: string, currency: Currency): Promise<void> {
    const pot = await this.budgets.get(id);
    if (!pot) throw new Error("Budget pot not found.");
    if (pot.status !== "active") throw new Error(`Budget pot ${pot.name} is not active.`);
    if (pot.currency !== currency) throw new Error(`Budget pot ${pot.name} uses ${pot.currency.toUpperCase()}, not ${currency.toUpperCase()}.`);
  }

  private async listRows<T extends { id: string; agencyId: AgencyId }>(indexKey: string, prefix: string): Promise<T[]> {
    const indexed = (await this.storage.get<string[]>(indexKey)) ?? [];
    const stored = (await this.storage.list(prefix)).map(key => key.slice(prefix.length)).filter(Boolean);
    const rows: T[] = [];
    for (const id of [...new Set([...indexed, ...stored])]) {
      const row = await this.storage.get<T>(`${prefix}${id}`);
      if (row?.agencyId === this.agencyId) rows.push(row);
    }
    return rows;
  }

  private async persist<T>(indexKey: string, key: string, id: string, row: T): Promise<void> {
    await this.storage.set(key, row);
    const ids = (await this.storage.get<string[]>(indexKey)) ?? [];
    if (!ids.includes(id)) await this.storage.set(indexKey, [...ids, id]);
  }

  private async log(actor: UserId, action: string, message: string, metadata: Record<string, unknown>): Promise<void> {
    await this.activity.logActivity({ agencyId: this.agencyId, actorUserId: actor, category: "finance", action, message, metadata });
  }
}

function requiredText(value: unknown, label: string, max: number): string {
  const text = typeof value === "string" ? value.trim().slice(0, max) : "";
  if (!text) throw new Error(`${label} required.`);
  return text;
}

function cleanText(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.trim().slice(0, max) || undefined : undefined;
}

function nullableText(value: string | null | undefined, fallback: string | undefined, max: number): string | undefined {
  if (value === undefined) return fallback;
  if (value === null) return undefined;
  return cleanText(value, max);
}

function nullableNumber(value: number | null | undefined, fallback: number | undefined): number | undefined {
  if (value === undefined) return fallback;
  if (value === null) return undefined;
  return positiveOptional(value);
}

function cleanIds(values?: string[]): string[] | undefined {
  const ids = [...new Set((values ?? []).map(value => value.trim().slice(0, 160)).filter(Boolean))].slice(0, 30);
  return ids.length ? ids : undefined;
}

function positiveOptional(value?: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

function validateMoney(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or more.`);
}

function validatePercent(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 200) throw new Error("Employer cost percentage must be between 0 and 200.");
}

function validateUnits(value?: number): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 168)) throw new Error("Units per week must be between 0 and 168.");
}

function validateDateOrder(start?: number, end?: number, message = "End date must be after start date."): void {
  if (start && end && end < start) throw new Error(message);
}
