/**
 * Browser-safe contract for the supervised local repository preview.
 *
 * Keep this file free of Node imports. The process, worktree and command stay
 * in the server-only supervisor; the browser receives only lifecycle evidence
 * for the project it was authorised to ask about.
 */

export type LocalRepositoryPreviewAction = "status" | "start" | "logs" | "stop" | "restart";

export type LocalRepositoryPreviewState =
  | "idle"
  | "starting"
  | "healthy"
  | "stopping"
  | "stopped"
  | "crashed"
  | "occupied-port"
  | "install-failed"
  | "start-failed"
  | "health-timeout"
  | "configuration-error"
  | "production-refused";

export interface LocalRepositoryPreviewLogLine {
  at: number;
  stream: "system" | "stdout" | "stderr";
  text: string;
}

export interface LocalRepositoryPreviewSnapshot {
  projectId: string;
  state: LocalRepositoryPreviewState;
  /** Returned only while a server is starting or healthy. Always loopback. */
  previewUrl?: string;
  startedAt?: number;
  healthyAt?: number;
  stoppedAt?: number;
  exitCode?: number;
  exitSignal?: string;
  error?: string;
  /** Present only for the explicit `logs` action. */
  logs?: LocalRepositoryPreviewLogLine[];
}

export interface LocalRepositoryPreviewResponse {
  ok: boolean;
  preview?: LocalRepositoryPreviewSnapshot;
  error?: string;
  code?: string;
}
