export interface PhaseTransitionApiResult {
  ok: boolean;
  status?: "complete" | "incomplete" | "rejected";
  operationId?: string;
  retryable?: boolean;
  error?: string;
  step?: "disable" | "enable" | "variant" | "client" | "checklist" | "log";
  partial?: { disabled?: string[]; enabled?: string[] };
  skipped?: { pluginId: string; error: string }[];
  variant?: { ok: true; variantId: string } | { ok: false; error: string } | { skipped: true };
}

export function createPhaseTransitionOperationId(clientId: string, fromPhaseId: string, toPhaseId: string) {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `phase_${clientId}_${fromPhaseId}_${toPhaseId}_${suffix}`.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 200);
}

export function phaseTransitionFailureMessage(result: PhaseTransitionApiResult): string {
  const lead = result.status === "incomplete"
    ? `Transition incomplete${result.step ? ` at ${result.step}` : ""}: ${result.error ?? "required work did not finish"}.`
    : result.error ?? "Phase transition failed.";
  const details: string[] = [];
  if (result.partial?.enabled?.length) details.push(`Prepared: ${result.partial.enabled.join(", ")}.`);
  if (result.partial?.disabled?.length) details.push(`Disabled: ${result.partial.disabled.join(", ")}.`);
  if (result.skipped?.length) details.push(`Unavailable: ${result.skipped.map(item => item.pluginId).join(", ")}.`);
  if (result.variant && "ok" in result.variant && !result.variant.ok) details.push(`Variant: ${result.variant.error}.`);
  if (result.retryable) details.push("Retry continues the saved operation; it will not start the completed steps again.");
  return [lead, ...details].join(" ");
}
