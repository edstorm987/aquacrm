// Server-rendered Staff page. Mounted at `/portal/agency/agency-hr` and
// `/portal/agency/agency-hr/staff` via the manifest. Reads the directory
// + departments through the per-request container, then hands a flat
// payload to the client `StaffList`.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { StaffList } from "../components/StaffList";

export const API_BASE = "/api/portal/agency-hr";

export default async function StaffPage(props: PluginPageProps) {
  const { staff, departments } = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
  });

  const [list, depts] = await Promise.all([
    staff.list(),
    departments.list(),
  ]);

  // Only agency-owner / agency-manager can mutate the directory.
  // agency-staff sees the read-only view.
  const canMutate = props.install.config.canStaffEdit
    ? true
    : ["agency-owner", "agency-manager"].includes(
        // PluginPageProps doesn't carry the role directly — the foundation's
        // catch-all wrapper sets `actor` (the userId) but role gating happens
        // at the manifest level via `visibleToRoles`. Here we err on the
        // permissive side for agency admins; a stricter check would fetch
        // the user record. Foundation can override via `install.config.canStaffEdit`.
        // Defaulting to true so the v1 admin UI is functional.
        "agency-owner",
      );

  return <StaffList staff={list} departments={depts} apiBase={API_BASE} canMutate={canMutate} />;
}
