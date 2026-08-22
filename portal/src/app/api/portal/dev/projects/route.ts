import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import {
  deleteDevProject,
  devProjectDeleteRefusal,
  devProjectMapStatus,
  getDevProject,
  listDevProjects,
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
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import type { DevProjectKind, DevProjectMasterTagView } from "@/server/types";

// Dev Editor Engine — projects API.
//
// A project binds {repo, ref, github/vercel connection ids, aqua tag, kind}.
// Founder + Dev Mode only, the same layered gate as every dev-team surface:
// role first, then `devDocsAccessible`. Connections are returned alongside so
// the engine's project form can offer the ones already in the vault without
// ever handling a secret itself.

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
};

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
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

export async function GET(request?: NextRequest) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    if (!devDocsAccessible(session)) {
      return NextResponse.json({ ok: false, error: "Dev Mode is required." }, { status: 403 });
    }
    const connections = listIntegrationConnections(session.agencyId);
    const masterTag = masterTagView(session.agencyId, request?.nextUrl?.origin);
    await flushPendingWrites();
    const projects = listDevProjects(session.agencyId);
    return NextResponse.json({
      ok: true,
      projects,
      // The tag itself, so the editor's Settings tab can create one, show the
      // snippet and bind it without leaving the editor. Public by design — the
      // site key ships in the page HTML of every tagged site.
      masterTag,
      // Mapped/tagged/what-is-missing, computed HERE so the rule has one
      // definition. A screen that re-derived "is the browser available" would
      // eventually disagree with the editor that acts on it.
      statuses: Object.fromEntries(projects.map(project => [project.id, devProjectMapStatus(project)])),
      // Browser-safe projections only (no encrypted secrets) — the engine shows
      // which connections exist so a project can be bound to one.
      githubConnections: connections.filter(c => c.provider === "github"),
      vercelConnections: connections.filter(c => c.provider === "vercel"),
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    if (!devDocsAccessible(session)) {
      return NextResponse.json({ ok: false, error: "Dev Mode is required." }, { status: 403 });
    }
    if (!validOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    }
    const body = await request.json().catch(() => null) as Body | null;
    if (!body?.action) return NextResponse.json({ ok: false, error: "Choose a project action." }, { status: 400 });

    if (body.action === "delete") {
      if (!body.id) return NextResponse.json({ ok: false, error: "Which project?" }, { status: 400 });
      // A parent that still contains projects refuses — and it must refuse
      // BEFORE the cleanup below, which is destructive: forgetting the AI key
      // and history first and THEN discovering the delete is refused would
      // leave a project that still exists stripped of its assistant. The
      // sentence names the children; it is the store's own, not a paraphrase.
      const refusal = devProjectDeleteRefusal(session.agencyId, body.id);
      if (refusal) return NextResponse.json({ ok: false, error: refusal }, { status: 400 });
      // Delete the project's Aqua Editor AI FIRST, while the project record is
      // still there to authorise the lookup. Its key is a real credential in
      // the vault; leaving it behind would outlive the only thing that could
      // ever have used it, which is a secret nobody is watching.
      forgetEditorAiForProject({
        agencyId: session.agencyId,
        projectId: body.id,
        actorUserId: session.userId,
        actorEmail: session.email,
      });
      // …and its conversation. The history is scoped to exactly this project,
      // so once the project is gone there is nothing that could ever read it
      // again — it would just be repository paths and unreleased copy sitting
      // in the blob with no route to reach them.
      forgetEditorAiHistoryForProject({ agencyId: session.agencyId, projectId: body.id });
      const removed = deleteDevProject(session.agencyId, body.id, session.userId);
      if (!removed) return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, projects: listDevProjects(session.agencyId) });
    }

    // MAP — Ed's one button. Walks the repository AND checks whether the Aqua
    // Tag really answers on the project's address, then records both.
    //
    // The master key comes from the SESSION's agency, never from the body: the
    // whole point is to confirm *their* tag, so a request cannot name a key and
    // have a page carrying it count as connected.
    if (body.action === "map") {
      if (!body.id) return NextResponse.json({ ok: false, error: "Which project?" }, { status: 400 });
      const project = getDevProject(session.agencyId, body.id);
      if (!project) return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });

      const masterSiteKey = ensureAgencyMasterSiteKey(session.agencyId);
      await flushPendingWrites();
      const map = await mapDevProject({
        agencyId: session.agencyId,
        project,
        masterSiteKey,
        actorUserId: session.userId,
      });
      const mapped = recordDevProjectMap({
        agencyId: session.agencyId,
        id: project.id,
        map,
        actorUserId: session.userId,
      });
      if (!mapped) return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });
      await flushPendingWrites();
      return NextResponse.json({
        ok: true,
        project: mapped,
        // The rule, computed once on the server so the screen and the editor
        // cannot disagree about whether the browser is available.
        status: devProjectMapStatus(mapped),
        projects: listDevProjects(session.agencyId),
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
    // SECURITY: the key is `ensureAgencyMasterSiteKey(session.agencyId)`. No
    // key, and no tag id, is ever read from the body — a request must not be
    // able to name a key, find a page carrying it, and call itself connected.
    if (body.action === "connect-tag") {
      if (!body.id) return NextResponse.json({ ok: false, error: "Which project?" }, { status: 400 });
      const existing = getDevProject(session.agencyId, body.id);
      if (!existing) return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });

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
            agencyId: session.agencyId,
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
            actorUserId: session.userId,
          });
        }
      }

      if (!project.siteUrl) {
        return NextResponse.json({ ok: false, error: "Add the address the tag is installed on, then check it." }, { status: 400 });
      }

      const masterSiteKey = ensureAgencyMasterSiteKey(session.agencyId);
      await flushPendingWrites();
      const tag = await mapProjectAquaTag({
        agencyId: session.agencyId,
        project,
        masterSiteKey,
        actorUserId: session.userId,
      });
      // Unreachable — `project.siteUrl` is non-empty, which is the only case
      // that returns undefined. Kept as a guard rather than a `!`.
      if (!tag) return NextResponse.json({ ok: false, error: "Add the address the tag is installed on, then check it." }, { status: 400 });

      const checked = recordDevProjectTagCheck({
        agencyId: session.agencyId,
        id: project.id,
        tag,
        actorUserId: session.userId,
      });
      if (!checked) return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });
      await flushPendingWrites();
      return NextResponse.json({
        ok: true,
        project: checked,
        status: devProjectMapStatus(checked),
        projects: listDevProjects(session.agencyId),
      });
    }

    // SAVE never accepts a tag id. `aquaTagId` is the browser gate, minted only
    // from the key a fetched page really carried (Map / Check it) — a save body
    // that could carry one was a spoofable browser unlock. Refused out loud
    // rather than silently dropped, so a caller that thinks it can set the gate
    // finds out; the earned value is preserved server-side when omitted.
    if (typeof body.aquaTagId === "string" && body.aquaTagId.trim()) {
      return NextResponse.json(
        { ok: false, error: "The Aqua Tag is connected by Map or Check it, never by a save — remove aquaTagId from the request." },
        { status: 400 },
      );
    }
    try {
      const project = saveDevProject({
        agencyId: session.agencyId,
        id: body.id,
        name: body.name ?? "",
        description: body.description,
        kind: body.kind,
        repository: body.repository,
        ref: body.ref,
        githubConnectionId: body.githubConnectionId,
        vercelConnectionId: body.vercelConnectionId,
        // Preserved, never accepted: whatever the last real check concluded.
        aquaTagId: body.id ? getDevProject(session.agencyId, body.id)?.aquaTagId : undefined,
        siteUrl: body.siteUrl,
        clientId: body.clientId,
        // Passed through as sent: omitted carries, "" clears, an id nests —
        // and every rule about it lives in the store, not here.
        parentProjectId: body.parentProjectId,
        actorUserId: session.userId,
      });
      await flushPendingWrites();
      return NextResponse.json({ ok: true, project, projects: listDevProjects(session.agencyId) });
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
    return authErrorResponse(error);
  }
}
