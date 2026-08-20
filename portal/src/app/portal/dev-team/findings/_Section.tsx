import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { ScanEye } from "lucide-react";

import { requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { listFindings } from "@/lib/server/dev/devTeamFindings";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { PageHeader, Pill } from "../_ui";
import { FindingsWorkspace } from "./_FindingsWorkspace";

// Findings — the input side of the system.
//
// Everything else flows outward (plans → workers → board → docs); this is what
// flows IN. Use the app, spot something wrong, paste a screenshot, note it.
// Then pick the ones that belong together and turn them into a real plan, which
// lands on the board ready for a worker.

export async function FindingsSection({ tabs }: { tabs?: ReactNode }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  if (!devDocsAccessible(session)) notFound();

  const findings = await listFindings();
  const open = findings.filter(f => f.status === "open").length;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        icon={<ScanEye size={20} />}
        accent="findings"
        title="Findings"
        subtitle="Spot something wrong while using the app — screenshot it, note it, turn it into a plan."
        meta={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {tabs}
            {open > 0 ? <Pill tone="danger">{open} open</Pill> : <Pill tone="ok">All reviewed</Pill>}
          </div>
        }
      />
      <FindingsWorkspace initial={findings} />
    </div>
  );
}
