import { notFound, redirect } from "next/navigation";
import { Boxes } from "lucide-react";

import { requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { AGENCY_ROLES } from "@/server/types";
import { ensureHydrated } from "@/server/storage";

import { PageHeader } from "../_ui";
import { DevEditorSetup } from "./setup/_DevEditorSetup";

// Dev Editor — the PROJECTS WORKSPACE, and the door to the editor.
//
// Ed's shape: pressing "Editor" must not drop you straight into a full-screen
// canvas over whatever project happened to be first. It lands here — what you
// have, what each one is pointed at — so you add a project, describe it, and
// then open the editor FOR it. Leaving the editor comes back here, which is
// what makes working across several projects at once workable.
//
// The editor itself lives at ./studio. This split is Dev-Team only: the agency
// portals route (/portal/agency/portals/editor) still opens the studio
// directly, because there a portal is already chosen before you arrive.
//
// Founder-only Dev Team access — role first, then `devDocsAccessible`.
export const dynamic = "force-dynamic";

export default async function DevEditorProjectsPage() {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  if (!devDocsAccessible(session)) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        accent="editor"
        icon={<Boxes size={20} />}
        title="Dev Editor"
        subtitle="Your projects. Add one, point it at a repository, then open the editor for it."
      />
      <DevEditorSetup />
    </div>
  );
}
