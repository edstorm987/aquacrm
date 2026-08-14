export interface BrandPortfolioRow {
  id: string;
  label: string;
  colour: string;
  status: "active" | "paused" | "archived";
  unallocated: boolean;
  currency: string;
  monthRevenueCents: number;
  previousMonthRevenueCents: number;
  monthlyRevenueGrowthPercent: number | null;
  monthlyRevenueTargetCents: number;
  revenueSharePercent: number | null;
  mrrCents: number;
  revenueRecordCount: number;
  activeClients: number;
  clientsNeedingAttention: number;
  totalClients: number;
  churnedClients: number;
  leadCount: number;
  recentLeadCount: number;
  convertedLeadCount: number;
  meetingsThisMonth: number;
  completedSalesCalls: number;
  productCount: number;
  staffCount: number;
  evidence: string[];
}

export interface BrandPortfolioSnapshot {
  generatedAt: number;
  currency: string;
  financeConnected: boolean;
  totalRevenueCents: number;
  totalRevenueRecords: number;
  rows: BrandPortfolioRow[];
}
