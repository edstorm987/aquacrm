import type {
  LocalRepositoryPreviewAction,
  LocalRepositoryPreviewSnapshot,
  LocalRepositoryPreviewState,
} from "@/lib/shared/localRepositoryPreview";

export type LocalRepositoryPreviewLifecycleAction = Extract<
  LocalRepositoryPreviewAction,
  "start" | "stop" | "restart"
>;

export interface LocalRepositoryPreviewPendingAction {
  id: number;
  action: LocalRepositoryPreviewAction;
  previousStartedAt?: number;
}

export interface LocalRepositoryPreviewUiState {
  preview: LocalRepositoryPreviewSnapshot;
  pending: LocalRepositoryPreviewPendingAction | null;
}

export type LocalRepositoryPreviewUiEvent =
  | { type: "begin"; id: number; action: LocalRepositoryPreviewAction }
  | { type: "response"; id: number; preview: LocalRepositoryPreviewSnapshot }
  | { type: "status"; preview: LocalRepositoryPreviewSnapshot }
  | { type: "finish"; id: number }
  | { type: "reset"; projectId: string };

const FAILURE_STATES = new Set<LocalRepositoryPreviewState>([
  "crashed",
  "occupied-port",
  "install-failed",
  "start-failed",
  "health-timeout",
  "configuration-error",
  "production-refused",
]);

export function isRepositoryPreviewLifecycleAction(
  action: LocalRepositoryPreviewAction,
): action is LocalRepositoryPreviewLifecycleAction {
  return action === "start" || action === "stop" || action === "restart";
}

/**
 * Show lifecycle intent before a mutation response body finishes decoding.
 *
 * The route may already have spawned/stopped the child while the initiating
 * browser is still waiting for the response stream to close. Leaving the old
 * `idle`/`healthy` snapshot visible in that interval makes a successful action
 * look frozen and keeps every control disabled.
 */
export function optimisticRepositoryPreview(
  current: LocalRepositoryPreviewSnapshot,
  action: LocalRepositoryPreviewAction,
): LocalRepositoryPreviewSnapshot {
  if (action === "start" || action === "restart") {
    return { projectId: current.projectId, state: "starting" };
  }
  if (action === "stop") {
    return {
      ...current,
      state: "stopping",
      previewUrl: undefined,
      error: undefined,
    };
  }
  return current;
}

export function mergeRepositoryPreviewSnapshot(
  current: LocalRepositoryPreviewSnapshot,
  next: LocalRepositoryPreviewSnapshot,
): LocalRepositoryPreviewSnapshot {
  return {
    ...next,
    // Status/control responses intentionally omit logs. Preserve them while
    // observing one process, but never leak output into a new generation.
    logs: next.logs ?? (next.startedAt === current.startedAt ? current.logs : undefined),
  };
}

/**
 * Decide whether a status response proves that a pending mutation took effect.
 * Old mount-status responses are deliberately rejected: `idle` cannot confirm
 * Start, and the previous generation's `healthy` snapshot cannot confirm
 * Restart. A newly allocated `startedAt` is the generation witness.
 */
export function repositoryPreviewStatusConfirmsAction(
  pending: LocalRepositoryPreviewPendingAction,
  snapshot: LocalRepositoryPreviewSnapshot,
): boolean {
  if (!isRepositoryPreviewLifecycleAction(pending.action)) return false;
  if (FAILURE_STATES.has(snapshot.state)) {
    return pending.action === "stop"
      || pending.previousStartedAt === undefined
      || snapshot.startedAt !== pending.previousStartedAt;
  }

  if (pending.action === "stop") {
    return snapshot.state === "stopping" || snapshot.state === "stopped";
  }

  if (snapshot.state !== "starting" && snapshot.state !== "healthy") return false;
  if (typeof snapshot.startedAt !== "number") return false;
  return pending.previousStartedAt === undefined || snapshot.startedAt !== pending.previousStartedAt;
}

export function repositoryPreviewStatusCanApply(
  pending: LocalRepositoryPreviewPendingAction | null,
  snapshot: LocalRepositoryPreviewSnapshot,
): boolean {
  return !pending
    || !isRepositoryPreviewLifecycleAction(pending.action)
    || repositoryPreviewStatusConfirmsAction(pending, snapshot);
}

/**
 * A snapshot only ever describes the project it names.
 *
 * Switching project resets this machine, but a status/response body for the
 * PREVIOUS project can still be in flight. Merging it would hand the new
 * project the old one's lifecycle state and — worse — its loopback
 * `previewUrl`, which the editor then loads into its frame. The component
 * aborts those requests too; this is the same rule enforced where it can be
 * proven without a browser.
 */
function describesCurrentProject(
  state: LocalRepositoryPreviewUiState,
  snapshot: LocalRepositoryPreviewSnapshot,
): boolean {
  return snapshot.projectId === state.preview.projectId;
}

/** Pure UI state machine, kept outside React so lifecycle races are testable. */
export function localRepositoryPreviewUiReducer(
  state: LocalRepositoryPreviewUiState,
  event: LocalRepositoryPreviewUiEvent,
): LocalRepositoryPreviewUiState {
  if (event.type === "reset") {
    return { preview: { projectId: event.projectId, state: "idle" }, pending: null };
  }

  if (event.type === "begin") {
    return {
      preview: optimisticRepositoryPreview(state.preview, event.action),
      pending: {
        id: event.id,
        action: event.action,
        previousStartedAt: state.preview.startedAt,
      },
    };
  }

  if (event.type === "response") {
    if (state.pending?.id !== event.id) return state;
    if (!describesCurrentProject(state, event.preview)) return state;
    return {
      preview: mergeRepositoryPreviewSnapshot(state.preview, event.preview),
      pending: null,
    };
  }

  if (event.type === "status") {
    if (!describesCurrentProject(state, event.preview)) return state;
    if (!repositoryPreviewStatusCanApply(state.pending, event.preview)) return state;
    const confirmed = state.pending
      ? repositoryPreviewStatusConfirmsAction(state.pending, event.preview)
      : false;
    return {
      preview: mergeRepositoryPreviewSnapshot(state.preview, event.preview),
      pending: confirmed ? null : state.pending,
    };
  }

  if (state.pending?.id !== event.id) return state;
  return { ...state, pending: null };
}
