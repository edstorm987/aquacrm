// Server-side barrel — services + container builder + foundation adapter.

export { CategoryService, DEFAULT_CATEGORIES } from "./categories";
export { InvoiceService } from "./invoices";
export { ExpenseService } from "./expenses";
export { ReportService } from "./reports";
export { PaymentService } from "./payments";
export { PlanService } from "./plans";
export { PnLService } from "./pnl";

export type {
  ActivityLogPort,
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
import { PlanService } from "./plans";
import { PnLService } from "./pnl";

// ─── Container ────────────────────────────────────────────────────────────

export interface AgencyFinanceDeps {
  agencyId: AgencyId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
  tenant: TenantPort;
  user: UserPort;
  pluginInstalls: PluginInstallStorePort;
}

export interface AgencyFinanceContainer {
  invoices: InvoiceService;
  expenses: ExpenseService;
  categories: CategoryService;
  reports: ReportService;
  payments: PaymentService;
  plans: PlanService;
  pnl: PnLService;
}

export function buildAgencyFinanceContainer(deps: AgencyFinanceDeps): AgencyFinanceContainer {
  const storage = deps.storage as StoragePort;
  const categories = new CategoryService(deps.agencyId, storage, deps.activity, deps.events);
  const invoices = new InvoiceService(deps.agencyId, storage, deps.tenant, deps.activity, deps.events);
  const expenses = new ExpenseService(deps.agencyId, storage, deps.activity, deps.events, categories);
  const reports = new ReportService(deps.agencyId, invoices, expenses, categories);
  const payments = new PaymentService(deps.agencyId, storage, deps.activity, deps.events, invoices);
  const plans = new PlanService(deps.agencyId, storage, deps.activity, deps.events);
  const pnl = new PnLService(deps.agencyId, invoices, payments, expenses, plans);
  return { invoices, expenses, categories, reports, payments, plans, pnl };
}
