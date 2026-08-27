import "server-only";

import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { listPeopleEmployees } from "@/server/people";
import { peopleCompensationTerms } from "@/built-ins/runtime/foundation-adapters/agencyFinanceCompensation";
import type { CanonicalCompensationTerms } from "@aqua/plugin-agency-finance/server";

export interface FinanceStaffOption {
  id: string;
  name: string;
  email: string;
  title: string;
  role: string;
  departmentId?: string;
  hourlyRate?: number;
  status: string;
  currency: CanonicalCompensationTerms["currency"];
  rateBasis: CanonicalCompensationTerms["rateBasis"];
  baseRateCents: number;
  unitsPerWeek?: number;
  annualBonusTargetCents: number;
  activeCommissionRuleCount: number;
  hasVariableCommission: boolean;
  contractStartsAt?: number;
  contractEndsAt?: number;
}

export interface FinanceDepartmentOption {
  id: string;
  name: string;
  parentId?: string;
}

export async function listFinanceWorkforceOptions(agencyId: string): Promise<{
  staff: FinanceStaffOption[];
  departments: FinanceDepartmentOption[];
  hrEnabled: boolean;
}> {
  const nativeEmployees = listPeopleEmployees(agencyId).filter(employee => employee.status !== "alumni");
  const nativeStaff: FinanceStaffOption[] = nativeEmployees.map(employee => {
    const terms = peopleCompensationTerms(employee);
    return {
      id: employee.id,
      name: employee.name,
      email: employee.email,
      title: employee.title,
      role: employee.employmentType,
      departmentId: employee.department ? `people:${employee.department.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined,
      hourlyRate: employee.payBasis === "hourly" && employee.basePayMinor !== undefined ? employee.basePayMinor / 100 : undefined,
      status: employee.status,
      currency: terms.currency,
      rateBasis: terms.rateBasis,
      baseRateCents: terms.baseRateCents,
      unitsPerWeek: terms.unitsPerWeek,
      annualBonusTargetCents: terms.annualBonusTargetCents,
      activeCommissionRuleCount: terms.activeCommissionRuleCount,
      hasVariableCommission: terms.hasVariableCommission,
      contractStartsAt: terms.contractStartsAt,
      contractEndsAt: terms.contractEndsAt,
    };
  });
  const nativeDepartments: FinanceDepartmentOption[] = [...new Set(nativeEmployees.map(employee => employee.department).filter((value): value is string => Boolean(value)))].map(name => ({
    id: `people:${name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
  }));
  const install = getInstall({ agencyId }, "agency-hr");
  if (!install?.enabled) return { staff: nativeStaff, departments: nativeDepartments, hrEnabled: nativeStaff.length > 0 };
  const storage = makePluginStorage(install.id);
  const departmentIds = await storage.get<string[]>("dept/index");
  const departmentRows = await Promise.all((departmentIds ?? []).map(id => storage.get<FinanceDepartmentOption>(`dept:${id}`)));
  const legacyDepartments = departmentRows.filter((row): row is FinanceDepartmentOption => Boolean(row));
  return {
    // People is the only employee identity ledger. Agency HR contributes
    // department metadata, never a second staff row hidden behind email dedupe.
    staff: nativeStaff.sort((left, right) => left.name.localeCompare(right.name)),
    departments: [...nativeDepartments, ...legacyDepartments.filter(row => !nativeDepartments.some(native => native.name.toLocaleLowerCase() === row.name.toLocaleLowerCase()))].sort((left, right) => left.name.localeCompare(right.name)),
    hrEnabled: true,
  };
}
