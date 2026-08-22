import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { EDITOR_AI_HISTORY_LIMITS } from "@/engines/editor/server/editorAiHistory";
import { generateEditorAiReply } from "@/engines/editor/server/editorAiReply";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";

// ─── AQUA EDITOR AI — the reply API, per project ─────────────────────────────
//
// One action: answer the latest message in ONE project's thread, on that
// project's OWN key, and append the assistant's reply server-side. This is the
// path the history route's append gate defers to — a browser may only ever
// speak as the person; the assistant's lines enter the transcript here.
//
// ── Its own route, beside its siblings ───────────────────────────────────────
//
// Same family as `../route.ts` (the key) and `../history/route.ts` (the
// transcript): POST only, same three gates, same tenant-then-project scoping,
// same refusal sentences — a foreign project id and an invented one are
// indistinguishable. Separate file because this one WAITS ON A PROVIDER: it
// holds a connection open for up to 45 seconds, and mixing that into the
// history route would put a slow upstream in front of every fast local read.
//
// ── What a failure looks like ────────────────────────────────────────────────
//
// Words, with a CODE, never a hang: `not_configured` (the existing reason
// sentence — the panel points at the Key panel), `timeout`, `network`,
// `provider` (OpenAI's sentence, scrubbed of the key it may echo), `empty`.
// A failed reply appends nothing to the thread; the operator's message is
// already saved and stays saved.

type Body = {
  projectId?: string;
  threadId?: string;
  /** What the editor is pointing at — target, clicked words, source focus. */
  context?: string;
};

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

const NO_STORE = { "cache-control": "private, no-store" } as const;

/** The same sentences as the siblings, for the same conditions. */
function failure(error: unknown): NextResponse {
  const code = error instanceof Error ? error.message : "";
  if (code === "project_required" || code === "agency_required") {
    return NextResponse.json({ ok: false, error: "Which project?" }, { status: 400 });
  }
  if (code === "project_not_found") {
    // The SAME answer an invented id gets — a different one would confirm that
    // a guessed project exists in somebody else's workspace.
    return NextResponse.json({ ok: false, error: "That project could not be found." }, { status: 404 });
  }
  if (code === "thread_not_found") {
    return NextResponse.json({ ok: false, error: "That conversation could not be found." }, { status: 404 });
  }
  // Never pass an unrecognised error through — an upstream message can carry
  // the value that caused it.
  return NextResponse.json({ ok: false, error: "Aqua Editor AI could not reply." }, { status: 502 });
}

/** HTTP status for each honest failure. The panel reads the CODE, not this. */
const FAILURE_STATUS = {
  not_configured: 409,
  timeout: 504,
  network: 502,
  provider: 502,
  empty: 502,
} as const;

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
    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Which project?" }, { status: 400 });
    }
    const threadId = typeof body?.threadId === "string" ? body.threadId.trim() : "";
    if (!threadId) {
      return NextResponse.json({ ok: false, error: "Which conversation?" }, { status: 400 });
    }

    try {
      const result = await generateEditorAiReply({
        agencyId: session.agencyId,
        projectId,
        threadId,
        actorUserId: session.userId,
        context: typeof body?.context === "string" ? body.context : undefined,
      });

      if (!result.ok) {
        // Honest words with a code the panel can act on. Nothing was written,
        // so there is nothing to flush.
        return NextResponse.json(
          { ok: false, error: result.error, code: result.code },
          { status: FAILURE_STATUS[result.code], headers: NO_STORE },
        );
      }

      await flushPendingWrites();
      return NextResponse.json({
        ok: true,
        message: result.message,
        threadId: result.threadId,
        conversation: result.conversation,
        limits: EDITOR_AI_HISTORY_LIMITS,
      }, { headers: NO_STORE });
    } catch (error) {
      return failure(error);
    }
  } catch (error) {
    return authErrorResponse(error);
  }
}
