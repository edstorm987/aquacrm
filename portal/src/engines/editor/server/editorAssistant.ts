import "server-only";

import {
  editorAiConfigured,
  editorAiModel,
  editorAiReason,
  editorAiStatus,
} from "@/engines/editor/server/editorAi";
import {
  EDITOR_AI_HISTORY_LIMITS,
  getEditorAiConversation,
} from "@/engines/editor/server/editorAiHistory";
import { getDevProject } from "@/engines/editor/server/devProjects";
import type { EditorAiConversation, EditorAiStatus } from "@/server/types";
import { getUserById } from "@/server/users";

// ─── AQUA EDITOR AI — the server side ────────────────────────────────────────
//
// Aqua Editor AI is its OWN assistant, with its OWN token, its OWN chat history
// and its OWN interface, all of them per project. It is not a skin over the
// Aqua Advisor.
//
// ⚠ THIS FILE USED TO SAY THE OPPOSITE, and said it emphatically: "One brain,
// three skins — nothing here is a second assistant." That was a correct
// description of a deliberate decision, and Ed has since reversed the decision:
//
//   "aqua editor ai needs to be its only thing please now. needs a seperate
//    tocken please to configure please. it needs its own thing and its saved
//    per project this one is please the chat history per project only limited
//    to a project nothing else and needs its own proper ui for this"
//
// If you arrive here intending to re-unify these because the duplication looks
// like a mistake: it is not a mistake, it is the requirement. The reuse rule is
// gone on purpose and `scripts/smoke-aqua-editor-ai.test.ts` now pins its
// ABSENCE, not its presence.
//
// ── What is separate, and how ────────────────────────────────────────────────
//
//   • THE CREDENTIAL (Phase 1). `configured` and `model` come from the
//     project's own `EditorAiConfig` via `editorAi.ts` — its own key in the
//     vault under its own provider kind. `isAssistantConfigured` /
//     `assistantModel`, which resolve the AGENCY's `openai` connection for the
//     Advisor and the Librarian, are not imported here and must not come back.
//     That import returning is the whole bug Ed is describing.
//
//   • THE GATE. No project, or a project with no key of its own, means
//     `configured: false` and a `reason` saying so in words. Until a key is
//     pasted on a project, Aqua Editor AI is off even on a workspace whose
//     Advisor works perfectly. That is the point of "a seperate tocken".
//
//   • THE HISTORY (Phase 2). `initialConversation` is this PROJECT's own chat
//     history out of `PortalState.editorAiConversations` — a separate
//     collection from the Advisor's, keyed by project rather than by person, so
//     a conversation cannot span two projects and clearing one store cannot
//     empty the other. `editorAiHistory.ts` is the whole of it.
//
//   • THE UI (Phase 3). `AquaEditorAI.tsx` is now its own interface and no
//     longer mounts `AssistantWorkspace`. It reads and writes ONLY
//     `/api/portal/dev/editor-ai` and `/api/portal/dev/editor-ai/history`.
//     `/api/assistant` — the Advisor's per-person store — is not called from
//     the editor at all any more.
//
// ── The two dead props, and why they are still declared ──────────────────────
//
// `initialWorkspace` and `coverage` are the last of the shared assistant. They
// are no longer LOADED — `getAssistantWorkspace` and the agency business
// snapshot are gone from this module, so opening the editor no longer reads the
// Advisor's conversations or runs an agency-wide radar to render a chat panel.
//
// They remain OPTIONAL FIELDS ON THE TYPE for one reason: `DevEditor.tsx` still
// names them at the mount, and that file is being edited elsewhere in this
// pass. Both are `undefined` at runtime and nothing reads them. When the mount
// is updated (see the note in `AquaEditorAI.tsx`), delete both from here and
// from the mount together.

export interface EditorAssistantProps {
  /**
   * ⚠ DEAD. The Aqua Advisor's per-person workspace. No longer loaded, no
   * longer rendered, and typed so that nothing can put one back; declared only
   * until the editor mount stops naming it.
   */
  initialWorkspace?: never;
  /**
   * ⚠ DEAD. The AGENCY's business snapshot — clients, pipelines, radar. An
   * editor assistant should be briefed on its PROJECT, which is what the
   * per-project `instructions` on `EditorAiStatus` are for.
   */
  coverage?: never;
  /**
   * THIS PROJECT's chat history, and no other project's. Null when the editor
   * was opened without a project, or when the project is not this agency's —
   * the store answers both the same way on purpose.
   */
  initialConversation: EditorAiConversation | null;
  /**
   * The history cap, so the UI can say what it is rather than a conversation
   * quietly getting shorter. See `EDITOR_AI_HISTORY_LIMITS`.
   */
  historyLimits: typeof EDITOR_AI_HISTORY_LIMITS;
  /**
   * Whether THIS PROJECT's Aqua Editor AI has its own key. Not whether the
   * agency's OpenAI connection exists — those are now different questions and
   * this one is the editor's.
   */
  configured: boolean;
  /** The model from the project's own configuration. */
  model: string;
  /**
   * The signed-in person, for the assistant's greeting — the SAME field the
   * Advisor and Librarian skins already fill from `getUserById`. The editor
   * used to hand this the thing being edited instead, which rendered
   * "What do you need, a?" out of "a client portal".
   */
  userName: string;
  /** The project this assistant belongs to. Empty on a door with no project. */
  projectId: string;
  /**
   * Its name, so the panel can SAY which project the conversation belongs to.
   * The whole point of a per-project history is undermined if a screen cannot
   * show which project it is looking at.
   */
  projectName: string;
  /**
   * The client-safe view of the project's configuration — configured, model,
   * masked tail, brief. Never the key: `EditorAiStatus` has no field one could
   * occupy. Null when the editor was opened without a project.
   */
  editorAi: EditorAiStatus | null;
  /** Why the assistant is off, in words, or "" when it is on. */
  reason: string;
}

/**
 * Everything Aqua Editor AI needs to mount inside the studio, for ONE project.
 *
 * `projectId` is optional only because the agency-portals door
 * (`/portal/agency/portals/editor`) has no project concept at all. Opened that
 * way the assistant reports itself unconfigured with a reason that says why —
 * an assistant configured per project cannot be configured when there is no
 * project, and pretending otherwise would mean falling back to the agency's
 * key, which is the exact thing being removed.
 *
 * The token is NOT read here. Nothing this function returns can carry one.
 */
export async function loadEditorAssistant(
  agencyId: string,
  userId: string,
  projectId?: string,
): Promise<EditorAssistantProps> {
  const user = getUserById(userId);
  const requested = (projectId ?? "").trim();
  // TENANT FIRST. `getDevProject` compares the agency before it returns, so a
  // project id belonging to somebody else resolves to nothing here and every
  // field below falls back to the same "no project" answer an invented id gets.
  const found = requested ? getDevProject(agencyId, requested) : null;
  const project = found?.id ?? "";
  return {
    // This project's own conversation. Nothing else's.
    initialConversation: project ? getEditorAiConversation(agencyId, project) : null,
    historyLimits: EDITOR_AI_HISTORY_LIMITS,
    // Its own token, per project. Never `isAssistantConfigured(agencyId)`.
    configured: project ? editorAiConfigured(agencyId, project) : false,
    model: project ? editorAiModel(agencyId, project) : "",
    userName: user?.name || user?.email || "there",
    projectId: project,
    projectName: found?.name ?? "",
    editorAi: project ? editorAiStatus(agencyId, project) : null,
    reason: editorAiReason(agencyId, project),
  };
}
