import { AgencyActionsPage } from "./_ActionsPage";

// Keep a real Actions-only destination. Linking a person to the combined
// Inbox merely to reach their tasks would also serialize conversations and
// enquiries that belong to a separately configurable Inbox element.
export default function AgencyActionsRoute() {
  return <AgencyActionsPage />;
}
