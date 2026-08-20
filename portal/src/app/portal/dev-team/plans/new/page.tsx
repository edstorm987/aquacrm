import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FilePlus2 } from "lucide-react";

import { requireRole } from "@/lib/server/auth";
import { devDocsAccessible } from "@/lib/server/devDocs";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { PageHeader } from "../../_ui";
import { NewPlanForm } from "./_NewPlanForm";

// Write a plan from the portal. It saves a real markdown file into
// `docs/development/plans/`, which is the same place the Library reads and the
// "What we're working on" board parses — so a plan written here shows up on the
// board immediately, ready to hand to a worker.
export const dynamic = "force-dynamic";

export default async function NewPlanPage() {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  if (!devDocsAccessible(session)) notFound();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link
        href="/portal/dev-team/roadmap?view=now"
        className="group inline-flex w-fit items-center gap-1 text-sm text-[color:var(--dt-muted)] transition-colors hover:text-[color:var(--dt-ink)]"
      >
        <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
        What we&apos;re working on
      </Link>

      <PageHeader
        icon={<FilePlus2 size={20} />}
        title="Write a plan"
        subtitle="Describe what you want. It saves as a real plan, lands on the board, and is ready to hand to a worker."
      />

      <NewPlanForm />
    </div>
  );
}
