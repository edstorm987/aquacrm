// Agency-payroll domain.
//
// Internal-team payroll surface. Distinct from agency-finance (which
// tracks agency↔client invoicing). This plugin tracks agency↔staff/
// contractor pay: periods + payslips + contractor list + monthly
// totals. No real bank/Stripe wiring — operator pastes amounts;
// production wiring is a T6 gate.

import type { UserId } from "./tenancy";

export type PayPeriodStatus = "open" | "closed";
export type PayeeKind = "employee" | "contractor";

export interface PayPeriod {
  id: string;
  agencyId: string;
  year: number;        // e.g. 2026
  month: number;       // 1..12
  startedAt: number;
  closedAt?: number;
  status: PayPeriodStatus;
  notes?: string;
}

export interface Payslip {
  id: string;
  agencyId: string;
  periodId: string;
  payeeId: string;     // staff id (employee) OR contractor id
  payeeKind: PayeeKind;
  payeeName: string;   // snapshot — survives staff renames/archives
  gross: number;       // pence/cents — operator pastes amount
  net: number;
  currency: string;    // "GBP" / "USD" — operator-set, default agency setting
  notes?: string;
  paidAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Contractor {
  id: string;
  agencyId: string;
  staffId?: string;          // optional pointer into agency-hr Staff
  name: string;
  email?: string;
  hourlyRate?: number;       // pence/cents
  currency?: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreatePayPeriodInput {
  year: number;
  month: number;
  notes?: string;
}

export interface CreatePayslipInput {
  periodId: string;
  payeeId: string;
  payeeKind: PayeeKind;
  payeeName: string;
  gross: number;
  net: number;
  currency?: string;
  notes?: string;
}

export interface UpdatePayslipPatch {
  gross?: number;
  net?: number;
  notes?: string;
  payeeName?: string;
  currency?: string;
}

export interface CreateContractorInput {
  name: string;
  email?: string;
  hourlyRate?: number;
  currency?: string;
  staffId?: string;
}

export interface UpdateContractorPatch {
  name?: string;
  email?: string;
  hourlyRate?: number;
  currency?: string;
  staffId?: string;
  archived?: boolean;
}

export interface PayslipFilter {
  periodId?: string;
  payeeKind?: PayeeKind;
  payeeId?: string;
  paidOnly?: boolean;
  unpaidOnly?: boolean;
}

export interface PeriodTotals {
  periodId: string;
  paidGross: number;
  paidNet: number;
  paidCount: number;
  totalCount: number;
  hasData: boolean;       // honesty contract — false when no paid payslips
  byKind: { employee: { paidGross: number; paidNet: number; paidCount: number };
            contractor: { paidGross: number; paidNet: number; paidCount: number } };
}

export function isValidMonth(m: number): boolean {
  return Number.isInteger(m) && m >= 1 && m <= 12;
}
export function isValidYear(y: number): boolean {
  return Number.isInteger(y) && y >= 2000 && y <= 2200;
}

export function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function emptyTotals(periodId: string): PeriodTotals {
  return {
    periodId,
    paidGross: 0, paidNet: 0, paidCount: 0, totalCount: 0,
    hasData: false,
    byKind: {
      employee:   { paidGross: 0, paidNet: 0, paidCount: 0 },
      contractor: { paidGross: 0, paidNet: 0, paidCount: 0 },
    },
  };
}
