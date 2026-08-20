import { notFound, redirect } from "next/navigation";
import { Code2 } from "lucide-react";

import { requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { AGENCY_ROLES } from "@/server/types";
import { ensureHydrated } from "@/server/storage";

import { CodeWorkspace } from "../../agency/development/code/_CodeWorkspace";
import { PageHeader } from "../_ui";

// The Dev Team Editor IS the engine — "our version of VS Code, the whole git
// registry". It was a redirect to the app-config editor; now it mounts the
// real code + git engine (`CodeWorkspace`, backed by `lib/server/siteEditor/**`):
// browse the repository tree, read and edit files, patch and publish. The
// app-config editor still lives under Tools → Editor (`_Section`); this route is
// the full engine, not that redirect.
//
// Founder + Dev Mode only — the same layered gate as the layout and every other
// dev-team surface: role first, then `devDocsAccessible`. The site-editor API
// routes assert their own scope again, so a gate on the page is the screen's
// guard, not the write's.
export const dynamic = "force-dynamic";

export default async function DevTeamEditorPage() {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  if (!devDocsAccessible(session)) notFound();

  // No first-party repo constant exists in scope yet, so the engine opens with
  // an empty repository and the user picks one — the same way the standalone
  // `/portal/agency/development/code` page mounts it.
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        accent="editor"
        icon={<Code2 size={20} />}
        title="Dev Editor Engine"
        subtitle="Our version of VS Code — browse the repository, edit files, patch and publish, all backed by GitHub and git."
      />
      <CodeWorkspace initialRepository="" />
    </div>
  );
}
