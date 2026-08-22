import "server-only";

import { BookText } from "lucide-react";

import { GlobalAdvisorDrawer } from "@/components/chrome/GlobalAdvisorDrawer";
import { LibrarianPanel } from "@/components/editing/LibrarianPanel";
import { fileFindingWorld } from "@/lib/server/dev/fileFinding";

// The LIBRARIAN — the Dev Team's assistant, and it is ITS OWN THING now.
//
// Ed (dev-editor-finish.md, phase 15): "the librarian also needs its own thing
// like what weve done for the aqua editor ui … its different from the editor
// since librarian is for files finding make it a skill they can all use as
// well". So, the same standalone treatment the Aqua Editor AI got in phase 12:
// its own identity and scope — the CODEBASE AND DOCS, not the agency business
// snapshot.
//
// v1 of this file was honest about being a reskin: it mounted the Advisor's
// chat over `buildAssistantBusinessContext` and admitted the codebase/docs
// retrieval bridge was "a follow-up that was never built". THAT BRIDGE NOW
// EXISTS, and this control consumes it:
//
//   • the SKILL — `src/lib/server/dev/fileFinding.ts` (`findFiles`, built once
//     for ANY assistant; `fileFindingWorld` is the pre-question brief);
//   • the SURFACE — `LibrarianPanel` (`src/components/editing/`), the find
//     panel this drawer and Dev mode in the editor both mount;
//   • the DOOR — `/api/portal/dev/librarian`, gated role → Dev Mode → origin,
//     scoped to the SESSION's agency.
//
// The Librarian FINDS; the Aqua Editor AI EDITS. No business context, no
// Advisor chat, no `/api/assistant`: the briefing is the skill's own view of
// the world (docs, reference pages, this agency's projects), and the answer to
// a question is ranked hits with their WHY — not prose.
//
// What is REUSED is the drawer machinery: `GlobalAdvisorDrawer`'s trigger +
// side panel (its `body` seam exists for exactly this), so the Topbar still
// never falls through to the full-page /portal/agency/assistant link (the
// "full page + glitches back to agency" bug), and the assistant-picker seam
// (`pickerHeader`) is still where a future picker of Dev-Team assistants
// lives.
export async function LibrarianDrawerControl({
  agencyId,
}: {
  agencyId: string;
  /** Accepted so the layout's call keeps working; the find tool is not per-person. */
  userId?: string;
  userName?: string;
}) {
  // The skill's view of the world — what the Librarian can see BEFORE any
  // question: local, network-free, tenant-scoped. This replaced the business
  // snapshot (`buildAssistantBusinessContext`) as the briefing.
  const world = await fileFindingWorld(agencyId);
  return (
    <GlobalAdvisorDrawer
      assistantName="Librarian"
      label="Librarian"
      icon={<BookText size={16} />}
      // Shipyard-themed trigger: reads the --dev-* tokens so the button belongs
      // to the yard rather than the agency's black/white chrome.
      buttonClassName="mm-has-attention-badge relative inline-flex size-9 items-center justify-center gap-2 overflow-visible rounded-md border border-[color:var(--dev-line)] bg-[color:var(--dev-surface-raised)] text-[color:var(--dev-ink-muted)] transition hover:bg-[color:var(--dev-surface)] hover:text-[color:var(--dev-ink)] xl:w-auto xl:px-3"
      pickerHeader={
        <div className="flex items-center gap-2 border-b border-[color:var(--dev-line)] bg-[color:var(--dev-surface)] py-3 pl-4 pr-14 text-[color:var(--dev-ink)]">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[color:var(--dev-accent-soft)] text-[color:var(--dev-accent)]">
            <BookText size={15} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-tight">Librarian</span>
            <span className="block truncate text-[11px] text-[color:var(--dev-ink-muted)]">Finds files, docs and symbols</span>
          </span>
        </div>
      }
      // The Librarian's own surface via the drawer's body seam — the find
      // panel, on the editor's dark panel ground so one panel wears one set of
      // clothes in both hosts (never `--dt-*` tokens).
      body={
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#141614] p-4">
          <LibrarianPanel
            projects={world.projects.map(project => ({ id: project.id, name: project.name, repo: project.repo }))}
            world={{ docsTotal: world.docs.total, referencePages: world.reference.pages }}
          />
        </div>
      }
    />
  );
}
