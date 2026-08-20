import { redirect } from "next/navigation";

// This screen is now a VIEW of its section, not a place of its own. The route
// stays so every existing link, bookmark and doc reference still lands.
export default function DevTeamauditorRedirect() {
  redirect("/portal/dev-team/findings?view=auditor");
}
