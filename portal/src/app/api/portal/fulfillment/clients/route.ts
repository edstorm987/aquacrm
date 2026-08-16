// POST /api/portal/fulfillment/clients
//
// Backs the "+ New client" modal on the agency home
// (src/app/portal/agency/_NewClientButton.tsx). Creates a client under
// the caller's active agency via the canonical createClient() in
// @/server/tenants. Auth-required.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated, getState, mutate } from "@/server/storage";
import { createClient, getAgency } from "@/server/tenants";
import { getSessionFromRequest } from "@/lib/server/auth";
import { logActivity } from "@/server/activity";
import { setupClientStarterPortal, type ClientPortalSetupResult } from "@/server/clientPortalSetup";
import { customerPortalProvisioningMetadata } from "@/lib/server/customerPortalProvisioning";
import { createClientDelight } from "@/server/clientDelight";
import type { ClientStage } from "@/server/types";
import { getTradingCompany } from "@/server/tradingCompanies";

interface Body {
  name?: string;
  slug?: string;
  ownerEmail?: string;
  companyId?: string;
  createPortal?: boolean;
  stage?: ClientStage;
  brand?: { primaryColor?: string; logoUrl?: string };
  metadata?: Record<string, unknown>;
  starterPortal?: {
    phase?: string;
    planTier?: string;
    contactName?: string;
    businessName?: string;
    onboardingStartedAt?: string;
  };
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
    const beforeCreate = structuredClone(getState());
    const suppliedMetadata = body.metadata ?? {};
    const createPortal = body.createPortal === true;
    const companyId = body.companyId?.trim();
    if (companyId && !getTradingCompany(agencyId, companyId)) {
      return NextResponse.json({ ok: false, error: "client-facing brand not found" }, { status: 400 });
    }
    const client = createClient(agencyId, {
      name,
      slug: body.slug?.trim() || undefined,
      ownerEmail: body.ownerEmail?.trim() || undefined,
      stage: body.stage,
      companyId: companyId || undefined,
      brand: body.brand?.primaryColor || body.brand?.logoUrl
        ? { primaryColor: body.brand.primaryColor, logoUrl: body.brand.logoUrl }
        : undefined,
      metadata: {
        ...suppliedMetadata,
        portalRequired: createPortal,
        ...(createPortal
          ? customerPortalProvisioningMetadata({
              clientName: name,
              contactName: body.starterPortal?.contactName
                ?? (typeof suppliedMetadata.contactName === "string" ? suppliedMetadata.contactName : undefined),
              email: body.ownerEmail,
              servicePlan: body.starterPortal?.planTier
                ?? (typeof suppliedMetadata.planTier === "string" ? suppliedMetadata.planTier : undefined),
            })
          : {}),
      },
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

    let portalSetup: ClientPortalSetupResult | null = null;
    if (createPortal) {
      portalSetup = await setupClientStarterPortal({
        agencyId,
        clientId: client.id,
        actor: session.userId,
        metadata: {
          phase: body.starterPortal?.phase,
          planTier: body.starterPortal?.planTier,
          therapistName: body.starterPortal?.contactName,
          practiceName: body.starterPortal?.businessName,
          onboardingStartedAt: body.starterPortal?.onboardingStartedAt,
        },
      });
      if (!portalSetup.ok) {
        mutate(state => {
          state.agencies = beforeCreate.agencies;
          state.clients = beforeCreate.clients;
          state.endCustomers = beforeCreate.endCustomers;
          state.users = beforeCreate.users;
          state.pluginInstalls = beforeCreate.pluginInstalls;
          state.pluginData = beforeCreate.pluginData;
          state.phases = beforeCreate.phases;
          state.activity = beforeCreate.activity;
          state.clientRecordLedger = beforeCreate.clientRecordLedger;
          state.pipelines = beforeCreate.pipelines;
          state.pipelineCards = beforeCreate.pipelineCards;
        });
        return NextResponse.json(
          { ok: false, error: `client portal setup failed: ${portalSetup.error}` },
          { status: 500 },
        );
      }
    }

    const welcomePackItems = Array.isArray(suppliedMetadata.welcomePackItems)
      ? suppliedMetadata.welcomePackItems.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean).slice(0, 30)
      : [];
    if (welcomePackItems.length) {
      const welcomePackNotes = typeof suppliedMetadata.welcomePackNotes === "string"
        ? suppliedMetadata.welcomePackNotes.trim()
        : "";
      createClientDelight(agencyId, {
        clientId: client.id,
        recipientName: client.name,
        occasion: "welcome",
        title: "Client welcome pack",
        status: "planned",
        notes: [...welcomePackItems.map(item => `• ${item}`), welcomePackNotes].filter(Boolean).join("\n"),
      }, session.userId);
    }

    return NextResponse.json({
      ok: true,
      client: { id: client.id, name: client.name, slug: client.slug },
      portalSetup,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "create failed" },
      { status: 500 },
    );
  }
}
