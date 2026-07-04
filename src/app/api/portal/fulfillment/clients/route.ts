// POST /api/portal/fulfillment/clients
//
// Backs the "+ New client" modal on the agency home
// (src/app/portal/agency/_NewClientButton.tsx). Creates a client under
// the caller's active agency via the canonical createClient() in
// @/server/tenants. Auth-required.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { createClient, getAgency } from "@/server/tenants";
import { getSessionFromRequest } from "@/lib/server/auth";
import { logActivity } from "@/server/activity";
import type { ClientStage } from "@/server/types";

interface Body {
  name?: string;
  slug?: string;
  ownerEmail?: string;
  stage?: ClientStage;
  brand?: { primaryColor?: string; logoUrl?: string };
  metadata?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  await ensureHydrated();

  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  const agencyId = session.activeAgencyId ?? session.agencyId;
  if (!agencyId || !getAgency(agencyId)) {
    return NextResponse.json({ ok: false, error: "no active agency" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  }

  try {
    const client = createClient(agencyId, {
      name,
      slug: body.slug?.trim() || undefined,
      ownerEmail: body.ownerEmail?.trim() || undefined,
      stage: body.stage,
      brand: body.brand?.primaryColor || body.brand?.logoUrl
        ? { primaryColor: body.brand.primaryColor, logoUrl: body.brand.logoUrl }
        : undefined,
      metadata: body.metadata,
    });

    logActivity({
      agencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "tenant",
      action: "create",
      message: `Created client "${client.name}".`,
      clientId: client.id,
    });

    return NextResponse.json({ ok: true, client: { id: client.id, name: client.name, slug: client.slug } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "create failed" },
      { status: 500 },
    );
  }
}
