import "server-only";

import { makePluginStorage } from "@/lib/server/pluginStorage";
import { getInstall } from "@/server/pluginInstalls";

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
  const install = getInstall({ agencyId }, "agency-hr");
  if (!install?.enabled) return { staff: [], departments: [], hrEnabled: false };
  const storage = makePluginStorage(install.id);
  const [staffIds, departmentIds] = await Promise.all([
    storage.get<string[]>("staff/index"),
    storage.get<string[]>("dept/index"),
  ]);
  const [staffRows, departmentRows] = await Promise.all([
    Promise.all((staffIds ?? []).map(id => storage.get<FinanceStaffOption>(`staff:${id}`))),
    Promise.all((departmentIds ?? []).map(id => storage.get<FinanceDepartmentOption>(`dept:${id}`))),
  ]);
  return {
    staff: staffRows.filter((row): row is FinanceStaffOption => Boolean(row) && row!.status !== "alumni").sort((left, right) => left.name.localeCompare(right.name)),
    departments: departmentRows.filter((row): row is FinanceDepartmentOption => Boolean(row)).sort((left, right) => left.name.localeCompare(right.name)),
    hrEnabled: true,
  };
}
