import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  closePeriodHandler,
  createContractorHandler,
  createPayslipHandler,
  deletePayslipHandler,
  listContractorsHandler,
  listPayslipsHandler,
  listPeriodsHandler,
  markPaidHandler,
  openPeriodHandler,
  totalsHandler,
  updateContractorHandler,
  updatePayslipHandler,
} from "./handlers";

const ADMINS = ["agency-owner", "agency-manager"] as const;
const VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  // periods
  { path: "periods/list",   methods: ["GET"],    handler: listPeriodsHandler,  visibleToRoles: [...VIEWERS] },
  { path: "periods/open",   methods: ["POST"],   handler: openPeriodHandler,   visibleToRoles: [...ADMINS] },
  { path: "periods/close",  methods: ["POST"],   handler: closePeriodHandler,  visibleToRoles: [...ADMINS] },
  // payslips
  { path: "payslips/list",   methods: ["GET"],    handler: listPayslipsHandler,  visibleToRoles: [...VIEWERS] },
  { path: "payslips/create", methods: ["POST"],   handler: createPayslipHandler, visibleToRoles: [...ADMINS] },
  { path: "payslips/update", methods: ["PATCH"],  handler: updatePayslipHandler, visibleToRoles: [...ADMINS] },
  { path: "payslips/paid",   methods: ["POST"],   handler: markPaidHandler,      visibleToRoles: [...ADMINS] },
  { path: "payslips/delete", methods: ["DELETE"], handler: deletePayslipHandler, visibleToRoles: [...ADMINS] },
  // contractors
  { path: "contractors/list",   methods: ["GET"],   handler: listContractorsHandler,  visibleToRoles: [...VIEWERS] },
  { path: "contractors/create", methods: ["POST"],  handler: createContractorHandler, visibleToRoles: [...ADMINS] },
  { path: "contractors/update", methods: ["PATCH"], handler: updateContractorHandler, visibleToRoles: [...ADMINS] },
  // reports
  { path: "totals", methods: ["GET"], handler: totalsHandler, visibleToRoles: [...VIEWERS] },
];
