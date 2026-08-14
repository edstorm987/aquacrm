import "server-only";

import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";
import { listPeopleEmployees } from "@/server/people";

export interface FinanceStaffOption {
  id: string;
  name: string;
  email: string;
  title: string;
  role: string;
  departmentId?: string;
  hourlyRate?: number;
  status: string;
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
  const nativeStaff: FinanceStaffOption[] = nativeEmployees.map(employee => ({
    id: employee.id,
    name: employee.name,
    email: employee.email,
    title: employee.title,
    role: employee.employmentType,
    departmentId: employee.department ? `people:${employee.department.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined,
    hourlyRate: employee.payBasis === "hourly" && employee.basePayMinor !== undefined ? employee.basePayMinor / 100 : undefined,
    status: employee.status,
  }));
  const nativeDepartments: FinanceDepartmentOption[] = [...new Set(nativeEmployees.map(employee => employee.department).filter((value): value is string => Boolean(value)))].map(name => ({
    id: `people:${name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
  }));
  const install = getInstall({ agencyId }, "agency-hr");
  if (!install?.enabled) return { staff: nativeStaff, departments: nativeDepartments, hrEnabled: nativeStaff.length > 0 };
  const storage = makePluginStorage(install.id);
  const [staffIds, departmentIds] = await Promise.all([
    storage.get<string[]>("staff/index"),
    storage.get<string[]>("dept/index"),
  ]);
  const [staffRows, departmentRows] = await Promise.all([
    Promise.all((staffIds ?? []).map(id => storage.get<FinanceStaffOption>(`staff:${id}`))),
    Promise.all((departmentIds ?? []).map(id => storage.get<FinanceDepartmentOption>(`dept:${id}`))),
  ]);
  const legacyStaff = staffRows.filter((row): row is FinanceStaffOption => Boolean(row) && row!.status !== "alumni");
  const legacyDepartments = departmentRows.filter((row): row is FinanceDepartmentOption => Boolean(row));
  return {
    staff: [...nativeStaff, ...legacyStaff.filter(row => !nativeStaff.some(native => native.email.toLocaleLowerCase() === row.email.toLocaleLowerCase()))].sort((left, right) => left.name.localeCompare(right.name)),
    departments: [...nativeDepartments, ...legacyDepartments.filter(row => !nativeDepartments.some(native => native.name.toLocaleLowerCase() === row.name.toLocaleLowerCase()))].sort((left, right) => left.name.localeCompare(right.name)),
    hrEnabled: true,
  };
}
