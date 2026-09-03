import { NextResponse, type NextRequest } from "next/server";

import { buildAdvisorContextForActor } from "@/lib/server/assistants/advisorContext";
import {
  addAssistantMemory,
  AssistantTurnConflictError,
  AssistantTurnValidationError,
  beginAssistantTurn,
  completeAssistantTurn,
  createAssistantThread,
  deleteAssistantMemory,
  deleteAssistantThread,
  getAssistantTurnOperation,
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
import { clientIpFromHeaders, rateLimit } from "@/lib/server/rateLimit";
import { getUserById } from "@/server/users";
import { logActivity } from "@/server/activity";
import { buildAdvisorSkillContext } from "@/lib/server/assistants/advisorSkillContext";
import { resolveAdvisorSkill } from "@/lib/server/assistants/advisorSkillsService";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import {
  assistantBusinessContextForActor,
  assistantWorkspaceForActor,
  requireAssistantElement,
} from "@/lib/server/assistants/assistantContextScope";
import { resolveBusinessRadarAccessForActor } from "@/lib/server/intelligence/personalRadarAccess";
import {
  AccessControlError,
  accessErrorResponse,
  type CurrentAccessActor,
} from "@/server/accessControl";

const ASSISTANT_ROLES = new Set(["agency-owner", "agency-manager"]);

async function actorForAssistant(): Promise<CurrentAccessActor> {
  const actor = await requireAssistantElement("workspace.overview");
  if (!ASSISTANT_ROLES.has(actor.session.role)) {
    throw new AccessControlError(403, "assistant_role_ceiling");
  }
  return actor;
}

async function responseState(actor: CurrentAccessActor) {
  const agencyId = actor.resourceAgencyId;
  const [context, workspace] = await Promise.all([
    assistantBusinessContextForActor(actor),
    assistantWorkspaceForActor(actor),
  ]);
  return {
    workspace,
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
  void req;
  try {
    const actor = await actorForAssistant();
    return NextResponse.json({ ok: true, ...await responseState(actor) });
  } catch (error) {
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    throw error;
  }
}

export async function POST(req: NextRequest) {
  let actor: CurrentAccessActor;
  try {
    actor = await actorForAssistant();
  } catch (error) {
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    throw error;
  }
  const session = actor.session;
  const agencyId = actor.resourceAgencyId;
  const userId = session.userId;
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
      const thread = await withAssistantTransaction(agencyId, userId, () => (
        createAssistantThread(agencyId, userId)
      ));
      return NextResponse.json({ ok: true, thread, ...await responseState(actor) });
    }
    if (body.action === "delete-thread" && body.threadId) {
      await withAssistantTransaction(agencyId, userId, () => (
        deleteAssistantThread(agencyId, userId, body.threadId!)
      ));
      return NextResponse.json({ ok: true, ...await responseState(actor) });
    }
    if (body.action === "rename-thread" && body.threadId && body.title) {
      await withAssistantTransaction(agencyId, userId, () => (
        renameAssistantThread(agencyId, userId, body.threadId!, body.title!)
      ));
      return NextResponse.json({ ok: true, ...await responseState(actor) });
    }
    if (body.action === "add-memory" && body.content) {
      const memory = await withAssistantTransaction(agencyId, userId, () => (
        addAssistantMemory(
          agencyId,
          userId,
          body.content!,
          body.threadId,
        )
      ));
      return NextResponse.json({ ok: true, memory, ...await responseState(actor) });
    }
    if (body.action === "delete-memory" && body.memoryId) {
      await withAssistantTransaction(agencyId, userId, () => (
        deleteAssistantMemory(agencyId, userId, body.memoryId!)
      ));
      return NextResponse.json({ ok: true, ...await responseState(actor) });
    }
    if (body.action === "suggest-actions") {
      const limit = rateLimit({
        key: `advisor-actions:${userId}:${clientIpFromHeaders(req.headers)}`,
        max: 8,
        windowMs: 60_000,
      });
      if (!limit.allowed) {
        return NextResponse.json(
          { ok: false, error: `Too many advisor reviews. Try again in ${limit.retryAfterSec} seconds.` },
          { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
        );
      }
      if (!(await resolveBusinessRadarAccessForActor(actor))) {
        throw new AccessControlError(403, "business_radar_view_required");
      }
      const advisorContext = await buildAdvisorContextForActor(actor);
      const skill = resolveAdvisorSkill(agencyId, "prioritise grounded tasks");
      const skillContext = await buildAdvisorSkillContext(actor, skill, Date.now(), advisorContext);
      const openTasks = advisorContext.openTasks;
      const suggestions = await suggestAdvisorActions({
        agencyId,
        businessContext: skillContext.serialized,
        alerts: advisorContext.operationalAlerts,
        radarIssues: advisorContext.businessRadar?.incidents ?? [],
        recommendedActions: advisorContext.recommendedActions,
        existingTaskTitles: openTasks.map(task => task.title),
        skill,
      });
      logActivity({
        agencyId,
        actorUserId: userId,
        actorEmail: session.email,
        category: "system",
        action: "assistant.actions.reviewed",
        message: `Aqua Advisor proposed ${suggestions.length} prioritised action${suggestions.length === 1 ? "" : "s"}.`,
        metadata: { model: assistantModel(agencyId), count: suggestions.length },
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
      ? await withAssistantTransaction(agencyId, userId, () => (
        getAssistantTurnOperation(agencyId, userId, body.operationId!)
      ))
      : null;
    const providerAlreadyFinished = priorOperation?.status === "provider-complete" || priorOperation?.status === "completed";
    if (!providerAlreadyFinished && !isAssistantConfigured(agencyId)) {
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
        key: `assistant:${userId}:${clientIpFromHeaders(req.headers)}`,
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

    const skill = resolveAdvisorSkill(agencyId, message, priorOperation?.skillId ?? body.skillId);
    const memoryMatch = message.match(/^(?:please\s+)?remember(?:\s+that)?[\s:,-]+(.+)/is);
    const claim = await withAssistantTransaction(agencyId, userId, () => (
      beginAssistantTurn(agencyId, userId, {
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
        ...await responseState(actor),
      }, { status: 409 });
    }

    let providerOperation = claim.operation;
    if (providerOperation.status !== "provider-complete" && providerOperation.status !== "completed") {
      const skillContext = await buildAdvisorSkillContext(actor, skill);
      const user = getUserById(userId);
      // Old turns and memories have no immutable element envelope. Once a
      // manager is policy-managed, the actor projection deliberately supplies
      // neither to the provider so revoked finance/HR/client text cannot be
      // laundered into a new answer.
      const workspace = await assistantWorkspaceForActor(actor);
      const thread = providerOperation.sourceThreadId
        ? workspace.threads.find(item => item.id === providerOperation.sourceThreadId) ?? null
        : null;
      const history = thread?.messages.slice() ?? [];
      let answer: string;
      try {
        answer = await askMilesymediaAssistant({
          agencyId,
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
        const failed = await withAssistantTransaction(agencyId, userId, () => (
          recordAssistantTurnFailure(agencyId, userId, claim.operation.id, claim.attempt, providerError)
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
            ...await responseState(actor),
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
          ...await responseState(actor),
        }, { status: 502 });
      }
      const recorded = await withAssistantTransaction(agencyId, userId, () => (
        recordAssistantTurnProviderResult(agencyId, userId, claim.operation.id, claim.attempt, answer)
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
          ...await responseState(actor),
        }, { status: 409 });
      }
    }

    const completion = await withAssistantTransaction(agencyId, userId, () => {
      const result = completeAssistantTurn(agencyId, userId, providerOperation.id);
      if (!result) throw new AssistantTurnConflictError("Assistant turn not found.");
      logActivity({
        idempotencyKey: `assistant-turn:${providerOperation.id}`,
        agencyId,
        actorUserId: userId,
        actorEmail: session.email,
        category: "system",
        action: "assistant.conversation.completed",
        message: "Aqua Advisor answered a workspace question.",
        metadata: {
          operationId: providerOperation.id,
          threadId: result.thread.id,
          model: assistantModel(agencyId),
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
      ...await responseState(actor),
    });
  } catch (error) {
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    const message = error instanceof Error ? error.message : "The assistant could not respond.";
    const status = error instanceof AssistantTurnValidationError ? 400
      : error instanceof AssistantTurnConflictError ? 409
        : 500;
    if (body.action === "message" && body.operationId) {
      const operation = getAssistantTurnOperation(agencyId, userId, body.operationId);
      return NextResponse.json({
        ok: false,
        error: message,
        code: status >= 500 ? "assistant_turn_persistence_failed" : "assistant_turn_rejected",
        retryable: status >= 500,
        operationId: body.operationId,
        threadId: operation?.threadId ?? body.threadId,
        turnStatus: operation?.status,
        ...await responseState(actor),
      }, { status });
    }
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

function withAssistantTransaction<T>(agencyId: string, userId: string, operation: () => T | Promise<T>): Promise<T> {
  return withPortalStateTransaction(`assistant:${agencyId}:${userId}`, operation);
}
