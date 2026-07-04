// R019 Goal C — shared resolver for foundation customer sub-routes.
//
// Each of /portal/customer/{orders,account,bookings,membership,affiliate}
// renders this same helper with a distinct config. Behaviour:
//   1. Resolve the install for `pluginId`.
//   2. When enabled + has a canonical customer route → redirect there.
//   3. When enabled + no customer surface yet → "configured but not exposed" card.
//   4. When missing → "not enabled — ask your provider" friendly card.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth";
import { getInstall } from "@/server/pluginInstalls";

export interface SubrouteConfig {
  pluginId: string;
  pluginLabel: string;
  redirectTo?: string;
  notExposedCopy?: string;
  testid: string;
  heading: string;
}

export async function CustomerSubroute({ cfg }: { cfg: SubrouteConfig }) {
  await ensureHydrated();
  const session = await requireRole("end-customer");
  if (!session.clientId) {
    return <FallbackCard testid={cfg.testid} heading="Account scope missing" body="Your session isn't tied to a client." />;
  }

  const install = getInstall(
    { agencyId: session.agencyId, clientId: session.clientId },
    cfg.pluginId,
  );

  if (install?.enabled && cfg.redirectTo) {
    redirect(cfg.redirectTo);
  }

  if (install?.enabled) {
    return (
      <FallbackCard
        testid={cfg.testid}
        heading={cfg.heading}
        body={cfg.notExposedCopy ?? `${cfg.pluginLabel} is enabled but doesn't yet expose a customer surface here.`}
      >
        <Link href="/portal/customer" className="text-sm text-[color:var(--brand-primary,#0EA5A4)] hover:underline">
          Back to home
        </Link>
      </FallbackCard>
    );
  }

  return (
    <FallbackCard
      testid={cfg.testid}
      heading={`${cfg.heading} — not enabled`}
      body={`This client hasn't enabled ${cfg.pluginLabel} yet. Ask the team if you expected access.`}
    >
      <Link href="/portal/customer" className="text-sm text-[color:var(--brand-primary,#0EA5A4)] hover:underline">
        Back to home
      </Link>
    </FallbackCard>
  );
}

function FallbackCard({
  testid,
  heading,
  body,
  children,
}: {
  testid: string;
  heading: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div data-testid={testid} role="status" className="rounded-lg border border-dashed border-black/15 bg-white/60 p-6">
      <h1 className="text-lg font-semibold tracking-tight text-black/90">{heading}</h1>
      <p className="mt-1 text-sm text-black/60">{body}</p>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
