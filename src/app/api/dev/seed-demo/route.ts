// Demo seed endpoint — dev-only.
//
// Stands up the Demo Agency + Felicia mirror via the shared
// `seedDemoAgency()` helper at `src/lib/server/demoSeed.ts`. The same
// helper backs the public `/demo` entry point so both flows produce
// identical state.
//
// Modes:
//   POST                  — idempotent seed (reuses existing demo tenant).
//   POST  ?reset=1        — wipe demo agency + descendants, then re-seed.
//   GET                   — list agencies (debug hint).
//   GET   ?reset=1        — wipe + re-seed without needing a JSON body.
//
// Gated on:
//   • `NEXT_PUBLIC_DEV_BYPASS=1` (any caller), OR
//   • An authenticated agency-owner / agency-manager session.

import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { getSession } from "@/lib/server/auth";
import { listAgencies } from "@/server/tenants";
import {
  DEMO_OWNER_EMAIL, DEMO_OWNER_PASSWORD,
  DEMO_CLIENT_EMAIL, DEMO_CLIENT_PASSWORD,
  DEMO_CUSTOMER_EMAIL, DEMO_CUSTOMER_PASSWORD,
  resetDemo, seedDemoAgency, listInstalledFor,
} from "@/lib/server/demoSeed";

async function gateAllowed(_req: NextRequest): Promise<{ ok: boolean; actor?: string }> {
  if (process.env.NEXT_PUBLIC_DEV_BYPASS === "1") return { ok: true };
  const session = await getSession();
  if (!session) return { ok: false };
  if (session.role === "agency-owner" || session.role === "agency-manager") {
    return { ok: true, actor: session.userId };
  }
  return { ok: false };
}

function isResetRequested(req: NextRequest): boolean {
  const v = req.nextUrl.searchParams.get("reset");
  return v === "1" || v === "true" || v === "yes";
}

async function performSeedFlow(req: NextRequest, actor?: string) {
  let resetSummary: Awaited<ReturnType<typeof resetDemo>> | null = null;
  if (isResetRequested(req)) {
    resetSummary = await resetDemo();
  }
  const seed = await seedDemoAgency(actor);

  return NextResponse.json({
    ok: true,
    reset: resetSummary,
    agency: { id: seed.agency.id, name: seed.agency.name, slug: seed.agency.slug },
    client: { id: seed.client.id, name: seed.client.name, stage: seed.client.stage },
    credentials: {
      owner: { email: DEMO_OWNER_EMAIL, password: DEMO_OWNER_PASSWORD, role: "agency-owner" },
      client: { email: DEMO_CLIENT_EMAIL, password: DEMO_CLIENT_PASSWORD, role: "client-owner" },
      customer: { email: DEMO_CUSTOMER_EMAIL, password: DEMO_CUSTOMER_PASSWORD, role: "end-customer", clientId: seed.client.id },
    },
    seededChecklist: seed.seededChecklist,
    installedClientPlugins: seed.installedClientPlugins,
    installedAgencyPlugins: seed.installedAgencyPlugins,
    installedScope: listInstalledFor({ agencyId: seed.agency.id, clientId: seed.client.id })
      .map(p => ({ pluginId: p.pluginId, enabled: p.enabled, agencyWide: !p.clientId })),
    bootstrapped: seed.bootstrapped,
    correlationId: crypto.randomBytes(4).toString("hex"),
  });
}

export async function POST(req: NextRequest) {
  await ensureHydrated();
  const gate = await gateAllowed(req);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  return performSeedFlow(req, gate.actor);
}

export async function GET(req: NextRequest) {
  await ensureHydrated();

  // GET ?reset=1 is also gated — wiping data must not be drive-by.
  if (isResetRequested(req)) {
    const gate = await gateAllowed(req);
    if (!gate.ok) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    return performSeedFlow(req, gate.actor);
  }

  const agencies = listAgencies();
  return NextResponse.json({
    ok: true,
    agencies: agencies.map(a => ({ id: a.id, slug: a.slug, name: a.name })),
    hint: "POST to seed Demo Agency + Felicia mirror. Append ?reset=1 to wipe + re-seed.",
  });
}
