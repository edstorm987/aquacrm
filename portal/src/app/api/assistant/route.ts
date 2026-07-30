import { NextResponse, type NextRequest } from "next/server";

import { buildAssistantBusinessContext } from "@/lib/server/assistantBusinessContext";
import {
  addAssistantMemory,
  appendAssistantMessage,
  createAssistantThread,
  deleteAssistantMemory,
  deleteAssistantThread,
  getAssistantThread,
  getAssistantWorkspace,
  renameAssistantThread,
} from "@/lib/server/assistantStore";
import {
  askMilesymediaAssistant,
  assistantModel,
  isAssistantConfigured,
} from "@/lib/server/openaiAssistant";
import { getSessionFromRequest } from "@/lib/server/auth";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { ensureHydrated } from "@/server/storage";
import { getUserById } from "@/server/users";
import { logActivity } from "@/server/activity";

const ASSISTANT_ROLES = new Set(["agency-owner", "agency-manager"]);

async function sessionFor(req: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(req);
  if (!session || !ASSISTANT_ROLES.has(session.role)) return null;
  return session;
}

function responseState(agencyId: string, userId: string) {
  const context = buildAssistantBusinessContext(agencyId);
  return {
    workspace: getAssistantWorkspace(agencyId, userId),
    configured: isAssistantConfigured(),
    model: assistantModel(),
    coverage: {
      clients: context.summary.clients.length,
      team: context.summary.team.length,
      pipelines: context.summary.pipelines.length,
      recentActivity: context.summary.recentActivity.length,
      modules: Object.keys(context.summary.businessModules),
    },
  };
}

export async function GET(req: NextRequest) {
  const session = await sessionFor(req);
  if (!session) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true, ...responseState(session.agencyId, session.userId) });
}

export async function POST(req: NextRequest) {
  const session = await sessionFor(req);
  if (!session) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as {
    action?: string;
    threadId?: string;
    message?: string;
    title?: string;
    memoryId?: string;
    content?: string;
  };

  try {
    if (body.action === "new-thread") {
      const thread = createAssistantThread(session.agencyId, session.userId);
      return NextResponse.json({ ok: true, thread, ...responseState(session.agencyId, session.userId) });
    }
    if (body.action === "delete-thread" && body.threadId) {
      deleteAssistantThread(session.agencyId, session.userId, body.threadId);
      return NextResponse.json({ ok: true, ...responseState(session.agencyId, session.userId) });
    }
    if (body.action === "rename-thread" && body.threadId && body.title) {
      renameAssistantThread(session.agencyId, session.userId, body.threadId, body.title);
      return NextResponse.json({ ok: true, ...responseState(session.agencyId, session.userId) });
    }
    if (body.action === "add-memory" && body.content) {
      const memory = addAssistantMemory(
        session.agencyId,
        session.userId,
        body.content,
        body.threadId,
      );
      return NextResponse.json({ ok: true, memory, ...responseState(session.agencyId, session.userId) });
    }
    if (body.action === "delete-memory" && body.memoryId) {
      deleteAssistantMemory(session.agencyId, session.userId, body.memoryId);
      return NextResponse.json({ ok: true, ...responseState(session.agencyId, session.userId) });
    }
    if (body.action !== "message") {
      return NextResponse.json({ ok: false, error: "Unknown assistant action." }, { status: 400 });
    }

    const message = body.message?.trim() ?? "";
    if (!message || message.length > 6_000) {
      return NextResponse.json(
        { ok: false, error: "Write a message between 1 and 6,000 characters." },
        { status: 400 },
      );
    }
    if (!isAssistantConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error: "The assistant needs an OpenAI API key. Add OPENAI_API_KEY to .env.local, then restart the app.",
          code: "assistant_not_configured",
        },
        { status: 503 },
      );
    }

    const limit = rateLimit({
      key: `assistant:${session.userId}:${clientIpFromHeaders(req.headers)}`,
      max: 30,
      windowMs: 60_000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, error: `Too many messages. Try again in ${limit.retryAfterSec} seconds.` },
        { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
      );
    }

    let thread = body.threadId
      ? getAssistantThread(session.agencyId, session.userId, body.threadId)
      : null;
    if (!thread) thread = createAssistantThread(session.agencyId, session.userId);

    const history = thread.messages.slice();
    const userMessage = appendAssistantMessage(
      session.agencyId,
      session.userId,
      thread.id,
      "user",
      message,
    );

    const memoryMatch = message.match(/^(?:please\s+)?remember(?:\s+that)?[\s:,-]+(.+)/is);
    if (memoryMatch?.[1]?.trim()) {
      addAssistantMemory(
        session.agencyId,
        session.userId,
        memoryMatch[1].trim(),
        thread.id,
      );
    }

    const context = buildAssistantBusinessContext(session.agencyId);
    const user = getUserById(session.userId);
    const workspace = getAssistantWorkspace(session.agencyId, session.userId);
    const answer = await askMilesymediaAssistant({
      userName: user?.name || session.email,
      memories: workspace.memories,
      history,
      businessContext: context.serialized,
      contextTruncated: context.truncated,
      question: message,
    });
    const assistantMessage = appendAssistantMessage(
      session.agencyId,
      session.userId,
      thread.id,
      "assistant",
      answer,
    );
    logActivity({
      agencyId: session.agencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "system",
      action: "assistant.conversation.completed",
      message: "Milesymedia assistant answered a workspace question.",
      metadata: {
        threadId: thread.id,
        model: assistantModel(),
        questionLength: message.length,
        answerLength: answer.length,
        memoryCreated: Boolean(memoryMatch?.[1]?.trim()),
      },
    });

    return NextResponse.json({
      ok: true,
      threadId: thread.id,
      userMessage,
      assistantMessage,
      ...responseState(session.agencyId, session.userId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The assistant could not respond.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
