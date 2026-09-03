import { redirect } from "next/navigation";

import { AgencyActionsPage } from "../actions/_ActionsPage";
import { requireRole } from "@/lib/server/auth/auth";
import { requirePersonalCalendarAccess } from "@/lib/server/intelligence/personalRadarAccess";
import { AGENCY_ROLES } from "@/server/types";

export default async function AgencyCalendarPage() {
  const session = await requireRole([...AGENCY_ROLES]);
  try {
    await requirePersonalCalendarAccess(session, "view");
  } catch (error) {
    if (error && typeof error === "object" && "status" in error
      && Number((error as { status?: unknown }).status) === 403) {
      redirect("/portal/account/permissions?notice=calendar-required");
    }
    throw error;
  }
  return <AgencyActionsPage
    initialView="calendar"
    heading="Calendar"
    description="See dated work, meetings, reminders, and business deadlines in one monthly schedule."
  />;
}
