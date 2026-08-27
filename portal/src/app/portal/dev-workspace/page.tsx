import Link from "next/link";
import { ArrowRight, Code2, FolderGit2, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { listDevProjects } from "@/engines/editor/server/devProjects";
import { requireCurrentAccessActor, resolveActorAccess } from "@/server/accessControl";

export const dynamic = "force-dynamic";

export default async function DevWorkspacePage() {
  let actor: Awaited<ReturnType<typeof requireCurrentAccessActor>>;
  try {
    actor = await requireCurrentAccessActor();
  } catch {
    redirect("/login?next=/portal/dev-workspace");
  }

  const projects = listDevProjects(actor.resourceAgencyId).flatMap(project => {
    const resolution = resolveActorAccess(actor, { kind: "project", id: project.id });
    return resolution.capabilities.includes("project.view")
      ? [{ project, resolution }]
      : [];
  });

  return (
    <main className="min-h-dvh bg-[#f3f5f2] text-black/85">
      <header className="border-b border-black/10 bg-white/80 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-11 place-items-center rounded-lg bg-[#10231c] text-emerald-200"><Code2 size={20} /></span>
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-800">AquaCRM · governed workspace</p><h1 className="mt-0.5 text-xl font-semibold">Dev Workspace</h1></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actor.environment === "sandbox" ? <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900">Sandbox data</span> : null}
            <Link href="/portal" className="inline-flex min-h-10 items-center rounded-md border border-black/10 bg-white px-3 text-sm font-semibold text-black/65 hover:bg-black/[0.03]">Back to my portal</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800"><ShieldCheck size={15} /> Project-scoped access</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Only the projects shared with you.</h2>
          <p className="mt-3 text-sm leading-6 text-black/55">Each card is resolved from your current person, project and {actor.environment} environment. A role is only a preset; the project grant is the authority.</p>
        </div>

        {projects.length ? (
          <section aria-label="My development projects" className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map(({ project, resolution }) => {
              const editorVisible = resolution.capabilities.includes("element.project.editor.view");
              return (
                <article key={project.id} className="flex min-h-56 flex-col rounded-xl border border-black/10 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span aria-hidden className="grid size-10 place-items-center rounded-lg bg-emerald-50 text-emerald-800"><FolderGit2 size={18} /></span>
                    <span className="rounded-full bg-black/[0.045] px-2.5 py-1 text-[10px] font-semibold uppercase text-black/45">{project.kind}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{project.name}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-black/50">{project.description || "A project workspace with access controlled independently from the wider CRM."}</p>
                  <div className="mt-auto pt-5">
                    {editorVisible ? (
                      <Link href={`/portal/dev-workspace/${encodeURIComponent(project.id)}`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#10231c] px-4 text-sm font-semibold text-white hover:bg-[#183428]">Open workspace <ArrowRight size={15} /></Link>
                    ) : (
                      <Link href={`/portal/dev-workspace/${encodeURIComponent(project.id)}`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-950">Request editor element <ArrowRight size={15} /></Link>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="mt-8 rounded-xl border border-dashed border-black/15 bg-white/60 p-7 text-center sm:p-10">
            <FolderGit2 className="mx-auto text-black/20" size={28} />
            <h3 className="mt-4 text-lg font-semibold">No projects have been shared with you.</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-black/50">An owner can assign one from Settings → Roles and access. If you received an exact project link, open it to submit a permission request without gaining access first.</p>
          </section>
        )}
      </div>
    </main>
  );
}
