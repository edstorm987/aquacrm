export {
  PayPeriodService,
  PayslipService,
  ContractorService,
  PayrollReports,
  PayrollNotFoundError,
  PayrollClosedError,
} from "./service";
export {
  isValidMonth,
  isValidYear,
  periodKey,
  emptyTotals,
} from "../lib/domain";
export type {
  ActivityLogPort,
  AgencyPayrollEventName,
  EventBusPort,
  LogActivityInput,
  StoragePort,
  TenantPort,
  UserPort,
} from "./ports";
export {
  registerAgencyPayrollFoundation,
  clearAgencyPayrollFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type { AgencyPayrollFoundation, ContainerForArgs } from "./foundationAdapter";

import type { AgencyId } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type { ActivityLogPort, EventBusPort, StoragePort } from "./ports";
import {
  PayPeriodService,
  PayslipService,
  ContractorService,
  PayrollReports,
} from "./service";

export interface AgencyPayrollDeps {
  agencyId: AgencyId;
  storage: PluginStorage | StoragePort;
  activity: ActivityLogPort;
  events: EventBusPort;
}

export interface AgencyPayrollContainer {
  periods: PayPeriodService;
  payslips: PayslipService;
  contractors: ContractorService;
  reports: PayrollReports;
}

export function buildAgencyPayrollContainer(deps: AgencyPayrollDeps): AgencyPayrollContainer {
  const storage = deps.storage as StoragePort;
  return {
    periods:     new PayPeriodService(deps.agencyId, storage, deps.activity, deps.events),
    payslips:    new PayslipService(deps.agencyId, storage, deps.activity, deps.events),
    contractors: new ContractorService(deps.agencyId, storage, deps.activity, deps.events),
    reports:     new PayrollReports(deps.agencyId, storage, deps.activity, deps.events),
  };
}
