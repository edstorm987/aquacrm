// RolesPage — Role Builder surface (chapter #59 §9). Mounted at
// `/portal/agency/agency-hr/roles`. Renders a permission matrix grid
// (rows = roles, cols = PermissionKeys) with per-cell checkboxes. Seed
// roles render read-only; the "Clone" action duplicates a seed into an
// editable user role.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { RoleMatrixClient } from "../components/RoleMatrixClient";
import { ALL_PERMISSION_KEYS } from "../lib/domain";

export const API_BASE = "/api/portal/agency-hr";

export default async function RolesPage(props: PluginPageProps) {
  const { roles } = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
  });

  const list = await roles.list();
  return (
    <RoleMatrixClient
      roles={list}
      permissions={[...ALL_PERMISSION_KEYS]}
      apiBase={API_BASE}
    />
  );
}
