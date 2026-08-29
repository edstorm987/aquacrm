// R019 Goal C — shared resolver for foundation customer sub-routes.
//
// Each of /portal/customer/{orders,account,bookings,membership,affiliate}
// renders this same helper with a distinct config. Behaviour:
//   1. Resolve the install for `pluginId`.
//   2. When active + has a canonical customer route → redirect there.
//   3. When active + no customer surface yet → "coming soon" card.
//   4. When missing → "not available yet — ask your provider" friendly card.

import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureHydrated } from "@/server/storage";
import { requireRole } from "@/lib/server/auth/auth";
import { getInstall } from "@/server/pluginInstalls";
import { CUSTOMER_PORTAL_ROLES } from "@/server/types";

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
  const session = await requireRole([...CUSTOMER_PORTAL_ROLES]);
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
        body={cfg.notExposedCopy ?? `${cfg.pluginLabel} is being prepared for your account.`}
      >
        <Link href="/portal/customer" className="text-sm text-brand hover:underline">
          Back to home
        </Link>
      </FallbackCard>
    );
  }

  return (
    <FallbackCard
      testid={cfg.testid}
      heading={`${cfg.heading} — not available yet`}
      body={`${cfg.pluginLabel} is not available in this account yet. Ask the team if you expected access.`}
    >
      <Link href="/portal/customer" className="text-sm text-brand hover:underline">
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
