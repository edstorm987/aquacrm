import { redirect } from "next/navigation";

// Compatibility route only. Actions now lives as a tab inside the Master
// Inbox (see docs/development/plans/inbox-actions-unification.md); the many
// existing /portal/agency/actions links across the app land on that tab.
// The workspace itself (_ActionsPage/_ActionsWorkspace/_TodayView) is reused
// there as a server-rendered slot — it is not deleted.
export default function AgencyActionsPage() {
  redirect("/portal/agency/inbox?view=actions");
}
