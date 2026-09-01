import "server-only";

import { logActivity } from "./activity";
import { legalDocumentAcceptsReferences } from "./legalDocuments";
import { getState, mutate } from "./storage";
import { defaultCapacityAreas } from "@/lib/performance/hiringCapacity";
import type { CompanyCapacityAreaId, CompanyCapacityAreaPlan, CompanyCapacityPlan, CompanyCapitalPlan, CompanyCapitalTransaction, CompanyDividendDistribution, CompanyGovernanceDecision, CompanyInvestmentHolding, CompanyObjective, CompanyPlan, CompanyProfile, CompanyProjectionPlan, CompanyQuarterlyReview, CompanyShareClass, CompanyShareholder } from "./types";

const profileKey = (agencyId: string, companyId?: string | null) => companyId ? `${agencyId}:${companyId}` : agencyId;

const defaults = (agencyId: string, companyId?: string | null): CompanyProfile => ({
  agencyId,
  companyId: companyId || undefined,
  mission: "",
  vision: "",
  values: [],
  monthlyRevenueTargetCents: 500_000,
  averageDealValueCents: 1_000_00,
  salesCallCloseRatePercent: 25,
  annualRevenueTargetCents: 60_000_00,
  capacity: {
    weeklyAvailableHours: 32,
    deliveryHoursPerActiveClient: 4,
    salesHoursPerCall: 1,
    adminBufferPercent: 20,
    hiringTriggerPercent: 85,
    areas: defaultCapacityAreas(),
    notes: "",
  },
  projection: {
    horizonMonths: 12,
    baseMonthlyGrowthPercent: 5,
    targetMonthlyGrowthPercent: 10,
    grossMarginTargetPercent: 65,
    monthlyOperatingCostCents: 0,
    cashReserveTargetCents: 0,
  },
  capital: {
    currency: "GBP",
    shareClasses: [{
      id: "ordinary",
      name: "Ordinary",
      authorisedShares: 100,
      nominalValueCents: 100,
      votingRightsPerShare: 1,
      dividendEligible: true,
    }],
    shareholders: [],
    transactions: [],
    investments: [],
    dividends: [],
    decisions: [],
    notes: "",
  },
  objectives: [],
  plans: [],
  reviews: [],
  revision: 0,
  updatedAt: 0,
});

function normaliseProfile(stored: CompanyProfile | undefined, agencyId: string, companyId?: string | null): CompanyProfile {
  const fallback = defaults(agencyId, companyId);
  return {
    ...fallback,
    ...stored,
    capacity: cleanCapacity(stored?.capacity ?? fallback.capacity, fallback.capacity),
    revision: cleanNumber(stored?.revision, 0, 0, Number.MAX_SAFE_INTEGER),
    agencyId,
    companyId: companyId || undefined,
  };
}

export function getCompanyProfile(agencyId: string, companyId?: string | null): CompanyProfile {
  return normaliseProfile(getState().companyProfiles[profileKey(agencyId, companyId)], agencyId, companyId);
}

/**
 * A write that lost the race. It carries the live profile so the caller can
 * answer with the current state instead of a bare failure — the same
 * current-state 409 shape the product workspaces use.
 */
export class CompanyProfileConflictError extends Error {
  constructor(public readonly current: CompanyProfile, public readonly expectedRevision: number) {
    super("This company plan changed in another session. The latest version has been loaded; reapply your change and save again.");
    this.name = "CompanyProfileConflictError";
  }
}

/**
 * A locked quarterly cycle is decision memory: it cannot be edited in place or
 * dropped. Correcting it means an explicit superseding amendment.
 */
export class CompanyReviewLockedError extends Error {
  constructor(public readonly reviewId: string, public readonly period: string, message: string) {
    super(message);
    this.name = "CompanyReviewLockedError";
  }
}

/**
 * One named way the capital register would have been left internally impossible
 * or pointing at a record that is not there. The whole plan is refused as a
 * graph, so every conflict is reported together with the exact dependants —
 * a save must never be half-applied and a delete must never strand a live link.
 */
export interface CompanyCapitalConflict {
  scope: "share-class" | "shareholder" | "capital-movement" | "dividend" | "decision";
  recordId: string;
  record: string;
  reason: string;
  dependants?: string[];
}

export class CompanyCapitalConflictError extends Error {
  constructor(public readonly conflicts: CompanyCapitalConflict[]) {
    super(describeCapitalConflicts(conflicts));
    this.name = "CompanyCapitalConflictError";
  }
}

function describeCapitalConflicts(conflicts: CompanyCapitalConflict[]): string {
  const shown = conflicts.slice(0, 5).map(conflict => conflict.reason);
  const remainder = conflicts.length - shown.length;
  return `The capital and ownership register was not saved: ${conflicts.length} ${conflicts.length === 1 ? "record is" : "records are"} impossible or would be left pointing at a record that is not there. ${shown.join(" ")}${remainder > 0 ? ` And ${remainder} more.` : ""}`;
}

export function updateCompanyProfile(
  agencyId: string,
  input: Partial<CompanyProfile>,
  actorUserId: string,
  companyId?: string | null,
  options?: { expectedRevision?: number },
): CompanyProfile {
  const expectedRevision = options?.expectedRevision;
  let conflict: CompanyProfile | null = null;
  let updated: CompanyProfile | null = null;
  mutate(state => {
    const key = profileKey(agencyId, companyId);
    const current = normaliseProfile(state.companyProfiles[key], agencyId, companyId);
    if (expectedRevision !== undefined && expectedRevision !== current.revision) {
      conflict = current;
      return;
    }
    // The capital plan is validated as one graph AFTER per-record sanitation and
    // BEFORE anything is written, so a save either lands whole or is refused
    // whole with the exact conflicts named.
    //
    // Only a save that actually TOUCHES the plan is judged. Every Battle Table
    // editor (mission, objectives, capacity, plans, reviews) PUTs the whole
    // profile, so the retained capital plan rides along on writes that have
    // nothing to do with it — and a plan can be invalidated from outside this
    // path (deleting a cited document from the legal register, or data written
    // before this graph existed). Refusing those writes would lock an operator
    // out of unrelated work over a state the store already holds and that this
    // save did not create. Change the plan and the whole graph is enforced.
    const capital = cleanCapital(input.capital ?? current.capital, current.capital);
    const retained = cleanCapital(current.capital, current.capital);
    if (JSON.stringify(capital) !== JSON.stringify(retained)) {
      // `retained`, not the raw stored value: `normaliseProfile` does not clean
      // `capital`, so a profile written before a collection existed would hand
      // the delete-side diff an `undefined` array and turn a save into a 500.
      const capitalConflicts = reconcileCapitalPlan(capital, retained, documentId => legalDocumentAcceptsReferences(agencyId, documentId));
      if (capitalConflicts.length) throw new CompanyCapitalConflictError(capitalConflicts);
    }
    updated = {
      agencyId,
      companyId: companyId || undefined,
      mission: cleanText(input.mission ?? current.mission, 2_000),
      vision: cleanText(input.vision ?? current.vision, 2_000),
      values: cleanList(input.values ?? current.values, 20, 100),
      monthlyRevenueTargetCents: cleanMoney(input.monthlyRevenueTargetCents, current.monthlyRevenueTargetCents),
      averageDealValueCents: cleanMoney(input.averageDealValueCents, current.averageDealValueCents),
      salesCallCloseRatePercent: cleanNumber(input.salesCallCloseRatePercent, current.salesCallCloseRatePercent, 1, 100),
      annualRevenueTargetCents: cleanMoney(input.annualRevenueTargetCents, current.annualRevenueTargetCents),
      capacity: cleanCapacity(input.capacity ?? current.capacity, current.capacity),
      projection: cleanProjection(input.projection ?? current.projection, current.projection),
      capital,
      objectives: cleanObjectives(input.objectives ?? current.objectives),
      plans: cleanPlans(input.plans ?? current.plans),
      reviews: cleanReviews(input.reviews ?? current.reviews, current.reviews),
      revision: current.revision + 1,
      updatedAt: Date.now(),
    };
    state.companyProfiles[key] = updated;
  });
  // TypeScript does not track assignments made inside the `mutate` callback,
  // so read both outcomes back through an explicit widening (the same shape the
  // versioned product-workspace commit uses).
  const losingRace = conflict as CompanyProfile | null;
  if (losingRace) throw new CompanyProfileConflictError(losingRace, expectedRevision as number);
  const saved = updated as CompanyProfile | null;
  if (!saved) throw new Error("The company plan could not be saved.");
  logActivity({
    agencyId,
    actorUserId,
    category: "settings",
    action: "company.profile_updated",
    message: companyId ? "Updated trading company direction, targets, or plans." : "Updated company direction, targets, or plans.",
    metadata: companyId ? { companyId } : undefined,
  });
  return saved;
}

function cleanCapital(value: unknown, fallback: CompanyCapitalPlan): CompanyCapitalPlan {
  const item = value && typeof value === "object" ? value as Partial<CompanyCapitalPlan> : {};
  const currency = cleanCurrency(item.currency, fallback.currency);
  return {
    currency,
    shareClasses: cleanShareClasses(item.shareClasses ?? fallback.shareClasses),
    shareholders: cleanShareholders(item.shareholders ?? fallback.shareholders),
    transactions: cleanCapitalTransactions(item.transactions ?? fallback.transactions, currency),
    investments: cleanInvestments(item.investments ?? fallback.investments, currency),
    dividends: cleanDividends(item.dividends ?? fallback.dividends, currency),
    decisions: cleanGovernanceDecisions(item.decisions ?? fallback.decisions),
    notes: cleanText(item.notes, 8_000) || undefined,
  };
}

function cleanShareClasses(value: unknown): CompanyShareClass[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CompanyShareClass>;
    const name = cleanText(item.name, 100);
    if (!name) return [];
    return [{
      id: cleanId(item.id, "class"),
      name,
      authorisedShares: cleanNumber(item.authorisedShares, 0, 0, 1_000_000_000_000),
      nominalValueCents: cleanMoney(item.nominalValueCents, 0),
      votingRightsPerShare: cleanDecimal(item.votingRightsPerShare, 1, 0, 1_000, 4),
      dividendEligible: item.dividendEligible !== false,
      notes: cleanText(item.notes, 2_000) || undefined,
    }];
  });
}

function cleanShareholders(value: unknown): CompanyShareholder[] {
  if (!Array.isArray(value)) return [];
  const kinds: CompanyShareholder["kind"][] = ["founder", "individual", "employee", "investor", "company", "trust", "other"];
  return value.slice(0, 500).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CompanyShareholder>;
    const name = cleanText(item.name, 180);
    const shareClassId = cleanText(item.shareClassId, 80);
    if (!name || !shareClassId) return [];
    return [{
      id: cleanId(item.id, "holder"),
      name,
      kind: kinds.includes(item.kind as CompanyShareholder["kind"]) ? item.kind as CompanyShareholder["kind"] : "individual",
      shareClassId,
      shares: cleanNumber(item.shares, 0, 0, 1_000_000_000_000),
      investedCents: cleanMoney(item.investedCents, 0),
      status: item.status === "former" ? "former" : "active",
      director: item.director === true,
      boardSeat: item.boardSeat === true,
      joinedAt: item.joinedAt ? cleanTimestamp(item.joinedAt) : undefined,
      notes: cleanText(item.notes, 4_000) || undefined,
    }];
  });
}

function cleanCapitalTransactions(value: unknown, fallbackCurrency: string): CompanyCapitalTransaction[] {
  if (!Array.isArray(value)) return [];
  const kinds: CompanyCapitalTransaction["kind"][] = ["share-issue", "capital-contribution", "director-loan-in", "director-loan-repayment", "share-transfer", "buyback", "grant", "other"];
  const statuses: CompanyCapitalTransaction["status"][] = ["planned", "approved", "completed", "cancelled"];
  return value.slice(0, 2_000).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CompanyCapitalTransaction>;
    const title = cleanText(item.title, 180);
    if (!title) return [];
    return [{
      id: cleanId(item.id, "capital"),
      kind: kinds.includes(item.kind as CompanyCapitalTransaction["kind"]) ? item.kind as CompanyCapitalTransaction["kind"] : "other",
      title,
      shareholderId: cleanText(item.shareholderId, 80) || undefined,
      shareClassId: cleanText(item.shareClassId, 80) || undefined,
      counterparty: cleanText(item.counterparty, 180) || undefined,
      amountCents: cleanMoney(item.amountCents, 0),
      currency: cleanCurrency(item.currency, fallbackCurrency),
      shares: cleanNumber(item.shares, 0, 0, 1_000_000_000_000),
      occurredAt: cleanTimestamp(item.occurredAt),
      status: statuses.includes(item.status as CompanyCapitalTransaction["status"]) ? item.status as CompanyCapitalTransaction["status"] : "planned",
      approvalId: cleanText(item.approvalId, 80) || undefined,
      reference: cleanText(item.reference, 180) || undefined,
      notes: cleanText(item.notes, 4_000) || undefined,
    }];
  });
}

function cleanInvestments(value: unknown, fallbackCurrency: string): CompanyInvestmentHolding[] {
  if (!Array.isArray(value)) return [];
  const kinds: CompanyInvestmentHolding["kind"][] = ["cash-equivalent", "fund", "equity", "bond", "crypto", "property", "equipment", "subsidiary", "other"];
  const statuses: CompanyInvestmentHolding["status"][] = ["planned", "active", "sold", "written-off"];
  return value.slice(0, 1_000).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CompanyInvestmentHolding>;
    const name = cleanText(item.name, 180);
    if (!name) return [];
    return [{
      id: cleanId(item.id, "investment"),
      name,
      kind: kinds.includes(item.kind as CompanyInvestmentHolding["kind"]) ? item.kind as CompanyInvestmentHolding["kind"] : "other",
      platform: cleanText(item.platform, 180) || undefined,
      currency: cleanCurrency(item.currency, fallbackCurrency),
      costBasisCents: cleanMoney(item.costBasisCents, 0),
      currentValueCents: cleanMoney(item.currentValueCents, 0),
      incomeReceivedCents: cleanMoney(item.incomeReceivedCents, 0),
      acquiredAt: item.acquiredAt ? cleanTimestamp(item.acquiredAt) : undefined,
      valuedAt: item.valuedAt ? cleanTimestamp(item.valuedAt) : undefined,
      status: statuses.includes(item.status as CompanyInvestmentHolding["status"]) ? item.status as CompanyInvestmentHolding["status"] : "planned",
      risk: item.risk === "high" || item.risk === "medium" ? item.risk : "low",
      owner: cleanText(item.owner, 120) || undefined,
      reference: cleanText(item.reference, 180) || undefined,
      notes: cleanText(item.notes, 4_000) || undefined,
    }];
  });
}

function cleanDividends(value: unknown, fallbackCurrency: string): CompanyDividendDistribution[] {
  if (!Array.isArray(value)) return [];
  const statuses: CompanyDividendDistribution["status"][] = ["draft", "approved", "part-paid", "paid", "cancelled"];
  return value.slice(0, 1_000).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CompanyDividendDistribution>;
    const title = cleanText(item.title, 180);
    if (!title) return [];
    return [{
      id: cleanId(item.id, "dividend"),
      title,
      period: cleanText(item.period, 80),
      currency: cleanCurrency(item.currency, fallbackCurrency),
      declaredCents: cleanMoney(item.declaredCents, 0),
      paidCents: cleanMoney(item.paidCents, 0),
      declaredAt: item.declaredAt ? cleanTimestamp(item.declaredAt) : undefined,
      paymentDueAt: item.paymentDueAt ? cleanTimestamp(item.paymentDueAt) : undefined,
      paidAt: item.paidAt ? cleanTimestamp(item.paidAt) : undefined,
      status: statuses.includes(item.status as CompanyDividendDistribution["status"]) ? item.status as CompanyDividendDistribution["status"] : "draft",
      allocations: Array.isArray(item.allocations) ? item.allocations.slice(0, 500).flatMap(rawAllocation => {
        if (!rawAllocation || typeof rawAllocation !== "object") return [];
        const allocation = rawAllocation as { shareholderId?: unknown; amountCents?: unknown };
        const shareholderId = cleanText(allocation.shareholderId, 80);
        return shareholderId ? [{ shareholderId, amountCents: cleanMoney(allocation.amountCents, 0) }] : [];
      }) : [],
      approvalId: cleanText(item.approvalId, 80) || undefined,
      reference: cleanText(item.reference, 180) || undefined,
      notes: cleanText(item.notes, 4_000) || undefined,
    }];
  });
}

function cleanGovernanceDecisions(value: unknown): CompanyGovernanceDecision[] {
  if (!Array.isArray(value)) return [];
  const kinds: CompanyGovernanceDecision["kind"][] = ["board", "shareholder", "written", "ordinary", "special"];
  const statuses: CompanyGovernanceDecision["status"][] = ["draft", "approved", "rejected", "superseded"];
  return value.slice(0, 2_000).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CompanyGovernanceDecision>;
    const title = cleanText(item.title, 180);
    if (!title) return [];
    return [{
      id: cleanId(item.id, "decision"),
      title,
      kind: kinds.includes(item.kind as CompanyGovernanceDecision["kind"]) ? item.kind as CompanyGovernanceDecision["kind"] : "board",
      status: statuses.includes(item.status as CompanyGovernanceDecision["status"]) ? item.status as CompanyGovernanceDecision["status"] : "draft",
      summary: cleanText(item.summary, 8_000),
      proposedBy: cleanText(item.proposedBy, 120) || undefined,
      meetingAt: item.meetingAt ? cleanTimestamp(item.meetingAt) : undefined,
      effectiveAt: item.effectiveAt ? cleanTimestamp(item.effectiveAt) : undefined,
      approvedAt: item.approvedAt ? cleanTimestamp(item.approvedAt) : undefined,
      // Deliberately NOT clamped into 0–100 here: silently rewriting "150% for"
      // as "100% for" would invent the vote. Sanitation keeps it a number and
      // `reconcileCapitalPlan` refuses an impossible one by name.
      votesForPercent: typeof item.votesForPercent === "number" ? cleanDecimal(item.votesForPercent, 0, -100_000, 100_000, 2) : undefined,
      votesAgainstPercent: typeof item.votesAgainstPercent === "number" ? cleanDecimal(item.votesAgainstPercent, 0, -100_000, 100_000, 2) : undefined,
      documentId: cleanText(item.documentId, 120) || undefined,
      relatedRecordIds: cleanList(item.relatedRecordIds, 200, 80),
      notes: cleanText(item.notes, 4_000) || undefined,
    }];
  });
}

/**
 * The capital register calls itself authoritative: ownership, control, approval
 * coverage and distribution position are all calculated from the retained
 * values. So the plan is checked as a GRAPH, not as six independent arrays.
 *
 * What is refused, always together and always with the exact records named:
 *  - two records of one kind sharing an id (the second silently shadows the first);
 *  - a reference — owner, class, approval, allocation recipient, evidence
 *    document — that does not resolve inside this same plan or the legal register;
 *  - a delete that would strand a live link, listing every dependant so the
 *    owner can retire the record (`former`/`superseded`) or detach it first;
 *  - money that cannot be true: paid beyond declared, allocations beyond the
 *    declaration, or a paid distribution whose allocations do not add up to it;
 *  - a vote that cannot be true: outside 0–100, or for + against beyond 100.
 *
 * Issued-beyond-authorised is NOT refused: the register surfaces it as a
 * critical "Over-issued" flag, which is a supported state to be corrected in
 * the open rather than a save the server pretends it never saw.
 */
function reconcileCapitalPlan(
  next: CompanyCapitalPlan,
  previous: CompanyCapitalPlan,
  documentExists: (documentId: string) => boolean,
): CompanyCapitalConflict[] {
  const conflicts: CompanyCapitalConflict[] = [];
  const add = (scope: CompanyCapitalConflict["scope"], recordId: string, record: string, reason: string, dependants?: string[]) =>
    conflicts.push(dependants?.length ? { scope, recordId, record, reason, dependants } : { scope, recordId, record, reason });

  const collections = [
    { scope: "share-class" as const, noun: "Share class", records: next.shareClasses.map(item => ({ id: item.id, label: item.name })) },
    { scope: "shareholder" as const, noun: "Shareholder", records: next.shareholders.map(item => ({ id: item.id, label: item.name })) },
    { scope: "capital-movement" as const, noun: "Capital movement", records: next.transactions.map(item => ({ id: item.id, label: item.title })) },
    { scope: "dividend" as const, noun: "Distribution", records: next.dividends.map(item => ({ id: item.id, label: item.title })) },
    { scope: "decision" as const, noun: "Decision", records: next.decisions.map(item => ({ id: item.id, label: item.title })) },
  ];
  for (const collection of collections) {
    const seen = new Map<string, string>();
    for (const record of collection.records) {
      const first = seen.get(record.id);
      if (first === undefined) {
        seen.set(record.id, record.label);
        continue;
      }
      add(collection.scope, record.id, record.label, `${collection.noun} “${record.label}” reuses the id ${record.id}, which already belongs to “${first}”. Give it its own id — a duplicate id hides one of the two records everywhere it is counted.`);
    }
  }

  const classById = new Map(next.shareClasses.map(item => [item.id, item]));
  const holderById = new Map(next.shareholders.map(item => [item.id, item]));
  const decisionById = new Map(next.decisions.map(item => [item.id, item]));

  // Delete side first: a record that WAS retained and is now gone, while
  // something still names it, is reported once with every dependant.
  const dependantsOf = (id: string) => [
    ...next.shareholders.filter(item => item.shareClassId === id).map(item => `shareholder “${item.name}”`),
    ...next.transactions.filter(item => item.shareholderId === id || item.shareClassId === id || item.approvalId === id).map(item => `capital movement “${item.title}”`),
    ...next.dividends.filter(item => item.approvalId === id || item.allocations.some(allocation => allocation.shareholderId === id)).map(item => `distribution “${item.title}”`),
  ];
  const retired = [
    { scope: "share-class" as const, noun: "Share class", exit: "Move its holders to another class first", removed: previous.shareClasses.filter(item => !classById.has(item.id)).map(item => ({ id: item.id, label: item.name })) },
    { scope: "shareholder" as const, noun: "Shareholder", exit: "Set them to “former” instead, which keeps the history attached", removed: previous.shareholders.filter(item => !holderById.has(item.id)).map(item => ({ id: item.id, label: item.name })) },
    { scope: "decision" as const, noun: "Decision", exit: "Mark it “superseded” instead, which keeps the authority trail", removed: previous.decisions.filter(item => !decisionById.has(item.id)).map(item => ({ id: item.id, label: item.title })) },
  ];
  const stranded = new Set<string>();
  for (const group of retired) {
    for (const record of group.removed) {
      const dependants = dependantsOf(record.id);
      if (!dependants.length) continue;
      stranded.add(record.id);
      add(group.scope, record.id, record.label, `${group.noun} “${record.label}” cannot be removed while ${dependants.length} ${dependants.length === 1 ? "record" : "records"} still name it: ${dependants.join(", ")}. ${group.exit}, or detach those records first.`, dependants);
    }
  }

  // Reference side: anything naming a record that is not in the plan at all.
  const missing = (id: string | undefined, present: Map<string, unknown>) => Boolean(id) && !present.has(id as string) && !stranded.has(id as string);
  for (const holder of next.shareholders) {
    if (missing(holder.shareClassId, classById)) add("shareholder", holder.id, holder.name, `Shareholder “${holder.name}” is assigned to share class ${holder.shareClassId}, which is not in the register. Assign an existing class or add that class before saving.`);
  }
  for (const transaction of next.transactions) {
    if (missing(transaction.shareholderId, holderById)) add("capital-movement", transaction.id, transaction.title, `Capital movement “${transaction.title}” names owner ${transaction.shareholderId}, who is not on the cap table. Pick a registered owner or clear the link.`);
    if (missing(transaction.shareClassId, classById)) add("capital-movement", transaction.id, transaction.title, `Capital movement “${transaction.title}” names share class ${transaction.shareClassId}, which is not in the register. Pick an existing class or clear the link.`);
    if (missing(transaction.approvalId, decisionById)) add("capital-movement", transaction.id, transaction.title, `Capital movement “${transaction.title}” claims approval ${transaction.approvalId}, which is not a retained decision. Record the decision that authorised it, or clear the claim rather than leaving it looking approved.`);
  }
  for (const dividend of next.dividends) {
    if (missing(dividend.approvalId, decisionById)) add("dividend", dividend.id, dividend.title, `Distribution “${dividend.title}” claims approval ${dividend.approvalId}, which is not a retained decision. Record the decision that declared it, or clear the claim rather than leaving it looking approved.`);
    const allocatedTo = new Set<string>();
    for (const allocation of dividend.allocations) {
      if (missing(allocation.shareholderId, holderById)) add("dividend", dividend.id, dividend.title, `Distribution “${dividend.title}” allocates to owner ${allocation.shareholderId}, who is not on the cap table. Recalculate the allocation from the current register.`);
      else if (allocatedTo.has(allocation.shareholderId)) add("dividend", dividend.id, dividend.title, `Distribution “${dividend.title}” allocates to ${holderById.get(allocation.shareholderId)?.name ?? allocation.shareholderId} twice. Combine the two lines into one.`);
      allocatedTo.add(allocation.shareholderId);
    }
    const amount = (cents: number) => `${dividend.currency} ${(cents / 100).toFixed(2)}`;
    if (dividend.paidCents > dividend.declaredCents) add("dividend", dividend.id, dividend.title, `Distribution “${dividend.title}” records ${amount(dividend.paidCents)} paid against ${amount(dividend.declaredCents)} declared. Raise the declaration or correct the payment — a company cannot pay out more than it declared.`);
    const allocated = dividend.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
    if (allocated > dividend.declaredCents) add("dividend", dividend.id, dividend.title, `Distribution “${dividend.title}” allocates ${amount(allocated)} against ${amount(dividend.declaredCents)} declared. Recalculate the allocation so it fits inside the declaration.`);
    else if (dividend.status === "paid" && dividend.allocations.length && allocated !== dividend.declaredCents) add("dividend", dividend.id, dividend.title, `Distribution “${dividend.title}” is marked paid but its allocations total ${amount(allocated)} against ${amount(dividend.declaredCents)} declared. A paid distribution must be fully allocated to its recipients.`);
  }
  for (const decision of next.decisions) {
    const votes: Array<[number | undefined, string]> = [[decision.votesForPercent, "for"], [decision.votesAgainstPercent, "against"]];
    for (const [value, side] of votes) {
      if (value !== undefined && (value < 0 || value > 100)) add("decision", decision.id, decision.title, `Decision “${decision.title}” records ${value}% ${side}. A share of the vote has to sit between 0% and 100%.`);
    }
    const combined = (decision.votesForPercent ?? 0) + (decision.votesAgainstPercent ?? 0);
    if (combined > 100) add("decision", decision.id, decision.title, `Decision “${decision.title}” records ${decision.votesForPercent ?? 0}% for plus ${decision.votesAgainstPercent ?? 0}% against, which is ${combined}% of the vote. Correct the split so the two together stay within 100%.`);
    if (decision.documentId && !documentExists(decision.documentId)) add("decision", decision.id, decision.title, `Decision “${decision.title}” cites document ${decision.documentId}, which is not in the legal register. Upload the minute or resolution to the register first, or clear the field rather than showing evidence that cannot be opened.`);
  }

  return conflicts;
}

function cleanProjection(value: unknown, fallback: CompanyProjectionPlan): CompanyProjectionPlan {
  const item = value && typeof value === "object" ? value as Partial<CompanyProjectionPlan> : {};
  return {
    horizonMonths: cleanNumber(item.horizonMonths, fallback.horizonMonths, 3, 60),
    baseMonthlyGrowthPercent: cleanNumber(item.baseMonthlyGrowthPercent, fallback.baseMonthlyGrowthPercent, -100, 500),
    targetMonthlyGrowthPercent: cleanNumber(item.targetMonthlyGrowthPercent, fallback.targetMonthlyGrowthPercent, -100, 500),
    grossMarginTargetPercent: cleanNumber(item.grossMarginTargetPercent, fallback.grossMarginTargetPercent, 0, 100),
    monthlyOperatingCostCents: cleanMoney(item.monthlyOperatingCostCents, fallback.monthlyOperatingCostCents),
    cashReserveTargetCents: cleanMoney(item.cashReserveTargetCents, fallback.cashReserveTargetCents),
  };
}

function cleanCapacity(value: unknown, fallback: CompanyCapacityPlan): CompanyCapacityPlan {
  const item = value && typeof value === "object" ? value as Partial<CompanyCapacityPlan> : {};
  return {
    weeklyAvailableHours: cleanNumber(item.weeklyAvailableHours, fallback.weeklyAvailableHours, 1, 500),
    deliveryHoursPerActiveClient: cleanNumber(item.deliveryHoursPerActiveClient, fallback.deliveryHoursPerActiveClient, 0, 200),
    salesHoursPerCall: cleanNumber(item.salesHoursPerCall, fallback.salesHoursPerCall, 0, 24),
    adminBufferPercent: cleanNumber(item.adminBufferPercent, fallback.adminBufferPercent, 0, 80),
    hiringTriggerPercent: cleanNumber(item.hiringTriggerPercent, fallback.hiringTriggerPercent, 1, 100),
    areas: cleanCapacityAreas(item.areas, fallback.areas),
    notes: cleanText(item.notes, 2_000) || undefined,
  };
}

function cleanCapacityAreas(value: unknown, fallback: CompanyCapacityAreaPlan[]): CompanyCapacityAreaPlan[] {
  const allowedIds: CompanyCapacityAreaId[] = ["growth", "sales", "client-success", "delivery", "operations", "finance", "systems"];
  const engagements: CompanyCapacityAreaPlan["preferredEngagement"][] = ["full-time", "part-time", "contractor", "freelancer", "automation"];
  const statuses: CompanyCapacityAreaPlan["hiringStatus"][] = ["monitoring", "approved", "recruiting", "filled", "paused"];
  const source = Array.isArray(value) ? value : [];
  const byId = new Map<CompanyCapacityAreaId, Partial<CompanyCapacityAreaPlan>>();
  for (const raw of source) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<CompanyCapacityAreaPlan>;
    if (allowedIds.includes(item.id as CompanyCapacityAreaId)) byId.set(item.id as CompanyCapacityAreaId, item);
  }
  return fallback.map(area => {
    const item = byId.get(area.id) ?? {};
    return {
      id: area.id,
      allocationPercent: cleanNumber(item.allocationPercent, area.allocationPercent, 0, 100),
      demandAdjustmentHours: cleanNumber(item.demandAdjustmentHours, area.demandAdjustmentHours, -200, 500),
      targetUtilisationPercent: cleanNumber(item.targetUtilisationPercent, area.targetUtilisationPercent, 20, 100),
      roleTitle: cleanText(item.roleTitle, 160) || area.roleTitle,
      preferredEngagement: engagements.includes(item.preferredEngagement as CompanyCapacityAreaPlan["preferredEngagement"]) ? item.preferredEngagement as CompanyCapacityAreaPlan["preferredEngagement"] : area.preferredEngagement,
      hourlyCostCents: cleanNumber(item.hourlyCostCents, area.hourlyCostCents, 0, 1_000_000),
      hiringStatus: statuses.includes(item.hiringStatus as CompanyCapacityAreaPlan["hiringStatus"]) ? item.hiringStatus as CompanyCapacityAreaPlan["hiringStatus"] : area.hiringStatus,
      notes: cleanText(item.notes, 2_000) || undefined,
    };
  });
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanList(value: unknown, maxItems: number, maxLength: number): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === "string").map(item => cleanText(item, maxLength)).filter(Boolean))).slice(0, maxItems)
    : [];
}

function cleanMoney(value: unknown, fallback: number): number {
  return cleanNumber(value, fallback, 0, 1_000_000_000_00);
}

function cleanNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(Math.min(max, Math.max(min, numeric))) : fallback;
}

function cleanDecimal(value: unknown, fallback: number, min: number, max: number, places: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const factor = 10 ** places;
  return Math.round(Math.min(max, Math.max(min, numeric)) * factor) / factor;
}

function cleanTimestamp(value: unknown): number {
  return cleanNumber(value, Date.now(), 0, Number.MAX_SAFE_INTEGER);
}

function cleanCurrency(value: unknown, fallback = "GBP"): string {
  const currency = cleanText(value, 3).toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : fallback.toUpperCase();
}

function cleanId(value: unknown, prefix: string): string {
  const supplied = cleanText(value, 80).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return supplied || `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function cleanObjectives(value: unknown): CompanyObjective[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CompanyObjective>;
    const title = cleanText(item.title, 180);
    if (!title) return [];
    const status = item.status === "at-risk" || item.status === "complete" ? item.status : "on-track";
    return [{
      id: cleanId(item.id, "obj"),
      title,
      metric: cleanText(item.metric, 120),
      currentValue: cleanNumber(item.currentValue, 0, 0, 1_000_000_000),
      targetValue: cleanNumber(item.targetValue, 1, 1, 1_000_000_000),
      unit: cleanText(item.unit, 30),
      dueAt: item.dueAt ? cleanNumber(item.dueAt, 0, 0, Number.MAX_SAFE_INTEGER) : undefined,
      status,
    }];
  });
}

function cleanPlans(value: unknown): CompanyPlan[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CompanyPlan>;
    const title = cleanText(item.title, 180);
    if (!title) return [];
    const horizon = item.horizon === "next" || item.horizon === "later" ? item.horizon : "now";
    const statuses: CompanyPlan["status"][] = ["idea", "planned", "active", "complete", "paused"];
    return [{
      id: cleanId(item.id, "plan"),
      title,
      horizon,
      status: statuses.includes(item.status as CompanyPlan["status"]) ? item.status as CompanyPlan["status"] : "idea",
      owner: cleanText(item.owner, 120) || undefined,
      notes: cleanText(item.notes, 4_000) || undefined,
    }];
  });
}

/**
 * A quarterly cycle that has been locked is the retained record of a decision.
 * It is frozen: the incoming array may carry it forward unchanged, but any edit
 * or omission is refused so a later strategy change has to be published as an
 * explicit numbered amendment instead of quietly rewriting history.
 */
function cleanReviews(value: unknown, stored: CompanyQuarterlyReview[] = []): CompanyQuarterlyReview[] {
  const lockedById = new Map(stored.filter(review => review.status === "complete").map(review => [review.id, review]));
  const candidates = cleanReviewRecords(value);

  for (const candidate of candidates) {
    const locked = lockedById.get(candidate.id);
    if (locked && !sameReview(locked, candidate)) {
      throw new CompanyReviewLockedError(
        locked.id,
        locked.period,
        `The ${locked.period} strategy review is locked. Publish an amendment that supersedes it rather than editing the retained record.`,
      );
    }
  }

  const present = new Set(candidates.map(candidate => candidate.id));
  const dropped = [...lockedById.values()].find(review => !present.has(review.id));
  if (dropped) {
    throw new CompanyReviewLockedError(
      dropped.id,
      dropped.period,
      `The ${dropped.period} strategy review is locked and cannot be removed from the decision record.`,
    );
  }

  // Amendment lineage is server-assigned so a client cannot claim a version.
  const byId = new Map(candidates.map(candidate => [candidate.id, candidate]));
  return candidates.map(candidate => {
    const locked = lockedById.get(candidate.id);
    if (locked) return locked;
    const amends = candidate.amendsReviewId && candidate.amendsReviewId !== candidate.id
      ? lockedById.get(candidate.amendsReviewId) ?? byId.get(candidate.amendsReviewId)
      : undefined;
    // The base's version is only trusted when it comes from the stored locked
    // record; a version arriving on the wire is never believed, so a crafted
    // PUT cannot mint a lineage number for a cycle that has none.
    return amends
      ? { ...candidate, amendsReviewId: amends.id, version: (lockedById.get(amends.id)?.version ?? 1) + 1 }
      : { ...candidate, amendsReviewId: undefined, version: 1 };
  });
}

/**
 * Field-for-field equality of a carried-forward locked review. Anything that
 * differs — including the evidence snapshot a live save would have overwritten
 * — counts as an edit. Lineage fields are server-owned and excluded.
 */
function sameReview(locked: CompanyQuarterlyReview, candidate: CompanyQuarterlyReview): boolean {
  return reviewFingerprint(locked) === reviewFingerprint(candidate);
}

function reviewFingerprint(review: CompanyQuarterlyReview): string {
  const entries = Object.entries(review as unknown as Record<string, unknown>)
    .filter(([key, value]) => value !== undefined && key !== "version" && key !== "amendsReviewId")
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

function cleanReviewRecords(value: unknown): CompanyQuarterlyReview[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<CompanyQuarterlyReview>;
    const period = cleanText(item.period, 40);
    if (!period) return [];
    const score = (candidate: unknown): 1 | 2 | 3 | 4 | 5 => Math.min(5, Math.max(1, Math.round(cleanNumber(candidate, 3, 1, 5)))) as 1 | 2 | 3 | 4 | 5;
    const rawScorecard = item.scorecard && typeof item.scorecard === "object" ? item.scorecard : undefined;
    const rawEvidence = item.evidenceSnapshot && typeof item.evidenceSnapshot === "object" ? item.evidenceSnapshot : undefined;
    return [{
      id: cleanId(item.id, "review"),
      period,
      status: item.status === "complete" ? "complete" : "draft",
      amendsReviewId: cleanText(item.amendsReviewId, 80).toLowerCase().replace(/[^a-z0-9-]/g, "-") || undefined,
      version: typeof item.version === "number" ? cleanNumber(item.version, 1, 1, 1_000) : undefined,
      executiveSummary: cleanText(item.executiveSummary, 8_000) || undefined,
      wins: cleanText(item.wins, 8_000),
      misses: cleanText(item.misses, 8_000) || undefined,
      lessons: cleanText(item.lessons, 8_000),
      marketSignals: cleanText(item.marketSignals, 8_000) || undefined,
      customerSignals: cleanText(item.customerSignals, 8_000) || undefined,
      financialDiagnosis: cleanText(item.financialDiagnosis, 8_000) || undefined,
      operatingDiagnosis: cleanText(item.operatingDiagnosis, 8_000) || undefined,
      strategicBets: cleanText(item.strategicBets, 8_000) || undefined,
      risks: cleanText(item.risks, 8_000) || undefined,
      stopDoing: cleanText(item.stopDoing, 8_000) || undefined,
      decisions: cleanText(item.decisions, 8_000),
      nextPriorities: cleanText(item.nextPriorities, 8_000),
      successMeasures: cleanText(item.successMeasures, 8_000) || undefined,
      ownerCommitment: cleanText(item.ownerCommitment, 8_000) || undefined,
      implementationHandover: cleanText(item.implementationHandover, 8_000) || undefined,
      scorecard: rawScorecard ? {
        growth: score(rawScorecard.growth),
        finance: score(rawScorecard.finance),
        customer: score(rawScorecard.customer),
        operations: score(rawScorecard.operations),
        capability: score(rawScorecard.capability),
      } : undefined,
      evidenceSnapshot: rawEvidence ? {
        revenueCents: cleanNumber(rawEvidence.revenueCents, 0, 0, 1_000_000_000_000),
        revenueTargetCents: cleanNumber(rawEvidence.revenueTargetCents, 0, 0, 1_000_000_000_000),
        revenueProgressPercent: cleanNumber(rawEvidence.revenueProgressPercent, 0, 0, 100_000),
        monthlyGrowthPercent: typeof rawEvidence.monthlyGrowthPercent === "number" ? cleanNumber(rawEvidence.monthlyGrowthPercent, 0, -100, 100_000) : undefined,
        activeClients: cleanNumber(rawEvidence.activeClients, 0, 0, 1_000_000),
        clientsNeedingAttention: cleanNumber(rawEvidence.clientsNeedingAttention, 0, 0, 1_000_000),
        openLeads: cleanNumber(rawEvidence.openLeads, 0, 0, 1_000_000),
        openTasks: cleanNumber(rawEvidence.openTasks, 0, 0, 1_000_000),
        overdueTasks: cleanNumber(rawEvidence.overdueTasks, 0, 0, 1_000_000),
        healthScore: cleanNumber(rawEvidence.healthScore, 0, 0, 100),
        objectiveProgressPercent: cleanNumber(rawEvidence.objectiveProgressPercent, 0, 0, 100),
        objectivesAtRisk: cleanNumber(rawEvidence.objectivesAtRisk, 0, 0, 1_000_000),
        capacityUtilisationPercent: cleanNumber(rawEvidence.capacityUtilisationPercent, 0, 0, 100_000),
        connectedSources: cleanNumber(rawEvidence.connectedSources, 0, 0, 100_000),
        totalSources: cleanNumber(rawEvidence.totalSources, 0, 0, 100_000),
        capturedAt: cleanNumber(rawEvidence.capturedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
      } : undefined,
      completedAt: item.completedAt ? cleanNumber(item.completedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER) : undefined,
      updatedAt: cleanNumber(item.updatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
    }];
  });
}
