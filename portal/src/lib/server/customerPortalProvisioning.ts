import "server-only";

import { newTelemetrySiteKey } from "@/lib/server/clientTelemetry";

const PLAN_LABELS: Record<string, string> = {
  foundational: "Foundational Flow",
  expansion: "Expansion Plan",
  mastery: "Mastery Plan",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function customerPortalProvisioningMetadata(input: {
  clientName: string;
  contactName?: string;
  email?: string;
  servicePlan?: string;
  welcomeNote?: string;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const plan = text(input.servicePlan);
  const planLabel = PLAN_LABELS[plan] ?? plan;
  const contactName = text(input.contactName) || input.clientName;

  return {
    portalMode: "onboarding" as const,
    portalLoginEmail: text(input.email).toLowerCase(),
    portalContactName: contactName,
    portalServicePlan: planLabel || "Milesymedia custom plan",
    portalWelcomeNote: text(input.welcomeNote)
      || `Welcome to your Milesymedia home. This is where ${input.clientName}'s project, files, billing, and support will stay together.`,
    portalBuiltAt: now,
    portalShellVersion: "milesymedia-customer-home-v2",
    portalAccessUpdatedAt: now,
    telemetrySiteKey: newTelemetrySiteKey(),
    telemetryEvents: [],
  };
}
