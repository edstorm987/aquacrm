import { NextResponse, type NextRequest } from "next/server";

import { routeTenantScope } from "@/lib/server/portal/apiTenantScope";
import {
  AccessControlError,
  accessErrorResponse,
  actorHasAccessCapability,
  requireCurrentAccessActor,
} from "@/server/accessControl";
import {
  deleteDevProject,
  devProjectDeleteRefusal,
  devProjectMapStatus,
  getDevProject,
  listDevProjects,
  normalizeRepository,
  normalizeProjectSiteUrl,
  recordDevProjectMap,
  recordDevProjectTagCheck,
  saveDevProject,
} from "@/engines/editor/server/devProjects";
import { forgetEditorAiForProject } from "@/engines/editor/server/editorAi";
import { forgetEditorAiHistoryForProject } from "@/engines/editor/server/editorAiHistory";
import { mapDevProject, mapProjectAquaTag } from "@/engines/editor/server/mapProject";
import { ensureAgencyMasterSiteKey, masterTagSnippet } from "@/server/websiteSources";
import { connectionLinkOrigin } from "@/lib/server/portal/portalConnections";
import { isPubliclyReachableOrigin } from "@/lib/public/publicOrigin";
import { listIntegrationConnections } from "@/lib/server/integrations/integrationConnections";
import { flushPendingWrites } from "@/server/storage";
import type { AccessCapability, DevProject, DevProjectKind, DevProjectMasterTagView } from "@/server/types";
import { devPathScope, scopeOnlyNarrows } from "@/lib/server/dev/devPathScope";

// Dev Editor Engine — projects API.
//
// A project binds {repo, ref, github/vercel connection ids, aqua tag, kind}.
// Project authority is resolved from canonical per-resource grants. The owner
// baseline preserves founder behaviour, while every non-owner sees only exact
// projects carrying `project.view`. Browser-safe connection projections and
// the master tag are withheld until at least one visible project is manageable.

type Body = {
  action?: "save" | "delete" | "map" | "connect-tag";
  id?: string;
  name?: string;
  description?: string;
  kind?: DevProjectKind;
  repository?: string;
  ref?: string;
  githubConnectionId?: string;
  vercelConnectionId?: string;
  aquaTagId?: string;
  siteUrl?: string;
  clientId?: string;
  /**
   * Nesting (Ed's two levels): omitted = carried by the server, "" = top
   * level on purpose, an id = inside that project. The STORE holds the rules;
   * this route only translates its refusals.
   */
  parentProjectId?: string | null;
  /** Repo-relative files/folders this project exposes. `[]` = the whole repo. */
  allowedPaths?: string[];
};

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

type AccessActor = Awaited<ReturnType<typeof requireCurrentAccessActor>>;

function actorHas(
  actor: AccessActor,
  scope: { kind: "project" | "workspace"; id: string },
  capability: AccessCapability,
): boolean {
  return actorHasAccessCapability(actor, scope, capability);
}

/**
 * Repository identity is a governance boundary, not an ordinary project edit.
 * A scoped staff/freelancer/customer grant may maintain the branch of the
 * repository already assigned to the project, but only agency governance may
 * point the project at a different repository or saved credential.
 */
function canRebindProjectConnection(actor: AccessActor): boolean {
  return actor.user.role === "agency-owner" || actor.user.role === "agency-manager";
}

function requireActorCapabilities(
  actor: AccessActor,
  scope: { kind: "project" | "workspace"; id: string },
  capabilities: readonly AccessCapability[],
): void {
  for (const capability of capabilities) {
    if (!actorHas(actor, scope, capability)) {
      throw new AccessControlError(403, "access_capability_required", capability);
    }
  }
}

function visibleProjects(actor: AccessActor): DevProject[] {
  return listDevProjects(actor.resourceAgencyId).filter(project => (
    actorHas(actor, { kind: "project", id: project.id }, "project.view")
  ));
}

function normalizedRef(value: string | undefined): string {
  return (value ?? "").trim().slice(0, 120) || "main";
}

function normalizedConnectionId(value: string | undefined): string | undefined {
  return value?.trim().slice(0, 120) || undefined;
}

/**
 * The agency's Aqua Tag, ready to paste.
 *
 * `ensureAgencyMasterSiteKey` is CREATE-or-GET in one call and idempotent: it
 * mints the key the first time anybody asks and returns the same one forever
 * after, because the tag is already sitting in other people's deployed HTML and
 * rotating it would silently break every install. That is why asking for it
 * from a listing is safe — and why the editor's Settings tab can offer "make me
 * a tag" without a separate create step.
 *
 * The key comes from the SESSION's agency. Nothing in a request body can name a
 * key, here or in the check below.
 */
function masterTagView(agencyId: string, requestOrigin: string | undefined): DevProjectMasterTagView {
  const siteKey = ensureAgencyMasterSiteKey(agencyId);
  const origin = connectionLinkOrigin(requestOrigin).replace(/\/+$/, "");
  return {
    siteKey,
    snippet: masterTagSnippet(origin, siteKey),
    scriptUrl: `${origin}/aqua-tag.js`,
    origin,
    // Not "is the env var set?" — locally it IS set, to localhost, which is
    // precisely when the snippet is a dud. See `isPubliclyReachableOrigin`.
    originIsFallback: !isPubliclyReachableOrigin(origin),
  };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireCurrentAccessActor();
    const projects = visibleProjects(actor);
    const canManageAny = projects.some(project => (
      actorHas(actor, { kind: "project", id: project.id }, "project.manage")
    ));
    const connectionManagedProjects = projects.filter(project => (
      actorHas(actor, { kind: "project", id: project.id }, "project.connection.manage")
    ));
    const canManageConnections = connectionManagedProjects.length > 0;
    const managedFields = canManageAny
      ? { masterTag: masterTagView(actor.resourceAgencyId, request.nextUrl.origin) }
      : {};
    const connectionFields = canManageConnections ? (() => {
      const connections = listIntegrationConnections(actor.resourceAgencyId);
      // Agency owner/manager governance is the only authority over the whole
      // catalogue.
      // A delegated project connection manager receives metadata only for
      // connections already bound to one of the exact projects they manage.
      // This prevents Project A from becoming a connection-directory oracle
      // for Project B (and from selecting its credential by id).
      const boundIds = new Set(connectionManagedProjects.flatMap(project => [
        project.githubConnectionId,
        project.vercelConnectionId,
      ].filter((id): id is string => Boolean(id))));
      const authorized = canRebindProjectConnection(actor)
        ? connections
        : connections.filter(connection => boundIds.has(connection.id));
      return {
        connectionManagedProjectIds: connectionManagedProjects.map(project => project.id),
        githubConnections: authorized.filter(connection => connection.provider === "github"),
        vercelConnections: authorized.filter(connection => connection.provider === "vercel"),
      };
    })() : {};
    if (canManageAny || canManageConnections) await flushPendingWrites();
    return NextResponse.json({
      ok: true,
      projects,
      // Mapped/tagged/what-is-missing, computed HERE so the rule has one
      // definition. A screen that re-derived "is the browser available" would
      // eventually disagree with the editor that acts on it.
      statuses: Object.fromEntries(projects.map(project => [project.id, devProjectMapStatus(project)])),
      ...managedFields,
      ...connectionFields,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return accessErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCurrentAccessActor();
    if (!validOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    }
    const body = await request.json().catch(() => null) as Body | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "Choose a project action." }, { status: 400 });

    if (body.action === "delete") {
      if (!body.id) return NextResponse.json({ ok: false, error: "Which project?" }, { status: 400 });
      const existing = getDevProject(actor.resourceAgencyId, body.id);
      if (!existing) return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });
      requireActorCapabilities(actor, { kind: "project", id: existing.id }, [
        "project.manage",
        "element.project.overview.manage",
      ]);
      // A parent that still contains projects refuses — and it must refuse
      // BEFORE the cleanup below, which is destructive: forgetting the AI key
      // and history first and THEN discovering the delete is refused would
      // leave a project that still exists stripped of its assistant. The
      // sentence names the children; it is the store's own, not a paraphrase.
      const refusal = devProjectDeleteRefusal(actor.resourceAgencyId, body.id);
      if (refusal) return NextResponse.json({ ok: false, error: refusal }, { status: 400 });
      // Delete the project's Aqua Editor AI FIRST, while the project record is
      // still there to authorise the lookup. Its key is a real credential in
      // the vault; leaving it behind would outlive the only thing that could
      // ever have used it, which is a secret nobody is watching.
      forgetEditorAiForProject({
        agencyId: actor.resourceAgencyId,
        projectId: body.id,
        actorUserId: actor.user.id,
        actorEmail: actor.user.email,
      });
      // …and its conversation. The history is scoped to exactly this project,
      // so once the project is gone there is nothing that could ever read it
      // again — it would just be repository paths and unreleased copy sitting
      // in the blob with no route to reach them.
      forgetEditorAiHistoryForProject({ agencyId: actor.resourceAgencyId, projectId: body.id });
      const removed = deleteDevProject(actor.resourceAgencyId, body.id, actor.user.id);
      if (!removed) return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, projects: visibleProjects(actor) });
    }

    // MAP — Ed's one button. Walks the repository AND checks whether the Aqua
    // Tag really answers on the project's address, then records both.
    //
    // The master key comes from the SESSION's agency, never from the body: the
    // whole point is to confirm *their* tag, so a request cannot name a key and
    // have a page carrying it count as connected.
    if (body.action === "map") {
      if (!body.id) return NextResponse.json({ ok: false, error: "Which project?" }, { status: 400 });
      const project = getDevProject(actor.resourceAgencyId, body.id);
      if (!project) return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });
      requireActorCapabilities(actor, { kind: "project", id: project.id }, [
        "project.manage",
        "element.development.preview.manage",
      ]);

      const masterSiteKey = ensureAgencyMasterSiteKey(actor.resourceAgencyId);
      await flushPendingWrites();
      const map = await mapDevProject({
        agencyId: actor.resourceAgencyId,
        project,
        masterSiteKey,
        actorUserId: actor.user.id,
      }, { allowSharedCredentials: actor.user.role === "agency-owner" });
      const mapped = recordDevProjectMap({
        agencyId: actor.resourceAgencyId,
        id: project.id,
        map,
        actorUserId: actor.user.id,
      });
      if (!mapped) return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });
      await flushPendingWrites();
      return NextResponse.json({
        ok: true,
        project: mapped,
        // The rule, computed once on the server so the screen and the editor
        // cannot disagree about whether the browser is available.
        status: devProjectMapStatus(mapped),
        projects: visibleProjects(actor),
      });
    }

    // CONNECT THE TAG — "I have pasted the snippet, is it answering yet?"
    //
    // The whole loop from inside the editor's Settings tab: take the address,
    // make sure this agency HAS a tag key, fetch the page the way a visitor
    // would, and bind the tag to the project if — and only if — the page really
    // came back carrying that key.
    //
    // Deliberately NOT a second detector and NOT a second gate:
    // `mapProjectAquaTag` is Map's own tag half (redirects followed, `finalUrl`
    // recorded) and `recordDevProjectTagCheck` mints the id through the same
    // rule a full Map uses. The only thing this skips is the repository walk,
    // which has nothing to do with whether a tag answers and can take a while
    // on a large repo.
    //
    // SECURITY: the key is `ensureAgencyMasterSiteKey(actor.resourceAgencyId)`. No
    // key, and no tag id, is ever read from the body — a request must not be
    // able to name a key, find a page carrying it, and call itself connected.
    if (body.action === "connect-tag") {
      if (!body.id) return NextResponse.json({ ok: false, error: "Which project?" }, { status: 400 });
      const existing = getDevProject(actor.resourceAgencyId, body.id);
      if (!existing) return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });
      requireActorCapabilities(actor, { kind: "project", id: existing.id }, [
        "project.manage",
        "element.development.preview.manage",
      ]);

      // An address sent with the press is saved first, so what gets checked and
      // what gets stored are the same string — a check against an address the
      // project does not hold would be unrepeatable.
      let project = existing;
      if (typeof body.siteUrl === "string" && body.siteUrl.trim()) {
        const siteUrl = normalizeProjectSiteUrl(body.siteUrl);
        if (!siteUrl) {
          return NextResponse.json({ ok: false, error: "That address can't be loaded — use an http or https website address." }, { status: 400 });
        }
        if (siteUrl !== existing.siteUrl) {
          project = saveDevProject({
            agencyId: actor.resourceAgencyId,
            id: existing.id,
            name: existing.name,
            description: existing.description,
            kind: existing.kind,
            repository: existing.repository,
            ref: existing.ref,
            githubConnectionId: existing.githubConnectionId,
            vercelConnectionId: existing.vercelConnectionId,
            // Carried, not accepted from the body: a project keeps whatever the
            // last real check concluded until this one concludes otherwise.
            aquaTagId: existing.aquaTagId,
            siteUrl,
            clientId: existing.clientId,
            // Carried too (undefined would also carry — this says it out loud):
            // checking a tag must never move a project out of its parent.
            parentProjectId: existing.parentProjectId,
            actorUserId: actor.user.id,
          });
        }
      }

      if (!project.siteUrl) {
        return NextResponse.json({ ok: false, error: "Add the address the tag is installed on, then check it." }, { status: 400 });
      }

      const masterSiteKey = ensureAgencyMasterSiteKey(actor.resourceAgencyId);
      await flushPendingWrites();
      const tag = await mapProjectAquaTag({
        agencyId: actor.resourceAgencyId,
        project,
        masterSiteKey,
        actorUserId: actor.user.id,
      });
      // Unreachable — `project.siteUrl` is non-empty, which is the only case
      // that returns undefined. Kept as a guard rather than a `!`.
      if (!tag) return NextResponse.json({ ok: false, error: "Add the address the tag is installed on, then check it." }, { status: 400 });

      const checked = recordDevProjectTagCheck({
        agencyId: actor.resourceAgencyId,
        id: project.id,
        tag,
        actorUserId: actor.user.id,
      });
      if (!checked) return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });
      await flushPendingWrites();
      return NextResponse.json({
        ok: true,
        project: checked,
        status: devProjectMapStatus(checked),
        projects: visibleProjects(actor),
      });
    }

    // SAVE never accepts a tag id. `aquaTagId` is the browser gate, minted only
    // from the key a fetched page really carried (Map / Check it) — a save body
    // that could carry one was a spoofable browser unlock. Refused out loud
    // rather than silently dropped, so a caller that thinks it can set the gate
    // finds out; the earned value is preserved server-side when omitted.
    let existing: DevProject | null = null;
    if (body.id) {
      existing = getDevProject(actor.resourceAgencyId, body.id);
      if (!existing) return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 400 });
      requireActorCapabilities(actor, { kind: "project", id: existing.id }, [
        "project.manage",
        "element.project.overview.manage",
      ]);
      const nextRepository = body.repository === undefined
        ? existing.repository
        : normalizeRepository(body.repository);
      const nextRef = body.ref === undefined ? existing.ref : normalizedRef(body.ref);
      const nextGitHubConnectionId = body.githubConnectionId === undefined
        ? existing.githubConnectionId
        : normalizedConnectionId(body.githubConnectionId);
      const nextVercelConnectionId = body.vercelConnectionId === undefined
        ? existing.vercelConnectionId
        : normalizedConnectionId(body.vercelConnectionId);
      const repositoryChanged = nextRepository !== existing.repository;
      const refChanged = nextRef !== existing.ref;
      const githubConnectionChanged = nextGitHubConnectionId !== existing.githubConnectionId;
      const vercelConnectionChanged = nextVercelConnectionId !== existing.vercelConnectionId;
      // WIDENING the exposed file surface is the same kind of decision as
      // pointing the project at another repository, so it answers to the same
      // capability. NARROWING costs nothing: somebody tightening a scope in a
      // hurry must never be stopped by a permission check.
      const widensPathScope = body.allowedPaths !== undefined
        && !scopeOnlyNarrows(
          devPathScope(existing.allowedPaths),
          devPathScope(Array.isArray(body.allowedPaths) ? body.allowedPaths : []),
        );
      if (repositoryChanged || refChanged || githubConnectionChanged || vercelConnectionChanged || widensPathScope) {
        requireActorCapabilities(actor, { kind: "project", id: existing.id }, [
          "project.connection.manage",
        ]);
      }
      if (
        (repositoryChanged || githubConnectionChanged || vercelConnectionChanged)
        && !canRebindProjectConnection(actor)
      ) {
        throw new AccessControlError(
          403,
          "project_connection_rebind_governance_required",
          "Only an agency owner or manager can point a project at a different repository or saved connection.",
        );
      }
    } else {
      requireActorCapabilities(actor, { kind: "workspace", id: "development" }, [
        "workspace.manage",
      ]);
      const requestsConnectionBinding = Boolean(normalizeRepository(body.repository))
        || normalizedRef(body.ref) !== "main"
        || Boolean(normalizedConnectionId(body.githubConnectionId))
        || Boolean(normalizedConnectionId(body.vercelConnectionId));
      if (requestsConnectionBinding && !canRebindProjectConnection(actor)) {
        throw new AccessControlError(403, "access_capability_required", "project.connection.manage");
      }
    }
    if (typeof body.aquaTagId === "string" && body.aquaTagId.trim()) {
      return NextResponse.json(
        { ok: false, error: "The Aqua Tag is connected by Map or Check it, never by a save — remove aquaTagId from the request." },
        { status: 400 },
      );
    }
    const requestedClientId = body.clientId?.trim() ?? "";
    const clientScope = routeTenantScope(actor.session, { clientId: requestedClientId });
    if (requestedClientId && !clientScope.client) {
      return NextResponse.json({ ok: false, error: "That client could not be found." }, { status: 404 });
    }
    try {
      const project = saveDevProject({
        agencyId: actor.resourceAgencyId,
        id: body.id,
        name: body.name ?? existing?.name ?? "",
        description: body.description,
        kind: body.kind,
        repository: body.repository === undefined ? existing?.repository : body.repository,
        ref: body.ref === undefined ? existing?.ref : body.ref,
        githubConnectionId: body.githubConnectionId === undefined ? existing?.githubConnectionId : body.githubConnectionId,
        vercelConnectionId: body.vercelConnectionId === undefined ? existing?.vercelConnectionId : body.vercelConnectionId,
        // Preserved, never accepted: whatever the last real check concluded.
        aquaTagId: body.id ? getDevProject(actor.resourceAgencyId, body.id)?.aquaTagId : undefined,
        siteUrl: body.siteUrl,
        // A project may be pinned to a client. The id arrives in the body, so
        // it is proven to be this agency's before it is stored — otherwise a
        // save would file the project under a stranger's client.
        clientId: clientScope.clientId,
        // Passed through as sent: omitted carries, "" clears, an id nests —
        // and every rule about it lives in the store, not here.
        parentProjectId: body.parentProjectId,
        // WHAT THIS PROJECT EXPOSES. Omitted carries the stored scope; an empty
        // array is an explicit "expose the whole repository". The two must stay
        // distinguishable, or an unrelated save would silently unlock the repo.
        //
        // Requires the same authority as rebinding the repository: widening the
        // surface and pointing the project at a different repository are the
        // same kind of decision, and the narrower capability set should not be
        // able to do either.
        allowedPaths: Array.isArray(body.allowedPaths)
          ? body.allowedPaths.filter((value: unknown): value is string => typeof value === "string")
          : undefined,
        actorUserId: actor.user.id,
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, project, projects: visibleProjects(actor) });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const message = code === "integration_not_found"
        ? "That saved connection could not be found."
        : code.startsWith("connection_provider_mismatch:")
          ? `That connection is not a ${code.split(":")[1]} connection.`
          : code === "project_not_found"
            ? "That project could not be found."
            // The nesting refusals, in the same translate-the-code style. The
            // first one covers a foreign parent id and an invented one alike —
            // deliberately the same sentence, so probing ids teaches nothing.
            : code === "parent_project_not_found"
              ? "That parent project could not be found."
              : code.startsWith("parent_is_child:")
                ? `Projects go two levels deep only — "${code.slice("parent_is_child:".length)}" is already inside another project, so nothing can be created inside it.`
                : code === "project_has_children_cannot_nest"
                  ? "This project contains projects of its own, so it can't be moved inside another one — two levels only."
                  : code === "project_cannot_contain_itself"
                    ? "A project can't be placed inside itself."
                    : code || "That project could not be saved.";
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
  } catch (error) {
    return accessErrorResponse(error);
  }
}
