/**
 * Resolve only a path that begins with exactly one forward slash and remains
 * on the request origin. In particular, WHATWG URLs treat `/\\host` as a
 * protocol-relative redirect for HTTP(S), so a startsWith("/") check alone is
 * not an origin boundary.
 */
export function localDevDestination(
  target: string | null | undefined,
  fallback: string,
  requestUrl: string,
): string {
  if (!target || !/^\/(?!\/)/.test(target) || target.includes("\\")) return fallback;
  try {
    const base = new URL(requestUrl);
    const resolved = new URL(target, base);
    if (resolved.origin !== base.origin) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
