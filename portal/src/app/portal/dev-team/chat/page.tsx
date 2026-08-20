import { notFound, redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";

import { requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { TeamChat } from "@/components/people/TeamChat";

import { PageHeader } from "../_ui";

// Dev Team → Team chat. v1 REUSES the existing TeamChat wholesale (the same
// staff chat backed by /api/portal/team-chat, scoped by the session's agency +
// user). This page only layers the Dev-Team gate (founder + Dev Mode) on top of
// the agency-role gate; the chat itself is self-contained (it fetches its own
// snapshot), so there is nothing to thread through.
//
// Follow-ups (do NOT build here): v2 — AI workers post into it (wire
// devTeamWorkers signals → chat messages); v3 — bridge to hired staff portals so
// the same chat carries the Dev Team's comms whether the "team" is AI or people.
export const dynamic = "force-dynamic";

export default async function DevTeamChatPage() {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  // Founder + Dev Mode, or this section does not exist.
  if (!devDocsAccessible(session)) notFound();

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<MessagesSquare size={20} />}
        title="Team chat"
        subtitle="The Dev Team's comms — with hired staff now, and AI workers next."
        accent="working"
      />
      <TeamChat />
    </div>
  );
}
