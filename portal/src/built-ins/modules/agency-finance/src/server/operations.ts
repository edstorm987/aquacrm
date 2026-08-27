import { deriveRecordId, normaliseIdempotencyKey } from "../lib/idempotency";
import { makeId } from "../lib/ids";
import { listRowIds } from "./rowIndex";
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
import type {
  ActivityLogPort,
  CanonicalCompensationTerms,
  CompensationTermsPort,
  EventBusPort,
  StoragePort,
} from "./ports";
import type { BudgetService } from "./budgets";
import {
  assertAllowedValue,
  assertCurrency,
  assertDateOrder,
  assertFiniteRange,
  assertKnownFields,
  assertNonEmptyText,
  assertOptionalAllowedValue,
  assertOptionalCurrency,
  assertOptionalFiniteRange,
  assertOptionalNullableText,
  assertOptionalSafeInteger,
  assertOptionalStringArray,
  assertOptionalText,
  assertOptionalTimestamp,
  assertSafeInteger,
} from "../lib/runtimeValidation";

const OBLIGATION_INDEX = "operations/obligations/index";
const PROFILE_INDEX = "operations/compensation/index";
const PAYMENT_INDEX = "operations/payments/index";
const obligationKey = (id: string) => `operations/obligations/by-id/${id}`;
const profileKey = (id: string) => `operations/compensation/by-id/${id}`;
const paymentKey = (id: string) => `operations/payments/by-id/${id}`;
const OBLIGATION_TYPES = ["annual-accounts", "corporation-tax", "vat-return", "paye", "pension", "audit", "insurance", "licence", "contract-renewal", "data-protection", "other"] as const;
const OBLIGATION_FREQUENCIES = ["one-off", "monthly", "quarterly", "annual", "custom"] as const;
const OBLIGATION_STATUSES = ["upcoming", "action-required", "in-progress", "completed", "waived", "archived"] as const;
const PAYEE_TYPES = ["employee", "director", "freelancer", "contractor", "agency"] as const;
const RATE_BASES = ["annual", "monthly", "hourly", "daily", "fixed"] as const;
const PAY_FREQUENCIES = ["weekly", "fortnightly", "monthly", "quarterly", "milestone"] as const;
const PROFILE_STATUSES = ["active", "paused", "ended", "archived"] as const;
const PAYMENT_KINDS = ["salary", "wages", "bonus", "commission", "freelancer-invoice", "contractor-invoice", "employer-tax", "pension", "other"] as const;
const PAYMENT_STATUSES = ["planned", "approved", "paid", "cancelled"] as const;

export class FinanceOperationsService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private budgets: BudgetService,
    private compensation?: CompensationTermsPort,
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
    assertKnownFields(input, ["name", "type", "companyIds", "status", "frequency", "owner", "provider", "reference", "linkedLegalDocumentId", "budgetPotId", "currency", "expectedCostCents", "coverageAmountCents", "effectiveAt", "nextDueAt", "reminderAt", "coverageEndsAt", "notes"]);
    assertNonEmptyText(input.name, "name");
    assertAllowedValue(input.type, OBLIGATION_TYPES, "type");
    assertOptionalAllowedValue(input.status, OBLIGATION_STATUSES, "status");
    assertOptionalAllowedValue(input.frequency, OBLIGATION_FREQUENCIES, "frequency");
    assertOptionalStringArray(input.companyIds, "companyIds");
    validateOptionalTexts(input, ["owner", "provider", "reference", "linkedLegalDocumentId", "budgetPotId", "notes"]);
    const name = requiredText(input.name, "Obligation name", 180);
    const currency = input.currency ?? defaultCurrency;
    assertCurrency(currency);
    validateMoney(input.expectedCostCents ?? 0, "expectedCostCents");
    validateMoney(input.coverageAmountCents ?? 0, "coverageAmountCents");
    validateOptionalDates(input, ["effectiveAt", "nextDueAt", "reminderAt", "coverageEndsAt"]);
    validateDateOrder(input.effectiveAt, input.coverageEndsAt, "effectiveAt", "coverageEndsAt");
    validateDateOrder(input.reminderAt, input.nextDueAt, "reminderAt", "nextDueAt");
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
      expectedCostCents: input.expectedCostCents ?? 0,
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
    assertKnownFields(patch, ["name", "type", "companyIds", "status", "frequency", "owner", "provider", "reference", "linkedLegalDocumentId", "budgetPotId", "currency", "expectedCostCents", "coverageAmountCents", "effectiveAt", "nextDueAt", "reminderAt", "coverageEndsAt", "lastCompletedAt", "notes"]);
    if (patch.name !== undefined) assertNonEmptyText(patch.name, "name");
    assertOptionalAllowedValue(patch.type, OBLIGATION_TYPES, "type");
    assertOptionalAllowedValue(patch.status, OBLIGATION_STATUSES, "status");
    assertOptionalAllowedValue(patch.frequency, OBLIGATION_FREQUENCIES, "frequency");
    assertOptionalCurrency(patch.currency);
    assertOptionalStringArray(patch.companyIds, "companyIds");
    validateOptionalTexts(patch, ["owner", "provider", "reference", "notes"]);
    validateNullableTexts(patch, ["linkedLegalDocumentId", "budgetPotId"]);
    validateNullableDates(patch, ["effectiveAt", "nextDueAt", "reminderAt", "coverageEndsAt", "lastCompletedAt"]);
    assertOptionalSafeInteger(patch.expectedCostCents, "expectedCostCents", { min: 0 });
    assertOptionalSafeInteger(patch.coverageAmountCents, "coverageAmountCents", { min: 0 });
    const currency = patch.currency ?? current.currency;
    assertCurrency(currency);
    const budgetPotId = nullableText(patch.budgetPotId, current.budgetPotId, 160);
    if (budgetPotId) await this.assertBudget(budgetPotId, currency);
    const effectiveAt = nullableNumber(patch.effectiveAt, current.effectiveAt);
    const coverageEndsAt = nullableNumber(patch.coverageEndsAt, current.coverageEndsAt);
    validateDateOrder(effectiveAt, coverageEndsAt, "effectiveAt", "coverageEndsAt");
    const nextDueAt = nullableNumber(patch.nextDueAt, current.nextDueAt);
    const reminderAt = nullableNumber(patch.reminderAt, current.reminderAt);
    validateDateOrder(reminderAt, nextDueAt, "reminderAt", "nextDueAt");
    const expectedCostCents = patch.expectedCostCents ?? current.expectedCostCents;
    validateMoney(expectedCostCents, "expectedCostCents");
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
      nextDueAt,
      reminderAt,
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
    const projected = await Promise.all(rows.map(row => this.projectCompensationProfile(row)));
    return projected.filter(row => includeArchived || row.status !== "archived").sort((left, right) => left.name.localeCompare(right.name));
  }

  async getCompensationProfile(id: string): Promise<CompensationProfile | null> {
    const row = await this.getStoredCompensationProfile(id);
    return row ? this.projectCompensationProfile(row) : null;
  }

  async createCompensationProfile(actor: UserId, input: CreateCompensationProfileInput, defaultCurrency: Currency = "gbp"): Promise<CompensationProfile> {
    assertKnownFields(input, ["staffId", "name", "email", "payeeType", "departmentId", "departmentName", "title", "companyIds", "budgetPotId", "currency", "rateBasis", "baseRateCents", "unitsPerWeek", "payFrequency", "employerCostPercent", "annualBonusTargetCents", "nextPayAt", "contractStartsAt", "contractEndsAt", "notes"]);
    assertNonEmptyText(input.name, "name");
    assertAllowedValue(input.payeeType, PAYEE_TYPES, "payeeType");
    assertAllowedValue(input.rateBasis, RATE_BASES, "rateBasis");
    assertOptionalAllowedValue(input.payFrequency, PAY_FREQUENCIES, "payFrequency");
    assertOptionalStringArray(input.companyIds, "companyIds");
    validateOptionalTexts(input, ["staffId", "email", "departmentId", "departmentName", "title", "budgetPotId", "notes"]);
    validateOptionalDates(input, ["nextPayAt", "contractStartsAt", "contractEndsAt"]);
    const staffId = cleanText(input.staffId, 160);
    const canonical = staffId ? await this.requireCanonicalTerms(staffId) : null;
    if (canonical) await this.assertAvailableStaffLink(canonical, undefined);
    const name = canonical?.name ?? requiredText(input.name, "Payee name", 180);
    const currency = canonical?.currency ?? input.currency ?? defaultCurrency;
    assertCurrency(currency);
    const baseRateCents = canonical?.baseRateCents ?? input.baseRateCents;
    const annualBonusTargetCents = canonical?.annualBonusTargetCents ?? input.annualBonusTargetCents ?? 0;
    const unitsPerWeek = canonical?.rateBasis === "hourly" ? canonical.unitsPerWeek : input.unitsPerWeek;
    const contractStartsAt = canonical ? canonical.contractStartsAt : input.contractStartsAt;
    const contractEndsAt = canonical ? canonical.contractEndsAt : input.contractEndsAt;
    assertOptionalTimestamp(contractStartsAt, "contractStartsAt");
    assertOptionalTimestamp(contractEndsAt, "contractEndsAt");
    validateMoney(baseRateCents, "baseRateCents");
    validateMoney(annualBonusTargetCents, "annualBonusTargetCents");
    validatePercent(input.employerCostPercent ?? 0);
    validateUnits(unitsPerWeek);
    validateDateOrder(contractStartsAt, contractEndsAt, "contractStartsAt", "contractEndsAt");
    assertAllowedValue(canonical?.rateBasis ?? input.rateBasis, RATE_BASES, "rateBasis");
    assertAllowedValue(canonical ? (input.payeeType === "director" ? "director" : canonical.payeeType) : input.payeeType, PAYEE_TYPES, "payeeType");
    if (input.budgetPotId) await this.assertBudget(input.budgetPotId, currency);
    const timestamp = now();
    const row: CompensationProfile = {
      id: makeId("comp"),
      agencyId: this.agencyId,
      staffId,
      name,
      email: canonical?.email ?? cleanText(input.email, 220),
      payeeType: canonical ? (input.payeeType === "director" ? "director" : canonical.payeeType) : input.payeeType,
      departmentId: cleanText(input.departmentId, 160),
      departmentName: cleanText(input.departmentName, 180) ?? canonical?.departmentName,
      title: canonical?.title ?? cleanText(input.title, 180),
      companyIds: cleanIds(input.companyIds),
      budgetPotId: cleanText(input.budgetPotId, 160),
      currency,
      rateBasis: canonical?.rateBasis ?? input.rateBasis,
      baseRateCents,
      unitsPerWeek,
      payFrequency: input.payFrequency ?? "monthly",
      employerCostPercent: input.employerCostPercent ?? 0,
      annualBonusTargetCents,
      nextPayAt: positiveOptional(input.nextPayAt),
      contractStartsAt: positiveOptional(contractStartsAt),
      contractEndsAt: positiveOptional(contractEndsAt),
      status: "active",
      notes: cleanText(input.notes, 4_000),
      createdBy: actor,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.persist(PROFILE_INDEX, profileKey(row.id), row.id, row);
    if (canonical) await this.compensation?.setProfileLink(this.agencyId, canonical.staffId, row.id, actor);
    await this.log(actor, "finance.compensation.created", `Created compensation profile for ${row.name}.`, { compensationProfileId: row.id, payeeType: row.payeeType });
    this.events.emit({ agencyId: this.agencyId }, "agency-finance.compensation.created", { compensationProfileId: row.id });
    return this.projectCompensationProfile(row);
  }

  async updateCompensationProfile(actor: UserId, id: string, patch: UpdateCompensationProfilePatch): Promise<CompensationProfile | null> {
    const stored = await this.getStoredCompensationProfile(id);
    if (!stored) return null;
    assertKnownFields(patch, ["staffId", "name", "email", "payeeType", "departmentId", "departmentName", "title", "companyIds", "budgetPotId", "currency", "rateBasis", "baseRateCents", "unitsPerWeek", "payFrequency", "employerCostPercent", "annualBonusTargetCents", "nextPayAt", "contractStartsAt", "contractEndsAt", "status", "notes"]);
    if (patch.name !== undefined) assertNonEmptyText(patch.name, "name");
    assertOptionalAllowedValue(patch.payeeType, PAYEE_TYPES, "payeeType");
    assertOptionalAllowedValue(patch.rateBasis, RATE_BASES, "rateBasis");
    assertOptionalAllowedValue(patch.payFrequency, PAY_FREQUENCIES, "payFrequency");
    assertOptionalAllowedValue(patch.status, PROFILE_STATUSES, "status");
    assertOptionalCurrency(patch.currency);
    assertOptionalStringArray(patch.companyIds, "companyIds");
    validateOptionalTexts(patch, ["email", "title", "notes"]);
    validateNullableTexts(patch, ["staffId", "departmentId", "departmentName", "budgetPotId"]);
    validateNullableDates(patch, ["nextPayAt", "contractStartsAt", "contractEndsAt"]);
    const current = await this.projectCompensationProfile(stored);
    const staffId = nullableText(patch.staffId, current.staffId, 160);
    const canonical = staffId ? await this.requireCanonicalTerms(staffId) : null;
    if (canonical) await this.assertAvailableStaffLink(canonical, id);
    const currency = canonical?.currency ?? patch.currency ?? current.currency;
    assertCurrency(currency);
    const budgetPotId = nullableText(patch.budgetPotId, current.budgetPotId, 160);
    if (budgetPotId) await this.assertBudget(budgetPotId, currency);
    const baseRateCents = canonical?.baseRateCents ?? patch.baseRateCents ?? current.baseRateCents;
    const annualBonusTargetCents = canonical?.annualBonusTargetCents ?? patch.annualBonusTargetCents ?? current.annualBonusTargetCents;
    const employerCostPercent = patch.employerCostPercent ?? current.employerCostPercent;
    const unitsPerWeek = canonical?.rateBasis === "hourly" ? canonical.unitsPerWeek : patch.unitsPerWeek ?? current.unitsPerWeek;
    validateMoney(baseRateCents, "baseRateCents");
    validateMoney(annualBonusTargetCents, "annualBonusTargetCents");
    validatePercent(employerCostPercent);
    validateUnits(unitsPerWeek);
    const contractStartsAt = canonical ? canonical.contractStartsAt : nullableNumber(patch.contractStartsAt, current.contractStartsAt);
    const contractEndsAt = canonical ? canonical.contractEndsAt : nullableNumber(patch.contractEndsAt, current.contractEndsAt);
    assertOptionalTimestamp(contractStartsAt, "contractStartsAt");
    assertOptionalTimestamp(contractEndsAt, "contractEndsAt");
    validateDateOrder(contractStartsAt, contractEndsAt, "contractStartsAt", "contractEndsAt");
    assertAllowedValue(canonical?.rateBasis ?? patch.rateBasis ?? current.rateBasis, RATE_BASES, "rateBasis");
    assertAllowedValue(canonical
      ? ((patch.payeeType ?? current.payeeType) === "director" ? "director" : canonical.payeeType)
      : patch.payeeType ?? current.payeeType, PAYEE_TYPES, "payeeType");
    const next: CompensationProfile = {
      ...current,
      ...patch,
      name: canonical?.name ?? (patch.name === undefined ? current.name : requiredText(patch.name, "Payee name", 180)),
      staffId,
      email: canonical?.email ?? (patch.email === undefined ? current.email : cleanText(patch.email, 220)),
      payeeType: canonical
        ? ((patch.payeeType ?? current.payeeType) === "director" ? "director" : canonical.payeeType)
        : patch.payeeType ?? current.payeeType,
      departmentId: nullableText(patch.departmentId, current.departmentId, 160),
      departmentName: nullableText(patch.departmentName, current.departmentName ?? canonical?.departmentName, 180),
      title: canonical?.title ?? (patch.title === undefined ? current.title : cleanText(patch.title, 180)),
      companyIds: patch.companyIds === undefined ? current.companyIds : cleanIds(patch.companyIds),
      budgetPotId,
      currency,
      rateBasis: canonical?.rateBasis ?? patch.rateBasis ?? current.rateBasis,
      baseRateCents,
      unitsPerWeek,
      employerCostPercent,
      annualBonusTargetCents,
      nextPayAt: nullableNumber(patch.nextPayAt, current.nextPayAt),
      contractStartsAt,
      contractEndsAt,
      canonicalTermsSource: undefined,
      activeCommissionRuleCount: undefined,
      hasVariableCommission: undefined,
      notes: patch.notes === undefined ? current.notes : cleanText(patch.notes, 4_000),
      updatedAt: now(),
    };
    await this.storage.set(profileKey(id), next);
    if (canonical) await this.compensation?.setProfileLink(this.agencyId, canonical.staffId, id, actor);
    if (stored.staffId && stored.staffId !== staffId) {
      await this.compensation?.setProfileLink(this.agencyId, stored.staffId, null, actor, id);
    }
    await this.log(actor, "finance.compensation.updated", `Updated compensation profile for ${next.name}.`, { compensationProfileId: id, status: next.status });
    return this.projectCompensationProfile(next);
  }

  async listCompensationPayments(includeCancelled = false): Promise<CompensationPayment[]> {
    const rows = await this.listRows<CompensationPayment>(PAYMENT_INDEX, "operations/payments/by-id/");
    return rows.filter(row => includeCancelled || row.status !== "cancelled").sort((left, right) => right.dueAt - left.dueAt);
  }

  async getCompensationPayment(id: string): Promise<CompensationPayment | null> {
    const row = await this.storage.get<CompensationPayment>(paymentKey(id));
    return row?.agencyId === this.agencyId ? row : null;
  }

  // Idempotent on `input.idempotencyKey`: a resubmit of the same intent returns
  // the first payroll payment instead of double-recording it. See lib/idempotency.ts.
  async createCompensationPayment(actor: UserId, input: CreateCompensationPaymentInput): Promise<CompensationPayment> {
    assertKnownFields(input, ["profileId", "budgetPotId", "kind", "periodLabel", "currency", "grossCents", "employerCostCents", "status", "dueAt", "paidAt", "reference", "notes", "idempotencyKey"]);
    assertNonEmptyText(input.profileId, "profileId");
    assertAllowedValue(input.kind, PAYMENT_KINDS, "kind");
    assertOptionalAllowedValue(input.status, PAYMENT_STATUSES, "status");
    assertOptionalCurrency(input.currency);
    assertOptionalTimestamp(input.dueAt, "dueAt");
    assertOptionalTimestamp(input.paidAt, "paidAt");
    validateOptionalTexts(input, ["budgetPotId", "periodLabel", "reference", "notes", "idempotencyKey"]);
    const profile = await this.getCompensationProfile(input.profileId);
    if (!profile) throw new Error("Compensation profile not found.");
    if (profile.canonicalTermsSource === "missing") throw new Error("Linked People compensation terms are unavailable.");
    const currency = input.currency ?? profile.currency;
    assertCurrency(currency);
    if (currency !== profile.currency) throw new Error(`Payment must use ${profile.currency.toUpperCase()} for ${profile.name}.`);
    validateMoney(input.grossCents, "grossCents");
    validateMoney(input.employerCostCents ?? 0, "employerCostCents");
    if (input.grossCents <= 0 && (input.employerCostCents ?? 0) <= 0) throw new Error("Payment amount must be greater than zero.");
    const budgetPotId = cleanText(input.budgetPotId, 160) ?? profile.budgetPotId;
    if (budgetPotId) await this.assertBudget(budgetPotId, currency);

    const key = normaliseIdempotencyKey(input.idempotencyKey);
    const id = deriveRecordId("payroll", key);
    if (key) {
      const existing = await this.getCompensationPayment(id);
      if (existing) return existing;
    }

    const timestamp = now();
    const status = input.status ?? "planned";
    if (status !== "paid" && input.paidAt !== undefined) {
      throw new Error("agency-finance: paidAt requires paid status");
    }
    const row: CompensationPayment = {
      id,
      agencyId: this.agencyId,
      profileId: profile.id,
      budgetPotId,
      kind: input.kind,
      periodLabel: cleanText(input.periodLabel, 120),
      currency,
      grossCents: input.grossCents,
      employerCostCents: input.employerCostCents ?? 0,
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
    assertKnownFields(patch, ["budgetPotId", "kind", "periodLabel", "currency", "grossCents", "employerCostCents", "status", "dueAt", "paidAt", "reference", "notes"]);
    assertOptionalAllowedValue(patch.kind, PAYMENT_KINDS, "kind");
    assertOptionalAllowedValue(patch.status, PAYMENT_STATUSES, "status");
    assertOptionalCurrency(patch.currency);
    assertOptionalTimestamp(patch.dueAt, "dueAt");
    if (patch.paidAt !== null) assertOptionalTimestamp(patch.paidAt, "paidAt");
    validateOptionalTexts(patch, ["periodLabel", "reference", "notes"]);
    validateNullableTexts(patch, ["budgetPotId"]);
    const profile = await this.getCompensationProfile(current.profileId);
    if (!profile) throw new Error("Compensation profile not found.");
    if (profile.canonicalTermsSource === "missing") throw new Error("Linked People compensation terms are unavailable.");
    const currency = patch.currency ?? current.currency;
    assertCurrency(currency);
    if (currency !== profile.currency) throw new Error(`Payment must use ${profile.currency.toUpperCase()} for ${profile.name}.`);
    const budgetPotId = nullableText(patch.budgetPotId, current.budgetPotId, 160);
    if (budgetPotId) await this.assertBudget(budgetPotId, currency);
    const grossCents = patch.grossCents ?? current.grossCents;
    const employerCostCents = patch.employerCostCents ?? current.employerCostCents;
    validateMoney(grossCents, "grossCents");
    validateMoney(employerCostCents, "employerCostCents");
    if (grossCents <= 0 && employerCostCents <= 0) throw new Error("Payment amount must be greater than zero.");
    const status = patch.status ?? current.status;
    if (status !== "paid" && patch.paidAt !== undefined && patch.paidAt !== null) {
      throw new Error("agency-finance: paidAt requires paid status");
    }
    const paidAt = status === "paid"
      ? patch.paidAt === null ? undefined : patch.paidAt ?? (current.status !== "paid" ? now() : current.paidAt)
      : undefined;
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
      paidAt,
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

  private async getStoredCompensationProfile(id: string): Promise<CompensationProfile | null> {
    const row = await this.storage.get<CompensationProfile>(profileKey(id));
    return row?.agencyId === this.agencyId ? row : null;
  }

  private async projectCompensationProfile(row: CompensationProfile): Promise<CompensationProfile> {
    if (!row.staffId || !this.compensation) return row;
    const terms = await this.compensation.getTerms(this.agencyId, row.staffId);
    if (!terms) return { ...row, canonicalTermsSource: "missing" };
    return {
      ...row,
      name: terms.name,
      email: terms.email,
      title: terms.title,
      payeeType: row.payeeType === "director" ? "director" : terms.payeeType,
      departmentName: row.departmentId ? row.departmentName : terms.departmentName ?? row.departmentName,
      currency: terms.currency,
      rateBasis: terms.rateBasis,
      baseRateCents: terms.baseRateCents,
      unitsPerWeek: terms.rateBasis === "hourly" ? terms.unitsPerWeek : row.unitsPerWeek,
      annualBonusTargetCents: terms.annualBonusTargetCents,
      contractStartsAt: terms.contractStartsAt,
      contractEndsAt: terms.contractEndsAt,
      canonicalTermsSource: "people",
      activeCommissionRuleCount: terms.activeCommissionRuleCount,
      hasVariableCommission: terms.hasVariableCommission,
    };
  }

  private async requireCanonicalTerms(staffId: string): Promise<CanonicalCompensationTerms> {
    if (!this.compensation) throw new Error("Canonical People compensation bridge is unavailable.");
    const terms = await this.compensation.getTerms(this.agencyId, staffId);
    if (!terms) throw new Error("Linked People employee not found.");
    return terms;
  }

  private async assertAvailableStaffLink(terms: CanonicalCompensationTerms, profileId: string | undefined): Promise<void> {
    if (terms.compensationProfileId && terms.compensationProfileId !== profileId) {
      throw new Error("This People employee is already linked to another compensation profile.");
    }
    const rows = await this.listRows<CompensationProfile>(PROFILE_INDEX, "operations/compensation/by-id/");
    if (rows.some(row => row.staffId === terms.staffId && row.id !== profileId)) {
      throw new Error("This People employee is already linked to another compensation profile.");
    }
  }

  private async listRows<T extends { id: string; agencyId: AgencyId }>(indexKey: string, prefix: string): Promise<T[]> {
    const rows: T[] = [];
    for (const id of await listRowIds(this.storage, indexKey, prefix)) {
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
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function validateMoney(value: number, label: string): void {
  assertSafeInteger(value, label, { min: 0 });
}

function validatePercent(value: number): void {
  assertFiniteRange(value, "employerCostPercent", { min: 0, max: 200 });
}

function validateUnits(value?: number): void {
  assertOptionalFiniteRange(value, "unitsPerWeek", { min: 0, max: 168 });
}

function validateDateOrder(start: number | undefined, end: number | undefined, startField: string, endField: string): void {
  assertDateOrder(start, end, startField, endField);
}

function validateOptionalTexts<T extends object>(value: T, fields: Array<keyof T>): void {
  const record = value as Record<keyof T, unknown>;
  for (const field of fields) assertOptionalText(record[field], String(field));
}

function validateNullableTexts<T extends object>(value: T, fields: Array<keyof T>): void {
  const record = value as Record<keyof T, unknown>;
  for (const field of fields) assertOptionalNullableText(record[field], String(field));
}

function validateOptionalDates<T extends object>(value: T, fields: Array<keyof T>): void {
  const record = value as Record<keyof T, unknown>;
  for (const field of fields) assertOptionalTimestamp(record[field], String(field));
}

function validateNullableDates<T extends object>(value: T, fields: Array<keyof T>): void {
  const record = value as Record<keyof T, unknown>;
  for (const field of fields) {
    const candidate = record[field];
    if (candidate !== null) assertOptionalTimestamp(candidate, String(field));
  }
}
