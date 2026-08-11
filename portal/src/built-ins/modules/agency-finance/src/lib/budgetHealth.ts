import type { BudgetPot, Expense } from "./domain";

export interface CampaignBudgetRecord {
  id: string;
  name: string;
  budgetPotId?: string;
  budgetCents?: number;
  spendCents?: number;
  status?: string;
  updatedAt?: number;
}

export interface WorkforceBudgetRecord {
  id: string;
  budgetPotId?: string;
  grossCents: number;
  employerCostCents: number;
  status: "planned" | "approved" | "paid" | "cancelled";
}

export type BudgetPotSignal = "healthy" | "watch" | "unfunded" | "overspent" | "closed";

export interface BudgetPotSnapshot extends BudgetPot {
  campaignCount: number;
  expenseCount: number;
  workforcePaymentCount: number;
  campaignCommittedCents: number;
  campaignSpentCents: number;
  expenseCommittedCents: number;
  expenseSpentCents: number;
  workforceCommittedCents: number;
  workforceSpentCents: number;
  committedCents: number;
  spentCents: number;
  remainingAllocatedCents: number;
  remainingFundedCents: number;
  overspendCents: number;
  fundingGapCents: number;
  usagePercent: number;
  signal: BudgetPotSignal;
}

export function buildBudgetPotSnapshots(
  pots: BudgetPot[],
  campaigns: CampaignBudgetRecord[],
  expenses: Expense[],
  workforcePayments: WorkforceBudgetRecord[] = [],
): BudgetPotSnapshot[] {
  return pots.map(pot => budgetPotSnapshot(pot, campaigns, expenses, workforcePayments));
}

export function budgetPotSnapshot(
  pot: BudgetPot,
  campaigns: CampaignBudgetRecord[],
  expenses: Expense[],
  workforcePayments: WorkforceBudgetRecord[] = [],
): BudgetPotSnapshot {
  const linkedCampaigns = campaigns.filter(campaign => campaign.budgetPotId === pot.id && campaign.status !== "cancelled");
  const linkedExpenses = expenses.filter(expense => expense.budgetPotId === pot.id && expense.status !== "rejected");
  const linkedWorkforce = workforcePayments.filter(payment => payment.budgetPotId === pot.id && payment.status !== "cancelled");
  const campaignCommittedCents = linkedCampaigns.reduce(
    (sum, campaign) => sum + Math.max(campaign.budgetCents ?? 0, campaign.spendCents ?? 0),
    0,
  );
  const campaignSpentCents = linkedCampaigns.reduce((sum, campaign) => sum + (campaign.spendCents ?? 0), 0);
  const expenseCommittedCents = linkedExpenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const expenseSpentCents = linkedExpenses
    .filter(expense => expense.status === "reimbursed")
    .reduce((sum, expense) => sum + expense.amountCents, 0);
  const workforceCommittedCents = linkedWorkforce.reduce((sum, payment) => sum + payment.grossCents + payment.employerCostCents, 0);
  const workforceSpentCents = linkedWorkforce
    .filter(payment => payment.status === "paid")
    .reduce((sum, payment) => sum + payment.grossCents + payment.employerCostCents, 0);
  const committedCents = campaignCommittedCents + expenseCommittedCents + workforceCommittedCents;
  const spentCents = campaignSpentCents + expenseSpentCents + workforceSpentCents;
  const remainingAllocatedCents = pot.allocatedCents - committedCents;
  const remainingFundedCents = pot.fundedCents - committedCents;
  const overspendCents = Math.max(0, committedCents - pot.allocatedCents, spentCents - pot.fundedCents);
  const fundingGapCents = Math.max(0, pot.allocatedCents - pot.fundedCents);
  const usagePercent = pot.allocatedCents > 0 ? Math.round(committedCents / pot.allocatedCents * 100) : committedCents > 0 ? 100 : 0;
  const signal: BudgetPotSignal = pot.status === "closed"
    ? "closed"
    : overspendCents > 0
      ? "overspent"
      : pot.fundedCents === 0 && committedCents > 0
        ? "unfunded"
        : usagePercent >= 85 || remainingFundedCents < 0
          ? "watch"
          : "healthy";
  return {
    ...pot,
    campaignCount: linkedCampaigns.length,
    expenseCount: linkedExpenses.length,
    workforcePaymentCount: linkedWorkforce.length,
    campaignCommittedCents,
    campaignSpentCents,
    expenseCommittedCents,
    expenseSpentCents,
    workforceCommittedCents,
    workforceSpentCents,
    committedCents,
    spentCents,
    remainingAllocatedCents,
    remainingFundedCents,
    overspendCents,
    fundingGapCents,
    usagePercent,
    signal,
  };
}

export function campaignPotHeadroom(snapshot: BudgetPotSnapshot, campaign?: CampaignBudgetRecord): number {
  const currentCommitment = campaign?.budgetPotId === snapshot.id
    ? Math.max(campaign.budgetCents ?? 0, campaign.spendCents ?? 0)
    : 0;
  return snapshot.remainingFundedCents + currentCommitment;
}
