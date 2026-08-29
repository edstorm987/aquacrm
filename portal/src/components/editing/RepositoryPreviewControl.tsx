"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { AccessBoundary, WorkspaceElementBoundary } from "@/components/access/AccessBoundary";
import { useAccessSnapshot, useWorkspaceElementAccess } from "@/components/access/AccessSnapshot";
import { capabilityImplies } from "@/components/access/accessModel";
import type {
  LocalRepositoryPreviewAction,
  LocalRepositoryPreviewResponse,
  LocalRepositoryPreviewSnapshot,
  LocalRepositoryPreviewState,
} from "@/lib/shared/localRepositoryPreview";
import { pollRepositoryPreviewTransition } from "@/lib/shared/localRepositoryPreviewPolling";
import {
  localRepositoryPreviewUiReducer,
  repositoryPreviewStatusCanApply,
  repositoryPreviewStatusConfirmsAction,
  type LocalRepositoryPreviewPendingAction,
} from "@/lib/shared/localRepositoryPreviewUi";

const PREVIEW_REQUEST_TIMEOUT_MS = 10_000;

const STATE_LABELS: Record<LocalRepositoryPreviewState, string> = {
  idle: "Not running",
  installing: "Installing dependencies",
  starting: "Starting",
  healthy: "Preview ready",
  stopping: "Stopping",
  stopped: "Stopped",
  crashed: "Crashed",
  "occupied-port": "Port occupied",
  "install-failed": "Install missing",
  "start-failed": "Start failed",
  "health-timeout": "Health timed out",
  "configuration-error": "Setup required",
  "production-refused": "Local only",
};

export interface RepositoryPreviewControlProps {
  projectId: string;
  /** `element.development.preview.view` at this exact project/environment. */
  canView?: boolean;
  /** `element.development.preview.use` + `dev.project.run_local`. */
  canRun?: boolean;
  /** `dev.project.logs`; kept separate from process control. */
  canReadLogs?: boolean;
  onPreviewReady?: (url: string) => void;
  /** Remove a stopped/failed loopback URL from the owning editor frame. */
  onPreviewUnavailable?: () => void;
  className?: string;
}

export interface GovernedRepositoryPreviewControlProps {
  projectId: string;
  projectName?: string;
  onPreviewReady?: (url: string) => void;
  onPreviewUnavailable?: () => void;
  className?: string;
}

async function previewRequest(
  projectId: string,
  action: LocalRepositoryPreviewAction,
  limit?: number,
  signal?: AbortSignal,
): Promise<LocalRepositoryPreviewSnapshot> {
  const controller = new AbortController();
  let timedOut = false;
  const relayAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", relayAbort, { once: true });
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, PREVIEW_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("/api/portal/dev/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, projectId, ...(limit ? { limit } : {}) }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(error => {
      if (controller.signal.aborted) throw error;
      return null;
    }) as (LocalRepositoryPreviewResponse & { message?: string }) | null;
    if (!response.ok || !payload?.ok || !payload.preview) {
      throw new Error(payload?.message || payload?.error || "The repository preview could not be reached.");
    }
    return payload.preview;
  } catch (error) {
    if (timedOut) {
      throw new Error("The preview request timed out. Server status will continue reconciling in the background.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", relayAbort);
  }
}

/**
 * Reusable project control for a Dev Workspace door.
 *
 * It intentionally knows nothing about `/portal/dev-team`. The caller passes
 * already-resolved element/capability visibility, while the lifecycle API
 * re-authorises every press server-side.
 */
export function RepositoryPreviewControl({
  projectId,
  canView = true,
  canRun = false,
  canReadLogs = false,
  onPreviewReady,
  onPreviewUnavailable,
  className = "",
}: RepositoryPreviewControlProps) {
  const [ui, dispatchUi] = useReducer(localRepositoryPreviewUiReducer, {
    preview: { projectId, state: "idle" },
    pending: null,
  });
  const preview = ui.preview;
  const busy = ui.pending !== null;
  const [message, setMessage] = useState("");
  const [logsOpen, setLogsOpen] = useState(false);
  const readyCallback = useRef(onPreviewReady);
  const unavailableCallback = useRef(onPreviewUnavailable);
  const previewAvailable = useRef(false);
  const actionSequence = useRef(0);
  const pendingRequest = useRef<(LocalRepositoryPreviewPendingAction & { controller: AbortController }) | null>(null);
  useEffect(() => { readyCallback.current = onPreviewReady; }, [onPreviewReady]);
  useEffect(() => { unavailableCallback.current = onPreviewUnavailable; }, [onPreviewUnavailable]);

  const announce = useCallback((next: LocalRepositoryPreviewSnapshot) => {
    setMessage(next.error ?? "");
    if (next.state === "healthy" && next.previewUrl) {
      previewAvailable.current = true;
      readyCallback.current?.(next.previewUrl);
    } else if (next.state !== "starting" && next.state !== "installing" && previewAvailable.current) {
      previewAvailable.current = false;
      unavailableCallback.current?.();
    }
  }, []);

  const run = useCallback(async (action: LocalRepositoryPreviewAction) => {
    const id = ++actionSequence.current;
    const controller = new AbortController();
    pendingRequest.current?.controller.abort();
    pendingRequest.current = { id, action, previousStartedAt: preview.startedAt, controller };
    dispatchUi({ type: "begin", id, action });
    setMessage("");
    if (action === "stop" && previewAvailable.current) {
      previewAvailable.current = false;
      unavailableCallback.current?.();
    }
    try {
      const next = await previewRequest(projectId, action, action === "logs" ? 160 : undefined, controller.signal);
      if (pendingRequest.current?.id !== id) return;
      pendingRequest.current = null;
      dispatchUi({ type: "response", id, preview: next });
      announce(next);
    } catch (error) {
      // A transition-status response may have already proved success and
      // deliberately aborted this late action body. It must not replace the
      // confirmed snapshot with an AbortError.
      if (pendingRequest.current?.id !== id) return;
      setMessage(error instanceof Error ? error.message : "The repository preview could not be reached.");
    } finally {
      if (pendingRequest.current?.id === id) {
        pendingRequest.current = null;
        dispatchUi({ type: "finish", id });
      }
    }
  }, [announce, preview.startedAt, projectId]);

  const applyStatus = useCallback((next: LocalRepositoryPreviewSnapshot) => {
    const pending = pendingRequest.current;
    if (!repositoryPreviewStatusCanApply(pending, next)) return;
    if (pending && repositoryPreviewStatusConfirmsAction(pending, next)) {
      pendingRequest.current = null;
      pending.controller.abort();
    }
    dispatchUi({ type: "status", preview: next });
    announce(next);
  }, [announce]);

  useEffect(() => {
    const pending = pendingRequest.current;
    pendingRequest.current = null;
    pending?.controller.abort();
    previewAvailable.current = false;
    dispatchUi({ type: "reset", projectId });
    setMessage("");
    setLogsOpen(false);
    return () => {
      const active = pendingRequest.current;
      pendingRequest.current = null;
      active?.controller.abort();
    };
  }, [projectId]);

  useEffect(() => {
    if (!canView || !projectId) return;
    const controller = new AbortController();
    let cancelled = false;
    previewRequest(projectId, "status", undefined, controller.signal)
      .then(next => { if (!cancelled) applyStatus(next); })
      .catch(error => { if (!cancelled) setMessage(error instanceof Error ? error.message : "Preview status is unavailable."); });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [applyStatus, canView, projectId]);

  useEffect(() => {
    if (!canView || !projectId) return;
    const controller = new AbortController();
    void pollRepositoryPreviewTransition({
      initialState: preview.state,
      signal: controller.signal,
      requestStatus: async () => {
        const next = await previewRequest(projectId, "status", undefined, controller.signal);
        return repositoryPreviewStatusCanApply(pendingRequest.current, next) ? next : null;
      },
      onSnapshot: applyStatus,
    }).catch(error => {
      if (!controller.signal.aborted) {
        setMessage(error instanceof Error ? error.message : "Preview status is unavailable.");
      }
    });
    return () => controller.abort();
  }, [applyStatus, canView, preview.state, projectId]);

  if (!canView || !projectId) return null;

  const running = preview.state === "installing"
    || preview.state === "starting"
    || preview.state === "healthy"
    || preview.state === "stopping";
  const failed = ["crashed", "occupied-port", "install-failed", "start-failed", "health-timeout", "configuration-error", "production-refused"].includes(preview.state);

  return (
    <section
      data-access-element="development.preview"
      className={`rounded-md border border-white/10 bg-black/20 p-2.5 text-white sm:p-3 ${className}`.trim()}
      aria-label="Repository preview server"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${preview.state === "healthy" ? "bg-emerald-400" : preview.state === "installing" || preview.state === "starting" || preview.state === "stopping" ? "animate-pulse bg-amber-300" : failed ? "bg-rose-400" : "bg-white/25"}`}
        />
        <p className="min-w-0 flex-1 text-xs font-semibold" role="status" aria-live="polite">
          {STATE_LABELS[preview.state]}
        </p>
        {preview.state === "healthy" && preview.previewUrl ? (
          <button
            type="button"
            onClick={() => readyCallback.current?.(preview.previewUrl!)}
            className="min-h-9 rounded-md border border-cyan-300/25 px-3 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-300/10"
          >
            Show preview
          </button>
        ) : null}
        {canRun && !running ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run("start")}
            className="min-h-9 rounded-md bg-cyan-300 px-3 text-[11px] font-bold text-[#0d1718] disabled:opacity-45"
          >
            Start locally
          </button>
        ) : null}
        {canRun && running ? (
          <button
            type="button"
            disabled={busy || preview.state === "stopping"}
            onClick={() => void run("stop")}
            className="min-h-9 rounded-md border border-white/15 px-3 text-[11px] font-semibold text-white/70 hover:bg-white/5 disabled:opacity-45"
          >
            Stop
          </button>
        ) : null}
        {canRun && preview.state === "healthy" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run("restart")}
            className="min-h-9 rounded-md border border-white/15 px-3 text-[11px] font-semibold text-white/70 hover:bg-white/5 disabled:opacity-45"
          >
            Restart
          </button>
        ) : null}
        {canReadLogs ? (
          <button
            type="button"
            disabled={busy}
            aria-expanded={logsOpen}
            onClick={() => {
              const opening = !logsOpen;
              setLogsOpen(opening);
              if (opening) void run("logs");
            }}
            className="min-h-9 rounded-md border border-white/15 px-3 text-[11px] font-semibold text-white/70 hover:bg-white/5 disabled:opacity-45"
          >
            {logsOpen ? "Hide logs" : "Logs"}
          </button>
        ) : null}
      </div>
      {message ? <p className="mt-2 text-[11px] leading-5 text-rose-200/80">{message}</p> : null}
      {logsOpen ? (
        <div className="mt-2 max-h-28 overflow-auto overscroll-contain rounded-md bg-black/45 p-2.5 font-mono text-[10px] leading-5 text-white/55 sm:max-h-40 sm:p-3 xl:mt-3 xl:max-h-52" aria-label="Preview server logs">
          {preview.logs?.length
            ? preview.logs.map((line, index) => <p key={`${line.at}-${index}`}><span className="text-white/25">{line.stream}</span> {line.text}</p>)
            : <p>No log lines for this project.</p>}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Access-aware wrapper for a project page already inside AccessSnapshotProvider.
 * A role can hide the whole element, expose status only, allow lifecycle use,
 * and independently allow logs. Denied view access offers the normal exact
 * permission-request workflow.
 */
export function GovernedRepositoryPreviewControl({
  projectId,
  projectName = "this project",
  onPreviewReady,
  onPreviewUnavailable,
  className,
}: GovernedRepositoryPreviewControlProps) {
  const access = useAccessSnapshot();
  const element = useWorkspaceElementAccess("development.preview");
  const canUseElement = element.level === "use" || element.level === "manage";
  const request = {
    scope: access.scope,
    environment: access.environment,
    title: "Request repository preview access",
    detail: `Ask to view the supervised local preview for ${projectName}. Process control and logs remain separately granted.`,
  } as const;

  return (
    <WorkspaceElementBoundary
      capabilities={access.capabilities}
      elementKey="development.preview"
      required="view"
      denied="request"
      request={request}
    >
      <AccessBoundary
        capabilities={access.capabilities}
        capability="project.preview"
        denied="request"
        request={request}
      >
        <RepositoryPreviewControl
          projectId={projectId}
          canView
          canRun={canUseElement && capabilityImplies(access.capabilities, "dev.project.run_local")}
          canReadLogs={canUseElement && capabilityImplies(access.capabilities, "dev.project.logs")}
          onPreviewReady={onPreviewReady}
          onPreviewUnavailable={onPreviewUnavailable}
          className={className}
        />
      </AccessBoundary>
    </WorkspaceElementBoundary>
  );
}
