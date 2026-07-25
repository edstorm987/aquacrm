// Manifest API routes — mounted at `/api/portal/agency-finance/...`.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  approveExpenseHandler,
  createCategoryHandler,
  createExpenseHandler,
  createInvoiceHandler,
  deleteInvoiceHandler,
  listCategoriesHandler,
  listExpensesHandler,
  listInvoicesHandler,
  markInvoicePaidHandler,
  rejectExpenseHandler,
  reimburseExpenseHandler,
  reportHandler,
  updateCategoryHandler,
  updateExpenseHandler,
  updateInvoiceHandler,
} from "./handlers";
import {
  assignPlanHandler,
  createPaymentHandler,
  createPlanHandler,
  listPaymentsHandler,
  listPlansHandler,
  pnlSummaryHandler,
  updatePlanHandler,
} from "./handlers-r007";

const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;
const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  // Invoices (5 routes)
  { path: "invoices", methods: ["GET"], handler: listInvoicesHandler, visibleToRoles: [...AGENCY_VIEWERS] },
  { path: "invoices", methods: ["POST"], handler: createInvoiceHandler, visibleToRoles: [...AGENCY_ADMINS] },
  { path: "invoices", methods: ["PATCH"], handler: updateInvoiceHandler, visibleToRoles: [...AGENCY_ADMINS] },
  { path: "invoices", methods: ["DELETE"], handler: deleteInvoiceHandler, visibleToRoles: [...AGENCY_ADMINS] },
  { path: "invoices/mark-paid", methods: ["POST"], handler: markInvoicePaidHandler, visibleToRoles: [...AGENCY_ADMINS] },

  // Expenses (5 routes — agency-staff can submit + read; admins approve / reject / reimburse)
  { path: "expenses", methods: ["GET"], handler: listExpensesHandler, visibleToRoles: [...AGENCY_VIEWERS] },
  { path: "expenses", methods: ["POST"], handler: createExpenseHandler, visibleToRoles: [...AGENCY_VIEWERS] },
  { path: "expenses", methods: ["PATCH"], handler: updateExpenseHandler, visibleToRoles: [...AGENCY_VIEWERS] },
  { path: "expenses/approve", methods: ["POST"], handler: approveExpenseHandler, visibleToRoles: [...AGENCY_ADMINS] },
  { path: "expenses/reject", methods: ["POST"], handler: rejectExpenseHandler, visibleToRoles: [...AGENCY_ADMINS] },
  { path: "expenses/reimburse", methods: ["POST"], handler: reimburseExpenseHandler, visibleToRoles: [...AGENCY_ADMINS] },

  // Categories (3 routes)
  { path: "categories", methods: ["GET"], handler: listCategoriesHandler, visibleToRoles: [...AGENCY_VIEWERS] },
  { path: "categories", methods: ["POST"], handler: createCategoryHandler, visibleToRoles: [...AGENCY_ADMINS] },
  { path: "categories", methods: ["PATCH"], handler: updateCategoryHandler, visibleToRoles: [...AGENCY_ADMINS] },

  // Report
  { path: "report", methods: ["GET"], handler: reportHandler, visibleToRoles: [...AGENCY_VIEWERS] },

  // R007 — Payments / Plans / P&L
  { path: "payments", methods: ["GET"], handler: listPaymentsHandler, visibleToRoles: [...AGENCY_VIEWERS] },
  { path: "payments/create", methods: ["POST"], handler: createPaymentHandler, visibleToRoles: [...AGENCY_ADMINS] },
  { path: "plans", methods: ["GET"], handler: listPlansHandler, visibleToRoles: [...AGENCY_VIEWERS] },
  { path: "plans/create", methods: ["POST"], handler: createPlanHandler, visibleToRoles: [...AGENCY_ADMINS] },
  { path: "plans/update", methods: ["PATCH"], handler: updatePlanHandler, visibleToRoles: [...AGENCY_ADMINS] },
  { path: "plans/assign", methods: ["POST"], handler: assignPlanHandler, visibleToRoles: [...AGENCY_ADMINS] },
  { path: "pnl", methods: ["GET"], handler: pnlSummaryHandler, visibleToRoles: [...AGENCY_ADMINS] },
];
