import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { SquarePen } from "lucide-react";

import { requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { appConfigEditAdapter, appConfigFieldViews } from "@/lib/server/editing/appConfigAdapter";
import { getAgency } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { ensureHydrated } from "@/server/storage";
import { EmptyState, PageHeader, Panel, Pill } from "../_ui";
import { AppConfigEditor } from "./_AppConfigEditor";

// Editor — the app editing itself. The website and portal editors change what
// Aqua publishes; this changes Aqua. It runs on the same shared editing loop
// (`map → plan → publish` in `@/engines/editor/editing/engine`) as those editors, through
// the `appConfigEditAdapter`, so it inherits the dry run, the before/after diff,
// the per-field conflict check and the explicit-confirm rule rather than
// re-implementing any of them.
//
// v1 scope is agency-scoped app CONFIG: the brand kit (colours, fonts, logo,
// radius) and the safe workspace identity settings. Source files, the sidebar
// layout and anything needing a git write are deliberately out — they need Ed's
// decision and a write policy that does not exist yet.
//
// Founder + Dev Mode only, the same layered gate as the layout and every other
// section: role first, then `devDocsAccessible`. The API route asserts it again
// — a gate on the page alone protects the screen, not the write.

export async function EditorSection({ tabs }: { tabs?: ReactNode }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  if (!devDocsAccessible(session)) notFound();

  // The one and only source of the tenant being edited. Never a route param,
  // never a request body — the session decides, on the page and in the route.
  const agencyId = session.agencyId;
  const agency = getAgency(agencyId);

  // Read-only pass over the same adapter the write path uses, so what the form
  // shows and what the engine plans against can never drift apart.
  const editDocument = await appConfigEditAdapter({ agencyId, actorUserId: session.userId }).map();
  const fields = appConfigFieldViews(editDocument);
  const inDevMode = Boolean(session.devReturnAgencyId);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        icon={<SquarePen size={20} />}
        title="Editor"
        subtitle="Edit AquaCRM itself — the same edit-preview-publish loop as Dev Editor Engine everywhere else."
        meta={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {tabs}
            <Pill tone="accent">{fields.length} settings</Pill>
          </div>
        }
      />

      <Panel
        title="Editing"
        hint="Every change on this page is scoped to this workspace and nothing else."
        right={inDevMode ? <Pill tone="warn">Dev Mode · fenced demo tenant</Pill> : <Pill tone="ok">Live workspace</Pill>}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-base font-medium text-[color:var(--dt-ink)]">{agency?.name ?? "Unknown workspace"}</span>
          <code className="rounded bg-[color:var(--dt-hairline)] px-1.5 py-0.5 font-mono text-[11px] text-[color:var(--dt-muted)]">{agencyId}</code>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[color:var(--dt-faint)]">
          {inDevMode
            ? "You are in Dev Mode, so this writes to the fenced demo tenant — not your real workspace. Exit Dev Mode to edit the live one."
            : "This writes to your real workspace. Preview first; nothing is saved until you apply."}
        </p>
      </Panel>

      {!agency ? (
        <Panel title="Settings">
          <EmptyState>
            This workspace has no configuration to edit — the agency record could not be read.
          </EmptyState>
        </Panel>
      ) : (
        <AppConfigEditor fields={fields} revision={editDocument.revision} documentLabel={editDocument.label} />
      )}

      <p className="text-[11px] leading-relaxed text-[color:var(--dt-faint)]">
        Brand values are written to <code className="text-[color:var(--dt-faint)]">Agency.brand</code> and identity values to the
        agency workspace settings, through{" "}
        <code className="text-[color:var(--dt-faint)]">runEdits</code> with an explicit confirm. Raw custom CSS, numeric finance
        defaults, source files and the sidebar layout are deliberately not editable here.
      </p>
    </div>
  );
}
