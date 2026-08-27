import { isSandboxDataRealm } from "@/server/dataRealm";

export class SandboxProviderBlockedError extends Error {
  constructor(provider: string) {
    super(`${provider} is blocked in Sandbox Mode. Use a simulator or a provider test account.`);
    this.name = "SandboxProviderBlockedError";
  }
}

/**
 * Final outbound-provider fence. UI and route guards improve the experience,
 * but every real provider adapter must call this immediately before network
 * I/O so a sandbox request cannot escape through a new or direct code path.
 */
export function assertLiveProviderAccess(provider: string): void {
  if (isSandboxDataRealm()) throw new SandboxProviderBlockedError(provider);
}
