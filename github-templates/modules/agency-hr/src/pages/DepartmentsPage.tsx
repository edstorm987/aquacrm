// Server-rendered Departments page. Mounted at
// `/portal/agency/agency-hr/departments`.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { DepartmentList } from "../components/DepartmentList";

export const API_BASE = "/api/portal/agency-hr";

export default async function DepartmentsPage(props: PluginPageProps) {
  const { staff, departments } = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
  });

  const [depts, allStaff] = await Promise.all([
    departments.list(),
    staff.list(),
  ]);

  const staffCountById: Record<string, number> = {};
  for (const s of allStaff) {
    if (!s.departmentId) continue;
    staffCountById[s.departmentId] = (staffCountById[s.departmentId] ?? 0) + 1;
  }

  return (
    <DepartmentList
      departments={depts}
      staffCountById={staffCountById}
      apiBase={API_BASE}
      canMutate
    />
  );
}
