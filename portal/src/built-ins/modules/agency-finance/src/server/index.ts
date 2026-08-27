// Server-side barrel — services + container builder + foundation adapter.

export { CategoryService, DEFAULT_CATEGORIES } from "./categories";
export { InvoiceService } from "./invoices";
export { ExpenseService } from "./expenses";
export { ReportService } from "./reports";
export { PaymentService } from "./payments";
export { IncomeService } from "./income";
export { PlanService } from "./plans";
export { PnLService } from "./pnl";
export { BudgetService } from "./budgets";
export { FinanceOperationsService } from "./operations";
export { AccountingService, calculateAccountingPeriod } from "./accounting";

export type {
  ActivityLogPort,
  CanonicalCompensationTerms,
  CompensationTermsPort,
  EventBusPort,
  FinanceEventName,
  ListActivityFilter,
  LogActivityInput,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";

export {
  registerAgencyFinanceFoundation,
  clearAgencyFinanceFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { AgencyFinanceFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  CompensationTermsPort,
  EventBusPort,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";
import { CategoryService } from "./categories";
import { InvoiceService } from "./invoices";
import { ExpenseService } from "./expenses";
import { ReportService } from "./reports";
import { PaymentService } from "./payments";
import { IncomeService } from "./income";
import { PlanService } from "./plans";
import { PnLService } from "./pnl";
import { BudgetService } from "./budgets";
import { FinanceOperationsService } from "./operations";
import { AccountingService } from "./accounting";

// ─── Container ────────────────────────────────────────────────────────────

export interface AgencyFinanceDeps {
  agencyId: AgencyId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant: TenantPort;
  user: UserPort;
  pluginInstalls: PluginInstallStorePort;
  // Optional only for standalone package tests. The mounted portal foundation
  // requires this bridge so linked staff terms always come from People.
  compensation?: CompensationTermsPort;
}

export interface AgencyFinanceContainer {
  tenant: TenantPort;
  invoices: InvoiceService;
  expenses: ExpenseService;
  categories: CategoryService;
  reports: ReportService;
  payments: PaymentService;
  income: IncomeService;
  plans: PlanService;
  pnl: PnLService;
  budgets: BudgetService;
  operations: FinanceOperationsService;
  accounting: AccountingService;
}

export function buildAgencyFinanceContainer(deps: AgencyFinanceDeps): AgencyFinanceContainer {
  const storage = deps.storage as StoragePort;
  const categories = new CategoryService(deps.agencyId, storage, deps.activity, deps.events);
  const budgets = new BudgetService(deps.agencyId, storage, deps.activity, deps.events);
  const operations = new FinanceOperationsService(deps.agencyId, storage, deps.activity, deps.events, budgets, deps.compensation);
  const invoices = new InvoiceService(deps.agencyId, storage, deps.tenant, deps.activity, deps.events);
  const expenses = new ExpenseService(deps.agencyId, storage, deps.activity, deps.events, categories, budgets);
  const payments = new PaymentService(deps.agencyId, storage, deps.activity, deps.events, invoices);
  const income = new IncomeService(deps.agencyId, storage, deps.activity, deps.events);
  const accounting = new AccountingService(invoices, payments, income, expenses);
  const reports = new ReportService(invoices, expenses, categories, accounting);
  const plans = new PlanService(deps.agencyId, storage, deps.tenant, deps.activity, deps.events);
  const pnl = new PnLService(payments, plans, accounting);
  return { tenant: deps.tenant, invoices, expenses, categories, reports, payments, income, plans, pnl, budgets, operations, accounting };
}
