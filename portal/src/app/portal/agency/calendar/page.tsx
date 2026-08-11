import { AgencyActionsPage } from "../actions/_ActionsPage";

export default async function AgencyCalendarPage() {
  return <AgencyActionsPage
    initialView="calendar"
    heading="Calendar"
    description="See dated work, meetings, reminders, and business deadlines in one monthly schedule."
  />;
}
