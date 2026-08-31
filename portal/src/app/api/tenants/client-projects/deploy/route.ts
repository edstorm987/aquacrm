import { NextResponse } from "next/server";

import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { deployProjectPreviewToVercel } from "@/lib/server/integrations/vercelProjectDeployer";
import { logActivity } from "@/server/activity";
import {
  beginClientProjectOperation,
  clientProjectOperationKey,
  resumableClientProjectOperation,
} from "@/server/clientProjectOperations";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

type Body = { clientId?: string; propertyId?: string };
type StoredProperty = {
  id: string;
  label: string;
  localPath?: string;
  projectSlug?: string;
  previewUrl?: string;
  vercelProject?: string;
  vercelDeploymentId?: string;
  deploymentReadyState?: string;
  deploymentStatus?: "not-deployed" | "preview" | "production";
  lastDeployedAt?: number;
  updatedAt: number;
  [key: string]: unknown;
};

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    if (!validOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    }
    const body = await request.json().catch(() => null) as Body | null;
    const clientId = body?.clientId?.trim();
    const propertyId = body?.propertyId?.trim();
    if (!clientId || !propertyId) {
      return NextResponse.json({ ok: false, error: "Client and project are required." }, { status: 400 });
    }

    const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    // Tenancy first, then permission (404, not 403) — see api/tenants/close-deal/route.ts.
    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.systems", "manage");
    const metadata = (client.metadata ?? {}) as { properties?: StoredProperty[] };
    const current = Array.isArray(metadata.properties) ? metadata.properties : [];
    const property = current.find(item => item.id === propertyId);
    if (!property) return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    if (!property.localPath || !property.projectSlug) {
      return NextResponse.json({ ok: false, error: "Provision this project locally before deploying it." }, { status: 400 });
    }

    // A deployment this operation already created is read back rather than
    // stacked: an unrecorded preview is otherwise invisible to Aqua forever.
    const operationKey = clientProjectOperationKey("deploy", session.agencyId, clientId, propertyId);
    const resumable = resumableClientProjectOperation(operationKey);
    const operation = await beginClientProjectOperation({
      key: operationKey,
      kind: "deploy",
      agencyId: session.agencyId,
      clientId,
      intent: { propertyId, projectSlug: property.projectSlug, localPath: property.localPath },
    });

    let deployment;
    try {
      deployment = await deployProjectPreviewToVercel({
        agencyId: session.agencyId,
        clientId,
        localPath: property.localPath,
        projectSlug: property.projectSlug,
        adoptDeploymentId: resumable?.deploymentId,
        onDeploymentCreated: created => operation.record({
          deploymentId: created.deploymentId,
          previewUrl: created.previewUrl,
        }).then(() => undefined),
      });
    } catch (error) {
      await operation.fail(error);
      throw error;
    }
    const changed: StoredProperty = {
      ...property,
      previewUrl: deployment.previewUrl,
      vercelProject: deployment.projectName,
      vercelDeploymentId: deployment.deploymentId,
      deploymentReadyState: deployment.readyState,
      deploymentStatus: "preview",
      lastDeployedAt: deployment.createdAt,
      updatedAt: Date.now(),
    };
    const properties = current.map(item => item.id === propertyId ? changed : item);
    if (!updateClient(session.agencyId, clientId, { metadata: { properties } })) {
      await operation.fail(new Error("Deployment record could not be saved."));
      return NextResponse.json({ ok: false, error: "Deployment record could not be saved." }, { status: 500 });
    }
    logActivity({
      agencyId: session.agencyId,
      clientId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "tenant",
      action: "client.project_deployed",
      message: `Created a Vercel review deployment for "${property.label}".`,
      metadata: { propertyId, previewUrl: deployment.previewUrl, deploymentId: deployment.deploymentId },
    });
    await operation.succeed();
    await flushPendingWrites();
    return NextResponse.json({ ok: true, property: changed, properties, deployment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview deployment failed.";
    if (!(error instanceof Error) || error.name !== "AuthError") {
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
    return authErrorResponse(error);
  }
}

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
