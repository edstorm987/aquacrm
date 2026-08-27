import type { HealthStatus } from "../lib/aquaPluginTypes";
import type { EmailMessage, ProviderConfig, SenderIdentity } from "../lib/domain";

export function buildEmailSenderHealth(
  provider: ProviderConfig,
  identities: SenderIdentity[],
  messages: EmailMessage[],
): HealthStatus {
  const queued = messages.filter(message => message.status === "queued").length;
  const failed = messages.filter(
    message => message.status === "failed" || message.status === "bounced",
  ).length;
  const activeIdentities = identities.filter(identity => identity.status === "active").length;
  const providerReady = provider.provider !== "none" && provider.status === "active";
  const providerMessage = provider.provider === "none"
    ? "delivery disabled — no provider configured"
    : `${provider.provider}/${provider.status}`;

  return {
    ok: providerReady && activeIdentities > 0 && failed === 0,
    message: `${providerMessage} · ${activeIdentities}/${identities.length} active identities · ${queued} queued · ${failed} failed`,
    components: {
      provider: { ok: providerReady, message: providerMessage },
      identities: {
        ok: activeIdentities > 0,
        message: `${activeIdentities}/${identities.length} active identities`,
      },
      outbox: { ok: failed === 0, message: `${queued} queued · ${failed} failed` },
    },
  };
}
