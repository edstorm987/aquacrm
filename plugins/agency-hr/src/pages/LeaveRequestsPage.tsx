// Server-rendered Leave Requests page. Mounted at
// `/portal/agency/agency-hr/leave`.

import type { PluginPageProps } from "../lib/aquaPluginTypes";
import { containerFor } from "../server/foundationAdapter";
import { LeaveBoard } from "../components/LeaveBoard";

export const API_BASE = "/api/portal/agency-hr";

export default async function LeaveRequestsPage(props: PluginPageProps) {
  const { staff, leave } = containerFor({
    agencyId: props.agencyId,
    storage: props.storage,
  });

  const [requests, allStaff] = await Promise.all([
    leave.list(),
    staff.list(),
  ]);

  return (
    <LeaveBoard
      leave={requests}
      staff={allStaff}
      apiBase={API_BASE}
      canDecide
      actor={props.actor}
    />
  );
}
