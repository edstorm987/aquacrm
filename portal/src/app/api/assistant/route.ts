import { NextResponse, type NextRequest } from "next/server";

import { buildAssistantBusinessContext } from "@/lib/server/assistants/assistantBusinessContext";
import { buildAdvisorContext } from "@/lib/server/assistants/advisorContext";
import {
  addAssistantMemory,
  AssistantTurnConflictError,
  AssistantTurnValidationError,
  beginAssistantTurn,
  completeAssistantTurn,
  createAssistantThread,
  deleteAssistantMemory,
  deleteAssistantThread,
  getAssistantThread,
  getAssistantTurnOperation,
  getAssistantWorkspace,
  recordAssistantTurnFailure,
  recordAssistantTurnProviderResult,
  renameAssistantThread,
} from "@/lib/server/assistants/assistantStore";
import {
  askMilesymediaAssistant,
  assistantModel,
  isAssistantConfigured,
  suggestAdvisorActions,
} from "@/lib/server/assistants/openaiAssistant";
import { getSessionFromRequest } from "@/lib/server/auth/auth";
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { ensureHydrated } from "@/server/storage";
import { getUserById } from "@/server/users";
import { logActivity } from "@/server/activity";
import { listAgencyTasks } from "@/server/tasks";
import { buildAdvisorSkillContext } from "@/lib/server/assistants/advisorSkillContext";
import { resolveAdvisorSkill } from "@/lib/server/assistants/advisorSkillsService";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";

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
    configured: isAssistantConfigured(agencyId),
    model: assistantModel(agencyId),
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
    skillId?: string;
    operationId?: string;
  };

  try {
    if (body.action === "new-thread") {
      const thread = await withAssistantTransaction(session.agencyId, session.userId, () => (
        createAssistantThread(session.agencyId, session.userId)
      ));
      return NextResponse.json({ ok: true, thread, ...responseState(session.agencyId, session.userId) });
    }
    if (body.action === "delete-thread" && body.threadId) {
      await withAssistantTransaction(session.agencyId, session.userId, () => (
        deleteAssistantThread(session.agencyId, session.userId, body.threadId!)
      ));
      return NextResponse.json({ ok: true, ...responseState(session.agencyId, session.userId) });
    }
    if (body.action === "rename-thread" && body.threadId && body.title) {
      await withAssistantTransaction(session.agencyId, session.userId, () => (
        renameAssistantThread(session.agencyId, session.userId, body.threadId!, body.title!)
      ));
      return NextResponse.json({ ok: true, ...responseState(session.agencyId, session.userId) });
    }
    if (body.action === "add-memory" && body.content) {
      const memory = await withAssistantTransaction(session.agencyId, session.userId, () => (
        addAssistantMemory(
          session.agencyId,
          session.userId,
          body.content!,
          body.threadId,
        )
      ));
      return NextResponse.json({ ok: true, memory, ...responseState(session.agencyId, session.userId) });
    }
    if (body.action === "delete-memory" && body.memoryId) {
      await withAssistantTransaction(session.agencyId, session.userId, () => (
        deleteAssistantMemory(session.agencyId, session.userId, body.memoryId!)
      ));
      return NextResponse.json({ ok: true, ...responseState(session.agencyId, session.userId) });
    }
    if (body.action === "suggest-actions") {
      const limit = rateLimit({
        key: `advisor-actions:${session.userId}:${clientIpFromHeaders(req.headers)}`,
        max: 8,
        windowMs: 60_000,
      });
      if (!limit.allowed) {
        return NextResponse.json(
          { ok: false, error: `Too many advisor reviews. Try again in ${limit.retryAfterSec} seconds.` },
          { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
        );
      }
      const advisorContext = await buildAdvisorContext(session.agencyId);
      const skill = resolveAdvisorSkill(session.agencyId, "prioritise grounded tasks");
      const skillContext = await buildAdvisorSkillContext(session.agencyId, skill, Date.now(), advisorContext);
      const openTasks = listAgencyTasks(session.agencyId).filter(task => task.status !== "done");
      const suggestions = await suggestAdvisorActions({
        agencyId: session.agencyId,
        businessContext: skillContext.serialized,
        alerts: advisorContext.operationalAlerts,
        radarIssues: advisorContext.businessRadar.incidents,
        recommendedActions: advisorContext.recommendedActions,
        existingTaskTitles: openTasks.map(task => task.title),
        skill,
      });
      logActivity({
        agencyId: session.agencyId,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "system",
        action: "assistant.actions.reviewed",
        message: `Aqua Advisor proposed ${suggestions.length} prioritised action${suggestions.length === 1 ? "" : "s"}.`,
        metadata: { model: assistantModel(session.agencyId), count: suggestions.length },
      });
      return NextResponse.json({ ok: true, suggestions, generatedAt: Date.now() });
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
    const priorOperation = body.operationId
      ? await withAssistantTransaction(session.agencyId, session.userId, () => (
        getAssistantTurnOperation(session.agencyId, session.userId, body.operationId!)
      ))
      : null;
    const providerAlreadyFinished = priorOperation?.status === "provider-complete" || priorOperation?.status === "completed";
    if (!providerAlreadyFinished && !isAssistantConfigured(session.agencyId)) {
      return NextResponse.json(
        {
          ok: false,
          error: "The assistant needs an OpenAI connection. Open Company → Connections and connect it there.",
          code: "assistant_not_configured",
        },
        { status: 503 },
      );
    }

    if (!providerAlreadyFinished) {
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
    }

    const skill = resolveAdvisorSkill(session.agencyId, message, priorOperation?.skillId ?? body.skillId);
    const memoryMatch = message.match(/^(?:please\s+)?remember(?:\s+that)?[\s:,-]+(.+)/is);
    const claim = await withAssistantTransaction(session.agencyId, session.userId, () => (
      beginAssistantTurn(session.agencyId, session.userId, {
        operationId: body.operationId || "",
        threadId: body.threadId,
        message,
        skillId: skill.skillId,
        memoryContent: memoryMatch?.[1]?.trim(),
      })
    ));

    if (!claim.claimed) {
      return NextResponse.json({
        ok: false,
        error: "That turn is already being generated. Wait a moment and retry the same message.",
        code: "assistant_turn_in_progress",
        retryable: true,
        operationId: claim.operation.id,
        threadId: claim.operation.threadId,
        turnStatus: claim.operation.status,
        ...responseState(session.agencyId, session.userId),
      }, { status: 409 });
    }

    let providerOperation = claim.operation;
    if (providerOperation.status !== "provider-complete" && providerOperation.status !== "completed") {
      const thread = providerOperation.sourceThreadId
        ? getAssistantThread(session.agencyId, session.userId, providerOperation.sourceThreadId)
        : null;
      const history = thread?.messages.slice() ?? [];
      const skillContext = await buildAdvisorSkillContext(session.agencyId, skill);
      const user = getUserById(session.userId);
      const workspace = getAssistantWorkspace(session.agencyId, session.userId);
      let answer: string;
      try {
        answer = await askMilesymediaAssistant({
          agencyId: session.agencyId,
          userName: user?.name || session.email,
          memories: workspace.memories,
          history,
          businessContext: skillContext.serialized,
          contextTruncated: skillContext.truncated,
          question: message,
          skill,
        });
      } catch (error) {
        const providerError = error instanceof Error ? error.message : "The assistant provider failed.";
        const failed = await withAssistantTransaction(session.agencyId, session.userId, () => (
          recordAssistantTurnFailure(session.agencyId, session.userId, claim.operation.id, claim.attempt, providerError)
        ));
        if (!failed || !failed.accepted) {
          return NextResponse.json({
            ok: false,
            error: failed ? "A newer retry owns this turn. Wait for it to finish." : "This turn was cancelled while the provider was running.",
            code: failed ? "assistant_turn_in_progress" : "assistant_turn_cancelled",
            retryable: Boolean(failed),
            operationId: claim.operation.id,
            threadId: claim.operation.threadId,
            turnStatus: failed?.operation.status,
            ...responseState(session.agencyId, session.userId),
          }, { status: 409 });
        }
        return NextResponse.json({
          ok: false,
          error: providerError,
          code: "assistant_turn_failed",
          retryable: true,
          operationId: claim.operation.id,
          threadId: claim.operation.threadId,
          turnStatus: failed?.operation.status ?? "failed",
          ...responseState(session.agencyId, session.userId),
        }, { status: 502 });
      }
      const recorded = await withAssistantTransaction(session.agencyId, session.userId, () => (
        recordAssistantTurnProviderResult(session.agencyId, session.userId, claim.operation.id, claim.attempt, answer)
      ));
      if (!recorded) throw new AssistantTurnConflictError("The assistant turn was cancelled before its answer could be saved.");
      providerOperation = recorded.operation;
      if (!recorded.accepted && providerOperation.status === "generating") {
        return NextResponse.json({
          ok: false,
          error: "A newer retry owns this turn. Wait for it to finish.",
          code: "assistant_turn_in_progress",
          retryable: true,
          operationId: providerOperation.id,
          threadId: providerOperation.threadId,
          turnStatus: providerOperation.status,
          ...responseState(session.agencyId, session.userId),
        }, { status: 409 });
      }
    }

    const completion = await withAssistantTransaction(session.agencyId, session.userId, () => {
      const result = completeAssistantTurn(session.agencyId, session.userId, providerOperation.id);
      if (!result) throw new AssistantTurnConflictError("Assistant turn not found.");
      logActivity({
        idempotencyKey: `assistant-turn:${providerOperation.id}`,
        agencyId: session.agencyId,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "system",
        action: "assistant.conversation.completed",
        message: "Aqua Advisor answered a workspace question.",
        metadata: {
          operationId: providerOperation.id,
          threadId: result.thread.id,
          model: assistantModel(session.agencyId),
          questionLength: message.length,
          answerLength: result.assistantMessage.content.length,
          memoryCreated: result.memoryCreated,
          skillId: skill.skillId,
          skillRecipeId: skill.recipeId,
        },
      });
      return result;
    });

    return NextResponse.json({
      ok: true,
      operationId: completion.operation.id,
      turnStatus: completion.operation.status,
      threadId: completion.thread.id,
      userMessage: completion.userMessage,
      assistantMessage: completion.assistantMessage,
      activeSkill: { id: skill.skillId, name: skill.name, access: skill.access },
      ...responseState(session.agencyId, session.userId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The assistant could not respond.";
    const status = error instanceof AssistantTurnValidationError ? 400
      : error instanceof AssistantTurnConflictError ? 409
        : 500;
    if (body.action === "message" && body.operationId) {
      const operation = getAssistantTurnOperation(session.agencyId, session.userId, body.operationId);
      return NextResponse.json({
        ok: false,
        error: message,
        code: status >= 500 ? "assistant_turn_persistence_failed" : "assistant_turn_rejected",
        retryable: status >= 500,
        operationId: body.operationId,
        threadId: operation?.threadId ?? body.threadId,
        turnStatus: operation?.status,
        ...responseState(session.agencyId, session.userId),
      }, { status });
    }
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

function withAssistantTransaction<T>(agencyId: string, userId: string, operation: () => T | Promise<T>): Promise<T> {
  return withPortalStateTransaction(`assistant:${agencyId}:${userId}`, operation);
}
