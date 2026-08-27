import { NextResponse } from "next/server";

import { accessErrorResponse } from "@/server/accessControl";
import { requireDevProjectAccess } from "@/lib/server/dev/devProjectAccess";
import {
  EDITOR_AI_HISTORY_LIMITS,
  appendEditorAiMessage,
  clearEditorAiHistory,
  deleteEditorAiThread,
  getEditorAiConversation,
  renameEditorAiThread,
  startEditorAiThread,
} from "@/engines/editor/server/editorAiHistory";
import { flushPendingWrites } from "@/server/storage";

// ─── AQUA EDITOR AI — the chat history API, per project ──────────────────────
//
// Ed: "the chat history per project only limited to a project nothing else".
//
// Append, read and clear ONE project's conversation. Every action names a
// `projectId` and there is no action that does not — there is deliberately no
// "list my conversations" here, because a listing that spans projects is the
// exact shape Ed asked to be removed.
//
// ── Not `/api/assistant` ─────────────────────────────────────────────────────
//
// That route reads and writes `PortalState.assistant`, keyed by USER, and it
// is the Aqua Advisor's and the Librarian's. This one reads and writes
// `PortalState.editorAiConversations`, keyed by PROJECT. They are separate
// endpoints over separate collections so that clearing one cannot empty the
// other — which is the requirement, not tidiness.
//
// ── POST only, like its sibling ──────────────────────────────────────────────
//
// Reading is `action: "read"`. This route handles no credential, so the
// argument is weaker here than on `../route.ts` — but a GET would still put a
// project id in a URL that gets logged, cached and prefetched, and one family
// of routes with one shape is easier to gate correctly than two.
//
// ── The gate ─────────────────────────────────────────────────────────────────
//
// Every action requires project AI access. Reading requires the AI element's
// view level; all transcript mutations require its use level. Tenant and
// project resolution happen before a conversation key is constructed.

type Body = {
  action?: "read" | "new-thread" | "append" | "rename-thread" | "delete-thread" | "clear";
  projectId?: string;
  threadId?: string;
  role?: "user" | "assistant";
  message?: string;
  title?: string;
};

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function failure(error: unknown): NextResponse {
  const code = error instanceof Error ? error.message : "";
  if (code === "project_required" || code === "agency_required") {
    return NextResponse.json({ ok: false, error: "Which project?" }, { status: 400 });
  }
  if (code === "project_not_found") {
    // The SAME answer an invented id gets. A different one would confirm that
    // a guessed project exists in somebody else's workspace.
    return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });
  }
  if (code === "message_required") {
    return NextResponse.json({ ok: false, error: "Type something to send." }, { status: 400 });
  }
  if (code === "thread_not_found") {
    return NextResponse.json({ ok: false, error: "That conversation could not be found." }, { status: 404 });
  }
  return NextResponse.json({ ok: false, error: "That could not be saved." }, { status: 400 });
}

const NO_STORE = { "cache-control": "private, no-store" } as const;

export async function POST(request: Request) {
  try {
    if (!validOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as Body | null;
    if (!body?.action) {
      return NextResponse.json({ ok: false, error: "Choose a history action." }, { status: 400 });
    }
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Which project?" }, { status: 400 });
    }
    const access = await requireDevProjectAccess({
      projectId,
      capability: "project.ai",
      elementCapability: body.action === "read"
        ? "element.development.ai.view"
        : "element.development.ai.use",
    });
    const agencyId = access.resourceAgencyId;

    // Read. Mutates nothing. `null` means the project is not this agency's —
    // answered identically to an id that never existed.
    if (body.action === "read") {
      const conversation = getEditorAiConversation(agencyId, projectId);
      if (!conversation) {
        return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });
      }
      return NextResponse.json(
        { ok: true, conversation, limits: EDITOR_AI_HISTORY_LIMITS },
        { headers: NO_STORE },
      );
    }

    try {
      if (body.action === "append") {
        // A browser only ever speaks as the PERSON. `appendEditorAiMessage`
        // does take an assistant role — that is for the server's own reply
        // path, which writes the model's answer after producing it — but a
        // request body claiming to be the assistant is a forged transcript
        // line, so it is refused out loud rather than coerced quietly.
        if (body.role !== undefined && body.role !== "user") {
          return NextResponse.json(
            { ok: false, error: "Only your own messages can be added here." },
            { status: 400 },
          );
        }
        const result = appendEditorAiMessage({
          agencyId,
          projectId,
          threadId: body.threadId,
          role: "user",
          content: body.message ?? "",
          actorUserId: access.user.id,
        });
        await flushPendingWrites();
        return NextResponse.json({
          ok: true,
          message: result.message,
          threadId: result.threadId,
          conversation: result.conversation,
          limits: EDITOR_AI_HISTORY_LIMITS,
        }, { headers: NO_STORE });
      }

      if (body.action === "new-thread") {
        const thread = startEditorAiThread({
          agencyId,
          projectId,
          title: body.title,
          actorUserId: access.user.id,
        });
        await flushPendingWrites();
        return NextResponse.json({
          ok: true,
          threadId: thread.id,
          conversation: getEditorAiConversation(agencyId, projectId),
          limits: EDITOR_AI_HISTORY_LIMITS,
        }, { headers: NO_STORE });
      }

      if (body.action === "rename-thread") {
        const conversation = renameEditorAiThread({
          agencyId,
          projectId,
          threadId: body.threadId ?? "",
          title: body.title ?? "",
        });
        await flushPendingWrites();
        return NextResponse.json({ ok: true, conversation, limits: EDITOR_AI_HISTORY_LIMITS }, { headers: NO_STORE });
      }

      if (body.action === "delete-thread") {
        const conversation = deleteEditorAiThread({
          agencyId,
          projectId,
          threadId: body.threadId ?? "",
        });
        await flushPendingWrites();
        return NextResponse.json({ ok: true, conversation, limits: EDITOR_AI_HISTORY_LIMITS }, { headers: NO_STORE });
      }

      if (body.action === "clear") {
        // This project's history and nothing else. It cannot reach the agency
        // assistant's store — that is a different collection behind a
        // different endpoint.
        const conversation = clearEditorAiHistory({ agencyId, projectId });
        await flushPendingWrites();
        return NextResponse.json({ ok: true, conversation, limits: EDITOR_AI_HISTORY_LIMITS }, { headers: NO_STORE });
      }
    } catch (error) {
      return failure(error);
    }

    return NextResponse.json({ ok: false, error: "Choose a history action." }, { status: 400 });
  } catch (error) {
    return accessErrorResponse(error);
  }
}
