import "server-only";

import { verifySessionToken } from "@/lib/server/auth/sessionToken";
import { buildContentSecurityPolicy } from "@/lib/security/contentSecurityPolicy";

/**
 * Derive the one external frame ancestor from a verified embed session. An
 * ordinary/forged/unbound cookie gets `frame-ancestors 'none'`; no URL, request
 * header or unverified payload can widen the policy.
 */
export function embedAccountContentSecurityPolicy(input: {
  token: string | undefined;
  nodeEnv: string | undefined;
}): string {
  let session;
  try {
    session = verifySessionToken(input.token);
  } catch {
    session = null;
  }
  const allowedOrigin = session?.role === "end-customer"
    && session.clientId
    && session.embed?.credentialId
    && session.embed.credentialVersion
      ? session.embed.allowedOrigin
      : undefined;
  return buildContentSecurityPolicy({
    nodeEnv: input.nodeEnv,
    frameAncestorOrigins: allowedOrigin ? [allowedOrigin] : [],
  });
}
