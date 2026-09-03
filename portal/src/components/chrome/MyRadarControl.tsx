import "server-only";

import { MyRadarButton } from "@/components/chrome/MyRadarButton";

// The shared shell stays cheap: the actor-resolved agency layout decides
// whether this control exists, and the personal snapshot is fetched only when
// somebody opens it. That avoids rescanning goals, tasks and wellbeing on
// every navigation while preserving a server-owned authorization decision.
export function MyRadarControl({
  activeDepartment,
  staffWorkspace = false,
  businessRadarAvailable = false,
}: {
  activeDepartment?: string;
  staffWorkspace?: boolean;
  businessRadarAvailable?: boolean;
}) {
  return <MyRadarButton
    activeDepartment={activeDepartment}
    staffWorkspace={staffWorkspace}
    businessRadarAvailable={businessRadarAvailable}
  />;
}
