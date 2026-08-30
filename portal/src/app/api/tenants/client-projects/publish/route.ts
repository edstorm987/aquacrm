import { NextResponse } from "next/server";

import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { publishProjectToGitHub } from "@/lib/server/integrations/githubProjectPublisher";
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
  repoUrl?: string;
  repositoryStatus?: "not-created" | "local" | "connected";
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
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.systems", "manage");
    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return NextResponse.json({ ok: false, error: "Client not found." }, { status: 404 });
    const metadata = (client.metadata ?? {}) as { properties?: StoredProperty[] };
    const current = Array.isArray(metadata.properties) ? metadata.properties : [];
    const property = current.find(item => item.id === propertyId);
    if (!property) return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    if (!property.localPath || !property.projectSlug) {
      return NextResponse.json({ ok: false, error: "Provision this project locally before publishing it." }, { status: 400 });
    }

    // A repository this operation already created is adopted rather than
    // re-created: the create call is the one step GitHub will not let us repeat.
    const operationKey = clientProjectOperationKey("publish", session.agencyId, clientId, propertyId);
    const resumable = resumableClientProjectOperation(operationKey);
    const operation = await beginClientProjectOperation({
      key: operationKey,
      kind: "publish",
      agencyId: session.agencyId,
      clientId,
      intent: { propertyId, projectSlug: property.projectSlug, localPath: property.localPath },
    });

    let repository;
    try {
      repository = await publishProjectToGitHub({
        agencyId: session.agencyId,
        clientId,
        localPath: property.localPath,
        projectSlug: property.projectSlug,
        description: `${client.name}: ${property.label}`,
        private: true,
        adoptRepository: resumable?.repoFullName ? { fullName: resumable.repoFullName } : undefined,
        onRepositoryCreated: created => operation.record({
          repoOwner: created.owner,
          repoFullName: created.fullName,
          repoUrl: created.repoUrl,
          cloneUrl: created.cloneUrl,
        }).then(() => undefined),
      });
    } catch (error) {
      await operation.fail(error);
      throw error;
    }
    const changed: StoredProperty = {
      ...property,
      repoUrl: repository.repoUrl,
      repositoryStatus: "connected",
      updatedAt: Date.now(),
    };
    const properties = current.map(item => item.id === propertyId ? changed : item);
    if (!updateClient(session.agencyId, clientId, { metadata: { properties } })) {
      await operation.fail(new Error("Repository record could not be saved."));
      return NextResponse.json({ ok: false, error: "Repository record could not be saved." }, { status: 500 });
    }
    logActivity({
      agencyId: session.agencyId,
      clientId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "tenant",
      action: "client.project_published",
      message: `Published "${property.label}" to a private GitHub repository.`,
      metadata: { propertyId, repoUrl: repository.repoUrl },
    });
    await operation.succeed();
    await flushPendingWrites();
    return NextResponse.json({ ok: true, property: changed, properties, repository });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Repository publishing failed.";
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
