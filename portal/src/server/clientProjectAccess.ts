import "server-only";

// Giving a CLIENT their own build workspace — the one place that decides it.
//
// Ed's model, 2026-08-27:
//
//   "internal workspace we make it when we get a client, and this will allow us
//    to edit their portal as standard… if we attach a website product or
//    service, or just toggle it on, then the client will receive access to a
//    dev team — but they cannot edit our internal CRM portal, just the project
//    we attach to them, e.g. a website."
//
// Two audiences, one rule each:
//
//   • The AGENCY works in `/portal/clients/<id>` — the internal workspace,
//     created with the client, from which staff edit that client's portal.
//     Nothing here touches that; it is internal by construction.
//   • The CLIENT gets exactly one thing: the project attached to them. Never
//     the agency's workspace, never another client's project, and never
//     AquaCRM's own CRM.
//
// The load-bearing fact this module is built on: the access ceiling
// (`userCanReachScope`) only lets a client role reach a project whose
// `clientId` is their own. A grant written for a project that is NOT attached
// to the client is inert — it resolves to `resource_ownership` and confers
// nothing. So attachment is checked HERE, loudly, rather than being discovered
// later as a grant that mysteriously does nothing.

import {
  AccessControlError,
  createAccessGrant,
  listAccessGrants,
  revokeAccessGrant,
} from "@/server/accessControl";
import { getState } from "@/server/storage";
import { listUsersForClient } from "@/server/users";
import type { AccessCapability, AccessEnvironment, AccessGrant, DevProject } from "@/server/types";

/**
 * What "the client can work on their own website" means by default.
 *
 * Deliberately NOT included, because each is either a cost, a production
 * reach, or a local-machine control that means nothing to a client:
 *   • `project.publish` / `project.pull-request` / `project.deploy` — shipping
 *     stays a decision the agency makes.
 *   • `project.ai` / `element.development.ai.*` — the Editor AI runs on the
 *     project's own paid key.
 *   • `dev.project.run_local` / `dev.project.logs` — the supervised preview is
 *     a local-development tool and is refused in production anyway.
 *   • `element.development.explorer.*` — source exploration is a separate,
 *     deliberately granted lens.
 *
 * Any of those can still be granted to a specific client on purpose; they are
 * simply not what "attach a website" hands over.
 */
export const CLIENT_PROJECT_EDITOR_CAPABILITIES: readonly AccessCapability[] = [
  "project.view",
  "project.edit",
  "element.project.editor.view",
  "element.project.editor.use",
  "element.development.code.view",
  "element.development.code.use",
  "element.development.preview.view",
] as const;

/** Product template keys that mean "there is something to build for them". */
export const BUILDABLE_PORTAL_TEMPLATE_KEYS = ["website", "custom-software"] as const;

export interface ClientProjectAccessInput {
  agencyId: string;
  clientId: string;
  projectId: string;
  /** Who is doing the granting — their own authority is what gets delegated. */
  actorUserId: string;
  environment?: AccessEnvironment;
  /** Defaults to CLIENT_PROJECT_EDITOR_CAPABILITIES. */
  capabilities?: readonly AccessCapability[];
  reason?: string;
  now?: number;
}

/** The projects attached to this client — the only ones they may ever reach. */
export function clientAttachedProjects(agencyId: string, clientId: string): DevProject[] {
  return Object.values(getState().devProjects)
    .filter(project => project.agencyId === agencyId && project.clientId === clientId);
}

/**
 * The people who ARE this client: its owner and staff.
 *
 * End-customers are deliberately excluded. They are the client's customers,
 * not the client, and handing them a build workspace is a different decision
 * with a different audience.
 */
export function clientWorkspacePeople(clientId: string) {
  return listUsersForClient(clientId)
    .filter(user => user.role === "client-owner" || user.role === "client-staff");
}

function assertProjectAttached(input: ClientProjectAccessInput): DevProject {
  const project = getState().devProjects[input.projectId];
  // Tenant first, exactly like every other project lookup, so a foreign id and
  // an invented one answer the same way.
  if (!project || project.agencyId !== input.agencyId) {
    throw new AccessControlError(404, "dev_project_not_found");
  }
  if (project.clientId !== input.clientId) {
    // The honest error: not "forbidden", but "this is not theirs to be given".
    // Without the attachment the grant would be silently inert.
    throw new AccessControlError(
      409,
      "project_not_attached_to_client",
      "Attach the project to this client before giving the client access to it.",
    );
  }
  return project;
}

export interface ClientProjectAccessResult {
  project: DevProject;
  grants: AccessGrant[];
  /** People who are this client but have no account yet get no grant. */
  peopleWithoutAccounts: number;
}

/**
 * Give this client's own people access to exactly this project.
 *
 * Idempotent: `createAccessGrant` collapses an identical live grant, so calling
 * this again after a second product is attached does not multiply grants.
 */
export async function grantClientProjectAccess(
  input: ClientProjectAccessInput,
): Promise<ClientProjectAccessResult> {
  const project = assertProjectAttached(input);
  const environment = input.environment ?? "live";
  const capabilities = [...(input.capabilities ?? CLIENT_PROJECT_EDITOR_CAPABILITIES)];
  const people = clientWorkspacePeople(input.clientId);

  const grants: AccessGrant[] = [];
  for (const person of people) {
    grants.push(await createAccessGrant({
      agencyId: input.agencyId,
      actorUserId: input.actorUserId,
      userId: person.id,
      // The ONLY scope this module ever writes. Never agency, never client,
      // never workspace: a client's authority is one project at a time.
      scope: { kind: "project", id: project.id },
      environment,
      capabilities,
      reason: input.reason ?? `Client access to ${project.name}`,
      idempotencyKey: `client-project:${input.clientId}:${project.id}:${person.id}:${environment}`,
      now: input.now,
    }));
  }

  return {
    project,
    grants,
    peopleWithoutAccounts: people.length === 0 ? 1 : 0,
  };
}

/**
 * Take it back — the toggle going off, or the product being detached.
 *
 * Revokes only the project-scoped grants this module could have written, so a
 * separately granted capability (an agency deciding to give one client AI, say)
 * is not silently swept up with it.
 */
export async function revokeClientProjectAccess(input: {
  agencyId: string;
  clientId: string;
  projectId: string;
  actorUserId: string;
  reason?: string;
  now?: number;
}): Promise<AccessGrant[]> {
  const people = new Set(clientWorkspacePeople(input.clientId).map(person => person.id));
  const revoked: AccessGrant[] = [];
  for (const grant of listAccessGrants(input.agencyId)) {
    if (grant.revokedAt !== undefined) continue;
    if (!people.has(grant.userId)) continue;
    if (grant.scope.kind !== "project" || grant.scope.id !== input.projectId) continue;
    revoked.push(await revokeAccessGrant({
      agencyId: input.agencyId,
      actorUserId: input.actorUserId,
      grantId: grant.id,
      reason: input.reason ?? "Client project access withdrawn",
      now: input.now,
    }));
  }
  return revoked;
}
