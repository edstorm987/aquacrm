import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { listNotepadFolders, listNotepadNotes } from "@/server/notepad";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

import { NotepadWorkspace } from "@/app/portal/agency/notepad/_NotepadWorkspace";

// Dev Team → Notes. Reuses the built personal notepad wholesale: the same store
// (`listNotepadNotes`/`listNotepadFolders`, scoped by agencyId + owner userId)
// and the same client workspace as `/portal/agency/notepad`. This page only
// layers the Dev-Team gate (founder-only Dev Team access) on top of the agency-role gate;
// the notes themselves are the SAME per-user notepad, surfaced in both places.
// Renders inside the existing dev-team layout (its <main id="main-content"> is
// what the workspace scrolls to on mobile).
export const dynamic = "force-dynamic";

export default async function DevTeamNotesPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  // Founder-only Dev Team access, or this section does not exist.
  if (!devDocsAccessible(session)) notFound();

  const query = await searchParams;
  return (
    <NotepadWorkspace
      initialNotes={listNotepadNotes(session.agencyId, session.userId)}
      initialFolders={listNotepadFolders(session.agencyId, session.userId)}
      initialNoteId={query.note}
    />
  );
}
