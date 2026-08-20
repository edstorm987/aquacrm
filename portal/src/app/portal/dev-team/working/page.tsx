import { redirect } from "next/navigation";

// "What we're working on" is no longer its own place — it is the "Right now"
// VIEW of the Roadmap section, so one entry point covers both altitudes: the
// outcomes that are coming, and the plans moving today. This route stays so
// every existing link, bookmark and doc reference still lands correctly.
export default function DevTeamWorkingPage() {
  redirect("/portal/dev-team/roadmap?view=now");
}
