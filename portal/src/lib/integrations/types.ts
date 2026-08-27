import type { IntegrationProvider } from "./catalog";

export type IntegrationConnectionStatus = "saved" | "connected" | "needs-attention";

export interface PublicIntegrationConnection {
  id: string;
  agencyId: string;
  provider: IntegrationProvider;
  label: string;
  clientId?: string;
  config: Record<string, string>;
  configuredSecretFields: string[];
  status: IntegrationConnectionStatus;
  lastTestedAt?: number;
  lastTestStatus?: "passed" | "failed";
  lastTestMessage?: string;
  isActive: boolean;
  activatedAt?: number;
  createdAt: number;
  updatedAt: number;
}
