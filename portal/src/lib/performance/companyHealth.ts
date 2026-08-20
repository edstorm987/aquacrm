export interface CompanyHealthInput {
  monthRevenueCents: number;
  monthlyRevenueTargetCents: number;
  dayOfMonth: number;
  daysInMonth: number;
  activeClients: number;
  clientsNeedingAttention: number;
  revenueGapCents: number;
  estimatedCallsNeeded: number;
  meetingsThisMonth: number;
  openTasks: number;
  overdueTasks: number;
}

export interface CompanyHealthResult {
  overall: number;
  income: number;
  clients: number;
  pipeline: number;
  operations: number;
  monthElapsedPercent: number;
}

export interface ServiceBrandHealthInput {
  status: "active" | "paused" | "archived";
  hasWebsite: boolean;
  hasDescription: boolean;
  clientCount: number;
  activeClientCount: number;
  productCount: number;
  staffCount: number;
}

export interface ServiceBrandHealthResult {
  overall: number;
  clients: number;
  offers: number;
  people: number;
  profile: number;
  operations: number;
}

export function calculateCompanyHealth(input: CompanyHealthInput): CompanyHealthResult {
  const monthElapsedPercent = Math.max(1, Math.min(100, Math.round(input.dayOfMonth / Math.max(1, input.daysInMonth) * 100)));
  const targetToDate = Math.round(input.monthlyRevenueTargetCents * monthElapsedPercent / 100);
  const healthyClients = Math.max(0, input.activeClients - input.clientsNeedingAttention);
  const income = input.monthlyRevenueTargetCents <= 0 ? 100 : ratioScore(input.monthRevenueCents, targetToDate);
  const clients = input.activeClients > 0 ? ratioScore(healthyClients, input.activeClients) : 0;
  const pipeline = input.revenueGapCents <= 0 ? 100 : input.estimatedCallsNeeded > 0 ? ratioScore(input.meetingsThisMonth, input.estimatedCallsNeeded) : 0;
  const operations = input.openTasks > 0 ? ratioScore(input.openTasks - input.overdueTasks, input.openTasks) : 100;

  return {
    overall: Math.round(income * 0.35 + clients * 0.25 + pipeline * 0.25 + operations * 0.15),
    income,
    clients,
    pipeline,
    operations,
    monthElapsedPercent,
  };
}

export function calculateServiceBrandHealth(input: ServiceBrandHealthInput): ServiceBrandHealthResult {
  const clients = input.clientCount > 0 ? ratioScore(input.activeClientCount, input.clientCount) : 0;
  const offers = input.productCount > 0 ? 100 : 0;
  const people = input.staffCount > 0 ? 100 : 0;
  const profile = Number(input.hasWebsite) * 60 + Number(input.hasDescription) * 40;
  const operations = input.status === "active" ? 100 : input.status === "paused" ? 40 : 0;

  return {
    overall: Math.round(clients * 0.3 + offers * 0.25 + people * 0.2 + profile * 0.15 + operations * 0.1),
    clients,
    offers,
    people,
    profile,
    operations,
  };
}

function ratioScore(value: number, target: number): number {
  if (target <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(value / target * 100)));
}
