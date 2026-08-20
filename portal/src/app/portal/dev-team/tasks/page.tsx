import { redirect } from "next/navigation";

// Tasks is no longer its own place — it is the closest-in VIEW of the Roadmap
// section (outcomes → plans → phases → tasks). This route stays so every
// existing link, bookmark and doc reference still lands correctly.
export default function DevTeamTasksPage() {
  redirect("/portal/dev-team/roadmap?view=tasks");
}
