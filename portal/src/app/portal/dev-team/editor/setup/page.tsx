import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Settings2 } from "lucide-react";

import { requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { AGENCY_ROLES } from "@/server/types";
import { ensureHydrated } from "@/server/storage";

import { PageHeader } from "../../_ui";
import { DevEditorSetup } from "./_DevEditorSetup";

// Dev Editor — setup.
//
// The editor itself is a full-screen surface, so its configuration cannot live
// inside it without fighting the canvas for room. This is the screen where a
// project is created, repointed (a repo moved, a branch changed, a token
// replaced) or disconnected.
//
// Founder + Dev Mode only, the same layered gate as every other dev-team
// surface: role first, then `devDocsAccessible`. The projects API asserts both
// again, so this gate is the screen's, not the write's.
export const dynamic = "force-dynamic";

export default async function DevEditorSetupPage() {
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
        icon={<Settings2 size={20} />}
        title="Dev Editor setup"
        subtitle="What the editor can be pointed at — repositories, branches, connections and tags."
      />
      <Link
        href="/portal/dev-team/editor"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-[color:var(--dt-muted)] hover:text-[color:var(--dt-ink)]"
      >
        <ArrowLeft size={13} aria-hidden /> Open the editor
      </Link>
      <DevEditorSetup />
    </div>
  );
}
