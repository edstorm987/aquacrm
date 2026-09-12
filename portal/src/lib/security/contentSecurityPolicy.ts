const TURNSTILE_SCRIPT_HOST = "https://challenges.cloudflare.com";

function loopbackFrameSources(nodeEnv: string | undefined): string[] {
  return nodeEnv === "production"
    ? []
    : ["http://localhost:*", "http://127.0.0.1:*"];
}

function exactFrameOrigin(value: string, nodeEnv: string | undefined): string | null {
  try {
    const parsed = new URL(value);
    const local = parsed.hostname === "localhost"
      || parsed.hostname === "127.0.0.1"
      || parsed.hostname === "[::1]";
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    if (parsed.protocol !== "https:" && !(nodeEnv !== "production" && local && parsed.protocol === "http:")) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * The single CSP builder for static Next headers and request-bound embed
 * responses. `frameAncestorOrigins` is deliberately origins-only: it cannot
 * smuggle directives or wildcards into a response header.
 */
export function buildContentSecurityPolicy(input: {
  nodeEnv: string | undefined;
  frameAncestorOrigins?: readonly string[];
}): string {
  const loopback = loopbackFrameSources(input.nodeEnv);
  const scriptSource = input.nodeEnv === "production"
    ? `script-src 'self' 'unsafe-inline' ${TURNSTILE_SCRIPT_HOST}`
    : `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${TURNSTILE_SCRIPT_HOST}`;
  const suppliedAncestors = input.frameAncestorOrigins?.map(origin => exactFrameOrigin(origin, input.nodeEnv))
    .filter((origin): origin is string => Boolean(origin));
  const frameAncestors = input.frameAncestorOrigins === undefined
    ? ["'self'", ...loopback]
    : suppliedAncestors?.length
      ? ["'self'", ...new Set(suppliedAncestors)]
      : ["'none'"];

  return [
    "default-src 'self'",
    scriptSource,
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https: wss:",
    `frame-src 'self'${loopback.length ? ` ${loopback.join(" ")}` : ""} https:`,
    `frame-ancestors ${frameAncestors.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
