// /portal/agency/security — the threat centre (Phase 6).
//
// Owner-only. Shows the REAL positions of every shipped containment control,
// the durable action record, and — honestly — what the platform cannot see
// (BLIND items say so in plain words; nothing here fakes a green light).
// Actions are performed by the client panel against
// /api/portal/security/actions, which re-verifies the owner's password and a
// typed confirmation on EVERY action server-side — this page is presentation,
// never the gate.

import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { SecurityCentrePanel } from "./SecurityCentrePanel";

export const dynamic = "force-dynamic";

export default async function AgencySecurityPage() {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole("agency-owner");
  } catch {
    redirect("/portal");
  }
  if (session.publicShowcase) redirect("/portal/agency");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center gap-3">
        <ShieldAlert className="h-6 w-6 text-red-600" aria-hidden />
        <div>
          <h1 className="text-xl font-semibold">Security</h1>
          <p className="text-sm text-slate-600">
            Emergency controls and the record of who used them. Every action here asks for your
            password again and is written to a permanent record.
          </p>
        </div>
      </header>
      <SecurityCentrePanel />
    </main>
  );
}
