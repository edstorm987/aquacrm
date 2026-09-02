// GET/POST /api/portal/fulfillment/clients
//
// Backs the "+ New client" modal on the agency home
// (src/app/portal/agency/_NewClientButton.tsx). Creates a client under
// the caller's active agency through the resumable fulfillment lifecycle.

import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getAgency, listClients } from "@/server/tenants";
import { authErrorResponse } from "@/lib/server/auth/auth";
import { setupClientStarterPortal, type ClientPortalSetupResult } from "@/server/clientPortalSetup";
import { customerPortalProvisioningMetadata } from "@/lib/server/clients/customerPortalProvisioning";
import { createClientDelight } from "@/server/clientDelight";
import type { ClientStage } from "@/server/types";
import { getTradingCompany } from "@/server/tradingCompanies";
import { getInstall } from "@/server/pluginInstalls";
import { PortalFormValidationError } from "@/lib/forms/portalFormValues";
import {
  ClientLifecycleOperationConflictError,
  ClientLifecyclePhaseNotFoundError,
  createClientWithLifecycleOperation,
} from "@/lib/server/clients/clientLifecycle";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";

interface Body {
  operationId?: string;
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

export async function GET() {
  try {
    await ensureHydrated();
    const { actor } = await requireCurrentWorkspaceElementAccess("fulfilment", "fulfilment.services", "view");
    const agencyId = actor.resourceAgencyId;
    if (!getAgency(agencyId)) {
      return NextResponse.json({ ok: false, error: "no active agency" }, { status: 403 });
    }
    return NextResponse.json({ ok: true, clients: listClients(agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  await ensureHydrated();

  let current;
  try {
    current = await requireCurrentWorkspaceElementAccess("fulfilment", "fulfilment.services", "manage");
  } catch (error) {
    return authErrorResponse(error);
  }
  const session = current.actor.session;
  const agencyId = current.actor.resourceAgencyId;
  if (!getAgency(agencyId)) {
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
  const suppliedOperationId = typeof body.operationId === "string" ? body.operationId.trim() : "";
  const operationId = suppliedOperationId || `new-client:${randomUUID()}`;

  try {
    const suppliedMetadata = body.metadata ?? {};
    const createPortal = body.createPortal === true;
    const requestedStage = typeof body.stage === "string" ? body.stage.trim() : "";
    const fulfillmentInstall = getInstall({ agencyId }, "fulfillment");
    const configuredStage = typeof fulfillmentInstall?.config.defaultStage === "string"
      ? fulfillmentInstall.config.defaultStage.trim()
      : "";
    const stage = (requestedStage || configuredStage || "aqua-epic-intro") as ClientStage;
    const companyId = body.companyId?.trim();
    if (companyId && !getTradingCompany(agencyId, companyId)) {
      return NextResponse.json({ ok: false, error: "client-facing brand not found" }, { status: 400 });
    }
    const metadata = {
      ...suppliedMetadata,
      customFields: suppliedMetadata.customFields ?? {},
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
    };
    const creation = await createClientWithLifecycleOperation({
      agencyId,
      actor: session.userId,
      operationId,
      createInput: {
        name,
        slug: body.slug?.trim() || undefined,
        ownerEmail: body.ownerEmail?.trim() || undefined,
        stage,
        companyId: companyId || undefined,
        brand: body.brand?.primaryColor || body.brand?.logoUrl
          ? { primaryColor: body.brand.primaryColor, logoUrl: body.brand.logoUrl }
          : undefined,
        metadata,
      },
      requestFingerprint: {
        name,
        slug: body.slug?.trim() || undefined,
        ownerEmail: body.ownerEmail?.trim().toLowerCase() || undefined,
        stage,
        companyId: companyId || undefined,
        brand: body.brand,
        metadata,
        createPortal,
        starterPortal: body.starterPortal,
      },
    });
    const client = creation.client;
    if (!creation.ok) {
      return NextResponse.json({
        ok: false,
        operationId,
        error: creation.error ?? "Client lifecycle setup is incomplete.",
        code: "client_lifecycle_incomplete",
        client: { id: client.id, name: client.name, slug: client.slug },
        lifecycle: creation.lifecycle,
        retryable: true,
      }, { status: 503 });
    }

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
        return NextResponse.json(
          {
            ok: false,
            operationId,
            error: `Client created, but customer portal setup is incomplete: ${portalSetup.error}`,
            code: "client_portal_setup_incomplete",
            client: { id: client.id, name: client.name, slug: client.slug },
            retryable: true,
          },
          { status: 503 },
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
        idempotencyKey: `new-client-welcome:${operationId}`,
        clientId: client.id,
        recipientName: client.name,
        occasion: "welcome",
        title: "Client welcome pack",
        status: "planned",
        notes: [...welcomePackItems.map(item => `• ${item}`), welcomePackNotes].filter(Boolean).join("\n"),
      }, session.userId);
    }

    await flushPendingWrites();

    return NextResponse.json({
      ok: true,
      operationId,
      client: { id: client.id, name: client.name, slug: client.slug },
      portalSetup,
      lifecycle: creation.lifecycle,
      replayed: creation.replayed,
    }, { status: creation.replayed ? 200 : 201 });
  } catch (err) {
    if (err instanceof PortalFormValidationError) {
      return NextResponse.json(
        { ok: false, operationId, error: err.message, fieldId: err.fieldId },
        { status: 422 },
      );
    }
    if (err instanceof ClientLifecyclePhaseNotFoundError) {
      return NextResponse.json({ ok: false, operationId, error: err.message, code: "phase_not_found" }, { status: 409 });
    }
    if (err instanceof ClientLifecycleOperationConflictError) {
      return NextResponse.json({ ok: false, operationId, error: err.message, code: "operation_conflict" }, { status: 409 });
    }
    return NextResponse.json(
      { ok: false, operationId, error: err instanceof Error ? err.message : "create failed" },
      { status: 500 },
    );
  }
}
