import "server-only";

import { BookText } from "lucide-react";

import { GlobalAdvisorDrawer } from "@/components/chrome/GlobalAdvisorDrawer";
import { buildAssistantBusinessContext } from "@/lib/server/assistants/assistantBusinessContext";
import { getAssistantWorkspace } from "@/lib/server/assistants/assistantStore";
import { assistantModel, isAssistantConfigured } from "@/lib/server/assistants/openaiAssistant";
import { getCachedBusinessIssueRadar } from "@/engines/data/server/radar/businessIssueRadar";
import { radarDigest } from "@/engines/data/radar/businessRadar";

// The LIBRARIAN — the Dev Team's assistant. It is a RESKIN of the agency
// Advisor (`AdvisorDrawerControl`): the SAME AI engine and the SAME side-panel
// drawer (`GlobalAdvisorDrawer`), NOT a full-page navigation. Giving the Dev
// Team layout its own `advisorControl` is what stops the Topbar falling through
// to the full-page `/portal/agency/assistant` link (the "full page + glitches
// back to agency" bug).
//
// Entry #1 in a future assistant LIBRARY: press the Librarian → later a picker
// of Dev-Team assistants (Auditor, portal/website/security creators…), each the
// same engine with a different skin + scope. The picker lives in the drawer's
// `pickerHeader` seam below; here we render only the Librarian header, and the
// architecture is ready for the picker without building the other assistants.
//
// v1 scope (honest): the Librarian REUSES the existing assistant business
// context so it works today, and is relabelled + rescoped in the chrome
// ("ask the codebase"). Wiring a distinct codebase/docs RETRIEVAL bridge (so it
// answers "where does X live / what can I reuse" from the repo, not business
// records) is a follow-up — see docs/development/plans/dev-team-librarian-and-assistants.md.
export async function LibrarianDrawerControl({
  agencyId,
  userId,
  userName,
}: {
  agencyId: string;
  userId: string;
  userName: string;
}) {
  const context = buildAssistantBusinessContext(agencyId);
  const radar = await getCachedBusinessIssueRadar(agencyId);
  return (
    <GlobalAdvisorDrawer
      initialWorkspace={getAssistantWorkspace(agencyId, userId)}
      configured={isAssistantConfigured(agencyId)}
      model={assistantModel(agencyId)}
      userName={userName}
      assistantName="Librarian"
      label="Librarian"
      icon={<BookText size={16} />}
      // Shipyard-themed trigger: reads the --dev-* tokens so the button belongs
      // to the yard rather than the agency's black/white chrome.
      buttonClassName="mm-has-attention-badge relative inline-flex size-9 items-center justify-center gap-2 overflow-visible rounded-md border border-[color:var(--dev-line)] bg-[color:var(--dev-surface-raised)] text-[color:var(--dev-ink-muted)] transition hover:bg-[color:var(--dev-surface)] hover:text-[color:var(--dev-ink)] xl:w-auto xl:px-3"
      pickerHeader={
        <div className="flex items-center gap-2 border-b border-[color:var(--dev-line)] bg-[color:var(--dev-surface)] px-4 py-3 text-[color:var(--dev-ink)]">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[color:var(--dev-accent-soft)] text-[color:var(--dev-accent)]">
            <BookText size={15} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-tight">Librarian</span>
            <span className="block truncate text-[11px] text-[color:var(--dev-ink-muted)]">Ask the codebase</span>
          </span>
        </div>
      }
      coverage={{
        clients: context.summary.clients.length,
        team: context.summary.team.length,
        pipelines: context.summary.pipelines.length,
        recentActivity: context.summary.recentActivity.length,
        modules: Object.keys(context.summary.businessModules),
        radar: radarDigest(radar),
      }}
    />
  );
}
