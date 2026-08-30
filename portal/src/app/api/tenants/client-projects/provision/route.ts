import { NextResponse } from "next/server";

import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import {
  CLIENT_PROJECT_STARTERS,
  planClientProject,
  provisionClientProject,
  slugifyProject,
  type ClientProjectStarterId,
} from "@/lib/server/clients/clientProjectProvisioner";
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

type Body = {
  clientId?: string;
  projectName?: string;
  starterId?: string;
};

type StoredProperty = {
  id: string;
  label: string;
  kind: "website";
  status: "building";
  localPath: string;
  projectSlug: string;
  starterId: string;
  repositoryStatus: "local";
  deploymentStatus: "not-deployed";
  initialCommit: string;
  provisionedAt: number;
  updatedAt: number;
};

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    if (!validOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    }
    const body = await request.json().catch(() => null) as Body | null;
    const clientId = body?.clientId?.trim();
    const projectName = body?.projectName?.trim();
    const starterId = body?.starterId?.trim();
    if (!clientId || !projectName || !starterId) {
      return NextResponse.json({ ok: false, error: "Client, project name and starter are required." }, { status: 400 });
    }
    if (!Object.prototype.hasOwnProperty.call(CLIENT_PROJECT_STARTERS, starterId)) {
      return NextResponse.json({ ok: false, error: "Choose an installed project starter." }, { status: 400 });
    }

    const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.systems", "manage");
    if (process.env.VERCEL === "1") {
      return NextResponse.json({
        ok: false,
        error: "Create project files from the AquaCRM local workspace, then publish them with the connected GitHub account.",
      }, { status: 409 });
    }
    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });

    const metadata = (client.metadata ?? {}) as {
      clientEmail?: string;
      properties?: StoredProperty[];
    };
    // Record the intended slug/folder/property id BEFORE the folder exists, so a
    // retry after a lost save re-enters that folder instead of minting a `-2`
    // sibling and orphaning the first one.
    const operationKey = clientProjectOperationKey(
      "provision",
      session.agencyId,
      clientId,
      slugifyProject(projectName),
    );
    const resumable = resumableClientProjectOperation(operationKey);
    // Only a folder this operation actually BUILT is adopted, because adopting
    // deletes and rebuilds it. A merely-intended path (the attempt never got as
    // far as `record`, so `provisionClientProject` already cleaned up after
    // itself) may since have been claimed by another project.
    const adoptable = resumable?.status === "external-created" ? resumable : undefined;
    const plan = planClientProject({
      clientName: client.name,
      clientSlug: client.slug,
      projectName,
      adopt: adoptable
        ? { propertyId: adoptable.propertyId, projectSlug: adoptable.projectSlug, localPath: adoptable.localPath }
        : undefined,
    });
    const operation = await beginClientProjectOperation({
      key: operationKey,
      kind: "provision",
      agencyId: session.agencyId,
      clientId,
      intent: { propertyId: plan.propertyId, projectSlug: plan.projectSlug, localPath: plan.localPath },
    });

    let workspace;
    try {
      workspace = provisionClientProject({
        clientId,
        clientName: client.name,
        clientSlug: client.slug,
        clientEmail: metadata.clientEmail ?? client.ownerEmail,
        projectName,
        starterId: starterId as ClientProjectStarterId,
        aquaOrigin: process.env.PORTAL_PUBLIC_ORIGIN?.trim() || new URL(request.url).origin,
        propertyId: plan.propertyId,
      }, plan);
      // Record what was actually built, not what was merely planned: the
      // provisioner steps aside onto a fresh suffix if the planned name was
      // taken in the meantime, and the retry must adopt the real folder.
      await operation.record({
        propertyId: workspace.propertyId,
        projectSlug: workspace.projectSlug,
        localPath: workspace.localPath,
        initialCommit: workspace.initialCommit,
      });
    } catch (error) {
      await operation.fail(error);
      throw error;
    }
    const property: StoredProperty = {
      id: workspace.propertyId,
      label: projectName,
      kind: "website",
      status: "building",
      localPath: workspace.localPath,
      projectSlug: workspace.projectSlug,
      starterId: workspace.starterId,
      repositoryStatus: "local",
      deploymentStatus: "not-deployed",
      initialCommit: workspace.initialCommit,
      provisionedAt: workspace.createdAt,
      updatedAt: workspace.createdAt,
    };
    const existingProperties = (Array.isArray(metadata.properties) ? metadata.properties : [])
      .filter(item => item.id !== property.id);
    const properties = [property, ...existingProperties];
    if (!updateClient(session.agencyId, clientId, { metadata: { properties } })) {
      await operation.fail(new Error("Project record could not be saved."));
      return NextResponse.json({ ok: false, error: "Project record could not be saved." }, { status: 500 });
    }
    logActivity({
      agencyId: session.agencyId,
      clientId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "tenant",
      action: "client.project_provisioned",
      message: `Provisioned local project "${projectName}".`,
      metadata: { propertyId: property.id, projectSlug: property.projectSlug, starterId: property.starterId },
    });
    await operation.succeed();
    await flushPendingWrites();
    return NextResponse.json({ ok: true, property, properties, workspace });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project provisioning failed.";
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
