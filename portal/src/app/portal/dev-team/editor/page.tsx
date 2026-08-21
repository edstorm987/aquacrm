import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { AGENCY_ROLES } from "@/server/types";
import { ensureHydrated } from "@/server/storage";
import { loadPortalStudioProps, type PortalStudioQuery } from "@/engines/editor/server/portalStudio";
import { loadEditorAssistant } from "@/engines/editor/server/editorAssistant";

import { ClientPortalStudio } from "../../agency/portals/editor/_ClientPortalStudio";

// The Dev Team Editor IS the engine — and the engine's UI already existed.
//
// This route used to mount `CodeWorkspace`: a read-only repository tree with a
// file reader. That is one inspector's worth of the engine, which is why it read
// as "a third of it, no visual, no simple modes". The full engine is the Portal
// Studio (`_ClientPortalStudio`): a live canvas over the real portal, the depth
// selector (just the words / design it / developer) and the Builder, Content,
// Pages, Brand, Code, Repo and Versions inspectors — the repository browser
// among them. So this route now mounts THAT, via the shared engine loader, and
// the two doors cannot drift.
//
// Founder + Dev Mode only — the same layered gate as the layout and every other
// dev-team surface: role first, then `devDocsAccessible`. The studio's own API
// routes assert their scope again, so a gate on the page is the screen's guard,
// not the write's.
export const dynamic = "force-dynamic";

export default async function DevTeamEditorPage({
  searchParams,
}: {
  searchParams: Promise<PortalStudioQuery>;
}) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  if (!devDocsAccessible(session)) notFound();

  const agencyId = session.activeAgencyId ?? session.agencyId;
  const query = await searchParams;
  // Dev Team opens the engine at its deepest by default — this is the
  // founder's build surface, not a client-safe view. An explicit ?mode= still
  // wins, and the client switcher stays available (no lockToClient here).
  const props = loadPortalStudioProps({ agencyId, userId: session.userId, role: session.role, query });
  // Aqua Editor AI — the same assistant engine the Advisor and Librarian use.
  const assistant = await loadEditorAssistant(agencyId, session.userId);

  return (
    <ClientPortalStudio
      clients={props.clients}
      templates={props.templates}
      initialClientId={props.initialClientId}
      initialTemplateId={props.initialTemplateId}
      initialScope={props.initialScope}
      initialMode={props.initialMode}
      initialSection={props.initialSection}
      canManage={props.canManage}
      backHref="/portal/dev-team"
      backLabel="Back to Dev Team"
      assistant={assistant}
    />
  );
}
