import { requireRole } from "@/lib/server/auth";
import { listNotepadFolders, listNotepadNotes } from "@/server/notepad";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

import { NotepadWorkspace } from "./_NotepadWorkspace";

export default async function NotepadPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  const query = await searchParams;
  return (
    <NotepadWorkspace
      initialNotes={listNotepadNotes(session.agencyId, session.userId)}
      initialFolders={listNotepadFolders(session.agencyId, session.userId)}
      initialNoteId={query.note}
    />
  );
}
