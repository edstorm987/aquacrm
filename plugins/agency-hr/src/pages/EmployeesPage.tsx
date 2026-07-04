// EmployeesPage — Employee HQ surface (chapter #59 §9). Mounted via the
// manifest at `/portal/agency/agency-hr/employees`. Reads the staff
// directory + roles through the per-request container, filters down to
// rows flagged `agencyEmployee:true` (or any row with a customRoleId,
// to surface bootstrap migrations), and renders a flat table with
// inline-expandable per-row profile (NDA / payroll / assignments).

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { EmployeeListClient } from "../components/EmployeeListClient";

export const API_BASE = "/api/portal/agency-hr";

export default async function EmployeesPage(props: PluginPageProps) {
  const { staff, roles } = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
  });

  const [list, allRoles] = await Promise.all([staff.list(), roles.list()]);
  const employees = list.filter(s => s.agencyEmployee || s.customRoleId);

  return <EmployeeListClient employees={employees} roles={allRoles} apiBase={API_BASE} />;
}
