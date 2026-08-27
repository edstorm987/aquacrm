import type { AutomationRun } from "@/server/types";

export interface AutomationRunFeedback {
  kind: "error" | "notice";
  message: string;
}

function finalDiagnostic(run: AutomationRun): string | undefined {
  const error = [...run.logs].reverse().find(entry => entry.level === "error")?.message.trim();
  if (error) return error;
  return [...run.logs].reverse().find(entry => entry.message.trim())?.message.trim();
}

/** Translate the persisted domain outcome into truthful immediate UI feedback. */
export function automationRunFeedback(
  run: AutomationRun,
  mode: "live" | "test",
): AutomationRunFeedback {
  const label = mode === "test" ? "Test" : "Live flow";
  const diagnostic = finalDiagnostic(run);

  if (run.status === "failed") {
    return {
      kind: "error",
      message: diagnostic ? `${label} failed: ${diagnostic}` : `${label} failed. Open Run history for the detail.`,
    };
  }
  if (run.status === "skipped") {
    return {
      kind: "notice",
      message: diagnostic ? `${label} skipped: ${diagnostic}` : `${label} was skipped.`,
    };
  }
  if (run.status === "waiting") {
    return { kind: "notice", message: `${label} started and is waiting for its delay.` };
  }
  if (run.status === "running") {
    return { kind: "notice", message: `${label} started and is still running.` };
  }
  return {
    kind: "notice",
    message: mode === "test"
      ? "Dry run complete. No email, webhook or task was created."
      : "Live flow completed.",
  };
}
