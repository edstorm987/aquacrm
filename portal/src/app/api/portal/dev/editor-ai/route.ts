import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import {
  clearEditorAiToken,
  editorAiReason,
  editorAiStatus,
  saveEditorAiConfig,
  setEditorAiToken,
} from "@/engines/editor/server/editorAi";
import { integrationVaultAvailable } from "@/lib/server/integrations/integrationConnections";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";

// ─── AQUA EDITOR AI — the configuration API ──────────────────────────────────
//
// Sets, changes and clears ONE project's assistant: its own key, its own model,
// its own brief. Separate route from `/api/portal/dev/projects` because it
// handles a SECRET and that route does not — the projects endpoint answers a
// GET with whole `DevProject` records, and nothing about a credential should
// ever be one refactor away from that response.
//
// ── POST only. On purpose. ───────────────────────────────────────────────────
//
// There is no GET here at all, including for the harmless half. A GET is the
// thing that gets logged with its query string, cached by an intermediary,
// prefetched by a browser and pasted into a bug report, and the safest way to
// guarantee a token never appears in one is for the route that knows about
// tokens to have no GET to widen. Reading the state is `action: "status"` — a
// POST that mutates nothing and returns the client-safe view.
//
// ── What comes back ──────────────────────────────────────────────────────────
//
// `EditorAiStatus` and nothing else: configured / model / masked tail / brief.
// The key is never echoed, not even on the request that just set it — an
// operator confirming a paste is exactly the moment a value would end up in a
// screenshot.
//
// ── The gate ─────────────────────────────────────────────────────────────────
//
// The same layered gate as every dev-team surface: role first, then Dev Mode,
// then origin. The tenant check is one layer deeper still — `editorAi` resolves
// every project through `getDevProject(session.agencyId, id)`, so a project id
// from another agency is a 404 here and can never reach a vault lookup.

type Body = {
  action?: "status" | "save" | "set-token" | "clear-token";
  projectId?: string;
  model?: string;
  instructions?: string;
  /** Write-only. Read back out of the body, used, and never returned. */
  apiKey?: string;
};

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function failure(error: unknown): NextResponse {
  const code = error instanceof Error ? error.message : "";
  if (code === "project_required") {
    return NextResponse.json({ ok: false, error: "Which project?" }, { status: 400 });
  }
  if (code === "project_not_found") {
    return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });
  }
  if (code === "token_required") {
    return NextResponse.json({ ok: false, error: "Paste the key for Aqua Editor AI." }, { status: 400 });
  }
  if (code === "vault_not_configured") {
    return NextResponse.json({ ok: false, error: "The credential vault is not configured on this deployment, so a key cannot be stored." }, { status: 503 });
  }
  if (code.startsWith("missing_field:")) {
    return NextResponse.json({ ok: false, error: `${code.split(":")[1]} is required.` }, { status: 400 });
  }
  // Never pass an unrecognised error through — a vault or provider message can
  // carry the value that caused it.
  return NextResponse.json({ ok: false, error: "That could not be saved." }, { status: 400 });
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
    if (!body?.action) {
      return NextResponse.json({ ok: false, error: "Choose an Aqua Editor AI action." }, { status: 400 });
    }
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Which project?" }, { status: 400 });
    }

    // Read. Mutates nothing; exists so a screen can refresh the gate without a
    // GET on a route that handles credentials.
    if (body.action === "status") {
      const status = editorAiStatus(session.agencyId, projectId);
      if (!status.projectId) {
        return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        status,
        reason: editorAiReason(session.agencyId, projectId),
        vaultAvailable: integrationVaultAvailable(),
      }, { headers: { "cache-control": "private, no-store" } });
    }

    try {
      if (body.action === "set-token") {
        const status = setEditorAiToken({
          agencyId: session.agencyId,
          projectId,
          apiKey: body.apiKey ?? "",
          model: body.model,
          instructions: body.instructions,
          actorUserId: session.userId,
          actorEmail: session.email,
        });
        await flushPendingWrites();
        return NextResponse.json({
          ok: true,
          status,
          reason: editorAiReason(session.agencyId, projectId),
        }, { headers: { "cache-control": "private, no-store" } });
      }

      if (body.action === "clear-token") {
        const status = clearEditorAiToken({
          agencyId: session.agencyId,
          projectId,
          actorUserId: session.userId,
          actorEmail: session.email,
        });
        await flushPendingWrites();
        return NextResponse.json({
          ok: true,
          status,
          reason: editorAiReason(session.agencyId, projectId),
        }, { headers: { "cache-control": "private, no-store" } });
      }

      if (body.action === "save") {
        // Model and brief only. A key sent here is IGNORED rather than quietly
        // accepted — one action writes credentials, and it is not this one.
        const status = saveEditorAiConfig({
          agencyId: session.agencyId,
          projectId,
          model: body.model,
          instructions: body.instructions,
          actorUserId: session.userId,
          actorEmail: session.email,
        });
        await flushPendingWrites();
        return NextResponse.json({
          ok: true,
          status,
          reason: editorAiReason(session.agencyId, projectId),
        }, { headers: { "cache-control": "private, no-store" } });
      }
    } catch (error) {
      return failure(error);
    }

    return NextResponse.json({ ok: false, error: "Choose an Aqua Editor AI action." }, { status: 400 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
