import { isPubliclyReachableOrigin } from "@/lib/public/publicOrigin";

/**
 * Canonical origin for security links and auth redirects.
 *
 * Request Host / forwarded headers are attacker-controlled inputs, so they can
 * corroborate a request but must never become a password, magic, or signup
 * link. Production additionally requires a publicly reachable HTTPS origin.
 */
export function configuredPublicAuthOrigin(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = env.NEXT_PUBLIC_PORTAL_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || (parsed.pathname && parsed.pathname !== "/")
    ) return null;
    if (env.NODE_ENV === "production") {
      if (parsed.protocol !== "https:" || !isPubliclyReachableOrigin(parsed.origin)) return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isExactConfiguredRequestOrigin(request: Request, configuredOrigin: string): boolean {
  const supplied = request.headers.get("origin")?.trim();
  return supplied === configuredOrigin;
}
