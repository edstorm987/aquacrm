import "server-only";
// Foundation-level Vercel domain-attach API client (server-only
// re-export).
//
// Application code imports from this module — the `import
// "server-only"` ensures Next.js refuses to bundle it client-side.
// All logic lives in `vercelDomain.impl.ts`; the impl has no
// `server-only` guard so the smoke at
// `scripts/smoke-vercel-domain.test.ts` can drive it via tsx.

import { assertFreshWritesAllowed } from "@/lib/server/auth/securityControl";
import * as impl from "@/lib/server/integrations/vercelDomain.impl";

export {
  configFromEnv,
  isVercelDomainConfigured,
  normaliseHostname,
  readEnvTeamId,
  readEnvToken,
} from "@/lib/server/integrations/vercelDomain.impl";
export type {
  DnsRequirement,
  VercelDomainConfig,
  VercelDomainResult,
} from "@/lib/server/integrations/vercelDomain.impl";

export type VercelDomainCallOptions = Omit<impl.VercelDomainCallOptions, "writeGuard">;

function guardedOptions(
  cfg: impl.VercelDomainConfig,
  options: VercelDomainCallOptions,
): impl.VercelDomainCallOptions {
  return {
    ...options,
    writeGuard: () => assertFreshWritesAllowed("provider.vercel.domain", { tenantId: cfg.tenantId }),
  };
}

export function attachDomain(
  cfg: impl.VercelDomainConfig,
  hostname: string,
  options: VercelDomainCallOptions = {},
) {
  return impl.attachDomain(cfg, hostname, guardedOptions(cfg, options));
}

export function verifyDomain(
  cfg: impl.VercelDomainConfig,
  hostname: string,
  options: VercelDomainCallOptions = {},
) {
  return impl.verifyDomain(cfg, hostname, guardedOptions(cfg, options));
}

export function removeDomain(
  cfg: impl.VercelDomainConfig,
  hostname: string,
  options: VercelDomainCallOptions = {},
) {
  return impl.removeDomain(cfg, hostname, guardedOptions(cfg, options));
}
