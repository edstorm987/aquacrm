import type { ReactNode } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { requireRole } from "@/lib/server/auth";
import { AGENCY_ROLES, type Role } from "@/server/types";
import { devDocsAccessible } from "@/lib/server/devDocs";
import { ensureHydrated } from "@/server/storage";

import { PageHeader } from "../_ui";
import { InspectorClient, type Persona } from "./InspectorClient";

// Dev Team → Inspector. Founder + Dev Mode only — the same layered gate the
// dev-team layout + home assert, so it is unreachable in any production-like
// context. A card grid of the seeded demo POVs: clicking one switches the
// session into that persona (via the fenced /api/auth/dev-mode mint route) so
// Ed can see the whole app exactly as that role does, on safe demo data.

// Which demo persona an ACTIVE Dev Mode session is currently viewing as —
// mirrors the /portal role dispatch (and DevModeSwitcher's `currentPersona`).
function activePersonaFor(role: Role): Persona {
  if (role === "agency-staff") return "staff";
  if (role === "end-customer") return "customer";
  if (role === "freelancer") return "freelancer";
  return "owner";
}

export async function InspectorSection({ tabs }: { tabs?: ReactNode }) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole([...AGENCY_ROLES]);
  } catch {
    redirect("/portal");
  }
  if (!devDocsAccessible(session)) notFound();

  // `switch` needs an ACTIVE Dev Mode session (isDemo + a signed
  // devReturnAgencyId). When Ed is already hopping personas we switch straight
  // away and can flag which POV he is in; from his real founder session the
  // client `enter`s first to mint that capability.
  const active = Boolean(session.isDemo && session.devReturnAgencyId);
  const currentPersona = active ? activePersonaFor(session.role) : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/portal/dev-team"
          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-[color:var(--dt-muted)] transition-colors hover:text-[color:var(--dt-ink)]"
        >
          <span aria-hidden>←</span> Dev Team
        </Link>
        <PageHeader
          icon={<Users size={20} />}
        accent="inspector"
          title="Inspector"
          subtitle="Step into any role and look around — see exactly what they see."
          meta={tabs}
        />
      </div>

      <InspectorClient active={active} currentPersona={currentPersona} />
    </div>
  );
}
